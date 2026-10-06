/**
 * DoublyLinkedList<T>
 * ------------------------------------------------------------
 * Lista doblemente enlazada genérica, implementada desde cero.
 * Cada nodo conoce a su vecino anterior (prev) y al siguiente (next).
 * Tandem la usa para TODO: las canciones de cada playlist, la lista
 * de playlists y el historial del modo aleatorio.
 */
export class DNode<T> {
  data: T;
  prev: DNode<T> | null = null;
  next: DNode<T> | null = null;

  constructor(data: T) {
    this.data = data;
  }
}

export class DoublyLinkedList<T> implements Iterable<T> {
  head: DNode<T> | null = null;
  tail: DNode<T> | null = null;
  private count = 0;

  get size(): number {
    return this.count;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  /** Inserta al inicio. O(1) */
  addFirst(data: T): DNode<T> {
    const node = new DNode(data);
    this.attachBefore(node, this.head);
    this.count++;
    return node;
  }

  /** Inserta al final. O(1) */
  addLast(data: T): DNode<T> {
    const node = new DNode(data);
    this.attachBefore(node, null);
    this.count++;
    return node;
  }

  /** Inserta en cualquier posición (0 = inicio, size = final). O(n) */
  insertAt(index: number, data: T): DNode<T> {
    if (index <= 0) return this.addFirst(data);
    if (index >= this.count) return this.addLast(data);
    return this.insertBefore(this.nodeAt(index)!, data);
  }

  /** Inserta antes de un nodo conocido. O(1) */
  insertBefore(ref: DNode<T>, data: T): DNode<T> {
    const node = new DNode(data);
    this.attachBefore(node, ref);
    this.count++;
    return node;
  }

  /** Inserta después de un nodo conocido. O(1) */
  insertAfter(ref: DNode<T>, data: T): DNode<T> {
    const node = new DNode(data);
    this.attachBefore(node, ref.next);
    this.count++;
    return node;
  }

  /** Devuelve el nodo en una posición, recorriendo desde el extremo más cercano. O(n/2) */
  nodeAt(index: number): DNode<T> | null {
    if (index < 0 || index >= this.count) return null;
    if (index < this.count / 2) {
      let cur = this.head;
      for (let i = 0; i < index; i++) cur = cur!.next;
      return cur;
    }
    let cur = this.tail;
    for (let i = this.count - 1; i > index; i--) cur = cur!.prev;
    return cur;
  }

  indexOf(node: DNode<T>): number {
    let i = 0;
    for (let cur = this.head; cur; cur = cur.next, i++) if (cur === node) return i;
    return -1;
  }

  contains(node: DNode<T>): boolean {
    return this.indexOf(node) !== -1;
  }

  find(predicate: (data: T) => boolean): DNode<T> | null {
    for (let cur = this.head; cur; cur = cur.next) if (predicate(cur.data)) return cur;
    return null;
  }

  /** Elimina un nodo re-enlazando a sus vecinos. O(1) */
  remove(node: DNode<T>): T {
    this.detach(node);
    this.count--;
    return node.data;
  }

  removeAt(index: number): T | null {
    const node = this.nodeAt(index);
    return node ? this.remove(node) : null;
  }

  /** Mueve un nodo para que quede antes de `ref` (null = al final). Solo cambia punteros. */
  moveBefore(node: DNode<T>, ref: DNode<T> | null): void {
    if (node === ref || node.next === ref) return;
    this.detach(node);
    this.attachBefore(node, ref);
  }

  moveUp(node: DNode<T>): boolean {
    if (!node.prev) return false;
    this.moveBefore(node, node.prev);
    return true;
  }

  moveDown(node: DNode<T>): boolean {
    if (!node.next) return false;
    this.moveBefore(node, node.next.next);
    return true;
  }

  /** Invierte la lista intercambiando prev/next de cada nodo. O(n) */
  reverse(): void {
    let cur = this.head;
    while (cur) {
      const next = cur.next;
      cur.next = cur.prev;
      cur.prev = next;
      cur = next;
    }
    const oldHead = this.head;
    this.head = this.tail;
    this.tail = oldHead;
  }

  /**
   * Ordenamiento por inserción estable, moviendo nodos (no copiando datos).
   * Aprovecha el puntero prev para buscar hacia atrás. O(n²)
   */
  sort(compare: (a: T, b: T) => number): void {
    let cur = this.head?.next ?? null;
    while (cur) {
      const nextToVisit: DNode<T> | null = cur.next;
      let pos = cur.prev;
      while (pos && compare(pos.data, cur.data) > 0) pos = pos.prev;
      if (pos !== cur.prev) {
        this.detach(cur);
        this.attachBefore(cur, pos ? pos.next : this.head);
      }
      cur = nextToVisit;
    }
  }

  clear(): void {
    let cur = this.head;
    while (cur) {
      const next = cur.next;
      cur.prev = cur.next = null;
      cur = next;
    }
    this.head = this.tail = null;
    this.count = 0;
  }

  *nodes(): IterableIterator<DNode<T>> {
    for (let cur = this.head; cur; cur = cur.next) yield cur;
  }

  /** Recorrido de cola a cabeza usando los punteros prev. */
  *nodesReverse(): IterableIterator<DNode<T>> {
    for (let cur = this.tail; cur; cur = cur.prev) yield cur;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let cur = this.head; cur; cur = cur.next) yield cur.data;
  }

  toArray(): T[] {
    return [...this];
  }

  // ---------- enlaces internos (no cambian el tamaño) ----------

  private attachBefore(node: DNode<T>, ref: DNode<T> | null): void {
    if (ref === null) {
      node.prev = this.tail;
      node.next = null;
      if (this.tail) this.tail.next = node;
      else this.head = node;
      this.tail = node;
      return;
    }
    node.next = ref;
    node.prev = ref.prev;
    if (ref.prev) ref.prev.next = node;
    else this.head = node;
    ref.prev = node;
  }

  private detach(node: DNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = node.next = null;
  }
}
