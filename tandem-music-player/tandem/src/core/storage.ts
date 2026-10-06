/**
 * Persistencia local con IndexedDB: los archivos de audio se guardan en el
 * navegador del usuario para que las playlists sigan ahí al volver.
 * Si el navegador no lo permite (modo privado, etc.) la app sigue funcionando
 * en memoria.
 */
import type { Song } from '../models/Song';

export type StoredSong = Omit<Song, 'url' | 'coverUrl'>;

export interface StoredState {
  playlists: { id: string; name: string; songIds: string[] }[];
  activeId: string | null;
  volume: number;
  repeat: 'off' | 'all' | 'one';
  shuffle: boolean;
}

const DB_NAME = 'tandem-player';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveSong(song: Song): Promise<void> {
  const { url: _u, coverUrl: _c, ...stored } = song;
  try {
    await run('songs', 'readwrite', (s) => s.put(stored));
  } catch {
    /* sin almacenamiento: la canción vive solo en esta sesión */
  }
}

export async function deleteSong(id: string): Promise<void> {
  try {
    await run('songs', 'readwrite', (s) => s.delete(id));
  } catch {
    /* ignorar */
  }
}

export async function loadSongs(): Promise<StoredSong[]> {
  try {
    return (await run<StoredSong[]>('songs', 'readonly', (s) => s.getAll())) ?? [];
  } catch {
    return [];
  }
}

export async function saveState(state: StoredState): Promise<void> {
  try {
    await run('state', 'readwrite', (s) => s.put(state, 'library'));
  } catch {
    /* ignorar */
  }
}

export async function loadState(): Promise<StoredState | null> {
  try {
    return (await run<StoredState | undefined>('state', 'readonly', (s) => s.get('library'))) ?? null;
  } catch {
    return null;
  }
}
