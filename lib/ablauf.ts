// ============================================================================
// ARGONAUT OS · lib/ablauf.ts — Ablauf-Baukasten, der Kern (Paket 156, 28.09.2026)
//
// Martins Beschluss (27.09.2026): Aus den Automationen werden „Abläufe" —
// Auslöser, beliebig viele Schritte, UND/ODER-Bedingungen, Wenn/Sonst, Warten,
// Aktionen, Platzhalter {{…}}, Probelauf, Protokoll je Schritt, Versionen.
// Schutzgeländer bleiben: Deckel, Werbe-Einwilligung, Geld-Aktionen nur mit
// Freigabe durch den Chef. Bestehende Regeln werden übernommen.
//
// Diese Datei ist der Kern OHNE Datenbank und OHNE Oberfläche:
//   · Typen (Auslöser, Schritte, Bedingungsgruppen)
//   · Kataloge (Auslöser-Arten, Ereignisse, Aktionen mit Schutz-Kennzeichen)
//   · Prüfen einer Bedingungsgruppe, Platzhalter mit Punkt-Pfad
//   · Prüfen eines ganzen Ablaufs (Fehler/Hinweise, bevor er aktiv wird)
//   · Der Fahrplan: welcher Schritt als Nächstes, wo gewartet wird
//   · Übernahme einer alten Automations-Regel
// Motor, Oberfläche und Ereignis-Auslöser folgen in eigenen Paketen.
// Rein, node-getestet.
// ============================================================================

import {
  pruefeBedingung, triggerDef, istWerbung, aktionDef, alsDatum, datumDeutsch, euro,
  type Bedingung, type Datensatz, type AutomationRegel,
} from './automation';

// ---------------------------------------------------------------------------
// 1) Typen
// ---------------------------------------------------------------------------

export type BedingungsGruppe = {
  verknuepfung: 'und' | 'oder';
  regeln: Array<Bedingung | BedingungsGruppe>;
};

export type Ausloeser =
  /** Zu festen Zeiten (der Motor läuft stündlich, führt aber nur zur Zeit aus). */
  | { art: 'zeitplan'; rhythmus: 'taeglich' | 'woechentlich' | 'monatlich'; uhrzeit?: string; wochentag?: number; tag?: number }
  /** Datum erreicht: die bisherigen Automations-Auslöser (Rechnung überfällig …) + Tage. */
  | { art: 'datum'; trigger: string; tage: number; filter?: BedingungsGruppe | null }
  /** Sofort, wenn in einem Modul etwas passiert (Rechnung angelegt …). */
  | { art: 'ereignis'; ereignis: string; filter?: BedingungsGruppe | null }
  /** Von außen (n8n, Formular, anderes Programm) — mit geheimem Schlüssel. */
  | { art: 'webhook' }
  /** Per Knopf in einem Modul. */
  | { art: 'knopf'; modul?: string };

export type SchrittAktion = { id: string; typ: 'aktion'; aktion: string; config: Record<string, unknown> };
export type SchrittWarten = { id: string; typ: 'warten'; tage?: number; stunden?: number };
export type SchrittWenn = { id: string; typ: 'wenn'; bedingung: BedingungsGruppe; dann: Schritt[]; sonst: Schritt[] };
export type SchrittStopp = { id: string; typ: 'stopp' };
export type Schritt = SchrittAktion | SchrittWarten | SchrittWenn | SchrittStopp;

export type Ablauf = {
  id?: string;
  name: string;
  beschreibung?: string | null;
  ausloeser: Ausloeser;
  schritte: Schritt[];
  aktiv?: boolean;
  version?: number;
};

// ---------------------------------------------------------------------------
// 2) Kataloge
// ---------------------------------------------------------------------------

