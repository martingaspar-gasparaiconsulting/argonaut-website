// ============================================================================
// ARGONAUT OS · lib/importBestellungen.ts — Bestellungen mit Positionen
// (Umzug Schritt 3, Paket 127, 27.09.2026)
//
// Eine Bestell-Liste aus dem Altsystem hat EINE Zeile je Position. Zeilen mit
// derselben Bestellnummer sind eine Bestellung. Diese Datei macht aus den
// geprueften Zeilen (pruefeAlles) Bestellkoepfe mit Positionen — fuer das
// Bestellwesen im ERP (Tabellen bestellungen + bestellpositionen, Lieferant
// aus lieferanten). Das Einkaufs-Modul (bestellung/bestellung_position) bleibt
// unberuehrt.
//
// Nichts wird verschluckt:
//   · verschiedene Bestelldaten in einer Bestellung -> fruehestes Datum,
//     die anderen stehen in den Notizen, dazu eine Warnung
//   · Status je Position (bestellt/teilgeliefert/geliefert) -> Liefermenge
//     und Status der Bestellung; „teilgeliefert" ohne Menge -> Warnung + Notiz
//   · Einheit ohne verknuepften Artikel -> in die Bezeichnung
//   · Gesamt weicht von Menge x Einzelpreis ab / Positionswert ungewoehnlich
//     hoch -> Warnung (nichts wird still „korrigiert")
//   · verschiedene Lieferanten unter einer Bestellnummer -> die Bestellung
//     faellt mit Grund heraus (falsch zugeordnet waere schlimmer)
//
// Reine Funktionen, keine Netzwerk-Aufrufe — node-testbar.
// ============================================================================

import { normal } from './importParser';
import { centRunden } from './zahlen';

/** Status einer Bestellung im ERP (app/dashboard/erp/bestellungen). */
export const BESTELL_STATUS = ['entwurf', 'bestellt', 'teilweise_geliefert', 'geliefert', 'storniert'] as const;
export type BestellStatus = (typeof BESTELL_STATUS)[number];

/** Status einer POSITION aus der Datei. */
export type PosStatus = 'entwurf' | 'bestellt' | 'teil' | 'geliefert' | 'storniert';

const POS_STATUS: Record<string, PosStatus> = {
  entwurf: 'entwurf', geplant: 'entwurf', vorschlag: 'entwurf',
  bestellt: 'bestellt', offen: 'bestellt', versendet: 'bestellt', bestaetigt: 'bestellt', 'auftrag bestaetigt': 'bestellt', ordered: 'bestellt', open: 'bestellt',
  teilgeliefert: 'teil', 'teilweise geliefert': 'teil', teilweise: 'teil', teillieferung: 'teil', 'teilweise geliefert ': 'teil', partial: 'teil', 'partially received': 'teil',
  geliefert: 'geliefert', erhalten: 'geliefert', eingegangen: 'geliefert', komplett: 'geliefert', erledigt: 'geliefert', vollstaendig: 'geliefert', received: 'geliefert', delivered: 'geliefert',
  storniert: 'storniert', abgebrochen: 'storniert', cancelled: 'storniert', canceled: 'storniert',
};

/** Status-Text einer Position lesen (null = unbekannt / leer). */
export function positionsStatus(roh: unknown): PosStatus | null {
  const n = normal(String(roh ?? ''));
  if (!n) return null;
  return POS_STATUS[n] ?? POS_STATUS[n.replace(/\s+/g, '')] ?? null;
}

/** Ab diesem Positionswert (netto) gibt es eine Rueckfrage-Warnung. */
export const HOHER_POSITIONSWERT = 100000;

export type BestellPosition = {
  artikelnummer: string | null;
  artikel_id: string | null;
  bezeichnung: string;
  menge: number;
  einzelpreis: number;
  menge_geliefert: number;
  position: number;
  /** Dateizeile (Excel-Zaehlung) */
  zeile: number;
};

export type BestellKopf = {
  bestellnummer: string;
  bestelldatum: string | null;
  lieferdatum_erwartet: string | null;
  status: BestellStatus;
  notizen: string | null;
  /** Verweis-Hilfsfelder fuer verknuepfeKunde (Lieferant) */
  __kunde?: string;
  __kunde2?: string;
  /** weitere Kopf-Felder aus dem Feldkatalog (exakt zugeordnete DB-Spalten) */
  extra: Record<string, unknown>;
};

