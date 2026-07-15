'use client';

// ============================================================================
// ARGONAUT OS · Baustein "ZeitraumFilter" (Etappe 2, Analytics QW5)
// Flexibler Zeitraum-Wähler für alle Analytics-Reports.
//   Ebene 1: Schnellauswahl (Monat, 30/60/90/120 Tage, Quartale, Jahr, Gesamt)
//   Ebene 2: Freie Datumswahl (Von–Bis, nativer Kalender)
// Gibt einen sauberen { von, bis }-Zeitraum zurück; von/bis = null -> "alles".
// Wiederverwendbar: <ZeitraumFilter wert={z} onChange={setZ} />
// ============================================================================

import { useState } from 'react';

const C = {
  navy2: '#0F1F33',
  gold: '#C9A84C',
  textDim: '#8FA3BE',
  border: 'rgba(255,255,255,0.10)',
};

export type ZeitraumModus =
  | 'dieser_monat'
  | 'letzte_30'
  | 'letzte_60'
  | 'letzte_90'
  | 'letzte_120'
  | 'dieses_quartal'
  | 'letztes_quartal'
  | 'dieses_halbjahr'
  | 'dieses_jahr'
  | 'alles'
  | 'frei';

export type Zeitraum = {
  modus: ZeitraumModus;
  von: Date | null; // Beginn (00:00) oder null = kein Beginn
  bis: Date | null; // Ende (23:59) oder null = kein Ende
  label: string; // Anzeige-Text (für KI-Kontext / PDF)
};

