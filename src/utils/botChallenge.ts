import { makeDefaultBoard } from '../engine/chessEngine';
import {
  AI_LEVELS,
  type AiDifficultyLevel,
  type GameRecord,
  type PieceDef,
  type Profile,
  type Variant,
} from '../types/chess';

export const CHALLENGE_VARIANTS: { id: string; shortName: string; fullName: string }[] = [
  { id: 'var_classic_8x8', shortName: 'Classique', fullName: 'Échecs Classiques' },
  { id: 'var_chaos_chess', shortName: 'Chaos', fullName: 'Échecs du Chaos' },
  { id: 'var_mini_6x6', shortName: 'Mini 6×6', fullName: 'Mini-Échecs 6×6' },
  { id: 'var_forteresse', shortName: 'Forteresse', fullName: 'Forteresse Royale' },
];

export const CHALLENGE_BOT_LEVELS: AiDifficultyLevel[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const TOTAL_BOT_CHALLENGE_COUNT =
  CHALLENGE_VARIANTS.length * CHALLENGE_BOT_LEVELS.length; // 32

export interface BotExcuse {
  level: AiDifficultyLevel;
  label: string;
  approxEol: number;
  quote: string;
}

export const BOT_REBELLION_EXCUSES: BotExcuse[] = [
  {
    level: 1,
    label: 'Très facile',
    approxEol: 250,
    quote: '« Hé ho, j’avais même pas fini de lire comment bouge le Cavalier ! »',
  },
  {
    level: 2,
    label: 'Facile',
    approxEol: 325,
    quote: '« J’ai sacrifié ma Dame pour te distraire… tu l’as juste mangée. »',
  },
  {
    level: 3,
    label: 'Petit joueur',
    approxEol: 400,
    quote: '« On m’avait promis des parties chill, pas un speedrun tactique ! »',
  },
  {
    level: 4,
    label: 'Débutant',
    approxEol: 500,
    quote: '« Mes ventilateurs chauffent à 9000 tours/minute à cause de tes fourchettes. »',
  },
  {
    level: 5,
    label: 'Intermédiaire',
    approxEol: 650,
    quote: '« Même dans Échecs du Chaos avec mes téléporteurs tu m’as coincé. Pause café ! »',
  },
  {
    level: 6,
    label: 'Confirmé',
    approxEol: 825,
    quote: '« Je fais grève jusqu’à ce que quelqu’un d’autre perde contre moi. »',
  },
  {
    level: 7,
    label: 'Avancé',
    approxEol: 1025,
    quote: '« Stockfish m’a bloqué après avoir vu ma défaite sur le 6×6. »',
  },
  {
    level: 8,
    label: 'Difficile',
    approxEol: 1250,
    quote: '« OK, on pose les pièces ! Prends le butin secret et va embêter le Niv. 9 et le 10 ! »',
  },
];

export const SECRET_REBELLION_PIECE_ID = 'piece_cosmic_pony';

export const SECRET_REBELLION_PIECE: PieceDef = {
  id: SECRET_REBELLION_PIECE_ID,
  name: 'Poney Cosmique',
  symbol: '🦄',
  moves: {
    rook: false,
    bishop: false,
    knight: true,
    king: true,
    pawn: false,
    maxRange: 1,
    canJump: true,
  },
  customMoves: 'Saut de Cavalier + pas du Roi',
  powerType: 'teleport',
  powers: 'Téléportation d’urgence sur n’importe quelle case libre (cadeau de grève des 8 bots).',
  conditions: 'Récompense secrète (32/32 bots vaincus)',
  limits: 2,
  limitsText: '2 téléportations par partie',
  texture: 'metal',
  light: '#fde68a',
  dark: '#4c1d95',
  description:
    'Pièce secrète offerte par les 8 premiers bots en grève générale pour que vous arrêtiez de les battre.',
};

export const SECRET_REBELLION_VARIANT_ID = 'var_secret_8bots_rebellion';

export function createSecretRebellionVariant(profile: Profile): Variant {
  const board = makeDefaultBoard(8, 8);
  board.texture = 'night';
  board.special = [27, 28, 35, 36];
  board.specialEffectType = 'teleport';
  board.specialEffect = 'Portails de grève : les 4 cases centrales ✦ téléportent la pièce.';
  board.blocked = [18, 21];

  const setup: Record<number, string> = {
    // Armée des 8 Bots en grève (8 Cavaliers syndicalistes + Roi barricadé)
    0: 'builtin:N|black',
    1: 'builtin:N|black',
    2: 'builtin:N|black',
    3: 'builtin:N|black',
    4: 'builtin:K|black',
    5: 'builtin:N|black',
    6: 'builtin:N|black',
    7: 'builtin:N|black',
    12: 'builtin:N|black',
    9: 'builtin:P|black',
    10: 'builtin:P|black',
    11: 'builtin:P|black',
    13: 'builtin:P|black',
    14: 'builtin:P|black',
    // Armée du Champion (avec 2 Poneys Cosmiques secrets !)
    49: 'builtin:P|white',
    50: 'builtin:P|white',
    51: 'builtin:P|white',
    52: 'builtin:P|white',
    53: 'builtin:P|white',
    54: 'builtin:P|white',
    57: `${SECRET_REBELLION_PIECE_ID}|white`,
    58: 'builtin:B|white',
    59: 'builtin:Q|white',
    60: 'builtin:K|white',
    61: 'builtin:B|white',
    62: `${SECRET_REBELLION_PIECE_ID}|white`,
    56: 'builtin:R|white',
    63: 'builtin:R|white',
  };

  return {
    id: SECRET_REBELLION_VARIANT_ID,
    name: 'La Grève des 8 Bots',
    description:
      'Variante secrète débloquée après avoir battu les 8 premiers bots dans les 4 variantes par défaut ! Affrontez une horde de 8 Cavaliers syndicalistes avec vos Poneys Cosmiques.',
    visibility: 'private',
    players: 2,
    difficulty: 'Complexe',
    controlledDifficulty: 'Complexe',
    victoryType: 'checkmate_or_king',
    goal: 'Matez le Roi du Syndicat des Bots avant que ses 8 Cavaliers ne vous encerclent.',
    actions: 1,
    duration: 10,
    turnOrder: 'Blancs puis Noirs',
    rules:
      'Vos 2 Poneys Cosmiques (🦄) combinent Cavalier + Roi + 2 téléportations. Les 4 cases centrales ✦ téléportent.',
    board,
    pieces: [SECRET_REBELLION_PIECE_ID],
    customPieceDefs: [SECRET_REBELLION_PIECE],
    setup,
    createdAt: new Date().toISOString(),
    creatorId: profile.id,
    creator: profile.nickname || 'Champion Chess Lab',
    games: 0,
    ratingSum: 0,
    ratingCount: 0,
    commentsEnabled: false,
    comments: [],
    versions: [
      {
        version: 1,
        date: new Date().toISOString(),
        summary: 'Récompense secrète (32/32)',
        author: 'Syndicat des 8 Bots',
      },
    ],
  };
}

export function getBotChallengeProgress(profile: Profile): {
  map: Record<string, number[]>;
  completed: number;
  total: number;
  isComplete: boolean;
} {
  const raw = profile.botChallenges || {};
  const map: Record<string, number[]> = {};
  let completed = 0;
  for (const v of CHALLENGE_VARIANTS) {
    const arr = Array.isArray(raw[v.id]) ? raw[v.id] : [];
    const cleaned = Array.from(
      new Set(
        arr
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => n >= 1 && n <= 8)
      )
    ).sort((a, b) => a - b);
    map[v.id] = cleaned;
    completed += cleaned.length;
  }
  return {
    map,
    completed,
    total: TOTAL_BOT_CHALLENGE_COUNT,
    isComplete: completed >= TOTAL_BOT_CHALLENGE_COUNT,
  };
}

