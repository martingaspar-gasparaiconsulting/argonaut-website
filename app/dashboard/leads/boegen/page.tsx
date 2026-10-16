'use client';

// ============================================================================
// ARGONAUT OS · Paket VK2 (16.10.2026) — Qualifizierungsbögen je Angebot.
// Die Geschäftsleitung legt Bögen an: Standardfragen (Bedarf, Budget,
// Entscheider, Zeitpunkt) wahlweise plus eigene Fragen (Text, Auswahl, Zahl,
// Ja/Nein, Pflicht). Das Team füllt sie am Lead aus (QualiBox).
// Logik: lib/qualifizierung.ts. Regeln: SQL p408 (nur Geschäftsleitung schreibt).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import { C, s } from '../../bestattung/bestattungUi';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import { STANDARD_FRAGEN, fragenBereinigen, frageKey, type Frage, type FrageTyp } from '@/lib/qualifizierung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

type Bogen = { id: string; name: string; angebot: string | null; mit_standard: boolean; fragen: unknown; aktiv: boolean };
type Entwurf = { id: string | null; name: string; angebot: string; mit_standard: boolean; aktiv: boolean; fragen: (Frage & { optText?: string })[] };
const LEER: Entwurf = { id: null, name: '', angebot: '', mit_standard: true, aktiv: true, fragen: [] };
const TYP_TEXT: Record<FrageTyp, string> = { text: 'Freitext', auswahl: 'Auswahl', zahl: 'Zahl', janein: 'Ja / Nein' };

