import React, { useEffect, useState } from 'react';
import {
  Award,
  BookmarkPlus,
  Cloud,
  CloudOff,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Trophy,
  Volume2,
} from 'lucide-react';
import { getPlayerLevel } from '../engine/eol';
import type { User } from '../firebase';
import type {
  AppSettings,
  BoardTexture,
  PieceTexture,
  Profile,
  SavedTheme,
} from '../types/chess';
import {
  fetchLeaderboardFromFirestore,
  type LeaderboardCard,
} from '../utils/firestoreSync';
import { validateFamilyFriendlyText } from '../utils/moderation';
import { playChessSound } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  profile: Profile;
  settings: AppSettings;
  firebaseUser?: User | null;
  onConnectCloud: () => void;
  onDisconnectCloud: () => void;
  onSyncAllNow: () => Promise<void>;
  onUpdateProfile: (next: Profile) => void;
  onUpdateSettings: (next: AppSettings) => void;
  onSaveTheme: (theme: SavedTheme) => void;
  onResetAllData: () => void;
  onNotify: (msg: string) => void;
}

const AVATAR_SYMBOLS = ['♔', '♕', '♖', '♗', '♘', '★', '⚡', '✦'];

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  settings,
  firebaseUser,
  onConnectCloud,
  onDisconnectCloud,
  onSyncAllNow,
  onUpdateProfile,
  onUpdateSettings,
  onSaveTheme,
  onResetAllData,
  onNotify,
}) => {
  const [nickname, setNickname] = useState(profile.nickname);
  const [themeName, setThemeName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardCard[]>([]);

  useEffect(() => {
    fetchLeaderboardFromFirestore()
      .then(setLeaderboard)
      .catch(() => {});
  }, [firebaseUser]);

  const { level, title, nextThreshold } = getPlayerLevel(profile.eol, profile.gamesPlayed);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      onNotify('Choisissez un pseudo.');
      return;
    }
    const mod = validateFamilyFriendlyText(trimmed, { blockLinks: true, label: 'Le pseudo' });
    if (!mod.ok) {
      onNotify(mod.reason || 'Pseudo refusé (charte tout public).');
      return;
    }
    onUpdateProfile({
      ...profile,
      nickname: trimmed.slice(0, 32),
    });
    onNotify('Profil enregistré.');
  };

  const handleSaveThemePreset = () => {
    const name = themeName.trim() || `Thème ${settings.boardTexture}/${settings.pieceTexture}`;
    onSaveTheme({
      id: `thm_${crypto.randomUUID().slice(0, 8)}`,
      name,
      boardTexture: settings.boardTexture,
      pieceTexture: settings.pieceTexture,
      boardLight: settings.boardLight,
      boardDark: settings.boardDark,
      pieceLight: settings.pieceLight,
      pieceDark: settings.pieceDark,
    });
    setThemeName('');
    onNotify('Thème enregistré dans votre bibliothèque.');
  };

  const boardPreviewPalettes: Record<BoardTexture, [string, string]> = {
    plain: [settings.boardLight || '#dce5ef', settings.boardDark || '#788ba2'],
    wood: ['#ead1a7', '#8e5e36'],
    stone: ['#dcdcdc', '#747a84'],
    marble: ['#f3f1ec', '#637085'],
    metal: ['#d3dfe8', '#546574'],
    night: ['#bcc6d8', '#253048'],
  };
  const [sq1, sq2] = boardPreviewPalettes[settings.boardTexture] || boardPreviewPalettes.plain;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Profil & Paramètres
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Personnalisez votre profil, vos classements ÉOL, les sons et l’apparence des échiquiers.
        </p>
      </div>

      {/* Profil & Statistiques ÉOL */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Profil joueur (sans inscription ni e-mail)
          </h2>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold font-mono-num text-sky-400">
            <Award className="w-4 h-4" />
            {profile.eol} ÉOL
          </span>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Pseudo</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Votre pseudo"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Couleur d’avatar</span>
              <input
                type="color"
                value={profile.avatarColor || '#7ebcff'}
                onChange={(e) =>
                  onUpdateProfile({ ...profile, avatarColor: e.target.value })
                }
                className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Emblème du profil</span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onUpdateProfile({ ...profile, avatarSymbol: sym })}
                  className={`w-11 h-11 rounded-xl border text-xl flex items-center justify-center ${
                    profile.avatarSymbol === sym
                      ? 'border-sky-500 bg-sky-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
          >
            Enregistrer le profil
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500">Niveau</div>
            <div className="text-base font-bold font-mono-num">
              {level} ({title})
            </div>
          </div>
          <div>
            <div className="text-slate-500">Prochain palier</div>
            <div className="text-base font-bold font-mono-num">{nextThreshold} ÉOL</div>
          </div>
          <div>
            <div className="text-slate-500">Victoires / Nulles / Défaites</div>
            <div className="text-base font-bold font-mono-num">
              {profile.wins} / {profile.draws} / {profile.losses}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Parties jouées</div>
            <div className="text-base font-bold font-mono-num">{profile.gamesPlayed}</div>
          </div>
          <div>
            <div className="text-slate-500">Variantes découvertes</div>
            <div className="text-base font-bold font-mono-num">
              {profile.discoveredVariants?.length || 0}
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Firebase (Optionnel) & Installation App Mobile/PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {firebaseUser ? (
                <Cloud className="w-5 h-5 text-emerald-400" />
              ) : (
                <CloudOff className="w-5 h-5 text-slate-400" />
              )}
              <span>Cloud Firebase (optionnel)</span>
            </h2>
            <span
              className={`text-xs font-semibold ${
                firebaseUser ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {firebaseUser ? 'Synchronisé' : 'Local uniquement'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Restez 100 % sans compte obligatoire, ou reliez Google pour sauvegarder votre ÉOL, vos variantes et vos parties entre téléphone et ordinateur.
          </p>
          {firebaseUser ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  await onSyncAllNow();
                  setSyncing(false);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs min-h-[40px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>Synchroniser maintenant</span>
              </button>
              <button
                type="button"
                onClick={onDisconnectCloud}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs min-h-[40px]"
              >
                Déconnecter ({firebaseUser.displayName || 'Google'})
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onConnectCloud}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
            >
              <Cloud className="w-4 h-4" />
              <span>Synchroniser avec Google (Firebase)</span>
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-sky-400" />
            <span>Installer sur Android, iPhone & PC</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Chess Lab fonctionne comme une application installable (0 €) : plein écran, icône sur l’écran d’accueil et mode hors ligne contre l’IA.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PWAInstallButton />
            {typeof window !== 'undefined' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.origin);
                    onNotify('Lien de l’application copié !');
                  } catch {
                    onNotify(window.location.origin);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[44px]"
              >
                Copier le lien
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Classement ÉOL Cloud */}
      {leaderboard.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Classement ÉOL Cloud</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {leaderboard.slice(0, 8).map((entry, idx) => (
              <div
                key={entry.uid}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0f151f] text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono-num text-slate-400 w-5">#{idx + 1}</span>
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: `${entry.avatarColor}25`, color: entry.avatarColor }}
                  >
                    {entry.avatarSymbol}
                  </span>
                  <span className="font-semibold truncate">{entry.nickname}</span>
                </div>
                <span className="font-mono-num font-bold text-sky-400 shrink-0">
                  {entry.eol} ÉOL
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Apparence générale & Son */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Apparence de l’application
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Thème</span>
              <select
                value={settings.theme}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    theme: e.target.value as 'dark' | 'light',
                  })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
              >
                <option value="dark">Sombre (moderne)</option>
                <option value="light">Clair</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Couleur d’accent</span>
              <input
                type="color"
                value={settings.accent}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, accent: e.target.value })
                }
                className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Son</h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) =>
                onUpdateSettings({ ...settings, sound: e.target.checked })
              }
              className="accent-sky-500"
            />
            <span>Effets sonores activés</span>
          </label>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Volume</span>
              <span className="font-mono-num">{settings.volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.volume}
              onChange={(e) =>
                onUpdateSettings({ ...settings, volume: Number(e.target.value) })
              }
              className="w-full accent-sky-500"
            />
          </div>
          <button
            type="button"
            onClick={() => playChessSound('move', true, settings.volume)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
          >
            <Volume2 className="w-4 h-4" />
            <span>Tester le son</span>
          </button>
        </section>
      </div>

      {/* Personnalisation Échiquier, Pièces & Adversaire */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Échiquier, Pièces & Adversaire
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Texture par défaut de l’échiquier
            </span>
            <select
              value={settings.boardTexture}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  boardTexture: e.target.value as BoardTexture,
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            >
              <option value="plain">Classique</option>
              <option value="wood">Bois</option>
              <option value="stone">Pierre</option>
              <option value="marble">Marbre</option>
              <option value="metal">Métal</option>
              <option value="night">Nuit</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Texture personnelle de vos pièces
            </span>
            <select
              value={settings.pieceTexture}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  pieceTexture: e.target.value as PieceTexture,
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            >
              <option value="plain">Classique</option>
              <option value="wood">Bois</option>
              <option value="stone">Pierre</option>
              <option value="metal">Métal</option>
              <option value="marble">Marbre</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Cases claires</span>
            <input
              type="color"
              value={settings.boardLight}
              onChange={(e) =>
                onUpdateSettings({ ...settings, boardLight: e.target.value })
              }
              className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Cases foncées</span>
            <input
              type="color"
              value={settings.boardDark}
              onChange={(e) =>
                onUpdateSettings({ ...settings, boardDark: e.target.value })
              }
              className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showOpponentTheme}
            onChange={(e) =>
              onUpdateSettings({ ...settings, showOpponentTheme: e.target.checked })
            }
            className="accent-sky-500"
          />
          <span>
            Afficher le thème d’échiquier de l’adversaire en ligne (sinon votre thème personnel est conservé)
          </span>
        </label>

        {/* Aperçu + Sauvegarde de thème */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 items-center">
          <div className="grid grid-cols-4 w-36 aspect-square rounded-lg overflow-hidden border-2 border-slate-600">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const isDark = (Math.floor(i / 4) + (i % 4)) % 2 === 1;
              return (
                <div
                  key={i}
                  style={{ backgroundColor: isDark ? sq2 : sq1 }}
                  className="flex items-center justify-center text-lg"
                >
                  {i === 0 ? (
                    <span className={`piece-glyph piece-side-white piece-tex-${settings.pieceTexture}`}>
                      ♚
                    </span>
                  ) : i === 7 ? (
                    <span className={`piece-glyph piece-side-black piece-tex-${settings.pieceTexture}`}>
                      ♚
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              placeholder="Nom du thème à sauvegarder"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSaveThemePreset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-400 text-xs font-semibold min-h-[40px]"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>Sauver ce thème en bibliothèque</span>
            </button>
          </div>
        </div>
      </section>

      {/* Charte Tout Public & Sécurité */}
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            <span>Espace Tout Public (tous âges)</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('chesslab_hidden_reports_v1');
              } catch {
                // ignore
              }
              onNotify('Liste des contenus masqués réinitialisée.');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Réafficher les contenus masqués
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Chess Lab est conçu pour tous les âges : 100 % sans publicité, sans messagerie privée ouverte entre joueurs, avec modération automatique des pseudos, variantes publiques et commentaires (blocage des insultes et liens externes) ainsi qu’un bouton « Signaler / Masquer » dans Découvrir.
        </p>
      </section>

      {/* Réinitialisation */}
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-rose-400">Zone de réinitialisation</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Efface uniquement les données locales de cet appareil.
            </p>
          </div>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-500/40 text-rose-400 text-sm min-h-[44px]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Effacer les données locales</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  onResetAllData();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold min-h-[44px]"
              >
                Confirmer l’effacement
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 rounded-xl border border-slate-600 text-sm min-h-[44px]"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
