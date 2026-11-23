import type {
  BoardConfig,
  CaptureRestrictionCondition,
  PieceDef,
  PieceTargetFilter,
  PlayerSide,
  SpecialCellEffectType,
  Variant,
  VariantCaptureRestriction,
  VariantRuleConfig,
} from '../types/chess';

export interface DetectedRuleBadge {
  label: string;
  source: 'structured' | 'text' | 'board' | 'piece';
  category: 'movement' | 'capture' | 'special' | 'victory' | 'general';
}

export interface CompiledVariantRules {
  noBackwardAll: boolean;
  noBackwardPieces: string[];
  noBackwardExemptPieces: string[];
  noBackwardExceptSpecial: boolean;
  noBackwardCaptureAll: boolean;
  noBackwardCapturePieces: string[];
  allowPawnBackward: boolean;
  allowPawnBackwardSides: PlayerSide[];
  pawnCaptureForward: boolean;
  berolinaPawns: boolean;
  alwaysPawnDoubleStep: boolean;
  pawnInitialSteps: number; // default 2
  allCanJump: boolean;
  canJumpPieces: string[];
  forbidJumpPieces: string[];
  immobilePieces: string[];
  forbidDiagonalPieces: string[];
  forbidOrthogonalPieces: string[];
  grantPieceMoves: Record<string, string[]>;
  replacePieceMoves: Record<string, string[]>;
  specialGrantPieceMoves: Record<string, string[]>;
  pieceMaxSteps: Record<string, number>;
  noSidewaysPieces: string[];
  strictlyForwardPieces: string[];
  onlyLightSquarePieces: string[];
  onlyDarkSquarePieces: string[];
  forbidLightSquarePieces: string[];
  forbidDarkSquarePieces: string[];
  mandatoryCapture: boolean;
  allowFriendlyCapture: boolean;
  noCaptureBeforeTurn: number; // 0 = allowed from turn 1
  extraActionOnCapture: boolean;
  promoteOnCapturePieces: string[];
  promoteOnCaptureTarget: string;
  specialPromoteTarget: string;
  kamikazeOnCapture: boolean;
  atomicCapture: boolean;
  protectedByAllyUncapturable: boolean;
  captureValueRule: 'none' | 'equal_or_weaker' | 'strictly_weaker' | 'same_piece_only' | 'not_same_piece';
  actionsPerTurnOverride: number; // 0 = use variant.actions
  captureTargetOverride: number; // 0 = use variant.captureTarget
  disableCastling: boolean;
  disableEnPassant: boolean;
  disablePawnDoubleStep: boolean;
  disablePromotion: boolean;
  promoteToPieceId?: string;
  noCheckRestriction: boolean;
  specialProtected: boolean;
  specialCaptureOnly: boolean;
  forbiddenSpecialPieces: string[];
  onlySpecialPieces: string[];
  maxStepsPerMove: number; // 0 = unlimited
  wrapHorizontal: boolean;
  noCapturePieces: string[];
  captureRestrictions: VariantCaptureRestriction[];
  checksTarget: number; // 0 = disabled
  reverseWin: boolean;
  stalemateWins: boolean;
  reachOppositeRankPieces: string[];
  specialWinPieces: string[];
  effectiveSpecialEffect: SpecialCellEffectType;
  turnOrderSides: PlayerSide[];
  hasCustomTurnOrder: boolean;
  teams: PlayerSide[][];
  teamSharedElimination: boolean;
  allowTeammateCapture: boolean;
  allowPieceDrops: boolean;
  pieceEvolutionOnCaptures: {
    filter: string;
    threshold: number;
    becomePieceId?: string;
    grantPieceId?: string;
    becomeImmobile?: boolean;
    label: string;
  }[];
  timedRules: {
    kind: 'unlock_backward_after' | 'enable_jump_after' | 'rotate_special_effect' | 'global_immobile_until';
    turnThreshold: number;
    interval?: number;
    targetFilter?: string;
    effectsCycle?: SpecialCellEffectType[];
    label: string;
  }[];
  hasAnyCustomEnforcement: boolean;
  activeRules: DetectedRuleBadge[];
  unrecognizedSentences: string[];
}

export interface ParsedPieceConfig {
  forwardOnly: boolean;
  strictlyForward: boolean;
  noSideways: boolean;
  noCapture: boolean;
  extraLeaps: [number, number][];
  extraSlides: [number, number][];
  nightrider: boolean;
  berolina: boolean;
  extraRange?: number;
  canJump?: boolean;
  powerConditions: {
    requireNotInCheck: boolean;
    requireInCheck: boolean;
    minTurn: number;
    maxTurn: number;
    requireOnSpecial: boolean;
    requireNotOnSpecial: boolean;
    requireNotMoved: boolean;
    requireMoved: boolean;
  };
  inferredPowerType?: PieceDef['powerType'];
  recognizedNotes: string[];
}

