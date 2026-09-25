'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · Meldeschein & Kurtaxe (Beherbergung)
//   Meldeschein nur für Gäste ohne deutsche Staatsangehörigkeit (seit 2025),
//   Pflichtangaben § 30 BMG, Unterschrift mit dem Finger, Aufbewahrung 1 Jahr
//   und Vernichtungs-Liste. Kurtaxe je Belegung nach den Sätzen der Gemeinde,
//   Monatsliste zur Abrechnung mit der Gemeinde.
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// Unterpfad von /dashboard/gastro (erbt dessen Freigabe). Löschen nur der Chef.
// Pfad: app/dashboard/gastro/meldeschein/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  MELDESCHEIN_HINWEIS, meldepflichtig, pruefeMeldeschein, meldescheinFristen, kurtaxe, datumDe, heuteBerlin, euroText,
  type KurtaxeGast,
} from '@/lib/papiereIdentifizierung';
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
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap', alignItems: 'center' };
const FARBE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type Belegung = { id: string; gast_name: string | null; personen: number; anreise: string; abreise: string; status: string };
type Schein = { id: string; belegung_id: string | null; ankunft: string; abreise: string; familienname: string; vornamen: string | null; geburtsdatum: string | null; staatsangehoerigkeit: string | null; anschrift: string | null; mitreisende_anzahl: number; mitreisende_staaten: string | null; partner_name: string | null; ausweis_nr: string | null; reisegruppe: boolean; unterschrift: string | null };
type Satz = { id?: string; gemeinde: string | null; satz_erwachsen: number | null; satz_kind: number | null; kind_bis_alter: number | null; frei_bis_alter: number | null; max_naechte: number | null };
type KtBeleg = { id: string; belegung_id: string | null; anreise: string; abreise: string; gaeste: KurtaxeGast[]; betrag: number; gemeldet_am: string | null };

const LEER = { belegung_id: '', ankunft: '', abreise: '', familienname: '', vornamen: '', geburtsdatum: '', staatsangehoerigkeit: '', anschrift: '', mitreisende_anzahl: '0', mitreisende_staaten: '', partner_name: '', ausweis_nr: '', reisegruppe: false };

function Unterschrift({ onFertig }: { onFertig: (d: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const leer = useRef(true);
  function pos(e: React.PointerEvent<HTMLCanvasElement>) { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 600, y: ((e.clientY - r.top) / r.height) * 160 }; }
  return (
    <div>
      <canvas ref={ref} width={600} height={160} style={{ width: '100%', maxWidth: 600, height: 160, background: '#fff', borderRadius: 8, touchAction: 'none' }}
        onPointerDown={(e) => { const c = ref.current?.getContext('2d'); if (!c) return; zeichnet.current = true; const p = pos(e); c.lineWidth = 2.5; c.lineCap = 'round'; c.strokeStyle = '#0A1628'; c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!zeichnet.current) return; const c = ref.current?.getContext('2d'); if (!c) return; const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); leer.current = false; }}
        onPointerUp={() => { zeichnet.current = false; onFertig(leer.current ? null : ref.current?.toDataURL('image/png') ?? null); }}
        onPointerLeave={() => { if (zeichnet.current) { zeichnet.current = false; onFertig(leer.current ? null : ref.current?.toDataURL('image/png') ?? null); } }} />
      <button style={{ ...knopf, marginTop: 6 }} onClick={() => { const c = ref.current?.getContext('2d'); c?.clearRect(0, 0, 600, 160); leer.current = true; onFertig(null); }}>Unterschrift löschen</button>
    </div>
  );
}

