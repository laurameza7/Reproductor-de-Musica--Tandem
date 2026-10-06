import './styles.css';
import { Library } from './core/Library';
import { AudioEngine } from './core/AudioEngine';
import { isAudioFile, songFromFile } from './core/metadata';
import { DNode } from './structures/DoublyLinkedList';
import { Playlist } from './models/Playlist';
import { coverUrl, Song, songUrl } from './models/Song';
import { icons, logoSvg } from './ui/icons';

// ------------------------------------------------------------------
// Estado
// ------------------------------------------------------------------
const lib = new Library();
const engine = new AudioEngine();

type InsertMode = 'start' | 'end' | 'pick';
let insertMode: InsertMode = 'end';
let pendingIndex: number | null = null; // posición elegida en modo "Pick a spot"
let view: 'queue' | 'chain' = 'queue';
let filter = '';
let rowNodes: DNode<Song>[] = [];
let dragNode: DNode<Song> | null = null;
let seeking = false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  logo: $('logo'),
  search: $<HTMLInputElement>('search'),
  playlistList: $('playlistList'),
  newPlaylist: $<HTMLButtonElement>('newPlaylist'),
  plArt: $('plArt'),
  plName: $('plName'),
  plNameInput: $<HTMLInputElement>('plNameInput'),
  renameBtn: $<HTMLButtonElement>('renameBtn'),
  plStats: $('plStats'),
  playAll: $<HTMLButtonElement>('playAll'),
  deletePlaylist: $<HTMLButtonElement>('deletePlaylist'),
  insertMode: $('insertMode'),
  addFiles: $<HTMLButtonElement>('addFiles'),
  addFolder: $<HTMLButtonElement>('addFolder'),
  sortBy: $<HTMLSelectElement>('sortBy'),
  reverseBtn: $<HTMLButtonElement>('reverseBtn'),
  clearBtn: $<HTMLButtonElement>('clearBtn'),
  viewTabs: $('viewTabs'),
  pickHint: $('pickHint'),
  songList: $('songList'),
  chainView: $('chainView'),
  cover: $('cover'),
  viz: $<HTMLCanvasElement>('viz'),
  npFrom: $('npFrom'),
  npTitle: $('npTitle'),
  npArtist: $('npArtist'),
  tCur: $('tCur'),
  tDur: $('tDur'),
  seekBar: $<HTMLInputElement>('seekBar'),
  shuffleBtn: $<HTMLButtonElement>('shuffleBtn'),
  prevBtn: $<HTMLButtonElement>('prevBtn'),
  playBtn: $<HTMLButtonElement>('playBtn'),
  nextBtn: $<HTMLButtonElement>('nextBtn'),
  repeatBtn: $<HTMLButtonElement>('repeatBtn'),
  prevPeek: $<HTMLButtonElement>('prevPeek'),
  nextPeek: $<HTMLButtonElement>('nextPeek'),
  prevTitle: $('prevTitle'),
  nextTitle: $('nextTitle'),
  muteBtn: $<HTMLButtonElement>('muteBtn'),
  volume: $<HTMLInputElement>('volume'),
  volPct: $('volPct'),
  speed: $<HTMLSelectElement>('speed'),
  miniCover: $('miniCover'),
  miniTitle: $('miniTitle'),
  miniArtist: $('miniArtist'),
  miniBar: $('miniBar'),
  miniPrev: $<HTMLButtonElement>('miniPrev'),
  miniPlay: $<HTMLButtonElement>('miniPlay'),
  miniNext: $<HTMLButtonElement>('miniNext'),
  filePicker: $<HTMLInputElement>('filePicker'),
  folderPicker: $<HTMLInputElement>('folderPicker'),
  toast: $('toast'),
  dropOverlay: $('dropOverlay'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalBody: $('modalBody'),
  modalOk: $<HTMLButtonElement>('modalOk'),
  modalCancel: $<HTMLButtonElement>('modalCancel'),
};

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function longDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function hue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Carátula: la imagen real del archivo o un degradado pastel único por canción. */
function art(song: Song | null, extraClass = ''): string {
  if (!song) {
    return `<div class="thumb ${extraClass}" style="background:linear-gradient(135deg,#dcf1ec,#fdf1d6)">♪</div>`;
  }
  const url = coverUrl(song);
  const h = hue(song.title + song.artist);
  const bg = `linear-gradient(135deg,hsl(${h} 70% 84%),hsl(${(h + 50) % 360} 72% 70%))`;
  const letter = esc((song.title.trim()[0] || '♪').toUpperCase());
  return `<div class="thumb ${extraClass}" style="background:${bg}">${letter}${url ? `<img src="${url}" alt="" loading="lazy">` : ''}</div>`;
}

