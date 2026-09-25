// ============================================================================
// ARGONAUT OS · lib/guideLage.ts — der Guide nach Rolle, Rang und Datenstand (Paket A3)
//
// WARUM
// Bis A2 sagte der Guide auf jeder Seite dasselbe — egal, ob der Chef oder
// ein Mitarbeiter davorsitzt, ob schon Kunden angelegt sind oder der Betrieb
// gerade erst angefangen hat. Martins Befund vom 25.09.: „Man weiss nie, wo
// man anfangen soll und wo die Eintraege ankommen."
//
// Diese Datei nimmt das Wissen der Seite (lib/guideWissen.ts) und legt drei
// Dinge darueber:
//   1. ROLLE      — pflegt der Chef die Seite, sagt der Guide dem Mitarbeiter
//                   das offen, statt ihn Schritte machen zu lassen, die er
//                   nicht darf.
//   2. DATENSTAND — fehlt etwas, das die Seite voraussetzt (keine Kunden,
//                   keine Mitarbeiter, Firmendaten unvollstaendig), kommt
//                   zuerst dieser Hinweis. Dazu der naechste offene Schritt
//                   der Startreihenfolge.
//   3. RANG       — der Lernrang aus der Academy (Erste Fahrt bis Kapitaen)
//                   und wie viele Kurse bis zum naechsten fehlen.
//
// FESTE REGEL: Der Assistent SAGT nur. Er traegt nie selbst etwas ein.
// Unbekannter Datenstand (undefined) heisst: nichts behaupten. Lieber keinen
// Hinweis als einen falschen.
//
// Reine Logik: KEINE Hooks, KEIN Supabase. Test: tests/guideLageA3.test.mjs.
// ============================================================================

import type { GuideInhalt } from './kiGuideTexte';
import { modulGuide, type GuideNav } from './kiGuideModule';
import {
  wissenFuer, WER_TEXT, START_CHEF, START_MITARBEITER, UEBUNGSWELT_HINWEIS,
  type SeitenWissen, type StartSchritt, type Verweis, type Wer,
} from './guideWissen';
import { medailleFuer, naechsteMedaille } from './academy';
import { lernzielSatz } from './lehrplan';

export type Rolle = 'chef' | 'mitarbeiter';

/**
 * Was der Guide ueber den Betrieb weiss. Jedes Feld ist optional: Fehlt es,
 * wurde es nicht geladen (oder die Abfrage scheiterte) — dann schweigt der
 * Guide dazu.
 */
export type Datenstand = {
  /** Firmendaten ohne Fehler (dieselbe Pruefung wie auf der Einrichtungsseite). */
  firmaOk?: boolean;
  /** Uebungswelt ist geladen. */
  uebungswelt?: boolean;
  kunden?: number;
  mitarbeiter?: number;
  /** Mitarbeiter mit Zugang zu „Mein Bereich" (Einladung angenommen). */
  eingeladen?: number;
  /** Eigene Zeiterfassungs-Eintraege. */
  zeiten?: number;
  /** Eigene abgeschlossene Academy-Kurse. */
  kurse?: number;
};

export type RangLage = {
  /** null = noch kein Kurs abgeschlossen. */
  name: string | null;
  icon: string;
  kurse: number;
  naechster: string | null;
  fehlen: number;
  text: string;
};

export type GuideLage = GuideInhalt & {
  rolle: Rolle;
  /** Wer traegt hier ein — kurz („Traegt der Chef ein"). */
  werKurz: string | null;
  /** Ausfuehrlich, wer eintraegt und loeschen darf. */
  werText: string | null;
  /** Nur gesetzt, wenn die Rolle nicht passt (Mitarbeiter auf einer Chef-Seite). */
  rollenHinweis: string | null;
  /** Was die Seite voraussetzt und nachweislich noch fehlt. */
  fehlt: Verweis[];
  /** Naechster offener Schritt der Startreihenfolge (null = alles erledigt oder unbekannt). */
  naechster: StartSchritt | null;
  /** Hinweis auf die Uebungswelt, solange ein Chef noch ganz am Anfang steht. */
  uebungsHinweis: string | null;
  rang: RangLage | null;
  /** Paket A4: Lernziel der aktuellen Etappe aus lib/lehrplan.ts (null = Kurse unbekannt). */
  lernziel: string | null;
  /** Alles fuer die aufklappbaren Details. */
  alleSchritte: string[];
  probe: SeitenWissen['probe'] | null;
  landetIn: Verweis[];
};

