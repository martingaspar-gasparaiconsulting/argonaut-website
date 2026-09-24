'use client';

// ============================================================
// ARGONAUT OS · RechnungsAbgleich (Paket PB · B02)
// Steht in der Beleg-Inbox unter dem Formular: Zu welcher Bestellung gehört
// diese Rechnung, und passt der Betrag zu dem, was BESTELLT und was
// tatsächlich GELIEFERT wurde? Die Rechenregeln (Toleranz, Ampel, Reihenfolge)
// stehen in lib/rechnungsAbgleich.ts und sind dort getestet.
//
// Nichts hier blockiert das Speichern. „Verknüpfen" merkt sich nur die
// Bestellung am Beleg (Spalte eingangsbelege.bestellung_id).
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { bestellVorschlaege, pruefeGegenBestellung, type BestellungLite } from '@/lib/rechnungsAbgleich';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const AMPEL: Record<string, string> = { gruen: C.green, gelb: C.warn, rot: C.danger };

function eur(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function datum(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

type Roh = { id: string; lieferant_id: string | null; bestell_nr: string | null; datum: string | null; status: string | null };

export default function RechnungsAbgleich({
  lieferant, netto, bestellungId, onWahl,
}: {
  lieferant: string;
  /** Nettobetrag der Rechnung, wie er im Formular steht (Text) */
  netto: string;
  bestellungId: string | null;
  onWahl: (id: string | null) => void;
}) {
  const [bestellungen, setBestellungen] = useState<BestellungLite[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, l, p] = await Promise.all([
          supabase.from('bestellung').select('id, lieferant_id, bestell_nr, datum, status').order('datum', { ascending: false }).limit(300),
          supabase.from('lieferant').select('id, name'),
          supabase.from('bestellung_position').select('bestellung_id, menge, menge_erhalten, retoure_menge, ek_preis'),
        ]);
        if (b.error) throw b.error;
        const namen = new Map(((l.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name]));
        const posNach = new Map<string, BestellungLite['positionen']>();
        for (const pos of (p.data as Array<{ bestellung_id: string; menge: unknown; menge_erhalten: unknown; retoure_menge: unknown; ek_preis: unknown }>) ?? []) {
          const liste = posNach.get(pos.bestellung_id) ?? [];
          liste.push(pos);
          posNach.set(pos.bestellung_id, liste);
        }
        setBestellungen(((b.data as Roh[]) ?? []).map((r) => ({
          id: r.id,
          bestell_nr: r.bestell_nr,
          datum: r.datum,
          status: r.status,
          lieferant_name: r.lieferant_id ? namen.get(r.lieferant_id) ?? null : null,
          positionen: posNach.get(r.id) ?? [],
        })));
      } catch {
        setFehler('Bestellungen konnten nicht geladen werden.');
        setBestellungen([]);
      }
    })();
  }, []);

  const vorschlaege = useMemo(
    () => (bestellungen && lieferant.trim() ? bestellVorschlaege({ lieferant, netto }, bestellungen) : []),
    [bestellungen, lieferant, netto],
  );

  // Eine bereits verknüpfte Bestellung wird immer gezeigt — auch wenn der
  // Lieferantenname inzwischen anders geschrieben ist.
  const verknuepft = useMemo(() => {
    if (!bestellungId || !bestellungen) return null;
    const b = bestellungen.find((x) => x.id === bestellungId);
    return b ? { bestellung: b, abgleich: pruefeGegenBestellung(netto, b.positionen) } : null;
  }, [bestellungId, bestellungen, netto]);

  if (!lieferant.trim() && !bestellungId) return null;
  if (bestellungen === null) return <div style={s.box}><span style={{ color: C.textDim }}>Suche passende Bestellung …</span></div>;
  if (fehler) return <div style={s.box}><span style={{ color: C.textDim }}>{fehler}</span></div>;

  const zeilen = verknuepft
    ? [verknuepft, ...vorschlaege.filter((v) => v.bestellung.id !== verknuepft.bestellung.id)]
    : vorschlaege;

  return (
    <div style={s.box}>
      <div style={s.titel}>🔗 Abgleich mit Bestellung und Wareneingang</div>
      {zeilen.length === 0 ? (
        <div style={{ color: C.textDim, fontSize: 13.5 }}>
          Keine Bestellung bei „{lieferant}" gefunden. Ohne Bestellung lässt sich nicht prüfen, ob Menge und Preis stimmen.
        </div>
      ) : (
        zeilen.map(({ bestellung: b, abgleich: a }) => {
          const istGewaehlt = b.id === bestellungId;
          return (
            <div key={b.id} style={{ ...s.zeile, borderColor: istGewaehlt ? C.gold : C.border }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  <span style={{ color: AMPEL[a.ampel] }}>●</span>{' '}
                  Bestellung {b.bestell_nr || '(ohne Nr.)'} · {datum(b.datum)} · {b.lieferant_name || '—'}
                </div>
                <div style={s.zahlen}>
                  bestellt {eur(a.bestellwert)} · geliefert {eur(a.geliefertWert)} · Rechnung netto {eur(a.rechnungNetto)}
                </div>
                {a.meldungen.map((m, i) => (
                  <div key={i} style={{ color: a.ampel === 'gruen' ? C.green : AMPEL[a.ampel], fontSize: 13.5, marginTop: 3 }}>{m}</div>
                ))}
              </div>
              <button type="button" style={s.knopf} onClick={() => onWahl(istGewaehlt ? null : b.id)}>
                {istGewaehlt ? '✓ Verknüpft (lösen)' : 'Verknüpfen'}
              </button>
            </div>
          );
        })
      )}
      <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 8 }}>
        Verglichen wird netto. Toleranz: 1,00 € oder 1 %. Der Abgleich ist ein Hinweis — speichern und bezahlen entscheiden Sie.
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  box: { background: 'rgba(0,229,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 12 },
  titel: { fontWeight: 700, fontSize: 14, marginBottom: 8 },
  zeile: { display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px solid', borderRadius: 10, padding: '10px 12px', marginTop: 8, background: C.navy },
  zahlen: { color: C.textDim, fontSize: 13, marginTop: 3 },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
};
