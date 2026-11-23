import { INITIAL_EOL } from '../engine/eol';
import type {
  AppSettings,
  AppState,
  BoardConfig,
  GameRecord,
  PieceDef,
  Profile,
  Variant,
} from '../types/chess';
import { getStarterVariants, STARTER_PIECES } from './defaultVariants';
import { safeUuid } from './safeId';

const STORAGE_KEY = 'chesslab_app_v2';

export function createDefaultProfile(): Profile {
  return {
    id: `usr_${safeUuid().slice(0, 12)}`,
    nickname: '',
    avatarColor: '#7ebcff',
    avatarSymbol: '♔',
    eol: INITIAL_EOL,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    discoveredVariants: [],
    variantPlayCounts: {},
    loginStreak: 0,
    bestLoginStreak: 0,
    lastStreakDate: '',
    goldCoins: 0,
    goldEffectIds: undefined,
    gold100Choice: null,
    gold1000Choice: undefined,
    customGoldTitle: '',
    equippedTitle: undefined,
    equippedStreakPiece: '♙',
    battleCardStyle: 'classic',
    showBattleIntro: true,
    friends: [],
    botChallenges: {},
    botRebellionUnlocked: false,
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    accent: '#7ebcff',
    theme: 'dark',
    sound: true,
    volume: 70,
    showOpponentTheme: false,
    pieceTexture: 'plain',
    boardTexture: 'plain',
    boardLight: '#dce5ef',
    boardDark: '#788ba2',
    pieceLight: '#f8f9fc',
    pieceDark: '#181d26',
    savedThemes: [],
  };
}

export function createBlankState(): AppState {
  return {
    profile: createDefaultProfile(),
    variants: getStarterVariants(),
    boards: [],
    pieces: [...STARTER_PIECES],
    history: [],
    ratings: {},
    settings: createDefaultSettings(),
  };
}

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createBlankState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const blank = createBlankState();

    try {
      localStorage.removeItem('chesslab_demo_friend_v1');
    } catch {
      // ignore
    }

    // Validate & sanitize stored variants/pieces/boards/history so a malformed record never crashes render
    const validVariants = Array.isArray(parsed.variants)
      ? parsed.variants.filter(
          (v): v is Variant =>
            Boolean(
              v &&
                typeof v.id === 'string' &&
                v.id !== 'demo_var_lucas' &&
                v.creatorId !== 'demo_friend_lucas' &&
                v.board &&
                Array.isArray(v.board.cells)
            )
        )
      : [];
    const validPieces = Array.isArray(parsed.pieces)
      ? parsed.pieces.filter(
          (p): p is PieceDef =>
            Boolean(p && typeof p.id === 'string' && p.id !== 'demo_piece_paladin' && p.name)
        )
      : [];
    const validBoards = Array.isArray(parsed.boards)
      ? parsed.boards.filter((b): b is BoardConfig => Boolean(b && Array.isArray(b.cells)))
      : [];
    const validHistory = Array.isArray(parsed.history)
      ? parsed.history.filter(
          (h): h is GameRecord =>
            Boolean(
              h &&
                typeof h.id === 'string' &&
                h.id !== 'demo_hist_lucas_1' &&
                h.opponentUid !== 'demo_friend_lucas'
            )
        )
      : [];

    const mergedVariants = validVariants.length > 0 ? validVariants : blank.variants;
    const mergedPieces = validPieces.length > 0 ? validPieces : blank.pieces;

    const mergedProfile: Profile = {
      ...blank.profile,
      ...(parsed.profile || {}),
      friends: Array.isArray(parsed.profile?.friends)
        ? parsed.profile.friends.filter((f) => f && f.uid !== 'demo_friend_lucas')
        : [],
      botChallenges:
        parsed.profile?.botChallenges && typeof parsed.profile.botChallenges === 'object'
          ? parsed.profile.botChallenges
          : {},
    };

    return {
      profile: mergedProfile,
      variants: mergedVariants,
      boards: validBoards,
      pieces: mergedPieces,
      history: validHistory,
      ratings: parsed.ratings && typeof parsed.ratings === 'object' ? parsed.ratings : {},
      settings: { ...blank.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return createBlankState();
  }
}

