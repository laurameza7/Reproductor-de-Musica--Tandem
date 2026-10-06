/**
 * Motor de audio: envuelve un <audio> real del navegador y, al primer play,
 * lo conecta a Web Audio (analizador para el visualizador + ganancia para el volumen).
 */
export class AudioEngine {
  readonly el: HTMLAudioElement = new Audio();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private vol = 0.8;
  private muted = false;

  constructor() {
    this.el.preload = 'auto';
    this.applyVolume();
  }

  private ensureGraph(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const source = ctx.createMediaElementSource(this.el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      const gain = ctx.createGain();
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
      this.gain = gain;
      this.freq = new Uint8Array(analyser.frequencyBinCount);
      this.applyVolume();
    } catch {
      /* sin Web Audio: se reproduce igual, solo sin visualizador */
    }
  }

  load(url: string): void {
    this.el.src = url;
  }

  async play(): Promise<boolean> {
    this.ensureGraph();
    try {
      await this.el.play();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    this.el.pause();
  }

  stop(): void {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  get isPlaying(): boolean {
    return !this.el.paused && !this.el.ended;
  }

  get currentTime(): number {
    return this.el.currentTime || 0;
  }

  get duration(): number {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  seek(seconds: number): void {
    if (!this.duration) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration, seconds));
  }

  get volume(): number {
    return this.vol;
  }

  set volume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.vol > 0) this.muted = false;
    this.applyVolume();
  }

  get isMuted(): boolean {
    return this.muted || this.vol === 0;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyVolume();
  }

  set rate(r: number) {
    this.el.playbackRate = r;
  }

  frequencies(): Uint8Array | null {
    if (!this.analyser || !this.freq) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }

  private applyVolume(): void {
    const v = this.muted ? 0 : this.vol;
    if (this.gain) {
      this.el.volume = 1;
      this.gain.gain.value = v;
    } else {
      this.el.volume = v;
    }
  }
}
