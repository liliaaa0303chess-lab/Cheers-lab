export type PlayerSide = 'white' | 'black' | 'red' | 'blue' | 'green' | 'gold';

export type BoardTexture = 'plain' | 'wood' | 'stone' | 'marble' | 'metal' | 'night';
export type PieceTexture = 'plain' | 'wood' | 'stone' | 'marble' | 'metal';
export type VariantVisibility = 'private' | 'public' | 'link';
export type VariantDifficulty = 'Très simple' | 'Simple' | 'Moyenne' | 'Complexe' | 'Extrême';

export type SpecialCellEffectType =
  | 'none'
  | 'teleport'
  | 'promote'
  | 'shield'
  | 'double_action'
  | 'freeze'
  | 'trap'
  | 'king_hill';

export type SpecialPowerType =
  | 'none'
  | 'teleport'
  | 'invisibility'
  | 'transform'
  | 'manipulate'
  | 'shield'
  | 'duplicate'
  | 'custom';

export type VictoryConditionType =
  | 'checkmate_or_king'
  | 'eliminate_all'
  | 'king_of_hill'
  | 'capture_count'
  | 'custom';

export interface BoardConfig {
  id?: string;
  name?: string;
  rows: number;
  cols: number;
  cells: number[]; // 1 = active, 0 = removed
  blocked: number[];
  special: number[];
  specialEffectType?: SpecialCellEffectType;
  specialEffect: string;
  texture: BoardTexture;
  light: string;
  dark: string;
  rotation: number; // degrees: 0, 45, 90, etc.
}

export interface PieceMovesConfig {
  rook: boolean;
  bishop: boolean;
  knight: boolean;
  king: boolean;
  pawn: boolean;
  maxRange: number; // 0 = unlimited for sliders
  canJump: boolean;
  forwardOnly?: boolean;
  noCapture?: boolean;
}

export interface PieceDef {
  id: string;
  name: string;
  symbol: string;
  moves: PieceMovesConfig;
  customMoves: string;
  powerType: SpecialPowerType;
  powers: string;
  conditions: string;
  limits: number; // max uses per game (0 = unlimited or N/A)
  limitsText: string;
  texture: PieceTexture;
  light: string;
  dark: string;
  description: string;
}

export interface PlacedPieceRef {
  pieceId: string; // 'builtin:K' or custom piece id
  side: PlayerSide;
}

export type PieceTargetFilter = 'all' | 'custom' | string;

export type CaptureRestrictionCondition =
  | 'never'
  | 'attacker_on_special'
  | 'target_on_special'
  | 'either_on_special'
  | 'attacker_not_on_special'
  | 'target_not_on_special';

export interface VariantCaptureRestriction {
  id: string;
  attacker: PieceTargetFilter;
  target: PieceTargetFilter;
  condition: CaptureRestrictionCondition;
  exemptAttackers?: string[];
  exemptTargets?: string[];
}

export interface VariantRuleConfig {
  noBackwardAll?: boolean;
  noBackwardPieces?: string[];
  noBackwardExceptSpecial?: boolean;
  noSidewaysPieces?: string[];
  strictlyForwardPieces?: string[];
  mandatoryCapture?: boolean;
  disableCastling?: boolean;
  disableEnPassant?: boolean;
  disablePawnDoubleStep?: boolean;
  disablePromotion?: boolean;
  promoteToPieceId?: string;
  noCheckRestriction?: boolean;
  specialProtected?: boolean;
  specialCaptureOnly?: boolean;
  forbiddenSpecialPieces?: string[];
  onlySpecialPieces?: string[];
  maxStepsPerMove?: number;
  captureRestrictions?: VariantCaptureRestriction[];
  teamAssignments?: Partial<Record<PlayerSide, number>>;
  teamSharedElimination?: boolean;
}

export interface VariantVersion {
  version: number;
  date: string;
  summary: string;
  author: string;
}

export interface VariantComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Variant {
  id: string;
  name: string;
  description: string;
  visibility: VariantVisibility;
  players: number;
  difficulty: VariantDifficulty;
  controlledDifficulty?: VariantDifficulty;
  victoryType: VictoryConditionType;
  captureTarget?: number;
  goal: string;
  actions: number;
  duration: number; // minutes per player, 0 = unlimited
  incrementSec?: number; // seconds added per turn
  turnOrder: string;
  rules: string;
  ruleConstraints?: VariantRuleConfig;
  board: BoardConfig;
  pieces: string[]; // custom piece IDs included
  customPieceDefs?: PieceDef[]; // embedded snapshots so shared/public variants work for everyone
  setup: Record<number, string>; // cell index -> "pieceId|side"
  createdAt: string;
  updatedAt?: string;
  creatorId: string;
  creator: string;
  games: number; // popularity: number of games played
  ratingSum?: number;
  ratingCount?: number;
  parentId?: string | null;
  parentName?: string | null;
  rootId?: string | null;
  commentsEnabled: boolean;
  comments?: VariantComment[];
  versions?: VariantVersion[];
}

