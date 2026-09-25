'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · Nutzungsrechte (Agentur & Kreativ)
//   Je Werk: welches Recht hat der Kunde (einfach/ausschließlich, Gebiet,
//   Nutzungsarten, Zeitraum) — und welches Recht hat die Agentur selbst vom
//   Urheber (Fotograf, Freelancer, Bilddatenbank). Warnung vor Ablauf und
//   wenn mehr eingeräumt wird, als man selbst hat. Rechteklausel zum Kopieren.
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// Unterpfad von /dashboard/agentur (erbt dessen Freigabe). Löschen nur der Chef.
// Pfad: app/dashboard/agentur/nutzungsrechte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { MEDIEN, nutzungsStand, rechteKlausel, datumDe, heuteBerlin, euroText, type Nutzungsrecht } from '@/lib/papiereIdentifizierung';
import { leseZahl, zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap', alignItems: 'flex-start' };
const FARBE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type Recht = Nutzungsrecht & { id: string; retainer_id: string | null; werkart: string | null; verguetung: number | null; notiz: string | null };
type Retainer = { id: string; kunde_name: string | null; bezeichnung: string };
const LEER = { id: '', retainer_id: '', kunde: '', werk: '', werkart: 'Foto', recht: 'einfach' as 'einfach' | 'ausschliesslich', raum: 'Deutschland', medien: [] as string[], von: heuteBerlin(), bis: '', bearbeitung: false, weiterlizenz: false, urheber: '', fremd_recht: '' as '' | 'einfach' | 'ausschliesslich', fremd_bis: '', fremd_medien: [] as string[], verguetung: '', notiz: '' };

export default function NutzungsrechteSeite() {
  const heute = heuteBerlin();
  const [liste, setListe] = useState<Recht[]>([]);
  const [retainer, setRetainer] = useState<Retainer[]>([]);
  const [agentur, setAgentur] = useState('');
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState<typeof LEER | null>(null);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'alle' | 'handeln'>('handeln');

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('agentur_nutzungsrecht').select('*').order('bis', { ascending: true, nullsFirst: false }).limit(2000);
    if (r.error) { if (/agentur_nutzungsrecht/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setListe((r.data as Recht[]) ?? []);
    const k = await supabase.from('agentur_retainer').select('id, kunde_name, bezeichnung').order('kunde_name', { ascending: true });
    setRetainer((k.data as Retainer[]) ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === data?.user?.id);
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || data?.user?.id || '').maybeSingle();
        setAgentur(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  const alsRecht = (x: typeof LEER): Nutzungsrecht => ({ ...x, fremd_recht: x.fremd_recht || null, bis: x.bis || null, von: x.von || null, fremd_bis: x.fremd_bis || null });
  const mitStand = liste.map((r) => ({ r, stand: nutzungsStand(r, heute) }));
  const anzeigen = mitStand.filter((x) => filter === 'alle' || x.stand.some((s) => s.stufe !== 'ok'));

  async function speichern() {
    if (!f) return;
    if (!f.werk.trim()) { setFehler('Werk benennen.'); return; }
    const daten = {
      retainer_id: f.retainer_id || null, kunde: f.kunde.trim() || retainer.find((r) => r.id === f.retainer_id)?.kunde_name || null, werk: f.werk.trim(), werkart: f.werkart || null,
      recht: f.recht, raum: f.raum.trim() || null, medien: f.medien, von: f.von || null, bis: f.bis || null, bearbeitung: f.bearbeitung, weiterlizenz: f.weiterlizenz,
      urheber: f.urheber.trim() || null, fremd_recht: f.fremd_recht || null, fremd_bis: f.fremd_bis || null, fremd_medien: f.fremd_medien,
      verguetung: f.verguetung.trim() ? leseZahl(f.verguetung) : null, notiz: f.notiz.trim() || null,
    };
    const { error } = f.id ? await supabase.from('agentur_nutzungsrecht').update(daten).eq('id', f.id) : await supabase.from('agentur_nutzungsrecht').insert(daten);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Gespeichert.'); setF(null); await laden();
  }
  async function loeschen(r: Recht) {
    if (!window.confirm(`„${r.werk}" löschen?`)) return;
    const { error } = await supabase.from('agentur_nutzungsrecht').delete().eq('id', r.id);
    if (error) { setFehler('Löschen fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  const medienWahl = (wert: string[], setzen: (m: string[]) => void) => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13.5 }}>{MEDIEN.map((m) => <label key={m}><input type="checkbox" checked={wert.includes(m)} onChange={(e) => setzen(e.target.checked ? [...wert, m] : wert.filter((x) => x !== m))} /> {m}</label>)}</div>
  );

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Agentur & Kreativ</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>©️ Nutzungsrechte</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Wer darf welches Werk wo und bis wann nutzen — und haben Sie selbst die Rechte dafür? <a href="/dashboard/agentur" style={{ color: C.cyan }}>← Zur Agentur</a></p>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Nutzungsrechte sind noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && !f && (
        <div style={karte}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={primaer} onClick={() => { setF({ ...LEER }); setText(''); }}>＋ Werk erfassen</button>
            {([['handeln', 'Handlungsbedarf'], ['alle', 'Alle']] as const).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ ...knopf, ...(filter === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{l}</button>)}
          </div>
          {anzeigen.length === 0 && <div style={{ color: C.green, marginTop: 8 }}>{filter === 'handeln' ? 'Kein Handlungsbedarf.' : 'Noch keine Werke erfasst.'}</div>}
          {anzeigen.map(({ r, stand }) => (
            <div key={r.id} style={zeile}>
              <span style={{ flex: '1 1 460px' }}>
                <b>{r.werk}</b> · {r.kunde ?? '—'} · {r.recht === 'ausschliesslich' ? 'ausschließlich' : 'einfach'} · {r.raum ?? '—'} · {(r.medien ?? []).join(', ') || 'keine Nutzungsarten'}{r.verguetung != null ? ` · ${euroText(Number(r.verguetung))}` : ''}
                {stand.map((s, i) => <div key={i} style={{ color: FARBE[s.stufe], fontSize: 13 }}>{s.text}</div>)}
                {r.urheber && <div style={{ color: C.textDim, fontSize: 12.5 }}>Urheber: {r.urheber}{r.fremd_recht ? ` · eigenes Recht ${r.fremd_recht}` : ''}{r.fremd_bis ? ` bis ${datumDe(r.fremd_bis)}` : ''}</div>}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setText(rechteKlausel(r, agentur))}>📄 Klausel</button>
                <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setF({ ...LEER, id: r.id, retainer_id: r.retainer_id ?? '', kunde: r.kunde ?? '', werk: r.werk, werkart: r.werkart ?? '', recht: r.recht, raum: r.raum ?? '', medien: r.medien ?? [], von: r.von ?? '', bis: r.bis ?? '', bearbeitung: !!r.bearbeitung, weiterlizenz: !!r.weiterlizenz, urheber: r.urheber ?? '', fremd_recht: r.fremd_recht ?? '', fremd_bis: r.fremd_bis ?? '', fremd_medien: r.fremd_medien ?? [], verguetung: r.verguetung == null ? '' : zahlFeld(r.verguetung).replace('.', ','), notiz: r.notiz ?? '' })}>bearbeiten</button>
                {istChef && <button style={{ ...knopf, padding: '3px 8px', color: C.danger }} onClick={() => loeschen(r)}>✕</button>}
              </span>
            </div>
          ))}
          {text && (
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...feld, width: '100%', minHeight: 170 }} value={text} onChange={(e) => setText(e.target.value)} />
              <button style={{ ...knopf, marginTop: 6 }} onClick={() => { if (/\[[^\]]+\]/.test(text)) { setFehler('Bitte zuerst alle [Platzhalter] ausfüllen.'); return; } navigator.clipboard?.writeText(text); setOk('Klausel kopiert.'); }}>📋 Kopieren</button>
            </div>
          )}
        </div>
      )}

      {f && (
        <div style={karte}>
          <b>{f.id ? 'Werk bearbeiten' : 'Werk erfassen'}</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
            <label>Werk<br /><input style={{ ...feld, width: 260 }} value={f.werk} onChange={(e) => setF({ ...f, werk: e.target.value })} placeholder="z. B. Imagefotos Frühjahr" /></label>
            <label>Art<br /><select style={feld} value={f.werkart} onChange={(e) => setF({ ...f, werkart: e.target.value })}>{['Foto', 'Text', 'Design/Logo', 'Video', 'Musik', 'Illustration', 'Software'].map((x) => <option key={x}>{x}</option>)}</select></label>
            {retainer.length > 0 && <label>Kunde<br /><select style={feld} value={f.retainer_id} onChange={(e) => setF({ ...f, retainer_id: e.target.value })}><option value="">— frei eintragen —</option>{retainer.map((r) => <option key={r.id} value={r.id}>{r.kunde_name ?? r.bezeichnung}</option>)}</select></label>}
            {!f.retainer_id && <label>Kunde (frei)<br /><input style={feld} value={f.kunde} onChange={(e) => setF({ ...f, kunde: e.target.value })} /></label>}
            <label>Recht<br /><select style={feld} value={f.recht} onChange={(e) => setF({ ...f, recht: e.target.value as typeof f.recht })}><option value="einfach">einfach</option><option value="ausschliesslich">ausschließlich</option></select></label>
            <label>Gebiet<br /><input style={{ ...feld, width: 150 }} value={f.raum} onChange={(e) => setF({ ...f, raum: e.target.value })} /></label>
            <label>von<br /><input type="date" style={feld} value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></label>
            <label>bis (leer = unbefristet)<br /><input type="date" style={feld} value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></label>
            <label>Vergütung €<br /><input style={{ ...feld, width: 110 }} value={f.verguetung} onChange={(e) => setF({ ...f, verguetung: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 10 }}><b style={{ fontSize: 13.5 }}>Nutzungsarten für den Kunden</b>{medienWahl(f.medien, (m) => setF({ ...f, medien: m }))}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13.5 }}>
            <label><input type="checkbox" checked={f.bearbeitung} onChange={(e) => setF({ ...f, bearbeitung: e.target.checked })} /> Bearbeitung erlaubt</label>
            <label><input type="checkbox" checked={f.weiterlizenz} onChange={(e) => setF({ ...f, weiterlizenz: e.target.checked })} /> Weitergabe an Dritte erlaubt</label>
          </div>
          <div style={{ marginTop: 12 }}><b style={{ fontSize: 13.5 }}>Ihr eigenes Recht vom Urheber (falls fremd erstellt)</b></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
            <label>Urheber / Quelle<br /><input style={{ ...feld, width: 220 }} value={f.urheber} onChange={(e) => setF({ ...f, urheber: e.target.value })} placeholder="Fotograf, Bilddatenbank …" /></label>
            <label>Recht<br /><select style={feld} value={f.fremd_recht} onChange={(e) => setF({ ...f, fremd_recht: e.target.value as typeof f.fremd_recht })}><option value="">—</option><option value="einfach">einfach</option><option value="ausschliesslich">ausschließlich</option></select></label>
            <label>bis<br /><input type="date" style={feld} value={f.fremd_bis} onChange={(e) => setF({ ...f, fremd_bis: e.target.value })} /></label>
          </div>
          {f.urheber.trim() && <div style={{ marginTop: 6 }}>{medienWahl(f.fremd_medien, (m) => setF({ ...f, fremd_medien: m }))}</div>}
          <label style={{ display: 'block', marginTop: 8 }}>Notiz<br /><input style={{ ...feld, width: '100%' }} value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} /></label>
          {nutzungsStand(alsRecht(f), heute).filter((s) => s.stufe !== 'ok').map((s, i) => <div key={i} style={{ color: FARBE[s.stufe], fontSize: 13.5, marginTop: 4 }}>{s.text}</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button style={primaer} onClick={speichern}>💾 Speichern</button><button style={knopf} onClick={() => setF(null)}>Abbrechen</button></div>
        </div>
      )}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>Nutzungsarten konkret benennen: Was nicht ausdrücklich eingeräumt ist, gilt im Zweifel als nicht übertragen (§ 31 Abs. 5 UrhG). Keine Rechtsberatung.</p>
    </div>
  );
}
