// Biblioteca de berros/zoeira — pura, disparada por eventos reais do motor.
import { GameState, Card, teamOf, Team, cardStrength } from './index';

export type BerroCategory = 'chamadas' | 'provocacoes' | 'comemoracoes' | 'derrota' | 'especiais';
export type ZoeiraEvent =
  | { type: 'truco_call'; seat: number; value: number }
  | { type: 'pending'; seat: number; value: number } // provocação de quem pediu enquanto o outro decide
  | { type: 'accept'; seat: number; value: number }
  | { type: 'run'; seat: number; callerTeam: Team }
  | { type: 'round_win'; seat: number; card: Card; zap: boolean; manilha: boolean }
  | { type: 'hand_win'; team: Team; points: number }
  | { type: 'match_win'; team: Team }
  | { type: 'mao_de_onze'; team: Team }
  | { type: 'mao_de_ferro' };

export interface Berro { id: string; text: string; category: BerroCategory; audio: string }
const B = (id: string, text: string, category: BerroCategory): Berro => ({ id, text, category, audio: `/audio/${category}/${id}.mp3` });
export const BERROS: Berro[] = [
  B('truco', 'TRUCO, SEU LADRÃO!', 'chamadas'), B('truco2', 'TRUCO!', 'chamadas'), B('seis', 'SEIS!', 'chamadas'),
  B('nove', 'NOVE!', 'chamadas'), B('doze', 'DOZE!', 'chamadas'), B('desce', 'DESCE!', 'chamadas'),
  B('aceita_ou_corre', 'ACEITA OU CORRE?', 'provocacoes'), B('vai_correr', 'VAI CORRER?', 'provocacoes'),
  B('ta_com_medo', 'TÁ COM MEDO?', 'provocacoes'), B('pato', 'PATO!', 'provocacoes'), B('correu', 'CORREU!', 'provocacoes'),
  B('zap_na_cara', 'TOMA ESSE ZAP NA CARA!', 'comemoracoes'), B('chupa', 'CHUPA ESSA!', 'comemoracoes'),
  B('na_testa', 'NA TESTA!', 'comemoracoes'), B('boa_parceiro', 'BOA, PARCEIRO!', 'comemoracoes'),
  B('na_raca', 'AQUI É NA RAÇA!', 'comemoracoes'), B('ganhamo', 'GANHAMO, RAPAZIADA!', 'comemoracoes'),
  B('mao_de_ferro', 'MÃO DE FERRO!', 'especiais'), B('mao_de_onze', 'MÃO DE ONZE, SEGURA!', 'especiais'),
  B('roubado', 'TÁ ROUBADO ISSO AÍ!', 'derrota'), B('proxima', 'A PRÓXIMA É NOSSA!', 'derrota'), B('baralho_ruim', 'QUE BARALHO RUIM, MANO!', 'derrota'),
];
const byId = (id: string) => BERROS.find((b) => b.id === id)!;
export const CALL_BERRO: Record<number, string[]> = { 3: ['truco', 'truco2'], 4: ['truco', 'truco2'], 6: ['seis'], 8: ['desce'], 9: ['nove'], 10: ['desce'], 12: ['doze'] };
export const CALL_LABEL = (v: number, variant: 'paulista' | 'mineiro') => v === 12 ? 'DOZE!' : v === 9 ? 'NOVE!' : v === 6 ? 'SEIS!' : (variant === 'paulista' ? v === 3 : v === 4) ? 'TRUCO!' : `${v}!`;

export const isZap = (c: Card, s: Pick<GameState, 'rules' | 'manilhaRank'>) =>
  c.suit === 'paus' && (s.rules.variant === 'mineiro' ? c.rank === '4' : c.rank === s.manilhaRank);