// ---------------------------------------------------------------------------
// Rolle
// ---------------------------------------------------------------------------

/** Kein mitarbeiter-Datensatz = Chef (gleiche Regel wie lib/rechte.ts). */
export function rolleAus(hatMitarbeiterDatensatz: boolean): Rolle {
  return hatMitarbeiterDatensatz ? 'mitarbeiter' : 'chef';
}

/**
 * Der Satz fuer den Mitarbeiter, wenn die Seite dem Chef gehoert.
 * Fuer den Chef und fuer passende Seiten: null.
 */
export function rollenHinweis(wer: Wer | null | undefined, rolle: Rolle): string | null {
  if (rolle !== 'mitarbeiter' || !wer) return null;
  if (wer === 'chef') {
    return 'Diese Seite pflegt der Chef. Sie können nachsehen, soweit Ihre Freigabe reicht — eintragen und ändern macht der Chef. Fehlt Ihnen etwas oder stimmt etwas nicht, sagen Sie es ihm.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Datenstand: Voraussetzungen und naechster Schritt
// ---------------------------------------------------------------------------

/**
 * Welche Menue-Seite woran erkennt, dass sie „erledigt" ist.
 * true = vorhanden, false = fehlt, undefined = unbekannt (dann schweigen).
 */
export function seiteErledigt(href: string, stand: Datenstand): boolean | undefined {
  const anz = (n: number | undefined) => (typeof n === 'number' ? n > 0 : undefined);
  switch (href) {
    case '/dashboard/crm':
    case '/dashboard/kunde-akte':
      return anz(stand.kunden);
    case '/dashboard/personal':
      return anz(stand.mitarbeiter);
    case '/dashboard/einstellungen':
      return stand.firmaOk;
    default:
      return undefined;
  }
}

/** Was die Seite unter „vorher" nennt und nachweislich noch fehlt. */
export function fehlendeVoraussetzungen(wissen: SeitenWissen | null | undefined, stand: Datenstand): Verweis[] {
  if (!wissen?.vorher) return [];
  return wissen.vorher.filter((v) => !!v.href && seiteErledigt(v.href, stand) === false);
}

/**
 * Ob ein Schritt der Startreihenfolge erledigt ist.
 * Die Reihenfolge der Schritte steht in lib/guideWissen.ts (START_CHEF /
 * START_MITARBEITER); hier steht nur, woran man das Erledigen erkennt.
 */
function startErledigt(rolle: Rolle, index: number, stand: Datenstand): boolean | undefined {
  const anz = (n: number | undefined) => (typeof n === 'number' ? n > 0 : undefined);
  if (rolle === 'chef') {
    switch (index) {
      case 0: return stand.firmaOk; // Firmendaten
      case 1: {
        // Uebungswelt: erledigt, wenn geladen ODER der Betrieb schon echte Kunden hat
        if (stand.uebungswelt === true) return true;
        const k = anz(stand.kunden);
        if (k === true) return true;
        return stand.uebungswelt === false && k === false ? false : undefined;
      }
      // Mitarbeiter anlegen: Ohne Mitarbeiter laesst sich nicht unterscheiden, ob
      // der Chef noch keine angelegt hat oder allein arbeitet. Deshalb draengt
      // der Guide hier nicht (undefined) — sonst stuende beim Ein-Mann-Betrieb
      // fuer immer „Mitarbeiter anlegen" als naechster Schritt.
      case 2: return stand.mitarbeiter && stand.mitarbeiter > 0 ? true : undefined;
      case 3: // Rechte festlegen — erkennbar erst an der Einladung
      case 4: {
        // Ein-Mann-Betrieb ohne Mitarbeiter: Rechte und Einladung entfallen
        if (stand.mitarbeiter === 0) return true;
        return anz(stand.eingeladen);
      }
      case 5: return anz(stand.kunden); // Kunden
      default: return undefined;
    }
  }
  switch (index) {
    case 1: return anz(stand.zeiten); // Zeiterfassung
    case 5: return anz(stand.kurse); // Academy
    default: return undefined; // Mein Bereich, Einsaetze, Formulare, Chat: nicht messbar
  }
}

/**
 * Der erste Schritt der Startreihenfolge, der nachweislich noch offen ist.
 * Schritte, die sich nicht messen lassen, werden uebersprungen — der Guide
 * draengt niemanden zu etwas, das er vielleicht laengst erledigt hat.
 */
export function naechsterStartSchritt(rolle: Rolle, stand: Datenstand): StartSchritt | null {
  const liste = rolle === 'chef' ? START_CHEF : START_MITARBEITER;
  for (let i = 0; i < liste.length; i++) {
    if (startErledigt(rolle, i, stand) === false) return liste[i];
  }
  return null;
}

/** Wie viele messbare Startschritte erledigt sind — fuer den Ring am Guide. */
export function startFortschritt(rolle: Rolle, stand: Datenstand): number {
  const liste = rolle === 'chef' ? START_CHEF : START_MITARBEITER;
  let messbar = 0;
  let fertig = 0;
  for (let i = 0; i < liste.length; i++) {
    const e = startErledigt(rolle, i, stand);
    if (e === undefined) continue;
    messbar++;
    if (e) fertig++;
  }
  return messbar === 0 ? -1 : Math.round((fertig / messbar) * 100);
}

// ---------------------------------------------------------------------------
// Rang (Academy)
// ---------------------------------------------------------------------------

export function rangLage(kurse: number | undefined): RangLage | null {
  if (typeof kurse !== 'number' || !Number.isFinite(kurse)) return null;
  const n = Math.max(0, Math.floor(kurse));
  const jetzt = medailleFuer(n);
  const naechst = naechsteMedaille(n);
  const fehlen = naechst ? naechst.abKursen - n : 0;
  let text: string;
  if (!jetzt) {
    text = naechst
      ? `Noch kein Rang — ${fehlen === 1 ? 'ein Kurs' : `${fehlen} Kurse`} in der Academy bis „${naechst.rang}".`
      : 'Noch kein Rang.';
  } else if (naechst) {
    text = `Rang „${jetzt.rang}" — noch ${fehlen === 1 ? 'ein Kurs' : `${fehlen} Kurse`} bis „${naechst.rang}".`;
  } else {
    text = `Rang „${jetzt.rang}" — der höchste Rang an Bord.`;
  }
  return {
    name: jetzt?.rang ?? null,
    icon: jetzt?.icon ?? '⚓',
    kurse: n,
    naechster: naechst?.rang ?? null,
    fehlen,
    text,
  };
}

// ---------------------------------------------------------------------------
// Alles zusammen
// ---------------------------------------------------------------------------

/** Seiten, auf denen der naechste Startschritt immer genannt wird. */
const START_SEITEN = new Set(['/dashboard', '/dashboard/heute', '/dashboard/onboarding', '/dashboard/mein-bereich']);

export function guideLage(
  pfad: string | null | undefined,
  links: readonly GuideNav[] | null | undefined,
  rolle: Rolle,
  stand: Datenstand = {},
): GuideLage {
  const basis = modulGuide(pfad, links);
  const w = wissenFuer(pfad);
  const wissen = w?.wissen ?? null;
  const hier = w?.href ?? String(pfad ?? '');

  const rHinweis = rollenHinweis(wissen?.wer, rolle);
  const fehlt = fehlendeVoraussetzungen(wissen, stand);
  const naechsterRoh = naechsterStartSchritt(rolle, stand);
  // Auf der Seite, zu der der Schritt fuehrt, ist er kein „Weiter" mehr.
  // Auf Start-Seiten immer, sonst nur, wenn diese Seite selbst nichts vermisst
  // (dann steht der fehlende Schritt schon als „Zuerst: …" im Knopf).
  const naechster = naechsterRoh && naechsterRoh.href !== hier
    && (START_SEITEN.has(hier) || fehlt.length === 0) ? naechsterRoh : null;

  const uebungsHinweis = rolle === 'chef' && stand.uebungswelt === false && stand.kunden === 0
    ? UEBUNGSWELT_HINWEIS : null;

  // Die Nachricht: fehlt eine Voraussetzung, steht das zuerst.
  let nachricht = basis.nachricht;
  let stimmung = basis.stimmung;
  let aktionText = basis.aktionText;
  let aktionHref = basis.aktionHref;
  if (fehlt.length > 0) {
    const namen = fehlt.map((v) => `„${v.text}"`).join(' und ');
    nachricht = `Bevor es hier losgeht, fehlt noch: ${namen}. ${basis.nachricht}`;
    stimmung = 'achtung';
    aktionText = `Zuerst: ${fehlt[0].text}`;
    aktionHref = fehlt[0].href;
  } else if (rHinweis) {
    // Keine Handlungs-Aufforderung auf eine Seite, die der Mitarbeiter nicht pflegt.
    aktionText = undefined;
    aktionHref = undefined;
  }

  const fortschritt = startFortschritt(rolle, stand);

  return {
    ...basis,
    nachricht,
    stimmung,
    aktionText,
    aktionHref,
    fortschritt: fortschritt >= 0 ? fortschritt : basis.fortschritt,
    rolle,
    werKurz: wissen ? WER_TEXT[wissen.wer] : null,
    werText: wissen?.werText ?? null,
    rollenHinweis: rHinweis,
    fehlt,
    naechster,
    uebungsHinweis,
    rang: rangLage(stand.kurse),
    lernziel: typeof stand.kurse === 'number' ? lernzielSatz(rolle, stand.kurse) : null,
    alleSchritte: wissen?.schritte ?? basis.schritte,
    probe: wissen?.probe ?? null,
    landetIn: (wissen?.landetIn ?? []).filter((v) => !!v.href),
  };
}

// ---------------------------------------------------------------------------
// Hilfe fuer die Anzeige: Firmendaten aus der historisch gewachsenen profiles-Zeile
// (gleiche Zuordnung wie auf der Einrichtungsseite, nur gelesen)
// ---------------------------------------------------------------------------

function ersteTextSpalte(p: Record<string, unknown> | null, keys: string[]): string {
  if (!p) return '';
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function firmaFelderAusProfil(p: Record<string, unknown> | null): Record<string, string> {
  const w = (keys: string[]) => ersteTextSpalte(p, keys);
  return {
    firma_name: w(['firma_name', 'firma', 'company_name', 'company']),
    firma_rechtsform: w(['firma_rechtsform', 'rechtsform']),
    firma_strasse: w(['firma_strasse', 'strasse', 'adresse']),
    firma_plz: w(['firma_plz', 'plz']),
    firma_ort: w(['firma_ort', 'ort', 'stadt']),
    firma_email: w(['firma_email', 'email', 'kontakt_email']),
    firma_telefon: w(['firma_telefon', 'telefon']),
    firma_website: w(['firma_website', 'website']),
    firma_ust_id: w(['firma_ust_id', 'ust_id', 'ustid']),
    firma_steuernummer: w(['firma_steuernummer', 'steuernummer']),
    firma_iban: w(['firma_iban', 'sepa_iban', 'iban']),
    firma_bic: w(['firma_bic', 'bic']),
    firma_bank: w(['firma_bank', 'bank']),
    firma_geschaeftsfuehrer: w(['firma_geschaeftsfuehrer', 'geschaeftsfuehrer', 'inhaber']),
    firma_registergericht: w(['firma_registergericht', 'registergericht']),
    firma_hrb: w(['firma_hrb', 'hrb']),
  };
}
