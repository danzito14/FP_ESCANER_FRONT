/** UUIDv7 generado en el teléfono (PK idempotente de asistencias/intentos/enrolamientos). */
export function uuidv7(): string {
  const b = new Uint8Array(16);
  const rnd = new Uint8Array(10); crypto.getRandomValues(rnd);
  let t = Date.now();                          // 48 bits de timestamp (ms)
  for (let i = 5; i >= 0; i--) { b[i] = t & 0xff; t = Math.floor(t / 256); }
  b[6] = 0x70 | (rnd[0] & 0x0f);               // versión 7
  b[7] = rnd[1];
  b[8] = 0x80 | (rnd[2] & 0x3f);               // variante 10
  for (let i = 3; i < 10; i++) b[6 + i] = rnd[i];   // b[9..15] = rnd[3..9] (antes b[7+i] dejaba b[9]=0 y perdía rnd[9])
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
