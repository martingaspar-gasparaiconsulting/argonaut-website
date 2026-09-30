// ============================================================================
// ARGONAUT OS · lib/musterbetriebXxl.ts — Paket 179 „Musterbetrieb XXL"
//
// EIN Betrieb, in dem ALLE Module mit Beispieldaten gefüllt sind — für den
// Testtag. Statt jede Seite von Hand zu befüllen, legt der Betreiber im
// Command Center per Knopf ein eigenes Konto an; die Route
// /api/admin/musterbetrieb-xxl geht dann diese Seeder der Reihe nach durch.
//
// Unterschied zur Übungswelt (lib/uebungswelt.ts):
//   · Die Übungswelt-Seeder bauen flache Zeilen OHNE Verweise (kontakt_id null).
//     Die XXL-Seeder bekommen einen Kontext mit den IDs der schon angelegten
//     Zeilen — so hängen Positionen an ihrem Auftrag, Einsätze am Mitarbeiter,
//     Aufgaben am Projekt, Mängel an der Baustelle.
//   · Die Übungswelt läuft in der Sitzung des Kunden; der Musterbetrieb läuft
//     mit dem Service-Schlüssel. Dort greifen Datenbank-Vorgaben wie
//     `owner_user_id default auth.uid()` NICHT (auth.uid() ist leer) — deshalb
//     setzt JEDE Zeile hier den Besitzer ausdrücklich. Ein Test wacht darüber.
//
// Löschen: exakt über das Register `beispiel_datensatz` (wie die Übungswelt),
// Kinder vor Eltern (XXL_LOESCH_ORDER). Nichts wird über Namen oder Muster
// gelöscht — nur, was dieser Motor selbst angelegt und registriert hat.
//
// Datenschutz: Alle Personen, Firmen und Adressen sind erfunden. Jede
// E-Mail-Adresse wird auf die reservierte Domain example.com umgeschrieben
// (RFC 2606) — auch die der Übungswelt-Kontakte, die teils echt klingende
// Domains tragen. So kann aus dem Musterbetrieb nie eine Mail an einen echten
// Menschen gehen. Keine Sozialversicherungs-, Steuer- oder Bankdaten von
// Mitarbeitern; die eine Krankmeldung ist erfunden wie die Person.
//
// Keine Imports mit Seiteneffekten, kein Supabase — reine Logik, node-testbar.
// ============================================================================

import { SEEDER, LOESCH_ORDER, type SeedZeile } from './uebungswelt';
import { KATEGORIE_MODULE, kategorieModule } from './branchenkatalog';
import { baueAngebotKopf, baueAngebotPositionen, baueBeispielZahlungen, type KontaktRef } from './beispielBelege';
import { baueAssets, baueWartungAusAsset } from './beispielModule';

// ---------------------------------------------------------------------------
// Grunddaten des Musterbetriebs
// ---------------------------------------------------------------------------

/** Postfach-Adresse des Kontos. Liegt auf der Demo-Domain ohne Postfach — es geht nie Post raus. */
export const XXL_EMAIL = 'musterbetrieb-xxl@demo.argonaut-os.com';
/** Kennzeichen im Konto (app_metadata). Nur Konten MIT diesem Kennzeichen darf die Route löschen. */
export const XXL_KENNZEICHEN = 'argonaut_musterbetrieb_xxl';
/** Kategorie fürs Profil (die meisten Kern-Module hängen an Handwerk & Bau). */
export const XXL_KATEGORIE = 'Handwerk & Bau';
/** Markierung in Notizfeldern — so sieht man jeder Zeile an, woher sie kommt. */
export const XXL_NOTIZ = 'Beispiel-Datensatz · Musterbetrieb XXL';
/** Reservierte Domain für alle Beispiel-Adressen (nie zustellbar). */
export const BEISPIEL_DOMAIN = 'example.com';

export const XXL_PROFIL = {
  firma_name: 'Musterbetrieb XXL GmbH',
  firma_strasse: 'Beispielweg 1',
  firma_plz: '71032',
  firma_ort: 'Böblingen',
  firma_telefon: '07031 000000',
  firma_rechtsform: 'GmbH',
  firma_geschaeftsfuehrer: 'Max Muster',
  branche: 'Musterbetrieb mit allen Modulen',
  kategorie: XXL_KATEGORIE,
} as const;

/** Alle Modul-Schlüssel aller Kategorien (Kern + jede Zusatzliste), sortiert und ohne Doppelte. */
export function alleModuleXxl(): string[] {
  const alle = new Set<string>();
  for (const kat of Object.keys(KATEGORIE_MODULE)) for (const m of kategorieModule(kat)) alle.add(m);
  return [...alle].sort();
}

/** Starkes Einmal-Passwort (wird nur im Ergebnis gezeigt, nirgends gespeichert). */
export function xxlPasswort(zufall: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const zeichen = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 20; i += 1) s += zeichen[zufall(zeichen.length)];
  return `Xxl-${s}`;
}

/** Darf dieses Konto vom Musterbetrieb-Knopf gelöscht werden? Nur mit Adresse UND Kennzeichen. */
export function istXxlKonto(konto: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!konto) return false;
  const mail = String(konto.email || '').trim().toLowerCase();
  return mail === XXL_EMAIL && konto.app_metadata?.[XXL_KENNZEICHEN] === true;
}

// ---------------------------------------------------------------------------
// Datums-Helfer (reine Funktionen, heute = 'YYYY-MM-DD')
// ---------------------------------------------------------------------------

