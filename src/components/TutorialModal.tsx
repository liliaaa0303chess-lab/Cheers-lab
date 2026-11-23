import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

interface TutorialStep {
  targets: string[];
  scrollMode: 'none' | 'top' | 'frame';
  dock: 'center' | 'bottom' | 'above-target';
  title: string;
  body: React.ReactNode;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    targets: [],
    scrollMode: 'top',
    dock: 'center',
    title: 'Bienvenue sur Chess Lab !',
    body: (
      <div className="space-y-1.5">
        <p className="text-sm text-slate-100 font-medium leading-snug">
          Bienvenue sur Chess Lab ! Inventez vos propres variantes d’échecs, affrontez l’IA ou de vrais joueurs et suivez votre ÉOL.
        </p>
        <p className="text-xs text-slate-400 leading-snug">
          Visite rapide des nouveautés et des boutons essentiels.
        </p>
      </div>
    ),
  },
  {
    targets: ['home-quick-grid'],
    scrollMode: 'frame',
    dock: 'bottom',
    title: 'Les 5 accès principaux',
    body: (
      <ul className="space-y-1 text-[11px] sm:text-xs text-slate-300 leading-snug">
        <li>
          <strong className="text-sky-300">Créer</strong> : inventer vos plateaux, pièces et règles.
        </li>
        <li>
          <strong className="text-white">Découvrir</strong> : essayer les variantes publiques des joueurs.
        </li>
        <li>
          <strong className="text-white">Jouer</strong> : lancer une partie contre l’IA (jusqu’à 20 niveaux), en ligne ou en local.
        </li>
        <li>
          <strong className="text-white">Historique</strong> : revoir vos coups, profils adverses et scores ÉOL.
        </li>
        <li>
          <strong className="text-white">Bibliothèque</strong> : gérer variantes, plateaux, pièces et amis.
        </li>
      </ul>
    ),
  },
  {
    targets: ['bottom-library', 'nav-library'],
    scrollMode: 'none',
    dock: 'above-target',
    title: 'Bibliothèque : Variantes, Plateaux, Pièces & Amis',
    body: (
      <div className="space-y-1.5 text-xs text-slate-200 leading-relaxed">
        <p>
          La Bibliothèque regroupe en menus dépliants vos <strong className="text-white">Variantes</strong>,{' '}
          <strong className="text-white">Plateaux</strong>, <strong className="text-white">Pièces</strong> et votre liste d’<strong className="text-white">Amis</strong>.
        </p>
        <div className="rounded-lg bg-sky-500/10 border border-sky-400/25 px-2.5 py-1.5 text-[11px] text-slate-200">
          Vous pouvez choisir <strong className="text-white">Privé</strong> ou <strong className="text-emerald-300">Public</strong> sur vos pièces et plateaux. Attention : si une variante est publique, son plateau et ses pièces le sont automatiquement !
        </div>
      </div>
    ),
  },
  {
    targets: ['home-history', 'nav-history'],
    scrollMode: 'frame',
    dock: 'bottom',
    title: 'Historique, Profils & Demandes d’ami',
    body: (
      <div className="space-y-1.5 text-xs text-slate-200 leading-relaxed">
        <p>
          Dans <strong className="text-white">Historique</strong>, cliquez sur un adversaire déjà affronté pour ouvrir son{' '}
          <strong className="text-sky-300">Profil</strong> (variantes, pièces et plateaux publics) ou envoyer une{' '}
          <strong className="text-emerald-300">Demande d’ami</strong>.
        </p>
        <p className="text-[11px] text-slate-300">
          Une fois accepté, votre ami apparaît dans <strong className="text-white">Bibliothèque → Amis</strong> avec un{' '}
          <strong className="text-emerald-400">point vert</strong> s’il est connecté pour lui proposer une revanche à tout moment !
        </p>
      </div>
    ),
  },
  {
    targets: ['home-settings', 'home-eol-profile', 'nav-settings'],
    scrollMode: 'top',
    dock: 'bottom',
    title: 'Carte de combat, ÉOL & Paramètres',
    body: (
      <div className="space-y-1.5 text-xs text-slate-200 leading-relaxed">
        <p>
          Personnalisez votre <strong className="text-sky-300">Carte de combat</strong> (affichée en plein écran face à l’adversaire avant chaque partie) et vos thèmes dans <strong className="text-white">Paramètres</strong>.
        </p>
        <p className="text-[11px] text-slate-300">
          L’<strong className="text-sky-300">ÉOL</strong> mesure votre capacité à vous adapter aux variantes (départ à 400 ÉOL).
        </p>
      </div>
    ),
  },
  {
    targets: ['home-play', 'home-discover'],
    scrollMode: 'frame',
    dock: 'bottom',
    title: 'Jouer & Découvrir',
    body: (
      <div className="space-y-1.5 text-xs leading-relaxed">
        <p className="text-slate-200">
          <strong className="text-white">Jouez à vos variantes ou à celles de la communauté</strong> contre l’<strong className="text-white">IA</strong>,{' '}
          <strong className="text-white">en ligne</strong>, en <strong className="text-white">face à face</strong> ou en mode{' '}
          <strong className="text-white">Analyse</strong>.
        </p>
        <div className="rounded-lg bg-sky-500/10 border border-sky-400/25 px-2.5 py-1.5 text-slate-200">
          Avant de lancer, choisissez librement entre{' '}
          <strong className="text-amber-300">Compétitif (avec ÉOL)</strong> et{' '}
          <strong className="text-emerald-300">Amical (sans ÉOL)</strong>.
        </div>
      </div>
    ),
  },
];

