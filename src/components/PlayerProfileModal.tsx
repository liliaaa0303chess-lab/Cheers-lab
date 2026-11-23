import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  Check,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  Grid3x3,
  Layers,
  Swords,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { PublicPlayerProfile, Variant } from '../types/chess';
import { BattleCard } from './BattleCard';
import { ChessPieceArtwork } from './ChessPieceArtwork';

interface PlayerProfileModalProps {
  open: boolean;
  player: PublicPlayerProfile | null;
  loading?: boolean;
  isFriend: boolean;
  requestSent?: boolean;
  isSelf?: boolean;
  playableVariants: Variant[];
  onClose: () => void;
  onSendFriendRequest?: (player: PublicPlayerProfile) => void;
  onChallengeFriend?: (player: PublicPlayerProfile, variant: Variant) => void;
  onPlayVariant?: (variant: Variant) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  open,
  player,
  loading = false,
  isFriend,
  requestSent = false,
  isSelf = false,
  playableVariants,
  onClose,
  onSendFriendRequest,
  onChallengeFriend,
  onPlayVariant,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [assetTab, setAssetTab] = useState<'variants' | 'pieces' | 'boards'>('variants');

  if (!open || typeof document === 'undefined') return null;

  const chosenVariant =
    playableVariants.find((v) => v.id === selectedVariantId) || playableVariants[0];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131a24] p-4 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <span>Profil du joueur</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Chargement du profil…
          </div>
        ) : !player ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Ce joueur n’a pas encore synchronisé son profil public sur le cloud.
          </div>
        ) : (
          <>
            <BattleCard card={player} showOnlineDot={true} size="normal" />

            {/* Actions */}
            {!isSelf && (
              <div className="flex flex-wrap items-center gap-2.5">
                {!isFriend && onSendFriendRequest && (
                  <button
                    type="button"
                    disabled={requestSent}
                    onClick={() => onSendFriendRequest(player)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      requestSent
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 cursor-default'
                        : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                    }`}
                  >
                    {requestSent ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Demande d’ami envoyée</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Demande d’ami</span>
                      </>
                    )}
                  </button>
                )}

                {isFriend && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
                    <UserCheck className="w-4 h-4" />
                    <span>Dans vos amis</span>
                  </div>
                )}

                {isFriend && onChallengeFriend && chosenVariant && (
                  <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                    <select
                      value={chosenVariant.id}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="rounded-xl border border-slate-700 bg-[#0d131c] px-2.5 py-2 text-xs text-slate-200 max-w-[180px]"
                    >
                      {playableVariants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onChallengeFriend(player, chosenVariant)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold"
                    >
                      <Swords className="w-4 h-4" />
                      <span>Proposer une partie</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Stats détaillées */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-800 bg-[#0d131c] p-3">
                <div className="text-[11px] text-slate-400">Parties / Victoires</div>
                <div className="text-sm font-bold text-slate-100 font-mono-num mt-0.5">
                  {player.gamesPlayed} · {player.wins}V
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131c] p-3">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-sky-400" />
                  <span>Série actuelle</span>
                </div>
                <div className="text-sm font-bold text-sky-300 font-mono-num mt-0.5">
                  {player.loginStreak} j
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131c] p-3">
                <div className="text-[11px] text-slate-400">Série max</div>
                <div className="text-sm font-bold text-emerald-300 font-mono-num mt-0.5">
                  {player.bestLoginStreak} j
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131c] p-3">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pièces d’or</span>
                </div>
                <div className="text-sm font-bold text-amber-300 font-mono-num mt-0.5">
                  {player.goldCoins}
                </div>
              </div>
            </div>

            {/* Titres débloqués */}
            <div className="rounded-xl border border-slate-800 bg-[#0d131c] p-3.5 space-y-2">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Titres débloqués</span>
              </div>
              {player.unlockedTitles.length === 0 ? (
                <div className="text-xs text-slate-500">Aucun titre débloqué pour l’instant.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {player.unlockedTitles.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2.5 py-1 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-200 font-medium"
                    >
                      ✦ {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Créations publiques */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0d131c] border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAssetTab('variants')}
                  className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    assetTab === 'variants'
                      ? 'bg-[#1a2333] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Variantes ({player.publicVariants.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssetTab('pieces')}
                  className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    assetTab === 'pieces'
                      ? 'bg-[#1a2333] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Pièces ({player.publicPieces.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssetTab('boards')}
                  className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    assetTab === 'boards'
                      ? 'bg-[#1a2333] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Grid3x3 className="w-3.5 h-3.5" />
                  <span>Plateaux ({player.publicBoards.length})</span>
                </button>
              </div>

              {assetTab === 'variants' && (
                <div className="space-y-2">
                  {player.publicVariants.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">
                      Aucune variante publique publiée.
                    </div>
                  ) : (
                    player.publicVariants.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-xl border border-slate-800 bg-[#0d131c] p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-100 truncate">
                            {v.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {v.board.rows}×{v.board.cols} · {v.difficulty} · {v.players} joueurs
                          </div>
                        </div>
                        {onPlayVariant && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onPlayVariant(v);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                            <span>Jouer</span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {assetTab === 'pieces' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {player.publicPieces.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center col-span-2">
                      Aucune pièce publique partagée.
                    </div>
                  ) : (
                    player.publicPieces.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-slate-800 bg-[#0d131c] p-3 flex items-center gap-3"
                      >
                        <div
                          className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center p-1.5 shrink-0"
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
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-100 truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {p.description || 'Pièce personnalisée publique'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {assetTab === 'boards' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {player.publicBoards.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center col-span-2">
                      Aucun plateau public partagé.
                    </div>
                  ) : (
                    player.publicBoards.map((b, idx) => (
                      <div
                        key={b.id || idx}
                        className="rounded-xl border border-slate-800 bg-[#0d131c] p-3 flex items-center gap-3"
                      >
                        <div
                          className="w-10 h-10 rounded-lg border border-white/10 grid grid-cols-2 grid-rows-2 overflow-hidden shrink-0"
                        >
                          <div style={{ backgroundColor: b.light }} />
                          <div style={{ backgroundColor: b.dark }} />
                          <div style={{ backgroundColor: b.dark }} />
                          <div style={{ backgroundColor: b.light }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-100 truncate">
                            {b.name || 'Plateau public'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {b.rows}×{b.cols} · Texture {b.texture}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