/** Datum um n Tage verschoben. */
export function tagPlus(heute: string, n: number): string {
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Montag der Woche von `heute`. */
export function wochenMontag(heute: string): string {
  const d = new Date(`${heute}T12:00:00Z`);
  const wt = (d.getUTCDay() + 6) % 7; // Mo = 0
  return tagPlus(heute, -wt);
}

/** Werktage (Mo–Fr) rückwärts ab gestern, n Stück, älteste zuerst. */
export function letzteWerktage(heute: string, n: number): string[] {
  const aus: string[] = [];
  let i = 1;
  while (aus.length < n && i < 60) {
    const t = tagPlus(heute, -i);
    const wt = new Date(`${t}T12:00:00Z`).getUTCDay();
    if (wt !== 0 && wt !== 6) aus.push(t);
    i += 1;
  }
  return aus.reverse();
}

/** Versatz Europe/Berlin zu UTC an diesem Tag ('+01:00' oder '+02:00'). */
export function berlinVersatz(datum: string): string {
  // Letzter Sonntag im März / Oktober, jeweils 01:00 UTC.
  const jahr = Number(datum.slice(0, 4));
  const letzterSonntag = (monat: number) => {
    const d = new Date(Date.UTC(jahr, monat + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  };
  return datum >= letzterSonntag(2) && datum < letzterSonntag(9) ? '+02:00' : '+01:00';
}

/** Zeitpunkt in deutscher Ortszeit als ISO mit Versatz, z. B. 2026-09-30T08:00:00+02:00. */
export function berlinZeit(datum: string, hhmm: string): string {
  return `${datum}T${hhmm}:00${berlinVersatz(datum)}`;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Kontext + Seeder-Typ
// ---------------------------------------------------------------------------

export type XxlKontext = {
  uid: string;
  heute: string;
  /** IDs je Tabelle in Anlege-Reihenfolge. */
  ids: Record<string, string[]>;
  /** Die angelegten Zeilen je Tabelle (gleiche Reihenfolge wie ids). */
  zeilen: Record<string, SeedZeile[]>;
};

export type XxlGruppe = 'basis' | 'personal' | 'auftraege' | 'finanzen' | 'crm' | 'lager' | 'bau';

export type XxlSeeder = {
  key: string;
  tabelle: string;
  gruppe: XxlGruppe;
  /** Anschluss-Tabelle ohne `id` — nicht im Register, gelöscht über DEMO_TOKEN. */
  zugang?: boolean;
  baue: (ctx: XxlKontext) => SeedZeile[];
};

const id = (ctx: XxlKontext, tabelle: string, i = 0): string | null => {
  const liste = ctx.ids[tabelle] || [];
  return liste.length ? liste[i % liste.length] : null;
};

// ---------------------------------------------------------------------------
// Erfundene Personen
// ---------------------------------------------------------------------------

const MITARBEITER = [
  { vorname: 'Lena', nachname: 'Beispiel', position: 'Meisterin', modell: 'vollzeit', std: 40, eintritt: -2200 },
  { vorname: 'Tom', nachname: 'Muster', position: 'Geselle', modell: 'vollzeit', std: 40, eintritt: -1300 },
  { vorname: 'Aylin', nachname: 'Probe', position: 'Bürokauffrau', modell: 'teilzeit', std: 25, eintritt: -900 },
  { vorname: 'Jonas', nachname: 'Test', position: 'Auszubildender', modell: 'vollzeit', std: 40, eintritt: -400 },
  { vorname: 'Mia', nachname: 'Vorlage', position: 'Aushilfe', modell: 'minijob', std: 10, eintritt: -200 },
  { vorname: 'Karl', nachname: 'Schablone', position: 'Monteur', modell: 'vollzeit', std: 40, eintritt: -3000 },
];

const mailVon = (vorname: string, nachname: string) =>
  `${vorname}.${nachname}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${BEISPIEL_DOMAIN}`;

// ---------------------------------------------------------------------------
// Gruppe PERSONAL
// ---------------------------------------------------------------------------

function baueMitarbeiter(ctx: XxlKontext): SeedZeile[] {
  return MITARBEITER.map((m) => ({
    owner_user_id: ctx.uid,
    standort_id: null,
    vorname: m.vorname,
    nachname: m.nachname,
    email: mailVon(m.vorname, m.nachname),
    telefon: null,
    position: m.position,
    status: 'aktiv',
    eintrittsdatum: tagPlus(ctx.heute, m.eintritt),
    arbeitszeit_modell: m.modell,
    wochenstunden: m.std,
    urlaubsanspruch_tage: 30,
  }));
}

function baueZeiterfassung(ctx: XxlKontext): SeedZeile[] {
  const tage = letzteWerktage(ctx.heute, 8);
  const aus: SeedZeile[] = [];
  (ctx.ids.mitarbeiter || []).slice(0, 4).forEach((maId, i) => {
    for (const t of tage) {
      aus.push({
        owner_user_id: ctx.uid,
        mitarbeiter_id: maId,
        datum: t,
        kommen_um: berlinZeit(t, i % 2 ? '07:30' : '07:00'),
        gehen_um: berlinZeit(t, i === 2 ? '12:30' : '16:00'),
        pause_minuten: i === 2 ? 0 : 30,
        quelle: 'nachtrag',
      });
    }
  });
  return aus;
}

function baueAbwesenheiten(ctx: XxlKontext): SeedZeile[] {
  const ma = ctx.ids.mitarbeiter || [];
  if (ma.length < 3) return [];
  return [
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[0], typ: 'urlaub', von: tagPlus(ctx.heute, 14), bis: tagPlus(ctx.heute, 18), tage: 5, status: 'genehmigt', au_vorhanden: false, notiz: XXL_NOTIZ },
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[1], typ: 'urlaub', von: tagPlus(ctx.heute, 30), bis: tagPlus(ctx.heute, 34), tage: 5, status: 'beantragt', au_vorhanden: false, notiz: XXL_NOTIZ },
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[2], typ: 'urlaub', von: tagPlus(ctx.heute, -40), bis: tagPlus(ctx.heute, -36), tage: 5, status: 'genehmigt', au_vorhanden: false, notiz: XXL_NOTIZ },
    // Erfunden wie die Person selbst — zum Durchklicken der Krankmeldung.
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[3] ?? ma[0], typ: 'krankheit', von: tagPlus(ctx.heute, -10), bis: tagPlus(ctx.heute, -8), tage: 3, status: 'erfasst', au_vorhanden: true, notiz: XXL_NOTIZ },
  ];
}

function baueSchichten(ctx: XxlKontext): SeedZeile[] {
  const ma = ctx.ids.mitarbeiter || [];
  if (!ma.length) return [];
  const mo = wochenMontag(ctx.heute);
  const aus: SeedZeile[] = [];
  for (let w = 0; w < 2; w += 1) {
    for (let t = 0; t < 5; t += 1) {
      const datum = tagPlus(mo, w * 7 + t);
      ma.slice(0, 3).forEach((maId, i) => {
        aus.push({
          owner_user_id: ctx.uid, mitarbeiter_id: maId, datum,
          beginn_um: i === 2 ? '12:00' : '07:00', ende_um: i === 2 ? '18:00' : '15:30',
          pause_minuten: 30, rolle: i === 2 ? 'Spätdienst' : 'Frühdienst',
          notiz: XXL_NOTIZ, farbe: i === 2 ? '#C9A84C' : '#00e5ff', status: 'geplant',
        });
      });
    }
  }
  return aus;
}

