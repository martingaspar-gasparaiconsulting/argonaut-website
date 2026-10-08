// ============================================================================
// ARGONAUT OS · lib/kfzProbefahrt.ts — Paket 270 (08.10.2026) · K9 Probefahrt und Vorführwagen
//
// Reine Logik für Fahrten mit Bestandsfahrzeugen (Tabelle kfz_probefahrt):
// Probefahrt, Vorführwagen, Ersatzwagen, Überführung — Nummer, Prüfungen vor
// Start und Rückgabe, gefahrene und Mehr-Kilometer, Überfällig, Nachfass,
// rote/Kurzzeitkennzeichen (Gültigkeit, Belegung), Fahrtenliste je
// Kennzeichen und die Inhalte der zwei Unterlagen (Vereinbarung mit Übergabe,
// Rückgabeprotokoll) samt Textfassung für ARGONAUT-Sign.
//
// GRUNDSÄTZE
// - Führerschein: nur „geprüft", Klasse und Gültigkeit — nie die Nummer.
// - Nichts wird geschönt: Schäden bei Übergabe und Rückgabe stehen so im
//   Protokoll, wie sie erfasst sind; ohne Angabe „keine erfasst".
// - Texte sind Vorlagen (Anwalt R45). Haftung über die Selbstbeteiligung der
//   Versicherung des Betriebs — ARGONAUT setzt keinen Betrag fest.
//
// Nur Import der zentralen Rundung und der Dokument-Typen. Keine Systemuhr.
// ============================================================================

import { centRunden } from './zahlen';
import type { DokInhalt, Firmenkopf } from './kfzVerkauf';

export type FahrtArt = 'probefahrt' | 'vorfuehrwagen' | 'ersatzwagen' | 'ueberfuehrung';
export type FahrtStatus = 'geplant' | 'unterwegs' | 'zurueck' | 'storniert';
export type KzArt = 'eigen' | 'rot' | 'kurzzeit';

export const ARTEN: { key: FahrtArt; label: string; text: string; nachfass: boolean }[] = [
  { key: 'probefahrt', label: 'Probefahrt', text: 'Interessent fährt das Fahrzeug Probe.', nachfass: true },
  { key: 'vorfuehrwagen', label: 'Vorführwagen', text: 'Längere Überlassung zum Testen (z. B. übers Wochenende).', nachfass: true },
  { key: 'ersatzwagen', label: 'Ersatzwagen', text: 'Kunde bekommt das Fahrzeug, während sein eigenes in der Werkstatt ist.', nachfass: false },
  { key: 'ueberfuehrung', label: 'Überführung', text: 'Eigene Fahrt, z. B. zum Kunden, zur Zulassung oder zum Aufbereiter.', nachfass: false },
];
export const TANK = ['leer', '1/4', '1/2', '3/4', 'voll'] as const;
export const KZ_ARTEN: { key: KzArt; label: string }[] = [
  { key: 'eigen', label: 'Eigenes Kennzeichen des Fahrzeugs' },
  { key: 'rot', label: 'Rotes Kennzeichen (06)' },
  { key: 'kurzzeit', label: 'Kurzzeitkennzeichen' },
];
export const ERGEBNISSE: { key: string; label: string }[] = [
  { key: 'offen', label: 'noch offen' },
  { key: 'interesse', label: 'Interesse' },
  { key: 'kauf', label: 'Kauf' },
  { key: 'kein_interesse', label: 'kein Interesse' },
];
/** Nachfass so viele Tage nach der Rückgabe. */
export const NACHFASS_TAGE = 2;

export type Fahrt = {
  nr: string | null;
  art: string;
  status: string;
  fahrer_name: string | null; fahrer_anschrift: string | null; fahrer_tel: string | null; fahrer_email: string | null;
  fs_geprueft: boolean; fs_klasse: string | null; fs_gueltig_bis: string | null;
  begleitet: boolean;
  kennzeichen_art: string; kennzeichen: string | null;
  start_am: string | null; ende_geplant: string | null; rueck_am: string | null;
  km_start: number | null; km_ende: number | null; km_frei: number | null;
  tank_start: string | null; tank_ende: string | null;
  schaeden_start: string | null; schaeden_ende: string | null;
  selbstbeteiligung: number | null;
  nachfass_am: string | null; nachfass_erledigt: boolean; ergebnis: string | null;
  notiz: string | null;
};