export type Bestellung = {
  kopf: BestellKopf;
  positionen: BestellPosition[];
  /** alle Dateizeilen dieser Bestellung */
  zeilen: number[];
  warnungen: { zeile: number; feld: string; meldung: string }[];
};

export type Gruppierung = {
  bestellungen: Bestellung[];
  /** Bestellungen, die mit Grund herausfallen (je Dateizeile gemeldet) */
  abgelehnt: { zeilen: number[]; bestellnummer: string; grund: string }[];
};

export type ArtikelIndex = Map<string, { id: string; einheit: string | null }>;

/** Artikel des Betriebs nach Artikelnummer (klein, getrimmt). Doppelte Nummern: nicht eindeutig -> keine Verknuepfung. */
export function baueArtikelIndex(artikel: readonly { id?: unknown; artikelnummer?: unknown; einheit?: unknown }[]): ArtikelIndex {
  const index: ArtikelIndex = new Map();
  const doppelt = new Set<string>();
  for (const a of artikel) {
    const nr = String(a?.artikelnummer ?? '').trim().toLowerCase();
    if (!nr || !a?.id) continue;
    if (index.has(nr)) { doppelt.add(nr); continue; }
    index.set(nr, { id: String(a.id), einheit: a.einheit ? String(a.einheit) : null });
  }
  for (const nr of doppelt) index.delete(nr);
  return index;
}

const KOPF_FELDER = new Set(['bestellnummer', 'bestelldatum', 'lieferdatum_erwartet', 'status', 'notizen', '__kunde', '__kunde2']);
const POS_FELDER = new Set(['artikelnummer', 'bezeichnung', 'menge', 'einheit', 'einzelpreis', 'gesamt_netto', 'menge_geliefert']);