function baueSchulungen(ctx: XxlKontext): SeedZeile[] {
  const ma = ctx.ids.mitarbeiter || [];
  if (ma.length < 2) return [];
  return [
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[0], titel: 'Unterweisung Arbeitsschutz', kategorie: 'arbeitsschutz', absolviert_am: tagPlus(ctx.heute, -120), gueltig_bis: tagPlus(ctx.heute, 245), status: 'absolviert' },
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[1], titel: 'Ersthelfer-Kurs', kategorie: 'erste_hilfe', absolviert_am: tagPlus(ctx.heute, -700), gueltig_bis: tagPlus(ctx.heute, 20), status: 'absolviert' },
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[0], titel: 'Datenschutz-Schulung', kategorie: 'datenschutz', absolviert_am: null, gueltig_bis: null, status: 'offen' },
    { owner_user_id: ctx.uid, mitarbeiter_id: ma[1], titel: 'Brandschutzhelfer', kategorie: 'brandschutz', absolviert_am: tagPlus(ctx.heute, -30), gueltig_bis: tagPlus(ctx.heute, 1065), status: 'absolviert' },
  ];
}

function baueBewerber(ctx: XxlKontext): SeedZeile[] {
  const B = [
    { v: 'Paula', n: 'Anwaerter', p: 'Geselle/Gesellin', q: 'Website', s: 'neu' },
    { v: 'Emil', n: 'Kandidat', p: 'Auszubildender', q: 'Arbeitsagentur', s: 'eingeladen' },
    { v: 'Sara', n: 'Bewerbung', p: 'Bürokraft', q: 'Empfehlung', s: 'in_pruefung' },
  ];
  return B.map((b) => ({
    owner_user_id: ctx.uid, vorname: b.v, nachname: b.n, email: mailVon(b.v, b.n),
    telefon: null, position: b.p, quelle: b.q, status: b.s,
  }));
}

// ---------------------------------------------------------------------------
// Gruppe AUFTRÄGE / EINSÄTZE / TERMINE / AUFGABEN
// ---------------------------------------------------------------------------

const AUFTRAEGE = [
  { titel: 'Badsanierung Familie Beispiel', status: 'in_bearbeitung', pos: [['Fliesenarbeiten', 24, 'm²', 68], ['Sanitärmontage', 16, 'Std', 62], ['Material pauschal', 1, 'Psch', 1450]] },
  { titel: 'Dachrinne erneuern', status: 'beauftragt', pos: [['Dachrinne Zink', 18, 'lfm', 42], ['Montage', 8, 'Std', 58]] },
  { titel: 'Wartung Heizungsanlage', status: 'abgeschlossen', pos: [['Wartungspauschale', 1, 'Psch', 189]] },
  { titel: 'Angebot Fassadenanstrich', status: 'entwurf', pos: [['Fassadenanstrich', 140, 'm²', 18.5], ['Gerüst', 1, 'Psch', 980]] },
] as const;

function baueAuftraege(ctx: XxlKontext): SeedZeile[] {
  return AUFTRAEGE.map((a, i) => {
    const netto = r2(a.pos.reduce((s, p) => s + Number(p[1]) * Number(p[3]), 0));
    const mwst = r2(netto * 0.19);
    return {
      owner_user_id: ctx.uid, titel: a.titel, status: a.status,
      auftragsdatum: tagPlus(ctx.heute, -20 + i * 5), kontakt_id: id(ctx, 'kontakte', i),
      standort_id: null, waehrung: 'EUR',
      netto_summe: netto, mwst_summe: mwst, brutto_summe: r2(netto + mwst), notizen: XXL_NOTIZ,
    };
  });
}

function baueAuftragPositionen(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  (ctx.ids.auftraege || []).forEach((aId, i) => {
    const a = AUFTRAEGE[i];
    if (!a) return;
    a.pos.forEach((p, j) => {
      aus.push({
        owner_user_id: ctx.uid, auftrag_id: aId, position: j + 1, bezeichnung: p[0],
        menge: p[1], einheit: p[2], einzelpreis: p[3], mwst_satz: 19, gesamt_netto: r2(Number(p[1]) * Number(p[3])),
      });
    });
  });
  return aus;
}

function baueEinsaetze(ctx: XxlKontext): SeedZeile[] {
  const ma = ctx.ids.mitarbeiter || [];
  const mo = wochenMontag(ctx.heute);
  const E = [
    { t: 0, b: '08:00', e: '12:00', titel: 'Aufmaß Bad', ort: 'Musterstraße 5, 71032 Böblingen', st: 'erledigt', ma: 0 },
    { t: 1, b: '07:30', e: '16:00', titel: 'Fliesen verlegen', ort: 'Musterstraße 5, 71032 Böblingen', st: 'geplant', ma: 1 },
    { t: 2, b: '09:00', e: '11:00', titel: 'Heizungswartung', ort: 'Probeweg 12, 71063 Sindelfingen', st: 'geplant', ma: 5 },
    { t: 3, b: '08:00', e: '15:00', titel: 'Dachrinne montieren', ort: 'Testallee 3, 71034 Böblingen', st: 'geplant', ma: 1 },
    { t: 4, b: '13:00', e: '15:00', titel: 'Abnahme mit Kunde', ort: 'Musterstraße 5, 71032 Böblingen', st: 'geplant', ma: -1 },
    { t: 8, b: '08:00', e: '16:00', titel: 'Fassade vorbereiten', ort: 'Vorlagenring 8, 71065 Sindelfingen', st: 'geplant', ma: 0 },
  ];
  return E.map((x, i) => {
    const datum = tagPlus(mo, x.t);
    const chef = x.ma < 0 || !ma.length;
    return {
      owner_user_id: ctx.uid, standort_id: null, quelle: 'dispo',
      mitarbeiter_id: chef ? null : ma[x.ma % ma.length], inhaber_einsatz: chef,
      titel: x.titel, beschreibung: XXL_NOTIZ, einsatzort: x.ort,
      beginn_am: berlinZeit(datum, x.b), ende_am: berlinZeit(datum, x.e), status: x.st,
      kunde_name: `Kunde ${i + 1} (Beispiel)`, kunde_email: null, kunde_telefon: null,
      auftrag_id: id(ctx, 'auftraege', i),
    };
  });
}

function baueTermine(ctx: XxlKontext): SeedZeile[] {
  const T = [
    { t: -5, b: '10:00', e: '11:00', titel: 'Erstberatung Badsanierung' },
    { t: -1, b: '14:00', e: '14:30', titel: 'Telefonat Lieferant' },
    { t: 1, b: '09:00', e: '10:00', titel: 'Besichtigung Fassade' },
    { t: 2, b: '15:00', e: '16:00', titel: 'Teambesprechung' },
    { t: 5, b: '11:00', e: '12:00', titel: 'Übergabe Dachrinne' },
    { t: 9, b: '08:30', e: '09:30', titel: 'Steuerberater' },
  ];
  return T.map((x, i) => {
    const datum = tagPlus(ctx.heute, x.t);
    return {
      owner_user_id: ctx.uid, standort_id: null, titel: x.titel,
      beginn_am: berlinZeit(datum, x.b), ende_am: berlinZeit(datum, x.e),
      ort: i % 2 ? 'Büro' : 'Beim Kunden', status: 'geplant',
      // Bewusst ohne Kunden-Adresse und ohne Erinnerung: aus dem Musterbetrieb geht keine Mail raus.
      kunde_email: null, erinnerung_min: null,
      kontakt_id: id(ctx, 'kontakte', i), notiz: XXL_NOTIZ, ressource: null,
    };
  });
}

