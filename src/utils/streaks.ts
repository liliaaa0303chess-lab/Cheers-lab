import type { Profile } from '../types/chess';

export interface StreakRank {
  minDays: number;
  symbol: string;
  title: string;
  subtitle: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

export const STREAK_RANKS: StreakRank[] = [
  {
    minDays: 1,
    symbol: '♙',
    title: 'Pion actif',
    subtitle: 'Premier pas sur l’échiquier',
    colorClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    borderClass: 'border-sky-500/30',
  },
  {
    minDays: 3,
    symbol: '♘',
    title: 'Cavalier lancé',
    subtitle: '3 jours d’affilée',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
  },
  {
    minDays: 7,
    symbol: '♗',
    title: 'Fou fidèle',
    subtitle: '1 semaine complète',
    colorClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
    borderClass: 'border-violet-500/30',
  },
  {
    minDays: 14,
    symbol: '♖',
    title: 'Tour de garde',
    subtitle: '2 semaines sans faiblir',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
  },
  {
    minDays: 30,
    symbol: '♕',
    title: 'Dame impériale',
    subtitle: '30 jours consécutifs',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
  },
  {
    minDays: 60,
    symbol: '♔',
    title: 'Roi éternel',
    subtitle: '60+ jours — légende vivante',
    colorClass: 'text-yellow-300',
    bgClass: 'bg-yellow-500/15',
    borderClass: 'border-yellow-500/40',
  },
  {
    minDays: 120,
    symbol: '✦',
    title: 'Le Premier Coup',
    subtitle: '120+ jours — essence originelle',
    colorClass: 'text-amber-200',
    bgClass: 'bg-amber-400/20',
    borderClass: 'border-amber-300/55',
  },
];

export function isStreakRewardDay(streak: number): boolean {
  const safe = Math.max(0, Math.trunc(streak || 0));
  if (safe <= 0) return false;
  if ([1, 3, 7, 14, 30, 60].includes(safe)) return true;
  if (safe > 60 && safe < 120 && safe % 3 === 0) return true;
  if (safe >= 120) return true;
  return false;
}

export function getStreakRewardSummary(streak: number): {
  isRewardDay: boolean;
  rewardLabel: string;
  coinsAwarded: number;
} {
  const safe = Math.max(1, Math.trunc(streak || 1));
  const rewardDay = isStreakRewardDay(safe);
  const coinsAwarded = 2 + (rewardDay ? 5 : 0);

  if (safe === 1) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♙ Pion actif + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe === 3) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♘ Cavalier lancé + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe === 7) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♗ Fou fidèle + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe === 14) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♖ Tour de garde + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe === 30) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♕ Dame impériale + Pièce secrète « Dame Éclipse » + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe === 60) {
    return {
      isRewardDay: true,
      rewardLabel: 'Insigne ♔ Roi éternel + Pièce secrète « Roi Fantôme » + 5 Pièces d’or',
      coinsAwarded,
    };
  }
  if (safe > 60 && safe < 120) {
    if (safe % 3 === 0) {
      return {
        isRewardDay: true,
        rewardLabel: 'Sceau royal (tous les 3 jours) + 5 Pièces d’or',
        coinsAwarded,
      };
    }
    return {
      isRewardDay: false,
      rewardLabel: '+2 Pièces d’or du jour',
      coinsAwarded,
    };
  }
  if (safe === 120) {
    return {
      isRewardDay: true,
      rewardLabel: 'Transformation ultime ✦ Le Premier Coup + 7 Pièces d’or/jour',
      coinsAwarded,
    };
  }
  if (safe > 120) {
    return {
      isRewardDay: true,
      rewardLabel: 'Récompense quotidienne ✦ Le Premier Coup (+7 Pièces d’or)',
      coinsAwarded,
    };
  }
  return {
    isRewardDay: false,
    rewardLabel: '+2 Pièces d’or du jour',
    coinsAwarded,
  };
}

export function getUnlockedRankSymbols(bestStreak: number): StreakRank[] {
  const safe = Math.max(1, Math.trunc(bestStreak || 1));
  return STREAK_RANKS.filter((r) => safe >= r.minDays);
}

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKeyUtcMs(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function getStreakRank(streak: number): {
  current: StreakRank;
  next: StreakRank | null;
  daysToNext: number;
} {
  const safe = Math.max(1, streak || 1);
  let idx = 0;
  for (let i = 0; i < STREAK_RANKS.length; i++) {
    if (safe >= STREAK_RANKS[i].minDays) {
      idx = i;
    }
  }
  const current = STREAK_RANKS[idx];
  const next = idx + 1 < STREAK_RANKS.length ? STREAK_RANKS[idx + 1] : null;
  return {
    current,
    next,
    daysToNext: next ? Math.max(0, next.minDays - safe) : 0,
  };
}

export function evaluateDailyStreak(
  profile: Profile,
  now = new Date()
): {
  nextProfile: Profile;
  changed: boolean;
  incremented: boolean;
  promoted: boolean;
  coinsEarned: number;
} {
  const today = getLocalDateKey(now);
  const prevDate = (profile.lastStreakDate || '').trim();
  const prevStreak = Math.max(0, Math.trunc(profile.loginStreak || 0));
  const prevBest = Math.max(prevStreak, Math.trunc(profile.bestLoginStreak || 0));
  const prevCoins = Math.max(0, Math.trunc(profile.goldCoins || 0));

  if (prevDate === today && prevStreak >= 1) {
    return {
      nextProfile: profile,
      changed: false,
      incremented: false,
      promoted: false,
      coinsEarned: 0,
    };
  }

  let nextStreak = 1;
  let incremented = false;

  if (prevDate && prevStreak >= 1) {
    const prevMs = parseDateKeyUtcMs(prevDate);
    const todayMs = parseDateKeyUtcMs(today);
    if (prevMs !== null && todayMs !== null) {
      const diffDays = Math.round((todayMs - prevMs) / 86400000);
      if (diffDays === 1) {
        nextStreak = prevStreak + 1;
        incremented = true;
      } else if (diffDays < 0) {
        // Clock skew: preserve existing streak
        return {
          nextProfile: profile,
          changed: false,
          incremented: false,
          promoted: false,
          coinsEarned: 0,
        };
      }
    }
  }

  const nextBest = Math.max(prevBest, nextStreak);
  const oldRank = getStreakRank(Math.max(1, prevStreak)).current;
  const newRank = getStreakRank(nextStreak).current;
  const promoted = incremented && oldRank.title !== newRank.title;

  const rewardInfo = getStreakRewardSummary(nextStreak);
  const coinsEarned = rewardInfo.coinsAwarded;
  const nextCoins = prevCoins + coinsEarned;

  // Auto-equip newly reached rank piece if user didn't pick another one or was just promoted
  const nextEquippedPiece =
    promoted || !profile.equippedStreakPiece
      ? newRank.symbol
      : profile.equippedStreakPiece;

  return {
    nextProfile: {
      ...profile,
      loginStreak: nextStreak,
      bestLoginStreak: nextBest,
      lastStreakDate: today,
      goldCoins: nextCoins,
      equippedStreakPiece: nextEquippedPiece,
    },
    changed: true,
    incremented,
    promoted,
    coinsEarned,
  };
}
