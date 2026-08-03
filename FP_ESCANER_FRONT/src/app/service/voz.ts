import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

import { EscritorioService, VozLocal } from './escritorio';

const KEY = 'voz_config';

interface VozConfig {
  activa: boolean;
  vozNombre: string;
  volumen: number;
  velocidad: number;
  tono: number;
  vozLocal: string;
}

/**
 * Voz artificial (texto a voz). En navegador usa la Web Speech API; en la app
 * nativa (Capacitor) usa el motor TTS de Android vía @capacitor-community/text-to-speech,
 * porque el WebView de Android no implementa speechSynthesis. SSR-safe.
 * Configuración (voz, volumen, velocidad, tono, on/off) persistida en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class VozService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly isNative = Capacitor.isNativePlatform();
  private readonly escritorio = inject(EscritorioService);

  /** Voces disponibles en el sistema/navegador. */
  readonly voces = signal<SpeechSynthesisVoice[]>([]);

  // ── Voz NEURONAL local (piper, solo escritorio) ─────────────────────────────
  // Cuando está instalada se usa en lugar de la Web Speech API: en Linux esa API sale
  // por eSpeak y suena a robot. Además hace que todas las estaciones suenen igual,
  // independientemente de las voces que tenga instalado cada sistema.
  /** true si la estación tiene el motor y al menos un modelo. */
  readonly vozLocalDisponible = signal(false);
  /** Voces neuronales instaladas (Mio, Noah…). */
  readonly vocesLocales = signal<VozLocal[]>([]);
  /** Voz neuronal elegida (persistida). */
  readonly vozLocal = signal('mio');

  private audio?: HTMLAudioElement;
  private urlAudio?: string;
  /** Cola: si fichan dos personas seguidas, los anuncios no se pisan. */
  private cola: Promise<void> = Promise.resolve();

  // --- Ajustes (persistidos) --------------------------------------------
  readonly activa = signal(true);
  /** Nombre de la voz elegida ('' = automática: primera en español). */
  readonly vozNombre = signal('');
  readonly volumen = signal(1); // 0..1
  readonly velocidad = signal(1); // 0.5..2 (rate)
  readonly tono = signal(1); // 0..2 (pitch)

  constructor() {
    this.cargarConfig();
    // ¿Hay voz neuronal instalada en esta estación? Se consulta al motor de Electron;
    // fuera de escritorio siempre es false y todo sigue por la Web Speech API.
    if (this.isBrowser && !this.isNative) {
      void this.escritorio.vozDisponible().then(async (hay) => {
        this.vozLocalDisponible.set(hay);
        if (hay) this.vocesLocales.set(await this.escritorio.vozListar());
      });
    }
    if (this.isNative) {
      this.cargarVocesNativas();
    } else {
      const synth = this.synth;
      if (synth) {
        const cargar = () => this.voces.set(synth.getVoices());
        cargar();
        synth.addEventListener?.('voiceschanged', cargar);
      }
    }
    if (this.isBrowser) {
      effect(() => {
        const cfg: VozConfig = {
          activa: this.activa(),
          vozNombre: this.vozNombre(),
          volumen: this.volumen(),
          velocidad: this.velocidad(),
          tono: this.tono(),
          vozLocal: this.vozLocal(),
        };
        localStorage.setItem(KEY, JSON.stringify(cfg));
      });
    }
  }

  /** ¿Hay síntesis de voz disponible? (motor nativo o Web Speech API). */
  get disponible(): boolean {
    return this.isNative || !!this.synth;
  }

  /** Dice el texto si la voz está activa (encola tras lo pendiente). */
  decir(texto: string): void {
    if (this.activa()) this.hablar(texto);
  }

  /** Reproduce una frase de muestra con los ajustes actuales (ignora on/off). */
  probar(): void {
    this.callar();
    this.hablar('Acceso concedido. Bienvenido.');
  }

  /** Corta y vacía cualquier locución pendiente. */
  callar(): void {
    this.pararAudio();
    if (this.isNative) {
      TextToSpeech.stop().catch(() => {});
      return;
    }
    this.synth?.cancel();
  }

  setVoz(nombre: string): void {
    this.vozNombre.set(nombre);
  }

  private hablar(texto: string): void {
    if (!texto.trim()) return;
    if (this.isNative) {
      this.hablarNativo(texto);
      return;
    }
    // Estación de escritorio con voz neuronal instalada: gana sobre la del navegador.
    if (this.vozLocalDisponible()) {
      this.hablarLocal(texto);
      return;
    }
    this.hablarSistema(texto);
  }

  /**
   * Voz neuronal (piper) por el proceso principal de Electron. Se encola para que dos
   * fichajes seguidos no solapen audios. Si la síntesis falla —modelo borrado, piper
   * caído— cae a la voz del sistema en vez de quedarse callada.
   */
  private hablarLocal(texto: string): void {
    this.cola = this.cola
      .then(() => this.reproducirLocal(texto))
      .catch(() => this.hablarSistema(texto));
  }

  private async reproducirLocal(texto: string): Promise<void> {
    const wav = await this.escritorio.vozHablar(texto, this.vozLocal());
    if (!wav || wav.byteLength === 0) {
      this.hablarSistema(texto);
      return;
    }
    this.pararAudio();
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.volume = this.volumen();
    this.audio = audio;
    this.urlAudio = url;
    await new Promise<void>((listo) => {
      audio.onended = () => listo();
      // Si el audio no puede reproducirse, no se bloquea la cola de anuncios.
      audio.onerror = () => listo();
      audio.play().catch(() => listo());
    });
    this.pararAudio();
  }

  /** Libera el audio en curso y su object URL (si no, se acumulan en memoria). */
  private pararAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = undefined;
    }
    if (this.urlAudio) {
      URL.revokeObjectURL(this.urlAudio);
      this.urlAudio = undefined;
    }
  }

  /** Web Speech API: la de siempre (web, APK y escritorio sin voz neuronal). */
  private hablarSistema(texto: string): void {
    const synth = this.synth;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.volume = this.volumen();
    u.rate = this.velocidad();
    u.pitch = this.tono();
    const voz = this.vozElegida();
    u.lang = voz?.lang ?? 'es-MX';
    if (voz) u.voice = voz;
    synth.speak(u);
  }

  /** Locución con el motor TTS nativo de Android. La voz se elige por índice. */
  private hablarNativo(texto: string): void {
    const voces = this.voces();
    const idx = this.vozNombre() ? voces.findIndex((v) => v.name === this.vozNombre()) : -1;
    const voz = idx >= 0 ? voces[idx] : voces.find((v) => v.lang?.toLowerCase().startsWith('es'));
    TextToSpeech.speak({
      text: texto,
      lang: voz?.lang ?? 'es-MX',
      rate: this.velocidad(),
      pitch: this.tono(),
      volume: this.volumen(),
      ...(idx >= 0 ? { voice: idx } : {}),
    }).catch(() => {});
  }

  /** Carga las voces del motor TTS nativo (puede no estar listo al arranque). */
  private async cargarVocesNativas(): Promise<void> {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      this.voces.set(voices as SpeechSynthesisVoice[]);
    } catch {
      // El motor TTS puede no estar inicializado todavía; se usa la voz por defecto.
    }
  }

  /** Voz elegida por nombre; si no, la primera en español. */
  private vozElegida(): SpeechSynthesisVoice | undefined {
    const voces = this.voces();
    return (
      voces.find((v) => v.name === this.vozNombre()) ??
      voces.find((v) => v.lang?.toLowerCase().startsWith('es'))
    );
  }

  private cargarConfig(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as Partial<VozConfig>;
      if (typeof c.activa === 'boolean') this.activa.set(c.activa);
      if (typeof c.vozNombre === 'string') this.vozNombre.set(c.vozNombre);
      if (typeof c.volumen === 'number') this.volumen.set(c.volumen);
      if (typeof c.velocidad === 'number') this.velocidad.set(c.velocidad);
      if (typeof c.tono === 'number') this.tono.set(c.tono);
      if (typeof c.vozLocal === 'string' && c.vozLocal) this.vozLocal.set(c.vozLocal);
    } catch {
      // Config corrupta: se ignora y usa valores por defecto.
    }
  }

  private get synth(): SpeechSynthesis | null {
    return this.isBrowser && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }
}
