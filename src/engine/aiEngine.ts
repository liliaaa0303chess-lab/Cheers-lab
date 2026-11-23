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

interface AiProfileTuning {
  sfDepth: number;
  sfSkill: number;
  sfMoveTime: number;
  sfMultiPv: number;
  sfToleranceCp: number;
  sfOpeningToleranceCp: number;
  sfTempCp: number;
  sfBlunderRate: number;
  sfBlunderCapCp: number;
  sfAvoidBestChance: number;
  varDepth: number;
  varMoveTime: number;
  varRandomChance: number;
  varJitter: number;
  varTolerance: number;
  varTemp: number;
}

function getAiTuning(level: AiDifficultyLevel): AiProfileTuning {
  switch (level) {
    case 1:
      return {
        sfDepth: 1, sfSkill: 0, sfMoveTime: 90, sfMultiPv: 12,
        sfToleranceCp: 420, sfOpeningToleranceCp: 460, sfTempCp: 240,
        sfBlunderRate: 0.45, sfBlunderCapCp: 620, sfAvoidBestChance: 0.65,
        varDepth: 1, varMoveTime: 140, varRandomChance: 0.55, varJitter: 230, varTolerance: 360, varTemp: 210,
      };
    case 2:
      return {
        sfDepth: 1, sfSkill: 0, sfMoveTime: 110, sfMultiPv: 12,
        sfToleranceCp: 280, sfOpeningToleranceCp: 320, sfTempCp: 165,
        sfBlunderRate: 0.30, sfBlunderCapCp: 450, sfAvoidBestChance: 0.50,
        varDepth: 1, varMoveTime: 170, varRandomChance: 0.32, varJitter: 170, varTolerance: 260, varTemp: 150,
      };
    case 3:
      return {
        sfDepth: 1, sfSkill: 1, sfMoveTime: 140, sfMultiPv: 10,
        sfToleranceCp: 200, sfOpeningToleranceCp: 240, sfTempCp: 115,
        sfBlunderRate: 0.18, sfBlunderCapCp: 320, sfAvoidBestChance: 0.35,
        varDepth: 1, varMoveTime: 220, varRandomChance: 0.16, varJitter: 120, varTolerance: 185, varTemp: 105,
      };
    case 4:
      return {
        sfDepth: 1, sfSkill: 2, sfMoveTime: 180, sfMultiPv: 9,
        sfToleranceCp: 150, sfOpeningToleranceCp: 185, sfTempCp: 85,
        sfBlunderRate: 0.10, sfBlunderCapCp: 240, sfAvoidBestChance: 0.22,
        varDepth: 2, varMoveTime: 280, varRandomChance: 0.08, varJitter: 85, varTolerance: 135, varTemp: 80,
      };
    case 5:
      return {
        sfDepth: 2, sfSkill: 3, sfMoveTime: 240, sfMultiPv: 8,
        sfToleranceCp: 115, sfOpeningToleranceCp: 145, sfTempCp: 62,
        sfBlunderRate: 0.05, sfBlunderCapCp: 180, sfAvoidBestChance: 0.12,
        varDepth: 2, varMoveTime: 360, varRandomChance: 0, varJitter: 55, varTolerance: 95, varTemp: 55,
      };
    case 6:
      return {
        sfDepth: 2, sfSkill: 5, sfMoveTime: 320, sfMultiPv: 7,
        sfToleranceCp: 85, sfOpeningToleranceCp: 110, sfTempCp: 44,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 2, varMoveTime: 460, varRandomChance: 0, varJitter: 36, varTolerance: 68, varTemp: 40,
      };
    case 7:
      return {
        sfDepth: 3, sfSkill: 7, sfMoveTime: 420, sfMultiPv: 5,
        sfToleranceCp: 60, sfOpeningToleranceCp: 82, sfTempCp: 30,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 3, varMoveTime: 600, varRandomChance: 0, varJitter: 22, varTolerance: 46, varTemp: 28,
      };
    case 8:
      return {
        sfDepth: 3, sfSkill: 9, sfMoveTime: 540, sfMultiPv: 4,
        sfToleranceCp: 38, sfOpeningToleranceCp: 58, sfTempCp: 20,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 3, varMoveTime: 780, varRandomChance: 0, varJitter: 14, varTolerance: 30, varTemp: 18,
      };
    case 9:
      return {
        sfDepth: 4, sfSkill: 11, sfMoveTime: 700, sfMultiPv: 3,
        sfToleranceCp: 22, sfOpeningToleranceCp: 38, sfTempCp: 12,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 3, varMoveTime: 960, varRandomChance: 0, varJitter: 8, varTolerance: 18, varTemp: 12,
      };
    case 10:
      return {
        sfDepth: 5, sfSkill: 13, sfMoveTime: 880, sfMultiPv: 3,
        sfToleranceCp: 14, sfOpeningToleranceCp: 28, sfTempCp: 8,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 4, varMoveTime: 1150, varRandomChance: 0, varJitter: 4, varTolerance: 12, varTemp: 8,
      };
    case 11:
      return {
        sfDepth: 6, sfSkill: 15, sfMoveTime: 1080, sfMultiPv: 2,
        sfToleranceCp: 8, sfOpeningToleranceCp: 18, sfTempCp: 6,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 4, varMoveTime: 1350, varRandomChance: 0, varJitter: 0, varTolerance: 6, varTemp: 5,
      };
    case 12:
      return {
        sfDepth: 7, sfSkill: 17, sfMoveTime: 1300, sfMultiPv: 2,
        sfToleranceCp: 4, sfOpeningToleranceCp: 12, sfTempCp: 4,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 4, varMoveTime: 1600, varRandomChance: 0, varJitter: 0, varTolerance: 3, varTemp: 3,
      };
    case 13:
      return {
        sfDepth: 8, sfSkill: 18, sfMoveTime: 1550, sfMultiPv: 1,
        sfToleranceCp: 0, sfOpeningToleranceCp: 8, sfTempCp: 3,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 4, varMoveTime: 1900, varRandomChance: 0, varJitter: 0, varTolerance: 0, varTemp: 1,
      };
    case 14:
      return {
        sfDepth: 9, sfSkill: 19, sfMoveTime: 1800, sfMultiPv: 1,
        sfToleranceCp: 0, sfOpeningToleranceCp: 4, sfTempCp: 2,
        sfBlunderRate: 0, sfBlunderCapCp: 0, sfAvoidBestChance: 0,
        varDepth: 4, varMoveTime: 2200, varRandomChance: 0, varJitter: 0, varTolerance: 0, varTemp: 1,
      };
    default: {
      const cfg = AI_LEVELS.find((l) => l.level === level) || AI_LEVELS[14];
      return {
        sfDepth: Math.max(11, Math.min(19, cfg.depth)),
        sfSkill: 20,
        sfMoveTime: Math.min(3600, 1900 + (cfg.level - 14) * 280),
        sfMultiPv: 1,
        sfToleranceCp: 0,
        sfOpeningToleranceCp: 0,
        sfTempCp: 1,
        sfBlunderRate: 0,
        sfBlunderCapCp: 0,
        sfAvoidBestChance: 0,
        varDepth: 5,
        varMoveTime: Math.min(3400, 2200 + (cfg.level - 14) * 200),
        varRandomChance: 0,
        varJitter: 0,
        varTolerance: 0,
        varTemp: 1,
      };
    }
  }
}