export function normalizeFr(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const BUILTIN_PIECE_LABELS: Record<string, string> = {
  all: 'Toutes les pièces',
  custom: 'Pièces personnalisées',
  'builtin:P': 'Pion',
  'builtin:N': 'Cavalier',
  'builtin:B': 'Fou',
  'builtin:R': 'Tour',
  'builtin:Q': 'Dame',
  'builtin:K': 'Roi',
};

const EXTRA_BUILTIN_LABELS: Record<string, string> = {
  ...BUILTIN_PIECE_LABELS,
  builtin: 'Pièces classiques',
};

const SIDE_ADJECTIVES_PLURAL: Record<PlayerSide, string> = {
  white: 'blanches',
  black: 'noires',
  red: 'rouges',
  blue: 'bleues',
  green: 'vertes',
  gold: 'dorées',
};

const SIDE_NOUNS_PLURAL: Record<PlayerSide, string> = {
  white: 'Blancs',
  black: 'Noirs',
  red: 'Rouges',
  blue: 'Bleus',
  green: 'Verts',
  gold: 'Or',
};

const VALID_PLAYER_SIDES = new Set<PlayerSide>(['white', 'black', 'red', 'blue', 'green', 'gold']);

export function parsePieceFilter(filter: PieceTargetFilter): { base: string; side?: PlayerSide } {
  const idx = filter.lastIndexOf('@');
  if (idx > 0) {
    const side = filter.slice(idx + 1) as PlayerSide;
    if (VALID_PLAYER_SIDES.has(side)) {
      return { base: filter.slice(0, idx), side };
    }
  }
  return { base: filter };
}

export function getPieceFilterLabel(
  filter: PieceTargetFilter,
  customPieces: PieceDef[] = []
): string {
  const { base, side } = parsePieceFilter(filter);
  if (side && base === 'all') {
    return `Pièces ${SIDE_ADJECTIVES_PLURAL[side]}`;
  }
  const baseLabel =
    EXTRA_BUILTIN_LABELS[base] ||
    customPieces.find((p) => p.id === base)?.name ||
    base;
  if (side) {
    return `${baseLabel} (${SIDE_NOUNS_PLURAL[side]})`;
  }
  return baseLabel;
}

export function doesPieceMatchFilter(
  pieceId: string,
  filter: PieceTargetFilter,
  pieceSide?: PlayerSide
): boolean {
  const { base, side: filterSide } = parsePieceFilter(filter);
  if (filterSide && pieceSide !== filterSide) return false;
  if (base === 'all') return true;
  if (base === 'custom') return !pieceId.startsWith('builtin:');
  if (base === 'builtin') return pieceId.startsWith('builtin:');
  return pieceId === base;
}

function buildPieceKeywordMap(customPieces: PieceDef[]): { keyword: string; pieceId: string }[] {
  const base: { keyword: string; pieceId: string }[] = [
    { keyword: 'cavaliers', pieceId: 'builtin:N' },
    { keyword: 'cavalier', pieceId: 'builtin:N' },
    { keyword: 'chevaux', pieceId: 'builtin:N' },
    { keyword: 'cheval', pieceId: 'builtin:N' },
    { keyword: 'knights', pieceId: 'builtin:N' },
    { keyword: 'knight', pieceId: 'builtin:N' },
    { keyword: 'fous', pieceId: 'builtin:B' },
    { keyword: 'fou', pieceId: 'builtin:B' },
    { keyword: 'bishops', pieceId: 'builtin:B' },
    { keyword: 'bishop', pieceId: 'builtin:B' },
    { keyword: 'tours', pieceId: 'builtin:R' },
    { keyword: 'tour', pieceId: 'builtin:R' },
    { keyword: 'rooks', pieceId: 'builtin:R' },
    { keyword: 'rook', pieceId: 'builtin:R' },
    { keyword: 'dames', pieceId: 'builtin:Q' },
    { keyword: 'dame', pieceId: 'builtin:Q' },
    { keyword: 'reines', pieceId: 'builtin:Q' },
    { keyword: 'reine', pieceId: 'builtin:Q' },
    { keyword: 'queens', pieceId: 'builtin:Q' },
    { keyword: 'queen', pieceId: 'builtin:Q' },
    { keyword: 'rois', pieceId: 'builtin:K' },
    { keyword: 'roi', pieceId: 'builtin:K' },
    { keyword: 'kings', pieceId: 'builtin:K' },
    { keyword: 'king', pieceId: 'builtin:K' },
    { keyword: 'pions', pieceId: 'builtin:P' },
    { keyword: 'pion', pieceId: 'builtin:P' },
    { keyword: 'pawns', pieceId: 'builtin:P' },
    { keyword: 'pawn', pieceId: 'builtin:P' },
  ];

  for (const cp of customPieces) {
    const cleanName = normalizeFr(cp.name);
    if (cleanName.length >= 2) {
      base.push({ keyword: `${cleanName}s`, pieceId: cp.id });
      base.push({ keyword: cleanName, pieceId: cp.id });
    }
  }

  // Sort longest first so "sentinelles" matches before "tour", etc.
  return base.sort((a, b) => b.keyword.length - a.keyword.length);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectColorsInSegment(seg: string): PlayerSide[] {
  const colors: PlayerSide[] = [];
  if (/\bblanc(?:he)?s?\b/.test(seg) || /\bwhites?\b/.test(seg)) colors.push('white');
  if (/\bnoire?s?\b/.test(seg) || /\bblacks?\b/.test(seg)) colors.push('black');
  if (/\brouges?\b/.test(seg) || /\breds?\b/.test(seg)) colors.push('red');
  if (/\bbleue?s?\b/.test(seg) || /\bblues?\b/.test(seg)) colors.push('blue');
  if (/\bvert(?:e)?s?\b/.test(seg) || /\bgreens?\b/.test(seg)) colors.push('green');
  if (
    /\b(?:dore(?:e)?s?|jaunes?|golds?)\b/.test(seg) ||
    /\b(?:pieces?|camp|equipe|joueur|pions?|cavaliers?|fous?|tours?|dames?|reines?|rois?)\s+or\b/.test(seg) ||
    /\b(?:et|avec|des|,)\s+or\b|\b(?:l['’]|les\s+)or\b/.test(seg)
  ) {
    colors.push('gold');
  }
  return colors;
}

export function extractSideMentionsInOrder(rawSegment: string): PlayerSide[] {
  const clean = normalizeFr(rawSegment).replace(
    /\b(?:sur\s+(?:une?|les?|des)\s+)?cases?\s+(?:blanches?|claires?|noires?|foncees?)\b/g,
    ' '
  );
  const patterns: { side: PlayerSide; re: RegExp }[] = [
    { side: 'white', re: /\b(?:blancs?|blanches?|white|j1|joueur\s*1)\b/g },
    { side: 'black', re: /\b(?:noirs?|noires?|black|j2|joueur\s*2)\b/g },
    { side: 'red', re: /\b(?:rouges?|red|j3|joueur\s*3)\b/g },
    { side: 'blue', re: /\b(?:bleus?|bleues?|blue|j4|joueur\s*4)\b/g },
    { side: 'green', re: /\b(?:verts?|vertes?|green|j5|joueur\s*5)\b/g },
    { side: 'gold', re: /\b(?:dore(?:e)?s?|jaunes?|golds?|j6|joueur\s*6)\b|\bor\b/g },
  ];
  const hits: { idx: number; side: PlayerSide }[] = [];
  for (const { side, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      hits.push({ idx: m.index, side });
    }
  }
  hits.sort((a, b) => a.idx - b.idx);
  const out: PlayerSide[] = [];
  for (const h of hits) {
    if (!out.includes(h.side)) out.push(h.side);
  }
  return out;
}

export function getTeamSides(
  compiled: Pick<CompiledVariantRules, 'teams'> | undefined,
  side: PlayerSide
): PlayerSide[] {
  const team = compiled?.teams?.find((g) => g.includes(side));
  return team && team.length > 0 ? team : [side];
}

export function areSidesAllied(
  compiled: Pick<CompiledVariantRules, 'teams'> | undefined,
  sideA: PlayerSide,
  sideB: PlayerSide
): boolean {
  if (sideA === sideB) return true;
  if (!compiled?.teams || compiled.teams.length === 0) return false;
  return compiled.teams.some((g) => g.includes(sideA) && g.includes(sideB));
}

export function getRemainingTeamGroups(
  compiled: Pick<CompiledVariantRules, 'teams'> | undefined,
  activeSides: PlayerSide[],
  eliminatedSides: PlayerSide[]
): PlayerSide[][] {
  const alive = activeSides.filter((s) => !eliminatedSides.includes(s));
  const groups: PlayerSide[][] = [];
  const seen = new Set<PlayerSide>();
  for (const s of alive) {
    if (seen.has(s)) continue;
    const teamAlive = getTeamSides(compiled, s).filter((m) => alive.includes(m));
    for (const m of teamAlive) seen.add(m);
    groups.push(teamAlive.length > 0 ? teamAlive : [s]);
  }
  return groups;
}

export function formatTeamLabel(teamSides: PlayerSide[]): string {
  return teamSides.map((s) => SIDE_NOUNS_PLURAL[s] || s).join(' & ');
}

function extractPieceRefs(
  fragment: string,
  keywordMap: { keyword: string; pieceId: string }[]
): string[] {
  const clean = normalizeFr(fragment);
  // Strip square color phrases BEFORE inspecting piece colors so "cases noires" never tags a piece as @black
  const noSquareColors = clean.replace(
    /\b(?:sur\s+(?:une?|les?|des)\s+)?cases?\s+(?:blanches?|claires?|noires?|foncees?)\b/g,
    ' '
  );

  const rawSegments = noSquareColors
    .split(/(?:\s*,\s*|\s+(?:et|ou|ni)\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const segments = rawSegments.length > 0 ? rawSegments : [noSquareColors];

  const parsedSegments = segments.map((seg) => {
    const pieceIds: string[] = [];
    for (const entry of keywordMap) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(entry.keyword)}(?:$|[^a-z0-9])`);
      if (re.test(seg)) {
        if (
          (entry.keyword === 'tour' || entry.keyword === 'tours') &&
          (/\b(?:au|du|le|ce|un|chaque|par|premier|1er|dernier|prochain|avant\s+le|apres\s+le|\d+e?)\s+tours?\b/.test(seg) ||
            /\btours?\s+de\s+jeu\b/.test(seg)) &&
          !/\b(?:la|les|une|des|cette|ces|de\s+la|d'une|aux?)\s+tours?\b/.test(seg)
        ) {
          continue;
        }
        if (!pieceIds.includes(entry.pieceId)) {
          pieceIds.push(entry.pieceId);
        }
      }
    }

    let baseGroup: 'custom' | 'builtin' | 'all' | null = null;
    if (pieceIds.length === 0) {
      if (/\b(?:pieces\s+personnalisees|pieces\s+custom|nouvelles\s+pieces)\b/.test(seg)) {
        baseGroup = 'custom';
      } else if (/\bpieces\s+(?:classiques|normales|de\s+base|standard)\b/.test(seg)) {
        baseGroup = 'builtin';
      } else if (
        /\b(?:toutes?\s+les\s+pieces|les\s+pieces|aucune?\s+piece|n'importe\s+quelle\s+piece|toute\s+piece|chaque\s+piece|pieces?|camp|equipe|joueur)\b/.test(
          seg
        )
      ) {
        baseGroup = 'all';
      }
    }

    const colors = detectColorsInSegment(seg);
    return { pieceIds, baseGroup, colors };
  });

  // Propagate a trailing shared color in phrases like "les pions et les fous blancs"
  const coloredSegs = parsedSegments.filter((s) => s.colors.length > 0);
  if (
    parsedSegments.length >= 2 &&
    coloredSegs.length === 1 &&
    coloredSegs[0] === parsedSegments[parsedSegments.length - 1] &&
    coloredSegs[0].colors.length === 1 &&
    coloredSegs[0].pieceIds.length > 0 &&
    parsedSegments.slice(0, -1).every((s) => s.pieceIds.length > 0 && s.colors.length === 0)
  ) {
    const sharedColor = coloredSegs[0].colors[0];
    for (let i = 0; i < parsedSegments.length - 1; i++) {
      parsedSegments[i].colors = [sharedColor];
    }
  }

  const found = new Set<string>();
  for (const seg of parsedSegments) {
    if (seg.pieceIds.length > 0) {
      for (const pid of seg.pieceIds) {
        if (seg.colors.length > 0) {
          for (const col of seg.colors) found.add(`${pid}@${col}`);
        } else {
          found.add(pid);
        }
      }
    } else if (seg.colors.length > 0) {
      const grp = seg.baseGroup || 'all';
      for (const col of seg.colors) {
        found.add(`${grp}@${col}`);
      }
    } else if (seg.baseGroup) {
      found.add(seg.baseGroup);
    }
  }

  return Array.from(found);
}

function parseFrenchNumber(wordOrDigits: string): number | null {
  const clean = normalizeFr(wordOrDigits);
  const numMap: Record<string, number> = {
    un: 1,
    une: 1,
    premier: 1,
    premiere: 1,
    deux: 2,
    deuxieme: 2,
    trois: 3,
    troisieme: 3,
    quatre: 4,
    quatrieme: 4,
    cinq: 5,
    cinquieme: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
  };
  if (numMap[clean] !== undefined) return numMap[clean];
  const digits = clean.match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

export function resolveEffectiveSpecialEffect(board: BoardConfig): SpecialCellEffectType {
  if (board.specialEffectType && board.specialEffectType !== 'none') {
    return board.specialEffectType;
  }
  const clean = normalizeFr(board.specialEffect || '');
  if (!clean) return 'none';
  if (clean.includes('teleport') || clean.includes('portail')) return 'teleport';
  if (clean.includes('promou') || clean.includes('promotion') || clean.includes('en dame')) return 'promote';
  if (clean.includes('bouclier') || clean.includes('shield')) return 'shield';
  if (clean.includes('+1 action') || clean.includes('double action') || clean.includes('rejou')) return 'double_action';
  if (clean.includes('gele') || clean.includes('gel') || clean.includes('paralyse') || clean.includes('bloque la piece')) return 'freeze';
  if (clean.includes('piege') || clean.includes('detrui')) return 'trap';
  if (clean.includes('roi') && (clean.includes('gagn') || clean.includes('victoire') || clean.includes('royale'))) return 'king_hill';
  return 'none';
}

export function parseTurnOrderSides(turnOrder: string, playerCount: number): {
  sides: PlayerSide[];
  isCustom: boolean;
} {
  const defaultOrder: PlayerSide[] = (['white', 'black', 'red', 'blue', 'green', 'gold'] as PlayerSide[]).slice(
    0,
    Math.max(2, Math.min(6, playerCount || 2))
  );
  const clean = normalizeFr(turnOrder);
  if (!clean || clean === 'classique' || clean === 'standard') {
    return { sides: defaultOrder, isCustom: false };
  }

  const labelToSide: { pattern: RegExp; side: PlayerSide }[] = [
    { pattern: /\bblancs?\b|\bwhite\b|\bjoueur\s*1\b/, side: 'white' },
    { pattern: /\bnoirs?\b|\bblack\b|\bjoueur\s*2\b/, side: 'black' },
    { pattern: /\brouges?\b|\bred\b|\bjoueur\s*3\b/, side: 'red' },
    { pattern: /\bbleus?\b|\bblue\b|\bjoueur\s*4\b/, side: 'blue' },
    { pattern: /\bverts?\b|\bgreen\b|\bjoueur\s*5\b/, side: 'green' },
    { pattern: /\bor\b|\bgold\b|\bjaunes?\b|\bjoueur\s*6\b/, side: 'gold' },
  ];

  // Scan occurrences by index so "Noirs puis Blancs" yields ['black', 'white']
  const found: { idx: number; side: PlayerSide }[] = [];
  for (const item of labelToSide) {
    const m = clean.match(item.pattern);
    if (m && m.index !== undefined) {
      found.push({ idx: m.index, side: item.side });
    }
  }

  if (found.length >= 2) {
    found.sort((a, b) => a.idx - b.idx);
    const ordered: PlayerSide[] = [];
    for (const f of found) {
      if (!ordered.includes(f.side)) ordered.push(f.side);
    }
    for (const s of defaultOrder) {
      if (!ordered.includes(s) && ordered.length < defaultOrder.length) {
        ordered.push(s);
      }
    }
    const isCustom = ordered.some((s, i) => s !== defaultOrder[i]);
    return { sides: ordered, isCustom };
  }

  return { sides: defaultOrder, isCustom: false };
}

export function parsePieceTextConfig(piece: PieceDef): ParsedPieceConfig {
  const cleanMoves = normalizeFr(piece.customMoves || '');
  const cleanCond = normalizeFr(piece.conditions || '');
  const cleanPower = normalizeFr(piece.powers || '');
  const cleanLimits = normalizeFr(piece.limitsText || '');
  const combinedMoves = `${cleanMoves} ${cleanPower} ${cleanLimits}`.trim();

  const extraLeaps: [number, number][] = [];
  const extraSlides: [number, number][] = [];
  const recognizedNotes: string[] = [];

  if (piece.moves.forwardOnly) {
    recognizedNotes.push('Ne peut pas reculer');
  }
  if (piece.moves.noCapture) {
    recognizedNotes.push('Ne peut pas capturer');
  }

  const forwardOnly =
    Boolean(piece.moves.forwardOnly) ||
    /(ne\s+peut\s+pas\s+reculer|interdit\s+de\s+reculer|sans\s+reculer|avance\s+uniquement|uniquement\s+vers\s+l'avant)/.test(
      combinedMoves
    );
  const noSideways = /(pas\s+sur\s+les\s+cotes|sans\s+deplacement\s+lateral|ne\s+va\s+pas\s+sur\s+les\s+cotes)/.test(
    combinedMoves
  );
  const strictlyForward = /(strictement\s+vers\s+l'avant|tout\s+droit\s+vers\s+l'avant)/.test(
    combinedMoves
  );
  const noCapture =
    Boolean(piece.moves.noCapture) ||
    /(ne\s+peut\s+(?:pas|jamais)\s+(?:manger|capturer|prendre)|pacifique|sans\s+capture)/.test(
      combinedMoves
    );

  if (forwardOnly && !piece.moves.forwardOnly) recognizedNotes.push('Ne peut pas reculer');
  if (noCapture && !piece.moves.noCapture) recognizedNotes.push('Ne peut pas capturer');

  if (cleanMoves.includes('chameau') || cleanMoves.includes('camel')) {
    extraLeaps.push([3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]);
    recognizedNotes.push('Saut Chameau (3×1)');
  }
  if (cleanMoves.includes('zebre') || cleanMoves.includes('zebra')) {
    extraLeaps.push([3, 2], [3, -2], [-3, 2], [-3, -2], [2, 3], [2, -3], [-2, 3], [-2, -3]);
    recognizedNotes.push('Saut Zèbre (3×2)');
  }
  if (cleanMoves.includes('dabbaba')) {
    extraLeaps.push([2, 0], [-2, 0], [0, 2], [0, -2]);
    recognizedNotes.push('Saut Dabbaba (2 orthogonales)');
  }
  if (cleanMoves.includes('alfil')) {
    extraLeaps.push([2, 2], [2, -2], [-2, 2], [-2, -2]);
    recognizedNotes.push('Saut Alfil (2 diagonales)');
  }
  if (cleanMoves.includes('ferz')) {
    extraLeaps.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    recognizedNotes.push('Pas Ferz (1 diagonale)');
  }
  if (cleanMoves.includes('wazir')) {
    extraLeaps.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    recognizedNotes.push('Pas Wazir (1 orthogonale)');
  }
  if (cleanMoves.includes('garde') || cleanMoves.includes('mann')) {
    extraLeaps.push([1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]);
    recognizedNotes.push('Déplacement Garde / Roi non-royal');
  }
  if (cleanMoves.includes('amazone') || cleanMoves.includes('amazon')) {
    extraSlides.push([1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]);
    extraLeaps.push([2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]);
    recognizedNotes.push('Amazone (Dame + Cavalier)');
  }
  if (
    cleanMoves.includes('imperatrice') ||
    cleanMoves.includes('chancelier') ||
    cleanMoves.includes('marechal')
  ) {
    extraSlides.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    extraLeaps.push([2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]);
    recognizedNotes.push('Impératrice (Tour + Cavalier)');
  }
  if (
    cleanMoves.includes('princesse') ||
    cleanMoves.includes('cardinal') ||
    cleanMoves.includes('archeveque')
  ) {
    extraSlides.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    extraLeaps.push([2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]);
    recognizedNotes.push('Princesse (Fou + Cavalier)');
  }
  const nightrider = cleanMoves.includes('noctambule') || cleanMoves.includes('nightrider');
  if (nightrider) recognizedNotes.push('Noctambule (Cavalier glissant)');
  const berolina = cleanMoves.includes('berolina');
  if (berolina) recognizedNotes.push('Pion Berolina (avance diag / prend droit)');

  if (/\bsaut(?:e|er)?\s*(?:de\s*)?2\b/.test(cleanMoves)) {
    extraLeaps.push([2, 0], [-2, 0], [0, 2], [0, -2]);
    recognizedNotes.push('Saut orthogonal de 2 cases');
  }
  if (/\bsaut(?:e|er)?\s*(?:de\s*)?3\b/.test(cleanMoves)) {
    extraLeaps.push([3, 0], [-3, 0], [0, 3], [0, -3]);
    recognizedNotes.push('Saut orthogonal de 3 cases');
  }

  // Generic directional keywords if checkboxes weren't used
  if (
    !piece.moves.rook &&
    /\b(?:orthogonal(?:e|ement)?|ligne\s+droite)\b/.test(cleanMoves)
  ) {
    extraSlides.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    recognizedNotes.push('Glissement orthogonal');
  }
  if (!piece.moves.bishop && /\bdiagonal(?:e|ement)?\b/.test(cleanMoves) && !berolina) {
    extraSlides.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    recognizedNotes.push('Glissement diagonal');
  }
  if (!piece.moves.knight && /\bsaut\s+de\s+cavalier\b/.test(cleanMoves)) {
    extraLeaps.push([2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]);
    recognizedNotes.push('Saut de Cavalier');
  }

  const rangeMatch = cleanMoves.match(/portee\s*(?:de\s*)?(\d+)/);
  const extraRange = rangeMatch ? Math.min(16, Math.max(1, Number(rangeMatch[1]))) : undefined;
  if (extraRange) recognizedNotes.push(`Portée ${extraRange}`);

  const canJump =
    /\b(?:peut\s+sauter|saute\s+par[- ]dessus|jump)\b/.test(cleanMoves) || undefined;
  if (canJump && !piece.moves.canJump) recognizedNotes.push('Peut sauter');

  // Power activation conditions
  const requireNotInCheck = /(?:hors\s+echec|pas\s+en\s+echec|sans\s+etre\s+en\s+echec)/.test(
    cleanCond
  );
  const requireInCheck = !requireNotInCheck && /\ben\s+echec\b/.test(cleanCond);

  let minTurn = 0;
  const minTurnMatch = cleanCond.match(
    /(?:apres\s+le|a\s+partir\s+du|depuis\s+le|tour\s*>=?)\s*(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)/
  );
  if (minTurnMatch) {
    minTurn = parseFrenchNumber(minTurnMatch[1]) || 0;
  }

  let maxTurn = 0;
  const maxTurnMatch = cleanCond.match(
    /(?:avant\s+le|jusqu'au|tour\s*<=?)\s*(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)/
  );
  if (maxTurnMatch) {
    maxTurn = parseFrenchNumber(maxTurnMatch[1]) || 0;
  }

  const requireNotOnSpecial = /(?:pas\s+sur\s+(?:une\s+|la\s+)?case\s+speciale|hors\s+case\s+speciale)/.test(
    cleanCond
  );
  const requireOnSpecial =
    !requireNotOnSpecial && /(?:sur\s+(?:une\s+|la\s+)?case\s+speciale)/.test(cleanCond);

  const requireNotMoved = /(?:avant\s+d'avoir\s+bouge|premier\s+coup|sans\s+avoir\s+bouge)/.test(
    cleanCond
  );
  const requireMoved = !requireNotMoved && /(?:apres\s+avoir\s+bouge)/.test(cleanCond);

  if (requireNotInCheck) recognizedNotes.push('Pouvoir : hors échec');
  if (requireInCheck) recognizedNotes.push('Pouvoir : uniquement en échec');
  if (minTurn > 0) recognizedNotes.push(`Pouvoir : à partir du tour ${minTurn}`);
  if (maxTurn > 0) recognizedNotes.push(`Pouvoir : jusqu'au tour ${maxTurn}`);
  if (requireOnSpecial) recognizedNotes.push('Pouvoir : sur case spéciale ✦');
  if (requireNotOnSpecial) recognizedNotes.push('Pouvoir : hors case spéciale');
  if (requireNotMoved) recognizedNotes.push('Pouvoir : avant premier déplacement');
  if (requireMoved) recognizedNotes.push('Pouvoir : après avoir bougé');

  let inferredPowerType: PieceDef['powerType'] | undefined;
  if (piece.powerType === 'custom' && cleanPower) {
    if (cleanPower.includes('teleport')) inferredPowerType = 'teleport';
    else if (cleanPower.includes('invisib')) inferredPowerType = 'invisibility';
    else if (cleanPower.includes('bouclier') || cleanPower.includes('shield')) inferredPowerType = 'shield';
    else if (cleanPower.includes('transform')) inferredPowerType = 'transform';
    else if (cleanPower.includes('dupli')) inferredPowerType = 'duplicate';
    else if (cleanPower.includes('repouss') || cleanPower.includes('pouss')) inferredPowerType = 'manipulate';
  }

  return {
    forwardOnly,
    strictlyForward,
    noSideways,
    noCapture,
    extraLeaps,
    extraSlides,
    nightrider,
    berolina,
    extraRange,
    canJump,
    powerConditions: {
      requireNotInCheck,
      requireInCheck,
      minTurn,
      maxTurn,
      requireOnSpecial,
      requireNotOnSpecial,
      requireNotMoved,
      requireMoved,
    },
    inferredPowerType,
    recognizedNotes,
  };
}

function isStandardBoilerplate(cleanSentence: string): boolean {
  if (!cleanSentence) return true;
  if (/^regles\s+officielles\s*:/.test(cleanSentence)) return true;
  if (
    /\binclus\b/.test(cleanSentence) &&
    !/\b(?:interdit|pas\s+de|sans|ne\s+peut|ne\s+peuvent|obligatoire|sauf)\b/.test(cleanSentence)
  ) {
    return true;
  }
  return false;
}

function splitCompoundRuleClauses(text: string): string[] {
  const lines = (text || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-•*–]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  const initial = lines
    .flatMap((line) => line.split(/[.;!]+/))
    .map((s) => s.trim())
    .filter(Boolean);

  const verbDetector =
    /(?:\bne\s+(?:peut|peuvent|mange|mangent|bouffe|bouffent|capture|capturent|prend|prennent|bouge|bougent|recule|reculent|saute|sautent|va|vont)|\bn'(?:a|ont)\s+(?:pas\s+)?le\s+droit|\ba\s+le\s+droit|\bont\s+le\s+droit|\binterdit|\bobligatoire|\bpas\s+de\b|\bsans\s+(?:roque|promotion|en\s+passant|double|echec)|\buniquement\b|\bseulement\b|\bgagne|\bvictoire|\bproteg|\binvulnerable|\bimmunise|\bportee\b|\bpeut\s+(?:sauter|reculer|bouger|manger|capturer)|\bpeuvent\s+(?:sauter|reculer|bouger|manger|capturer)|\brejoue|\bdevient|\bdeviennent|\bexplose|\bdetrui|\bimmobile|\bsont\s+immobiles|\bmange|\bcapture|\bbouge|\bse\s+deplace|\bsont\s+(?:en\s+)?equipe|\bsont\s+allies?|\bfont\s+equipe|\bjouent\s+ensemble|\bcontre\b|\bvs\.?\b)/;

  const out: string[] = [];
  for (const part of initial) {
    // Do NOT split on commas before exceptions, conditions, or "ni/ou" lists
    const sepRe =
      /(\s+(?:et|mais|puis)\s+|,\s+(?!(?:sauf|hormis|excepte|a\s+part|a\s+l'exception|a\s+moins|si\b|s'|quand\b|lorsque\b|uniquement\b|seulement\b|ni\b|ou\b)))/i;
    const tokens = part.split(sepRe);
    if (tokens.length > 2) {
      let current = tokens[0];
      for (let i = 1; i < tokens.length; i += 2) {
        const sep = tokens[i];
        const nextSeg = tokens[i + 1] ?? '';
        const normCur = normalizeFr(current);
        const normNext = normalizeFr(nextSeg);
        const isLeadingCondition =
          /^(?:si|quand|lorsque|apres|avant|en\s+cas|des\s+qu|au\s+(?:premier|1er)|a\s+moins|sur\s+(?:une|la)\s+case)/.test(
            normCur
          );
        const isTrailingCondition =
          /^(?:sauf|hormis|excepte|a\s+moins|si\b|s'|quand\b|lorsque\b)/.test(normNext);
        const insideParens =
          (current.match(/\(/g)?.length || 0) > (current.match(/\)/g)?.length || 0);
        if (
          !insideParens &&
          !isLeadingCondition &&
          !isTrailingCondition &&
          verbDetector.test(normCur) &&
          verbDetector.test(normNext)
        ) {
          out.push(current.trim());
          current = nextSeg;
        } else {
          current = `${current}${sep}${nextSeg}`;
        }
      }
      if (current.trim()) out.push(current.trim());
    } else {
      out.push(part);
    }
  }
  return out;
}

function extractNounException(clean: string): {
  mainClause: string;
  exceptionText: string;
} {
  // Match embedded or trailing "sauf/hormis/excepte/a part X" when X is NOT "si ..." / "s'..."
  const re =
    /(?:,\s*)?\b(?:sauf|hormis|excepte|a\s+part|a\s+l'exception\s+(?:de|du|des))\s+(?!si\b|s'|quand\b|lorsque\b)([^,;.]+?)(?=\s*(?:,|\b(?:n'a|n'ont|a\s+le|ont\s+le|ne\s+peu|peut|peuvent|est|sont|ont)\b|$))/;
  const m = clean.match(re);
  if (!m || m.index === undefined) {
    return { mainClause: clean, exceptionText: '' };
  }
  const before = clean.slice(0, m.index).replace(/,\s*$/, '').trim();
  const after = clean.slice(m.index + m[0].length).replace(/^\s*,/, '').trim();
  const mainClause = `${before} ${after}`.replace(/\s+/g, ' ').trim();
  return { mainClause, exceptionText: m[1].trim() };
}

function hasProhibitivePolarity(clean: string): boolean {
  const hasNegSubject = /\b(?:aucune?s?|nul(?:le)?s?|personne|pas\s+une?)\b/.test(clean);
  const hasNegVerb =
    /\b(?:ne\s+(?:peut|peuvent|doit|doivent|sait|savent|mange|mangent|bouffe|bouffent|capture|capturent|prend|prennent|va|vont|bouge|bougent|recule|reculent|saute|sautent)\s+(?:pas|jamais|plus|aucunement)|n'(?:a|ont)\s+(?:pas|jamais|aucun)\b|interdit|interdiction|prohibe|defense\s+de|impossible\s+de|pas\s+le\s+droit|pas\s+de\s+recul|sans\s+(?:pouvoir|reculer)|immobiles?|ne\s+(?:bouge|bougent)\s+(?:pas|jamais|plus)|invulnerables?|immunises?|incapturables?|protege(?:e|s|es)?)\b/.test(
      clean
    );
  return hasNegSubject || hasNegVerb;
}

export function compileVariantRules(
  variant: Variant,
  extraCustomPieces: PieceDef[] = []
): CompiledVariantRules {
  const allCustomPieces: PieceDef[] = [];
  const seenPieceIds = new Set<string>();
  for (const p of [...(variant.customPieceDefs || []), ...extraCustomPieces]) {
    if (p && !seenPieceIds.has(p.id)) {
      seenPieceIds.add(p.id);
      allCustomPieces.push(p);
    }
  }
  const keywordMap = buildPieceKeywordMap(allCustomPieces);

  const rc: VariantRuleConfig = variant.ruleConstraints || {};
  let noBackwardAll = Boolean(rc.noBackwardAll);
  const noBackwardPieces = new Set<string>(rc.noBackwardPieces || []);
  const noBackwardExemptPieces = new Set<string>();
  let noBackwardExceptSpecial = Boolean(rc.noBackwardExceptSpecial);
  let noBackwardCaptureAll = false;
  const noBackwardCapturePieces = new Set<string>();
  let allowPawnBackward = false;
  const allowPawnBackwardSides = new Set<PlayerSide>();
  let pawnCaptureForward = false;
  let berolinaPawns = false;
  let alwaysPawnDoubleStep = false;
  let pawnInitialSteps = 2;
  let allCanJump = false;
  const canJumpPieces = new Set<string>();
  const forbidJumpPieces = new Set<string>();
  const immobilePieces = new Set<string>();
  const forbidDiagonalPieces = new Set<string>();
  const forbidOrthogonalPieces = new Set<string>();
  const grantPieceMoves: Record<string, string[]> = {};
  const replacePieceMoves: Record<string, string[]> = {};
  const specialGrantPieceMoves: Record<string, string[]> = {};
  const pieceMaxSteps: Record<string, number> = {};
  const noSidewaysPieces = new Set<string>(rc.noSidewaysPieces || []);
  const strictlyForwardPieces = new Set<string>(rc.strictlyForwardPieces || []);
  const onlyLightSquarePieces = new Set<string>();
  const onlyDarkSquarePieces = new Set<string>();
  const forbidLightSquarePieces = new Set<string>();
  const forbidDarkSquarePieces = new Set<string>();
  let mandatoryCapture = Boolean(rc.mandatoryCapture);
  let allowFriendlyCapture = false;
  let noCaptureBeforeTurn = 0;
  let extraActionOnCapture = false;
  const promoteOnCapturePieces = new Set<string>();
  let promoteOnCaptureTarget = 'builtin:Q';
  let specialPromoteTarget = 'builtin:Q';
  let kamikazeOnCapture = false;
  let atomicCapture = false;
  let protectedByAllyUncapturable = false;
  let captureValueRule: CompiledVariantRules['captureValueRule'] = 'none';
  let actionsPerTurnOverride = 0;
  let captureTargetOverride = 0;
  let disableCastling = Boolean(rc.disableCastling);
  let disableEnPassant = Boolean(rc.disableEnPassant);
  let disablePawnDoubleStep = Boolean(rc.disablePawnDoubleStep);
  let disablePromotion = Boolean(rc.disablePromotion);
  let promoteToPieceId = rc.promoteToPieceId;
  let noCheckRestriction = Boolean(rc.noCheckRestriction);
  let specialProtected = Boolean(rc.specialProtected);
  let specialCaptureOnly = Boolean(rc.specialCaptureOnly);
  const forbiddenSpecialPieces = new Set<string>(rc.forbiddenSpecialPieces || []);
  const onlySpecialPieces = new Set<string>(rc.onlySpecialPieces || []);
  let maxStepsPerMove = rc.maxStepsPerMove || 0;
  let wrapHorizontal = false;
  const noCapturePieces = new Set<string>();
  const captureRestrictions: VariantCaptureRestriction[] = [...(rc.captureRestrictions || [])];

  let checksTarget = 0;
  let reverseWin = false;
  let stalemateWins = false;
  let reachOppositeRankPieces = new Set<string>();
  const specialWinPieces = new Set<string>();
  let textSpecialEffectOverride: SpecialCellEffectType = 'none';
  let rawTeamGroups: PlayerSide[][] = [];
  let teamSharedElimination = Boolean(rc.teamSharedElimination);
  let allowTeammateCapture = false;
  let allowPieceDrops = Boolean(rc.allowPieceDrops);
  const pieceEvolutionOnCaptures: CompiledVariantRules['pieceEvolutionOnCaptures'] = [];
  const timedRules: CompiledVariantRules['timedRules'] = [];

  if (rc.teamAssignments) {
    const byNum = new Map<number, PlayerSide[]>();
    for (const [sideKey, num] of Object.entries(rc.teamAssignments)) {
      if (
        VALID_PLAYER_SIDES.has(sideKey as PlayerSide) &&
        typeof num === 'number' &&
        num > 0
      ) {
        const list = byNum.get(num) || [];
        list.push(sideKey as PlayerSide);
        byNum.set(num, list);
      }
    }
    for (const grp of byNum.values()) {
      if (grp.length > 0) rawTeamGroups.push(grp);
    }
  }

  const activeRules: DetectedRuleBadge[] = [];
  const unrecognizedSentences: string[] = [];

  const addCaptureRule = (
    attacker: string,
    target: string,
    condition: CaptureRestrictionCondition,
    exemptAttackers?: string[],
    exemptTargets?: string[]
  ) => {
    const exists = captureRestrictions.some(
      (r) =>
        r.attacker === attacker &&
        r.target === target &&
        r.condition === condition &&
        JSON.stringify(r.exemptAttackers || []) === JSON.stringify(exemptAttackers || []) &&
        JSON.stringify(r.exemptTargets || []) === JSON.stringify(exemptTargets || [])
    );
    if (!exists) {
      captureRestrictions.push({
        id: `txt_${captureRestrictions.length + 1}_${attacker}_${target}`,
        attacker,
        target,
        condition,
        exemptAttackers,
        exemptTargets,
      });
    }
  };

  // Incorporate per-piece intrinsic rules
  for (const cp of allCustomPieces) {
    const parsed = parsePieceTextConfig(cp);
    if (parsed.forwardOnly) {
      noBackwardPieces.add(cp.id);
      activeRules.push({
        label: `${cp.name} ne peut pas reculer`,
        source: 'piece',
        category: 'movement',
      });
    }
    if (parsed.noSideways) {
      noSidewaysPieces.add(cp.id);
    }
    if (parsed.strictlyForward) {
      strictlyForwardPieces.add(cp.id);
    }
    if (parsed.noCapture) {
      noCapturePieces.add(cp.id);
      activeRules.push({
        label: `${cp.name} ne peut pas capturer`,
        source: 'piece',
        category: 'capture',
      });
    }
  }

  // Record structured rule badges
  if (rc.noBackwardAll) {
    activeRules.push({
      label: rc.noBackwardExceptSpecial
        ? 'Aucune pièce ne peut reculer (sauf sur case spéciale ✦)'
        : 'Aucune pièce ne peut reculer',
      source: 'structured',
      category: 'movement',
    });
  }
  for (const pid of rc.noBackwardPieces || []) {
    activeRules.push({
      label: `${getPieceFilterLabel(pid, allCustomPieces)} ne peut pas reculer`,
      source: 'structured',
      category: 'movement',
    });
  }
  if (rc.mandatoryCapture) {
    activeRules.push({ label: 'Prise obligatoire', source: 'structured', category: 'capture' });
  }
  if (rc.disableCastling) {
    activeRules.push({ label: 'Roque interdit', source: 'structured', category: 'general' });
  }
  if (rc.disableEnPassant) {
    activeRules.push({ label: 'Prise en passant interdite', source: 'structured', category: 'general' });
  }
  if (rc.disablePawnDoubleStep) {
    activeRules.push({ label: 'Double pas des pions interdit', source: 'structured', category: 'movement' });
  }
  if (rc.disablePromotion) {
    activeRules.push({ label: 'Promotion des pions interdite', source: 'structured', category: 'general' });
  } else if (rc.promoteToPieceId) {
    activeRules.push({
      label: `Promotion forcée en ${getPieceFilterLabel(rc.promoteToPieceId, allCustomPieces)}`,
      source: 'structured',
      category: 'general',
    });
  }
  if (rc.noCheckRestriction) {
    activeRules.push({ label: 'Échec ignoré (capture directe du Roi)', source: 'structured', category: 'victory' });
  }
  if (rc.specialProtected) {
    activeRules.push({ label: 'Cases spéciales ✦ = Zone protégée (incapturable)', source: 'structured', category: 'special' });
  }
  if (rc.specialCaptureOnly) {
    activeRules.push({ label: 'Captures uniquement sur ou depuis une case spéciale ✦', source: 'structured', category: 'special' });
  }
  if ((rc.maxStepsPerMove || 0) > 0) {
    activeRules.push({ label: `Portée max globale : ${rc.maxStepsPerMove} case(s)`, source: 'structured', category: 'movement' });
  }
  if (rc.allowPieceDrops) {
    activeRules.push({
      label: 'Parachutage : reposer les pièces capturées sur le plateau',
      source: 'structured',
      category: 'general',
    });
  }
  for (const cr of rc.captureRestrictions || []) {
    activeRules.push({
      label: formatCaptureRestrictionLabel(cr, allCustomPieces),
      source: 'structured',
      category: 'capture',
    });
  }

  // Parse free-text sentences from variant.rules and variant.goal
  const combinedClauses: { raw: string; fromRules: boolean }[] = [
    ...splitCompoundRuleClauses(variant.rules || '').map((raw) => ({ raw, fromRules: true })),
    ...(variant.goal
      ? splitCompoundRuleClauses(variant.goal).map((raw) => ({
          raw,
          fromRules: variant.victoryType === 'custom',
        }))
      : []),
  ];

  const captureVerbPattern =
    /\b(?:manger|mangent|bouffer|bouffent|capturer|capturent|prendre|prennent|eliminer|eliminent|tuer|tuent|detruire|detruisent|ecraser|ecrasent)\b/;

  for (const { raw: rawSentence, fromRules } of combinedClauses) {
    const clean = normalizeFr(rawSentence);
    if (!clean || isStandardBoilerplate(clean)) continue;

    let sentenceMatched = false;
    const { mainClause, exceptionText } = extractNounException(clean);
    const isProhibitive = hasProhibitivePolarity(mainClause);
    const isExclusiveStart =
      /^\s*(?:seul(?:e|s|es)?|uniquement|seulement|il\s+n'y\s+a\s+que)\b/.test(mainClause);

    const hasBackwardKeyword =
      /\b(?:reculer|recule|reculent|reculant|reculons|recul|en\s+arriere|vers\s+l'arriere|marche\s+arriere)\b/.test(
        mainClause
      ) ||
      /(?:ne\s+(?:peut|peuvent)\s+qu'avancer|avancent?\s+uniquement|uniquement\s+vers\s+l'avant|seulement\s+vers\s+l'avant)/.test(
        mainClause
      );
    const hasCaptureVerbInMain = captureVerbPattern.test(mainClause);

    // 1. Backward restriction OR backward-capture-only restriction OR permission
    if (hasBackwardKeyword && hasCaptureVerbInMain && isProhibitive) {
      sentenceMatched = true;
      const subjectPart = mainClause.split(captureVerbPattern)[0];
      const refs = extractPieceRefs(subjectPart, keywordMap);
      if (refs.length === 0 || refs.includes('all')) {
        noBackwardCaptureAll = true;
        activeRules.push({
          label: 'Aucune pièce ne peut capturer en reculant',
          source: 'text',
          category: 'capture',
        });
      } else {
        for (const r of refs) {
          noBackwardCapturePieces.add(r);
          activeRules.push({
            label: `${getPieceFilterLabel(r, allCustomPieces)} : interdit de capturer en reculant`,
            source: 'text',
            category: 'capture',
          });
        }
      }
    } else if (hasBackwardKeyword) {
      sentenceMatched = true;
      const exHasSpecial = /case\s+speciale/.test(exceptionText);
      const exRefs = exceptionText && !exHasSpecial ? extractPieceRefs(exceptionText, keywordMap) : [];
      if (exHasSpecial || /\bsi[^.]*case\s+speciale/.test(clean)) {
        noBackwardExceptSpecial = true;
      }
      for (const er of exRefs) noBackwardExemptPieces.add(er);

      if (isExclusiveStart) {
        const allowedRefs = extractPieceRefs(
          mainClause.split(/\b(?:a\s+le\s+droit|ont\s+le\s+droit|peut|peuvent)\b/)[0],
          keywordMap
        );
        noBackwardAll = true;
        for (const ar of allowedRefs) noBackwardExemptPieces.add(ar);
        activeRules.push({
          label:
            allowedRefs.length > 0
              ? `Aucune pièce ne peut reculer (sauf ${allowedRefs.map((id) => getPieceFilterLabel(id, allCustomPieces)).join(', ')})`
              : 'Aucune pièce ne peut reculer',
          source: 'text',
          category: 'movement',
        });
      } else if (
        isProhibitive ||
        /(?:ne\s+(?:peut|peuvent)\s+qu'avancer|avancent?\s+uniquement|uniquement\s+vers\s+l'avant|seulement\s+vers\s+l'avant)/.test(
          mainClause
        )
      ) {
        const subjectPart = mainClause.split(
          /\b(?:ne\s+(?:peut|peuvent)|n'a|n'ont|a\s+le\s+droit|ont\s+le\s+droit|peut|peuvent|interdit|interdiction|impossible|recul|uniquement|seulement|avancent)\b/
        )[0];
        const refs = extractPieceRefs(subjectPart, keywordMap);

        if (refs.length === 0 || refs.includes('all')) {
          noBackwardAll = true;
          const unknownExNote =
            exceptionText && !exHasSpecial && exRefs.length === 0
              ? ` (exception « ${exceptionText} » non reconnue)`
              : '';
          if (!rc.noBackwardAll) {
            activeRules.push({
              label:
                exHasSpecial || noBackwardExceptSpecial
                  ? 'Aucune pièce ne peut reculer (sauf sur case spéciale ✦)'
                  : exRefs.length > 0
                    ? `Aucune pièce ne peut reculer (sauf ${exRefs.map((id) => getPieceFilterLabel(id, allCustomPieces)).join(', ')})`
                    : `Aucune pièce ne peut reculer${unknownExNote}`,
              source: 'text',
              category: 'movement',
            });
          }
        } else {
          for (const r of refs) {
            if (r === 'custom') {
              for (const cp of allCustomPieces) noBackwardPieces.add(cp.id);
            } else {
              noBackwardPieces.add(r);
            }
            activeRules.push({
              label: `${getPieceFilterLabel(r, allCustomPieces)} : interdit de reculer`,
              source: 'text',
              category: 'movement',
            });
          }
        }
      } else if (/case\s+speciale/.test(clean) && noBackwardAll) {
        noBackwardExceptSpecial = true;
        activeRules.push({
          label: 'Recul autorisé depuis/vers une case spéciale ✦',
          source: 'text',
          category: 'special',
        });
      } else {
        const refs = extractPieceRefs(mainClause, keywordMap);
        for (const r of refs) {
          const { base, side } = parsePieceFilter(r);
          if (base === 'builtin:P' || base === 'all') {
            if (side) {
              allowPawnBackwardSides.add(side);
              activeRules.push({
                label: `Les pions (${SIDE_NOUNS_PLURAL[side]}) ont le droit de reculer`,
                source: 'text',
                category: 'movement',
              });
            } else {
              allowPawnBackward = true;
              activeRules.push({
                label: 'Les pions ont le droit de reculer',
                source: 'text',
                category: 'movement',
              });
            }
          }
        }
      }
    }

    // 1b. Pawn special rules (forward capture, Berolina, always double step, triple step)
    if (
      /\bpions?\b/.test(clean) &&
      (/\b(?:avancent?|marchent?|se\s+deplacent?)\s+en\s+diagonale\b/.test(clean) ||
        /\bberolina\b/.test(clean))
    ) {
      sentenceMatched = true;
      berolinaPawns = true;
      activeRules.push({
        label: 'Pions Berolina (avancent en diagonale, capturent tout droit)',
        source: 'text',
        category: 'movement',
      });
    } else if (
      /\bpions?\b/.test(mainClause) &&
      /\b(?:mangent?|capturent?|prennent?)\b/.test(mainClause) &&
      /\b(?:tout\s+droit|devant|en\s+avancant|comme\s+ils\s+avancent)\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      pawnCaptureForward = true;
      activeRules.push({
        label: 'Les pions capturent aussi droit devant',
        source: 'text',
        category: 'capture',
      });
    }

    if (
      /\bpions?\b/.test(clean) &&
      (/\b(?:2|deux)\s+cases\s+(?:a\s+tout\s+moment|tout\s+le\s+temps|toujours|a\s+chaque\s+coup)\b/.test(clean) ||
        /\btoujours\s+(?:avancer|bouger)\s+de\s+(?:2|deux)\s+cases\b/.test(clean))
    ) {
      sentenceMatched = true;
      alwaysPawnDoubleStep = true;
      activeRules.push({
        label: 'Les pions peuvent avancer de 2 cases à tout moment',
        source: 'text',
        category: 'movement',
      });
    }

    const pawnTripleMatch = clean.match(
      /\bpions?\b[^.]*(?:avancer|bouger|pas)\s+(?:de\s+)?(3|4|trois|quatre)\s+cases?\s+(?:au\s+debut|au\s+premier\s+coup|initialement)/
    );
    if (pawnTripleMatch || /\btriple\s+pas\b/.test(clean)) {
      const n = pawnTripleMatch ? parseFrenchNumber(pawnTripleMatch[1]) || 3 : 3;
      sentenceMatched = true;
      pawnInitialSteps = Math.max(pawnInitialSteps, Math.min(5, n));
      activeRules.push({
        label: `Les pions peuvent avancer jusqu’à ${pawnInitialSteps} cases au premier coup`,
        source: 'text',
        category: 'movement',
      });
    }

    // 2. Immobility, sideways, diagonal, orthogonal, jump bans & permissions
    if (
      /\b(?:immobiles?|ne\s+(?:peut|peuvent)\s+(?:pas|jamais)\s+(?:bouger|se\s+deplacer)|aucun\s+deplacement)\b/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
      const targets = refs.length > 0 ? refs : ['all'];
      for (const t of targets) {
        immobilePieces.add(t);
        activeRules.push({
          label: `${getPieceFilterLabel(t, allCustomPieces)} : immobile (ne peut pas bouger)`,
          source: 'text',
          category: 'movement',
        });
      }
    }

    if (
      /(?:pas\s+de\s+deplacement\s+lateral|ne\s+(?:peut|peuvent)\s+pas\s+(?:aller|bouger|se\s+deplacer)\s+(?:sur\s+les\s+cotes|lateralement|horizontalement)|strictement\s+vers\s+l'avant)/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
      const targets = refs.length > 0 ? refs : ['all'];
      for (const t of targets) {
        if (mainClause.includes('strictement')) strictlyForwardPieces.add(t);
        else noSidewaysPieces.add(t);
        activeRules.push({
          label: `${getPieceFilterLabel(t, allCustomPieces)} : pas de déplacement latéral`,
          source: 'text',
          category: 'movement',
        });
      }
    }

    if (
      isProhibitive &&
      /\b(?:en\s+diagonale|diagonales?)\b/.test(mainClause) &&
      !/\b(?:manger|capturer|prendre)\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
      const targets = refs.length > 0 ? refs : ['all'];
      for (const t of targets) {
        forbidDiagonalPieces.add(t);
        activeRules.push({
          label: `${getPieceFilterLabel(t, allCustomPieces)} : diagonales interdites`,
          source: 'text',
          category: 'movement',
        });
      }
    }

    if (
      isProhibitive &&
      /\b(?:en\s+ligne\s+droite|orthogonal(?:ement)?|tout\s+droit)\b/.test(mainClause) &&
      !/\b(?:manger|capturer|prendre)\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
      const targets = refs.length > 0 ? refs : ['all'];
      for (const t of targets) {
        forbidOrthogonalPieces.add(t);
        activeRules.push({
          label: `${getPieceFilterLabel(t, allCustomPieces)} : lignes droites interdites`,
          source: 'text',
          category: 'movement',
        });
      }
    }

    // 2b. Jumping permission OR ban
    if (
      /\b(?:sauter|passer\s+par[- ]dessus|traverser\s+les\s+pieces)\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
      if (isProhibitive) {
        const targets = refs.length > 0 ? refs : ['all'];
        for (const t of targets) {
          forbidJumpPieces.add(t);
          activeRules.push({
            label: `${getPieceFilterLabel(t, allCustomPieces)} : interdit de sauter par-dessus les pièces`,
            source: 'text',
            category: 'movement',
          });
        }
      } else if (
        /\b(?:peut|peuvent|a\s+le\s+droit|ont\s+le\s+droit|saute|sautent|traverse|traversent)\b/.test(
          mainClause
        )
      ) {
        if (refs.length === 0 || refs.includes('all')) {
          allCanJump = true;
          activeRules.push({
            label: 'Toutes les pièces peuvent sauter par-dessus les autres',
            source: 'text',
            category: 'movement',
          });
        } else {
          for (const r of refs) {
            canJumpPieces.add(r);
            activeRules.push({
              label: `${getPieceFilterLabel(r, allCustomPieces)} peut sauter par-dessus les pièces`,
              source: 'text',
              category: 'movement',
            });
          }
        }
      }
    }

    // 2c. Piece movement mimicry OR replacement OR special-square-only mimicry
    const mimicMatch = mainClause.match(
      /^(.*?)\b(?:se\s+deplace(?:nt)?|bouge(?:nt)?|marche(?:nt)?|a\s+les\s+deplacements?|ont\s+les\s+deplacements?|a\s+le\s+mouvement|ont\s+le\s+mouvement|peut\s+bouger|peuvent\s+bouger)\s+(?:(aussi|uniquement|seulement)\s+)?(?:comme|a\s+la\s+facon\s+d'un|a\s+la\s+place\s+comme|d'un|d'une|de\s+la|du|des)\s+(.+)$/
    );
    if (mimicMatch) {
      const leftTxt = mimicMatch[1];
      const modeWord = mimicMatch[2] || '';
      const rightTxt = mimicMatch[3];
      const onSpecialCond =
        /\bsur\s+(?:une|la|les)\s+cases?\s+speciales?\b/.test(clean) && !mimicMatch[0].includes('sauf');
      const subjRefs = extractPieceRefs(leftTxt, keywordMap);
      const templateRefs = extractPieceRefs(rightTxt, keywordMap);
      if (subjRefs.length > 0 && templateRefs.length > 0) {
        sentenceMatched = true;
        const isReplacement =
          modeWord === 'uniquement' ||
          modeWord === 'seulement' ||
          /\b(?:a\s+la\s+place|au\s+lieu)\b/.test(clean);
        for (const s of subjRefs) {
          const targetMap = onSpecialCond
            ? specialGrantPieceMoves
            : isReplacement
              ? replacePieceMoves
              : grantPieceMoves;
          if (!targetMap[s]) targetMap[s] = [];
          for (const t of templateRefs) {
            if (!targetMap[s].includes(t)) targetMap[s].push(t);
          }
          activeRules.push({
            label: onSpecialCond
              ? `Sur case spéciale ✦, ${getPieceFilterLabel(s, allCustomPieces)} bouge aussi comme : ${templateRefs.map((t) => getPieceFilterLabel(t, allCustomPieces)).join(', ')}`
              : isReplacement
                ? `${getPieceFilterLabel(s, allCustomPieces)} bouge uniquement comme : ${templateRefs.map((t) => getPieceFilterLabel(t, allCustomPieces)).join(', ')}`
                : `${getPieceFilterLabel(s, allCustomPieces)} bouge aussi comme : ${templateRefs.map((t) => getPieceFilterLabel(t, allCustomPieces)).join(', ')}`,
            source: 'text',
            category: onSpecialCond ? 'special' : 'movement',
          });
        }
      }
    }

    // 2d. Square color restrictions (cases blanches / cases noires)
    if (
      /\bcases?\s+(?:blanches?|claires?|noires?|foncees?)\b/.test(mainClause) &&
      !/\b(?:manger|capturer|prendre)\b/.test(mainClause)
    ) {
      const mentionsLight = /\bcases?\s+(?:blanches?|claires?)\b/.test(mainClause);
      const mentionsDark = /\bcases?\s+(?:noires?|foncees?)\b/.test(mainClause);
      const isOnly = /\b(?:que\s+sur|uniquement\s+sur|seulement\s+sur)\b/.test(mainClause);
      const refs = extractPieceRefs(
        mainClause.split(/\b(?:ne\s+(?:peut|peuvent)|peut|peuvent|vont|va|interdit)\b/)[0],
        keywordMap
      );
      const targets = refs.length > 0 ? refs : ['all'];

      if (mentionsLight && !mentionsDark) {
        sentenceMatched = true;
        for (const t of targets) {
          if (isOnly) {
            onlyLightSquarePieces.add(t);
            activeRules.push({
              label: `${getPieceFilterLabel(t, allCustomPieces)} : uniquement sur cases blanches`,
              source: 'text',
              category: 'movement',
            });
          } else if (isProhibitive) {
            forbidLightSquarePieces.add(t);
            activeRules.push({
              label: `${getPieceFilterLabel(t, allCustomPieces)} : interdit sur cases blanches`,
              source: 'text',
              category: 'movement',
            });
          }
        }
      } else if (mentionsDark && !mentionsLight) {
        sentenceMatched = true;
        for (const t of targets) {
          if (isOnly) {
            onlyDarkSquarePieces.add(t);
            activeRules.push({
              label: `${getPieceFilterLabel(t, allCustomPieces)} : uniquement sur cases noires`,
              source: 'text',
              category: 'movement',
            });
          } else if (isProhibitive) {
            forbidDarkSquarePieces.add(t);
            activeRules.push({
              label: `${getPieceFilterLabel(t, allCustomPieces)} : interdit sur cases noires`,
              source: 'text',
              category: 'movement',
            });
          }
        }
      }
    }

    // 2e. Cylindrical / wrap-around board
    if (
      /\b(?:(?:plateau|echiquier)\s+(?:est\s+|devient\s+)?cylindrique|bords?\s+(?:gauche\s+et\s+droit\s+|lateraux\s+)?(?:se\s+rejoignent|communiquent|(?:sont\s+)?connectes)|traverser\s+les\s+bords|passer\s+d'un\s+bord\s+a\s+l'autre)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      wrapHorizontal = true;
      activeRules.push({
        label: 'Plateau cylindrique (les bords gauche et droit communiquent)',
        source: 'text',
        category: 'movement',
      });
    }

    // 3. Special combat rules: friendly capture, turn-N capture ban, bonus action, promote on capture, kamikaze, atomic, defended pieces, hierarchy
    if (
      !isProhibitive &&
      /\b(?:capturer|manger|prendre)\s+(?:ses|vos|leurs)\s+propres\s+pieces\b|\bcapture\s+alliee\b/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      allowFriendlyCapture = true;
      activeRules.push({
        label: 'Capture alliée autorisée (vos propres pièces)',
        source: 'text',
        category: 'capture',
      });
    }

    if (
      /\b(?:pas\s+de|aucune?|interdit\s+de)\s+(?:capture|prise|manger)\b/.test(mainClause) &&
      /\b(?:premier|1er)\s+tour\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      noCaptureBeforeTurn = Math.max(noCaptureBeforeTurn, 2);
      activeRules.push({
        label: 'Aucune capture autorisée au 1er tour',
        source: 'text',
        category: 'capture',
      });
    } else {
      const beforeTurnCap = mainClause.match(
        /\b(?:pas\s+de|aucune?)\s+(?:capture|prise)\s+(?:avant\s+le|pendant\s+les?)\s+(\d+|deux|trois|quatre|cinq)e?\s+tours?\b/
      );
      if (beforeTurnCap) {
        const n = parseFrenchNumber(beforeTurnCap[1]);
        if (n && n > 1) {
          sentenceMatched = true;
          noCaptureBeforeTurn = Math.max(noCaptureBeforeTurn, n);
          activeRules.push({
            label: `Aucune capture avant le ${n}e tour`,
            source: 'text',
            category: 'capture',
          });
        }
      }
    }

    if (
      /\b(?:rejoue(?:r)?\s+apres\s+une\s+capture|apres\s+une\s+capture[^.]*rejoue|capture\s+donne\s+une\s+action|capturer\s+permet\s+de\s+rejouer|manger\s+permet\s+de\s+rejouer)\b/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      extraActionOnCapture = true;
      activeRules.push({
        label: 'Bonus : +1 action après chaque capture',
        source: 'text',
        category: 'capture',
      });
    }

    // 3a. Parachutage / réutilisation des pièces capturées (Crazyhouse / Shogi)
    if (
      /\b(?:parachutage|parachuter|crazyhouse|shogi)\b/.test(clean) ||
      /\b(?:reposer|replacer|rejouer|deposer|remettre)\s+(?:les\s+|des\s+|une\s+)?pieces?\s+(?:capturee?s?|prise?s?|mangee?s?)\b/.test(
        clean
      ) ||
      /\bpieces?\s+(?:capturee?s?|prise?s?|mangee?s?)\s+(?:peut|peuvent)\s+etre\s+(?:reposee?s?|replacee?s?|rejouee?s?|parachutee?s?|remise?s?)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!allowPieceDrops) {
        allowPieceDrops = true;
        activeRules.push({
          label: 'Parachutage : les pièces capturées peuvent être reposées sur le plateau',
          source: 'text',
          category: 'general',
        });
      }
    }

    // 3b. Dynamic / conditional rules: capture-threshold evolution & turn-based / periodic triggers
    const rotateSpecialMatch =
      clean.match(
        /(?:tous\s+les|chaque)\s+(\d+|deux|trois|quatre|cinq|six|huit|dix)\s+tours?[^.]*cases?\s+speciales?[^.]*(?:changent?|tournent?|alternent?|varient?)/
      ) ||
      clean.match(
        /cases?\s+speciales?[^.]*(?:changent?|tournent?|alternent?|varient?)[^.]*(?:tous\s+les|chaque)\s+(\d+|deux|trois|quatre|cinq|six|huit|dix)\s+tours?/
      );
    if (rotateSpecialMatch) {
      const interval = Math.max(1, parseFrenchNumber(rotateSpecialMatch[1]) || 3);
      sentenceMatched = true;
      const cycle: SpecialCellEffectType[] = ['teleport', 'shield', 'double_action', 'freeze', 'trap'];
      const label = `Cases spéciales ✦ dynamiques : changent d’effet tous les ${interval} tour(s)`;
      timedRules.push({
        kind: 'rotate_special_effect',
        turnThreshold: interval,
        interval,
        effectsCycle: cycle,
        label,
      });
      activeRules.push({ label, source: 'text', category: 'special' });
    }

    const afterTurnMatch = clean.match(
      /(?:a\s+partir\s+du|apres\s+le|des\s+le|au\s+bout\s+de)\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|dix|douze|quinze|vingt)e?\s+tours?\b/
    );
    if (afterTurnMatch) {
      const turnN = parseFrenchNumber(afterTurnMatch[1]);
      if (turnN && turnN > 1) {
        if (/\b(?:reculer|recule|reculent|en\s+arriere)\b/.test(clean) && !isProhibitive) {
          sentenceMatched = true;
          const refs = extractPieceRefs(clean, keywordMap);
          const filter = refs.length > 0 ? refs[0] : 'all';
          const label = `À partir du ${turnN}e tour : ${getPieceFilterLabel(filter, allCustomPieces)} peut reculer`;
          timedRules.push({ kind: 'unlock_backward_after', turnThreshold: turnN, targetFilter: filter, label });
          activeRules.push({ label, source: 'text', category: 'movement' });
        } else if (/\b(?:sauter|par-dessus)\b/.test(clean) && !isProhibitive) {
          sentenceMatched = true;
          const refs = extractPieceRefs(clean, keywordMap);
          const filter = refs.length > 0 ? refs[0] : 'all';
          const label = `À partir du ${turnN}e tour : ${getPieceFilterLabel(filter, allCustomPieces)} peut sauter`;
          timedRules.push({ kind: 'enable_jump_after', turnThreshold: turnN, targetFilter: filter, label });
          activeRules.push({ label, source: 'text', category: 'movement' });
        }
      }
    }

    const immobileUntilMatch = clean.match(
      /^(.*?)\b(?:ne\s+(?:peut|peuvent)\s+pas\s+(?:bouger|se\s+deplacer)|immobiles?)\s+(?:avant\s+le|pendant\s+les?)\s+(\d+|deux|trois|quatre|cinq|six|huit|dix)e?\s+tours?\b/
    );
    if (immobileUntilMatch) {
      const n = parseFrenchNumber(immobileUntilMatch[2]);
      if (n && n > 1) {
        sentenceMatched = true;
        const refs = extractPieceRefs(immobileUntilMatch[1], keywordMap);
        const filter = refs.length > 0 ? refs[0] : 'all';
        const label = `${getPieceFilterLabel(filter, allCustomPieces)} immobile avant le ${n}e tour`;
        timedRules.push({ kind: 'global_immobile_until', turnThreshold: n, targetFilter: filter, label });
        activeRules.push({ label, source: 'text', category: 'movement' });
      }
    }

    const capThresholdMatch =
      mainClause.match(
        /(?:apres|au\s+bout\s+de|des)\s+(\d+|un|une|premier|premiere|deux|trois|quatre|cinq|six)\s+captures?(?:\s+d'une\s+piece)?[, ]+(.*)$/
      ) ||
      mainClause.match(
        /^(.*?)\bqui\s+(?:fait|effectue|realise|capture|mange)\s+(\d+|un|une|deux|trois|quatre|cinq|six)\s+(?:captures?|pieces?)[, ]+(.*)$/
      );
    const isVictoryCapRule = /\b(?:on\s+gagne|gagne\s+la\s+partie|remporte|victoire)\b/.test(clean);
    if (capThresholdMatch && !isVictoryCapRule) {
      const isSecondForm = capThresholdMatch.length >= 4;
      const thresholdNum = parseFrenchNumber(isSecondForm ? capThresholdMatch[2] : capThresholdMatch[1]);
      const subjectText = isSecondForm ? capThresholdMatch[1] : capThresholdMatch[2];
      const effectText = isSecondForm ? capThresholdMatch[3] : capThresholdMatch[2];
      if (thresholdNum && thresholdNum >= 1) {
        const subjRefs = extractPieceRefs(
          isSecondForm ? subjectText : effectText.split(/\b(?:devient|se\s+transforme|gagne|immobile)\b/)[0],
          keywordMap
        );
        const targetFilters = subjRefs.length > 0 ? subjRefs : ['all'];

        if (/\b(?:devient\s+immobile|est\s+immobile|ne\s+peut\s+plus\s+bouger)\b/.test(effectText)) {
          sentenceMatched = true;
          for (const tf of targetFilters) {
            const label = `Après ${thresholdNum} capture(s), ${getPieceFilterLabel(tf, allCustomPieces)} devient immobile`;
            pieceEvolutionOnCaptures.push({
              filter: tf,
              threshold: thresholdNum,
              becomeImmobile: true,
              label,
            });
            activeRules.push({ label, source: 'text', category: 'capture' });
          }
        } else if (/\bgagne\b/.test(effectText)) {
          const rightOfGain = effectText.split(/\bgagne\b/)[1] || '';
          const grantedRefs = extractPieceRefs(rightOfGain, keywordMap);
          const grantId = grantedRefs.find((r) => r !== 'all' && r !== 'custom' && r !== 'builtin');
          if (grantId) {
            sentenceMatched = true;
            for (const tf of targetFilters) {
              const label = `Après ${thresholdNum} capture(s), ${getPieceFilterLabel(tf, allCustomPieces)} gagne les mouvements : ${getPieceFilterLabel(grantId, allCustomPieces)}`;
              pieceEvolutionOnCaptures.push({
                filter: tf,
                threshold: thresholdNum,
                grantPieceId: grantId,
                label,
              });
              activeRules.push({ label, source: 'text', category: 'capture' });
            }
          }
        } else if (/\b(?:devient|se\s+transforme\s+en)\b/.test(effectText)) {
          const rightOfBecome = effectText.split(/\b(?:devient|se\s+transforme\s+en)\b/)[1] || '';
          const becomeRefs = extractPieceRefs(rightOfBecome, keywordMap);
          const becomeId = becomeRefs.find((r) => r !== 'all' && r !== 'custom' && r !== 'builtin');
          if (becomeId) {
            sentenceMatched = true;
            for (const tf of targetFilters) {
              const label = `Après ${thresholdNum} capture(s), ${getPieceFilterLabel(tf, allCustomPieces)} devient ${getPieceFilterLabel(becomeId, allCustomPieces)}`;
              pieceEvolutionOnCaptures.push({
                filter: tf,
                threshold: thresholdNum,
                becomePieceId: becomeId,
                label,
              });
              activeRules.push({ label, source: 'text', category: 'capture' });
            }
          }
        }
      }
    }

    const promoOnCapMatch = !sentenceMatched
      ? mainClause.match(
          /\b(?:qui\s+(?:capture|mange)|apres\s+(?:avoir\s+)?(?:capture|mange)|quand[^.]*(?:capture|mange))[^.]*\b(?:devient|se\s+transforme\s+en)\s+(?:une?\s+)?(.+)$/
        )
      : null;
    if (
      promoOnCapMatch ||
      (!sentenceMatched && /\btransformation\s+en\s+\w+\s+apres\s+capture\b/.test(mainClause))
    ) {
      sentenceMatched = true;
      const beforePart = promoOnCapMatch ? mainClause.split(/\b(?:devient|se\s+transforme)\b/)[0] : mainClause;
      const subjRefs = extractPieceRefs(beforePart, keywordMap);
      const targetRefs = promoOnCapMatch ? extractPieceRefs(promoOnCapMatch[1], keywordMap) : ['builtin:Q'];
      const chosenTarget =
        targetRefs.find((t) => t !== 'all' && t !== 'custom' && t !== 'builtin') || 'builtin:Q';
      promoteOnCaptureTarget = chosenTarget;
      const targets = subjRefs.length > 0 ? subjRefs : ['all'];
      for (const t of targets) promoteOnCapturePieces.add(t);
      activeRules.push({
        label: `Transformation en ${getPieceFilterLabel(chosenTarget, allCustomPieces)} après une capture`,
        source: 'text',
        category: 'capture',
      });
    }

    if (
      /\b(?:echecs?\s+atomiques?|atomique|explosion\s+(?:lors|a\s+chaque|apres)\s+(?:des\s+|les\s+|une\s+)?captures?|captures?\s+explosives?|explosent?\s+(?:autour|les\s+pieces))\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      atomicCapture = true;
      activeRules.push({
        label: 'Échecs atomiques (chaque capture fait exploser les pièces non-pions autour)',
        source: 'text',
        category: 'capture',
      });
    } else if (
      /\b(?:captures?\s+(?:sont\s+)?(?:kamikazes?|mutuelles?)|kamikazes?|attaquant\s+(?:est\s+(?:aussi\s+)?detruit|disparait)|detruit\s+aussi\s+l'attaquant|meurt\s+aussi\s+en\s+(?:mangeant|capturant))\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      kamikazeOnCapture = true;
      activeRules.push({
        label: 'Capture kamikaze (la pièce qui capture est aussi détruite)',
        source: 'text',
        category: 'capture',
      });
    }

    if (
      /\b(?:(?:pieces?|une?\s+piece)\s+(?:defendues?|protegees?|soutenues?)\s+(?:par\s+(?:une?\s+(?:autre\s+)?piece|une?\s+alliee?)\s+)?(?:ne\s+(?:peut|peuvent)\s+pas\s+etre\s+(?:mangee?s?|capturee?s?|prise?s?)|(?:est|sont)\s+incapturables?)|impossible\s+de\s+(?:manger|capturer)\s+une\s+piece\s+(?:defendue|protegee))\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      protectedByAllyUncapturable = true;
      activeRules.push({
        label: 'Les pièces défendues par une alliée ne peuvent pas être capturées',
        source: 'text',
        category: 'capture',
      });
    }

    if (
      /\b(?:plus\s+faibles?\s+ou\s+egales?|pas\s+(?:manger|capturer|prendre)\s+(?:une?\s+piece\s+)?plus\s+forte?|ne\s+peut\s+pas\s+(?:manger|capturer)\s+plus\s+fort)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      captureValueRule = 'equal_or_weaker';
      activeRules.push({
        label: 'Capture limitée aux pièces de valeur inférieure ou égale',
        source: 'text',
        category: 'capture',
      });
    } else if (
      /\b(?:strictement\s+plus\s+faible|que\s+des\s+pieces\s+plus\s+faibles)\b/.test(clean)
    ) {
      sentenceMatched = true;
      captureValueRule = 'strictly_weaker';
      activeRules.push({
        label: 'Capture limitée aux pièces strictement plus faibles',
        source: 'text',
        category: 'capture',
      });
    } else if (
      /\b(?:meme\s+type\s+(?:de\s+piece\s+)?(?:uniquement|seulement)|seules?\s+les\s+pieces\s+identiques\s+peuvent\s+se\s+(?:manger|capturer)|ne\s+(?:peut|peuvent)\s+(?:manger|capturer)\s+que\s+(?:le\s+meme\s+type|des\s+pieces\s+identiques))\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      captureValueRule = 'same_piece_only';
      activeRules.push({
        label: 'Seules les pièces du même type peuvent se capturer',
        source: 'text',
        category: 'capture',
      });
    } else if (
      /\b(?:meme\s+type[^.]*ne\s+peuvent\s+pas\s+se\s+(?:manger|capturer)|interdit\s+de\s+(?:manger|capturer)\s+(?:le\s+meme\s+type|une\s+piece\s+identique))\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      captureValueRule = 'not_same_piece';
      activeRules.push({
        label: 'Les pièces identiques ne peuvent pas se capturer entre elles',
        source: 'text',
        category: 'capture',
      });
    }

    // 3b. Piece capture prohibitions, whitelists, passive "par", & conditional special square captures
    const hasCaptureVerb = captureVerbPattern.test(clean);
    const isPassiveCapture =
      /\b(?:etre\s+(?:capturee?s?|mangee?s?|prise?s?|eliminee?s?|tuee?s?)|se\s+faire\s+(?:manger|capturer|prendre)|invulnerables?|immunise(?:e|s|es)?)\b/.test(
        clean
      );

    if (
      !sentenceMatched &&
      (hasCaptureVerb || isPassiveCapture) &&
      (isProhibitive ||
        isExclusiveStart ||
        /\b(?:que|uniquement|seulement|exclusivement|sauf|a\s+moins)\b/.test(clean))
    ) {
      sentenceMatched = true;

      if (isPassiveCapture) {
        const subjectRefs = extractPieceRefs(
          mainClause.split(
            /\b(?:ne\s+(?:peut|peuvent)|est|sont|invulnerables?|immunise(?:e|s|es)?)\b/
          )[0],
          keywordMap
        );
        const targetList = subjectRefs.length > 0 ? subjectRefs : ['all'];
        const onSpecialOnly =
          clean.includes('case speciale') ||
          clean.includes('cases speciales') ||
          clean.includes('case *') ||
          clean.includes('case etoile');

        // Detect "par [attaquant]" or "face aux / contre [attaquant]" (strip trailing condition clause first)
        const mainWithoutCond = mainClause.replace(
          /\b(?:que\s+(?:si|s'|quand|lorsque)|uniquement\s+(?:si|s'|quand|lorsque|sur)|seulement\s+(?:si|s'|quand|lorsque|sur)|sauf\s+(?:si|s'|sur)|si\s+|s'il|s'elle).*$/,
          ''
        ).trim();
        const byMatch = mainWithoutCond.match(/\b(?:par|face\s+(?:a|au|aux)|contre)\s+(.+)$/);
        const byRefs = byMatch ? extractPieceRefs(byMatch[1], keywordMap) : [];
        const isByOnly =
          !isProhibitive && /\b(?:que\s+par|uniquement\s+par|seulement\s+par)\b/.test(mainWithoutCond);

        let passiveSpecialCond: CaptureRestrictionCondition | null = null;
        if (onSpecialOnly) {
          const condMatch = clean.match(
            /\b(que\s+(?:si|s'|quand|lorsque|sur)|uniquement\s+(?:si|s'|quand|lorsque|sur)|seulement\s+(?:si|s'|quand|lorsque|sur)|exclusivement\s+(?:si|s'|quand|lorsque|sur)|sauf\s+(?:si|s'|sur)|a\s+moins\s+qu|si\s+|s'il|s'elle|quand\s+|lorsque\s+|hors\s+|sur\s+(?:une|des|les)\s+cases?\s+speciales?)(.*)$/
          );
          const condPart = condMatch ? `${condMatch[1]}${condMatch[2]}` : clean;
          const condHasNegation = /\b(?:n'est\s+pas|ne\s+sont\s+pas|pas\s+sur|est\s+pas|sont\s+pas|sans\s+etre|hors)\b/.test(
            condPart
          );
          const condIsException = /\b(?:sauf|a\s+moins)\b/.test(condPart);
          const isExclusiveOnly =
            !isProhibitive &&
            /\b(?:que\s+(?:si|s'|quand|lorsque|sur)|uniquement|seulement|exclusivement)\b/.test(clean);
          const requireOnSpecial = isExclusiveOnly
            ? !condHasNegation
            : condHasNegation !== condIsException;
          const refersAttacker = /\b(?:attaquant|celui\s+qui\s+(?:attaque|capture|mange))\b/.test(condPart);
          if (requireOnSpecial) {
            passiveSpecialCond = refersAttacker ? 'attacker_on_special' : 'target_on_special';
          } else {
            passiveSpecialCond = refersAttacker ? 'attacker_not_on_special' : 'target_not_on_special';
          }
        }

        if (passiveSpecialCond && byRefs.length === 0) {
          if (targetList.includes('all') && passiveSpecialCond === 'target_not_on_special') {
            if (!specialProtected) {
              specialProtected = true;
              activeRules.push({
                label: 'Cases spéciales ✦ = Zone protégée (incapturable)',
                source: 'text',
                category: 'special',
              });
            }
          } else {
            for (const tr of targetList) {
              addCaptureRule('all', tr, passiveSpecialCond);
              activeRules.push({
                label: formatCaptureRestrictionLabel(
                  { id: 'txt', attacker: 'all', target: tr, condition: passiveSpecialCond },
                  allCustomPieces
                ),
                source: 'text',
                category: 'special',
              });
            }
          }
        } else if (isByOnly && byRefs.length > 0) {
          const cond = passiveSpecialCond || 'never';
          for (const tr of targetList) {
            addCaptureRule('all', tr, cond, byRefs);
            activeRules.push({
              label:
                cond === 'never'
                  ? `Seul ${byRefs.map((a) => getPieceFilterLabel(a, allCustomPieces)).join(', ')} peut capturer : ${getPieceFilterLabel(tr, allCustomPieces)}`
                  : formatCaptureRestrictionLabel(
                      { id: 'txt', attacker: 'all', target: tr, condition: cond, exemptAttackers: byRefs },
                      allCustomPieces
                    ),
              source: 'text',
              category: 'capture',
            });
          }
        } else if (byRefs.length > 0) {
          const cond = passiveSpecialCond || 'never';
          for (const att of byRefs) {
            for (const tr of targetList) {
              addCaptureRule(att, tr, cond);
              activeRules.push({
                label: formatCaptureRestrictionLabel(
                  { id: 'txt', attacker: att, target: tr, condition: cond },
                  allCustomPieces
                ),
                source: 'text',
                category: 'capture',
              });
            }
          }
        } else {
          const exIsAttacker = exceptionText ? extractPieceRefs(exceptionText, keywordMap) : [];
          for (const tr of targetList) {
            addCaptureRule('all', tr, 'never', exIsAttacker.length > 0 ? exIsAttacker : undefined);
            activeRules.push({
              label:
                exIsAttacker.length > 0
                  ? `Seul ${exIsAttacker.map((a) => getPieceFilterLabel(a, allCustomPieces)).join(', ')} peut capturer : ${getPieceFilterLabel(tr, allCustomPieces)}`
                  : `${getPieceFilterLabel(tr, allCustomPieces)} ne peut pas être capturé`,
              source: 'text',
              category: 'capture',
            });
          }
        }
      } else if (isExclusiveStart) {
        // "Seul le roi peut manger la dame"
        const parts = mainClause.split(captureVerbPattern);
        const allowedAtt = extractPieceRefs(parts[0] || '', keywordMap);
        const targetRefs = extractPieceRefs(parts[1] || '', keywordMap);
        const finalTargets = targetRefs.length > 0 ? targetRefs : ['all'];
        if (allowedAtt.length > 0) {
          for (const tgt of finalTargets) {
            addCaptureRule('all', tgt, 'never', allowedAtt);
            activeRules.push({
              label: `Seul ${allowedAtt.map((a) => getPieceFilterLabel(a, allCustomPieces)).join(', ')} peut capturer : ${getPieceFilterLabel(tgt, allCustomPieces)}`,
              source: 'text',
              category: 'capture',
            });
          }
        }
      } else {
        // Active prohibitive, target-whitelist ("ne peut manger que les pions"), or conditional ("uniquement si sur case spéciale")
        const parts = clean.split(captureVerbPattern);
        const leftPart = parts[0] || '';
        const right = parts.slice(1).join(' ');

        let targetRaw = right;
        let condRaw = '';
        const condSplit = right.match(
          /^(.*?)\b(que\s+(?:si|s'|quand|lorsque|sur)|sauf\s+si|sauf\s+s'|a\s+moins\s+qu|si\s+il|si\s+elle|si\s+on|s'il|s'elle|si\s+|quand\s+|lorsque\s+|hors\s+|uniquement\s+(?:si|s'|quand|lorsque|sur)|seulement\s+(?:si|s'|quand|lorsque|sur)|qui\s+n'est\s+pas|qui\s+ne\s+sont\s+pas|qui\s+est|qui\s+sont)\b(.*)$/
        );
        if (condSplit) {
          targetRaw = condSplit[1];
          condRaw = `${condSplit[2]}${condSplit[3]}`;
        }

        const attackerRefs = extractPieceRefs(leftPart, keywordMap);
        const finalAttackers = attackerRefs.length > 0 ? attackerRefs : ['all'];

        const targetRefs = extractPieceRefs(targetRaw, keywordMap);
        const finalTargets = targetRefs.length > 0 ? targetRefs : ['all'];

        // Detect target whitelist: "Les fous ne peuvent manger que les pions" OR "Les fous mangent uniquement les pions"
        const isTargetWhitelist =
          !condRaw &&
          targetRefs.length > 0 &&
          !targetRefs.includes('all') &&
          ((/\bne\s+(?:peut|peuvent)\s+(?:pas\s+)?/.test(leftPart) === false &&
            /\b(?:uniquement|seulement|exclusivement)\b/.test(clean)) ||
            (/\bne\b/.test(leftPart) && !isProhibitive && /\bque\b/.test(right)));

        if (isTargetWhitelist) {
          for (const att of finalAttackers) {
            addCaptureRule(att, 'all', 'never', undefined, targetRefs);
            activeRules.push({
              label: `${getPieceFilterLabel(att, allCustomPieces)} ne peut capturer que : ${targetRefs.map((t) => getPieceFilterLabel(t, allCustomPieces)).join(', ')}`,
              source: 'text',
              category: 'capture',
            });
          }
        } else {
          let condition: CaptureRestrictionCondition = 'never';

          if (
            condRaw &&
            (condRaw.includes('case speciale') ||
              condRaw.includes('cases speciales') ||
              condRaw.includes('case *') ||
              condRaw.includes('case etoile'))
          ) {
            const condHasNegation = /\b(?:n'est\s+pas|ne\s+sont\s+pas|pas\s+sur|est\s+pas|sont\s+pas|sans\s+etre|hors)\b/.test(
              condRaw
            );
            const condIsException = /\b(?:sauf|a\s+moins)\b/.test(condRaw);
            const requireOnSpecial = isProhibitive
              ? condHasNegation !== condIsException
              : !condHasNegation;

            const refersToEither = /\b(?:l'un\s+des\s+deux|au\s+moins\s+un|un\s+des\s+deux)\b/.test(
              condRaw
            );
            const targetMentionedInCond =
              /\b(?:cible|victime|celui-ci|celle-ci|qui\s+n'est\s+pas|qui\s+ne\s+sont\s+pas|qui\s+est|qui\s+sont)\b/.test(
                condRaw
              ) ||
              finalTargets.some((t) => t !== 'all' && extractPieceRefs(condRaw, keywordMap).includes(t));
            const attackerMentionedInCond =
              /\b(?:attaquant|depuis|en\s+etant)\b/.test(condRaw) ||
              finalAttackers.some(
                (a) => a !== 'all' && extractPieceRefs(condRaw, keywordMap).includes(a)
              );

            if (requireOnSpecial) {
              if (refersToEither) condition = 'either_on_special';
              else if (targetMentionedInCond && !attackerMentionedInCond) {
                condition = 'target_on_special';
              } else {
                condition = 'attacker_on_special';
              }
            } else {
              if (targetMentionedInCond && !attackerMentionedInCond) {
                condition = 'target_not_on_special';
              } else {
                condition = 'attacker_not_on_special';
              }
            }
          }

          const nounExRefs =
            !condRaw && exceptionText && !/case\s+speciale/.test(exceptionText)
              ? extractPieceRefs(exceptionText, keywordMap)
              : [];
          const exceptionMentionsPar = /\bpar\b/.test(exceptionText);
          const treatExceptionAsTarget =
            nounExRefs.length > 0 &&
            !exceptionMentionsPar &&
            !finalAttackers.includes('all') &&
            finalTargets.includes('all');

          for (const att of finalAttackers) {
            for (const tgt of finalTargets) {
              if (
                att !== 'all' &&
                tgt === 'all' &&
                condition === 'never' &&
                nounExRefs.length === 0
              ) {
                noCapturePieces.add(att);
                activeRules.push({
                  label: `${getPieceFilterLabel(att, allCustomPieces)} ne peut capturer aucune pièce`,
                  source: 'text',
                  category: 'capture',
                });
              } else {
                const exAtt = !treatExceptionAsTarget && nounExRefs.length > 0 ? nounExRefs : undefined;
                const exTgt = treatExceptionAsTarget && nounExRefs.length > 0 ? nounExRefs : undefined;
                addCaptureRule(att, tgt, condition, exAtt, exTgt);
                activeRules.push({
                  label: formatCaptureRestrictionLabel(
                    {
                      id: 'txt',
                      attacker: att,
                      target: tgt,
                      condition,
                      exemptAttackers: exAtt,
                      exemptTargets: exTgt,
                    },
                    allCustomPieces
                  ),
                  source: 'text',
                  category: 'capture',
                });
              }
            }
          }
        }
      }
    }

    // 4. Special square safe zone / protection & special-square dynamic effects from rules text
    if (
      clean.includes('case speciale') &&
      /(?:proteg|invulnerable|sanctuaire|refuge|ne\s+peuvent\s+pas\s+etre\s+pris|incapturable)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!specialProtected) {
        specialProtected = true;
        activeRules.push({
          label: 'Cases spéciales ✦ = Zone protégée (incapturable)',
          source: 'text',
          category: 'special',
        });
      }
    }

    if (
      clean.includes('case speciale') &&
      /\b(?:devient|se\s+transforme\s+en|promu(?:e|s)?\s+en)\b/.test(clean)
    ) {
      sentenceMatched = true;
      textSpecialEffectOverride = 'promote';
      const afterPart = clean.split(/\b(?:devient|se\s+transforme\s+en|promu(?:e|s)?\s+en)\b/)[1] || '';
      const refs = extractPieceRefs(afterPart, keywordMap);
      const chosen = refs.find((r) => r !== 'all' && r !== 'custom' && r !== 'builtin');
      if (chosen) specialPromoteTarget = chosen;
    } else if (
      clean.includes('case speciale') &&
      /\b(?:rejoue|action\s+bonus|\+1\s+(?:coup|action))\b/.test(clean)
    ) {
      sentenceMatched = true;
      textSpecialEffectOverride = 'double_action';
    } else if (
      clean.includes('case speciale') &&
      /\b(?:teleporte|portail)\b/.test(clean)
    ) {
      sentenceMatched = true;
      textSpecialEffectOverride = 'teleport';
    } else if (
      clean.includes('case speciale') &&
      /\b(?:gele|paralyse|bloque\s+la\s+piece)\b/.test(clean)
    ) {
      sentenceMatched = true;
      textSpecialEffectOverride = 'freeze';
    } else if (
      clean.includes('case speciale') &&
      /\b(?:piege|detruit|meurt)\b/.test(clean)
    ) {
      sentenceMatched = true;
      textSpecialEffectOverride = 'trap';
    }

    // 5. Captures only on/from special squares
    if (
      clean.includes('case speciale') &&
      /(?:capture|prise|manger)[^.]*(?:uniquement|seulement|que)[^.]*case\s+speciale/.test(clean)
    ) {
      sentenceMatched = true;
      if (!specialCaptureOnly) {
        specialCaptureOnly = true;
        activeRules.push({
          label: 'Captures uniquement depuis/sur une case spéciale ✦',
          source: 'text',
          category: 'special',
        });
      }
    }

    // 6. Special square access restriction (forbidden / only)
    if (mainClause.includes('case speciale') || mainClause.includes('cases speciales')) {
      const onlyMatch = mainClause.match(
        /\bseul(?:e|s|es)?\s+(.+?)\s+(?:peut|peuvent|a\s+le\s+droit|ont\s+le\s+droit)\s+(?:d'aller|d'entrer|aller|entrer|marcher|acceder|s'arreter)\s+sur\s+(?:la|les|une)\s+cases?\s+speciales?/
      );
      const forbidMatch = mainClause.match(
        /^(.*?)\b(?:ne\s+(?:peut|peuvent)\s+(?:pas|jamais)|n'a\s+(?:pas\s+)?le\s+droit|n'ont\s+(?:pas\s+)?le\s+droit|interdit\s+d'aller)\s+(?:d'aller|d'entrer|aller|entrer|marcher|acceder|s'arreter)?\s*sur\s+(?:la|les|une)\s+cases?\s+speciales?/
      );
      if (onlyMatch) {
        const refs = extractPieceRefs(onlyMatch[1], keywordMap);
        if (refs.length > 0) {
          sentenceMatched = true;
          for (const r of refs) onlySpecialPieces.add(r);
          activeRules.push({
            label: `Cases spéciales ✦ réservées à : ${refs.map((r) => getPieceFilterLabel(r, allCustomPieces)).join(', ')}`,
            source: 'text',
            category: 'special',
          });
        }
      } else if (forbidMatch && isProhibitive) {
        const refs = extractPieceRefs(forbidMatch[1], keywordMap);
        const targets = refs.length > 0 ? refs : ['all'];
        sentenceMatched = true;
        for (const r of targets) forbiddenSpecialPieces.add(r);
        activeRules.push({
          label: `Interdit sur cases spéciales ✦ : ${targets.map((r) => getPieceFilterLabel(r, allCustomPieces)).join(', ')}`,
          source: 'text',
          category: 'special',
        });
      }
    }

    // 7. Mandatory capture
    if (
      /(?:\b(?:prise|capture)s?\s+obligatoire|\bcaptures?\s+forcees?|\boblig[eé]s?\s+de\s+(?:manger|capturer|prendre)|\bdoit\s+(?:manger|capturer|prendre)\s+si\s+possible|\bdoivent\s+(?:manger|capturer|prendre)\s+si\s+possible|\bqui\s+peut\s+prendre\s+doit\s+prendre|\bil\s+faut\s+(?:manger|capturer|prendre)\s+si\s+possible)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!mandatoryCapture) {
        mandatoryCapture = true;
        activeRules.push({
          label: 'Prise obligatoire',
          source: 'text',
          category: 'capture',
        });
      }
    }

    // 8. Standard chess rule toggles (castling, en passant, double step, promotion)
    if (
      /(?:\bpas\s+de\s+roque|\broque\s+interdit|\bsans\s+roque|\baucun\s+roque|\bne\s+(?:peut|peuvent)\s+pas\s+roquer|\broque\s+desactive)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!disableCastling) {
        disableCastling = true;
        activeRules.push({ label: 'Roque interdit', source: 'text', category: 'general' });
      }
    }
    if (
      /(?:\bpas\s+de\s+prise\s+en\s+passant|\ben\s+passant\s+interdit|\bsans\s+prise\s+en\s+passant|\bpas\s+d'en\s+passant)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!disableEnPassant) {
        disableEnPassant = true;
        activeRules.push({
          label: 'Prise en passant interdite',
          source: 'text',
          category: 'general',
        });
      }
    }
    if (
      /(?:\bpas\s+de\s+double\s+pas|\bpions?\s+ne\s+peuvent\s+pas\s+avancer\s+de\s+(?:2|deux)\s+cases|\bpions?\s+n'avancent?\s+que\s+d'(?:1|une)\s+case|\bsans\s+double\s+avance)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!disablePawnDoubleStep) {
        disablePawnDoubleStep = true;
        activeRules.push({
          label: 'Double pas initial des pions interdit',
          source: 'text',
          category: 'movement',
        });
      }
    }
    if (
      /(?:\bpas\s+de\s+promotion|\bpromotion(?:\s+des\s+pions)?\s+interdite|\baucune\s+promotion|\bsans\s+promotion|\bpions?\s+ne\s+(?:se\s+)?promeuvent\s+pas|\bpions?\s+ne\s+se\s+transforment?\s+pas)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!disablePromotion) {
        disablePromotion = true;
        activeRules.push({
          label: 'Promotion des pions interdite',
          source: 'text',
          category: 'general',
        });
      }
    } else {
      const promoTargetMatch = clean.match(
        /(?:promeu(?:t|vent)|promotion|se\s+transforme(?:nt)?)\s+(?:uniquement\s+)?en\s+([a-z0-9' -]+)/
      );
      if (promoTargetMatch && !clean.includes('case speciale') && !/\b(?:capture|mange)\b/.test(clean)) {
        const refs = extractPieceRefs(promoTargetMatch[1], keywordMap);
        if (refs.length > 0 && refs[0] !== 'all' && refs[0] !== 'builtin:Q') {
          sentenceMatched = true;
          promoteToPieceId = refs[0];
          activeRules.push({
            label: `Promotion des pions en ${getPieceFilterLabel(refs[0], allCustomPieces)}`,
            source: 'text',
            category: 'general',
          });
        }
      }
    }

    // 9. No check / custom victory rules (1-check win, N-check win, antichess, stalemate=win, king of hill, opposite rank)
    if (
      /(?:\bpas\s+d'echec\b|\bechec\s+ignore|\bsans\s+echec\b|\broi\s+capturable\s+directement|\bpas\s+d'echec\s+et\s+mat)/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      if (!noCheckRestriction) {
        noCheckRestriction = true;
        activeRules.push({
          label: 'Échec ignoré (capture directe du Roi)',
          source: 'text',
          category: 'victory',
        });
      }
    }

    const checksMatch = clean.match(
      /(?:(?:faire|donner|mettre|infliger|gagner\s+(?:en|avec|apres|au))\s+)?(\d+|un|une|premier|premiere|deux|trois|quatre|cinq)\s+(?:fois\s+)?(?:en\s+)?echecs?\b/
    );
    if (checksMatch) {
      const targetN = parseFrenchNumber(checksMatch[1]);
      if (targetN && targetN > 0) {
        sentenceMatched = true;
        checksTarget = targetN;
        activeRules.push({
          label:
            targetN === 1
              ? 'Victoire au premier échec'
              : `Victoire après ${targetN} échecs infligés`,
          source: 'text',
          category: 'victory',
        });
      }
    } else if (/\b(?:premier\s+qui\s+fait\s+echec\s+gagne|faire\s+echec\s+(?:fait\s+)?gagne(?:r)?)\b/.test(clean)) {
      sentenceMatched = true;
      checksTarget = 1;
      activeRules.push({
        label: 'Victoire au premier échec',
        source: 'text',
        category: 'victory',
      });
    }

    if (/(?:qui\s+perd\s+(?:toutes\s+)?ses\s+pieces\s+gagne|antichess|qui\s+perd\s+gagne)/.test(clean)) {
      sentenceMatched = true;
      reverseWin = true;
      noCheckRestriction = true;
      activeRules.push({
        label: 'Qui-perd-gagne (perdre toutes ses pièces pour gagner)',
        source: 'text',
        category: 'victory',
      });
    }

    if (
      /\b(?:pat\s+(?:fait\s+)?gagne(?:r)?|mettre\s+pat\s+gagne|celui\s+qui\s+est\s+pat\s+perd|pas\s+de\s+pat)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      stalemateWins = true;
      activeRules.push({
        label: 'Le pat donne la victoire à celui qui bloque',
        source: 'text',
        category: 'victory',
      });
    }

    if (
      /(?:atteindre|amener|arriver\s+sur)[^.]*(?:derniere\s+(?:ligne|rangee)|camp\s+adverse|autre\s+cote)/.test(
        clean
      )
    ) {
      const refs = extractPieceRefs(clean, keywordMap);
      const targetRefs = refs.length > 0 ? refs : ['builtin:K'];
      sentenceMatched = true;
      for (const tr of targetRefs) {
        reachOppositeRankPieces.add(tr);
        activeRules.push({
          label: `Victoire si ${getPieceFilterLabel(tr, allCustomPieces)} atteint la dernière rangée`,
          source: 'text',
          category: 'victory',
        });
      }
    }

    if (
      /(?:amener|placer|atteindre|aller\s+sur)[^.]*case\s+speciale[^.]*(?:gagne|victoire)/.test(clean) ||
      /(?:gagne|victoire)[^.]*(?:en\s+atteignant|sur|avec)[^.]*case\s+speciale/.test(clean) ||
      /\broi\s+de\s+la\s+colline\b/.test(clean)
    ) {
      const refs = extractPieceRefs(clean, keywordMap);
      const finalWinRefs = refs.length > 0 ? refs : ['builtin:K'];
      sentenceMatched = true;
      for (const r of finalWinRefs) specialWinPieces.add(r);
      activeRules.push({
        label: `Victoire sur case spéciale ✦ (${finalWinRefs.map((r) => getPieceFilterLabel(r, allCustomPieces)).join(', ')})`,
        source: 'text',
        category: 'victory',
      });
    }

    // 10. Global OR per-piece range limit, actions per turn, capture target
    const maxRangeMatch =
      mainClause.match(
        /(?:portee\s+(?:maximale|max)?|maximum|max|limite(?:e|s)?\s+a|ne\s+(?:peut|peuvent)\s+(?:avancer|bouger|se\s+deplacer)\s+que\s+de|pas\s+plus\s+de)\s*(?:de\s+)?(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit)\s+cases?/
      ) ||
      mainClause.match(
        /(?:avancer|bouger|se\s+deplacer)\s+(?:de\s+)?(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit)\s+cases?\s*(?:max|maximum)/
      );
    if (maxRangeMatch) {
      const n = parseFrenchNumber(maxRangeMatch[1]);
      if (n && n > 0) {
        sentenceMatched = true;
        const clamped = Math.max(1, Math.min(16, n));
        const subjRefs = extractPieceRefs(
          mainClause.split(maxRangeMatch[0])[0] || mainClause,
          keywordMap
        );
        if (subjRefs.length > 0 && !subjRefs.includes('all')) {
          for (const sr of subjRefs) {
            pieceMaxSteps[sr] = clamped;
            activeRules.push({
              label: `Portée max (${getPieceFilterLabel(sr, allCustomPieces)}) : ${clamped} case(s)`,
              source: 'text',
              category: 'movement',
            });
          }
        } else {
          maxStepsPerMove = maxStepsPerMove > 0 ? Math.min(maxStepsPerMove, clamped) : clamped;
          activeRules.push({
            label: `Portée maximale globale : ${clamped} case(s)`,
            source: 'text',
            category: 'movement',
          });
        }
      }
    }

    const actionsMatch = mainClause.match(
      /(\d+|deux|trois|quatre|cinq)\s+(?:coups|actions)\s+par\s+tour\b/
    );
    if (actionsMatch) {
      const n = parseFrenchNumber(actionsMatch[1]);
      if (n && n >= 1) {
        sentenceMatched = true;
        actionsPerTurnOverride = Math.min(5, n);
        activeRules.push({
          label: `${actionsPerTurnOverride} action(s) par tour`,
          source: 'text',
          category: 'general',
        });
      }
    } else if (/\b(?:double\s+coup|joue(?:nt)?\s+deux\s+fois)\s+(?:par|a\s+chaque)\s+tour\b/.test(mainClause)) {
      sentenceMatched = true;
      actionsPerTurnOverride = 2;
      activeRules.push({
        label: '2 actions par tour',
        source: 'text',
        category: 'general',
      });
    }

    const capTargetMatch = mainClause.match(
      /(?:gagner\s+(?:avec|en\s+capturant|en\s+mangeant)|(?:apres|avec)\s+(?:\d+|deux|trois|quatre|cinq|six|sept|huit|dix)\s+captures?[^.]*(?:gagne|victoire)|(?:capturer|manger)\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|dix)\s+pieces?)/
    );
    const capTargetNumMatch = mainClause.match(
      /(?:gagner\s+(?:avec|en\s+capturant|en\s+mangeant)|(?:apres|avec)|(?:capturer|manger))\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|dix)\s+(?:pieces?|captures?)/
    );
    if (capTargetMatch && capTargetNumMatch) {
      const n = parseFrenchNumber(capTargetNumMatch[1]);
      if (n && n >= 1) {
        sentenceMatched = true;
        captureTargetOverride = n;
        activeRules.push({
          label: `Victoire après ${n} captures`,
          source: 'text',
          category: 'victory',
        });
      }
    }

    // 11. Teams & alliances parsing
    if (
      /\b(?:si\s+un\s+(?:allie|coequipier|membre)[^.]*(?:perd|elimine|mat)|defaite\s+(?:partagee|d'equipe)|toute\s+l'equipe\s+perd|mort\s+subite\s+d'equipe)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      teamSharedElimination = true;
    }

    if (
      /\b(?:allies?|coequipiers?|equipiers?)\s+(?:peuvent|peut)\s+se\s+(?:capturer|manger|prendre)\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
      allowTeammateCapture = true;
    } else if (
      /\b(?:allies?|coequipiers?|equipiers?)\s+ne\s+(?:peuvent|peut)\s+(?:pas\s+)?se\s+(?:capturer|manger|prendre)\b|\bpas\s+de\s+tir\s+allie\b/.test(
        clean
      )
    ) {
      sentenceMatched = true;
    }

    if (/\b(?:chacun\s+pour\s+soi|pas\s+d'equipes?|aucune\s+equipe|sans\s+equipes?)\b/.test(clean)) {
      sentenceMatched = true;
      rawTeamGroups = [];
    } else if (
      /\b(?:equipes?|teams?|allies?|alliance|coequipiers?|font\s+equipe|en\s+equipe|jouent\s+ensemble|2\s*v\s*2|2\s+contre\s+2|3\s*v\s*3|3\s+contre\s+3|2\s*v\s*1|2\s+contre\s+1)\b/.test(
        clean
      ) ||
      (/\b(?:contre|vs\.?|versus|face\s+a|opposes?\s+a)\b/.test(clean) &&
        extractSideMentionsInOrder(clean).length >= 3)
    ) {
      const hasVsSplit = /\b(?:contre|vs\.?|versus|face\s+a|opposes?\s+a)\b/.test(clean);
      const vsParts = hasVsSplit
        ? clean.split(/\b(?:contre|vs\.?|versus|face\s+a|opposes?\s+a)\b/)
        : [];
      const leftSides = vsParts.length >= 2 ? extractSideMentionsInOrder(vsParts[0]) : [];
      const rightSides =
        vsParts.length >= 2 ? extractSideMentionsInOrder(vsParts.slice(1).join(' ')) : [];

      if (
        leftSides.length >= 1 &&
        rightSides.length >= 1 &&
        (leftSides.length >= 2 ||
          rightSides.length >= 2 ||
          /\b(?:equipe|allie|2\s*v\s*2|2\s+contre\s+2)\b/.test(clean)) &&
        !leftSides.some((s) => rightSides.includes(s))
      ) {
        sentenceMatched = true;
        rawTeamGroups.push(leftSides, rightSides);
      } else {
        const namedTeamChunks = clean
          .split(/(?=\b(?:equipe|team|groupe)\s*(?:\d+|[a-z])\b)/)
          .map((c) => c.trim())
          .filter(Boolean);
        let parsedAnyTeamChunk = false;
        for (const chunk of namedTeamChunks) {
          const sides = extractSideMentionsInOrder(chunk);
          if (sides.length >= 2) {
            rawTeamGroups.push(sides);
            parsedAnyTeamChunk = true;
          }
        }
        if (parsedAnyTeamChunk) {
          sentenceMatched = true;
        } else if (
          /\b(?:2\s*v\s*2|2\s+contre\s+2|equipes?\s+alternees?|chacun\s+avec\s+le\s+joueur\s+en\s+face)\b/.test(
            clean
          )
        ) {
          sentenceMatched = true;
          if ((variant.players || 2) >= 4) {
            rawTeamGroups.push(['white', 'red'], ['black', 'blue']);
          }
        } else if (/\b(?:3\s*v\s*3|3\s+contre\s+3)\b/.test(clean)) {
          sentenceMatched = true;
          if ((variant.players || 2) >= 6) {
            rawTeamGroups.push(['white', 'red', 'green'], ['black', 'blue', 'gold']);
          }
        } else if (/\b(?:2\s*v\s*1|2\s+contre\s+1)\b/.test(clean)) {
          sentenceMatched = true;
          if ((variant.players || 2) >= 3) {
            rawTeamGroups.push(['white', 'red'], ['black']);
          }
        } else if (/\b(?:partage\s+de\s+la\s+victoire|victoire\s+(?:en|d')\s*equipe)\b/.test(clean)) {
          sentenceMatched = true;
        }
      }
    }

    // Ignore pure explanatory descriptions of already-configured board/pieces (like starter variants)
    const isBoardOrPieceNote =
      /\b(?:teleporte|bouclier|case\s+centrale|coins?\s+sont\s+supprimes|piliers?\s+bloquent|promeuvent\s+en\s+dame|1\s+ou\s+2\s+cases|echecs?\s+et\s+mat)\b/.test(
        clean
      );

    if (!sentenceMatched && fromRules && !isBoardOrPieceNote && clean.length > 4) {
      unrecognizedSentences.push(rawSentence);
    }
  }

  const boardSpecialEffect = resolveEffectiveSpecialEffect(variant.board);
  const effectiveSpecialEffect: SpecialCellEffectType =
    boardSpecialEffect !== 'none' ? boardSpecialEffect : textSpecialEffectOverride;

  if ((variant.board.special?.length || 0) > 0 && effectiveSpecialEffect !== 'none') {
    const effLabels: Record<SpecialCellEffectType, string> = {
      none: '',
      teleport: 'Cases spéciales ✦ : Téléportation',
      promote: `Cases spéciales ✦ : Promotion en ${getPieceFilterLabel(specialPromoteTarget, allCustomPieces)}`,
      shield: 'Cases spéciales ✦ : Bouclier (+1 défense)',
      double_action: 'Cases spéciales ✦ : +1 action bonus',
      freeze: 'Cases spéciales ✦ : Gèle la pièce 1 tour',
      trap: 'Cases spéciales ✦ : Piège mortel (hors Roi)',
      king_hill: 'Cases spéciales ✦ : Roi de la colline (victoire)',
    };
    if (effLabels[effectiveSpecialEffect]) {
      activeRules.push({
        label: effLabels[effectiveSpecialEffect],
        source: boardSpecialEffect !== 'none' ? 'board' : 'text',
        category: 'special',
      });
    }
  }

  const turnOrderParsed = parseTurnOrderSides(variant.turnOrder, variant.players);
  if (turnOrderParsed.isCustom) {
    activeRules.push({
      label: `Ordre des tours personnalisé : ${variant.turnOrder}`,
      source: 'structured',
      category: 'general',
    });
  }

  // Normalize team groups against active sides
  const defaultPool: PlayerSide[] = (['white', 'black', 'red', 'blue', 'green', 'gold'] as PlayerSide[]).slice(
    0,
    Math.max(2, Math.min(6, variant.players || 2))
  );
  const activePool: PlayerSide[] = [...defaultPool];
  for (const s of turnOrderParsed.sides) {
    if (!activePool.includes(s)) activePool.push(s);
  }
  const normalizedTeams: PlayerSide[][] = [];
  const usedInTeams = new Set<PlayerSide>();
  for (const grp of rawTeamGroups) {
    const cleanGrp: PlayerSide[] = [];
    for (const s of grp) {
      if (activePool.includes(s) && !usedInTeams.has(s)) {
        usedInTeams.add(s);
        cleanGrp.push(s);
      }
    }
    if (cleanGrp.length > 0) normalizedTeams.push(cleanGrp);
  }
  let teams: PlayerSide[][] = [];
  if (normalizedTeams.some((g) => g.length >= 2)) {
    teams = [...normalizedTeams];
    for (const s of activePool) {
      if (!usedInTeams.has(s)) {
        teams.push([s]);
      }
    }
    activeRules.push({
      label: `Équipes : ${teams.map((t) => formatTeamLabel(t)).join(' vs ')}`,
      source: rc.teamAssignments ? 'structured' : 'text',
      category: 'general',
    });
    if (teamSharedElimination) {
      activeRules.push({
        label: 'Défaite d’équipe partagée (si un allié tombe, son équipe perd)',
        source: rc.teamSharedElimination ? 'structured' : 'text',
        category: 'victory',
      });
    }
    if (allowTeammateCapture) {
      activeRules.push({
        label: 'Capture entre coéquipiers autorisée',
        source: 'text',
        category: 'capture',
      });
    }
  } else {
    teamSharedElimination = false;
    allowTeammateCapture = false;
  }

  const hasAnyCustomEnforcement =
    noBackwardAll ||
    noBackwardPieces.size > 0 ||
    noBackwardCaptureAll ||
    noBackwardCapturePieces.size > 0 ||
    allowPawnBackward ||
    allowPawnBackwardSides.size > 0 ||
    pawnCaptureForward ||
    berolinaPawns ||
    alwaysPawnDoubleStep ||
    pawnInitialSteps > 2 ||
    allCanJump ||
    canJumpPieces.size > 0 ||
    forbidJumpPieces.size > 0 ||
    immobilePieces.size > 0 ||
    forbidDiagonalPieces.size > 0 ||
    forbidOrthogonalPieces.size > 0 ||
    Object.keys(grantPieceMoves).length > 0 ||
    Object.keys(replacePieceMoves).length > 0 ||
    Object.keys(specialGrantPieceMoves).length > 0 ||
    Object.keys(pieceMaxSteps).length > 0 ||
    noSidewaysPieces.size > 0 ||
    strictlyForwardPieces.size > 0 ||
    onlyLightSquarePieces.size > 0 ||
    onlyDarkSquarePieces.size > 0 ||
    forbidLightSquarePieces.size > 0 ||
    forbidDarkSquarePieces.size > 0 ||
    mandatoryCapture ||
    allowFriendlyCapture ||
    noCaptureBeforeTurn > 0 ||
    extraActionOnCapture ||
    promoteOnCapturePieces.size > 0 ||
    kamikazeOnCapture ||
    atomicCapture ||
    protectedByAllyUncapturable ||
    captureValueRule !== 'none' ||
    actionsPerTurnOverride > 0 ||
    captureTargetOverride > 0 ||
    disableCastling ||
    disableEnPassant ||
    disablePawnDoubleStep ||
    disablePromotion ||
    Boolean(promoteToPieceId) ||
    noCheckRestriction ||
    specialProtected ||
    specialCaptureOnly ||
    forbiddenSpecialPieces.size > 0 ||
    onlySpecialPieces.size > 0 ||
    maxStepsPerMove > 0 ||
    wrapHorizontal ||
    noCapturePieces.size > 0 ||
    captureRestrictions.length > 0 ||
    checksTarget > 0 ||
    reverseWin ||
    stalemateWins ||
    reachOppositeRankPieces.size > 0 ||
    specialWinPieces.size > 0 ||
    effectiveSpecialEffect !== 'none' ||
    turnOrderParsed.isCustom ||
    teamSharedElimination ||
    allowPieceDrops ||
    pieceEvolutionOnCaptures.length > 0 ||
    timedRules.length > 0 ||
    teams.length > 0 ||
    unrecognizedSentences.length > 0;

  return {
    noBackwardAll,
    noBackwardPieces: Array.from(noBackwardPieces),
    noBackwardExemptPieces: Array.from(noBackwardExemptPieces),
    noBackwardExceptSpecial,
    noBackwardCaptureAll,
    noBackwardCapturePieces: Array.from(noBackwardCapturePieces),
    allowPawnBackward,
    allowPawnBackwardSides: Array.from(allowPawnBackwardSides),
    pawnCaptureForward,
    berolinaPawns,
    alwaysPawnDoubleStep,
    pawnInitialSteps,
    allCanJump,
    canJumpPieces: Array.from(canJumpPieces),
    forbidJumpPieces: Array.from(forbidJumpPieces),
    immobilePieces: Array.from(immobilePieces),
    forbidDiagonalPieces: Array.from(forbidDiagonalPieces),
    forbidOrthogonalPieces: Array.from(forbidOrthogonalPieces),
    grantPieceMoves,
    replacePieceMoves,
    specialGrantPieceMoves,
    pieceMaxSteps,
    noSidewaysPieces: Array.from(noSidewaysPieces),
    strictlyForwardPieces: Array.from(strictlyForwardPieces),
    onlyLightSquarePieces: Array.from(onlyLightSquarePieces),
    onlyDarkSquarePieces: Array.from(onlyDarkSquarePieces),
    forbidLightSquarePieces: Array.from(forbidLightSquarePieces),
    forbidDarkSquarePieces: Array.from(forbidDarkSquarePieces),
    mandatoryCapture,
    allowFriendlyCapture,
    noCaptureBeforeTurn,
    extraActionOnCapture,
    promoteOnCapturePieces: Array.from(promoteOnCapturePieces),
    promoteOnCaptureTarget,
    specialPromoteTarget,
    kamikazeOnCapture,
    atomicCapture,
    protectedByAllyUncapturable,
    captureValueRule,
    actionsPerTurnOverride,
    captureTargetOverride,
    disableCastling,
    disableEnPassant,
    disablePawnDoubleStep,
    disablePromotion,
    promoteToPieceId,
    noCheckRestriction,
    specialProtected,
    specialCaptureOnly,
    forbiddenSpecialPieces: Array.from(forbiddenSpecialPieces),
    onlySpecialPieces: Array.from(onlySpecialPieces),
    maxStepsPerMove,
    wrapHorizontal,
    noCapturePieces: Array.from(noCapturePieces),
    captureRestrictions,
    checksTarget,
    reverseWin,
    stalemateWins,
    reachOppositeRankPieces: Array.from(reachOppositeRankPieces),
    specialWinPieces: Array.from(specialWinPieces),
    effectiveSpecialEffect,
    turnOrderSides: turnOrderParsed.sides,
    hasCustomTurnOrder: turnOrderParsed.isCustom,
    teams,
    teamSharedElimination,
    allowTeammateCapture,
    allowPieceDrops,
    pieceEvolutionOnCaptures,
    timedRules,
    hasAnyCustomEnforcement,
    activeRules,
    unrecognizedSentences,
  };
}

export function resolveDynamicSpecialEffect(
  compiled: CompiledVariantRules,
  fullMoveNumber: number
): SpecialCellEffectType {
  const rot = compiled.timedRules?.find((t) => t.kind === 'rotate_special_effect');
  if (rot && rot.effectsCycle && rot.effectsCycle.length > 0) {
    const interval = Math.max(1, rot.interval || rot.turnThreshold || 3);
    const phaseIdx = Math.floor(Math.max(0, fullMoveNumber - 1) / interval) % rot.effectsCycle.length;
    return rot.effectsCycle[phaseIdx];
  }
  return compiled.effectiveSpecialEffect;
}

export function formatCaptureRestrictionLabel(
  r: VariantCaptureRestriction,
  customPieces: PieceDef[] = []
): string {
  const att = getPieceFilterLabel(r.attacker, customPieces);
  const tgt = getPieceFilterLabel(r.target, customPieces);
  const exemptAttList =
    r.exemptAttackers && r.exemptAttackers.length > 0
      ? r.exemptAttackers.map((id) => getPieceFilterLabel(id, customPieces)).join(', ')
      : '';
  const exemptTgtList =
    r.exemptTargets && r.exemptTargets.length > 0
      ? r.exemptTargets.map((id) => getPieceFilterLabel(id, customPieces)).join(', ')
      : '';

  if (r.attacker === 'all' && r.condition === 'never' && exemptAttList) {
    return `Seul ${exemptAttList} peut capturer : ${tgt}`;
  }
  if (r.target === 'all' && r.condition === 'never' && exemptTgtList) {
    return `${att} ne peut capturer que : ${exemptTgtList}`;
  }

  const suffix = exemptAttList
    ? ` (sauf ${exemptAttList})`
    : exemptTgtList
      ? ` (sauf ${exemptTgtList})`
      : '';
  switch (r.condition) {
    case 'never':
      return `${att} ne peut jamais capturer : ${tgt}${suffix}`;
    case 'attacker_on_special':
      return `${att} ne capture ${tgt} que si l’attaquant est sur case spéciale ✦${suffix}`;
    case 'target_on_special':
      return `${att} ne capture ${tgt} que si la cible est sur case spéciale ✦${suffix}`;
    case 'either_on_special':
      return `${att} ne capture ${tgt} que si l’un des deux est sur case spéciale ✦${suffix}`;
    case 'attacker_not_on_special':
      return `${att} ne peut pas capturer ${tgt} depuis une case spéciale ✦${suffix}`;
    case 'target_not_on_special':
      return `${att} ne peut pas capturer ${tgt} sur une case spéciale ✦${suffix}`;
  }
}

export function isPieceBackwardForbidden(
  compiled: CompiledVariantRules,
  pieceId: string,
  from: number,
  to: number,
  board: BoardConfig,
  customDef?: PieceDef,
  pieceSide?: PlayerSide
): boolean {
  if (customDef && (customDef.moves.forwardOnly || parsePieceTextConfig(customDef).forwardOnly)) {
    return true;
  }
  const specialSet = board.special || [];
  if (compiled.noBackwardExceptSpecial && (specialSet.includes(from) || specialSet.includes(to))) {
    return false;
  }
  if (compiled.noBackwardPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) return true;
  if (
    compiled.noBackwardAll &&
    !compiled.noBackwardExemptPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))
  ) {
    return true;
  }
  return false;
}

export function isPieceBackwardCaptureForbidden(
  compiled: CompiledVariantRules,
  pieceId: string,
  pieceSide?: PlayerSide
): boolean {
  if (compiled.noBackwardCaptureAll) return true;
  return compiled.noBackwardCapturePieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide));
}

export function isPieceSidewaysForbidden(
  compiled: CompiledVariantRules,
  pieceId: string,
  customDef?: PieceDef,
  pieceSide?: PlayerSide
): { noSideways: boolean; strictlyForward: boolean } {
  const parsed = customDef ? parsePieceTextConfig(customDef) : null;
  const strictlyForward =
    Boolean(parsed?.strictlyForward) ||
    compiled.strictlyForwardPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide));
  const noSideways =
    strictlyForward ||
    Boolean(parsed?.noSideways) ||
    compiled.noSidewaysPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide));
  return { noSideways, strictlyForward };
}

export function isSpecialEntryAllowed(
  compiled: CompiledVariantRules,
  board: BoardConfig,
  pieceId: string,
  to: number,
  pieceSide?: PlayerSide
): boolean {
  if (!board.special?.includes(to)) return true;
  if (compiled.forbiddenSpecialPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) {
    return false;
  }
  if (
    compiled.onlySpecialPieces.length > 0 &&
    !compiled.onlySpecialPieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))
  ) {
    return false;
  }
  return true;
}

export function isSquareColorAllowed(
  compiled: CompiledVariantRules,
  pieceId: string,
  to: number,
  cols: number,
  pieceSide?: PlayerSide
): boolean {
  const r = Math.floor(to / cols);
  const c = to % cols;
  const isLight = (r + c) % 2 === 0;
  if (isLight && compiled.forbidLightSquarePieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) {
    return false;
  }
  if (!isLight && compiled.forbidDarkSquarePieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) {
    return false;
  }
  if (!isLight && compiled.onlyLightSquarePieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) {
    return false;
  }
  if (isLight && compiled.onlyDarkSquarePieces.some((f) => doesPieceMatchFilter(pieceId, f, pieceSide))) {
    return false;
  }
  return true;
}

export function canPieceCaptureTarget(
  compiled: CompiledVariantRules,
  board: BoardConfig,
  attackerPieceId: string,
  from: number,
  victimPieceId: string,
  victimSquare: number,
  customPieces: PieceDef[] = [],
  fullMoveNumber?: number,
  options?: {
    attackerValue?: number;
    victimValue?: number;
    isVictimDefended?: boolean;
    isBackwardMove?: boolean;
    attackerSide?: PlayerSide;
    victimSide?: PlayerSide;
  }
): { allowed: boolean; reason?: string } {
  const attSide = options?.attackerSide;
  const vicSide = options?.victimSide;

  if (
    compiled.noCaptureBeforeTurn > 0 &&
    fullMoveNumber !== undefined &&
    fullMoveNumber < compiled.noCaptureBeforeTurn
  ) {
    return {
      allowed: false,
      reason:
        compiled.noCaptureBeforeTurn === 2
          ? 'Aucune capture autorisée au premier tour.'
          : `Aucune capture autorisée avant le ${compiled.noCaptureBeforeTurn}e tour.`,
    };
  }

  if (options?.isBackwardMove && isPieceBackwardCaptureForbidden(compiled, attackerPieceId, attSide)) {
    return {
      allowed: false,
      reason: `${getPieceFilterLabel(attackerPieceId, customPieces)} ne peut pas capturer en reculant.`,
    };
  }

  const specialSquares = board.special || [];
  const isFromSpecial = specialSquares.includes(from);
  const isToSpecial = specialSquares.includes(victimSquare);

  if (compiled.noCapturePieces.some((f) => doesPieceMatchFilter(attackerPieceId, f, attSide))) {
    return {
      allowed: false,
      reason: `${getPieceFilterLabel(attackerPieceId, customPieces)} ne peut capturer aucune pièce.`,
    };
  }

  if (compiled.specialProtected && isToSpecial) {
    return {
      allowed: false,
      reason: 'Pièce protégée : une pièce sur une case spéciale ✦ ne peut pas être capturée.',
    };
  }

  if (compiled.specialCaptureOnly && !isFromSpecial && !isToSpecial) {
    return {
      allowed: false,
      reason: 'Règle de la variante : les captures sont uniquement autorisées sur ou depuis une case spéciale ✦.',
    };
  }

  if (compiled.protectedByAllyUncapturable && options?.isVictimDefended) {
    return {
      allowed: false,
      reason: 'Pièce défendue : une pièce protégée par une alliée ne peut pas être capturée.',
    };
  }

  if (compiled.captureValueRule === 'same_piece_only' && attackerPieceId !== victimPieceId) {
    return {
      allowed: false,
      reason: 'Seules les pièces du même type peuvent se capturer.',
    };
  }
  if (compiled.captureValueRule === 'not_same_piece' && attackerPieceId === victimPieceId) {
    return {
      allowed: false,
      reason: 'Deux pièces identiques ne peuvent pas se capturer.',
    };
  }
  if (
    compiled.captureValueRule === 'equal_or_weaker' &&
    options?.attackerValue !== undefined &&
    options?.victimValue !== undefined &&
    options.victimValue > options.attackerValue
  ) {
    return {
      allowed: false,
      reason: 'Impossible de capturer une pièce plus forte que l’attaquant.',
    };
  }
  if (
    compiled.captureValueRule === 'strictly_weaker' &&
    options?.attackerValue !== undefined &&
    options?.victimValue !== undefined &&
    options.victimValue >= options.attackerValue
  ) {
    return {
      allowed: false,
      reason: 'Impossible de capturer une pièce de force supérieure ou égale.',
    };
  }

  for (const rule of compiled.captureRestrictions) {
    if (!doesPieceMatchFilter(attackerPieceId, rule.attacker, attSide)) continue;
    if (!doesPieceMatchFilter(victimPieceId, rule.target, vicSide)) continue;
    if (
      rule.exemptAttackers &&
      rule.exemptAttackers.some((ea) => doesPieceMatchFilter(attackerPieceId, ea, attSide))
    ) {
      continue;
    }
    if (
      rule.exemptTargets &&
      rule.exemptTargets.some((et) => doesPieceMatchFilter(victimPieceId, et, vicSide))
    ) {
      continue;
    }

    switch (rule.condition) {
      case 'never':
        return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
      case 'attacker_on_special':
        if (!isFromSpecial) {
          return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
        }
        break;
      case 'target_on_special':
        if (!isToSpecial) {
          return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
        }
        break;
      case 'either_on_special':
        if (!isFromSpecial && !isToSpecial) {
          return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
        }
        break;
      case 'attacker_not_on_special':
        if (isFromSpecial) {
          return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
        }
        break;
      case 'target_not_on_special':
        if (isToSpecial) {
          return { allowed: false, reason: formatCaptureRestrictionLabel(rule, customPieces) };
        }
        break;
    }
  }

  return { allowed: true };
}
