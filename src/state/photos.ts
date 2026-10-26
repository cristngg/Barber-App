import { api } from './api';

/*
 * Fotos que sube el barbero: se reducen en el teléfono (menos datos, subida más rápida)
 * y se suben al servidor, que devuelve su URL. El servidor borra las que se reemplazan.
 */

async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.85),
  );
}

export async function savePhoto(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Ese archivo no es una foto.');
  let blob: Blob;
  try {
    blob = await shrink(file, maxSide);
  } catch {
    throw new Error('No se pudo leer la foto. Prueba con otra.');
  }
  return (await api.uploadPhoto(blob)).url;
}
