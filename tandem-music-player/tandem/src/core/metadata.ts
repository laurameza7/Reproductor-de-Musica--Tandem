/**
 * Lectura de metadatos sin librerías externas:
 *  - Lector propio de etiquetas ID3v2.3 / ID3v2.4 (título, artista, álbum y carátula).
 *  - Si el archivo no trae etiquetas, se deduce de su nombre ("Artista - Título.mp3").
 *  - La duración se obtiene con un elemento <audio> temporal.
 */
import { newId, Song } from '../models/Song';

interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  cover?: Blob;
}

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|weba|mp4)$/i;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT.test(file.name);
}

const syncsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function decodeBytes(bytes: Uint8Array, enc: number): string {
  let label = 'iso-8859-1';
  if (enc === 1) {
    if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be';
    else label = 'utf-16le';
  } else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  const text = new TextDecoder(label).decode(bytes).replace(/^﻿/, '');
  return text.split('\u0000')[0].trim();
}

function parseApic(data: Uint8Array): Blob | undefined {
  const enc = data[0];
  let i = 1;
  let mime = '';
  while (i < data.length && data[i] !== 0) mime += String.fromCharCode(data[i++]);
  i++; // fin del mime
  i++; // tipo de imagen
  if (enc === 1 || enc === 2) {
    while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < data.length && data[i] !== 0) i++;
    i++;
  }
  if (i >= data.length) return undefined;
  mime = mime.toLowerCase();
  if (!mime.includes('/')) mime = mime.includes('png') ? 'image/png' : 'image/jpeg';
  if (mime === 'image/jpg') mime = 'image/jpeg';
  return new Blob([data.slice(i)], { type: mime });
}

async function readId3(file: File): Promise<Tags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const version = head[3];
    if (version < 3) return {};
    const flags = head[5];
    const size = syncsafe(head, 6);
    const buf = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    let off = 0;
    if (flags & 0x40) off = version === 4 ? syncsafe(buf, 0) : u32(buf, 0) + 4;

    const tags: Tags = {};
    while (off + 10 <= buf.length) {
      const id = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const frameSize = version === 4 ? syncsafe(buf, off + 4) : u32(buf, off + 4);
      const start = off + 10;
      const end = start + frameSize;
      if (frameSize <= 0 || end > buf.length) break;
      const data = buf.subarray(start, end);
      if (id === 'TIT2') tags.title = decodeBytes(data.subarray(1), data[0]);
      else if (id === 'TPE1') tags.artist = decodeBytes(data.subarray(1), data[0]);
      else if (id === 'TALB') tags.album = decodeBytes(data.subarray(1), data[0]);
      else if (id === 'APIC' && !tags.cover) tags.cover = parseApic(data);
      off = end;
    }
    return tags;
  } catch {
    return {};
  }
}

function fromFileName(name: string): { title: string; artist?: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = base.split(/\s[-–]\s/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { title: base };
}

export function readDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (d: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(Number.isFinite(d) ? d : 0);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    audio.src = url;
  });
}

/** Convierte un archivo del dispositivo en una canción lista para la playlist. */
export async function songFromFile(file: File): Promise<Song> {
  const [tags, duration] = await Promise.all([readId3(file), readDuration(file)]);
  const guess = fromFileName(file.name);
  return {
    id: newId(),
    title: tags.title || guess.title || 'Untitled',
    artist: tags.artist || guess.artist || 'Unknown artist',
    album: tags.album || '',
    duration,
    fileName: file.name,
    blob: file,
    coverBlob: tags.cover ?? null,
    addedAt: Date.now(),
  };
}