function baueAufgaben(ctx: XxlKontext): SeedZeile[] {
  const projekt = id(ctx, 'projekte');
  if (!projekt) return [];
  const ma = ctx.ids.mitarbeiter || [];
  const A = [
    { t: 'Material bestellen', s: 'fertig', p: 'hoch', f: -3 },
    { t: 'Baustelle einrichten', s: 'fertig', p: 'normal', f: -1 },
    { t: 'Fliesen verlegen', s: 'in_arbeit', p: 'hoch', f: 3 },
    { t: 'Silikonfugen ziehen', s: 'todo', p: 'normal', f: 6 },
    { t: 'Abnahmeprotokoll vorbereiten', s: 'review', p: 'normal', f: 7 },
    { t: 'Schlussrechnung schreiben', s: 'todo', p: 'dringend', f: 10 },
  ];
  return A.map((a, i) => ({
    owner_user_id: ctx.uid, projekt_id: projekt, titel: a.t, beschreibung: XXL_NOTIZ,
    status: a.s, prioritaet: a.p, faellig_am: tagPlus(ctx.heute, a.f),
    mitarbeiter_id: ma.length ? ma[i % ma.length] : null, erledigt: a.s === 'fertig', sortierung: i,
  }));
}

function baueErinnerungen(ctx: XxlKontext): SeedZeile[] {
  const E = [
    { t: 'Rückruf wegen Angebot', k: 'telefon', f: 1 },
    { t: 'Wartung in 11 Monaten anbieten', k: 'persoenlich', f: 330 },
    { t: 'Nachfassen Fassadenanstrich', k: 'telefon', f: 4 },
  ];
  return E.map((e, i) => ({
    owner_user_id: ctx.uid, titel: e.t, bezug_typ: 'frei', bezug_id: null,
    kontakt_id: id(ctx, 'kontakte', i), kunde_name: `Kunde ${i + 1} (Beispiel)`,
    kanal: e.k, faellig_am: `${tagPlus(ctx.heute, e.f)}T09:00`, termin_am: null,
    status: 'offen', notiz: XXL_NOTIZ, email: null,
  }));
}

// ---------------------------------------------------------------------------
// Gruppe FINANZEN
// ---------------------------------------------------------------------------

function baueAusgaben(ctx: XxlKontext): SeedZeile[] {
  const A = [
    ['Fliesenkleber und Fugenmasse', 'Wareneinkauf', 312.4, 19, 'Überweisung', 'Baustoff Beispiel KG'],
    ['Druckerpapier und Toner', 'Büromaterial', 89.9, 19, 'Karte', 'Bürobedarf Muster'],
    ['Miete Werkstatt', 'Miete & Nebenkosten', 1450, 0, 'Lastschrift', 'Vermietung Probe GbR'],
    ['Diesel Transporter', 'Fahrzeug & Tanken', 96.2, 19, 'Karte', 'Tankstelle Beispiel'],
    ['Handwerker-Software', 'Software & IT', 49, 19, 'Lastschrift', 'Software Muster GmbH'],
    ['Betriebshaftpflicht', 'Versicherungen', 620, 0, 'Überweisung', 'Versicherung Beispiel AG'],
    ['Fachbuch Normen', 'Fortbildung', 64.5, 7, 'Bar', 'Buchhandlung Vorlage'],
    ['Anzeige Gemeindeblatt', 'Marketing & Werbung', 180, 19, 'Überweisung', 'Verlag Test'],
  ] as const;
  return A.map((a, i) => ({
    owner_user_id: ctx.uid, bezeichnung: a[0], kategorie: a[1], betrag_brutto: a[2], mwst_satz: a[3],
    ausgabedatum: tagPlus(ctx.heute, -3 - i * 4), lieferant: a[5], zahlungsart: a[4],
    beleg_pfad: null, notiz: XXL_NOTIZ,
  }));
}

/** Je Übungswelt-Rechnung eine Position, die genau die Netto-Summe trägt. */
function baueRechnungPositionen(ctx: XxlKontext): SeedZeile[] {
  const ids = ctx.ids.rechnungen || [];
  const zeilen = ctx.zeilen.rechnungen || [];
  return ids.map((rId, i) => {
    const r = zeilen[i] || {};
    const netto = Number(r.netto_summe) || 0;
    return {
      owner_user_id: ctx.uid, rechnung_id: rId, position: 1,
      bezeichnung: String(r.titel || 'Leistung'), beschreibung: XXL_NOTIZ,
      menge: 1, einheit: 'Psch', einzelpreis: netto, mwst_satz: 19, gesamt_netto: netto,
    };
  });
}

// ---------------------------------------------------------------------------
// Gruppe CRM / MARKETING / LEADS
// ---------------------------------------------------------------------------

function baueLeads(ctx: XxlKontext): SeedZeile[] {
  const L = [
    { n: 'Hanna Anfrage', d: 'Badsanierung', s: 'neu', st: 'eintragung', q: 'Website' },
    { n: 'Otto Interesse', d: 'Dachrinne', s: 'offen', st: 'termin_gebucht', q: 'Manuell' },
    { n: 'Frieda Rueckruf', d: 'Fassadenanstrich', s: 'offen', st: 'termin_gehalten', q: 'KI-Berater' },
    { n: 'Bruno Kunde', d: 'Heizungswartung', s: 'gewonnen', st: 'kunde', q: 'Website' },
    { n: 'Clara Absage', d: 'Carport', s: 'verloren', st: 'verloren', q: 'Manuell' },
  ];
  return L.map((l, i) => {
    const [v, n] = l.n.split(' ');
    return {
      owner_user_id: ctx.uid, name: l.n, email: mailVon(v, n), telefon: null,
      dienstleistung: l.d, nachricht: `${l.d}: bitte um Rückmeldung. (${XXL_NOTIZ})`,
      ist_bestand: i === 3, werbung_einwilligung: false, einwilligung_am: null,
      status: l.s, stufe: l.st, quelle: l.q, standort_id: null,
    };
  });
}

function baueKontaktAktivitaeten(ctx: XxlKontext): SeedZeile[] {
  const k = ctx.ids.kontakte || [];
  const A = [
    ['anruf', 'Rückruf: Termin für Besichtigung vereinbart.'],
    ['email', 'Angebot per Mail geschickt.'],
    ['termin', 'Vor-Ort-Termin: Maße aufgenommen.'],
    ['notiz', 'Kunde wünscht Ausführung vor den Ferien.'],
  ] as const;
  const aus: SeedZeile[] = [];
  k.slice(0, 3).forEach((kId, i) => {
    A.slice(0, 2 + (i % 2)).forEach((a, j) => {
      aus.push({
        owner_user_id: ctx.uid, kontakt_id: kId, typ: a[0], inhalt: a[1], ki_generiert: false,
        aktivitaet_am: berlinZeit(tagPlus(ctx.heute, -12 + i * 3 + j), '10:00'),
      });
    });
  });
  return aus;
}

