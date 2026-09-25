'use client';

// ============================================================
// ARGONAUT OS · Paket PS4 · Ehrenamt (Verein)
//   Ehrenamtsstunden je Person erfassen und auswerten (auch für Förderanträge
//   und Jahresbericht), Zahlungen aus Übungsleiter- (3.300 €) und
//   Ehrenamtspauschale (960 €) je Person und Jahr überwachen, Bescheinigung.
// Logik: lib/versammlungObjekte.ts (getestet). SQL: supabase-sql/ps4-versammlungen-objekte.sql.
// Unterpfad von /dashboard/verein (erbt dessen Freigabe). Pauschalen per RLS nur Chef.
// Pfad: app/dashboard/verein/ehrenamt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  PAUSCHALEN, PAUSCHALEN_HINWEIS, pauschalenStand, stundenAuswertung, ehrenamtsNachweis, heuteBerlin, datumDe, euroText,
  type PauschaleArt,
} from '@/lib/versammlungObjekte';

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
const STUFE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

type Mitglied = { id: string; name: string; status: string | null };
type Eintrag = { id: string; person: string; mitglied_id: string | null; datum: string; stunden: number; taetigkeit: string | null };
type Pauschale = { id: string; person: string; mitglied_id: string | null; datum: string; betrag: number; art: PauschaleArt; notiz: string | null };

function zahlAus(s: string): number | null {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}

