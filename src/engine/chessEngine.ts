import type {
  BoardConfig,
  PieceDef,
  PlacedPieceRef,
  PlayerSide,
  SpecialPowerType,
  Variant,
} from '../types/chess.ts';
import {
  areSidesAllied,
  canPieceCaptureTarget,
  compileVariantRules,
  doesPieceMatchFilter,
  formatTeamLabel,
  getRemainingTeamGroups,
  getTeamSides,
  isPieceBackwardCaptureForbidden,
  isPieceBackwardForbidden,
  isPieceSidewaysForbidden,
  isSpecialEntryAllowed,
  isSquareColorAllowed,
  parsePieceTextConfig,
  type CompiledVariantRules,
} from './ruleParser.ts';

export const PLAYER_SIDES: PlayerSide[] = ['white', 'black', 'red', 'blue', 'green', 'gold'];

export const SIDE_LABELS: Record<PlayerSide, string> = {
  white: 'Blancs',
  black: 'Noirs',
  red: 'Rouges',
  blue: 'Bleus',
  green: 'Verts',
  gold: 'Or',
};

export interface BoardPieceInstance {
  uid: string;
  pieceId: string; // e.g. 'builtin:P' or custom id
  side: PlayerSide;
  hasMoved: boolean;
  shielded: boolean;
  invisibleTurns: number;
  frozenTurns: number;
  powerUsesLeft: number;
}

export interface LegalMove {
  from: number;
  to: number;
  captureIndex?: number;
  isCastle?: 'kingside' | 'queenside';
  isEnPassant?: boolean;
  promotionPieceId?: string;
  isPower?: SpecialPowerType;
  powerTarget?: number;
  description?: string;
}

export interface GameState {
  variant: Variant;
  board: BoardConfig;
  pieces: Record<number, BoardPieceInstance>;
  activeSides: PlayerSide[];
  eliminatedSides: PlayerSide[];
  turnIndex: number;
  actionsRemaining: number;
  bonusActionGrantedThisTurn: boolean;
  halfMoveClock: number;
  fullMoveNumber: number;
  enPassantTarget: number | null; // square index that can be captured en passant
  enPassantVictim: number | null;
  capturesCount: Record<PlayerSide, number>;
  checksDelivered: Record<PlayerSide, number>;
  lastMove: { from: number; to: number; description?: string } | null;
  moveHistory: string[];
  winner: PlayerSide | 'draw' | null;
  winningTeam?: PlayerSide[] | null;
  endReason: string | null;
  inCheckSides: PlayerSide[];
  customPieceMap: Record<string, PieceDef>;
  compiledRules: CompiledVariantRules;
}

const BUILTIN_MAP: Record<string, { name: string; symbolWhite: string; symbolBlack: string; value: number; isKing?: boolean }> = {
  'builtin:K': { name: 'Roi', symbolWhite: '♚', symbolBlack: '♚', value: 20000, isKing: true },
  'builtin:Q': { name: 'Dame', symbolWhite: '♛', symbolBlack: '♛', value: 900 },
  'builtin:R': { name: 'Tour', symbolWhite: '♜', symbolBlack: '♜', value: 500 },
  'builtin:B': { name: 'Fou', symbolWhite: '♝', symbolBlack: '♝', value: 330 },
  'builtin:N': { name: 'Cavalier', symbolWhite: '♞', symbolBlack: '♞', value: 320 },
  'builtin:P': { name: 'Pion', symbolWhite: '♟', symbolBlack: '♟', value: 100 },
};

const UNICODE_TO_BUILTIN: Record<string, string> = {
  '♔': 'builtin:K', '♚': 'builtin:K',
  '♕': 'builtin:Q', '♛': 'builtin:Q',
  '♖': 'builtin:R', '♜': 'builtin:R',
  '♗': 'builtin:B', '♝': 'builtin:B',
  '♘': 'builtin:N', '♞': 'builtin:N',
  '♙': 'builtin:P', '♟': 'builtin:P',
};

export function normalizePieceRef(raw: string): PlacedPieceRef {
  const match = raw.match(/^(.*)\|(white|black|red|blue|green|gold)$/);
  const side: PlayerSide = (match ? match[2] : 'white') as PlayerSide;
  let pieceId = match ? match[1] : raw;
  if (pieceId.startsWith('builtin:') && UNICODE_TO_BUILTIN[pieceId.slice(8)]) {
    pieceId = UNICODE_TO_BUILTIN[pieceId.slice(8)];
  } else if (UNICODE_TO_BUILTIN[pieceId]) {
    pieceId = UNICODE_TO_BUILTIN[pieceId];
  }
  return { pieceId, side };
}

export function getPieceDisplaySymbol(
  pieceId: string,
  side: PlayerSide,
  customPieceMap: Record<string, PieceDef>
): string {
  const builtin = BUILTIN_MAP[pieceId];
  if (builtin) {
    return side === 'white' ? builtin.symbolWhite : builtin.symbolBlack;
  }
  if (pieceId.startsWith('builtin:') && pieceId.length > 8) {
    return pieceId.slice(8);
  }
  return customPieceMap[pieceId]?.symbol || '★';
}

export function getPieceName(pieceId: string, customPieceMap: Record<string, PieceDef>): string {
  if (BUILTIN_MAP[pieceId]) return BUILTIN_MAP[pieceId].name;
  return customPieceMap[pieceId]?.name || 'Pièce personnalisée';
}

export function isKingPiece(pieceId: string, customPieceMap: Record<string, PieceDef>): boolean {
  if (pieceId === 'builtin:K') return true;
  const def = customPieceMap[pieceId];
  return Boolean(def?.moves?.king && !def.moves.rook && !def.moves.bishop && !def.moves.knight);
}

export function getPieceValue(pieceId: string, customPieceMap: Record<string, PieceDef>): number {
  if (BUILTIN_MAP[pieceId]) return BUILTIN_MAP[pieceId].value;
  const def = customPieceMap[pieceId];
  if (!def) return 300;
  let v = 120;
  if (def.moves.rook) v += 480;
  if (def.moves.bishop) v += 340;
  if (def.moves.knight) v += 310;
  if (def.moves.king) v += 250;
  if (def.moves.pawn) v += 100;
  if (def.powerType && def.powerType !== 'none') v += 160;
  return v;
}

export function makeDefaultBoard(rows = 8, cols = 8): BoardConfig {
  return {
    rows,
    cols,
    cells: Array(rows * cols).fill(1),
    blocked: [],
    special: [],
    specialEffectType: 'none',
    specialEffect: '',
    texture: 'plain',
    light: '#dce5ef',
    dark: '#788ba2',
    rotation: 0,
  };
}

export function makeStandardSetup(): Record<number, string> {
  const setup: Record<number, string> = {};
  const backRank = ['builtin:R', 'builtin:N', 'builtin:B', 'builtin:Q', 'builtin:K', 'builtin:B', 'builtin:N', 'builtin:R'];
  for (let c = 0; c < 8; c++) {
    setup[c] = `${backRank[c]}|black`;
    setup[8 + c] = 'builtin:P|black';
    setup[48 + c] = 'builtin:P|white';
    setup[56 + c] = `${backRank[c]}|white`;
  }
  return setup;
}

export function createInitialGameState(
  variant: Variant,
  allCustomPieces: PieceDef[] = []
): GameState {
  const customPieceMap: Record<string, PieceDef> = {};
  for (const p of variant.customPieceDefs || []) {
    customPieceMap[p.id] = p;
  }
  for (const p of allCustomPieces) {
    if (!customPieceMap[p.id]) customPieceMap[p.id] = p;
  }

  const pieces: Record<number, BoardPieceInstance> = {};
  let uidCounter = 1;
  const presentSides = new Set<PlayerSide>();

  for (const [key, raw] of Object.entries(variant.setup || {})) {
    const idx = Number(key);
    if (
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= variant.board.rows * variant.board.cols ||
      variant.board.cells[idx] === 0 ||
      variant.board.blocked?.includes(idx)
    ) {
      continue;
    }
    const { pieceId, side } = normalizePieceRef(raw);
    const def = customPieceMap[pieceId];
    pieces[idx] = {
      uid: `p_${uidCounter++}`,
      pieceId,
      side,
      hasMoved: false,
      shielded: false,
      invisibleTurns: 0,
      frozenTurns: 0,
      powerUsesLeft: def ? (def.limits > 0 ? def.limits : def.powerType !== 'none' ? 3 : 0) : 0,
    };
    presentSides.add(side);
  }

  const compiledRules = compileVariantRules(variant, allCustomPieces);
  const requestedCount = Math.max(2, Math.min(6, variant.players || 2));
  const activeSides = [...compiledRules.turnOrderSides].slice(0, requestedCount);
  // Ensure any side present on board is included
  for (const s of presentSides) {
    if (!activeSides.includes(s)) activeSides.push(s);
  }

  const zeroCounters = (): Record<PlayerSide, number> => ({
    white: 0,
    black: 0,
    red: 0,
    blue: 0,
    green: 0,
    gold: 0,
  });

  const state: GameState = {
    variant,
    board: variant.board,
    pieces,
    activeSides,
    eliminatedSides: [],
    turnIndex: 0,
    actionsRemaining: Math.max(
      1,
      compiledRules.actionsPerTurnOverride || variant.actions || 1
    ),
    bonusActionGrantedThisTurn: false,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    enPassantTarget: null,
    enPassantVictim: null,
    capturesCount: zeroCounters(),
    checksDelivered: zeroCounters(),
    lastMove: null,
    moveHistory: [],
    winner: null,
    winningTeam: null,
    endReason: null,
    inCheckSides: [],
    customPieceMap,
    compiledRules,
  };

  state.inCheckSides = compiledRules.noCheckRestriction ? [] : computeInCheckSides(state);
  return state;
}