function baueVerkaufschancen(ctx: XxlKontext): SeedZeile[] {
  const V = [
    ['Badsanierung Beispiel', 'erstkontakt', 8500, 10],
    ['Fassade Wohnanlage', 'qualifiziert', 42000, 30],
    ['Dachsanierung Gewerbehalle', 'angebot', 27500, 50],
    ['Wartungsvertrag Hausverwaltung', 'verhandlung', 6400, 75],
    ['Heizungstausch Praxis', 'gewonnen', 15800, 100],
  ] as const;
  return V.map((v, i) => ({
    owner_user_id: ctx.uid, titel: v[0], kontakt_id: id(ctx, 'kontakte', i), phase: v[1],
    wert: v[2], wahrscheinlichkeit: v[3], erwartetes_abschlussdatum: tagPlus(ctx.heute, 10 + i * 12),
    notizen: XXL_NOTIZ,
  }));
}

function baueKampagnen(ctx: XxlKontext): SeedZeile[] {
  return [
    { owner_user_id: ctx.uid, name: 'Frühjahrs-Check Heizung', ziel: 'Wartungstermine füllen', beschreibung: XXL_NOTIZ, status: 'aktiv', kanaele: ['email', 'website'], budget: 400, start_datum: tagPlus(ctx.heute, -10), end_datum: tagPlus(ctx.heute, 20) },
    { owner_user_id: ctx.uid, name: 'Badsanierung aus einer Hand', ziel: 'Anfragen Bad', beschreibung: XXL_NOTIZ, status: 'entwurf', kanaele: ['instagram', 'facebook'], budget: 750, start_datum: tagPlus(ctx.heute, 14), end_datum: tagPlus(ctx.heute, 60) },
    { owner_user_id: ctx.uid, name: 'Tag der offenen Werkstatt', ziel: 'Bekanntheit', beschreibung: XXL_NOTIZ, status: 'abgeschlossen', kanaele: ['print', 'website'], budget: 300, start_datum: tagPlus(ctx.heute, -90), end_datum: tagPlus(ctx.heute, -60) },
  ];
}

function baueMarketingKalender(ctx: XxlKontext): SeedZeile[] {
  const k = ctx.ids.marketing_kampagnen || [];
  const E = [
    ['Beitrag: Heizung jetzt prüfen lassen', 'email', 'veroeffentlicht', -5, 0],
    ['Startseite: Aktion Frühjahrs-Check', 'website', 'geplant', 2, 0],
    ['Vorher-Nachher-Bild Bad', 'instagram', 'entwurf', 16, 1],
    ['Kundenstimme Badsanierung', 'facebook', 'geplant', 21, 1],
    ['Nachbericht offene Werkstatt', 'website', 'veroeffentlicht', -58, 2],
  ] as const;
  return E.map((e) => ({
    owner_user_id: ctx.uid, titel: e[0], kampagne_id: k[e[4]] ?? null, kanal: e[1], status: e[2],
    geplant_am: berlinZeit(tagPlus(ctx.heute, e[3]), '09:00'), notiz: XXL_NOTIZ,
  }));
}

function baueLeistungskatalog(ctx: XxlKontext): SeedZeile[] {
  const L = [
    { b: 'Meisterstunde', k: 'Lohn', e: 'stunden', h: 72 },
    { b: 'Gesellenstunde', k: 'Lohn', e: 'stunden', h: 58 },
    { b: 'Azubistunde', k: 'Lohn', e: 'stunden', h: 32 },
    { b: 'Anfahrt Zone 1', k: 'Pauschalen', e: 'stueck', einheit: 'Psch', p: 35 },
    { b: 'Fliesen verlegen', k: 'Leistungen', e: 'stueck', einheit: 'm²', p: 68 },
    { b: 'Silikonfuge', k: 'Leistungen', e: 'stueck', einheit: 'lfm', p: 9.5 },
  ];
  return L.map((l) => ({
    owner_user_id: ctx.uid, bezeichnung: `${l.b} (Beispiel)`, kuerzel: null, kategorie: l.k,
    erfassungsart: l.e, standard_wert: 1, aw_minuten: null,
    einheit: l.e === 'stueck' ? l.einheit : null,
    einheitspreis_netto: l.e === 'stueck' ? l.p : null,
    stundensatz_netto: l.e === 'stueck' ? null : l.h,
    festpreis_netto: 0, mwst_satz: 19, notiz: XXL_NOTIZ, aktiv: true,
  }));
}

// ---------------------------------------------------------------------------
// Gruppe LAGER / EINKAUF / FUHRPARK
// ---------------------------------------------------------------------------

const BESTELLUNGEN = [
  { nr: 'BE-XXL-0001', st: 'geliefert', t: -21, pos: [['Fliesen 30x60 grau', 30, 'm²', 24.9], ['Fliesenkleber 25 kg', 12, 'Stk', 18.4]] },
  { nr: 'BE-XXL-0002', st: 'bestellt', t: -3, pos: [['Dachrinne Zink 333 mm', 20, 'lfm', 21.5], ['Rinnenhaken', 30, 'Stk', 3.2]] },
  { nr: 'BE-XXL-0003', st: 'entwurf', t: 0, pos: [['Fassadenfarbe weiß 15 l', 10, 'Stk', 89]] },
] as const;

function baueBestellungen(ctx: XxlKontext): SeedZeile[] {
  return BESTELLUNGEN.map((b) => ({
    owner_user_id: ctx.uid, standort_id: null, lieferant_id: null, bestell_nr: b.nr,
    datum: tagPlus(ctx.heute, b.t), status: b.st,
    liefer_datum: b.st === 'geliefert' ? tagPlus(ctx.heute, b.t + 4) : null, notiz: XXL_NOTIZ,
  }));
}

function baueBestellPositionen(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  (ctx.ids.bestellung || []).forEach((bId, i) => {
    const b = BESTELLUNGEN[i];
    if (!b) return;
    for (const p of b.pos) {
      aus.push({
        owner_user_id: ctx.uid, bestellung_id: bId, artikel: p[0], menge: p[1], einheit: p[2],
        ek_preis: p[3], mwst_satz: 19, menge_erhalten: b.st === 'geliefert' ? p[1] : 0, retoure_menge: 0,
      });
    }
  });
  return aus;
}

