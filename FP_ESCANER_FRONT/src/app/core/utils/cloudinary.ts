/**
 * Miniatura de una foto de Cloudinary: inserta la transformación después de
 * `/upload/` (recorte centrado en la cara). URLs que no son de Cloudinary se
 * devuelven tal cual.
 */
export function miniaturaCloudinary(url: string, lado = 300): string {
  return url.replace('/upload/', `/upload/w_${lado},h_${lado},c_fill,g_face/`);
}
