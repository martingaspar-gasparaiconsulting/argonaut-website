'use client';

// ============================================================
// ARGONAUT OS · Geräte-Akte (Paket PJ, B24)
// Ein Gerät, Werkzeug oder eine Maschine: Wer hat es gerade, seit wann, ist
// es defekt, wann ist die nächste Prüfung fällig — und die ganze Geschichte.
// Der QR-Code am Gerät führt hierher: scannen, "Ich nehme es mit",
// "Zurückgeben" oder "Defekt melden". Prüfung und Reparatur trägt der Chef
// ein; die Prüfung setzt die nächste Frist in der Inventar-Liste.
// Logik: lib/fuhrparkGeraete.ts (getestet). Kein KI-Aufruf.
//
// Pfad: app/dashboard/erp/inventar/[id]/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { heuteIso } from '@/lib/nachweisMotor';
import {
  GERAET_ARTEN, geraetArt, geraetStand, geraetHinweise, akteLink, qrSvg, datumDe, type GeraetEreignis,
} from '@/lib/fuhrparkGeraete';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const STUFE_FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, info: C.textDim };

type Geraet = {
  id: string; bezeichnung: string; inventarnummer: string | null; kategorie: string | null; seriennummer: string | null;
  standort: string | null; zustand: string | null; naechste_pruefung_am: string | null;
};
type Ereignis = GeraetEreignis & { id: string; bemerkung: string | null; erstellt_am: string };
const KNOPF: Record<string, string> = {
  ausgabe: 'An jemand anderen ausgeben', defekt: 'Defekt melden', standort: 'Standort ändern',
  notiz: 'Notiz', pruefung: 'Prüfung eintragen', reparatur: 'Repariert',
};
type Form = { art: string; datum: string; person_name: string; standort: string; bestanden: '' | 'ja' | 'nein'; naechste_pruefung_am: string; bemerkung: string };

