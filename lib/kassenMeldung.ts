// ============================================================================
// ARGONAUT OS · lib/kassenMeldung.ts — Kassen-Meldung ans Finanzamt (Paket PR, K03)
//
// § 146a Abs. 4 AO: Wer elektronische Aufzeichnungssysteme mit zertifizierter
// technischer Sicherheitseinrichtung (TSE) nutzt, teilt sie dem Finanzamt mit
// — seit 01.01.2025 über „Mein ELSTER" (Formular „Mitteilung nach § 146a
// Abs. 4 AO"), per XML-Upload oder über eine ERiC-Schnittstelle.
//
//   Fristen (Stand 24.09.2026, Merkblätter der Finanzverwaltung):
//   - vor dem 01.07.2025 angeschafft: Mitteilung bis 31.07.2025
//   - ab dem 01.07.2025 angeschafft: innerhalb eines Monats
//   - Außerbetriebnahme ab dem 01.07.2025: innerhalb eines Monats
//   - Mieten, Leasen, Leihen gilt als Anschaffung (Beginn = Anschaffungsdatum)
//   - JE BETRIEBSSTÄTTE eine Mitteilung, und zwar immer mit ALLEN Systemen
//     dieser Betriebsstätte (auch den unveränderten)
//   - EU-Taxameter/Wegstreckenzähler ohne TSE: vorerst keine Mitteilung
//
// ARGONAUT übermittelt NICHT selbst (keine ELSTER-Hersteller-ID, K02). Es
// führt das Verzeichnis, rechnet die Fristen und liefert eine Ausfüllhilfe,
// die man in Mein ELSTER abtippt. Reine Logik, node-getestet
// (tests/pflichtenP92.test.mjs), 0 €.
// ============================================================================

export const MELDE_STICHTAG = '2025-07-01';
export const ALT_FRIST = '2025-07-31';

export const SYSTEM_ARTEN = [
  { key: 'kasse_pc', label: 'PC-/computergestütztes Kassensystem' },
  { key: 'kasse_app', label: 'Tablet-/App-Kasse' },
  { key: 'registrierkasse', label: 'Elektronische Registrierkasse' },
  { key: 'taxameter', label: 'Taxameter' },
  { key: 'wegstreckenzaehler', label: 'Wegstreckenzähler' },
  { key: 'sonstiges', label: 'Sonstiges elektronisches Aufzeichnungssystem' },
] as const;
export type SystemArt = (typeof SYSTEM_ARTEN)[number]['key'];

export const TSE_ARTEN = [
  { key: 'usb', label: 'USB-/Hardware-TSE' },
  { key: 'sd', label: 'SD-/microSD-TSE' },
  { key: 'cloud', label: 'Cloud-TSE' },
  { key: 'integriert', label: 'Im Gerät verbaut' },
] as const;

export const AUSSER_GRUENDE = ['Verkauf', 'Verschrottung', 'Diebstahl', 'Defekt', 'Rückgabe (Miete/Leasing)', 'Wechsel in andere Betriebsstätte', 'Sonstiges'] as const;

export type KassenSystem = {
  id: string;
  betriebsstaette: string;
  art: string;
  hersteller?: string | null;
  modell?: string | null;
  software?: string | null;
  seriennummer?: string | null;
  anschaffung_am?: string | null;
  gemietet?: boolean | null;
  ausser_betrieb_am?: string | null;
  ausser_grund?: string | null;
  tse_art?: string | null;
  tse_seriennummer?: string | null;
  tse_bsi_id?: string | null;
  tse_anschaffung_am?: string | null;
};

export type Meldung = {
  id?: string;
  betriebsstaette: string;
  gemeldet_am: string;
  transferticket?: string | null;
  snapshot: Array<{ id: string; ausser_betrieb_am: string | null }>;
};

function istTag(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}
function tagMs(t: string): number { return Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)); }

