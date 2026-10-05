// ============================================================================
// ARGONAUT OS · lib/verzeichnisEintrag.ts  (Stufe 3 · B5 Branchenverzeichnis-Eintrag, Paket 206)
//
// Reine Logik (ohne Datenbank): bereitet aus den Firmendaten (web_ci + Branche)
// einen Eintrag für Online-Verzeichnisse vor — überall GENAU GLEICH
// geschrieben (Name, Adresse, Telefon). Uneinheitliche Angaben in
// verschiedenen Verzeichnissen kosten bei lokalen Suchen Sichtbarkeit.
//
// Bewusst: ARGONAUT trägt NICHT selbst ein. Die Verzeichnisse haben keine
// offene Schnittstelle für Einträge, und jeder Eintrag braucht die Bestätigung
// des Inhabers (Postkarte, Anruf, Konto). Der Betrieb kopiert die vorbereiteten
// Felder mit einem Klick und hakt ab, wo er eingetragen ist.
// ============================================================================

export type Firmendaten = {
  firma?: string | null;
  slogan?: string | null;
  ueber_uns?: string | null;
  kernsaetze?: string | null;
  telefon?: string | null;
  email?: string | null;
  web?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  oeffnungszeiten?: string | null;
  logo_url?: string | null;
};

export type Verzeichnis = {
  key: string;
  name: string;
  url: string;
  /** Höchstlänge der Beschreibung in Zeichen (Richtwert des Verzeichnisses). */
  maxBeschreibung: number;
  hinweis: string;
};

/** Die wichtigsten kostenlosen Grundeinträge für Betriebe in Deutschland. */
export const VERZEICHNISSE: Verzeichnis[] = [
  { key: 'google', name: 'Google Unternehmensprofil', url: 'https://business.google.com', maxBeschreibung: 750, hinweis: 'Wichtigster Eintrag: erscheint in der Google-Suche und in Google Maps. Bestätigung meist per Postkarte, Anruf oder Video.' },
  { key: 'bing', name: 'Bing Places', url: 'https://www.bingplaces.com', maxBeschreibung: 750, hinweis: 'Kann ein bestätigtes Google-Profil übernehmen — dann nur noch prüfen.' },
  { key: 'apple', name: 'Apple Business Connect', url: 'https://businessconnect.apple.com', maxBeschreibung: 500, hinweis: 'Für Apple Karten und Siri auf iPhones.' },
  { key: 'gelbeseiten', name: 'Gelbe Seiten', url: 'https://www.gelbeseiten.de', maxBeschreibung: 500, hinweis: 'Grundeintrag kostenlos; bezahlte Zusatzpakete sind freiwillig.' },
  { key: 'dasoertliche', name: 'Das Örtliche', url: 'https://www.dasoertliche.de', maxBeschreibung: 500, hinweis: 'Grundeintrag kostenlos; bezahlte Zusatzpakete sind freiwillig.' },
  { key: '11880', name: '11880.com', url: 'https://www.11880.com', maxBeschreibung: 500, hinweis: 'Grundeintrag kostenlos; bezahlte Zusatzpakete sind freiwillig.' },
];

export const VERZEICHNIS_KEYS = VERZEICHNISSE.map((v) => v.key);

const s = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Telefon einheitlich im internationalen Format: „07031 123456" -> „+49 7031 123456".
 * Unbekannte Formate bleiben, wie sie sind (nichts erfinden).
 */
