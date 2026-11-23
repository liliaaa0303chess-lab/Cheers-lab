import type { BattleCardStyle, PieceDef, Profile } from '../types/chess';

export interface GoldEffectMilestone {
  id: string;
  coinsRequired: number;
  label: string;
  description: string;
}

export const GOLD_EFFECT_MILESTONES: GoldEffectMilestone[] = [
  {
    id: 'confetti_win',
    coinsRequired: 10,
    label: 'Confettis de victoire',
    description: 'Une pluie de confettis colorés éclate lorsque vous remportez une partie.',
  },
  {
    id: 'gold_last_move',
    coinsRequired: 20,
    label: 'Halo doré du dernier coup',
    description: 'Met en valeur votre dernier coup joué avec un liseré doré.',
  },
  {
    id: 'capture_sparks',
    coinsRequired: 30,
    label: 'Étincelles de capture',
    description: 'Affiche un éclat vif sur la case lorsqu’une pièce est capturée.',
  },
  {
    id: 'check_pulse',
    coinsRequired: 40,
    label: 'Onde d’échec',
    description: 'Anneau lumineux renforcé autour du Roi menacé.',
  },
  {
    id: 'power_shimmer',
    coinsRequired: 50,
    label: 'Lueur des pouvoirs',
    description: 'Reflet brillant sur les cases ciblées par un pouvoir spécial.',
  },
  {
    id: 'victory_crown_frame',
    coinsRequired: 60,
    label: 'Cadre de victoire royal',
    description: 'Bordure dorée autour de l’échiquier au moment de la victoire.',
  },
  {
    id: 'board_gold_sheen',
    coinsRequired: 70,
    label: 'Reflet doré d’échiquier',
    description: 'Subtile bordure ambrée sur l’ensemble de votre plateau.',
  },
  {
    id: 'turn_aura',
    coinsRequired: 80,
    label: 'Aura de tour actif',
    description: 'Halo émeraude et or plus marqué quand c’est à vous de jouer.',
  },
  {
    id: 'starburst_checkmate',
    coinsRequired: 90,
    label: 'Pluie d’étoiles sur mat',
    description: 'Ajoute des étoiles dorées aux confettis lors d’un échec et mat.',
  },
];

export const GOLD_100_OPTIONS: {
  id: 'board_piece' | 'signature_mate';
  title: string;
  description: string;
}[] = [
  {
    id: 'board_piece',
    title: 'Plateau « Nuit d’Or » + Pièce « L’Étincelle » (✦)',
    description:
      'Débloque le thème d’échiquier Nuit d’Or et la pièce mythique L’Étincelle utilisable dans vos variantes.',
  },
  {
    id: 'signature_mate',
    title: 'Animation « Échec & Mat Signature »',
    description:
      'Déclenche une explosion dorée spectaculaire sur tout l’échiquier quand vous gagnez par mat.',
  },
];

export const GOLD_1000_TITLES = [
  'Maître du Premier Coup',
  'Légende de Chess Lab',
] as const;

export const GOLD_HIGHER_TITLES: { threshold: number; title: string }[] = [
  { threshold: 2000, title: 'Grand Stratège d’Or' },
  { threshold: 3000, title: 'Souverain de l’Échiquier' },
  { threshold: 4000, title: 'Gardien des Variantes' },
  { threshold: 5000, title: 'Architecte Éternel' },
];

export const BATTLE_CARD_STYLES: {
  id: BattleCardStyle;
  label: string;
  bgClass: string;
  borderClass: string;
  accentClass: string;
}[] = [
  {
    id: 'classic',
    label: 'Ardoise classique',
    bgClass: 'bg-[#121923]',
    borderClass: 'border-slate-700',
    accentClass: 'text-sky-400',
  },
  {
    id: 'emerald',
    label: 'Émeraude tactique',
    bgClass: 'bg-[#0b1f1a]',
    borderClass: 'border-emerald-500/45',
    accentClass: 'text-emerald-400',
  },
  {
    id: 'crimson',
    label: 'Rubis duel',
    bgClass: 'bg-[#211015]',
    borderClass: 'border-rose-500/45',
    accentClass: 'text-rose-400',
  },
  {
    id: 'imperial',
    label: 'Or impérial',
    bgClass: 'bg-[#1d180c]',
    borderClass: 'border-amber-400/55',
    accentClass: 'text-amber-300',
  },
  {
    id: 'cosmic',
    label: 'Nuit céleste',
    bgClass: 'bg-[#0e1326]',
    borderClass: 'border-indigo-400/50',
    accentClass: 'text-indigo-300',
  },
];

