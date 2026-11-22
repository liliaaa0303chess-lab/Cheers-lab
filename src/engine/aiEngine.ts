import { AI_LEVELS, type AiDifficultyLevel, type PlayerSide } from '../types/chess';
import {
  applyMove,
  getAllLegalMovesForSide,
  getCurrentTurnSide,
  getPieceValue,
  isStandardChessCompatible,
  toFen,
  uciToSquare,
  type GameState,
  type LegalMove,
} from './chessEngine';
import { areSidesAllied } from './ruleParser';

let sfWorker: Worker | null = null;
let sfReady = false;

function getStockfishWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (sfWorker) return sfWorker;
  try {
    sfWorker = new Worker('/stockfish/stockfish.js');
    sfWorker.addEventListener('error', () => {
      try {
        sfWorker?.terminate();
      } catch {
        // ignore
      }
      sfWorker = null;
      sfReady = false;
    });
    sfWorker.addEventListener('messageerror', () => {
      try {
        sfWorker?.terminate();
      } catch {
        // ignore
      }
      sfWorker = null;
      sfReady = false;
    });
    sfWorker.postMessage('uci');
    sfWorker.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string' && ev.data.includes('uciok')) {
        sfReady = true;
      }
    });
    return sfWorker;
  } catch {
    sfWorker = null;
    sfReady = false;
    return null;
  }
}

async function queryStockfishMove(
  state: GameState,
  level: AiDifficultyLevel
): Promise<LegalMove | null> {
  const fen = toFen(state);
  if (!fen) return null;
  const worker = getStockfishWorker();
  if (!worker) return null;

  const cfg = AI_LEVELS.find((l) => l.level === level) || AI_LEVELS[4];
  const depth = Math.max(1, Math.min(13, Math.round(cfg.level * 1.2)));
  const movetime = Math.min(1600, 140 + cfg.level * 130);
  const inOpening = state.moveHistory.length < 14;
  const multiPv = inOpening ? (cfg.level >= 9 ? 3 : 4) : cfg.level <= 8 ? 2 : 1;

  return new Promise((resolve) => {
    const legalMoves = getAllLegalMovesForSide(state, getCurrentTurnSide(state), false);
    if (legalMoves.length === 0) {
      resolve(null);
      return;
    }

    const matchUciToLegal = (uci: string): LegalMove | undefined => {
      if (!uci || uci === '(none)' || uci.length < 4) return undefined;
      const from = uciToSquare(uci.slice(0, 2), 8, 8);
      const to = uciToSquare(uci.slice(2, 4), 8, 8);
      const promoChar = uci[4]?.toUpperCase();
      const promoMap: Record<string, string> = {
        Q: 'builtin:Q',
        R: 'builtin:R',
        B: 'builtin:B',
        N: 'builtin:N',
      };
      return (
        legalMoves.find(
          (m) => m.from === from && m.to === to && (!promoChar || m.promotionPieceId === promoMap[promoChar])
        ) || legalMoves.find((m) => m.from === from && m.to === to)
      );
    };

    const pvLines = new Map<number, { uci: string; cp: number }>();
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, movetime + 1800);

    const onMsg = (ev: MessageEvent<string>) => {
      const line = String(ev.data || '');
      if (line.startsWith('info') && line.includes(' pv ')) {
        const mpvMatch = line.match(/\bmultipv\s+(\d+)/);
        const mpvIdx = mpvMatch ? Number(mpvMatch[1]) : 1;
        const cpMatch = line.match(/\bscore cp\s+(-?\d+)/);
        const mateMatch = line.match(/\bscore mate\s+(-?\d+)/);
        const pvMatch = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
        if (pvMatch) {
          let cp = cpMatch ? Number(cpMatch[1]) : 0;
          if (mateMatch) {
            const m = Number(mateMatch[1]);
            cp = m > 0 ? 30000 - m * 10 : -30000 - m * 10;
          }
          pvLines.set(mpvIdx, { uci: pvMatch[1], cp });
        }
      } else if (line.startsWith('bestmove')) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMsg);

        const parts = line.split(/\s+/);
        const bestUci = parts[1];

        // Pick among close top candidate lines in openings & mid-level play so AI varies its openings
        const candidates = Array.from(pvLines.values())
          .map((item) => ({ move: matchUciToLegal(item.uci), cp: item.cp }))
          .filter((x): x is { move: LegalMove; cp: number } => Boolean(x.move))
          .sort((a, b) => b.cp - a.cp);

        if (candidates.length > 1) {
          const bestCp = candidates[0].cp;
          const tolerance = inOpening
            ? cfg.level <= 3
              ? 140
              : cfg.level <= 6
                ? 85
                : cfg.level <= 8
                  ? 55
                  : 32
            : cfg.level <= 4
              ? 75
              : cfg.level <= 8
                ? 25
                : 0;
          const pool = candidates.filter((c) => c.cp >= bestCp - tolerance);
          if (pool.length > 1) {
            const chosen = pool[Math.floor(Math.random() * pool.length)];
            resolve(chosen.move);
            return;
          }
        }

        const matched = matchUciToLegal(bestUci);
        resolve(matched || null);
      }
    };

    worker.addEventListener('message', onMsg);
    try {
      if (!sfReady) {
        worker.postMessage('uci');
      }
      worker.postMessage(`setoption name Skill Level value ${cfg.stockfishSkill}`);
      worker.postMessage(`setoption name MultiPV value ${multiPv}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth} movetime ${movetime}`);
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMsg);
        resolve(null);
      }
    }
  });
}

