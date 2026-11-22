import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  BookmarkPlus,
  BookOpen,
  ChevronDown,
  Cloud,
  CloudOff,
  Info,
  Palette,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Trophy,
  User as UserIcon,
  Volume2,
  X,
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
import {
  getPublicAppUrl,
  getStoredPublicAppUrlOverride,
  setStoredPublicAppUrlOverride,
} from '../utils/appUrl';
import { validateFamilyFriendlyText } from '../utils/moderation';
import { safeUuid } from '../utils/safeId';
import { playChessSound } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  profile: Profile;
  settings: AppSettings;
  firebaseUser?: User | null;
  cloudConnecting?: boolean;
  cloudAuthError?: string | null;
  onConnectCloud: () => void;
  onDisconnectCloud: () => void;
  onSyncAllNow: () => Promise<void>;
  onUpdateProfile: (next: Profile) => void;
  onUpdateSettings: (next: AppSettings) => void;
  onSaveTheme: (theme: SavedTheme) => void;
  onResetAllData: () => void;
  onOpenTutorial: () => void;
  onNotify: (msg: string) => void;
}

const AVATAR_SYMBOLS = ['♔', '♕', '♖', '♗', '♘', '★', '⚡', '✦'];

const BOARD_TEXTURE_LABELS: Record<BoardTexture, string> = {
  plain: 'Classique',
  wood: 'Bois',
  stone: 'Pierre',
  marble: 'Marbre',
  metal: 'Métal',
  night: 'Nuit',
};

const PIECE_TEXTURE_LABELS: Record<PieceTexture, string> = {
  plain: 'Classique',
  wood: 'Bois',
  stone: 'Pierre',
  metal: 'Métal',
  marble: 'Marbre',
};