export default function BoegenPage() {
  const [boegen, setBoegen] = useState<Bogen[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [ok, setOk] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    setIstChef(!(typeof chef === 'string' && chef && chef !== me));
    const { data, error } = await supabase.from('vk_bogen').select('id, name, angebot, mit_standard, fragen, aktiv').order('name');
    if (error) { setSqlFehlt(/vk_bogen/.test(error.message)); setLaden(false); return; }
    setBoegen((data as Bogen[]) ?? []);
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  function bearbeiten(b: Bogen) {
    setOk(null); setFehler(null);
    setEntwurf({ id: b.id, name: b.name, angebot: b.angebot ?? '', mit_standard: b.mit_standard, aktiv: b.aktiv,
      fragen: fragenBereinigen(b.fragen).map((f) => ({ ...f, optText: (f.optionen ?? []).join('\n') })) });
  }

  function frageNeu() {
    if (!entwurf) return;
    setEntwurf({ ...entwurf, fragen: [...entwurf.fragen, { key: '', frage: '', typ: 'text', pflicht: false, optText: '' }] });
  }
  function frageSetzen(i: number, teil: Partial<Frage & { optText?: string }>) {
    if (!entwurf) return;
    setEntwurf({ ...entwurf, fragen: entwurf.fragen.map((f, j) => (j === i ? { ...f, ...teil } : f)) });
  }

  async function speichern() {
    if (!entwurf) return;
    setOk(null); setFehler(null);
    if (!entwurf.name.trim()) { setFehler('Bitte dem Bogen einen Namen geben.'); return; }
    const vergeben: string[] = [];
    const roh = entwurf.fragen.map((f) => {
      const key = f.key || frageKey(f.frage, vergeben);
      vergeben.push(key);
      return { key, frage: f.frage, typ: f.typ, pflicht: f.pflicht === true, optionen: f.typ === 'auswahl' ? (f.optText ?? '').split('\n') : undefined };
    });
    const fragen = fragenBereinigen(roh);
    const verloren = entwurf.fragen.filter((f) => f.frage.trim()).length - fragen.length;
    if (verloren > 0) { setFehler('Eine Auswahl-Frage braucht mindestens zwei Möglichkeiten (je Zeile eine).'); return; }
    if (!entwurf.mit_standard && fragen.length === 0) { setFehler('Ohne Standardfragen braucht der Bogen mindestens eine eigene Frage.'); return; }
    setBusy(true);
    try {
      const zeile = { name: entwurf.name.trim(), angebot: entwurf.angebot.trim() || null, mit_standard: entwurf.mit_standard, aktiv: entwurf.aktiv, fragen, aktualisiert_am: new Date().toISOString() };
      const res = entwurf.id
        ? await supabase.from('vk_bogen').update(zeile).eq('id', entwurf.id).select('id')
        : await supabase.from('vk_bogen').insert(zeile).select('id');
      if (res.error || nichtsGeschrieben(res.data)) { setFehler('Nicht gespeichert — Bögen legt nur die Geschäftsleitung an.'); return; }
      setOk('Bogen gespeichert. Er steht am Lead unter „🎯 Qualifizierung" zur Auswahl.');
      setEntwurf(null); await lade();
    } finally { setBusy(false); }
  }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 6 }}><Link href="/dashboard/leads/team" style={{ color: C.dim, fontSize: 13 }}>← Verkaufsteam</Link></div>
      <h1 style={s.h1}>📋 Qualifizierungsbögen</h1>
      <p style={s.dim}>
        So geht&apos;s: Je Angebot ein Bogen mit den Fragen, die der Setter im ersten Gespräch klärt. Die vier Standardfragen (Bedarf, Budget,
        Entscheider, Zeitpunkt) sind vorbelegt, eigene Fragen kommen dazu. Am Lead wählt der Setter den Bogen, füllt ihn aus und entscheidet:
        „Passt" übergibt an einen Closer (mit Glocke und Spickzettel), „Passt nicht" schließt den Lead mit Grund ab.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Noch nicht eingerichtet (SQL von Paket VK2 fehlt).</div>}

      {!sqlFehlt && !laden && (<>
        <div style={s.box}>
          <b>Standard-Bogen (immer verfügbar)</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {STANDARD_FRAGEN.map((f) => <li key={f.key}>{f.frage}{f.optionen ? ` (${f.optionen.join(' · ')})` : ''}</li>)}
          </ul>
        </div>

        {boegen.length === 0 && !entwurf ? (
          <Leerzustand icon="📋" titel="Noch kein eigener Bogen"
            text="Ohne eigenen Bogen nutzt das Team den Standard-Bogen. Eigene Bögen lohnen sich, wenn Sie je Angebot andere Dinge klären."
            schritte={['„Neuer Bogen" klicken', 'Angebot und eigene Fragen eintragen', 'Am Lead den Bogen wählen']}
            {...(istChef ? { aktionText: 'Neuer Bogen', onAktion: () => setEntwurf({ ...LEER }) } : {})} />
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Bogen</th><th style={s.th}>Angebot</th><th style={s.th}>Fragen</th><th style={s.th}>aktiv</th><th style={s.th}></th></tr></thead>
              <tbody>{boegen.map((b) => (
                <tr key={b.id} style={{ opacity: b.aktiv ? 1 : 0.55 }}>
                  <td style={s.td}>{b.name}</td><td style={s.td}>{b.angebot || '—'}</td>
                  <td style={s.td}>{(b.mit_standard ? STANDARD_FRAGEN.length : 0) + fragenBereinigen(b.fragen).length}</td>
                  <td style={s.td}>{b.aktiv ? 'ja' : 'nein'}</td>
                  <td style={s.td}>{istChef && <button style={s.mini} onClick={() => bearbeiten(b)}>bearbeiten</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {istChef && !entwurf && boegen.length > 0 && <button style={{ ...s.btnGold, marginTop: 12 }} onClick={() => setEntwurf({ ...LEER })}>+ Neuer Bogen</button>}
        {!istChef && <p style={s.klein}>Bögen legt die Geschäftsleitung an.</p>}

        {entwurf && (
          <div style={{ ...s.box, marginTop: 14, display: 'grid', gap: 10 }}>
            <b>{entwurf.id ? 'Bogen bearbeiten' : 'Neuer Bogen'}</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label style={s.dim}>Name *<input style={s.input} maxLength={120} value={entwurf.name} onChange={(e) => setEntwurf({ ...entwurf, name: e.target.value })} placeholder="z. B. Badsanierung" /></label>
              <label style={s.dim}>Angebot (freiwillig)<input style={s.input} maxLength={120} value={entwurf.angebot} onChange={(e) => setEntwurf({ ...entwurf, angebot: e.target.value })} placeholder="z. B. Komplettbad" /></label>
            </div>
            <label style={{ fontSize: 14 }}><input type="checkbox" checked={entwurf.mit_standard} onChange={(e) => setEntwurf({ ...entwurf, mit_standard: e.target.checked })} /> Standardfragen mit abfragen</label>
            <label style={{ fontSize: 14 }}><input type="checkbox" checked={entwurf.aktiv} onChange={(e) => setEntwurf({ ...entwurf, aktiv: e.target.checked })} /> aktiv (am Lead wählbar)</label>
            {entwurf.fragen.map((f, i) => (
              <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 150px', gap: 8 }}>
                  <input style={s.input} maxLength={200} value={f.frage} onChange={(e) => frageSetzen(i, { frage: e.target.value })} placeholder="Frage, z. B. Wie groß ist das Bad (m²)?" />
                  <select style={s.input} value={f.typ} onChange={(e) => frageSetzen(i, { typ: e.target.value as FrageTyp })}>
                    {(Object.keys(TYP_TEXT) as FrageTyp[]).map((t) => <option key={t} value={t}>{TYP_TEXT[t]}</option>)}
                  </select>
                </div>
                {f.typ === 'auswahl' && <textarea style={{ ...s.input, minHeight: 70 }} value={f.optText ?? ''} onChange={(e) => frageSetzen(i, { optText: e.target.value })} placeholder={'Möglichkeiten, je Zeile eine\nz. B. bis 5 m²\n5–10 m²\nüber 10 m²'} />}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={f.pflicht === true} onChange={(e) => frageSetzen(i, { pflicht: e.target.checked })} /> Pflicht vor der Übergabe</label>
                  <button style={s.mini} onClick={() => setEntwurf({ ...entwurf, fragen: entwurf.fragen.filter((_, j) => j !== i) })}>entfernen</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={s.mini} onClick={frageNeu}>+ Eigene Frage</button>
              <button style={s.btnGold} disabled={busy} onClick={() => void speichern()}>Bogen speichern</button>
              <button style={s.btnAus} onClick={() => setEntwurf(null)}>Abbrechen</button>
            </div>
            <p style={s.klein}>Bögen werden nicht gelöscht, nur auf „inaktiv" gesetzt — sonst fehlten bei alten Leads die Fragen zu den Antworten.</p>
          </div>
        )}
      </>)}
    </div>
  );
}