function baueInventar(ctx: XxlKontext): SeedZeile[] {
  const I = [
    ['Bohrhammer SDS', 'INV-XXL-001', 'Werkzeug', 'gut', 480, 60],
    ['Fliesenschneider 120 cm', 'INV-XXL-002', 'Werkzeug', 'gebraucht', 390, null],
    ['Laser-Entfernungsmesser', 'INV-XXL-003', 'Messgeräte', 'neu', 210, 300],
    ['Leiter 3-teilig', 'INV-XXL-004', 'Arbeitsschutz', 'gut', 260, 12],
    ['Notebook Büro', 'INV-XXL-005', 'IT', 'gut', 1150, null],
    ['Stromaggregat', 'INV-XXL-006', 'Maschinen', 'defekt', 890, -5],
  ] as const;
  return I.map((x, i) => ({
    owner_user_id: ctx.uid, bezeichnung: x[0], inventarnummer: x[1], kategorie: x[2],
    seriennummer: null, standort: i % 2 ? 'Werkstatt' : 'Transporter 1', zustand: x[3],
    anschaffungsdatum: tagPlus(ctx.heute, -300 - i * 90), anschaffungswert: x[4],
    naechste_pruefung_am: x[5] === null ? null : tagPlus(ctx.heute, x[5]), notizen: XXL_NOTIZ,
  }));
}

function baueFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  const F = [
    ['Transporter 1', 'BB-XX 101', 'Transporter', 'Diesel', 84210, 200, 45],
    ['Transporter 2', 'BB-XX 102', 'Transporter', 'Diesel', 132900, 14, 120],
    ['Firmenwagen', 'BB-XX 103', 'PKW', 'Elektro', 21500, 500, 300],
  ] as const;
  return F.map((f) => ({
    owner_user_id: ctx.uid, bezeichnung: f[0], kennzeichen: f[1], fahrzeugtyp: f[2],
    fahrgestellnummer: null, erstzulassung: tagPlus(ctx.heute, -1400),
    tuev_bis: tagPlus(ctx.heute, f[5]), wartung_bis: tagPlus(ctx.heute, f[6]), versicherung_bis: tagPlus(ctx.heute, 200),
    km_stand: f[4], kraftstoff: f[3], notizen: XXL_NOTIZ, aktiv: true,
  }));
}

// ---------------------------------------------------------------------------
// Gruppe BAU
// ---------------------------------------------------------------------------

function baueBautagebuch(ctx: XxlKontext): SeedZeile[] {
  const projekt = id(ctx, 'projekte');
  if (!projekt) return [];
  const W = [['sonnig', 18], ['bewölkt', 14], ['Regen', 11], ['sonnig', 20], ['bewölkt', 16]] as const;
  return letzteWerktage(ctx.heute, 5).map((t, i) => ({
    owner_user_id: ctx.uid, projekt_id: projekt, erstellt_von: ctx.uid, datum: t,
    wetter: W[i][0], temperatur: String(W[i][1]), anwesende: '2 Monteure, 1 Azubi',
    arbeiten: ['Baustelle eingerichtet', 'Altbelag entfernt', 'Estrich geprüft', 'Abdichtung aufgetragen', 'Fliesen Wand begonnen'][i],
    material: i === 3 ? 'Dichtschlämme 2 Eimer' : null,
    vorkommnisse: i === 2 ? 'Regen, Arbeiten innen fortgesetzt' : null,
  }));
}

function baueMaengel(ctx: XxlKontext): SeedZeile[] {
  const projekt = id(ctx, 'projekte');
  if (!projekt) return [];
  return [
    { owner_user_id: ctx.uid, projekt_id: projekt, titel: 'Fuge an Duschtasse undicht', beschreibung: XXL_NOTIZ, frist: tagPlus(ctx.heute, 7), status: 'offen' },
    { owner_user_id: ctx.uid, projekt_id: projekt, titel: 'Fliese mit Haarriss', beschreibung: XXL_NOTIZ, frist: tagPlus(ctx.heute, 14), status: 'in_arbeit' },
    { owner_user_id: ctx.uid, projekt_id: projekt, titel: 'Silikon nachziehen', beschreibung: XXL_NOTIZ, frist: tagPlus(ctx.heute, -2), status: 'behoben', erledigt_am: berlinZeit(tagPlus(ctx.heute, -1), '15:00') },
  ];
}

const AUFMASSE = [
  { titel: 'Aufmaß Bad OG', nr: 'AM-XXL-01', st: 'fertig', pos: [['Wandfliesen', 32.4, 'm²', 68, '2,40 × 13,5'], ['Bodenfliesen', 8.2, 'm²', 72, '2,05 × 4,00'], ['Silikonfuge', 14, 'lfm', 9.5, 'Umfang Wanne + Dusche']] },
  { titel: 'Aufmaß Fassade Süd', nr: 'AM-XXL-02', st: 'entwurf', pos: [['Fassadenfläche', 142.5, 'm²', 18.5, '9,50 × 15,00']] },
] as const;

function baueAufmasse(ctx: XxlKontext): SeedZeile[] {
  return AUFMASSE.map((a, i) => ({
    owner_user_id: ctx.uid, titel: a.titel, nummer: a.nr, kunde_name: `Kunde ${i + 1} (Beispiel)`,
    projekt: 'Beispiel-Projekt (Uebungswelt)', ort: 'Böblingen', status: a.st,
    aufmass_datum: tagPlus(ctx.heute, -6 + i * 3), bearbeiter: 'Lena Beispiel', notiz: XXL_NOTIZ, standort_id: null,
  }));
}

function baueAufmassPositionen(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  (ctx.ids.aufmasse || []).forEach((aId, i) => {
    const a = AUFMASSE[i];
    if (!a) return;
    a.pos.forEach((p, j) => {
      aus.push({
        owner_user_id: ctx.uid, aufmass_id: aId, position_nr: String(j + 1), bezeichnung: p[0],
        menge: p[1], einheit: p[2], einzelpreis_netto: p[3], festpreis_netto: null, mwst_satz: 19,
        rechenweg: p[4], leistung_id: null,
      });
    });
  });
  return aus;
}

const LV_POS = [
  ['01.01.001', 'Baustelleneinrichtung', 1, 'Psch', 450],
  ['01.02.001', 'Wandfliesen liefern und verlegen', 32.4, 'm²', 68],
  ['01.02.002', 'Bodenfliesen liefern und verlegen', 8.2, 'm²', 72],
  ['01.03.001', 'Abdichtung Nassbereich', 12, 'm²', 38],
] as const;

function baueBauLv(ctx: XxlKontext): SeedZeile[] {
  const netto = r2(LV_POS.reduce((s, p) => s + Number(p[2]) * Number(p[4]), 0));
  return [{
    owner_user_id: ctx.uid, titel: 'LV Badsanierung (Beispiel)', kunde_name: 'Kunde 1 (Beispiel)',
    status: 'entwurf', projekt_id: id(ctx, 'projekte'), kontakt_id: id(ctx, 'kontakte'), netto_summe: netto,
  }];
}

