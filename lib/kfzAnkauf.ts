// ============================================================================
// ARGONAUT OS · lib/kfzAnkauf.ts — Paket 263 (07.10.2026) · K4 Ankauf und Bewertung (Teil 1)
//
// Reine Logik für den Fahrzeug-Ankauf (Tabelle kfz_ankauf): Prüfprotokoll,
// Schäden mit Richtwerten, Bewertung (höchster sinnvoller Ankaufspreis),
// Übernahme in den Handelsbestand.
//
// GRUNDSÄTZE
// - Nichts wird erfunden: ohne Zielverkaufspreis gibt es keinen Ankaufspreis.
// - Die Richtwerte für Schäden sind STARTWERTE. Der Betrieb stellt sie unter
//   „⚙ Richtwerte" auf seine eigenen Preise ein; ein am Schaden eingetragener
//   Betrag gewinnt immer.
// - Die Bewertung ist eine Richtrechnung (Steuersatz 19 %), keine Steuerberatung.
//   Die genaue Kalkulation je Fahrzeug folgt mit K5, die Rechnung mit K7.
//
// Nur Import der zentralen Rundung (lib/zahlen), KEINE Hooks, keine
// Systemuhr — „heute" und die Zeit kommen als Parameter. Node-testbar.
// Teil 2 (P264): Ankaufschein als PDF, Online-Ankaufformular, Inzahlungnahme
// am Verkauf (K6).
// ============================================================================

import { centRunden, leseZahl } from './zahlen';

export const UST_SATZ = 19;

// --- Status ------------------------------------------------------------------
export const ANKAUF_STATUS: { key: string; label: string; farbe: 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'dim' }[] = [
  { key: 'offen', label: 'In Bewertung', farbe: 'info' },
  { key: 'angeboten', label: 'Angebot abgegeben', farbe: 'gold' },
  { key: 'angekauft', label: 'Angekauft', farbe: 'ok' },
  { key: 'abgelehnt', label: 'Nicht angekauft', farbe: 'dim' },
];

export const QUELLEN: { key: string; label: string }[] = [
  { key: 'hof', label: 'Auf dem Hof' },
  { key: 'inzahlungnahme', label: 'Inzahlungnahme' },
  { key: 'telefon', label: 'Telefon / E-Mail' },
  { key: 'online', label: 'Online-Formular' },
];

// --- Prüfprotokoll -------------------------------------------------------------
export type Pruefstand = 'ok' | 'mangel' | 'offen';

export const PRUEFPUNKTE: { gruppe: string; punkte: { key: string; name: string }[] }[] = [
  { gruppe: 'Außen', punkte: [
    { key: 'lack', name: 'Lack und Karosserie' },
    { key: 'spaltmasse', name: 'Spaltmaße gleichmäßig' },
    { key: 'scheiben', name: 'Scheiben und Spiegel' },
    { key: 'beleuchtung', name: 'Beleuchtung' },
    { key: 'reifen', name: 'Reifen (Profil, Alter)' },
    { key: 'felgen', name: 'Felgen' },
  ] },
  { gruppe: 'Innen', punkte: [
    { key: 'sitze', name: 'Sitze und Polster' },
    { key: 'himmel', name: 'Dachhimmel und Teppich' },
    { key: 'anzeigen', name: 'Anzeigen und Warnleuchten' },
    { key: 'klima', name: 'Klima und Heizung' },
    { key: 'elektrik', name: 'Fenster, Schiebedach, Elektrik' },
    { key: 'geruch', name: 'Geruch (Rauch, Tier)' },
  ] },
  { gruppe: 'Technik', punkte: [
    { key: 'motor', name: 'Motor (Geräusch, Ölverlust)' },
    { key: 'getriebe', name: 'Getriebe und Kupplung' },
    { key: 'bremsen', name: 'Bremsen' },
    { key: 'fahrwerk', name: 'Fahrwerk und Lenkung' },
    { key: 'fehlerspeicher', name: 'Fehlerspeicher ausgelesen' },
    { key: 'probefahrt', name: 'Probefahrt' },
  ] },
  { gruppe: 'Unterlagen', punkte: [
    { key: 'zb1', name: 'Zulassungsbescheinigung Teil I' },
    { key: 'zb2', name: 'Zulassungsbescheinigung Teil II' },
    { key: 'serviceheft', name: 'Serviceheft / digitaler Nachweis' },
    { key: 'hu_bericht', name: 'HU-Bericht' },
    { key: 'schluessel', name: 'Alle Schlüssel' },
    { key: 'rechnungen', name: 'Rechnungen / Belege' },
  ] },
];