export type RotesKz = { kennzeichen: string; art: string; gueltig_bis: string | null; aktiv: boolean };
export type FahrzeugKurz = { interne_nr: string | null; marke: string | null; modell: string | null; fin: string | null; kennzeichen: string | null; km_stand: number | null };

// --- Nummer --------------------------------------------------------------------------
export function naechsteFahrtNr(vorhanden: (string | null)[]): string {
  let max = 0;
  for (const n of vorhanden) {
    const m = String(n ?? '').match(/^P-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `P-${String(max + 1).padStart(4, '0')}`;
}

export function artLabel(k: string): string {
  return ARTEN.find((a) => a.key === k)?.label ?? k;
}

// --- Kennzeichen -----------------------------------------------------------------------
export function kzNorm(k: string | null | undefined): string {
  return String(k ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Ist das rote/Kurzzeitkennzeichen am Tag `tagIso` nutzbar? */
export function kzGueltig(kz: RotesKz | undefined, tagIso: string): boolean {
  if (!kz || !kz.aktiv) return false;
  if (!kz.gueltig_bis) return kz.art === 'rot';     // rote 06er laufen ohne festes Ende; Kurzzeit braucht ein Datum
  return kz.gueltig_bis.slice(0, 10) >= tagIso.slice(0, 10);
}

/** Welche Kennzeichen sind gerade frei (nicht an einer laufenden Fahrt)? */
export function freieKennzeichen(alle: RotesKz[], laufend: { kennzeichen: string | null; kennzeichen_art: string; status: string }[], tagIso: string): RotesKz[] {
  const belegt = new Set(laufend.filter((f) => f.status === 'unterwegs' && f.kennzeichen_art !== 'eigen').map((f) => kzNorm(f.kennzeichen)));
  return alle.filter((k) => kzGueltig(k, tagIso) && !belegt.has(kzNorm(k.kennzeichen)));
}

// --- Kilometer / Zeit --------------------------------------------------------------------
export function gefahren(f: Pick<Fahrt, 'km_start' | 'km_ende'>): number | null {
  if (f.km_start === null || f.km_ende === null || f.km_start === undefined || f.km_ende === undefined) return null;
  return f.km_ende >= f.km_start ? f.km_ende - f.km_start : null;
}
export function mehrKm(f: Pick<Fahrt, 'km_start' | 'km_ende' | 'km_frei'>): number {
  const g = gefahren(f);
  if (g === null || f.km_frei === null || f.km_frei === undefined) return 0;
  return Math.max(0, g - f.km_frei);
}
/** Läuft die Fahrt über das geplante Ende hinaus? jetztIso = ISO-Zeitstempel. */
export function ueberfaellig(f: Pick<Fahrt, 'status' | 'ende_geplant'>, jetztIso: string): boolean {
  return f.status === 'unterwegs' && !!f.ende_geplant && f.ende_geplant < jetztIso;
}
export function plusTage(tagIso: string, tage: number): string {
  const d = new Date(tagIso.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
/** Nachfass-Datum nach der Rückgabe — nur für Probefahrt und Vorführwagen. */
export function nachfassDatum(art: string, rueckIso: string): string | null {
  return ARTEN.find((a) => a.key === art)?.nachfass ? plusTage(rueckIso, NACHFASS_TAGE) : null;
}
export function nachfassFaellig(f: Pick<Fahrt, 'status' | 'nachfass_am' | 'nachfass_erledigt'>, heuteIso: string): boolean {
  return f.status === 'zurueck' && !f.nachfass_erledigt && !!f.nachfass_am && f.nachfass_am.slice(0, 10) <= heuteIso.slice(0, 10);
}

// --- Prüfungen ------------------------------------------------------------------------------
export type Pruefung = { fehler: string[]; hinweise: string[] };

/** Was fehlt vor dem Start (fehler blockieren) — heuteIso = Datum, kz = Liste der roten/Kurzzeit-KZ. */
export function startPruefen(f: Fahrt, fz: FahrzeugKurz, kz: RotesKz[], heuteIso: string): Pruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const eigen = f.art === 'ueberfuehrung';
  if (!f.fahrer_name?.trim()) fehler.push('Name des Fahrers fehlt.');
  if (!eigen && !f.fahrer_anschrift?.trim()) fehler.push('Anschrift des Fahrers fehlt.');
  if (!f.fs_geprueft) fehler.push('Führerschein nicht als geprüft markiert.');
  if (!f.fs_klasse?.trim()) fehler.push('Führerscheinklasse fehlt.');
  if (f.fs_gueltig_bis && f.fs_gueltig_bis.slice(0, 10) < heuteIso.slice(0, 10)) fehler.push('Der Führerschein ist abgelaufen.');
  if (f.km_start === null || f.km_start === undefined) fehler.push('Kilometerstand bei Übergabe fehlt.');
  else if (fz.km_stand !== null && fz.km_stand !== undefined && f.km_start < fz.km_stand) hinweise.push(`Kilometerstand liegt unter dem Stand in der Akte (${fz.km_stand.toLocaleString('de-DE')} km) — bitte prüfen.`);
  if (!f.tank_start) fehler.push('Tankstand bei Übergabe fehlt.');
  if (!f.ende_geplant) fehler.push('Geplante Rückgabe fehlt.');
  else if (f.start_am && f.ende_geplant <= f.start_am) fehler.push('Die geplante Rückgabe liegt vor dem Start.');
  if (f.kennzeichen_art === 'eigen') {
    if (!fz.kennzeichen?.trim() && !f.kennzeichen?.trim()) fehler.push('Das Fahrzeug hat kein Kennzeichen — rotes oder Kurzzeitkennzeichen wählen.');
  } else {
    const k = kz.find((x) => kzNorm(x.kennzeichen) === kzNorm(f.kennzeichen) && x.art === f.kennzeichen_art);
    if (!f.kennzeichen?.trim()) fehler.push('Kennzeichen auswählen.');
    else if (!k) fehler.push('Dieses Kennzeichen ist nicht als ' + (f.kennzeichen_art === 'rot' ? 'rotes' : 'Kurzzeit-') + 'kennzeichen hinterlegt.');
    else if (!kzGueltig(k, heuteIso)) fehler.push('Das Kennzeichen ist nicht mehr gültig.');
    if (f.kennzeichen_art === 'rot') hinweise.push('Rotes Kennzeichen: Fahrt im Fahrzeugscheinheft eintragen. Die Fahrtenliste dazu liegt unter „Probefahrten".');
    if (f.kennzeichen_art === 'rot' && f.art === 'vorfuehrwagen') hinweise.push('Rote Kennzeichen sind für Prüf-, Probe- und Überführungsfahrten gedacht — für längere Überlassung lieber das eigene Kennzeichen nutzen.');
  }
  if (f.art === 'probefahrt' && !f.begleitet) hinweise.push('Unbegleitete Probefahrt: Ausweis zusätzlich prüfen und Rückgabezeit eng setzen.');
  return { fehler, hinweise };
}

export function rueckgabePruefen(f: Fahrt): Pruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  if (f.km_ende === null || f.km_ende === undefined) fehler.push('Kilometerstand bei Rückgabe fehlt.');
  else if (f.km_start !== null && f.km_ende < f.km_start) fehler.push('Kilometerstand bei Rückgabe liegt unter dem Stand bei Übergabe.');
  if (!f.tank_ende) fehler.push('Tankstand bei Rückgabe fehlt.');
  const mk = mehrKm(f);
  if (mk > 0) hinweise.push(`${mk.toLocaleString('de-DE')} km über den vereinbarten freien Kilometern.`);
  const ts = TANK.indexOf((f.tank_start ?? '') as typeof TANK[number]);
  const te = TANK.indexOf((f.tank_ende ?? '') as typeof TANK[number]);
  if (ts >= 0 && te >= 0 && te < ts) hinweise.push('Weniger Kraftstoff als bei Übergabe.');
  if (f.schaeden_ende?.trim()) hinweise.push('Bei Rückgabe sind Schäden vermerkt — Fotos in der Fahrzeugakte ablegen.');
  return { fehler, hinweise };
}

// --- Fahrtenliste je Kennzeichen ----------------------------------------------------------------
export type FahrtZeile = Fahrt & { fahrzeug: string; fin: string | null };
export function fahrtenliste(fahrten: FahrtZeile[], kennzeichen: string): FahrtZeile[] {
  const k = kzNorm(kennzeichen);
  return fahrten
    .filter((f) => f.kennzeichen_art !== 'eigen' && kzNorm(f.kennzeichen) === k && f.status !== 'storniert' && f.status !== 'geplant')
    .sort((a, b) => String(a.start_am ?? '').localeCompare(String(b.start_am ?? '')));
}

// --- Unterlagen ------------------------------------------------------------------------------------
function de(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
function deZeit(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return de(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return de(iso);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}
function km(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${n.toLocaleString('de-DE')} km`;
}
function geld(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function firmaZeilen(f: Firmenkopf | null): string[] {
  if (!f || !f.name) return ['______________________________'];
  return [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(' '), [f.telefon, f.email].filter(Boolean).join(' · ')]
    .filter((x): x is string => !!x && x.trim() !== '');
}

export type FahrtDok = 'vereinbarung' | 'rueckgabe';
export const FAHRT_DOKS: { key: FahrtDok; label: string }[] = [
  { key: 'vereinbarung', label: 'Vereinbarung und Übergabe' },
  { key: 'rueckgabe', label: 'Rückgabeprotokoll' },
];

export function fahrtDokument(art: FahrtDok, f: Fahrt, fz: FahrzeugKurz, firma: Firmenkopf | null, heuteIso: string): DokInhalt {
  const kzText = f.kennzeichen_art === 'eigen'
    ? (f.kennzeichen?.trim() || fz.kennzeichen || '—')
    : `${kzNorm(f.kennzeichen) || '—'} (${f.kennzeichen_art === 'rot' ? 'rotes Kennzeichen' : 'Kurzzeitkennzeichen'})`;
  const fahrzeug: [string, string][] = [
    ['Fahrzeug', [fz.marke, fz.modell].filter(Boolean).join(' ') || '—'],
    ['FIN', fz.fin ?? '—'],
    ['Kennzeichen', kzText],
    ['Interne Nummer', fz.interne_nr ?? '—'],
  ];
  const fahrer = [f.fahrer_name, ...(f.fahrer_anschrift ?? '').split(/\n+/), [f.fahrer_tel, f.fahrer_email].filter(Boolean).join(' · ')]
    .filter((x): x is string => !!x && x.trim() !== '');
  const kopf = {
    nr: f.nr ?? '—', datum: de(heuteIso),
    links: { titel: 'Betrieb', zeilen: firmaZeilen(firma) },
    rechts: { titel: f.art === 'ueberfuehrung' ? 'Fahrer' : 'Fahrer / Nutzer', zeilen: fahrer.length ? fahrer : ['______________________________'] },
  };

  if (art === 'rueckgabe') {
    const g = gefahren(f);
    return {
      ...kopf,
      titel: `Rückgabeprotokoll ${artLabel(f.art)}`,
      abschnitte: [
        { titel: 'Fahrzeug', zeilen: fahrzeug },
        {
          titel: 'Übergabe und Rückgabe',
          zeilen: [
            ['Übergeben am', deZeit(f.start_am)], ['Zurück am', deZeit(f.rueck_am)],
            ['Kilometer bei Übergabe', km(f.km_start)], ['Kilometer bei Rückgabe', km(f.km_ende)],
            ['Gefahren', g === null ? '—' : km(g)],
            ...(f.km_frei !== null && f.km_frei !== undefined ? [['Davon über den freien Kilometern', km(mehrKm(f))] as [string, string]] : []),
            ['Tank bei Übergabe', f.tank_start ?? '—'], ['Tank bei Rückgabe', f.tank_ende ?? '—'],
          ],
        },
        { titel: 'Schäden', zeilen: [['Bei Übergabe', f.schaeden_start?.trim() || 'keine erfasst'], ['Bei Rückgabe', f.schaeden_ende?.trim() || 'keine neuen erfasst']] },
      ],
      unterschriften: ['Betrieb (Rücknahme)', 'Fahrer / Nutzer'],
    };
  }

  const text: string[] = [];
  if (f.art === 'ueberfuehrung') {
    text.push('Die Fahrt dient ausschließlich der Überführung des Fahrzeugs im Auftrag des Betriebs.');
  } else {
    text.push(`Der Betrieb überlässt dem Fahrer das Fahrzeug unentgeltlich zur ${f.art === 'ersatzwagen' ? 'Nutzung als Ersatzwagen' : f.art === 'vorfuehrwagen' ? 'Erprobung (Vorführwagen)' : 'Probefahrt'} bis zum vereinbarten Rückgabezeitpunkt.`);
    text.push('Der Fahrer fährt das Fahrzeug nur selbst, nicht unter Alkohol- oder Drogeneinfluss, beachtet die Verkehrsregeln und gibt das Fahrzeug pünktlich, im übernommenen Zustand und mit allen Schlüsseln und Papieren zurück.');
    text.push('Ordnungs- und Bußgelder während der Nutzung trägt der Fahrer.');
    text.push(f.selbstbeteiligung !== null && f.selbstbeteiligung !== undefined && f.selbstbeteiligung > 0
      ? `Bei einem vom Fahrer verschuldeten Schaden haftet er bis zur Höhe der Selbstbeteiligung der Fahrzeugversicherung von ${geld(f.selbstbeteiligung)}, bei Vorsatz und grober Fahrlässigkeit unbeschränkt.`
      : 'Bei einem vom Fahrer verschuldeten Schaden gelten die gesetzlichen Regeln.');
    if (f.km_frei !== null && f.km_frei !== undefined) text.push(`Vereinbart sind höchstens ${km(f.km_frei)}.`);
  }
  return {
    ...kopf,
    titel: f.art === 'ueberfuehrung' ? 'Überführungsfahrt' : `Vereinbarung ${artLabel(f.art)}`,
    abschnitte: [
      { titel: 'Fahrzeug', zeilen: fahrzeug },
      {
        titel: 'Führerschein',
        zeilen: [['Vorgelegt und geprüft', f.fs_geprueft ? 'ja' : 'nein'], ['Klasse', f.fs_klasse?.trim() || '—'], ['Gültig bis', f.fs_gueltig_bis ? de(f.fs_gueltig_bis) : 'unbefristet bzw. nicht angegeben']],
      },
      {
        titel: 'Übergabe',
        zeilen: [
          ['Übergabe', deZeit(f.start_am)], ['Rückgabe spätestens', deZeit(f.ende_geplant)],
          ['Kilometer bei Übergabe', km(f.km_start)], ['Tank bei Übergabe', f.tank_start ?? '—'],
          ['Vorhandene Schäden', f.schaeden_start?.trim() || 'keine erfasst'],
          ...(f.art === 'probefahrt' ? [['Begleitet', f.begleitet ? 'ja' : 'nein'] as [string, string]] : []),
        ],
      },
      { titel: 'Vereinbarung', text },
    ],
    unterschriften: ['Betrieb', 'Fahrer / Nutzer'],
  };
}

export function fahrtDateiName(art: FahrtDok, nr: string | null): string {
  const name = FAHRT_DOKS.find((d) => d.key === art)?.label ?? art;
  return `${name}-${nr ?? 'Fahrt'}.pdf`.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9.-]+/g, '-');
}

/** Fahrtenliste eines roten Kennzeichens als Dokument (für das Fahrzeugscheinheft). */
export function fahrtenlisteDokument(kennzeichen: string, zeilen: FahrtZeile[], firma: Firmenkopf | null, heuteIso: string): DokInhalt {
  return {
    titel: `Fahrtenliste ${kzNorm(kennzeichen)}`,
    nr: kzNorm(kennzeichen), datum: de(heuteIso),
    links: { titel: 'Betrieb', zeilen: firmaZeilen(firma) },
    rechts: { titel: 'Zeitraum', zeilen: zeilen.length ? [`${de(zeilen[0].start_am)} bis ${de(zeilen[zeilen.length - 1].rueck_am ?? zeilen[zeilen.length - 1].start_am)}`, `${zeilen.length} Fahrten`] : ['keine Fahrten'] },
    abschnitte: zeilen.map((z) => ({
      titel: `${z.nr ?? '—'} · ${deZeit(z.start_am)}`,
      zeilen: [
        ['Fahrzeug', `${z.fahrzeug}${z.fin ? ` · FIN ${z.fin}` : ''}`], ['Art', artLabel(z.art)], ['Fahrer', z.fahrer_name ?? '—'],
        ['Zurück', deZeit(z.rueck_am)], ['Kilometer', `${km(z.km_start)} → ${km(z.km_ende)}`],
      ] as [string, string][],
    })),
    unterschriften: [],
  };
}
