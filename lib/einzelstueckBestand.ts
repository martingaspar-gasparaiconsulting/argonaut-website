// ============================================================================
// ARGONAUT OS · lib/einzelstueckBestand.ts — Paket 333 (12.10.2026) · BV2b Teil 2
//
// Die Bestandsliste (app/dashboard/kfz/bestand) spricht die Sprache der Art:
// ein Bootshändler sieht „Boot", „Rumpfnummer", „Baujahr · Bh" und die
// Merkmale (Länge, Rumpf, Antrieb), ein Juwelier „Stück", „Seriennummer /
// Referenz" und keinen Zähler. Grundlage ist lib/einzelstueck.ts (Paket 332).
//
// Regeln:
//   - Art je Stück aus der Spalte art; fehlt sie (SQL p332 nicht gelaufen
//     oder Altdaten ohne Wert), gilt die Art des Betriebs, sonst „kfz".
//   - Das Formular schreibt NUR die Felder, die für die Art sichtbar sind.
//     Was ausgeblendet ist (FIN beim Boot, Kennzeichen bei Uhren, km bei
//     Maschinen), bleibt in der Datenbank unberührt — nichts still löschen.
//   - Merkmale nur über merkmaleSauber (unbekannte Schlüssel fallen weg,
//     Fehler werden gemeldet, nicht verschluckt).
//   - Ohne SQL p332 (mitArt = false) arbeitet alles wie vor P333 (Kfz).
//
// Reine Logik, keine React-Imports, keine Systemuhr („heute" als Parameter).
// ============================================================================

import { leseZahl, centRunden } from './zahlen';
import { artDef, artFuerBranche, istArt, merkmaleSauber, merkmalText, seriennrPruefen, betriebsstundenPruefen, ARTEN, type Art } from './einzelstueck';
import { finPruefen, ezText, ezAusEingabe, type Bestand } from './kfzBestand';
import type { VorlageSpalte } from './branchenVorlage';

/** Spalten, die P333 zusätzlich liest (nur mit SQL p332 vorhanden). */
export const SPALTEN_P332 = 'art, merkmale, betriebsstunden, seriennr';

export const ART_SYMBOL: Record<Art, string> = {
  kfz: '🚘', boot: '⛵', maschine: '🚜', uhr_schmuck: '⌚', kunst_antik: '🖼', fahrrad: '🚲', sonstig: '📦',
};

/** Auswahlliste für das Formular: [Schlüssel, Bezeichnung]. */
export function artAuswahl(): [Art, string][] {
  return ARTEN.map((a) => [a, artDef(a).label] as [Art, string]);
}

/** Art eines Stücks: gespeicherte Art, sonst die des Betriebs, sonst kfz. */
export function stueckArt(b: { art?: string | null } | null | undefined, betriebArt?: string | null): Art {
  if (b && istArt(b.art)) return b.art;
  return istArt(betriebArt) ? betriebArt : 'kfz';
}

/** Welche Formularfelder für die Art sichtbar sind. */
export type FormFelder = { fin: boolean; seriennr: boolean; kennzeichen: boolean; km: boolean; bh: boolean; kfzTechnik: boolean };
export function formFelder(art: unknown, mitArt: boolean): FormFelder {
  if (!mitArt) return { fin: true, seriennr: false, kennzeichen: true, km: true, bh: false, kfzTechnik: true };
  const d = artDef(art);
  return {
    fin: d.kfzTeile.fin,
    seriennr: !d.kfzTeile.fin,
    kennzeichen: d.kfzTeile.zulassung,
    km: d.begriffe.zaehler === 'km',
    bh: d.begriffe.zaehler === 'betriebsstunden',
    kfzTechnik: d.art === 'kfz',
  };
}

/** Wörter für Formular und Liste. */
export function datumLabel(art: unknown): string {
  const d = artDef(art);
  return d.art === 'kfz' ? 'Erstzulassung' : d.begriffe.datumWort;
}
export function datumPlatzhalter(art: unknown): string {
  return artDef(art).art === 'kfz' ? 'MM/JJJJ' : 'JJJJ oder MM/JJJJ';
}

/**
 * Datum aus der Eingabe. Kfz: Monat/Jahr wie bisher (ezAusEingabe).
 * Andere Arten: zusätzlich nur das Jahr („2019" → 2019-01-01), Jahr 1000–2100.
 */