let toastTimer: number | undefined;
function toast(msg: string): void {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function openModal(opts: { title: string; html: string; ok: string; danger?: boolean; cancel?: boolean }): Promise<boolean> {
  el.modalTitle.textContent = opts.title;
  el.modalBody.innerHTML = opts.html;
  el.modalOk.textContent = opts.ok;
  el.modalOk.classList.toggle('danger-fill', !!opts.danger);
  el.modalCancel.hidden = opts.cancel === false;
  el.modal.hidden = false;
  el.modalOk.focus();
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      el.modal.hidden = true;
      el.modalOk.onclick = el.modalCancel.onclick = el.modal.onclick = null;
      resolve(v);
    };
    el.modalOk.onclick = () => close(true);
    el.modalCancel.onclick = () => close(false);
    el.modal.onclick = (e) => {
      if (e.target === el.modal) close(false);
    };
  });
}

const active = (): Playlist => lib.activePlaylist;
const playingNode = (): DNode<Song> | null => lib.playing?.current ?? null;

// ------------------------------------------------------------------
// Reproducción (todo se mueve con los punteros prev / next)
// ------------------------------------------------------------------
async function playNode(pl: Playlist, node: DNode<Song>, autoplay = true): Promise<void> {
  pl.current = node;
  lib.playing = pl;
  engine.load(songUrl(node.data));
  if (autoplay) {
    const ok = await engine.play();
    if (!ok) toast('Tap play to start the music');
  }
  bump();
  renderAll();
  updateMediaSession();
}

function next(fromEnded = false): void {
  const pl = lib.playing ?? active();
  const target = pl.next(lib.repeat, lib.shuffle);
  if (target) {
    void playNode(pl, target);
  } else if (fromEnded) {
    engine.pause();
    engine.seek(0);
    toast('End of the playlist');
    renderAll();
  } else {
    toast('This is the last song (next → null)');
  }
}

function previous(): void {
  const pl = lib.playing ?? active();
  const target = pl.previous(lib.repeat, lib.shuffle);
  if (target) void playNode(pl, target);
  else toast('This is the first song (prev → null)');
}

async function togglePlay(): Promise<void> {
  if (!lib.playing?.current) {
    const pl = active();
    if (pl.songs.head) await playNode(pl, pl.songs.head);
    else toast('Add some songs first');
    return;
  }
  if (engine.isPlaying) engine.pause();
  else {
    if (!engine.el.src) engine.load(songUrl(lib.playing.current.data));
    await engine.play();
  }
}

function stopPlayback(): void {
  engine.stop();
  if (lib.playing) lib.playing.current = null;
  lib.playing = null;
  renderAll();
}

function bump(): void {
  el.cover.classList.add('pulse');
  window.setTimeout(() => el.cover.classList.remove('pulse'), 160);
}

// ------------------------------------------------------------------
// Agregar canciones
// ------------------------------------------------------------------
async function addFiles(files: File[], at?: number): Promise<void> {
  const audio = files.filter(isAudioFile).sort((a, b) =>
    (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }),
  );
  if (!audio.length) {
    toast('No audio files found there');
    return;
  }
  const pl = active();
  toast(`Reading ${audio.length} song${audio.length > 1 ? 's' : ''}…`);
  const songs: Song[] = [];
  for (const file of audio) {
    const song = await songFromFile(file);
    songs.push(song);
    void lib.persistSong(song);
  }
  const where = at !== undefined ? at : insertMode === 'start' ? 'start' : 'end';
  pl.addMany(songs, where);
  const label = at !== undefined ? `at position ${at + 1}` : where === 'start' ? 'to the start' : 'to the end';
  toast(`Added ${songs.length} song${songs.length > 1 ? 's' : ''} ${label}`);
  pendingIndex = null;
  if (insertMode === 'pick') setInsertMode('end');
  lib.scheduleSave();
  renderAll();
}

function openPicker(folder = false): void {
  (folder ? el.folderPicker : el.filePicker).click();
}

function setInsertMode(mode: InsertMode): void {
  insertMode = mode;
  for (const b of el.insertMode.querySelectorAll<HTMLButtonElement>('button')) {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  }
  el.pickHint.hidden = mode !== 'pick' || active().songs.isEmpty();
  if (mode === 'pick' && view === 'chain') setView('queue');
  renderQueue();
}