/** Ein Monat später, ohne Überlauf (31.01. -> 28./29.02.). */
export function einMonatSpaeter(tag: string): string {
  const j = +tag.slice(0, 4); const m = +tag.slice(5, 7); const d = +tag.slice(8, 10);
  const zj = m === 12 ? j + 1 : j; const zm = m === 12 ? 0 : m;
  const letzter = new Date(Date.UTC(zj, zm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(zj, zm, Math.min(d, letzter))).toISOString().slice(0, 10);
}

export function datumDe(t: string | null | undefined): string {
  return istTag(t) ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : '—';
}

/** Schlüssel für die Betriebsstätte (Groß-/Kleinschreibung und Leerzeichen egal). */
export function staetteSchluessel(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim();
}

/** Gilt für dieses System überhaupt eine Mitteilungspflicht? */
export function meldepflichtig(s: KassenSystem): boolean {
  if ((s.art === 'taxameter' || s.art === 'wegstreckenzaehler') && !String(s.tse_seriennummer ?? '').trim()) return false;
  return true;
}

export function pruefeSystem(s: Partial<KassenSystem>, heute: string): { fehler: string[]; hinweise: string[] } {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  if (!String(s.betriebsstaette ?? '').trim()) fehler.push('Bitte die Betriebsstätte (Anschrift) angeben.');
  if (!SYSTEM_ARTEN.some((a) => a.key === s.art)) fehler.push('Bitte die Art des Systems wählen.');
  if (!String(s.seriennummer ?? '').trim()) fehler.push('Die Seriennummer des Systems fehlt.');
  if (!istTag(s.anschaffung_am)) fehler.push('Das Anschaffungsdatum fehlt (bei Miete/Leasing: Beginn).');
  else if (s.anschaffung_am > heute) fehler.push('Das Anschaffungsdatum liegt in der Zukunft.');
  if (s.ausser_betrieb_am) {
    if (!istTag(s.ausser_betrieb_am)) fehler.push('Das Datum der Außerbetriebnahme ist ungültig.');
    else if (istTag(s.anschaffung_am) && s.ausser_betrieb_am < s.anschaffung_am) fehler.push('Die Außerbetriebnahme liegt vor der Anschaffung.');
    else if (s.ausser_betrieb_am > heute) fehler.push('Die Außerbetriebnahme liegt in der Zukunft.');
    if (!String(s.ausser_grund ?? '').trim()) hinweise.push('Grund der Außerbetriebnahme fehlt (z. B. Verkauf, Defekt, Diebstahl).');
  }
  const taxi = s.art === 'taxameter' || s.art === 'wegstreckenzaehler';
  if (!String(s.tse_seriennummer ?? '').trim()) {
    if (taxi) hinweise.push('Ohne TSE (EU-Taxameter) besteht derzeit keine Mitteilungspflicht.');
    else fehler.push('Die Seriennummer der TSE fehlt.');
  }
  const bsi = String(s.tse_bsi_id ?? '').trim();
  if (!bsi && !taxi) hinweise.push('Die BSI-Zertifizierungs-ID der TSE fehlt (steht im Zertifikat, Muster BSI-K-TR-0000-2020).');
  if (bsi && !/^BSI-K-TR-\d{4}-\d{4}/i.test(bsi)) hinweise.push('Die BSI-Zertifizierungs-ID sieht ungewöhnlich aus (Muster BSI-K-TR-0000-2020).');
  return { fehler, hinweise };
}

export type OffenerPunkt = {
  system: KassenSystem;
  ereignis: 'anschaffung' | 'ausserbetriebnahme';
  datum: string;
  frist: string;
  ampel: 'rot' | 'gelb';
};

export type StaetteStand = {
  schluessel: string;
  betriebsstaette: string;
  systeme: KassenSystem[];
  letzteMeldung: Meldung | null;
  offen: OffenerPunkt[];
  ampel: 'gruen' | 'gelb' | 'rot';
};

function fristFuer(datum: string): string {
  return datum < MELDE_STICHTAG ? ALT_FRIST : einMonatSpaeter(datum);
}

/**
 * Stand je Betriebsstätte. „Offen" ist, was seit der letzten Meldung dazukam
 * (System nicht in der letzten Meldung) oder außer Betrieb ging (in der
 * letzten Meldung noch ohne dieses Datum). Maßgeblich ist der Vergleich mit
 * der Momentaufnahme der letzten Meldung, nicht ein Datumsvergleich.
 */
export function meldeStand(systeme: KassenSystem[], meldungen: Meldung[], heute: string): StaetteStand[] {
  const gruppen = new Map<string, StaetteStand>();
  for (const s of systeme) {
    const k = staetteSchluessel(s.betriebsstaette);
    if (!k) continue;
    if (!gruppen.has(k)) gruppen.set(k, { schluessel: k, betriebsstaette: s.betriebsstaette.trim(), systeme: [], letzteMeldung: null, offen: [], ampel: 'gruen' });
    (gruppen.get(k) as StaetteStand).systeme.push(s);
  }
  for (const m of meldungen) {
    const g = gruppen.get(staetteSchluessel(m.betriebsstaette));
    if (!g || !istTag(m.gemeldet_am)) continue;
    if (!g.letzteMeldung || m.gemeldet_am >= g.letzteMeldung.gemeldet_am) g.letzteMeldung = m;
  }
  for (const g of gruppen.values()) {
    const snap = new Map((g.letzteMeldung?.snapshot ?? []).map((x) => [x.id, x]));
    for (const s of g.systeme) {
      if (!meldepflichtig(s) || !istTag(s.anschaffung_am)) continue;
      const imSnap = snap.get(s.id);
      const ausser = istTag(s.ausser_betrieb_am) ? s.ausser_betrieb_am : null;
      // Vor dem Stichtag angeschafft UND außer Betrieb, nie gemeldet: keine Pflicht mehr.
      if (!imSnap && ausser && ausser < MELDE_STICHTAG) continue;
      if (!imSnap) {
        const frist = fristFuer(s.anschaffung_am);
        g.offen.push({ system: s, ereignis: 'anschaffung', datum: s.anschaffung_am, frist, ampel: 'gelb' });
      }
      if (ausser && (!imSnap || imSnap.ausser_betrieb_am !== ausser)) {
        const frist = fristFuer(ausser);
        g.offen.push({ system: s, ereignis: 'ausserbetriebnahme', datum: ausser, frist, ampel: 'gelb' });
      }
    }
    for (const o of g.offen) {
      const tage = Math.round((tagMs(o.frist) - tagMs(heute)) / 86_400_000);
      o.ampel = tage < 0 ? 'rot' : 'gelb';
    }
    g.offen.sort((a, b) => a.frist.localeCompare(b.frist));
    g.ampel = g.offen.some((o) => o.ampel === 'rot') ? 'rot' : g.offen.length ? 'gelb' : 'gruen';
  }
  const rang = { rot: 0, gelb: 1, gruen: 2 } as const;
  return [...gruppen.values()].sort((a, b) => rang[a.ampel] - rang[b.ampel] || a.betriebsstaette.localeCompare(b.betriebsstaette, 'de'));
}

/** Momentaufnahme für „als gemeldet vermerken": ALLE Systeme der Betriebsstätte. */
export function snapshotFuer(g: StaetteStand): Meldung['snapshot'] {
  return g.systeme.filter(meldepflichtig).map((s) => ({ id: s.id, ausser_betrieb_am: istTag(s.ausser_betrieb_am) ? s.ausser_betrieb_am : null }));
}

function art(key: string | null | undefined, liste: ReadonlyArray<{ key: string; label: string }>): string {
  return liste.find((a) => a.key === key)?.label ?? (key || '—');
}

/**
 * Ausfüllhilfe für Mein ELSTER: je Betriebsstätte ALLE meldepflichtigen
 * Systeme (auch unveränderte und außer Betrieb genommene, die in der letzten
 * Meldung noch aktiv waren bzw. noch nie gemeldet wurden).
 */
export function ausfuellhilfe(g: StaetteStand, firma: { name?: string | null; steuernummer?: string | null }): string {
  const zeilen: string[] = [];
  zeilen.push('MITTEILUNG NACH § 146a ABS. 4 AO — Ausfüllhilfe für Mein ELSTER');
  zeilen.push(`Steuerpflichtiger: ${firma.name?.trim() || '[Name]'}`);
  zeilen.push(`Steuernummer: ${firma.steuernummer?.trim() || '[Steuernummer]'}`);
  zeilen.push(`Betriebsstätte: ${g.betriebsstaette}`);
  zeilen.push('Hinweis: In jede Mitteilung gehören ALLE Systeme dieser Betriebsstätte.');
  const snap = new Map((g.letzteMeldung?.snapshot ?? []).map((x) => [x.id, x]));
  let n = 0;
  for (const s of g.systeme) {
    if (!meldepflichtig(s)) continue;
    const ausser = istTag(s.ausser_betrieb_am) ? s.ausser_betrieb_am : null;
    if (ausser && !snap.has(s.id) && ausser < MELDE_STICHTAG) continue;
    const bereitsAusserGemeldet = ausser && snap.get(s.id)?.ausser_betrieb_am === ausser;
    if (bereitsAusserGemeldet) continue;
    n++;
    zeilen.push('');
    zeilen.push(`System ${n}`);
    zeilen.push(`  Art des Aufzeichnungssystems: ${art(s.art, SYSTEM_ARTEN)}`);
    zeilen.push(`  Software / Hersteller / Modell: ${[s.software, s.hersteller, s.modell].filter((x) => String(x ?? '').trim()).join(' / ') || '—'}`);
    zeilen.push(`  Seriennummer des Systems: ${s.seriennummer || '[fehlt]'}`);
    zeilen.push(`  Anschaffung${s.gemietet ? ' (Miet-/Leasingbeginn)' : ''}: ${datumDe(s.anschaffung_am)}`);
    if (ausser) zeilen.push(`  Außerbetriebnahme: ${datumDe(ausser)}${s.ausser_grund ? ` (${s.ausser_grund})` : ''}`);
    zeilen.push(`  Art der TSE: ${art(s.tse_art, TSE_ARTEN)}`);
    zeilen.push(`  Seriennummer der TSE: ${s.tse_seriennummer || '[fehlt]'}`);
    zeilen.push(`  BSI-Zertifizierungs-ID: ${s.tse_bsi_id || '[fehlt]'}`);
    if (s.tse_anschaffung_am) zeilen.push(`  TSE seit: ${datumDe(s.tse_anschaffung_am)}`);
  }
  if (!n) zeilen.push('', 'Keine meldepflichtigen Systeme.');
  zeilen.push('', 'Ohne Gewähr — maßgeblich sind die Felder und die Ausfüllanleitung in Mein ELSTER.');
  return zeilen.join('\n');
}

function csvFeld(v: unknown): string {
  const s = String(v ?? '');
  const sicher = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[;"\n]/.test(sicher) ? '"' + sicher.replace(/"/g, '""') + '"' : sicher;
}

/** Verzeichnis als CSV (Semikolon, für Excel/Steuerberatung). */
export function verzeichnisCsv(systeme: KassenSystem[]): string {
  const kopf = ['Betriebsstaette', 'Art', 'Hersteller', 'Modell', 'Software', 'Seriennummer', 'Anschaffung', 'Gemietet', 'Ausser Betrieb', 'Grund', 'TSE-Art', 'TSE-Seriennummer', 'BSI-ID'];
  const z = systeme.map((s) => [s.betriebsstaette, art(s.art, SYSTEM_ARTEN), s.hersteller, s.modell, s.software, s.seriennummer, datumDe(s.anschaffung_am),
    s.gemietet ? 'ja' : 'nein', s.ausser_betrieb_am ? datumDe(s.ausser_betrieb_am) : '', s.ausser_grund, art(s.tse_art, TSE_ARTEN), s.tse_seriennummer, s.tse_bsi_id].map(csvFeld).join(';'));
  return '﻿' + [kopf.join(';'), ...z].join('\r\n');
}
