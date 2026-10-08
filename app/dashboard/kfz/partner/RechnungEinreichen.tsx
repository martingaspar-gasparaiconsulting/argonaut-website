'use client';

// ============================================================
// ARGONAUT OS · Paket 279 · K18b Rechnung einreichen (Partner-Betrieb und Gast)
// Formular + Liste der eingereichten Rechnungen. Gesendet wird über `senden`
// (Partner: /api/partner/rechnung, Gast: /api/oeffentlich/partner-gast).
// Bilder werden im Browser verkleinert, PDFs gehen unverändert (max. 4 MB).
// ============================================================

import { useState, CSSProperties } from 'react';
import { verkleinereBild } from '@/lib/bildKlein';
import { euro } from '@/lib/geld';
import { RECHNUNG_MAX_BYTES, RECHNUNG_STATUS, UST_SAETZE, rechnungPruefen, rechnungStatusName } from '@/lib/partnerRechnung';

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad };

export type EingereichteRechnung = { id: string; rechnungsnummer: string; rechnungsdatum: string; netto: number; ust_satz: number; brutto: number; status: string; grund: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function RechnungEinreichen({ rechnungen, erlaubt, senden, onNeu }: {
  rechnungen: EingereichteRechnung[]; erlaubt: boolean; senden: (fd: FormData) => Promise<{ ok: boolean; text: string }>; onNeu: () => void;
}) {
  const [f, setF] = useState({ nummer: '', datum: heute(), netto: '', satz: '19' });
  const [datei, setDatei] = useState<File | null>(null);
  const [schluessel, setSchluessel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const p = rechnungPruefen({ nummer: f.nummer, datum: f.datum, netto: f.netto, satz: Number(f.satz) }, heute());

  async function los() {
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    if (!datei) { setMeldung({ ok: false, text: 'Bitte die Rechnung als PDF oder Foto anhängen.' }); return; }
    setBusy(true); setMeldung(null);
    try {
      const blob: Blob = datei.type.startsWith('image/') ? await verkleinereBild(datei, 2400, 0.88) : datei;
      if (blob.size > RECHNUNG_MAX_BYTES) throw new Error('Die Datei ist zu groß (höchstens 4 MB).');
      const fd = new FormData();
      fd.append('datei', blob, datei.name);
      fd.append('nummer', p.felder.nummer); fd.append('datum', p.felder.datum);
      fd.append('netto', String(p.felder.netto)); fd.append('satz', String(p.felder.satz));
      const r = await senden(fd);
      setMeldung(r);
      if (r.ok) { setF({ nummer: '', datum: heute(), netto: '', satz: f.satz }); setDatei(null); setSchluessel((x) => x + 1); onNeu(); }
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler beim Senden.' });
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      <div style={r.titel}>Rechnung</div>
      {rechnungen.map((x) => (
        <div key={x.id} style={r.zeile}>
          <span>Nr. {x.rechnungsnummer} · {de(x.rechnungsdatum)} · {euro(x.brutto)} brutto ({euro(x.netto)} netto, {x.ust_satz} %)</span>
          <span style={{ color: FARBE[RECHNUNG_STATUS[x.status]?.stufe ?? ''] ?? C.dim, fontWeight: 700 }}>{rechnungStatusName(x.status)}{x.grund ? ` — ${x.grund}` : ''}</span>
        </div>
      ))}
      {erlaubt ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <label style={r.lab}>Rechnungsnummer<input style={r.inp} value={f.nummer} maxLength={60} onChange={(e) => setF({ ...f, nummer: e.target.value })} /></label>
            <label style={r.lab}>Datum<input type="date" style={r.inp} value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} /></label>
            <label style={r.lab}>Netto (€)<input style={r.inp} inputMode="decimal" value={f.netto} placeholder="z. B. 250,00" onChange={(e) => setF({ ...f, netto: e.target.value })} /></label>
            <label style={r.lab}>USt
              <select style={r.inp} value={f.satz} onChange={(e) => setF({ ...f, satz: e.target.value })}>
                {UST_SAETZE.map((s) => <option key={s} value={String(s)}>{s} %{s === 0 ? ' (z. B. Kleinunternehmer)' : ''}</option>)}
              </select>
            </label>
          </div>
          <input key={schluessel} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ fontSize: 12.5, color: C.dim, maxWidth: '100%' }}
            onChange={(e) => setDatei(e.target.files?.[0] ?? null)} />
          {p.ok && <div style={r.dim}>Brutto: <b style={{ color: C.text }}>{euro(p.felder.brutto)}</b> (USt {euro(p.felder.ust)})</div>}
          <button style={r.gold} disabled={busy} onClick={() => void los()}>{busy ? 'Sendet …' : 'Rechnung einreichen'}</button>
          <div style={r.dim}>Die Rechnung lässt sich danach nicht mehr ändern. Ist etwas falsch, weist der Auftraggeber sie mit Grund zurück und Sie reichen sie neu ein.</div>
        </div>
      ) : rechnungen.length === 0 && <div style={r.dim}>Eine Rechnung können Sie einreichen, sobald der Auftrag angenommen ist (bis 30 Tage nach der Abnahme).</div>}
      {meldung && <div style={{ marginTop: 6, fontSize: 13, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}
    </div>
  );
}

const r: Record<string, CSSProperties> = {
  titel: { fontSize: 12, fontWeight: 800, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, padding: '4px 0' },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13, justifySelf: 'start' },
};
