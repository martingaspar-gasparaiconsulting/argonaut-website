'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · Tankkarte & Maut (Logistik)
//   CSV-Export der Tankkarte bzw. Einzelfahrtennachweis der Maut einlesen
//   (doppelte Buchungen werden erkannt), jede Buchung gegen Fuhrpark und
//   Touren prüfen: fremdes Kennzeichen, falscher Kraftstoff, mehr als ein
//   Tank, unplausibler Literpreis, Tag ohne Tour, Wochenende/Nacht.
//   Monatssummen je Fahrzeug; Tankung in die Fahrzeugakte übernehmen.
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// Unterpfad von /dashboard/logistik. Buchungen per RLS NUR Chef (Geld).
// Pfad: app/dashboard/logistik/tankkarten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  leseKartenCsv, buchungsSchluessel, pruefeTankung, pruefeMaut, kartenSummen, normKennzeichen, datumDe, heuteBerlin, euroText,
  type KartenArt, type KartenBuchung, type FahrzeugLite, type TourLite,
} from '@/lib/papiereIdentifizierung';
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
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap', alignItems: 'center' };
const FARBE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type Buchung = KartenBuchung & { id: string; art: KartenArt; geprueft: boolean; notiz: string | null };
type Fahrzeug = FahrzeugLite & { aktiv?: boolean };

