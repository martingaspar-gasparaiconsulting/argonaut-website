// ============================================================================
// ARGONAUT OS · lib/landingpages.ts — reine Helfer fuer den Landingpage-Bauer
// (Marketing-Autopilot · LP Paket 1 + 1b + 2)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen (node-testbar).
// ============================================================================

export type LandingpageTyp = 'newsletter' | 'beratung' | 'freebie' | 'aktion';

export type LpVorlage = {
  id: LandingpageTyp;
  name: string;
  icon: string;
  titel: string;
  untertitel: string;
  nutzen: string[];
  cta_text: string;
};

/** Zweck-Vorlagen: fertiges Gerüst mit Standard-Inhalten (frei überschreibbar). */
export const LP_VORLAGEN: LpVorlage[] = [
  {
    id: 'newsletter',
    name: 'Newsletter-Anmeldung',
    icon: '✉️',
    titel: 'Bleiben Sie auf dem Laufenden',
    untertitel: 'Neuigkeiten, Aktionen und Tipps — direkt in Ihr Postfach.',
    nutzen: ['Exklusive Angebote zuerst', 'Praktische Tipps aus der Praxis', 'Jederzeit mit einem Klick abbestellbar'],
    cta_text: 'Jetzt anmelden',
  },
  {
    id: 'beratung',
    name: 'Kostenloses Erstgespräch',
    icon: '📞',
    titel: 'Kostenloses Erstgespräch sichern',
    untertitel: 'Unverbindlich, persönlich und auf Ihre Situation zugeschnitten.',
    nutzen: ['Ehrliche Einschätzung ohne Verkaufsdruck', 'Konkrete nächste Schritte', 'Schnelle Rückmeldung'],
    cta_text: 'Gespräch anfragen',
  },
  {
    id: 'freebie',
    name: 'Gratis-Ratgeber (Freebie)',
    icon: '🎁',
    titel: 'Gratis-Ratgeber herunterladen',
    untertitel: 'Tragen Sie sich ein und erhalten Sie den Ratgeber sofort per E-Mail.',
    nutzen: ['Sofort verfügbar', 'Verständlich erklärt', 'Kostenlos und unverbindlich'],
    cta_text: 'Gratis herunterladen',
  },
  {
    id: 'aktion',
    name: 'Aktion / Angebot',
    icon: '🔥',
    titel: 'Unser aktuelles Angebot',
    untertitel: 'Nur für kurze Zeit — sichern Sie sich Ihren Vorteil.',
    nutzen: ['Begrenzt verfügbar', 'Exklusiver Vorteil', 'Einfach und schnell sichern'],
    cta_text: 'Angebot sichern',
  },
];

/** Vorlage per Typ finden (Fallback: Newsletter). */
export function vorlageFuer(typ: string | null | undefined): LpVorlage {
  return LP_VORLAGEN.find((v) => v.id === typ) ?? LP_VORLAGEN[0];
}

/**
 * Die 19 Website-Kategorien (exakt wie in branchen-verkauf.ts / KATEGORIE_ORDER).
 * Client-sichere Liste für das Branchen-Dropdown im Landingpage-Editor.
 * Die eigentliche Branchen-Copy zieht der Server aus branchen-verkauf.ts.
 */
export const LP_KATEGORIEN: string[] = [
  'Handwerk & Bau',
  'Industrie & Produktion',
  'Handel & E-Commerce',
  'Fahrzeuge & Mobilität',
  'Gastronomie, Hotellerie & Tourismus',
  'Lebensmittel & Nahversorgung',
  'Logistik & Transport',
  'IT & Technologie',
  'Energie & Umwelt',
  'Immobilien & Verwaltung',
  'Marketing, Medien & Kreativ',
  'Recht, Steuern & Finanzen',
  'Bildung & Wissenschaft',
  'Gesundheit & Wellness',
  'Sport, Beauty & Lifestyle',
  'Tiere',
  'Landwirtschaft, Garten & Forst',
  'Dienstleistungen',
  'Kultur, Soziales & Öffentliches',
];

