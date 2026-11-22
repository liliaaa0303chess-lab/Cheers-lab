const CUSTOM_PUBLIC_URL_KEY = 'chesslab_public_share_url_v1';
const DEFAULT_EXTERNAL_APP_URL = 'https://chess-lab.onrender.com';

function isHostedInAiStudioOrLocal(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('ais-dev-') ||
    host.startsWith('ais-pre-') ||
    host.endsWith('.run.app') ||
    host.includes('aistudio.google.com')
  );
}

export function normalizeAppOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getStoredPublicAppUrlOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(CUSTOM_PUBLIC_URL_KEY);
    return saved ? normalizeAppOrigin(saved) : null;
  } catch {
    return null;
  }
}

export function setStoredPublicAppUrlOverride(rawUrl: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!rawUrl.trim()) {
      localStorage.removeItem(CUSTOM_PUBLIC_URL_KEY);
      return null;
    }
    const normalized = normalizeAppOrigin(rawUrl);
    if (normalized) {
      localStorage.setItem(CUSTOM_PUBLIC_URL_KEY, normalized);
      return normalized;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function getPublicAppUrl(): string {
  const override = getStoredPublicAppUrlOverride();
  if (override) return override;

  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_APP_URL
      ? normalizeAppOrigin(String(import.meta.env.VITE_PUBLIC_APP_URL))
      : null;
  if (envUrl) return envUrl;

  if (typeof window !== 'undefined' && window.location) {
    if (!isHostedInAiStudioOrLocal(window.location.hostname)) {
      return window.location.origin;
    }
  }

  return DEFAULT_EXTERNAL_APP_URL;
}
