# Tandem — Reproductor de música con listas dobles

**Taller Reproductor de Música · Estructuras de Datos · Universidad Cooperativa de Colombia (Pasto)**
Autora: Laura Sofía Meza Reinoso

Tandem es un reproductor web real, escrito en **TypeScript**, que reproduce las canciones guardadas
en el dispositivo del usuario. Toda la lógica de la playlist está construida sobre una
**lista doblemente enlazada implementada desde cero** (sin usar arreglos para la cola de reproducción).

> Lema: *"Every song knows its neighbors"* — cada canción conoce a su vecina anterior y a la siguiente.

---

## 1. Requisitos del taller y cómo se cumplen

| Requisito | Cómo lo hace Tandem | Método de la lista doble |
|---|---|---|
| Frontend donde el usuario interactúa | Interfaz web clara y responsive (PC, tablet, celular) | — |
| Agregar canción **al inicio** | Selector *Add songs to → Start* | `addFirst()` · O(1) |
| Agregar canción **al final** | Selector *Add songs to → End* | `addLast()` · O(1) |
| Agregar en **cualquier posición** (sin digitar la posición) | *Pick a spot*: aparecen huecos “Insert here” entre canciones; el usuario toca uno. También se pueden arrastrar archivos encima de una canción | `insertAt()` / `insertBefore()` |
| **Eliminar** canción | Botón de papelera en cada fila | `remove(node)` · O(1) |
| **Adelantar** canción (A → B) | Botón *Next*, tecla `N` o tarjeta “next node” | `current = current.next` |
| **Retroceder** canción (B → A) | Botón *Previous*, tecla `P` o tarjeta “prev node” | `current = current.prev` |
| Otras funcionalidades | Ver sección 3 | — |

## 2. La estructura de datos

`src/structures/DoublyLinkedList.ts`

```ts
class DNode<T> { data: T; prev: DNode<T> | null; next: DNode<T> | null; }
class DoublyLinkedList<T> { head; tail; size; ... }
```

| Operación | Descripción | Complejidad |
|---|---|---|
| `addFirst(data)` | Inserta antes de `head` | O(1) |
| `addLast(data)` | Inserta después de `tail` | O(1) |
| `insertAt(i, data)` | Inserta en la posición *i* | O(n) |
| `insertBefore / insertAfter(nodo, data)` | Inserta junto a un nodo conocido | O(1) |
| `nodeAt(i)` | Recorre desde el extremo más cercano (usa `prev` si *i* está en la segunda mitad) | O(n/2) |
| `remove(nodo)` | Re-enlaza `prev.next` y `next.prev` | O(1) |
| `moveUp / moveDown / moveBefore` | Reordena cambiando solo punteros | O(1) |
| `reverse()` | Intercambia `prev` y `next` de cada nodo y luego `head` ↔ `tail` | O(n) |
| `sort(cmp)` | Ordenamiento por inserción moviendo nodos y buscando hacia atrás con `prev` | O(n²) |
| `nodes() / nodesReverse()` | Recorrido hacia adelante y hacia atrás | O(n) |

**Dónde se usa la lista doble en la app (todo es lista doble):**

1. Las canciones de cada playlist → `Playlist.songs: DoublyLinkedList<Song>`
2. La lista de playlists → `Library.playlists: DoublyLinkedList<Playlist>`
3. El historial del modo aleatorio → `DoublyLinkedList<DNode<Song>>` (se usa como pila para poder volver atrás en *shuffle*)

La canción que suena es un **puntero a un nodo** (`Playlist.current`). Adelantar y retroceder
no buscan nada: solo siguen `next` o `prev`.

La vista **Chain** dibuja la lista tal como está en memoria: `null ← HEAD ⇄ … ⇄ TAIL → null`,
con los punteros `prev` y `next` de cada nodo y las etiquetas HEAD, TAIL y NOW.

## 3. Funcionalidades extra

- Varias playlists: crear, renombrar (doble clic en el nombre) y eliminar.
- Cargar canciones o **carpetas completas** del dispositivo, o arrastrarlas a la ventana.
- Lectura de **etiquetas ID3** (título, artista, álbum y carátula) con un lector propio, sin librerías.
- Si el archivo no trae etiquetas, se deduce de su nombre (`Artista - Título.mp3`).
- Volumen con barra y silencio, barra de progreso para saltar a cualquier punto, velocidad 0.75×–1.5×.
- Aleatorio (*shuffle*), repetir toda la lista o una sola canción.
- “Play next”: coloca una canción justo después de la actual.
- Reordenar con flechas o arrastrando filas; ordenar por título, artista, duración o fecha; invertir la lista.
- Buscador dentro de la playlist.
- Visualizador de audio en tiempo real (Web Audio API).
- Atajos de teclado (`Espacio`, `N`, `P`, `←`/`→`, `↑`/`↓`, `M`, `S`, `R`, `A`).
- Controles del sistema operativo / pantalla bloqueada (Media Session API).
- **Persistencia**: las canciones y playlists se guardan en el navegador (IndexedDB); al volver siguen ahí.
  Nada se sube a ningún servidor.
- Diseño adaptable: escritorio de tres paneles; en celular, una columna con mini reproductor fijo abajo.

## 4. Estructura del proyecto

```
tandem/
├── index.html                  # Estructura de la interfaz
├── package.json · tsconfig.json · vite.config.ts
└── src/
    ├── main.ts                 # Interfaz y eventos
    ├── styles.css              # Estilos (tema claro)
    ├── structures/
    │   └── DoublyLinkedList.ts # ★ La lista doblemente enlazada
    ├── models/
    │   ├── Song.ts             # Modelo de canción
    │   └── Playlist.ts         # Playlist = lista doble + puntero current
    ├── core/
    │   ├── Library.ts          # Lista doble de playlists + guardado
    │   ├── AudioEngine.ts      # Reproducción, volumen, visualizador
    │   ├── metadata.ts         # Lector ID3 y duración
    │   └── storage.ts          # IndexedDB
    └── ui/
        └── icons.ts            # Íconos SVG y logo
```

## 5. Cómo ejecutarlo

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev       # abre http://localhost:5173
npm run build     # verifica tipos con tsc y genera la carpeta dist/
```

## 6. Desplegar en la nube (opcional, además del enlace ya publicado)

**Vercel:** sube la carpeta a GitHub → en vercel.com, *Add New → Project* → elige el repositorio →
Framework: *Vite* → *Deploy*.

**Netlify:** `npm run build` y arrastra la carpeta `dist/` a app.netlify.com/drop.

**GitHub Pages:** `npm run build`, sube el contenido de `dist/` a una rama `gh-pages`
(el proyecto ya usa rutas relativas con `base: './'`).
