import { useEffect, useState } from 'react';

/*
 * Fotos que sube el barbero. Se reducen en el teléfono y se guardan en IndexedDB
 * (localStorage no aguanta imágenes). Una foto guardada se referencia como "idb:<id>".
 * Cuando haya servidor, `savePhoto` debe subir el archivo y devolver su URL.
 */

const DB_NAME = 'filo';
const STORE = 'photos';
const PREFIX = 'idb:';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* Reduce la foto a `maxSide` px por lado y la pasa a JPEG. */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo leer la foto'))), 'image/jpeg', 0.85),
  );
}

export async function savePhoto(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Ese archivo no es una foto.');
  const blob = await shrink(file, maxSide);
  const id = crypto.randomUUID();
  await tx('readwrite', (s) => s.put(blob, id));
  return PREFIX + id;
}

export async function deletePhoto(ref: string | undefined) {
  if (!ref?.startsWith(PREFIX)) return;
  try {
    await tx('readwrite', (s) => s.delete(ref.slice(PREFIX.length)));
  } catch {
    /* si no se puede borrar, solo ocupa espacio */
  }
}

/* Convierte una referencia en algo que <img src> entiende. */
export function usePhotoSrc(ref: string | undefined) {
  const [src, setSrc] = useState<string | undefined>(ref?.startsWith(PREFIX) ? undefined : ref);

  useEffect(() => {
    if (!ref?.startsWith(PREFIX)) {
      setSrc(ref);
      return;
    }
    let url: string | undefined;
    let alive = true;
    tx<Blob | undefined>('readonly', (s) => s.get(ref.slice(PREFIX.length)))
      .then((blob) => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => alive && setSrc(undefined));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ref]);

  return src;
}