export interface Profile {
  id: string;
  nickname: string;
  avatarColor: string;
  avatarSymbol: string;
  eol: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  discoveredVariants: string[];
  variantPlayCounts: Record<string, number>;
  createdAt: string;
}

export interface EolBreakdown {
  counted: boolean;
  reasonIfUncounted?: string;
  playerEolBefore: number;
  playerEolAfter: number;
  opponentEolBefore: number;
  opponentEolAfter: number;
  delta: number;
  opponentDelta: number;
  baseGain: number;
  gap: number;
  gapMultiplier: number;
  priorGames: number;
  familiarityLabel: string;
  familiarityMultiplier: number;
  difficultyLabel: VariantDifficulty;
  difficultyMultiplier: number;
  creatorMultiplier: number;
  modeMultiplier?: number;
  discoveryLossProtectionApplied: boolean;
  capped: boolean;
}

export interface ReplayMove {
  from: number;
  to: number;
  captureIndex?: number;
  promotionPieceId?: string;
  isCastle?: 'kingside' | 'queenside';
  isEnPassant?: boolean;
  isPower?: SpecialPowerType;
  powerTarget?: number;
  description?: string;
}

export interface GameRecord {
  id: string;
  type: 'Partie locale' | 'Partie contre IA' | 'Partie en ligne' | 'Analyse sauvegardée' | 'Variante créée';
  mode?: 'local' | 'ai' | 'online' | 'analysis';
  competitive?: boolean;
  variantId: string | null;
  variantName: string;
  variantSnapshot?: Variant;
  creatorName?: string;
  opponentName: string;
  opponentEol?: number;
  playerSide?: PlayerSide;
  result: 'win' | 'loss' | 'draw' | 'saved';
  reason?: string;
  movesCount?: number;
  replayMoves?: ReplayMove[];
  date: string;
  eolBreakdown?: EolBreakdown;
  userRating?: number;
}

export interface SavedTheme {
  id: string;
  name: string;
  boardTexture: BoardTexture;
  pieceTexture: PieceTexture;
  boardLight: string;
  boardDark: string;
  pieceLight: string;
  pieceDark: string;
}

export interface AppSettings {
  accent: string;
  theme: 'dark' | 'light';
  sound: boolean;
  volume: number;
  showOpponentTheme: boolean;
  pieceTexture: PieceTexture;
  boardTexture: BoardTexture;
  boardLight: string;
  boardDark: string;
  pieceLight: string;
  pieceDark: string;
  savedThemes: SavedTheme[];
}

export interface AppState {
  profile: Profile;
  variants: Variant[];
  boards: BoardConfig[];
  pieces: PieceDef[];
  history: GameRecord[];
  ratings: Record<string, number>;
  settings: AppSettings;
}

export type GameMode = 'local' | 'ai' | 'online' | 'analysis';

export type AiDifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const AI_LEVELS: {
  level: AiDifficultyLevel;
  label: string;
  approxEol: number;
  depth: number;
  stockfishSkill: number;
}[] = [
  { level: 1, label: 'Très facile', approxEol: 250, depth: 1, stockfishSkill: 0 },
  { level: 2, label: 'Facile', approxEol: 325, depth: 1, stockfishSkill: 2 },
  { level: 3, label: 'Petit joueur', approxEol: 400, depth: 2, stockfishSkill: 4 },
  { level: 4, label: 'Débutant', approxEol: 500, depth: 2, stockfishSkill: 6 },
  { level: 5, label: 'Intermédiaire', approxEol: 650, depth: 2, stockfishSkill: 8 },
  { level: 6, label: 'Confirmé', approxEol: 825, depth: 3, stockfishSkill: 11 },
  { level: 7, label: 'Avancé', approxEol: 1025, depth: 3, stockfishSkill: 14 },
  { level: 8, label: 'Difficile', approxEol: 1250, depth: 3, stockfishSkill: 16 },
  { level: 9, label: 'Expert', approxEol: 1500, depth: 4, stockfishSkill: 18 },
  { level: 10, label: 'Maître', approxEol: 1800, depth: 4, stockfishSkill: 20 },
];

export function getClosestAiLevelForEol(eol: number): AiDifficultyLevel {
  let best: AiDifficultyLevel = 3;
  let bestDiff = Infinity;
  for (const item of AI_LEVELS) {
    const diff = Math.abs(item.approxEol - eol);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item.level;
    }
  }
  return best;
}

export interface OnlineHumanSeat {
  userId: string;
  nickname: string;
  eol: number;
  side: PlayerSide;
  theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
}

export interface OnlineAiSeat {
  side: PlayerSide;
  level: AiDifficultyLevel;
  approxEol: number;
  nickname: string;
}