function sampleWeightedCandidate<T>(
  items: { item: T; score: number }[],
  bestScore: number,
  temperature: number
): T {
  if (items.length === 1) return items[0].item;
  const temp = Math.max(1, temperature);
  const weights = items.map((c) => Math.exp(-Math.max(0, bestScore - c.score) / temp));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0].item;
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i].item;
  }
  return items[items.length - 1].item;
}

async function queryStockfishMove(
  state: GameState,
  level: AiDifficultyLevel
): Promise<LegalMove | null> {
  const fen = toFen(state);
  if (!fen) return null;
  const worker = getStockfishWorker();
  if (!worker) return null;

  const tuning = getAiTuning(level);
  const inOpening = state.moveHistory.length < 14;
  const legalMoves = getAllLegalMovesForSide(state, getCurrentTurnSide(state), false);
  if (legalMoves.length === 0) return null;

  const requestedMultiPv =
    level >= 15
      ? 1
      : level >= 12
        ? inOpening
          ? 2
          : 1
        : tuning.sfMultiPv;
  const multiPv = Math.max(1, Math.min(requestedMultiPv, legalMoves.length));

  return new Promise((resolve) => {
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
      const matched =
        legalMoves.find(
          (m) => m.from === from && m.to === to && (!promoChar || m.promotionPieceId === promoMap[promoChar])
        ) || legalMoves.find((m) => m.from === from && m.to === to);
      if (
        matched &&
        promoChar &&
        promoMap[promoChar] &&
        matched.promotionPieceId &&
        !state.compiledRules?.promoteToPieceId
      ) {
        return { ...matched, promotionPieceId: promoMap[promoChar] };
      }
      return matched;
    };

    const pvLines = new Map<number, { uci: string; cp: number }>();
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, tuning.sfMoveTime + 1800);

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

        const candidates = Array.from(pvLines.values())
          .map((item) => ({ item: matchUciToLegal(item.uci), cp: item.cp }))
          .filter((x): x is { item: LegalMove; cp: number } => Boolean(x.item))
          .sort((a, b) => b.cp - a.cp);

        if (candidates.length > 1) {
          const bestCp = candidates[0].cp;

          // Débutants (niv. 1-5) : erreurs tactiques calibrées tout en évitant l'auto-mat immédiat
          if (tuning.sfBlunderRate > 0 && Math.random() < tuning.sfBlunderRate) {
            const blunderPool = candidates.filter(
              (c, idx) => idx > 0 && c.cp >= bestCp - tuning.sfBlunderCapCp && c.cp > -20000
            );
            if (blunderPool.length > 0) {
              resolve(blunderPool[Math.floor(Math.random() * blunderPool.length)].item);
              return;
            }
            if (level <= 2 && legalMoves.length > 1) {
              resolve(legalMoves[Math.floor(Math.random() * legalMoves.length)]);
              return;
            }
          }

          const tolerance = inOpening ? tuning.sfOpeningToleranceCp : tuning.sfToleranceCp;
          // Aux niveaux moyens/hauts, un mat forcé très court est joué directement
          const forceMate = level >= 7 && bestCp >= 29000;
          if (!forceMate && tolerance > 0) {
            let pool = candidates.filter((c) => c.cp >= bestCp - tolerance);
            if (pool.length > 1 && tuning.sfAvoidBestChance > 0 && Math.random() < tuning.sfAvoidBestChance) {
              pool = pool.slice(1);
            }
            if (pool.length > 0) {
              const chosen = sampleWeightedCandidate(
                pool.map((c) => ({ item: c.item, score: c.cp })),
                pool[0].cp,
                tuning.sfTempCp
              );
              resolve(chosen);
              return;
            }
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
      worker.postMessage(`setoption name Skill Level value ${tuning.sfSkill}`);
      worker.postMessage(`setoption name MultiPV value ${multiPv}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${tuning.sfDepth} movetime ${tuning.sfMoveTime}`);
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

  if (rules?.allowPieceDrops && state.capturedReserve) {
    for (const s of state.activeSides) {
      const reserve = state.capturedReserve[s] || [];
      if (reserve.length === 0) continue;
      const allied = areSidesAllied(rules, s, perspective);
      let reserveVal = 0;
      for (const pid of reserve) {
        reserveVal += getPieceValue(pid, state.customPieceMap) * 0.72;
      }
      if (isReverse) {
        if (allied) score -= reserveVal;
        else score += reserveVal;
      } else {
        if (allied) score += reserveVal;
        else score -= reserveVal;
      }
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
  if (move.isDrop && move.dropPieceId) {
    const rows = state.board.rows;
    const cols = state.board.cols;
    const r = Math.floor(move.to / cols);
    const c = move.to % cols;
    const centerScore =
      Math.max(0, 4 - (Math.abs(r - (rows - 1) / 2) + Math.abs(c - (cols - 1) / 2))) * 10;
    s += getPieceValue(move.dropPieceId, state.customPieceMap) * 0.45 + 60 + centerScore;
  }
  if (move.captureIndex !== undefined && state.pieces[move.captureIndex]) {
    const victim = state.pieces[move.captureIndex];
    const attacker = move.from >= 0 ? state.pieces[move.from] : undefined;
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

  const tuning = getAiTuning(level);
  if (tuning.varRandomChance > 0 && Math.random() < tuning.varRandomChance) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Shuffle moves slightly before sorting captures/specials so equal-priority moves vary between games
  const shuffled = [...moves];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sorted = shuffled.sort((a, b) => scoreMoveOrdering(state, b) - scoreMoveOrdering(state, a));
  const deadline = Date.now() + tuning.varMoveTime;

  const candidateLimit = level >= 15 ? 48 : level >= 8 ? 40 : 28;
  const candidates = sorted.slice(0, candidateLimit);
  const inOpening = state.moveHistory.length < 12;

  const scored: { item: LegalMove; score: number }[] = [];
  for (const m of candidates) {
    const next = applyMove(state, m);
    const val =
      tuning.varDepth <= 1
        ? evaluateState(next, side)
        : alphabetaTeam(next, tuning.varDepth - 1, -Infinity, Infinity, side, deadline);
    const jitterAmp = inOpening ? tuning.varJitter * 1.2 : tuning.varJitter;
    const jitter = jitterAmp > 0 ? (Math.random() - 0.5) * jitterAmp : 0;
    scored.push({ item: m, score: val + jitter });
    if (Date.now() > deadline) break;
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return moves[0];

  const tolerance = inOpening ? tuning.varTolerance * 1.25 : tuning.varTolerance;
  if (tolerance <= 0 || scored.length === 1) {
    return scored[0].item;
  }

  const bestScore = scored[0].score;
  const pool = scored.filter((s) => s.score >= bestScore - tolerance);
  return sampleWeightedCandidate(pool.length > 0 ? pool : scored.slice(0, 1), bestScore, tuning.varTemp);
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
