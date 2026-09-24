'use client';

// ============================================================
// ARGONAUT OS · Mehrsprachiges Team (Paket PM, B25)
//
// Chef: Anweisung, Unterweisung oder Sicherheitshinweis auf Deutsch schreiben
// (oder diktieren), in die Sprachen des Teams übersetzen lassen, die
// Rückübersetzung gegenlesen, abhaken, freigeben, zweisprachig drucken.
// Mitarbeiter: sehen freigegebene Anweisungen in IHRER Sprache, lassen sie
// sich vorlesen und bestätigen „Gelesen und verstanden".
// Jeder wählt oben seine Sprache — der Team-Chat nutzt dieselbe Einstellung.
//
// Logik: lib/mehrsprachig.ts (getestet). Übersetzung: /api/uebersetzen (Haiku).
// RLS: supabase-sql/pm-mehrsprachig.sql. Mitarbeiter sehen nur Freigegebenes.
//
// Pfad: app/dashboard/mehrsprachig/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Diktat from '../_components/Diktat';
import {
  SPRACHEN, ARTEN, spracheFuer, artFuer, darfFreigeben, anzeigeFuer, nachAenderung, bestaetigungsStand,
  teamSprachen, stimmeFuer, type Anweisung, type SprachFassung, type TeamMitglied, type Bestaetigung,
} from '@/lib/mehrsprachig';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Zeile = Anweisung & {
  id: string; art: string; status: string; erstellt_am: string; freigegeben_am: string | null;
};
type Editor = {
  id: string | null; art: string; titel_de: string; text_de: string;
  sprachen: string[]; uebersetzungen: Record<string, SprachFassung>;
  alt: Zeile | null;
};

function datumDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };
const knopf = (farbe: string, voll = false): CSSProperties => ({
  background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`,
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
});
const feld: CSSProperties = {
  width: '100%', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box',
};

function vorlesen(text: string, bcp: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 3000));
  u.lang = bcp;
  const stimme = stimmeFuer(synth.getVoices(), bcp);
  if (stimme) u.voice = stimme;
  u.rate = 0.9;
  synth.speak(u);
  return !!stimme;
}

export default function MehrsprachigSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [meinName, setMeinName] = useState('');
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [meineSprache, setMeineSprache] = useState<string>('de');
  const [liste, setListe] = useState<Zeile[]>([]);
  const [team, setTeam] = useState<TeamMitglied[]>([]);
  const [best, setBest] = useState<(Bestaetigung & { anweisung_id: string })[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [zeigeDeutsch, setZeigeDeutsch] = useState<Record<string, boolean>>({});
  const [druck, setDruck] = useState<{ a: Zeile | Editor; code: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);

  const laden = useCallback(async (chef: boolean) => {
    const a = await supabase.from('sprach_anweisung').select('*').neq('status', 'archiviert').order('erstellt_am', { ascending: false }).limit(200);
    if (a.error) {
      if (/sprach_anweisung/.test(a.error.message)) setTabelleFehlt(true);
      else setFehler('Laden fehlgeschlagen.');
      return;
    }
    setListe(((a.data as Zeile[]) ?? []).map((z) => ({ ...z, uebersetzungen: z.uebersetzungen ?? {} })));
    const b = await supabase.from('sprach_bestaetigung').select('anweisung_id, user_id, name, sprache, bestaetigt_am').limit(2000);
    setBest((b.data as (Bestaetigung & { anweisung_id: string })[]) ?? []);
    if (chef) {
      const [m, p] = await Promise.all([
        supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname, status'),
        supabase.from('sprach_profil').select('user_id, sprache'),
      ]);
      const sprachen = new Map(((p.data as { user_id: string; sprache: string }[]) ?? []).map((x) => [x.user_id, x.sprache]));
      const inaktiv = ['inaktiv', 'ausgeschieden', 'archiviert', 'gekuendigt'];
      setTeam(((m.data as Array<{ auth_user_id: string | null; vorname: string | null; nachname: string | null; status: string | null }>) ?? [])
        .filter((x) => x.auth_user_id && !inaktiv.includes(String(x.status || 'aktiv').toLowerCase()))
        .map((x) => ({
          user_id: x.auth_user_id as string,
          name: `${x.vorname || ''} ${x.nachname || ''}`.trim() || 'Ohne Namen',
          sprache: sprachen.get(x.auth_user_id as string) ?? null,
        })));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUid(u?.id ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.email ?? '').split('@')[0]);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      const ma = !!chef && chef !== u?.id;
      setIstMitarbeiter(ma);
      setBetrieb(chef || u?.id || null);
      if (u?.id) {
        const { data: sp } = await supabase.from('sprach_profil').select('sprache').eq('user_id', u.id).maybeSingle();
        const s = spracheFuer((sp as { sprache?: string } | null)?.sprache);
        if (s) setMeineSprache(s.code);
      }
      await laden(!ma);
    })();
  }, [laden]);

  // Stimmen laden manche Browser erst verzögert — einmal anstoßen.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.getVoices();
  }, []);

  async function spracheSetzen(code: string) {
    if (!uid || !betrieb) return;
    setMeineSprache(code);
    const { error } = await supabase.from('sprach_profil').upsert(
      { user_id: uid, owner_user_id: betrieb, name: meinName || null, sprache: code, aktualisiert_am: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) setFehler('Die Sprache konnte nicht gespeichert werden.');
    else setOk(`Ihre Sprache: ${spracheFuer(code)?.eigen ?? code}. Der Team-Chat übersetzt ab jetzt in diese Sprache.`);
  }

  // --- Editor (nur Chef) -----------------------------------------------------
  const vorschlagSprachen = useMemo(() => teamSprachen(team), [team]);

  function neu() {
    setFehler(null); setOk(null);
    setEditor({ id: null, art: 'anweisung', titel_de: '', text_de: '', sprachen: vorschlagSprachen.slice(0, 6), uebersetzungen: {}, alt: null });
  }
  function bearbeiten(z: Zeile) {
    setFehler(null); setOk(null);
    setEditor({ id: z.id, art: z.art, titel_de: z.titel_de, text_de: z.text_de, sprachen: Object.keys(z.uebersetzungen), uebersetzungen: { ...z.uebersetzungen }, alt: z });
  }
  function spracheUmschalten(code: string) {
    if (!editor) return;
    const drin = editor.sprachen.includes(code);
    const sprachen = drin ? editor.sprachen.filter((c) => c !== code) : [...editor.sprachen, code];
    const uebersetzungen = { ...editor.uebersetzungen };
    if (drin) delete uebersetzungen[code];
    setEditor({ ...editor, sprachen, uebersetzungen });
  }
  function fassungAendern(code: string, teil: Partial<SprachFassung>) {
    if (!editor) return;
    const alt = editor.uebersetzungen[code] ?? { titel: '', text: '' };
    // Wer die Übersetzung von Hand ändert, muss sie neu abhaken.
    const geprueft = 'geprueft' in teil ? !!teil.geprueft : false;
    setEditor({ ...editor, uebersetzungen: { ...editor.uebersetzungen, [code]: { ...alt, ...teil, geprueft } } });
  }

  async function uebersetzen(nurCode?: string) {
    if (!editor) return;
    if (!editor.titel_de.trim() || !editor.text_de.trim()) { setFehler('Bitte zuerst Titel und Text auf Deutsch eingeben.'); return; }
    const codes = nurCode ? [nurCode] : editor.sprachen.filter((c) => c !== 'de');
    if (!codes.length) { setFehler('Bitte mindestens eine Sprache wählen.'); return; }
    setFehler(null); setOk(null);
    const neu = { ...editor.uebersetzungen };
    const fehlgeschlagen: string[] = [];
    for (const code of codes) {
      setBusy(`Übersetze ins ${spracheFuer(code)?.name ?? code} …`);
      try {
        const r = await fetch('/api/uebersetzen', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ziel: code, modus: 'anweisung', texte: [editor.titel_de, editor.text_de] }),
        });
        const d = await r.json();
        const t = d?.ergebnisse?.[0];
        const x = d?.ergebnisse?.[1];
        if (!r.ok || !d?.ok || !t || !x) { fehlgeschlagen.push(spracheFuer(code)?.name ?? code); continue; }
        neu[code] = {
          titel: t.text, text: x.text, rueck_titel: t.rueck, rueck_text: x.rueck,
          hinweise: [...(t.hinweise ?? []), ...(x.hinweise ?? []), ...(d.hinweise ?? [])],
          geprueft: false,
        };
      } catch {
        fehlgeschlagen.push(spracheFuer(code)?.name ?? code);
      }
    }
    setBusy(null);
    setEditor((e) => (e ? { ...e, uebersetzungen: neu } : e));
    if (fehlgeschlagen.length) setFehler(`Nicht übersetzt: ${fehlgeschlagen.join(', ')} — bitte erneut versuchen.`);
    else setOk('Übersetzt. Bitte jede Rückübersetzung lesen und abhaken, dann freigeben.');
  }

  async function speichern(freigeben: boolean) {
    if (!editor || !betrieb) return;
    setFehler(null); setOk(null);
    let uebersetzungen: Record<string, SprachFassung> = {};
    for (const c of editor.sprachen) if (c !== 'de' && editor.uebersetzungen[c]) uebersetzungen[c] = editor.uebersetzungen[c];
    if (editor.alt) uebersetzungen = nachAenderung({ ...editor.alt, uebersetzungen }, { titel_de: editor.titel_de, text_de: editor.text_de });
    const fehlendeSprachen = editor.sprachen.filter((c) => c !== 'de' && !uebersetzungen[c]);
    const probe: Anweisung = { titel_de: editor.titel_de, text_de: editor.text_de, uebersetzungen };
    if (freigeben) {
      const f = darfFreigeben(probe);
      if (fehlendeSprachen.length) f.push(`Noch nicht übersetzt: ${fehlendeSprachen.map((c) => spracheFuer(c)?.name ?? c).join(', ')}.`);
      if (f.length) { setFehler('Freigabe noch nicht möglich: ' + f.join(' ')); return; }
    } else if (!editor.titel_de.trim() || !editor.text_de.trim()) {
      setFehler('Bitte Titel und Text eingeben.'); return;
    }
    const warFrei = editor.alt?.status === 'freigegeben';
    const inhaltGeaendert = !!editor.alt && (editor.alt.titel_de.trim() !== editor.titel_de.trim() || editor.alt.text_de.trim() !== editor.text_de.trim());
    const status = freigeben ? 'freigegeben' : (warFrei && !inhaltGeaendert && darfFreigeben(probe).length === 0 ? 'freigegeben' : 'entwurf');
    const zeile = {
      art: artFuer(editor.art), titel_de: editor.titel_de.trim(), text_de: editor.text_de.trim(), uebersetzungen, status,
      freigegeben_am: status === 'freigegeben' ? (warFrei && !freigeben ? editor.alt?.freigegeben_am ?? new Date().toISOString() : new Date().toISOString()) : null,
      aktualisiert_am: new Date().toISOString(),
    };
    setBusy('Speichere …');
    const res = editor.id
      ? await supabase.from('sprach_anweisung').update(zeile).eq('id', editor.id)
      : await supabase.from('sprach_anweisung').insert({ ...zeile, owner_user_id: betrieb });
    setBusy(null);
    if (res.error) { setFehler('Speichern fehlgeschlagen: ' + res.error.message); return; }
    setEditor(null);
    setOk(status === 'freigegeben'
      ? 'Freigegeben — Ihr Team sieht die Anweisung jetzt in seiner Sprache.'
      : warFrei ? 'Gespeichert. Weil der deutsche Text geändert wurde, ist die Anweisung wieder ein Entwurf — bitte neu übersetzen, prüfen und freigeben.'
        : 'Als Entwurf gespeichert. Mitarbeiter sehen sie erst nach der Freigabe.');
    await laden(true);
  }

  async function archivieren(z: Zeile) {
    const { error } = await supabase.from('sprach_anweisung').update({ status: 'archiviert', aktualisiert_am: new Date().toISOString() }).eq('id', z.id);
    if (error) setFehler('Archivieren fehlgeschlagen.');
    else { setOk('Archiviert.'); await laden(true); }
  }

  // --- Mitarbeiter: bestätigen ----------------------------------------------
  async function bestaetigen(z: Zeile, code: string) {
    if (!uid || !betrieb) return;
    const { error } = await supabase.from('sprach_bestaetigung').insert({
      anweisung_id: z.id, owner_user_id: betrieb, user_id: uid, name: meinName || null, sprache: code,
    });
    if (error) { setFehler('Die Bestätigung konnte nicht gespeichert werden.'); return; }
    setOk('Bestätigt. Danke!');
    await laden(!istMitarbeiter);
  }

  function drucken(a: Zeile | Editor, code: string) {
    setDruck({ a, code });
    setTimeout(() => { window.print(); }, 150);
  }

  // --- Anzeige ---------------------------------------------------------------
  const meine = spracheFuer(meineSprache) ?? SPRACHEN[0];

  if (tabelleFehlt) {
    return (
      <div style={{ padding: 24, color: C.text }}>
        <h1 style={{ color: C.gold }}>🌍 Mehrsprachiges Team</h1>
        <div style={{ ...karte, borderColor: C.warn, color: C.warn }}>Dieser Bereich ist noch nicht eingerichtet (SQL von Paket PM fehlt).</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: C.text, maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        #pm-druck { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #pm-druck, #pm-druck * { visibility: visible !important; }
          #pm-druck { display: block !important; position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; padding: 24px; }
        }
      `}</style>

      <h1 style={{ color: C.gold, margin: '0 0 4px' }}>🌍 Mehrsprachiges Team</h1>
      <p style={{ color: C.textDim, margin: '0 0 18px' }}>
        {istMitarbeiter
          ? 'Anweisungen Ihres Betriebs in Ihrer Sprache — zum Lesen, Vorlesen und Bestätigen.'
          : 'Anweisungen und Unterweisungen einmal auf Deutsch schreiben, in die Sprachen Ihres Teams übersetzen, gegenlesen und freigeben.'}
      </p>

      {/* Meine Sprache */}
      <div style={{ ...karte, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <strong>Meine Sprache · My language</strong>
        <select value={meineSprache} onChange={(e) => spracheSetzen(e.target.value)} style={{ ...feld, width: 'auto', minWidth: 220 }}>
          {SPRACHEN.map((s) => <option key={s.code} value={s.code}>{s.eigen}{s.eigen !== s.name ? ` · ${s.name}` : ''}</option>)}
        </select>
        <span style={{ color: C.textDim, fontSize: 13 }}>Gilt auch für den Team-Chat.</span>
      </div>

      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger, marginBottom: 12 }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green, marginBottom: 12 }}>{ok}</div>}
      {busy && <div style={{ ...karte, borderColor: C.cyan, color: C.cyan, marginBottom: 12 }}>{busy}</div>}

      {/* Chef: Team-Sprachen + Neu */}
      {!istMitarbeiter && !editor && (
        <div style={{ ...karte, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div>
              <strong>Sprachen im Team</strong>
              <div style={{ color: C.textDim, fontSize: 14, marginTop: 4 }}>
                {team.length === 0 ? 'Noch keine Mitarbeiter mit eigenem Zugang.' : team.map((t) => `${t.name}: ${t.sprache ? (spracheFuer(t.sprache)?.name ?? t.sprache) : 'nicht gewählt'}`).join(' · ')}
              </div>
            </div>
            <button style={knopf(C.gold, true)} onClick={neu}>+ Neue Anweisung</button>
          </div>
        </div>
      )}

      {/* Editor */}
      {editor && (
        <div style={{ ...karte, marginBottom: 16, borderColor: C.gold }}>
          <h2 style={{ marginTop: 0, color: C.gold, fontSize: 20 }}>{editor.id ? 'Anweisung bearbeiten' : 'Neue Anweisung'}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={editor.art} onChange={(e) => setEditor({ ...editor, art: e.target.value })} style={feld}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <input value={editor.titel_de} onChange={(e) => setEditor({ ...editor, titel_de: e.target.value })} placeholder="Titel auf Deutsch, z. B. Arbeiten auf dem Gerüst" style={feld} maxLength={160} />
            <textarea value={editor.text_de} onChange={(e) => setEditor({ ...editor, text_de: e.target.value })} rows={7} placeholder="Text auf Deutsch — kurze Sätze, ein Punkt pro Zeile." style={feld} maxLength={3800} />
            <div><Diktat wert={editor.text_de} onWert={(t) => setEditor((e) => (e ? { ...e, text_de: t } : e))} /></div>
            {editor.art === 'unterweisung' && (
              <div style={{ color: C.warn, fontSize: 14 }}>
                Hinweis: Die Übersetzung ist maschinell. Unterweisungen möglichst von einer sprachkundigen Person gegenlesen lassen.
                Sie ergänzt die Unterweisung durch eine fachkundige Person und die Unterschrift in der Nachweis-Mappe — sie ersetzt beides nicht.
              </div>
            )}
            <div>
              <div style={{ marginBottom: 6 }}><strong>Sprachen</strong> <span style={{ color: C.textDim, fontSize: 13 }}>(vorgewählt: die Sprachen Ihres Teams)</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SPRACHEN.filter((s) => s.code !== 'de').map((s) => {
                  const an = editor.sprachen.includes(s.code);
                  return (
                    <button key={s.code} onClick={() => spracheUmschalten(s.code)}
                      style={{ ...knopf(an ? C.cyan : C.textDim, an), padding: '5px 10px', fontSize: 13 }}>
                      {s.name}{vorschlagSprachen.includes(s.code) ? ' ★' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={knopf(C.cyan, true)} disabled={!!busy} onClick={() => uebersetzen()}>🌍 Übersetzen</button>
              <button style={knopf(C.textDim)} disabled={!!busy} onClick={() => speichern(false)}>Als Entwurf speichern</button>
              <button style={knopf(C.green, true)} disabled={!!busy} onClick={() => speichern(true)}>✓ Freigeben</button>
              <button style={knopf(C.textDim)} onClick={() => setEditor(null)}>Abbrechen</button>
            </div>
          </div>

          {editor.sprachen.filter((c) => c !== 'de').map((code) => {
            const s = spracheFuer(code);
            if (!s) return null;
            const u = editor.uebersetzungen[code];
            return (
              <div key={code} style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ color: C.cyan }}>{s.name} · {s.eigen}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={{ ...knopf(C.cyan), padding: '4px 10px', fontSize: 13 }} disabled={!!busy} onClick={() => uebersetzen(code)}>{u ? 'Neu übersetzen' : 'Übersetzen'}</button>
                    {u && <button style={{ ...knopf(C.textDim), padding: '4px 10px', fontSize: 13 }} onClick={() => vorlesen(`${u.titel}. ${u.text}`, s.bcp) || setOk(`Auf diesem Gerät ist keine Stimme für ${s.name} installiert — der Browser versucht es trotzdem.`)}>🔊 Vorlesen</button>}
                    {u && <button style={{ ...knopf(C.textDim), padding: '4px 10px', fontSize: 13 }} onClick={() => drucken(editor, code)}>🖨 Drucken</button>}
                  </div>
                </div>
                {!u ? (
                  <div style={{ color: C.textDim, fontSize: 14, marginTop: 6 }}>Noch nicht übersetzt.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 8 }}>
                    <div>
                      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>Übersetzung (änderbar)</div>
                      <input dir={s.rtl ? 'rtl' : 'ltr'} value={u.titel} onChange={(e) => fassungAendern(code, { titel: e.target.value })} style={{ ...feld, marginBottom: 6 }} />
                      <textarea dir={s.rtl ? 'rtl' : 'ltr'} value={u.text} onChange={(e) => fassungAendern(code, { text: e.target.value })} rows={6} style={feld} />
                    </div>
                    <div>
                      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>Rückübersetzung ins Deutsche — so hat die KI es verstanden</div>
                      <div style={{ ...feld, background: 'transparent', whiteSpace: 'pre-wrap', minHeight: 60 }}>
                        <strong>{u.rueck_titel || '—'}</strong>{'\n'}{u.rueck_text || '—'}
                      </div>
                      {(u.hinweise ?? []).length > 0 && (
                        <ul style={{ color: C.warn, fontSize: 13, margin: '8px 0 0', paddingLeft: 18 }}>
                          {(u.hinweise ?? []).map((h, i) => <li key={i}>{h}</li>)}
                        </ul>
                      )}
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, cursor: 'pointer', color: u.geprueft ? C.green : C.text }}>
                        <input type="checkbox" checked={!!u.geprueft} onChange={(e) => fassungAendern(code, { geprueft: e.target.checked })} />
                        Rückübersetzung gelesen — der Sinn stimmt
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Liste */}
      {!editor && (
        <div style={{ display: 'grid', gap: 12 }}>
          {liste.length === 0 && (
            <div style={{ ...karte, color: C.textDim }}>
              {istMitarbeiter ? 'Zurzeit liegen keine Anweisungen für Sie vor.' : 'Noch keine Anweisungen. Legen Sie oben die erste an.'}
            </div>
          )}
          {liste.map((z) => {
            const art = ARTEN.find((a) => a.key === z.art)?.label ?? 'Anweisung';
            const eigene = best.filter((b) => b.anweisung_id === z.id && b.user_id === uid);
            const zeigeDe = !!zeigeDeutsch[z.id];
            const anz = anzeigeFuer(z, zeigeDe ? 'de' : meineSprache);
            const stand = bestaetigungsStand(team, best.filter((b) => b.anweisung_id === z.id));
            const sprachenListe = Object.keys(z.uebersetzungen).map((c) => spracheFuer(c)?.name ?? c).join(', ');
            return (
              <div key={z.id} style={{ ...karte, borderColor: z.art === 'sicherheit' || z.art === 'unterweisung' ? 'rgba(224,162,76,0.45)' : C.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ color: C.textDim, fontSize: 13 }}>
                    {art} · {datumDe(z.freigegeben_am ?? z.erstellt_am)}
                    {!istMitarbeiter && <> · <span style={{ color: z.status === 'freigegeben' ? C.green : C.warn }}>{z.status === 'freigegeben' ? 'freigegeben' : 'Entwurf'}</span> · {sprachenListe || 'nur Deutsch'}</>}
                  </div>
                  {!istMitarbeiter && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{ ...knopf(C.cyan), padding: '4px 10px', fontSize: 13 }} onClick={() => bearbeiten(z)}>Bearbeiten</button>
                      <button style={{ ...knopf(C.textDim), padding: '4px 10px', fontSize: 13 }} onClick={() => archivieren(z)}>Archivieren</button>
                    </div>
                  )}
                </div>
                <div dir={anz.sprache.rtl ? 'rtl' : 'ltr'}>
                  <h3 style={{ margin: '8px 0 6px', fontSize: 19 }}>{anz.titel}</h3>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 16 }}>{anz.text}</div>
                </div>
                {anz.fehlt && meine.code !== 'de' && !zeigeDe && (
                  <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>Noch nicht in {meine.name} verfügbar — bitte im Büro melden.</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
                  <button style={knopf(C.textDim)} onClick={() => vorlesen(`${anz.titel}. ${anz.text}`, anz.sprache.bcp) || setOk(`Auf diesem Gerät ist keine Stimme für ${anz.sprache.name} installiert.`)}>🔊</button>
                  {meine.code !== 'de' && (
                    <button style={knopf(C.textDim)} onClick={() => setZeigeDeutsch((x) => ({ ...x, [z.id]: !zeigeDe }))}>{zeigeDe ? meine.eigen : 'Deutsch'}</button>
                  )}
                  <button style={knopf(C.textDim)} onClick={() => drucken(z, anz.istUebersetzung ? anz.sprache.code : 'de')}>🖨</button>
                  {z.status === 'freigegeben' && (eigene.length > 0 ? (
                    <span style={{ color: C.green, fontWeight: 600 }}>✓ {datumDe(eigene[0].bestaetigt_am)}</span>
                  ) : (
                    <button style={knopf(C.green, true)} onClick={() => bestaetigen(z, anz.sprache.code)}>
                      ✓ {anz.sprache.verstanden}{anz.sprache.code !== 'de' ? ' · Gelesen und verstanden' : ''}
                    </button>
                  ))}
                </div>
                {!istMitarbeiter && z.status === 'freigegeben' && (
                  <div style={{ marginTop: 10 }}>
                    <button style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', padding: 0, fontSize: 14 }} onClick={() => setOffenId(offenId === z.id ? null : z.id)}>
                      Bestätigt: {stand.bestaetigt.length} · offen: {stand.offen.length} {offenId === z.id ? '▲' : '▼'}
                    </button>
                    {offenId === z.id && (
                      <div style={{ fontSize: 14, marginTop: 6, color: C.textDim }}>
                        {stand.bestaetigt.map((b) => (
                          <div key={b.user_id} style={{ color: C.green }}>✓ {b.name} · {spracheFuer(b.sprache)?.name ?? 'Deutsch'} · {datumDe(b.bestaetigt_am)}</div>
                        ))}
                        {stand.offen.map((o) => <div key={o.user_id}>○ {o.name}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Druckansicht: Zielsprache + Deutsch */}
      {druck && (() => {
        const a = druck.a;
        const s = spracheFuer(druck.code) ?? SPRACHEN[0];
        const u = a.uebersetzungen[druck.code];
        return (
          <div id="pm-druck">
            {u && s.code !== 'de' && (
              <div dir={s.rtl ? 'rtl' : 'ltr'} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, color: '#555' }}>{s.eigen}</div>
                <h1 style={{ fontSize: 24, margin: '4px 0 10px' }}>{u.titel}</h1>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6 }}>{u.text}</div>
              </div>
            )}
            <div style={{ borderTop: '1px solid #999', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#555' }}>Deutsch</div>
              <h2 style={{ fontSize: 20, margin: '4px 0 10px' }}>{a.titel_de}</h2>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{a.text_de}</div>
            </div>
            <div style={{ marginTop: 40, fontSize: 13 }}>
              {s.verstanden}{s.code !== 'de' ? ' / Gelesen und verstanden' : ''}: ______________________ &nbsp; Datum: ____________
            </div>
          </div>
        );
      })()}
    </div>
  );
}
