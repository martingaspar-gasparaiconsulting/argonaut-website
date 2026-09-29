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
  pruefeGruppe, fuellePlatzhalter, standardWerte, ausloeserIstWerbung, pruefeAblauf, ablaufAktion, ereignisDef, knopfModul,
  type Ablauf, type Ausloeser, type SchrittAktion, type Fahrplan,
} from './ablauf';
import { werbeStatus, WERBE_STATUS_TEXT } from './segmente';
import { berlinZeitpunkt } from './ablaufZeit';
import { pruefeWebhookUrl } from './ablaufWebhookPruefung';

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
  auftraege: 'notizen', termine: 'notiz',
  // leads: bewusst KEIN Notizfeld — „nachricht" ist der Text des Anfragenden und bleibt unverändert.
};

// ---------------------------------------------------------------------------
// 2) Auslöser „Datum erreicht"
// ---------------------------------------------------------------------------

export type Ziel = { tabelle: string; zielTyp: string; datumFeld: string };

/** Ziel eines Laufs OHNE Vorgang (Zeitplan, Knopf auf der Ablauf-Seite) — Paket 159. */
export const OHNE_VORGANG: Ziel = { tabelle: '', zielTyp: 'ohne', datumFeld: '' };

/** Welche Tabelle ein Auslöser abfragt („Datum erreicht" und — seit Paket 166 — „Ereignis"). */
export function ausloeserZiel(a: Ausloeser | null | undefined): Ziel | null {
  if (a?.art === 'ereignis') {
    const e = ereignisDef(a.ereignis);
    return e ? { tabelle: e.tabelle, zielTyp: e.zielTyp, datumFeld: '' } : null;
  }
  // Paket 168: Knopf auf einer Modulseite — der Vorgang ist der Datensatz der Seite.
  if (a?.art === 'knopf') {
    const k = a.modul ? knopfModul(a.modul) : undefined;
    return k ? { tabelle: k.tabelle, zielTyp: k.zielTyp, datumFeld: '' } : null;
  }
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
  | { art: 'mail'; an: string; betreff: string; text: string; meldung: string; werbung: boolean }
  // Paket 167
  | { art: 'glocke'; an: 'chef' | 'team'; titel: string; text: string; link: string; meldung: string }
  | { art: 'pdf'; vorlage: 'schreiben' | 'vorgangsblatt'; titel: string; text: string; zeilen: [string, string][]; meldung: string }
  | { art: 'ki'; titel: string; auftrag: string; meldung: string }
  | { art: 'webhook'; url: string; felder: string; werte: Record<string, string>; meldung: string }
  | { art: 'uebersprungen'; meldung: string }
  | { art: 'fehler'; meldung: string };

function nurDatum(d: Date): string { return d.toISOString().slice(0, 10); }

/** Vorgangsblatt: die wichtigsten Angaben eines Vorgangs als Zeilen (nur einfache Werte). */
export const VORGANGSBLATT_FELDER: [string, string][] = [
  ['rechnungsnummer', 'Rechnungsnummer'], ['angebotsnummer', 'Angebotsnummer'], ['auftragsnummer', 'Auftragsnummer'], ['nummer', 'Nummer'],
  ['titel', 'Titel'], ['betreff', 'Betreff'], ['kunde_name', 'Kunde'], ['firma', 'Firma'], ['vorname', 'Vorname'], ['nachname', 'Nachname'],
  ['status', 'Status'], ['zahlungsstatus', 'Zahlungsstatus'], ['rechnungsdatum', 'Rechnungsdatum'], ['faellig_am', 'Fällig am'],
  ['gueltig_bis', 'Gültig bis'], ['beginn_am', 'Beginn'], ['ende_am', 'Ende'], ['ort', 'Ort'], ['mahnstufe', 'Mahnstufe'],
];

export function vorgangsblattZeilen(satz: Datensatz, werte: Record<string, string>): [string, string][] {
  const zeilen: [string, string][] = [];
  for (const [feld, label] of VORGANGSBLATT_FELDER) {
    const v = satz[feld];
    if (v === null || v === undefined || v === '' || typeof v === 'object') continue;
    zeilen.push([label, fuellePlatzhalter(`{{${feld}}}`, satz, {})]);
  }
  if (werte.betrag) zeilen.push(['Betrag', werte.betrag]);
  return zeilen.slice(0, 30);
}

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
      const werbung = ausloeserIstWerbung(ablauf.ausloeser) && cfg.an !== 'feste_adresse';
      if (werbung) {
        const st = werbeStatus(satz, 'kontakte');
        if (st !== 'erlaubt') return { art: 'uebersprungen', meldung: `kein Werbeversand: ${WERBE_STATUS_TEXT[st]}` };
      }
      const betreff = text('betreff') || ablauf.name;
      // Paket 173: werbung = true -> der Versand prüft zusätzlich die Sperrliste
      // aller Kanäle und hängt Abmeldelink + Widerspruchshinweis an.
      return { art: 'mail', an, betreff, text: text('text'), meldung: `Mail an ${an}`, werbung };
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
      if (ziel.tabelle === 'leads') return { art: 'fehler', meldung: 'Anfragen haben kein Notizfeld' };
      const spalte = NOTIZ_FELD[ziel.tabelle] ?? 'notiz';
      const zeile = text('text') || `Ablauf: ${ablauf.name}`;
      const alt = typeof satz[spalte] === 'string' ? (satz[spalte] as string) : '';
      return { art: 'aendern', tabelle: ziel.tabelle, id: zielId, daten: { [spalte]: ((alt ? alt + '\n' : '') + zeile).slice(0, 8000) }, meldung: 'Notiz angehängt' };
    }
    case 'glocke': {
      const an = cfg.an === 'team' ? 'team' : 'chef';
      const inhalt = text('text').slice(0, 500);
      if (!inhalt.trim()) return { art: 'uebersprungen', meldung: 'Meldung ist leer' };
      const titel = (text('titel') || `Ablauf: ${ablauf.name}`).slice(0, 160);
      return { art: 'glocke', an, titel, text: inhalt, link: '/dashboard/ablaeufe', meldung: `Glocke an ${an === 'team' ? 'das Team' : 'die Geschäftsleitung'}: „${titel}"` };
    }
    case 'termin_anlegen': {
      const titel = text('titel').slice(0, 300) || `Ablauf: ${ablauf.name}`;
      const beginn = berlinZeitpunkt(jetzt, alsZahl(cfg.in_tagen) ?? 0, String(cfg.uhrzeit ?? '09:00'));
      const dauer = Math.min(1440, Math.max(5, Math.trunc(alsZahl(cfg.dauer_min) ?? 60)));
      const ende = new Date(beginn.getTime() + dauer * 60000);
      const kontaktId = ziel.zielTyp === 'kontakt' ? zielId : (typeof satz.kontakt_id === 'string' ? satz.kontakt_id : null);
      return {
        art: 'anlegen', tabelle: 'termine', meldung: `Termin „${titel}" am ${beginn.toISOString()}`,
        daten: {
          owner_user_id: ownerId, titel, beschreibung: text('beschreibung') || null, ort: text('ort') || null,
          beginn_am: beginn.toISOString(), ende_am: ende.toISOString(), quelle: 'ablauf',
          kontakt_id: kontaktId || null, auftrag_id: ziel.zielTyp === 'auftrag' ? zielId : (typeof satz.auftrag_id === 'string' ? satz.auftrag_id : null),
          // Vom Ablauf angelegt: KEINE Bestätigungs-/Erinnerungs-Mail an Kunden (wie beim Import).
          bestaetigung_gesendet_am: jetzt.toISOString(), erinnerung_gesendet_am: jetzt.toISOString(),
        },
      };
    }
    case 'pdf_erstellen': {
      const vorlage = cfg.vorlage === 'vorgangsblatt' ? 'vorgangsblatt' : 'schreiben';
      const titel = (text('titel') || ablauf.name || 'Dokument').slice(0, 160);
      if (vorlage === 'vorgangsblatt') {
        if (!zielId) return { art: 'fehler', meldung: 'Vorgangsblatt ohne Vorgang' };
        return { art: 'pdf', vorlage, titel, text: '', zeilen: vorgangsblattZeilen(satz, werte), meldung: `PDF „${titel}" (Vorgangsblatt)` };
      }
      const inhalt = text('text').slice(0, 20000);
      if (!inhalt.trim()) return { art: 'uebersprungen', meldung: 'Text für das Schreiben ist leer' };
      return { art: 'pdf', vorlage, titel, text: inhalt, zeilen: [], meldung: `PDF „${titel}" (Schreiben)` };
    }
    case 'ki_schritt': {
      const auftrag = text('auftrag').slice(0, 4000);
      if (!auftrag.trim()) return { art: 'uebersprungen', meldung: 'Auftrag ist leer' };
      const titel = (text('titel') || `Entwurf: ${ablauf.name}`).slice(0, 160);
      return { art: 'ki', titel, auftrag, meldung: `Entwurf „${titel}" (nur Entwurf, nichts wird verschickt)` };
    }
    case 'webhook_senden': {
      const url = String(cfg.url ?? '').trim();
      const pruef = pruefeWebhookUrl(url);
      if (!pruef.erlaubt) return { art: 'fehler', meldung: `Adresse abgelehnt: ${pruef.hinweis}` };
      return { art: 'webhook', url: pruef.normalisiert, felder: String(cfg.felder ?? ''), werte, meldung: `Webhook an ${pruef.host}` };
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

// ---------------------------------------------------------------------------
// 6) Auslöser „Ereignis" (Paket 166)
//
// Die Datenbank schreibt je Ereignis eine Zeile in ablauf_ereignisse (nur wenn
// der Betrieb einen eingeschalteten Ablauf dafür hat). Der Motor arbeitet die
// Warteschlange stündlich ab. Schutzgeländer:
//   · zu alt (> EREIGNIS_MAX_STUNDEN) -> verworfen, keine Post auf alte Vorgänge
//   · MASSENANLAGE: viele gleiche Ereignisse eines Betriebs in wenigen Minuten
//     (Umzug/Import von 500 Kunden) starten KEINEN Ablauf — sonst bekämen
//     Altkunden Willkommens-Post oder das Team 500 Aufgaben.
//   · Deckel MAX_JE_ABLAUF je 24 h, EINMALIG je Ablauf und Vorgang (Datenbank).
// ---------------------------------------------------------------------------

/** Höchstens so viele Ereignisse je Motor-Durchgang. */
export const MAX_EREIGNISSE = 500;
/** Ältere Ereignisse starten nichts mehr. */
export const EREIGNIS_MAX_STUNDEN = 48;
/** Ab so vielen gleichen Ereignissen eines Betriebs … */
export const MASSEN_ANZAHL = 20;
/** … innerhalb dieses Zeitfensters gilt es als Massenanlage (Import). */
export const MASSEN_FENSTER_MIN = 10;

export type EreignisZeile = {
  id: string; owner_user_id: string; ereignis: string; tabelle: string; ziel_id: string; erstellt_am: string;
};

export function ereignisZuAlt(e: Pick<EreignisZeile, 'erstellt_am'>, jetzt: Date): boolean {
  const t = new Date(e.erstellt_am).getTime();
  if (!Number.isFinite(t)) return true;
  return jetzt.getTime() - t > EREIGNIS_MAX_STUNDEN * 3600000;
}

/**
 * Kennungen der Ereignisse, die zu einer Massenanlage gehören: je Betrieb und
 * Ereignis mindestens MASSEN_ANZAHL innerhalb von MASSEN_FENSTER_MIN Minuten.
 */
export function massenanlage(ereignisse: EreignisZeile[]): Set<string> {
  const raus = new Set<string>();
  const gruppen = new Map<string, EreignisZeile[]>();
  for (const e of ereignisse) {
    const k = e.owner_user_id + '|' + e.ereignis;
    gruppen.set(k, [...(gruppen.get(k) ?? []), e]);
  }
  const fenster = MASSEN_FENSTER_MIN * 60000;
  for (const liste of gruppen.values()) {
    const s = [...liste].sort((a, b) => new Date(a.erstellt_am).getTime() - new Date(b.erstellt_am).getTime());
    let anfang = 0;
    for (let ende = 0; ende < s.length; ende++) {
      const tEnde = new Date(s[ende].erstellt_am).getTime();
      while (tEnde - new Date(s[anfang].erstellt_am).getTime() > fenster) anfang++;
      if (ende - anfang + 1 >= MASSEN_ANZAHL) for (let i = anfang; i <= ende; i++) raus.add(s[i].id);
    }
  }
  return raus;
}

/** Eingeschaltete Abläufe desselben Betriebs mit genau diesem Ereignis. */
export function passendeAblaeufe<T extends Ablauf & { owner_user_id: string }>(e: Pick<EreignisZeile, 'owner_user_id' | 'ereignis' | 'tabelle'>, ablaeufe: T[]): T[] {
  const def = ereignisDef(e.ereignis);
  if (!def || def.tabelle !== e.tabelle) return [];
  return ablaeufe.filter((a) => a.owner_user_id === e.owner_user_id && a.ausloeser?.art === 'ereignis' && a.ausloeser.ereignis === e.ereignis);
}

/** Start-Bedingungen des Ereignis-Auslösers (UND/ODER) für diesen Vorgang. */
export function ereignisTrifft(a: Ausloeser, satz: Datensatz): boolean {
  return a.art === 'ereignis' && pruefeGruppe(a.filter ?? null, satz);
}
