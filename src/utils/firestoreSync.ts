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
  GameRecord,
  PieceDef,
  Profile,
  Variant,
  VariantComment,
} from '../types/chess';
import { safeUuid } from './safeId';

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
  const validTextures = ['plain', 'wood', 'stone', 'marble', 'metal', 'night'] as const;
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

export async function syncUserProfileToFirestore(
  user: User,
  profile: Profile
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 'usr');
  const userPath = `users/${uid}`;
  const lbPath = `leaderboard/${uid}`;

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

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
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
        updatedAt: serverTimestamp(),
      });
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