export default function MeldescheinSeite() {
  const heute = heuteBerlin();
  const [tab, setTab] = useState<'meldeschein' | 'kurtaxe' | 'aufbewahrung'>('meldeschein');
  const [istChef, setIstChef] = useState(true);
  const [belegungen, setBelegungen] = useState<Belegung[]>([]);
  const [scheine, setScheine] = useState<Schein[]>([]);
  const [satz, setSatz] = useState<Satz | null>(null);
  const [ktBelege, setKtBelege] = useState<KtBeleg[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState(LEER);
  const [sig, setSig] = useState<string | null>(null);
  const [sigKey, setSigKey] = useState(0);
  const [offen, setOffen] = useState<Schein | null>(null);
  const [ktBeleg, setKtBeleg] = useState<Belegung | null>(null);
  const [gaeste, setGaeste] = useState<{ name: string; alter: string; befreit: boolean }[]>([]);
  const [monat, setMonat] = useState(heute.slice(0, 7));
  const [ns, setNs] = useState({ gemeinde: '', satz_erwachsen: '', satz_kind: '', kind_bis_alter: '', frei_bis_alter: '', max_naechte: '' });

  const laden = useCallback(async () => {
    setFehler(null);
    const s = await supabase.from('hotel_meldeschein').select('*').order('ankunft', { ascending: false }).limit(1000);
    if (s.error) { if (/hotel_meldeschein/.test(s.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + s.error.message); return; }
    setScheine((s.data as Schein[]) ?? []);
    const [b, k, kb] = await Promise.all([
      supabase.from('hotel_belegungen').select('id, gast_name, personen, anreise, abreise, status').neq('status', 'storniert').order('anreise', { ascending: false }).limit(300),
      supabase.from('hotel_kurtaxe').select('*').maybeSingle(),
      supabase.from('hotel_kurtaxe_beleg').select('*').order('anreise', { ascending: false }).limit(1000),
    ]);
    setBelegungen((b.data as Belegung[]) ?? []);
    const st = (k.data as Satz | null) ?? null;
    setSatz(st);
    if (st) setNs({ gemeinde: st.gemeinde ?? '', satz_erwachsen: zahlFeld(st.satz_erwachsen ?? '').replace('.', ','), satz_kind: st.satz_kind == null ? '' : zahlFeld(st.satz_kind).replace('.', ','), kind_bis_alter: st.kind_bis_alter == null ? '' : zahlFeld(st.kind_bis_alter), frei_bis_alter: st.frei_bis_alter == null ? '' : zahlFeld(st.frei_bis_alter), max_naechte: st.max_naechte == null ? '' : zahlFeld(st.max_naechte) });
    setKtBelege((kb.data as KtBeleg[]) ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === data?.user?.id);
      await laden();
    })();
  }, [laden]);

  const pflicht = meldepflichtig(form.staatsangehoerigkeit);
  const pruefung = pruefeMeldeschein({ ...form, mitreisende_anzahl: leseZahl(form.mitreisende_anzahl) ?? 0, unterschrift: sig });
  const aktuelle = belegungen.filter((b) => b.abreise >= heute).sort((a, b) => a.anreise.localeCompare(b.anreise));
  const scheinZu = (bid: string) => scheine.find((s) => s.belegung_id === bid);

  function aus(b: Belegung) {
    const teile = String(b.gast_name ?? '').trim().split(/\s+/);
    setForm({ ...LEER, belegung_id: b.id, ankunft: b.anreise, abreise: b.abreise, familienname: teile.length > 1 ? teile.slice(-1).join(' ') : teile[0] ?? '', vornamen: teile.length > 1 ? teile.slice(0, -1).join(' ') : '' });
    setSig(null); setSigKey((k) => k + 1); setOk(null); setFehler(null);
  }
  async function speichern() {
    if (pflicht !== true) { setFehler(pflicht === false ? 'Deutsche Gäste brauchen keinen Meldeschein.' : 'Zuerst die Staatsangehörigkeit eintragen.'); return; }
    if (!pruefung.vollstaendig) { setFehler('Es fehlt: ' + pruefung.fehlt.join(', ')); return; }
    const { error } = await supabase.from('hotel_meldeschein').insert({
      belegung_id: form.belegung_id || null, ankunft: form.ankunft, abreise: form.abreise, familienname: form.familienname.trim(), vornamen: form.vornamen.trim() || null,
      geburtsdatum: form.geburtsdatum || null, staatsangehoerigkeit: form.staatsangehoerigkeit.trim(), anschrift: form.anschrift.trim(),
      mitreisende_anzahl: leseZahl(form.mitreisende_anzahl) ?? 0, mitreisende_staaten: form.mitreisende_staaten.trim() || null, partner_name: form.partner_name.trim() || null,
      ausweis_nr: form.ausweis_nr.trim(), reisegruppe: form.reisegruppe, unterschrift: sig,
    });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Meldeschein gespeichert.'); setForm(LEER); setSig(null); setSigKey((k) => k + 1); await laden();
  }
  async function vernichten(s: Schein) {
    if (!window.confirm(`Meldeschein ${s.familienname} (Abreise ${datumDe(s.abreise)}) endgültig vernichten?`)) return;
    const { error } = await supabase.from('hotel_meldeschein').delete().eq('id', s.id);
    if (error) { setFehler('Vernichten fehlgeschlagen: ' + error.message); return; }
    setOk('Meldeschein vernichtet.'); await laden();
  }

  // --- Kurtaxe ---
  const ktErgebnis = useMemo(() => (ktBeleg && satz ? kurtaxe(ktBeleg.anreise, ktBeleg.abreise, gaeste.map((g) => ({ name: g.name, alter: g.alter, befreit: g.befreit })), satz) : null), [ktBeleg, gaeste, satz]);
  function ktOeffnen(b: Belegung) {
    const vorhanden = ktBelege.find((k) => k.belegung_id === b.id);
    setKtBeleg(b);
    setGaeste(vorhanden ? vorhanden.gaeste.map((g) => ({ name: g.name ?? '', alter: g.alter == null ? '' : zahlFeld(g.alter), befreit: !!g.befreit })) : Array.from({ length: Math.max(1, b.personen) }, (_, i) => ({ name: i === 0 ? b.gast_name ?? '' : '', alter: '', befreit: false })));
  }
  async function ktSpeichern() {
    if (!ktBeleg || !ktErgebnis?.ok) return;
    const vorhanden = ktBelege.find((k) => k.belegung_id === ktBeleg.id);
    const daten = { belegung_id: ktBeleg.id, anreise: ktBeleg.anreise, abreise: ktBeleg.abreise, gaeste: gaeste.map((g) => ({ name: g.name, alter: leseZahl(g.alter), befreit: g.befreit })), betrag: ktErgebnis.summeCent / 100 };
    const { error } = vorhanden ? await supabase.from('hotel_kurtaxe_beleg').update(daten).eq('id', vorhanden.id) : await supabase.from('hotel_kurtaxe_beleg').insert(daten);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Kurtaxe gespeichert.'); setKtBeleg(null); await laden();
  }
  const monatsListe = ktBelege.filter((k) => k.anreise.startsWith(monat));
  async function alsGemeldet() {
    const ids = monatsListe.filter((k) => !k.gemeldet_am).map((k) => k.id);
    if (!ids.length) return;
    for (const id of ids) { const { error } = await supabase.from('hotel_kurtaxe_beleg').update({ gemeldet_am: heute }).eq('id', id); if (error) { setFehler('Vermerken fehlgeschlagen: ' + error.message); return; } }
    setOk(`${ids.length} Belegungen als an die Gemeinde gemeldet vermerkt.`); await laden();
  }
  async function satzSpeichern() {
    const erw = leseZahl(ns.satz_erwachsen);
    if (erw == null || erw < 0) { setFehler('Satz für Erwachsene angeben.'); return; }
    const z = (s: string) => (s.trim() ? leseZahl(s) : null);
    const daten = { gemeinde: ns.gemeinde.trim() || null, satz_erwachsen: erw, satz_kind: z(ns.satz_kind), kind_bis_alter: z(ns.kind_bis_alter), frei_bis_alter: z(ns.frei_bis_alter), max_naechte: z(ns.max_naechte), aktualisiert_am: new Date().toISOString() };
    const { error } = satz?.id ? await supabase.from('hotel_kurtaxe').update(daten).eq('id', satz.id) : await supabase.from('hotel_kurtaxe').insert(daten);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Kurtaxe-Sätze gespeichert.'); await laden();
  }
  function meldelisteText(): string {
    return [`Kurtaxe-Meldung ${monat.slice(5)}/${monat.slice(0, 4)}${satz?.gemeinde ? ` · ${satz.gemeinde}` : ''}`, '', ...monatsListe.map((k) => `${datumDe(k.anreise)}–${datumDe(k.abreise)}  ${k.gaeste.length} Gäste  ${euroText(Number(k.betrag))}`), '', `Summe: ${euroText(monatsListe.reduce((s, k) => s + Number(k.betrag), 0))}`].join('\n');
  }

  const aufbewahrung = scheine.map((s) => ({ s, f: meldescheinFristen(s.abreise, heute) })).filter((x) => x.f.stufe !== 'ok');

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Gastro & Hotel</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🪪 Meldeschein & Kurtaxe</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Meldeschein nur, wo er noch Pflicht ist — Kurtaxe richtig berechnet und gemeldet. <a href="/dashboard/gastro" style={{ color: C.cyan }}>← Zu Gastro & Hotel</a></p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {([['meldeschein', '🪪 Meldeschein'], ['kurtaxe', '🏖 Kurtaxe'], ['aufbewahrung', `🗂 Aufbewahrung${aufbewahrung.length ? ` (${aufbewahrung.length})` : ''}`]] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); setFehler(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Meldeschein und Kurtaxe sind noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'meldeschein' && (
        <>
          <div style={karte}>
            <b>Aktuelle und kommende Belegungen</b>
            {aktuelle.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Keine aktuellen oder kommenden Belegungen.</div>}
            {aktuelle.slice(0, 40).map((b) => { const s = scheinZu(b.id); return (
              <div key={b.id} style={zeile}>
                <span>{datumDe(b.anreise)}–{datumDe(b.abreise)} · {b.gast_name ?? 'Gast'} · {b.personen} Pers.</span>
                {s ? <span style={{ color: C.green }}>✓ Meldeschein {s.familienname}</span> : <button style={knopf} onClick={() => aus(b)}>🪪 Meldeschein</button>}
              </div>
            ); })}
            <button style={{ ...knopf, marginTop: 8 }} onClick={() => { setForm({ ...LEER, ankunft: heute }); setSig(null); setSigKey((k) => k + 1); }}>＋ Meldeschein ohne Belegung</button>
          </div>
          {(form.ankunft || form.belegung_id) && (
            <div style={karte}>
              <b>Meldeschein</b>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                <label>Staatsangehörigkeit(en)<br /><input style={{ ...feld, width: 200 }} value={form.staatsangehoerigkeit} onChange={(e) => setForm({ ...form, staatsangehoerigkeit: e.target.value })} placeholder="z. B. AT oder Österreich" /></label>
                <span style={{ color: pflicht === true ? C.warn : pflicht === false ? C.green : C.textDim, fontWeight: 700 }}>{pflicht === true ? 'Meldeschein nötig' : pflicht === false ? 'Deutsche Staatsangehörigkeit — kein Meldeschein nötig' : 'zuerst Staatsangehörigkeit eintragen'}</span>
              </div>
              {pflicht === true && (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
                    <label>Ankunft<br /><input type="date" style={feld} value={form.ankunft} onChange={(e) => setForm({ ...form, ankunft: e.target.value })} /></label>
                    <label>Abreise (voraussichtl.)<br /><input type="date" style={feld} value={form.abreise} onChange={(e) => setForm({ ...form, abreise: e.target.value })} /></label>
                    <label>Familienname<br /><input style={feld} value={form.familienname} onChange={(e) => setForm({ ...form, familienname: e.target.value })} /></label>
                    <label>Vornamen<br /><input style={feld} value={form.vornamen} onChange={(e) => setForm({ ...form, vornamen: e.target.value })} /></label>
                    <label>Geburtsdatum<br /><input type="date" style={feld} value={form.geburtsdatum} onChange={(e) => setForm({ ...form, geburtsdatum: e.target.value })} /></label>
                    <label>Anschrift<br /><input style={{ ...feld, width: 280 }} value={form.anschrift} onChange={(e) => setForm({ ...form, anschrift: e.target.value })} /></label>
                    <label>Pass-/Ausweisnr.<br /><input style={feld} value={form.ausweis_nr} onChange={(e) => setForm({ ...form, ausweis_nr: e.target.value })} /></label>
                    <label>Ausl. Mitreisende<br /><input style={{ ...feld, width: 70 }} value={form.mitreisende_anzahl} onChange={(e) => setForm({ ...form, mitreisende_anzahl: e.target.value })} /></label>
                    {(leseZahl(form.mitreisende_anzahl) ?? 0) > 0 && <label>deren Staatsangehörigkeiten<br /><input style={feld} value={form.mitreisende_staaten} onChange={(e) => setForm({ ...form, mitreisende_staaten: e.target.value })} /></label>}
                    <label>Mitreisende/r Ehe-/Lebenspartner/in<br /><input style={feld} value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} /></label>
                    <label style={{ fontSize: 13 }}><input type="checkbox" checked={form.reisegruppe} onChange={(e) => setForm({ ...form, reisegruppe: e.target.checked })} /> Reisegruppe (Reiseleitung)</label>
                  </div>
                  <div style={{ marginTop: 10 }}><b style={{ fontSize: 13.5 }}>Unterschrift des Gastes{form.partner_name ? ' (und Partner/in)' : ''}</b><Unterschrift key={sigKey} onFertig={setSig} /></div>
                  {pruefung.fehlt.length > 0 && <div style={{ color: C.warn, fontSize: 13.5, marginTop: 8 }}>Es fehlt: {pruefung.fehlt.join(', ')}</div>}
                  {pruefung.befunde.map((b, i) => <div key={i} style={{ color: FARBE[b.stufe], fontSize: 13.5 }}>{b.text}</div>)}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button style={primaer} onClick={speichern}>💾 Meldeschein speichern</button>
                    <button style={knopf} onClick={() => { setForm(LEER); setSig(null); }}>Abbrechen</button>
                  </div>
                </>
              )}
            </div>
          )}
          <div style={karte}>
            <b>Letzte Meldescheine</b>
            {scheine.slice(0, 30).map((s) => (
              <div key={s.id} style={zeile}>
                <span>{datumDe(s.ankunft)}–{datumDe(s.abreise)} · {s.familienname}{s.vornamen ? `, ${s.vornamen}` : ''} · {s.staatsangehoerigkeit}</span>
                <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setOffen(offen?.id === s.id ? null : s)}>{offen?.id === s.id ? 'zu' : 'ansehen / drucken'}</button>
                {offen?.id === s.id && (
                  <div id="meldeschein-druck" style={{ width: '100%', background: '#fff', color: '#000', padding: 16, borderRadius: 8, fontSize: 13.5 }}>
                    <b>Meldeschein für Beherbergungsstätten</b><br />
                    Ankunft {datumDe(s.ankunft)} · voraussichtliche Abreise {datumDe(s.abreise)}<br />
                    {s.familienname}, {s.vornamen} · geb. {datumDe(s.geburtsdatum)} · {s.staatsangehoerigkeit}<br />
                    {s.anschrift}<br />Pass/Ausweis-Nr.: {s.ausweis_nr}<br />
                    Ausländische Mitreisende: {s.mitreisende_anzahl}{s.mitreisende_staaten ? ` (${s.mitreisende_staaten})` : ''}{s.partner_name ? ` · Partner/in: ${s.partner_name}` : ''}<br />
                    {s.unterschrift && <img src={s.unterschrift} alt="Unterschrift" style={{ height: 60, marginTop: 6 }} />}
                    <div><button style={{ ...knopf, color: C.navy, marginTop: 6 }} onClick={() => window.print()}>🖨 Drucken</button></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{MELDESCHEIN_HINWEIS}</p>
        </>
      )}

      {!sqlFehlt && tab === 'kurtaxe' && (
        <>
          {!satz ? (
            <div style={{ ...karte, borderColor: C.warn }}>Noch kein Kurtaxe-Satz hinterlegt. {istChef ? 'Unten die Sätze Ihrer Gemeinde eintragen.' : 'Bitte den Chef, die Sätze der Gemeinde einzutragen.'}</div>
          ) : (
            <div style={karte}>
              <b>Belegungen</b> <span style={{ color: C.textDim, fontSize: 13 }}>· {satz.gemeinde ?? 'Gemeinde'}: {euroText(Number(satz.satz_erwachsen))} je Nacht{satz.satz_kind != null ? ` · Kinder ${euroText(Number(satz.satz_kind))}` : ''}</span>
              {belegungen.slice(0, 40).map((b) => { const k = ktBelege.find((x) => x.belegung_id === b.id); return (
                <div key={b.id} style={zeile}>
                  <span>{datumDe(b.anreise)}–{datumDe(b.abreise)} · {b.gast_name ?? 'Gast'} · {b.personen} Pers.</span>
                  <span>{k && <span style={{ color: C.green }}>{euroText(Number(k.betrag))}{k.gemeldet_am ? ' · gemeldet' : ''} </span>}<button style={{ ...knopf, padding: '3px 8px' }} onClick={() => ktOeffnen(b)}>{k ? 'ändern' : 'berechnen'}</button></span>
                </div>
              ); })}
            </div>
          )}
          {ktBeleg && satz && (
            <div style={karte}>
              <b>Kurtaxe {datumDe(ktBeleg.anreise)}–{datumDe(ktBeleg.abreise)}</b>
              {gaeste.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...feld, width: 200 }} placeholder="Name" value={g.name} onChange={(e) => setGaeste(gaeste.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input style={{ ...feld, width: 80 }} placeholder="Alter" value={g.alter} onChange={(e) => setGaeste(gaeste.map((x, j) => (j === i ? { ...x, alter: e.target.value } : x)))} />
                  <label style={{ fontSize: 13 }}><input type="checkbox" checked={g.befreit} onChange={(e) => setGaeste(gaeste.map((x, j) => (j === i ? { ...x, befreit: e.target.checked } : x)))} /> befreit</label>
                  <span style={{ color: C.textDim, fontSize: 13 }}>{ktErgebnis?.ok ? `${euroText(ktErgebnis.zeilen[i].betragCent / 100)} · ${ktErgebnis.zeilen[i].grund}` : ''}</span>
                  {gaeste.length > 1 && <button style={{ ...knopf, color: C.danger }} onClick={() => setGaeste(gaeste.filter((_, j) => j !== i))}>✕</button>}
                </div>
              ))}
              <button style={{ ...knopf, marginTop: 6 }} onClick={() => setGaeste([...gaeste, { name: '', alter: '', befreit: false }])}>＋ Gast</button>
              <div style={{ marginTop: 8, color: ktErgebnis?.ok ? C.gold : C.warn, fontWeight: 700 }}>{ktErgebnis?.ok ? `${ktErgebnis.naechte} Nächte · Kurtaxe ${euroText(ktErgebnis.summeCent / 100)}` : ktErgebnis?.fehler}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button style={primaer} onClick={ktSpeichern} disabled={!ktErgebnis?.ok}>💾 Speichern</button><button style={knopf} onClick={() => setKtBeleg(null)}>Abbrechen</button></div>
            </div>
          )}
          <div style={karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b>Meldung an die Gemeinde</b>
              <input type="month" style={feld} value={monat} onChange={(e) => setMonat(e.target.value)} />
            </div>
            <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 6 }}>{monatsListe.length} Belegungen · {monatsListe.reduce((s, k) => s + k.gaeste.length, 0)} Gäste · {euroText(monatsListe.reduce((s, k) => s + Number(k.betrag), 0))} · davon gemeldet {monatsListe.filter((k) => k.gemeldet_am).length}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={knopf} onClick={() => { navigator.clipboard?.writeText(meldelisteText()); setOk('Meldeliste kopiert.'); }}>📋 Meldeliste kopieren</button>
              {istChef && <button style={knopf} onClick={alsGemeldet}>✓ Monat als gemeldet vermerken</button>}
            </div>
          </div>
          {istChef && (
            <div style={karte}>
              <b>Sätze Ihrer Gemeinde (laut Kurtaxe-Satzung)</b>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                <label>Gemeinde<br /><input style={feld} value={ns.gemeinde} onChange={(e) => setNs({ ...ns, gemeinde: e.target.value })} /></label>
                <label>€ je Nacht Erwachsene<br /><input style={{ ...feld, width: 100 }} value={ns.satz_erwachsen} onChange={(e) => setNs({ ...ns, satz_erwachsen: e.target.value })} /></label>
                <label>€ je Nacht Kinder<br /><input style={{ ...feld, width: 100 }} value={ns.satz_kind} onChange={(e) => setNs({ ...ns, satz_kind: e.target.value })} /></label>
                <label>Kind bis Alter<br /><input style={{ ...feld, width: 80 }} value={ns.kind_bis_alter} onChange={(e) => setNs({ ...ns, kind_bis_alter: e.target.value })} /></label>
                <label>frei bis Alter<br /><input style={{ ...feld, width: 80 }} value={ns.frei_bis_alter} onChange={(e) => setNs({ ...ns, frei_bis_alter: e.target.value })} /></label>
                <label>höchstens Nächte<br /><input style={{ ...feld, width: 80 }} value={ns.max_naechte} onChange={(e) => setNs({ ...ns, max_naechte: e.target.value })} /></label>
                <button style={primaer} onClick={satzSpeichern}>💾 Speichern</button>
              </div>
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>Die Sätze, Altersgrenzen und Befreiungen legt jede Gemeinde selbst fest — bitte aus Ihrer Satzung übernehmen. Saisonzeiten und Bettensteuer sind hier nicht abgebildet.</div>
            </div>
          )}
        </>
      )}

      {!sqlFehlt && tab === 'aufbewahrung' && (
        <div style={karte}>
          <b>Meldescheine zum Vernichten</b>
          <div style={{ color: C.textDim, fontSize: 13 }}>Aufbewahrung 1 Jahr ab Abreise, danach binnen 3 Monaten vernichten.</div>
          {aufbewahrung.length === 0 && <div style={{ color: C.green, marginTop: 8 }}>Nichts fällig.</div>}
          {aufbewahrung.map(({ s, f }) => (
            <div key={s.id} style={zeile}>
              <span>{s.familienname} · Abreise {datumDe(s.abreise)} · <span style={{ color: FARBE[f.stufe ?? 'ok'] }}>{f.text}</span></span>
              {istChef ? <button style={{ ...knopf, color: C.danger }} onClick={() => vernichten(s)}>🗑 Vernichten</button> : <span style={{ color: C.textDim, fontSize: 13 }}>vernichtet der Chef</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