function text(v: unknown): string { return String(v ?? '').trim(); }
function zahl(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function eur(n: number): string { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function datumDe(iso: string): string { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}`; }

/** Status der Bestellung aus ihren Positionen. */
export function kopfStatus(pos: readonly { menge: number; menge_geliefert: number; status: PosStatus | null }[]): BestellStatus {
  if (pos.length === 0) return 'bestellt';
  if (pos.every((p) => p.status === 'storniert')) return 'storniert';
  const aktiv = pos.filter((p) => p.status !== 'storniert');
  if (aktiv.every((p) => p.status === 'entwurf')) return 'entwurf';
  if (aktiv.every((p) => p.menge > 0 && p.menge_geliefert >= p.menge)) return 'geliefert';
  if (aktiv.some((p) => p.menge_geliefert > 0 || p.status === 'teil' || p.status === 'geliefert')) return 'teilweise_geliefert';
  return 'bestellt';
}

/**
 * Die geprueften Saetze (eine je Datei-Zeile) zu Bestellungen gruppieren.
 * `zeilen[i]` ist die Dateizeile von `saetze[i]`. Die Reihenfolge der
 * Bestellungen folgt dem ersten Auftreten in der Datei.
 */
export function gruppiereBestellungen(
  saetze: readonly Record<string, unknown>[],
  zeilen: readonly number[],
  artikel: ArtikelIndex = new Map(),
): Gruppierung {
  const gruppen = new Map<string, { nummer: string; saetze: { s: Record<string, unknown>; zeile: number }[] }>();
  saetze.forEach((s, i) => {
    const nummer = text(s.bestellnummer);
    const k = nummer.toLowerCase();
    if (!k) return;   // Pflichtfeld — pruefeAlles laesst leere gar nicht durch
    if (!gruppen.has(k)) gruppen.set(k, { nummer, saetze: [] });
    gruppen.get(k)!.saetze.push({ s, zeile: zeilen[i] ?? 0 });
  });

  const bestellungen: Bestellung[] = [];
  const abgelehnt: Gruppierung['abgelehnt'] = [];

  for (const g of gruppen.values()) {
    const warnungen: Bestellung['warnungen'] = [];
    const notizen: string[] = [];
    const alleZeilen = g.saetze.map((x) => x.zeile);

    // Lieferant: muss in allen Zeilen gleich sein (oder leer).
    const lieferanten = [...new Set(g.saetze.map((x) => text(x.s.__kunde)).filter(Boolean).map((l) => l.toLowerCase()))];
    if (lieferanten.length > 1) {
      const namen = [...new Set(g.saetze.map((x) => text(x.s.__kunde)).filter(Boolean))];
      abgelehnt.push({ zeilen: alleZeilen, bestellnummer: g.nummer, grund: `Bestellung ${g.nummer} nennt ${namen.length} verschiedene Lieferanten (${namen.join(', ')}) — nicht übernommen, bitte in der Datei klären.` });
      continue;
    }
    const mitLieferant = g.saetze.find((x) => text(x.s.__kunde));

    // Datum: fruehestes, die anderen in die Notizen.
    const daten = [...new Set(g.saetze.map((x) => text(x.s.bestelldatum)).filter(Boolean))].sort();
    if (daten.length > 1) {
      warnungen.push({ zeile: alleZeilen[0], feld: 'Bestelldatum', meldung: `Bestellung ${g.nummer} hat ${daten.length} verschiedene Bestelldaten — übernommen: ${datumDe(daten[0])}; alle stehen in den Notizen.` });
      notizen.push(`Bestelldaten im Altsystem: ${daten.map(datumDe).join(', ')}`);
    }
    const liefer = [...new Set(g.saetze.map((x) => text(x.s.lieferdatum_erwartet)).filter(Boolean))].sort();
    if (liefer.length > 1) {
      warnungen.push({ zeile: alleZeilen[0], feld: 'Liefertermin', meldung: `Bestellung ${g.nummer} hat ${liefer.length} Liefertermine — übernommen: der späteste (${datumDe(liefer[liefer.length - 1])}).` });
      notizen.push(`Liefertermine im Altsystem: ${liefer.map(datumDe).join(', ')}`);
    }
    for (const n of new Set(g.saetze.map((x) => text(x.s.notizen)).filter(Boolean))) notizen.push(n);

    // Positionen
    const positionen: BestellPosition[] = [];
    const statusListe: { menge: number; menge_geliefert: number; status: PosStatus | null }[] = [];
    const extra: Record<string, unknown> = {};
    for (const { s, zeile } of g.saetze) {
      for (const [k, v] of Object.entries(s)) {
        if (KOPF_FELDER.has(k) || POS_FELDER.has(k) || k.startsWith('__')) continue;
        if (extra[k] === undefined && v !== '' && v !== null && v !== undefined) extra[k] = v;
      }
      const nr = text(s.artikelnummer) || null;
      const art = nr ? artikel.get(nr.toLowerCase()) ?? null : null;
      let bez = text(s.bezeichnung) || nr || '';
      if (!bez) {
        warnungen.push({ zeile, feld: 'Bezeichnung', meldung: 'Position ohne Bezeichnung und Artikelnummer — als „Position ohne Bezeichnung" übernommen.' });
        bez = 'Position ohne Bezeichnung';
      }
      const einheit = text(s.einheit);
      if (!art && einheit) bez = `${bez} (${einheit})`;
      if (nr && !art) warnungen.push({ zeile, feld: 'Artikelnummer', meldung: `Artikel „${nr}" nicht gefunden — Position ohne Artikel-Verknüpfung übernommen (Wareneingang bucht dann nicht ins Lager).` });

      const menge = zahl(s.menge) ?? 0;
      let preis = zahl(s.einzelpreis);
      const gesamt = zahl(s.gesamt_netto);
      if (preis === null && gesamt !== null && menge !== 0) {
        preis = Math.round((gesamt / menge) * 10000) / 10000;
        warnungen.push({ zeile, feld: 'Einzelpreis', meldung: `Kein Einzelpreis — aus Gesamt ${eur(gesamt)} ÷ Menge gerechnet: ${preis.toLocaleString('de-DE')} €.` });
      }
      if (preis === null) {
        warnungen.push({ zeile, feld: 'Einzelpreis', meldung: 'Kein Einzelpreis — Position mit 0,00 € übernommen, bitte nachtragen.' });
        preis = 0;
      }
      const rechnerisch = centRunden(menge * preis);
      if (gesamt !== null && Math.abs(rechnerisch - gesamt) > 0.01) {
        warnungen.push({ zeile, feld: 'Gesamt netto', meldung: `Gesamt ${eur(gesamt)} passt nicht zu Menge × Einzelpreis (${eur(rechnerisch)}) — übernommen wurden Menge und Einzelpreis.` });
      }
      if (rechnerisch >= HOHER_POSITIONSWERT) {
        warnungen.push({ zeile, feld: 'Menge', meldung: `Ungewöhnlich hoher Positionswert: ${menge.toLocaleString('de-DE')} × ${eur(preis)} = ${eur(rechnerisch)} — bitte Menge und Preis prüfen.` });
      }

      const status = positionsStatus(s.status);
      if (text(s.status) && !status) {
        warnungen.push({ zeile, feld: 'Status', meldung: `„${text(s.status)}" ist kein bekannter Status — Position als „bestellt" übernommen (der alte Wert steht in den Notizen).` });
        notizen.push(`Pos. ${positionen.length + 1}: Status im Altsystem „${text(s.status)}"`);
      }
      let geliefert = zahl(s.menge_geliefert);
      if (geliefert === null) {
        if (status === 'geliefert') geliefert = menge;
        else {
          geliefert = 0;
          if (status === 'teil') {
            warnungen.push({ zeile, feld: 'Status', meldung: `Position „${bez}" ist im Altsystem teilgeliefert, die gelieferte Menge fehlt — steht auf 0; bitte beim Wareneingang nur den Rest buchen.` });
            notizen.push(`Pos. ${positionen.length + 1} (${nr ?? bez}): im Altsystem teilgeliefert, gelieferte Menge unbekannt`);
          }
        }
      }
      if (geliefert > menge && menge > 0) {
        warnungen.push({ zeile, feld: 'Bereits geliefert', meldung: `Geliefert (${geliefert}) ist mehr als bestellt (${menge}).` });
      }
      statusListe.push({ menge, menge_geliefert: geliefert, status: status === 'teil' && geliefert >= menge && menge > 0 ? 'geliefert' : status });
      positionen.push({
        artikelnummer: nr, artikel_id: art?.id ?? null, bezeichnung: bez.slice(0, 500),
        menge, einzelpreis: preis, menge_geliefert: geliefert, position: positionen.length + 1, zeile,
      });
    }

    bestellungen.push({
      kopf: {
        bestellnummer: g.nummer,
        bestelldatum: daten[0] ?? null,
        lieferdatum_erwartet: liefer[liefer.length - 1] ?? null,
        status: kopfStatus(statusListe),
        notizen: notizen.length > 0 ? notizen.join('\n').slice(0, 5000) : null,
        ...(mitLieferant ? { __kunde: text(mitLieferant.s.__kunde) } : {}),
        ...(mitLieferant && text(mitLieferant.s.__kunde2) ? { __kunde2: text(mitLieferant.s.__kunde2) } : {}),
        extra,
      },
      positionen,
      zeilen: alleZeilen,
      warnungen,
    });
  }
  return { bestellungen, abgelehnt };
}

