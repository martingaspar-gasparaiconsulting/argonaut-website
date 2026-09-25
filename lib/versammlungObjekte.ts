// ============================================================================
// ARGONAUT OS · lib/versammlungObjekte.ts — Paket PS4 · Versammlungen & Objekte
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
//   A  Versammlungs-Motor: Eigentümerversammlung (WEG) + Mitgliederversammlung
//      (Verein) — Einladungsfrist, Tagesordnung, Auszählung je Mehrheitsart,
//      Beschluss-Sammlung, Anfechtungsfrist, Einladung/Protokoll als Text.
//   B  Mieter: Schadensmeldung, Mieterhöhung auf Vergleichsmiete (§ 558),
//      Indexmiete (§ 557b), Kaution (§ 551).
//   C  Fördermittel: Verwendungsnachweis mit Belegliste gegen Finanzierungsplan.
//   D  Ehrenamt: Stunden je Person, Übungsleiter-/Ehrenamtspauschale.
//
// Datum IMMER als 'YYYY-MM-DD'-Text. Beträge über lib/zahlen (nie still 0).
// Gesetzliche Werte mit Fundstelle, Richtwerte als solche beschriftet.
// Recherchiert 25.09.2026 — Anwalt-Checkliste R24.
// ============================================================================

import { leseZahl } from './zahlen';

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
function zwei(n: number): string { return String(n).padStart(2, '0'); }

export function istIsoDatum(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(x)) return false;
  const [j, m, t] = x.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}
