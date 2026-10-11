// ============================================================================
// ARGONAUT OS · lib/rezepturVersion.ts — Rezeptur: Speichern, Versionen,
// Ansatz → Charge (Paket 322 · R1 Teil 2)
//
//  · zeilenFuerSpeichern  Zeilen für rezeptur_zutaten_speichern() (beide Arten:
//                         Mengen-Rezept und Prozent-Rezeptur)
//  · versionVergleich     was hat sich zwischen zwei Ständen geändert
//  · chargenNummer        Vorschlag „RZ-JJJJMMTT-HHMM" (Berliner Zeit)
//  · ansatzRohstoffe      Rohstoffe mit Einwaage + Rohstoff-Charge für die Charge
//
// Reine Logik: keine Supabase-Aufrufe, keine React-Hooks.
// ============================================================================

import { leseZahl } from './zahlen';
import { anteileAufloesen, einwaage, istMischung } from './rezepturProzent';

/** Eine Zeile so, wie die Seite sie im Formular führt (alles Text). */
export interface FormZeile {
  bezeichnung: string;
  menge: string;
  einheit: string;
  preis_pro_einheit: string;
  rolle: string;
  anteil: string;
  ist_rest: boolean;
  artikel_id: string;
}

export interface SpeicherZeile {
  bezeichnung: string;
  menge: number | null;
  einheit: string;
  preis_pro_einheit: number | null;
  rolle: string;
  anteil_prozent: number | null;
  ist_rest: boolean;
  artikel_id: string | null;
}

function zahlOderNull(s: string): number | null {
  return s.trim() === '' ? null : leseZahl(s);
}

/**
 * Zeilen zum Speichern. Mengen-Rezept: leere Zeilen fallen weg, Menge 0 = leer.
 * Prozent-Rezeptur: Anteile werden geprüft (Fehler -> fehler gesetzt, nichts
 * speichern), die „ad 100"-Zeile bekommt ihren Rest, die Menge für den
 * Standard-Ansatz wird mitgespeichert (Summe exakt).
 */
export function zeilenFuerSpeichern(
  typ: unknown, zeilen: FormZeile[], eck: { basis_menge: number | null; basis_einheit: string | null },
): { zeilen: SpeicherZeile[]; fehler: string | null } {
  if (!istMischung(typ)) {
    const out = zeilen
      .filter((z) => z.bezeichnung.trim() || (zahlOderNull(z.menge) ?? 0) > 0)
      .map((z) => {
        const m = zahlOderNull(z.menge);
        return {
          bezeichnung: z.bezeichnung.trim() || 'Zutat',
          menge: m != null && m !== 0 ? m : null,
          einheit: z.einheit.trim() || 'kg',
          preis_pro_einheit: zahlOderNull(z.preis_pro_einheit),
          rolle: z.rolle || 'sonstige',
          anteil_prozent: null,
          ist_rest: false,
          artikel_id: z.artikel_id || null,
        };
      });
    return { zeilen: out, fehler: null };
  }
  const genutzt = zeilen.filter((z) => z.bezeichnung.trim() || z.artikel_id || z.ist_rest || (zahlOderNull(z.anteil) ?? 0) > 0);
  const auf = anteileAufloesen(genutzt.map((z) => ({ bezeichnung: z.bezeichnung, anteil: zahlOderNull(z.anteil), istRest: z.ist_rest })));
  if (auf.status === 'fehler') return { zeilen: [], fehler: auf.fehler.join(' ') };
  const basis = eck.basis_menge != null && eck.basis_menge > 0 ? eck.basis_menge : 0;
  const ew = basis > 0 ? einwaage(auf.anteile, basis, 3) : null;
  const einheit = (eck.basis_einheit ?? '').trim() || 'kg';
  return {
    zeilen: genutzt.map((z, i) => ({
      bezeichnung: z.bezeichnung.trim() || 'Rohstoff',
      menge: ew ? ew[i] : null,
      einheit,
      preis_pro_einheit: zahlOderNull(z.preis_pro_einheit),
      rolle: 'sonstige',
      anteil_prozent: auf.anteile[i],
      ist_rest: z.ist_rest,
      artikel_id: z.artikel_id || null,
    })),
    fehler: null,
  };
}