export function cloneGameState(state: GameState): GameState {
  const pieces: Record<number, BoardPieceInstance> = {};
  for (const [k, v] of Object.entries(state.pieces)) {
    pieces[Number(k)] = { ...v };
  }
  return {
    ...state,
    pieces,
    activeSides: [...state.activeSides],
    eliminatedSides: [...state.eliminatedSides],
    winningTeam: state.winningTeam ? [...state.winningTeam] : null,
    capturesCount: { ...state.capturesCount },
    checksDelivered: { ...(state.checksDelivered || { white: 0, black: 0, red: 0, blue: 0, green: 0, gold: 0 }) },
    moveHistory: [...state.moveHistory],
    inCheckSides: [...state.inCheckSides],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function getStateRules(state: GameState): CompiledVariantRules {
  if (state.compiledRules) return state.compiledRules;
  return compileVariantRules(state.variant, Object.values(state.customPieceMap || {}));
}

export function getCurrentTurnSide(state: GameState): PlayerSide {
  return state.activeSides[state.turnIndex % state.activeSides.length] || 'white';
}

export function isCellPlayable(board: BoardConfig, index: number): boolean {
  if (index < 0 || index >= board.rows * board.cols) return false;
  if (board.cells[index] === 0) return false;
  if (board.blocked?.includes(index)) return false;
  return true;
}

export function isStandardChessCompatible(
  variant: Variant,
  extraCustomPieces: PieceDef[] = []
): boolean {
  if (variant.players !== 2) return false;
  if ((variant.actions || 1) !== 1) return false;
  if (variant.board.rows !== 8 || variant.board.cols !== 8) return false;
  if (variant.board.cells.some((c) => c === 0)) return false;
  if ((variant.board.blocked?.length || 0) > 0) return false;
  if ((variant.board.special?.length || 0) > 0) return false;
  if (variant.victoryType && variant.victoryType !== 'checkmate_or_king') return false;
  for (const val of Object.values(variant.setup || {})) {
    const { pieceId, side } = normalizePieceRef(val);
    if (!BUILTIN_MAP[pieceId]) return false;
    if (side !== 'white' && side !== 'black') return false;
  }
  const compiled = compileVariantRules(variant, extraCustomPieces);
  if (compiled.hasAnyCustomEnforcement) return false;
  return true;
}

export function toFen(state: GameState): string | null {
  if (!isStandardChessCompatible(state.variant)) return null;
  const charMap: Record<string, string> = {
    'builtin:K': 'k',
    'builtin:Q': 'q',
    'builtin:R': 'r',
    'builtin:B': 'b',
    'builtin:N': 'n',
    'builtin:P': 'p',
  };
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let rowStr = '';
    for (let c = 0; c < 8; c++) {
      const p = state.pieces[r * 8 + c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += String(empty);
          empty = 0;
        }
        const ch = charMap[p.pieceId] || 'p';
        rowStr += p.side === 'white' ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) rowStr += String(empty);
    ranks.push(rowStr);
  }
  const turn = getCurrentTurnSide(state) === 'white' ? 'w' : 'b';

  // Castling availability
  let castling = '';
  const wk = state.pieces[60];
  if (wk && wk.pieceId === 'builtin:K' && wk.side === 'white' && !wk.hasMoved) {
    const wrH = state.pieces[63];
    const wrA = state.pieces[56];
    if (wrH && wrH.pieceId === 'builtin:R' && wrH.side === 'white' && !wrH.hasMoved) castling += 'K';
    if (wrA && wrA.pieceId === 'builtin:R' && wrA.side === 'white' && !wrA.hasMoved) castling += 'Q';
  }
  const bk = state.pieces[4];
  if (bk && bk.pieceId === 'builtin:K' && bk.side === 'black' && !bk.hasMoved) {
    const brH = state.pieces[7];
    const brA = state.pieces[0];
    if (brH && brH.pieceId === 'builtin:R' && brH.side === 'black' && !brH.hasMoved) castling += 'k';
    if (brA && brA.pieceId === 'builtin:R' && brA.side === 'black' && !brA.hasMoved) castling += 'q';
  }
  if (!castling) castling = '-';

  let ep = '-';
  if (state.enPassantTarget !== null) {
    const r = Math.floor(state.enPassantTarget / 8);
    const c = state.enPassantTarget % 8;
    ep = String.fromCharCode(97 + c) + String(8 - r);
  }

  return `${ranks.join('/')} ${turn} ${castling} ${ep} ${state.halfMoveClock} ${state.fullMoveNumber}`;
}

export function squareToCoord(index: number, cols: number, rows: number): string {
  const r = Math.floor(index / cols);
  const c = index % cols;
  return `${String.fromCharCode(97 + (c % 26))}${rows - r}`;
}

export function uciToSquare(uciSq: string, cols = 8, rows = 8): number {
  const c = uciSq.charCodeAt(0) - 97;
  const rank = parseInt(uciSq.slice(1), 10);
  const r = rows - rank;
  return r * cols + c;
}

function getForwardDirection(side: PlayerSide): [number, number] {
  switch (side) {
    case 'white':
      return [-1, 0];
    case 'black':
      return [1, 0];
    case 'red':
      return [0, 1];
    case 'blue':
      return [0, -1];
    case 'green':
      return [-1, 0];
    case 'gold':
      return [1, 0];
  }
}

function getPseudoMovesForPiece(
  state: GameState,
  from: number,
  forAttackCheck = false,
  ignoreVariantRules = false,
  forDefenseCheck = false
): LegalMove[] {
  const piece = state.pieces[from];
  if (!piece || piece.frozenTurns > 0) return [];

  const rules = getStateRules(state);
  if (
    !ignoreVariantRules &&
    !forDefenseCheck &&
    rules.immobilePieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))
  ) {
    return [];
  }

  const customDef = state.customPieceMap[piece.pieceId];
  const allCustomPieces = Object.values(state.customPieceMap || {});
  const { rows, cols } = state.board;
  const r0 = Math.floor(from / cols);
  const c0 = from % cols;
  const [fdr, fdc] = getForwardDirection(piece.side);
  const moves: LegalMove[] = [];

  const jumpForbidden =
    !ignoreVariantRules &&
    rules.forbidJumpPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side));

  const globalCanJump =
    !ignoreVariantRules &&
    !jumpForbidden &&
    (rules.allCanJump ||
      rules.canJumpPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side)));

  const pieceStepCap = !ignoreVariantRules
    ? Object.entries(rules.pieceMaxSteps).reduce((acc, [filter, cap]) => {
        if (cap > 0 && doesPieceMatchFilter(piece.pieceId, filter, piece.side)) {
          return acc > 0 ? Math.min(acc, cap) : cap;
        }
        return acc;
      }, rules.maxStepsPerMove || 0)
    : 0;

  const isDirectionPermitted = (drFromStart: number, dcFromStart: number, to: number): boolean => {
    if (ignoreVariantRules) return true;
    const absDr = Math.abs(drFromStart);
    const absDc = Math.abs(dcFromStart);
    if (
      absDr > 0 &&
      absDr === absDc &&
      rules.forbidDiagonalPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))
    ) {
      return false;
    }
    if (
      (drFromStart === 0 || dcFromStart === 0) &&
      rules.forbidOrthogonalPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))
    ) {
      return false;
    }
    const dot = drFromStart * fdr + dcFromStart * fdc;
    if (
      dot < 0 &&
      isPieceBackwardForbidden(rules, piece.pieceId, from, to, state.board, customDef, piece.side)
    ) {
      return false;
    }
    const { noSideways, strictlyForward } = isPieceSidewaysForbidden(
      rules,
      piece.pieceId,
      customDef,
      piece.side
    );
    if (strictlyForward && dot <= 0) return false;
    if (noSideways && dot === 0) return false;
    return true;
  };

  const isEntryPermitted = (to: number): boolean => {
    if (ignoreVariantRules) return true;
    if (!isSpecialEntryAllowed(rules, state.board, piece.pieceId, to, piece.side)) return false;
    if (!isSquareColorAllowed(rules, piece.pieceId, to, cols, piece.side)) return false;
    return true;
  };

  const isTargetSideCapturable = (targetSide: PlayerSide): boolean => {
    const sameSide = targetSide === piece.side;
    const allied = areSidesAllied(rules, piece.side, targetSide);
    if (forDefenseCheck) return ignoreVariantRules ? sameSide : allied;
    if (!allied) return true;
    if (ignoreVariantRules) return false;
    if (sameSide) return rules.allowFriendlyCapture;
    return rules.allowTeammateCapture;
  };

  const canCaptureVictim = (
    victimPieceId: string,
    victimSq: number,
    drFromStart: number,
    dcFromStart: number
  ): boolean => {
    if (ignoreVariantRules || forDefenseCheck) return true;
    const victimPiece = state.pieces[victimSq];
    if (
      victimPiece &&
      areSidesAllied(rules, piece.side, victimPiece.side) &&
      isKingPiece(victimPieceId, state.customPieceMap)
    ) {
      return false;
    }
    const dot = drFromStart * fdr + dcFromStart * fdc;
    const isVictimDefended =
      !forAttackCheck &&
      rules.protectedByAllyUncapturable &&
      victimPiece &&
      !isKingPiece(victimPieceId, state.customPieceMap)
        ? isSquareDefendedByAlly(state, victimSq, victimPiece.side)
        : false;

    return canPieceCaptureTarget(
      rules,
      state.board,
      piece.pieceId,
      from,
      victimPieceId,
      victimSq,
      allCustomPieces,
      state.fullMoveNumber,
      {
        attackerValue: getPieceValue(piece.pieceId, state.customPieceMap),
        victimValue: getPieceValue(victimPieceId, state.customPieceMap),
        isVictimDefended,
        isBackwardMove: dot < 0,
        attackerSide: piece.side,
        victimSide: victimPiece?.side,
      }
    ).allowed;
  };

  const wrapCol = (rawCol: number): number | null => {
    if (rawCol >= 0 && rawCol < cols) return rawCol;
    if (!ignoreVariantRules && rules.wrapHorizontal) {
      return ((rawCol % cols) + cols) % cols;
    }
    return null;
  };

  const addSlide = (dr: number, dc: number, maxSteps: number, canJump = false) => {
    const effectiveCanJump = !jumpForbidden && (canJump || globalCanJump);
    let cappedSteps =
      !ignoreVariantRules && pieceStepCap > 0
        ? Math.min(maxSteps, pieceStepCap)
        : maxSteps;
    if (!ignoreVariantRules && rules.wrapHorizontal && dc !== 0) {
      cappedSteps = Math.min(cappedSteps, Math.max(1, cols - 1));
    }

    for (let step = 1; step <= cappedSteps; step++) {
      const nr = r0 + dr * step;
      if (nr < 0 || nr >= rows) break;
      const nc = wrapCol(c0 + dc * step);
      if (nc === null) break;
      const to = nr * cols + nc;
      if (to === from) break;
      if (state.board.cells[to] === 0 || state.board.blocked?.includes(to)) {
        if (!effectiveCanJump) break;
        continue;
      }
      const dirOk = isDirectionPermitted(dr * step, dc * step, to);
      const specialOk = ignoreVariantRules || isSpecialEntryAllowed(rules, state.board, piece.pieceId, to, piece.side);
      const colorOk = ignoreVariantRules || isSquareColorAllowed(rules, piece.pieceId, to, cols, piece.side);
      const entryOk = specialOk && colorOk;

      const target = state.pieces[to];
      if (!target) {
        if (dirOk && entryOk) {
          moves.push({ from, to });
        } else if (!specialOk && !effectiveCanJump) {
          break;
        }
      } else {
        if (
          dirOk &&
          entryOk &&
          isTargetSideCapturable(target.side) &&
          (forAttackCheck || forDefenseCheck || target.invisibleTurns === 0) &&
          canCaptureVictim(target.pieceId, to, dr * step, dc * step)
        ) {
          moves.push({ from, to, captureIndex: to });
        }
        if (!effectiveCanJump) break;
      }
    }
  };

  const addJump = (dr: number, dc: number) => {
    if (
      !ignoreVariantRules &&
      pieceStepCap > 0 &&
      Math.max(Math.abs(dr), Math.abs(dc)) > pieceStepCap
    ) {
      return;
    }
    const nr = r0 + dr;
    if (nr < 0 || nr >= rows) return;
    const nc = wrapCol(c0 + dc);
    if (nc === null) return;
    const to = nr * cols + nc;
    if (to === from) return;
    if (!isCellPlayable(state.board, to)) return;
    if (!isDirectionPermitted(dr, dc, to)) return;
    if (!isEntryPermitted(to)) return;

    const target = state.pieces[to];
    if (!target) {
      moves.push({ from, to });
    } else if (
      isTargetSideCapturable(target.side) &&
      (forAttackCheck || forDefenseCheck || target.invisibleTurns === 0) &&
      canCaptureVictim(target.pieceId, to, dr, dc)
    ) {
      moves.push({ from, to, captureIndex: to });
    }
  };

  const maxDim = Math.max(rows, cols);
  const promoId =
    !ignoreVariantRules && rules.disablePromotion
      ? undefined
      : (!ignoreVariantRules && rules.promoteToPieceId) || 'builtin:Q';

  const emitKnightLeaps = () => {
    [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(([dr, dc]) => {
      if (jumpForbidden) {
        const legR = r0 + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
        const legC = wrapCol(c0 + (Math.abs(dc) === 2 ? Math.sign(dc) : 0));
        if (legR < 0 || legR >= rows || legC === null) return;
        const legSq = legR * cols + legC;
        if (!isCellPlayable(state.board, legSq) || state.pieces[legSq]) return;
      }
      addJump(dr, dc);
    });
  };

  const emitTemplateMoves = (templateId: string, allowCastle: boolean) => {
    if (templateId === 'builtin:R') {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxDim));
    } else if (templateId === 'builtin:B') {
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxDim));
    } else if (templateId === 'builtin:Q') {
      [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) =>
        addSlide(dr, dc, maxDim)
      );
    } else if (templateId === 'builtin:N') {
      emitKnightLeaps();
    } else if (templateId === 'builtin:K') {
      [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) =>
        addJump(dr, dc)
      );
      if (allowCastle) {
        // Castling handled below
      }
    } else if (templateId === 'builtin:P') {
      const diagOffsets: [number, number][] =
        fdr !== 0
          ? [
              [fdr, -1],
              [fdr, 1],
            ]
          : [
              [-1, fdc],
              [1, fdc],
            ];

      const isBerolina = !ignoreVariantRules && rules.berolinaPawns;
      const pawnCanMoveBackward =
        !ignoreVariantRules &&
        (rules.allowPawnBackward || (rules.allowPawnBackwardSides || []).includes(piece.side));

      if (isBerolina) {
        // Berolina pawn: steps diagonally forward (or backward if allowPawnBackward), captures straight forward
        const activeMoveDiags: [number, number][] =
          pawnCanMoveBackward
            ? [
                ...diagOffsets,
                ...(fdr !== 0
                  ? ([[-fdr, -1], [-fdr, 1]] as [number, number][])
                  : ([[-1, -fdc], [1, -fdc]] as [number, number][])),
              ]
            : diagOffsets;

        if (!forAttackCheck) {
          for (const [dr, dc] of activeMoveDiags) {
            const r1 = r0 + dr;
            if (r1 < 0 || r1 >= rows) continue;
            const c1 = wrapCol(c0 + dc);
            if (c1 === null) continue;
            const to1 = r1 * cols + c1;
            const isPromo =
              (fdr === -1 && r1 === 0) ||
              (fdr === 1 && r1 === rows - 1) ||
              (fdc === 1 && c1 === cols - 1) ||
              (fdc === -1 && c1 === 0);
            if (
              isCellPlayable(state.board, to1) &&
              !state.pieces[to1] &&
              isDirectionPermitted(dr, dc, to1) &&
              isEntryPermitted(to1)
            ) {
              moves.push({ from, to: to1, promotionPieceId: isPromo ? promoId : undefined });
            }
          }
        }
        const capR = r0 + fdr;
        const capC = wrapCol(c0 + fdc);
        if (capR >= 0 && capR < rows && capC !== null) {
          const to = capR * cols + capC;
          const target = state.pieces[to];
          const isPromo =
            (fdr === -1 && capR === 0) ||
            (fdr === 1 && capR === rows - 1) ||
            (fdc === 1 && capC === cols - 1) ||
            (fdc === -1 && capC === 0);
          if (isCellPlayable(state.board, to) && isDirectionPermitted(fdr, fdc, to) && isEntryPermitted(to)) {
            if (forAttackCheck || forDefenseCheck) {
              if (!target || canCaptureVictim(target.pieceId, to, fdr, fdc)) {
                if (!rules.noCapturePieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))) {
                  moves.push({ from, to, captureIndex: to });
                }
              }
            } else if (
              target &&
              isTargetSideCapturable(target.side) &&
              target.invisibleTurns === 0 &&
              canCaptureVictim(target.pieceId, to, fdr, fdc)
            ) {
              moves.push({
                from,
                to,
                captureIndex: to,
                promotionPieceId: isPromo ? promoId : undefined,
              });
            }
          }
        }
      } else {
        if (!forAttackCheck && !forDefenseCheck) {
          const r1 = r0 + fdr;
          const c1 = wrapCol(c0 + fdc);
          if (r1 >= 0 && r1 < rows && c1 !== null) {
            const to1 = r1 * cols + c1;
            if (isCellPlayable(state.board, to1)) {
              const target1 = state.pieces[to1];
              const isPromo =
                (fdr === -1 && r1 === 0) ||
                (fdr === 1 && r1 === rows - 1) ||
                (fdc === 1 && c1 === cols - 1) ||
                (fdc === -1 && c1 === 0);
              if (!target1 && isDirectionPermitted(fdr, fdc, to1) && isEntryPermitted(to1)) {
                moves.push({
                  from,
                  to: to1,
                  promotionPieceId: isPromo ? promoId : undefined,
                });
                const maxInitial =
                  ignoreVariantRules
                    ? 2
                    : rules.disablePawnDoubleStep || pieceStepCap === 1
                      ? 1
                      : rules.alwaysPawnDoubleStep
                        ? Math.max(2, rules.pawnInitialSteps)
                        : !piece.hasMoved
                          ? Math.max(2, rules.pawnInitialSteps)
                          : 1;
                const effectiveMax = pieceStepCap > 0 ? Math.min(maxInitial, pieceStepCap) : maxInitial;
                for (let step = 2; step <= effectiveMax; step++) {
                  const rN = r0 + fdr * step;
                  const cN = wrapCol(c0 + fdc * step);
                  if (rN < 0 || rN >= rows || cN === null) break;
                  const toN = rN * cols + cN;
                  if (
                    isCellPlayable(state.board, toN) &&
                    !state.pieces[toN] &&
                    isDirectionPermitted(fdr * step, fdc * step, toN) &&
                    isEntryPermitted(toN)
                  ) {
                    moves.push({ from, to: toN });
                  } else {
                    break;
                  }
                }
              } else if (
                !ignoreVariantRules &&
                rules.pawnCaptureForward &&
                target1 &&
                isTargetSideCapturable(target1.side) &&
                target1.invisibleTurns === 0 &&
                isDirectionPermitted(fdr, fdc, to1) &&
                isEntryPermitted(to1) &&
                canCaptureVictim(target1.pieceId, to1, fdr, fdc)
              ) {
                moves.push({
                  from,
                  to: to1,
                  captureIndex: to1,
                  promotionPieceId: isPromo ? promoId : undefined,
                });
              }
            }
          }

          // Backward pawn step when explicitly permitted ("les pions peuvent reculer")
          if (pawnCanMoveBackward) {
            const rb = r0 - fdr;
            const cb = wrapCol(c0 - fdc);
            if (rb >= 0 && rb < rows && cb !== null) {
              const tob = rb * cols + cb;
              if (
                isCellPlayable(state.board, tob) &&
                !state.pieces[tob] &&
                isDirectionPermitted(-fdr, -fdc, tob) &&
                isEntryPermitted(tob)
              ) {
                moves.push({ from, to: tob });
              }
            }
          }
        } else if (!ignoreVariantRules && rules.pawnCaptureForward) {
          const r1 = r0 + fdr;
          const c1 = wrapCol(c0 + fdc);
          if (r1 >= 0 && r1 < rows && c1 !== null) {
            const to1 = r1 * cols + c1;
            const t1 = state.pieces[to1];
            if (
              isCellPlayable(state.board, to1) &&
              isDirectionPermitted(fdr, fdc, to1) &&
              isEntryPermitted(to1) &&
              (!t1 || canCaptureVictim(t1.pieceId, to1, fdr, fdc))
            ) {
              moves.push({ from, to: to1, captureIndex: to1 });
            }
          }
        }

        const activeDiagOffsets: [number, number][] =
          pawnCanMoveBackward
            ? [
                ...diagOffsets,
                ...(fdr !== 0
                  ? ([
                      [-fdr, -1],
                      [-fdr, 1],
                    ] as [number, number][])
                  : ([
                      [-1, -fdc],
                      [1, -fdc],
                    ] as [number, number][])),
              ]
            : diagOffsets;

        for (const [dr, dc] of activeDiagOffsets) {
          const nr = r0 + dr;
          const nc = wrapCol(c0 + dc);
          if (nr < 0 || nr >= rows || nc === null) continue;
          const to = nr * cols + nc;
          if (!isCellPlayable(state.board, to)) continue;
          if (!isDirectionPermitted(dr, dc, to)) continue;
          if (!isEntryPermitted(to)) continue;

          const target = state.pieces[to];
          const isPromo =
            (fdr === -1 && nr === 0) ||
            (fdr === 1 && nr === rows - 1) ||
            (fdc === 1 && nc === cols - 1) ||
            (fdc === -1 && nc === 0);

          if (forAttackCheck || forDefenseCheck) {
            if (!target || (isTargetSideCapturable(target.side) && canCaptureVictim(target.pieceId, to, dr, dc))) {
              if (!rules.noCapturePieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))) {
                moves.push({ from, to, captureIndex: to });
              }
            }
          } else if (
            target &&
            isTargetSideCapturable(target.side) &&
            target.invisibleTurns === 0 &&
            canCaptureVictim(target.pieceId, to, dr, dc)
          ) {
            moves.push({
              from,
              to,
              captureIndex: to,
              promotionPieceId: isPromo ? promoId : undefined,
            });
          } else if (
            (ignoreVariantRules || !rules.disableEnPassant) &&
            state.enPassantTarget === to &&
            state.enPassantVictim !== null &&
            state.pieces[state.enPassantVictim] &&
            isTargetSideCapturable(state.pieces[state.enPassantVictim].side) &&
            canCaptureVictim(state.pieces[state.enPassantVictim].pieceId, state.enPassantVictim, dr, dc)
          ) {
            moves.push({
              from,
              to,
              captureIndex: state.enPassantVictim,
              isEnPassant: true,
            });
          }
        }
      }
    } else if (state.customPieceMap[templateId]) {
      const tDef = state.customPieceMap[templateId];
      const parsed = parsePieceTextConfig(tDef);
      const maxRange = tDef.moves.maxRange > 0 ? tDef.moves.maxRange : parsed.extraRange || maxDim;
      const canJump = Boolean(tDef.moves.canJump || parsed.canJump);
      if (tDef.moves.rook) {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxRange, canJump));
      }
      if (tDef.moves.bishop) {
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxRange, canJump));
      }
      if (tDef.moves.knight) {
        [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(([dr, dc]) =>
          addJump(dr, dc)
        );
      }
      if (tDef.moves.king) {
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) =>
          addJump(dr, dc)
        );
      }
      if (parsed.nightrider) {
        [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(([dr, dc]) =>
          addSlide(dr, dc, maxRange, canJump)
        );
      }
      for (const [dr, dc] of parsed.extraSlides) {
        addSlide(dr, dc, maxRange, canJump);
      }
      for (const [dr, dc] of parsed.extraLeaps) {
        addJump(dr, dc);
      }
    }
  };

  const matchingReplacements: string[] = !ignoreVariantRules
    ? Object.entries(rules.replacePieceMoves || {})
        .filter(([filter]) => doesPieceMatchFilter(piece.pieceId, filter, piece.side))
        .flatMap(([, ids]) => ids)
    : [];

  if (matchingReplacements.length > 0) {
    for (const tmplId of matchingReplacements) {
      emitTemplateMoves(tmplId, false);
    }
  } else if (piece.pieceId === 'builtin:R') {
    emitTemplateMoves('builtin:R', false);
  } else if (piece.pieceId === 'builtin:B') {
    emitTemplateMoves('builtin:B', false);
  } else if (piece.pieceId === 'builtin:Q') {
    emitTemplateMoves('builtin:Q', false);
  } else if (piece.pieceId === 'builtin:N') {
    emitTemplateMoves('builtin:N', false);
  } else if (piece.pieceId === 'builtin:K') {
    emitTemplateMoves('builtin:K', true);
    // Castling on standard-compatible row (unless disabled by variant rules)
    if (
      !forAttackCheck &&
      !forDefenseCheck &&
      (ignoreVariantRules || !rules.disableCastling) &&
      !piece.hasMoved &&
      rows >= 8 &&
      cols >= 8
    ) {
      const homeRow = piece.side === 'white' ? rows - 1 : piece.side === 'black' ? 0 : -1;
      if (r0 === homeRow && c0 === 4) {
        // Kingside
        const rIdx = homeRow * cols + 7;
        const rook = state.pieces[rIdx];
        const kCastleTo = homeRow * cols + 6;
        if (
          rook &&
          rook.side === piece.side &&
          !rook.hasMoved &&
          !state.pieces[homeRow * cols + 5] &&
          !state.pieces[kCastleTo] &&
          isCellPlayable(state.board, homeRow * cols + 5) &&
          isCellPlayable(state.board, kCastleTo) &&
          isDirectionPermitted(0, 2, kCastleTo) &&
          isEntryPermitted(kCastleTo)
        ) {
          if (
            rules.noCheckRestriction ||
            (!isSquareAttackedByEnemy(state, from, piece.side) &&
              !isSquareAttackedByEnemy(state, homeRow * cols + 5, piece.side) &&
              !isSquareAttackedByEnemy(state, kCastleTo, piece.side))
          ) {
            moves.push({ from, to: kCastleTo, isCastle: 'kingside' });
          }
        }
        // Queenside
        const qIdx = homeRow * cols;
        const qRook = state.pieces[qIdx];
        const qCastleTo = homeRow * cols + 2;
        if (
          qRook &&
          qRook.side === piece.side &&
          !qRook.hasMoved &&
          !state.pieces[homeRow * cols + 1] &&
          !state.pieces[qCastleTo] &&
          !state.pieces[homeRow * cols + 3] &&
          isCellPlayable(state.board, qCastleTo) &&
          isCellPlayable(state.board, homeRow * cols + 3) &&
          isDirectionPermitted(0, -2, qCastleTo) &&
          isEntryPermitted(qCastleTo)
        ) {
          if (
            rules.noCheckRestriction ||
            (!isSquareAttackedByEnemy(state, from, piece.side) &&
              !isSquareAttackedByEnemy(state, homeRow * cols + 3, piece.side) &&
              !isSquareAttackedByEnemy(state, qCastleTo, piece.side))
          ) {
            moves.push({ from, to: qCastleTo, isCastle: 'queenside' });
          }
        }
      }
    }
  } else if (piece.pieceId === 'builtin:P') {
    emitTemplateMoves('builtin:P', false);
  } else {
    // Custom piece
    const def = customDef;
    if (def) {
      const parsed = parsePieceTextConfig(def);
      const maxRange = def.moves.maxRange > 0 ? def.moves.maxRange : parsed.extraRange || maxDim;
      const canJump = !jumpForbidden && Boolean(def.moves.canJump || parsed.canJump);

      if (def.moves.rook) {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxRange, canJump));
      }
      if (def.moves.bishop) {
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => addSlide(dr, dc, maxRange, canJump));
      }
      if (def.moves.knight) {
        emitKnightLeaps();
      }
      if (def.moves.king) {
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) =>
          addJump(dr, dc)
        );
      }
      if (def.moves.pawn) {
        emitTemplateMoves('builtin:P', false);
      }
      if (parsed.berolina) {
        const diags: [number, number][] = fdr !== 0 ? [[fdr, -1], [fdr, 1]] : [[-1, fdc], [1, fdc]];
        if (!forAttackCheck && !forDefenseCheck) {
          for (const [dr, dc] of diags) {
            const nr = r0 + dr;
            const nc = wrapCol(c0 + dc);
            if (nr >= 0 && nr < rows && nc !== null) {
              const to = nr * cols + nc;
              if (
                isCellPlayable(state.board, to) &&
                !state.pieces[to] &&
                isDirectionPermitted(dr, dc, to) &&
                isEntryPermitted(to)
              ) {
                moves.push({ from, to });
              }
            }
          }
        }
        const capR = r0 + fdr;
        const capC = wrapCol(c0 + fdc);
        if (capR >= 0 && capR < rows && capC !== null) {
          const to = capR * cols + capC;
          const target = state.pieces[to];
          if (
            isCellPlayable(state.board, to) &&
            isDirectionPermitted(fdr, fdc, to) &&
            isEntryPermitted(to) &&
            target &&
            isTargetSideCapturable(target.side) &&
            (forAttackCheck || forDefenseCheck || target.invisibleTurns === 0) &&
            canCaptureVictim(target.pieceId, to, fdr, fdc)
          ) {
            moves.push({ from, to, captureIndex: to });
          }
        }
      }
      if (parsed.nightrider) {
        [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(([dr, dc]) =>
          addSlide(dr, dc, maxRange, canJump)
        );
      }
      for (const [dr, dc] of parsed.extraSlides) {
        addSlide(dr, dc, maxRange, canJump);
      }
      for (const [dr, dc] of parsed.extraLeaps) {
        addJump(dr, dc);
      }
      // Fallback if custom piece had no boxes checked & no parsed slides/leaps
      if (
        !def.moves.rook &&
        !def.moves.bishop &&
        !def.moves.knight &&
        !def.moves.king &&
        !def.moves.pawn &&
        !parsed.berolina &&
        !parsed.nightrider &&
        parsed.extraSlides.length === 0 &&
        parsed.extraLeaps.length === 0
      ) {
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) =>
          addJump(dr, dc)
        );
      }
    } else {
      // Unknown custom piece fallback: king step
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => addJump(dr, dc));
    }
  }

  // Mimicry / bonus piece movements granted by variant text rules
  if (!ignoreVariantRules) {
    for (const [filter, grantedIds] of Object.entries(rules.grantPieceMoves || {})) {
      if (doesPieceMatchFilter(piece.pieceId, filter, piece.side)) {
        for (const tmplId of grantedIds) {
          if (tmplId !== piece.pieceId) {
            emitTemplateMoves(tmplId, false);
          }
        }
      }
    }
    if (state.board.special?.includes(from)) {
      for (const [filter, grantedIds] of Object.entries(rules.specialGrantPieceMoves || {})) {
        if (doesPieceMatchFilter(piece.pieceId, filter, piece.side)) {
          for (const tmplId of grantedIds) {
            if (tmplId !== piece.pieceId) {
              emitTemplateMoves(tmplId, false);
            }
          }
        }
      }
    }
  }

  // Deduplicate by target index
  const unique = new Map<number, LegalMove>();
  for (const m of moves) {
    if (!unique.has(m.to)) unique.set(m.to, m);
  }
  return Array.from(unique.values());
}

