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
];

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
} {
  const today = getLocalDateKey(now);
  const prevDate = (profile.lastStreakDate || '').trim();
  const prevStreak = Math.max(0, Math.trunc(profile.loginStreak || 0));
  const prevBest = Math.max(prevStreak, Math.trunc(profile.bestLoginStreak || 0));

  if (prevDate === today && prevStreak >= 1) {
    return {
      nextProfile: profile,
      changed: false,
      incremented: false,
      promoted: false,
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
        };
      }
    }
  }

  const nextBest = Math.max(prevBest, nextStreak);
  const oldRank = getStreakRank(Math.max(1, prevStreak)).current.title;
  const newRank = getStreakRank(nextStreak).current.title;
  const promoted = incremented && oldRank !== newRank;

  return {
    nextProfile: {
      ...profile,
      loginStreak: nextStreak,
      bestLoginStreak: nextBest,
      lastStreakDate: today,
    },
    changed: true,
    incremented,
    promoted,
  };
}
