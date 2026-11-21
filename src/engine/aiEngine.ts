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

let sfWorker: Worker | null = null;
let sfReady = false;

function getStockfishWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (sfWorker) return sfWorker;
  try {
    sfWorker = new Worker('/stockfish/stockfish.js');
    sfWorker.postMessage('uci');
    sfWorker.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string' && ev.data.includes('uciok')) {
        sfReady = true;
      }
    });
    return sfWorker;
  } catch {
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
  const depth = Math.max(1, Math.min(14, Math.round(cfg.level * 1.3)));
  const movetime = Math.min(1800, 120 + cfg.level * 150);

  return new Promise((resolve) => {
    const legalMoves = getAllLegalMovesForSide(state, getCurrentTurnSide(state), false);
    if (legalMoves.length === 0) {
      resolve(null);
      return;
    }

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
      if (line.startsWith('bestmove')) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMsg);

        const parts = line.split(/\s+/);
        const uci = parts[1];
        if (!uci || uci === '(none)') {
          resolve(null);
          return;
        }
        const from = uciToSquare(uci.slice(0, 2), 8, 8);
        const to = uciToSquare(uci.slice(2, 4), 8, 8);
        const promoChar = uci[4]?.toUpperCase();
        const promoMap: Record<string, string> = {
          Q: 'builtin:Q',
          R: 'builtin:R',
          B: 'builtin:B',
          N: 'builtin:N',
        };
        const matched = legalMoves.find(
          (m) => m.from === from && m.to === to && (!promoChar || m.promotionPieceId === promoMap[promoChar])
        ) || legalMoves.find((m) => m.from === from && m.to === to);

        resolve(matched || null);
      }
    };

    worker.addEventListener('message', onMsg);
    if (!sfReady) {
      worker.postMessage('uci');
    }
    worker.postMessage(`setoption name Skill Level value ${cfg.stockfishSkill}`);
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth} movetime ${movetime}`);
  });
}

function evaluateState(state: GameState, perspective: PlayerSide): number {
  if (state.winner === perspective) return 100000;
  if (state.winner && state.winner !== 'draw') return -100000;
  if (state.winner === 'draw') return 0;

  const rules = state.compiledRules;
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

    if (isReverse) {
      // In Qui-perd-gagne (Antichess), having FEWER/weaker pieces is better
      if (p.side === perspective) score -= total;
      else score += total;
    } else {
      if (p.side === perspective) score += total;
      else score -= total;
    }
  }

  // Victory-progress heuristics
  if (state.variant.victoryType === 'capture_count') {
    for (const s of state.activeSides) {
      const capScore = (state.capturesCount[s] || 0) * 180;
      if (s === perspective) score += capScore;
      else score -= capScore;
    }
  }

  if (rules?.checksTarget && rules.checksTarget > 0) {
    for (const s of state.activeSides) {
      const chkScore = (state.checksDelivered?.[s] || 0) * 220;
      if (s === perspective) score += chkScore;
      else score -= chkScore;
    }
  }

  // Slight bonus for checking enemy
  if (!rules?.noCheckRestriction) {
    for (const s of state.inCheckSides) {
      if (s !== perspective) score += 45;
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

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  perspective: PlayerSide,
  deadline: number
): number {
  if (state.winner || depth <= 0 || Date.now() > deadline) {
    return evaluateState(state, perspective) * (getCurrentTurnSide(state) === perspective ? 1 : -1);
  }

  const side = getCurrentTurnSide(state);
  const moves = getAllLegalMovesForSide(state, side, true)
    .sort((a, b) => scoreMoveOrdering(state, b) - scoreMoveOrdering(state, a))
    .slice(0, 32);

  if (moves.length === 0) {
    return evaluateState(state, perspective) * (side === perspective ? 1 : -1);
  }

  let best = -Infinity;
  for (const m of moves) {
    const next = applyMove(state, m);
    const sameSide = getCurrentTurnSide(next) === side;
    const val = sameSide
      ? negamax(next, depth - 1, alpha, beta, perspective, deadline)
      : -negamax(next, depth - 1, -beta, -alpha, perspective, deadline);
    if (val > best) best = val;
    if (best > alpha) alpha = best;
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

  const sorted = [...moves].sort((a, b) => scoreMoveOrdering(state, b) - scoreMoveOrdering(state, a));
  const cfg = AI_LEVELS.find((l) => l.level === level) || AI_LEVELS[4];
  const searchDepth = level <= 2 ? 1 : level <= 5 ? 2 : level <= 8 ? 3 : 4;
  const maxTimeMs = level === 10 ? 1500 : 120 + level * 100;
  const deadline = Date.now() + maxTimeMs;

  const candidateLimit = level >= 8 ? 40 : 24;
  const candidates = sorted.slice(0, candidateLimit);

  const scored: { move: LegalMove; score: number }[] = [];
  for (const m of candidates) {
    const next = applyMove(state, m);
    const sameSide = getCurrentTurnSide(next) === side;
    const val =
      searchDepth <= 1
        ? evaluateState(next, side)
        : sameSide
          ? negamax(next, searchDepth - 1, -Infinity, Infinity, side, deadline)
          : -negamax(next, searchDepth - 1, -Infinity, Infinity, side, deadline);
    scored.push({ move: m, score: val });
    if (Date.now() > deadline) break;
  }

  scored.sort((a, b) => b.score - a.score);

  if (level <= 4 && scored.length > 1) {
    const poolSize = Math.min(scored.length, Math.max(2, 6 - level));
    return scored[Math.floor(Math.random() * poolSize)].move;
  }

  // Slight tie-breaker among equal top scores
  const bestScore = scored[0].score;
  const tied = scored.filter((s) => s.score >= bestScore - (cfg.level >= 9 ? 0 : 15));
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