export const STREAK_BONUS_PIECES: { minDays: number; piece: PieceDef }[] = [
  {
    minDays: 30,
    piece: {
      id: 'streak:dame_eclipse',
      name: 'Dame Éclipse',
      symbol: '♕',
      visibility: 'private',
      moves: {
        rook: true,
        bishop: true,
        knight: false,
        king: false,
        pawn: false,
        maxRange: 0,
        canJump: false,
      },
      customMoves: '',
      powerType: 'shield',
      powers: 'Bouclier protecteur une fois par partie.',
      conditions: '',
      limits: 1,
      limitsText: '1 utilisation',
      texture: 'marble',
      light: '#fff1f2',
      dark: '#4c0519',
      description: 'Pièce bonus débloquée au 30e jour de série (Dame impériale).',
    },
  },
  {
    minDays: 60,
    piece: {
      id: 'streak:roi_fantome',
      name: 'Roi Fantôme',
      symbol: '♔',
      visibility: 'private',
      moves: {
        rook: false,
        bishop: false,
        knight: true,
        king: true,
        pawn: false,
        maxRange: 2,
        canJump: true,
      },
      customMoves: '',
      powerType: 'invisibility',
      powers: 'Peut devenir invisible pendant 2 tours.',
      conditions: '',
      limits: 1,
      limitsText: '1 utilisation',
      texture: 'metal',
      light: '#fefce8',
      dark: '#422006',
      description: 'Pièce bonus débloquée au 60e jour de série (Roi éternel).',
    },
  },
];

export const GOLD_100_MYTHIC_PIECE: PieceDef = {
  id: 'gold:etincelle',
  name: 'L’Étincelle',
  symbol: '✦',
  visibility: 'private',
  moves: {
    rook: true,
    bishop: true,
    knight: true,
    king: false,
    pawn: false,
    maxRange: 3,
    canJump: true,
  },
  customMoves: '',
  powerType: 'teleport',
  powers: 'Téléportation courte vers n’importe quelle case libre.',
  conditions: '',
  limits: 2,
  limitsText: '2 utilisations',
  texture: 'metal',
  light: '#fef3c7',
  dark: '#78350f',
  description: 'Pièce mythique choisie au palier des 100 Pièces d’or.',
};

export function getUnlockedGoldEffects(goldCoins: number): GoldEffectMilestone[] {
  const safe = Math.max(0, Math.trunc(goldCoins || 0));
  return GOLD_EFFECT_MILESTONES.filter((m) => safe >= m.coinsRequired);
}

export function isGoldEffectActive(profile: Profile, effectId: string): boolean {
  const coins = profile.goldCoins || 0;
  const milestone = GOLD_EFFECT_MILESTONES.find((m) => m.id === effectId);
  if (!milestone || coins < milestone.coinsRequired) return false;
  if (!Array.isArray(profile.goldEffectIds)) return true;
  return profile.goldEffectIds.includes(effectId);
}

export function getUnlockedTitlesForProfile(profile: Profile): string[] {
  const coins = Math.max(0, Math.trunc(profile.goldCoins || 0));
  const titles: string[] = [];
  if (coins >= 1000) {
    const first =
      profile.gold1000Choice &&
      (GOLD_1000_TITLES as readonly string[]).includes(profile.gold1000Choice)
        ? profile.gold1000Choice
        : GOLD_1000_TITLES[0];
    titles.push(first);
  }
  for (const item of GOLD_HIGHER_TITLES) {
    if (coins >= item.threshold) {
      titles.push(item.title);
    }
  }
  if (coins >= 5000 && profile.customGoldTitle?.trim()) {
    titles.push(profile.customGoldTitle.trim());
  }
  return Array.from(new Set(titles));
}

export function resolveEquippedTitle(profile: Profile): string | undefined {
  const unlocked = getUnlockedTitlesForProfile(profile);
  if (unlocked.length === 0) return undefined;
  if (profile.equippedTitle && unlocked.includes(profile.equippedTitle)) {
    return profile.equippedTitle;
  }
  return unlocked[0];
}
