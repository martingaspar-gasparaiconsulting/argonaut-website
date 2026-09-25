'use client';

// ============================================================
// ARGONAUT OS · Paket PS2 · Gefahrstoffverzeichnis (§ 6 GefStoffV)
// Je Stoff: Bezeichnung, Einstufung (H-Sätze, Piktogramme, Signalwort),
// Mengenbereich, Arbeitsbereiche, Sicherheitsdatenblatt (Fassung + Datei),
// Betriebsanweisung (§ 14). CMR-Stoffe (1A/1B) werden erkannt: Ersatzstoff-
// prüfung und Expositionsverzeichnis. Ampel: rot = Pflichtangabe fehlt.
// Export als CSV (Formel-Schutz) und Druck.
// Logik: lib/qualitaet.ts (getestet). SQL: supabase-sql/ps2-qualitaet.sql.
// Unterpfad von /dashboard/nachweise (erbt dessen Freigabe).
// Pfad: app/dashboard/nachweise/gefahrstoffe/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { PIKTOGRAMME, MENGENBEREICHE, pruefeGefahrstoff, leseHSaetze, verzeichnisZeilen, heuteBerlin, datumDe, type Gefahrstoff } from '@/lib/qualitaet';
import { csvText } from '@/lib/csvSchreiben';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Zeile = Gefahrstoff & { id: string; notiz: string | null };
type Form = { id: string | null; bezeichnung: string; hersteller: string; h_saetze: string; piktogramme: string[]; signalwort: string; mengenbereich: string; arbeitsbereiche: string; sdb_datum: string; betriebsanweisung_am: string; ersatz_geprueft_am: string; notiz: string };
const LEER: Form = { id: null, bezeichnung: '', hersteller: '', h_saetze: '', piktogramme: [], signalwort: '', mengenbereich: '', arbeitsbereiche: '', sdb_datum: '', betriebsanweisung_am: '', ersatz_geprueft_am: '', notiz: '' };

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };
const FARBE = { rot: C.danger, gelb: C.warn, gruen: C.green } as const;