type SettingsSectionId =
  | 'theme'
  | 'profile'
  | 'sound'
  | 'leaderboard'
  | 'tutorial'
  | 'safety'
  | 'reset';

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  settings,
  firebaseUser,
  cloudConnecting = false,
  cloudAuthError = null,
  onConnectCloud,
  onDisconnectCloud,
  onSyncAllNow,
  onUpdateProfile,
  onUpdateSettings,
  onSaveTheme,
  onResetAllData,
  onOpenTutorial,
  onNotify,
}) => {
  const [nickname, setNickname] = useState(profile.nickname);
  const [themeName, setThemeName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardCard[]>([]);
  const [infoModal, setInfoModal] = useState<'firebase' | 'install' | null>(null);
  const [openSections, setOpenSections] = useState<Partial<Record<SettingsSectionId, boolean>>>({});
  const [shareUrlInput, setShareUrlInput] = useState<string>(() => getPublicAppUrl());
  const [editingShareUrl, setEditingShareUrl] = useState(false);

  const loadLeaderboard = useCallback(() => {
    fetchLeaderboardFromFirestore()
      .then(setLeaderboard)
      .catch(() => {});
  }, []);

  const toggleSection = (id: SettingsSectionId) => {
    setOpenSections((prev) => {
      const nextOpen = !prev[id];
      if (id === 'leaderboard' && nextOpen) {
        loadLeaderboard();
      }
      return { ...prev, [id]: nextOpen };
    });
  };

  useEffect(() => {
    loadLeaderboard();
  }, [firebaseUser, loadLeaderboard]);

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
      id: `thm_${safeUuid().slice(0, 8)}`,
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
    <div className="space-y-4">
      <div className="pb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Profil & Paramètres
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Touchez une rubrique pour la déplier et personnaliser votre expérience.
        </p>
      </div>

      {/* Cloud Firebase (Optionnel) & Installation App Mobile/PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
          <button
            type="button"
            onClick={() => setInfoModal('firebase')}
            aria-label="À quoi sert la synchronisation Firebase ?"
            title="À quoi sert Firebase ?"
            className="absolute top-3.5 right-3.5 p-1 rounded-full text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 inline-flex items-center justify-center transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>

          <div className="pr-7 space-y-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {firebaseUser ? (
                <Cloud className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <CloudOff className="w-5 h-5 text-slate-400 shrink-0" />
              )}
              <span>Cloud Firebase (optionnel)</span>
            </h2>
            <span
              className={`inline-block text-xs font-semibold ${
                firebaseUser ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {firebaseUser ? 'Synchronisé' : 'Local uniquement'}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Restez 100 % sans compte obligatoire, ou reliez Google pour sauvegarder votre ÉOL, vos variantes et vos parties entre téléphone et ordinateur.
          </p>
          <p className="text-xs text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-xl px-3 py-2 leading-relaxed">
            {firebaseUser
              ? 'Vos variantes publiques sont enregistrées dans le Cloud : tout le monde peut en profiter durablement dans « Découvrir ».'
              : 'Tout le monde pourra profiter durablement de vos variantes publiques dans « Découvrir » si vous synchronisez avec Firebase.'}
          </p>
          {firebaseUser ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  await onSyncAllNow();
                  loadLeaderboard();
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
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={cloudConnecting}
                onClick={onConnectCloud}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-sm min-h-[44px]"
              >
                <Cloud className={`w-4 h-4 ${cloudConnecting ? 'animate-pulse' : ''}`} />
                <span>
                  {cloudConnecting ? 'Connexion Google en cours…' : 'Synchroniser avec Google (Firebase)'}
                </span>
              </button>
              {cloudAuthError && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed space-y-1.5">
                  <p>{cloudAuthError}</p>
                  {typeof window !== 'undefined' && window.self !== window.top && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block font-semibold text-sky-300 underline"
                    >
                      Ouvrir Chess Lab dans un onglet dédié pour autoriser Google
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
          <button
            type="button"
            onClick={() => setInfoModal('install')}
            aria-label="À quoi sert d’installer l’application ?"
            title="À quoi sert l’installation ?"
            className="absolute top-3.5 right-3.5 p-1 rounded-full text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 inline-flex items-center justify-center transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>

          <h2 className="pr-7 text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-sky-400 shrink-0" />
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
                  const url = getPublicAppUrl();
                  try {
                    await navigator.clipboard.writeText(url);
                    onNotify(`Lien de partage copié : ${url}`);
                  } catch {
                    onNotify(url);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[44px]"
              >
                Copier le lien
              </button>
            )}
          </div>
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate font-mono-num">
                Lien partagé : {shareUrlInput}
              </span>
              <button
                type="button"
                onClick={() => setEditingShareUrl((v) => !v)}
                className="text-sky-400 hover:underline font-medium shrink-0"
              >
                {editingShareUrl ? 'Fermer' : 'Modifier'}
              </button>
            </div>
            {editingShareUrl && (
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={shareUrlInput}
                  onChange={(e) => setShareUrlInput(e.target.value)}
                  placeholder="https://chess-lab.onrender.com"
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-2.5 py-1.5 text-xs font-mono-num"
                />
                <button
                  type="button"
                  onClick={() => {
                    const saved = setStoredPublicAppUrlOverride(shareUrlInput);
                    const nextUrl = saved || getPublicAppUrl();
                    setShareUrlInput(nextUrl);
                    setEditingShareUrl(false);
                    onNotify(`Lien de partage mis à jour : ${nextUrl}`);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shrink-0"
                >
                  OK
                </button>
                {getStoredPublicAppUrlOverride() && (
                  <button
                    type="button"
                    onClick={() => {
                      setStoredPublicAppUrlOverride('');
                      setShareUrlInput(getPublicAppUrl());
                      setEditingShareUrl(false);
                      onNotify('Lien par défaut rétabli.');
                    }}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs shrink-0"
                  >
                    Défaut
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Accordéons (dépliants) de paramètres */}
      <div className="space-y-3">
        {/* Dépliant Thème (Apparence + Couleurs & Textures échiquier/pièces) */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('theme')}
            aria-expanded={Boolean(openSections.theme)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Palette className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Thème
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                  <span>
                    {settings.theme === 'dark' ? 'Sombre' : 'Clair'} · Plateau{' '}
                    {BOARD_TEXTURE_LABELS[settings.boardTexture]} · Pièces{' '}
                    {PIECE_TEXTURE_LABELS[settings.pieceTexture]}
                  </span>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-slate-500/40"
                      style={{ backgroundColor: sq1 }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-slate-500/40"
                      style={{ backgroundColor: sq2 }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-slate-500/40"
                      style={{ backgroundColor: settings.accent }}
                    />
                  </span>
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.theme ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.theme && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
              {/* Apparence générale */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Interface de l’application
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Mode d’affichage</span>
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
              </div>

              {/* Échiquier, Pièces & Adversaire */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Échiquier, Pièces & Couleurs
                </div>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 items-center">
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
              </div>
            </div>
          )}
        </section>

        {/* Dépliant Profil & Statistiques ÉOL */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('profile')}
            aria-expanded={Boolean(openSections.profile)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Profil joueur & Statistiques ÉOL
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                  <span>{profile.nickname || 'Joueur'}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono-num text-sky-400 font-semibold">
                    <Award className="w-3.5 h-3.5" />
                    {profile.eol} ÉOL
                  </span>
                  <span>· Niv. {level}</span>
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.profile ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.profile && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="sm:col-span-2 block space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Pseudo (sans inscription ni e-mail)
                    </span>
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
            </div>
          )}
        </section>

        {/* Dépliant Son */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('sound')}
            aria-expanded={Boolean(openSections.sound)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Son
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {settings.sound ? `Effets activés (${settings.volume}%)` : 'Effets sonores coupés'}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.sound ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.sound && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
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
            </div>
          )}
        </section>

        {/* Dépliant Classement ÉOL Cloud */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('leaderboard')}
            aria-expanded={Boolean(openSections.leaderboard)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Classement ÉOL Cloud
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {leaderboard.length > 0
                    ? `Top complet · ${leaderboard.length} joueur${leaderboard.length > 1 ? 's' : ''} Firebase`
                    : 'Voir tous les joueurs synchronisés avec Firebase'}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                openSections.leaderboard ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {openSections.leaderboard && (
            <div className="px-5 pb-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Tous les joueurs synchronisés avec Firebase ({leaderboard.length})</span>
                <button
                  type="button"
                  onClick={loadLeaderboard}
                  className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Actualiser</span>
                </button>
              </div>
              {leaderboard.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  Aucun joueur synchronisé pour le moment. Connecte Firebase pour apparaître en tête du classement !
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                  {leaderboard.map((entry, idx) => {
                    const isSelf = Boolean(firebaseUser && firebaseUser.uid === entry.uid);
                    const rankClass =
                      idx === 0
                        ? 'text-amber-400 font-bold'
                        : idx === 1
                          ? 'text-slate-300 font-bold'
                          : idx === 2
                            ? 'text-orange-400 font-bold'
                            : 'text-slate-400';
                    return (
                      <div
                        key={entry.uid}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${
                          isSelf
                            ? 'border-sky-500/45 bg-sky-500/10'
                            : 'border-transparent bg-slate-50 dark:bg-[#0f151f]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-mono-num w-7 shrink-0 ${rankClass}`}>#{idx + 1}</span>
                          <span
                            className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0"
                            style={{ backgroundColor: `${entry.avatarColor}25`, color: entry.avatarColor }}
                          >
                            {entry.avatarSymbol}
                          </span>
                          <span className="font-semibold truncate">
                            {entry.nickname}
                            {isSelf ? ' (Vous)' : ''}
                          </span>
                        </div>
                        <span className="font-mono-num font-bold text-sky-400 shrink-0 pl-2">
                          {entry.eol} ÉOL
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Dépliant Tutoriel */}
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('tutorial')}
            aria-expanded={Boolean(openSections.tutorial)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-sky-500/10 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-sky-400">Tutoriel</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  Guide rapide du Cavalier
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-sky-400 shrink-0 transition-transform duration-200 ${
                openSections.tutorial ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openSections.tutorial && (
            <div className="px-5 pb-5 pt-4 border-t border-sky-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Revoir les explications rapides du Cavalier guide pour utiliser toutes les fonctions de Chess Lab.
              </p>
              <button
                type="button"
                onClick={onOpenTutorial}
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px] shrink-0"
              >
                Lancer le tutoriel
              </button>
            </div>
          )}
        </section>

        {/* Dépliant Charte Tout Public & Sécurité */}
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('safety')}
            aria-expanded={Boolean(openSections.safety)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-emerald-500/10 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-emerald-400">
                  Espace Tout Public (tous âges)
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  Sans publicité · Modération automatique
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-emerald-400 shrink-0 transition-transform duration-200 ${
                openSections.safety ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openSections.safety && (
            <div className="px-5 pb-5 pt-4 border-t border-emerald-500/20 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Chess Lab est conçu pour tous les âges : 100 % sans publicité, sans messagerie privée ouverte entre joueurs, avec modération automatique des pseudos, variantes publiques et commentaires (blocage des insultes et liens externes) ainsi qu’un bouton « Signaler / Masquer » dans Découvrir.
              </p>
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
          )}
        </section>

        {/* Dépliant Réinitialisation */}
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('reset')}
            aria-expanded={Boolean(openSections.reset)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-rose-500/10 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-rose-400" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-rose-400">
                  Zone de réinitialisation
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Effacer les données locales de cet appareil
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-rose-400 shrink-0 transition-transform duration-200 ${
                openSections.reset ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openSections.reset && (
            <div className="px-5 pb-5 pt-4 border-t border-rose-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Efface uniquement les données locales de cet appareil (vos variantes Cloud restent en sécurité si vous êtes connecté).
              </p>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-500/40 text-rose-400 text-sm min-h-[44px] shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Effacer les données locales</span>
                </button>
              ) : (
                <div className="flex gap-2 shrink-0">
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
          )}
        </section>
      </div>

      {infoModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setInfoModal(null)}
          >
            <div
              className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-sky-400 shrink-0" />
                <span>
                  {infoModal === 'firebase'
                    ? 'À quoi sert la synchronisation Firebase ?'
                    : 'À quoi sert d’installer Chess Lab ?'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                aria-label="Fermer"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {infoModal === 'firebase' ? (
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <ul className="space-y-2.5">
                  <li className="flex gap-2">
                    <span className="font-bold text-sky-400 shrink-0">1.</span>
                    <span>
                      <strong>Sauvegarder tes créations et ton ÉOL :</strong> retrouve ton pseudo, tes statistiques et tes variantes si tu changes d’appareil, joues sur téléphone + PC ou vides ton navigateur.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-sky-400 shrink-0">2.</span>
                    <span>
                      <strong>Partager durablement tes variantes publiques :</strong> elles restent disponibles pour tout le monde dans « Découvrir », même si le serveur redémarre.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-sky-400 shrink-0">3.</span>
                    <span>
                      <strong>Apparaître dans le classement ÉOL Cloud :</strong> affiche ton classement parmi les joueurs synchronisés.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-sky-400 shrink-0">4.</span>
                    <span>
                      <strong>Enregistrer tes notes et commentaires :</strong> garde une trace permanente de tes étoiles et avis sur les variantes publiques.
                    </span>
                  </li>
                </ul>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                  100 % optionnel : sans Firebase, tu peux quand même jouer en ligne contre de vrais joueurs et découvrir les variantes publiques.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <li className="flex gap-2">
                  <span className="font-bold text-sky-400 shrink-0">•</span>
                  <span>
                    <strong>Icône directe sur l’écran d’accueil</strong> (Android, iPhone ou PC), comme une vraie application gratuite.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-sky-400 shrink-0">•</span>
                  <span>
                    <strong>Affichage en plein écran</strong> sans la barre d’adresse du navigateur, plus confortable pour jouer.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-sky-400 shrink-0">•</span>
                  <span>
                    <strong>Mode hors ligne :</strong> joue contre l’IA et modifie tes variantes locales même sans connexion internet.
                  </span>
                </li>
              </ul>
            )}

            <button
              type="button"
              onClick={() => setInfoModal(null)}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[42px]"
            >
              Compris
            </button>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
};
