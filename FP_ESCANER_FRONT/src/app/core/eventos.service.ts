import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { uuidv7 } from './uuid.util';

@Injectable({ providedIn: 'root' })
export class EventosService {
  private db = inject(DbService);

  private async config() {
    return {
      id_empresa:     Number(await this.db.getMeta('roster_empresa')),
      id_puerta:      Number(localStorage.getItem('id_puerta')) || null,
      id_dispositivo: Number(localStorage.getItem('id_dispositivo')) || null,   // INT: id de dispositivos
      tipo_registro:  localStorage.getItem('tipo_registro') || 'entrada',       // entrada | salida (se ignora en server)
    };
  }

  async registrarAsistencia(o: { id_trabajador: number; sim: number; dentro: boolean;
                                 lat: number | null; lon: number | null }) {
    const c = await this.config();
    await this.db.insertarAsistencia({
      id_asistencia: uuidv7(), id_trabajador: o.id_trabajador,
      id_puerta: c.id_puerta, id_empresa: c.id_empresa, tipo_registro: c.tipo_registro,
      creado_en_cliente: new Date().toISOString(), confianza_biometrica: o.sim,
      dentro_de_area: o.dentro, id_dispositivo_origen: c.id_dispositivo,
      latitud: o.lat, longitud: o.lon,
    });
  }

  async registrarIntento(o: { tipo: 'desconocido' | 'spoofing'; sim: number | null;
                              lat: number | null; lon: number | null }) {
    const c = await this.config();
    await this.db.insertarIntento({
      id_intento: uuidv7(), id_puerta: c.id_puerta, id_empresa: c.id_empresa, tipo: o.tipo,
      id_trabajador: null,                                   // solo 'otra_empresa' lo lleva; el APK no lo detecta
      similitud: o.sim, creado_en_cliente: new Date().toISOString(),
      id_dispositivo_origen: c.id_dispositivo, latitud: o.lat, longitud: o.lon,
    });
  }
}
