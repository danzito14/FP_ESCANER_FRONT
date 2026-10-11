import { Component, computed, inject, signal } from '@angular/core';

import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { PuedeDirective } from '../../core/directives/puede';
import { AuthService } from '../../service/auth';
import { EmpSyncService } from '../../service/emp-sync';
import {
  GrupoArea,
  OpcionesReglas,
  OrigenNomina,
  PuestoSinRegla,
  ReglaClasificacion,
  ReglaClasificacionService,
} from '../../service/regla-clasificacion';

const ORIGEN_LABEL: Record<string, string> = { agricola: 'Agrícola', agricola_com: 'Comercial' };
const GRUPO_LABEL: Record<string, string> = { oficina: 'Oficina', empaque: 'Empaque', campo: 'Campo' };
const GRUPO_COLOR: Record<string, string> = { oficina: '#3b82f6', empaque: '#d97706', campo: '#16a34a' };

/**
 * Clasificación de puestos (agrícola) y departamentos (comercial) de la nómina SYS21 →
 * grupo local (oficina/empaque/campo). Arriba, los puestos que llegaron SIN regla para
 * asignarles grupo; abajo, todas las reglas. Editar es solo del super-admin (el back lo
 * valida igual). Los cambios aplican en la siguiente sincronización.
 */
@Component({
  selector: 'app-clasificacion-page',
  imports: [Paginacion, PuedeDirective],
  templateUrl: './clasificacion-page.html',
  styleUrl: './clasificacion-page.scss',
})
export class ClasificacionPage {
  private readonly service = inject(ReglaClasificacionService);
  private readonly empSync = inject(EmpSyncService);
  private readonly auth = inject(AuthService);

  /** Solo el super-admin puede crear/editar/borrar reglas. */
  readonly puedeEditar = this.auth.esAdmin;

  readonly reglas = signal<ReglaClasificacion[]>([]);
  readonly pendientes = signal<PuestoSinRegla[]>([]);
  readonly opciones = signal<OpcionesReglas | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly sincronizando = signal(false);

  // ── Pendientes: grupo elegido por fila (clave origen|clave) ──
  readonly grupoElegido = signal<Record<string, GrupoArea>>({});
  readonly guardandoPend = signal<string | null>(null);
  readonly sinAsignar = computed(() => this.pendientes().filter((p) => !p.con_regla));
  readonly personasSinAsignar = computed(() =>
    this.sinAsignar().reduce((n, p) => n + p.personas, 0),
  );

  // ── Filtros de la tabla de reglas (client-side: son ~100) ──
  readonly filtroOrigen = signal('');
  readonly filtroGrupo = signal('');
  readonly buscar = signal('');
  readonly reglasFiltradas = computed(() => {
    const o = this.filtroOrigen();
    const g = this.filtroGrupo();
    const q = this.normalizar(this.buscar());
    return this.reglas().filter(
      (r) => (!o || r.origen_nomina === o) && (!g || r.grupo === g) && (!q || r.clave.includes(q)),
    );
  });
  readonly conteoGrupo = computed(() => {
    const acc: Record<string, number> = {};
    for (const r of this.reglas()) {
      if (this.filtroOrigen() && r.origen_nomina !== this.filtroOrigen()) continue;
      acc[r.grupo] = (acc[r.grupo] ?? 0) + 1;
    }
    return acc;
  });
  readonly pagina = signal(1);
  readonly reglasPagina = computed(() => {
    const lista = this.reglasFiltradas();
    const maxPag = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    const p = Math.min(this.pagina(), maxPag);
    return lista.slice((p - 1) * TAM_PAGINA, p * TAM_PAGINA);
  });

  // ── Modal de alta/edición ──
  readonly showForm = signal(false);
  readonly editando = signal<ReglaClasificacion | null>(null);
  readonly fOrigen = signal<OrigenNomina>('agricola');
  readonly fNombre = signal('');
  readonly fGrupo = signal<GrupoArea>('campo');
  /** '' = usar el default del grupo. */
  readonly fPermiso = signal('');
  readonly fNivel = signal('');
  readonly guardando = signal(false);
  readonly formError = signal<string | null>(null);

  readonly grupos: GrupoArea[] = ['oficina', 'empaque', 'campo'];
  readonly origenes: OrigenNomina[] = ['agricola', 'agricola_com'];