export function getSpecialPowerMoves(state: GameState, from: number): LegalMove[] {
  const piece = state.pieces[from];
  if (!piece || piece.frozenTurns > 0) return [];
  const def = state.customPieceMap[piece.pieceId];
  if (!def || !def.powerType || def.powerType === 'none') return [];
  if (piece.powerUsesLeft <= 0 && def.limits !== 0) return [];

  const parsed = parsePieceTextConfig(def);
  const cond = parsed.powerConditions;
  if (cond.requireNotInCheck && state.inCheckSides.includes(piece.side)) return [];
  if (cond.requireInCheck && !state.inCheckSides.includes(piece.side)) return [];
  if (cond.minTurn > 0 && state.fullMoveNumber < cond.minTurn) return [];
  if (cond.maxTurn > 0 && state.fullMoveNumber > cond.maxTurn) return [];
  if (cond.requireOnSpecial && !state.board.special?.includes(from)) return [];
  if (cond.requireNotOnSpecial && state.board.special?.includes(from)) return [];
  if (cond.requireNotMoved && piece.hasMoved) return [];
  if (cond.requireMoved && !piece.hasMoved) return [];

  const effectivePower =
    def.powerType === 'custom' && parsed.inferredPowerType ? parsed.inferredPowerType : def.powerType;
  if (effectivePower === 'none' || effectivePower === 'custom') return [];

  const rules = getStateRules(state);
  const total = state.board.rows * state.board.cols;
  const moves: LegalMove[] = [];

  if (effectivePower === 'teleport') {
    for (let i = 0; i < total; i++) {
      if (
        i !== from &&
        isCellPlayable(state.board, i) &&
        !state.pieces[i] &&
        isSpecialEntryAllowed(rules, state.board, piece.pieceId, i, piece.side)
      ) {
        moves.push({ from, to: i, isPower: 'teleport', description: 'Téléportation' });
      }
    }
  } else if (effectivePower === 'invisibility') {
    moves.push({ from, to: from, isPower: 'invisibility', description: 'Invisibilité (2 tours)' });
  } else if (effectivePower === 'shield') {
    if (!piece.shielded) {
      moves.push({ from, to: from, isPower: 'shield', description: 'Activer Bouclier' });
    }
  } else if (effectivePower === 'transform') {
    moves.push({
      from,
      to: from,
      isPower: 'transform',
      promotionPieceId: 'builtin:Q',
      description: 'Transformation en Dame',
    });
  } else if (effectivePower === 'duplicate') {
    const r0 = Math.floor(from / state.board.cols);
    const c0 = from % state.board.cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = r0 + dr;
      const nc = c0 + dc;
      if (nr >= 0 && nr < state.board.rows && nc >= 0 && nc < state.board.cols) {
        const to = nr * state.board.cols + nc;
        if (
          isCellPlayable(state.board, to) &&
          !state.pieces[to] &&
          isSpecialEntryAllowed(rules, state.board, piece.pieceId, to, piece.side)
        ) {
          moves.push({ from, to, isPower: 'duplicate', description: 'Duplication' });
        }
      }
    }
  } else if (effectivePower === 'manipulate') {
    const r0 = Math.floor(from / state.board.cols);
    const c0 = from % state.board.cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = r0 + dr;
      const nc = c0 + dc;
      if (nr >= 0 && nr < state.board.rows && nc >= 0 && nc < state.board.cols) {
        const targetSq = nr * state.board.cols + nc;
        const targetP = state.pieces[targetSq];
        if (targetP && !isKingPiece(targetP.pieceId, state.customPieceMap)) {
          const pushR = nr + dr;
          const pushC = nc + dc;
          if (pushR >= 0 && pushR < state.board.rows && pushC >= 0 && pushC < state.board.cols) {
            const pushTo = pushR * state.board.cols + pushC;
            if (isCellPlayable(state.board, pushTo) && !state.pieces[pushTo]) {
              moves.push({
                from,
                to: targetSq,
                powerTarget: pushTo,
                isPower: 'manipulate',
                description: 'Repousser la pièce',
              });
            }
          }
        }
      }
    }
  }

  return moves;
}

