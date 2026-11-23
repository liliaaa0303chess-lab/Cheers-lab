import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BattleCardData, BattleCardStyle, Profile } from '../types/chess';
import { BATTLE_CARD_STYLES, resolveEquippedTitle } from '../utils/goldRewards';
import { getStreakRank } from '../utils/streaks';
import { ChessPieceArtwork } from './ChessPieceArtwork';

export function getBattleCardFromProfile(
  profile: Profile,
  isOnline = true
): BattleCardData {
  const { current: rank } = getStreakRank(Math.max(1, profile.loginStreak || 1));
  return {
    uid: profile.id,
    nickname: profile.nickname.trim() || 'Joueur',
    avatarColor: profile.avatarColor || '#7ebcff',
    avatarSymbol: profile.avatarSymbol || '♔',
    eol: Math.round(profile.eol || 400),
    title: resolveEquippedTitle(profile),
    streakPieceSymbol: profile.equippedStreakPiece || rank.symbol || '♙',
    streakPieceLabel: rank.title,
    battleCardStyle: profile.battleCardStyle || 'classic',
    isOnline,
  };
}

function resolveCardTheme(style?: BattleCardStyle) {
  return (
    BATTLE_CARD_STYLES.find((s) => s.id === style) || BATTLE_CARD_STYLES[0]
  );
}

interface BattleCardProps {
  card: BattleCardData;
  showOnlineDot?: boolean;
  size?: 'compact' | 'normal' | 'large';
  className?: string;
}

export const BattleCard: React.FC<BattleCardProps> = ({
  card,
  showOnlineDot = false,
  size = 'normal',
  className = '',
}) => {
  const theme = resolveCardTheme(card.battleCardStyle);
  const avatarDim =
    size === 'large' ? 'w-16 h-16 text-3xl' : size === 'compact' ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-2xl';
  const pieceDim =
    size === 'large' ? 'w-12 h-12 text-2xl' : size === 'compact' ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl';

  return (
    <div
      className={`relative rounded-2xl border ${theme.bgClass} ${theme.borderClass} ${
        size === 'large' ? 'p-5' : size === 'compact' ? 'p-3' : 'p-4'
      } shadow-lg overflow-hidden ${className}`}
    >
      {showOnlineDot && (
        <span
          title={card.isOnline ? 'En ligne' : 'Hors ligne'}
          aria-label={card.isOnline ? 'Joueur en ligne' : 'Joueur hors ligne'}
          className={`absolute top-2.5 left-2.5 w-3 h-3 rounded-full border-2 border-[#0e141d] ${
            card.isOnline
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
              : 'bg-slate-600'
          }`}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className={`flex items-center gap-3 min-w-0 ${showOnlineDot ? 'pl-3' : ''}`}>
          <div
            className={`${avatarDim} rounded-xl border border-white/15 flex items-center justify-center p-1.5 shrink-0 shadow-md`}
            style={{ backgroundColor: card.avatarColor || '#7ebcff' }}
          >
            <ChessPieceArtwork
              symbol={card.avatarSymbol || '♔'}
              mode="emblem"
              bgColor={card.avatarColor || '#7ebcff'}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`font-bold text-slate-100 truncate ${
                  size === 'large' ? 'text-xl' : size === 'compact' ? 'text-sm' : 'text-base'
                }`}
              >
                {card.nickname}
              </span>
              <span
                className={`font-mono-num font-bold ${theme.accentClass} ${
                  size === 'large' ? 'text-base' : 'text-xs'
                }`}
              >
                {Math.round(card.eol || 400)} ÉOL
              </span>
            </div>

            {card.title ? (
              <div
                className={`font-semibold text-amber-300/95 truncate mt-0.5 ${
                  size === 'large' ? 'text-xs' : 'text-[11px]'
                }`}
              >
                ✦ {card.title}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 mt-0.5">
                {card.isOnline ? 'En ligne' : 'Combattant Chess Lab'}
              </div>
            )}
          </div>
        </div>

        <div
          title={
            card.streakPieceLabel
              ? `Pièce de série : ${card.streakPieceLabel}`
              : 'Pièce de série'
          }
          className={`${pieceDim} rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-center p-1.5 shrink-0 shadow-inner`}
        >
          <ChessPieceArtwork
            symbol={card.streakPieceSymbol || '♙'}
            side="gold"
            mode="board"
          />
        </div>
      </div>
    </div>
  );
};

interface BattleIntroOverlayProps {
  open: boolean;
  player: BattleCardData;
  opponent: BattleCardData;
  variantName: string;
  onFinish: () => void;
}

export const BattleIntroOverlay: React.FC<BattleIntroOverlayProps> = ({
  open,
  player,
  opponent,
  variantName,
  onFinish,
}) => {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onFinish, 2400);
    return () => window.clearTimeout(timer);
  }, [open, onFinish]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onFinish}
      className="fixed inset-0 z-50 bg-[#070b11]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8 cursor-pointer select-none animate-fade-in"
    >
      <div className="w-full max-w-xl flex flex-col items-stretch gap-5">
        <div className="text-center text-xs uppercase tracking-[0.22em] text-sky-400 font-semibold">
          {variantName}
        </div>

        {/* Adversaire en haut */}
        <BattleCard card={opponent} showOnlineDot={Boolean(opponent.uid && !opponent.uid.startsWith('ai_'))} size="large" />

        {/* VS Central */}
        <div className="flex items-center justify-center gap-4 py-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-400/50 to-amber-400" />
          <div className="px-5 py-2 rounded-2xl border border-amber-400/60 bg-amber-500/15 text-amber-300 font-black text-2xl sm:text-3xl tracking-widest shadow-[0_0_24px_rgba(245,158,11,0.35)]">
            VS
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-400/50 to-amber-400" />
        </div>

        {/* Joueur en bas */}
        <BattleCard card={player} showOnlineDot={false} size="large" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFinish();
          }}
          className="self-center mt-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors"
        >
          Appuyez pour lancer la partie
        </button>
      </div>
    </div>,
    document.body
  );
};
