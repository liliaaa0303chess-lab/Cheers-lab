import React from 'react';
import {
  Compass,
  Hammer,
  History,
  Library,
  Play,
  Settings,
  User,
} from 'lucide-react';
import { getPlayerLevel } from '../engine/eol';
import type { Profile, Variant } from '../types/chess';
import { getStreakRank } from '../utils/streaks';

export type ScreenId =
  | 'home'
  | 'create'
  | 'pieces'
  | 'discover'
  | 'play'
  | 'history'
  | 'library'
  | 'settings';

interface HomeViewProps {
  profile: Profile;
  variantsCount: number;
  recentVariants: Variant[];
  onNavigate: (screen: ScreenId) => void;
  onPlayVariant: (variant: Variant) => void;
  onOpenChallenges?: (tab?: 'streak' | 'bots') => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  variantsCount,
  recentVariants,
  onNavigate,
  onPlayVariant,
  onOpenChallenges,
}) => {
  const { level, title } = getPlayerLevel(profile.eol, profile.gamesPlayed);
  const winRate =
    profile.gamesPlayed > 0
      ? Math.round((profile.wins / profile.gamesPlayed) * 100)
      : 0;
  const streak = Math.max(1, profile.loginStreak || 1);
  const { current: streakRank } = getStreakRank(streak);

  const sections: {
    id: ScreenId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    primary?: boolean;
  }[] = [
    {
      id: 'create',
      title: 'Créer une variante',
      subtitle: 'Plateau, pièces personnalisées, pouvoirs et règles de victoire',
      icon: <Hammer className="w-5 h-5" />,
      primary: true,
    },
    {
      id: 'discover',
      title: 'Découvrir une variante',
      subtitle: 'Variantes publiques, tirage aléatoire et matchmaking ÉOL',
      icon: <Compass className="w-5 h-5" />,
    },
    {
      id: 'play',
      title: 'Jouer avec sa variante',
      subtitle: 'Contre un humain, une IA (20 niveaux), en ligne ou analyse libre',
      icon: <Play className="w-5 h-5" />,
    },
    {
      id: 'history',
      title: 'Historique',
      subtitle: 'Parties jouées, détail des calculs ÉOL et notes attribuées',
      icon: <History className="w-5 h-5" />,
    },
    {
      id: 'library',
      title: 'Bibliothèque',
      subtitle: 'Variantes créées ou dérivées, plateaux et pièces enregistrés',
      icon: <Library className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* En-tête & résumé Profil ÉOL */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
              Atelier de création & d’adaptation aux variantes
            </p>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Bienvenue{profile.nickname ? `, ${profile.nickname}` : ' sur Chess Lab'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl line-clamp-2 sm:line-clamp-none">
              Inventez vos propres échecs en mode simple, testez vos pièces sur votre plateau réel, affrontez Stockfish ou des joueurs en ligne et progressez au classement ÉOL.
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <button
              type="button"
              data-tutorial="home-eol-profile"
              onClick={() => onNavigate('settings')}
              className="flex items-center gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1b2433] hover:border-sky-400/60 transition-colors text-left shrink-0 min-h-[44px]"
            >
              <span
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg sm:text-xl font-bold text-slate-950 shrink-0"
                style={{ backgroundColor: profile.avatarColor || '#7ebcff' }}
              >
                {profile.avatarSymbol || '♔'}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{profile.nickname || 'Créer un profil'}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {profile.eol} ÉOL · Niv. {level} ({title})
                </div>
              </div>
            </button>

            {onOpenChallenges && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChallenges('streak')}
                  title="Série de connexions quotidiennes — Promotion d’échiquier"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${streakRank.bgClass} ${streakRank.borderClass} ${streakRank.colorClass} hover:brightness-110`}
                >
                  <span className="text-sm leading-none">{streakRank.symbol}</span>
                  <span className="font-mono-num">{streak} j</span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium">
                    · {streakRank.title}
                  </span>
                </button>
                {profile.botRebellionUnlocked && (
                  <button
                    type="button"
                    onClick={() => onOpenChallenges('bots')}
                    title="La Grève des 8 Bots"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition-colors"
                  >
                    <span className="text-sm leading-none">🦄</span>
                    <span>La Grève des 8 Bots</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Métriques de profil en chiffres tabulaires */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-4 sm:mt-5 pt-3.5 sm:pt-5 border-t border-slate-200 dark:border-slate-800">
          <div data-tutorial="home-eol-metric" className="rounded-lg p-1 -m-1">
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Classement ÉOL</div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-900 dark:text-slate-50 mt-0.5">
              {profile.eol}
            </div>
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Parties jouées</div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-900 dark:text-slate-50 mt-0.5">
              {profile.gamesPlayed}
            </div>
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Taux de victoire</div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-900 dark:text-slate-50 mt-0.5">
              {winRate}%
            </div>
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Variantes locales</div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-900 dark:text-slate-50 mt-0.5">
              {variantsCount}
            </div>
          </div>
        </div>
      </section>

      {/* Les 5 sections principales + Paramètres */}
      <section className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Accès rapide
          </h2>
          <button
            type="button"
            data-tutorial="home-settings"
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-sky-400 transition-colors min-h-[40px] px-2"
          >
            <Settings className="w-4 h-4" />
            <span>Paramètres</span>
          </button>
        </div>

        <div
          data-tutorial="home-quick-grid"
          className="grid grid-cols-2 gap-2 sm:gap-3 rounded-xl"
        >
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              data-tutorial={`home-${sec.id}`}
              onClick={() => onNavigate(sec.id)}
              className={`group flex items-center sm:items-start gap-2.5 sm:gap-4 p-2.5 sm:p-4 rounded-xl border text-left transition-colors duration-150 ${
                sec.primary
                  ? 'col-span-2 border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/15 dark:bg-sky-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  sec.primary
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                {sec.icon}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[13px] sm:text-base text-slate-900 dark:text-slate-100 leading-tight">
                  {sec.title}
                </div>
                <p className="text-[11px] sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-snug truncate sm:whitespace-normal sm:line-clamp-2">
                  {sec.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Variantes prêtes à jouer */}
      {recentVariants.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Lancer rapidement une partie
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentVariants.slice(0, 3).map((v) => (
              <div
                key={v.id}
                className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]"
              >
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {v.name}
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {v.board.rows}×{v.board.cols} · {v.controlledDifficulty || v.difficulty} · {v.players} joueurs
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                    {v.description || v.goal || 'Variante personnalisée Chess Lab.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPlayVariant(v)}
                  className="mt-4 w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-white text-sm font-medium transition-colors min-h-[44px]"
                >
                  Jouer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
