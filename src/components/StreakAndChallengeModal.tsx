import React from 'react';
import { createPortal } from 'react-dom';
import { Award, Check, Crown, Sparkles, Trophy, X } from 'lucide-react';
import type { Profile } from '../types/chess';
import {
  CHALLENGE_BOT_LEVELS,
  CHALLENGE_VARIANTS,
  getBotChallengeProgress,
} from '../utils/botChallenge';
import { getStreakRank } from '../utils/streaks';

interface StreakAndChallengeModalProps {
  open: boolean;
  initialTab?: 'streak' | 'bots';
  profile: Profile;
  onClose: () => void;
  onOpenRebellionScene?: () => void;
}

export const StreakAndChallengeModal: React.FC<StreakAndChallengeModalProps> = ({
  open,
  initialTab = 'streak',
  profile,
  onClose,
  onOpenRebellionScene,
}) => {
  const botsUnlocked = Boolean(profile.botRebellionUnlocked);
  const [tab, setTab] = React.useState<'streak' | 'bots'>(
    botsUnlocked && initialTab === 'bots' ? 'bots' : 'streak'
  );

  React.useEffect(() => {
    if (open) {
      setTab(botsUnlocked && initialTab === 'bots' ? 'bots' : 'streak');
    }
  }, [open, initialTab, botsUnlocked]);

  if (!open || typeof document === 'undefined') return null;

  const streak = Math.max(1, profile.loginStreak || 1);
  const bestStreak = Math.max(streak, profile.bestLoginStreak || 1);
  const { current: rank } = getStreakRank(streak);
  const botProg = getBotChallengeProgress(profile);
  const effectiveTab = botsUnlocked ? tab : 'streak';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{botsUnlocked ? 'Série quotidienne & Secrets' : 'Série quotidienne'}</span>
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

        {botsUnlocked && (
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0f151f]">
            <button
              type="button"
              onClick={() => setTab('streak')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                effectiveTab === 'streak'
                  ? 'bg-white dark:bg-[#1a2333] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'
              }`}
            >
              {rank.symbol} Série ({streak} j)
            </button>
            <button
              type="button"
              onClick={() => setTab('bots')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                effectiveTab === 'bots'
                  ? 'bg-white dark:bg-[#1a2333] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'
              }`}
            >
              🦄 La Grève des 8 Bots
            </button>
          </div>
        )}

        {effectiveTab === 'streak' ? (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${rank.bgClass} ${rank.borderClass}`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-14 h-14 rounded-xl bg-slate-950/50 border border-white/10 flex items-center justify-center text-3xl shrink-0">
                  {rank.symbol}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className={`text-lg font-bold font-mono-num ${rank.colorClass}`}>
                    {streak} {streak > 1 ? 'jours d’affilée' : 'jour d’affilée'}
                  </div>
                  <div className="text-sm text-slate-900 dark:text-slate-100 font-semibold">
                    Transformation actuelle : {rank.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {rank.subtitle} · Record personnel : {bestStreak} j
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Award className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Récompense de transformation ({rank.symbol} {rank.title})</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Emblème actif sur votre profil :{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {rank.symbol} {rank.title}
                </span>
                . Revenez chaque jour sur Chess Lab pour faire évoluer votre pièce et découvrir la suite par vous-même.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3">
              <div className="text-xs text-amber-200">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Secret débloqué : La Grève des 8 Bots</span>
                </div>
                <div className="text-[11px] text-amber-100/80 mt-0.5">
                  Poney Cosmique (🦄) + variante spéciale débloqués dans votre bibliothèque.
                </div>
              </div>
              {onOpenRebellionScene && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRebellionScene();
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shrink-0"
                >
                  Revoir la scène
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Tableau de chasse (32/32)</span>
                </span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {botProg.completed} / {botProg.total}
                </span>
              </div>
              {CHALLENGE_VARIANTS.map((cv) => {
                const beaten = botProg.map[cv.id] || [];
                return (
                  <div
                    key={cv.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {cv.fullName}
                      </span>
                      <span className="font-mono-num text-emerald-400 font-semibold">
                        {beaten.length}/8
                      </span>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {CHALLENGE_BOT_LEVELS.map((lvl) => (
                        <div
                          key={lvl}
                          className="h-7 rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[11px] font-mono-num font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
