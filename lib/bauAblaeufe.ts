// lib/bauAblaeufe.ts
// ============================================================================
// ARGONAUT OS · Paket PI · Bau-Ablaeufe (B16) — Stand 24.09.2026
//
// ▄▄▄ WAS ES SCHON GAB ▄▄▄
// - Bau & LV (/dashboard/bau-lv): LV-Positionen mit Haken "Nachtrag" + Grund,
//   Abnahmeprotokoll mit Maengelliste.
// - Bautagebuch: Maengel VOR der Abnahme (offen -> behoben -> abgenommen).
// - lib/sicherheitseinbehalt.ts: Einbehalt auf der Rechnung, Rueckgabedatum.
//
// ▄▄▄ WAS FEHLTE — und hier dazukommt ▄▄▄
// 1. NACHTRAG ALS ABLAUF, nicht nur als Haken: entdeckt -> angekuendigt ->
//    angeboten -> beauftragt/abgelehnt -> abgerechnet. Mit den Warnungen, an
//    denen Handwerksbetriebe in der Praxis Geld verlieren: Mehrleistung ohne
//    Ankuendigung, Arbeit vor der Beauftragung, Antwortfrist verstrichen.
// 2. GEWAEHRLEISTUNG NACH DER ABNAHME: Ende der Frist, Rueckgabe der
//    Sicherheit, Maengelruegen mit Kundenfrist.
// 3. MUSTERSCHREIBEN fuer beides — ausdruecklich ANWALT-PLATZHALTER.
//
// ▄▄▄ WAS DIESE DATEI BEWUSST NICHT ENTSCHEIDET ▄▄▄
// Welche Frist gilt, steht im Vertrag. Die Regelwerk-Vorschlaege sind
// Richtwerte (VOB/B § 13 Abs. 4, § 634a BGB) und immer ueberschreibbar. Alle
// Rechtshinweise tragen den Zusatz "Anwalt pruefen" (Anwalt-Punkt R17).
//
// Reine Logik: keine Imports aus Next/Supabase/React, keine Uhr — "heute"
// kommt immer als Parameter (YYYY-MM-DD). Node-getestet:
// tests/bauAblaeufeP82.test.mjs
// ============================================================================

import { plusMonate, tageBis, istIsoDatum, datumDe } from './nachweisMotor';

export { datumDe };

export const HINWEIS_ANWALT =
  'Richtwerte und Mustertexte — keine Rechtsberatung. Vor der ersten Verwendung von Ihrem Anwalt prüfen lassen; im Einzelfall gilt Ihr Vertrag.';

// ---------------------------------------------------------------------------
// Kleinzeug
// ---------------------------------------------------------------------------

function iso(x: unknown): string | null {
  return istIsoDatum(x) ? (x as string) : null;
}