export const AUSLOESER_ARTEN: { art: Ausloeser['art']; label: string; hinweis: string; imMotor: boolean }[] = [
  { art: 'datum', label: 'Datum erreicht', hinweis: 'Z. B. „Rechnung seit 14 Tagen überfällig" — wie die bisherigen Automationen.', imMotor: true },
  { art: 'zeitplan', label: 'Zeitplan', hinweis: 'Täglich, wöchentlich oder monatlich zu einer Uhrzeit.', imMotor: false },
  { art: 'ereignis', label: 'Ereignis', hinweis: 'Sofort, wenn in einem Modul etwas passiert.', imMotor: false },
  { art: 'webhook', label: 'Webhook', hinweis: 'Von außen angestoßen (z. B. n8n oder ein Formular).', imMotor: false },
  { art: 'knopf', label: 'Knopf', hinweis: 'Per Knopfdruck in einem Modul.', imMotor: false },
];

/**
 * Ereignisse für den Auslöser „sofort". werbung: Post an den Kunden aus diesem
 * Ereignis ist Werbung (Einwilligung nötig) — unbekannt gilt als Werbung.
 */
export const EREIGNISSE: { key: string; label: string; zielTyp: string; tabelle: string; werbung: boolean }[] = [
  { key: 'rechnung_angelegt', label: 'Rechnung angelegt', zielTyp: 'rechnung', tabelle: 'rechnungen', werbung: false },
  { key: 'rechnung_bezahlt', label: 'Rechnung bezahlt', zielTyp: 'rechnung', tabelle: 'rechnungen', werbung: false },
  { key: 'angebot_angelegt', label: 'Angebot angelegt', zielTyp: 'angebot', tabelle: 'angebote', werbung: false },
  { key: 'angebot_angenommen', label: 'Angebot angenommen', zielTyp: 'angebot', tabelle: 'angebote', werbung: false },
  { key: 'kontakt_angelegt', label: 'Kunde angelegt', zielTyp: 'kontakt', tabelle: 'kontakte', werbung: true },
  { key: 'lead_eingegangen', label: 'Anfrage eingegangen', zielTyp: 'lead', tabelle: 'leads', werbung: false },
  { key: 'auftrag_angelegt', label: 'Auftrag angelegt', zielTyp: 'auftrag', tabelle: 'auftraege', werbung: false },
  { key: 'termin_angelegt', label: 'Termin angelegt', zielTyp: 'termin', tabelle: 'termine', werbung: false },
  { key: 'aufgabe_erledigt', label: 'Aufgabe erledigt', zielTyp: 'aufgabe', tabelle: 'aufgaben', werbung: false },
];

export type AblaufAktionDef = {
  key: string;
  label: string;
  hinweis: string;
  /** Bewegt Geld oder Forderungen — nur nach einer Freigabe durch den Chef im selben Zweig. */
  geld?: boolean;
  /** Schreibt dem Kunden — bei Werbung nur mit Einwilligung. */
  kundenpost?: boolean;
  /** Schickt Daten nach außen. */
  extern?: boolean;
  /** Pflichtfelder der Einstellungen. */
  pflicht: string[];
  /** Führt der Motor sie schon aus? (sonst nur planbar, noch nicht aktivierbar) */
  imMotor: boolean;
};

export const ABLAUF_AKTIONEN: AblaufAktionDef[] = [
  // Die fünf bisherigen Aktionen (lib/automation.ts) — der Motor kann sie heute.
  { key: 'aufgabe_anlegen', label: 'Aufgabe anlegen', hinweis: 'Legt eine Aufgabe mit Fälligkeit an.', pflicht: ['titel'], imMotor: true },
  { key: 'mail_senden', label: 'E-Mail senden', hinweis: 'Mail an den Kunden oder eine feste Adresse.', kundenpost: true, pflicht: ['betreff', 'text'], imMotor: true },
  { key: 'status_aendern', label: 'Status ändern', hinweis: 'Setzt den Status des Vorgangs.', pflicht: ['neuer_status'], imMotor: true },
  { key: 'mahnstufe_erhoehen', label: 'Mahnstufe erhöhen', hinweis: 'Erhöht die Mahnstufe der Rechnung.', geld: true, pflicht: [], imMotor: true },
  { key: 'notiz_anhaengen', label: 'Notiz anhängen', hinweis: 'Schreibt eine Notiz an den Vorgang.', pflicht: ['text'], imMotor: true },
  // Seit Paket 157 im Motor: der Lauf hält an (Status „freigabe"), bis der Chef auf der Seite zustimmt.
  { key: 'freigabe_chef', label: 'Freigabe durch den Chef', hinweis: 'Hält an, bis die Geschäftsleitung zustimmt.', pflicht: [], imMotor: true },
  // Neu im Baukasten — der Motor lernt sie in den folgenden Paketen.
  { key: 'glocke', label: 'Meldung in der Glocke', hinweis: 'Benachrichtigt die Geschäftsleitung oder das Team.', pflicht: ['text'], imMotor: false },
  { key: 'termin_anlegen', label: 'Termin anlegen', hinweis: 'Legt einen Termin an.', pflicht: ['titel'], imMotor: false },
  { key: 'pdf_erstellen', label: 'PDF erstellen', hinweis: 'Erstellt ein PDF aus einer Vorlage.', pflicht: ['vorlage'], imMotor: false },
  { key: 'ki_schritt', label: 'KI-Baustein', hinweis: 'Lässt einen Text von einem Baustein schreiben (Entwurf, nie direkt versendet).', pflicht: ['auftrag'], imMotor: false },
  { key: 'webhook_senden', label: 'Webhook senden', hinweis: 'Schickt die Daten an eine Adresse (z. B. n8n).', extern: true, pflicht: ['url'], imMotor: false },
];

