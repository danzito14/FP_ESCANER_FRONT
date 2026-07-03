import { LandmarkType } from '@capacitor-mlkit/face-detection';

/** ML Kit da landmarks por identidad del sujeto; los ordeno por x (a prueba de espejo).
 *  Salida: [ojoIzq.x,ojoIzq.y, ojoDer.x,ojoDer.y, nariz.x,nariz.y, bocaIzq.x,bocaIzq.y, bocaDer.x,bocaDer.y] */
export function ordenarKps(lm: any[] | undefined): number[] | null {
  if (!lm) return null;
  const p = (t: LandmarkType) => lm.find(l => l.type === t)?.position;
  const le = p(LandmarkType.LeftEye), re = p(LandmarkType.RightEye);
  const no = p(LandmarkType.NoseBase);
  const ml = p(LandmarkType.MouthLeft), mr = p(LandmarkType.MouthRight);
  if (!le || !re || !no || !ml || !mr) return null;
  const ojos  = [le, re].sort((a, b) => a.x - b.x);      // [img-izq, img-der]
  const bocas = [ml, mr].sort((a, b) => a.x - b.x);
  return [ojos[0].x, ojos[0].y, ojos[1].x, ojos[1].y, no.x, no.y,
          bocas[0].x, bocas[0].y, bocas[1].x, bocas[1].y];
}