function zahlOderNull(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const t = String(x).trim();
  if (!t) return null;
  // Deutsche Schreibweise: 1.234,56 -> 1234.56 ; 12,5 -> 12.5 ; 12.5 -> 12.5
  const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

export function euro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export type Stufe = 'rot' | 'gelb' | 'info';
export type Hinweis = { stufe: Stufe; text: string };

// ===========================================================================
// TEIL 1 · NACHTRAEGE
// ===========================================================================

export type NachtragArt = 'zusaetzlich' | 'geaendert' | 'menge' | 'behinderung' | 'stundenlohn';
export type Vertragsart = 'vob' | 'bgb' | 'unklar';
export type NachtragStatus = 'entdeckt' | 'angekuendigt' | 'angeboten' | 'beauftragt' | 'abgelehnt' | 'abgerechnet';

export const NACHTRAG_ARTEN: { key: NachtragArt; label: string; kurz: string; grundlage: string }[] = [
  {
    key: 'zusaetzlich', label: 'Zusätzliche Leistung', kurz: 'Etwas, das nicht im Auftrag steht, kommt dazu.',
    grundlage: 'VOB/B § 2 Abs. 6: Anspruch VOR Beginn der Ausführung ankündigen. BGB-Vertrag: § 650b/§ 650c BGB.',
  },
  {
    key: 'geaendert', label: 'Geänderte Leistung', kurz: 'Der Auftraggeber ändert Ausführung, Material oder Plan.',
    grundlage: 'VOB/B § 2 Abs. 5 (Preis möglichst vor Ausführung vereinbaren). BGB-Vertrag: § 650b/§ 650c BGB.',
  },
  {
    key: 'menge', label: 'Mengenänderung', kurz: 'Beim Einheitspreis weicht die Menge um mehr als 10 % ab.',
    grundlage: 'VOB/B § 2 Abs. 3: über 110 % oder unter 90 % der Vordersatzmenge kann ein neuer Einheitspreis verlangt werden.',
  },
  {
    key: 'behinderung', label: 'Behinderung / Stillstand', kurz: 'Sie können nicht wie geplant arbeiten (Vorgewerk, Pläne, Zugang).',
    grundlage: 'VOB/B § 6 Abs. 1: unverzüglich schriftlich anzeigen. Folgen: § 6 Abs. 2 (Fristverlängerung), § 6 Abs. 6 VOB/B, § 642 BGB.',
  },
  {
    key: 'stundenlohn', label: 'Stundenlohnarbeiten', kurz: 'Arbeiten, die nach Aufwand abgerechnet werden.',
    grundlage: 'VOB/B § 2 Abs. 10 (nur wenn vor Beginn ausdrücklich vereinbart) und § 15 Abs. 3 (Stundenlohnzettel zeitnah einreichen).',
  },
];

export const NACHTRAG_STATUS: { key: NachtragStatus; label: string }[] = [
  { key: 'entdeckt', label: 'Entdeckt' },
  { key: 'angekuendigt', label: 'Angekündigt' },
  { key: 'angeboten', label: 'Angeboten' },
  { key: 'beauftragt', label: 'Beauftragt' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
  { key: 'abgerechnet', label: 'Abgerechnet' },
];

export function istNachtragArt(x: unknown): x is NachtragArt {
  return NACHTRAG_ARTEN.some((a) => a.key === x);
}
export function istNachtragStatus(x: unknown): x is NachtragStatus {
  return NACHTRAG_STATUS.some((s) => s.key === x);
}
export function nachtragArt(key: unknown) {
  return NACHTRAG_ARTEN.find((a) => a.key === key) ?? null;
}
export function statusLabel(key: unknown): string {
  return NACHTRAG_STATUS.find((s) => s.key === key)?.label ?? String(key ?? '');
}

/**
 * Naechste freie Nachtragsnummer: N01, N02 … Luecken werden NICHT aufgefuellt
 * (eine geloeschte N03 bleibt weg) — sonst gibt es zwei verschiedene N03 im
 * Schriftverkehr mit dem Kunden.
 */
export function naechsteNummer(vorhandene: (string | null | undefined)[]): string {
  let max = 0;
  for (const v of vorhandene) {
    const m = /^N(\d{1,4})$/i.exec(String(v ?? '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = max + 1;
  return 'N' + (n < 10 ? '0' + n : String(n));
}

export type NachtragPosition = { kurztext: string; menge: unknown; einheit?: string | null; einzelpreis: unknown };

/**
 * Summe der Nachtragspositionen, netto.
 * Fehlt bei EINER Position Menge oder Preis, ist die Summe null — nie eine
 * Teilsumme, die wie der ganze Betrag aussieht. `fehlend` sagt, wie viele.
 */
export function nachtragBetrag(positionen: NachtragPosition[] | null | undefined): { betrag: number | null; fehlend: number; anzahl: number } {
  const liste = (positionen ?? []).filter((p) => p && String(p.kurztext ?? '').trim());
  let summe = 0;
  let fehlend = 0;
  for (const p of liste) {
    const menge = zahlOderNull(p.menge);
    const ep = zahlOderNull(p.einzelpreis);
    if (menge == null || ep == null) { fehlend++; continue; }
    summe += cent(menge * ep);
  }
  return { betrag: liste.length && !fehlend ? cent(summe) : null, fehlend, anzahl: liste.length };
}

export type NachtragZeile = {
  nummer?: string | null;
  titel?: string | null;
  art: string;
  vertragsart?: string | null;
  status: string;
  entdeckt_am?: string | null;
  angekuendigt_am?: string | null;
  ausfuehrung_ab?: string | null;
  angeboten_am?: string | null;
  antwort_bis?: string | null;
  beauftragt_am?: string | null;
  beauftragt_durch?: string | null;
  betrag_netto?: number | string | null;
  lv_id?: string | null;
  in_lv_uebernommen?: boolean | null;
};

const VOR_BEAUFTRAGUNG: NachtragStatus[] = ['entdeckt', 'angekuendigt', 'angeboten'];

/**
 * Pruefung eines Nachtrags — mechanisch, ohne KI. Reihenfolge: rot, gelb, info.
 */
export function pruefeNachtrag(n: NachtragZeile, heute: string): Hinweis[] {
  const h: Hinweis[] = [];
  const status = n.status as NachtragStatus;
  const angekuendigt = iso(n.angekuendigt_am);
  const ausfuehrung = iso(n.ausfuehrung_ab);
  const antwortBis = iso(n.antwort_bis);
  const betrag = zahlOderNull(n.betrag_netto);
  const offen = VOR_BEAUFTRAGUNG.includes(status);

  // 1. Ankuendigung — die teuerste Luecke in der Praxis.
  // Nach der Beauftragung ist die Frage erledigt — dann keine Warnung mehr.
  if (n.art === 'zusaetzlich' && n.vertragsart !== 'bgb' && (offen || status === 'abgelehnt')) {
    if (ausfuehrung && (!angekuendigt || angekuendigt > ausfuehrung)) {
      h.push({ stufe: 'rot', text: 'Mit der Ausführung wurde vor der Ankündigung begonnen. Beim VOB-Vertrag kann der Vergütungsanspruch daran scheitern (§ 2 Abs. 6 VOB/B) — Anwalt prüfen.' });
    } else if (!angekuendigt && offen) {
      h.push({ stufe: 'gelb', text: 'Noch nicht angekündigt. Die Mehrkosten-Anzeige muss VOR Beginn der Ausführung beim Auftraggeber sein.' });
    }
  }
  if (n.art === 'behinderung' && !angekuendigt) {
    h.push({ stufe: 'rot', text: 'Behinderung noch nicht angezeigt. Unverzüglich und schriftlich anzeigen (§ 6 Abs. 1 VOB/B) — sonst fehlt der Nachweis.' });
  }
  if (n.art === 'geaendert' && !angekuendigt && status === 'entdeckt') {
    h.push({ stufe: 'gelb', text: 'Geänderte Leistung: Preis möglichst vor der Ausführung vereinbaren. Die Anordnung schriftlich bestätigen lassen.' });
  }

  // 2. Arbeit vor Beauftragung.
  if (offen && ausfuehrung && ausfuehrung <= heute && n.art !== 'behinderung') {
    h.push({ stufe: 'gelb', text: 'Die Arbeit läuft, der Nachtrag ist aber noch nicht beauftragt. Risiko: Sie bleiben auf den Kosten sitzen.' });
  }

  // 3. Angebot und Antwortfrist.
  if (status === 'angeboten') {
    if (betrag == null) h.push({ stufe: 'rot', text: 'Als angeboten markiert, aber ohne Betrag.' });
    if (antwortBis) {
      const tage = tageBis(heute, antwortBis);
      if (tage < 0) h.push({ stufe: 'rot', text: `Antwortfrist seit ${-tage} ${-tage === 1 ? 'Tag' : 'Tagen'} abgelaufen — nachfassen.` });
      else if (tage <= 3) h.push({ stufe: 'gelb', text: tage === 0 ? 'Antwortfrist endet heute.' : `Antwortfrist endet in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}.` });
    } else {
      h.push({ stufe: 'info', text: 'Keine Antwortfrist gesetzt. Eine Frist (z. B. 10 Werktage) macht das Nachfassen leichter.' });
    }
  }

  // 4. Beauftragung beweisbar festhalten.
  if (status === 'beauftragt' || status === 'abgerechnet') {
    if (!iso(n.beauftragt_am) || !String(n.beauftragt_durch ?? '').trim()) {
      h.push({ stufe: 'gelb', text: 'Datum und Person der Beauftragung festhalten (am besten schriftlich) — das ist im Streit Ihr Beweis.' });
    }
    if (betrag == null) h.push({ stufe: 'gelb', text: 'Beauftragt, aber ohne Betrag. Ohne Betrag kann der Nachtrag nicht abgerechnet werden.' });
  }
  if (status === 'beauftragt' && n.lv_id && !n.in_lv_uebernommen) {
    h.push({ stufe: 'info', text: 'Beauftragt, aber noch nicht ins Leistungsverzeichnis übernommen — sonst fehlt er in der Rechnung.' });
  }

  // 5. Vertragsart unbekannt.
  if (!n.vertragsart || n.vertragsart === 'unklar') {
    h.push({ stufe: 'info', text: 'Vertragsart unklar (VOB/B oder BGB). Davon hängen Fristen und Form ab.' });
  }

  const rang: Record<Stufe, number> = { rot: 0, gelb: 1, info: 2 };
  return h.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

/** Der naechste sinnvolle Schritt — ein Satz fuer die Liste. */
export function naechsterSchritt(n: NachtragZeile): string {
  switch (n.status) {
    case 'entdeckt':
      return n.art === 'behinderung' ? 'Behinderung schriftlich anzeigen' : 'Mehrkosten ankündigen';
    case 'angekuendigt':
      return n.art === 'behinderung' ? 'Ende der Behinderung melden, Mehrkosten beziffern' : 'Nachtragsangebot schicken';
    case 'angeboten':
      return 'Schriftliche Beauftragung einholen';
    case 'beauftragt':
      return n.in_lv_uebernommen ? 'Mit der nächsten Rechnung abrechnen' : 'Ins LV übernehmen und abrechnen';
    case 'abgelehnt':
      return 'Ablehnung prüfen — ggf. Anwalt';
    case 'abgerechnet':
      return 'Erledigt';
    default:
      return '';
  }
}

export type NachtragZahlen = {
  anzahl: number;
  offenAnzahl: number;
  offenBetrag: number;
  /** Anzahl offener Nachtraege ohne Betrag — die Summe ist dann unvollstaendig. */
  offenOhneBetrag: number;
  beauftragtBetrag: number;
  abgelehntBetrag: number;
  /** Anteil beauftragt an (beauftragt + abgelehnt), nach Anzahl. null = noch nichts entschieden. */
  quote: number | null;
  rot: number;
};

export function nachtragZahlen(liste: NachtragZeile[], heute: string): NachtragZahlen {
  const z: NachtragZahlen = { anzahl: 0, offenAnzahl: 0, offenBetrag: 0, offenOhneBetrag: 0, beauftragtBetrag: 0, abgelehntBetrag: 0, quote: null, rot: 0 };
  let beauftragt = 0;
  let abgelehnt = 0;
  for (const n of liste) {
    z.anzahl++;
    const b = zahlOderNull(n.betrag_netto);
    if (VOR_BEAUFTRAGUNG.includes(n.status as NachtragStatus)) {
      z.offenAnzahl++;
      if (b == null) z.offenOhneBetrag++; else z.offenBetrag = cent(z.offenBetrag + b);
    }
    if (n.status === 'beauftragt' || n.status === 'abgerechnet') { beauftragt++; if (b != null) z.beauftragtBetrag = cent(z.beauftragtBetrag + b); }
    if (n.status === 'abgelehnt') { abgelehnt++; if (b != null) z.abgelehntBetrag = cent(z.abgelehntBetrag + b); }
    if (pruefeNachtrag(n, heute).some((x) => x.stufe === 'rot')) z.rot++;
  }
  z.quote = beauftragt + abgelehnt > 0 ? Math.round((beauftragt / (beauftragt + abgelehnt)) * 100) : null;
  return z;
}

/** Sortierung: rot zuerst, dann offen vor erledigt, dann nach Nummer. */
export function sortiereNachtraege<T extends NachtragZeile>(liste: T[], heute: string): T[] {
  const gewicht = (n: T) => {
    const h = pruefeNachtrag(n, heute);
    if (h.some((x) => x.stufe === 'rot')) return 0;
    if (VOR_BEAUFTRAGUNG.includes(n.status as NachtragStatus)) return 1;
    if (n.status === 'beauftragt') return 2;
    return 3;
  };
  return [...liste].sort((a, b) => gewicht(a) - gewicht(b) || String(a.nummer ?? '').localeCompare(String(b.nummer ?? '')));
}

/**
 * Darf der Nachtrag ins LV uebernommen werden? Nur beauftragt, nur mit LV,
 * nur mit vollstaendigen Preisen, nicht doppelt, nicht in ein bereits
 * abgerechnetes LV (dann gehoert er auf eine eigene Rechnung).
 */
export function lvUebernahmeMoeglich(
  n: NachtragZeile & { positionen?: NachtragPosition[] | null },
  lvStatus: string | null | undefined,
): { ok: boolean; grund: string | null } {
  if (n.status !== 'beauftragt') return { ok: false, grund: 'Nur beauftragte Nachträge können ins LV übernommen werden.' };
  if (!n.lv_id) return { ok: false, grund: 'Kein Leistungsverzeichnis zugeordnet.' };
  if (n.in_lv_uebernommen) return { ok: false, grund: 'Bereits ins LV übernommen.' };
  if (lvStatus === 'abgerechnet') return { ok: false, grund: 'Das LV ist bereits abgerechnet — den Nachtrag bitte gesondert abrechnen.' };
  const b = nachtragBetrag(n.positionen);
  if (!b.anzahl) return { ok: false, grund: 'Der Nachtrag hat keine Positionen.' };
  if (b.fehlend) return { ok: false, grund: `Bei ${b.fehlend} ${b.fehlend === 1 ? 'Position fehlt' : 'Positionen fehlen'} Menge oder Preis.` };
  return { ok: true, grund: null };
}

// ===========================================================================
// TEIL 2 · GEWAEHRLEISTUNG
// ===========================================================================

export type Regelwerk = 'vob_bauwerk' | 'vob_sonst' | 'bgb_bauwerk' | 'bgb_sonst' | 'individuell';

/** Vorschlaege — immer ueberschreibbar. Quelle steht dabei. */
export const REGELWERKE: { key: Regelwerk; label: string; monate: number | null; grundlage: string }[] = [
  { key: 'vob_bauwerk', label: 'VOB/B – Bauwerk', monate: 48, grundlage: 'VOB/B § 13 Abs. 4 Nr. 1: 4 Jahre für Bauwerke (wenn nichts anderes vereinbart).' },
  { key: 'vob_sonst', label: 'VOB/B – andere Arbeiten', monate: 24, grundlage: 'VOB/B § 13 Abs. 4 Nr. 1: 2 Jahre für andere Werke (z. B. Wartung, Veränderung einer Sache).' },
  { key: 'bgb_bauwerk', label: 'BGB – Bauwerk', monate: 60, grundlage: '§ 634a Abs. 1 Nr. 2 BGB: 5 Jahre bei einem Bauwerk.' },
  { key: 'bgb_sonst', label: 'BGB – andere Arbeiten', monate: 24, grundlage: '§ 634a Abs. 1 Nr. 1 BGB: 2 Jahre.' },
  { key: 'individuell', label: 'Laut Vertrag (eigene Frist)', monate: null, grundlage: 'Frist aus Ihrem Vertrag eintragen.' },
];

export function regelwerk(key: unknown) {
  return REGELWERKE.find((r) => r.key === key) ?? null;
}
export function istVob(key: unknown): boolean {
  return key === 'vob_bauwerk' || key === 'vob_sonst';
}

export type GewaehrleistungZeile = {
  bezeichnung?: string | null;
  abnahme_am?: string | null;
  regelwerk?: string | null;
  monate?: number | string | null;
  sicherheit_art?: string | null;
  sicherheit_betrag?: number | string | null;
  sicherheit_rueckgabe_am?: string | null;
  sicherheit_zurueck_am?: string | null;
};

/**
 * Letzter Tag der Gewaehrleistung. Abnahme 15.03.2026 + 48 Monate =
 * 15.03.2030 (§ 187 Abs. 1, § 188 Abs. 2 BGB). 29.02. -> 28.02. im
 * Nicht-Schaltjahr (§ 188 Abs. 3). null, wenn Datum oder Frist fehlt — nie
 * eine erfundene Standardfrist.
 */
export function gewaehrleistungsEnde(g: GewaehrleistungZeile): string | null {
  const ab = iso(g.abnahme_am);
  const m = zahlOderNull(g.monate);
  if (!ab || m == null || !(m > 0) || m > 360) return null;
  return plusMonate(ab, Math.round(m));
}

/**
 * Ab wann die Sicherheit fuer Maengelansprueche zurueckverlangt werden kann.
 * 1. Vertraglich vereinbartes Datum, wenn eingetragen.
 * 2. VOB/B: nach 2 Jahren (§ 17 Abs. 8 Nr. 2 VOB/B), wenn nichts anderes
 *    vereinbart ist — auch wenn die Gewaehrleistung 4 Jahre laeuft.
 * 3. Sonst: Ende der Gewaehrleistung.
 * Ohne Sicherheit: null.
 */
export function sicherheitRueckgabeAb(g: GewaehrleistungZeile): { datum: string | null; quelle: 'vertrag' | 'vob' | 'ende' | null } {
  const art = g.sicherheit_art;
  if (art !== 'einbehalt' && art !== 'buergschaft') return { datum: null, quelle: null };
  const vertrag = iso(g.sicherheit_rueckgabe_am);
  if (vertrag) return { datum: vertrag, quelle: 'vertrag' };
  const ab = iso(g.abnahme_am);
  if (istVob(g.regelwerk) && ab) return { datum: plusMonate(ab, 24), quelle: 'vob' };
  const ende = gewaehrleistungsEnde(g);
  return ende ? { datum: ende, quelle: 'ende' } : { datum: null, quelle: null };
}

export type GwStatus = 'laeuft' | 'endet_bald' | 'abgelaufen' | 'unvollstaendig';

/** Wie viele Tage vor dem Ende "endet bald" gilt. */
export const BALD_TAGE = 90;

export function gewaehrleistungStatus(g: GewaehrleistungZeile, heute: string): { status: GwStatus; ende: string | null; tage: number | null } {
  const ende = gewaehrleistungsEnde(g);
  if (!ende) return { status: 'unvollstaendig', ende: null, tage: null };
  const tage = tageBis(heute, ende);
  if (tage < 0) return { status: 'abgelaufen', ende, tage };
  if (tage <= BALD_TAGE) return { status: 'endet_bald', ende, tage };
  return { status: 'laeuft', ende, tage };
}

export function pruefeGewaehrleistung(g: GewaehrleistungZeile, heute: string): Hinweis[] {
  const h: Hinweis[] = [];
  const st = gewaehrleistungStatus(g, heute);
  if (st.status === 'unvollstaendig') {
    h.push({ stufe: 'gelb', text: 'Abnahmedatum oder Frist fehlt — das Ende der Gewährleistung lässt sich nicht berechnen.' });
  }
  if (st.status === 'endet_bald') {
    h.push({ stufe: 'info', text: `Gewährleistung endet in ${st.tage} ${st.tage === 1 ? 'Tag' : 'Tagen'} (${datumDe(st.ende)}).` });
  }
  const s = sicherheitRueckgabeAb(g);
  const zurueck = iso(g.sicherheit_zurueck_am);
  if (s.datum && !zurueck) {
    const tage = tageBis(heute, s.datum);
    if (tage < 0) {
      h.push({ stufe: 'rot', text: `Sicherheit (${g.sicherheit_art === 'buergschaft' ? 'Bürgschaft' : 'Einbehalt'}${zahlOderNull(g.sicherheit_betrag) != null ? ' ' + euro(zahlOderNull(g.sicherheit_betrag)) : ''}) kann seit ${datumDe(s.datum)} zurückverlangt werden — Musterschreiben nutzen.` });
    } else if (tage <= BALD_TAGE) {
      h.push({ stufe: 'info', text: `Sicherheit kann ab ${datumDe(s.datum)} zurückverlangt werden.` });
    }
    if (s.quelle === 'vob') {
      h.push({ stufe: 'info', text: 'Rückgabe nach 2 Jahren laut § 17 Abs. 8 Nr. 2 VOB/B, sofern im Vertrag nichts anderes steht — Vertrag prüfen.' });
    }
  }
  if ((g.sicherheit_art === 'einbehalt' || g.sicherheit_art === 'buergschaft') && zahlOderNull(g.sicherheit_betrag) == null) {
    h.push({ stufe: 'gelb', text: 'Sicherheit ohne Betrag erfasst.' });
  }
  const rang: Record<Stufe, number> = { rot: 0, gelb: 1, info: 2 };
  return h.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

// ---------------------------------------------------------------------------
// Maengelruegen nach der Abnahme
// ---------------------------------------------------------------------------

export type RuegeStatus = 'gemeldet' | 'geprueft' | 'termin' | 'behoben' | 'abgelehnt';

export const RUEGE_STATUS: { key: RuegeStatus; label: string }[] = [
  { key: 'gemeldet', label: 'Gemeldet' },
  { key: 'geprueft', label: 'Geprüft' },
  { key: 'termin', label: 'Termin steht' },
  { key: 'behoben', label: 'Behoben' },
  { key: 'abgelehnt', label: 'Abgelehnt (kein Mangel)' },
];

export function istRuegeStatus(x: unknown): x is RuegeStatus {
  return RUEGE_STATUS.some((s) => s.key === x);
}
export function ruegeStatusLabel(key: unknown): string {
  return RUEGE_STATUS.find((s) => s.key === key)?.label ?? String(key ?? '');
}

export type RuegeZeile = {
  eingang_am?: string | null;
  schriftlich?: boolean | null;
  frist_kunde?: string | null;
  status: string;
  termin_am?: string | null;
  behoben_am?: string | null;
  abgenommen_am?: string | null;
};

const RUEGE_ERLEDIGT: RuegeStatus[] = ['behoben', 'abgelehnt'];

export function ruegeOffen(r: RuegeZeile): boolean {
  return !RUEGE_ERLEDIGT.includes(r.status as RuegeStatus);
}

/**
 * VOB/B § 13 Abs. 5 Nr. 1: Der Anspruch auf Beseitigung eines SCHRIFTLICH
 * geruegten Mangels verjaehrt fruehestens 2 Jahre nach Zugang der Ruege,
 * nicht aber vor Ablauf der Regelfrist. Nach Abnahme der Nacharbeit laeuft
 * fuer DIESE Leistung eine neue 2-Jahres-Frist, wieder nicht vor dem
 * regulaeren Ende. Gilt nur fuer VOB-Vertraege; beim BGB-Vertrag gibt es
 * diese Verlaengerung nicht (dort Hemmung nach § 203 BGB — Anwalt).
 *
 * Ergebnis ist ein RICHTWERT fuer die Anzeige, keine Rechtsauskunft.
 */
export function ruegeFristEnde(r: RuegeZeile, g: GewaehrleistungZeile): { ruege: string | null; nacharbeit: string | null } {
  const ende = gewaehrleistungsEnde(g);
  if (!istVob(g.regelwerk) || !ende) return { ruege: null, nacharbeit: null };
  const max = (a: string | null, b: string) => (a && a > b ? a : b);
  const eingang = iso(r.eingang_am);
  const ruege = r.schriftlich && eingang ? max(plusMonate(eingang, 24), ende) : null;
  const abg = iso(r.abgenommen_am);
  const nacharbeit = abg ? max(plusMonate(abg, 24), ende) : null;
  return { ruege, nacharbeit };
}

export function pruefeRuege(r: RuegeZeile, g: GewaehrleistungZeile, heute: string): Hinweis[] {
  const h: Hinweis[] = [];
  const ende = gewaehrleistungsEnde(g);
  const eingang = iso(r.eingang_am);
  const offen = ruegeOffen(r);

  if (!eingang) h.push({ stufe: 'gelb', text: 'Eingangsdatum der Rüge fehlt — für die Fristen wichtig.' });
  if (eingang && ende && eingang > ende) {
    h.push({ stufe: 'gelb', text: `Die Rüge kam nach dem Ende der Gewährleistung (${datumDe(ende)}). Nicht ohne Prüfung anerkennen — Anwalt fragen.` });
  }
  if (offen) {
    const frist = iso(r.frist_kunde);
    if (frist) {
      const tage = tageBis(heute, frist);
      if (tage < 0) h.push({ stufe: 'rot', text: `Frist des Kunden seit ${-tage} ${-tage === 1 ? 'Tag' : 'Tagen'} abgelaufen — der Kunde darf danach unter Umständen selbst beauftragen (Ersatzvornahme).` });
      else if (tage <= 3) h.push({ stufe: 'gelb', text: tage === 0 ? 'Frist des Kunden endet heute.' : `Frist des Kunden endet in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}.` });
    }
    if (r.status === 'gemeldet' && eingang && tageBis(eingang, heute) > 3) {
      h.push({ stufe: 'gelb', text: 'Seit mehr als 3 Tagen ohne Reaktion. Eingang bestätigen und einen Prüftermin anbieten.' });
    }
    if (r.status === 'termin' && !iso(r.termin_am)) h.push({ stufe: 'gelb', text: 'Status "Termin steht", aber kein Termin eingetragen.' });
  }
  if (r.status === 'behoben' && !iso(r.behoben_am)) h.push({ stufe: 'gelb', text: 'Behoben — bitte das Datum eintragen.' });
  if (r.status === 'behoben' && iso(r.behoben_am) && !iso(r.abgenommen_am) && istVob(g.regelwerk)) {
    h.push({ stufe: 'info', text: 'Nacharbeit vom Kunden abnehmen lassen und das Datum eintragen — ab dann läuft die Frist für die Nacharbeit.' });
  }
  const f = ruegeFristEnde(r, g);
  if (f.ruege && ende && f.ruege > ende) {
    h.push({ stufe: 'info', text: `VOB/B § 13 Abs. 5: Für diesen Mangel läuft die Frist bis ${datumDe(f.ruege)} (Richtwert, Anwalt prüfen).` });
  }
  const rang: Record<Stufe, number> = { rot: 0, gelb: 1, info: 2 };
  return h.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

export type GwZahlen = { laufend: number; endetBald: number; abgelaufen: number; sicherheitFaellig: number; sicherheitFaelligBetrag: number; offeneRuegen: number; ruegenRot: number };

export function gewaehrleistungZahlen(
  liste: (GewaehrleistungZeile & { id: string })[],
  ruegen: (RuegeZeile & { gewaehrleistung_id: string })[],
  heute: string,
): GwZahlen {
  const z: GwZahlen = { laufend: 0, endetBald: 0, abgelaufen: 0, sicherheitFaellig: 0, sicherheitFaelligBetrag: 0, offeneRuegen: 0, ruegenRot: 0 };
  const nachId = new Map(liste.map((g) => [g.id, g]));
  for (const g of liste) {
    const st = gewaehrleistungStatus(g, heute).status;
    if (st === 'laeuft') z.laufend++;
    if (st === 'endet_bald') { z.laufend++; z.endetBald++; }
    if (st === 'abgelaufen') z.abgelaufen++;
    const s = sicherheitRueckgabeAb(g);
    if (s.datum && s.datum < heute && !iso(g.sicherheit_zurueck_am)) {
      z.sicherheitFaellig++;
      const b = zahlOderNull(g.sicherheit_betrag);
      if (b != null) z.sicherheitFaelligBetrag = cent(z.sicherheitFaelligBetrag + b);
    }
  }
  for (const r of ruegen) {
    if (!ruegeOffen(r)) continue;
    z.offeneRuegen++;
    const g = nachId.get(r.gewaehrleistung_id);
    if (g && pruefeRuege(r, g, heute).some((x) => x.stufe === 'rot')) z.ruegenRot++;
  }
  return z;
}

// ===========================================================================
// TEIL 3 · MUSTERSCHREIBEN (Anwalt-Platzhalter)
// ===========================================================================
// Feste Texte, KEIN KI-Aufruf. Was fehlt, steht als [Platzhalter] im Text und
// wird in der Oberflaeche gezaehlt. Die Seite verlangt vor dem Kopieren einen
// Pruef-Haken. Die Texte sind bewusst nuechtern und in der Sie-Form.

export type Musterart =
  | 'mehrkosten' | 'behinderung' | 'angebot' | 'nachfass'
  | 'ruege_eingang' | 'ruege_ablehnung' | 'sicherheit_zurueck';

export const MUSTER: { key: Musterart; label: string; fuer: 'nachtrag' | 'gewaehrleistung' }[] = [
  { key: 'mehrkosten', label: 'Mehrkosten-Anzeige', fuer: 'nachtrag' },
  { key: 'behinderung', label: 'Behinderungsanzeige', fuer: 'nachtrag' },
  { key: 'angebot', label: 'Nachtragsangebot (Anschreiben)', fuer: 'nachtrag' },
  { key: 'nachfass', label: 'Erinnerung Beauftragung', fuer: 'nachtrag' },
  { key: 'ruege_eingang', label: 'Mängelrüge: Eingang + Prüftermin', fuer: 'gewaehrleistung' },
  { key: 'ruege_ablehnung', label: 'Mängelrüge: kein Mangel', fuer: 'gewaehrleistung' },
  { key: 'sicherheit_zurueck', label: 'Rückgabe der Sicherheit', fuer: 'gewaehrleistung' },
];

export type MusterDaten = {
  firma?: string | null;
  kunde?: string | null;
  bauvorhaben?: string | null;
  nummer?: string | null;
  titel?: string | null;
  beschreibung?: string | null;
  ursache?: string | null;
  datum?: string | null; // Datum des Schreibens (ISO)
  frist?: string | null; // Antwort-/Termin-Frist (ISO)
  betrag?: number | null;
  positionen?: NachtragPosition[] | null;
  vertragsart?: string | null;
  abnahme_am?: string | null;
  eingang_am?: string | null;
  termin_am?: string | null;
  sicherheit_art?: string | null;
  sicherheit_betrag?: number | null;
};

function feld(x: unknown, platzhalter: string): string {
  const t = String(x ?? '').trim();
  return t || `[${platzhalter}]`;
}
function datumFeld(x: unknown, platzhalter: string): string {
  return istIsoDatum(x) ? datumDe(x as string) : `[${platzhalter}]`;
}

function positionsListe(p: NachtragPosition[] | null | undefined): string {
  const liste = (p ?? []).filter((x) => String(x.kurztext ?? '').trim());
  if (!liste.length) return '[Positionen mit Menge, Einheit und Einzelpreis]';
  return liste.map((x, i) => {
    const m = zahlOderNull(x.menge);
    const ep = zahlOderNull(x.einzelpreis);
    const gp = m != null && ep != null ? euro(cent(m * ep)) : '[Preis]';
    return `${i + 1}. ${String(x.kurztext).trim()} — ${m != null ? m.toLocaleString('de-DE') : '[Menge]'} ${String(x.einheit ?? '').trim()} × ${ep != null ? euro(ep) : '[Einzelpreis]'} = ${gp}`;
  }).join('\n');
}

function grundlageSatz(vertragsart: unknown, vob: string, bgb: string): string {
  if (vertragsart === 'vob') return vob;
  if (vertragsart === 'bgb') return bgb;
  return '[Rechtsgrundlage laut Vertrag – VOB/B oder BGB]';
}

/** Ein Musterschreiben. Betreff und Text; offene Luecken stehen in [ ]. */
export function musterschreiben(art: Musterart, d: MusterDaten): { betreff: string; text: string } {
  const bv = feld(d.bauvorhaben, 'Bauvorhaben');
  const kunde = feld(d.kunde, 'Auftraggeber');
  const firma = feld(d.firma, 'Ihr Firmenname');
  const nr = feld(d.nummer, 'Nachtragsnummer');
  const titel = feld(d.titel, 'Kurzbezeichnung');
  const gruss = `Mit freundlichen Grüßen\n\n${firma}`;
  const anrede = `Sehr geehrte Damen und Herren,`;

  switch (art) {
    case 'mehrkosten':
      return {
        betreff: `Bauvorhaben ${bv} – Ankündigung von Mehrkosten (${nr}: ${titel})`,
        text: [
          anrede, '',
          `im Rahmen des Bauvorhabens ${bv} ist folgende Leistung erforderlich, die im bisherigen Auftrag nicht enthalten ist:`, '',
          feld(d.beschreibung, 'Beschreibung der zusätzlichen oder geänderten Leistung'), '',
          `Anlass: ${feld(d.ursache, 'Anlass, z. B. Anordnung von … am …')}`, '',
          `Hiermit kündigen wir die dafür anfallende Mehrvergütung an, bevor wir mit der Ausführung beginnen. ${grundlageSatz(d.vertragsart, 'Die Ankündigung erfolgt nach § 2 Abs. 6 VOB/B.', 'Wir bitten um Ihr Änderungsbegehren bzw. Ihre Anordnung in Textform (§ 650b BGB).')}`,
          `Ein Nachtragsangebot erhalten Sie gesondert. Bitte bestätigen Sie uns bis ${datumFeld(d.frist, 'Datum')}, ob die Leistung ausgeführt werden soll.`, '',
          gruss,
        ].join('\n'),
      };
    case 'behinderung':
      return {
        betreff: `Bauvorhaben ${bv} – Behinderungsanzeige`,
        text: [
          anrede, '',
          `bei der Ausführung unserer Leistungen am Bauvorhaben ${bv} sind wir seit ${datumFeld(d.datum, 'Datum')} behindert:`, '',
          feld(d.beschreibung, 'Was genau behindert, welche Arbeiten sind betroffen'), '',
          `Ursache: ${feld(d.ursache, 'Ursache, z. B. fehlende Vorleistung, fehlende Pläne, kein Zugang')}`, '',
          `${grundlageSatz(d.vertragsart, 'Wir zeigen die Behinderung hiermit nach § 6 Abs. 1 VOB/B an.', 'Wir zeigen die Behinderung hiermit an und bitten um Abhilfe.')} Die vereinbarten Ausführungsfristen verlängern sich entsprechend; Mehrkosten behalten wir uns vor.`,
          `Bitte teilen Sie uns mit, wann die Arbeiten fortgesetzt werden können. Sobald die Behinderung wegfällt, nehmen wir die Arbeiten unverzüglich wieder auf.`, '',
          gruss,
        ].join('\n'),
      };
    case 'angebot': {
      const summe = d.betrag != null ? euro(d.betrag) : '[Summe netto]';
      return {
        betreff: `Bauvorhaben ${bv} – Nachtragsangebot ${nr}: ${titel}`,
        text: [
          anrede, '',
          `wie angekündigt erhalten Sie unser Nachtragsangebot ${nr} zum Bauvorhaben ${bv}:`, '',
          positionsListe(d.positionen), '',
          `Summe netto: ${summe} zuzüglich der gesetzlichen Umsatzsteuer.`, '',
          `Die Preise sind auf Grundlage der Preisermittlung des Hauptauftrags gebildet. Wir bitten um Ihre schriftliche Beauftragung bis ${datumFeld(d.frist, 'Datum')}.`, '',
          gruss,
        ].join('\n'),
      };
    }
    case 'nachfass':
      return {
        betreff: `Bauvorhaben ${bv} – Erinnerung Nachtragsangebot ${nr}`,
        text: [
          anrede, '',
          `am ${datumFeld(d.datum, 'Datum des Angebots')} haben wir Ihnen unser Nachtragsangebot ${nr} (${titel}${d.betrag != null ? ', ' + euro(d.betrag) + ' netto' : ''}) übersandt. Eine Beauftragung liegt uns noch nicht vor.`, '',
          `Bitte teilen Sie uns bis ${datumFeld(d.frist, 'neues Datum')} mit, ob Sie den Nachtrag beauftragen. Bis dahin können wir die betroffenen Arbeiten nur eingeschränkt einplanen.`, '',
          gruss,
        ].join('\n'),
      };
    case 'ruege_eingang':
      return {
        betreff: `Bauvorhaben ${bv} – Ihre Mängelanzeige vom ${datumFeld(d.eingang_am, 'Datum')}`,
        text: [
          anrede, '',
          `vielen Dank für Ihre Mängelanzeige vom ${datumFeld(d.eingang_am, 'Datum')} zum Bauvorhaben ${bv}:`, '',
          feld(d.beschreibung, 'Beschreibung des gemeldeten Mangels'), '',
          `Wir sehen uns die Stelle an und schlagen als Prüftermin den ${datumFeld(d.termin_am, 'Terminvorschlag')} vor. Bitte bestätigen Sie den Termin oder nennen Sie uns einen anderen.`,
          `Diese Bestätigung ist noch kein Anerkenntnis eines Mangels; wir prüfen zunächst die Ursache.`, '',
          gruss,
        ].join('\n'),
      };
    case 'ruege_ablehnung':
      return {
        betreff: `Bauvorhaben ${bv} – Ihre Mängelanzeige vom ${datumFeld(d.eingang_am, 'Datum')}`,
        text: [
          anrede, '',
          `wir haben die gemeldete Stelle am ${datumFeld(d.termin_am, 'Datum der Prüfung')} geprüft:`, '',
          feld(d.beschreibung, 'Beschreibung des gemeldeten Mangels'), '',
          `Ergebnis: ${feld(d.ursache, 'Begründung, z. B. Verschleiß, unsachgemäße Nutzung, Leistung eines anderen Gewerks')}`, '',
          `Ein Mangel unserer Leistung liegt nach unserer Prüfung nicht vor. Gern beseitigen wir die Ursache auf Grundlage eines gesonderten Auftrags; ein Angebot senden wir Ihnen auf Wunsch zu.`, '',
          gruss,
        ].join('\n'),
      };
    case 'sicherheit_zurueck': {
      const artText = d.sicherheit_art === 'buergschaft' ? 'die Gewährleistungsbürgschaft' : 'den Sicherheitseinbehalt';
      return {
        betreff: `Bauvorhaben ${bv} – Rückgabe der Sicherheit für Mängelansprüche`,
        text: [
          anrede, '',
          `die Abnahme unserer Leistungen am Bauvorhaben ${bv} erfolgte am ${datumFeld(d.abnahme_am, 'Abnahmedatum')}. Der vereinbarte Zeitpunkt für die Rückgabe der Sicherheit ist erreicht${d.vertragsart === 'vob' ? ' (§ 17 Abs. 8 Nr. 2 VOB/B, sofern vertraglich nichts anderes vereinbart ist)' : ''}.`, '',
          `Wir bitten Sie, ${artText}${d.sicherheit_betrag != null ? ' über ' + euro(d.sicherheit_betrag) : ''} bis ${datumFeld(d.frist, 'Datum')} ${d.sicherheit_art === 'buergschaft' ? 'im Original an uns zurückzusenden' : 'auf unser Konto zu überweisen'}.`, '',
          gruss,
        ].join('\n'),
      };
    }
  }
}

/** Alle [Platzhalter] im Text, ohne Doppelte. */
export function offenePlatzhalter(text: string): string[] {
  const s = new Set<string>();
  for (const m of String(text ?? '').matchAll(/\[([^\]\n]{1,80})\]/g)) s.add(m[1]);
  return [...s];
}