// ------------------------------------------------------------------
// Edición de la lista
// ------------------------------------------------------------------
function removeSong(node: DNode<Song>): void {
  const pl = active();
  const wasCurrent = lib.playing === pl && pl.current === node;
  const wasPlaying = engine.isPlaying;
  const successor = node.next ?? null;
  const title = node.data.title;
  pl.remove(node);
  lib.forgetSongIfUnused(node.data, pl);
  if (wasCurrent) {
    if (successor) void playNode(pl, successor, wasPlaying);
    else stopPlayback();
  }
  toast(`Removed “${title}”`);
  lib.scheduleSave();
  renderAll();
}

function playNextSong(node: DNode<Song>): void {
  const pl = active();
  if (lib.playing !== pl || !pl.current || pl.current === node) {
    toast('Start playing this playlist to queue songs next');
    return;
  }
  pl.songs.moveBefore(node, pl.current.next);
  toast(`“${node.data.title}” plays next`);
  lib.scheduleSave();
  renderAll();
}

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
function renderPlaylists(): void {
  const items: string[] = [];
  let i = 0;
  for (const node of lib.playlists.nodes()) {
    const pl = node.data;
    const isPlaying = lib.playing === pl && !!pl.current;
    items.push(`<li><button type="button" class="pl-item ${node === lib.active ? 'on' : ''}" data-i="${i}">
      ${art(pl.songs.head?.data ?? null)}
      <span style="min-width:0"><strong>${esc(pl.name)}</strong><small>${pl.songs.size} song${pl.songs.size === 1 ? '' : 's'}</small></span>
      ${isPlaying ? `<span class="eq ${engine.isPlaying ? '' : 'paused'}"><i></i><i></i><i></i></span>` : ''}
    </button></li>`);
    i++;
  }
  el.playlistList.innerHTML = items.join('');
}

function renderHeader(): void {
  const pl = active();
  el.plName.textContent = pl.name;
  const n = pl.songs.size;
  el.plStats.textContent = n
    ? `${n} song${n === 1 ? '' : 's'} · ${longDuration(pl.totalDuration)}`
    : 'Empty for now';
  const firsts = pl.songs.toArray().slice(0, 4);
  if (firsts.length >= 4) {
    el.plArt.className = 'pl-art';
    el.plArt.innerHTML = firsts.map((s) => art(s)).join('');
  } else {
    el.plArt.className = 'pl-art single';
    el.plArt.innerHTML = art(firsts[0] ?? null);
  }
  const isThisPlaying = lib.playing === pl && engine.isPlaying;
  el.playAll.innerHTML = `${isThisPlaying ? icons.pause.replace(/26/g, '16') : icons.playSmall} ${isThisPlaying ? 'Pause' : 'Play'}`;
  el.playAll.disabled = n === 0;
}

function gapButton(index: number): string {
  return `<button type="button" class="gap" data-gap="${index}">${icons.plus} Insert here · position ${index + 1}</button>`;
}

function renderQueue(): void {
  const pl = active();
  el.pickHint.hidden = insertMode !== 'pick' || pl.songs.isEmpty();
  if (pl.songs.isEmpty()) {
    rowNodes = [];
    el.songList.innerHTML = `<div class="empty"><div>
      <div class="disc"></div>
      <h3>Bring your own music</h3>
      <p>Pick songs or a whole folder from this device, or drop audio files right here. Tandem keeps them in this browser, so your playlist is still here next time.</p>
      <div class="row-btns">
        <button type="button" class="primary" data-empty="files">${icons.upload} Choose songs</button>
        <button type="button" class="ghost-btn" data-empty="folder">${icons.folder} Choose a folder</button>
      </div>
      <div class="formats">MP3 · M4A · WAV · OGG · FLAC · OPUS</div>
    </div></div>`;
    return;
  }

  const current = lib.playing === pl ? pl.current : null;
  const q = filter.trim().toLowerCase();
  const pick = insertMode === 'pick' && !q;
  const parts: string[] = [];
  rowNodes = [];
  let i = 0;
  for (const node of pl.songs.nodes()) {
    rowNodes.push(node);
    const s = node.data;
    const match = !q || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q);
    if (pick) parts.push(gapButton(i));
    if (match) {
      const isCur = node === current;
      parts.push(`<div class="row ${isCur ? 'current' : ''}" data-i="${i}" draggable="true">
        <span class="num">${isCur ? `<span class="eq ${engine.isPlaying ? '' : 'paused'}" style="color:var(--accent)"><i></i><i></i><i></i></span>` : i + 1}</span>
        ${art(s)}
        <div class="info" data-play="${i}" title="Play"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}${s.album ? ' · ' + esc(s.album) : ''}</span></div>
        <span class="dur">${fmt(s.duration)}</span>
        <div class="acts">
          <button type="button" class="act" data-act="next" data-i="${i}" title="Play next" aria-label="Play next">${icons.next2}</button>
          <button type="button" class="act" data-act="up" data-i="${i}" title="Move up" aria-label="Move up" ${node.prev ? '' : 'disabled'}>${icons.up}</button>
          <button type="button" class="act" data-act="down" data-i="${i}" title="Move down" aria-label="Move down" ${node.next ? '' : 'disabled'}>${icons.down}</button>
          <button type="button" class="act del" data-act="del" data-i="${i}" title="Remove" aria-label="Remove">${icons.trash}</button>
        </div>
      </div>`);
    }
    i++;
  }
  if (pick) parts.push(gapButton(i));
  if (q && !parts.length) parts.push(`<p class="pick-hint" style="background:var(--surface-2);color:var(--muted)">No songs match “${esc(filter)}”.</p>`);
  el.songList.innerHTML = parts.join('');
}

