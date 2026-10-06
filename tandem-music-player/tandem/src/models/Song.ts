/** Una canción cargada desde un archivo del dispositivo del usuario. */
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // segundos
  fileName: string;
  blob: Blob;
  coverBlob: Blob | null;
  addedAt: number;
  /** URLs temporales creadas en tiempo de ejecución (no se guardan). */
  url?: string;
  coverUrl?: string;
}

export function songUrl(song: Song): string {
  if (!song.url) song.url = URL.createObjectURL(song.blob);
  return song.url;
}

export function coverUrl(song: Song): string | null {
  if (!song.coverBlob) return null;
  if (!song.coverUrl) song.coverUrl = URL.createObjectURL(song.coverBlob);
  return song.coverUrl;
}

export function releaseUrls(song: Song): void {
  if (song.url) URL.revokeObjectURL(song.url);
  if (song.coverUrl) URL.revokeObjectURL(song.coverUrl);
  song.url = song.coverUrl = undefined;
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