export function ablaufAktion(key: string): AblaufAktionDef | undefined {
  return ABLAUF_AKTIONEN.find((a) => a.key === key);
}

/** Grenzen, damit kein Ablauf entgleist. */
export const GRENZEN = { schritte: 50, tiefe: 5, wartenTage: 365, bedingungen: 30 } as const;

// ---------------------------------------------------------------------------
// 3) Bedingungen (UND/ODER, verschachtelt)
// ---------------------------------------------------------------------------

export function istGruppe(x: Bedingung | BedingungsGruppe): x is BedingungsGruppe {
  return !!x && typeof x === 'object' && Array.isArray((x as BedingungsGruppe).regeln);
}

/** Leere Gruppe = trifft zu. Felder mit Punkt („kunde.email") werden im Datensatz nachgeschlagen. */
export function pruefeGruppe(g: BedingungsGruppe | null | undefined, datensatz: Datensatz): boolean {
  if (!g || !Array.isArray(g.regeln)) return true;
  const ergebnisse = g.regeln.map((r) => (istGruppe(r)
    ? pruefeGruppe(r, datensatz)
    : pruefeBedingung(r, r.feld.includes('.') ? { ...datensatz, [r.feld]: wertAmPfad(datensatz, r.feld) } : datensatz)));
  return g.verknuepfung === 'oder' ? ergebnisse.some(Boolean) : ergebnisse.every(Boolean);
}

function zaehleBedingungen(g: BedingungsGruppe | null | undefined): number {
  if (!g || !Array.isArray(g.regeln)) return 0;
  return g.regeln.reduce((n, r) => n + (istGruppe(r) ? zaehleBedingungen(r) : 1), 0);
}

// ---------------------------------------------------------------------------
// 4) Platzhalter {{…}} mit Punkt-Pfad
// ---------------------------------------------------------------------------

export function wertAmPfad(daten: unknown, pfad: string): unknown {
  let x: unknown = daten;
  for (const teil of pfad.split('.')) {
    if (x === null || x === undefined || typeof x !== 'object') return undefined;
    x = (x as Record<string, unknown>)[teil];
  }
  return x;
}

/**
 * {{name}}, {{kunde.email}}, {{betrag}} … Werte kommen aus `werte` (vorbereitete
 * Texte wie name/betrag/heute) und sonst aus dem Datensatz (Punkt-Pfad).
 * Datum -> deutsch, Zahl bleibt Zahl. Unbekannt -> leer (nie „undefined").
 */
export function fuellePlatzhalter(text: string, datensatz: Datensatz, werte: Record<string, string> = {}): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g, (_t, pfad: string) => {
    if (pfad in werte) return werte[pfad];
    const v = wertAmPfad(datensatz, pfad);
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return datumDeutsch(v);
    if (typeof v === 'object') return '';
    return String(v);
  });
}

