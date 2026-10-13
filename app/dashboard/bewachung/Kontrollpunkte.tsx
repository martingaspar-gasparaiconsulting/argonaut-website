'use client';

// ============================================================
// ARGONAUT OS · Paket 353 (13.10.2026) · Kontrollpunkte je Objekt
// Anlegen, umbenennen, Reihenfolge, ausblenden; QR-Aufkleber drucken.
// Den Code vergibt die Datenbank (zufällig, nicht änderbar). Entfernen nur
// die Geschäftsleitung und nur ohne Scans — sonst ausblenden.
// ============================================================

import { useState } from 'react';
import { punktPruefen, codeLesbar, etikettenHtml, type Kontrollpunkt } from '@/lib/bewachung';
import Leerzustand from '../_components/Leerzustand';
import { C, s, Feld, schreiben, zeige, type Db, type Objekt, type Melde } from './bewachungUi';

export default function Kontrollpunkte({ supabase, objekt, punkte, istChef, melde, onGeaendert }: {
  supabase: Db; objekt: Objekt; punkte: Kontrollpunkt[]; istChef: boolean; melde: Melde; onGeaendert: () => Promise<void>;
}) {
  const [neu, setNeu] = useState({ name: '', hinweis: '' });
  const [busy, setBusy] = useState(false);
  const hier = punkte.filter((p) => p.objekt_id === objekt.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

  async function tu(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, okText: string, sonst?: string) {
    setBusy(true); melde(null);
    try {
      const r = await schreiben(q, sonst);
      if (!r.ok) { melde(r.fehler); return false; }
      melde(null, okText); await onGeaendert(); return true;
    } finally { setBusy(false); }
  }

  async function anlegen() {
    const p = punktPruefen(neu);
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    const pos = Math.max(0, ...hier.map((x) => x.position)) + 1;
    if (await tu(supabase.from('wach_kontrollpunkt').insert({ objekt_id: objekt.id, name: neu.name.trim(), hinweis: neu.hinweis.trim() || null, position: pos }).select('id'),
      `Kontrollpunkt „${neu.name.trim()}" angelegt — den QR-Aufkleber gibt es unter „🖨 QR-Aufkleber drucken".`)) setNeu({ name: '', hinweis: '' });
  }

  async function umbenennen(p: Kontrollpunkt, feld: 'name' | 'hinweis', wert: string) {
    const w = wert.trim();
    const pr = punktPruefen({ name: feld === 'name' ? w : p.name, hinweis: feld === 'hinweis' ? w : p.hinweis });
    if (!pr.ok) { melde(pr.fehler.join(' ')); return; }
    await tu(supabase.from('wach_kontrollpunkt').update({ [feld]: w || null }).eq('id', p.id).select('id'), 'Gespeichert.');
  }

  async function schieben(p: Kontrollpunkt, richtung: -1 | 1) {
    const i = hier.findIndex((x) => x.id === p.id);
    const j = i + richtung;
    if (j < 0 || j >= hier.length) return;
    const andere = hier[j];
    // Reihenfolge tauschen; gleiche Positionen vorher auseinanderziehen
    const a = p.position === andere.position ? i + 1 : p.position;
    const b = p.position === andere.position ? j + 1 : andere.position;
    setBusy(true); melde(null);
    try {
      const r1 = await schreiben(supabase.from('wach_kontrollpunkt').update({ position: b }).eq('id', p.id).select('id'));
      const r2 = r1.ok ? await schreiben(supabase.from('wach_kontrollpunkt').update({ position: a }).eq('id', andere.id).select('id')) : r1;
      if (!r2.ok) melde(r2.fehler);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function entfernen(p: Kontrollpunkt) {
    if (!window.confirm(`„${p.name}" entfernen? Geht nur, solange der Punkt noch nie gescannt wurde — sonst bitte ausblenden.`)) return;
    await tu(supabase.from('wach_kontrollpunkt').delete().eq('id', p.id).select('id'), `„${p.name}" entfernt.`, 'Entfernen darf nur die Geschäftsleitung — sonst ausblenden.');
  }

  function drucken() {
    if (!zeige(etikettenHtml(objekt, hier))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={s.box}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ color: C.gold }}>Kontrollpunkte · {objekt.bezeichnung ?? 'Objekt'}</b>
          <span style={{ flex: 1 }} />
          {hier.some((p) => p.aktiv) && <button style={s.btnGold} onClick={drucken}>🖨 QR-Aufkleber drucken</button>}
        </div>
        <p style={s.klein}>
          Jeder Kontrollpunkt bekommt einen eigenen QR-Code. Ausdrucken, am Punkt anbringen — beim Rundgang wird er gescannt.
          Der Code ist zufällig und nicht änderbar; ist ein Aufkleber verloren, einen neuen Punkt anlegen und den alten ausblenden.
          Die Reihenfolge ist die Reihenfolge im Rundgang.
        </p>
        <div style={s.raster}>
          <Feld label="Name (z. B. Tor Nord, Halle 2 Notausgang)" w={neu.name} max={120} on={(x) => setNeu({ ...neu, name: x })} />
          <Feld label="Hinweis für die Wachkraft (optional)" w={neu.hinweis} max={300} on={(x) => setNeu({ ...neu, hinweis: x })} />
        </div>
        <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy || !neu.name.trim()} onClick={() => void anlegen()}>＋ Kontrollpunkt</button>
      </div>

      {!hier.length && (
        <Leerzustand icon="📍" titel="Noch keine Kontrollpunkte"
          text="Kontrollpunkte sind die Stellen, die bei jedem Rundgang angelaufen werden — Tore, Notausgänge, Technikräume."
          schritte={['Name eintragen, „＋ Kontrollpunkt"', '„🖨 QR-Aufkleber drucken" und am Punkt anbringen', 'Reiter „Kontrollgang": Rundgang beginnen und scannen']} />
      )}

      {hier.length > 0 && (
        <div style={s.box}>
          <table style={s.tabelle}>
            <thead><tr><th style={s.th}>#</th><th style={s.th}>Name</th><th style={s.th}>Hinweis</th><th style={s.th}>Code</th><th style={s.th}></th></tr></thead>
            <tbody>
              {hier.map((p, i) => (
                <tr key={p.id} style={{ opacity: p.aktiv ? 1 : 0.5 }}>
                  <td style={s.td}>{i + 1}</td>
                  <td style={s.td}><input style={{ ...s.input, minWidth: 140 }} defaultValue={p.name} maxLength={120} onBlur={(e) => { if (e.target.value.trim() !== p.name) void umbenennen(p, 'name', e.target.value); }} /></td>
                  <td style={s.td}><input style={{ ...s.input, minWidth: 160 }} defaultValue={p.hinweis ?? ''} maxLength={300} placeholder="—" onBlur={(e) => { if (e.target.value.trim() !== (p.hinweis ?? '')) void umbenennen(p, 'hinweis', e.target.value); }} /></td>
                  <td style={{ ...s.td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{codeLesbar(p.code)}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button style={s.mini} disabled={busy || i === 0} onClick={() => void schieben(p, -1)}>↑</button>{' '}
                    <button style={s.mini} disabled={busy || i === hier.length - 1} onClick={() => void schieben(p, 1)}>↓</button>{' '}
                    <button style={s.mini} disabled={busy} onClick={() => void tu(supabase.from('wach_kontrollpunkt').update({ aktiv: !p.aktiv }).eq('id', p.id).select('id'), p.aktiv ? `„${p.name}" ausgeblendet.` : `„${p.name}" wieder aktiv.`)}>
                      {p.aktiv ? 'ausblenden' : 'aktivieren'}
                    </button>{' '}
                    {istChef && <button style={s.mini} disabled={busy} onClick={() => void entfernen(p)}>entfernen</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
