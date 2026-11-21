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
  allowPawnBackward: boolean;
  pawnCaptureForward: boolean;
  allCanJump: boolean;
  canJumpPieces: string[];
  forbidDiagonalPieces: string[];
  forbidOrthogonalPieces: string[];
  grantPieceMoves: Record<string, string[]>;
  pieceMaxSteps: Record<string, number>;
  noSidewaysPieces: string[];
  strictlyForwardPieces: string[];
  mandatoryCapture: boolean;
  allowFriendlyCapture: boolean;
  noCaptureBeforeTurn: number; // 0 = allowed from turn 1
  extraActionOnCapture: boolean;
  promoteOnCapturePieces: string[];
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
  noCapturePieces: string[];
  captureRestrictions: VariantCaptureRestriction[];
  checksTarget: number; // 0 = disabled
  reverseWin: boolean;
  reachOppositeRankPieces: string[];
  specialWinPieces: string[];
  effectiveSpecialEffect: SpecialCellEffectType;
  turnOrderSides: PlayerSide[];
  hasCustomTurnOrder: boolean;
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

export function getPieceFilterLabel(
  filter: PieceTargetFilter,
  customPieces: PieceDef[] = []
): string {
  if (BUILTIN_PIECE_LABELS[filter]) return BUILTIN_PIECE_LABELS[filter];
  const found = customPieces.find((p) => p.id === filter);
  return found ? found.name : filter;
}

export function doesPieceMatchFilter(
  pieceId: string,
  filter: PieceTargetFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'custom') return !pieceId.startsWith('builtin:');
  return pieceId === filter;
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