/** Converte a diferença de estado do motor em eventos de zoeira. */
export function deriveEvents(prev: GameState, next: GameState): ZoeiraEvent[] {
  const ev: ZoeiraEvent[] = [];
  const fresh = next.history.slice(prev.history.length);
  for (const h of fresh) {
    if ((h.type === 'truco' || h.type === 'raise') && h.seat !== undefined) {
      const v = Number(/pede (\d+)/.exec(h.detail ?? '')?.[1]);
      ev.push({ type: 'truco_call', seat: h.seat, value: v });
    } else if (h.type === 'accept' && h.seat !== undefined) ev.push({ type: 'accept', seat: h.seat, value: next.value });
    else if ((h.type === 'run' || h.type === 'onze_run') && h.seat !== undefined) ev.push({ type: 'run', seat: h.seat, callerTeam: (1 - teamOf(h.seat)) as Team });
    else if (h.type === 'round_end' && h.team !== undefined && h.seat !== undefined && h.card) {
      ev.push({ type: 'round_win', seat: h.seat, card: h.card, zap: isZap(h.card, prev), manilha: cardStrength(h.card, prev.rules.variant, prev.manilhaRank) >= 100 });
    } else if (h.type === 'hand_end' && h.team !== undefined) ev.push({ type: 'hand_win', team: h.team, points: next.lastHand?.points ?? 0 });
    else if (h.type === 'match_end' && h.team !== undefined) ev.push({ type: 'match_win', team: h.team });
    else if (h.type === 'hand_start') {
      if (next.mode === 'ferro') ev.push({ type: 'mao_de_ferro' });
      else if (next.mode === 'onze' && next.onzeTeam !== null) ev.push({ type: 'mao_de_onze', team: next.onzeTeam });
    }
  }
  return ev;
}
export interface Shout { berro: Berro; seat: number | null; event: ZoeiraEvent['type'] }
export interface DirectorOptions { globalGapMs?: number; noRepeatWindow?: number; categoryCooldownMs?: Partial<Record<BerroCategory, number>>; rng?: () => number }

/** Diretor de zoeira: decide QUANDO e QUAL berro sai. Anti-spam e anti-repetição. */
export class ZoeiraDirector {
  private last = -Infinity;
  private recent: string[] = [];
  private catLast: Partial<Record<BerroCategory, number>> = {};
  private o: Required<Omit<DirectorOptions, 'categoryCooldownMs'>> & { categoryCooldownMs: Partial<Record<BerroCategory, number>> };
  constructor(opts: DirectorOptions = {}) {
    this.o = { globalGapMs: opts.globalGapMs ?? 2500, noRepeatWindow: opts.noRepeatWindow ?? 3, rng: opts.rng ?? Math.random,
      categoryCooldownMs: { provocacoes: 8000, comemoracoes: 4000, derrota: 12000, especiais: 0, chamadas: 0, ...opts.categoryCooldownMs } };
  }
  private choose(ids: string[], now: number, essential: boolean, seat: number | null, event: ZoeiraEvent['type']): Shout | null {
    const cand = ids.map(byId);
    const cat = cand[0].category;
    if (!essential) {
      if (now - this.last < this.o.globalGapMs) return null;
      if (now - (this.catLast[cat] ?? -Infinity) < (this.o.categoryCooldownMs[cat] ?? 0)) return null;
    }
    const fresh = cand.filter((b) => !this.recent.includes(b.id));
    const pool = fresh.length ? fresh : essential ? cand : [];
    if (!pool.length) return null;
    const berro = pool[Math.floor(this.o.rng() * pool.length)];
    this.last = now; this.catLast[cat] = now;
    this.recent = [...this.recent, berro.id].slice(-this.o.noRepeatWindow);
    return { berro, seat, event };
  }
  /** Retorna no máximo UM berro por evento (ou nenhum). */
  react(e: ZoeiraEvent, now: number): Shout | null {
    switch (e.type) {
      case 'truco_call': return this.choose(CALL_BERRO[e.value] ?? ['truco2'], now, true, e.seat, e.type); // chamada sempre sai
      case 'pending': return this.choose(['aceita_ou_corre', 'vai_correr', 'ta_com_medo'], now, false, e.seat, e.type);
      case 'run': return this.choose(['pato', 'correu'], now, false, null, e.type);
      case 'round_win': return e.zap ? this.choose(['zap_na_cara'], now, false, e.seat, e.type)
        : e.manilha ? this.choose(['na_testa', 'chupa'], now, false, e.seat, e.type) : null; // rodada comum: silêncio
      case 'hand_win': return e.points >= 3 ? this.choose(['chupa', 'na_raca', 'boa_parceiro'], now, false, null, e.type) : null;
      case 'match_win': return this.choose(['ganhamo'], now, true, null, e.type);
      case 'mao_de_ferro': return this.choose(['mao_de_ferro'], now, true, null, e.type);
      case 'mao_de_onze': return this.choose(['mao_de_onze'], now, false, null, e.type);
      case 'accept': return null;
    }
  }
  /** Reação de derrota do time perdedor (opcional, bem espaçada). */
  defeat(now: number): Shout | null { return this.choose(['roubado', 'proxima', 'baralho_ruim'], now, false, null, 'match_win'); }
}