export default function EhrenamtSeite() {
  const heute = heuteBerlin();
  const [tab, setTab] = useState<'stunden' | 'pauschalen'>('stunden');
  const [jahr, setJahr] = useState(Number(heute.slice(0, 4)));
  const [mitglieder, setMitglieder] = useState<Mitglied[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [pauschalen, setPauschalen] = useState<Pauschale[]>([]);
  const [istChef, setIstChef] = useState(true);
  const [verein, setVerein] = useState('');
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ne, setNe] = useState({ mitglied_id: '', person: '', datum: heute, stunden: '', taetigkeit: '' });
  const [np, setNp] = useState({ mitglied_id: '', person: '', datum: heute, betrag: '', art: 'ehrenamt' as PauschaleArt });
  const [text, setText] = useState('');

  const laden = useCallback(async () => {
    setFehler(null);
    const e = await supabase.from('verein_ehrenamt').select('*').order('datum', { ascending: false });
    if (e.error) { if (/verein_ehrenamt/.test(e.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + e.error.message); return; }
    setEintraege((e.data as Eintrag[]) ?? []);
    const [m, p] = await Promise.all([
      supabase.from('verein_mitglieder').select('id, name, status').order('name', { ascending: true }),
      supabase.from('verein_pauschale').select('*').order('datum', { ascending: false }),
    ]);
    setMitglieder((m.data as Mitglied[]) ?? []);
    setPauschalen((p.data as Pauschale[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || id || '').maybeSingle();
        setVerein(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  const auswertung = useMemo(() => stundenAuswertung(eintraege, jahr), [eintraege, jahr]);
  const zahlungen = useMemo(() => pauschalen.map((p) => ({ person: p.person, jahr: Number(p.datum.slice(0, 4)), art: p.art, betrag: Number(p.betrag) || 0 })), [pauschalen]);
  const personenMitZahlung = Array.from(new Set(pauschalen.filter((p) => p.datum.startsWith(String(jahr))).map((p) => p.person))).sort();
  const maxMonat = Math.max(1, ...auswertung.jeMonat);

  function personAus(mid: string, frei: string): string {
    return mitglieder.find((m) => m.id === mid)?.name ?? frei.trim();
  }

  async function stundeAnlegen() {
    const person = personAus(ne.mitglied_id, ne.person);
    const h = zahlAus(ne.stunden);
    if (!person || h == null || h <= 0 || h > 24) { setFehler('Person und Stunden (0–24) angeben.'); return; }
    const { error } = await supabase.from('verein_ehrenamt').insert({ mitglied_id: ne.mitglied_id || null, person, datum: ne.datum, stunden: h, taetigkeit: ne.taetigkeit.trim() || null });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Stunden erfasst.'); setNe({ ...ne, stunden: '', taetigkeit: '' }); await laden();
  }
  async function pauschaleAnlegen() {
    const person = personAus(np.mitglied_id, np.person);
    const b = zahlAus(np.betrag);
    if (!person || b == null || b <= 0) { setFehler('Person und Betrag angeben.'); return; }
    const vorher = pauschalenStand(zahlungen, person, Number(np.datum.slice(0, 4))).find((x) => x.art === np.art);
    if (vorher && b > vorher.rest && !window.confirm(`Damit wird die ${vorher.label} (${euroText(vorher.grenze)}) für ${person} um ${euroText(b - vorher.rest)} überschritten. Der Mehrbetrag ist nicht steuerfrei. Trotzdem speichern?`)) return;
    const { error } = await supabase.from('verein_pauschale').insert({ mitglied_id: np.mitglied_id || null, person, datum: np.datum, betrag: b, art: np.art });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Zahlung erfasst.'); setNp({ ...np, betrag: '' }); await laden();
  }

  const personWahl = (wert: { mitglied_id: string; person: string }, setzen: (m: string, p: string) => void) => (
    <>
      <select style={feld} value={wert.mitglied_id} onChange={(e) => setzen(e.target.value, '')}>
        <option value="">— Mitglied wählen oder frei eintragen —</option>
        {mitglieder.filter((m) => (m.status ?? 'aktiv') !== 'ausgetreten').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {!wert.mitglied_id && <input style={feld} placeholder="Name (Nichtmitglied)" value={wert.person} onChange={(e) => setzen('', e.target.value)} />}
    </>
  );

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Verein</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🙌 Ehrenamt</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Wer hat wie viel geleistet — und wer ist bei den steuerfreien Pauschalen an der Grenze. <a href="/dashboard/verein" style={{ color: C.cyan }}>← Zum Verein</a></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {([['stunden', '⏱ Stunden'], ['pauschalen', '💶 Pauschalen']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); setFehler(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
        <label style={{ marginLeft: 'auto' }}>Jahr <select style={feld} value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>{[0, 1, 2, 3].map((d) => Number(heute.slice(0, 4)) - d).map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Ehrenamts-Tabellen sind noch nicht eingerichtet (SQL von Paket PS4 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'stunden' && (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {personWahl(ne, (m, p) => setNe({ ...ne, mitglied_id: m, person: p }))}
              <input type="date" style={feld} value={ne.datum} onChange={(e) => setNe({ ...ne, datum: e.target.value })} />
              <input style={{ ...feld, width: 100 }} placeholder="Stunden" value={ne.stunden} onChange={(e) => setNe({ ...ne, stunden: e.target.value })} />
              <input style={{ ...feld, width: 240 }} placeholder="Tätigkeit, z. B. Sommerfest Aufbau" value={ne.taetigkeit} onChange={(e) => setNe({ ...ne, taetigkeit: e.target.value })} />
              <button style={primaer} onClick={stundeAnlegen}>＋ Erfassen</button>
            </div>
          </div>
          <div style={karte}>
            <b>{jahr}: {auswertung.gesamt.toLocaleString('de-DE')} Stunden von {auswertung.personen.length} Personen</b>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90, marginTop: 10 }}>
              {auswertung.jeMonat.map((h, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }} title={`${MONATE[i]}: ${h} Std.`}>
                  <div style={{ background: C.gold, height: Math.round((h / maxMonat) * 70), borderRadius: 3 }} />
                  <div style={{ fontSize: 11, color: C.textDim }}>{MONATE[i]}</div>
                </div>
              ))}
            </div>
            {auswertung.personen.map((p) => (
              <div key={p.person} style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>{p.person} · {p.stunden.toLocaleString('de-DE')} Std. ({p.einsaetze} Einsätze)</span>
                <button style={knopf} onClick={() => setText(ehrenamtsNachweis({ verein, person: p.person, jahr, stunden: p.stunden, taetigkeiten: eintraege.filter((e) => e.person === p.person && e.datum.startsWith(String(jahr))).map((e) => e.taetigkeit ?? '') }))}>📄 Bescheinigung</button>
              </div>
            ))}
            {text && (
              <div style={{ marginTop: 10 }}>
                <textarea style={{ ...feld, width: '100%', minHeight: 160 }} value={text} onChange={(e) => setText(e.target.value)} />
                <button style={{ ...knopf, marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(text); setOk('Text kopiert.'); }}>📋 Kopieren</button>
              </div>
            )}
          </div>
          <div style={karte}>
            <b>Letzte Einträge</b>
            {eintraege.slice(0, 30).map((e) => <div key={e.id} style={{ fontSize: 13.5, color: C.textDim, marginTop: 4 }}>{datumDe(e.datum)} · {e.person} · {Number(e.stunden).toLocaleString('de-DE')} Std.{e.taetigkeit ? ` · ${e.taetigkeit}` : ''}</div>)}
          </div>
        </>
      )}

      {!sqlFehlt && tab === 'pauschalen' && (istChef ? (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {personWahl(np, (m, p) => setNp({ ...np, mitglied_id: m, person: p }))}
              <select style={feld} value={np.art} onChange={(e) => setNp({ ...np, art: e.target.value as PauschaleArt })}>{PAUSCHALEN.map((p) => <option key={p.key} value={p.key}>{p.label} ({euroText(p.betrag)})</option>)}</select>
              <input type="date" style={feld} value={np.datum} onChange={(e) => setNp({ ...np, datum: e.target.value })} />
              <input style={{ ...feld, width: 120 }} placeholder="Betrag €" value={np.betrag} onChange={(e) => setNp({ ...np, betrag: e.target.value })} />
              <button style={primaer} onClick={pauschaleAnlegen}>＋ Zahlung</button>
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>{PAUSCHALEN.find((p) => p.key === np.art)?.fuer} ({PAUSCHALEN.find((p) => p.key === np.art)?.grundlage}).</div>
          </div>
          <div style={karte}>
            <b>Stand {jahr}</b>
            {personenMitZahlung.length === 0 && <div style={{ color: C.textDim }}>Keine Zahlungen im Jahr.</div>}
            {personenMitZahlung.map((person) => (
              <div key={person} style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0' }}>
                <b>{person}</b>
                {pauschalenStand(zahlungen, person, jahr).filter((s) => s.gezahlt > 0).map((s) => (
                  <div key={s.art} style={{ color: STUFE[s.stufe], fontSize: 13.5 }}>{s.label}: {euroText(s.gezahlt)} von {euroText(s.grenze)} · {s.rest >= 0 ? `noch ${euroText(s.rest)} frei` : `${euroText(-s.rest)} ÜBER der Grenze (steuerpflichtig)`}</div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{PAUSCHALEN_HINWEIS} Beträge seit 01.01.2026. Keine Steuerberatung.</p>
        </>
      ) : <div style={karte}>Pauschalen-Zahlungen verwaltet der Vorstand/Chef.</div>)}
    </div>
  );
}
