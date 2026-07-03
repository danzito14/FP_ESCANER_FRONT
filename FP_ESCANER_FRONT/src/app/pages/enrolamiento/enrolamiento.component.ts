import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CameraService } from '../../service/camera';
import { FacialService } from '../../core/facial.service';
import { EnrolamientoService } from '../../core/enrolamiento.service';
import { DbService } from '../../core/db.service';

/**
 * Enrolar rostro (offline). Flujo tipo escáner: PRIMERO se elige el empleado (asignar) o se
 * llenan los datos (walk-in), y DESPUÉS se toma la foto con la cámara o se sube un archivo.
 */
@Component({
  selector: 'app-enrolamiento',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Capa de cámara (siempre en el DOM; visible solo al tomar foto) -->
    <div class="cam-layer" [class.abierta]="enCamara()">
      <video #video playsinline muted></video>
      <div class="cam-overlay">
        <p class="cam-target">Enrolando: <b>{{ objetivoTexto() }}</b></p>
        <div class="cam-bottom">
          <p class="cam-msg" [class.ok]="ok()">{{ mensaje() || 'Mira de frente, con buena luz.' }}</p>
          <div class="cam-btns">
            <button class="btn-salir" type="button" (click)="salirCamara()">✕ Salir</button>
            <button class="btn-cap" type="button" [disabled]="ocupado()" (click)="capturarYEnrolar()">
              {{ ocupado() ? 'Capturando…' : 'Capturar y enrolar' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    @if (!enCamara()) {
      <section class="crud-page">
        <header class="crud-header"><h1>Enrolar rostro</h1></header>

        <div class="tabs">
          <button type="button" [class.on]="modo() === 'asignar'" (click)="modo.set('asignar')">
            Asignar a trabajador
          </button>
          <button type="button" [class.on]="modo() === 'walkin'" (click)="modo.set('walkin')">
            Nuevo (walk-in)
          </button>
        </div>

        @if (modo() === 'asignar') {
          <div class="buscar-fila">
            <input class="in" placeholder="Buscar por nombre…" [(ngModel)]="busqueda" (keyup.enter)="buscar()" />
            <button class="btn btn-sm" type="button" (click)="buscar()">Buscar</button>
          </div>
          <ul class="lista">
            @for (c of candidatos(); track c.id_trabajador) {
              <li [class.sel]="sel()?.id_trabajador === c.id_trabajador" (click)="sel.set(c)">
                {{ c.nombre }} {{ c.apellido }} <small>{{ c.id_emp }}</small>
              </li>
            } @empty {
              <li class="vacio">Sin candidatos (los que ya tienen rostro no aparecen).</li>
            }
          </ul>
        } @else {
          <input class="in" placeholder="Nombre" [(ngModel)]="wNombre" />
          <input class="in" placeholder="Apellido" [(ngModel)]="wApellido" />
          <select class="in" [(ngModel)]="wArea">
            <option [ngValue]="null" disabled>Área…</option>
            @for (a of areas(); track a.id_area) {
              <option [ngValue]="a.id_area">{{ a.nombre_area }}</option>
            }
          </select>
        }

        <div class="acciones">
          <button class="btn btn-primary" type="button" (click)="tomarFoto()">📷 Tomar foto</button>
          <button class="btn btn-ghost" type="button" (click)="subirClick(fileInput)">📁 Subir archivo</button>
          <input #fileInput type="file" accept="image/*" hidden (change)="subirArchivo($event)" />
        </div>

        <p class="msg" [class.ok]="ok()" [class.err]="!ok() && !!mensaje()">{{ mensaje() }}</p>
      </section>
    }
  `,
  styles: [`
    .cam-layer { display: none; }
    .cam-layer.abierta { display: block; position: fixed; inset: 0; z-index: 200; background: #000; }
    .cam-layer video { width: 100%; height: 100%; object-fit: cover; }
    .cam-overlay {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      justify-content: space-between; pointer-events: none;
      padding: calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px));
    }
    .cam-target { align-self: center; margin: 0; color: #fff; background: rgba(0,0,0,.55);
      padding: 6px 16px; border-radius: 20px; }
    .cam-bottom { display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .cam-msg { margin: 0; color: #fff; background: rgba(0,0,0,.65); padding: 8px 16px; border-radius: 20px; }
    .cam-msg.ok { background: rgba(22,163,74,.9); }
    .cam-btns { display: flex; gap: 12px; width: 100%; max-width: 420px; pointer-events: auto; }
    .btn-salir { background: rgba(255,255,255,.18); color: #fff; border: 1px solid rgba(255,255,255,.45);
      border-radius: 10px; padding: 14px 18px; font-weight: 600; }
    .btn-cap { flex: 1; background: #16a34a; color: #fff; border: 0; border-radius: 10px;
      padding: 14px; font-weight: 600; }
    .btn-cap:disabled { opacity: .6; }

    .tabs { display: flex; gap: 8px; margin: 0 0 12px; }
    .tabs button { flex: 1; padding: 10px; border: 1px solid var(--border-strong);
      border-radius: 8px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; }
    .tabs button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
    .buscar-fila { display: flex; gap: 8px; }
    .in { width: 100%; padding: 10px; margin: 4px 0; border: 1px solid var(--border-strong);
      border-radius: 8px; background: var(--bg-card); color: var(--text-primary); font: inherit; }
    .lista { max-height: 300px; overflow: auto; list-style: none; padding: 0; margin: 10px 0;
      border: 1px solid var(--border); border-radius: 8px; }
    .lista li { padding: 11px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .lista li:last-child { border-bottom: 0; }
    .lista li.sel { background: var(--accent-soft); }
    .lista li.vacio { color: var(--text-muted); cursor: default; }
    .acciones { display: flex; gap: 8px; margin-top: 12px; }
    .acciones .btn { flex: 1; }
    .msg { margin-top: 10px; text-align: center; }
    .msg.ok { color: var(--success); font-weight: 600; }
    .msg.err { color: var(--danger); }
  `],
})
export class EnrolamientoComponent implements OnInit, OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly facial = inject(FacialService);
  private readonly enrol = inject(EnrolamientoService);
  private readonly db = inject(DbService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly modo = signal<'asignar' | 'walkin'>('asignar');
  readonly candidatos = signal<any[]>([]);
  readonly areas = signal<any[]>([]);
  readonly sel = signal<any | null>(null);
  readonly enCamara = signal(false);
  readonly ocupado = signal(false);
  readonly ok = signal(false);
  readonly mensaje = signal('');

  busqueda = '';
  wNombre = '';
  wApellido = '';
  wArea: number | null = null;

  async ngOnInit(): Promise<void> {
    this.areas.set(await this.db.getAreas());
    this.buscar();
  }

  ngOnDestroy(): void {
    this.camera.stop();
  }

  objetivoTexto(): string {
    if (this.modo() === 'asignar') {
      const s = this.sel();
      return s ? `${s.nombre} ${s.apellido}` : '—';
    }
    return (this.wNombre || this.wApellido) ? `${this.wNombre} ${this.wApellido}`.trim() : 'Nuevo trabajador';
  }

  async buscar(): Promise<void> {
    try {
      this.candidatos.set(
        await this.enrol.candidatos(
          localStorage.getItem('tipo_fichaje') ?? undefined, this.busqueda || undefined),
      );
    } catch (e: any) { this.fallo(e?.message ?? 'No se pudieron cargar candidatos.'); }
  }

  private validar(): boolean {
    this.mensaje.set(''); this.ok.set(false);
    if (this.modo() === 'asignar' && !this.sel()) { this.fallo('Elige un trabajador primero.'); return false; }
    if (this.modo() === 'walkin' && !(this.wNombre && this.wApellido && this.wArea)) {
      this.fallo('Completa nombre, apellido y área.'); return false;
    }
    return true;
  }

  async tomarFoto(): Promise<void> {
    if (!this.validar()) return;
    if (!this.camera.isSupported) { this.fallo('La cámara no está disponible.'); return; }
    try {
      await this.camera.start(this.video()!.nativeElement);
      this.mensaje.set('');
      this.enCamara.set(true);
    } catch (e: any) { this.fallo(e?.message ?? 'No se pudo abrir la cámara.'); }
  }

  salirCamara(): void {
    this.camera.stop();
    this.enCamara.set(false);
  }

  async capturarYEnrolar(): Promise<void> {
    this.ocupado.set(true); this.ok.set(false); this.mensaje.set('Capturando…');
    try {
      const cap = await this.facial.capturarDeVideo(this.video()!.nativeElement);
      if (!cap) { this.fallo('No se logró una captura estable. Mira de frente, con buena luz.'); return; }
      await this.enrolar(cap);
    } catch (e: any) { this.fallo(e?.message ?? 'Error al enrolar.'); }
    finally { this.ocupado.set(false); }
  }

  subirClick(fileInput: HTMLInputElement): void {
    if (this.validar()) fileInput.click();
  }

  async subirArchivo(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite re-subir el mismo archivo
    if (!file) return;
    this.ocupado.set(true); this.ok.set(false); this.mensaje.set('Procesando imagen…');
    try {
      const cap = await this.facial.embeddingDeArchivoSubido(file);
      if (!cap) { this.fallo('No se detectó un rostro claro en la imagen.'); return; }
      await this.enrolar(cap);
    } catch (e: any) { this.fallo(e?.message ?? 'Error al procesar la imagen.'); }
    finally { this.ocupado.set(false); }
  }

  private async enrolar(cap: { embedding: number[]; calidad: number }): Promise<void> {
    const res = this.modo() === 'asignar'
      ? await this.enrol.asignar(this.sel(), cap.embedding, cap.calidad)
      : await this.enrol.walkin(
          { nombre: this.wNombre, apellido: this.wApellido, id_area: this.wArea! },
          cap.embedding, cap.calidad);

    if (res.rechazados?.length) { this.fallo('Rechazado: ' + res.rechazados[0].motivo); return; }

    this.ok.set(true);
    this.mensaje.set(this.modo() === 'asignar'
      ? '✓ Rostro asignado'
      : (res.creados ? '✓ Trabajador dado de alta' : '✓ Actualizado'));
    this.salirCamara();
    this.limpiar();
    if (this.modo() === 'asignar') this.buscar();
  }

  private limpiar(): void {
    this.sel.set(null);
    this.wNombre = this.wApellido = '';
    this.wArea = null;
  }

  private fallo(m: string): void { this.ok.set(false); this.mensaje.set(m); }
}
