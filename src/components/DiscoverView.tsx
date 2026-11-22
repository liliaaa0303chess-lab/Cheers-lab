import React, { useEffect, useState } from 'react';
import {
  Bot,
  Compass,
  Flag,
  GitFork,
  Globe,
  MessageSquare,
  Search,
  Shuffle,
  Star,
  X,
} from 'lucide-react';
import type { User } from '../firebase';
import {
  AI_LEVELS,
  getClosestAiLevelForEol,
  type OnlineAiSeat,
  type OnlineHumanSeat,
  type PieceDef,
  type PlayerSide,
  type Profile,
  type Variant,
} from '../types/chess';
import {
  addCommentToFirestore,
  fetchPublicVariantsFromFirestore,
  fetchVariantCommentsFromFirestore,
} from '../utils/firestoreSync';
import { addCommentOnServer, fetchPublicVariants } from '../utils/storage';
import {
  isContentFamilyFriendly,
  validateFamilyFriendlyText,
} from '../utils/moderation';
import { VariantRulesSummary } from './VariantRulesSummary';

interface DiscoverViewProps {
  localVariants: Variant[];
  externalPublicVariants?: Variant[];
  profile: Profile;
  customPieces: PieceDef[];
  firebaseUser?: User | null;
  onPlayAiVariant: (variant: Variant, competitive: boolean) => void;
  onOnlineMatched: (payload: {
    roomId: string;
    code: string;
    yourSide: PlayerSide;
    competitive: boolean;
    variant: Variant;
    opponent: {
      userId: string;
      nickname: string;
      eol: number;
      theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
    };
    participants?: OnlineHumanSeat[];
    aiSeats?: OnlineAiSeat[];
    hostUserId?: string;
    ws: WebSocket;
  }) => void;
  onForkVariant: (variant: Variant) => void;
  onUpdateVariant: (variant: Variant) => void;
  onNotify: (msg: string) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  localVariants,
  externalPublicVariants = [],
  profile,
  customPieces,
  firebaseUser,
  onPlayAiVariant,
  onOnlineMatched,
  onForkVariant,
  onUpdateVariant,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [serverVariants, setServerVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [competitive, setCompetitive] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [hiddenContent, setHiddenContent] = useState<{ variants: string[]; comments: string[] }>(
    () => {
      try {
        const raw = localStorage.getItem('chesslab_hidden_reports_v1');
        if (raw) {
          const parsed = JSON.parse(raw) as { variants?: string[]; comments?: string[] };
          return {
            variants: Array.isArray(parsed.variants) ? parsed.variants : [],
            comments: Array.isArray(parsed.comments) ? parsed.comments : [],
          };
        }
      } catch {
        // Ignore storage errors
      }
      return { variants: [], comments: [] };
    }
  );

  const hideReportedVariant = (id: string) => {
    setHiddenContent((prev) => {
      const next = {
        ...prev,
        variants: prev.variants.includes(id) ? prev.variants : [...prev.variants, id],
      };
      try {
        localStorage.setItem('chesslab_hidden_reports_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSelectedVariant(null);
    onNotify('Variante signalée et masquée de votre fil.');
  };

  const hideReportedComment = (id: string) => {
    setHiddenContent((prev) => {
      const next = {
        ...prev,
        comments: prev.comments.includes(id) ? prev.comments : [...prev.comments, id],
      };
      try {
        localStorage.setItem('chesslab_hidden_reports_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onNotify('Commentaire signalé et masqué.');
  };

  // Matchmaking state (10s before AI fallback / multi-player AI fill)
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const wsRef = React.useRef<WebSocket | null>(null);
  const matchedHandedOffRef = React.useRef(false);
  const recommendedAiLevel = getClosestAiLevelForEol(profile.eol);
  const recommendedAiMeta =
    AI_LEVELS.find((l) => l.level === recommendedAiLevel) || AI_LEVELS[2];

  useEffect(() => {
    return () => {
      if (!matchedHandedOffRef.current && wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchPublicVariantsFromFirestore().catch(() => [] as Variant[]),
      fetchPublicVariants(query),
    ]).then(([cloudList, apiList]) => {
      if (!active) return;
      const merged = new Map<string, Variant>();
      for (const v of apiList) merged.set(v.id, v);
      for (const v of cloudList) merged.set(v.id, v);
      setServerVariants(Array.from(merged.values()));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [query]);

  useEffect(() => {
    if (!selectedVariant) return;
    let active = true;
    fetchVariantCommentsFromFirestore(selectedVariant.id)
      .then((cloudComments) => {
        if (!active || cloudComments.length === 0) return;
        setSelectedVariant((curr) => {
          if (!curr || curr.id !== selectedVariant.id) return curr;
          const existingIds = new Set((curr.comments || []).map((c) => c.id));
          const merged = [
            ...cloudComments.filter((c) => !existingIds.has(c.id)),
            ...(curr.comments || []),
          ];
          return { ...curr, comments: merged };
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedVariant?.id]);

  // Merge public server variants + real-time external public variants + public local variants
  const publicVariants = React.useMemo(() => {
    const map = new Map<string, Variant>();
    for (const v of externalPublicVariants) {
      if (v.visibility === 'public') map.set(v.id, v);
    }
    for (const v of serverVariants) {
      if (v.visibility === 'public') map.set(v.id, v);
    }
    for (const v of localVariants) {
      if (v.visibility === 'public') map.set(v.id, v);
    }
    const q = query.trim().toLowerCase();
    return Array.from(map.values()).filter(
      (v) =>
        !hiddenContent.variants.includes(v.id) &&
        isContentFamilyFriendly(v.name, true) &&
        isContentFamilyFriendly(v.creator, true) &&
        isContentFamilyFriendly(v.description || '', true) &&
        (!q ||
          v.name.toLowerCase().includes(q) ||
          v.creator.toLowerCase().includes(q) ||
          (v.description || '').toLowerCase().includes(q))
    );
  }, [externalPublicVariants, serverVariants, localVariants, query, hiddenContent.variants]);

  const handleRandomPublic = () => {
    if (publicVariants.length === 0) {
      onNotify('Aucune variante publique disponible.');
      return;
    }
    const picked = publicVariants[Math.floor(Math.random() * publicVariants.length)];
    setSelectedVariant(picked);
    onNotify(`Variante tirée au hasard : ${picked.name}`);
  };

  // Matchmaking countdown with automatic AI takeover
  useEffect(() => {
    if (!searchingOnline || !selectedVariant) return;
    if (countdown <= 0) {
      cancelMatchmaking();
      onNotify('Aucun joueur disponible — une IA adaptée prend le relais.');
      onPlayAiVariant(selectedVariant, competitive);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [searchingOnline, countdown, selectedVariant, competitive]);

  const startMatchmaking = (v: Variant, randomMode = false) => {
    setSelectedVariant(v);
    setSearchingOnline(true);
    setCountdown(10);

    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'matchmaking:join',
            userId: profile.id,
            nickname: profile.nickname || 'Joueur',
            eol: profile.eol,
            mode: randomMode ? 'random' : 'specific',
            competitive,
            variantId: randomMode ? null : v.id,
            variantSnapshot: v,
          })
        );
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as Record<string, unknown>;
          if (msg.type === 'match:found') {
            matchedHandedOffRef.current = true;
            setSearchingOnline(false);
            onOnlineMatched({
              roomId: String(msg.roomId),
              code: String(msg.code),
              yourSide: (msg.yourSide as PlayerSide) || 'white',
              competitive: msg.competitive !== false,
              variant: msg.variant as Variant,
              opponent: msg.opponent as {
                userId: string;
                nickname: string;
                eol: number;
                theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
              },
              participants: Array.isArray(msg.participants)
                ? (msg.participants as OnlineHumanSeat[])
                : undefined,
              aiSeats: Array.isArray(msg.aiSeats)
                ? (msg.aiSeats as OnlineAiSeat[])
                : undefined,
              hostUserId: typeof msg.hostUserId === 'string' ? msg.hostUserId : undefined,
              ws,
            });
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // Fallback handled by countdown
    }
  };

  const cancelMatchmaking = () => {
    setSearchingOnline(false);
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'matchmaking:leave' }));
        }
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || !commentText.trim()) return;
    const trimmed = commentText.trim();
    const mod = validateFamilyFriendlyText(trimmed, {
      blockLinks: true,
      label: 'Le commentaire',
    });
    if (!mod.ok) {
      onNotify(mod.reason || 'Commentaire non autorisé (charte tout public).');
      return;
    }

    if (firebaseUser) {
      const cloudComment = await addCommentToFirestore(
        firebaseUser,
        selectedVariant.id,
        profile.nickname || 'Joueur',
        trimmed
      ).catch(() => null);
      if (cloudComment) {
        const updated: Variant = {
          ...selectedVariant,
          comments: [cloudComment, ...(selectedVariant.comments || [])],
        };
        setSelectedVariant(updated);
        onUpdateVariant(updated);
        setCommentText('');
        onNotify('Commentaire publié sur le Cloud Firebase.');
        return;
      }
    }

    const updated = await addCommentOnServer(
      selectedVariant.id,
      profile.id,
      profile.nickname || 'Joueur',
      trimmed
    );
    if (updated) {
      setSelectedVariant(updated);
      onUpdateVariant(updated);
      setCommentText('');
      onNotify('Commentaire ajouté.');
    } else {
      const localUpdated: Variant = {
        ...selectedVariant,
        comments: [
          {
            id: `c_${Date.now()}`,
            authorId: profile.id,
            authorName: profile.nickname || 'Joueur',
            text: trimmed,
            createdAt: new Date().toISOString(),
          },
          ...(selectedVariant.comments || []),
        ],
      };
      setSelectedVariant(localUpdated);
      onUpdateVariant(localUpdated);
      setCommentText('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Découvrir une variante
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Explorez les variantes publiques, gagnez des bonus de découverte ÉOL et affrontez des joueurs ou une IA.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRandomPublic}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px] shrink-0"
        >
          <Shuffle className="w-4 h-4" />
          <span>Variante au hasard</span>
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une variante publique par nom ou créateur..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] pl-10 pr-4 py-3 text-sm"
        />
      </div>

      {/* Liste des variantes publiques */}
      {loading && publicVariants.length === 0 ? (
        <div className="text-sm text-slate-500 py-8 text-center">
          Chargement des variantes publiques…
        </div>
      ) : publicVariants.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-6 text-center text-sm text-slate-500">
          Aucune variante publique ne correspond à votre recherche.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publicVariants.map((v) => {
            const avgRating =
              v.ratingCount && v.ratingCount > 0 && v.ratingSum
                ? (v.ratingSum / v.ratingCount).toFixed(1)
                : '—';
            const prior = profile.variantPlayCounts?.[v.id] || 0;
            return (
              <div
                key={v.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {v.name}
                      </h2>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Créateur : {v.creator} · {v.board.rows}×{v.board.cols} ·{' '}
                        {v.controlledDifficulty || v.difficulty}
                      </div>
                    </div>
                    {prior === 0 && (
                      <span className="text-xs font-semibold text-emerald-400 shrink-0">
                        Découverte +35 %
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                    {v.description || v.goal}
                  </p>

                  {/* Popularité et Note maintenues distinctes */}
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1 font-mono-num">
                    <span>Popularité : {v.games || 0} parties</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      Note : {avgRating}/5 ({v.ratingCount || 0})
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Voir & Jouer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onForkVariant(v)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px]"
                    title="Créer une variante dérivée"
                  >
                    <GitFork className="w-4 h-4" />
                    <span>Dériver</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale Présentation avant la partie + Matchmaking + Commentaires */}
      {selectedVariant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-sky-400">
                Présentation avant la partie
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => hideReportedVariant(selectedVariant.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[36px]"
                  title="Signaler et masquer cette variante"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Signaler</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelMatchmaking();
                    setSelectedVariant(null);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <VariantRulesSummary
              variant={selectedVariant}
              profile={profile}
              customPieces={customPieces}
              showEolPreview
            />

            {/* Choix Compétitif vs Amical */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0f151f] space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mode de classement avant de commencer
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCompetitive(true)}
                  className={`px-3 py-2 rounded-xl border text-left transition-colors ${
                    competitive
                      ? 'border-sky-500 bg-sky-500/15 text-sky-400 font-semibold'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold">Compétitif (ÉOL en jeu)</div>
                  <div className="text-[11px] opacity-80">100 % en ligne · −50 % vs IA</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCompetitive(false)}
                  className={`px-3 py-2 rounded-xl border text-left transition-colors ${
                    !competitive
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 font-semibold'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold">Amical (sans ÉOL)</div>
                  <div className="text-[11px] opacity-80">Aucun point ÉOL en jeu</div>
                </button>
              </div>
            </div>

            {/* Matchmaking ou lancement IA */}
            {searchingOnline ? (
              <div className="p-4 rounded-xl border border-violet-500/40 bg-violet-500/10 space-y-3 text-center">
                <div className="text-sm font-semibold text-violet-300">
                  Recherche d’un adversaire ÉOL proche de {profile.eol}… ({countdown}s)
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-violet-400 transition-all duration-1000"
                    style={{ width: `${Math.max(5, (countdown / 10) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {(selectedVariant.players || 2) > 2
                    ? `Variante à ${selectedVariant.players} joueurs : après 10s, si des places restent libres, des IA complèteront automatiquement la partie avec les joueurs connectés.`
                    : `Délai de 10 secondes pour trouver le meilleur adversaire. Si personne n’est disponible, une IA Niveau ${recommendedAiMeta.level} (~${recommendedAiMeta.approxEol} ÉOL) prendra le relais.`}
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      cancelMatchmaking();
                      onPlayAiVariant(selectedVariant, competitive);
                    }}
                    className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-semibold text-xs min-h-[40px]"
                  >
                    Jouer contre l’IA maintenant
                  </button>
                  <button
                    type="button"
                    onClick={cancelMatchmaking}
                    className="px-4 py-2 rounded-xl border border-slate-600 text-xs min-h-[40px]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => startMatchmaking(selectedVariant, false)}
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm min-h-[48px]"
                >
                  <Globe className="w-4 h-4" />
                  <span>
                    {competitive ? 'Matchmaking compétitif (10s)' : 'Matchmaking amical (10s)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlayAiVariant(selectedVariant, competitive)}
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[48px]"
                >
                  <Bot className="w-4 h-4" />
                  <span>
                    IA Niv.{recommendedAiMeta.level} (~{recommendedAiMeta.approxEol} ÉOL)
                    {competitive ? ' · −50 %' : ' · Amical'}
                  </span>
                </button>
              </div>
            )}

            {/* Commentaires si activés */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span>Commentaires ({selectedVariant.comments?.length || 0})</span>
              </div>

              {selectedVariant.commentsEnabled === false ? (
                <p className="text-xs text-slate-500">
                  Le créateur a désactivé les commentaires pour cette variante.
                </p>
              ) : (
                <>
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Partager un avis ou une astuce..."
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-sm font-medium min-h-[40px]"
                    >
                      Publier
                    </button>
                  </form>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {(() => {
                      const visibleComments = (selectedVariant.comments || []).filter(
                        (c) =>
                          !hiddenContent.comments.includes(c.id) &&
                          isContentFamilyFriendly(c.text, true) &&
                          isContentFamilyFriendly(c.authorName, true)
                      );
                      if (visibleComments.length === 0) {
                        return <p className="text-xs text-slate-500">Aucun commentaire pour le moment.</p>;
                      }
                      return visibleComments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0f151f] text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 text-slate-400 mb-0.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {c.authorName}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>{new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
                              <button
                                type="button"
                                onClick={() => hideReportedComment(c.id)}
                                className="text-slate-400 hover:text-amber-400"
                                title="Masquer / signaler ce commentaire"
                                aria-label="Signaler ce commentaire"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">{c.text}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