function renderChain(): void {
  const pl = active();
  const current = lib.playing === pl ? pl.current : null;
  const head = pl.songs.head?.data.title ?? 'null';
  const tail = pl.songs.tail?.data.title ?? 'null';
  const out: string[] = [
    `<div class="chain-summary">
      <span class="chip">size = <b>${pl.songs.size}</b></span>
      <span class="chip">head → <b>${esc(head)}</b></span>
      <span class="chip">tail → <b>${esc(tail)}</b></span>
      <span class="chip">current → <b>${esc(current?.data.title ?? 'null')}</b></span>
    </div>`,
    `<div class="chain-track"><span class="null">null</span><span class="link">←</span>`,
  ];
  let i = 0;
  for (const node of pl.songs.nodes()) {
    if (i > 0) out.push(`<span class="link" aria-hidden="true">⇄</span>`);
    const tags = [
      node === pl.songs.head ? '<span class="tag">HEAD</span>' : '',
      node === pl.songs.tail ? '<span class="tag">TAIL</span>' : '',
      node === current ? '<span class="tag now">NOW</span>' : '',
    ].join('');
    out.push(`<button type="button" class="cnode ${node === current ? 'current' : ''}" data-play="${i}">
      <span class="tags">${tags}</span>
      <strong>${esc(node.data.title)}</strong>
      <span class="ptrs"><span>prev → ${esc(node.prev?.data.title ?? 'null')}</span><span>next → ${esc(node.next?.data.title ?? 'null')}</span></span>
    </button>`);
    i++;
  }
  out.push(`<span class="link">→</span><span class="null">null</span></div>`);
  rowNodes = [...pl.songs.nodes()];
  el.chainView.innerHTML = out.join('');
}

function setCover(target: HTMLElement, song: Song | null): void {
  target.innerHTML = '';
  const tmp = document.createElement('div');
  tmp.innerHTML = art(song);
  const thumb = tmp.firstElementChild as HTMLElement;
  target.style.background = thumb.style.background;
  target.classList.add('thumb');
  target.innerHTML = thumb.innerHTML;
}

let lastCoverId: string | null | undefined;
function renderNowPlaying(): void {
  const node = playingNode();
  const song = node?.data ?? null;
  if (lastCoverId !== (song?.id ?? null)) {
    setCover(el.cover, song);
    setCover(el.miniCover, song);
    lastCoverId = song?.id ?? null;
  }
  el.npFrom.textContent = song ? `Playing from ${lib.playing!.name}` : 'Nothing playing';
  el.npTitle.textContent = song ? song.title : 'Pick a song to start';
  el.npArtist.textContent = song ? song.artist : 'Add music from your device';
  el.miniTitle.textContent = song ? song.title : 'Nothing playing';
  el.miniArtist.textContent = song ? song.artist : 'Tandem';

  el.prevTitle.textContent = node?.prev ? node.prev.data.title : 'null';
  el.nextTitle.textContent = node?.next ? node.next.data.title : 'null';
  el.prevPeek.disabled = !node?.prev;
  el.nextPeek.disabled = !node?.next;

  const playIcon = engine.isPlaying ? icons.pause : icons.play;
  el.playBtn.innerHTML = playIcon;
  el.playBtn.setAttribute('aria-label', engine.isPlaying ? 'Pause' : 'Play');
  el.miniPlay.innerHTML = playIcon.replace(/26/g, '20');

  el.shuffleBtn.classList.toggle('toggled', lib.shuffle);
  el.shuffleBtn.setAttribute('aria-pressed', String(lib.shuffle));
  el.repeatBtn.innerHTML = lib.repeat === 'one' ? icons.repeatOne : icons.repeat;
  el.repeatBtn.classList.toggle('toggled', lib.repeat !== 'off');
  el.repeatBtn.title = `Repeat: ${lib.repeat} (R)`;
  renderVolume();
  updateProgress();
}