export const PRUEF_KEYS: string[] = PRUEFPUNKTE.flatMap((g) => g.punkte.map((p) => p.key));

/** Nur bekannte Punkte und erlaubte Werte behalten (Daten aus der Datenbank sind jsonb). */
export function pruefBereinigen(roh: unknown): Record<string, Pruefstand> {
  const aus: Record<string, Pruefstand> = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus;
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (PRUEF_KEYS.includes(k) && (v === 'ok' || v === 'mangel')) aus[k] = v;
  }
  return aus;
}

export function pruefStand(roh: unknown): { ok: number; mangel: number; offen: number; gesamt: number; prozent: number } {
  const p = pruefBereinigen(roh);
  const gesamt = PRUEF_KEYS.length;
  const ok = Object.values(p).filter((x) => x === 'ok').length;
  const mangel = Object.values(p).filter((x) => x === 'mangel').length;
  const geprueft = ok + mangel;
  return { ok, mangel, offen: gesamt - geprueft, gesamt, prozent: Math.round((geprueft / gesamt) * 100) };
}

// --- Schäden ---------------------------------------------------------------------
export const BEREICHE: string[] = [
  'Stoßfänger vorn', 'Motorhaube', 'Frontscheibe', 'Kotflügel vorn links', 'Kotflügel vorn rechts',
  'Tür vorn links', 'Tür vorn rechts', 'Tür hinten links', 'Tür hinten rechts',
  'Schweller links', 'Schweller rechts', 'Seitenwand hinten links', 'Seitenwand hinten rechts',
  'Dach', 'Heckklappe / Kofferraum', 'Stoßfänger hinten', 'Außenspiegel',
  'Felge vorn links', 'Felge vorn rechts', 'Felge hinten links', 'Felge hinten rechts',
  'Innenraum', 'Motor / Technik', 'Unterboden', 'Sonstiges',
];

export type Stufe = 'leicht' | 'mittel' | 'stark';
export const STUFEN: { key: Stufe; label: string }[] = [
  { key: 'leicht', label: 'leicht' }, { key: 'mittel', label: 'mittel' }, { key: 'stark', label: 'stark' },
];

export const SCHADEN_ARTEN: { key: string; name: string }[] = [
  { key: 'kratzer', name: 'Kratzer' },
  { key: 'delle', name: 'Delle / Beule' },
  { key: 'steinschlag', name: 'Steinschlag' },
  { key: 'lack', name: 'Lackschaden' },
  { key: 'riss', name: 'Riss / Bruch' },
  { key: 'rost', name: 'Rost' },
  { key: 'felge', name: 'Felge / Bordstein' },
  { key: 'glas', name: 'Glasschaden' },
  { key: 'innen', name: 'Verschleiß innen' },
  { key: 'technik', name: 'Technischer Mangel' },
];

export type Richtwerte = Record<string, [number, number, number]>;

/**
 * STARTWERTE (netto, €) je Schadensart für leicht / mittel / stark.
 * Unverbindlich — der Betrieb stellt sie auf seine Preise ein (modul_einstellung
 * „kfz-ankauf", Feld richtwerte). Am Schaden eingetragene Beträge gewinnen.
 */
export const RICHTWERTE_START: Richtwerte = {
  kratzer: [80, 250, 450],
  delle: [90, 250, 600],
  steinschlag: [60, 150, 350],
  lack: [250, 450, 800],
  riss: [150, 400, 900],
  rost: [200, 500, 1200],
  felge: [80, 150, 300],
  glas: [90, 350, 900],
  innen: [80, 200, 500],
  technik: [150, 600, 2000],
};

