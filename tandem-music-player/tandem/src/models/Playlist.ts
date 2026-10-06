import { DNode, DoublyLinkedList } from '../structures/DoublyLinkedList';
import { newId, Song } from './Song';

export type RepeatMode = 'off' | 'all' | 'one';
export type InsertWhere = 'start' | 'end' | number;

/**
 * Una playlist es una lista doble de canciones con un puntero `current`
 * al nodo que está sonando. Adelantar = current.next, retroceder = current.prev.
 */
export class Playlist {
  readonly id: string;
  name: string;
  readonly songs = new DoublyLinkedList<Song>();
  current: DNode<Song> | null = null;
  /** Historial del modo aleatorio, también como lista doble (se usa como pila). */
  private shuffleHistory = new DoublyLinkedList<DNode<Song>>();

  constructor(name: string, id: string = newId()) {
    this.name = name;
    this.id = id;
  }

  /** Agrega varias canciones conservando su orden en la posición indicada. */
  addMany(list: Song[], where: InsertWhere): DNode<Song>[] {
    let index = where === 'start' ? 0 : where === 'end' ? this.songs.size : where;
    return list.map((song) => this.songs.insertAt(index++, song));
  }

  /** "Play next": inserta justo después de la canción actual. */
  playNext(song: Song): DNode<Song> {
    return this.current ? this.songs.insertAfter(this.current, song) : this.songs.addFirst(song);
  }

  remove(node: DNode<Song>): Song {
    if (node === this.current) this.current = null;
    const stale = [...this.shuffleHistory.nodes()].filter((h) => h.data === node);
    for (const h of stale) this.shuffleHistory.remove(h);
    return this.songs.remove(node);
  }

  clear(): void {
    this.songs.clear();
    this.shuffleHistory.clear();
    this.current = null;
  }

  /** Siguiente nodo según los modos de repetición y aleatorio. */
  next(repeat: RepeatMode, shuffle: boolean): DNode<Song> | null {
    if (this.songs.isEmpty()) return null;
    if (!this.current) return this.songs.head;
    if (shuffle && this.songs.size > 1) {
      this.shuffleHistory.addLast(this.current);
      let target = this.current;
      while (target === this.current) target = this.songs.nodeAt(Math.floor(Math.random() * this.songs.size))!;
      return target;
    }
    if (this.current.next) return this.current.next;
    return repeat === 'off' ? null : this.songs.head;
  }

  /** Nodo anterior: simplemente sigue el puntero prev. */
  previous(repeat: RepeatMode, shuffle: boolean): DNode<Song> | null {
    if (this.songs.isEmpty()) return null;
    if (!this.current) return this.songs.tail;
    if (shuffle && this.shuffleHistory.tail) {
      return this.shuffleHistory.remove(this.shuffleHistory.tail);
    }
    if (this.current.prev) return this.current.prev;
    return repeat === 'off' ? null : this.songs.tail;
  }

  get totalDuration(): number {
    let total = 0;
    for (const s of this.songs) total += s.duration || 0;
    return total;
  }
}