function renderVolume(): void {
  const pct = Math.round(engine.volume * 100);
  el.volume.value = String(engine.isMuted ? 0 : pct);
  el.volume.style.setProperty('--fill', `${engine.isMuted ? 0 : pct}%`);
  el.volPct.textContent = engine.isMuted ? 'Mute' : `${pct}%`;
  el.muteBtn.innerHTML = engine.isMuted ? icons.mute : pct < 50 ? icons.volumeLow : icons.volume;
}

function updateProgress(): void {
  const dur = engine.duration || playingNode()?.data.duration || 0;
  const cur = engine.currentTime;
  const ratio = dur ? cur / dur : 0;
  if (!seeking) {
    el.seekBar.value = String(Math.round(ratio * 1000));
    el.seekBar.style.setProperty('--fill', `${ratio * 100}%`);
    el.tCur.textContent = fmt(cur);
  }
  el.tDur.textContent = fmt(dur);
  el.miniBar.style.width = `${ratio * 100}%`;
}

function renderAll(): void {
  renderPlaylists();
  renderHeader();
  if (view === 'queue') renderQueue();
  else renderChain();
  renderNowPlaying();
}

function setView(v: 'queue' | 'chain'): void {
  view = v;
  for (const b of el.viewTabs.querySelectorAll<HTMLButtonElement>('button')) {
    const on = b.dataset.view === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  el.songList.hidden = v !== 'queue';
  el.chainView.hidden = v !== 'chain';
  renderAll();
}

// ------------------------------------------------------------------
// Rename
// ------------------------------------------------------------------
function startRename(): void {
  el.plNameInput.value = active().name;
  el.plName.hidden = true;
  el.renameBtn.hidden = true;
  el.plNameInput.hidden = false;
  el.plNameInput.focus();
  el.plNameInput.select();
}

function finishRename(save: boolean): void {
  if (el.plNameInput.hidden) return;
  const name = el.plNameInput.value.trim();
  if (save && name) {
    active().name = name;
    lib.scheduleSave();
  }
  el.plNameInput.hidden = true;
  el.plName.hidden = false;
  el.renameBtn.hidden = false;
  renderAll();
}

// ------------------------------------------------------------------
// Visualizador
// ------------------------------------------------------------------
const ctx2d = el.viz.getContext('2d');
let idlePhase = 0;
function sizeCanvas(): void {
  const r = el.viz.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.viz.width = Math.max(1, Math.round(r.width * dpr));
  el.viz.height = Math.max(1, Math.round(r.height * dpr));
}
function drawViz(): void {
  if (ctx2d) {
    const { width: w, height: h } = el.viz;
    ctx2d.clearRect(0, 0, w, h);
    const bars = 28;
    const gap = w / bars;
    const bw = gap * 0.56;
    const data = engine.isPlaying ? engine.frequencies() : null;
    idlePhase += 0.03;
    for (let i = 0; i < bars; i++) {
      let v: number;
      if (data) {
        const idx = Math.floor((i / bars) * data.length * 0.75);
        v = data[idx] / 255;
      } else {
        v = 0.08 + 0.05 * Math.sin(idlePhase + i * 0.5);
      }
      const bh = Math.max(bw, v * h);
      const x = i * gap + (gap - bw) / 2;
      ctx2d.fillStyle = i % 2 ? '#0f8f7e' : '#f4b740';
      ctx2d.globalAlpha = 0.9;
      ctx2d.beginPath();
      if (ctx2d.roundRect) ctx2d.roundRect(x, h - bh, bw, bh, bw / 2);
      else ctx2d.rect(x, h - bh, bw, bh);
      ctx2d.fill();
    }
  }
  requestAnimationFrame(drawViz);
}

// ------------------------------------------------------------------
// Media Session (controles del sistema / pantalla bloqueada)
// ------------------------------------------------------------------
function updateMediaSession(): void {
  const song = playingNode()?.data;
  if (!song || !('mediaSession' in navigator)) return;
  try {
    const url = coverUrl(song);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album || lib.playing?.name || 'Tandem',
      artwork: url ? [{ src: url, sizes: '512x512' }] : [],
    });
  } catch {
    /* no disponible */
  }
}
function setupMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  const set = (a: MediaSessionAction, fn: () => void) => {
    try {
      navigator.mediaSession.setActionHandler(a, fn);
    } catch {
      /* acción no soportada */
    }
  };
  set('play', () => void togglePlay());
  set('pause', () => engine.pause());
  set('nexttrack', () => next());
  set('previoustrack', () => previous());
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function bindEvents(): void {
  el.playBtn.onclick = el.miniPlay.onclick = () => void togglePlay();
  el.nextBtn.onclick = el.miniNext.onclick = () => next();
  el.prevBtn.onclick = el.miniPrev.onclick = () => previous();
  el.nextPeek.onclick = () => next();
  el.prevPeek.onclick = () => previous();
  el.shuffleBtn.onclick = () => {
    lib.shuffle = !lib.shuffle;
    toast(lib.shuffle ? 'Shuffle on' : 'Shuffle off');
    lib.scheduleSave();
    renderNowPlaying();
  };
  el.repeatBtn.onclick = () => {
    lib.repeat = lib.repeat === 'off' ? 'all' : lib.repeat === 'all' ? 'one' : 'off';
    toast({ off: 'Repeat off', all: 'Repeat the whole playlist', one: 'Repeat this song' }[lib.repeat]);
    lib.scheduleSave();
    renderNowPlaying();
  };

  el.playAll.onclick = () => {
    const pl = active();
    if (lib.playing === pl && pl.current) void togglePlay();
    else if (pl.songs.head) void playNode(pl, pl.songs.head);
  };

  // seek
  el.seekBar.addEventListener('input', () => {
    seeking = true;
    const ratio = Number(el.seekBar.value) / 1000;
    el.seekBar.style.setProperty('--fill', `${ratio * 100}%`);
    el.tCur.textContent = fmt(ratio * (engine.duration || 0));
  });
  el.seekBar.addEventListener('change', () => {
    engine.seek((Number(el.seekBar.value) / 1000) * engine.duration);
    seeking = false;
  });

  // volumen
  el.volume.addEventListener('input', () => {
    engine.volume = Number(el.volume.value) / 100;
    lib.volume = engine.volume;
    lib.scheduleSave();
    renderVolume();
  });
  el.muteBtn.onclick = () => {
    if (engine.volume === 0) engine.volume = 0.6;
    else engine.toggleMute();
    renderVolume();
  };
  el.speed.onchange = () => {
    engine.rate = Number(el.speed.value);
    toast(`Speed ${el.speed.value}×`);
  };

  // motor
  engine.el.addEventListener('timeupdate', updateProgress);
  engine.el.addEventListener('loadedmetadata', updateProgress);
  engine.el.addEventListener('play', () => renderAll());
  engine.el.addEventListener('pause', () => renderAll());
  engine.el.addEventListener('ended', () => {
    const pl = lib.playing;
    if (lib.repeat === 'one' && pl?.current) {
      engine.seek(0);
      void engine.play();
    } else next(true);
  });
  engine.el.addEventListener('error', () => {
    if (!engine.el.getAttribute('src')) return;
    const title = playingNode()?.data.title ?? 'This file';
    toast(`“${title}” can't be played in this browser. Skipping.`);
    window.setTimeout(() => next(true), 900);
  });

  // playlists
  el.playlistList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.pl-item');
    if (!btn) return;
    lib.active = lib.playlists.nodeAt(Number(btn.dataset.i));
    filter = '';
    el.search.value = '';
    pendingIndex = null;
    lib.scheduleSave();
    setInsertMode(insertMode === 'pick' ? 'end' : insertMode);
    renderAll();
  });
  el.newPlaylist.onclick = () => {
    lib.active = lib.createPlaylist(lib.nextPlaylistName());
    lib.scheduleSave();
    renderAll();
    startRename();
  };
  el.renameBtn.onclick = startRename;
  el.plName.ondblclick = startRename;
  el.plNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishRename(true);
    if (e.key === 'Escape') finishRename(false);
  });
  el.plNameInput.addEventListener('blur', () => finishRename(true));
  el.deletePlaylist.onclick = async () => {
    const pl = active();
    const ok = await openModal({
      title: `Delete “${pl.name}”?`,
      html: `<p>The playlist and its ${pl.songs.size} song${pl.songs.size === 1 ? '' : 's'} will be removed from Tandem. The files on your device are not touched.</p>`,
      ok: 'Delete playlist',
      danger: true,
    });
    if (!ok) return;
    if (lib.playing === pl) stopPlayback();
    lib.removePlaylist(lib.active!);
    toast('Playlist deleted');
    renderAll();
  };

  // agregar
  el.insertMode.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    const mode = b.dataset.mode as InsertMode;
    setInsertMode(mode);
    if (mode === 'pick' && active().songs.isEmpty()) toast('The playlist is empty, songs will go first');
  });
  el.addFiles.onclick = () => {
    if (insertMode === 'pick' && !active().songs.isEmpty()) {
      toast('Choose a highlighted gap first');
      el.songList.querySelector<HTMLElement>('.gap')?.focus();
      return;
    }
    pendingIndex = null;
    openPicker(false);
  };
  el.addFolder.onclick = () => {
    pendingIndex = insertMode === 'pick' ? null : pendingIndex;
    if (insertMode === 'pick' && !active().songs.isEmpty()) {
      toast('Choose a highlighted gap first');
      return;
    }
    openPicker(true);
  };
  const onPicked = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void addFiles(files, pendingIndex ?? undefined);
  };
  el.filePicker.onchange = () => onPicked(el.filePicker);
  el.folderPicker.onchange = () => onPicked(el.folderPicker);

  // lista
  el.songList.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const empty = t.closest<HTMLElement>('[data-empty]');
    if (empty) return openPicker(empty.dataset.empty === 'folder');
    const gap = t.closest<HTMLElement>('[data-gap]');
    if (gap) {
      pendingIndex = Number(gap.dataset.gap);
      openPicker(false);
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]');
    if (act) {
      const node = rowNodes[Number(act.dataset.i)];
      if (!node) return;
      const pl = active();
      if (act.dataset.act === 'del') return removeSong(node);
      if (act.dataset.act === 'next') return playNextSong(node);
      if (act.dataset.act === 'up') pl.songs.moveUp(node);
      if (act.dataset.act === 'down') pl.songs.moveDown(node);
      lib.scheduleSave();
      renderAll();
      return;
    }
    const play = t.closest<HTMLElement>('[data-play]');
    if (play) {
      const node = rowNodes[Number(play.dataset.play)];
      const pl = active();
      if (node === pl.current && lib.playing === pl) void togglePlay();
      else if (node) void playNode(pl, node);
    }
  });
  el.chainView.addEventListener('click', (e) => {
    const play = (e.target as HTMLElement).closest<HTMLElement>('[data-play]');
    if (!play) return;
    const node = rowNodes[Number(play.dataset.play)];
    if (node) void playNode(active(), node);
  });

  // arrastrar para reordenar (mueve punteros, no copia datos)
  el.songList.addEventListener('dragstart', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
    if (!row) return;
    dragNode = rowNodes[Number(row.dataset.i)];
    row.classList.add('dragging');
    e.dataTransfer?.setData('text/plain', 'tandem-row');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  el.songList.addEventListener('dragend', () => {
    dragNode = null;
    clearDropMarks();
  });
  el.songList.addEventListener('dragover', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
    if (!row) return;
    e.preventDefault();
    clearDropMarks();
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  el.songList.addEventListener('drop', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
    const gap = (e.target as HTMLElement).closest<HTMLElement>('[data-gap]');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!row && !gap) return;
    e.preventDefault();
    e.stopPropagation();
    hideOverlay();
    if (gap && files.length) {
      void addFiles(files, Number(gap.dataset.gap));
      return;
    }
    if (!row) return;
    const target = rowNodes[Number(row.dataset.i)];
    const before = row.classList.contains('drop-before');
    clearDropMarks();
    if (files.length) {
      void addFiles(files, Number(row.dataset.i) + (before ? 0 : 1));
      return;
    }
    if (dragNode && target && dragNode !== target) {
      active().songs.moveBefore(dragNode, before ? target : target.next);
      lib.scheduleSave();
      renderAll();
    }
  });

  // soltar archivos en cualquier parte de la app
  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    el.dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.dropOverlay.hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hideOverlay();
    void addFiles([...(e.dataTransfer?.files ?? [])]);
  });
  function hideOverlay() {
    dragDepth = 0;
    el.dropOverlay.hidden = true;
  }

  // herramientas
  el.sortBy.onchange = () => {
    const key = el.sortBy.value;
    el.sortBy.value = '';
    if (!key) return;
    const cmp: Record<string, (a: Song, b: Song) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
      duration: (a, b) => a.duration - b.duration,
      added: (a, b) => a.addedAt - b.addedAt,
    };
    active().songs.sort(cmp[key]);
    toast('Playlist sorted');
    lib.scheduleSave();
    renderAll();
  };
  el.reverseBtn.onclick = () => {
    active().songs.reverse();
    toast('Order reversed: head and tail swapped');
    lib.scheduleSave();
    renderAll();
  };
  el.clearBtn.onclick = async () => {
    const pl = active();
    if (pl.songs.isEmpty()) return toast('Already empty');
    const ok = await openModal({
      title: 'Clear this playlist?',
      html: `<p>All ${pl.songs.size} songs will be removed from “${esc(pl.name)}”. Your original files stay on your device.</p>`,
      ok: 'Clear playlist',
      danger: true,
    });
    if (!ok) return;
    if (lib.playing === pl) stopPlayback();
    for (const s of pl.songs.toArray()) lib.forgetSongIfUnused(s, pl);
    pl.clear();
    lib.scheduleSave();
    renderAll();
  };
  el.viewTabs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b) setView(b.dataset.view as 'queue' | 'chain');
  });
  el.search.addEventListener('input', () => {
    filter = el.search.value;
    if (view !== 'queue') setView('queue');
    else renderQueue();
  });

  $('helpBtn').onclick = () =>
    void openModal({
      title: 'Keyboard shortcuts',
      html: `<table>
        <tr><td><kbd>Space</kbd></td><td>Play / pause</td></tr>
        <tr><td><kbd>N</kbd></td><td>Next song</td></tr>
        <tr><td><kbd>P</kbd></td><td>Previous song</td></tr>
        <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Rewind / forward 5 seconds</td></tr>
        <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Volume up / down</td></tr>
        <tr><td><kbd>M</kbd></td><td>Mute</td></tr>
        <tr><td><kbd>S</kbd></td><td>Shuffle</td></tr>
        <tr><td><kbd>R</kbd></td><td>Repeat mode</td></tr>
        <tr><td><kbd>A</kbd></td><td>Add songs</td></tr>
      </table>`,
      ok: 'Got it',
      cancel: false,
    });

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input:not([type=range]), select, textarea') || t.isContentEditable) return;
    if (!el.modal.hidden) {
      if (e.key === 'Escape') el.modalCancel.click();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && !(t instanceof HTMLButtonElement)) {
      e.preventDefault();
      void togglePlay();
    } else if (k === 'n') next();
    else if (k === 'p') previous();
    else if (k === 'arrowright' && t.tagName !== 'INPUT') engine.seek(engine.currentTime + 5);
    else if (k === 'arrowleft' && t.tagName !== 'INPUT') engine.seek(engine.currentTime - 5);
    else if (k === 'arrowup' && t.tagName !== 'INPUT') {
      e.preventDefault();
      engine.volume = engine.volume + 0.05;
      lib.volume = engine.volume;
      renderVolume();
    } else if (k === 'arrowdown' && t.tagName !== 'INPUT') {
      e.preventDefault();
      engine.volume = engine.volume - 0.05;
      lib.volume = engine.volume;
      renderVolume();
    } else if (k === 'm') el.muteBtn.click();
    else if (k === 's') el.shuffleBtn.click();
    else if (k === 'r') el.repeatBtn.click();
    else if (k === 'a') el.addFiles.click();
  });

  new ResizeObserver(sizeCanvas).observe(el.viz);
}

function clearDropMarks(): void {
  for (const r of el.songList.querySelectorAll('.drop-before, .drop-after, .dragging'))
    r.classList.remove('drop-before', 'drop-after', 'dragging');
}

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
async function init(): Promise<void> {
  el.logo.innerHTML = logoSvg;
  $('searchIcon').innerHTML = icons.search;
  $('kbIcon').innerHTML = icons.keyboard;
  el.newPlaylist.innerHTML = icons.plus;
  el.renameBtn.innerHTML = icons.edit;
  el.addFiles.innerHTML = `${icons.upload} Add songs`;
  el.addFolder.innerHTML = `${icons.folder} Folder`;
  el.reverseBtn.innerHTML = `${icons.reverse} Reverse`;
  el.shuffleBtn.innerHTML = icons.shuffle;
  el.prevBtn.innerHTML = icons.prev;
  el.nextBtn.innerHTML = icons.next;
  el.miniPrev.innerHTML = icons.prev;
  el.miniNext.innerHTML = icons.next;

  await lib.load();
  engine.volume = lib.volume;
  bindEvents();
  setupMediaSession();
  setInsertMode('end');
  renderAll();
  sizeCanvas();
  requestAnimationFrame(drawViz);
}

void init();