export function saveLocalState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    try {
      // Fallback: preserve all records while stripping bulky replay payloads on older games
      const trimmed: AppState = {
        ...state,
        history: state.history.map((rec, idx) =>
          idx < 25 ? rec : { ...rec, replayMoves: undefined, variantSnapshot: undefined }
        ),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore quota errors
    }
  }
}

export interface StoredOnlineSession {
  roomId: string;
  code: string;
  userId: string;
  variantId?: string;
  competitive?: boolean;
  savedAt: number;
}

const ONLINE_SESSION_KEY = 'chesslab_active_online_v1';

export function saveActiveOnlineSession(session: StoredOnlineSession): void {
  try {
    localStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function loadActiveOnlineSession(): StoredOnlineSession | null {
  try {
    const raw = localStorage.getItem(ONLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOnlineSession;
    // Expire after 6 minutes cleanly (matches 5-min server grace + margin)
    if (!parsed?.roomId || Date.now() - (parsed.savedAt || 0) > 6 * 60 * 1000) {
      localStorage.removeItem(ONLINE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveOnlineSession(): void {
  try {
    localStorage.removeItem(ONLINE_SESSION_KEY);
  } catch {
    // ignore
  }
}

export interface StoredNavSession {
  screen: string;
  selectedPlayVariantId: string | null;
  playInitialMode: 'ai' | 'local' | 'online' | 'analysis';
  playInitialCompetitive: boolean;
  variantDraft?: Variant;
}

const NAV_SESSION_KEY = 'chesslab_nav_session_v1';

export function saveSessionNav(nav: StoredNavSession): void {
  try {
    sessionStorage.setItem(NAV_SESSION_KEY, JSON.stringify(nav));
  } catch {
    // ignore quota / restricted webview
  }
}

export function loadSessionNav(): StoredNavSession | null {
  try {
    const raw = sessionStorage.getItem(NAV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredNavSession;
    if (!parsed || typeof parsed.screen !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionNav(): void {
  try {
    sessionStorage.removeItem(NAV_SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function syncProfileToServer(profile: Profile): Promise<Profile | null> {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) return null;
    return (await res.json()) as Profile;
  } catch {
    return null;
  }
}

export async function fetchPublicVariants(query = ''): Promise<Variant[]> {
  try {
    const q = encodeURIComponent(query.trim());
    const res = await fetch(`/api/variants?q=${q}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { variants: Variant[] };
    return data.variants || [];
  } catch {
    return [];
  }
}

export async function fetchVariantById(id: string): Promise<Variant | null> {
  try {
    const res = await fetch(`/api/variants/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { variant: Variant };
    return data.variant || null;
  } catch {
    return null;
  }
}

export async function fetchVariantLineage(id: string): Promise<{
  ancestors: Variant[];
  branches: Variant[];
}> {
  try {
    const res = await fetch(`/api/variants/${encodeURIComponent(id)}/lineage`);
    if (!res.ok) return { ancestors: [], branches: [] };
    return (await res.json()) as { ancestors: Variant[]; branches: Variant[] };
  } catch {
    return { ancestors: [], branches: [] };
  }
}

export async function publishVariantToServer(variant: Variant): Promise<Variant | null> {
  try {
    const res = await fetch('/api/variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variant),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { variant: Variant };
    return data.variant;
  } catch {
    return null;
  }
}

export async function rateVariantOnServer(
  variantId: string,
  userId: string,
  stars: number
): Promise<{ ratingSum: number; ratingCount: number } | null> {
  try {
    const res = await fetch(`/api/variants/${encodeURIComponent(variantId)}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stars }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { ratingSum: number; ratingCount: number };
  } catch {
    return null;
  }
}

export async function addCommentOnServer(
  variantId: string,
  authorId: string,
  authorName: string,
  text: string
): Promise<Variant | null> {
  try {
    const res = await fetch(`/api/variants/${encodeURIComponent(variantId)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId, authorName, text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { variant: Variant };
    return data.variant;
  } catch {
    return null;
  }
}

export async function recordGameOnServer(record: {
  userId: string;
  variantId: string | null;
  playerEolAfter?: number;
  result: GameRecord['result'];
}): Promise<void> {
  try {
    await fetch('/api/games/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch {
    // Offline fallback handled locally
  }
}

export function cloneBoardConfig(b: BoardConfig): BoardConfig {
  return JSON.parse(JSON.stringify(b)) as BoardConfig;
}
