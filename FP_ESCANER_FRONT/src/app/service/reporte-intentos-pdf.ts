import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/constants/api';
import { EventoCombinado } from '../core/interfaces/evento-combinado';

/** Progreso mientras se bajan las fotos para el PDF. */
export type ProgresoPdf = (hechas: number, total: number) => void;

/**
 * Genera el reporte de INTENTOS como PDF (tabla + foto por fila), en el cliente.
 * Las fotos son protegidas (blob con token vía interceptor), así que el PDF se
 * arma aquí y no en el backend. jsPDF se importa de forma diferida (solo al
 * descargar) para no cargar la librería en el bundle inicial.
 */
@Injectable({ providedIn: 'root' })
export class ReporteIntentosPdfService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Índice de la columna "Foto" (donde se dibuja la miniatura). */
  private readonly COL_FOTO = 6;

  async generar(
    eventos: EventoCombinado[],
    meta: { rango: string },
    onProgress?: ProgresoPdf,
  ): Promise<void> {
    if (!this.isBrowser) return;

    // Carga diferida de jsPDF + autotable.
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    // Baja las miniaturas (concurrencia limitada) → dataURL por id de evento.
    const conFoto = eventos.filter((e) => e.tiene_foto && e.foto_url);
    const thumbs = new Map<string, string>();
    let hechas = 0;
    onProgress?.(0, conFoto.length);
    await this.enPool(conFoto, 5, async (e) => {
      const dataUrl = await this.miniatura(e.foto_url).catch(() => null);
      if (dataUrl) thumbs.set(e.id, dataUrl);
      onProgress?.(++hechas, conFoto.length);
    });

    // Documento horizontal (más ancho para la tabla + foto).
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Reporte de intentos de acceso', 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${meta.rango} · ${eventos.length} intento(s) · ${thumbs.size} con foto`, 14, 20);
    doc.setTextColor(0);

    const ALTO_FILA = 22; // mm — deja espacio para la miniatura

    autoTable(doc, {
      startY: 24,
      head: [['Persona', 'Tipo', 'Fecha / hora', 'Descripción', 'Similitud', 'Estado', 'Foto']],
      body: eventos.map((e) => [
        e.trabajador_nombre ?? 'Desconocido',
        e.tipo,
        this.fmtFecha(e.fecha_hora),
        e.descripcion || '—',
        e.similitud != null ? `${Math.round(e.similitud * 100)}%` : '—',
        e.estado ?? '—',
        '', // la foto se dibuja en didDrawCell
      ]),
      styles: { fontSize: 8, valign: 'middle', cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [36, 86, 64], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 247, 245] },
      columnStyles: {
        3: { cellWidth: 60 },
        [this.COL_FOTO]: { cellWidth: 24, minCellHeight: ALTO_FILA },
      },
      didParseCell: (data) => {
        // Asegura alto de fila para que quepa la miniatura.
        if (data.section === 'body' && data.column.index === this.COL_FOTO) {
          data.cell.styles.minCellHeight = ALTO_FILA;
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== this.COL_FOTO) return;
        const ev = eventos[data.row.index];
        const img = ev && thumbs.get(ev.id);
        if (!img) return;
        const lado = 18;
        const x = data.cell.x + (data.cell.width - lado) / 2;
        const y = data.cell.y + (data.cell.height - lado) / 2;
        try {
          doc.addImage(img, 'JPEG', x, y, lado, lado);
        } catch {
          /* imagen inválida: se omite */
        }
      },
    });

    doc.save('intentos_acceso.pdf');
  }

  /** Baja la foto protegida y la reduce a una miniatura JPEG (dataURL). */
  private async miniatura(fotoUrl: string): Promise<string | null> {
    const blob = await firstValueFrom(
      this.http.get(`${API_URL}${fotoUrl}`, { responseType: 'blob' }),
    );
    return this.blobAThumb(blob, 220);
  }

  /** Reescala un blob de imagen a `max` px (lado mayor) y devuelve dataURL JPEG. */
  private blobAThumb(blob: Blob, max: number): Promise<string | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /** Ejecuta `fn` sobre `items` con como mucho `limite` en paralelo. */
  private async enPool<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
    const cola = [...items];
    const workers = Array.from({ length: Math.min(limite, cola.length) }, async () => {
      while (cola.length) {
        const x = cola.shift();
        if (x !== undefined) await fn(x);
      }
    });
    await Promise.all(workers);
  }

  private fmtFecha(s?: string | null): string {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