/** Startwerte + Einstellungen des Betriebs (nur gültige, nicht negative Zahlen). */
export function richtwerteMit(eigene: unknown): Richtwerte {
  const aus: Richtwerte = {};
  for (const [k, v] of Object.entries(RICHTWERTE_START)) aus[k] = [...v] as [number, number, number];
  if (!eigene || typeof eigene !== 'object' || Array.isArray(eigene)) return aus;
  for (const [k, v] of Object.entries(eigene as Record<string, unknown>)) {
    if (!aus[k] || !Array.isArray(v)) continue;
    for (let i = 0; i < 3; i++) {
      const n = Number(v[i]);
      if (v[i] !== null && v[i] !== '' && Number.isFinite(n) && n >= 0) aus[k][i] = centRunden(n);
    }
  }
  return aus;
}

export type Schaden = {
  id: string;
  bereich: string;
  art: string;
  stufe: Stufe;
  kosten: number | null;   // eigener Betrag netto; null = Richtwert
  notiz: string;
  fotos: string[];         // Pfade im Speicherordner fahrzeug-medien
};

const STUFE_INDEX: Record<Stufe, number> = { leicht: 0, mittel: 1, stark: 2 };

export function schadenBereinigen(roh: unknown): Schaden[] {
  if (!Array.isArray(roh)) return [];
  const aus: Schaden[] = [];
  for (const x of roh.slice(0, 100)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const art = SCHADEN_ARTEN.some((a) => a.key === o.art) ? String(o.art) : 'kratzer';
    const stufe: Stufe = o.stufe === 'mittel' || o.stufe === 'stark' ? o.stufe : 'leicht';
    const k = o.kosten === null || o.kosten === undefined || o.kosten === '' ? null : Number(o.kosten);
    aus.push({
      id: String(o.id ?? '').slice(0, 40) || `s${aus.length + 1}`,
      bereich: String(o.bereich ?? 'Sonstiges').slice(0, 60),
      art,
      stufe,
      kosten: k !== null && Number.isFinite(k) && k >= 0 ? centRunden(k) : null,
      notiz: String(o.notiz ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 300),
      fotos: Array.isArray(o.fotos) ? o.fotos.map(String).filter((p) => p && !p.includes('..')).slice(0, 10) : [],
    });
  }
  return aus;
}

/** Kosten eines Schadens: eigener Betrag, sonst Richtwert. */
export function schadenKosten(s: Pick<Schaden, 'art' | 'stufe' | 'kosten'>, rw: Richtwerte): number {
  if (s.kosten !== null && Number.isFinite(s.kosten)) return centRunden(Math.max(0, s.kosten));
  const r = rw[s.art];
  return r ? r[STUFE_INDEX[s.stufe] ?? 0] : 0;
}

export function schadenSumme(liste: Pick<Schaden, 'art' | 'stufe' | 'kosten'>[], rw: Richtwerte): number {
  return centRunden(liste.reduce((s, x) => s + schadenKosten(x, rw), 0));
}

// --- Bewertung -------------------------------------------------------------------
export type BewertungEingabe = {
  zielVk: number | null;          // geplanter Verkaufspreis brutto
  schaeden: number;               // Summe Schäden netto
  aufbereitung: number | null;    // netto
  sonstige: number | null;        // netto (HU, Service, Überführung …)
  standtagePlan: number | null;
  standkostenTag: number | null;
  marge: number | null;           // gewünschter Gewinn netto
  verkaeuferArt: string | null;   // 'privat' | 'gewerblich' | 'gewerblich_25a'
};

export type Bewertung = {
  besteuerung: '25a' | 'regel';
  kosten: number;                 // alle Kosten netto inkl. Standkosten
  standkosten: number;
  maxAnkauf: number | null;       // höchster sinnvoller Ankaufspreis (25a: Zahlbetrag; Regel: netto)
  maxAnkaufBrutto: number | null; // nur Regelsteuer: netto + 19 %
  lohntSich: boolean | null;
  rechenweg: string[];
};