function evaluateState(state: GameState, perspective: PlayerSide): number {
  const rules = state.compiledRules;
  if (state.winner === 'draw') return 0;
  if (state.winner) {
    return areSidesAllied(rules, state.winner, perspective) ? 100000 : -100000;
  }

  let score = 0;
  const rows = state.board.rows;
  const cols = state.board.cols;
  const centerR = (rows - 1) / 2;
  const centerC = (cols - 1) / 2;
  const isReverse = Boolean(rules?.reverseWin);

  for (const [idxStr, p] of Object.entries(state.pieces)) {
    const idx = Number(idxStr);
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const baseVal = getPieceValue(p.pieceId, state.customPieceMap);
    const centerBonus =
      Math.max(0, 4 - (Math.abs(r - centerR) + Math.abs(c - centerC))) * 6;
    const shieldBonus = p.shielded ? 80 : 0;
    const specialBonus = state.board.special?.includes(idx)
      ? rules?.specialProtected
        ? 60
        : 25
      : 0;
    const total = baseVal + centerBonus + shieldBonus + specialBonus;
    const allied = areSidesAllied(rules, p.side, perspective);

    if (isReverse) {
      // In Qui-perd-gagne (Antichess), having FEWER/weaker pieces is better
      if (allied) score -= total;
      else score += total;
    } else {
      if (allied) score += total;
      else score -= total;
    }
  }

  // Victory-progress heuristics
  if (state.variant.victoryType === 'capture_count' || (rules?.captureTargetOverride || 0) > 0) {
    for (const s of state.activeSides) {
      const capScore = (state.capturesCount[s] || 0) * 180;
      if (areSidesAllied(rules, s, perspective)) score += capScore;
      else score -= capScore;
    }
  }

  if (rules?.checksTarget && rules.checksTarget > 0) {
    for (const s of state.activeSides) {
      const chkScore = (state.checksDelivered?.[s] || 0) * 220;
      if (areSidesAllied(rules, s, perspective)) score += chkScore;
      else score -= chkScore;
    }
  }

  // Slight bonus for checking enemy (or penalty when allied side is in check)
  if (!rules?.noCheckRestriction) {
    for (const s of state.inCheckSides) {
      if (!areSidesAllied(rules, s, perspective)) score += 45;
      else score -= 50;
    }
  }

  return score;
}

function scoreMoveOrdering(state: GameState, move: LegalMove): number {
  let s = 0;
  if (move.captureIndex !== undefined && state.pieces[move.captureIndex]) {
    const victim = state.pieces[move.captureIndex];
    const attacker = state.pieces[move.from];
    s +=
      10 * getPieceValue(victim.pieceId, state.customPieceMap) -
      (attacker ? getPieceValue(attacker.pieceId, state.customPieceMap) : 0);
  }
  if (move.promotionPieceId) s += 800;
  if (state.board.special?.includes(move.to)) s += 90;
  if (move.isPower) s += 40;
  return s;
}

