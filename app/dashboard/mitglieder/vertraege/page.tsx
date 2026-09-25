'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · Verträge & Kündigung (Studio / Verein)
//   Vertragsdaten je Mitglied (Erstlaufzeit, Kündigungsfrist, bei Altverträgen
//   Verlängerung; beim Verein Satzungsfrist), Kündigung erfassen → frühestes
//   Ende nach § 309 Nr. 9 BGB bzw. Satzung, Bestätigung als Text, Übersicht
//   „läuft bald aus".
// Logik: lib/gebuehrenHonorare.ts (getestet). SQL: supabase-sql/ps5-gebuehren-honorare.sql.
// Unterpfad von /dashboard/mitglieder (sensibel wie das Modul). Ändern per RLS nur Chef.
// Pfad: app/dashboard/mitglieder/vertraege/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KUENDIGUNG_HINWEIS, fruehestesEnde, kuendigungsBestaetigung, datumDe, heuteBerlin, tageZwischen,
  type VertragsDaten,
} from '@/lib/gebuehrenHonorare';
import { leseZahl } from '@/lib/zahlen';

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
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap' };

type M = {
  id: string; name: string; status: string; beginn_am: string | null; kuendigung_zum: string | null;
  vertragsart: 'studio' | 'verein' | null; mitglieds_nr: string | null; abgeschlossen_am: string | null;
  erstlaufzeit_monate: number | null; kuendigungsfrist_monate: number | null; verlaengerung_monate: number | null;
  satzung_frist_monate: number | null; satzung_zum: VertragsDaten['satzungZum'] | null; kuendigung_eingang: string | null;
};
type Form = { vertragsart: 'studio' | 'verein'; mitglieds_nr: string; abgeschlossen_am: string; beginn_am: string; erstlaufzeit_monate: string; kuendigungsfrist_monate: string; verlaengerung_monate: string; satzung_frist_monate: string; satzung_zum: NonNullable<VertragsDaten['satzungZum']> };
const SPALTEN = 'id, name, status, beginn_am, kuendigung_zum, vertragsart, mitglieds_nr, abgeschlossen_am, erstlaufzeit_monate, kuendigungsfrist_monate, verlaengerung_monate, satzung_frist_monate, satzung_zum, kuendigung_eingang';

function vertragAus(m: M): VertragsDaten {
  return {
    art: m.vertragsart ?? 'studio', beginn: m.beginn_am, abgeschlossen: m.abgeschlossen_am,
    erstlaufzeitMonate: m.erstlaufzeit_monate, kuendigungsfristMonate: m.kuendigungsfrist_monate,
    verlaengerungMonate: m.verlaengerung_monate, satzungFristMonate: m.satzung_frist_monate, satzungZum: m.satzung_zum ?? 'jahresende',
  };
}
function zuForm(m: M): Form {
  const t = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
  return {
    vertragsart: m.vertragsart ?? 'studio', mitglieds_nr: m.mitglieds_nr ?? '', abgeschlossen_am: m.abgeschlossen_am ?? '', beginn_am: m.beginn_am ?? '',
    erstlaufzeit_monate: t(m.erstlaufzeit_monate), kuendigungsfrist_monate: t(m.kuendigungsfrist_monate), verlaengerung_monate: t(m.verlaengerung_monate),
    satzung_frist_monate: t(m.satzung_frist_monate), satzung_zum: m.satzung_zum ?? 'jahresende',
  };
}

