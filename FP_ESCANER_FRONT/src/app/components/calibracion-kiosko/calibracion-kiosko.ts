import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faSliders } from '@fortawesome/free-solid-svg-icons';

import { KioskConfig, KioskConfigParcial } from '../../core/interfaces/kiosko-local';
import { KioskoLocalService } from '../../service/kiosko-local';

type ClaveEditable = keyof KioskConfigParcial;

interface Campo {
  clave: ClaveEditable;
  etiqueta: string;
  tipo: 'bool' | 'num';
  paso?: number;
  min?: number;
  max?: number;
  /** Qué hace y hacia dónde moverlo; se lee mientras se calibra frente a la cámara. */
  ayuda: string;
}

interface Grupo {
  titulo: string;
  descripcion: string;
  campos: Campo[];
}

/**
 * Los umbrales viven en el backend local, no aquí: el panel muestra lo que
 * `GET /kiosk/config` reporte y manda solo lo que se toque. Nada de defaults
 * duplicados en el front — si el compose cambia, esto lo refleja solo.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: 'Calidad de la imagen',
    descripcion: 'Descarta capturas malas antes de intentar reconocer.',
    campos: [
      {
        clave: 'CALIDAD_GATE_ACTIVO',
        etiqueta: 'Filtro de calidad activo',
        tipo: 'bool',
        ayuda: 'Apagado, se intenta reconocer cualquier captura.',
      },
      {
        clave: 'CALIDAD_BLUR_MIN',
        etiqueta: 'Nitidez mínima',
        tipo: 'num',
        paso: 1,
        min: 0,
        ayuda: 'Subir exige imagen más nítida. Con webcam floja, bajarlo.',
      },
      {
        clave: 'CALIDAD_DET_SCORE_MIN',
        etiqueta: 'Confianza mínima de detección',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Subir es más estricto con lo que considera una cara.',
      },
      {
        clave: 'CALIDAD_FACE_RATIO_MIN',
        etiqueta: 'Tamaño mínimo de la cara',
        tipo: 'num',
        paso: 0.005,
        min: 0,
        max: 1,
        ayuda: 'Subir obliga a acercarse más a la cámara.',
      },
      {
        clave: 'CALIDAD_BORDE_MARGEN',
        etiqueta: 'Margen contra el borde',
        tipo: 'num',
        paso: 0.005,
        min: 0,
        max: 1,
        ayuda: 'Subir rechaza caras cortadas por el borde del encuadre.',
      },
    ],
  },
  {
    titulo: 'Anti-spoof (foto o pantalla)',
    descripcion: 'Detecta que lo que ve la cámara no es una persona real.',
    campos: [
      {
        clave: 'ANTISPOOFING_ACTIVO',
        etiqueta: 'Anti-spoof pasivo activo',
        tipo: 'bool',
        ayuda: 'Analiza la textura. Es el que suele rechazar caras reales con luz pobre.',
      },
      {
        clave: 'ANTISPOOF_UMBRAL',
        etiqueta: 'Realidad mínima exigida',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Subir es más estricto y produce más falsos "spoof".',
      },
      {
        clave: 'SPOOFING_UMBRAL',
        etiqueta: 'Umbral del detector de spoofing',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Subir es más estricto.',
      },
    ],
  },
  {
    titulo: 'Reconocimiento',
    descripcion: 'Qué tan parecido debe ser el rostro para dar por identificada a la persona.',
    campos: [
      {
        clave: 'SIMILITUD_UMBRAL',
        etiqueta: 'Similitud mínima',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Subir reduce confusiones entre personas; bajar reconoce más fácil.',
      },
      {
        clave: 'SIMILITUD_UMBRAL_ACOTADO',
        etiqueta: 'Similitud mínima (búsqueda acotada)',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Se usa cuando ya se sabe a quién se busca.',
      },
    ],
  },
  {
    titulo: 'Prueba de vida',
    descripcion: 'Compara los frames de la ráfaga: una foto fija no se mueve.',
    campos: [
      {
        clave: 'LIVENESS_MOVIMIENTO_MIN',
        etiqueta: 'Movimiento mínimo entre fotos',
        tipo: 'num',
        paso: 0.001,
        min: 0,
        ayuda: 'Subir atrapa más fotos impresas, pero rechaza a quien se queda muy quieto.',
      },
      {
        clave: 'LIVENESS_MISMA_PERSONA_UMBRAL',
        etiqueta: 'Coincidencia entre frames',
        tipo: 'num',
        paso: 0.01,
        min: 0,
        max: 1,
        ayuda: 'Verifica que todas las fotos sean de la misma persona.',
      },
      {
        clave: 'LIVENESS_MIN_FRAMES_CON_ROSTRO',
        etiqueta: 'Fotos con rostro necesarias',
        tipo: 'num',
        paso: 1,
        min: 1,
        max: 5,
        ayuda: 'De las 5 de la ráfaga. Subir exige quedarse más tiempo en cuadro.',
      },
    ],
  },
];

/**
 * Panel de calibración del reconocimiento de ESTA estación. Los cambios se aplican
 * en caliente contra `kiosk_local` (POST /kiosk/config), sin recrear contenedores,
 * así se puede ajustar frente a la cámara y ver el efecto al instante.
 */