function baueBauLvPositionen(ctx: XxlKontext): SeedZeile[] {
  const lv = id(ctx, 'bau_lv');
  if (!lv) return [];
  return LV_POS.map((p, i) => ({
    owner_user_id: ctx.uid, lv_id: lv, ordnungszahl: p[0], kurztext: p[1], menge: p[2], einheit: p[3],
    einzelpreis: p[4], mwst_satz: 19, gesamt_netto: r2(Number(p[2]) * Number(p[4])),
    ist_nachtrag: false, nachtrag_grund: null, position: i + 1,
  }));
}

function baueBauNachtraege(ctx: XxlKontext): SeedZeile[] {
  const lv = id(ctx, 'bau_lv');
  return [
    {
      owner_user_id: ctx.uid, erstellt_von: ctx.uid, nummer: 'N01', titel: 'Zusätzliche Vorwandinstallation',
      art: 'zusaetzlich', vertragsart: 'vob', status: 'angeboten', lv_id: lv, projekt_id: id(ctx, 'projekte'),
      beschreibung: XXL_NOTIZ, ursache: 'Kundenwunsch vor Ort', entdeckt_am: tagPlus(ctx.heute, -8),
      angekuendigt_am: tagPlus(ctx.heute, -7), angeboten_am: tagPlus(ctx.heute, -5), antwort_bis: tagPlus(ctx.heute, 5),
      betrag_netto: 1280, positionen: [{ kurztext: 'Vorwandelement WC', menge: 1, einheit: 'Stk', einzelpreis: 1280 }],
    },
    {
      owner_user_id: ctx.uid, erstellt_von: ctx.uid, nummer: 'N02', titel: 'Mehrmenge Abdichtung',
      art: 'menge', vertragsart: 'vob', status: 'entdeckt', lv_id: lv, projekt_id: id(ctx, 'projekte'),
      beschreibung: XXL_NOTIZ, ursache: 'Untergrund schlechter als angenommen', entdeckt_am: tagPlus(ctx.heute, -1),
      betrag_netto: null, positionen: [{ kurztext: 'Abdichtung Nassbereich', menge: 4, einheit: 'm²', einzelpreis: 38 }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Gruppe BASIS: die Übungswelt komplett (ungegatet) + ihre verzahnten Belege
// ---------------------------------------------------------------------------

/** Die Übungswelt-Seeder, auf den XXL-Kontext umgestellt (alle, ohne Modul-Gate). */
function basisSeeder(): XxlSeeder[] {
  return SEEDER.map((s) => ({
    key: `uebungswelt_${s.key}`,
    tabelle: s.tabelle,
    gruppe: 'basis' as const,
    zugang: s.zugang,
    baue: (ctx: XxlKontext) => s.baue(XXL_KATEGORIE, ctx.uid, ctx.heute),
  }));
}

function kontaktRef(ctx: XxlKontext): KontaktRef | null {
  const kId = id(ctx, 'kontakte');
  const k = (ctx.zeilen.kontakte || [])[0];
  if (!kId || !k) return null;
  return { id: kId, firma: (k.firma as string) ?? null, vorname: (k.vorname as string) ?? null, nachname: (k.nachname as string) ?? null, email: (k.email as string) ?? null };
}

// ---------------------------------------------------------------------------
// DIE REIHENFOLGE — Eltern vor Kindern
// ---------------------------------------------------------------------------

export const XXL_SEEDER: XxlSeeder[] = [
  ...basisSeeder(),
  { key: 'angebot_verzahnt', tabelle: 'angebote', gruppe: 'basis', baue: (ctx) => {
    const k = kontaktRef(ctx);
    return k ? [baueAngebotKopf(k, ctx.uid, tagPlus(ctx.heute, 30))] : [];
  } },
  { key: 'angebot_positionen', tabelle: 'angebot_positionen', gruppe: 'basis', baue: (ctx) => {
    // Das verzahnte Angebot ist das LETZTE in der angebote-Liste (die Übungswelt-Angebote liegen davor).
    const a = ctx.ids.angebote || [];
    return a.length && kontaktRef(ctx) ? baueAngebotPositionen(a[a.length - 1], ctx.uid) : [];
  } },
  { key: 'zahlungen', tabelle: 'zahlungen', gruppe: 'basis', baue: (ctx) => baueBeispielZahlungen(ctx.uid, ctx.heute) },
  { key: 'assets', tabelle: 'assets', gruppe: 'basis', baue: (ctx) => baueAssets(ctx.uid, ctx.heute) },
  { key: 'wartungsvertraege', tabelle: 'wartungsvertraege', gruppe: 'basis', baue: (ctx) => {
    const a = (ctx.zeilen.assets || [])[0];
    return a ? [{ ...baueWartungAusAsset(a, ctx.uid), aktualisiert_am: `${ctx.heute}T08:00:00.000Z` }] : [];
  } },

  // Personal & Zeit
  { key: 'mitarbeiter', tabelle: 'mitarbeiter', gruppe: 'personal', baue: baueMitarbeiter },
  { key: 'zeiterfassung', tabelle: 'hr_zeiterfassung', gruppe: 'personal', baue: baueZeiterfassung },
  { key: 'abwesenheiten', tabelle: 'hr_abwesenheiten', gruppe: 'personal', baue: baueAbwesenheiten },
  { key: 'schichten', tabelle: 'hr_schichten', gruppe: 'personal', baue: baueSchichten },
  { key: 'schulungen', tabelle: 'hr_schulungen', gruppe: 'personal', baue: baueSchulungen },
  { key: 'bewerber', tabelle: 'bewerber', gruppe: 'personal', baue: baueBewerber },

  // Aufträge, Einsätze, Termine, Aufgaben
  { key: 'auftraege', tabelle: 'auftraege', gruppe: 'auftraege', baue: baueAuftraege },
  { key: 'auftrag_positionen', tabelle: 'auftrag_positionen', gruppe: 'auftraege', baue: baueAuftragPositionen },
  { key: 'einsaetze', tabelle: 'einsaetze', gruppe: 'auftraege', baue: baueEinsaetze },
  { key: 'termine', tabelle: 'termine', gruppe: 'auftraege', baue: baueTermine },
  { key: 'aufgaben', tabelle: 'aufgaben', gruppe: 'auftraege', baue: baueAufgaben },
  { key: 'erinnerung', tabelle: 'erinnerung', gruppe: 'auftraege', baue: baueErinnerungen },

  // Finanzen
  { key: 'ausgaben', tabelle: 'ausgaben', gruppe: 'finanzen', baue: baueAusgaben },
  { key: 'rechnung_positionen', tabelle: 'rechnung_positionen', gruppe: 'finanzen', baue: baueRechnungPositionen },

  // CRM, Marketing, Leads
  { key: 'leads', tabelle: 'leads', gruppe: 'crm', baue: baueLeads },
  { key: 'kontakt_aktivitaeten', tabelle: 'kontakt_aktivitaeten', gruppe: 'crm', baue: baueKontaktAktivitaeten },
  { key: 'verkaufschancen', tabelle: 'verkaufschancen', gruppe: 'crm', baue: baueVerkaufschancen },
  { key: 'marketing_kampagnen', tabelle: 'marketing_kampagnen', gruppe: 'crm', baue: baueKampagnen },
  { key: 'marketing_kalender', tabelle: 'marketing_kalender', gruppe: 'crm', baue: baueMarketingKalender },
  { key: 'leistungskatalog', tabelle: 'leistungskatalog', gruppe: 'crm', baue: baueLeistungskatalog },

  // Lager, Einkauf, Fuhrpark
  { key: 'bestellung', tabelle: 'bestellung', gruppe: 'lager', baue: baueBestellungen },
  { key: 'bestellung_position', tabelle: 'bestellung_position', gruppe: 'lager', baue: baueBestellPositionen },
  { key: 'inventar', tabelle: 'inventar', gruppe: 'lager', baue: baueInventar },
  { key: 'fahrzeuge', tabelle: 'fahrzeuge', gruppe: 'lager', baue: baueFahrzeuge },

  // Bau
  { key: 'bautagebuch', tabelle: 'bautagebuch', gruppe: 'bau', baue: baueBautagebuch },
  { key: 'maengel', tabelle: 'maengel', gruppe: 'bau', baue: baueMaengel },
  { key: 'aufmasse', tabelle: 'aufmasse', gruppe: 'bau', baue: baueAufmasse },
  { key: 'aufmass_positionen', tabelle: 'aufmass_positionen', gruppe: 'bau', baue: baueAufmassPositionen },
  { key: 'bau_lv', tabelle: 'bau_lv', gruppe: 'bau', baue: baueBauLv },
  { key: 'bau_lv_positionen', tabelle: 'bau_lv_positionen', gruppe: 'bau', baue: baueBauLvPositionen },
  { key: 'bau_nachtrag', tabelle: 'bau_nachtrag', gruppe: 'bau', baue: baueBauNachtraege },
];

/**
 * Lösch-Reihenfolge: zuerst die neuen XXL-Tabellen (Kinder vor Eltern), danach
 * die bekannte Übungswelt-Reihenfolge. Gelöscht wird nur, was im Register steht.
 */
export const XXL_LOESCH_ORDER: string[] = [
  'bau_nachtrag', 'bau_lv_positionen', 'bau_lv', 'aufmass_positionen', 'aufmasse', 'maengel', 'bautagebuch',
  'bestellung_position', 'bestellung', 'inventar', 'fahrzeuge',
  'marketing_kalender', 'marketing_kampagnen', 'verkaufschancen', 'kontakt_aktivitaeten', 'leads', 'leistungskatalog',
  'rechnung_positionen', 'ausgaben',
  'erinnerung', 'aufgaben', 'termine', 'einsaetze', 'auftrag_positionen', 'auftraege',
  'hr_schichten', 'hr_schulungen', 'hr_abwesenheiten', 'hr_zeiterfassung', 'bewerber', 'mitarbeiter',
  ...LOESCH_ORDER,
];

/** Register-Einträge je Tabelle in Lösch-Reihenfolge (unbekannte Tabellen hinten). */
export function loeschPlan(register: Array<{ tabelle: string; datensatz_id: string }>): Array<{ tabelle: string; ids: string[] }> {
  const pro = new Map<string, string[]>();
  for (const r of register) {
    if (!r?.tabelle || !r?.datensatz_id) continue;
    const arr = pro.get(r.tabelle) || [];
    arr.push(r.datensatz_id);
    pro.set(r.tabelle, arr);
  }
  const reihenfolge = [...new Set([...XXL_LOESCH_ORDER, ...pro.keys()])];
  return reihenfolge.filter((t) => pro.has(t)).map((t) => ({ tabelle: t, ids: pro.get(t) as string[] }));
}

// ---------------------------------------------------------------------------
// Sicherheitsnetz für alle Zeilen
// ---------------------------------------------------------------------------

const IST_ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Jede E-Mail-Adresse in einer Zeile auf example.com umschreiben (nie zustellbar). */
export function adresseEntschaerfen(wert: string): string {
  const s = String(wert).trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  if (s.slice(at + 1).toLowerCase() === BEISPIEL_DOMAIN) return s.toLowerCase();
  const lokal = s.slice(0, at).toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'beispiel';
  const domain = s.slice(at + 1).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${lokal}.${domain}@${BEISPIEL_DOMAIN}`;
}

/**
 * Zeilen fertig machen: Besitzer auf den Musterbetrieb festnageln (wo die Zeile
 * eine Besitzer-Spalte hat) und Adressen entschärfen.
 */
export function zeilenSichern(zeilen: SeedZeile[], uid: string): SeedZeile[] {
  return zeilen.map((z) => {
    const neu: SeedZeile = { ...z };
    if ('owner_user_id' in neu) neu.owner_user_id = uid;
    for (const [k, v] of Object.entries(neu)) {
      // Jede Adresse — egal in welcher Spalte (email, kunde_email, konto_id …).
      if (typeof v === 'string' && IST_ADRESSE.test(v.trim())) neu[k] = adresseEntschaerfen(v);
    }
    return neu;
  });
}

/** Kontext mit leeren Listen. */
export function neuerKontext(uid: string, heute: string): XxlKontext {
  return { uid, heute, ids: {}, zeilen: {} };
}

/** Nach einem erfolgreichen Anlegen: IDs + Zeilen im Kontext anhängen. */
export function kontextErgaenzen(ctx: XxlKontext, tabelle: string, ids: string[], zeilen: SeedZeile[]): void {
  ctx.ids[tabelle] = [...(ctx.ids[tabelle] || []), ...ids];
  ctx.zeilen[tabelle] = [...(ctx.zeilen[tabelle] || []), ...zeilen.slice(0, ids.length)];
}

/** Zählung je Gruppe für den Bericht. */
export function gruppenZaehlung(angelegt: Array<{ gruppe: XxlGruppe; anzahl: number }>): Record<XxlGruppe, number> {
  const z: Record<XxlGruppe, number> = { basis: 0, personal: 0, auftraege: 0, finanzen: 0, crm: 0, lager: 0, bau: 0 };
  for (const a of angelegt) z[a.gruppe] += a.anzahl;
  return z;
}
