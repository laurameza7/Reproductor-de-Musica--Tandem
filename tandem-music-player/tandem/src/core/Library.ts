/**
 * La biblioteca: una lista doble de playlists (cada una con su lista doble de canciones).
 * Se encarga de guardar y restaurar todo desde IndexedDB.
 */
import { DNode, DoublyLinkedList } from '../structures/DoublyLinkedList';
import { Playlist, RepeatMode } from '../models/Playlist';
import { releaseUrls, Song } from '../models/Song';
import * as storage from './storage';

export class Library {
  readonly playlists = new DoublyLinkedList<Playlist>();
  active: DNode<Playlist> | null = null;
  playing: Playlist | null = null;
  volume = 0.8;
  repeat: RepeatMode = 'off';
  shuffle = false;
  private saveTimer: number | undefined;

  get activePlaylist(): Playlist {
    return this.active!.data;
  }

  createPlaylist(name: string): DNode<Playlist> {
    return this.playlists.addLast(new Playlist(name));
  }

  nextPlaylistName(): string {
    let n = this.playlists.size + 1;
    const names = new Set(this.playlists.toArray().map((p) => p.name));
    while (names.has(`Playlist ${n}`)) n++;
    return `Playlist ${n}`;
  }

  removePlaylist(node: DNode<Playlist>): void {
    const neighbor = node.next ?? node.prev;
    for (const song of node.data.songs) this.forgetSongIfUnused(song, node.data);
    if (this.playing === node.data) this.playing = null;
    this.playlists.remove(node);
    this.active = neighbor;
    if (!this.active) this.active = this.createPlaylist('My first mix');
    this.scheduleSave();
  }

  /** Borra el archivo guardado si ninguna otra playlist usa la canción. */
  forgetSongIfUnused(song: Song, except: Playlist): void {
    for (const pl of this.playlists) {
      if (pl === except) continue;
      if (pl.songs.find((s) => s.id === song.id)) return;
    }
    releaseUrls(song);
    void storage.deleteSong(song.id);
  }

  async persistSong(song: Song): Promise<void> {
    await storage.saveSong(song);
  }

  scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), 300);
  }

  async saveNow(): Promise<void> {
    const state: storage.StoredState = {
      playlists: this.playlists.toArray().map((p) => ({
        id: p.id,
        name: p.name,
        songIds: p.songs.toArray().map((s) => s.id),
      })),
      activeId: this.active?.data.id ?? null,
      volume: this.volume,
      repeat: this.repeat,
      shuffle: this.shuffle,
    };
    await storage.saveState(state);
  }

  async load(): Promise<void> {
    const [state, stored] = await Promise.all([storage.loadState(), storage.loadSongs()]);
    const byId = new Map<string, Song>();
    for (const s of stored) byId.set(s.id, { ...s });

    if (state) {
      this.volume = state.volume ?? 0.8;
      this.repeat = state.repeat ?? 'off';
      this.shuffle = state.shuffle ?? false;
      for (const p of state.playlists) {
        const pl = new Playlist(p.name, p.id);
        for (const id of p.songIds) {
          const song = byId.get(id);
          if (song) pl.songs.addLast(song);
        }
        const node = this.playlists.addLast(pl);
        if (p.id === state.activeId) this.active = node;
      }
    }
    if (this.playlists.isEmpty()) this.createPlaylist('My first mix');
    if (!this.active) this.active = this.playlists.head;
  }
}