/** Standard-Platzhalter eines Laufs (wie bei den bisherigen Automationen). */
export function standardWerte(ablauf: Pick<Ablauf, 'name'>, datensatz: Datensatz, jetzt: Date): Record<string, string> {
  const name = String(datensatz.kunde_name ?? '')
    || [datensatz.vorname, datensatz.nachname].filter(Boolean).join(' ').trim()
    || String(datensatz.firma ?? datensatz.titel ?? datensatz.name ?? '');
  return {
    name,
    betrag: euro(datensatz.brutto_summe ?? datensatz.netto_summe ?? datensatz.betrag ?? datensatz.budget),
    nummer: String(datensatz.rechnungsnummer ?? datensatz.angebotsnummer ?? datensatz.nummer ?? ''),
    heute: datumDeutsch(jetzt),
    ablauf: ablauf.name || '',
  };
}

// ---------------------------------------------------------------------------
// 5) Wege durch die Schritte: Pfad „2" oder „3.dann.0"
// ---------------------------------------------------------------------------

/** Schritt an einem Pfad (null = gibt es nicht). */
export function schrittAn(schritte: readonly Schritt[], pfad: string): Schritt | null {
  const teile = pfad.split('.');
  let liste: readonly Schritt[] = schritte;
  let s: Schritt | null = null;
  for (let i = 0; i < teile.length; i++) {
    const idx = Number(teile[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= liste.length) return null;
    s = liste[idx];
    if (i + 1 < teile.length) {
      const zweig = teile[++i];
      if (s.typ !== 'wenn' || (zweig !== 'dann' && zweig !== 'sonst')) return null;
      liste = s[zweig];
    }
  }
  return s;
}

/** Der Schritt NACH einem Pfad (Zweig zu Ende -> weiter nach dem Wenn). null = Ablauf fertig. */
export function nachfolger(schritte: readonly Schritt[], pfad: string): string | null {
  const teile = pfad.split('.');
  const idx = Number(teile[teile.length - 1]);
  const eltern = teile.slice(0, -1);                 // [] oder [...wennPfad, 'dann'|'sonst']
  let liste: readonly Schritt[] = schritte;
  if (eltern.length > 0) {
    const zweig = eltern[eltern.length - 1];
    const wenn = schrittAn(schritte, eltern.slice(0, -1).join('.'));
    if (!wenn || wenn.typ !== 'wenn' || (zweig !== 'dann' && zweig !== 'sonst')) return null;
    liste = wenn[zweig];
  }
  if (idx + 1 < liste.length) return [...eltern, String(idx + 1)].join('.');
  if (eltern.length === 0) return null;
  return nachfolger(schritte, eltern.slice(0, -1).join('.'));
}

export type FahrplanEintrag =
  | { pfad: string; art: 'aktion'; schritt: SchrittAktion }
  | { pfad: string; art: 'bedingung'; ergebnis: boolean };

export type Fahrplan = {
  /** In dieser Reihenfolge JETZT ausführen. */
  jetzt: FahrplanEintrag[];
  /** Danach: warten bis … (Pfad des nächsten Schritts), anhalten für Freigabe, oder fertig. */
  danach:
    | { art: 'fertig' }
    | { art: 'warten'; bis: string; weiter: string | null }
    | { art: 'freigabe'; pfad: string; weiter: string | null }
    | { art: 'stopp'; pfad: string };
};

/**
 * Der Fahrplan ab einem Pfad: Wenn/Sonst wird gleich entschieden, Aktionen
 * werden gesammelt, bis ein Warten, eine Chef-Freigabe, ein Stopp oder das
 * Ende kommt. Führt NICHTS aus — der Motor (und der Probelauf) arbeiten ihn ab.
 */
export function fahrplan(ablauf: Pick<Ablauf, 'schritte'>, startPfad: string | null, datensatz: Datensatz, jetzt: Date): Fahrplan {
  const jetztListe: FahrplanEintrag[] = [];
  let pfad: string | null = startPfad ?? (ablauf.schritte.length > 0 ? '0' : null);
  let schutz = 0;
  while (pfad !== null) {
    if (++schutz > GRENZEN.schritte * 2) break;              // nie endlos
    const s = schrittAn(ablauf.schritte, pfad);
    if (!s) break;
    if (s.typ === 'stopp') return { jetzt: jetztListe, danach: { art: 'stopp', pfad } };
    if (s.typ === 'warten') {
      const ms = ((s.tage ?? 0) * 24 + (s.stunden ?? 0)) * 3600 * 1000;
      return { jetzt: jetztListe, danach: { art: 'warten', bis: new Date(jetzt.getTime() + ms).toISOString(), weiter: nachfolger(ablauf.schritte, pfad) } };
    }
    if (s.typ === 'wenn') {
      const ja = pruefeGruppe(s.bedingung, datensatz);
      jetztListe.push({ pfad, art: 'bedingung', ergebnis: ja });
      const zweig = ja ? s.dann : s.sonst;
      pfad = zweig.length > 0 ? `${pfad}.${ja ? 'dann' : 'sonst'}.0` : nachfolger(ablauf.schritte, pfad);
      continue;
    }
    if (s.aktion === 'freigabe_chef') {
      return { jetzt: jetztListe, danach: { art: 'freigabe', pfad, weiter: nachfolger(ablauf.schritte, pfad) } };
    }
    jetztListe.push({ pfad, art: 'aktion', schritt: s });
    pfad = nachfolger(ablauf.schritte, pfad);
  }
  return { jetzt: jetztListe, danach: { art: 'fertig' } };
}

// ---------------------------------------------------------------------------
// 6) Einen Ablauf prüfen, bevor er aktiv wird
// ---------------------------------------------------------------------------

export type AblaufPruefung = { fehler: string[]; hinweise: string[]; aktivierbar: boolean };

/** Ist Post aus diesem Auslöser Werbung? Unbekannt = ja (lieber eine Mail zu wenig). */
export function ausloeserIstWerbung(a: Ausloeser): boolean {
  if (a.art === 'datum') return istWerbung(a.trigger);
  if (a.art === 'ereignis') return EREIGNISSE.find((e) => e.key === a.ereignis)?.werbung ?? true;
  return true;
}

export function pruefeAblauf(ablauf: Ablauf): AblaufPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  let nochNichtImMotor = false;
  if (!String(ablauf.name ?? '').trim()) fehler.push('Bitte einen Namen vergeben.');
  const a = ablauf.ausloeser;
  const art = AUSLOESER_ARTEN.find((x) => x.art === a?.art);
  if (!art) fehler.push('Bitte einen Auslöser wählen.');
  else {
    if (!art.imMotor) nochNichtImMotor = true;
    if (a.art === 'datum') {
      if (!triggerDef(a.trigger)) fehler.push('Unbekannter Datums-Auslöser.');
      if (!Number.isInteger(a.tage) || a.tage < 0 || a.tage > GRENZEN.wartenTage) fehler.push(`Tage beim Auslöser: 0 bis ${GRENZEN.wartenTage}.`);
    }
    if (a.art === 'ereignis' && !EREIGNISSE.some((e) => e.key === a.ereignis)) fehler.push('Unbekanntes Ereignis.');
    if (a.art === 'zeitplan') {
      if (!['taeglich', 'woechentlich', 'monatlich'].includes(a.rhythmus)) fehler.push('Unbekannter Rhythmus.');
      if (a.uhrzeit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.uhrzeit)) fehler.push('Uhrzeit bitte als HH:MM.');
    }
    if ((a.art === 'datum' || a.art === 'ereignis') && zaehleBedingungen(a.filter) > GRENZEN.bedingungen) fehler.push(`Höchstens ${GRENZEN.bedingungen} Bedingungen.`);
  }
  if (!Array.isArray(ablauf.schritte) || ablauf.schritte.length === 0) fehler.push('Mindestens ein Schritt.');

  const ids = new Set<string>();
  let anzahl = 0;
  const werbung = a ? ausloeserIstWerbung(a) : true;
  const gehe = (liste: readonly Schritt[], tiefe: number, freigabeDavor: boolean, wo: string): void => {
    if (tiefe > GRENZEN.tiefe) { fehler.push(`Zu tief verschachtelt (höchstens ${GRENZEN.tiefe} Wenn-Ebenen).`); return; }
    let freigabe = freigabeDavor;
    liste.forEach((s, i) => {
      anzahl++;
      const nr = `${wo}${i + 1}`;
      if (!s || typeof s !== 'object' || !s.id) { fehler.push(`Schritt ${nr}: unvollständig.`); return; }
      if (ids.has(s.id)) fehler.push(`Schritt ${nr}: doppelte Kennung.`);
      ids.add(s.id);
      if (s.typ === 'warten') {
        const h = (s.tage ?? 0) * 24 + (s.stunden ?? 0);
        if (!(h > 0) || h > GRENZEN.wartenTage * 24) fehler.push(`Schritt ${nr}: Wartezeit zwischen 1 Stunde und ${GRENZEN.wartenTage} Tagen.`);
      } else if (s.typ === 'wenn') {
        if (zaehleBedingungen(s.bedingung) === 0) fehler.push(`Schritt ${nr}: Wenn ohne Bedingung.`);
        if (zaehleBedingungen(s.bedingung) > GRENZEN.bedingungen) fehler.push(`Schritt ${nr}: höchstens ${GRENZEN.bedingungen} Bedingungen.`);
        gehe(s.dann ?? [], tiefe + 1, freigabe, `${nr}.dann.`);
        gehe(s.sonst ?? [], tiefe + 1, freigabe, `${nr}.sonst.`);
      } else if (s.typ === 'aktion') {
        const def = ablaufAktion(s.aktion);
        if (!def) { fehler.push(`Schritt ${nr}: unbekannte Aktion.`); return; }
        if (!def.imMotor) nochNichtImMotor = true;
        // Paket 158: Mahnstufe nur bei Rechnungen — passt die Aktion nicht zum Auslöser, gleich sagen.
        const zielTypen = aktionDef(def.key)?.zielTypen;
        const zielTyp = a?.art === 'datum' ? triggerDef(a.trigger)?.zielTyp : undefined;
        if (zielTypen && zielTyp && !zielTypen.includes(zielTyp)) fehler.push(`Schritt ${nr} (${def.label}): passt nicht zu diesem Auslöser.`);
        for (const p of def.pflicht) if (!String(s.config?.[p] ?? '').trim()) fehler.push(`Schritt ${nr} (${def.label}): „${p}" fehlt.`);
        if (def.key === 'freigabe_chef') freigabe = true;
        if (def.geld && !freigabe) fehler.push(`Schritt ${nr} (${def.label}): Geld-Aktionen nur nach einer „Freigabe durch den Chef" davor.`);
        // Paket 158: feste Adresse ohne gültige Adresse würde still übersprungen — lieber gleich sagen.
        if (def.key === 'mail_senden' && s.config?.an === 'feste_adresse' && !String(s.config?.adresse ?? '').includes('@')) {
          fehler.push(`Schritt ${nr} (${def.label}): feste Adresse fehlt.`);
        }
        if (def.kundenpost && werbung && s.config?.an !== 'feste_adresse') {
          hinweise.push(`Schritt ${nr}: Diese Mail gilt als Werbung — sie geht nur an Kunden mit Einwilligung und ohne Widerspruch.`);
        }
        if (def.extern) hinweise.push(`Schritt ${nr}: Daten gehen nach außen — nur an Adressen, mit denen ein Vertrag besteht (AVV).`);
        if (def.key === 'status_aendern' && s.config?.neuer_status === 'bezahlt') fehler.push(`Schritt ${nr}: „bezahlt" setzt nur der Zahlungseingang, nie ein Ablauf.`);
      } else if (s.typ !== 'stopp') fehler.push(`Schritt ${nr}: unbekannter Schritt.`);
    });
  };
  gehe(ablauf.schritte ?? [], 1, false, '');
  if (anzahl > GRENZEN.schritte) fehler.push(`Höchstens ${GRENZEN.schritte} Schritte.`);
  if (nochNichtImMotor) hinweise.push('Enthält Bausteine, die der Motor noch nicht ausführt — speichern geht, einschalten noch nicht.');
  return { fehler, hinweise, aktivierbar: fehler.length === 0 && !nochNichtImMotor };
}