export default function VertraegeSeite() {
  const heute = heuteBerlin();
  const [liste, setListe] = useState<M[]>([]);
  const [firma, setFirma] = useState('');
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [eingang, setEingang] = useState(heute);
  const [text, setText] = useState('');

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('mitglieder').select(SPALTEN).order('name', { ascending: true });
    if (r.error) { if (/vertragsart|kuendigung_eingang|column/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setListe((r.data as M[]) ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || data?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  const aktiv = liste.find((m) => m.id === aktivId) ?? null;
  const ergebnis = useMemo(() => (aktiv ? fruehestesEnde(vertragAus(aktiv), eingang) : null), [aktiv, eingang]);
  const bald = liste.filter((m) => m.kuendigung_zum && m.kuendigung_zum >= heute && tageZwischen(heute, m.kuendigung_zum) <= 31).sort((a, b) => String(a.kuendigung_zum).localeCompare(String(b.kuendigung_zum)));
  const gefiltert = liste.filter((m) => !suche.trim() || m.name.toLowerCase().includes(suche.trim().toLowerCase()) || (m.mitglieds_nr ?? '').includes(suche.trim()));

  function waehlen(m: M) { setAktivId(m.id); setForm(zuForm(m)); setEingang(heute); setText(''); setOk(null); setFehler(null); }

  async function vertragSpeichern() {
    if (!aktiv || !form) return;
    const z = (s: string) => (s.trim() ? leseZahl(s) : null);
    const { error } = await supabase.from('mitglieder').update({
      vertragsart: form.vertragsart, mitglieds_nr: form.mitglieds_nr.trim() || null, abgeschlossen_am: form.abgeschlossen_am || null, beginn_am: form.beginn_am || null,
      erstlaufzeit_monate: z(form.erstlaufzeit_monate), kuendigungsfrist_monate: z(form.kuendigungsfrist_monate), verlaengerung_monate: z(form.verlaengerung_monate),
      satzung_frist_monate: z(form.satzung_frist_monate), satzung_zum: form.satzung_zum,
    }).eq('id', aktiv.id);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Vertragsdaten gespeichert.'); await laden();
  }
  async function kuendigungEintragen() {
    if (!aktiv || !ergebnis?.ok || !ergebnis.endeAm) return;
    if (!window.confirm(`Kündigung von ${aktiv.name} zum ${datumDe(ergebnis.endeAm)} eintragen?`)) return;
    const { error } = await supabase.from('mitglieder').update({ kuendigung_eingang: eingang, kuendigung_zum: ergebnis.endeAm, status: 'gekuendigt' }).eq('id', aktiv.id);
    if (error) { setFehler('Eintragen fehlgeschlagen: ' + error.message); return; }
    setText(kuendigungsBestaetigung({ betrieb: firma, name: aktiv.name, eingang, endeAm: ergebnis.endeAm, mitgliedsNr: aktiv.mitglieds_nr }));
    setOk('Kündigung eingetragen — Bestätigung unten zum Versenden.'); await laden();
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Mitglieder & Abos</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>📜 Verträge & Kündigung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Kündigung eingegangen? Das richtige Enddatum in Sekunden — rechtssicher nach den Regeln für Verbraucherverträge. <a href="/dashboard/mitglieder" style={{ color: C.cyan }}>← Zu Mitglieder & Abos</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Vertragsfelder sind noch nicht eingerichtet (SQL von Paket PS5 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          {bald.length > 0 && (
            <div style={{ ...karte, borderColor: C.warn }}>
              <b>Laufen in den nächsten 31 Tagen aus</b>
              {bald.map((m) => <div key={m.id} style={zeile}><span>{m.name}</span><span style={{ color: C.warn }}>{datumDe(m.kuendigung_zum)}</span></div>)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: 14 }}>
            <div style={karte}>
              <input style={{ ...feld, width: '100%' }} placeholder="Name oder Mitgliedsnummer" value={suche} onChange={(e) => setSuche(e.target.value)} />
              {gefiltert.length === 0 && <div style={{ color: C.textDim, marginTop: 8 }}>Keine Mitglieder.</div>}
              {gefiltert.slice(0, 200).map((m) => (
                <div key={m.id} onClick={() => waehlen(m)} style={{ ...zeile, cursor: 'pointer', background: m.id === aktivId ? 'rgba(201,168,76,0.12)' : 'transparent' }}>
                  <span>{m.name}{m.mitglieds_nr ? ` · ${m.mitglieds_nr}` : ''}</span>
                  <span style={{ color: m.kuendigung_zum ? C.warn : m.status === 'aktiv' ? C.green : C.textDim, fontSize: 13 }}>{m.kuendigung_zum ? `bis ${datumDe(m.kuendigung_zum)}` : m.status}</span>
                </div>
              ))}
            </div>
            <div>
              {!aktiv || !form ? <div style={karte}>Links ein Mitglied wählen.</div> : (
                <>
                  <div style={karte}>
                    <b>{aktiv.name} — Vertragsdaten</b>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                      <label>Art<br /><select style={feld} value={form.vertragsart} onChange={(e) => setForm({ ...form, vertragsart: e.target.value as Form['vertragsart'] })}><option value="studio">Studio / Abo (Verbrauchervertrag)</option><option value="verein">Vereinsmitgliedschaft</option></select></label>
                      <label>Mitgliedsnr.<br /><input style={{ ...feld, width: 110 }} value={form.mitglieds_nr} onChange={(e) => setForm({ ...form, mitglieds_nr: e.target.value })} /></label>
                      <label>Beginn<br /><input type="date" style={feld} value={form.beginn_am} onChange={(e) => setForm({ ...form, beginn_am: e.target.value })} /></label>
                      {form.vertragsart === 'studio' ? (
                        <>
                          <label>Abgeschlossen am<br /><input type="date" style={feld} value={form.abgeschlossen_am} onChange={(e) => setForm({ ...form, abgeschlossen_am: e.target.value })} /></label>
                          <label>Erstlaufzeit (Monate)<br /><input style={{ ...feld, width: 90 }} value={form.erstlaufzeit_monate} onChange={(e) => setForm({ ...form, erstlaufzeit_monate: e.target.value })} /></label>
                          <label>Kündigungsfrist (Monate)<br /><input style={{ ...feld, width: 90 }} value={form.kuendigungsfrist_monate} onChange={(e) => setForm({ ...form, kuendigungsfrist_monate: e.target.value })} /></label>
                          <label>Verlängerung (nur Altvertrag)<br /><input style={{ ...feld, width: 90 }} value={form.verlaengerung_monate} onChange={(e) => setForm({ ...form, verlaengerung_monate: e.target.value })} placeholder="Monate" /></label>
                        </>
                      ) : (
                        <>
                          <label>Satzungsfrist (Monate)<br /><input style={{ ...feld, width: 90 }} value={form.satzung_frist_monate} onChange={(e) => setForm({ ...form, satzung_frist_monate: e.target.value })} /></label>
                          <label>zum<br /><select style={feld} value={form.satzung_zum} onChange={(e) => setForm({ ...form, satzung_zum: e.target.value as Form['satzung_zum'] })}><option value="jahresende">Jahresende</option><option value="quartalsende">Quartalsende</option><option value="monatsende">Monatsende</option><option value="jederzeit">jederzeit</option></select></label>
                        </>
                      )}
                      <button style={knopf} onClick={vertragSpeichern}>💾 Speichern</button>
                    </div>
                  </div>
                  <div style={karte}>
                    <b>Kündigung erfassen</b>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
                      <label>Eingegangen am<br /><input type="date" style={feld} value={eingang} onChange={(e) => setEingang(e.target.value)} /></label>
                      {ergebnis?.ok && <div style={{ fontSize: 15 }}>Frühestes Ende: <b style={{ color: C.gold }}>{datumDe(ergebnis.endeAm)}</b></div>}
                    </div>
                    {ergebnis && !ergebnis.ok && <div style={{ color: C.warn, marginTop: 8 }}>{ergebnis.fehler} Bitte zuerst die Vertragsdaten ergänzen und speichern.</div>}
                    {ergebnis?.ok && <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 6 }}>{ergebnis.begruendung}</div>}
                    {ergebnis?.warnungen.map((w, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>{w}</div>)}
                    {aktiv.kuendigung_eingang && <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Bereits erfasst: Eingang {datumDe(aktiv.kuendigung_eingang)}, Ende {datumDe(aktiv.kuendigung_zum)}.</div>}
                    <button style={{ ...primaer, marginTop: 10 }} onClick={kuendigungEintragen} disabled={!ergebnis?.ok}>✍️ Kündigung eintragen</button>
                    {text && (
                      <div style={{ marginTop: 10 }}>
                        <textarea style={{ ...feld, width: '100%', minHeight: 170 }} value={text} onChange={(e) => setText(e.target.value)} />
                        <button style={{ ...knopf, marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(text); setOk('Bestätigung kopiert.'); }}>📋 Kopieren</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{KUENDIGUNG_HINWEIS} Keine Rechtsberatung.</p>
        </>
      )}
    </div>
  );
}