interface TargetEntry {
  key: string;
  el: HTMLElement;
}

interface TargetRect {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

function findVisibleElements(targetNames: string[]): TargetEntry[] {
  const results: TargetEntry[] = [];
  const seenEls = new Set<HTMLElement>();

  for (const name of targetNames) {
    const nodes = document.querySelectorAll<HTMLElement>(`[data-tutorial="${name}"]`);
    for (const el of Array.from(nodes)) {
      if (seenEls.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        seenEls.add(el);
        results.push({ key: `${name}-${results.length}`, el });
        break;
      }
    }
  }
  return results;
}

const StylizedKnightGuide: React.FC<{ stepIndex: number }> = ({ stepIndex }) => (
  <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0">
    <svg
      viewBox="0 0 120 120"
      className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-[0_6px_14px_rgba(56,189,248,0.28)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="knightBodyGrad" x1="15%" y1="10%" x2="85%" y2="95%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="55%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="knightCrestGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>

      <circle cx="60" cy="60" r="54" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
      <circle
        cx="60"
        cy="60"
        r="49"
        fill="none"
        stroke="url(#knightCrestGrad)"
        strokeWidth="1.5"
        strokeDasharray="6 5"
        opacity="0.65"
      />

      <path
        d="M57 20 L66 14 L69 24 L79 23 L76 34 C86 44 89 60 83 84 L41 84 L46 66 C48 61 52 57 55 54 L42 56 L30 51 C27 49 27 45 30 42 L45 30 C49 25 53 22 57 20 Z"
        fill="url(#knightBodyGrad)"
        stroke="#f8fafc"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <path
        d="M62 23 C73 34 78 52 74 79"
        fill="none"
        stroke="url(#knightCrestGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      <circle
        cx="48"
        cy="39"
        r="3.2"
        fill={stepIndex % 2 === 0 ? '#38bdf8' : '#fbbf24'}
      />
      <circle cx="47.2" cy="38.2" r="1" fill="#ffffff" />

      <rect
        x="34"
        y="84"
        width="54"
        height="9"
        rx="4"
        fill="#1e293b"
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <rect x="29" y="94" width="64" height="7" rx="3.5" fill="#334155" />
    </svg>
  </div>
);

export const TutorialModal: React.FC<TutorialModalProps> = ({ open, onClose }) => {
  const maskId = useId().replace(/:/g, '_');
  const [step, setStep] = useState(0);
  const [targetRects, setTargetRects] = useState<TargetRect[]>([]);
  const [vp, setVp] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  const activeEntriesRef = useRef<TargetEntry[]>([]);
  const maskRectRefs = useRef<(SVGRectElement | null)[]>([]);
  const ringDivRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setStep(0);
    } else {
      activeEntriesRef.current = [];
      setTargetRects([]);
    }
  }, [open]);

  const current = TUTORIAL_STEPS[step];

  useLayoutEffect(() => {
    if (!open || !current) return;

    const scrollWindowTo = (y: number) => {
      window.scrollTo({ top: y, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
    };

    const alignAndRenderInitial = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setVp({ w: vw, h: vh });

      if (current.targets.length === 0) {
        scrollWindowTo(0);
        activeEntriesRef.current = [];
        setTargetRects([]);
        return;
      }

      if (current.scrollMode === 'top') {
        scrollWindowTo(0);
      } else if (current.scrollMode === 'frame') {
        const initialFound = findVisibleElements(current.targets);
        if (initialFound.length > 0) {
          const firstRect = initialFound[0].el.getBoundingClientRect();
          const currentScrollY =
            window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
          const docTop = currentScrollY + firstRect.top;
          scrollWindowTo(Math.max(0, docTop - 64));
        }
      }

      const found = findVisibleElements(current.targets);
      activeEntriesRef.current = found;
      setTargetRects(
        found.map(({ key, el }) => {
          const r = el.getBoundingClientRect();
          return { key, top: r.top, left: r.left, width: r.width, height: r.height };
        })
      );
    };

    // Synchronisation directe sur les nœuds DOM sans repasser par React pendant le scroll (0 ms de décalage)
    const syncOverlayDomImmediately = () => {
      const entries = activeEntriesRef.current;
      for (let idx = 0; idx < entries.length; idx++) {
        const r = entries[idx].el.getBoundingClientRect();
        const x = Math.max(0, r.left - 5);
        const y = Math.max(0, r.top - 5);
        const w = r.width + 10;
        const h = r.height + 10;

        const svgRect = maskRectRefs.current[idx];
        if (svgRect) {
          svgRect.setAttribute('x', String(x));
          svgRect.setAttribute('y', String(y));
          svgRect.setAttribute('width', String(w));
          svgRect.setAttribute('height', String(h));
        }
        const ringDiv = ringDivRefs.current[idx];
        if (ringDiv) {
          ringDiv.style.left = `${x}px`;
          ringDiv.style.top = `${y}px`;
          ringDiv.style.width = `${w}px`;
          ringDiv.style.height = `${h}px`;
        }
      }
    };

    alignAndRenderInitial();

    let scrollRaf = 0;
    const handleScroll = () => {
      syncOverlayDomImmediately();
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(syncOverlayDomImmediately);
    };

    const handleResize = () => {
      alignAndRenderInitial();
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, step, current]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const hasTargets = targetRects.length > 0;
  const primaryRect = targetRects[0] || null;
  const cardWidth = Math.min(410, Math.max(270, vp.w - 24));

  let wrapperClass = 'fixed inset-x-0 z-[71] flex justify-center px-3 pointer-events-none';
  let wrapperStyle: React.CSSProperties;

  if (current.dock === 'center' || !hasTargets || !primaryRect) {
    wrapperClass = 'fixed inset-0 z-[71] flex items-center justify-center p-3 pointer-events-none';
    wrapperStyle = {};
  } else if (current.dock === 'above-target') {
    const isNearBottom = primaryRect.top > vp.h * 0.55;
    wrapperStyle = isNearBottom
      ? { bottom: `${Math.max(12, vp.h - primaryRect.top + 12)}px` }
      : { top: `${Math.max(12, primaryRect.top + primaryRect.height + 14)}px` };
  } else {
    wrapperStyle = { bottom: '10px' };
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-[68] ${hasTargets ? 'bg-transparent' : 'bg-black/75 backdrop-blur-sm'}`}
        aria-hidden="true"
      />

      {hasTargets && (
        <svg
          className="fixed inset-0 w-full h-full z-[69] pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRects.map((r, idx) => (
                <rect
                  key={r.key}
                  ref={(el) => {
                    maskRectRefs.current[idx] = el;
                  }}
                  x={Math.max(0, r.left - 5)}
                  y={Math.max(0, r.top - 5)}
                  width={r.width + 10}
                  height={r.height + 10}
                  rx="12"
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(6, 10, 18, 0.78)"
            mask={`url(#${maskId})`}
          />
        </svg>
      )}

      {targetRects.map((r, idx) => (
        <div
          key={r.key}
          ref={(el) => {
            ringDivRefs.current[idx] = el;
          }}
          aria-hidden="true"
          className="fixed z-[70] pointer-events-none rounded-xl border-2 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.6)]"
          style={{
            left: `${Math.max(0, r.left - 5)}px`,
            top: `${Math.max(0, r.top - 5)}px`,
            width: `${r.width + 10}px`,
            height: `${r.height + 10}px`,
          }}
        />
      ))}

      <div className={wrapperClass} style={wrapperStyle}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-title"
          style={{ width: `${cardWidth}px` }}
          className="pointer-events-auto max-h-[calc(100dvh-20px)] overflow-y-auto rounded-2xl border border-sky-400/50 bg-[#121923] text-slate-100 p-3.5 sm:p-5 shadow-2xl space-y-2.5 sm:space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 font-mono-num">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Tutoriel · {step + 1} / {TUTORIAL_STEPS.length}
              </span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Passer le tutoriel
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer le tutoriel"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 sm:gap-3">
            <StylizedKnightGuide stepIndex={step} />
            <div className="space-y-1 min-w-0 flex-1">
              <h2 id="tutorial-title" className="text-sm sm:text-base font-bold text-white leading-snug">
                {current.title}
              </h2>
              <div>{current.body}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {TUTORIAL_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                aria-label={`Étape ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  idx === step ? 'w-5 bg-sky-400' : 'w-1.5 bg-slate-700 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-700 text-slate-200 text-xs font-medium min-h-[36px] disabled:opacity-35"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 sm:py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs min-h-[36px]"
              >
                <span>C’est parti !</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))}
                className="inline-flex items-center gap-1 px-4 py-1.5 sm:py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs min-h-[36px]"
              >
                <span>Suivant</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
