// ============================================================================
// ARGONAUT OS · lib/markeCi.ts — die Marke des BETRIEBS für Kundendokumente
//
// WARUM ES DIESE DATEI GIBT
// Das Rechnungs-PDF trägt seit dem 11.08. Logo und Farben des Betriebs. Für
// Angebot, Mahnung und Auftragsbestätigung stand dieselbe Rechnung bisher
// dreimal nicht da: Navy und Gold waren fest verdrahtet, und auf der
// Auftragsbestätigung stand sogar „ARGONAUT OS" auf dem Kundendokument.
//
// Ab hier holen sich alle Ausgangsdokumente ihre Marke aus EINER Funktion.
// Kommt eine weitere Stufe dazu (Kundenportal, E-Mails, Lieferschein), gibt es
// nichts Neues zu erfinden — nur baueMarke() aufrufen.
//
// SICHERHEIT: Die Farbwerte landen in einem <style>-Block. Ein Betrieb, der in
// sein Farbfeld etwas anderes als eine Farbe schreibt (ob aus Versehen oder
// mit Absicht), koennte damit das ganze Blatt zerschiessen. Deshalb wird jeder
// Wert geprueft: NUR #rgb oder #rrggbb kommen durch, alles andere faellt
// stillschweigend auf die ARGONAUT-Standardfarbe zurueck. Das Dokument sieht
// dann normal aus, statt kaputt.
//
// Reine Rechenlogik: keine Hooks, kein Supabase, keine React-Importe — damit
// sie sich mit `node --test` pruefen laesst.
// ============================================================================

/** So kommt das CI aus der Tabelle web_ci (ein Datensatz je Betrieb). */
export type CiRoh = {
  firma?: string | null;
  logo_url?: string | null;
  farbe_primaer?: string | null;
  farbe_sekundaer?: string | null;
  farbe_akzent?: string | null;
} | null | undefined;

/** Das, was ein Dokument zum Zeichnen braucht. */
export type Marke = {
  /** Dunkle Leitfarbe: Tabellenkopf, Linien, Ueberschriften. */
  primaer: string;
  /** Akzentfarbe: Trennlinien, Summenzeile, Hervorhebungen. */
  akzent: string;
  /** Logo-URL oder leer. Muss vom Aufrufer noch escaped werden. */
  logo: string;
  /** Firmenname fuer den Fuss. Leer, wenn nichts bekannt ist. */
  name: string;
  /** Lesbare Textfarbe auf `primaer` — weiss oder dunkel. */
  theadText: string;
};

/** Die ARGONAUT-Standardfarben, wenn ein Betrieb kein eigenes CI hinterlegt hat. */
export const MARKE_PRIMAER_STANDARD = '#0A1628';
export const MARKE_AKZENT_STANDARD = '#C9A84C';

/** Spaltenliste fuer die web_ci-Abfrage — an einer Stelle, damit sie nie auseinanderlaeuft. */
export const CI_SPALTEN = 'firma, logo_url, farbe_primaer, farbe_sekundaer, farbe_akzent';

/**
 * Ist das eine echte Hex-Farbe? Nur #rgb und #rrggbb gelten.
 * Alles andere — Farbnamen, rgb(), Leerzeichen, geschweifte Klammern — ist
 * fuer uns keine Farbe. Genau das haelt Unsinn aus dem <style>-Block heraus.
 */
export function istFarbe(wert: unknown): boolean {
  const s = String(wert ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

/** Farbe uebernehmen, wenn sie eine ist — sonst der Standard. */
export function farbeOderStandard(wert: unknown, standard: string): string {
  return istFarbe(wert) ? String(wert).trim() : standard;
}

/**
 * Gut lesbare Textfarbe fuer einen farbigen Hintergrund.
 * Helle Marke -> dunkler Text, dunkle Marke -> weisser Text. Sonst steht auf
 * einem gelben Tabellenkopf weisse Schrift, die niemand lesen kann.
 */
export function lesbarerText(hex: string): string {
  const s = String(hex || '').trim().replace('#', '');
  const voll = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (voll.length < 6) return '#ffffff';
  const r = parseInt(voll.slice(0, 2), 16);
  const g = parseInt(voll.slice(2, 4), 16);
  const b = parseInt(voll.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#ffffff';
  const helligkeit = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return helligkeit > 0.6 ? '#0A1628' : '#ffffff';
}

/**
 * Nur http(s)-Logos zulassen. Ein `javascript:`- oder `data:`-Eintrag hat auf
 * einem Kundendokument nichts verloren; im Zweifel lieber kein Logo.
 */
export function logoOderLeer(wert: unknown): string {
  const s = String(wert ?? '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * Die Marke fuer ein Kundendokument.
 *
 * @param ci            Datensatz aus web_ci (oder null — dann Standardlayout)
 * @param ersatzName    Firmenname aus dem Profil, falls im CI keiner steht
 */
export function baueMarke(ci: CiRoh, ersatzName?: string | null): Marke {
  const primaer = farbeOderStandard(ci?.farbe_primaer, MARKE_PRIMAER_STANDARD);
  const akzent = farbeOderStandard(ci?.farbe_akzent, MARKE_AKZENT_STANDARD);
  const name = String(ci?.firma ?? '').trim() || String(ersatzName ?? '').trim();
  return {
    primaer,
    akzent,
    logo: logoOderLeer(ci?.logo_url),
    name,
    theadText: lesbarerText(primaer),
  };
}
