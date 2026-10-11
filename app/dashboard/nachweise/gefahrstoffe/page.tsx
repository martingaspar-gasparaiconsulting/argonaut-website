'use client';

// ============================================================
// ARGONAUT OS · Paket PS2 · Gefahrstoffverzeichnis (§ 6 GefStoffV)
// Je Stoff: Bezeichnung, Einstufung (H-Sätze, Piktogramme, Signalwort),
// Mengenbereich, Arbeitsbereiche, Sicherheitsdatenblatt (Fassung + Datei),
// Betriebsanweisung (§ 14). CMR-Stoffe (1A/1B) werden erkannt: Ersatzstoff-
// prüfung und Expositionsverzeichnis. Ampel: rot = Pflichtangabe fehlt.
// Export als CSV (Formel-Schutz) und Druck.
// Paket 318 (G2a, 11.10.2026): Verknüpfung mit dem Artikel (Menge aus dem
// Lager, SDB aus den Produkt-Dokumenten), eigene SDB-Datei für Stoffe ohne
// Artikel, Lagerklasse nach TRGS 510 (nur Feld), Lagerplatz, Erinnerung bei
// altem SDB. SDB öffnen über /api/gefahrstoff/sdb (60-Sekunden-Link).
// Logik: lib/qualitaet.ts + lib/gefahrstoffLager.ts (getestet).
// SQL: supabase-sql/ps2-qualitaet.sql + p318-gefahrstoff-2.sql.
// Unterpfad von /dashboard/nachweise (erbt dessen Freigabe).
// Pfad: app/dashboard/nachweise/gefahrstoffe/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { PIKTOGRAMME, MENGENBEREICHE, pruefeGefahrstoff, leseHSaetze, verzeichnisZeilen, heuteBerlin, datumDe, type Gefahrstoff } from '@/lib/qualitaet';
import { csvText } from '@/lib/csvSchreiben';
import {
  LAGERKLASSEN, lagerklasseText, lagerInfo, besteArtikelSdb, sdbQuelle, sdbPfad, dateiPruefen,
  sdbIstAlt, sdbErinnerungsTag, erinnerungsTitel, zusatzHinweise, lagerplatzSauber, type ArtikelSdb,
} from '@/lib/gefahrstoffLager';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Zeile = Gefahrstoff & { id: string; notiz: string | null; artikel_id?: string | null; sdb_pfad?: string | null; sdb_name?: string | null; sdb_bytes?: number | null };
type Artikel = { id: string; bezeichnung: string | null; artikelnummer: string | null; einheit: string | null; aktueller_bestand: number | null };
type Form = { id: string | null; bezeichnung: string; hersteller: string; h_saetze: string; piktogramme: string[]; signalwort: string; mengenbereich: string; arbeitsbereiche: string; sdb_datum: string; betriebsanweisung_am: string; ersatz_geprueft_am: string; notiz: string; artikel_id: string; lagerklasse: string; lagerplatz: string };
const LEER: Form = { id: null, bezeichnung: '', hersteller: '', h_saetze: '', piktogramme: [], signalwort: '', mengenbereich: '', arbeitsbereiche: '', sdb_datum: '', betriebsanweisung_am: '', ersatz_geprueft_am: '', notiz: '', artikel_id: '', lagerklasse: '', lagerplatz: '' };
const BUCKET = 'gefahrstoff-sdb';
function zufall(): string {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 12); } catch { return String(Date.now()); }
}

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
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [artikelSdb, setArtikelSdb] = useState<Record<string, ArtikelSdb>>({});
  const [artikelSuche, setArtikelSuche] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = heuteBerlin();

  const laden = useCallback(async () => {
    const r = await supabase.from('gefahrstoff').select('*').order('bezeichnung', { ascending: true });
    if (r.error) { if (/gefahrstoff/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); return; }
    const liste = (r.data as Zeile[]) ?? [];
    setZeilen(liste);
    // Artikel und ihre Sicherheitsdatenblätter (P315) — nur, wenn lesbar (Chef bzw. Recht ERP/Lager)
    const a = await supabase.from('artikel').select('id, bezeichnung, artikelnummer, einheit, aktueller_bestand').order('bezeichnung', { ascending: true }).range(0, 999);
    setArtikel(a.error ? [] : ((a.data as Artikel[]) ?? []));
    const ids = [...new Set(liste.map((z) => z.artikel_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const d = await supabase.from('produkt_dokument').select('id, artikel_id, art, sprache, ausgabe_am, aktuell').in('artikel_id', ids).eq('art', 'sdb').eq('aktuell', true);
      const roh = d.error ? [] : ((d.data as (ArtikelSdb & { artikel_id: string })[]) ?? []);
      const je: Record<string, ArtikelSdb> = {};
      for (const id of ids) { const b = besteArtikelSdb(roh.filter((x) => x.artikel_id === id)); if (b) je[id] = b; }
      setArtikelSdb(je);
    } else setArtikelSdb({});
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      setBetrieb(chef || id);
      await laden();
    })();
  }, [laden]);

  const artikelVon = useMemo(() => new Map(artikel.map((a) => [a.id, a])), [artikel]);
  const plaetze = useMemo(() => [...new Set(zeilen.map((z) => String(z.lagerplatz ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [zeilen]);
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
      artikel_id: form.artikel_id || null, lagerklasse: form.lagerklasse || null, lagerplatz: lagerplatzSauber(form.lagerplatz),
    };
    if (datei) { const pr = dateiPruefen(datei); if (!pr.ok) { setFehler(pr.fehler); return; } }
    setBusy(true);
    const r = form.id
      ? await supabase.from('gefahrstoff').update(zeile).eq('id', form.id).select('id')
      : await supabase.from('gefahrstoff').insert(zeile).select('id');
    const gespeichert = (r.data as { id: string }[] | null)?.[0]?.id ?? null;
    if (r.error || !gespeichert) {
      setBusy(false);
      setFehler(/p318|artikel_id|lagerklasse|lagerplatz/.test(r.error?.message ?? '') ? 'Speichern fehlgeschlagen — bitte zuerst das SQL von Paket 318 ausführen.' : 'Speichern fehlgeschlagen.');
      return;
    }
    let hinweis = 'Gespeichert.';
    if (datei && betrieb) {
      const alt = zeilen.find((z) => z.id === gespeichert)?.sdb_pfad ?? null;
      const pfad = sdbPfad(betrieb, gespeichert, datei.name, zufall());
      const up = await supabase.storage.from(BUCKET).upload(pfad, datei, { contentType: 'application/pdf', upsert: false });
      if (up.error) hinweis = 'Gespeichert — aber die Datei wurde nicht hochgeladen. Bitte erneut versuchen.';
      else {
        const u = await supabase.from('gefahrstoff').update({ sdb_pfad: pfad, sdb_name: datei.name.slice(0, 200), sdb_bytes: datei.size }).eq('id', gespeichert).select('id');
        if (u.error || !u.data?.length) { await supabase.storage.from(BUCKET).remove([pfad]); hinweis = 'Gespeichert — die Datei konnte nicht zugeordnet werden.'; }
        else { if (alt && alt !== pfad) await supabase.storage.from(BUCKET).remove([alt]); hinweis = 'Gespeichert, Sicherheitsdatenblatt hochgeladen.'; }
      }
    }
    setBusy(false);
    setForm(null); setDatei(null); setOk(hinweis); await laden();
  }

  async function dateiEntfernen(z: Zeile) {
    if (!z.sdb_pfad || !window.confirm('Eigene SDB-Datei entfernen? (Ein Sicherheitsdatenblatt am verknüpften Artikel bleibt.)')) return;
    setBusy(true);
    const u = await supabase.from('gefahrstoff').update({ sdb_pfad: null, sdb_name: null, sdb_bytes: null }).eq('id', z.id).select('id');
    if (u.error || !u.data?.length) { setBusy(false); setFehler('Entfernen fehlgeschlagen.'); return; }
    await supabase.storage.from(BUCKET).remove([z.sdb_pfad]);
    setBusy(false); setOk('Datei entfernt.'); await laden();
  }

  async function erinnern(z: Zeile) {
    if (!betrieb) return;
    setFehler(null); setOk(null); setBusy(true);
    const tag = sdbErinnerungsTag(z.sdb_datum, heute);
    const { error } = await supabase.from('erinnerung').insert({
      owner_user_id: betrieb, bezug_typ: 'frei', kanal: 'persoenlich', status: 'offen',
      titel: erinnerungsTitel(z.bezeichnung, z.sdb_datum), faellig_am: `${tag}T09:00`,
      notiz: 'Aktuelle Fassung beim Hersteller bzw. Lieferanten anfordern und im Gefahrstoffverzeichnis hinterlegen (Datei und Datum der Fassung).',
    });
    setBusy(false);
    if (error) { setFehler('Die Erinnerung wurde nicht angelegt — dafür braucht es das Recht „Erinnerungen“.'); return; }
    setOk(`Erinnerung angelegt für ${datumDe(tag)} (unter „Erinnerungen“).`);
  }

  async function loeschen(z: Zeile) {
    if (!window.confirm(`„${z.bezeichnung}" aus dem Verzeichnis nehmen?`)) return;
    const { data, error } = await supabase.from('gefahrstoff').delete().eq('id', z.id).select('id');
    if (error || !data?.length) { setFehler('Löschen fehlgeschlagen.'); return; }
    if (z.sdb_pfad) await supabase.storage.from(BUCKET).remove([z.sdb_pfad]);
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

  const bearbeiten = (z: Zeile) => { setDatei(null); setArtikelSuche(''); setForm({
    artikel_id: z.artikel_id ?? '', lagerklasse: z.lagerklasse ?? '', lagerplatz: z.lagerplatz ?? '',
    id: z.id, bezeichnung: z.bezeichnung ?? '', hersteller: z.hersteller ?? '', h_saetze: z.h_saetze ?? '', piktogramme: z.piktogramme ?? [],
    signalwort: z.signalwort ?? '', mengenbereich: z.mengenbereich ?? '', arbeitsbereiche: z.arbeitsbereiche ?? '',
    sdb_datum: z.sdb_datum ?? '', betriebsanweisung_am: z.betriebsanweisung_am ?? '', ersatz_geprueft_am: z.ersatz_geprueft_am ?? '', notiz: z.notiz ?? '',
  }); };

  const formArtikel = form?.artikel_id ? artikelVon.get(form.artikel_id) ?? null : null;
  const formLager = formArtikel ? lagerInfo(formArtikel.aktueller_bestand, formArtikel.einheit, form?.mengenbereich) : null;
  const artikelTreffer = useMemo(() => {
    const q = artikelSuche.trim().toLowerCase();
    const l = q ? artikel.filter((a) => `${a.bezeichnung ?? ''} ${a.artikelnummer ?? ''}`.toLowerCase().includes(q)) : artikel;
    return l.slice(0, 200);
  }, [artikel, artikelSuche]);

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
            {istChef && <button style={primaer} onClick={() => { setForm({ ...LEER }); setDatei(null); setArtikelSuche(''); setOk(null); }}>＋ Gefahrstoff</button>}
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
                <label style={lab}>Lagerklasse nach TRGS 510 (Abschnitt 7 des SDB)
                  <select style={feld} value={form.lagerklasse} onChange={(e) => setForm({ ...form, lagerklasse: e.target.value })}>
                    <option value="">— wählen —</option>{LAGERKLASSEN.map((l) => <option key={l.key} value={l.key}>LGK {l.key} · {l.label}</option>)}
                  </select>
                </label>
                <label style={lab}>Lagerplatz (für den QR-Aushang)
                  <input style={feld} list="gs-plaetze" value={form.lagerplatz} maxLength={80} placeholder="z. B. Gefahrstoffschrank Halle 2" onChange={(e) => setForm({ ...form, lagerplatz: e.target.value })} />
                  <datalist id="gs-plaetze">{plaetze.map((p) => <option key={p} value={p} />)}</datalist>
                </label>
              </div>
              <div style={{ ...lab }}>Verknüpfter Artikel (Menge aus dem Lager, Sicherheitsdatenblatt aus den Produkt-Dokumenten)</div>
              {artikel.length === 0
                ? <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 4 }}>Keine Artikel im Lager — für Stoffe im Eigenverbrauch genügt die eigene SDB-Datei unten.</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginTop: 4 }}>
                    <input style={feld} value={artikelSuche} placeholder="Artikel suchen (Name oder Nummer)" onChange={(e) => setArtikelSuche(e.target.value)} />
                    <select style={feld} value={form.artikel_id} onChange={(e) => setForm({ ...form, artikel_id: e.target.value })}>
                      <option value="">— kein Artikel —</option>
                      {formArtikel && !artikelTreffer.some((a) => a.id === formArtikel.id) && <option value={formArtikel.id}>{formArtikel.bezeichnung}</option>}
                      {artikelTreffer.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}{a.artikelnummer ? ` · ${a.artikelnummer}` : ''}</option>)}
                    </select>
                  </div>
                )}
              {formLager && (
                <div style={{ fontSize: 13.5, marginTop: 6, color: C.textDim }}>
                  {formLager.text}
                  {formLager.vorschlag && formLager.vorschlag !== form.mengenbereich && (
                    <button style={{ ...knopf, marginLeft: 8, padding: '3px 8px', fontSize: 12.5 }} onClick={() => setForm({ ...form, mengenbereich: formLager.vorschlag as string })}>Mengenbereich „{formLager.vorschlag}" übernehmen</button>
                  )}
                </div>
              )}
              {formArtikel && !form.bezeichnung.trim() && (
                <button style={{ ...knopf, marginTop: 6, padding: '3px 8px', fontSize: 12.5 }} onClick={() => setForm({ ...form, bezeichnung: String(formArtikel.bezeichnung ?? '').slice(0, 200) })}>Bezeichnung vom Artikel übernehmen</button>
              )}
              <label style={lab}>Eigene SDB-Datei (PDF, bis 20 MB){form.id && zeilen.find((z) => z.id === form.id)?.sdb_name ? ` — ersetzt „${zeilen.find((z) => z.id === form.id)?.sdb_name}"` : ''}
                <input type="file" accept="application/pdf,.pdf" style={{ ...feld, padding: 6 }} onChange={(e) => setDatei(e.target.files?.[0] ?? null)} />
              </label>
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>Nur nötig, wenn der Stoff keinen Artikel mit Sicherheitsdatenblatt hat (z. B. Reinigungsmittel im Eigenverbrauch). Die eigene Datei geht vor.</div>
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
                <button style={primaer} disabled={busy} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Speichern'}</button>
                <button style={knopf} onClick={() => { setForm(null); setDatei(null); }}>Abbrechen</button>
              </div>
            </div>
          )}

          {zeilen.length === 0 && !form && <div style={{ ...karte, color: C.textDim }}>Noch keine Gefahrstoffe erfasst. Tipp: Gehen Sie mit dem Handy durch Lager und Werkstatt — alles mit Gefahren-Piktogramm gehört hier hinein.</div>}
          {bewertet.map(({ z, p }) => {
            const art = z.artikel_id ? artikelVon.get(z.artikel_id) ?? null : null;
            const lager = art ? lagerInfo(art.aktueller_bestand, art.einheit, z.mengenbereich) : null;
            const quelle = sdbQuelle(z, z.artikel_id ? artikelSdb[z.artikel_id] ?? null : null);
            const zusatz = zusatzHinweise({ lagerklasse: z.lagerklasse, lagerplatz: z.lagerplatz, sdbVorhanden: quelle.art !== 'keine', lager });
            const stufe = p.stufe === 'gruen' && zusatz.length ? 'gelb' : p.stufe;
            const alt = !z.sdb_datum || sdbIstAlt(z.sdb_datum, heute);
            return (
            <div key={z.id} style={{ ...karte, borderLeft: `4px solid ${FARBE[stufe]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <b>{z.bezeichnung}</b>{z.hersteller ? <span style={{ color: C.textDim }}> · {z.hersteller}</span> : null}
                  {p.cmr && <span style={{ color: C.danger, fontWeight: 800 }}> · CMR</span>}
                  <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 2 }}>
                    {[z.h_saetze, (z.piktogramme ?? []).join(' '), z.signalwort, z.mengenbereich, z.arbeitsbereiche].filter(Boolean).join(' · ') || 'keine Angaben'}
                  </div>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>SDB {datumDe(z.sdb_datum)} ({quelle.text}) · Betriebsanweisung {datumDe(z.betriebsanweisung_am)}</div>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                    {[z.lagerklasse ? lagerklasseText(z.lagerklasse) : null, z.lagerplatz ? `📍 ${z.lagerplatz}` : null, art ? `Artikel: ${art.bezeichnung ?? ''}` : null, lager?.text ?? null].filter(Boolean).join(' · ')}
                  </div>
                  {p.fehler.map((f) => <div key={f} style={{ color: C.danger, fontSize: 13 }}>✕ {f}</div>)}
                  {[...p.hinweise, ...zusatz].map((h) => <div key={h} style={{ color: C.warn, fontSize: 13 }}>⚠ {h}</div>)}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {quelle.art !== 'keine' && <a style={{ ...knopf, textDecoration: 'none' }} href={`/api/gefahrstoff/sdb?id=${z.id}`} target="_blank" rel="noopener noreferrer">📄 SDB öffnen</a>}
                  {istChef && alt && <button style={knopf} disabled={busy} onClick={() => void erinnern(z)} title="Erinnerung, das aktuelle Sicherheitsdatenblatt anzufordern">🔔 Erinnern</button>}
                  {istChef && z.sdb_pfad && <button style={{ ...knopf, color: C.textDim }} disabled={busy} onClick={() => void dateiEntfernen(z)}>Datei entfernen</button>}
                  {istChef && <button style={knopf} onClick={() => bearbeiten(z)}>Bearbeiten</button>}
                  {istChef && <button style={{ ...knopf, color: C.textDim }} onClick={() => void loeschen(z)}>✕</button>}
                </div>
              </div>
            </div>
            );
          })}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>
            Hilfe zur Dokumentation — keine Rechtsberatung. Maßgeblich sind Gefährdungsbeurteilung, Sicherheitsdatenblatt und die Beratung durch Fachkraft für Arbeitssicherheit bzw. Berufsgenossenschaft.
            Unterweisung in die Betriebsanweisung: unter <a href="/dashboard/nachweise" style={{ color: C.cyan }}>Nachweise → Arbeitsschutz</a> mit Unterschrift festhalten.
          </p>
        </>
      )}
    </div>
  );
}
