'use client';

// ============================================================
// ARGONAUT OS · Paket 274 · Fahrzeughistorie in der Handelsakte (Reiter „Übersicht")
// Bericht-Link eines Historien-Anbieters (zuerst carVertical) am Fahrzeug,
// Datum, Freigabe „in der Fahrzeugbörse zeigen". ARGONAUT verkauft keine
// Berichte: Kauf im eigenen Konto des Betriebs, ohne Konto über den Partnerlink
// (lib/partnerAnbindung.ts). Konto verbinden: Schnittstellen-Zentrale (Chef).
// Speichern mit Schreibrecht „kfz" (RLS Paket 259); ohne SQL 274 Hinweis statt Absturz.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { HISTORIE_ANBIETER, historieEingabe, partner } from '@/lib/partnerAnbindung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', bad: '#E06666' };

type Werte = { historie_url?: string | null; historie_anbieter?: string | null; historie_am?: string | null; historie_oeffentlich?: boolean | null };

export default function KfzHistorie({ id, werte, fin, onGespeichert }: { id: string; werte: Werte; fin: string | null; onGespeichert: () => void }) {
  const [f, setF] = useState({ url: '', anbieter: 'carvertical', am: '', oeffentlich: false });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const cv = partner('carvertical');

  const schluessel = JSON.stringify(werte);
  useEffect(() => {
    const w = JSON.parse(schluessel) as Werte;
    setF({ url: w.historie_url ?? '', anbieter: w.historie_anbieter ?? 'carvertical', am: w.historie_am ?? '', oeffentlich: w.historie_oeffentlich === true });
  }, [schluessel]);

  async function speichern() {
    setMeldung(null);
    const heute = new Date().toISOString().slice(0, 10);
    const p = historieEingabe({ url: f.url, anbieter: f.anbieter, am: f.am || undefined, oeffentlich: f.oeffentlich }, heute);
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('kfz_bestand').update({ ...p.felder, aktualisiert_am: new Date().toISOString() }).eq('id', id);
      if (error) { setMeldung({ ok: false, text: 'Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 274 ausgeführt?' }); return; }
      setMeldung({ ok: true, text: p.felder.historie_url ? 'Bericht gespeichert.' : 'Bericht entfernt.' });
      onGespeichert();
    } finally { setBusy(false); }
  }

  return (
    <div style={k.karte}>
      <h3 style={k.h3}>Fahrzeughistorie</h3>
      <div style={k.dim}>Bericht zu Unfällen, Kilometerstand und Diebstahl{fin ? ` (FIN ${fin})` : ''}. Kaufen Sie ihn in Ihrem eigenen Konto beim Anbieter und fügen Sie hier den Link ein.</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <label style={k.lab}>Anbieter<select style={k.inp} value={f.anbieter} onChange={(e) => setF({ ...f, anbieter: e.target.value })}>
          {HISTORIE_ANBIETER.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
        <label style={k.lab}>Link zum Bericht<input style={k.inp} value={f.url} placeholder="https://…" onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
        <label style={k.lab}>Bericht vom<input type="date" style={k.inp} value={f.am} onChange={(e) => setF({ ...f, am: e.target.value })} /></label>
        <label style={k.haken}><input type="checkbox" checked={f.oeffentlich} onChange={(e) => setF({ ...f, oeffentlich: e.target.checked })} /> In der Fahrzeugbörse zeigen („Fahrzeughistorie geprüft" mit Link)</label>
      </div>
      <button style={{ ...k.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern()}>💾 Speichern</button>
      {meldung && <div style={{ ...k.dim, color: meldung.ok ? C.ok : C.bad, marginTop: 6 }} role={meldung.ok ? 'status' : 'alert'}>{meldung.text}</div>}
      {f.anbieter === 'carvertical' && cv && (
        <div style={k.partner}>
          <div>Noch kein carVertical-Konto? <a href={cv.abschlussUrl} target="_blank" rel="noopener" style={k.link}>Händler-Konto bei carVertical abschließen ↗</a>{cv.partnerlink ? <span style={k.dim}> (Partnerlink von ARGONAUT)</span> : null}</div>
          {cv.einzelUrl && <div>Nur ein Bericht? <a href={cv.einzelUrl} target="_blank" rel="noopener" style={k.link}>Einzelbericht kaufen ↗</a></div>}
          <div style={k.dim}>Ihr Vertrag besteht direkt mit carVertical. Eigenes Konto verbinden: Schnittstellen-Zentrale → „Fahrzeughistorie" (Geschäftsleitung).</div>
        </div>
      )}
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', marginTop: 10 },
  partner: { display: 'grid', gap: 4, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 13 },
  link: { color: C.gold, fontWeight: 700, textDecoration: 'none' },
};