// ----------------------------------------------------------------- Versionen ---

export interface StandZeile {
  bezeichnung?: string | null;
  menge?: number | null;
  einheit?: string | null;
  preis_pro_einheit?: number | null;
  anteil_prozent?: number | null;
}

export interface Aenderung {
  art: 'neu' | 'weg' | 'geaendert';
  bezeichnung: string;
  text: string;
}

function schluessel(b: unknown): string {
  return String(b ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function zahlDe(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 4 });
}

function wertText(z: StandZeile): string {
  if (z.anteil_prozent != null) return `${zahlDe(Number(z.anteil_prozent))} %`;
  if (z.menge != null) return `${zahlDe(Number(z.menge))} ${z.einheit ?? ''}`.trim();
  return '—';
}

/**
 * Vergleich zweier Stände (alt -> neu), Zeilen über den Namen zugeordnet
 * (Groß-/Kleinschreibung und Leerzeichen egal). Reihenfolge: geändert, neu, weg.
 */
export function versionVergleich(alt: StandZeile[], neu: StandZeile[]): Aenderung[] {
  const a = new Map<string, StandZeile>();
  for (const z of alt) a.set(schluessel(z.bezeichnung), z);
  const n = new Map<string, StandZeile>();
  for (const z of neu) n.set(schluessel(z.bezeichnung), z);
  const geaendert: Aenderung[] = [];
  const dazu: Aenderung[] = [];
  const weg: Aenderung[] = [];
  for (const [k, z] of n) {
    const name = String(z.bezeichnung ?? '').trim() || 'ohne Namen';
    const v = a.get(k);
    if (!v) { dazu.push({ art: 'neu', bezeichnung: name, text: `neu: ${wertText(z)}` }); continue; }
    const teile: string[] = [];
    const wa = wertText(v);
    const wn = wertText(z);
    if (wa !== wn) teile.push(`${wa} → ${wn}`);
    const pa = v.preis_pro_einheit != null ? Number(v.preis_pro_einheit) : null;
    const pn = z.preis_pro_einheit != null ? Number(z.preis_pro_einheit) : null;
    if (pa !== pn) teile.push(`Preis ${pa != null ? zahlDe(pa) : '—'} → ${pn != null ? zahlDe(pn) : '—'} €`);
    if (teile.length) geaendert.push({ art: 'geaendert', bezeichnung: name, text: teile.join(', ') });
  }
  for (const [k, z] of a) {
    if (!n.has(k)) weg.push({ art: 'weg', bezeichnung: String(z.bezeichnung ?? '').trim() || 'ohne Namen', text: `entfernt (war ${wertText(z)})` });
  }
  return [...geaendert, ...dazu, ...weg];
}

// ------------------------------------------------------------ Ansatz → Charge ---

/** Chargennummer-Vorschlag in Berliner Zeit: RZ-20261011-1430. */
export function chargenNummer(jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(jetzt);
  const t = (typ: string) => teile.find((p) => p.type === typ)?.value ?? '00';
  return `RZ-${t('year')}${t('month')}${t('day')}-${t('hour')}${t('minute')}`;
}

export interface AnsatzRohstoff { bezeichnung: string; menge: number; charge_nr: string | null }

/**
 * Rohstoffe für die Charge: nur Zeilen mit Anteil > 0, Einwaage aus dem
 * Ansatz, Rohstoff-Charge je Zeile (leer = keine).
 */
export function ansatzRohstoffe(
  namen: string[], anteile: number[], ansatz: number, chargen: (string | null | undefined)[],
): AnsatzRohstoff[] {
  const ew = einwaage(anteile, ansatz, 3);
  const out: AnsatzRohstoff[] = [];
  anteile.forEach((a, i) => {
    if (!(a > 0)) return;
    const c = (chargen[i] ?? '').trim();
    out.push({ bezeichnung: (namen[i] ?? '').trim() || 'Rohstoff', menge: ew[i], charge_nr: c || null });
  });
  return out;
}

/** Ohne Rohstoff-Charge ist die Rückverfolgung lückenhaft — Hinweis für die Rückfrage. */
export function fehlendeChargen(r: AnsatzRohstoff[]): string[] {
  return r.filter((x) => !x.charge_nr).map((x) => x.bezeichnung);
}
