// ============================================================================
// ARGONAUT OS · lib/ablaufMotor.ts — Ablauf-Baukasten, der Motor als reine Logik
// (Paket 157, 28.09.2026)
//
// Der Kern (lib/ablauf.ts) weiß, WELCHER Schritt als Nächstes kommt. Diese
// Datei entscheidet, WAS ein Schritt konkret täte — ohne Datenbank, ohne Mail:
//   · Datum-Auslöser: trifft er auf einen Vorgang zu? (wie die alten Regeln)
//   · Gilt der Auslöser nach dem Warten noch? (Rechnung inzwischen bezahlt
//     -> der Mahnlauf hört auf, statt weiter zu mahnen)
//   · Aktion planen: welcher Datensatz wird angelegt/geändert, welche Mail
//     geht an wen — oder warum wird übersprungen
//   · Zustand eines Laufs nach dem Fahrplan (fertig/wartet/freigabe/gestoppt)
//   · Deckel je Ablauf und 24 Stunden, Übernahme alter Regeln ohne Doppel
//
// Die Route /api/cron/ablaeufe holt die Daten und führt nur aus, was hier
// geplant wurde. Der Probelauf zeigt dieselben Pläne, ohne sie auszuführen.
// Rein, node-getestet.
// ============================================================================

import {
  triggerDef, pruefeGrundfilter, alsDatum, tageZwischen, alsZahl, platzhalterWerte, empfaengerAdresse,
  type Datensatz, type AutomationRegel,
} from './automation';
import {
  pruefeGruppe, fuellePlatzhalter, standardWerte, ausloeserIstWerbung, pruefeAblauf, ablaufAktion,
  type Ablauf, type Ausloeser, type SchrittAktion, type Fahrplan,
} from './ablauf';
import { werbeStatus, WERBE_STATUS_TEXT } from './segmente';

// ---------------------------------------------------------------------------
// 1) Schutzgeländer (wie beim bisherigen Automations-Motor)
// ---------------------------------------------------------------------------

/** Höchstens so viele NEUE Läufe je Ablauf in 24 Stunden (Mail-Lawine unmöglich). */
export const MAX_JE_ABLAUF = 25;
/** Höchstens so viele aktive Abläufe je Motor-Durchgang. */
export const MAX_ABLAEUFE = 200;
/** Höchstens so viele wartende Läufe werden je Durchgang fortgesetzt. */
export const MAX_FORTSETZUNGEN = 200;
/** Höchstens so viele Vorgänge je Ablauf prüfen. */
export const MAX_KANDIDATEN = 500;
/** Vorgänge, deren Auslöse-Datum länger her ist, bekommen keine Post mehr. */
export const RUECKBLICK_TAGE = 120;

/** Wo der Status einer Tabelle steht (Rechnungen tanzen aus der Reihe). */
export const STATUS_FELD: Record<string, string> = {
  rechnungen: 'zahlungsstatus', angebote: 'status', aufgaben: 'status', kontakte: 'status', projekte: 'status',
};

/** Wo das Notizfeld einer Tabelle steht. */
export const NOTIZ_FELD: Record<string, string> = {
  rechnungen: 'notizen', angebote: 'notiz', kontakte: 'notizen', aufgaben: 'beschreibung', projekte: 'beschreibung',
};

// ---------------------------------------------------------------------------
// 2) Auslöser „Datum erreicht"
// ---------------------------------------------------------------------------

export type Ziel = { tabelle: string; zielTyp: string; datumFeld: string };

/** Welche Tabelle ein Auslöser abfragt (heute nur „Datum erreicht"). */
export function ausloeserZiel(a: Ausloeser | null | undefined): Ziel | null {
  if (!a || a.art !== 'datum') return null;
  const t = triggerDef(a.trigger);
  return t ? { tabelle: t.tabelle, zielTyp: t.zielTyp, datumFeld: t.datumFeld } : null;
}

/**
 * Trifft „Datum erreicht" auf diesen Vorgang JETZT zu?
 * Reihenfolge wie bei den alten Regeln: Grundfilter -> Datum da -> Tage
 * abgelaufen -> nicht älter als der Rückblick -> Bedingungen (UND/ODER).
 */
