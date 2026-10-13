'use client';

// ARGONAUT OS · Paket 355 (13.10.2026) · Abfallschlüssel — die eigene Liste des Betriebs.
// Kein amtlicher Katalog: der Betrieb trägt die Schlüssel ein, die er annimmt oder abgibt.

import { useState } from 'react';
import { schluesselPruefen, schluesselLesbar } from '@/lib/entsorgung';
import { C, s, Feld, schreiben, type Db, type Melde } from './entsorgungUi';

export type Schluessel = { id: string; schluessel: string; gefaehrlich: boolean; bezeichnung: string; aktiv: boolean };

export default function SchluesselListe({ supabase, liste, istChef, melde, onGeaendert }: {
  supabase: Db; liste: Schluessel[]; istChef: boolean; melde: Melde; onGeaendert: () => Promise<void> | void;
}) {
  const [neu, setNeu] = useState({ schluessel: '', bezeichnung: '' });
  const [busy, setBusy] = useState(false);
  const [alle, setAlle] = useState(false);

  async function anlegen() {
    const p = schluesselPruefen(neu, liste.map((x) => x.schluessel));
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('abfall_schluessel').insert({ schluessel: p.schluessel, bezeichnung: neu.bezeichnung.trim() }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Abfallschlüssel ${schluesselLesbar(p.schluessel)} angelegt.`);
      setNeu({ schluessel: '', bezeichnung: '' });
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function umschalten(x: Schluessel) {
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('abfall_schluessel').update({ aktiv: !x.aktiv }).eq('id', x.id).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function entfernen(x: Schluessel) {
    if (!window.confirm(`Abfallschlüssel ${schluesselLesbar(x.schluessel)} entfernen? Wird er schon in Aufträgen oder Wiegescheinen verwendet, bleibt er erhalten.`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('abfall_schluessel').delete().eq('id', x.id).select('id'), 'Nicht entfernt — Entfernen darf nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Entfernt.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  const sichtbar = liste.filter((x) => alle || x.aktiv).slice().sort((a, b) => a.schluessel.localeCompare(b.schluessel));

  return (
    <div style={s.box}>
      <b style={{ color: C.gold }}>Ihre Abfallschlüssel</b>
      <p style={s.klein}>
        Tragen Sie die Abfallschlüssel ein, die Ihr Betrieb annimmt oder abgibt — sechs Ziffern nach der Abfallverzeichnis-Verordnung, gefährliche Abfälle
        mit Sternchen (z. B. 17 06 05*). ARGONAUT liefert bewusst keinen amtlichen Katalog mit: Welche Schlüssel für Sie gelten, legen Sie fest.
        Ein Schlüssel wird nicht umgeschrieben — ist einer falsch, legen Sie den richtigen neu an und blenden den alten aus.
      </p>
      <div style={{ ...s.raster, alignItems: 'end' }}>
        <Feld label="Schlüssel (z. B. 17 09 04)" w={neu.schluessel} max={12} on={(x) => setNeu({ ...neu, schluessel: x })} />
        <Feld label="Bezeichnung" w={neu.bezeichnung} max={200} on={(x) => setNeu({ ...neu, bezeichnung: x })} />
        <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>+ Schlüssel anlegen</button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Schlüssel</th><th style={s.th}>Bezeichnung</th><th style={s.th}>Art</th><th style={s.th}></th></tr></thead>
          <tbody>
            {sichtbar.map((x) => (
              <tr key={x.id} style={{ opacity: x.aktiv ? 1 : 0.5 }}>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 14 }}>{schluesselLesbar(x.schluessel)}</td>
                <td style={s.td}>{x.bezeichnung}</td>
                <td style={s.td}>{x.gefaehrlich ? <span style={{ color: C.bad, fontWeight: 700 }}>gefährlich</span> : <span style={s.klein}>nicht gefährlich</span>}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <button style={s.mini} disabled={busy} onClick={() => void umschalten(x)}>{x.aktiv ? 'ausblenden' : 'einblenden'}</button>{' '}
                  {istChef && <button style={s.mini} disabled={busy} onClick={() => void entfernen(x)}>entfernen</button>}
                </td>
              </tr>
            ))}
            {!sichtbar.length && <tr><td style={s.td} colSpan={4}><span style={s.klein}>Noch keine Abfallschlüssel eingetragen.</span></td></tr>}
          </tbody>
        </table>
      </div>
      {liste.some((x) => !x.aktiv) && <label style={{ ...s.klein, display: 'block', marginTop: 8 }}><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> ausgeblendete zeigen</label>}
    </div>
  );
}
