'use client';

// ============================================================
// ARGONAUT OS · Paket 353 (13.10.2026) · Wachbuch je Objekt
// Nur anhängen: Zeit und Name setzt die Datenbank; ändern oder löschen kann
// niemand — Korrekturen sind ein Nachtrag direkt unter dem Original.
// ============================================================

import { useState } from 'react';
import {
  WACHBUCH_ARTEN, TEXT_MAX, eintragPruefen, nachtraegeJe, artName, artStufe, zeitDe,
  type Eintrag,
} from '@/lib/bewachung';
import Leerzustand from '../_components/Leerzustand';
import { C, STUFE_FARBE, s, schreiben, type Db, type Objekt, type Melde } from './bewachungUi';

export default function Wachbuch({ supabase, objekt, eintraege, laufenderRundgang, melde, onGeaendert }: {
  supabase: Db; objekt: Objekt; eintraege: Eintrag[]; laufenderRundgang: string | null; melde: Melde; onGeaendert: () => Promise<void>;
}) {
  const [art, setArt] = useState('meldung');
  const [text, setText] = useState('');
  const [ereignis, setEreignis] = useState('');
  const [nachZu, setNachZu] = useState<string | null>(null);
  const [nachText, setNachText] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  async function eintragen() {
    const ereignis_am = ereignis ? new Date(ereignis).toISOString() : null;
    const p = eintragPruefen({ art, text, ereignis_am }, Date.now());
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wachbuch_eintrag').insert({
        objekt_id: objekt.id, art, text: text.trim(), ereignis_am, rundgang_id: laufenderRundgang,
      }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      setText(''); setEreignis(''); setArt('meldung');
      melde(null, `${artName(art)} im Wachbuch festgehalten.`);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function nachtragen(bezug: Eintrag) {
    const p = eintragPruefen({ art: 'nachtrag', text: nachText, bezug_id: bezug.id }, Date.now());
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wachbuch_eintrag').insert({ objekt_id: objekt.id, art: 'nachtrag', text: nachText.trim(), bezug_id: bezug.id }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      setNachZu(null); setNachText('');
      melde(null, 'Nachtrag festgehalten — er steht direkt unter dem Eintrag.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  const nach = nachtraegeJe(eintraege);
  const q = filter.trim().toLowerCase();
  const haupt = eintraege
    .filter((e) => e.art !== 'nachtrag')
    .filter((e) => !q || [e.text, e.erfasst_name, artName(e.art), ...(nach.get(e.id) ?? []).map((n) => n.text)].some((x) => String(x ?? '').toLowerCase().includes(q)));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={s.box}>
        <b style={{ color: C.gold }}>Neuer Eintrag · {objekt.bezeichnung ?? 'Objekt'}</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
          {WACHBUCH_ARTEN.filter((a) => a.key !== 'nachtrag').map((a) => (
            <button key={a.key} style={art === a.key ? s.reiterAn : s.reiterAus} onClick={() => setArt(a.key)}>{a.zeichen} {a.name}</button>
          ))}
        </div>
        <textarea style={{ ...s.input, width: '100%', minHeight: 90, boxSizing: 'border-box' }} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Was war? Wer, was, wo — sachlich und vollständig." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
          <label style={s.feld}>Zeitpunkt des Ereignisses (falls früher als jetzt)
            <input style={s.input} type="datetime-local" value={ereignis} onChange={(e) => setEreignis(e.target.value)} />
          </label>
          <button style={s.btnGold} disabled={busy || !text.trim()} onClick={() => void eintragen()}>Ins Wachbuch eintragen</button>
        </div>
        <p style={s.klein}>
          Zeitpunkt der Erfassung und Name setzt ARGONAUT automatisch. Ein Eintrag lässt sich danach nicht mehr ändern oder löschen —
          Korrekturen kommen als „Nachtrag" zum Eintrag.{laufenderRundgang ? ' Der Eintrag wird mit dem laufenden Rundgang verknüpft.' : ''}
        </p>
      </div>

      {eintraege.length > 0 && (
        <input style={{ ...s.input, maxWidth: 360 }} placeholder="Im Wachbuch suchen" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {!eintraege.length && (
        <Leerzustand icon="📒" titel="Noch keine Einträge in diesem Objekt"
          text="Das Wachbuch hält Meldungen, Vorkommnisse, Schichtübergaben, Schäden und Einsätze von Polizei, Feuerwehr oder Rettung fest — mit Zeit und Namen, unveränderbar."
          schritte={['Art wählen (z. B. Vorkommnis)', 'Beschreiben, was war', '„Ins Wachbuch eintragen"']} />
      )}
      {eintraege.length > 0 && !haupt.length && <p style={s.dim}>Keine Treffer.</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {haupt.map((e) => {
          const farbe = STUFE_FARBE[artStufe(e.art)] ?? C.dim;
          return (
            <div key={e.id} style={s.karte}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...s.pill, color: farbe, borderColor: farbe }}>{artName(e.art)}</span>
                <span style={s.klein}>{zeitDe(e.erfasst_am)} · {e.erfasst_name ?? '—'}{e.ereignis_am ? ` · Ereignis ${zeitDe(e.ereignis_am)}` : ''}{e.rundgang_id ? ' · beim Rundgang' : ''}</span>
                <span style={{ flex: 1 }} />
                <button style={s.mini} onClick={() => { setNachZu(nachZu === e.id ? null : e.id); setNachText(''); }}>✎ Nachtrag</button>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: 14 }}>{e.text}</div>
              {(nach.get(e.id) ?? []).map((n) => (
                <div key={n.id} style={{ ...s.innen, marginTop: 6 }}>
                  <div style={s.klein}>Nachtrag · {zeitDe(n.erfasst_am)} · {n.erfasst_name ?? '—'}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{n.text}</div>
                </div>
              ))}
              {nachZu === e.id && (
                <div style={{ marginTop: 8 }}>
                  <textarea style={{ ...s.input, width: '100%', minHeight: 60, boxSizing: 'border-box' }} maxLength={TEXT_MAX} value={nachText} onChange={(x) => setNachText(x.target.value)}
                    placeholder="Ergänzung oder Korrektur — das Original bleibt sichtbar." />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button style={s.btnGold} disabled={busy || !nachText.trim()} onClick={() => void nachtragen(e)}>Nachtrag festhalten</button>
                    <button style={s.btnAus} onClick={() => setNachZu(null)}>Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {eintraege.length >= 500 && <p style={s.klein}>Angezeigt sind die letzten 500 Einträge. Ältere enthält der Nachweis (Reiter „Nachweis").</p>}
    </div>
  );
}
