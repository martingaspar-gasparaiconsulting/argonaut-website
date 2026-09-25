'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · Dozentenhonorare & Teilnahmebescheinigungen
//   Honorare: Einsatz je Dozent (Unterrichtseinheiten aus Terminzeiten,
//   Satz je UE, Fahrt, Auslagen, USt), Status offen → abgerechnet → bezahlt,
//   Monatsübersicht je Dozent und Honorarnachweis als Text. NUR Chef (RLS).
//   Bescheinigungen: wer hat die Anwesenheitsschwelle erreicht, wer nicht
//   (mit Grund) — Ausstellen über die bestehende PDF-Bescheinigung.
// Logik: lib/gebuehrenHonorare.ts (getestet), PDF: lib/zertifikat.ts (Bestand).
// SQL: supabase-sql/ps5-gebuehren-honorare.sql. Unterpfad von /dashboard/bildung.
// Pfad: app/dashboard/bildung/honorare/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  DOZENT_HINWEIS, UE_MINUTEN, unterrichtsEinheiten, dozentenHonorar, honorarUebersicht, bescheinigungsListe,
  euro, euroText, datumDe, heuteBerlin,
} from '@/lib/gebuehrenHonorare';
import { teilnahmebescheinigungPdf } from '@/lib/zertifikat';
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
const STATUS: Record<string, { l: string; f: string }> = { offen: { l: 'offen', f: C.warn }, abgerechnet: { l: 'abgerechnet', f: C.cyan }, bezahlt: { l: 'bezahlt', f: C.green } };
const NAECHST: Record<string, string> = { offen: 'abgerechnet', abgerechnet: 'bezahlt' };

type Kurs = { id: string; titel: string; dozent: string | null; start_am: string | null; ende_am: string | null; ort: string | null; zertifikat_aktiv: boolean };
type Termin = { id: string; kurs_id: string; datum: string; von_uhr: string | null; bis_uhr: string | null };
type Anmeldung = { id: string; kurs_id: string; name: string; status: string; zertifikat_am: string | null };
type Anw = { termin_id: string; anmeldung_id: string; anwesend: boolean };
type Honorar = { id: string; kurs_id: string | null; dozent: string; datum: string; ue: number; satz: number; fahrt_km: number; km_satz: number; auslagen: number; ust_satz: number; status: string; notiz: string | null };

const LEER = { kurs_id: '', termin_id: '', dozent: '', datum: heuteBerlin(), ue: '', satz: '', fahrt_km: '', km_satz: '0,30', auslagen: '', ust_satz: '0' };

