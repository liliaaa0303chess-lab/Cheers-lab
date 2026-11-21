// Filtre de modération tout public (FR + EN) partagé client & serveur

const BLOCKED_WORDS_STRICT: string[] = [
  // Français - injures / contenu vulgaire / sexuel / haineux
  'putain', 'pute', 'salope', 'connard', 'connasse', 'encule', 'enculer',
  'fdp', 'ntm', 'tg', 'pd', 'pede', 'gouine', 'tapette', 'bougnoule',
  'negro', 'negre', 'youpin', 'bamboula', 'raton', 'sale juif', 'sale arabe',
  'merde', 'chiotte', 'chier', 'couille', 'couilles', 'bite', 'bites', 'zob',
  'chatte', 'vagin', 'penis', 'sexe', 'porno', 'porn', 'xxx', 'hentai',
  'nude', 'nudes', 'fellation', 'sodomie', 'branleur', 'branler', 'orgasme',
  'viol', 'violer', 'violeur', 'pedophile', 'pedophilie', 'inceste',
  'nazi', 'hitler', 'swastika', 'suicide', 'tuetoimeme', 'creve',
  'batard', 'enfoire', 'ordure', 'petasse', 'pouffiasse', 'garce',
  'trouduc', 'trouducul', 'ducon', 'debile mental', 'mongolien', 'trisomique',
  'niq', 'nique', 'niquer', 'nik', 'ta gueule', 'ferme ta gueule',
  // Anglais - injures / contenu NSFW / haineux
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'shit', 'bitch',
  'asshole', 'bastard', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut',
  'faggot', 'nigger', 'nigga', 'retard', 'retarded', 'rape', 'rapist',
  'boobs', 'tits', 'milf', 'nsfw', 'onlyfans', 'kill yourself', 'kys',
];

const SPACED_INTERCALATED_PATTERNS: RegExp[] = [
  /\bp[\W_]*u[\W_]*t[\W_]*a[\W_]*i[\W_]*n\b/i,
  /\bf[\W_]*u[\W_]*c[\W_]*k\b/i,
  /\bs[\W_]*a[\W_]*l[\W_]*o[\W_]*p[\W_]*e\b/i,
  /\be[\W_]*n[\W_]*c[\W_]*u[\W_]*l[\W_]*e\b/i,
  /\bp[\W_]*o[\W_]*r[\W_]*n[\W_]*o?\b/i,
  /\bs[\W_]*e[\W_]*x[\W_]*e?\b/i,
];

const EXTERNAL_LINK_PATTERN =
  /(?:https?:\/\/|www\.|discord\.gg\/|t\.me\/|bit\.ly\/|tinyurl\.com\/|\b[a-z0-9-]{2,}\.(?:com|fr|net|org|io|gg|xyz|tv|me|be|ch|ca)\b)/i;

function normalizeForModeration(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

export function validateFamilyFriendlyText(
  text: string,
  options: { blockLinks?: boolean; label?: string } = {}
): ModerationResult {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ok: true };

  if (options.blockLinks && EXTERNAL_LINK_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason: `${options.label || 'Ce texte'} ne peut pas contenir de lien externe ou d’adresse web (espace tout public).`,
    };
  }

  for (const pat of SPACED_INTERCALATED_PATTERNS) {
    if (pat.test(trimmed)) {
      return {
        ok: false,
        reason: `${options.label || 'Ce texte'} contient un terme inapproprié pour un espace tout public.`,
      };
    }
  }

  const normalized = normalizeForModeration(trimmed);
  const words = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const banned of BLOCKED_WORDS_STRICT) {
    const pattern = new RegExp(`\\b${banned.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(words)) {
      return {
        ok: false,
        reason: `${options.label || 'Ce texte'} contient un terme inapproprié pour un espace tout public.`,
      };
    }
  }

  // Also detect very short pure-abbreviation profanity inside underscores/numbers (e.g. "user_fdp_1")
  const rawTokens = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  for (const tok of rawTokens) {
    if (BLOCKED_WORDS_STRICT.includes(tok)) {
      return {
        ok: false,
        reason: `${options.label || 'Ce texte'} contient un terme inapproprié pour un espace tout public.`,
      };
    }
  }

  return { ok: true };
}

export function isContentFamilyFriendly(text: string, blockLinks = true): boolean {
  return validateFamilyFriendlyText(text, { blockLinks }).ok;
}

export function generateGuestNickname(): string {
  const prefixes = ['Stratège', 'Cavalier', 'Fou', 'Tacticien', 'Pion', 'Explorateur'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = 100 + Math.floor(Math.random() * 899);
  return `${prefix}_${num}`;
}
