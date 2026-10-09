'use client';

// ============================================================
// ARGONAUT OS · Paket 283 · K16 Bewertung (DAT, Schwacke) in der Handelsakte
// FIN kopieren -> im EIGENEN Konto beim Anbieter abfragen -> Händler-Einkaufs-
// und -Verkaufswert hier eintragen. ARGONAUT liest nichts aus und schätzt
// nichts; es vergleicht nur mit dem eigenen Verkaufspreis (lib/kfzBewertung.ts).
// Speichern mit Schreibrecht „kfz" (RLS Paket 259); ohne SQL 283 Hinweis statt Absturz.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { BEWERTUNG_ANBIETER, bewertungEingabe, bewertungLage, finFuerAbfrage, type Bewertung } from '@/lib/kfzBewertung';
import { partner } from '@/lib/partnerAnbindung';
import { zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A84C', bad: '#E06666', info: '#5AB0E0' };

function berlinHeute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function KfzBewertung({ id, werte, fin, vkBrutto, onGespeichert }: {
  id: string; werte: Partial<Bewertung>; fin: string | null; vkBrutto: number | null; onGespeichert: () => void;
}) {
  const [f, setF] = useState({ anbieter: 'dat', ek: '', vk: '', am: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const finAbfrage = finFuerAbfrage(fin);

  const schluessel = JSON.stringify(werte);
  useEffect(() => {
    const w = JSON.parse(schluessel) as Partial<Bewertung>;
    setF({
      anbieter: w.bewertung_anbieter ?? 'dat',
      ek: w.bewertung_ek != null ? zahlFeld(w.bewertung_ek) : '',
      vk: w.bewertung_vk != null ? zahlFeld(w.bewertung_vk) : '',
      am: w.bewertung_am ?? '',
      url: w.bewertung_url ?? '',
    });
  }, [schluessel]);

  const lage = bewertungLage(werte, vkBrutto, berlinHeute());
  const p = partner(f.anbieter);

  async function finKopieren() {
    if (!finAbfrage) return;
    try { await navigator.clipboard.writeText(finAbfrage); setMeldung({ ok: true, text: `FIN ${finAbfrage} kopiert — jetzt im Konto beim Anbieter einfügen.` }); }
    catch { setMeldung({ ok: false, text: `Kopieren nicht möglich. Bitte von Hand übernehmen: ${finAbfrage}` }); }
  }

  async function speichern() {
    setMeldung(null);
    const e = bewertungEingabe({ anbieter: f.anbieter, ek: f.ek, vk: f.vk, am: f.am || undefined, url: f.url }, berlinHeute());
    if (!e.ok) { setMeldung({ ok: false, text: e.fehler }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('kfz_bestand').update({ ...e.felder, aktualisiert_am: new Date().toISOString() }).eq('id', id);
      if (error) { setMeldung({ ok: false, text: 'Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 283 ausgeführt?' }); return; }
      setMeldung({ ok: true, text: e.felder.bewertung_ek === null && e.felder.bewertung_vk === null ? 'Bewertung entfernt.' : 'Bewertung gespeichert.' });
      onGespeichert();
    } finally { setBusy(false); }
  }

  const farbe = lage?.stufe === 'warn' ? C.warn : lage?.stufe === 'info' ? C.info : lage?.stufe === 'ok' ? C.ok : C.dim;

  return (
    <div style={k.karte}>
      <h3 style={k.h3}>Bewertung (DAT, Schwacke)</h3>
      <div style={k.dim}>Fragen Sie die FIN in Ihrem eigenen Konto beim Anbieter ab und übernehmen Sie die beiden Händlerwerte aus dem Bericht. ARGONAUT schätzt keine Preise.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <button type="button" style={{ ...k.rand, opacity: finAbfrage ? 1 : 0.5 }} disabled={!finAbfrage} onClick={() => void finKopieren()}>📋 FIN kopieren</button>
        {p && <a href={p.abschlussUrl} target="_blank" rel="noopener" style={k.link}>{p.name}-Konto öffnen ↗</a>}
        {!finAbfrage && <span style={k.dim}>Keine gültige FIN in der Akte — bitte zuerst oben eintragen.</span>}
      </div>
      {lage && <div style={{ ...k.lage, borderColor: farbe, color: farbe }} role="status">{lage.text}</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <label style={k.lab}>Anbieter<select style={k.inp} value={f.anbieter} onChange={(e) => setF({ ...f, anbieter: e.target.value })}>
          {BEWERTUNG_ANBIETER.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <label style={k.lab}>Händler-Einkaufswert (€)<input style={k.inp} inputMode="decimal" value={f.ek} placeholder="z. B. 18.450,00" onChange={(e) => setF({ ...f, ek: e.target.value })} /></label>
          <label style={k.lab}>Händler-Verkaufswert (€)<input style={k.inp} inputMode="decimal" value={f.vk} placeholder="z. B. 22.900,00" onChange={(e) => setF({ ...f, vk: e.target.value })} /></label>
        </div>
        <label style={k.lab}>Bewertung vom<input type="date" style={k.inp} value={f.am} onChange={(e) => setF({ ...f, am: e.target.value })} /></label>
        <label style={k.lab}>Link zum Bericht (freiwillig)<input style={k.inp} value={f.url} placeholder="https://…" onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
      </div>
      <button style={{ ...k.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern()}>💾 Speichern</button>
      {meldung && <div style={{ ...k.dim, color: meldung.ok ? C.ok : C.bad, marginTop: 6 }} role={meldung.ok ? 'status' : 'alert'}>{meldung.text}</div>}
      {p && (
        <div style={k.partner}>
          <div>Noch kein {p.name}-Konto? <a href={p.abschlussUrl} target="_blank" rel="noopener" style={k.link}>Händler-Konto bei {p.name} abschließen ↗</a>{p.partnerlink ? <span style={k.dim}> (Partnerlink von ARGONAUT)</span> : null}</div>
          <div style={k.dim}>Ihr Vertrag besteht direkt mit {p.name}. Konto hinterlegen: Schnittstellen-Zentrale → „Fahrzeugbewertung" (Geschäftsleitung).</div>
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
  lage: { marginTop: 10, border: '1px solid', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', marginTop: 10 },
  rand: { background: 'transparent', border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer' },
  partner: { display: 'grid', gap: 4, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 13 },
  link: { color: C.gold, fontWeight: 700, textDecoration: 'none' },
};