export default function HonorareSeite() {
  const [tab, setTab] = useState<'honorare' | 'bescheinigungen'>('honorare');
  const [istChef, setIstChef] = useState(true);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [kurse, setKurse] = useState<Kurs[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [anm, setAnm] = useState<Anmeldung[]>([]);
  const [anw, setAnw] = useState<Anw[]>([]);
  const [honorare, setHonorare] = useState<Honorar[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nh, setNh] = useState(LEER);
  const [kursB, setKursB] = useState('');
  const [text, setText] = useState('');

  const laden = useCallback(async () => {
    setFehler(null);
    const [k, t, a, w] = await Promise.all([
      supabase.from('bildung_kurse').select('id, titel, dozent, start_am, ende_am, ort, zertifikat_aktiv').order('start_am', { ascending: false }),
      supabase.from('bildung_termine').select('id, kurs_id, datum, von_uhr, bis_uhr').order('datum', { ascending: true }),
      supabase.from('bildung_anmeldungen').select('id, kurs_id, name, status, zertifikat_am'),
      supabase.from('bildung_anwesenheit').select('termin_id, anmeldung_id, anwesend'),
    ]);
    setKurse((k.data as Kurs[]) ?? []); setTermine((t.data as Termin[]) ?? []);
    setAnm((a.data as Anmeldung[]) ?? []); setAnw((w.data as Anw[]) ?? []);
    const h = await supabase.from('bildung_honorar').select('*').order('datum', { ascending: false });
    if (h.error) { if (/bildung_honorar/.test(h.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + h.error.message); return; }
    setHonorare((h.data as Honorar[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name = [m.firmenname, m.firma, m.company, m.full_name, m.name].find((x) => typeof x === 'string' && x.trim());
      setAussteller(typeof name === 'string' ? name : null);
      await laden();
    })();
  }, [laden]);

  const uebersicht = useMemo(() => honorarUebersicht(honorare), [honorare]);
  const vorschau = dozentenHonorar({ ue: nh.ue, satzJeUe: nh.satz, fahrtKm: nh.fahrt_km, kmSatz: nh.km_satz, auslagen: nh.auslagen, ustSatz: nh.ust_satz });
  const kursTermine = termine.filter((t) => t.kurs_id === nh.kurs_id);

  function kursWaehlen(id: string) {
    const k = kurse.find((x) => x.id === id);
    setNh({ ...nh, kurs_id: id, termin_id: '', dozent: k?.dozent ?? nh.dozent });
  }
  function terminWaehlen(id: string) {
    const t = termine.find((x) => x.id === id);
    const ue = t ? unterrichtsEinheiten(t.von_uhr, t.bis_uhr) : null;
    setNh({ ...nh, termin_id: id, datum: t?.datum ?? nh.datum, ue: ue != null ? String(ue).replace('.', ',') : nh.ue });
  }
  async function anlegen() {
    if (!nh.dozent.trim()) { setFehler('Dozent angeben.'); return; }
    if (!vorschau.ok) { setFehler(vorschau.fehler); return; }
    const z = (s: string, std = 0) => leseZahl(s) ?? std;
    const { error } = await supabase.from('bildung_honorar').insert({
      kurs_id: nh.kurs_id || null, dozent: nh.dozent.trim(), datum: nh.datum, ue: z(nh.ue), satz: z(nh.satz),
      fahrt_km: z(nh.fahrt_km), km_satz: z(nh.km_satz, 0.3), auslagen: z(nh.auslagen), ust_satz: z(nh.ust_satz),
    });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Einsatz erfasst.'); setNh({ ...LEER, dozent: nh.dozent, satz: nh.satz, kurs_id: nh.kurs_id }); await laden();
  }
  async function weiter(h: Honorar) {
    const neu = NAECHST[h.status]; if (!neu) return;
    const { error } = await supabase.from('bildung_honorar').update({ status: neu }).eq('id', h.id);
    if (error) { setFehler('Ändern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  function nachweis(dozent: string, monat: string) {
    const liste = honorare.filter((h) => h.dozent === dozent && h.datum.startsWith(monat)).sort((a, b) => a.datum.localeCompare(b.datum));
    let summe = 0;
    const zeilen = liste.map((h) => {
      const r = dozentenHonorar({ ue: h.ue, satzJeUe: h.satz, fahrtKm: h.fahrt_km, kmSatz: h.km_satz, auslagen: h.auslagen, ustSatz: h.ust_satz });
      summe += r.bruttoCent;
      const kurs = kurse.find((k) => k.id === h.kurs_id)?.titel ?? '';
      return `${datumDe(h.datum)}  ${kurs.padEnd(28, ' ').slice(0, 28)}  ${String(h.ue).replace('.', ',')} UE × ${euroText(Number(h.satz))}${Number(h.fahrt_km) ? ` + ${h.fahrt_km} km` : ''}${Number(h.auslagen) ? ` + Auslagen` : ''}  = ${euroText(euro(r.bruttoCent))}`;
    });
    setText([`Honorarnachweis ${dozent} · ${monat.slice(5)}/${monat.slice(0, 4)}`, `${aussteller ?? ''}`, '', ...zeilen, '', `Summe: ${euroText(euro(summe))}`, `(1 UE = ${UE_MINUTEN} Minuten)`].join('\n'));
  }

  const kurs = kurse.find((k) => k.id === kursB);
  const kursTermineB = termine.filter((t) => t.kurs_id === kursB);
  const liste = useMemo(() => bescheinigungsListe(anm.filter((a) => a.kurs_id === kursB), kursTermineB.map((t) => t.id), anw), [anm, kursB, kursTermineB, anw]);

  async function bescheinigen(zeileId: string) {
    const a = anm.find((x) => x.id === zeileId);
    const z = liste.find((x) => x.anmeldungId === zeileId);
    if (!a || !kurs || !z) return;
    teilnahmebescheinigungPdf({ teilnehmer: a.name, kurstitel: kurs.titel, start: kurs.start_am, ende: kurs.ende_am, ort: kurs.ort, dozent: kurs.dozent, termineGesamt: z.termine, termineAnwesend: z.anwesend, ausstellungsdatum: heuteBerlin(), aussteller });
    if (!a.zertifikat_am) {
      const { error } = await supabase.from('bildung_anmeldungen').update({ zertifikat_am: heuteBerlin() }).eq('id', a.id);
      if (!error) await laden();
    }
    setOk(`Teilnahmebescheinigung für ${a.name} erstellt (PDF-Download).`);
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Bildung & Kurse</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧑‍🏫 Honorare & Bescheinigungen</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Was den Dozenten zusteht — und wer seine Teilnahmebescheinigung bekommt. <a href="/dashboard/bildung" style={{ color: C.cyan }}>← Zu Bildung & Kurse</a></p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([['honorare', '💶 Dozentenhonorare'], ['bescheinigungen', '🎓 Bescheinigungen']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); setFehler(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {tab === 'honorare' && (!istChef ? <div style={karte}>Dozentenhonorare verwaltet die Geschäftsführung.</div> : sqlFehlt ? <div style={{ ...karte, borderColor: C.warn }}>Die Honorar-Tabelle ist noch nicht eingerichtet (SQL von Paket PS5 fehlt).</div> : (
        <>
          <div style={karte}>
            <b>Einsatz erfassen</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
              <label>Kurs<br /><select style={feld} value={nh.kurs_id} onChange={(e) => kursWaehlen(e.target.value)}><option value="">— ohne Kurs —</option>{kurse.map((k) => <option key={k.id} value={k.id}>{k.titel}</option>)}</select></label>
              {kursTermine.length > 0 && <label>Termin<br /><select style={feld} value={nh.termin_id} onChange={(e) => terminWaehlen(e.target.value)}><option value="">— wählen —</option>{kursTermine.map((t) => <option key={t.id} value={t.id}>{datumDe(t.datum)} {t.von_uhr ?? ''}–{t.bis_uhr ?? ''}</option>)}</select></label>}
              <label>Dozent<br /><input style={{ ...feld, width: 170 }} value={nh.dozent} onChange={(e) => setNh({ ...nh, dozent: e.target.value })} /></label>
              <label>Datum<br /><input type="date" style={feld} value={nh.datum} onChange={(e) => setNh({ ...nh, datum: e.target.value })} /></label>
              <label>UE<br /><input style={{ ...feld, width: 65 }} value={nh.ue} onChange={(e) => setNh({ ...nh, ue: e.target.value })} /></label>
              <label>€ je UE<br /><input style={{ ...feld, width: 80 }} value={nh.satz} onChange={(e) => setNh({ ...nh, satz: e.target.value })} /></label>
              <label>km<br /><input style={{ ...feld, width: 65 }} value={nh.fahrt_km} onChange={(e) => setNh({ ...nh, fahrt_km: e.target.value })} /></label>
              <label>€/km<br /><input style={{ ...feld, width: 60 }} value={nh.km_satz} onChange={(e) => setNh({ ...nh, km_satz: e.target.value })} /></label>
              <label>Auslagen €<br /><input style={{ ...feld, width: 80 }} value={nh.auslagen} onChange={(e) => setNh({ ...nh, auslagen: e.target.value })} /></label>
              <label>USt %<br /><input style={{ ...feld, width: 55 }} value={nh.ust_satz} onChange={(e) => setNh({ ...nh, ust_satz: e.target.value })} /></label>
              <button style={primaer} onClick={anlegen}>＋ Erfassen</button>
            </div>
            <div style={{ color: vorschau.ok ? C.textDim : C.warn, fontSize: 13, marginTop: 8 }}>
              {vorschau.ok ? `Honorar ${euroText(euro(vorschau.honorarCent))} · Fahrt ${euroText(euro(vorschau.fahrtCent))} · Auslagen ${euroText(euro(vorschau.auslagenCent))} · gesamt ${euroText(euro(vorschau.bruttoCent))}` : (nh.ue || nh.satz ? vorschau.fehler : `1 UE = ${UE_MINUTEN} Minuten — Termin wählen füllt die UE automatisch.`)}
            </div>
          </div>
          <div style={karte}>
            <b>Übersicht je Dozent und Monat</b>
            {uebersicht.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Noch keine Einsätze erfasst.</div>}
            {uebersicht.map((u) => (
              <div key={`${u.dozent}|${u.monat}`} style={zeile}>
                <span>{u.monat.slice(5)}/{u.monat.slice(0, 4)} · <b>{u.dozent}</b> · {u.ue.toLocaleString('de-DE')} UE ({u.eintraege} Einsätze)</span>
                <span>
                  {u.offenCent > 0 && <span style={{ color: C.warn }}>offen {euroText(euro(u.offenCent))} · </span>}
                  {u.abgerechnetCent > 0 && <span style={{ color: C.cyan }}>abgerechnet {euroText(euro(u.abgerechnetCent))} · </span>}
                  {u.bezahltCent > 0 && <span style={{ color: C.green }}>bezahlt {euroText(euro(u.bezahltCent))} · </span>}
                  <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => nachweis(u.dozent, u.monat)}>📄 Nachweis</button>
                </span>
              </div>
            ))}
            {text && (
              <div style={{ marginTop: 10 }}>
                <textarea style={{ ...feld, width: '100%', minHeight: 160, fontFamily: 'monospace' }} value={text} onChange={(e) => setText(e.target.value)} />
                <button style={{ ...knopf, marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(text); setOk('Nachweis kopiert.'); }}>📋 Kopieren</button>
              </div>
            )}
          </div>
          <div style={karte}>
            <b>Einsätze</b>
            {honorare.slice(0, 60).map((h) => {
              const r = dozentenHonorar({ ue: h.ue, satzJeUe: h.satz, fahrtKm: h.fahrt_km, kmSatz: h.km_satz, auslagen: h.auslagen, ustSatz: h.ust_satz });
              return (
                <div key={h.id} style={zeile}>
                  <span>{datumDe(h.datum)} · {h.dozent} · {kurse.find((k) => k.id === h.kurs_id)?.titel ?? 'ohne Kurs'} · {String(h.ue).replace('.', ',')} UE</span>
                  <span>{euroText(euro(r.bruttoCent))} <span style={{ color: STATUS[h.status]?.f ?? C.textDim }}>· {STATUS[h.status]?.l ?? h.status}</span> {NAECHST[h.status] && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => weiter(h)}>→ {NAECHST[h.status]}</button>}</span>
                </div>
              );
            })}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{DOZENT_HINWEIS} Keine Steuer- oder Rechtsberatung.</p>
        </>
      ))}

      {tab === 'bescheinigungen' && (
        <div style={karte}>
          <label>Kurs <select style={feld} value={kursB} onChange={(e) => setKursB(e.target.value)}><option value="">— wählen —</option>{kurse.map((k) => <option key={k.id} value={k.id}>{k.titel}{k.start_am ? ` · ${datumDe(k.start_am)}` : ''}</option>)}</select></label>
          {kurs && !kurs.zertifikat_aktiv && <div style={{ color: C.warn, marginTop: 8 }}>Für diesen Kurs sind Bescheinigungen nicht eingeschaltet — das Häkchen „Zertifikat" am Kurs setzen.</div>}
          {kurs && (
            <>
              <div style={{ color: C.textDim, fontSize: 13, margin: '8px 0' }}>{kursTermineB.length} Termine · Schwelle 80 % Anwesenheit · {liste.filter((z) => z.berechtigt).length} von {liste.length} berechtigt · {liste.filter((z) => z.ausgestellt).length} ausgestellt</div>
              {liste.length === 0 && <div style={{ color: C.textDim }}>Keine Teilnehmer.</div>}
              {liste.map((z) => (
                <div key={z.anmeldungId} style={zeile}>
                  <span><b>{z.name}</b> · <span style={{ color: z.berechtigt ? C.green : C.warn }}>{z.grund}</span>{z.ausgestellt ? <span style={{ color: C.textDim }}> · ausgestellt {datumDe(z.ausgestellt)}</span> : ''}</span>
                  {z.berechtigt && kurs.zertifikat_aktiv && <button style={knopf} onClick={() => bescheinigen(z.anmeldungId)}>🎓 {z.ausgestellt ? 'Erneut' : 'Ausstellen'}</button>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