export default function GeraetAkte() {
  const params = useParams();
  const id = String((params as Record<string, string | string[]>)?.id ?? '');
  const heute = heuteIso(new Date());
  const [uid, setUid] = useState<string | null>(null);
  const [meinName, setMeinName] = useState('');
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [g, setG] = useState<Geraet | null>(null);
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [origin, setOrigin] = useState('');

  const laden = useCallback(async () => {
    const [ge, er] = await Promise.all([
      supabase.from('inventar').select('id, bezeichnung, inventarnummer, kategorie, seriennummer, standort, zustand, naechste_pruefung_am').eq('id', id).maybeSingle(),
      supabase.from('geraet_ereignis').select('*').eq('inventar_id', id).order('datum', { ascending: false }).order('erstellt_am', { ascending: false }),
    ]);
    setG((ge.data as Geraet | null) ?? null);
    if (er.error) setFehler(/geraet_ereignis/.test(er.error.message) ? 'Die Geräte-Akte ist noch nicht eingerichtet (SQL von Paket PJ fehlt).' : 'Verlauf konnte nicht geladen werden.');
    setEreignisse((er.data as Ereignis[]) ?? []);
    setGeladen(true);
  }, [id]);

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUid(u?.id ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.email ?? '').split('@')[0]);
      try {
        const { data: chef } = await supabase.rpc('mein_chef_id');
        setIstMitarbeiter(!!chef && chef !== u?.id);
      } catch { /* Chef-Ansicht; RLS schuetzt ohnehin */ }
      await laden();
    })();
  }, [laden]);

  const stand = useMemo(() => geraetStand(ereignisse, heute, g?.standort, g?.naechste_pruefung_am), [ereignisse, heute, g]);
  const hinweise = useMemo(() => geraetHinweise(stand, heute), [stand, heute]);
  const qr = useMemo(() => {
    const link = origin ? akteLink(origin, 'geraet', id) : null;
    return link ? qrSvg(link).svg : null;
  }, [origin, id]);

  function neu(art: string) {
    setOk(null); setFehler(null);
    setForm({
      art, datum: heute, person_name: art === 'ausgabe' ? meinName : '', standort: '', bestanden: art === 'pruefung' ? 'ja' : '',
      naechste_pruefung_am: '', bemerkung: '',
    });
  }

  /** Ein-Klick: ich nehme es / ich gebe es zurück. */
  async function schnell(art: 'ausgabe' | 'rueckgabe') {
    await eintragen({ art, datum: heute, person_name: art === 'ausgabe' ? meinName : '', standort: '', bestanden: '', naechste_pruefung_am: '', bemerkung: '' });
  }

  async function eintragen(fm: Form): Promise<boolean> {
    if (!uid || !g) return false;
    const art = geraetArt(fm.art);
    if (!art) return false;
    if (fm.art === 'ausgabe' && !fm.person_name.trim()) { setFehler('An wen geht das Gerät?'); return false; }
    if (fm.art === 'defekt' && !fm.bemerkung.trim()) { setFehler('Bitte kurz beschreiben, was kaputt ist.'); return false; }
    if (fm.art === 'standort' && !fm.standort.trim()) { setFehler('Bitte den neuen Standort eintragen.'); return false; }
    if (fm.art === 'pruefung' && !fm.bestanden) { setFehler('Bestanden oder nicht bestanden?'); return false; }
    setBusy(true); setFehler(null);
    try {
      const zeile: Record<string, unknown> = {
        inventar_id: g.id, art: fm.art, datum: fm.datum || heute,
        person_name: fm.person_name.trim() || null, standort: fm.standort.trim() || null,
        bestanden: fm.art === 'pruefung' ? fm.bestanden === 'ja' : null,
        naechste_pruefung_am: fm.art === 'pruefung' ? (fm.naechste_pruefung_am || null) : null,
        bemerkung: fm.bemerkung.trim().slice(0, 1000) || null, erstellt_von: uid,
      };
      if (!istMitarbeiter) zeile.owner_user_id = uid;
      const { error } = await supabase.from('geraet_ereignis').insert(zeile);
      if (error) { setFehler('Speichern fehlgeschlagen.'); return false; }
      // Die Prüfung setzt die nächste Frist auch in der Inventar-Liste (nur Chef).
      if (fm.art === 'pruefung' && fm.naechste_pruefung_am && !istMitarbeiter) {
        const { error: e2 } = await supabase.from('inventar').update({ naechste_pruefung_am: fm.naechste_pruefung_am }).eq('id', g.id);
        if (e2) setFehler('Prüfung gespeichert, aber die Frist in der Inventar-Liste konnte nicht gesetzt werden.');
      }
      setOk(`${art.label}${fm.person_name.trim() && fm.art === 'ausgabe' ? ` — ${fm.person_name.trim()}` : ''}.`);
      await laden();
      return true;
    } finally { setBusy(false); }
  }

  async function formSpeichern() {
    if (!form) return;
    if (await eintragen(form)) setForm(null);
  }

  async function loeschen(e: Ereignis) {
    if (!window.confirm('Diesen Eintrag löschen?')) return;
    const { error } = await supabase.from('geraet_ereignis').delete().eq('id', e.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }

  if (geladen && !g) {
    return (
      <div style={s.page}>
        <a href="/dashboard/erp/inventar" style={s.zurueck}>← Inventar</a>
        <div style={{ ...s.card, marginTop: 16 }}>Dieses Gerät gibt es nicht oder Sie haben keinen Zugriff darauf.</div>
      </div>
    );
  }

  const binIchEs = !!stand.bei && stand.bei.toLowerCase() === meinName.toLowerCase();

  return (
    <div style={s.page}>
      <a href="/dashboard/erp/inventar" style={s.zurueck}>← Inventar</a>
      <div style={s.kopf}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={s.h1}>🧰 {g?.bezeichnung ?? '…'}</h1>
          <div style={s.dim}>{[g?.inventarnummer ? `Nr. ${g.inventarnummer}` : null, g?.kategorie, g?.seriennummer ? `SN ${g.seriennummer}` : null].filter(Boolean).join(' · ')}</div>
        </div>
        {qr && (
          <div style={{ textAlign: 'center' }}>
            <div style={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
            {!istMitarbeiter && <a href={`/dashboard/erp/etiketten?geraet=${id}`} style={{ ...s.dim, fontSize: 12 }}>🏷 Etikett drucken</a>}
          </div>
        )}
      </div>

      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={{ ...s.card, borderColor: stand.defekt ? C.danger : C.border }}>
        <div style={s.standZeile}>
          <div style={s.standBox}><div style={s.standLabel}>Wo ist es?</div><div style={s.standWert}>{stand.bei ? `bei ${stand.bei}` : (stand.standort ?? 'Standort unbekannt')}</div>{stand.bei && stand.seit && <div style={s.dim}>seit {datumDe(stand.seit)}</div>}</div>
          <div style={s.standBox}><div style={s.standLabel}>Zustand</div><div style={{ ...s.standWert, color: stand.defekt ? C.danger : C.green }}>{stand.defekt ? 'defekt' : 'einsatzbereit'}</div></div>
          <div style={s.standBox}><div style={s.standLabel}>Nächste Prüfung</div><div style={s.standWert}>{stand.naechstePruefung ? datumDe(stand.naechstePruefung) : '—'}</div>{stand.letztePruefung && <div style={s.dim}>zuletzt {datumDe(stand.letztePruefung)}</div>}</div>
        </div>
        {hinweise.map((h, i) => <div key={i} style={{ color: STUFE_FARBE[h.stufe], fontSize: 14 }}>{h.stufe === 'rot' ? '⛔ ' : h.stufe === 'gelb' ? '⚠️ ' : 'ℹ️ '}{h.text}</div>)}
      </div>

      <div style={s.knoepfe}>
        {!stand.bei && <button style={{ ...s.gross, opacity: busy ? 0.6 : 1 }} disabled={busy || !meinName} onClick={() => schnell('ausgabe')}>📤 Ich nehme es mit</button>}
        {stand.bei && <button style={{ ...s.gross, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => schnell('rueckgabe')}>📥 {binIchEs ? 'Ich gebe es zurück' : 'Zurückgegeben'}</button>}
        {GERAET_ARTEN.filter((a) => a.key !== 'rueckgabe' && (!istMitarbeiter || a.mitarbeiter)).map((a) => (
          <button key={a.key} style={s.schnell} onClick={() => neu(a.key)}>{a.icon} {KNOPF[a.key] ?? a.label}</button>
        ))}
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Verlauf</div>
        {ereignisse.length === 0 && <div style={s.dim}>Noch nichts eingetragen.</div>}
        {ereignisse.map((e) => {
          const a = geraetArt(e.art);
          return (
            <div key={e.id} style={s.zeile}>
              <div style={{ width: 88, color: C.textDim, fontSize: 13 }}>{datumDe(e.datum)}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{a?.icon} {a?.label ?? e.art}{e.art === 'pruefung' ? (e.bestanden ? ' · bestanden' : e.bestanden === false ? ' · nicht bestanden' : '') : ''}</div>
                <div style={{ fontSize: 13, color: C.textDim }}>
                  {[e.person_name, e.standort, e.naechste_pruefung_am ? `nächste Prüfung ${datumDe(e.naechste_pruefung_am)}` : null, e.bemerkung].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!istMitarbeiter && <button style={{ ...s.klein, color: C.danger }} onClick={() => loeschen(e)}>🗑</button>}
            </div>
          );
        })}
      </div>

      {form && (
        <div style={s.schleier} onClick={() => setForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{geraetArt(form.art)?.icon} {geraetArt(form.art)?.label}</div>
            <label style={s.lab}>Datum<input type="date" style={s.inp} value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
            {form.art === 'ausgabe' && <label style={s.lab}>An wen?<input style={s.inp} value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} /></label>}
            {form.art === 'pruefung' && <label style={s.lab}>Prüfer<input style={s.inp} value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} /></label>}
            {(form.art === 'standort' || form.art === 'rueckgabe') && <label style={s.lab}>Standort<input style={s.inp} value={form.standort} onChange={(e) => setForm({ ...form, standort: e.target.value })} placeholder="z. B. Lager Halle 2, Fahrzeug BB-AB 123" /></label>}
            {form.art === 'pruefung' && (
              <div style={s.row}>
                <label style={{ ...s.lab, flex: 1 }}>Ergebnis<select style={s.inp} value={form.bestanden} onChange={(e) => setForm({ ...form, bestanden: e.target.value as Form['bestanden'] })}>
                  <option value="ja">bestanden</option><option value="nein">nicht bestanden (sperren)</option>
                </select></label>
                <label style={{ ...s.lab, flex: 1 }}>Nächste Prüfung<input type="date" style={s.inp} value={form.naechste_pruefung_am} onChange={(e) => setForm({ ...form, naechste_pruefung_am: e.target.value })} /></label>
              </div>
            )}
            <label style={s.lab}>{form.art === 'defekt' ? 'Was ist kaputt?' : 'Bemerkung'}<textarea style={{ ...s.inp, minHeight: 60 }} value={form.bemerkung} onChange={(e) => setForm({ ...form, bemerkung: e.target.value })} /></label>
            {form.art === 'pruefung' && <div style={s.dim}>Elektrische Geräte: Prüffristen nach DGUV Vorschrift 3 und Gefährdungsbeurteilung (Richtwerte in „Nachweise &amp; Fristen").</div>}
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={formSpeichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13, textDecoration: 'none' },
  kopf: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  qr: { width: 96, height: 96, background: '#fff', borderRadius: 8, padding: 4 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  standZeile: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  standBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  standLabel: { color: C.textDim, fontSize: 12 },
  standWert: { fontSize: 18, fontWeight: 800, marginTop: 2 },
  knoepfe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 },
  gross: { background: C.gold, color: C.navy, border: 'none', borderRadius: 12, padding: '14px 20px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  schnell: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8, flexWrap: 'wrap' },
  dim: { color: C.textDim, fontSize: 13.5, marginTop: 2 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  schleier: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflowY: 'auto', zIndex: 50 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
