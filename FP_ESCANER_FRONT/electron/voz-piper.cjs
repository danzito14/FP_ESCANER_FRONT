// voz-piper.cjs — Voz NEURONAL local para la estación de escritorio.
//
// Por qué existe: la app habla con la Web Speech API, y en Linux esa API sale por
// speech-dispatcher → eSpeak, que suena a robot de los 80. Aquí se sintetiza con piper
// (VITS, el mismo motor que usan los lectores de pantalla modernos) desde el proceso
// principal, y el audio se manda al renderer para reproducirlo. En Windows la voz del
// sistema ya es aceptable, pero se usa piper igual para que TODAS las estaciones suenen
// idénticas, digan lo que digan sus voces instaladas.
//
// Los modelos NO viajan en la app: los baja el instalador una sola vez (son 60 MB por
// voz y no cambian entre versiones del front, que se actualiza a menudo). Si no están,
// `disponible()` devuelve false y VozService cae a la voz del sistema sin romperse.
//
// Caché: se guarda el WAV de CADA FRASE COMPLETA, indexado por hash. Como el nombre que
// se anuncia ya viene acortado a "Nombre Apellido", el conjunto de frases posibles es
// pequeño y acotado (un puñado por trabajador), así que a los pocos días la estación no
// sintetiza nada: solo reproduce archivos. Eso es lo que evita competir por CPU con el
// reconocimiento facial, que corre en la misma máquina.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Voces del sistema. El nombre que ve el usuario NO es el del archivo: así se puede
// cambiar el modelo sin tocar la interfaz ni la preferencia guardada de cada estación.
const VOCES = {
  mio: {
    etiqueta: 'Mio',
    modelo: 'es_MX-claude-high.onnx',
    // Natural y clara para dar la bienvenida.
    args: ['--length_scale', '1.05', '--sentence_silence', '0.4'],
  },
  noah: {
    etiqueta: 'Noah',
    modelo: 'es_MX-ald-medium.onnx',
    // Lento, pausado y sin color: registro de reporte, no de conversación.
    args: ['--length_scale', '1.3', '--sentence_silence', '0.7',
           '--noise_scale', '0.4', '--noise_w', '0.5'],
  },
};
const VOZ_POR_DEFECTO = 'mio';

/** Carpetas donde el instalador deja piper y los modelos, por orden de preferencia. */
function candidatosVoz() {
  const lista = [];
  if (process.env.SL_VOZ_DIR) lista.push(process.env.SL_VOZ_DIR);
  if (process.platform === 'win32') {
    lista.push('C:\\Program Files (x86)\\SL Asistencias\\voz');
    lista.push('C:\\Program Files\\SL Asistencias\\voz');
  } else {
    lista.push('/opt/sl-asistencias/voz');
  }
  return lista;
}