export default function GefahrstoffeSeite() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = heuteBerlin();

  const laden = useCallback(async () => {
    const r = await supabase.from('gefahrstoff').select('*').order('bezeichnung', { ascending: true });
    if (r.error) { if (/gefahrstoff/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); return; }
    setZeilen((r.data as Zeile[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      await laden();
    })();
  }, [laden]);

  const bewertet = useMemo(() => zeilen.map((z) => ({ z, p: pruefeGefahrstoff(z, heute) }))
    .sort((a, b) => ({ rot: 0, gelb: 1, gruen: 2 }[a.p.stufe] - { rot: 0, gelb: 1, gruen: 2 }[b.p.stufe]) || String(a.z.bezeichnung).localeCompare(String(b.z.bezeichnung), 'de')), [zeilen, heute]);
  const rot = bewertet.filter((x) => x.p.stufe === 'rot').length;
  const cmr = bewertet.filter((x) => x.p.cmr).length;
  const vorschau = form ? pruefeGefahrstoff({ ...form, id: undefined, sdb_datum: form.sdb_datum || null, betriebsanweisung_am: form.betriebsanweisung_am || null, ersatz_geprueft_am: form.ersatz_geprueft_am || null }, heute) : null;

  async function speichern() {
    if (!form) return;
    setFehler(null);
    if (!form.bezeichnung.trim()) { setFehler('Bitte die Bezeichnung angeben.'); return; }
    const zeile = {
      bezeichnung: form.bezeichnung.trim().slice(0, 200), hersteller: form.hersteller.trim() || null,
      h_saetze: leseHSaetze(form.h_saetze).join(', ') || null, piktogramme: form.piktogramme, signalwort: form.signalwort || null,
      mengenbereich: form.mengenbereich || null, arbeitsbereiche: form.arbeitsbereiche.trim() || null,
      sdb_datum: form.sdb_datum || null, betriebsanweisung_am: form.betriebsanweisung_am || null, ersatz_geprueft_am: form.ersatz_geprueft_am || null,
      notiz: form.notiz.trim() || null, aktualisiert_am: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from('gefahrstoff').update(zeile).eq('id', form.id)
      : await supabase.from('gefahrstoff').insert(zeile);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    setForm(null); setOk('Gespeichert.'); await laden();
  }

  async function loeschen(z: Zeile) {
    if (!window.confirm(`„${z.bezeichnung}" aus dem Verzeichnis nehmen?`)) return;
    const { error } = await supabase.from('gefahrstoff').delete().eq('id', z.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }

  function csv() {
    const text = csvText(verzeichnisZeilen(zeilen));
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Gefahrstoffverzeichnis_${heute}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function drucken() {
    const t = verzeichnisZeilen(zeilen);
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html lang="de"><head><title>Gefahrstoffverzeichnis</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body>`
      + `<h2>Gefahrstoffverzeichnis nach § 6 GefStoffV</h2><p>Stand ${datumDe(heute)}</p><table><tr>${t[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
      + t.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</table></body></html>');
    w.document.close(); w.focus(); w.print();
  }

  const bearbeiten = (z: Zeile) => setForm({
    id: z.id, bezeichnung: z.bezeichnung ?? '', hersteller: z.hersteller ?? '', h_saetze: z.h_saetze ?? '', piktogramme: z.piktogramme ?? [],
    signalwort: z.signalwort ?? '', mengenbereich: z.mengenbereich ?? '', arbeitsbereiche: z.arbeitsbereiche ?? '',
    sdb_datum: z.sdb_datum ?? '', betriebsanweisung_am: z.betriebsanweisung_am ?? '', ersatz_geprueft_am: z.ersatz_geprueft_am ?? '', notiz: z.notiz ?? '',
  });

  return (
    <div style={{ color: C.text, maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Arbeitsschutz</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>☣️ Gefahrstoffverzeichnis</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>
        Pflicht für jeden Betrieb mit Gefahrstoffen (§ 6 GefStoffV): welche Stoffe, wie gefährlich, wie viel, wo verwendet — mit Sicherheitsdatenblatt und Betriebsanweisung.{' '}
        <a href="/dashboard/nachweise" style={{ color: C.cyan }}>Zurück zu Nachweise &amp; Fristen</a>
      </p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Das Verzeichnis ist noch nicht eingerichtet (SQL von Paket PS2 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {istChef && <button style={primaer} onClick={() => { setForm({ ...LEER }); setOk(null); }}>＋ Gefahrstoff</button>}
            {zeilen.length > 0 && <button style={knopf} onClick={csv}>⬇ CSV</button>}
            {zeilen.length > 0 && <button style={knopf} onClick={drucken}>🖨 Drucken</button>}
            <span style={{ color: rot ? C.danger : C.textDim, fontSize: 14 }}>{zeilen.length} Stoffe · {rot} mit fehlenden Angaben{cmr ? ` · ${cmr} CMR-Stoff${cmr === 1 ? '' : 'e'}` : ''}</span>
          </div>

          {form && (
            <div style={{ ...karte, borderColor: C.gold }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                <label style={lab}>Bezeichnung (Handelsname)<input style={feld} value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} /></label>
                <label style={lab}>Hersteller / Lieferant<input style={feld} value={form.hersteller} onChange={(e) => setForm({ ...form, hersteller: e.target.value })} /></label>
                <label style={lab}>H-Sätze (Abschnitt 2 des Sicherheitsdatenblatts)<input style={feld} value={form.h_saetze} placeholder="z. B. H225, H319, EUH066" onChange={(e) => setForm({ ...form, h_saetze: e.target.value })} /></label>
                <label style={lab}>Signalwort
                  <select style={feld} value={form.signalwort} onChange={(e) => setForm({ ...form, signalwort: e.target.value })}>
                    <option value="">—</option><option value="Gefahr">Gefahr</option><option value="Achtung">Achtung</option>
                  </select>
                </label>
                <label style={lab}>Mengenbereich im Betrieb
                  <select style={feld} value={form.mengenbereich} onChange={(e) => setForm({ ...form, mengenbereich: e.target.value })}>
                    <option value="">— wählen —</option>{MENGENBEREICHE.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label style={lab}>Arbeitsbereiche<input style={feld} value={form.arbeitsbereiche} placeholder="z. B. Werkstatt, Lackierkabine" onChange={(e) => setForm({ ...form, arbeitsbereiche: e.target.value })} /></label>
                <label style={lab}>Sicherheitsdatenblatt — Fassung vom<input type="date" style={feld} value={form.sdb_datum} onChange={(e) => setForm({ ...form, sdb_datum: e.target.value })} /></label>
                <label style={lab}>Betriebsanweisung erstellt am<input type="date" style={feld} value={form.betriebsanweisung_am} onChange={(e) => setForm({ ...form, betriebsanweisung_am: e.target.value })} /></label>
                {vorschau?.cmr && <label style={lab}>Ersatzstoffprüfung dokumentiert am<input type="date" style={feld} value={form.ersatz_geprueft_am} onChange={(e) => setForm({ ...form, ersatz_geprueft_am: e.target.value })} /></label>}
              </div>
              <div style={{ ...lab }}>Piktogramme</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {PIKTOGRAMME.map((p) => {
                  const an = form.piktogramme.includes(p.key);
                  return <button key={p.key} style={{ ...knopf, ...(an ? { background: C.gold, color: C.navy, border: 'none', fontWeight: 800 } : {}) }}
                    onClick={() => setForm({ ...form, piktogramme: an ? form.piktogramme.filter((x) => x !== p.key) : [...form.piktogramme, p.key] })}>{p.key} {p.label}</button>;
                })}
              </div>
              <label style={lab}>Notiz (z. B. Ablageort des Sicherheitsdatenblatts)<input style={feld} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
              {vorschau && (
                <div style={{ marginTop: 10, fontSize: 13.5 }}>
                  {vorschau.fehler.map((f) => <div key={f} style={{ color: C.danger }}>✕ {f}</div>)}
                  {vorschau.hinweise.map((h) => <div key={h} style={{ color: C.warn }}>⚠ {h}</div>)}
                  {vorschau.stufe === 'gruen' && <div style={{ color: C.green }}>✓ Alle Pflichtangaben vorhanden</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={primaer} onClick={() => void speichern()}>💾 Speichern</button>
                <button style={knopf} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {zeilen.length === 0 && !form && <div style={{ ...karte, color: C.textDim }}>Noch keine Gefahrstoffe erfasst. Tipp: Gehen Sie mit dem Handy durch Lager und Werkstatt — alles mit Gefahren-Piktogramm gehört hier hinein.</div>}
          {bewertet.map(({ z, p }) => (
            <div key={z.id} style={{ ...karte, borderLeft: `4px solid ${FARBE[p.stufe]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <b>{z.bezeichnung}</b>{z.hersteller ? <span style={{ color: C.textDim }}> · {z.hersteller}</span> : null}
                  {p.cmr && <span style={{ color: C.danger, fontWeight: 800 }}> · CMR</span>}
                  <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 2 }}>
                    {[z.h_saetze, (z.piktogramme ?? []).join(' '), z.signalwort, z.mengenbereich, z.arbeitsbereiche].filter(Boolean).join(' · ') || 'keine Angaben'}
                  </div>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>SDB {datumDe(z.sdb_datum)} · Betriebsanweisung {datumDe(z.betriebsanweisung_am)}</div>
                  {p.fehler.map((f) => <div key={f} style={{ color: C.danger, fontSize: 13 }}>✕ {f}</div>)}
                  {p.hinweise.map((h) => <div key={h} style={{ color: C.warn, fontSize: 13 }}>⚠ {h}</div>)}
                </div>
                {istChef && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <button style={knopf} onClick={() => bearbeiten(z)}>Bearbeiten</button>
                    <button style={{ ...knopf, color: C.textDim }} onClick={() => void loeschen(z)}>✕</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>
            Hilfe zur Dokumentation — keine Rechtsberatung. Maßgeblich sind Gefährdungsbeurteilung, Sicherheitsdatenblatt und die Beratung durch Fachkraft für Arbeitssicherheit bzw. Berufsgenossenschaft.
            Unterweisung in die Betriebsanweisung: unter <a href="/dashboard/nachweise" style={{ color: C.cyan }}>Nachweise → Arbeitsschutz</a> mit Unterschrift festhalten.
          </p>
        </>
      )}
    </div>
  );
}
