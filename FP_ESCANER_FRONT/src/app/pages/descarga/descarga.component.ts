import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SyncService } from '../../core/sync.service';

@Component({
  selector: 'app-descarga',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="descarga">
      <h2>Preparando el dispositivo</h2>
      <p>{{ sync.mensaje() }}</p>

      <div class="barra" *ngIf="sync.estado() !== 'error'">
        <div class="relleno" [style.width.%]="sync.progreso()"></div>
      </div>
      <small *ngIf="sync.estado() !== 'error'">{{ sync.progreso() }}%</small>

      <button *ngIf="sync.estado() === 'error'" (click)="reintentar()">Reintentar</button>
    </div>
  `,
  styles: [`
    .descarga { display:flex; flex-direction:column; align-items:center; gap:12px; padding:32px; }
    .barra { width:100%; max-width:360px; height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; }
    .relleno { height:100%; background:#16a34a; transition:width .25s ease; }
  `],
})
export class DescargaComponent implements OnInit {
  sync = inject(SyncService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  async ngOnInit() { await this.correr(); }

  private async correr() {
    // 'tipo' lo elige el dispositivo (campo|oficina|empaque) en la pantalla de ajustes.
    const tipo = localStorage.getItem('tipo_fichaje') ?? 'oficina';
    const ok = await this.sync.bootstrap(tipo);
    if (ok) {
      // Vuelve a donde el usuario iba (?next), por defecto el escáner.
      const next = this.route.snapshot.queryParamMap.get('next') || '/escaneo';
      this.router.navigateByUrl(next, { replaceUrl: true });
    }
  }
  reintentar() { this.correr(); }
}