  constructor() {
    this.service.opciones().subscribe({ next: (o) => this.opciones.set(o), error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list().subscribe({
      next: (data) => { this.reglas.set(data ?? []); this.loading.set(false); },
      error: (e) => { this.error.set(this.msg(e)); this.loading.set(false); },
    });
    this.service.sinRegla().subscribe({
      next: (data) => this.pendientes.set(data ?? []),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  // ── Etiquetas ──
  origenLabel(o: string): string { return ORIGEN_LABEL[o] ?? o; }
  grupoLabel(g: string): string { return GRUPO_LABEL[g] ?? g; }
  grupoColor(g: string): string { return GRUPO_COLOR[g] ?? '#888'; }
  /** "Default (general / mixto)" para el selector de permiso/nivel. */
  defaultTexto(campo: 'permiso_escaneo' | 'nivel_acceso_interno'): string {
    const d = this.opciones()?.default_por_grupo?.[this.fGrupo()];
    const v = d ? d[campo] : null;
    return `Default del grupo (${v ?? 'sin acceso interno'})`;
  }

  // ── Pendientes ──
  private keyPend(p: PuestoSinRegla): string { return `${p.origen_nomina}|${p.clave}`; }

  grupoDe(p: PuestoSinRegla): GrupoArea | '' { return this.grupoElegido()[this.keyPend(p)] ?? ''; }

  elegirGrupo(p: PuestoSinRegla, g: string): void {
    this.grupoElegido.update((m) => ({ ...m, [this.keyPend(p)]: g as GrupoArea }));
  }

  asignar(p: PuestoSinRegla): void {
    const grupo = this.grupoDe(p);
    if (!grupo) return;
    const k = this.keyPend(p);
    this.guardandoPend.set(k);
    this.service.create({ origen_nomina: p.origen_nomina, nombre: p.nombre, grupo }).subscribe({
      next: () => {
        this.guardandoPend.set(null);
        this.mostrarAviso(`✓ "${p.nombre}" → ${this.grupoLabel(grupo)}. Entra en la próxima sincronización.`);
        this.load();
      },
      error: (e) => { this.guardandoPend.set(null); this.error.set(this.msg(e)); },
    });
  }

  sincronizar(): void {
    this.sincronizando.set(true);
    this.empSync.run().subscribe({
      next: () => {
        this.sincronizando.set(false);
        this.mostrarAviso('✓ Sincronización disparada. Recarga en unos minutos para ver el resultado.');
      },
      error: (e) => { this.sincronizando.set(false); this.error.set(this.msg(e)); },
    });
  }

  // ── Modal ──
  nueva(): void {
    this.editando.set(null);
    this.fOrigen.set((this.filtroOrigen() as OrigenNomina) || 'agricola');
    this.fNombre.set('');
    this.fGrupo.set('campo');
    this.fPermiso.set('');
    this.fNivel.set('');
    this.formError.set(null);
    this.showForm.set(true);
  }

  editar(r: ReglaClasificacion): void {
    this.editando.set(r);
    this.fOrigen.set(r.origen_nomina);
    this.fNombre.set(r.nombre);
    this.fGrupo.set(r.grupo);
    this.fPermiso.set(r.permiso_escaneo ?? '');
    this.fNivel.set(r.nivel_acceso_interno ?? '');
    this.formError.set(null);
    this.showForm.set(true);
  }

  cerrar(): void { this.showForm.set(false); this.editando.set(null); }

  guardar(): void {
    const nombre = this.fNombre().trim();
    if (!nombre) { this.formError.set('Escribe el puesto o departamento.'); return; }
    // Campo nunca tiene acceso interno: no guardar un nivel que quedó del grupo anterior.
    const sinNivel = this.fGrupo() === 'campo' || this.fPermiso() === 'campo';
    const datos = {
      nombre,
      grupo: this.fGrupo(),
      permiso_escaneo: this.fPermiso() || null,
      nivel_acceso_interno: sinNivel ? null : this.fNivel() || null,
    };
    const sel = this.editando();
    const req = sel
      ? this.service.update(sel.id_regla, datos)
      : this.service.create({ origen_nomina: this.fOrigen(), ...datos });
    this.guardando.set(true);
    this.formError.set(null);
    req.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.mostrarAviso('✓ Regla guardada. Aplica en la próxima sincronización.');
        this.load();
      },
      error: (e) => { this.guardando.set(false); this.formError.set(this.msg(e)); },
    });
  }

  eliminar(r: ReglaClasificacion): void {
    if (!confirm(`¿Borrar la regla "${r.nombre}" (${this.origenLabel(r.origen_nomina)})?\n` +
      'Los trabajadores con ese puesto dejarán de sincronizarse hasta que tenga regla de nuevo.')) return;
    this.service.remove(r.id_regla).subscribe({
      next: () => { this.mostrarAviso('✓ Regla borrada.'); this.load(); },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private mostrarAviso(m: string): void {
    this.aviso.set(m);
    setTimeout(() => { if (this.aviso() === m) this.aviso.set(null); }, 6000);
  }

  /** Igual que el back: minúsculas, sin acentos, espacios colapsados. */
  private normalizar(t: string): string {
    return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).join(' ');
  }

  private msg(e: { error?: { detail?: unknown }; message?: string }): string {
    const d = e?.error?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x: { msg?: string }) => x?.msg).filter(Boolean).join(' · ');
    return e?.message ?? 'Ocurrió un error inesperado.';
  }
}