export function telefonEinheitlich(roh: unknown): string {
  const t = s(roh);
  if (!t) return '';
  const ohneNull = t.replace(/\(\s*0\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let national: string;
  if (/^\+49/.test(ohneNull)) national = '0' + ohneNull.slice(3).trim();
  else if (/^0049/.test(ohneNull)) national = '0' + ohneNull.slice(4).trim();
  else if (/^(\+|00)/.test(ohneNull)) return t; // Ausland: so lassen
  else national = ohneNull;
  // Mit erkennbarer Vorwahl: 07031 123456 · 07031/123456 · (07031) 12 34 56
  const m = national.match(/^\(?0(\d{2,5})\)?[\s/\-]+([\d][\d\s/\-]*)$/);
  if (m) {
    const nummer = m[2].replace(/\D/g, '');
    if (nummer.length >= 3) return `+49 ${m[1]} ${nummer}`;
  }
  const ziffern = national.replace(/\D/g, '');
  if (/^0[1-9]\d{5,12}$/.test(ziffern) && !/[^\d\s/\-()]/.test(national)) return `+49 ${ziffern.slice(1)}`;
  return t;
}

/** Website mit https:// (ohne Schrägstrich am Ende). */
export function webEinheitlich(roh: unknown): string {
  let w = s(roh);
  if (!w) return '';
  if (!/^https?:\/\//i.test(w)) w = 'https://' + w;
  return w.replace(/\/+$/, '');
}

/** Text auf höchstens max Zeichen kürzen — am Satz- oder Wortende, nie mitten im Wort. */
export function kuerzen(text: unknown, max: number): string {
  const t = s(text);
  if (t.length <= max) return t;
  const stueck = t.slice(0, max);
  const satz = Math.max(stueck.lastIndexOf('. '), stueck.lastIndexOf('! '), stueck.lastIndexOf('? '));
  if (satz >= max * 0.5) return stueck.slice(0, satz + 1);
  const wort = stueck.lastIndexOf(' ');
  return (wort > 0 ? stueck.slice(0, wort) : stueck).replace(/[,;:\-–]$/, '').trim();
}

/** Beschreibung aus dem Firmenwissen: Über uns, sonst Slogan + Kernsätze. */
export function beschreibung(ci: Firmendaten, max: number): string {
  const ueber = s(ci.ueber_uns);
  const basis = ueber || [s(ci.slogan), s(ci.kernsaetze)].filter(Boolean).join(' ');
  return kuerzen(basis, max);
}

export type Feld = { key: string; label: string; wert: string; pflicht: boolean };

export type Eintrag = {
  felder: Feld[];
  /** Pflichtfelder, die noch fehlen (Name der Anzeige). */
  luecken: string[];
  /** Name, Adresse, Telefon als ein Block — überall genau so eintragen. */
  napBlock: string;
};

/** Der vorbereitete Eintrag aus Firmendaten + Branche. */
export function baueEintrag(ci: Firmendaten | null | undefined, branche: unknown, maxBeschreibung = 750): Eintrag {
  const c = ci ?? {};
  const adresse = [s(c.strasse), [s(c.plz), s(c.ort)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const felder: Feld[] = [
    { key: 'firma', label: 'Firmenname', wert: s(c.firma), pflicht: true },
    { key: 'kategorie', label: 'Kategorie / Branche', wert: s(branche), pflicht: true },
    { key: 'strasse', label: 'Straße und Hausnummer', wert: s(c.strasse), pflicht: true },
    { key: 'plz', label: 'PLZ', wert: s(c.plz), pflicht: true },
    { key: 'ort', label: 'Ort', wert: s(c.ort), pflicht: true },
    { key: 'telefon', label: 'Telefon', wert: telefonEinheitlich(c.telefon), pflicht: true },
    { key: 'web', label: 'Website', wert: webEinheitlich(c.web), pflicht: false },
    { key: 'email', label: 'E-Mail', wert: s(c.email).toLowerCase(), pflicht: false },
    { key: 'oeffnungszeiten', label: 'Öffnungszeiten', wert: s(c.oeffnungszeiten), pflicht: false },
    { key: 'beschreibung', label: 'Beschreibung', wert: beschreibung(c, maxBeschreibung), pflicht: false },
  ];
  const luecken = felder.filter((f) => f.pflicht && !f.wert).map((f) => f.label);
  const napBlock = [s(c.firma), adresse, telefonEinheitlich(c.telefon)].filter(Boolean).join('\n');
  return { felder, luecken, napBlock };
}

// ---------------------------------------------------------------------------
// Abhak-Stand je Verzeichnis (gespeichert in web_ci.verzeichnis_status)
// ---------------------------------------------------------------------------

export type VerzeichnisStand = { eingetragen_am: string | null; link: string };
export type StandListe = Record<string, VerzeichnisStand>;

/** Gespeicherten Stand lesen — nur bekannte Verzeichnisse, nur saubere Werte. */
export function leseStand(roh: unknown): StandListe {
  const aus: StandListe = {};
  const o = roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  for (const key of VERZEICHNIS_KEYS) {
    const e = o[key] && typeof o[key] === 'object' ? (o[key] as Record<string, unknown>) : null;
    if (!e) continue;
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(e.eingetragen_am ?? '')) ? String(e.eingetragen_am) : null;
    aus[key] = { eingetragen_am: datum, link: pruefeLink(e.link) ?? '' };
  }
  return aus;
}

/** Link zum eigenen Eintrag: nur http(s), höchstens 500 Zeichen. null = ungültig. */
export function pruefeLink(roh: unknown): string | null {
  const t = s(roh);
  if (!t) return '';
  if (t.length > 500 || !/^https?:\/\/[^\s<>"']+$/i.test(t)) return null;
  return t;
}

export type StandAenderung =
  | { ok: true; stand: StandListe }
  | { ok: false; fehler: string };

/** Einen Verzeichnis-Stand setzen (abhaken, Haken entfernen, Link ändern). */
export function aendereStand(alt: StandListe, key: unknown, eingetragen: unknown, link: unknown, heute: string): StandAenderung {
  const k = String(key ?? '');
  if (!VERZEICHNIS_KEYS.includes(k)) return { ok: false, fehler: 'Unbekanntes Verzeichnis.' };
  const l = pruefeLink(link);
  if (l == null) return { ok: false, fehler: 'Bitte einen gültigen Link mit https:// angeben.' };
  const neu: StandListe = { ...alt };
  if (eingetragen === true) {
    neu[k] = { eingetragen_am: alt[k]?.eingetragen_am ?? heute, link: l };
  } else {
    neu[k] = { eingetragen_am: null, link: l };
  }
  return { ok: true, stand: neu };
}

export function fortschritt(stand: StandListe): { erledigt: number; gesamt: number } {
  return { erledigt: VERZEICHNIS_KEYS.filter((k) => !!stand[k]?.eingetragen_am).length, gesamt: VERZEICHNIS_KEYS.length };
}