// ── Datums-Helfer (immer lokal, nie toISOString) ──────────────────────────
function mitternacht(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function tagesende(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function minusTage(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}
function parseLokal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function kurz(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Zeitraum aus Schnellauswahl berechnen ─────────────────────────────────
export function berechneZeitraum(modus: ZeitraumModus, heute = new Date()): Zeitraum {
  const j = heute.getFullYear();
  const m = heute.getMonth();
  const heuteEnde = tagesende(heute);

  switch (modus) {
    case 'dieser_monat':
      return { modus, von: mitternacht(new Date(j, m, 1)), bis: tagesende(new Date(j, m + 1, 0)), label: 'Dieser Monat' };
    case 'letzte_30':
      return { modus, von: mitternacht(minusTage(heute, 29)), bis: heuteEnde, label: 'Letzte 30 Tage' };
    case 'letzte_60':
      return { modus, von: mitternacht(minusTage(heute, 59)), bis: heuteEnde, label: 'Letzte 60 Tage' };
    case 'letzte_90':
      return { modus, von: mitternacht(minusTage(heute, 89)), bis: heuteEnde, label: 'Letzte 90 Tage' };
    case 'letzte_120':
      return { modus, von: mitternacht(minusTage(heute, 119)), bis: heuteEnde, label: 'Letzte 120 Tage' };
    case 'dieses_quartal': {
      const q = Math.floor(m / 3) * 3;
      return { modus, von: mitternacht(new Date(j, q, 1)), bis: tagesende(new Date(j, q + 3, 0)), label: 'Dieses Quartal' };
    }
    case 'letztes_quartal': {
      const q = Math.floor(m / 3) * 3 - 3; // negativ -> Date rollt ins Vorjahr
      return { modus, von: mitternacht(new Date(j, q, 1)), bis: tagesende(new Date(j, q + 3, 0)), label: 'Letztes Quartal' };
    }
    case 'dieses_halbjahr': {
      const h = m < 6 ? 0 : 6;
      return { modus, von: mitternacht(new Date(j, h, 1)), bis: tagesende(new Date(j, h + 6, 0)), label: 'Dieses Halbjahr' };
    }
    case 'dieses_jahr':
      return { modus, von: mitternacht(new Date(j, 0, 1)), bis: tagesende(new Date(j, 11, 31)), label: 'Dieses Jahr' };
    case 'alles':
    default:
      return { modus: 'alles', von: null, bis: null, label: 'Gesamter Zeitraum' };
  }
}

// ── Zeitraum aus freier Datumswahl ────────────────────────────────────────
export function freierZeitraum(vonStr: string, bisStr: string): Zeitraum {
  const vonD = parseLokal(vonStr);
  const bisD = parseLokal(bisStr);
  return {
    modus: 'frei',
    von: vonD ? mitternacht(vonD) : null,
    bis: bisD ? tagesende(bisD) : null,
    label: `${vonD ? kurz(vonD) : '…'} – ${bisD ? kurz(bisD) : '…'}`,
  };
}

// ── Prüft, ob ein Datum im Zeitraum liegt (für die Reports) ───────────────
export function imZeitraum(datum: string | null | undefined, z: Zeitraum): boolean {
  if (z.von === null && z.bis === null) return true; // "alles"
  if (!datum) return false;
  const d = parseLokal(datum.slice(0, 10)) ?? new Date(datum);
  if (isNaN(d.getTime())) return false;
  if (z.von && d < z.von) return false;
  if (z.bis && d > z.bis) return false;
  return true;
}

// Standard-Startwert für Reports
export const ZEITRAUM_ALLES: Zeitraum = { modus: 'alles', von: null, bis: null, label: 'Gesamter Zeitraum' };

// ── Vergleichs-Zeitraum (Vorperiode) berechnen ────────────────────────────
// Kalendarische Modi -> echter Vor-Kalenderzeitraum (Vormonat, Vorquartal …).
// Tage-/Frei-Modi -> gleich lange Periode direkt davor. "alles" -> null.
export function vorperiode(z: Zeitraum): Zeitraum | null {
  if (z.modus === 'alles' || z.von === null || z.bis === null) return null;
  const v = z.von;

  switch (z.modus) {
    case 'dieser_monat':
      return {
        modus: 'frei',
        von: new Date(v.getFullYear(), v.getMonth() - 1, 1),
        bis: new Date(v.getFullYear(), v.getMonth(), 0, 23, 59, 59, 999),
        label: 'Vormonat',
      };
    case 'dieses_quartal':
    case 'letztes_quartal':
      return {
        modus: 'frei',
        von: new Date(v.getFullYear(), v.getMonth() - 3, 1),
        bis: new Date(v.getFullYear(), v.getMonth(), 0, 23, 59, 59, 999),
        label: 'Vorquartal',
      };
    case 'dieses_halbjahr':
      return {
        modus: 'frei',
        von: new Date(v.getFullYear(), v.getMonth() - 6, 1),
        bis: new Date(v.getFullYear(), v.getMonth(), 0, 23, 59, 59, 999),
        label: 'Vorhalbjahr',
      };
    case 'dieses_jahr':
      return {
        modus: 'frei',
        von: new Date(v.getFullYear() - 1, 0, 1),
        bis: new Date(v.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
        label: 'Vorjahr',
      };
    default: {
      // letzte_30/60/90/120 und frei: gleich lange Periode unmittelbar davor
      const dauer = z.bis.getTime() - v.getTime();
      const bisVor = new Date(v.getTime() - 1);
      const vonVor = new Date(v.getTime() - 1 - dauer);
      return { modus: 'frei', von: vonVor, bis: bisVor, label: 'Vorperiode' };
    }
  }
}

// ── Schnellauswahl-Liste ──────────────────────────────────────────────────
const SCHNELL: { modus: ZeitraumModus; label: string }[] = [
  { modus: 'dieser_monat', label: 'Dieser Monat' },
  { modus: 'letzte_30', label: 'Letzte 30 T.' },
  { modus: 'letzte_60', label: 'Letzte 60 T.' },
  { modus: 'letzte_90', label: 'Letzte 90 T.' },
  { modus: 'letzte_120', label: 'Letzte 120 T.' },
  { modus: 'dieses_quartal', label: 'Dieses Quartal' },
  { modus: 'letztes_quartal', label: 'Letztes Quartal' },
  { modus: 'dieses_halbjahr', label: 'Dieses Halbjahr' },
  { modus: 'dieses_jahr', label: 'Dieses Jahr' },
  { modus: 'alles', label: 'Gesamt' },
];

export type ZeitraumFilterProps = {
  wert: Zeitraum;
  onChange: (z: Zeitraum) => void;
};

export default function ZeitraumFilter({ wert, onChange }: ZeitraumFilterProps) {
  const [vonStr, setVonStr] = useState('');
  const [bisStr, setBisStr] = useState('');

  function waehleSchnell(modus: ZeitraumModus) {
    setVonStr('');
    setBisStr('');
    onChange(berechneZeitraum(modus));
  }

  function aendereFrei(neuVon: string, neuBis: string) {
    setVonStr(neuVon);
    setBisStr(neuBis);
    if (neuVon || neuBis) onChange(freierZeitraum(neuVon, neuBis));
  }

  const pille = (aktiv: boolean): React.CSSProperties => ({
    padding: '7px 13px',
    borderRadius: 999,
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: `1px solid ${aktiv ? C.gold : C.border}`,
    background: aktiv ? C.gold : 'rgba(255,255,255,0.04)',
    color: aktiv ? '#0A1628' : 'rgba(255,255,255,0.75)',
    transition: 'all .15s ease',
  });

  const dateInput: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${wert.modus === 'frei' ? C.gold : C.border}`,
    borderRadius: 8,
    padding: '7px 10px',
    color: '#fff',
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    colorScheme: 'dark',
  };

  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Zeile 1: Schnellauswahl */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 4 }}>
          Zeitraum
        </span>
        {SCHNELL.map((s) => (
          <button key={s.modus} onClick={() => waehleSchnell(s.modus)} style={pille(wert.modus === s.modus)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Zeile 2: Freie Datumswahl (Kalender) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>oder frei:</span>
        <input
          type="date"
          value={vonStr}
          onChange={(e) => aendereFrei(e.target.value, bisStr)}
          style={dateInput}
          aria-label="Von-Datum"
        />
        <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>bis</span>
        <input
          type="date"
          value={bisStr}
          onChange={(e) => aendereFrei(vonStr, e.target.value)}
          style={dateInput}
          aria-label="Bis-Datum"
        />
        <span style={{ color: C.gold, fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, marginLeft: 'auto' }}>
          {wert.label}
        </span>
      </div>
    </div>
  );
}