export function isSquareAttackedByEnemy(
  state: GameState,
  square: number,
  defenderSide: PlayerSide
): boolean {
  const rules = getStateRules(state);
  for (const [idxStr, p] of Object.entries(state.pieces)) {
    if (areSidesAllied(rules, p.side, defenderSide) || state.eliminatedSides.includes(p.side)) {
      continue;
    }
    const moves = getPseudoMovesForPiece(state, Number(idxStr), true);
    if (moves.some((m) => m.to === square)) return true;
  }
  return false;
}

function isSquareDefendedByAlly(
  state: GameState,
  square: number,
  allySide: PlayerSide
): boolean {
  const rules = getStateRules(state);
  for (const [idxStr, p] of Object.entries(state.pieces)) {
    const sq = Number(idxStr);
    if (
      sq === square ||
      !areSidesAllied(rules, p.side, allySide) ||
      state.eliminatedSides.includes(p.side)
    ) {
      continue;
    }
    const moves = getPseudoMovesForPiece(state, sq, true, false, true);
    if (moves.some((m) => m.to === square)) return true;
  }
  return false;
}

function findKingSquare(state: GameState, side: PlayerSide): number | null {
  for (const [idxStr, p] of Object.entries(state.pieces)) {
    if (p.side === side && isKingPiece(p.pieceId, state.customPieceMap)) {
      return Number(idxStr);
    }
  }
  return null;
}

