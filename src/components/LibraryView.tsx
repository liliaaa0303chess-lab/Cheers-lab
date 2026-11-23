import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Edit3,
  FlaskConical,
  GitBranch,
  GitFork,
  Grid3x3,
  Layers,
  Link2,
  Lock,
  Palette,
  Play,
  Star,
  Swords,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  AssetVisibility,
  BattleCardData,
  BoardConfig,
  FriendEntry,
  FriendRequestEntry,
  PieceDef,
  SavedTheme,
  Variant,
} from '../types/chess';
import { fetchVariantLineage } from '../utils/storage';
import { getPublicAppUrl } from '../utils/appUrl';
import { BattleCard } from './BattleCard';
import { ChessPieceArtwork } from './ChessPieceArtwork';

interface LibraryViewProps {
  variants: Variant[];
  boards: BoardConfig[];
  pieces: PieceDef[];
  savedThemes: SavedTheme[];
  friends?: FriendEntry[];
  friendRequests?: FriendRequestEntry[];
  onlineStatusByUid?: Record<string, boolean>;
  onPlayVariant: (v: Variant) => void;
  onEditVariant: (v: Variant) => void;
  onDuplicateVariant: (v: Variant) => void;
  onDeleteVariant: (id: string) => void;
  onToggleVisibility: (v: Variant, vis: Variant['visibility']) => void;
  onLoadBoardIntoCreator: (b: BoardConfig) => void;
  onToggleBoardVisibility: (b: BoardConfig, vis: AssetVisibility) => void;
  onDeleteBoard: (id: string) => void;
  onOpenPieceCreator: () => void;
  onTogglePieceVisibility: (p: PieceDef, vis: AssetVisibility) => void;
  onDeletePiece: (id: string) => void;
  onApplySavedTheme: (theme: SavedTheme) => void;
  onDeleteSavedTheme: (id: string) => void;
  onOpenFriendProfile?: (uid: string, fallbackFriend?: FriendEntry) => void;
  onRespondFriendRequest?: (req: FriendRequestEntry, accept: boolean) => void;
  onChallengeFriend?: (friend: FriendEntry, variant: Variant) => void;
  onRemoveFriend?: (friendUid: string) => void;
  onNotify: (msg: string) => void;
}

type LibrarySectionId = 'variants' | 'boards' | 'pieces' | 'friends' | 'themes';