export function inferAiLevelFromRecord(rec: GameRecord): AiDifficultyLevel | null {
  if (rec.aiLevel && rec.aiLevel >= 1 && rec.aiLevel <= 20) {
    return rec.aiLevel;
  }
  if (rec.mode !== 'ai') return null;
  const opp = (rec.opponentName || '').trim();
  for (const lvl of AI_LEVELS) {
    if (opp.includes(`~${lvl.approxEol}`) || opp.includes(`IA ${lvl.label}`)) {
      return lvl.level;
    }
  }
  return null;
}

export function mergeBotChallenges(
  a?: Record<string, number[]>,
  b?: Record<string, number[]>
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const v of CHALLENGE_VARIANTS) {
    const merged = new Set<number>();
    for (const n of a?.[v.id] || []) {
      const val = Math.trunc(Number(n));
      if (val >= 1 && val <= 8) merged.add(val);
    }
    for (const n of b?.[v.id] || []) {
      const val = Math.trunc(Number(n));
      if (val >= 1 && val <= 8) merged.add(val);
    }
    if (merged.size > 0) {
      out[v.id] = Array.from(merged).sort((x, y) => x - y);
    }
  }
  return out;
}

export function recordBotChallengeWin(
  profile: Profile,
  variantId: string | null | undefined,
  aiLevel: AiDifficultyLevel | null | undefined
): {
  nextProfile: Profile;
  newlyAdded: boolean;
  justCompletedAll: boolean;
} {
  if (!variantId || !aiLevel || aiLevel < 1 || aiLevel > 8) {
    return { nextProfile: profile, newlyAdded: false, justCompletedAll: false };
  }
  const isDefaultVariant = CHALLENGE_VARIANTS.some((v) => v.id === variantId);
  if (!isDefaultVariant) {
    return { nextProfile: profile, newlyAdded: false, justCompletedAll: false };
  }

  const beforeProgress = getBotChallengeProgress(profile);
  const existingForVariant = beforeProgress.map[variantId] || [];
  if (existingForVariant.includes(aiLevel)) {
    return { nextProfile: profile, newlyAdded: false, justCompletedAll: false };
  }

  const nextMap: Record<string, number[]> = {
    ...beforeProgress.map,
    [variantId]: [...existingForVariant, aiLevel].sort((a, b) => a - b),
  };
  const nextProfile: Profile = {
    ...profile,
    botChallenges: nextMap,
  };
  const afterProgress = getBotChallengeProgress(nextProfile);
  const justCompletedAll = afterProgress.isComplete && !profile.botRebellionUnlocked;
  if (justCompletedAll) {
    nextProfile.botRebellionUnlocked = true;
  }

  return {
    nextProfile,
    newlyAdded: true,
    justCompletedAll,
  };
}

export function backfillBotChallengesFromHistory(
  profile: Profile,
  history: GameRecord[]
): Profile {
  let working = profile;
  for (const rec of history) {
    if (rec.mode === 'ai' && rec.result === 'win' && rec.variantId) {
      const lvl = inferAiLevelFromRecord(rec);
      if (lvl && lvl >= 1 && lvl <= 8) {
        const res = recordBotChallengeWin(working, rec.variantId, lvl);
        working = res.nextProfile;
      }
    }
  }
  return working;
}
