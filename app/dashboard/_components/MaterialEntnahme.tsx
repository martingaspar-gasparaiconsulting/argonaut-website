'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.8 · MaterialEntnahme (Lager-Brücke)
// Verknüpft eine Werkstatt-Material-Position mit einem Lager-Artikel und
// bucht die Entnahme als 'ausgang' in lagerbewegungen (ERP-Format), reduziert
// aktueller_bestand und merkt die Verknüpfung in werkstatt_material_buchungen.
// Alles NUR auf ausdrücklichen Klick + Bestätigung. Zurückbuchen möglich.
// Pfad: app/dashboard/_components/MaterialEntnahme.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type ArtikelRow = {
  id: string; artikelnummer: string | null; bezeichnung: string;
  einheit: string | null; aktueller_bestand: number | null; einkaufspreis: number | null;
};
type BuchungRow = {
  id: string; artikel_id: string; menge: number; storniert: boolean; bewegung_id: string | null;
};

type Props = {
  positionId: string;
  auftragId: string;
  /** vorgeschlagene Menge (aus der Position) */
  menge: number;
  /** Callback nach erfolgreicher Buchung/Stornierung */
  onGebucht?: () => void;
};

export default function MaterialEntnahme({ positionId, auftragId, menge, onGebucht }: Props) {
  const [uid, setUid] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [artikel, setArtikel] = useState<ArtikelRow[]>([]);
  const [buchungen, setBuchungen] = useState<BuchungRow[]>([]);
  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
    })();
  }, []);

  const ladeBuchungen = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('werkstatt_material_buchungen')
      .select('id, artikel_id, menge, storniert, bewegung_id')
      .eq('position_id', positionId).eq('storniert', false);
    setBuchungen((data as BuchungRow[]) ?? []);
  }, [uid, positionId]);

  useEffect(() => { void ladeBuchungen(); }, [ladeBuchungen]);

  async function ladeArtikel() {
    if (!uid) return;
    const { data } = await supabase.from('artikel')
      .select('id, artikelnummer, bezeichnung, einheit, aktueller_bestand, einkaufspreis')
      .eq('owner_user_id', uid).eq('aktiv', true)
      .order('bezeichnung', { ascending: true });
    setArtikel((data as ArtikelRow[]) ?? []);
  }

  function panelOeffnen() {
    setOffen(true); setFehler(null);
    if (artikel.length === 0) void ladeArtikel();
  }

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const basis = q ? artikel.filter((a) =>
      (a.bezeichnung || '').toLowerCase().includes(q) || (a.artikelnummer || '').toLowerCase().includes(q)
    ) : artikel;
    return basis.slice(0, 8);
  }, [suche, artikel]);

  // --- Entnahme buchen (ausgang) ---------------------------------------
  async function entnehmen(a: ArtikelRow) {
    if (!uid || busy) return;
    const bestand = a.aktueller_bestand ?? 0;
    const neuBestand = Math.round((bestand - menge) * 100) / 100;
    let frage = `Material entnehmen?\n\n• ${a.bezeichnung}\n• Menge: ${menge} ${a.einheit || ''}\n• Bestand: ${bestand} → ${neuBestand}`;
    if (neuBestand < 0) frage += `\n\n⚠ ACHTUNG: Bestand würde negativ (${neuBestand}). Trotzdem buchen?`;
    if (!window.confirm(frage)) return;

    setBusy(true); setFehler(null);
    try {
      // 1) Lagerbewegung 'ausgang' (ERP-Format)
      const { data: bew, error: e1 } = await supabase.from('lagerbewegungen').insert({
        owner_user_id: uid, artikel_id: a.id, typ: 'ausgang', menge,
        grund: 'Werkstatt-Entnahme', referenz: `WA:${auftragId}`,
      }).select('id').single();
      if (e1) throw e1;
      const bewegungId = (bew as { id: string }).id;

      // 2) Bestand reduzieren
      const { error: e2 } = await supabase.from('artikel')
        .update({ aktueller_bestand: neuBestand, updated_at: new Date().toISOString() }).eq('id', a.id);
      if (e2) throw e2;

      // 3) Verknüpfung merken
      const { error: e3 } = await supabase.from('werkstatt_material_buchungen').insert({
        owner_user_id: uid, position_id: positionId, auftrag_id: auftragId,
        artikel_id: a.id, menge, bewegung_id: bewegungId,
      });
      if (e3) throw e3;

      setOffen(false); setSuche('');
      await ladeBuchungen();
      onGebucht?.();
    } catch (e: unknown) {
      setFehler('Entnahme fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  // --- Zurückbuchen (Gegenbuchung zugang) ------------------------------
  async function zurueckbuchen(b: BuchungRow) {
    if (!uid || busy) return;
    const art = artikel.find((a) => a.id === b.artikel_id);
    const name = art?.bezeichnung || 'Artikel';
    if (!window.confirm(`Entnahme zurückbuchen?\n\n• ${name}\n• Menge: ${b.menge} kommt zurück ins Lager.`)) return;

    setBusy(true); setFehler(null);
    try {
      // aktuellen Bestand frisch holen (falls artikel nicht geladen)
      const { data: aData } = await supabase.from('artikel').select('aktueller_bestand').eq('id', b.artikel_id).single();
      const bestand = (aData as { aktueller_bestand: number | null } | null)?.aktueller_bestand ?? 0;

      // 1) Gegenbuchung 'Zugang' (großes Z, exakt wie ERP)
      const { error: e1 } = await supabase.from('lagerbewegungen').insert({
        owner_user_id: uid, artikel_id: b.artikel_id, typ: 'Zugang', menge: b.menge,
        grund: 'Werkstatt-Rückbuchung', referenz: `WA:${auftragId}`,
      });
      if (e1) throw e1;
      // 2) Bestand erhöhen
      const { error: e2 } = await supabase.from('artikel')
        .update({ aktueller_bestand: Math.round((bestand + b.menge) * 100) / 100, updated_at: new Date().toISOString() })
        .eq('id', b.artikel_id);
      if (e2) throw e2;
      // 3) Verknüpfung stornieren
      const { error: e3 } = await supabase.from('werkstatt_material_buchungen')
        .update({ storniert: true, storniert_am: new Date().toISOString() }).eq('id', b.id);
      if (e3) throw e3;

      await ladeBuchungen();
      onGebucht?.();
    } catch (e: unknown) {
      setFehler('Zurückbuchen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  // Bereits gebucht?
  if (buchungen.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {buchungen.map((b) => {
          const art = artikel.find((a) => a.id === b.artikel_id);
          return (
            <div key={b.id} style={styles.gebuchtZeile}>
              <span style={{ color: C.green }}>✓ entnommen</span>
              {art ? <span style={{ color: C.textDim, fontSize: 11 }}> · {art.bezeichnung}</span> : null}
              <button onClick={() => zurueckbuchen(b)} disabled={busy} style={styles.zurueckBtn}>↩ zurück</button>
            </div>
          );
        })}
        {fehler && <div style={styles.err}>{fehler}</div>}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {!offen ? (
        <button onClick={panelOeffnen} style={styles.lagerBtn} title="Aus Lager entnehmen">🔗 Lager</button>
      ) : (
        <div style={styles.panel}>
          <input style={styles.input} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Artikel suchen …" autoFocus />
          <div style={styles.liste}>
            {treffer.length === 0 ? (
              <div style={{ padding: '8px 10px', color: C.textDim, fontSize: 12 }}>{artikel.length === 0 ? 'Lade Lager …' : 'Kein Treffer.'}</div>
            ) : treffer.map((a) => {
              const b = a.aktueller_bestand ?? 0;
              const knapp = b < menge;
              return (
                <button key={a.id} onClick={() => entnehmen(a)} disabled={busy} style={styles.artItem}>
                  <span style={{ fontWeight: 600 }}>{a.bezeichnung}</span>
                  <span style={{ color: knapp ? C.warn : C.textDim, fontSize: 11 }}> · Bestand {b} {a.einheit || ''}{knapp ? ' ⚠' : ''}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 6 }}>
            <button onClick={() => setOffen(false)} style={styles.zurueckBtn}>Schließen</button>
          </div>
          {fehler && <div style={styles.err}>{fehler}</div>}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  lagerBtn: { background: 'rgba(0,229,255,0.1)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  zurueckBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },
  gebuchtZeile: { display: 'flex', alignItems: 'center', fontSize: 12, whiteSpace: 'nowrap' },

  panel: { position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 280, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.4)', zIndex: 50 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: 'none', borderBottom: `1px solid ${C.border}`, borderRadius: '10px 10px 0 0', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' },
  liste: { maxHeight: 200, overflowY: 'auto' },
  artItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(143,163,190,0.08)`, color: C.text, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },

  err: { color: C.danger, fontSize: 11.5, padding: '6px 10px' },
};