export function computeInCheckSides(state: GameState): PlayerSide[] {
  const rules = getStateRules(state);
  if (rules.noCheckRestriction) return [];
  const checked: PlayerSide[] = [];
  for (const side of state.activeSides) {
    if (state.eliminatedSides.includes(side)) continue;
    const kSq = findKingSquare(state, side);
    if (kSq !== null && isSquareAttackedByEnemy(state, kSq, side)) {
      checked.push(side);
    }
  }
  return checked;
}

function getCheckLegalMovesForSquare(
  state: GameState,
  from: number,
  includePowers = true
): LegalMove[] {
  if (state.winner) return [];
  const piece = state.pieces[from];
  const currentSide = getCurrentTurnSide(state);
  if (!piece || piece.side !== currentSide) return [];

  const rules = getStateRules(state);
  const pseudo = getPseudoMovesForPiece(state, from, false);
  const powers = includePowers ? getSpecialPowerMoves(state, from) : [];
  const candidates = [...pseudo, ...powers];

  const hasKing = findKingSquare(state, currentSide) !== null;
  const enforceKingSafety =
    !rules.noCheckRestriction &&
    hasKing &&
    (!state.variant.victoryType ||
      state.variant.victoryType === 'checkmate_or_king' ||
      state.variant.victoryType === 'king_of_hill');

  if (!enforceKingSafety) {
    return candidates;
  }

  const legal: LegalMove[] = [];
  for (const move of candidates) {
    const sim = applyMoveRaw(state, move);
    const kSq = findKingSquare(sim, currentSide);
    if (kSq === null || !isSquareAttackedByEnemy(sim, kSq, currentSide)) {
      legal.push(move);
    }
  }
  return legal;
}