function extractPieceRefs(
  fragment: string,
  keywordMap: { keyword: string; pieceId: string }[]
): string[] {
  const clean = normalizeFr(fragment);
  const found = new Set<string>();
  for (const entry of keywordMap) {
    // Word boundary-ish match compatible with apostrophes
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(entry.keyword)}(?:$|[^a-z0-9])`);
    if (re.test(clean)) {
      // Prevent false positive "tour" inside "au tour" / "chaque tour" / "3e tour" / "tour de jeu"
      if (
        (entry.keyword === 'tour' || entry.keyword === 'tours') &&
        /\b(?:au|du|le|ce|chaque|premier|dernier|prochain|\d+e?)\s+tour\b/.test(clean) &&
        !/\b(?:la|les|une|des)\s+tours?\b/.test(clean)
      ) {
        continue;
      }
      found.add(entry.pieceId);
    }
  }
  if (
    found.size === 0 &&
    /\b(?:toutes?\s+les\s+pieces|les\s+pieces|aucune\s+piece|n'importe\s+quelle\s+piece|toute\s+piece|pieces\s+personnalisees)\b/.test(
      clean
    )
  ) {
    if (clean.includes('pieces personnalisees')) found.add('custom');
    else found.add('all');
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
  const initial = (text || '')
    .split(/[.\n;!]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const verbDetector =
    /(?:\bne\s+(?:peut|peuvent|mange|mangent|capture|capturent|prend|prennent)|\bn'(?:a|ont)\s+(?:pas\s+)?le\s+droit|\ba\s+le\s+droit|\bont\s+le\s+droit|\binterdit|\bobligatoire|\bpas\s+de\b|\bsans\s+(?:roque|promotion|en\s+passant|double)|\buniquement\b|\bgagne|\bvictoire|\bproteg|\binvulnerable|\bportee\s+max|\bpeut\s+sauter|\brejoue|\bmange|\bcapture|\bbouge|\bse\s+deplace)/;
  const out: string[] = [];
  for (const part of initial) {
    // Do NOT split on commas inside parenthetical exceptions or after short temporal/conditional prefixes
    const etParts = part.split(
      /\s+(?:et|mais)\s+|,\s+(?!(?:sauf|hormis|excepte|a\s+part|a\s+l'exception)\b)/i
    );
    if (etParts.length > 1) {
      let current = etParts[0];
      for (let i = 1; i < etParts.length; i++) {
        const nextSeg = etParts[i];
        const normCur = normalizeFr(current);
        const isLeadingCondition =
          /^(?:si|quand|lorsque|apres|avant|en\s+cas|des\s+qu|au\s+(?:premier|1er))\b/.test(normCur);
        if (
          !isLeadingCondition &&
          verbDetector.test(normCur) &&
          verbDetector.test(normalizeFr(nextSeg))
        ) {
          out.push(current.trim());
          current = nextSeg;
        } else {
          current = `${current} ${nextSeg}`;
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
    /(?:,\s*)?\b(?:sauf|hormis|excepte|a\s+part|a\s+l'exception\s+(?:de|du|des))\s+(?!si\b|s')([^,;.]+?)(?=\s*(?:,|\b(?:n'a|n'ont|a\s+le|ont\s+le|ne\s+peu|peut|peuvent|est|sont|ont)\b|$))/;
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
    /\b(?:ne\s+(?:peut|peuvent|doit|doivent|sait|savent|mange|mangent|capture|capturent|prend|prennent|va|vont|bouge|bougent|recule|reculent)\s+(?:pas|jamais|plus|aucunement)|n'(?:a|ont)\s+(?:pas|jamais|aucun)\b|interdit|interdiction|prohibe|defense\s+de|impossible\s+de|pas\s+le\s+droit|pas\s+de\s+recul|sans\s+(?:pouvoir|reculer))\b/.test(
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
  let allowPawnBackward = false;
  let pawnCaptureForward = false;
  let allCanJump = false;
  const canJumpPieces = new Set<string>();
  const forbidDiagonalPieces = new Set<string>();
  const forbidOrthogonalPieces = new Set<string>();
  const grantPieceMoves: Record<string, string[]> = {};
  const pieceMaxSteps: Record<string, number> = {};
  const noSidewaysPieces = new Set<string>(rc.noSidewaysPieces || []);
  const strictlyForwardPieces = new Set<string>(rc.strictlyForwardPieces || []);
  let mandatoryCapture = Boolean(rc.mandatoryCapture);
  let allowFriendlyCapture = false;
  let noCaptureBeforeTurn = 0;
  let extraActionOnCapture = false;
  const promoteOnCapturePieces = new Set<string>();
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
  const noCapturePieces = new Set<string>();
  const captureRestrictions: VariantCaptureRestriction[] = [...(rc.captureRestrictions || [])];

  let checksTarget = 0;
  let reverseWin = false;
  const reachOppositeRankPieces = new Set<string>();
  const specialWinPieces = new Set<string>();

  const activeRules: DetectedRuleBadge[] = [];
  const unrecognizedSentences: string[] = [];

  const addCaptureRule = (
    attacker: string,
    target: string,
    condition: CaptureRestrictionCondition,
    exemptAttackers?: string[]
  ) => {
    const exists = captureRestrictions.some(
      (r) => r.attacker === attacker && r.target === target && r.condition === condition
    );
    if (!exists) {
      captureRestrictions.push({
        id: `txt_${captureRestrictions.length + 1}_${attacker}_${target}`,
        attacker,
        target,
        condition,
        exemptAttackers,
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

  for (const { raw: rawSentence, fromRules } of combinedClauses) {
    const clean = normalizeFr(rawSentence);
    if (!clean || isStandardBoilerplate(clean)) continue;

    let sentenceMatched = false;
    const { mainClause, exceptionText } = extractNounException(clean);
    const isProhibitive = hasProhibitivePolarity(mainClause);
    const isExclusiveStart = /^\s*(?:seul(?:e|s|es)?|uniquement|seulement)\b/.test(mainClause);

    // 1. Backward restriction OR permission (handles "ne peuvent pas reculer", "aucune pièce, sauf X, a le droit de reculer", "les pions peuvent reculer")
    if (
      /\b(?:reculer|recule|recul|en\s+arriere|vers\s+l'arriere|marche\s+arriere)\b/.test(mainClause) ||
      /(?:ne\s+(?:peut|peuvent)\s+qu'avancer|avancent?\s+uniquement|uniquement\s+vers\s+l'avant|seulement\s+vers\s+l'avant)/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      const exHasSpecial = /case\s+speciale/.test(exceptionText);
      const exRefs = exceptionText && !exHasSpecial ? extractPieceRefs(exceptionText, keywordMap) : [];
      if (exHasSpecial) noBackwardExceptSpecial = true;
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
              label: exHasSpecial
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
      } else {
        // Permissive backward rule (e.g., "les pions peuvent reculer")
        const refs = extractPieceRefs(mainClause, keywordMap);
        if (refs.includes('builtin:P') || refs.includes('all')) {
          allowPawnBackward = true;
          activeRules.push({
            label: 'Les pions ont le droit de reculer',
            source: 'text',
            category: 'movement',
          });
        }
      }
    }

    // 1b. Pawns capture forward
    if (
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

    // 2. Sideways / diagonal / orthogonal restrictions
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
      /\b(?:en\s+ligne\s+droite|orthogonal(?:ement)?)\b/.test(mainClause) &&
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

    // 2b. Jumping permission ("toutes les pieces peuvent sauter", "les tours peuvent sauter")
    if (
      !isProhibitive &&
      /\b(?:peut|peuvent|a\s+le\s+droit\s+de|ont\s+le\s+droit\s+de)\s+sauter\b/.test(mainClause)
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause, keywordMap);
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

    // 2c. Piece movement mimicry ("[A] se deplace aussi comme [B]")
    const mimicMatch = mainClause.match(
      /^(.*?)\b(?:se\s+deplace(?:nt)?|bouge(?:nt)?|a\s+les\s+deplacements?|ont\s+les\s+deplacements?)\s+(?:aussi\s+)?(?:comme|d'un|d'une|de\s+la|du)\s+(.+)$/
    );
    if (mimicMatch) {
      const subjRefs = extractPieceRefs(mimicMatch[1], keywordMap);
      const templateRefs = extractPieceRefs(mimicMatch[2], keywordMap);
      if (subjRefs.length > 0 && templateRefs.length > 0) {
        sentenceMatched = true;
        for (const s of subjRefs) {
          if (!grantPieceMoves[s]) grantPieceMoves[s] = [];
          for (const t of templateRefs) {
            if (!grantPieceMoves[s].includes(t)) grantPieceMoves[s].push(t);
          }
          activeRules.push({
            label: `${getPieceFilterLabel(s, allCustomPieces)} bouge comme : ${templateRefs.map((t) => getPieceFilterLabel(t, allCustomPieces)).join(', ')}`,
            source: 'text',
            category: 'movement',
          });
        }
      }
    }

    // 3. Special combat rules: friendly capture, turn-1 capture ban, bonus action on capture, promote on capture
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
        /\b(?:pas\s+de|aucune?)\s+(?:capture|prise)\s+avant\s+le\s+(\d+|deux|trois|quatre|cinq)e?\s+tour\b/
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
      /\b(?:rejoue(?:r)?\s+apres\s+une\s+capture|apres\s+une\s+capture[^.]*rejoue|capture\s+donne\s+une\s+action|capturer\s+permet\s+de\s+rejouer)\b/.test(
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

    if (
      /\b(?:qui\s+(?:capture|mange)[^.]*devient\s+(?:une?\s+)?dame|transformation\s+en\s+dame\s+apres\s+capture)\b/.test(
        mainClause
      )
    ) {
      sentenceMatched = true;
      const refs = extractPieceRefs(mainClause.split(/\bdevient\b/)[0], keywordMap);
      const targets = refs.length > 0 ? refs : ['all'];
      for (const t of targets) promoteOnCapturePieces.add(t);
      activeRules.push({
        label: 'Transformation en Dame après une capture',
        source: 'text',
        category: 'capture',
      });
    }

    // 3b. Piece capture prohibitions & conditional special square captures
    const captureVerbPattern =
      /\b(?:manger|mangent?|capturer|capturent?|prendre|prennent?|eliminer|tuer)\b/;
    const hasCaptureVerb = captureVerbPattern.test(clean);
    const isPassiveCapture = /\b(?:etre\s+(?:capturee?s?|mangee?s?|prise?s?)|se\s+faire\s+(?:manger|capturer|prendre)|invulnerables?)\b/.test(
      clean
    );

    if (
      !sentenceMatched &&
      (hasCaptureVerb || isPassiveCapture) &&
      (isProhibitive || isExclusiveStart || /\bque\s+(?:si|s'|quand|lorsque|sur)\b/.test(clean))
    ) {
      sentenceMatched = true;

      if (isPassiveCapture) {
        const subjectRefs = extractPieceRefs(
          mainClause.split(/\b(?:ne\s+(?:peut|peuvent)|est|sont|invulnerables?)\b/)[0],
          keywordMap
        );
        const onSpecialOnly = clean.includes('case speciale') || clean.includes('cases speciales');
        if (onSpecialOnly) {
          if (subjectRefs.length === 0 || subjectRefs.includes('all')) {
            if (!specialProtected) {
              specialProtected = true;
              activeRules.push({
                label: 'Cases spéciales ✦ = Zone protégée (incapturable)',
                source: 'text',
                category: 'special',
              });
            }
          } else {
            for (const tr of subjectRefs) {
              addCaptureRule('all', tr, 'target_not_on_special');
              activeRules.push({
                label: `${getPieceFilterLabel(tr, allCustomPieces)} ne peut pas être capturé sur une case spéciale ✦`,
                source: 'text',
                category: 'special',
              });
            }
          }
        } else {
          // Completely uncapturable piece(s) anywhere on the board!
          const targets = subjectRefs.length > 0 ? subjectRefs : ['all'];
          for (const tr of targets) {
            addCaptureRule('all', tr, 'never');
            activeRules.push({
              label: `${getPieceFilterLabel(tr, allCustomPieces)} ne peut pas être capturé`,
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
        // Active prohibitive or "ne ... que si" capture rule
        const parts = clean.split(captureVerbPattern);
        const leftPart = parts[0] || '';
        const right = parts.slice(1).join(' ');
        const isOnlyIfForm = !isProhibitive && /\bque\s+(?:si|s'|quand|lorsque|sur)\b/.test(clean);

        let targetRaw = right;
        let condRaw = '';
        const condSplit = right.match(
          /^(.*?)\b(que\s+(?:si|s'|quand|lorsque|sur)|sauf\s+si|sauf\s+s'|sauf\b|a\s+moins\s+qu|si\s+il|si\s+elle|si\s+on|s'il|s'elle|si\s+|quand\s+|lorsque\s+|hors\s+|uniquement\s+|seulement\s+|qui\s+n'est\s+pas|qui\s+ne\s+sont\s+pas|qui\s+est|qui\s+sont)\b(.*)$/
        );
        if (condSplit) {
          targetRaw = condSplit[1];
          condRaw = `${condSplit[2]}${condSplit[3]}`;
        }

        const attackerRefs = extractPieceRefs(leftPart, keywordMap);
        const finalAttackers = attackerRefs.length > 0 ? attackerRefs : ['all'];

        const targetRefs = extractPieceRefs(targetRaw, keywordMap);
        const finalTargets = targetRefs.length > 0 ? targetRefs : ['all'];

        let condition: CaptureRestrictionCondition = 'never';

        if (
          condRaw &&
          (condRaw.includes('case speciale') ||
            condRaw.includes('cases speciales') ||
            condRaw.includes('case *') ||
            condRaw.includes('case etoile'))
        ) {
          const isNegatedRestriction =
            isOnlyIfForm ||
            /\b(?:sauf|a\s+moins|pas\s+sur|ne\s+sont\s+pas|n'est\s+pas|sont\s+pas|est\s+pas|sans\s+etre|hors|uniquement|seulement)\b/.test(
              condRaw
            );

          const refersToEither = /\b(?:l'un\s+des\s+deux|au\s+moins\s+un|un\s+des\s+deux)\b/.test(condRaw);
          const targetMentionedInCond =
            /\b(?:cible|victime|celui-ci|celle-ci|qui\s+n'est\s+pas|qui\s+ne\s+sont\s+pas|qui\s+est|qui\s+sont)\b/.test(
              condRaw
            ) ||
            finalTargets.some((t) => t !== 'all' && extractPieceRefs(condRaw, keywordMap).includes(t));
          const attackerMentionedInCond =
            /\b(?:attaquant|depuis|en\s+etant)\b/.test(condRaw) ||
            finalAttackers.some((a) => a !== 'all' && extractPieceRefs(condRaw, keywordMap).includes(a));

          if (isNegatedRestriction) {
            if (refersToEither) condition = 'either_on_special';
            else if (targetMentionedInCond && !attackerMentionedInCond) condition = 'target_on_special';
            else condition = 'attacker_on_special';
          } else {
            if (targetMentionedInCond && !attackerMentionedInCond) condition = 'target_not_on_special';
            else condition = 'attacker_not_on_special';
          }
        }

        const nounExempts =
          !condRaw && exceptionText && !/case\s+speciale/.test(exceptionText)
            ? extractPieceRefs(exceptionText, keywordMap)
            : [];

        for (const att of finalAttackers) {
          for (const tgt of finalTargets) {
            if (att !== 'all' && tgt === 'all' && condition === 'never' && nounExempts.length === 0) {
              noCapturePieces.add(att);
              activeRules.push({
                label: `${getPieceFilterLabel(att, allCustomPieces)} ne peut capturer aucune pièce`,
                source: 'text',
                category: 'capture',
              });
            } else {
              addCaptureRule(
                att,
                tgt,
                condition,
                nounExempts.length > 0 ? nounExempts : undefined
              );
              activeRules.push({
                label: formatCaptureRestrictionLabel(
                  { id: 'txt', attacker: att, target: tgt, condition, exemptAttackers: nounExempts },
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

    // 4. Special square safe zone / protection
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
        /^(.*?)\b(?:ne\s+(?:peut|peuvent)\s+(?:pas|jamais)|n'a\s+(?:pas\s+)?le\s+droit|n'ont\s+(?:pas\s+)?le\s+droit|a\s+le\s+droit|ont\s+le\s+droit|interdit\s+d'aller)\s+(?:d'aller|d'entrer|aller|entrer|marcher|acceder|s'arreter)?\s*sur\s+(?:la|les|une)\s+cases?\s+speciales?/
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
      /(?:\bpas\s+de\s+promotion|\bpromotion\s+interdite|\baucune\s+promotion|\bsans\s+promotion|\bpions?\s+ne\s+promeuvent\s+pas)/.test(
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
        /(?:promeu(?:t|vent)|promotion)\s+(?:uniquement\s+)?en\s+([a-z]+)/
      );
      if (promoTargetMatch && !clean.includes('en dame')) {
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

    // 9. No check / custom victory rules
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
      /(?:(?:faire|donner|mettre|infliger|gagner\s+(?:en|avec|apres))\s+)?(\d+|deux|trois|quatre|cinq)\s+(?:fois\s+)?(?:en\s+)?echecs?\b/
    );
    if (checksMatch) {
      const targetN = parseFrenchNumber(checksMatch[1]);
      if (targetN && targetN > 0) {
        sentenceMatched = true;
        checksTarget = targetN;
        activeRules.push({
          label: `Victoire après ${targetN} échecs infligés`,
          source: 'text',
          category: 'victory',
        });
      }
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
      /(?:atteindre|amener)[^.]*(?:derniere\s+(?:ligne|rangee)|camp\s+adverse)/.test(clean)
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
      /(?:amener|placer|atteindre)[^.]*case\s+speciale[^.]*(?:gagne|victoire)/.test(clean) ||
      /(?:gagne|victoire)[^.]*(?:en\s+atteignant|sur)[^.]*case\s+speciale/.test(clean)
    ) {
      const refs = extractPieceRefs(clean, keywordMap);
      if (refs.length > 0) {
        sentenceMatched = true;
        for (const r of refs) specialWinPieces.add(r);
        activeRules.push({
          label: `Victoire sur case spéciale ✦ (${refs.map((r) => getPieceFilterLabel(r, allCustomPieces)).join(', ')})`,
          source: 'text',
          category: 'victory',
        });
      }
    }

    // 10. Global OR per-piece range limit, actions per turn, capture target
    const maxRangeMatch = mainClause.match(
      /(?:portee\s+maximale|maximum|max|ne\s+(?:peut|peuvent)\s+(?:avancer|bouger|se\s+deplacer)\s+que\s+de)\s+(?:de\s+)?(\d+|un|une|deux|trois|quatre|cinq|six)\s+cases?/
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
      /(\d+|deux|trois|quatre)\s+(?:coups|actions)\s+par\s+tour\b/
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
    }

    const capTargetMatch = mainClause.match(
      /(?:gagner\s+(?:avec|en\s+capturant)|capturer)\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|dix)\s+pieces?/
    );
    if (capTargetMatch) {
      const n = parseFrenchNumber(capTargetMatch[1]);
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

    // Ignore pure explanatory descriptions of already-configured board/pieces (like starter variants)
    const isBoardOrPieceNote =
      /\b(?:teleporte|bouclier|case\s+centrale|coins?\s+sont\s+supprimes|piliers?\s+bloquent|promeuvent\s+en\s+dame|1\s+ou\s+2\s+cases|echecs?\s+et\s+mat)\b/.test(
        clean
      );

    if (!sentenceMatched && fromRules && !isBoardOrPieceNote && clean.length > 4) {
      unrecognizedSentences.push(rawSentence);
    }
  }

  const effectiveSpecialEffect = resolveEffectiveSpecialEffect(variant.board);
  if ((variant.board.special?.length || 0) > 0 && effectiveSpecialEffect !== 'none') {
    const effLabels: Record<SpecialCellEffectType, string> = {
      none: '',
      teleport: 'Cases spéciales ✦ : Téléportation',
      promote: 'Cases spéciales ✦ : Promotion en Dame',
      shield: 'Cases spéciales ✦ : Bouclier (+1 défense)',
      double_action: 'Cases spéciales ✦ : +1 action bonus',
      freeze: 'Cases spéciales ✦ : Gèle la pièce 1 tour',
      trap: 'Cases spéciales ✦ : Piège mortel (hors Roi)',
      king_hill: 'Cases spéciales ✦ : Roi de la colline (victoire)',
    };
    if (effLabels[effectiveSpecialEffect]) {
      activeRules.push({
        label: effLabels[effectiveSpecialEffect],
        source: 'board',
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

  const hasAnyCustomEnforcement =
    noBackwardAll ||
    noBackwardPieces.size > 0 ||
    allowPawnBackward ||
    pawnCaptureForward ||
    allCanJump ||
    canJumpPieces.size > 0 ||
    forbidDiagonalPieces.size > 0 ||
    forbidOrthogonalPieces.size > 0 ||
    Object.keys(grantPieceMoves).length > 0 ||
    Object.keys(pieceMaxSteps).length > 0 ||
    noSidewaysPieces.size > 0 ||
    strictlyForwardPieces.size > 0 ||
    mandatoryCapture ||
    allowFriendlyCapture ||
    noCaptureBeforeTurn > 0 ||
    extraActionOnCapture ||
    promoteOnCapturePieces.size > 0 ||
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
    noCapturePieces.size > 0 ||
    captureRestrictions.length > 0 ||
    checksTarget > 0 ||
    reverseWin ||
    reachOppositeRankPieces.size > 0 ||
    specialWinPieces.size > 0 ||
    effectiveSpecialEffect !== 'none' ||
    turnOrderParsed.isCustom ||
    unrecognizedSentences.length > 0;

  return {
    noBackwardAll,
    noBackwardPieces: Array.from(noBackwardPieces),
    noBackwardExemptPieces: Array.from(noBackwardExemptPieces),
    noBackwardExceptSpecial,
    allowPawnBackward,
    pawnCaptureForward,
    allCanJump,
    canJumpPieces: Array.from(canJumpPieces),
    forbidDiagonalPieces: Array.from(forbidDiagonalPieces),
    forbidOrthogonalPieces: Array.from(forbidOrthogonalPieces),
    grantPieceMoves,
    pieceMaxSteps,
    noSidewaysPieces: Array.from(noSidewaysPieces),
    strictlyForwardPieces: Array.from(strictlyForwardPieces),
    mandatoryCapture,
    allowFriendlyCapture,
    noCaptureBeforeTurn,
    extraActionOnCapture,
    promoteOnCapturePieces: Array.from(promoteOnCapturePieces),
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
    noCapturePieces: Array.from(noCapturePieces),
    captureRestrictions,
    checksTarget,
    reverseWin,
    reachOppositeRankPieces: Array.from(reachOppositeRankPieces),
    specialWinPieces: Array.from(specialWinPieces),
    effectiveSpecialEffect,
    turnOrderSides: turnOrderParsed.sides,
    hasCustomTurnOrder: turnOrderParsed.isCustom,
    hasAnyCustomEnforcement,
    activeRules,
    unrecognizedSentences,
  };
}

export function formatCaptureRestrictionLabel(
  r: VariantCaptureRestriction,
  customPieces: PieceDef[] = []
): string {
  const att = getPieceFilterLabel(r.attacker, customPieces);
  const tgt = getPieceFilterLabel(r.target, customPieces);
  const exemptList =
    r.exemptAttackers && r.exemptAttackers.length > 0
      ? r.exemptAttackers.map((id) => getPieceFilterLabel(id, customPieces)).join(', ')
      : '';

  if (r.attacker === 'all' && r.condition === 'never' && exemptList) {
    return `Seul ${exemptList} peut capturer : ${tgt}`;
  }

  const suffix = exemptList ? ` (sauf ${exemptList})` : '';
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
  customDef?: PieceDef
): boolean {
  if (customDef && (customDef.moves.forwardOnly || parsePieceTextConfig(customDef).forwardOnly)) {
    return true;
  }
  const specialSet = board.special || [];
  if (compiled.noBackwardExceptSpecial && (specialSet.includes(from) || specialSet.includes(to))) {
    return false;
  }
  if (compiled.noBackwardPieces.some((f) => doesPieceMatchFilter(pieceId, f))) return true;
  if (
    compiled.noBackwardAll &&
    !compiled.noBackwardExemptPieces.some((f) => doesPieceMatchFilter(pieceId, f))
  ) {
    return true;
  }
  return false;
}

export function isPieceSidewaysForbidden(
  compiled: CompiledVariantRules,
  pieceId: string,
  customDef?: PieceDef
): { noSideways: boolean; strictlyForward: boolean } {
  const parsed = customDef ? parsePieceTextConfig(customDef) : null;
  const strictlyForward =
    Boolean(parsed?.strictlyForward) ||
    compiled.strictlyForwardPieces.some((f) => doesPieceMatchFilter(pieceId, f));
  const noSideways =
    strictlyForward ||
    Boolean(parsed?.noSideways) ||
    compiled.noSidewaysPieces.some((f) => doesPieceMatchFilter(pieceId, f));
  return { noSideways, strictlyForward };
}

export function isSpecialEntryAllowed(
  compiled: CompiledVariantRules,
  board: BoardConfig,
  pieceId: string,
  to: number
): boolean {
  if (!board.special?.includes(to)) return true;
  if (compiled.forbiddenSpecialPieces.some((f) => doesPieceMatchFilter(pieceId, f))) {
    return false;
  }
  if (
    compiled.onlySpecialPieces.length > 0 &&
    !compiled.onlySpecialPieces.some((f) => doesPieceMatchFilter(pieceId, f))
  ) {
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
  fullMoveNumber?: number
): { allowed: boolean; reason?: string } {
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

  const specialSquares = board.special || [];
  const isFromSpecial = specialSquares.includes(from);
  const isToSpecial = specialSquares.includes(victimSquare);

  if (compiled.noCapturePieces.some((f) => doesPieceMatchFilter(attackerPieceId, f))) {
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

  for (const rule of compiled.captureRestrictions) {
    if (!doesPieceMatchFilter(attackerPieceId, rule.attacker)) continue;
    if (!doesPieceMatchFilter(victimPieceId, rule.target)) continue;
    if (
      rule.exemptAttackers &&
      rule.exemptAttackers.some((ea) => doesPieceMatchFilter(attackerPieceId, ea))
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