export function datumTrifft(a: Ausloeser, satz: Datensatz, jetzt: Date): { trifft: boolean; grund: string } {
  if (a.art !== 'datum') return { trifft: false, grund: 'kein Datums-Auslöser' };
  const t = triggerDef(a.trigger);
  if (!t) return { trifft: false, grund: 'unbekannter Auslöser' };
  if (!pruefeGrundfilter(t, satz)) return { trifft: false, grund: 'Grundfilter nicht erfüllt' };
  const d = alsDatum(satz[t.datumFeld]);
  if (!d) return { trifft: false, grund: `kein Datum in „${t.datumFeld}"` };
  const tage = tageZwischen(d, jetzt);
  const warte = Math.max(0, Math.trunc(Number(a.tage) || 0));
  if (tage < warte) return { trifft: false, grund: `noch ${warte - tage} Tag(e)` };
  if (tage > RUECKBLICK_TAGE + warte) return { trifft: false, grund: 'zu alt (Rückblick)' };
  if (!pruefeGruppe(a.filter ?? null, satz)) return { trifft: false, grund: 'Bedingung nicht erfüllt' };
  return { trifft: true, grund: 'trifft zu' };
}

/**
 * Gilt der Auslöser nach dem Warten / nach der Freigabe noch?
 * Geprüft wird der GRUNDFILTER des Auslösers (Rechnung noch offen, Angebot
 * noch nicht beantwortet, Aufgabe nicht fertig …) — nicht die Start-Bedingungen:
 * die gelten nur beim Start. Sonst beendet ein Mahnlauf „nur Mahnstufe 0"
 * sich selbst, sobald er die Mahnstufe erhöht (Paket 158). Wer mitten im Lauf
 * erneut prüfen will, nimmt einen Wenn-Schritt.
 * Beispiel: Rechnung inzwischen bezahlt -> der Mahnlauf endet.
 */
export function nochGueltig(a: Ausloeser, satz: Datensatz): boolean {
  if (a.art === 'datum') {
    const t = triggerDef(a.trigger);
    return !!t && pruefeGrundfilter(t, satz);
  }
  return true;
}

/**
 * Aus den geholten Vorgängen die, für die JETZT ein neuer Lauf startet:
 * nicht schon gelaufen (EINMALIG), nicht schon von der alten Regel erledigt
 * (sonst doppelte Mahnung nach dem Umschalten), Auslöser trifft zu, Deckel.
 */
export function neueStarts<T extends Datensatz>(
  a: Ausloeser, kandidaten: T[], schonGelaufen: Set<string>, altErledigt: Set<string>, frei: number, jetzt: Date,
): { starten: T[]; faellig: number; zurueckgestellt: number } {
  const faellig = kandidaten.filter((s) => {
    const id = String(s.id ?? '');
    return id !== '' && !schonGelaufen.has(id) && !altErledigt.has(id) && datumTrifft(a, s, jetzt).trifft;
  });
  const n = Math.max(0, Math.trunc(frei));
  return { starten: faellig.slice(0, n), faellig: faellig.length, zurueckgestellt: Math.max(0, faellig.length - n) };
}

/** Wie viele neue Läufe darf ein Ablauf noch starten (je 24 Stunden)? */
export function freieStarts(inLetzten24h: number): number {
  return Math.max(0, MAX_JE_ABLAUF - Math.max(0, Math.trunc(inLetzten24h || 0)));
}

/** Läuft dieser Ablauf im Motor? Nur eingeschaltet UND fehlerfrei geprüft. */
export function laufbereit(ablauf: Ablauf): boolean {
  return ablauf.aktiv === true && pruefeAblauf(ablauf).aktivierbar;
}

/** Alte Regel -> läuft sie noch? Nein, sobald ein eingeschalteter Ablauf sie übernommen hat. */
export function regelUebernommen(regelId: string, aktiveAblaeufe: { alt_regel_id?: string | null; aktiv?: boolean }[]): boolean {
  return aktiveAblaeufe.some((a) => a.aktiv === true && !!a.alt_regel_id && a.alt_regel_id === regelId);
}

