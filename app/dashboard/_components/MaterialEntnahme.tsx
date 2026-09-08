'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.8 · MaterialEntnahme (Lager-Brücke)
// Verknüpft eine Werkstatt-Material-Position mit einem Lager-Artikel und
// bucht die Entnahme aus dem Lager — je Filiale.
// Alles NUR auf ausdrücklichen Klick + Bestätigung. Zurückbuchen möglich.
// Pfad: app/dashboard/_components/MaterialEntnahme.tsx
//
// ▄▄▄ WAS SICH AM 08.09.26 GEÄNDERT HAT (D1) ▄▄▄
// Vorher wurden hier drei Dinge nacheinander geschrieben: eine Bewegung, der
// neue Bestand und die Verknüpfung. Bricht etwas dazwischen ab, stimmt der
// Bestand nicht mehr mit den Bewegungen überein. Jetzt erledigt
// `lager_buchen` Bewegung + Bestand + Gesamtsumme in EINEM Vorgang.
//
// Nebenbei behoben: Die Rückbuchung schrieb die Art als 'Zugang' (großes Z),
// die Entnahme als 'ausgang' (klein). Zwei Schreibweisen für dieselbe Sache
// in derselben Datei — jede Auswertung darüber war schief.
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort } from '@/lib/standortDaten';
import {
  standortFuerBuchung, buchenArgumente, bestandIn, RPC_BUCHEN,
} from '@/lib/lagerBuchung';

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
type StandortRow = { id: string; name: string };
type BestandRow = { artikel_id: string; standort_id: string | null; bestand: number | null };

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
  const [standorte, setStandorte] = useState<StandortRow[]>([]);
  const [bestandZeilen, setBestandZeilen] = useState<BestandRow[]>([]);
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
    const [a, s, b] = await Promise.all([
      supabase.from('artikel')
        .select('id, artikelnummer, bezeichnung, einheit, aktueller_bestand, einkaufspreis')
        .eq('owner_user_id', uid).eq('aktiv', true)
        .order('bezeichnung', { ascending: true }),
      supabase.from('standorte')
        .select('id, name').eq('owner_user_id', uid).eq('aktiv', true).order('name'),
      supabase.from('artikel_bestand_standort')
        .select('artikel_id, standort_id, bestand').eq('owner_user_id', uid),
    ]);
    setArtikel((a.data as ArtikelRow[]) ?? []);
    setStandorte((s.data as StandortRow[]) ?? []);
    setBestandZeilen((b.data as BestandRow[]) ?? []);
  }

  function panelOeffnen() {
    setOffen(true); setFehler(null);
    if (artikel.length === 0) void ladeArtikel();
  }

  /**
   * Auf welche Filiale wird gebucht? Bei einem Betrieb ohne oder mit genau
   * einer Filiale gibt es nichts zu wählen. Stehen mehrere zur Auswahl und
   * oben ist „Alle" aktiv, wird NICHT geraten — sonst verschwindet Material
   * aus einer Filiale, in der es nie lag.
   */
  const wahl = useMemo(
    () => standortFuerBuchung(konkreterStandort(leseStandortCookie()), standorte),
    [standorte],
  );
  const filialName = wahl.ok && wahl.standortId
    ? (standorte.find((s) => s.id === wahl.standortId)?.name ?? 'Filiale')
    : null;

  /** Bestand am Buchungsort — null heißt „hier noch nie gezählt", nicht 0. */
  function bestandHier(artikelId: string): number | null {
    if (!wahl.ok) return null;
    if (bestandZeilen.length === 0) return null;
    return bestandIn(bestandZeilen, artikelId, wahl.standortId);
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

    // Erst die Filiale klären — sonst fragt man den Menschen und weist ihn
    // danach ab. Das ist die eine Stelle, an der geraten werden könnte.
    if (!wahl.ok) { setFehler(wahl.fehler); return; }

    const hier = bestandHier(a.id);
    const bestand = hier ?? (a.aktueller_bestand ?? 0);
    const neuBestand = Math.round((bestand - menge) * 100) / 100;
    const wo = filialName ? `\n• Filiale: ${filialName}` : '';
    const bestandZeile = hier === null && filialName
      ? `\n• In dieser Filiale wurde noch nie gezählt — der Bestand startet bei ${neuBestand}.`
      : `\n• Bestand: ${bestand} → ${neuBestand}`;
    let frage = `Material entnehmen?\n\n• ${a.bezeichnung}\n• Menge: ${menge} ${a.einheit || ''}${wo}${bestandZeile}`;
    if (neuBestand < 0) frage += `\n\n⚠ ACHTUNG: Bestand würde negativ (${neuBestand}). Trotzdem buchen?`;
    if (!window.confirm(frage)) return;

    setBusy(true); setFehler(null);
    try {
      // 1) Bewegung + Bestand + Gesamtsumme in EINEM Vorgang.
      const { error: e1 } = await supabase.rpc(RPC_BUCHEN, buchenArgumente({
        artikelId: a.id,
        standortId: wahl.standortId,
        art: 'abgang',
        menge,
        herkunft: 'entnahme',
        notiz: `Werkstatt-Entnahme WA:${auftragId}`,
      }));
      if (e1) throw e1;

      // 2) Verknüpfung merken, damit die Position weiß, was sie gekostet hat.
      //    bewegung_id bleibt leer: Die Datenbank-Funktion gibt den neuen
      //    Bestand zurück, nicht die Zeilen-Kennung. Zurückgebucht wird über
      //    Artikel und Menge, nicht über diese Kennung — die Rückbuchung
      //    funktioniert also unverändert.
      const { error: e2 } = await supabase.from('werkstatt_material_buchungen').insert({
        owner_user_id: uid, position_id: positionId, auftrag_id: auftragId,
        artikel_id: a.id, menge, bewegung_id: null,
      });
      if (e2) throw e2;

      setOffen(false); setSuche('');
      await Promise.all([ladeBuchungen(), ladeArtikel()]);
      onGebucht?.();
    } catch (e: unknown) {
      setFehler('Entnahme fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  // --- Zurückbuchen (Gegenbuchung zugang) ------------------------------
  async function zurueckbuchen(b: BuchungRow) {
    if (!uid || busy) return;
    if (!wahl.ok) { setFehler(wahl.fehler); return; }
    const art = artikel.find((a) => a.id === b.artikel_id);
    const name = art?.bezeichnung || 'Artikel';
    const wo = filialName ? ` in ${filialName}` : '';
    if (!window.confirm(`Entnahme zurückbuchen?\n\n• ${name}\n• Menge: ${b.menge} kommt zurück ins Lager${wo}.`)) return;

    setBusy(true); setFehler(null);
    try {
      // 1) Gegenbuchung — Bewegung, Bestand und Gesamtsumme in einem Vorgang.
      const { error: e1 } = await supabase.rpc(RPC_BUCHEN, buchenArgumente({
        artikelId: b.artikel_id,
        standortId: wahl.standortId,
        art: 'zugang',
        menge: b.menge,
        herkunft: 'entnahme',
        notiz: `Werkstatt-Rückbuchung WA:${auftragId}`,
      }));
      if (e1) throw e1;

      // 2) Verknüpfung stornieren
      const { error: e2 } = await supabase.from('werkstatt_material_buchungen')
        .update({ storniert: true, storniert_am: new Date().toISOString() }).eq('id', b.id);
      if (e2) throw e2;

      await Promise.all([ladeBuchungen(), ladeArtikel()]);
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
              {art ? <span style={{ color: C.textDim, fontSize: 'clamp(11px, 0.94vw, 15px)' }}> · {art.bezeichnung}</span> : null}
              <button onClick={() => zurueckbuchen(b)} disabled={busy} style={styles.zurueckBtn}>↩ zurück</button>
            </div>
          );
        })}
        {fehler && <div style={styles.err}>{fehler}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-block' }}>
      {!offen ? (
        <button onClick={panelOeffnen} style={styles.lagerBtn} title="Aus Lager entnehmen">🔗 Lager</button>
      ) : (
        <div style={styles.overlay} onClick={() => setOffen(false)}>
          <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.panelKopf}>
              <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>Artikel aus Lager entnehmen</span>
              <button onClick={() => setOffen(false)} style={styles.zurueckBtn}>✕</button>
            </div>
            <input style={styles.input} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Artikel suchen …" autoFocus />
            {!wahl.ok ? (
              <div style={styles.hinweisWarn}>{wahl.fehler}</div>
            ) : filialName ? (
              <div style={styles.hinweis}>Wird aus <b>{filialName}</b> entnommen.</div>
            ) : null}
            <div style={styles.liste}>
              {treffer.length === 0 ? (
                <div style={{ padding: '10px 12px', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{artikel.length === 0 ? 'Lade Lager …' : 'Kein Treffer.'}</div>
              ) : treffer.map((a) => {
                // Bei mehreren Filialen zählt der Bestand DIESER Filiale —
                // die Gesamtzahl würde vortäuschen, dass Ware hier liegt.
                const hier = bestandHier(a.id);
                const zeigen = hier ?? (filialName ? null : (a.aktueller_bestand ?? 0));
                const knapp = zeigen !== null && zeigen < menge;
                return (
                  <button key={a.id} onClick={() => entnehmen(a)} disabled={busy || !wahl.ok} style={styles.artItem}>
                    <span style={{ fontWeight: 600 }}>{a.bezeichnung}</span>
                    <span style={{ color: knapp ? C.warn : C.textDim, fontSize: 'clamp(11px, 0.94vw, 15px)' }}>
                      {zeigen === null
                        ? ' · hier noch nicht gezählt'
                        : ` · Bestand ${zeigen} ${a.einheit || ''}${knapp ? ' ⚠' : ''}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {fehler && <div style={styles.err}>{fehler}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  lagerBtn: { background: 'rgba(0,229,255,0.1)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 7, padding: '4px 8px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  zurueckBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 'clamp(11px, 0.94vw, 15px)', fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },
  gebuchtZeile: { display: 'flex', alignItems: 'center', fontSize: 'clamp(12px, 1.06vw, 17px)', whiteSpace: 'nowrap' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1100 },
  panel: { width: '100%', maxWidth: 360, maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' },
  panelKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.border}` },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: 'none', borderBottom: `1px solid ${C.border}`, padding: '11px 14px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  liste: { overflowY: 'auto', flex: 1 },
  artItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(143,163,190,0.08)`, color: C.text, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'clamp(14px, 1.25vw, 20px)' },

  err: { color: C.danger, fontSize: 'clamp(11.5px, 1vw, 16px)', padding: '6px 10px' },
  hinweis: { color: C.textDim, fontSize: 'clamp(11.5px, 1vw, 16px)', padding: '8px 14px', borderBottom: `1px solid ${C.border}` },
  hinweisWarn: { color: C.warn, fontSize: 'clamp(11.5px, 1vw, 16px)', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, lineHeight: 1.45 },
};