export default function TankkartenSeite() {
  const heute = heuteBerlin();
  const [istChef, setIstChef] = useState(true);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [touren, setTouren] = useState<TourLite[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [art, setArt] = useState<KartenArt>('tanken');
  const [monat, setMonat] = useState(heute.slice(0, 7));
  const [nurAuffaellig, setNurAuffaellig] = useState(true);
  const [vorschau, setVorschau] = useState<{ zeilen: KartenBuchung[]; fehler: string[]; neu: number } | null>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('logistik_kartenbuchung').select('*').order('datum', { ascending: false }).limit(5000);
    if (r.error) { if (/logistik_kartenbuchung/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setBuchungen(((r.data as Buchung[]) ?? []).map((b) => ({ ...b, liter: b.liter == null ? null : Number(b.liter), km: b.km == null ? null : Number(b.km), betrag: b.betrag == null ? null : Number(b.betrag) })));
    const f1 = await supabase.from('fahrzeuge').select('id, kennzeichen, bezeichnung, kraftstoff, tank_liter, aktiv');
    const fDaten: unknown = f1.error ? (await supabase.from('fahrzeuge').select('id, kennzeichen, bezeichnung, kraftstoff, aktiv')).data : f1.data;
    setFahrzeuge((fDaten as Fahrzeug[] | null) ?? []);
    const t = await supabase.from('logistik_touren').select('datum, fahrzeug').order('datum', { ascending: false }).limit(5000);
    setTouren((t.data as TourLite[]) ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      const chefIst = !chef || chef === data?.user?.id;
      setIstChef(chefIst);
      if (chefIst) await laden();
    })();
  }, [laden]);

  async function datei(f: File | undefined) {
    if (!f) return;
    setFehler(null); setOk(null);
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const r = leseKartenCsv(text);
    const vorhanden = new Set(buchungen.filter((b) => b.art === art).map((b) => buchungsSchluessel(b)));
    setVorschau({ ...r, neu: r.zeilen.filter((z) => !vorhanden.has(buchungsSchluessel(z))).length });
  }
  async function importieren() {
    if (!vorschau) return;
    const vorhanden = new Set(buchungen.filter((b) => b.art === art).map((b) => buchungsSchluessel(b)));
    const neu = vorschau.zeilen.filter((z) => !vorhanden.has(buchungsSchluessel(z))).map((z) => ({ ...z, art, schluessel: buchungsSchluessel(z) }));
    for (let i = 0; i < neu.length; i += 200) {
      const { error } = await supabase.from('logistik_kartenbuchung').insert(neu.slice(i, i + 200));
      if (error) { setFehler('Import fehlgeschlagen: ' + error.message); return; }
    }
    setOk(`${neu.length} Buchungen eingelesen${vorschau.zeilen.length - neu.length ? `, ${vorschau.zeilen.length - neu.length} waren schon da` : ''}.`);
    setVorschau(null); await laden();
  }
  async function geprueft(b: Buchung, notiz?: string) {
    const { error } = await supabase.from('logistik_kartenbuchung').update({ geprueft: true, notiz: notiz ?? b.notiz }).eq('id', b.id);
    if (error) { setFehler('Ändern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  async function inAkte(b: Buchung) {
    const f = fahrzeuge.find((x) => normKennzeichen(x.kennzeichen) === normKennzeichen(b.kennzeichen));
    if (!f) { setFehler('Kennzeichen nicht im Fuhrpark.'); return; }
    const { error } = await supabase.from('fahrzeug_eintrag').insert({ fahrzeug_id: f.id, art: 'tanken', datum: b.datum, betrag_brutto: b.betrag, menge: b.liter, beschreibung: `Tankkarte${b.ort ? ` · ${b.ort}` : ''}${b.produkt ? ` · ${b.produkt}` : ''}` });
    if (error) { setFehler('Übernehmen fehlgeschlagen: ' + error.message); return; }
    await geprueft(b, 'in Fahrzeugakte übernommen');
    setOk('In die Fahrzeugakte übernommen.');
  }
  async function tankGroesse(f: Fahrzeug, wert: string) {
    const n = leseZahl(wert);
    const { error } = await supabase.from('fahrzeuge').update({ tank_liter: n }).eq('id', f.id);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }

  const imMonat = buchungen.filter((b) => b.art === art && b.datum.startsWith(monat));
  const mitBefund = useMemo(() => imMonat.map((b) => ({ b, befunde: b.art === 'maut' ? pruefeMaut(b, fahrzeuge, touren) : pruefeTankung(b, fahrzeuge, touren, buchungen.filter((x) => x.art === 'tanken')) })), [imMonat, fahrzeuge, touren, buchungen]);
  const anzeigen = mitBefund.filter((x) => !nurAuffaellig || (x.befunde.length > 0 && !x.b.geprueft));
  const summen = useMemo(() => kartenSummen(buchungen, monat), [buchungen, monat]);

  if (!istChef) return <div style={{ ...karte, color: C.text, maxWidth: 800, margin: '20px auto' }}>Tankkarten- und Maut-Abrechnungen sieht nur die Geschäftsführung.</div>;

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Logistik</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>⛽ Tankkarte & Maut</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Abrechnung einlesen — Auffälligkeiten sehen Sie sofort. <a href="/dashboard/logistik" style={{ color: C.cyan }}>← Zur Logistik</a></p>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Der Abgleich ist noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {([['tanken', '⛽ Tankkarte'], ['maut', '🛣 Maut']] as const).map(([k, t]) => <button key={k} onClick={() => { setArt(k); setVorschau(null); }} style={{ ...knopf, ...(art === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>)}
              <label style={{ ...knopf, display: 'inline-block' }}>📥 CSV einlesen<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { datei(e.target.files?.[0]); e.target.value = ''; }} /></label>
              <input type="month" style={{ ...feld, marginLeft: 'auto' }} value={monat} onChange={(e) => setMonat(e.target.value)} />
            </div>
            <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>Erkannt werden Spalten wie Datum, Uhrzeit, Kennzeichen, Produkt, Menge/Liter, Strecke/km, Betrag, Tankstelle — Trennzeichen Semikolon oder Komma.</div>
            {vorschau && (
              <div style={{ marginTop: 10 }}>
                <b>{vorschau.zeilen.length} Buchungen gelesen, davon {vorschau.neu} neu</b>
                {vorschau.fehler.slice(0, 5).map((f, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>{f}</div>)}
                {vorschau.zeilen.slice(0, 5).map((z, i) => <div key={i} style={{ color: C.textDim, fontSize: 13 }}>{datumDe(z.datum)} {z.zeit ?? ''} · {z.kennzeichen} · {z.produkt ?? ''} · {z.liter ?? z.km ?? ''} · {euroText(z.betrag)}</div>)}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button style={primaer} onClick={importieren} disabled={!vorschau.neu}>Übernehmen</button><button style={knopf} onClick={() => setVorschau(null)}>Verwerfen</button></div>
              </div>
            )}
          </div>

          <div style={karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <b>{art === 'maut' ? 'Mautfahrten' : 'Tankungen'} {monat.slice(5)}/{monat.slice(0, 4)} · {imMonat.length} Buchungen · {mitBefund.filter((x) => x.befunde.length && !x.b.geprueft).length} offen auffällig</b>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={nurAuffaellig} onChange={(e) => setNurAuffaellig(e.target.checked)} /> nur Auffälliges</label>
            </div>
            {anzeigen.length === 0 && <div style={{ color: C.green, marginTop: 6 }}>{nurAuffaellig ? 'Nichts Auffälliges.' : 'Keine Buchungen.'}</div>}
            {anzeigen.slice(0, 200).map(({ b, befunde }) => (
              <div key={b.id} style={zeile}>
                <span style={{ flex: '1 1 420px' }}>
                  {datumDe(b.datum)} {b.zeit ?? ''} · <b>{b.kennzeichen}</b> · {b.art === 'maut' ? `${b.km ?? '—'} km` : `${b.produkt ?? ''} ${b.liter != null ? `${b.liter.toLocaleString('de-DE')} l` : ''}`} · {euroText(b.betrag)}{b.ort ? ` · ${b.ort}` : ''}
                  {befunde.map((x, i) => <div key={i} style={{ color: FARBE[x.stufe], fontSize: 13 }}>{x.text}</div>)}
                  {b.notiz && <div style={{ color: C.textDim, fontSize: 12.5 }}>{b.notiz}</div>}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {b.geprueft ? <span style={{ color: C.green, fontSize: 13 }}>✓ geprüft</span> : <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => { const n = window.prompt('Notiz zur Prüfung (optional):') ?? undefined; geprueft(b, n || undefined); }}>✓ geprüft</button>}
                  {b.art === 'tanken' && !b.geprueft && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => inAkte(b)}>→ Fahrzeugakte</button>}
                </span>
              </div>
            ))}
          </div>

          <div style={karte}>
            <b>Summen {monat.slice(5)}/{monat.slice(0, 4)} je Fahrzeug</b>
            {summen.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Keine Buchungen.</div>}
            {summen.map((s) => <div key={s.kennzeichen} style={zeile}><span>{s.kennzeichen}</span><span>Tanken {euroText(s.tankenCent / 100)} ({s.liter.toLocaleString('de-DE')} l) · Maut {euroText(s.mautCent / 100)} ({s.mautKm.toLocaleString('de-DE')} km)</span></div>)}
          </div>

          <div style={karte}>
            <b>Tankgröße je Fahrzeug</b> <span style={{ color: C.textDim, fontSize: 13 }}>— für die Prüfung „mehr als ein Tank"</span>
            {fahrzeuge.filter((f) => f.aktiv !== false).map((f) => (
              <div key={f.id} style={zeile}><span>{f.kennzeichen ?? '—'} · {f.bezeichnung ?? ''} · {f.kraftstoff ?? 'Kraftstoff?'}</span>
                <input style={{ ...feld, width: 110 }} defaultValue={f.tank_liter == null ? '' : String(f.tank_liter)} placeholder="Liter" onBlur={(e) => { if (e.target.value !== String(f.tank_liter ?? '')) tankGroesse(f, e.target.value); }} /></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