function alphabetaTeam(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rootSide: PlayerSide,
  deadline: number
): number {
  if (state.winner || depth <= 0 || Date.now() > deadline) {
    return evaluateState(state, rootSide);
  }

  const turnSide = getCurrentTurnSide(state);
  const moves = getAllLegalMovesForSide(state, turnSide, true)
    .sort((a, b) => scoreMoveOrdering(state, b) - scoreMoveOrdering(state, a))
    .slice(0, 32);

  if (moves.length === 0) {
    return evaluateState(state, rootSide);
  }

  const maximizing = areSidesAllied(state.compiledRules, turnSide, rootSide);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMove(state, m);
      const val = alphabetaTeam(next, depth - 1, alpha, beta, rootSide, deadline);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
      if (Date.now() > deadline) break;
    }
    return best;
  }

  let best = Infinity;
  for (const m of moves) {
    const next = applyMove(state, m);
    const val = alphabetaTeam(next, depth - 1, alpha, beta, rootSide, deadline);
    if (val < best) best = val;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
    if (Date.now() > deadline) break;
  }
  return best;
}

function computeVariantAiMove(state: GameState, level: AiDifficultyLevel): LegalMove | null {
  const side = getCurrentTurnSide(state);
  const moves = getAllLegalMovesForSide(state, side, true);
  if (moves.length === 0) return null;

  // Low levels add controlled randomness / beginner blunders
  if (level === 1) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Shuffle moves slightly before sorting captures/specials so equal-priority moves vary between games
  const shuffled = [...moves];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sorted = shuffled.sort((a, b) => scoreMoveOrdering(state, b) - scoreMoveOrdering(state, a));
  const cfg = AI_LEVELS.find((l) => l.level === level) || AI_LEVELS[4];
  const searchDepth = level <= 2 ? 1 : level <= 5 ? 2 : level <= 8 ? 3 : 4;
  const maxTimeMs = level === 10 ? 1500 : 120 + level * 100;
  const deadline = Date.now() + maxTimeMs;

  const candidateLimit = level >= 8 ? 40 : 28;
  const candidates = sorted.slice(0, candidateLimit);
  const inOpening = state.moveHistory.length < 12;

  const scored: { move: LegalMove; score: number }[] = [];
  for (const m of candidates) {
    const next = applyMove(state, m);
    const val =
      searchDepth <= 1
        ? evaluateState(next, side)
        : alphabetaTeam(next, searchDepth - 1, -Infinity, Infinity, side, deadline);
    const jitterAmplitude = inOpening
      ? cfg.level <= 4
        ? 45
        : cfg.level <= 7
          ? 28
          : 14
      : cfg.level <= 5
        ? 18
        : 6;
    const jitter = (Math.random() - 0.5) * jitterAmplitude;
    scored.push({ move: m, score: val + jitter });
    if (Date.now() > deadline) break;
  }

  scored.sort((a, b) => b.score - a.score);

  if (level <= 4 && scored.length > 1) {
    const poolSize = Math.min(scored.length, Math.max(2, 6 - level));
    return scored[Math.floor(Math.random() * poolSize)].move;
  }

  const tolerance = inOpening
    ? cfg.level >= 9
      ? 18
      : 34
    : cfg.level >= 9
      ? 6
      : 20;
  const bestScore = scored[0].score;
  const tied = scored.filter((s) => s.score >= bestScore - tolerance);
  return tied[Math.floor(Math.random() * tied.length)].move;
}

export async function chooseBestAiMove(
  state: GameState,
  level: AiDifficultyLevel
): Promise<{ move: LegalMove | null; engineUsed: 'stockfish' | 'variant' }> {
  if (isStandardChessCompatible(state.variant)) {
    const sfMove = await queryStockfishMove(state, level);
    if (sfMove) {
      return { move: sfMove, engineUsed: 'stockfish' };
    }
  }
  const variantMove = computeVariantAiMove(state, level);
  return { move: variantMove, engineUsed: 'variant' };
}