export function getLegalMovesForSquare(
  state: GameState,
  from: number,
  includePowers = true
): LegalMove[] {
  const legal = getCheckLegalMovesForSquare(state, from, includePowers);
  const rules = getStateRules(state);
  if (!rules.mandatoryCapture || legal.length === 0) {
    return legal;
  }

  const currentSide = getCurrentTurnSide(state);
  let anyCaptureExists = legal.some((m) => m.captureIndex !== undefined);
  if (!anyCaptureExists) {
    for (const [idxStr, p] of Object.entries(state.pieces)) {
      const sq = Number(idxStr);
      if (p.side === currentSide && sq !== from) {
        if (
          getCheckLegalMovesForSquare(state, sq, includePowers).some(
            (m) => m.captureIndex !== undefined
          )
        ) {
          anyCaptureExists = true;
          break;
        }
      }
    }
  }

  return anyCaptureExists ? legal.filter((m) => m.captureIndex !== undefined) : legal;
}

export function getAllLegalMovesForSide(
  state: GameState,
  side: PlayerSide,
  includePowers = true
): LegalMove[] {
  if (state.winner) return [];
  const all: LegalMove[] = [];
  for (const [idxStr, p] of Object.entries(state.pieces)) {
    if (p.side === side) {
      all.push(...getCheckLegalMovesForSquare(state, Number(idxStr), includePowers));
    }
  }
  const rules = getStateRules(state);
  if (rules.mandatoryCapture && all.some((m) => m.captureIndex !== undefined)) {
    return all.filter((m) => m.captureIndex !== undefined);
  }
  return all;
}

export function explainBlockedMove(
  state: GameState,
  from: number,
  to: number
): string | null {
  const piece = state.pieces[from];
  if (!piece) return null;
  const rules = getStateRules(state);
  const customDef = state.customPieceMap[piece.pieceId];
  const allCustomPieces = Object.values(state.customPieceMap || {});

  if (rules.immobilePieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))) {
    return 'Règle de la variante : cette pièce est immobile et ne peut pas se déplacer.';
  }

  // Check if the piece could move there if variant rules were ignored
  const unrestrictedMoves = getPseudoMovesForPiece(state, from, false, true);
  const candidate = unrestrictedMoves.find((m) => m.to === to);
  if (!candidate) {
    if (rules.mandatoryCapture) {
      const allLegal = getAllLegalMovesForSide(state, piece.side, true);
      if (allLegal.some((m) => m.captureIndex !== undefined)) {
        return 'Prise obligatoire : vous devez jouer une capture disponible.';
      }
    }
    return null;
  }

  const cols = state.board.cols;
  const r0 = Math.floor(from / cols);
  const c0 = from % cols;
  const r1 = Math.floor(to / cols);
  const c1 = to % cols;
  const [fdr, fdc] = getForwardDirection(piece.side);
  const dot = (r1 - r0) * fdr + (c1 - c0) * fdc;

  const dr = r1 - r0;
  const dc = c1 - c0;
  if (
    Math.abs(dr) > 0 &&
    Math.abs(dr) === Math.abs(dc) &&
    rules.forbidDiagonalPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))
  ) {
    return 'Règle de la variante : déplacement en diagonale interdit pour cette pièce.';
  }
  if (
    (dr === 0 || dc === 0) &&
    rules.forbidOrthogonalPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side))
  ) {
    return 'Règle de la variante : déplacement en ligne droite interdit pour cette pièce.';
  }

  const pieceCap = Object.entries(rules.pieceMaxSteps).reduce((acc, [filter, cap]) => {
    if (cap > 0 && doesPieceMatchFilter(piece.pieceId, filter, piece.side)) {
      return acc > 0 ? Math.min(acc, cap) : cap;
    }
    return acc;
  }, rules.maxStepsPerMove || 0);
  if (pieceCap > 0 && Math.max(Math.abs(dr), Math.abs(dc)) > pieceCap) {
    return `Règle de la variante : portée maximale de ${pieceCap} case(s) pour cette pièce.`;
  }

  if (
    dot < 0 &&
    isPieceBackwardForbidden(rules, piece.pieceId, from, to, state.board, customDef, piece.side)
  ) {
    return 'Règle de la variante : cette pièce ne peut pas reculer.';
  }

  const { noSideways, strictlyForward } = isPieceSidewaysForbidden(
    rules,
    piece.pieceId,
    customDef,
    piece.side
  );
  if ((strictlyForward || noSideways) && dot === 0) {
    return 'Règle de la variante : déplacement latéral interdit pour cette pièce.';
  }

  if (!isSpecialEntryAllowed(rules, state.board, piece.pieceId, to, piece.side)) {
    return 'Règle de la variante : cette pièce n’a pas le droit d’entrer sur cette case spéciale ✦.';
  }

  if (!isSquareColorAllowed(rules, piece.pieceId, to, cols, piece.side)) {
    return 'Règle de la variante : cette pièce ne peut pas aller sur une case de cette couleur.';
  }

  if (
    rules.forbidJumpPieces.some((f) => doesPieceMatchFilter(piece.pieceId, f, piece.side)) &&
    ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))
  ) {
    const legR = r0 + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
    const legC = c0 + (Math.abs(dc) === 2 ? Math.sign(dc) : 0);
    const legSq = legR * cols + legC;
    if (state.pieces[legSq]) {
      return 'Règle de la variante : cette pièce n’a pas le droit de sauter par-dessus une autre pièce.';
    }
  }

  const victimSq = candidate.captureIndex ?? to;
  const victim = state.pieces[victimSq];
  const victimIsAllied = victim ? areSidesAllied(rules, piece.side, victim.side) : false;
  if (
    victim &&
    (!victimIsAllied ||
      (victim.side === piece.side ? rules.allowFriendlyCapture : rules.allowTeammateCapture))
  ) {
    const isVictimDefended =
      rules.protectedByAllyUncapturable &&
      !isKingPiece(victim.pieceId, state.customPieceMap) &&
      isSquareDefendedByAlly(state, victimSq, victim.side);

    const capCheck = canPieceCaptureTarget(
      rules,
      state.board,
      piece.pieceId,
      from,
      victim.pieceId,
      victimSq,
      allCustomPieces,
      state.fullMoveNumber,
      {
        attackerValue: getPieceValue(piece.pieceId, state.customPieceMap),
        victimValue: getPieceValue(victim.pieceId, state.customPieceMap),
        isVictimDefended,
        isBackwardMove: dot < 0,
        attackerSide: piece.side,
        victimSide: victim.side,
      }
    );
    if (!capCheck.allowed && capCheck.reason) {
      return `Règle de la variante : ${capCheck.reason}`;
    }
  }

  if (candidate.isCastle && rules.disableCastling) {
    return 'Règle de la variante : le roque est interdit.';
  }
  if (candidate.isEnPassant && rules.disableEnPassant) {
    return 'Règle de la variante : la prise en passant est interdite.';
  }
  if (
    piece.pieceId === 'builtin:P' &&
    Math.abs(r1 - r0) === 2 &&
    rules.disablePawnDoubleStep
  ) {
    return 'Règle de la variante : les pions ne peuvent avancer que d’une case.';
  }
  if (rules.mandatoryCapture) {
    return 'Prise obligatoire : vous devez effectuer une capture.';
  }

  return null;
}

