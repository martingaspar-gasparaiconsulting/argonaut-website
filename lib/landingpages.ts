// ============================================================================
// ARGONAUT OS · lib/landingpages.ts — reine Helfer fuer den Landingpage-Bauer
// (Marketing-Autopilot · LP Paket 1)
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