// ---------------------------------------------------------------------------
// 3) Platzhalter eines Laufs — kompatibel zu den alten Regeln
//    ({{regel}}, {{tage}}, {{datum}} aus übernommenen Texten gehen weiter)
// ---------------------------------------------------------------------------

export function laufWerte(ablauf: Pick<Ablauf, 'name' | 'ausloeser'>, satz: Datensatz, jetzt: Date): Record<string, string> {
  const basis = standardWerte(ablauf, satz, jetzt);
  if (ablauf.ausloeser?.art !== 'datum') return { ...basis, regel: ablauf.name || '' };
  const alt = platzhalterWerte({
    id: '', owner_user_id: '', name: ablauf.name || '', trigger_typ: ablauf.ausloeser.trigger,
    aktion_typ: '', wartezeit_tage: 0, aktiv: true,
  } as AutomationRegel, satz, jetzt);
  return { ...basis, ...alt, ablauf: ablauf.name || '' };
}

// ---------------------------------------------------------------------------
// 4) Eine Aktion planen — was würde sie konkret tun?
// ---------------------------------------------------------------------------

export type AktionPlan =
  | { art: 'anlegen'; tabelle: string; daten: Record<string, unknown>; meldung: string }
  | { art: 'aendern'; tabelle: string; id: string; daten: Record<string, unknown>; meldung: string }
  | { art: 'mail'; an: string; betreff: string; text: string; meldung: string }
  | { art: 'uebersprungen'; meldung: string }
  | { art: 'fehler'; meldung: string };

function nurDatum(d: Date): string { return d.toISOString().slice(0, 10); }