function friendToBattleCard(
  f: FriendEntry,
  onlineStatusByUid: Record<string, boolean>
): BattleCardData {
  const isOnline =
    onlineStatusByUid[f.uid] !== undefined
      ? onlineStatusByUid[f.uid]
      : Boolean(f.isOnline);
  return {
    uid: f.uid,
    nickname: f.nickname,
    avatarColor: f.avatarColor,
    avatarSymbol: f.avatarSymbol,
    eol: f.eol,
    title: f.title,
    streakPieceSymbol: f.streakPieceSymbol,
    streakPieceLabel: f.streakPieceLabel,
    battleCardStyle: f.battleCardStyle,
    isOnline,
  };
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  variants,
  boards,
  pieces,
  savedThemes,
  friends = [],
  friendRequests = [],
  onlineStatusByUid = {},
  onPlayVariant,
  onEditVariant,
  onDuplicateVariant,
  onDeleteVariant,
  onToggleVisibility,
  onLoadBoardIntoCreator,
  onToggleBoardVisibility,
  onDeleteBoard,
  onOpenPieceCreator,
  onTogglePieceVisibility,
  onDeletePiece,
  onApplySavedTheme,
  onDeleteSavedTheme,
  onOpenFriendProfile,
  onRespondFriendRequest,
  onChallengeFriend,
  onRemoveFriend,
  onNotify,
}) => {
  const [openSections, setOpenSections] = useState<Partial<Record<LibrarySectionId, boolean>>>({
    variants: true,
    friends: friendRequests.length > 0,
  });
  const [challengeVariantByFriend, setChallengeVariantByFriend] = useState<Record<string, string>>(
    {}
  );
  const [lineageModal, setLineageModal] = useState<{
    variant: Variant;
    ancestors: Variant[];
    branches: Variant[];
  } | null>(null);

  const toggleSection = (id: LibrarySectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Compute piece IDs & board IDs used in any PUBLIC variant (auto-public lock rule)
  const { publicVariantPieceIds, publicVariantBoardIds } = useMemo(() => {
    const pieceSet = new Set<string>();
    const boardSet = new Set<string>();
    for (const v of variants) {
      if (v.visibility !== 'public') continue;
      if (v.board?.id) boardSet.add(v.board.id);
      for (const pid of v.pieces || []) pieceSet.add(pid);
      for (const cp of v.customPieceDefs || []) {
        if (cp?.id) pieceSet.add(cp.id);
      }
      for (const val of Object.values(v.setup || {})) {
        const pid = String(val).split('|')[0];
        if (pid && !pid.startsWith('builtin:')) {
          pieceSet.add(pid);
        }
      }
    }
    return {
      publicVariantPieceIds: pieceSet,
      publicVariantBoardIds: boardSet,
    };
  }, [variants]);

  const handleOpenLineage = async (v: Variant) => {
    const serverLineage = await fetchVariantLineage(v.id);
    const localBranches = variants.filter((item) => item.parentId === v.id);
    const branchMap = new Map<string, Variant>();
    for (const b of [...serverLineage.branches, ...localBranches]) {
      branchMap.set(b.id, b);
    }
    setLineageModal({
      variant: v,
      ancestors: serverLineage.ancestors,
      branches: Array.from(branchMap.values()),
    });
  };

  const handleCopyLink = async (v: Variant) => {
    const url = `${getPublicAppUrl()}/?variant=${encodeURIComponent(v.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify('Lien de partage copié !');
    } catch {
      onNotify(`Lien : ${url}`);
    }
  };

  const visLabel: Record<Variant['visibility'], string> = {
    private: 'Privée',
    public: 'Publique',
    link: 'Par lien',
  };

  const defaultChallengeVariant = variants[0];

  return (
    <div className="space-y-4">
      <div className="pb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Bibliothèque personnelle
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Touchez une rubrique pour la déplier : gérez vos variantes, plateaux, pièces, amis et thèmes.
        </p>
      </div>

      <div className="space-y-3">
        {/* 1. Dépliant Variantes */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('variants')}
            aria-expanded={Boolean(openSections.variants)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Variantes ({variants.length})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Jouer, modifier, dériver et régler la visibilité
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.variants ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.variants && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {variants.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune variante enregistrée.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {variants.map((v) => {
                    const avg =
                      v.ratingCount && v.ratingCount > 0 && v.ratingSum
                        ? (v.ratingSum / v.ratingCount).toFixed(1)
                        : '—';
                    return (
                      <div
                        key={v.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f] space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {v.name}
                            </h3>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {v.board.rows}×{v.board.cols} · {v.controlledDifficulty || v.difficulty} ·{' '}
                              {visLabel[v.visibility]}
                              {v.parentName && ` · Dérivée de « ${v.parentName} »`}
                            </div>
                          </div>
                          <select
                            value={v.visibility}
                            onChange={(e) =>
                              onToggleVisibility(v, e.target.value as Variant['visibility'])
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1 text-xs"
                            aria-label="Visibilité"
                          >
                            <option value="private">Privée</option>
                            <option value="public">Publique</option>
                            <option value="link">Par lien</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                          <span>Popularité : {v.games || 0}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            {avg}/5
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => onPlayVariant(v)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs min-h-[38px]"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Jouer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditVariant(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateVariant(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Dériver</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenLineage(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            <span>Lignée</span>
                          </button>
                          {v.visibility !== 'private' && (
                            <button
                              type="button"
                              onClick={() => handleCopyLink(v)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Lien</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteVariant(v.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 text-xs ml-auto min-h-[38px]"
                            aria-label="Supprimer variante"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. Dépliant Plateaux */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('boards')}
            aria-expanded={Boolean(openSections.boards)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <Grid3x3 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Plateaux ({boards.length})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Visibilité Privé / Public et réutilisation dans l’éditeur
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.boards ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.boards && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {boards.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun plateau sauvegardé séparément.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {boards.map((b) => {
                    const lockedPublic = Boolean(b.id && publicVariantBoardIds.has(b.id));
                    const effectiveVis: AssetVisibility =
                      lockedPublic || b.visibility === 'public' ? 'public' : 'private';
                    return (
                      <div
                        key={b.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                            <span>{b.name || `Plateau ${b.rows}×${b.cols}`}</span>
                            {lockedPublic && (
                              <span
                                title="Utilisé dans une variante publique : reste public"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                <span>Variante publique</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {b.rows}×{b.cols} · Texture : {b.texture} · Rotation : {b.rotation || 0}°
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            value={effectiveVis}
                            disabled={lockedPublic}
                            onChange={(e) => {
                              const nextVis = e.target.value === 'public' ? 'public' : 'private';
                              if (lockedPublic && nextVis === 'private') {
                                onNotify('Ce plateau est utilisé dans une variante publique et doit rester public.');
                                return;
                              }
                              onToggleBoardVisibility(b, nextVis);
                            }}
                            aria-label="Visibilité du plateau"
                            title={
                              lockedPublic
                                ? 'Utilisé dans une variante publique : ne peut pas être privé'
                                : 'Choisir Privé ou Public'
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-2.5 py-1.5 text-xs disabled:opacity-65 min-h-[38px]"
                          >
                            <option value="private">Privé</option>
                            <option value="public">Public</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => onLoadBoardIntoCreator(b)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs min-h-[38px]"
                          >
                            Réutiliser
                          </button>
                          <button
                            type="button"
                            onClick={() => b.id && onDeleteBoard(b.id)}
                            className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[38px]"
                            aria-label="Supprimer plateau"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. Dépliant Pièces */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('pieces')}
            aria-expanded={Boolean(openSections.pieces)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Pièces ({pieces.length})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Gérer, tester et choisir la visibilité Privée / Publique
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.pieces ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.pieces && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Les pièces utilisées dans une variante publique sont automatiquement publiques.
                </span>
                <button
                  type="button"
                  onClick={onOpenPieceCreator}
                  className="text-xs font-semibold text-sky-400 hover:underline shrink-0 min-h-[34px]"
                >
                  Gérer / tester
                </button>
              </div>
              {pieces.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune pièce personnalisée.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {pieces.map((p) => {
                    const lockedPublic = publicVariantPieceIds.has(p.id);
                    const effectiveVis: AssetVisibility =
                      lockedPublic || p.visibility === 'public' ? 'public' : 'private';
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-lg p-1 border border-white/10 flex items-center justify-center shrink-0"
                            style={{ backgroundColor: p.dark || '#151c27' }}
                          >
                            <ChessPieceArtwork
                              pieceId={p.id}
                              symbol={p.symbol}
                              side="white"
                              texture={p.texture}
                              lightColor={p.light}
                              darkColor={p.dark}
                              mode="board"
                              className="w-6 h-6"
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                              <span className="truncate">{p.name}</span>
                              {lockedPublic && (
                                <Lock
                                  className="w-3 h-3 text-sky-400 shrink-0"
                                  aria-label="Utilisée dans une variante publique"
                                />
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {p.powerType !== 'none' ? `Pouvoir : ${p.powerType}` : 'Pièce combinée'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={effectiveVis}
                            disabled={lockedPublic}
                            onChange={(e) => {
                              const nextVis = e.target.value === 'public' ? 'public' : 'private';
                              if (lockedPublic && nextVis === 'private') {
                                onNotify('Utilisée dans une variante publique : cette pièce reste publique.');
                                return;
                              }
                              onTogglePieceVisibility(p, nextVis);
                            }}
                            aria-label="Visibilité de la pièce"
                            title={
                              lockedPublic
                                ? 'Utilisée dans une variante publique : reste publique'
                                : 'Visibilité Privée ou Publique'
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1 text-xs disabled:opacity-65 min-h-[34px]"
                          >
                            <option value="private">Privée</option>
                            <option value="public">Publique</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => onDeletePiece(p.id)}
                            className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15"
                            aria-label="Supprimer pièce"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. Dépliant Amis */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('friends')}
            aria-expanded={Boolean(openSections.friends)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Amis ({friends.length})</span>
                  {friendRequests.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[11px] font-bold">
                      {friendRequests.length} demande{friendRequests.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Statut connecté en temps réel, profil et invitation à rejouer
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.friends ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.friends && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
              {/* Demandes d'ami reçues */}
              {friendRequests.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Demandes d’ami reçues
                  </div>
                  <div className="space-y-2">
                    {friendRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl border border-amber-500/35 bg-amber-500/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-9 h-9 rounded-lg p-1.5 flex items-center justify-center shrink-0"
                            style={{ backgroundColor: req.fromAvatarColor || '#7ebcff' }}
                          >
                            <ChessPieceArtwork
                              symbol={req.fromAvatarSymbol || '♔'}
                              mode="emblem"
                              bgColor={req.fromAvatarColor || '#7ebcff'}
                              className="w-6 h-6"
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-100 truncate">
                              {req.fromNickname} vous demande en ami
                            </div>
                            <div className="text-xs text-slate-400 font-mono-num">
                              {req.fromEol || 400} ÉOL
                              {req.fromTitle ? ` · ${req.fromTitle}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onRespondFriendRequest?.(req, true)}
                            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs min-h-[38px]"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accepter</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRespondFriendRequest?.(req, false)}
                            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800 text-xs font-semibold min-h-[38px]"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Liste des amis */}
              {friends.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-[#0f151f] p-4 text-xs text-slate-400 leading-relaxed">
                  Aucun ami pour le moment. Ouvrez <strong className="text-slate-200">Historique</strong> après une partie en ligne et cliquez sur un adversaire pour lui envoyer une demande d’ami !
                </div>
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => {
                    const cardData = friendToBattleCard(friend, onlineStatusByUid);
                    const chosenVarId =
                      challengeVariantByFriend[friend.uid] || defaultChallengeVariant?.id || '';
                    const chosenVariant =
                      variants.find((v) => v.id === chosenVarId) || defaultChallengeVariant;

                    return (
                      <div
                        key={friend.uid}
                        className="rounded-2xl border border-slate-800 bg-[#0d131c] p-3.5 space-y-3"
                      >
                        <BattleCard card={cardData} showOnlineDot={true} size="compact" />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {onOpenFriendProfile && (
                              <button
                                type="button"
                                onClick={() => onOpenFriendProfile(friend.uid, friend)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-sky-400 text-xs font-semibold text-slate-200 min-h-[36px]"
                              >
                                <User className="w-3.5 h-3.5 text-sky-400" />
                                <span>Profil</span>
                              </button>
                            )}
                            {onRemoveFriend && (
                              <button
                                type="button"
                                onClick={() => onRemoveFriend(friend.uid)}
                                className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15"
                                title="Retirer de la liste d’amis"
                                aria-label="Retirer de la liste d’amis"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {onChallengeFriend && chosenVariant && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={chosenVariant.id}
                                onChange={(e) =>
                                  setChallengeVariantByFriend((prev) => ({
                                    ...prev,
                                    [friend.uid]: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-slate-700 bg-[#151c27] px-2.5 py-1.5 text-xs text-slate-200 max-w-[170px] min-h-[36px]"
                              >
                                {variants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => onChallengeFriend(friend, chosenVariant)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs min-h-[36px]"
                              >
                                <Swords className="w-3.5 h-3.5" />
                                <span>Proposer une partie</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 5. Dépliant Thèmes & textures enregistrés */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('themes')}
            aria-expanded={Boolean(openSections.themes)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Palette className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Thèmes enregistrés ({savedThemes.length})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Textures et palettes sauvegardées depuis les Paramètres
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.themes ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.themes && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              {savedThemes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Enregistrez vos thèmes visuels depuis les Paramètres pour les réutiliser ici.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {savedThemes.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f]"
                    >
                      <div>
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-slate-500">
                          Plateau : {t.boardTexture} · Pièces : {t.pieceTexture}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onApplySavedTheme(t)}
                          className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs min-h-[36px]"
                        >
                          Appliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSavedTheme(t.id)}
                          className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Modale Lignée & Historique des versions */}
      {lineageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <GitFork className="w-4 h-4 text-sky-400" />
                <span>Lignée & Versions — {lineageModal.variant.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setLineageModal(null)}
                className="p-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Origine et ancêtres</div>
              {lineageModal.ancestors.length === 0 ? (
                <p className="text-slate-500">
                  {lineageModal.variant.parentName
                    ? `Dérivée de : ${lineageModal.variant.parentName}`
                    : 'Variante originale (aucun ancêtre).'}
                </p>
              ) : (
                lineageModal.ancestors.map((a) => (
                  <div key={a.id} className="p-2 rounded-lg bg-slate-800/60">
                    {a.name} (par {a.creator})
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Branches dérivées</div>
              {lineageModal.branches.length === 0 ? (
                <p className="text-slate-500">Aucune branche dérivée publique.</p>
              ) : (
                lineageModal.branches.map((b) => (
                  <div key={b.id} className="p-2 rounded-lg bg-slate-800/60 flex justify-between">
                    <span>
                      {b.name} (par {b.creator})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLineageModal(null);
                        onPlayVariant(b);
                      }}
                      className="text-sky-400 hover:underline"
                    >
                      Jouer
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Historique des modifications</div>
              {(lineageModal.variant.versions || []).length === 0 ? (
                <p className="text-slate-500">Version initiale.</p>
              ) : (
                (lineageModal.variant.versions || []).map((ver) => (
                  <div key={ver.version} className="p-2 rounded-lg bg-slate-800/60 flex justify-between">
                    <span>
                      v{ver.version} · {ver.summary} ({ver.author})
                    </span>
                    <span className="text-slate-400">
                      {new Date(ver.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
