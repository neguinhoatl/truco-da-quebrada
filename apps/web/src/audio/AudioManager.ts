// Gerenciador de áudio (Web Audio): barramentos independentes + sons sintetizados.
import type { Berro } from '@truco/engine';
import { getBerro } from './recordings';
export type Bus = 'effects' | 'voices' | 'ambient' | 'clips';
export interface AudioSettings { effects: number; voices: number; ambient: number; clips: number; muteAll: boolean; privacy: boolean }
const DEFAULTS: AudioSettings = { effects: 0.8, voices: 0.9, ambient: 0.25, clips: 0.9, muteAll: false, privacy: false };

class AudioManager {
  ctx?: AudioContext; master?: GainNode; buses = {} as Record<Bus, GainNode>;
  settings: AudioSettings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('tq:audio') ?? '{}') };
  private fileCache = new Map<string, AudioBuffer | null>();
  private ambientNode?: AudioBufferSourceNode;
  mutedPlayers = new Set<string>(JSON.parse(localStorage.getItem('tq:mutedClips') ?? '[]'));

  /** iOS/Safari: precisa ser chamado num toque do usuário. */
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext ?? (window as any).webkitAudioContext; this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      for (const b of ['effects', 'voices', 'ambient', 'clips'] as Bus[]) { const g = this.ctx.createGain(); g.connect(this.master); this.buses[b] = g; }
      this.apply();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const o = this.ctx.createBufferSource(); o.buffer = this.ctx.createBuffer(1, 1, 22050); o.connect(this.ctx.destination); o.start();
  }
  set(p: Partial<AudioSettings>) { this.settings = { ...this.settings, ...p }; localStorage.setItem('tq:audio', JSON.stringify(this.settings)); this.apply(); }
  private apply() {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(s.muteAll ? 0 : 1, t, 0.02);
    this.buses.effects.gain.setTargetAtTime(s.privacy ? 0 : s.effects, t, 0.02);
    this.buses.voices.gain.setTargetAtTime(s.privacy ? 0 : s.voices, t, 0.02);
    this.buses.ambient.gain.setTargetAtTime(s.privacy ? 0 : s.ambient, t, 0.02);
    this.buses.clips.gain.setTargetAtTime(s.privacy ? 0 : s.clips, t, 0.02);
  }
  private get ready() { return !!this.ctx && !this.settings.muteAll; }
  private noise(dur: number) { const b = this.ctx!.createBuffer(1, Math.ceil(this.ctx!.sampleRate * dur), this.ctx!.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

  /** Tapa da carta na mesa: ruído filtrado com ataque rápido. */
  cardSlap() {
    if (!this.ready) return; const c = this.ctx!, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise(0.12);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 600; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    n.connect(f).connect(g).connect(this.buses.effects); n.start(t);
  }
  /** Soco na mesa de metal/plástico. */
  tableKnock(times = 1) {
    if (!this.ready) return; const c = this.ctx!;
    for (let i = 0; i < times; i++) {
      const t = c.currentTime + i * 0.13, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
      g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(this.buses.effects); o.start(t); o.stop(t + 0.22);
      const n = c.createBufferSource(); n.buffer = this.noise(0.05); const ng = c.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(ng).connect(this.buses.effects); n.start(t);
    }
  }
  /** Stinger sintetizado (sem voz falsa) quando não há gravação. kind: truco = impacto grave + subida. */
  stinger(kind: 'truco' | 'win' | 'run' | 'tease' = 'truco') {
    if (!this.ready) return; const c = this.ctx!, t = c.currentTime;
    this.tableKnock(kind === 'truco' ? 2 : 1);
    const notes = kind === 'win' ? [392, 523, 659] : kind === 'run' ? [440, 330, 220] : kind === 'tease' ? [523, 466] : [196, 294, 392];
    notes.forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(), st = t + 0.08 + i * 0.09;
      o.type = kind === 'run' ? 'triangle' : 'sawtooth'; o.frequency.value = fr;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.25, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + 0.28);
      o.connect(lp).connect(g).connect(this.buses.effects); o.start(st); o.stop(st + 0.3);
    });
  }
  /** Ambiente de boteco discreto: ruído rosa filtrado bem baixo (burburinho). */
  ambient(on: boolean) {
    if (!this.ctx) return;
    if (!on) { this.ambientNode?.stop(); this.ambientNode = undefined; return; }
    if (this.ambientNode) return;
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), d = b.getChannelData(0);
    let l = 0; for (let i = 0; i < d.length; i++) { l = 0.97 * l + 0.03 * (Math.random() * 2 - 1); d[i] = l * 3; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.5;
    s.connect(f).connect(this.buses.ambient); s.start(); this.ambientNode = s;
  }
  private async decode(blob: Blob) { return this.ctx!.decodeAudioData(await blob.arrayBuffer()); }
  private play(buf: AudioBuffer, bus: Bus) { const s = this.ctx!.createBufferSource(); s.buffer = buf; s.connect(this.buses[bus]); s.start(); return s; }
  /** Berro: 1) gravação do próprio jogador (IndexedDB) 2) arquivo em /audio/<categoria>/ 3) stinger sintetizado. */
  async berro(b: Berro, opts: { mine?: boolean } = {}): Promise<'recording' | 'file' | 'stinger' | 'muted'> {
    if (!this.ready || this.settings.privacy) return 'muted';
    if (opts.mine) { const rec = await getBerro(b.id).catch(() => undefined); if (rec) { this.play(await this.decode(rec), 'voices'); return 'recording'; } }
    if (!this.fileCache.has(b.audio)) {
      try { const r = await fetch(b.audio); this.fileCache.set(b.audio, r.ok && (r.headers.get('content-type') ?? '').startsWith('audio') ? await this.ctx!.decodeAudioData(await r.arrayBuffer()) : null); }
      catch { this.fileCache.set(b.audio, null); }
    }
    const f = this.fileCache.get(b.audio); if (f) { this.play(f, 'voices'); return 'file'; }
    this.stinger(b.category === 'chamadas' || b.category === 'especiais' ? 'truco' : b.category === 'comemoracoes' ? 'win' : b.category === 'derrota' ? 'run' : 'tease');
    return 'stinger';
  }
  /** Áudio de zoeira recebido de outro jogador. */
  async clip(fromId: string, blob: Blob) {
    if (!this.ready || this.settings.privacy || this.mutedPlayers.has(fromId)) return false;
    this.play(await this.decode(blob), 'clips'); return true;
  }
  toggleMutePlayer(id: string) { this.mutedPlayers.has(id) ? this.mutedPlayers.delete(id) : this.mutedPlayers.add(id); localStorage.setItem('tq:mutedClips', JSON.stringify([...this.mutedPlayers])); }
}
export const audio = new AudioManager();