/** Slug vereinheitlichen (Kleinbuchstaben, nur a-z 0-9 -, max 40). */
export function slugNormalisieren(roh: string | null | undefined): string {
  return (roh || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Landingpages zählen: gesamt / aktiv. */
export function zaehleLandingpages(liste: { aktiv?: boolean | null }[]): { gesamt: number; aktiv: number } {
  const l = liste || [];
  let aktiv = 0;
  for (const x of l) if (x?.aktiv) aktiv++;
  return { gesamt: l.length, aktiv };
}

export type ImpressumProfil = {
  firma_name?: string | null;
  firma_strasse?: string | null;
  firma_plz?: string | null;
  firma_ort?: string | null;
  firma_email?: string | null;
  firma_telefon?: string | null;
};

/**
 * Prüft, ob die Impressums-Pflichtangaben (§5 DDG, Minimum) vorhanden sind.
 * Kontakt zählt als erfüllt, wenn E-Mail ODER Telefon da ist.
 * Gibt { ok, fehlend[] } mit klaren deutschen Feldnamen zurück.
 */
export function impressumVollstaendig(p: ImpressumProfil | null | undefined): { ok: boolean; fehlend: string[] } {
  const prof = p || {};
  const fehlend: string[] = [];
  const hat = (w: string | null | undefined) => !!(w && w.trim());
  if (!hat(prof.firma_name)) fehlend.push('Firmenname');
  if (!hat(prof.firma_strasse)) fehlend.push('Straße & Hausnummer');
  if (!hat(prof.firma_plz)) fehlend.push('PLZ');
  if (!hat(prof.firma_ort)) fehlend.push('Ort');
  if (!hat(prof.firma_email) && !hat(prof.firma_telefon)) fehlend.push('Kontakt (E-Mail oder Telefon)');
  return { ok: fehlend.length === 0, fehlend };
}

/** Nutzen-Eingabe (Textarea, eine Zeile = ein Punkt) in ein sauberes Array wandeln. */
export function nutzenAusText(text: string | null | undefined): string[] {
  return (text || '')
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .slice(0, 12);
}

// ============================================================================
// LP Paket 2 · MEDIEN — reine Helfer (Bild-Upload-Regeln + Video-Einbettung)
// ============================================================================

/** Maximale Bildgröße für den Hero-Bild-Upload (in MB). */
export const MEDIEN_MAX_MB = 6;

/** Erlaubte Bild-Typen (MIME) für den Hero-Bild-Upload. */
export const ERLAUBTE_BILD_TYPEN: string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Passende Dateiendung zu einem erlaubten Bild-MIME (Fallback: 'bin'). */
export function bildEndungFuer(mime: string | null | undefined): string {
  switch ((mime || '').toLowerCase()) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'bin';
  }
}

/** true, wenn der MIME-Typ ein erlaubtes Bild ist. */
export function istErlaubtesBild(mime: string | null | undefined): boolean {
  return ERLAUBTE_BILD_TYPEN.includes((mime || '').toLowerCase());
}

/**
 * Nur echte http(s)-URLs durchlassen (gegen javascript:/data: etc.), gekappt.
 * Leerer/ungültiger Wert -> '' (wird beim Speichern zu NULL).
 */
export function sichereMedienUrl(roh: string | null | undefined): string {
  const s = (roh || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return '';
  return s.slice(0, 500);
}

export type VideoTyp = 'youtube' | 'vimeo' | 'datei' | 'unbekannt';

/**
 * Wandelt einen eingegebenen Video-Link in eine einbettbare Form um.
 *   - YouTube (watch / youtu.be / embed / shorts / live)  -> www.youtube.com/embed/<id>
 *   - Vimeo   (vimeo.com/<zahl> / player.vimeo.com/...)    -> player.vimeo.com/video/<id>
 *   - direkte Videodatei (.mp4/.webm/.ogg)                 -> die URL selbst (typ 'datei')
 *   - sonst                                                 -> typ 'unbekannt', embedUrl null
 * Rein & node-testbar; kein Netzwerk.
 */
export function videoEinbettung(roh: string | null | undefined): { typ: VideoTyp; embedUrl: string | null } {
  const url = (roh || '').trim();
  if (!url) return { typ: 'unbekannt', embedUrl: null };

  const yt = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );
  if (yt) return { typ: 'youtube', embedUrl: `https://www.youtube.com/embed/${yt[1]}` };

  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
  if (vm) return { typ: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vm[1]}` };

  if (/^https?:\/\/[^\s]+\.(mp4|webm|ogg)(\?[^\s]*)?$/i.test(url)) {
    return { typ: 'datei', embedUrl: url };
  }

  return { typ: 'unbekannt', embedUrl: null };
}

/** Kurzer, deutscher Klartext-Hinweis zum erkannten Video-Typ (für den Editor). */
export function videoHinweis(roh: string | null | undefined): string {
  if (!(roh || '').trim()) return '';
  const { typ } = videoEinbettung(roh);
  switch (typ) {
    case 'youtube': return '✓ YouTube-Video erkannt';
    case 'vimeo': return '✓ Vimeo-Video erkannt';
    case 'datei': return '✓ Video-Datei erkannt';
    default: return '⚠️ Link nicht erkannt — bitte einen YouTube-/Vimeo-Link oder eine .mp4-Adresse verwenden.';
  }
}