// ---------------------------------------------------------------------------
// 7) Übernahme einer alten Automations-Regel
// ---------------------------------------------------------------------------

/**
 * Alte Regel (Auslöser -> Bedingungen -> Wartezeit -> EINE Aktion) als Ablauf.
 * Gleiches Verhalten — mit einer Ausnahme nach Martins Schutzgeländer:
 * Geld-Aktionen (Mahnstufe) bekommen eine Chef-Freigabe davor.
 * Die neue Fassung startet AUSGESCHALTET; die alte Regel läuft weiter, bis
 * der Chef umschaltet (kein doppelter Versand, nichts fällt aus).
 */
export function regelZuAblauf(regel: Pick<AutomationRegel, 'id' | 'name' | 'beschreibung' | 'trigger_typ' | 'bedingung' | 'aktion_typ' | 'aktion_config' | 'wartezeit_tage'>): { ablauf: Ablauf; hinweise: string[] } {
  const hinweise: string[] = [];
  const bed = Array.isArray(regel.bedingung) ? regel.bedingung : [];
  const aktion: SchrittAktion = { id: 's1', typ: 'aktion', aktion: regel.aktion_typ, config: { ...(regel.aktion_config ?? {}) } };
  const schritte: Schritt[] = [];
  if (ablaufAktion(regel.aktion_typ)?.geld) {
    schritte.push({ id: 's0', typ: 'aktion', aktion: 'freigabe_chef', config: {} });
    hinweise.push('Geld-Aktion: vor dem Schritt steht jetzt eine Freigabe durch den Chef.');
  }
  if (!aktionDef(regel.aktion_typ)) hinweise.push(`Aktion „${regel.aktion_typ}" ist unbekannt — bitte prüfen.`);
  schritte.push(aktion);
  return {
    ablauf: {
      name: regel.name || 'Übernommene Automation',
      beschreibung: regel.beschreibung ?? null,
      ausloeser: {
        art: 'datum', trigger: regel.trigger_typ, tage: Math.max(0, Math.round(Number(regel.wartezeit_tage) || 0)),
        filter: bed.length > 0 ? { verknuepfung: 'und', regeln: bed } : null,
      },
      schritte,
      aktiv: false,
    },
    hinweise,
  };
}

