'use client';

// ARGONAUT OS · Paket 296 · Laufzeit der Leihfahrzeuge im Event
// Nach dem Event je Leihfahrzeug Stunden und/oder Runden eintragen — daraus
// rechnet „Teile & Laufzeiten" den Stand jedes eingebauten Teils.

import { useState, useMemo } from 'react';
import { einsatzPruefen, laufzeit, laufzeitText, berlinTagVon, datumDe, type Teil } from '@/lib/motorsport';
import { zahlText, leseZahl } from '@/lib/zahlen';
import { C, s, AMPEL_FARBE } from '../../../werkstatt/zweirad/_teile/stil';
import { supabase, fehlerText, fzName, type Ev, type Tn, type MietFz, type Einsatz } from './typen';

type Props = { ev: Ev; tns: Tn[]; flotte: MietFz[]; einsaetze: Einsatz[]; teile: (Teil & { bezeichnung: string })[]; lade: () => Promise<void>; meldung: (ok: string | null, fehler: string | null) => void };

export default function Laufzeit({ ev, tns, flotte, einsaetze, teile, lade, meldung }: Props) {
  const heute = berlinTagVon(new Date().toISOString());
  const evTag = berlinTagVon(ev.beginn);
  const [form, setForm] = useState({ mietFahrzeugId: '', datum: evTag <= heute ? evTag : heute, stunden: '', runden: '', notiz: '' });
  const [busy, setBusy] = useState(false);
  const leihIds = useMemo(() => Array.from(new Set(tns.filter((t) => t.miet_fahrzeug_id && t.status !== 'storniert' && t.status !== 'warteliste').map((t) => t.miet_fahrzeug_id as string))), [tns]);
  const eigene = einsaetze.filter((e) => e.event_id === ev.id).sort((a, b) => b.datum.localeCompare(a.datum));

  async function speichern() {
    const p = einsatzPruefen({ ...form, eventId: ev.id }, heute);
    if (!p.ok) { meldung(null, p.grund); return; }
    setBusy(true); meldung(null, null);
    const { data, error } = await supabase.from('ms_einsatz').insert(p.zeile).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { meldung(null, fehlerText(error, 'Nicht gespeichert.')); return; }
    meldung('Laufzeit eingetragen.', null); setForm({ ...form, stunden: '', runden: '', notiz: '' }); await lade();
  }

  return (
    <div>
      <h2 style={s.h2}>Laufzeit der Leihfahrzeuge</h2>
      <p style={s.dim}>Tragen Sie nach jedem Turn oder am Ende des Tages die gefahrenen Stunden und/oder Runden je Leihfahrzeug ein. Den Stand der Teile (Motor, Reifen, Bremsen …) sehen Sie unter <a href="/dashboard/veranstaltungen/motorsport/teile" style={{ color: C.gold }}>🔧 Teile &amp; Laufzeiten</a>.</p>
      {leihIds.length === 0 ? <p style={s.dim}>In diesem Event ist noch kein Leihfahrzeug vergeben.</p> : (
        <>
          <table style={s.tabelle}>
            <thead><tr><th style={s.th}>Leihfahrzeug</th><th style={s.th}>Teile (Stand)</th></tr></thead>
            <tbody>
              {leihIds.map((id) => {
                const aktiv = teile.filter((t) => t.miet_fahrzeug_id === id && !t.ausgebaut_am);
                return (
                  <tr key={id}>
                    <td style={s.td}><b>{fzName(flotte.find((f) => f.id === id))}</b></td>
                    <td style={s.td}>{aktiv.length === 0 ? <span style={{ color: C.dim }}>keine Teile erfasst</span> : aktiv.map((t) => {
                      const l = laufzeit(t, einsaetze);
                      return <span key={t.id} style={{ ...s.marke, marginRight: 6, color: AMPEL_FARBE[l.ampel], borderColor: AMPEL_FARBE[l.ampel] }}>{t.bezeichnung}: {laufzeitText(l.verbraucht, t.einheit)} / {laufzeitText(leseZahl(t.grenze) ?? 0, t.einheit)}</span>;
                    })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={s.box}>
            <div style={s.raster}>
              <label style={s.feld}>Leihfahrzeug<select style={s.eingabe} value={form.mietFahrzeugId} onChange={(e) => setForm({ ...form, mietFahrzeugId: e.target.value })}>
                <option value="">— wählen —</option>{leihIds.map((id) => <option key={id} value={id}>{fzName(flotte.find((f) => f.id === id))}</option>)}
              </select></label>
              <label style={s.feld}>Datum<input type="date" style={s.eingabe} value={form.datum} max={heute} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
              <label style={s.feld}>Stunden (z. B. 1,5)<input style={s.eingabe} inputMode="decimal" value={form.stunden} onChange={(e) => setForm({ ...form, stunden: e.target.value })} /></label>
              <label style={s.feld}>Runden<input style={s.eingabe} inputMode="numeric" value={form.runden} onChange={(e) => setForm({ ...form, runden: e.target.value })} /></label>
              <label style={s.feld}>Notiz<input style={s.eingabe} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
            </div>
            {evTag > heute && <p style={s.dim}>Das Event liegt in der Zukunft — Laufzeiten tragen Sie ab dem Event-Tag ein.</p>}
            <button style={{ ...s.btnGold, marginTop: 10 }} disabled={busy} onClick={() => void speichern()}>💾 Laufzeit eintragen</button>
          </div>
        </>
      )}
      {eigene.length > 0 && (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Datum</th><th style={s.th}>Fahrzeug</th><th style={s.th}>Stunden</th><th style={s.th}>Runden</th><th style={s.th}>Notiz</th></tr></thead>
          <tbody>
            {eigene.map((e) => (
              <tr key={e.id}><td style={s.td}>{datumDe(e.datum)}</td><td style={s.td}>{fzName(flotte.find((f) => f.id === e.miet_fahrzeug_id))}</td><td style={s.td}>{zahlText(e.stunden, 2)}</td><td style={s.td}>{String(e.runden)}</td><td style={s.td}>{e.notiz || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

