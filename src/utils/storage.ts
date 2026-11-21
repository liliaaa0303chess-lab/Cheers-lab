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

const STORAGE_KEY = 'chesslab_app_v2';

export function createDefaultProfile(): Profile {
  return {
    id: `usr_${crypto.randomUUID().slice(0, 12)}`,
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

    // Ensure starter pieces/variants exist if user hasn't deleted everything
    const mergedVariants = Array.isArray(parsed.variants) && parsed.variants.length > 0
      ? parsed.variants
      : blank.variants;
    const mergedPieces = Array.isArray(parsed.pieces) && parsed.pieces.length > 0
      ? parsed.pieces
      : blank.pieces;

    return {
      profile: { ...blank.profile, ...(parsed.profile || {}) },
      variants: mergedVariants,
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      pieces: mergedPieces,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      ratings: parsed.ratings || {},
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
    // Ignore quota errors
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
