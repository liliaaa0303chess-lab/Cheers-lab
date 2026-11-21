import React, { useEffect, useState } from 'react';
import {
  Compass,
  Download,
  Hammer,
  History,
  Home,
  Library,
  Play,
  Settings,
  X,
} from 'lucide-react';
import { GamePlay } from './components/GamePlay';
import { DiscoverView } from './components/DiscoverView';
import { HistoryView } from './components/HistoryView';
import { HomeView, type ScreenId } from './components/HomeView';
import { LibraryView } from './components/LibraryView';
import { PieceCreator } from './components/PieceCreator';
import { SettingsView } from './components/SettingsView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  createEmptyDraftVariant,
  VariantCreator,
} from './components/VariantCreator';
import {
  auth,
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from './firebase';
import type {
  AppSettings,
  AppState,
  BoardConfig,
  GameMode,
  GameRecord,
  PieceDef,
  Profile,
  SavedTheme,
  Variant,
} from './types/chess';
import {
  deleteVariantFromFirestore,
  fetchVariantByIdFromFirestore,
  incrementVariantGamesInFirestore,
  loadUserProfileFromFirestore,
  publishVariantToFirestore,
  rateVariantInFirestore,
  recordGameInFirestore,
  syncUserProfileToFirestore,
} from './utils/firestoreSync';
import {
  createBlankState,
  fetchVariantById,
  loadLocalState,
  publishVariantToServer,
  rateVariantOnServer,
  recordGameOnServer,
  saveLocalState,
  syncProfileToServer,
} from './utils/storage';
import {
  generateGuestNickname,
  validateFamilyFriendlyText,
} from './utils/moderation';

const AVATAR_SYMBOLS = ['♔', '♕', '♖', '♗', '♘', '★', '⚡', '✦'];

export default function App() {
  const [state, setState] = useState<AppState>(() => loadLocalState());
  const [screen, setScreen] = useState<ScreenId>('home');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const {
    isInstallable: pwaInstallable,
    isInstalled: pwaInstalled,
    isInIframe: pwaInIframe,
    install: triggerPwaInstall,
  } = usePWAInstall();

  // Onboarding first-run pseudo
  const [onboardingNick, setOnboardingNick] = useState('');
  const [onboardingSymbol, setOnboardingSymbol] = useState('♔');
  const [onboardingColor, setOnboardingColor] = useState('#7ebcff');

  // Active editing/playing state
  const [variantDraft, setVariantDraft] = useState<Variant>(() =>
    createEmptyDraftVariant(loadLocalState().profile)
  );
  const [selectedPlayVariantId, setSelectedPlayVariantId] = useState<string | null>(
    () => loadLocalState().variants[0]?.id || null
  );
  const [playInitialMode, setPlayInitialMode] = useState<GameMode>('ai');
  const [matchedOnlineRoom, setMatchedOnlineRoom] = useState<{
    roomId: string;
    code: string;
    yourSide: 'white' | 'black';
    opponent: {
      userId: string;
      nickname: string;
      eol: number;
      theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
    };
    ws: WebSocket;
  } | null>(null);

  const notify = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Persist locally on every state change
  useEffect(() => {
    saveLocalState(state);
  }, [state]);

  // Sync theme dark/light & accent color
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.setProperty('--accent-color', state.settings.accent || '#7ebcff');
  }, [state.settings.theme, state.settings.accent]);

  // Firebase Auth listener + initial cloud profile merge
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        try {
          const remote = await loadUserProfileFromFirestore(user);
          if (remote) {
            setState((prev) => {
              const mergedProfile: Profile = {
                ...prev.profile,
                nickname: prev.profile.nickname || remote.nickname || user.displayName || 'Joueur',
                avatarColor: remote.avatarColor || prev.profile.avatarColor,
                avatarSymbol: remote.avatarSymbol || prev.profile.avatarSymbol,
                eol: Math.max(prev.profile.eol, remote.eol ?? prev.profile.eol),
                gamesPlayed: Math.max(prev.profile.gamesPlayed, remote.gamesPlayed ?? 0),
                wins: Math.max(prev.profile.wins, remote.wins ?? 0),
                draws: Math.max(prev.profile.draws, remote.draws ?? 0),
                losses: Math.max(prev.profile.losses, remote.losses ?? 0),
                discoveredVariants: Array.from(
                  new Set([
                    ...(prev.profile.discoveredVariants || []),
                    ...(remote.discoveredVariants || []),
                  ])
                ),
              };
              return { ...prev, profile: mergedProfile };
            });
          } else if (state.profile.nickname) {
            await syncUserProfileToFirestore(user, state.profile);
          }
        } catch (err) {
          console.warn('Firestore profile sync skipped:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  // Sync profile to server on boot if already created + handle ?variant=<id> shared links
  useEffect(() => {
    if (state.profile.nickname) {
      syncProfileToServer(state.profile);
    }
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('variant');
    if (sharedId) {
      const localMatch = state.variants.find((v) => v.id === sharedId);
      if (localMatch) {
        setSelectedPlayVariantId(localMatch.id);
        setPlayInitialMode('ai');
        setScreen('play');
      } else {
        Promise.all([
          fetchVariantByIdFromFirestore(sharedId).catch(() => null),
          fetchVariantById(sharedId),
        ]).then(([cloudVariant, serverVariant]) => {
          const remote = cloudVariant || serverVariant;
          if (remote) {
            setState((prev) => ({
              ...prev,
              variants: [remote, ...prev.variants.filter((x) => x.id !== remote.id)],
            }));
            setSelectedPlayVariantId(remote.id);
            setPlayInitialMode('ai');
            setScreen('play');
            notify(`Variante partagée chargée : ${remote.name}`);
          }
        });
      }
    }
  }, []);

  const enterWithProfile = (nick: string) => {
    const updatedProfile: Profile = {
      ...state.profile,
      nickname: nick.slice(0, 32),
      avatarSymbol: onboardingSymbol,
      avatarColor: onboardingColor,
    };
    setState((prev) => ({ ...prev, profile: updatedProfile }));
    setVariantDraft((d) => ({
      ...d,
      creatorId: updatedProfile.id,
      creator: updatedProfile.nickname,
    }));
    syncProfileToServer(updatedProfile);
    notify(`Bienvenue ${updatedProfile.nickname} ! Votre classement démarre à 400 ÉOL.`);
  };

  const handleCompleteOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    const nick = onboardingNick.trim();
    if (!nick) {
      notify('Veuillez choisir un pseudo.');
      return;
    }
    const mod = validateFamilyFriendlyText(nick, { blockLinks: true, label: 'Le pseudo' });
    if (!mod.ok) {
      notify(mod.reason || 'Pseudo refusé (charte tout public).');
      return;
    }
    enterWithProfile(nick);
  };

  const handleGuestEnter = () => {
    enterWithProfile(generateGuestNickname());
  };

  const handleSaveVariant = async (variant: Variant) => {
    if (variant.visibility !== 'private') {
      const checks = [
        validateFamilyFriendlyText(variant.name, { blockLinks: true, label: 'Le nom' }),
        validateFamilyFriendlyText(variant.description || '', { blockLinks: true, label: 'La description' }),
        validateFamilyFriendlyText(variant.rules || '', { blockLinks: true, label: 'Les règles' }),
        validateFamilyFriendlyText(variant.goal || '', { blockLinks: true, label: 'L’objectif' }),
      ];
      const failed = checks.find((c) => !c.ok);
      if (failed) {
        notify(failed.reason || 'Contenu refusé pour une variante publique.');
        return;
      }
    }
    setState((prev) => {
      const exists = prev.variants.some((v) => v.id === variant.id);
      const nextVariants = exists
        ? prev.variants.map((v) => (v.id === variant.id ? variant : v))
        : [variant, ...prev.variants];

      const nextHistory: GameRecord[] = exists
        ? prev.history
        : [
            {
              id: `cr_${crypto.randomUUID().slice(0, 8)}`,
              type: 'Variante créée',
              variantId: variant.id,
              variantName: variant.name,
              creatorName: variant.creator,
              opponentName: 'Création',
              result: 'saved',
              date: new Date().toISOString(),
            },
            ...prev.history,
          ];

      return { ...prev, variants: nextVariants, history: nextHistory };
    });

    setSelectedPlayVariantId(variant.id);
    if (variant.visibility !== 'private') {
      await publishVariantToServer(variant);
    }
    if (firebaseUser) {
      try {
        await publishVariantToFirestore(firebaseUser, variant);
      } catch (err) {
        console.warn('Cloud variant publish warning:', err);
      }
    }
    notify(
      variant.visibility === 'public'
        ? firebaseUser
          ? 'Variante enregistrée et publiée sur le Cloud Firebase !'
          : 'Variante enregistrée et publiée !'
        : 'Variante enregistrée dans votre bibliothèque.'
    );
    setVariantDraft(createEmptyDraftVariant(state.profile));
    setScreen('library');
  };

  const handleForkVariant = (source: Variant) => {
    const fork: Variant = {
      ...JSON.parse(JSON.stringify(source)),
      id: `var_${crypto.randomUUID().slice(0, 10)}`,
      name: `${source.name} (dérivée)`,
      visibility: 'private',
      creatorId: state.profile.id,
      creator: state.profile.nickname || 'Créateur local',
      parentId: source.id,
      parentName: source.name,
      rootId: source.rootId || source.id,
      games: 0,
      ratingSum: 0,
      ratingCount: 0,
      comments: [],
      createdAt: new Date().toISOString(),
      versions: [
        {
          version: 1,
          date: new Date().toISOString(),
          summary: `Dérivée de ${source.name}`,
          author: state.profile.nickname || 'Créateur local',
        },
      ],
    };
    // Import any custom piece definitions from the forked variant so user can edit/play them
    const missingPieces = (source.customPieceDefs || []).filter(
      (cp) => !state.pieces.some((p) => p.id === cp.id)
    );
    setState((prev) => ({
      ...prev,
      pieces: [...missingPieces, ...prev.pieces],
      variants: [fork, ...prev.variants],
    }));
    setVariantDraft(fork);
    setScreen('create');
    notify(`Variante dérivée créée depuis « ${source.name} ».`);
  };

  const handleSavePiece = (piece: PieceDef) => {
    setState((prev) => {
      const exists = prev.pieces.some((p) => p.id === piece.id);
      const nextPieces = exists
        ? prev.pieces.map((p) => (p.id === piece.id ? piece : p))
        : [piece, ...prev.pieces];
      return { ...prev, pieces: nextPieces };
    });
  };

  const handleDeletePiece = (id: string) => {
    setState((prev) => ({
      ...prev,
      pieces: prev.pieces.filter((p) => p.id !== id),
    }));
    notify('Pièce supprimée.');
  };

  const handleSaveBoard = (board: BoardConfig, name: string) => {
    const saved: BoardConfig = {
      ...board,
      id: `brd_${crypto.randomUUID().slice(0, 8)}`,
      name,
    };
    setState((prev) => ({ ...prev, boards: [saved, ...prev.boards] }));
    notify(`Plateau « ${name} » sauvegardé en bibliothèque.`);
  };

  const handleFinishGame = (record: GameRecord, updatedEol?: number) => {
    setState((prev) => {
      const nextProfile: Profile = { ...prev.profile };
      if (record.mode === 'ai' || record.mode === 'online') {
        nextProfile.gamesPlayed += 1;
        if (record.result === 'win') nextProfile.wins += 1;
        else if (record.result === 'loss') nextProfile.losses += 1;
        else if (record.result === 'draw') nextProfile.draws += 1;

        if (typeof updatedEol === 'number') {
          nextProfile.eol = updatedEol;
        }
        if (record.variantId) {
          nextProfile.variantPlayCounts = {
            ...nextProfile.variantPlayCounts,
            [record.variantId]: (nextProfile.variantPlayCounts?.[record.variantId] || 0) + 1,
          };
          if (!nextProfile.discoveredVariants.includes(record.variantId)) {
            nextProfile.discoveredVariants = [
              ...nextProfile.discoveredVariants,
              record.variantId,
            ];
          }
        }
      }

      const nextVariants = prev.variants.map((v) =>
        v.id === record.variantId && record.mode !== 'analysis'
          ? { ...v, games: (v.games || 0) + 1 }
          : v
      );

      return {
        ...prev,
        profile: nextProfile,
        variants: nextVariants,
        history: [record, ...prev.history],
      };
    });

    if (record.mode !== 'analysis') {
      recordGameOnServer({
        userId: state.profile.id,
        variantId: record.variantId,
        playerEolAfter: updatedEol,
        result: record.result,
      });
      if (firebaseUser) {
        void recordGameInFirestore(firebaseUser, record).catch(() => {});
        if (record.variantId) {
          void incrementVariantGamesInFirestore(firebaseUser, record.variantId).catch(() => {});
        }
        const nextProfileForSync: Profile = {
          ...state.profile,
          gamesPlayed:
            record.mode === 'ai' || record.mode === 'online'
              ? state.profile.gamesPlayed + 1
              : state.profile.gamesPlayed,
          wins:
            (record.mode === 'ai' || record.mode === 'online') && record.result === 'win'
              ? state.profile.wins + 1
              : state.profile.wins,
          draws:
            (record.mode === 'ai' || record.mode === 'online') && record.result === 'draw'
              ? state.profile.draws + 1
              : state.profile.draws,
          losses:
            (record.mode === 'ai' || record.mode === 'online') && record.result === 'loss'
              ? state.profile.losses + 1
              : state.profile.losses,
          eol: typeof updatedEol === 'number' ? updatedEol : state.profile.eol,
        };
        void syncUserProfileToFirestore(firebaseUser, nextProfileForSync).catch(() => {});
      }
    }
  };

  const handleRateVariant = async (variantId: string, stars: number) => {
    setState((prev) => ({
      ...prev,
      ratings: { ...prev.ratings, [variantId]: stars },
    }));
    const [cloudRes, serverRes] = await Promise.all([
      firebaseUser
        ? rateVariantInFirestore(firebaseUser, variantId, stars).catch(() => null)
        : Promise.resolve(null),
      rateVariantOnServer(variantId, state.profile.id, stars),
    ]);
    const finalRes = cloudRes || serverRes;
    if (finalRes) {
      setState((prev) => ({
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === variantId
            ? { ...v, ratingSum: finalRes.ratingSum, ratingCount: finalRes.ratingCount }
            : v
        ),
      }));
    }
    notify(`Note de ${stars}/5 enregistrée.`);
  };

  const handleConnectGoogleCloud = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      if (user) {
        await syncUserProfileToFirestore(user, state.profile);
        for (const v of state.variants.filter((x) => !x.id.startsWith('var_classic') && !x.id.startsWith('var_chaos') && !x.id.startsWith('var_mini6') && !x.id.startsWith('var_fortress'))) {
          await publishVariantToFirestore(user, v).catch(() => {});
        }
        notify(`Cloud Firebase connecté (${user.displayName || 'Google'}).`);
      }
    } catch (err) {
      console.error(err);
      notify('Connexion Google annulée ou bloquée par le navigateur.');
    }
  };

  const handleDisconnectGoogleCloud = async () => {
    await signOut(auth);
    notify('Cloud Firebase déconnecté (jeu local conservé).');
  };

  // First-time profile creation screen (no email, no classic signup)
  if (!state.profile.nickname) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d1118] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-6 sm:p-7 space-y-6 shadow-xl">
          <div className="space-y-2">
            <div className="text-xl font-bold font-display text-sky-400">Chess Lab</div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Créez votre profil
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              100 % gratuit, sans publicité, sans e-mail ni inscription. Choisissez simplement un pseudo pour démarrer à 400 ÉOL.
            </p>
          </div>

          <form onSubmit={handleCompleteOnboarding} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Pseudo
              </span>
              <input
                type="text"
                value={onboardingNick}
                onChange={(e) => setOnboardingNick(e.target.value)}
                placeholder="Ex. Stratège_42"
                autoFocus
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3.5 py-2.5 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  Emblème
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {AVATAR_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setOnboardingSymbol(sym)}
                      className={`h-10 rounded-lg border text-lg flex items-center justify-center ${
                        onboardingSymbol === sym
                          ? 'border-sky-500 bg-sky-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Couleur
                </span>
                <input
                  type="color"
                  value={onboardingColor}
                  onChange={(e) => setOnboardingColor(e.target.value)}
                  className="w-full h-[86px] rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                />
              </label>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm min-h-[48px]"
              >
                Entrer dans Chess Lab
              </button>
              <button
                type="button"
                onClick={handleGuestEnter}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-sky-400 text-slate-700 dark:text-slate-200 font-medium text-xs min-h-[42px]"
              >
                Jouer directement en invité (pseudo automatique)
              </button>
              <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 pt-1">
                Tout public (tous âges) · Modération automatique active · Sans publicité
              </p>
            </div>
          </form>
        </div>

        {toastMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white shadow-lg">
            {toastMsg}
          </div>
        )}
      </div>
    );
  }

  const navItems: { id: ScreenId; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Accueil', icon: <Home className="w-5 h-5" /> },
    { id: 'create', label: 'Créer', icon: <Hammer className="w-5 h-5" /> },
    { id: 'discover', label: 'Découvrir', icon: <Compass className="w-5 h-5" /> },
    { id: 'play', label: 'Jouer', icon: <Play className="w-5 h-5" /> },
    { id: 'library', label: 'Bibliothèque', icon: <Library className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1118] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract : 3 zones (Marque — 5 liens nav — 1 action Paramètres/Profil) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/90 bg-white/90 dark:bg-[#0d1118]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="text-lg font-extrabold font-display tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            Chess <span className="text-sky-400">Lab</span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => setScreen('create')}
              className={`whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors ${
                screen === 'create' || screen === 'pieces' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setScreen('discover')}
              className={`whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors ${
                screen === 'discover' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Découvrir
            </button>
            <button
              type="button"
              onClick={() => setScreen('play')}
              className={`whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors ${
                screen === 'play' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Jouer
            </button>
            <button
              type="button"
              onClick={() => setScreen('history')}
              className={`whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors ${
                screen === 'history' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Historique
            </button>
            <button
              type="button"
              onClick={() => setScreen('library')}
              className={`whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors ${
                screen === 'library' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Bibliothèque
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => setScreen('settings')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-[#151c27] hover:border-sky-400 text-xs font-semibold whitespace-nowrap shrink-0 min-h-[38px]"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-mono-num">{state.profile.eol} ÉOL</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 pt-5 pb-24 md:pb-12">
        {pwaInstallable && !pwaInstalled && !pwaInIframe && !dismissedInstallBanner && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <div className="text-xs sm:text-sm text-emerald-200 font-medium">
              Chess Lab est prêt à être installé sur votre appareil (gratuit, hors-ligne).
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void triggerPwaInstall()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs px-3.5 py-2 min-h-[38px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Installer en 1 clic</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissedInstallBanner(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Masquer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {screen === 'home' && (
          <HomeView
            profile={state.profile}
            variantsCount={state.variants.length}
            recentVariants={state.variants}
            onNavigate={setScreen}
            onPlayVariant={(v) => {
              setSelectedPlayVariantId(v.id);
              setPlayInitialMode('ai');
              setScreen('play');
            }}
          />
        )}

        {screen === 'create' && (
          <VariantCreator
            profile={state.profile}
            pieces={state.pieces}
            settings={state.settings}
            draft={variantDraft}
            onChangeDraft={setVariantDraft}
            onSaveVariant={handleSaveVariant}
            onSaveBoard={handleSaveBoard}
            onOpenPieceCreator={() => setScreen('pieces')}
            onTestVariantPlay={(built) => {
              setState((prev) => {
                const exists = prev.variants.some((v) => v.id === built.id);
                return {
                  ...prev,
                  variants: exists
                    ? prev.variants.map((v) => (v.id === built.id ? built : v))
                    : [built, ...prev.variants],
                };
              });
              setSelectedPlayVariantId(built.id);
              setPlayInitialMode('local');
              setScreen('play');
              notify('Variante prête pour le test en partie.');
            }}
            onNotify={notify}
          />
        )}

        {screen === 'pieces' && (
          <PieceCreator
            pieces={state.pieces}
            currentVariantBoard={variantDraft.board}
            currentVariant={variantDraft}
            settings={state.settings}
            onSavePiece={handleSavePiece}
            onDeletePiece={handleDeletePiece}
            onBack={() => setScreen('create')}
            onNotify={notify}
          />
        )}

        {screen === 'discover' && (
          <DiscoverView
            localVariants={state.variants}
            profile={state.profile}
            customPieces={state.pieces}
            firebaseUser={firebaseUser}
            onPlayAiVariant={(v) => {
              setState((prev) => ({
                ...prev,
                variants: prev.variants.some((x) => x.id === v.id)
                  ? prev.variants
                  : [v, ...prev.variants],
              }));
              setSelectedPlayVariantId(v.id);
              setPlayInitialMode('ai');
              setScreen('play');
            }}
            onOnlineMatched={(payload) => {
              setState((prev) => ({
                ...prev,
                variants: prev.variants.some((x) => x.id === payload.variant.id)
                  ? prev.variants
                  : [payload.variant, ...prev.variants],
              }));
              setSelectedPlayVariantId(payload.variant.id);
              setMatchedOnlineRoom({
                roomId: payload.roomId,
                code: payload.code,
                yourSide: payload.yourSide,
                opponent: payload.opponent,
                ws: payload.ws,
              });
              setPlayInitialMode('online');
              setScreen('play');
            }}
            onForkVariant={handleForkVariant}
            onUpdateVariant={(updated) => {
              setState((prev) => ({
                ...prev,
                variants: prev.variants.map((v) => (v.id === updated.id ? updated : v)),
              }));
            }}
            onNotify={notify}
          />
        )}

        {screen === 'play' && (
          <GamePlay
            variants={state.variants}
            selectedVariantId={selectedPlayVariantId}
            initialMode={playInitialMode}
            autoMatchedRoom={matchedOnlineRoom}
            profile={state.profile}
            customPieces={state.pieces}
            settings={state.settings}
            userRatings={state.ratings}
            onSelectVariantId={setSelectedPlayVariantId}
            onFinishGame={handleFinishGame}
            onRateVariant={handleRateVariant}
            onClearOnlineRoom={() => setMatchedOnlineRoom(null)}
            onNotify={notify}
          />
        )}

        {screen === 'library' && (
          <LibraryView
            variants={state.variants}
            boards={state.boards}
            pieces={state.pieces}
            savedThemes={state.settings.savedThemes || []}
            onPlayVariant={(v) => {
              setSelectedPlayVariantId(v.id);
              setPlayInitialMode('ai');
              setScreen('play');
            }}
            onEditVariant={(v) => {
              setVariantDraft(JSON.parse(JSON.stringify(v)));
              setScreen('create');
            }}
            onDuplicateVariant={handleForkVariant}
            onDeleteVariant={(id) => {
              setState((prev) => ({
                ...prev,
                variants: prev.variants.filter((v) => v.id !== id),
              }));
              if (firebaseUser) {
                void deleteVariantFromFirestore(firebaseUser, id).catch(() => {});
              }
              notify('Variante supprimée.');
            }}
            onToggleVisibility={async (v, vis) => {
              const updated = { ...v, visibility: vis };
              setState((prev) => ({
                ...prev,
                variants: prev.variants.map((x) => (x.id === v.id ? updated : x)),
              }));
              if (vis !== 'private') {
                await publishVariantToServer(updated);
              }
              if (firebaseUser) {
                await publishVariantToFirestore(firebaseUser, updated).catch(() => {});
              }
              notify(`Visibilité mise à jour : ${vis}.`);
            }}
            onLoadBoardIntoCreator={(b) => {
              setVariantDraft((prev) => ({
                ...prev,
                board: JSON.parse(JSON.stringify(b)),
              }));
              setScreen('create');
              notify('Plateau chargé dans l’éditeur.');
            }}
            onDeleteBoard={(id) => {
              setState((prev) => ({
                ...prev,
                boards: prev.boards.filter((b) => b.id !== id),
              }));
              notify('Plateau supprimé.');
            }}
            onOpenPieceCreator={() => setScreen('pieces')}
            onDeletePiece={handleDeletePiece}
            onApplySavedTheme={(t: SavedTheme) => {
              setState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  boardTexture: t.boardTexture,
                  pieceTexture: t.pieceTexture,
                  boardLight: t.boardLight,
                  boardDark: t.boardDark,
                  pieceLight: t.pieceLight,
                  pieceDark: t.pieceDark,
                },
              }));
              notify(`Thème « ${t.name} » appliqué.`);
            }}
            onDeleteSavedTheme={(id) => {
              setState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  savedThemes: (prev.settings.savedThemes || []).filter((t) => t.id !== id),
                },
              }));
              notify('Thème supprimé.');
            }}
            onNotify={notify}
          />
        )}

        {screen === 'history' && (
          <HistoryView
            history={state.history}
            ratings={state.ratings}
            onRateVariant={handleRateVariant}
          />
        )}

        {screen === 'settings' && (
          <SettingsView
            profile={state.profile}
            settings={state.settings}
            firebaseUser={firebaseUser}
            onConnectCloud={handleConnectGoogleCloud}
            onDisconnectCloud={handleDisconnectGoogleCloud}
            onSyncAllNow={async () => {
              if (!firebaseUser) return;
              await syncUserProfileToFirestore(firebaseUser, state.profile);
              for (const v of state.variants.filter(
                (x) =>
                  !x.id.startsWith('var_classic') &&
                  !x.id.startsWith('var_chaos') &&
                  !x.id.startsWith('var_mini6') &&
                  !x.id.startsWith('var_fortress')
              )) {
                await publishVariantToFirestore(firebaseUser, v).catch(() => {});
              }
              notify('Profil et variantes synchronisés avec Firebase.');
            }}
            onUpdateProfile={(nextProfile) => {
              setState((prev) => ({ ...prev, profile: nextProfile }));
              syncProfileToServer(nextProfile);
              if (firebaseUser) {
                void syncUserProfileToFirestore(firebaseUser, nextProfile).catch(() => {});
              }
            }}
            onUpdateSettings={(nextSettings: AppSettings) =>
              setState((prev) => ({ ...prev, settings: nextSettings }))
            }
            onSaveTheme={(theme) =>
              setState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  savedThemes: [theme, ...(prev.settings.savedThemes || [])],
                },
              }))
            }
            onResetAllData={() => {
              const fresh = createBlankState();
              setState(fresh);
              setVariantDraft(createEmptyDraftVariant(fresh.profile));
              setScreen('home');
              notify('Données locales réinitialisées.');
            }}
            onNotify={notify}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb zone, compact height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#111722]/95 backdrop-blur-md px-1 py-1">
        {navItems.map((item) => {
          const isActive =
            screen === item.id || (item.id === 'create' && screen === 'pieces');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`flex flex-col items-center justify-center py-1 rounded-lg min-h-[44px] ${
                isActive
                  ? 'text-sky-400 bg-sky-500/10 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] mt-0.5 leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />

      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white shadow-xl max-w-[90vw] text-center"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