function applyMoveRaw(prevState: GameState, move: LegalMove): GameState {
  const state = cloneGameState(prevState);
  const moving = state.pieces[move.from];
  if (!moving) return state;

  // Handle special powers first
  if (move.isPower) {
    if (moving.powerUsesLeft > 0) moving.powerUsesLeft -= 1;
    if (move.isPower === 'teleport') {
      delete state.pieces[move.from];
      moving.hasMoved = true;
      state.pieces[move.to] = moving;
    } else if (move.isPower === 'invisibility') {
      moving.invisibleTurns = 2;
    } else if (move.isPower === 'shield') {
      moving.shielded = true;
    } else if (move.isPower === 'transform') {
      moving.pieceId = move.promotionPieceId || 'builtin:Q';
    } else if (move.isPower === 'duplicate') {
      state.pieces[move.to] = {
        ...moving,
        uid: `dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        powerUsesLeft: 0,
      };
    } else if (move.isPower === 'manipulate' && move.powerTarget !== undefined) {
      const targetPiece = state.pieces[move.to];
      if (targetPiece) {
        delete state.pieces[move.to];
        state.pieces[move.powerTarget] = targetPiece;
      }
    }
    return state;
  }

  const rules = getStateRules(state);

  // Handle Shield absorption on capture
  const victimIdx = move.captureIndex ?? move.to;
  const victim = state.pieces[victimIdx];
  const victimIsAllied = victim ? areSidesAllied(rules, moving.side, victim.side) : false;
  const isCaptureTarget = Boolean(
    victim &&
      (!victimIsAllied ||
        (victim.side === moving.side ? rules.allowFriendlyCapture : rules.allowTeammateCapture))
  );
  if (victim && isCaptureTarget && victim.shielded) {
    // Shield absorbs the attack!
    victim.shielded = false;
    return state;
  }

  // En passant reset
  const prevEpVictim = state.enPassantVictim;
  state.enPassantTarget = null;
  state.enPassantVictim = null;

  if (moving.pieceId === 'builtin:P') {
    const r0 = Math.floor(move.from / state.board.cols);
    const r1 = Math.floor(move.to / state.board.cols);
    if (Math.abs(r1 - r0) === 2) {
      const midR = (r0 + r1) / 2;
      const c0 = move.from % state.board.cols;
      state.enPassantTarget = midR * state.board.cols + c0;
      state.enPassantVictim = move.to;
    }
  }

  let capturedSuccessful = false;
  if (move.isEnPassant && prevEpVictim !== null && state.pieces[prevEpVictim]) {
    delete state.pieces[prevEpVictim];
    state.capturesCount[moving.side] += 1;
    capturedSuccessful = true;
  } else if (victim && isCaptureTarget) {
    delete state.pieces[victimIdx];
    state.capturesCount[moving.side] += 1;
    capturedSuccessful = true;
  }

  delete state.pieces[move.from];
  moving.hasMoved = true;

  if (capturedSuccessful && (rules.kamikazeOnCapture || rules.atomicCapture)) {
    if (rules.atomicCapture) {
      const { rows, cols } = state.board;
      const vr = Math.floor(victimIdx / cols);
      const vc = victimIdx % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nr = vr + dr;
        const nc = vc + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const adjSq = nr * cols + nc;
          const adjP = state.pieces[adjSq];
          if (adjP && adjP.pieceId !== 'builtin:P') {
            delete state.pieces[adjSq];
          }
        }
      }
    }
    return state;
  }

  if (move.promotionPieceId) {
    moving.pieceId = move.promotionPieceId;
  } else if (
    capturedSuccessful &&
    rules.promoteOnCapturePieces.some((f) => doesPieceMatchFilter(moving.pieceId, f, moving.side)) &&
    !isKingPiece(moving.pieceId, state.customPieceMap)
  ) {
    moving.pieceId = rules.promoteOnCaptureTarget || 'builtin:Q';
  }

  // Castling rook move
  if (move.isCastle) {
    const row = Math.floor(move.to / state.board.cols);
    if (move.isCastle === 'kingside') {
      const rFrom = row * state.board.cols + 7;
      const rTo = row * state.board.cols + 5;
      if (state.pieces[rFrom]) {
        state.pieces[rTo] = { ...state.pieces[rFrom], hasMoved: true };
        delete state.pieces[rFrom];
      }
    } else {
      const rFrom = row * state.board.cols;
      const rTo = row * state.board.cols + 3;
      if (state.pieces[rFrom]) {
        state.pieces[rTo] = { ...state.pieces[rFrom], hasMoved: true };
        delete state.pieces[rFrom];
      }
    }
  }

  let finalIndex = move.to;

  // Special square effects when landing (supports dropdown OR descriptive text)!
  if (state.board.special?.includes(move.to)) {
    const eff = rules.effectiveSpecialEffect;
    if (eff === 'teleport' && state.board.special.length > 1) {
      const others = state.board.special.filter((sq) => sq !== move.to && !state.pieces[sq]);
      if (others.length > 0) {
        finalIndex = others[0];
      }
    } else if (eff === 'promote' && !isKingPiece(moving.pieceId, state.customPieceMap)) {
      moving.pieceId = rules.specialPromoteTarget || 'builtin:Q';
    } else if (eff === 'shield') {
      moving.shielded = true;
    } else if (eff === 'freeze') {
      moving.frozenTurns = 2;
    } else if (eff === 'trap' && !isKingPiece(moving.pieceId, state.customPieceMap)) {
      // Piece is destroyed by trap
      return state;
    }
  }

  state.pieces[finalIndex] = moving;
  return state;
}

export function applyMove(prevState: GameState, move: LegalMove): GameState {
  if (prevState.winner) return prevState;
  const currentSide = getCurrentTurnSide(prevState);
  const movingBefore = prevState.pieces[move.from];
  if (!movingBefore || movingBefore.side !== currentSide) return prevState;

  const isCaptureOrPawn =
    Boolean(move.captureIndex !== undefined && prevState.pieces[move.captureIndex]) ||
    movingBefore.pieceId === 'builtin:P';

  const state = applyMoveRaw(prevState, move);
  const rules = getStateRules(state);
  state.halfMoveClock = isCaptureOrPawn ? 0 : prevState.halfMoveClock + 1;

  // Special square double_action
  if (
    !move.isPower &&
    state.board.special?.includes(move.to) &&
    rules.effectiveSpecialEffect === 'double_action' &&
    !state.bonusActionGrantedThisTurn
  ) {
    state.actionsRemaining += 1;
    state.bonusActionGrantedThisTurn = true;
  }

  // Bonus action after capture ("après une capture, on rejoue")
  const victimBefore = move.captureIndex !== undefined ? prevState.pieces[move.captureIndex] : undefined;
  const victimWasAllied = victimBefore
    ? areSidesAllied(rules, currentSide, victimBefore.side)
    : false;
  if (
    !move.isPower &&
    rules.extraActionOnCapture &&
    victimBefore &&
    !victimBefore.shielded &&
    (!victimWasAllied ||
      (victimBefore.side === currentSide ? rules.allowFriendlyCapture : rules.allowTeammateCapture))
  ) {
    state.actionsRemaining += 1;
  }

  // Record algebraic/readable notation
  const fromCoord = squareToCoord(move.from, state.board.cols, state.board.rows);
  const toCoord = squareToCoord(move.to, state.board.cols, state.board.rows);
  const sym = getPieceDisplaySymbol(movingBefore.pieceId, currentSide, state.customPieceMap);
  const label = move.isPower
    ? `${sym} ${fromCoord} (${move.description || move.isPower})`
    : move.isCastle === 'kingside'
      ? 'O-O'
      : move.isCastle === 'queenside'
        ? 'O-O-O'
        : `${sym} ${fromCoord}${move.captureIndex !== undefined ? '×' : '→'}${toCoord}`;

  state.moveHistory.push(label);
  state.lastMove = { from: move.from, to: move.to, description: label };

  const setWinnerForSide = (winSide: PlayerSide, soloReason: string, teamReasonPrefix: string) => {
    const team = getTeamSides(rules, winSide).filter((m) => state.activeSides.includes(m));
    state.winner = winSide;
    state.winningTeam = team.length > 1 ? team : null;
    state.endReason = team.length > 1 ? `L’équipe ${formatTeamLabel(team)} ${teamReasonPrefix}` : soloReason;
    state.inCheckSides = [];
  };

  // Reverse win (Antichess / Qui-perd-gagne)
  if (rules.reverseWin) {
    for (const s of state.activeSides) {
      const sidePieces = Object.values(state.pieces).filter((p) => p.side === s);
      if (sidePieces.length === 0) {
        setWinnerForSide(
          s,
          `${SIDE_LABELS[s]} n’ont plus aucune pièce et remportent la partie (Qui-perd-gagne) !`,
          'remporte la partie (Qui-perd-gagne) !'
        );
        return state;
      }
    }
  }

  // Check if any side lost all pieces or lost their king
  const newlyEliminated: PlayerSide[] = [];
  for (const s of state.activeSides) {
    if (state.eliminatedSides.includes(s)) continue;
    const sidePieces = Object.values(state.pieces).filter((p) => p.side === s);
    const hasKing = sidePieces.some((p) => isKingPiece(p.pieceId, state.customPieceMap));
    const startedWithKing = Object.values(prevState.pieces).some(
      (p) => p.side === s && isKingPiece(p.pieceId, state.customPieceMap)
    );
    if (
      sidePieces.length === 0 ||
      (startedWithKing && !hasKing && !rules.reverseWin && state.variant.victoryType !== 'eliminate_all')
    ) {
      newlyEliminated.push(s);
    }
  }
  for (const s of newlyEliminated) {
    if (!state.eliminatedSides.includes(s)) state.eliminatedSides.push(s);
    if (rules.teamSharedElimination) {
      for (const ally of getTeamSides(rules, s)) {
        if (state.activeSides.includes(ally) && !state.eliminatedSides.includes(ally)) {
          state.eliminatedSides.push(ally);
        }
      }
    }
  }

  const remainingGroups = getRemainingTeamGroups(rules, state.activeSides, state.eliminatedSides);
  if (remainingGroups.length === 0) {
    state.winner = 'draw';
    state.winningTeam = null;
    state.endReason = 'Tous les camps ont été éliminés simultanément (match nul).';
    state.inCheckSides = [];
    return state;
  }
  if (remainingGroups.length === 1) {
    const winGroup = remainingGroups[0];
    const leadSide = winGroup.includes(currentSide) ? currentSide : winGroup[0];
    state.winner = leadSide;
    state.winningTeam = winGroup.length > 1 ? winGroup : null;
    state.endReason =
      winGroup.length > 1
        ? `L’équipe ${formatTeamLabel(winGroup)} remporte la partie !`
        : `${SIDE_LABELS[leadSide]} remportent la partie !`;
    state.inCheckSides = [];
    return state;
  }

  // King of the Hill special victory
  if (
    state.variant.victoryType === 'king_of_hill' ||
    (state.board.special?.length && rules.effectiveSpecialEffect === 'king_hill')
  ) {
    for (const sq of state.board.special || []) {
      const p = state.pieces[sq];
      if (p && isKingPiece(p.pieceId, state.customPieceMap)) {
        setWinnerForSide(
          p.side,
          `${SIDE_LABELS[p.side]} atteignent la case royale !`,
          'atteint la case royale !'
        );
        return state;
      }
    }
  }

  // Special-square occupancy victory from parsed rules
  if (rules.specialWinPieces.length > 0 && (state.board.special?.length || 0) > 0) {
    for (const sq of state.board.special || []) {
      const p = state.pieces[sq];
      if (p && rules.specialWinPieces.some((f) => doesPieceMatchFilter(p.pieceId, f, p.side))) {
        setWinnerForSide(
          p.side,
          `${SIDE_LABELS[p.side]} atteignent une case spéciale ✦ victorieuse !`,
          'atteint une case spéciale ✦ victorieuse !'
        );
        return state;
      }
    }
  }

  // Reach opposite rank victory from parsed rules
  if (rules.reachOppositeRankPieces.length > 0) {
    const { rows, cols } = state.board;
    for (const [idxStr, p] of Object.entries(state.pieces)) {
      if (!rules.reachOppositeRankPieces.some((f) => doesPieceMatchFilter(p.pieceId, f, p.side))) continue;
      const idx = Number(idxStr);
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const [fdr, fdc] = getForwardDirection(p.side);
      const reached =
        (fdr === -1 && r === 0) ||
        (fdr === 1 && r === rows - 1) ||
        (fdc === 1 && c === cols - 1) ||
        (fdc === -1 && c === 0);
      if (reached) {
        setWinnerForSide(
          p.side,
          `${SIDE_LABELS[p.side]} atteignent la dernière rangée avec ${getPieceName(p.pieceId, state.customPieceMap)} !`,
          `atteint la dernière rangée avec ${getPieceName(p.pieceId, state.customPieceMap)} !`
        );
        return state;
      }
    }
  }

  // Capture count victory (structured victoryType OR parsed capture target rule)
  if (state.variant.victoryType === 'capture_count' || rules.captureTargetOverride > 0) {
    const target =
      rules.captureTargetOverride > 0
        ? rules.captureTargetOverride
        : Math.max(1, state.variant.captureTarget || 5);
    const currentTeam = getTeamSides(rules, currentSide).filter((m) => state.activeSides.includes(m));
    const teamCaptures =
      currentTeam.length > 1
        ? currentTeam.reduce((sum, m) => sum + (state.capturesCount[m] || 0), 0)
        : state.capturesCount[currentSide] || 0;
    if (teamCaptures >= target) {
      setWinnerForSide(
        currentSide,
        `${SIDE_LABELS[currentSide]} atteignent ${target} captures !`,
        `atteint ${target} captures !`
      );
      return state;
    }
  }

  // Decrement actionsRemaining or advance turn
  state.actionsRemaining -= 1;
  if (state.actionsRemaining <= 0) {
    for (const p of Object.values(state.pieces)) {
      if (p.side === currentSide) {
        if (p.invisibleTurns > 0) p.invisibleTurns -= 1;
        if (p.frozenTurns > 0) p.frozenTurns -= 1;
      }
    }

    let nextIdx = (state.turnIndex + 1) % state.activeSides.length;
    let guard = 0;
    while (state.eliminatedSides.includes(state.activeSides[nextIdx]) && guard < state.activeSides.length) {
      nextIdx = (nextIdx + 1) % state.activeSides.length;
      guard++;
    }
    if (nextIdx <= state.turnIndex) {
      state.fullMoveNumber += 1;
    }
    state.turnIndex = nextIdx;
    state.actionsRemaining = Math.max(
      1,
      rules.actionsPerTurnOverride || state.variant.actions || 1
    );
    state.bonusActionGrantedThisTurn = false;
  }

  state.inCheckSides = computeInCheckSides(state);

  // N-Checks victory (e.g. Trois échecs)
  if (rules.checksTarget > 0) {
    const checkingEnemy = state.inCheckSides.some((s) => !areSidesAllied(rules, currentSide, s));
    if (checkingEnemy) {
      state.checksDelivered[currentSide] = (state.checksDelivered[currentSide] || 0) + 1;
      const currentTeam = getTeamSides(rules, currentSide).filter((m) => state.activeSides.includes(m));
      const teamChecks =
        currentTeam.length > 1
          ? currentTeam.reduce((sum, m) => sum + (state.checksDelivered[m] || 0), 0)
          : state.checksDelivered[currentSide];
      if (teamChecks >= rules.checksTarget) {
        setWinnerForSide(
          currentSide,
          `${SIDE_LABELS[currentSide]} remportent la partie avec ${rules.checksTarget} échecs !`,
          `remporte la partie avec ${rules.checksTarget} échecs !`
        );
        return state;
      }
    }
  }

  // Check checkmate / stalemate for next active player (team-aware)
  const advanceToNextAliveSide = () => {
    let nxt = (state.turnIndex + 1) % state.activeSides.length;
    let g = 0;
    while (state.eliminatedSides.includes(state.activeSides[nxt]) && g < state.activeSides.length) {
      nxt = (nxt + 1) % state.activeSides.length;
      g++;
    }
    state.turnIndex = nxt;
  };

  const nextSide = getCurrentTurnSide(state);
  const nextMoves = getAllLegalMovesForSide(state, nextSide, true);
  if (nextMoves.length === 0) {
    if (rules.reverseWin) {
      setWinnerForSide(
        nextSide,
        `Plus aucun coup légal pour les ${SIDE_LABELS[nextSide]} — victoire Qui-perd-gagne !`,
        'remporte la partie (Qui-perd-gagne) !'
      );
    } else if (state.inCheckSides.includes(nextSide) || rules.stalemateWins) {
      const wasCheckmate = state.inCheckSides.includes(nextSide);
      if (!state.eliminatedSides.includes(nextSide)) {
        state.eliminatedSides.push(nextSide);
      }
      if (rules.teamSharedElimination) {
        for (const ally of getTeamSides(rules, nextSide)) {
          if (state.activeSides.includes(ally) && !state.eliminatedSides.includes(ally)) {
            state.eliminatedSides.push(ally);
          }
        }
      }
      const stillGroups = getRemainingTeamGroups(rules, state.activeSides, state.eliminatedSides);
      if (stillGroups.length === 0) {
        state.winner = 'draw';
        state.winningTeam = null;
        state.endReason = 'Match nul.';
      } else if (stillGroups.length === 1) {
        const winGroup = stillGroups[0];
        const leadSide = winGroup.includes(currentSide) ? currentSide : winGroup[0];
        state.winner = leadSide;
        state.winningTeam = winGroup.length > 1 ? winGroup : null;
        if (wasCheckmate) {
          state.endReason =
            winGroup.length > 1
              ? `Échec et mat ! Victoire de l’équipe ${formatTeamLabel(winGroup)}.`
              : `Échec et mat ! Victoire des ${SIDE_LABELS[leadSide]}.`;
        } else {
          state.endReason =
            winGroup.length > 1
              ? `Pat ! Victoire de l’équipe ${formatTeamLabel(winGroup)} (le pat fait gagner).`
              : `Pat ! Victoire des ${SIDE_LABELS[leadSide]} (le pat fait gagner).`;
        }
        state.inCheckSides = [];
      } else {
        advanceToNextAliveSide();
      }
    } else {
      // Stalemate: check if an alive teammate can still play
      const aliveTeammates = getTeamSides(rules, nextSide).filter(
        (m) => m !== nextSide && state.activeSides.includes(m) && !state.eliminatedSides.includes(m)
      );
      const allyWithMoves = aliveTeammates.find((ally) => {
        const allyIdx = state.activeSides.indexOf(ally);
        if (allyIdx < 0) return false;
        const probeState = { ...state, turnIndex: allyIdx };
        return getAllLegalMovesForSide(probeState, ally, true).length > 0;
      });
      if (allyWithMoves) {
        advanceToNextAliveSide();
      } else if (remainingGroups.length > 2) {
        for (const m of getTeamSides(rules, nextSide)) {
          if (state.activeSides.includes(m) && !state.eliminatedSides.includes(m)) {
            state.eliminatedSides.push(m);
          }
        }
        const stillGroups = getRemainingTeamGroups(rules, state.activeSides, state.eliminatedSides);
        if (stillGroups.length === 1) {
          const winGroup = stillGroups[0];
          state.winner = winGroup[0];
          state.winningTeam = winGroup.length > 1 ? winGroup : null;
          state.endReason =
            winGroup.length > 1
              ? `L’équipe ${formatTeamLabel(winGroup)} remporte la partie !`
              : `${SIDE_LABELS[winGroup[0]]} remportent la partie !`;
        } else {
          advanceToNextAliveSide();
        }
      } else {
        state.winner = 'draw';
        state.winningTeam = null;
        state.endReason = 'Pat — Aucun coup légal disponible (match nul).';
      }
    }
  } else if (state.halfMoveClock >= 100) {
    state.winner = 'draw';
    state.winningTeam = null;
    state.endReason = 'Règle des 50 coups sans prise ni mouvement de pion (match nul).';
  }

  return state;
}