export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + Math.round(tage)));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  return `${ziel.getUTCFullYear()}-${zwei(ziel.getUTCMonth() + 1)}-${zwei(Math.min(t, letzter))}`;
}
/** Erster Tag des n-ten Kalendermonats nach dem Monat von `iso` (n = 0: dieser Monat). */
export function monatsersterNach(iso: string, n: number): string {
  const [j, m] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-01`;
}
/** Letzter Tag des n-ten Kalendermonats nach dem Monat von `iso`. */
export function monatsletzterNach(iso: string, n: number): string {
  const [j, m] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m + n, 0));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}
export function tageZwischen(von: string, bis: string): number {
  const [a, b, c] = von.slice(0, 10).split('-').map(Number);
  const [d, e, f] = bis.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86_400_000);
}
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}
export function datumDe(iso: string | null | undefined): string {
  if (!iso || !istIsoDatum(iso)) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
export function cent(n: number): number { return Math.round(n * 100) / 100; }
export function euroText(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
export function offenePlatzhalter(text: string): string[] {
  return Array.from(new Set((text.match(/\[[^\]\n]{1,60}\]/g) ?? [])));
}
function zahl(x: unknown): number | null { return leseZahl(x); }

// ===========================================================================
// A · VERSAMMLUNGS-MOTOR
// ===========================================================================
export const VERSAMMLUNG_ARTEN = [
  { key: 'weg', label: 'Eigentümerversammlung (WEG)', fristTage: 21, fristText: 'mindestens drei Wochen (§ 24 Abs. 4 WEG), Einberufung in Textform' },
  { key: 'verein', label: 'Mitgliederversammlung (Verein)', fristTage: 14, fristText: 'laut Ihrer Satzung (hier vorbelegt: 2 Wochen — bitte an die Satzung anpassen)' },
] as const;
export type VersammlungArt = (typeof VERSAMMLUNG_ARTEN)[number]['key'];

export function artInfo(art: VersammlungArt) { return VERSAMMLUNG_ARTEN.find((a) => a.key === art) ?? VERSAMMLUNG_ARTEN[0]; }

/**
 * Spätester Versandtag der Einladung. `postTage` = Puffer für den Zugang
 * (Post: Richtwert 3 Tage; E-Mail: 0). Die Frist zählt ab Zugang.
 */
export function spaetesteEinladung(termin: string, fristTage: number, postTage = 0): string | null {
  if (!istIsoDatum(termin) || !(fristTage >= 0)) return null;
  return plusTage(termin.slice(0, 10), -(Math.round(fristTage) + Math.max(0, Math.round(postTage))));
}

export type EinladungPruefung = { stufe: 'ok' | 'rot' | 'gelb' | 'offen'; text: string };

export function pruefeEinladung(v: { termin?: string | null; versandt_am?: string | null; frist_tage?: number | null; art: VersammlungArt; post?: boolean | null }, heute: string): EinladungPruefung {
  const frist = Number(v.frist_tage) > 0 ? Number(v.frist_tage) : artInfo(v.art).fristTage;
  if (!istIsoDatum(v.termin)) return { stufe: 'offen', text: 'Termin fehlt.' };
  const spaet = spaetesteEinladung(v.termin, frist, v.post ? 3 : 0) as string;
  if (!istIsoDatum(v.versandt_am)) {
    if (heute > spaet) return { stufe: 'rot', text: `Einladung noch nicht verschickt — die Frist von ${frist} Tagen ist schon nicht mehr einzuhalten (spätestens ${datumDe(spaet)}). ${v.art === 'weg' ? 'Nur bei besonderer Dringlichkeit darf sie kürzer sein.' : 'Prüfen Sie Ihre Satzung — sonst Termin verschieben.'}` };
    const rest = tageZwischen(heute, spaet);
    return { stufe: rest <= 3 ? 'gelb' : 'offen', text: `Einladung spätestens am ${datumDe(spaet)} verschicken${v.post ? ' (inkl. 3 Tage Postlaufzeit)' : ''} — noch ${rest} Tag(e).` };
  }
  if (v.versandt_am.slice(0, 10) > spaet) return { stufe: 'rot', text: `Einladung am ${datumDe(v.versandt_am)} verschickt — zu spät (spätestens ${datumDe(spaet)}). Beschlüsse sind anfechtbar.` };
  return { stufe: 'ok', text: `Einladung fristgerecht am ${datumDe(v.versandt_am)} verschickt.` };
}

export const MEHRHEITEN = [
  { key: 'einfach', label: 'Einfache Mehrheit der abgegebenen Stimmen', hinweis: 'Mehr Ja- als Nein-Stimmen; Enthaltungen zählen nicht (§ 25 Abs. 1 WEG, § 32 Abs. 1 BGB).' },
  { key: 'dreiviertel', label: 'Drei Viertel der abgegebenen Stimmen', hinweis: 'Satzungsänderung im Verein (§ 33 Abs. 1 BGB), sofern die Satzung nichts anderes bestimmt.' },
  { key: 'weg_bauliche', label: 'Mehr als 2/3 der abgegebenen Stimmen UND mehr als die Hälfte aller Miteigentumsanteile', hinweis: 'Bauliche Veränderung, deren Kosten alle tragen (§ 21 Abs. 2 Nr. 1 WEG).' },
  { key: 'alle_mitglieder', label: 'Zustimmung aller Mitglieder', hinweis: 'Zweckänderung im Verein (§ 33 Abs. 1 BGB) — auch die nicht Erschienenen müssen zustimmen.' },
  { key: 'alle_anwesenden', label: 'Einstimmig (alle Anwesenden)', hinweis: 'Wenn Satzung oder Vereinbarung Einstimmigkeit verlangt.' },
] as const;
export type Mehrheit = (typeof MEHRHEITEN)[number]['key'];

export type Stimmen = { ja?: unknown; nein?: unknown; enthaltung?: unknown; ja_mea?: unknown; mea_gesamt?: unknown; mitglieder_gesamt?: unknown };
export type Auszaehlung = { angenommen: boolean | null; text: string; abgegeben: number };

/** Auszählung nach der gewählten Mehrheitsart. Fehlt eine nötige Zahl: null (nie raten). */
export function auszaehlen(mehrheit: Mehrheit, s: Stimmen): Auszaehlung {
  const ja = zahl(s.ja), nein = zahl(s.nein), enth = zahl(s.enthaltung) ?? 0;
  if (ja == null || nein == null || ja < 0 || nein < 0 || enth < 0) return { angenommen: null, text: 'Ja- und Nein-Stimmen eintragen.', abgegeben: 0 };
  const abgegeben = ja + nein;
  switch (mehrheit) {
    case 'einfach':
      return { angenommen: ja > nein, text: ja > nein ? `Angenommen (${ja} Ja : ${nein} Nein, ${enth} Enthaltung).` : `Abgelehnt (${ja} Ja : ${nein} Nein${ja === nein ? ' — Stimmengleichheit gilt als Ablehnung' : ''}).`, abgegeben };
    case 'dreiviertel': {
      const ok = abgegeben > 0 && ja * 4 >= abgegeben * 3;
      return { angenommen: ok, text: `${ok ? 'Angenommen' : 'Abgelehnt'}: ${ja} von ${abgegeben} abgegebenen Stimmen (nötig: mindestens ${Math.ceil((abgegeben * 3) / 4)}).`, abgegeben };
    }
    case 'weg_bauliche': {
      const jaMea = zahl(s.ja_mea), meaGes = zahl(s.mea_gesamt);
      if (jaMea == null || meaGes == null || meaGes <= 0) return { angenommen: null, text: 'Für diese Mehrheit die Miteigentumsanteile der Ja-Stimmen und die Summe aller Anteile eintragen.', abgegeben };
      const kopf = abgegeben > 0 && ja * 3 > abgegeben * 2;
      const mea = jaMea * 2 > meaGes;
      const ok = kopf && mea;
      return { angenommen: ok, text: `${ok ? 'Angenommen' : 'Abgelehnt'}: ${kopf ? '✓' : '✗'} mehr als 2/3 der Stimmen (${ja}/${abgegeben}), ${mea ? '✓' : '✗'} mehr als die Hälfte der Anteile (${jaMea}/${meaGes}).${!ok && ja > nein ? ' Mit einfacher Mehrheit wäre der Beschluss möglich — dann tragen nur die Zustimmenden die Kosten (§ 21 Abs. 3 WEG).' : ''}`, abgegeben };
    }
    case 'alle_mitglieder': {
      const ges = zahl(s.mitglieder_gesamt);
      if (ges == null || ges <= 0) return { angenommen: null, text: 'Anzahl aller Mitglieder eintragen.', abgegeben };
      const ok = ja >= ges && nein === 0;
      return { angenommen: ok, text: ok ? `Angenommen: alle ${ges} Mitglieder haben zugestimmt.` : `Abgelehnt: ${ja} von ${ges} Mitgliedern zugestimmt${nein ? `, ${nein} dagegen` : ''}. Fehlende Mitglieder können schriftlich nachträglich zustimmen (§ 33 Abs. 1 BGB).`, abgegeben };
    }
    case 'alle_anwesenden': {
      const ok = ja > 0 && nein === 0 && enth === 0;
      return { angenommen: ok, text: ok ? `Einstimmig angenommen (${ja} Ja).` : `Nicht einstimmig (${ja} Ja, ${nein} Nein, ${enth} Enthaltung).`, abgegeben };
    }
  }
}

/** Anfechtungsklage WEG: 1 Monat nach Beschlussfassung, Begründung 2 Monate (§ 45 WEG). */
export function anfechtungsFristen(art: VersammlungArt, beschlossenAm: string | null | undefined): { klage: string; begruendung: string; text: string } | null {
  if (art !== 'weg' || !istIsoDatum(beschlossenAm)) return null;
  const klage = plusMonate(beschlossenAm, 1), begruendung = plusMonate(beschlossenAm, 2);
  return { klage, begruendung, text: `Anfechtung bis ${datumDe(klage)} (Klage), Begründung bis ${datumDe(begruendung)} — § 45 WEG.` };
}

export function naechsteBeschlussNummer(vorhanden: (number | null | undefined)[]): number {
  return vorhanden.reduce<number>((m, n) => (Number.isFinite(Number(n)) ? Math.max(m, Number(n)) : m), 0) + 1;
}

export type Top = { nr: number; titel: string; beschluss: boolean; erlaeuterung?: string | null };

/** TOPs sauber durchnummerieren, leere raus. */
export function ordneTops(tops: Top[]): Top[] {
  return tops.filter((t) => (t.titel ?? '').trim()).map((t, i) => ({ ...t, nr: i + 1, titel: t.titel.trim() }));
}

export const TOP_VORSCHLAEGE: Record<VersammlungArt, string[]> = {
  weg: ['Begrüßung, Feststellung der ordnungsgemäßen Einberufung', 'Wahl des Versammlungsleiters und des Protokollführers', 'Beschluss über die Jahresabrechnung (Nachschüsse / Anpassung der Vorschüsse)', 'Beschluss über den Wirtschaftsplan', 'Entlastung des Verwaltungsbeirats', 'Instandhaltung / Erhaltungsmaßnahmen', 'Verschiedenes (ohne Beschluss)'],
  verein: ['Begrüßung, Feststellung der ordnungsgemäßen Einladung und Beschlussfähigkeit', 'Genehmigung der Tagesordnung', 'Bericht des Vorstands', 'Kassenbericht und Bericht der Kassenprüfer', 'Entlastung des Vorstands', 'Wahlen', 'Anträge', 'Verschiedenes'],
};

export function einladungText(o: { art: VersammlungArt; titel?: string | null; termin: string; uhrzeit?: string | null; ort?: string | null; online?: string | null; tops: Top[]; absender?: string | null }): string {
  const tops = ordneTops(o.tops);
  const kopf = o.art === 'weg'
    ? `Einladung zur Eigentümerversammlung${o.titel?.trim() ? ` — ${o.titel.trim()}` : ''}`
    : `Einladung zur Mitgliederversammlung${o.titel?.trim() ? ` — ${o.titel.trim()}` : ''}`;
  const anrede = o.art === 'weg' ? 'Sehr geehrte Wohnungseigentümerinnen und Wohnungseigentümer,' : 'Liebe Mitglieder,';
  const ortZeile = [o.ort?.trim(), o.online?.trim() ? `online: ${o.online.trim()}` : ''].filter(Boolean).join(' · ') || '[Ort]';
  const liste = tops.length ? tops.map((t) => `TOP ${t.nr}: ${t.titel}${t.beschluss ? ' (Beschluss)' : ''}${t.erlaeuterung?.trim() ? `\n   ${t.erlaeuterung.trim()}` : ''}`).join('\n') : '[Tagesordnung]';
  const hinweis = o.art === 'weg'
    ? 'Beschlüsse werden mit der Mehrheit der abgegebenen Stimmen gefasst, soweit nichts anderes gilt. Sie können sich durch eine Vollmacht in Textform vertreten lassen.'
    : 'Anträge zur Tagesordnung reichen Sie bitte bis [Datum] beim Vorstand ein.';
  return `${kopf}\n\n${anrede}\n\nhiermit laden wir Sie ein zur Versammlung am ${datumDe(o.termin)}${o.uhrzeit?.trim() ? ` um ${o.uhrzeit.trim()} Uhr` : ' um [Uhrzeit] Uhr'}.\nOrt: ${ortZeile}\n\nTagesordnung:\n${liste}\n\n${hinweis}\n\nMit freundlichen Grüßen\n${o.absender?.trim() || '[Verwaltung / Vorstand]'}`;
}

export type BeschlussLite = { top_nr?: number | null; nummer?: number | null; text: string; mehrheit: Mehrheit; ja?: number | null; nein?: number | null; enthaltung?: number | null; ja_mea?: number | null; mea_gesamt?: number | null; mitglieder_gesamt?: number | null; angenommen?: boolean | null };

export function unterschriftenFuer(art: VersammlungArt, beirat: boolean): string[] {
  return art === 'weg'
    ? ['Versammlungsleitung', 'Ein Wohnungseigentümer', ...(beirat ? ['Vorsitz Verwaltungsbeirat'] : [])]
    : ['Versammlungsleitung', 'Protokollführung'];
}

export function protokollText(o: { art: VersammlungArt; titel?: string | null; termin: string; ort?: string | null; beginn?: string | null; ende?: string | null; leitung?: string | null; protokoll?: string | null; anwesend?: string | null; tops: Top[]; beschluesse: BeschlussLite[]; notizen?: Record<string, string> | null; beirat?: boolean }): string {
  const tops = ordneTops(o.tops);
  const zeilen: string[] = [];
  zeilen.push(`Niederschrift der ${o.art === 'weg' ? 'Eigentümerversammlung' : 'Mitgliederversammlung'}${o.titel?.trim() ? ` — ${o.titel.trim()}` : ''}`);
  zeilen.push(`Datum: ${datumDe(o.termin)} · Beginn: ${o.beginn || '[Uhrzeit]'} · Ende: ${o.ende || '[Uhrzeit]'} · Ort: ${o.ort?.trim() || '[Ort]'}`);
  zeilen.push(`Versammlungsleitung: ${o.leitung?.trim() || '[Name]'} · Protokoll: ${o.protokoll?.trim() || '[Name]'}`);
  zeilen.push(`Anwesend / vertreten: ${o.anwesend?.trim() || '[Anzahl, ggf. Miteigentumsanteile]'}`);
  zeilen.push('');
  for (const t of tops) {
    zeilen.push(`TOP ${t.nr}: ${t.titel}`);
    const n = o.notizen?.[String(t.nr)]?.trim();
    if (n) zeilen.push(n);
    for (const b of o.beschluesse.filter((x) => Number(x.top_nr) === t.nr)) {
      const a = auszaehlen(b.mehrheit, b);
      zeilen.push(`Beschluss${b.nummer ? ` Nr. ${b.nummer}` : ''}: ${b.text.trim()}`);
      zeilen.push(`Abstimmung: ${b.ja ?? '—'} Ja, ${b.nein ?? '—'} Nein, ${b.enthaltung ?? 0} Enthaltung — ${a.angenommen == null ? 'Ergebnis offen' : a.angenommen ? 'ANGENOMMEN' : 'ABGELEHNT'}. Der Versammlungsleiter hat das Ergebnis verkündet.`);
    }
    zeilen.push('');
  }
  zeilen.push('Unterschriften:');
  for (const u of unterschriftenFuer(o.art, !!o.beirat)) zeilen.push(`______________________________  ${u}`);
  return zeilen.join('\n');
}

/** Beschluss-Sammlung (§ 24 Abs. 7 WEG): fortlaufend nummeriert, mit Datum, Anfechtung/Aufhebung vermerkt. */
export function sammlungZeile(b: { nummer?: number | null; text: string; beschlossen_am?: string | null; angenommen?: boolean | null; angefochten_am?: string | null; aufgehoben_am?: string | null; versammlung?: string | null }): string {
  const vermerk = [b.angefochten_am ? `angefochten am ${datumDe(b.angefochten_am)}` : '', b.aufgehoben_am ? `aufgehoben am ${datumDe(b.aufgehoben_am)}` : ''].filter(Boolean).join(', ');
  return `Nr. ${b.nummer ?? '—'} · ${datumDe(b.beschlossen_am)} · ${b.versammlung ?? ''} · ${b.angenommen ? 'angenommen' : 'abgelehnt'}: ${b.text.trim()}${vermerk ? ` (${vermerk})` : ''}`;
}

// ===========================================================================
// B · MIETER
// ===========================================================================
export const SCHADEN_KATEGORIEN = [
  { key: 'wasser', label: 'Wasser / Rohrbruch', notfall: true },
  { key: 'heizung', label: 'Heizung / Warmwasser', notfall: true },
  { key: 'strom', label: 'Strom', notfall: true },
  { key: 'gas', label: 'Gasgeruch', notfall: true },
  { key: 'fenster_tuer', label: 'Fenster / Türen / Schloss', notfall: false },
  { key: 'feuchte', label: 'Feuchtigkeit / Schimmel', notfall: false },
  { key: 'sanitaer', label: 'Sanitär (WC, Waschbecken)', notfall: false },
  { key: 'elektro_geraet', label: 'Einbaugerät / Küche', notfall: false },
  { key: 'gemeinschaft', label: 'Treppenhaus / Aufzug / Außenanlage', notfall: false },
  { key: 'sonstiges', label: 'Sonstiges', notfall: false },
] as const;
export type SchadenKategorie = (typeof SCHADEN_KATEGORIEN)[number]['key'];

export const DRINGLICHKEIT = [
  { key: 'notfall', label: 'Notfall', stunden: 24 },
  { key: 'dringend', label: 'Dringend', stunden: 72 },
  { key: 'normal', label: 'Normal', stunden: 14 * 24 },
] as const;
export type Dringlichkeit = (typeof DRINGLICHKEIT)[number]['key'];

export const SCHADEN_STATUS = ['gemeldet', 'beauftragt', 'termin', 'erledigt', 'abgelehnt'] as const;
export type SchadenStatus = (typeof SCHADEN_STATUS)[number];

export function vorschlagDringlichkeit(kat: SchadenKategorie, monat: number): Dringlichkeit {
  if (kat === 'gas' || kat === 'wasser' || kat === 'strom') return 'notfall';
  if (kat === 'heizung') return monat >= 10 || monat <= 4 ? 'notfall' : 'dringend';
  if (kat === 'feuchte') return 'dringend';
  return 'normal';
}

/** Reaktionsziel (Richtwert, keine Gesetzesfrist) ab Meldung. */
export function schadenStand(s: { gemeldet_am: string; dringlichkeit: Dringlichkeit; status: SchadenStatus; erledigt_am?: string | null }, jetztIso: string): { stufe: 'rot' | 'gelb' | 'gruen' | 'grau'; text: string } {
  if (s.status === 'erledigt' || s.status === 'abgelehnt') return { stufe: 'grau', text: s.status === 'erledigt' ? `Erledigt${s.erledigt_am ? ` am ${datumDe(s.erledigt_am)}` : ''}` : 'Abgelehnt' };
  const ziel = DRINGLICHKEIT.find((d) => d.key === s.dringlichkeit)?.stunden ?? 336;
  const start = Date.parse(s.gemeldet_am.length <= 10 ? `${s.gemeldet_am}T00:00:00Z` : s.gemeldet_am);
  const std = (Date.parse(jetztIso) - start) / 3_600_000;
  if (!Number.isFinite(std)) return { stufe: 'gelb', text: 'Meldedatum fehlt.' };
  if (std > ziel) return { stufe: 'rot', text: `Seit ${Math.floor(std / 24)} Tag(en) offen — Reaktionsziel (${ziel < 48 ? `${ziel} Std.` : `${ziel / 24} Tage`}, Richtwert) überschritten.` };
  if (s.status === 'gemeldet' && std > ziel / 2) return { stufe: 'gelb', text: 'Noch kein Handwerker beauftragt.' };
  return { stufe: 'gruen', text: s.status === 'gemeldet' ? 'Gemeldet' : s.status === 'beauftragt' ? 'Handwerker beauftragt' : 'Termin steht' };
}

export const MINDERUNG_HINWEIS = 'Bei einem erheblichen Mangel ist die Miete kraft Gesetzes gemindert, solange er besteht (§ 536 BGB) — schnelle Beseitigung schützt Ihre Mieteinnahmen. Die Höhe hängt vom Einzelfall ab; im Streit Rechtsrat einholen.';

export type MieterhoehungPruefung = { ok: boolean; maxMiete: number | null; zustimmungBis: string | null; wirksamAb: string | null; prozent: number | null; fehler: string[]; hinweise: string[] };

/**
 * Mieterhöhung bis zur ortsüblichen Vergleichsmiete (§§ 558, 558a, 558b BGB):
 *  - Miete zum Wirksamwerden seit 15 Monaten unverändert (Erhöhungen nach §§ 559, 560 zählen nicht)
 *  - Verlangen frühestens 1 Jahr nach der letzten Erhöhung
 *  - Kappungsgrenze: in 3 Jahren höchstens 20 % (15 % in Gebieten mit Verordnung)
 *  - Zustimmung bis Ende des 2. Kalendermonats nach Zugang, Wirkung ab Beginn des 3.
 */
export function pruefeMieterhoehung(e: {
  mieteAktuell: unknown; mieteNeu: unknown; mieteVor3Jahren?: unknown; vergleichsmiete?: unknown;
  kappung: 15 | 20; letzteAenderungWirksam?: string | null; mietbeginn?: string | null; zugang: string;
  flaeche?: unknown;
}): MieterhoehungPruefung {
  const fehler: string[] = [], hinweise: string[] = [];
  const akt = zahl(e.mieteAktuell), neu = zahl(e.mieteNeu);
  const basis = zahl(e.mieteVor3Jahren) ?? akt;
  const verg = zahl(e.vergleichsmiete);
  if (!istIsoDatum(e.zugang)) return { ok: false, maxMiete: null, zustimmungBis: null, wirksamAb: null, prozent: null, fehler: ['Zugangsdatum (wann der Mieter das Schreiben erhält) fehlt.'], hinweise };
  const zustimmungBis = monatsletzterNach(e.zugang, 2);
  const wirksamAb = monatsersterNach(e.zugang, 3);
  if (akt == null || neu == null || basis == null || akt <= 0) return { ok: false, maxMiete: null, zustimmungBis, wirksamAb, prozent: null, fehler: ['Aktuelle und neue Nettokaltmiete eintragen.'], hinweise };
  const kappMax = cent(basis * (1 + e.kappung / 100));
  let max = kappMax;
  const flaeche = zahl(e.flaeche);
  if (verg != null) {
    const vergGesamt = flaeche && flaeche > 0 && verg < 100 ? cent(verg * flaeche) : verg;
    if (flaeche && flaeche > 0 && verg < 100) hinweise.push(`Vergleichsmiete ${verg.toLocaleString('de-DE')} €/m² × ${flaeche.toLocaleString('de-DE')} m² = ${euroText(vergGesamt)}.`);
    max = Math.min(max, vergGesamt);
  } else hinweise.push('Ohne Vergleichsmiete prüft der Rechner nur die Kappungsgrenze. Begründen Sie mit Mietspiegel, Gutachten oder drei Vergleichswohnungen (§ 558a BGB).');
  if (neu > max + 0.004) fehler.push(`Neue Miete ${euroText(neu)} liegt über dem Zulässigen ${euroText(max)} (${verg != null && max < kappMax ? 'Vergleichsmiete' : `Kappungsgrenze ${e.kappung} % auf ${euroText(basis)}`}).`);
  if (neu <= akt) fehler.push('Die neue Miete muss höher sein als die aktuelle.');
  const letzte = istIsoDatum(e.letzteAenderungWirksam) ? e.letzteAenderungWirksam : istIsoDatum(e.mietbeginn) ? e.mietbeginn : null;
  if (letzte) {
    const sperre = plusMonate(letzte, 15);
    if (wirksamAb < sperre) fehler.push(`Sperrfrist: Die Miete muss beim Wirksamwerden seit 15 Monaten unverändert sein — frühestens ab ${datumDe(sperre)} (§ 558 Abs. 1 BGB).`);
    const jahr = plusMonate(letzte, 12);
    if (e.zugang < jahr) fehler.push(`Das Verlangen darf frühestens ein Jahr nach der letzten Erhöhung zugehen — frühestens am ${datumDe(jahr)}.`);
  } else hinweise.push('Datum der letzten Mietänderung (oder Mietbeginn) eintragen, damit die Sperrfristen geprüft werden.');
  hinweise.push('Erhöhungen wegen Modernisierung (§ 559) oder Betriebskosten (§ 560) bleiben bei Sperrfrist und Kappung außer Betracht. Bei Index- oder Staffelmiete ist § 558 ausgeschlossen.');
  return { ok: fehler.length === 0, maxMiete: cent(max), zustimmungBis, wirksamAb, prozent: Math.round(((neu - akt) / akt) * 1000) / 10, fehler, hinweise };
}

export type IndexPruefung = { ok: boolean; neueMiete: number | null; differenz: number | null; prozent: number | null; wirksamAb: string | null; fehler: string[]; hinweise: string[] };

/**
 * Indexmiete (§ 557b BGB): Änderung nach dem Verbraucherpreisindex (VPI, Destatis),
 * Miete jeweils mindestens 1 Jahr unverändert, Erklärung in Textform mit Angabe der
 * Indexänderung und der neuen Miete, zu zahlen ab dem übernächsten Monat nach Zugang.
 */
export function pruefeIndexmiete(e: { mieteAktuell: unknown; indexAlt: unknown; indexNeu: unknown; letzteAnpassungWirksam?: string | null; mietbeginn?: string | null; zugang: string }): IndexPruefung {
  const fehler: string[] = [], hinweise: string[] = [];
  const akt = zahl(e.mieteAktuell), ia = zahl(e.indexAlt), inn = zahl(e.indexNeu);
  const wirksamAb = istIsoDatum(e.zugang) ? monatsersterNach(e.zugang, 2) : null;
  if (!wirksamAb) fehler.push('Zugangsdatum fehlt.');
  if (akt == null || ia == null || inn == null || ia <= 0 || akt <= 0) return { ok: false, neueMiete: null, differenz: null, prozent: null, wirksamAb, fehler: [...fehler, 'Aktuelle Miete, alten und neuen Indexstand eintragen (VPI, Basis 2020 = 100).'], hinweise };
  const neu = cent((akt * inn) / ia);
  const prozent = Math.round(((inn - ia) / ia) * 10000) / 100;
  const letzte = istIsoDatum(e.letzteAnpassungWirksam) ? e.letzteAnpassungWirksam : istIsoDatum(e.mietbeginn) ? e.mietbeginn : null;
  if (letzte && wirksamAb) {
    const frueh = plusMonate(letzte, 12);
    if (wirksamAb < frueh) fehler.push(`Die Miete muss mindestens ein Jahr unverändert bleiben — neue Miete frühestens ab ${datumDe(frueh)} (§ 557b Abs. 2 BGB).`);
  } else if (!letzte) hinweise.push('Datum der letzten Anpassung (oder Mietbeginn) eintragen, damit die Jahresfrist geprüft wird.');
  if (inn < ia) hinweise.push('Der Index ist gesunken: Auch der Mieter kann die Anpassung nach unten verlangen.');
  hinweise.push('In der Erklärung müssen der alte und neue Indexstand, die Änderung und die neue Miete (oder die Erhöhung) in Euro stehen. Geplant, aber noch nicht Gesetz (Stand 09/2026): Deckel für Indexmieten.');
  return { ok: fehler.length === 0, neueMiete: neu, differenz: cent(neu - akt), prozent, wirksamAb, fehler, hinweise };
}

export function indexErklaerung(o: { mieter?: string | null; objekt?: string | null; mieteAlt: number; mieteNeu: number; indexAlt: number; indexNeu: number; stichtagAlt?: string | null; stichtagNeu?: string | null; wirksamAb: string; vermieter?: string | null }): string {
  const p = Math.round(((o.indexNeu - o.indexAlt) / o.indexAlt) * 10000) / 100;
  return `Anpassung der Indexmiete nach § 557b BGB\n\nSehr geehrte/r ${o.mieter?.trim() || '[Name]'},\n\nfür die Wohnung ${o.objekt?.trim() || '[Adresse / Lage]'} passen wir die Nettokaltmiete gemäß der vereinbarten Indexklausel an.\n\nVerbraucherpreisindex für Deutschland (Basis 2020 = 100):\n- bisher: ${o.indexAlt.toLocaleString('de-DE')} (${o.stichtagAlt || '[Monat/Jahr]'})\n- aktuell: ${o.indexNeu.toLocaleString('de-DE')} (${o.stichtagNeu || '[Monat/Jahr]'})\n- Änderung: ${p.toLocaleString('de-DE')} %\n\nNettokaltmiete bisher: ${euroText(o.mieteAlt)}\nNettokaltmiete neu: ${euroText(o.mieteNeu)} (Erhöhung um ${euroText(cent(o.mieteNeu - o.mieteAlt))})\n\nDie neue Miete ist ab dem ${datumDe(o.wirksamAb)} zu zahlen. Die Betriebskostenvorauszahlung bleibt unverändert.\n\nMit freundlichen Grüßen\n${o.vermieter?.trim() || '[Vermieter]'}`;
}

/** Kaution (§ 551 BGB): höchstens 3 Nettokaltmieten, zahlbar in 3 Monatsraten, erste zu Mietbeginn. */
export function pruefeKaution(e: { kaltmiete: unknown; kaution: unknown }): { max: number | null; ok: boolean | null; text: string } {
  const k = zahl(e.kaltmiete), kau = zahl(e.kaution);
  if (k == null || k <= 0) return { max: null, ok: null, text: 'Nettokaltmiete eintragen (ohne Betriebskostenvorauszahlung).' };
  const max = cent(k * 3);
  if (kau == null) return { max, ok: null, text: `Höchstens ${euroText(max)} (3 Nettokaltmieten, § 551 Abs. 1 BGB).` };
  return kau > max + 0.004
    ? { max, ok: false, text: `Zu hoch: ${euroText(kau)} statt höchstens ${euroText(max)} — der Mehrbetrag ist unwirksam und zurückzuzahlen (§ 551 Abs. 4 BGB).` }
    : { max, ok: true, text: `Zulässig (höchstens ${euroText(max)}).` };
}

export function kautionsRaten(kaution: number, mietbeginn: string): { faellig: string; betrag: number }[] {
  if (!(kaution > 0) || !istIsoDatum(mietbeginn)) return [];
  const drittel = Math.floor((kaution * 100) / 3) / 100;
  const erste = cent(kaution - drittel * 2);
  return [
    { faellig: mietbeginn.slice(0, 10), betrag: erste },
    { faellig: plusMonate(mietbeginn, 1), betrag: drittel },
    { faellig: plusMonate(mietbeginn, 2), betrag: drittel },
  ];
}

export type KautionEingang = { am: string; betrag: number };

export function kautionsStand(soll: number, eingaenge: KautionEingang[], mietbeginn: string | null, heute: string): { eingezahlt: number; offen: number; ueberfaellig: number; text: string } {
  const ein = cent(eingaenge.reduce((a, z) => a + (Number(z.betrag) || 0), 0));
  const offen = cent(Math.max(0, soll - ein));
  let faelligBisher = 0;
  if (mietbeginn) for (const r of kautionsRaten(soll, mietbeginn)) if (r.faellig <= heute) faelligBisher += r.betrag;
  const ueber = cent(Math.max(0, faelligBisher - ein));
  return { eingezahlt: ein, offen, ueberfaellig: ueber, text: offen <= 0 ? 'Vollständig eingezahlt.' : ueber > 0 ? `${euroText(ueber)} fällig und nicht eingegangen.` : `${euroText(offen)} noch offen (Raten nicht fällig).` };
}

/** Kautionsabrechnung bei Auszug: Kaution + Zinsen − Einbehalte. Nie negativ ausgezahlt. */
export function kautionsAbrechnung(e: { kaution: unknown; zinsen?: unknown; einbehalte: { grund: string; betrag: unknown }[] }): { auszahlung: number | null; einbehalt: number; nachforderung: number; text: string } {
  const k = zahl(e.kaution);
  if (k == null) return { auszahlung: null, einbehalt: 0, nachforderung: 0, text: 'Kaution fehlt.' };
  const z = zahl(e.zinsen) ?? 0;
  const ein = cent(e.einbehalte.reduce((a, x) => a + (zahl(x.betrag) ?? 0), 0));
  const rest = cent(k + z - ein);
  return { auszahlung: Math.max(0, rest), einbehalt: ein, nachforderung: rest < 0 ? cent(-rest) : 0, text: rest < 0 ? `Einbehalte übersteigen die Kaution um ${euroText(-rest)} — Rest gesondert fordern.` : `Auszahlung an den Mieter: ${euroText(rest)}.` };
}

export const KAUTION_HINWEIS = 'Die Kaution ist getrennt vom eigenen Vermögen anzulegen (insolvenzfest, Zinsen stehen dem Mieter zu, § 551 Abs. 3 BGB). Nach Auszug darf eine angemessene Prüffrist ausgeschöpft werden (Richtwert: bis zu 6 Monate); für eine ausstehende Betriebskostenabrechnung darf ein angemessener Teil länger einbehalten werden.';

// ===========================================================================
// C · FÖRDERMITTEL — VERWENDUNGSNACHWEIS
// ===========================================================================
export type PlanPosition = { position: string; plan: number };
export type Beleg = { position: string; betrag: number; datum?: string | null; beleg_nr?: string | null };

/** Richtwert ANBest-P Nr. 1.2: Einzelansätze dürfen um bis zu 20 % überschritten werden, soweit anderswo eingespart wird. */
export const UEBERSCHREITUNG_PROZENT = 20;

export type NachweisAuswertung = {
  zeilen: { position: string; plan: number; ist: number; abweichung: number; prozent: number | null; stufe: 'ok' | 'gelb' | 'rot' }[];
  planGesamt: number; istGesamt: number; ohnePosition: number; ausserhalb: Beleg[]; fehlend: string[];
  hinweise: string[];
};

export function verwendungsAuswertung(plan: PlanPosition[], belege: Beleg[], zeitraum?: { von?: string | null; bis?: string | null }, bewilligt?: number | null): NachweisAuswertung {
  const summe = new Map<string, number>();
  let ohne = 0;
  const bekannt = new Set(plan.map((p) => p.position.trim().toLowerCase()));
  const ausserhalb: Beleg[] = [];
  const fehlend: string[] = [];
  for (const b of belege) {
    const key = b.position.trim().toLowerCase();
    const betrag = Number(b.betrag) || 0;
    if (!bekannt.has(key)) ohne += betrag; else summe.set(key, (summe.get(key) ?? 0) + betrag);
    if (zeitraum && istIsoDatum(b.datum) && ((zeitraum.von && b.datum < zeitraum.von) || (zeitraum.bis && b.datum > zeitraum.bis))) ausserhalb.push(b);
    if (!b.beleg_nr?.trim()) fehlend.push(`Beleg über ${euroText(betrag)}${b.datum ? ` vom ${datumDe(b.datum)}` : ''} ohne Belegnummer`);
  }
  let planGesamt = 0, istGesamt = 0, einsparung = 0, ueber = 0;
  const zeilen = plan.map((p) => {
    const ist = cent(summe.get(p.position.trim().toLowerCase()) ?? 0);
    planGesamt += p.plan; istGesamt += ist;
    const abw = cent(ist - p.plan);
    if (abw < 0) einsparung += -abw; else ueber += abw;
    const prozent = p.plan > 0 ? Math.round((abw / p.plan) * 1000) / 10 : null;
    return { position: p.position, plan: cent(p.plan), ist, abweichung: abw, prozent, stufe: 'ok' as 'ok' | 'gelb' | 'rot' };
  });
  for (const z of zeilen) {
    if (z.abweichung > 0.004) {
      z.stufe = z.prozent == null || z.prozent > UEBERSCHREITUNG_PROZENT ? 'rot' : 'gelb';
    }
  }
  istGesamt += ohne;
  const hinweise: string[] = [];
  if (ueber > einsparung + 0.004) hinweise.push(`Überschreitungen (${euroText(cent(ueber))}) sind nicht durch Einsparungen (${euroText(cent(einsparung))}) gedeckt — Mehrausgaben trägt in der Regel der Empfänger.`);
  if (zeilen.some((z) => z.stufe === 'rot')) hinweise.push(`Mindestens eine Position liegt mehr als ${UEBERSCHREITUNG_PROZENT} % über Plan (Richtwert ANBest-P Nr. 1.2) — vorher Zustimmung des Zuwendungsgebers einholen bzw. begründen.`);
  if (ohne > 0) hinweise.push(`${euroText(cent(ohne))} an Belegen sind keiner Position des Finanzierungsplans zugeordnet.`);
  if (ausserhalb.length) hinweise.push(`${ausserhalb.length} Beleg(e) liegen außerhalb des Bewilligungszeitraums — in der Regel nicht förderfähig.`);
  if (bewilligt != null && bewilligt > 0 && planGesamt > 0 && istGesamt < planGesamt - 0.004) hinweise.push('Die Ausgaben liegen unter dem Plan — bei Anteils- oder Fehlbedarfsfinanzierung kann sich die Zuwendung verringern (Rückforderung prüfen).');
  hinweise.push('Richtwert: Verwendungsnachweis innerhalb von 6 Monaten nach Erfüllung des Zwecks (ANBest-P Nr. 6.1) — maßgeblich ist Ihr Zuwendungsbescheid.');
  return { zeilen, planGesamt: cent(planGesamt), istGesamt: cent(istGesamt), ohnePosition: cent(ohne), ausserhalb, fehlend, hinweise };
}

export function sachberichtVorlage(o: { programm: string; zeitraum?: string | null }): string {
  return `Sachbericht zum Verwendungsnachweis — ${o.programm}\nBewilligungszeitraum: ${o.zeitraum || '[von – bis]'}\n\n1. Ziel des Vorhabens laut Bescheid\n[Ziel]\n\n2. Durchgeführte Maßnahmen (was, wann, wer)\n[Maßnahmen]\n\n3. Erreichte Ergebnisse (möglichst mit Zahlen)\n[Ergebnisse]\n\n4. Abweichungen vom Plan und Gründe\n[Abweichungen oder „keine"]\n\n5. Nachhaltigkeit / wie es weitergeht\n[Ausblick]\n\nOrt, Datum, Unterschrift\n[Ort, Datum]`;
}

// ===========================================================================
// D · EHRENAMT
// ===========================================================================
/** Steuerfreie Pauschalen seit 01.01.2026 (Steueränderungsgesetz 2025). */
export const PAUSCHALEN = [
  { key: 'uebungsleiter', label: 'Übungsleiterpauschale', betrag: 3300, grundlage: '§ 3 Nr. 26 EStG', fuer: 'nebenberuflich als Übungsleiter, Trainer, Ausbilder, Erzieher, Betreuer, künstlerisch oder in der Pflege — für eine gemeinnützige Körperschaft' },
  { key: 'ehrenamt', label: 'Ehrenamtspauschale', betrag: 960, grundlage: '§ 3 Nr. 26a EStG', fuer: 'nebenberufliche Tätigkeit im gemeinnützigen Bereich, z. B. Vorstand, Kassenwart, Platzwart' },
] as const;
export type PauschaleArt = (typeof PAUSCHALEN)[number]['key'];

export type Zahlung = { person: string; jahr: number; art: PauschaleArt; betrag: number };

export function pauschalenStand(zahlungen: Zahlung[], person: string, jahr: number): { art: PauschaleArt; label: string; gezahlt: number; grenze: number; rest: number; stufe: 'ok' | 'gelb' | 'rot' }[] {
  return PAUSCHALEN.map((p) => {
    const gezahlt = cent(zahlungen.filter((z) => z.person === person && z.jahr === jahr && z.art === p.key).reduce((a, z) => a + (Number(z.betrag) || 0), 0));
    const rest = cent(p.betrag - gezahlt);
    return { art: p.key, label: p.label, gezahlt, grenze: p.betrag, rest, stufe: rest < 0 ? 'rot' : rest <= p.betrag * 0.1 ? 'gelb' : 'ok' };
  });
}

export const PAUSCHALEN_HINWEIS = 'Beide Pauschalen gibt es nicht für dieselbe Tätigkeit zusammen; für verschiedene Tätigkeiten ja. Der Betrag gilt je Person und Kalenderjahr über alle Vereine zusammen — lassen Sie sich bestätigen, dass die Pauschale nicht schon anderswo genutzt wird. Voraussetzung ist eine Satzung, die Vergütungen erlaubt.';

export type Stunde = { person: string; datum: string; stunden: number; taetigkeit?: string | null };

export function stundenAuswertung(liste: Stunde[], jahr: number): { personen: { person: string; stunden: number; einsaetze: number }[]; gesamt: number; jeMonat: number[] } {
  const p = new Map<string, { stunden: number; einsaetze: number }>();
  const monat = Array(12).fill(0) as number[];
  let gesamt = 0;
  for (const s of liste) {
    if (!istIsoDatum(s.datum) || Number(s.datum.slice(0, 4)) !== jahr) continue;
    const h = Number(s.stunden) || 0;
    if (h <= 0) continue;
    gesamt += h;
    monat[Number(s.datum.slice(5, 7)) - 1] += h;
    const e = p.get(s.person) ?? { stunden: 0, einsaetze: 0 };
    e.stunden += h; e.einsaetze += 1;
    p.set(s.person, e);
  }
  return {
    personen: Array.from(p, ([person, v]) => ({ person, stunden: Math.round(v.stunden * 100) / 100, einsaetze: v.einsaetze })).sort((a, b) => b.stunden - a.stunden || a.person.localeCompare(b.person)),
    gesamt: Math.round(gesamt * 100) / 100,
    jeMonat: monat.map((x) => Math.round(x * 100) / 100),
  };
}

export function ehrenamtsNachweis(o: { verein?: string | null; person: string; jahr: number; stunden: number; taetigkeiten: string[] }): string {
  const t = Array.from(new Set(o.taetigkeiten.map((x) => x.trim()).filter(Boolean)));
  return `Bescheinigung über ehrenamtliches Engagement\n\nHiermit bestätigen wir, dass ${o.person} im Jahr ${o.jahr} für ${o.verein?.trim() || '[Verein]'} ehrenamtlich tätig war — insgesamt ${o.stunden.toLocaleString('de-DE')} Stunden.\n${t.length ? `\nTätigkeiten: ${t.join(', ')}\n` : ''}\nWir danken für den Einsatz.\n\n[Ort, Datum]\n______________________________\n[Name, Funktion im Vorstand]`;
}