export function datumAusEingabe(art: unknown, roh: string | null | undefined): string | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  if (artDef(art).art !== 'kfz') {
    const m = s.match(/^(\d{4})$/);
    if (m) { const j = Number(m[1]); return j >= 1000 && j <= 2100 ? `${m[1]}-01-01` : null; }
  }
  const iso = ezAusEingabe(s);
  if (!iso) return null;
  const j = Number(iso.slice(0, 4));
  return j >= 1000 && j <= 2100 ? iso : null;
}

/** Anzeige: Kfz MM/JJJJ; andere Arten das Jahr (Januar) bzw. MM/JJJJ. */
export function datumText(art: unknown, iso: string | null | undefined): string {
  if (artDef(art).art === 'kfz') return ezText(iso);
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return '—';
  return iso.slice(5, 7) === '01' ? iso.slice(0, 4) : `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
/** Für das Formular (Bearbeiten): gleiche Schreibweise wie die Anzeige, leer statt „—". */
export function datumFuerForm(art: unknown, iso: string | null | undefined): string {
  const t = datumText(art, iso);
  return t === '—' ? '' : t;
}

/** Zähler-Text: „18.400 km", „1.250 Bh" oder '' (Art ohne Zähler). „—" wenn unbekannt. */
export function zaehlerText(art: unknown, b: Pick<Bestand, 'km_stand'> & { betriebsstunden?: number | null }): string {
  const z = artDef(art).begriffe.zaehler;
  if (z === 'km') return typeof b.km_stand === 'number' ? `${b.km_stand.toLocaleString('de-DE')} km` : '—';
  if (z === 'betriebsstunden') return typeof b.betriebsstunden === 'number' ? `${b.betriebsstunden.toLocaleString('de-DE')} Bh` : '—';
  return '';
}

/** „03/2022 · 18.400 km", „2019 · 1.250 Bh", „1890" — für Liste, Karten und PDF. */
export function datumZaehler(art: unknown, b: Pick<Bestand, 'erstzulassung' | 'km_stand'> & { betriebsstunden?: number | null }): string {
  const z = zaehlerText(art, b);
  const d = datumText(art, b.erstzulassung);
  return z ? `${d} · ${z}` : d;
}

/** Kennung zur Anzeige: FIN bei Kfz-Arten, sonst Seriennummer (FIN als Rückfall, falls nur sie da ist). */
export function kennungText(art: unknown, b: Pick<Bestand, 'fin'> & { seriennr?: string | null }): string {
  const d = artDef(art);
  if (d.kfzTeile.fin) return b.fin ?? '—';
  return b.seriennr ?? b.fin ?? '—';
}

/** Kurzfassung der Merkmale für die Liste: höchstens n, „Länge 12,5 m · Rumpf GFK". */
export function merkmaleKurz(art: unknown, werte: Record<string, unknown> | null | undefined, n = 3): string {
  if (!werte || typeof werte !== 'object') return '';
  const d = artDef(art);
  const teile: string[] = [];
  for (const m of d.merkmale) {
    const v = (werte as Record<string, unknown>)[m.key];
    if (v === undefined || v === null || v === '' || v === false) continue;
    teile.push(m.typ === 'ja_nein' ? m.label : `${m.label} ${merkmalText(m, v)}`);
    if (teile.length >= n) break;
  }
  return teile.join(' · ');
}

/**
 * Spalten der Liste nach der Art des Betriebs: Wörter angepasst, Kennzeichen
 * nur bei Arten mit Zulassung, Merkmale-Spalte bei Arten mit Merkmalen
 * (sichtbar, solange der Chef sie nicht abgewählt hat). Ohne SQL p332 unverändert.
 */
export function spaltenNachArt(spalten: VorlageSpalte[], art: unknown, mitArt: boolean, sichtbarEinst?: Record<string, boolean> | null): VorlageSpalte[] {
  if (!mitArt) return spalten.map((s) => ({ ...s }));
  const d = artDef(art);
  if (d.art === 'kfz') return spalten.map((s) => ({ ...s }));
  const zaehler = d.begriffe.zaehler === 'km' ? ' · km' : d.begriffe.zaehler === 'betriebsstunden' ? ' · Bh' : '';
  const aus: VorlageSpalte[] = [];
  for (const s of spalten) {
    if (s.key === 'kennzeichen' && !d.kfzTeile.zulassung) continue;
    if (s.key === 'fahrzeug') { aus.push({ ...s, label: d.begriffe.einheit }); continue; }
    if (s.key === 'ez_km') { aus.push({ ...s, label: d.begriffe.datumWort + zaehler }); continue; }
    if (s.key === 'fin') { aus.push({ ...s, label: d.begriffe.ident }); continue; }
    aus.push({ ...s });
  }
  if (d.merkmale.length && !aus.some((s) => s.key === 'merkmale')) {
    const v = sichtbarEinst && typeof sichtbarEinst.merkmale === 'boolean' ? sichtbarEinst.merkmale : true;
    const pos = aus.findIndex((s) => s.key === 'fahrzeug');
    aus.splice(pos >= 0 ? pos + 1 : 0, 0, { key: 'merkmale', label: 'Merkmale', sichtbar: v });
  }
  return aus;
}

/** Suchfeld-Platzhalter in den Wörtern der Art. */
export function suchPlatzhalter(art: unknown, mitArt: boolean): string {
  if (!mitArt || artDef(art).art === 'kfz') return 'Suchen: Marke, Modell, Kennzeichen, FIN, Nr. …';
  const b = artDef(art).begriffe;
  return `Suchen: ${b.herstellerWort}, ${b.modellWort}, ${b.ident}, Nr. …`;
}

// ---------------------------------------------------------------------------
// Formular → Datenbank-Zeile
// ---------------------------------------------------------------------------

export type StueckForm = {
  art: string; marke: string; modell: string; variante: string; sparte: string; status: string;
  fin: string; seriennr: string; kennzeichen: string; ez: string; km: string; bh: string; kw: string;
  kraftstoff: string; farbe: string; farbcode: string; standort_id: string; eingang_am: string;
  ek: string; vk: string; besteuerung: string; notiz: string;
  merkmale: Record<string, string | boolean>;
};

function ganz(t: string): number | null { const n = leseZahl(t); return n === null || n < 0 ? null : Math.round(n); }
function geld(t: string): number | null { const n = leseZahl(t); return n === null || n < 0 ? null : centRunden(n); }

/**
 * Zeile für insert/update. Enthält nur die für die Art sichtbaren Felder —
 * ausgeblendete Spalten bleiben in der Datenbank, wie sie sind.
 * verkauftAmAlt: bisheriges Verkaufsdatum (beim Bearbeiten), heute: YYYY-MM-DD.
 */
export function stueckZeile(
  f: StueckForm,
  opt: { mitArt: boolean; heute: string; verkauftAmAlt?: string | null },
): { ok: true; zeile: Record<string, unknown> } | { ok: false; fehler: string } {
  const art: Art = opt.mitArt && istArt(f.art) ? f.art : 'kfz';
  const d = artDef(art);
  const sicht = formFelder(art, opt.mitArt);
  const herst = opt.mitArt ? d.begriffe.herstellerWort : 'Marke';
  const mod = opt.mitArt ? d.begriffe.modellWort : 'Modell';
  if (!f.marke.trim() && !f.modell.trim()) return { ok: false, fehler: `Bitte mindestens ${herst} oder ${mod} angeben.` };

  const zeile: Record<string, unknown> = {
    status: f.status || 'bestand', sparte: f.sparte || null, marke: f.marke.trim() || null, modell: f.modell.trim() || null,
    variante: f.variante.trim() || null, farbe: f.farbe.trim() || null,
    standort_id: f.standort_id || null, eingang_am: f.eingang_am || null,
    verkauft_am: f.status === 'verkauft' ? (opt.verkauftAmAlt ?? opt.heute) : null,
    ek_netto: geld(f.ek), vk_brutto: geld(f.vk), besteuerung: f.besteuerung || null, notiz: f.notiz.trim() || null,
  };

  if (sicht.fin) {
    const fp = finPruefen(f.fin);
    if (!fp.ok) return { ok: false, fehler: fp.fehler };
    zeile.fin = fp.fin;
  }
  if (sicht.seriennr) {
    const sp = seriennrPruefen(f.seriennr);
    if (!sp.ok) return { ok: false, fehler: sp.fehler };
    zeile.seriennr = sp.wert;
  }
  if (f.ez.trim()) {
    const iso = datumAusEingabe(art, f.ez);
    if (!iso) {
      return { ok: false, fehler: art === 'kfz' ? 'Erstzulassung bitte als Monat/Jahr eingeben, z. B. 03/2022.' : `${d.begriffe.datumWort} bitte als Jahr (z. B. 2019) oder Monat/Jahr eingeben.` };
    }
    zeile.erstzulassung = iso;
  } else zeile.erstzulassung = null;
  if (sicht.kennzeichen) zeile.kennzeichen = f.kennzeichen.trim().toUpperCase() || null;
  if (sicht.km) zeile.km_stand = ganz(f.km);
  if (sicht.bh) {
    const roh = f.bh.trim() ? leseZahl(f.bh) : null;
    if (f.bh.trim() && roh === null) return { ok: false, fehler: 'Betriebsstunden bitte als Zahl eintragen.' };
    const bp = betriebsstundenPruefen(roh);
    if (!bp.ok) return { ok: false, fehler: bp.fehler };
    zeile.betriebsstunden = bp.wert;
  }
  if (sicht.kfzTechnik) {
    zeile.leistung_kw = ganz(f.kw);
    zeile.kraftstoff = f.kraftstoff.trim() || null;
    zeile.farbcode = f.farbcode.trim() || null;
  }
  if (opt.mitArt) {
    const m = merkmaleSauber(art, f.merkmale);
    if (m.fehler.length) return { ok: false, fehler: m.fehler.join(' ') };
    zeile.art = art;
    zeile.merkmale = m.werte;
  }
  return { ok: true, zeile };
}

/** Merkmale aus der Datenbank fürs Formular (Zahlen mit Komma, ja/nein als boolean). */
export function merkmaleFuerForm(art: unknown, werte: Record<string, unknown> | null | undefined): Record<string, string | boolean> {
  const aus: Record<string, string | boolean> = {};
  if (!werte || typeof werte !== 'object') return aus;
  for (const m of artDef(art).merkmale) {
    const v = (werte as Record<string, unknown>)[m.key];
    if (v === undefined || v === null) continue;
    if (m.typ === 'ja_nein') { if (typeof v === 'boolean') aus[m.key] = v; continue; }
    aus[m.key] = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  }
  return aus;
}

// ---------------------------------------------------------------------------
// Paket 334 (BV2b Teil 3): Handelsakte nach Art
// ---------------------------------------------------------------------------

/** Reiter der Akte, die es nur für Straßenfahrzeuge (bzw. Arten mit diesem Kfz-Teil) gibt. */
export type AkteTeile = {
  energie: boolean;        // Energie und CO₂ (Pkw-EnVKV)
  probefahrt: boolean;
  tresor: boolean;         // Brief und Schlüssel, Zulassung
  hu: boolean;             // HU-Termin im Zustand
  finDienste: boolean;     // Werkstatt-Lebensakte, Fahrzeughistorie über die FIN
  bewertung: boolean;      // DAT/Schwacke
  kfzAusstattung: boolean; // Ausstattungs-Katalog für Autos
  polster: boolean;
};

export function akteTeile(art: unknown, mitArt: boolean): AkteTeile {
  if (!mitArt) return { energie: true, probefahrt: true, tresor: true, hu: true, finDienste: true, bewertung: true, kfzAusstattung: true, polster: true };
  const d = artDef(art);
  const kfz = d.art === 'kfz';
  return {
    energie: d.kfzTeile.co2,
    probefahrt: d.kfzTeile.probefahrt,
    tresor: d.kfzTeile.briefTresor,
    hu: d.kfzTeile.zulassung,
    finDienste: d.kfzTeile.fin,
    bewertung: kfz,
    kfzAusstattung: kfz,
    polster: kfz,
  };
}

/** Welche Reiter-Schlüssel ausgeblendet werden (energie, probefahrt, tresor). */
export function akteReiterAus(art: unknown, mitArt: boolean): string[] {
  const t = akteTeile(art, mitArt);
  const aus: string[] = [];
  if (!t.energie) aus.push('energie');
  if (!t.probefahrt) aus.push('probefahrt');
  if (!t.tresor) aus.push('tresor');
  return aus;
}

/** Alle Merkmale der Art für die Merkmale-Karte — auch leere, mit Kennzeichen „intern". */
export function merkmaleListe(art: unknown, werte: Record<string, unknown> | null | undefined): { key: string; label: string; text: string; intern: boolean; gesetzt: boolean }[] {
  const w = (werte && typeof werte === 'object') ? werte as Record<string, unknown> : {};
  return artDef(art).merkmale.map((m) => {
    const v = w[m.key];
    const gesetzt = v !== undefined && v !== null && v !== '';
    return { key: m.key, label: m.label, text: gesetzt ? merkmalText(m, v) : '—', intern: !m.oeffentlich, gesetzt };
  });
}

/** Zahl der gesetzten Merkmale (für die Inserats-Ampel bei Einzelstücken). */
export function merkmaleZahl(art: unknown, werte: Record<string, unknown> | null | undefined): number {
  return merkmaleListe(art, werte).filter((m) => m.gesetzt).length;
}

/** Kopfzeile der Akte: „F-0002 · 2019 · 1.250 Bh" bzw. Kfz wie bisher mit PS und Kraftstoff. */
export function akteUnterzeile(art: unknown, b: Pick<Bestand, 'interne_nr' | 'erstzulassung' | 'km_stand' | 'leistung_kw' | 'kraftstoff'> & { betriebsstunden?: number | null }, ps: number | null): string {
  const d = artDef(art);
  const teile = [b.interne_nr ?? ''];
  if (d.art === 'kfz') {
    teile.push(`EZ ${ezText(b.erstzulassung)}`);
    teile.push(typeof b.km_stand === 'number' ? `${b.km_stand.toLocaleString('de-DE')} km` : '— km');
    let s = teile.join(' · ');
    if (ps) s += ` · ${ps} PS (${b.leistung_kw} kW)`;
    if (b.kraftstoff) s += ` · ${b.kraftstoff}`;
    return s;
  }
  teile.push(`${d.begriffe.datumWort} ${datumText(art, b.erstzulassung)}`);
  const z = zaehlerText(art, b);
  if (z) teile.push(z);
  return teile.join(' · ');
}

// ---------------------------------------------------------------------------
// Paket 337 (BV2b Teil 6): Freischaltung für Händler von Einzelstücken, Wörter im Menü
// ---------------------------------------------------------------------------

/**
 * Bekommt die Branche das Modul „kfz" (Bestand, Akte, Ankauf, Verkauf, Börse) als
 * Einzelstück-Handel dazu? Nur wenn die Branche eine Einzelstück-Art hat UND in einer
 * Kategorie liegt, die das Modul nicht ohnehin hat: Handel, Kultur (Galerien),
 * Industrie nur bei Werften. Hersteller (Landtechnik) und Verleih bekommen es nicht.
 */
export function einzelstueckHandelZusatz(kategorie: string | null | undefined, branche: string | null | undefined): boolean {
  const art = artFuerBranche(branche);
  if (art === 'kfz') return false;
  const k = String(kategorie ?? '');
  if (k === 'Handel & E-Commerce' || k === 'Kultur, Soziales & Öffentliches') return true;
  if (k === 'Industrie & Produktion') return art === 'boot';
  return false;
}

/** Menü-Wort für den Eintrag /dashboard/kfz — Kfz-Betriebe behalten „🚗 KFZ-Fachpaket". */
export function kfzMenueLabel(art: unknown): string {
  const d = artDef(art);
  return d.art === 'kfz' ? '🚗 KFZ-Fachpaket' : `${ART_SYMBOL[d.art]} ${d.begriffe.titel}`;
}

/** Die Fachpaket-Startseite nach Art: Titel, Wort für den Bestand, welche Kfz-Knöpfe und ob HU/AU und Reifenhotel. */
export type HubNachArt = { titel: string; bestand: string; probefahrt: boolean; tresor: boolean; schaden: boolean; werkstatt: boolean; chefBlick: string };
export function hubNachArt(art: unknown): HubNachArt {
  const d = artDef(art);
  if (d.art === 'kfz') return { titel: '🚗 KFZ-Fachpaket', bestand: '🚘 Fahrzeugbestand (Handel)', probefahrt: true, tresor: true, schaden: true, werkstatt: true, chefBlick: '📈 Chef-Blick Fahrzeughandel' };
  return {
    titel: `${ART_SYMBOL[d.art]} ${d.begriffe.titel}`,
    bestand: `${ART_SYMBOL[d.art]} ${d.begriffe.titel}`,
    probefahrt: d.kfzTeile.probefahrt,
    tresor: d.kfzTeile.briefTresor,
    schaden: false,
    werkstatt: false,
    chefBlick: '📈 Chef-Blick Handel',
  };
}