/** Der Kopf, wie er in die Tabelle bestellungen geht (ohne Hilfsfelder, ohne Lieferant). */
export function kopfFuerDatenbank(k: BestellKopf): Record<string, unknown> {
  return {
    ...k.extra,
    bestellnummer: k.bestellnummer,
    bestelldatum: k.bestelldatum,
    lieferdatum_erwartet: k.lieferdatum_erwartet,
    status: k.status,
    notizen: k.notizen,
  };
}

/** Eine Position, wie sie in bestellpositionen geht. */
export function positionFuerDatenbank(p: BestellPosition, bestellungId: string): Record<string, unknown> {
  return {
    bestellung_id: bestellungId,
    artikel_id: p.artikel_id,
    bezeichnung: p.bezeichnung,
    menge: p.menge,
    einzelpreis: p.einzelpreis,
    menge_geliefert: p.menge_geliefert,
    position: p.position,
  };
}

/** Kurze Zusammenfassung fuer den Bericht. */
export function bestellSumme(b: readonly Bestellung[]): { bestellungen: number; positionen: number; netto: number } {
  let positionen = 0; let netto = 0;
  for (const x of b) for (const p of x.positionen) { positionen++; netto += p.menge * p.einzelpreis; }
  return { bestellungen: b.length, positionen, netto: centRunden(netto) };
}