// ---------------------------------------------------------------------------
// 8) In Worten (für Liste und Probelauf)
// ---------------------------------------------------------------------------

export function ausloeserText(a: Ausloeser): string {
  if (a.art === 'datum') {
    const t = triggerDef(a.trigger);
    return `${t?.label ?? a.trigger}${a.tage > 0 ? `, nach ${a.tage} Tag${a.tage === 1 ? '' : 'en'}` : ''}`;
  }
  if (a.art === 'ereignis') return EREIGNISSE.find((e) => e.key === a.ereignis)?.label ?? a.ereignis;
  if (a.art === 'zeitplan') {
    const r = { taeglich: 'Täglich', woechentlich: 'Wöchentlich', monatlich: 'Monatlich' }[a.rhythmus] ?? a.rhythmus;
    return `${r}${a.uhrzeit ? ` um ${a.uhrzeit} Uhr` : ''}`;
  }
  if (a.art === 'webhook') return 'Von außen (Webhook)';
  return 'Per Knopf';
}

export function schrittText(s: Schritt): string {
  if (s.typ === 'warten') {
    const teile = [s.tage ? `${s.tage} Tag${s.tage === 1 ? '' : 'e'}` : '', s.stunden ? `${s.stunden} Std.` : ''].filter(Boolean);
    return `Warten: ${teile.join(' ') || '—'}`;
  }
  if (s.typ === 'wenn') return `Wenn … (${zaehleBedingungen(s.bedingung)} Bedingung${zaehleBedingungen(s.bedingung) === 1 ? '' : 'en'})`;
  if (s.typ === 'stopp') return 'Stopp';
  return ablaufAktion(s.aktion)?.label ?? s.aktion;
}

/** Datum des Auslösers eines Datensatzes (für „Datum erreicht"). */
export function ausloeserDatum(a: Ausloeser, datensatz: Datensatz): Date | null {
  if (a.art !== 'datum') return null;
  const t = triggerDef(a.trigger);
  return t ? alsDatum(datensatz[t.datumFeld]) : null;
}
