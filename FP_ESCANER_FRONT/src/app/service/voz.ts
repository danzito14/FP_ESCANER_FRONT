import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const KEY = 'voz_config';

interface VozConfig {
  activa: boolean;
  vozNombre: string;
  volumen: number;
  velocidad: number;
  tono: number;
}

/**
 * Voz artificial (texto a voz) con la Web Speech API del navegador.
 * Sin dependencias ni red; SSR-safe. Configuración (voz, volumen, velocidad,
 * tono, on/off) ajustable y persistida en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class VozService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Voces disponibles en el sistema/navegador. */
  readonly voces = signal<SpeechSynthesisVoice[]>([]);

  // --- Ajustes (persistidos) --------------------------------------------
  readonly activa = signal(true);
  /** Nombre de la voz elegida ('' = automática: primera en español). */
  readonly vozNombre = signal('');
  readonly volumen = signal(1); // 0..1
  readonly velocidad = signal(1); // 0.5..2 (rate)
  readonly tono = signal(1); // 0..2 (pitch)

  constructor() {
    this.cargarConfig();
    const synth = this.synth;
    if (synth) {
      const cargar = () => this.voces.set(synth.getVoices());
      cargar();
      synth.addEventListener?.('voiceschanged', cargar);
    }
    if (this.isBrowser) {
      effect(() => {
        const cfg: VozConfig = {
          activa: this.activa(),
          vozNombre: this.vozNombre(),
          volumen: this.volumen(),
          velocidad: this.velocidad(),
          tono: this.tono(),
        };
        localStorage.setItem(KEY, JSON.stringify(cfg));
      });
    }
  }

  /** ¿El navegador soporta síntesis de voz? */
  get disponible(): boolean {
    return !!this.synth;
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
    this.synth?.cancel();
  }

  setVoz(nombre: string): void {
    this.vozNombre.set(nombre);
  }

  private hablar(texto: string): void {
    const synth = this.synth;
    if (!synth || !texto.trim()) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.volume = this.volumen();
    u.rate = this.velocidad();
    u.pitch = this.tono();
    const voz = this.vozElegida();
    u.lang = voz?.lang ?? 'es-MX';
    if (voz) u.voice = voz;
    synth.speak(u);
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
    } catch {
      // Config corrupta: se ignora y usa valores por defecto.
    }
  }

  private get synth(): SpeechSynthesis | null {
    return this.isBrowser && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }
}
