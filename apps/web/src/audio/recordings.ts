// "Gravar meus berros": gravações locais no IndexedDB (nunca saem do aparelho nesta fase).
const DB = 'tq-berros', STORE = 'rec';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const q = fn(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const saveBerro = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id));
export const getBerro = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deleteBerro = (id: string) => tx('readwrite', (s) => s.delete(id));
export const listBerros = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()) as Promise<string[]>;

/** Melhor mime suportado (iOS Safari => audio/mp4). */
export function pickMime(): string {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const MR = (globalThis as any).MediaRecorder;
  return opts.find((m) => MR?.isTypeSupported?.(m)) ?? 'audio/mp4';
}

export interface Recorder { stop(): Promise<{ blob: Blob; durationMs: number }>; cancel(): void; level(): number }
/** Pede o microfone SÓ quando chamado (gesto explícito do usuário). */
export async function startRecording(maxMs = 10_000, onAutoStop?: () => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
  const chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  const t0 = performance.now(); rec.start(250);
  const release = () => { stream.getTracks().forEach((t) => t.stop()); ctx.close(); clearTimeout(timer); };
  const timer = setTimeout(() => onAutoStop?.(), maxMs);
  return {
    level: () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return m / 128; },
    cancel: () => { try { rec.stop(); } catch { /* */ } release(); },
    stop: () => new Promise((res) => { rec.onstop = () => { release(); res({ blob: new Blob(chunks, { type: mime }), durationMs: Math.min(maxMs, performance.now() - t0) }); }; rec.stop(); }),
  };
}