function n0(x: number | null | undefined): number {
  return x !== null && x !== undefined && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Welche Besteuerung folgt aus dem Verkäufer? Privat oder Händler mit § 25a -> 25a; Händler mit ausgewiesener USt -> Regel. */
export function besteuerungAus(verkaeuferArt: string | null | undefined): '25a' | 'regel' {
  return verkaeuferArt === 'gewerblich' ? 'regel' : '25a';
}

/**
 * Höchster sinnvoller Ankaufspreis, damit nach allen Kosten die gewünschte Marge bleibt.
 *
 * § 25a (Kauf von Privat oder differenzbesteuert): Umsatzsteuer nur auf die Differenz
 *   VK − EK (19/119 davon). Gewinn = VK − (VK − EK) × 19/119 − EK − Kosten
 *   ⇒ EK = VK − (Kosten + Marge) × 1,19   (Kosten netto, Vorsteuer daraus abziehbar)
 * Regelsteuer (Kauf mit ausgewiesener USt): EK netto = VK / 1,19 − Kosten − Marge.
 *
 * Ohne Zielverkaufspreis: null (es wird nichts geschätzt).
 */
export function bewertung(e: BewertungEingabe): Bewertung {
  const besteuerung = besteuerungAus(e.verkaeuferArt);
  const faktor = 1 + UST_SATZ / 100;
  const standkosten = centRunden(n0(e.standtagePlan) * n0(e.standkostenTag));
  const kosten = centRunden(n0(e.schaeden) + n0(e.aufbereitung) + n0(e.sonstige) + standkosten);
  const marge = n0(e.marge);
  const vk = e.zielVk !== null && Number.isFinite(e.zielVk) && e.zielVk > 0 ? e.zielVk : null;
  const rechenweg: string[] = [];
  if (vk === null) {
    return { besteuerung, kosten, standkosten, maxAnkauf: null, maxAnkaufBrutto: null, lohntSich: null, rechenweg: ['Ohne geplanten Verkaufspreis gibt es keinen Ankaufspreis.'] };
  }
  let roh: number;
  if (besteuerung === '25a') {
    roh = vk - (kosten + marge) * faktor;
    rechenweg.push(`§ 25a: ${fmt(vk)} − (${fmt(kosten)} Kosten + ${fmt(marge)} Marge) × 1,19`);
  } else {
    roh = vk / faktor - kosten - marge;
    rechenweg.push(`Regelsteuer: ${fmt(vk)} ÷ 1,19 − ${fmt(kosten)} Kosten − ${fmt(marge)} Marge`);
  }
  const lohntSich = roh > 0;
  const maxAnkauf = lohntSich ? Math.floor(centRunden(roh) / 10) * 10 : 0;   // abrunden auf volle 10 €
  const maxAnkaufBrutto = besteuerung === 'regel' && lohntSich ? centRunden(maxAnkauf * faktor) : null;
  rechenweg.push(lohntSich ? `= höchstens ${fmt(maxAnkauf)}${besteuerung === 'regel' ? ` netto (${fmt(maxAnkaufBrutto)} brutto)` : ''}, auf volle 10 € abgerundet` : 'Bei diesen Kosten bleibt keine Marge. Verkaufspreis prüfen oder Ankauf ablehnen.');
  return { besteuerung, kosten, standkosten, maxAnkauf, maxAnkaufBrutto, lohntSich, rechenweg };
}

/** Angebot gegen die Bewertung: grün bis Höchstpreis, gelb bis 5 % darüber, sonst rot. */
export function angebotAmpel(angebot: number | null, maxAnkauf: number | null): { stufe: 'ok' | 'warn' | 'bad' | 'dim'; text: string } {
  if (angebot === null || !Number.isFinite(angebot) || angebot <= 0) return { stufe: 'dim', text: 'Noch kein Angebot eingetragen.' };
  if (maxAnkauf === null) return { stufe: 'dim', text: 'Zum Vergleich fehlt der geplante Verkaufspreis.' };
  if (angebot <= maxAnkauf) return { stufe: 'ok', text: `Im Rahmen: ${fmt(maxAnkauf - angebot)} unter dem Höchstpreis.` };
  const ueber = angebot - maxAnkauf;
  if (maxAnkauf > 0 && ueber <= maxAnkauf * 0.05) return { stufe: 'warn', text: `${fmt(ueber)} über dem Höchstpreis — die Marge wird kleiner.` };
  return { stufe: 'bad', text: `${fmt(ueber)} über dem Höchstpreis — so bleibt die gewünschte Marge nicht.` };
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

// --- Nummer und Übernahme in den Bestand -----------------------------------------
export function naechsteAnkaufNr(vorhanden: (string | null)[]): string {
  let max = 0;
  for (const n of vorhanden) {
    const m = String(n ?? '').match(/^A-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `A-${String(max + 1).padStart(4, '0')}`;
}

export type AnkaufFuerBestand = {
  nr: string | null;
  marke: string | null; modell: string | null; variante: string | null;
  fin: string | null; kennzeichen: string | null; erstzulassung: string | null;
  km_stand: number | null; leistung_kw: number | null; kraftstoff: string | null; farbe: string | null;
  vorbesitzer: number | null; hu_bis: string | null;
  unfall_angabe: string | null; unfall_text: string | null;
  verkaeufer_art: string | null;
  ankaufpreis: number | null; ziel_vk: number | null;
  schaeden: unknown; aufbereitung: number | null;
  // Paket 308: DAT/Schwacke-Werte am Ankauf gehen mit in den Bestand
  bewertung_anbieter?: string | null; bewertung_ek?: number | null; bewertung_vk?: number | null; bewertung_am?: string | null; bewertung_url?: string | null;
};

/**
 * Datensatz für kfz_bestand aus einem angekauften Fahrzeug.
 * EK = Ankaufspreis (bei Regelsteuer netto). Mit Schäden oder Aufbereitung
 * startet das Fahrzeug „In Aufbereitung", sonst „Im Bestand".
 * Die Vorschaden-Angabe des Verkäufers wird übernommen, nie geschönt.
 */
export function zuBestand(a: AnkaufFuerBestand, heuteIso: string): Record<string, unknown> {
  const schaeden = schadenBereinigen(a.schaeden);
  const vorschaden = a.unfall_angabe === 'ja' ? 'ja' : a.unfall_angabe === 'keine_bekannt' ? 'keine_bekannt' : 'unbekannt';
  return {
    status: schaeden.length || n0(a.aufbereitung) > 0 ? 'aufbereitung' : 'bestand',
    marke: a.marke, modell: a.modell, variante: a.variante,
    fin: a.fin, kennzeichen: a.kennzeichen, erstzulassung: a.erstzulassung,
    km_stand: a.km_stand, leistung_kw: a.leistung_kw, kraftstoff: a.kraftstoff, farbe: a.farbe,
    vorbesitzer: a.vorbesitzer, hu_bis: a.hu_bis,
    vorschaden, vorschaden_text: vorschaden === 'ja' ? (a.unfall_text || null) : null,
    eingang_am: heuteIso.slice(0, 10),
    ek_netto: a.ankaufpreis !== null && Number.isFinite(a.ankaufpreis) && a.ankaufpreis >= 0 ? centRunden(a.ankaufpreis) : null,
    vk_brutto: a.ziel_vk !== null && Number.isFinite(a.ziel_vk) && a.ziel_vk > 0 ? centRunden(a.ziel_vk) : null,
    besteuerung: besteuerungAus(a.verkaeufer_art),
    notiz: a.nr ? `Aus Ankauf ${a.nr}` : 'Aus Ankauf',
    ...(a.bewertung_ek != null || a.bewertung_vk != null ? {
      bewertung_anbieter: a.bewertung_anbieter ?? 'sonstige', bewertung_ek: a.bewertung_ek ?? null, bewertung_vk: a.bewertung_vk ?? null,
      bewertung_am: a.bewertung_am ?? null, bewertung_url: a.bewertung_url ?? null,
    } : {}),
  };
}

/** Speicherpfad eines Schadenfotos: <Betrieb>/ankauf/<Ankauf>/<Zeit>-<Zufall>.<endung>. */
export function schadenFotoPfad(betrieb: string, ankaufId: string, endung: string, jetztMs: number, zufall: string): string | null {
  const ok = (x: string) => /^[0-9a-f-]{8,64}$/i.test(x);
  if (!ok(betrieb) || !ok(ankaufId)) return null;
  const e = String(endung || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const z = String(zufall || '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || '0';
  return `${betrieb}/ankauf/${ankaufId}/${Math.max(0, Math.floor(jetztMs))}-${z}.${e}`;
}

// ============================================================================
// Paket 264 · K4 Teil 2: Ankaufschein und Online-Ankaufformular
// ============================================================================

/** Einstellungs-Modul (modul_einstellung) für Richtwerte und Online-Formular. */
export const ANKAUF_MODUL = 'kfz-ankauf';

/** Öffentliche Kennung des Online-Formulars: 24 Zeichen a–z, 0–9 (nicht erratbar, keine Betriebs-ID im Link). */
export function kennungGueltig(k: unknown): k is string {
  return typeof k === 'string' && /^[a-z0-9]{24}$/.test(k);
}

/** Kennung aus Zufallsbytes (hex/beliebig) bilden; zu wenig Zufall -> null. */
export function neueKennung(zufall: string): string | null {
  const z = String(zufall || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return z.length >= 24 ? z.slice(0, 24) : null;
}

/** Online-Einstellung aus modul_einstellung lesen (nur gültige Werte). */
export function onlineEinstellung(einst: unknown): { aktiv: boolean; kennung: string | null } {
  const o = einst && typeof einst === 'object' ? (einst as Record<string, unknown>).online : null;
  if (!o || typeof o !== 'object') return { aktiv: false, kennung: null };
  const r = o as Record<string, unknown>;
  const kennung = kennungGueltig(r.kennung) ? r.kennung : null;
  return { aktiv: r.aktiv === true && kennung !== null, kennung };
}

function feld(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const MAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;

/**
 * Eingabe aus dem Online-Formular prüfen und in einen kfz_ankauf-Datensatz
 * übersetzen (ohne owner_user_id — den setzt die Route aus der Kennung).
 * Pflicht: Name, E-Mail oder Telefon, Marke, Modell, Kilometer, Zustimmung Datenschutz.
 */
export function onlineEingabePruefen(roh: unknown, jahr: number): { ok: true; daten: Record<string, unknown> } | { ok: false; fehler: string } {
  if (!roh || typeof roh !== 'object') return { ok: false, fehler: 'Ungültige Anfrage.' };
  const b = roh as Record<string, unknown>;
  const name = feld(b.name, 120);
  const email = feld(b.email, 160);
  const telefon = feld(b.telefon, 40);
  const marke = feld(b.marke, 60);
  const modell = feld(b.modell, 80);
  if (!name) return { ok: false, fehler: 'Bitte geben Sie Ihren Namen an.' };
  if (!email && !telefon) return { ok: false, fehler: 'Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.' };
  if (email && !MAIL_RE.test(email)) return { ok: false, fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' };
  if (telefon && !/^[+0-9 ()/-]{5,40}$/.test(telefon)) return { ok: false, fehler: 'Bitte prüfen Sie die Telefonnummer.' };
  if (!marke || !modell) return { ok: false, fehler: 'Bitte geben Sie Marke und Modell an.' };
  const kmRoh = leseZahl(b.km) ?? NaN;
  if (!Number.isFinite(kmRoh) || kmRoh < 0 || kmRoh > 2000000) return { ok: false, fehler: 'Bitte geben Sie den Kilometerstand an.' };
  if (b.datenschutz !== true) return { ok: false, fehler: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.' };

  let erstzulassung: string | null = null;
  const ez = feld(b.erstzulassung, 10);
  if (ez) {
    const m1 = ez.match(/^(\d{1,2})[./](\d{4})$/);
    const m2 = ez.match(/^(\d{4})-(\d{2})$/);
    const mm = m1 ? Number(m1[1]) : m2 ? Number(m2[2]) : NaN;
    const jj = m1 ? Number(m1[2]) : m2 ? Number(m2[1]) : NaN;
    if (!(mm >= 1 && mm <= 12 && jj >= 1900 && jj <= jahr)) return { ok: false, fehler: 'Erstzulassung bitte als MM/JJJJ angeben, z. B. 03/2019.' };
    erstzulassung = `${jj}-${String(mm).padStart(2, '0')}-01`;
  }
  const fin = (feld(b.fin, 30) ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (fin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(fin)) return { ok: false, fehler: 'Die FIN hat 17 Zeichen (ohne I, O, Q). Lassen Sie das Feld sonst leer.' };
  // Paket 307: Leistung in kW (freiwillig, z. B. aus dem Fahrzeugschein P.2) — Unsinn wird verworfen, nie abgelehnt
  const kwRoh = typeof b.leistung === 'string' && b.leistung.trim() ? leseZahl(b.leistung) : null;
  const leistung_kw = kwRoh !== null && Number.isFinite(kwRoh) && Math.round(kwRoh) >= 1 && Math.round(kwRoh) <= 2000 ? Math.round(kwRoh) : null;
  const unfall = b.unfall === 'keine_bekannt' || b.unfall === 'ja' || b.unfall === 'unbekannt' ? b.unfall : 'unbekannt';
  const preis = feld(b.preis, 20);
  const preisZahl = preis ? leseZahl(preis) : null;
  const beschreibung = feld(b.beschreibung, 1500);
  const notiz = [
    preisZahl !== null && Number.isFinite(preisZahl) && preisZahl > 0 ? `Preisvorstellung des Verkäufers: ${Math.round(preisZahl).toLocaleString('de-DE')} €` : null,
    beschreibung ? `Beschreibung des Verkäufers: ${beschreibung}` : null,
  ].filter(Boolean).join('\n') || null;
  const ort = [feld(b.plz, 10), feld(b.ort, 80)].filter(Boolean).join(' ') || null;
  return {
    ok: true,
    daten: {
      status: 'offen', quelle: 'online',
      verkaeufer_art: b.gewerblich === true ? 'gewerblich' : 'privat',
      verkaeufer_name: name, verkaeufer_email: email, verkaeufer_tel: telefon, verkaeufer_anschrift: ort,
      marke, modell, variante: feld(b.variante, 80), fin: fin || null, erstzulassung,
      km_stand: Math.round(kmRoh), kraftstoff: feld(b.kraftstoff, 40), ...(leistung_kw !== null ? { leistung_kw } : {}),
      unfall_angabe: unfall, unfall_text: unfall === 'ja' ? feld(b.unfall_text, 300) : null,
      notiz,
    },
  };
}

// --- Ankaufschein ----------------------------------------------------------------
export type Firmenkopf = { name: string | null; strasse: string | null; plz: string | null; ort: string | null; telefon: string | null; email: string | null };

export type AnkaufFuerSchein = AnkaufFuerBestand & {
  verkaeufer_name: string | null; verkaeufer_firma: string | null; verkaeufer_anschrift: string | null; verkaeufer_tel: string | null; verkaeufer_email: string | null;
  schluessel: number | null; serviceheft: string | null; angekauft_am: string | null;
};

export type ScheinInhalt = {
  titel: string; nr: string; datum: string;
  ankaeufer: string[]; verkaeufer: string[];
  fahrzeug: [string, string][];
  angaben: [string, string][];
  maengel: string[];
  preis: string[];
  erklaerungen: string[];
};

const SERVICEHEFT: Record<string, string> = { lueckenlos: 'lückenlos', teilweise: 'teilweise', keins: 'keins', unbekannt: 'unbekannt' };
const UNFALL: Record<string, string> = { keine_bekannt: 'Keine Unfälle oder Vorschäden bekannt', ja: 'Ja', unbekannt: 'Nicht bekannt' };

function de(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
function geld(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Inhalt des Ankaufscheins — reine Daten, das PDF zeichnet nur.
 * Schäden erscheinen OHNE Beträge (die sind intern). Angaben, die nicht
 * erfasst sind, stehen als „—" da und werden nie geschönt.
 */
export function ankaufscheinInhalt(a: AnkaufFuerSchein, firma: Firmenkopf | null, heuteIso: string): ScheinInhalt {
  const ankaeufer = firma && firma.name
    ? [firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' '), [firma.telefon, firma.email].filter(Boolean).join(' · ')].filter((x): x is string => !!x && x.trim() !== '')
    : ['______________________________'];
  const verkaeufer = [a.verkaeufer_firma, a.verkaeufer_name, ...(a.verkaeufer_anschrift ?? '').split(/\n+/), [a.verkaeufer_tel, a.verkaeufer_email].filter(Boolean).join(' · ')]
    .filter((x): x is string => !!x && x.trim() !== '');
  const schaeden = schadenBereinigen(a.schaeden);
  const art = (k: string) => SCHADEN_ARTEN.find((x) => x.key === k)?.name ?? k;
  const preis: string[] = [];
  const p = a.ankaufpreis;
  if (p === null || !Number.isFinite(p)) preis.push('Kaufpreis: ______________ €');
  else if (a.verkaeufer_art === 'gewerblich') {
    preis.push(`Kaufpreis netto: ${geld(p)}`, `zuzüglich ${UST_SATZ} % Umsatzsteuer: ${geld(p * UST_SATZ / 100)}`, `Kaufpreis brutto: ${geld(p * (1 + UST_SATZ / 100))}`);
  } else preis.push(`Kaufpreis: ${geld(p)}`);
  return {
    titel: 'Ankaufschein',
    nr: a.nr ?? '—',
    datum: de(a.angekauft_am ?? heuteIso),
    ankaeufer,
    verkaeufer: verkaeufer.length ? verkaeufer : ['______________________________'],
    fahrzeug: [
      ['Fahrzeug', [a.marke, a.modell, a.variante].filter(Boolean).join(' ') || '—'],
      ['FIN', a.fin ?? '—'],
      ['Kennzeichen', a.kennzeichen ?? '—'],
      ['Erstzulassung', a.erstzulassung ? `${a.erstzulassung.slice(5, 7)}/${a.erstzulassung.slice(0, 4)}` : '—'],
      ['Kilometerstand laut Tacho', a.km_stand !== null && a.km_stand !== undefined ? `${a.km_stand.toLocaleString('de-DE')} km` : '—'],
      ['Leistung', a.leistung_kw ? `${a.leistung_kw} kW` : '—'],
      ['Kraftstoff', a.kraftstoff ?? '—'],
      ['Farbe', a.farbe ?? '—'],
    ],
    angaben: [
      ['Unfälle / Vorschäden', a.unfall_angabe ? (UNFALL[a.unfall_angabe] ?? '—') + (a.unfall_angabe === 'ja' && a.unfall_text ? `: ${a.unfall_text}` : '') : '—'],
      ['Anzahl Vorbesitzer', a.vorbesitzer !== null && a.vorbesitzer !== undefined ? String(a.vorbesitzer) : '—'],
      ['Nächste HU', a.hu_bis ? de(a.hu_bis) : '—'],
      ['Schlüssel übergeben', a.schluessel !== null && a.schluessel !== undefined ? String(a.schluessel) : '—'],
      ['Serviceheft', a.serviceheft ? (SERVICEHEFT[a.serviceheft] ?? '—') : '—'],
    ],
    maengel: schaeden.map((s) => `${s.bereich}: ${art(s.art)} (${s.stufe})${s.notiz ? `, ${s.notiz}` : ''}`),
    preis,
    erklaerungen: [
      'Der Verkäufer erklärt, Eigentümer des Fahrzeugs zu sein und dass es frei von Rechten Dritter ist.',
      'Die Angaben des Verkäufers oben sind nach bestem Wissen gemacht.',
      'Übergeben werden Fahrzeug, Zulassungsbescheinigung Teil I und II und die genannten Schlüssel.',
      'Die oben genannten Mängel und Schäden wurden bei der Besichtigung festgestellt und sind im Kaufpreis berücksichtigt.',
    ],
  };
}