@Component({
  selector: 'app-calibracion-kiosko',
  standalone: true,
  imports: [FaIconComponent],
  templateUrl: './calibracion-kiosko.html',
  styleUrl: './calibracion-kiosko.scss',
})
export class CalibracionKiosko implements OnInit {
  private readonly kiosko = inject(KioskoLocalService);

  readonly iconSliders = faSliders;
  readonly grupos = GRUPOS;

  /** Config efectiva según el backend (referencia para saber qué cambió). */
  readonly efectiva = signal<KioskConfig | null>(null);
  /** Valores del formulario. */
  readonly valores = signal<Record<string, number | boolean>>({});

  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  /** false = el backend local es anterior a /kiosk/config. */
  readonly soportado = signal(true);

  /** Claves cuyo valor difiere del efectivo: es lo único que se manda. */
  readonly cambios = computed<KioskConfigParcial>(() => {
    const base = this.efectiva();
    const v = this.valores();
    const out: Record<string, number | boolean> = {};
    if (!base) return out;
    for (const g of this.grupos) {
      for (const c of g.campos) {
        const actual = v[c.clave];
        if (actual !== undefined && actual !== base[c.clave]) out[c.clave] = actual;
      }
    }
    return out as KioskConfigParcial;
  });

  readonly hayCambios = computed(() => Object.keys(this.cambios()).length > 0);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.kiosko.config().subscribe({
      next: (c) => {
        this.aplicar(c);
        this.soportado.set(true);
        this.cargando.set(false);
      },
      error: (e) => {
        // 404 = imagen vieja del kiosk_local, no un fallo del usuario.
        if ((e as { status?: number })?.status === 404) this.soportado.set(false);
        else this.error.set(this.msg(e));
        this.cargando.set(false);
      },
    });
  }

  private aplicar(c: KioskConfig): void {
    this.efectiva.set(c);
    const v: Record<string, number | boolean> = {};
    for (const g of this.grupos) {
      for (const campo of g.campos) v[campo.clave] = c[campo.clave];
    }
    this.valores.set(v);
  }

  setBool(clave: ClaveEditable, valor: boolean): void {
    this.valores.update((v) => ({ ...v, [clave]: valor }));
  }

  setNum(clave: ClaveEditable, valor: string): void {
    const n = Number(valor);
    if (Number.isNaN(n)) return;
    this.valores.update((v) => ({ ...v, [clave]: n }));
  }

  /** Vuelve a lo que el backend reporta, descartando lo editado. */
  deshacer(): void {
    const c = this.efectiva();
    if (c) this.aplicar(c);
    this.aviso.set(null);
    this.error.set(null);
  }

  guardar(): void {
    const cambios = this.cambios();
    if (!Object.keys(cambios).length || this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.kiosko.guardarConfig(cambios).subscribe({
      next: (c) => {
        this.aplicar(c);
        this.aviso.set(`Aplicado: ${Object.keys(cambios).join(', ')}`);
        this.guardando.set(false);
      },
      error: (e) => {
        const status = (e as { status?: number })?.status ?? 0;
        // 502 = se guardó, pero recognition no contestó: hay que recargar para ver lo real.
        if (status === 502) {
          this.aviso.set(
            'Los cambios se guardaron, pero el motor de reconocimiento no respondió. ' +
              'Verifica que el servicio esté arriba y vuelve a cargar.',
          );
        } else {
          this.error.set(this.msg(e));
        }
        this.guardando.set(false);
      },
    });
  }

  private msg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { error?: { detail?: string }; message?: string };
    return err?.error?.detail ?? err?.message ?? 'Error inesperado.';
  }
}
