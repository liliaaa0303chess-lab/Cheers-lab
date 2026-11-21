import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Monitor,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, directInstallUrl, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    if (!appUrl) return;
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap shrink-0 ${
          isInstallable
            ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-sm'
            : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
        } ${compact ? 'px-2.5 py-1.5 text-xs min-h-[38px]' : 'px-4 py-2.5 text-sm min-h-[44px]'}`}
        title={
          isInstallable
            ? 'Installer Chess Lab directement en 1 clic'
            : 'Installer Chess Lab sur Android, iPhone ou ordinateur'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>
          {isInstallable
            ? compact
              ? 'Installer'
              : 'Installer en 1 clic'
            : compact
              ? 'Installer'
              : 'Installer l’application'}
        </span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Installer Chess Lab (0 €)
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInstallable ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-2.5">
                <p className="text-xs font-semibold text-emerald-300">
                  Installation directe prête sur cet appareil !
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void install().then((ok) => {
                      if (ok) setShowGuide(false);
                    });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-sm min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer Chess Lab maintenant</span>
                </button>
              </div>
            ) : isInIframe ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2.5">
                <p className="font-semibold">
                  Pourquoi le clic direct est bloqué ici ?
                </p>
                <p className="text-slate-300 leading-relaxed">
                  Chrome et Safari interdisent techniquement à tout site d’afficher la fenêtre d’installation directe tant qu’il est ouvert à l’intérieur d’un aperçu. Ouvrez l’app dans son propre onglet pour débloquer le bouton vert <strong>« Installer en 1 clic »</strong> :
                </p>
                {directInstallUrl && (
                  <a
                    href={directInstallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs min-h-[42px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ouvrir hors aperçu pour installer en 1 clic</span>
                  </a>
                )}
              </div>
            ) : null}

            {appUrl && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] p-3 space-y-2">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Adresse de cette application
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2.5 py-1.5 text-xs font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className={`rounded-xl border p-3 space-y-1.5 ${!isIOS ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  <span>Sur Android (Chrome)</span>
                </div>
                <p className="leading-relaxed">
                  1. Ouvrez l’app via son <strong>lien public partagé</strong> dans Chrome (pas le lien de test privé).<br />
                  2. Cliquez sur <strong>Installer en 1 clic</strong> (ou menu Chrome <strong>⋮ → Ajouter à l’écran d’accueil → Installer</strong>).<br />
                  <span className="text-amber-300">
                    Si Android affiche « Impossible d’installer cette application » : le lien privé de développement bloque la vérification Google WebAPK. Utilisez le lien public partagé, ou dans Chrome faites <strong>⋮ → Ajouter à l’écran d’accueil → Créer un raccourci</strong>.
                  </span>
                </p>
              </div>

              <div className={`rounded-xl border p-3 space-y-1 ${isIOS ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Share className="w-4 h-4 text-sky-400" />
                  <span>Sur iPhone / iPad (Safari)</span>
                </div>
                <p>
                  1. Ouvrez l’adresse dans <strong>Safari</strong>.<br />
                  2. Touchez <strong>Partager</strong> (icône carré + flèche vers le haut).<br />
                  3. Touchez <strong>Sur l’écran d’accueil</strong> puis <strong>Ajouter</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-sky-400" />
                  <span>Sur PC / Mac (Chrome ou Edge)</span>
                </div>
                <p>
                  Cliquez sur le bouton vert <strong>Installer en 1 clic</strong> (ou sur l’icône à droite de la barre d’adresse).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm min-h-[44px]"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
};