function binarioPiper(dir) {
  const nombre = process.platform === 'win32' ? 'piper.exe' : 'piper';
  // El release trae el ejecutable dentro de una carpeta 'piper/'; se aceptan las dos
  // disposiciones para no depender de cómo se haya descomprimido.
  for (const p of [path.join(dir, 'piper', nombre), path.join(dir, nombre)]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class VozPiper {
  constructor(dirCache) {
    this.dirCache = dirCache;
    this.dir = null;
    this.bin = null;
    this.buscar();
    try {
      fs.mkdirSync(this.dirCache, { recursive: true });
    } catch {
      // Sin caché se sigue pudiendo sintetizar, solo que cada vez.
    }
  }

  /** Localiza piper y los modelos. Se vuelve a intentar en cada llamada a disponible()
   *  porque el instalador puede haberlos dejado DESPUÉS de que la app arrancara. */
  buscar() {
    for (const dir of candidatosVoz()) {
      const bin = binarioPiper(dir);
      if (bin && fs.existsSync(path.join(dir, 'voces'))) {
        this.dir = dir;
        this.bin = bin;
        return;
      }
    }
    this.dir = null;
    this.bin = null;
  }

  rutaModelo(voz) {
    const def = VOCES[voz] ?? VOCES[VOZ_POR_DEFECTO];
    return this.dir ? path.join(this.dir, 'voces', def.modelo) : null;
  }

  /** ¿Hay motor y al menos un modelo? Si no, el front usa la voz del sistema. */
  disponible() {
    if (!this.bin) this.buscar();
    if (!this.bin) return false;
    return Object.keys(VOCES).some((v) => {
      const m = this.rutaModelo(v);
      return m && fs.existsSync(m);
    });
  }

  /** Voces realmente instaladas, para que Configuración no ofrezca lo que no hay. */
  voces() {
    if (!this.bin) this.buscar();
    return Object.entries(VOCES)
      .filter(([id]) => {
        const m = this.rutaModelo(id);
        return m && fs.existsSync(m);
      })
      .map(([id, def]) => ({ id, etiqueta: def.etiqueta }));
  }

  archivoCache(texto, voz) {
    const clave = crypto.createHash('sha1').update(`${voz}|${texto}`).digest('hex');
    return path.join(this.dirCache, `${clave}.wav`);
  }

  /**
   * Devuelve el WAV de `texto` con la voz `voz`, generándolo si no estaba en caché.
   * null = no se pudo (sin motor, sin modelo o piper falló) → el front usa el sistema.
   */
  async hablar(texto, voz) {
    const limpio = String(texto ?? '').trim();
    if (!limpio || !this.disponible()) return null;
    const id = VOCES[voz] ? voz : VOZ_POR_DEFECTO;
    const destino = this.archivoCache(limpio, id);

    if (fs.existsSync(destino)) {
      try {
        return fs.readFileSync(destino);
      } catch {
        // Caché corrupta: se regenera abajo.
      }
    }

    const modelo = this.rutaModelo(id);
    if (!modelo || !fs.existsSync(modelo)) {
      console.error('[voz] falta el modelo', modelo);
      return null;
    }
    // Se escribe a un temporal y se renombra: si la app muere a medias, la caché nunca
    // queda con un WAV truncado que después se reproduciría cortado para siempre.
    //
    // El temporal va DENTRO de la carpeta de caché, no en /tmp: en Linux /tmp suele ser
    // tmpfs, o sea otro sistema de archivos, y rename() entre dispositivos distintos
    // falla con EXDEV. Eso dejaba la estación sin voz neuronal y en silencio (se caía al
    // respaldo del sistema sin decir por qué). Pasó en una instalación real.
    const temporal = path.join(this.dirCache, `.tmp-${process.pid}-${Date.now()}.wav`);
    const ok = await this.ejecutar(limpio, modelo, VOCES[id].args, temporal);
    if (!ok) return null;

    let datos;
    try {
      datos = fs.readFileSync(temporal);
    } catch (e) {
      console.error('[voz] no se pudo leer el audio generado:', e.message);
      return null;
    }
    // La caché es una OPTIMIZACIÓN: si no se puede guardar, se devuelve el audio igual.
    // Antes un fallo aquí dejaba a la estación sin voz neuronal, que es peor remedio.
    try {
      fs.renameSync(temporal, destino);
    } catch (e) {
      console.error('[voz] no se pudo cachear (se reproduce igual):', e.message);
      try { fs.unlinkSync(temporal); } catch { /* nada que limpiar */ }
    }
    return datos;
  }

  ejecutar(texto, modelo, args, salida) {
    return new Promise((resolve) => {
      let proceso;
      try {
        proceso = spawn(this.bin, ['--model', modelo, '--output_file', salida, ...args], {
          cwd: path.dirname(this.bin), // piper busca espeak-ng-data junto a su ejecutable
          stdio: ['pipe', 'ignore', 'pipe'],
        });
      } catch (e) {
        console.error('[voz] no se pudo lanzar piper:', e.message);
        return resolve(false);
      }
      let error = '';
      proceso.stderr.on('data', (d) => { error += d.toString(); });
      // Red de seguridad: si piper se cuelga, la estación no se queda muda ni acumula
      // procesos. 15 s es holgado para una frase corta incluso en un equipo lento.
      const limite = setTimeout(() => proceso.kill(), 15000);
      proceso.on('error', (e) => {
        clearTimeout(limite);
        console.error('[voz] piper falló:', e.message);
        resolve(false);
      });
      proceso.on('close', (codigo) => {
        clearTimeout(limite);
        if (codigo !== 0) console.error('[voz] piper salió con', codigo, error.slice(0, 300));
        resolve(codigo === 0 && fs.existsSync(salida));
      });
      proceso.stdin.end(texto, 'utf8');
    });
  }
}

module.exports = { VozPiper, VOCES, VOZ_POR_DEFECTO };
