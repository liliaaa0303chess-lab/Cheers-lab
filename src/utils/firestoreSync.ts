import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { computeControlledDifficulty } from '../engine/eol';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BattleCardStyle,
  BoardConfig,
  FriendEntry,
  FriendRequestEntry,
  GameInviteEntry,
  GameRecord,
  PieceDef,
  Profile,
  PublicPlayerProfile,
  Variant,
  VariantComment,
} from '../types/chess';
import { getUnlockedTitlesForProfile, resolveEquippedTitle } from './goldRewards';
import { safeUuid } from './safeId';
import { getStreakRank } from './streaks';

export interface LeaderboardCard {
  uid: string;
  nickname: string;
  avatarColor: string;
  avatarSymbol: string;
  eol: number;
  gamesPlayed: number;
  wins: number;
  isPublic: boolean;
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function clampStr(raw: string | undefined | null, maxLen: number): string {
  return (raw ?? '').slice(0, maxLen);
}

function normalizeHexColor(val: string | undefined | null, fallback = '#7ebcff'): string {
  if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val)) {
    return val;
  }
  return fallback;
}

function toIsoDate(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function prepareBoardForFirestore(board: Variant['board']) {
  const rows = Math.max(2, Math.min(16, Math.trunc(board.rows || 8)));
  const cols = Math.max(2, Math.min(16, Math.trunc(board.cols || 8)));
  const maxCells = Math.min(256, rows * cols);
  const normalizeBitArray = (arr: number[] | undefined, fillValue: number) => {
    const out: number[] = [];
    for (let i = 0; i < maxCells; i++) {
      out.push(arr && arr[i] ? 1 : arr && i < arr.length ? 0 : fillValue);
    }
    return out;
  };
  const validTextures = [
    'plain',
    'wood',
    'stone',
    'marble',
    'metal',
    'night',
    'gold_night',
  ] as const;
  const texture = validTextures.includes(board.texture) ? board.texture : 'plain';
  return {
    rows,
    cols,
    cells: normalizeBitArray(board.cells, 1),
    blocked: normalizeBitArray(board.blocked, 0),
    special: normalizeBitArray(board.special, 0),
    ...(board.specialEffectType ? { specialEffectType: board.specialEffectType } : {}),
    specialEffect: clampStr(board.specialEffect, 300),
    texture,
    light: normalizeHexColor(board.light, '#dce5ef'),
    dark: normalizeHexColor(board.dark, '#788ba2'),
    rotation: Math.max(0, Math.min(360, Number(board.rotation) || 0)),
  };
}

function prepareSetupForFirestore(setup: Record<number, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(setup || {}).slice(0, 256);
  for (const [k, v] of entries) {
    if (typeof v === 'string' && v.length > 0 && v.length <= 128) {
      out[String(k).slice(0, 8)] = v;
    }
  }
  return out;
}

const VALID_CARD_STYLES: BattleCardStyle[] = [
  'classic',
  'emerald',
  'crimson',
  'imperial',
  'cosmic',
];

function normalizeBattleCardStyle(style: unknown): BattleCardStyle {
  return typeof style === 'string' && VALID_CARD_STYLES.includes(style as BattleCardStyle)
    ? (style as BattleCardStyle)
    : 'classic';
}

export async function syncUserProfileToFirestore(
  user: User,
  profile: Profile,
  isOnline = true
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 'usr');
  const userPath = `users/${uid}`;
  const lbPath = `leaderboard/${uid}`;
  const pubPath = `publicProfiles/${uid}`;

  const nickname = clampStr(profile.nickname.trim() || user.displayName || 'Joueur', 32);
  const avatarColor = normalizeHexColor(profile.avatarColor, '#7ebcff');
  const avatarSymbol = clampStr(profile.avatarSymbol || '♔', 8);
  const eol = Math.max(100, Math.min(5000, Number(profile.eol) || 400));
  const gamesPlayed = Math.max(0, Math.trunc(profile.gamesPlayed || 0));
  const wins = Math.max(0, Math.trunc(profile.wins || 0));
  const draws = Math.max(0, Math.trunc(profile.draws || 0));
  const losses = Math.max(0, Math.trunc(profile.losses || 0));
  const discoveredVariants = (profile.discoveredVariants || [])
    .slice(0, 500)
    .map((id) => sanitizeId(String(id), 'var'));

  const loginStreak = Math.max(0, Math.min(100000, Math.trunc(profile.loginStreak || 0)));
  const bestLoginStreak = Math.max(
    loginStreak,
    Math.min(100000, Math.trunc(profile.bestLoginStreak || 0))
  );
  const lastStreakDate = clampStr(profile.lastStreakDate || '', 16);
  const botChallenges: Record<string, number[]> = {};
  if (profile.botChallenges && typeof profile.botChallenges === 'object') {
    for (const [k, arr] of Object.entries(profile.botChallenges).slice(0, 16)) {
      if (Array.isArray(arr)) {
        const cleaned = Array.from(
          new Set(arr.map((n) => Math.trunc(Number(n))).filter((n) => n >= 1 && n <= 8))
        ).sort((a, b) => a - b);
        if (cleaned.length > 0) {
          botChallenges[sanitizeId(k, 'var')] = cleaned;
        }
      }
    }
  }
  const botRebellionUnlocked = Boolean(profile.botRebellionUnlocked);

  const goldCoins = Math.max(0, Math.min(1000000, Math.trunc(profile.goldCoins || 0)));
  const goldEffectIds = Array.isArray(profile.goldEffectIds)
    ? profile.goldEffectIds.slice(0, 32).map((id) => clampStr(String(id), 48))
    : undefined;
  const gold100Choice =
    profile.gold100Choice === 'board_piece' || profile.gold100Choice === 'signature_mate'
      ? profile.gold100Choice
      : null;
  const gold1000Choice = profile.gold1000Choice
    ? clampStr(profile.gold1000Choice, 64)
    : null;
  const customGoldTitle = clampStr(profile.customGoldTitle || '', 48);
  const unlockedTitles = getUnlockedTitlesForProfile(profile)
    .slice(0, 16)
    .map((t) => clampStr(t, 48));
  const equippedTitle = resolveEquippedTitle(profile) ?? null;
  const { current: rank } = getStreakRank(Math.max(1, loginStreak));
  const streakPieceSymbol = clampStr(profile.equippedStreakPiece || rank.symbol || '♙', 8);
  const streakPieceLabel = clampStr(rank.title, 48);
  const battleCardStyle = normalizeBattleCardStyle(profile.battleCardStyle);
  const showBattleIntro = profile.showBattleIntro !== false;

  const userWritablePayload = {
    nickname,
    avatarColor,
    avatarSymbol,
    eol,
    gamesPlayed,
    wins,
    draws,
    losses,
    discoveredVariants,
    loginStreak,
    bestLoginStreak,
    lastStreakDate,
    botChallenges,
    botRebellionUnlocked,
    goldCoins,
    ...(goldEffectIds ? { goldEffectIds } : {}),
    gold100Choice,
    gold1000Choice,
    customGoldTitle,
    equippedTitle: equippedTitle ? clampStr(equippedTitle, 48) : null,
    equippedStreakPiece: streakPieceSymbol,
    battleCardStyle,
    showBattleIntro,
    updatedAt: serverTimestamp(),
  };

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        ...userWritablePayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, userWritablePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  try {
    const lbRef = doc(db, 'leaderboard', uid);
    await setDoc(lbRef, {
      uid,
      nickname,
      avatarColor,
      avatarSymbol,
      eol,
      gamesPlayed,
      wins,
      isPublic: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, lbPath);
  }

  try {
    const pubRef = doc(db, 'publicProfiles', uid);
    await setDoc(pubRef, {
      uid,
      nickname,
      avatarColor,
      avatarSymbol,
      eol,
      gamesPlayed,
      wins,
      loginStreak,
      bestLoginStreak,
      goldCoins,
      unlockedTitles,
      equippedTitle: equippedTitle ? clampStr(equippedTitle, 48) : null,
      streakPieceSymbol,
      streakPieceLabel,
      battleCardStyle,
      isOnline: Boolean(isOnline),
      isPublic: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pubPath);
  }
}

export async function loadUserProfileFromFirestore(
  user: User
): Promise<Partial<Profile> | null> {
  if (!user.emailVerified) return null;
  const uid = sanitizeId(user.uid, 'usr');
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      nickname: typeof d.nickname === 'string' ? d.nickname : undefined,
      avatarColor: typeof d.avatarColor === 'string' ? d.avatarColor : undefined,
      avatarSymbol: typeof d.avatarSymbol === 'string' ? d.avatarSymbol : undefined,
      eol: typeof d.eol === 'number' ? d.eol : undefined,
      gamesPlayed: typeof d.gamesPlayed === 'number' ? d.gamesPlayed : undefined,
      wins: typeof d.wins === 'number' ? d.wins : undefined,
      draws: typeof d.draws === 'number' ? d.draws : undefined,
      losses: typeof d.losses === 'number' ? d.losses : undefined,
      discoveredVariants: Array.isArray(d.discoveredVariants)
        ? (d.discoveredVariants as string[])
        : undefined,
      loginStreak: typeof d.loginStreak === 'number' ? d.loginStreak : undefined,
      bestLoginStreak: typeof d.bestLoginStreak === 'number' ? d.bestLoginStreak : undefined,
      lastStreakDate: typeof d.lastStreakDate === 'string' ? d.lastStreakDate : undefined,
      goldCoins: typeof d.goldCoins === 'number' ? d.goldCoins : undefined,
      goldEffectIds: Array.isArray(d.goldEffectIds)
        ? (d.goldEffectIds as string[])
        : undefined,
      gold100Choice:
        d.gold100Choice === 'board_piece' || d.gold100Choice === 'signature_mate'
          ? d.gold100Choice
          : undefined,
      gold1000Choice: typeof d.gold1000Choice === 'string' ? d.gold1000Choice : undefined,
      customGoldTitle: typeof d.customGoldTitle === 'string' ? d.customGoldTitle : undefined,
      equippedTitle: typeof d.equippedTitle === 'string' ? d.equippedTitle : undefined,
      equippedStreakPiece:
        typeof d.equippedStreakPiece === 'string' ? d.equippedStreakPiece : undefined,
      battleCardStyle: normalizeBattleCardStyle(d.battleCardStyle),
      showBattleIntro:
        typeof d.showBattleIntro === 'boolean' ? d.showBattleIntro : undefined,
      botChallenges:
        d.botChallenges && typeof d.botChallenges === 'object'
          ? (d.botChallenges as Record<string, number[]>)
          : undefined,
      botRebellionUnlocked:
        typeof d.botRebellionUnlocked === 'boolean' ? d.botRebellionUnlocked : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function docToVariant(id: string, d: Record<string, unknown>): Variant {
  const setupRaw = (d.setup as Record<string, string>) || {};
  const setupNum: Record<number, string> = {};
  for (const [k, v] of Object.entries(setupRaw)) {
    const idx = Number(k);
    if (!Number.isNaN(idx)) setupNum[idx] = v;
  }
  return {
    id,
    name: String(d.name || 'Variante'),
    description: String(d.description || ''),
    visibility: (d.visibility as Variant['visibility']) || 'public',
    players: Number(d.players || 2),
    difficulty: (d.difficulty as Variant['difficulty']) || 'Moyenne',
    controlledDifficulty:
      (d.controlledDifficulty as Variant['difficulty']) ||
      (d.difficulty as Variant['difficulty']) ||
      'Moyenne',
    victoryType: (d.victoryType as Variant['victoryType']) || 'checkmate_or_king',
    captureTarget: typeof d.captureTarget === 'number' ? d.captureTarget : undefined,
    goal: String(d.goal || ''),
    actions: Number(d.actions || 1),
    duration: Number(d.duration || 0),
    turnOrder: String(d.turnOrder || 'Classique'),
    rules: String(d.rules || ''),
    ...(d.ruleConstraints && typeof d.ruleConstraints === 'object'
      ? { ruleConstraints: d.ruleConstraints as Variant['ruleConstraints'] }
      : {}),
    board: d.board as Variant['board'],
    pieces: Array.isArray(d.pieces) ? (d.pieces as string[]) : [],
    customPieceDefs: Array.isArray(d.customPieceDefs)
      ? (d.customPieceDefs as PieceDef[])
      : [],
    setup: setupNum,
    createdAt: toIsoDate(d.createdAt),
    updatedAt: toIsoDate(d.updatedAt),
    creatorId: String(d.creatorUid || d.creatorId || 'unknown'),
    creator: String(d.creator || 'Créateur'),
    games: Number(d.games || 0),
    ratingSum: Number(d.ratingSum || 0),
    ratingCount: Number(d.ratingCount || 0),
    parentId: (d.parentId as string | null) ?? null,
    parentName: (d.parentName as string | null) ?? null,
    rootId: (d.rootId as string | null) ?? null,
    commentsEnabled: d.commentsEnabled !== false,
    versions: Array.isArray(d.versions) ? (d.versions as Variant['versions']) : [],
  };
}

export async function fetchPublicVariantsFromFirestore(): Promise<Variant[]> {
  const path = 'variants';
  try {
    const q = query(
      collection(db, 'variants'),
      where('visibility', '==', 'public'),
      limit(100)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((docSnap) =>
      docToVariant(docSnap.id, docSnap.data() as Record<string, unknown>)
    );
    return list.sort((a, b) => (b.games || 0) - (a.games || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribePublicVariantsFromFirestore(
  onVariants: (variants: Variant[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const q = query(
    collection(db, 'variants'),
    where('visibility', '==', 'public'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((docSnap) => docToVariant(docSnap.id, docSnap.data() as Record<string, unknown>))
        .sort((a, b) => (b.games || 0) - (a.games || 0));
      onVariants(list);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.LIST, 'variants');
        } catch (err) {
          console.warn('Firestore public variants subscription warning:', err);
        }
      }
    }
  );
}

export async function fetchVariantByIdFromFirestore(
  variantId: string
): Promise<Variant | null> {
  const safeId = sanitizeId(variantId, 'var');
  const path = `variants/${safeId}`;
  try {
    const snap = await getDoc(doc(db, 'variants', safeId));
    if (!snap.exists()) return null;
    return docToVariant(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function publishVariantToFirestore(
  user: User,
  variant: Variant
): Promise<Variant | null> {
  if (!user.emailVerified) return null;
  const safeId = sanitizeId(variant.id, 'var');
  const path = `variants/${safeId}`;
  const creatorUid = sanitizeId(user.uid, 'usr');
  const controlledDifficulty = computeControlledDifficulty(variant);

  const pieces = (variant.pieces || [])
    .slice(0, 64)
    .map((p) => clampStr(String(p), 128));
  const customPieceDefs = (variant.customPieceDefs || []).slice(0, 64);

  const editablePayload = {
    name: clampStr(variant.name.trim() || 'Variante sans nom', 80),
    description: clampStr(variant.description, 600),
    visibility: variant.visibility,
    players: Math.max(2, Math.min(6, Math.trunc(variant.players || 2))),
    difficulty: variant.difficulty,
    controlledDifficulty,
    victoryType: variant.victoryType,
    ...(typeof variant.captureTarget === 'number'
      ? { captureTarget: Math.max(1, Math.min(64, Math.trunc(variant.captureTarget))) }
      : {}),
    goal: clampStr(variant.goal, 300),
    actions: Math.max(1, Math.min(10, Math.trunc(variant.actions || 1))),
    duration: Math.max(0, Math.min(180, Math.trunc(variant.duration || 0))),
    turnOrder: clampStr(variant.turnOrder, 120),
    rules: clampStr(variant.rules, 2000),
    ...(variant.ruleConstraints ? { ruleConstraints: variant.ruleConstraints } : {}),
    board: prepareBoardForFirestore(variant.board),
    pieces,
    customPieceDefs,
    setup: prepareSetupForFirestore(variant.setup),
    creator: clampStr(variant.creator || user.displayName || 'Créateur', 32),
    commentsEnabled: variant.commentsEnabled !== false,
    ...(Array.isArray(variant.versions)
      ? { versions: variant.versions.slice(0, 100) }
      : {}),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'variants', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ...editablePayload,
        creatorUid,
        games: 0,
        ratingSum: 0,
        ratingCount: 0,
        parentId: variant.parentId ? sanitizeId(variant.parentId, 'var') : null,
        parentName: variant.parentName ? clampStr(variant.parentName, 80) : null,
        rootId: variant.rootId ? sanitizeId(variant.rootId, 'var') : null,
        createdAt: serverTimestamp(),
      });
      return {
        ...variant,
        id: safeId,
        creatorId: creatorUid,
        controlledDifficulty,
      };
    }

    const existingData = snap.data();
    if (existingData.creatorUid === creatorUid) {
      await updateDoc(ref, editablePayload);
      return {
        ...variant,
        id: safeId,
        creatorId: creatorUid,
        controlledDifficulty,
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteVariantFromFirestore(
  user: User,
  variantId: string
): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(variantId, 'var');
  const path = `variants/${safeId}`;
  try {
    const ref = doc(db, 'variants', safeId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().creatorUid === user.uid) {
      await deleteDoc(ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function incrementVariantGamesInFirestore(
  user: User,
  variantId: string
): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(variantId, 'var');
  const path = `variants/${safeId}`;
  try {
    const ref = doc(db, 'variants', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.visibility !== 'public' && data.visibility !== 'link') return;
    await updateDoc(ref, {
      games: Number(data.games || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function rateVariantInFirestore(
  user: User,
  variantId: string,
  stars: number
): Promise<{ ratingSum: number; ratingCount: number } | null> {
  if (!user.emailVerified) return null;
  const safeId = sanitizeId(variantId, 'var');
  const raterUid = sanitizeId(user.uid, 'usr');
  const clampedStars = Math.max(1, Math.min(5, Math.trunc(stars)));
  const variantPath = `variants/${safeId}`;

  try {
    const variantRef = doc(db, 'variants', safeId);
    const variantSnap = await getDoc(variantRef);
    if (!variantSnap.exists()) return null;

    const vData = variantSnap.data();
    if (vData.visibility !== 'public' && vData.visibility !== 'link') return null;

    const ratingRef = doc(db, 'variants', safeId, 'ratings', raterUid);
    const ratingSnap = await getDoc(ratingRef);

    const prevSum = Number(vData.ratingSum || 0);
    const prevCount = Number(vData.ratingCount || 0);
    const batch = writeBatch(db);

    if (!ratingSnap.exists()) {
      const nextSum = prevSum + clampedStars;
      const nextCount = prevCount + 1;
      batch.set(ratingRef, {
        raterUid,
        variantId: safeId,
        stars: clampedStars,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(variantRef, {
        ratingSum: nextSum,
        ratingCount: nextCount,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ratingSum: nextSum, ratingCount: nextCount };
    } else {
      const oldStars = Number(ratingSnap.data().stars || clampedStars);
      const nextSum = Math.max(0, prevSum + (clampedStars - oldStars));
      batch.update(ratingRef, {
        stars: clampedStars,
        updatedAt: serverTimestamp(),
      });
      batch.update(variantRef, {
        ratingSum: nextSum,
        ratingCount: prevCount,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ratingSum: nextSum, ratingCount: prevCount };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, variantPath);
  }
}

export async function fetchVariantCommentsFromFirestore(
  variantId: string
): Promise<VariantComment[]> {
  const safeId = sanitizeId(variantId, 'var');
  const path = `variants/${safeId}/comments`;
  try {
    const q = query(
      collection(db, 'variants', safeId, 'comments'),
      where('isVisible', '==', true),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((c) => {
        const d = c.data();
        return {
          id: c.id,
          authorId: String(d.authorUid || ''),
          authorName: String(d.authorName || 'Joueur'),
          text: String(d.text || ''),
          createdAt: toIsoDate(d.createdAt),
        } satisfies VariantComment;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addCommentToFirestore(
  user: User,
  variantId: string,
  authorName: string,
  text: string
): Promise<VariantComment | null> {
  if (!user.emailVerified) return null;
  const safeVariantId = sanitizeId(variantId, 'var');
  const commentId = sanitizeId(`c_${safeUuid().slice(0, 10)}`, 'c');
  const path = `variants/${safeVariantId}/comments/${commentId}`;

  try {
    const variantSnap = await getDoc(doc(db, 'variants', safeVariantId));
    if (!variantSnap.exists()) return null;
    const vData = variantSnap.data();
    if (
      vData.commentsEnabled === false ||
      (vData.visibility !== 'public' && vData.visibility !== 'link')
    ) {
      return null;
    }

    const cleanAuthor = clampStr(authorName.trim() || user.displayName || 'Joueur', 32);
    const cleanText = clampStr(text.trim(), 500);
    if (!cleanText) return null;

    await setDoc(doc(db, 'variants', safeVariantId, 'comments', commentId), {
      id: commentId,
      variantId: safeVariantId,
      authorUid: sanitizeId(user.uid, 'usr'),
      authorName: cleanAuthor,
      text: cleanText,
      isVisible: true,
      createdAt: serverTimestamp(),
    });

    return {
      id: commentId,
      authorId: user.uid,
      authorName: cleanAuthor,
      text: cleanText,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordGameInFirestore(
  user: User,
  record: GameRecord
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 'usr');
  const gameId = sanitizeId(record.id, 'gm');
  const path = `users/${uid}/games/${gameId}`;

  try {
    await setDoc(doc(db, 'users', uid, 'games', gameId), {
      id: gameId,
      playerUid: uid,
      mode: record.mode || 'ai',
      ...(record.variantId ? { variantId: sanitizeId(record.variantId, 'var') } : {}),
      variantName: clampStr(record.variantName || 'Variante', 80),
      opponentName: clampStr(record.opponentName || 'Adversaire', 48),
      ...(record.opponentUid ? { opponentUid: sanitizeId(record.opponentUid, 'usr') } : {}),
      result: record.result,
      movesCount: Math.max(0, Math.min(5000, Math.trunc(record.movesCount || 0))),
      deltaEol: Math.max(-200, Math.min(200, Number(record.eolBreakdown?.delta || 0))),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchLeaderboardFromFirestore(): Promise<LeaderboardCard[]> {
  const path = 'leaderboard';
  try {
    const q = query(
      collection(db, 'leaderboard'),
      where('isPublic', '==', true),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as LeaderboardCard)
      .sort(
        (a, b) =>
          (b.eol || 0) - (a.eol || 0) ||
          (b.wins || 0) - (a.wins || 0) ||
          (b.gamesPlayed || 0) - (a.gamesPlayed || 0)
      );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updatePresenceInFirestore(
  user: User,
  isOnline: boolean
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 'usr');
  const pubRef = doc(db, 'publicProfiles', uid);
  try {
    const snap = await getDoc(pubRef);
    if (!snap.exists()) return;
    await updateDoc(pubRef, {
      isOnline: Boolean(isOnline),
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal presence heartbeat
  }
}

export async function syncPublicPieceToFirestore(
  user: User,
  piece: PieceDef,
  creatorName: string
): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(piece.id, 'pc');
  const creatorUid = sanitizeId(user.uid, 'usr');
  const path = `publicPieces/${safeId}`;
  const validTextures = ['plain', 'wood', 'stone', 'marble', 'metal'] as const;
  const texture = validTextures.includes(piece.texture) ? piece.texture : 'plain';

  const payload = {
    name: clampStr(piece.name.trim() || 'Pièce', 64),
    symbol: clampStr(piece.symbol || '★', 8),
    visibility: piece.visibility === 'public' ? 'public' : 'private',
    moves: piece.moves || {
      rook: false,
      bishop: false,
      knight: false,
      king: false,
      pawn: false,
      maxRange: 0,
      canJump: false,
    },
    customMoves: clampStr(piece.customMoves, 500),
    powerType: clampStr(piece.powerType || 'none', 32),
    powers: clampStr(piece.powers, 500),
    conditions: clampStr(piece.conditions, 500),
    limits: Math.max(0, Math.min(1000, Math.trunc(piece.limits || 0))),
    limitsText: clampStr(piece.limitsText, 120),
    texture,
    light: normalizeHexColor(piece.light, '#f8f9fc'),
    dark: normalizeHexColor(piece.dark, '#181d26'),
    description: clampStr(piece.description, 600),
    creator: clampStr(creatorName || user.displayName || 'Créateur', 32),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'publicPieces', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ...payload,
        creatorUid,
        createdAt: serverTimestamp(),
      });
    } else if (snap.data().creatorUid === creatorUid) {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePublicPiecesFromFirestore(
  onPieces: (pieces: PieceDef[]) => void
): () => void {
  const q = query(
    collection(db, 'publicPieces'),
    where('visibility', '==', 'public'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || 'Pièce'),
          symbol: String(data.symbol || '★'),
          visibility: data.visibility === 'public' ? 'public' : 'private',
          moves: (data.moves as PieceDef['moves']) || {
            rook: false,
            bishop: false,
            knight: false,
            king: false,
            pawn: false,
            maxRange: 0,
            canJump: false,
          },
          customMoves: String(data.customMoves || ''),
          powerType: (data.powerType as PieceDef['powerType']) || 'none',
          powers: String(data.powers || ''),
          conditions: String(data.conditions || ''),
          limits: Number(data.limits || 0),
          limitsText: String(data.limitsText || ''),
          texture: (data.texture as PieceDef['texture']) || 'plain',
          light: String(data.light || '#f8f9fc'),
          dark: String(data.dark || '#181d26'),
          description: String(data.description || ''),
        } satisfies PieceDef;
      });
      onPieces(list);
    },
    (error) => {
      console.warn('Firestore public pieces subscription warning:', error);
    }
  );
}

export async function syncPublicBoardToFirestore(
  user: User,
  board: BoardConfig,
  creatorName: string
): Promise<void> {
  if (!user.emailVerified || !board.id) return;
  const safeId = sanitizeId(board.id, 'brd');
  const creatorUid = sanitizeId(user.uid, 'usr');
  const path = `publicBoards/${safeId}`;
  const cleanBoard = prepareBoardForFirestore(board);

  const payload = {
    name: clampStr((board.name || 'Plateau').trim(), 64),
    visibility: board.visibility === 'public' ? 'public' : 'private',
    ...cleanBoard,
    creator: clampStr(creatorName || user.displayName || 'Créateur', 32),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'publicBoards', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ...payload,
        creatorUid,
        createdAt: serverTimestamp(),
      });
    } else if (snap.data().creatorUid === creatorUid) {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePublicBoardsFromFirestore(
  onBoards: (boards: BoardConfig[]) => void
): () => void {
  const q = query(
    collection(db, 'publicBoards'),
    where('visibility', '==', 'public'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || 'Plateau'),
          visibility: data.visibility === 'public' ? 'public' : 'private',
          rows: Number(data.rows || 8),
          cols: Number(data.cols || 8),
          cells: Array.isArray(data.cells) ? (data.cells as number[]) : [],
          blocked: Array.isArray(data.blocked) ? (data.blocked as number[]) : [],
          special: Array.isArray(data.special) ? (data.special as number[]) : [],
          ...(typeof data.specialEffectType === 'string'
            ? { specialEffectType: data.specialEffectType as BoardConfig['specialEffectType'] }
            : {}),
          specialEffect: String(data.specialEffect || ''),
          texture: (data.texture as BoardConfig['texture']) || 'plain',
          light: String(data.light || '#dce5ef'),
          dark: String(data.dark || '#788ba2'),
          rotation: Number(data.rotation || 0),
        } satisfies BoardConfig;
      });
      onBoards(list);
    },
    (error) => {
      console.warn('Firestore public boards subscription warning:', error);
    }
  );
}

export function makeFriendPairId(uid1: string, uid2: string): string {
  const a = sanitizeId(uid1, 'usr');
  const b = sanitizeId(uid2, 'usr');
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export async function sendFriendRequestFirestore(
  user: User,
  fromProfile: Profile,
  toUid: string
): Promise<FriendRequestEntry | null> {
  if (!user.emailVerified || !toUid || toUid === user.uid) return null;
  const fromUid = sanitizeId(user.uid, 'usr');
  const safeToUid = sanitizeId(toUid, 'usr');
  const reqId = sanitizeId(`fr_${fromUid.slice(0, 24)}_${safeToUid.slice(0, 24)}`, 'fr');
  const path = `friendRequests/${reqId}`;

  const { current: rank } = getStreakRank(Math.max(1, fromProfile.loginStreak || 1));
  const title = resolveEquippedTitle(fromProfile);
  const streakPieceSymbol = clampStr(fromProfile.equippedStreakPiece || rank.symbol || '♙', 8);
  const style = normalizeBattleCardStyle(fromProfile.battleCardStyle);

  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      id: reqId,
      fromUid,
      fromNickname: clampStr(fromProfile.nickname.trim() || user.displayName || 'Joueur', 32),
      fromAvatarColor: normalizeHexColor(fromProfile.avatarColor, '#7ebcff'),
      fromAvatarSymbol: clampStr(fromProfile.avatarSymbol || '♔', 8),
      fromEol: Math.max(100, Math.min(5000, Number(fromProfile.eol) || 400)),
      ...(title ? { fromTitle: clampStr(title, 48) } : {}),
      fromStreakPieceSymbol: streakPieceSymbol,
      fromBattleCardStyle: style,
      toUid: safeToUid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return {
      id: reqId,
      fromUid,
      fromNickname: fromProfile.nickname.trim() || 'Joueur',
      fromAvatarColor: normalizeHexColor(fromProfile.avatarColor, '#7ebcff'),
      fromAvatarSymbol: fromProfile.avatarSymbol || '♔',
      fromEol: fromProfile.eol || 400,
      fromTitle: title,
      fromStreakPieceSymbol: streakPieceSymbol,
      fromBattleCardStyle: style,
      toUid: safeToUid,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeIncomingFriendRequestsFirestore(
  user: User,
  onRequests: (requests: FriendRequestEntry[]) => void
): () => void {
  if (!user.emailVerified) return () => {};
  const uid = sanitizeId(user.uid, 'usr');
  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: FriendRequestEntry[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            fromUid: String(data.fromUid || ''),
            fromNickname: String(data.fromNickname || 'Joueur'),
            fromAvatarColor: String(data.fromAvatarColor || '#7ebcff'),
            fromAvatarSymbol: String(data.fromAvatarSymbol || '♔'),
            fromEol: Number(data.fromEol || 400),
            fromTitle: typeof data.fromTitle === 'string' ? data.fromTitle : undefined,
            fromStreakPieceSymbol:
              typeof data.fromStreakPieceSymbol === 'string'
                ? data.fromStreakPieceSymbol
                : undefined,
            fromBattleCardStyle: normalizeBattleCardStyle(data.fromBattleCardStyle),
            toUid: String(data.toUid || uid),
            status: 'pending' as const,
            createdAt: toIsoDate(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onRequests(list);
    },
    (error) => {
      console.warn('Friend requests subscription warning:', error);
    }
  );
}

export async function respondFriendRequestFirestore(
  user: User,
  myProfile: Profile,
  request: FriendRequestEntry,
  accept: boolean
): Promise<FriendEntry | null> {
  if (!user.emailVerified) return null;
  const myUid = sanitizeId(user.uid, 'usr');
  const otherUid = sanitizeId(request.fromUid, 'usr');
  const reqRef = doc(db, 'friendRequests', sanitizeId(request.id, 'fr'));

  if (!accept) {
    try {
      await deleteDoc(reqRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `friendRequests/${request.id}`);
    }
    return null;
  }

  const pairId = makeFriendPairId(myUid, otherUid);
  const uidA = myUid < otherUid ? myUid : otherUid;
  const uidB = myUid < otherUid ? otherUid : myUid;

  const { current: myRank } = getStreakRank(Math.max(1, myProfile.loginStreak || 1));
  const myCard = {
    uid: myUid,
    nickname: clampStr(myProfile.nickname.trim() || user.displayName || 'Joueur', 32),
    avatarColor: normalizeHexColor(myProfile.avatarColor, '#7ebcff'),
    avatarSymbol: clampStr(myProfile.avatarSymbol || '♔', 8),
    eol: Math.max(100, Math.min(5000, Number(myProfile.eol) || 400)),
    title: resolveEquippedTitle(myProfile) || '',
    streakPieceSymbol: clampStr(myProfile.equippedStreakPiece || myRank.symbol || '♙', 8),
    battleCardStyle: normalizeBattleCardStyle(myProfile.battleCardStyle),
  };

  const otherCard = {
    uid: otherUid,
    nickname: clampStr(request.fromNickname || 'Joueur', 32),
    avatarColor: normalizeHexColor(request.fromAvatarColor, '#7ebcff'),
    avatarSymbol: clampStr(request.fromAvatarSymbol || '♔', 8),
    eol: Math.max(100, Math.min(5000, Number(request.fromEol) || 400)),
    title: clampStr(request.fromTitle || '', 48),
    streakPieceSymbol: clampStr(request.fromStreakPieceSymbol || '♙', 8),
    battleCardStyle: normalizeBattleCardStyle(request.fromBattleCardStyle),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'friendships', pairId), {
      id: pairId,
      uidA,
      uidB,
      members: [uidA, uidB],
      profiles: {
        [myUid]: myCard,
        [otherUid]: otherCard,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.delete(reqRef);
    await batch.commit();

    return {
      uid: otherUid,
      nickname: otherCard.nickname,
      avatarColor: otherCard.avatarColor,
      avatarSymbol: otherCard.avatarSymbol,
      eol: otherCard.eol,
      title: otherCard.title || undefined,
      streakPieceSymbol: otherCard.streakPieceSymbol,
      battleCardStyle: otherCard.battleCardStyle,
      addedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendships/${pairId}`);
  }
}

export function subscribeFriendshipsFirestore(
  user: User,
  onFriends: (friends: FriendEntry[]) => void
): () => void {
  if (!user.emailVerified) return () => {};
  const myUid = sanitizeId(user.uid, 'usr');
  const q = query(
    collection(db, 'friendships'),
    where('members', 'array-contains', myUid),
    limit(100)
  );
  return onSnapshot(
    q,
    async (snap) => {
      const baseFriends: FriendEntry[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const members = Array.isArray(data.members) ? (data.members as string[]) : [];
        const friendUid = members.find((m) => m !== myUid);
        if (!friendUid) continue;
        const profiles = (data.profiles || {}) as Record<string, Record<string, unknown>>;
        const cached = profiles[friendUid] || {};
        let entry: FriendEntry = {
          uid: friendUid,
          nickname: String(cached.nickname || 'Joueur'),
          avatarColor: String(cached.avatarColor || '#7ebcff'),
          avatarSymbol: String(cached.avatarSymbol || '♔'),
          eol: Number(cached.eol || 400),
          title: typeof cached.title === 'string' && cached.title ? cached.title : undefined,
          streakPieceSymbol:
            typeof cached.streakPieceSymbol === 'string' ? cached.streakPieceSymbol : '♙',
          battleCardStyle: normalizeBattleCardStyle(cached.battleCardStyle),
          addedAt: toIsoDate(data.createdAt),
        };
        try {
          const pubSnap = await getDoc(doc(db, 'publicProfiles', sanitizeId(friendUid, 'usr')));
          if (pubSnap.exists()) {
            const p = pubSnap.data();
            const lastSeenMs =
              p.lastSeenAt instanceof Timestamp ? p.lastSeenAt.toMillis() : 0;
            const recentlySeen = lastSeenMs > 0 && Date.now() - lastSeenMs < 4 * 60 * 1000;
            entry = {
              ...entry,
              nickname: String(p.nickname || entry.nickname),
              avatarColor: String(p.avatarColor || entry.avatarColor),
              avatarSymbol: String(p.avatarSymbol || entry.avatarSymbol),
              eol: Number(p.eol || entry.eol),
              title: typeof p.equippedTitle === 'string' && p.equippedTitle ? p.equippedTitle : entry.title,
              streakPieceSymbol:
                typeof p.streakPieceSymbol === 'string'
                  ? p.streakPieceSymbol
                  : entry.streakPieceSymbol,
              streakPieceLabel:
                typeof p.streakPieceLabel === 'string' ? p.streakPieceLabel : undefined,
              battleCardStyle: normalizeBattleCardStyle(p.battleCardStyle),
              isOnline: Boolean(p.isOnline) && recentlySeen,
            };
          }
        } catch {
          // fallback to cached friendship card
        }
        baseFriends.push(entry);
      }
      onFriends(baseFriends);
    },
    (error) => {
      console.warn('Friendships subscription warning:', error);
    }
  );
}

export async function removeFriendshipFirestore(
  user: User,
  friendUid: string
): Promise<void> {
  if (!user.emailVerified) return;
  const pairId = makeFriendPairId(user.uid, friendUid);
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${pairId}`);
  }
}

export async function sendGameInviteFirestore(
  user: User,
  fromProfile: Profile,
  toUid: string,
  variant: { id?: string; name: string },
  roomCode?: string,
  roomId?: string
): Promise<void> {
  if (!user.emailVerified || !toUid || toUid === user.uid) return;
  const fromUid = sanitizeId(user.uid, 'usr');
  const safeToUid = sanitizeId(toUid, 'usr');
  const inviteId = sanitizeId(`inv_${safeUuid().slice(0, 12)}`, 'inv');
  try {
    await setDoc(doc(db, 'gameInvites', inviteId), {
      id: inviteId,
      fromUid,
      fromNickname: clampStr(fromProfile.nickname.trim() || user.displayName || 'Joueur', 32),
      fromAvatarColor: normalizeHexColor(fromProfile.avatarColor, '#7ebcff'),
      fromAvatarSymbol: clampStr(fromProfile.avatarSymbol || '♔', 8),
      fromEol: Math.max(100, Math.min(5000, Number(fromProfile.eol) || 400)),
      toUid: safeToUid,
      ...(variant.id ? { variantId: sanitizeId(variant.id, 'var') } : {}),
      variantName: clampStr(variant.name || 'Partie Chess Lab', 80),
      ...(roomCode ? { roomCode: clampStr(roomCode, 24) } : {}),
      ...(roomId ? { roomId: sanitizeId(roomId, 'rm') } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `gameInvites/${inviteId}`);
  }
}

export function subscribeIncomingGameInvitesFirestore(
  user: User,
  onInvites: (invites: GameInviteEntry[]) => void
): () => void {
  if (!user.emailVerified) return () => {};
  const myUid = sanitizeId(user.uid, 'usr');
  const q = query(collection(db, 'gameInvites'), where('toUid', '==', myUid), limit(25));
  return onSnapshot(
    q,
    (snap) => {
      const list: GameInviteEntry[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            fromUid: String(data.fromUid || ''),
            fromNickname: String(data.fromNickname || 'Joueur'),
            fromAvatarColor: String(data.fromAvatarColor || '#7ebcff'),
            fromAvatarSymbol: String(data.fromAvatarSymbol || '♔'),
            fromEol: Number(data.fromEol || 400),
            toUid: String(data.toUid || myUid),
            variantId: typeof data.variantId === 'string' ? data.variantId : undefined,
            variantName: String(data.variantName || 'Partie Chess Lab'),
            roomCode: typeof data.roomCode === 'string' ? data.roomCode : undefined,
            roomId: typeof data.roomId === 'string' ? data.roomId : undefined,
            createdAt: toIsoDate(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onInvites(list);
    },
    (error) => {
      console.warn('Game invites subscription warning:', error);
    }
  );
}

export async function clearGameInviteFirestore(inviteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'gameInvites', sanitizeId(inviteId, 'inv')));
  } catch {
    // ignore
  }
}

export async function fetchFullPlayerProfileFirestore(
  targetUid: string
): Promise<PublicPlayerProfile | null> {
  const safeUid = sanitizeId(targetUid, 'usr');
  try {
    const [pubSnap, lbSnap, varSnap, pieceSnap, boardSnap] = await Promise.all([
      getDoc(doc(db, 'publicProfiles', safeUid)).catch(() => null),
      getDoc(doc(db, 'leaderboard', safeUid)).catch(() => null),
      getDocs(
        query(
          collection(db, 'variants'),
          where('visibility', '==', 'public'),
          where('creatorUid', '==', safeUid),
          limit(50)
        )
      ).catch(() => null),
      getDocs(
        query(
          collection(db, 'publicPieces'),
          where('visibility', '==', 'public'),
          where('creatorUid', '==', safeUid),
          limit(50)
        )
      ).catch(() => null),
      getDocs(
        query(
          collection(db, 'publicBoards'),
          where('visibility', '==', 'public'),
          where('creatorUid', '==', safeUid),
          limit(50)
        )
      ).catch(() => null),
    ]);

    const pubData = pubSnap?.exists() ? pubSnap.data() : null;
    const lbData = lbSnap?.exists() ? lbSnap.data() : null;
    if (!pubData && !lbData) return null;

    const lastSeenMs =
      pubData?.lastSeenAt instanceof Timestamp ? pubData.lastSeenAt.toMillis() : 0;
    const recentlySeen = lastSeenMs > 0 && Date.now() - lastSeenMs < 4 * 60 * 1000;

    const publicVariants: Variant[] = varSnap
      ? varSnap.docs.map((d) => docToVariant(d.id, d.data() as Record<string, unknown>))
      : [];
    const publicPieces: PieceDef[] = pieceSnap
      ? pieceSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || 'Pièce'),
            symbol: String(data.symbol || '★'),
            visibility: 'public' as const,
            moves: (data.moves as PieceDef['moves']) || {
              rook: false,
              bishop: false,
              knight: false,
              king: false,
              pawn: false,
              maxRange: 0,
              canJump: false,
            },
            customMoves: String(data.customMoves || ''),
            powerType: (data.powerType as PieceDef['powerType']) || 'none',
            powers: String(data.powers || ''),
            conditions: String(data.conditions || ''),
            limits: Number(data.limits || 0),
            limitsText: String(data.limitsText || ''),
            texture: (data.texture as PieceDef['texture']) || 'plain',
            light: String(data.light || '#f8f9fc'),
            dark: String(data.dark || '#181d26'),
            description: String(data.description || ''),
          };
        })
      : [];
    const publicBoards: BoardConfig[] = boardSnap
      ? boardSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || 'Plateau'),
            visibility: 'public' as const,
            rows: Number(data.rows || 8),
            cols: Number(data.cols || 8),
            cells: Array.isArray(data.cells) ? (data.cells as number[]) : [],
            blocked: Array.isArray(data.blocked) ? (data.blocked as number[]) : [],
            special: Array.isArray(data.special) ? (data.special as number[]) : [],
            specialEffect: String(data.specialEffect || ''),
            texture: (data.texture as BoardConfig['texture']) || 'plain',
            light: String(data.light || '#dce5ef'),
            dark: String(data.dark || '#788ba2'),
            rotation: Number(data.rotation || 0),
          };
        })
      : [];

    return {
      uid: safeUid,
      nickname: String(pubData?.nickname || lbData?.nickname || 'Joueur'),
      avatarColor: String(pubData?.avatarColor || lbData?.avatarColor || '#7ebcff'),
      avatarSymbol: String(pubData?.avatarSymbol || lbData?.avatarSymbol || '♔'),
      eol: Number(pubData?.eol || lbData?.eol || 400),
      gamesPlayed: Number(pubData?.gamesPlayed || lbData?.gamesPlayed || 0),
      wins: Number(pubData?.wins || lbData?.wins || 0),
      loginStreak: Number(pubData?.loginStreak || 0),
      bestLoginStreak: Number(pubData?.bestLoginStreak || pubData?.loginStreak || 0),
      goldCoins: Number(pubData?.goldCoins || 0),
      unlockedTitles: Array.isArray(pubData?.unlockedTitles)
        ? (pubData.unlockedTitles as string[])
        : [],
      title:
        typeof pubData?.equippedTitle === 'string' && pubData.equippedTitle
          ? pubData.equippedTitle
          : undefined,
      streakPieceSymbol:
        typeof pubData?.streakPieceSymbol === 'string'
          ? pubData.streakPieceSymbol
          : '♙',
      streakPieceLabel:
        typeof pubData?.streakPieceLabel === 'string'
          ? pubData.streakPieceLabel
          : undefined,
      battleCardStyle: normalizeBattleCardStyle(pubData?.battleCardStyle),
      isOnline: Boolean(pubData?.isOnline) && recentlySeen,
      publicVariants,
      publicPieces,
      publicBoards,
    };
  } catch (error) {
    console.warn('fetchFullPlayerProfileFirestore warning:', error);
    return null;
  }
}