export function aktionPlanen(
  s: SchrittAktion, ablauf: Pick<Ablauf, 'name' | 'ausloeser'>, ziel: Ziel, ownerId: string, satz: Datensatz, jetzt: Date,
): AktionPlan {
  const def = ablaufAktion(s.aktion);
  if (!def || !def.imMotor) return { art: 'fehler', meldung: `Baustein „${s.aktion}" führt der Motor noch nicht aus` };
  const cfg = (s.config ?? {}) as Record<string, unknown>;
  const werte = laufWerte(ablauf, satz, jetzt);
  const text = (key: string) => fuellePlatzhalter(String(cfg[key] ?? ''), satz, werte);
  const zielId = String(satz.id ?? '');

  switch (s.aktion) {
    case 'aufgabe_anlegen': {
      const tage = Math.max(0, Math.trunc(alsZahl(cfg.faellig_in_tagen) ?? 0));
      const titel = text('titel').slice(0, 300) || `Ablauf: ${ablauf.name}`;
      return {
        art: 'anlegen', tabelle: 'aufgaben', meldung: `Aufgabe „${titel}"`,
        daten: {
          owner_user_id: ownerId, titel, beschreibung: text('beschreibung') || null, status: 'todo', erledigt: false,
          prioritaet: String(cfg.prioritaet ?? 'normal'), faellig_am: nurDatum(new Date(jetzt.getTime() + tage * 86400000)),
          projekt_id: ziel.zielTyp === 'projekt' ? zielId : (typeof satz.projekt_id === 'string' ? satz.projekt_id : null),
        },
      };
    }
    case 'mail_senden': {
      const an = empfaengerAdresse(satz, cfg);
      if (!an || !an.includes('@')) return { art: 'uebersprungen', meldung: 'keine E-Mail-Adresse hinterlegt' };
      // Werbung nur mit Einwilligung und ohne Widerspruch — Betriebspost (Mahnung, Angebot) läuft immer.
      if (ausloeserIstWerbung(ablauf.ausloeser) && cfg.an !== 'feste_adresse') {
        const st = werbeStatus(satz, 'kontakte');
        if (st !== 'erlaubt') return { art: 'uebersprungen', meldung: `kein Werbeversand: ${WERBE_STATUS_TEXT[st]}` };
      }
      const betreff = text('betreff') || ablauf.name;
      return { art: 'mail', an, betreff, text: text('text'), meldung: `Mail an ${an}` };
    }
    case 'status_aendern': {
      const neu = String(cfg.neuer_status ?? '').trim();
      if (!neu) return { art: 'uebersprungen', meldung: 'kein Zielstatus eingestellt' };
      if (neu.toLowerCase() === 'bezahlt') return { art: 'fehler', meldung: '„bezahlt" setzt nur der Zahlungseingang, nie ein Ablauf' };
      return { art: 'aendern', tabelle: ziel.tabelle, id: zielId, daten: { [STATUS_FELD[ziel.tabelle] ?? 'status']: neu }, meldung: `Status auf „${neu}"` };
    }
    case 'mahnstufe_erhoehen': {
      if (ziel.zielTyp !== 'rechnung') return { art: 'uebersprungen', meldung: 'nur bei Rechnungen möglich' };
      const jetzige = Math.max(0, Math.trunc(alsZahl(satz.mahnstufe) ?? 0));
      const hoechste = Math.max(1, Math.trunc(alsZahl(cfg.hoechste_stufe) ?? 3));
      if (jetzige >= hoechste) return { art: 'uebersprungen', meldung: `Mahnstufe ${jetzige} ist bereits die höchste` };
      return { art: 'aendern', tabelle: 'rechnungen', id: zielId, daten: { mahnstufe: jetzige + 1, letzte_mahnung_am: nurDatum(jetzt) }, meldung: `Mahnstufe ${jetzige} → ${jetzige + 1}` };
    }
    case 'notiz_anhaengen': {
      const spalte = NOTIZ_FELD[ziel.tabelle] ?? 'notiz';
      const zeile = text('text') || `Ablauf: ${ablauf.name}`;
      const alt = typeof satz[spalte] === 'string' ? (satz[spalte] as string) : '';
      return { art: 'aendern', tabelle: ziel.tabelle, id: zielId, daten: { [spalte]: ((alt ? alt + '\n' : '') + zeile).slice(0, 8000) }, meldung: 'Notiz angehängt' };
    }
    default:
      return { art: 'fehler', meldung: `Unbekannte Aktion: ${s.aktion}` };
  }
}

// ---------------------------------------------------------------------------
// 5) Zustand eines Laufs nach dem Fahrplan
// ---------------------------------------------------------------------------

export type LaufZustand = {
  status: 'fertig' | 'wartet' | 'freigabe' | 'gestoppt';
  /** Hier geht es weiter (nach dem Warten bzw. nach der Freigabe). */
  pfad: string | null;
  weiter_am: string | null;
  meldung: string;
};

export function zustandNach(danach: Fahrplan['danach']): LaufZustand {
  if (danach.art === 'warten') {
    if (danach.weiter === null) return { status: 'fertig', pfad: null, weiter_am: null, meldung: 'Fertig (Warten am Ende entfällt)' };
    return { status: 'wartet', pfad: danach.weiter, weiter_am: danach.bis, meldung: 'Wartet' };
  }
  if (danach.art === 'freigabe') {
    if (danach.weiter === null) return { status: 'fertig', pfad: null, weiter_am: null, meldung: 'Fertig (Freigabe am Ende ohne Folgeschritt)' };
    return { status: 'freigabe', pfad: danach.weiter, weiter_am: null, meldung: 'Wartet auf die Freigabe durch den Chef' };
  }
  if (danach.art === 'stopp') return { status: 'gestoppt', pfad: null, weiter_am: null, meldung: 'Stopp erreicht' };
  return { status: 'fertig', pfad: null, weiter_am: null, meldung: 'Fertig' };
}

/** Kurzer Text eines Plans für Probelauf und Protokoll. */
export function planText(p: AktionPlan): string {
  if (p.art === 'uebersprungen') return `übersprungen: ${p.meldung}`;
  if (p.art === 'fehler') return `Fehler: ${p.meldung}`;
  return p.meldung;
}
