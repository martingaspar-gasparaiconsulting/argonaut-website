'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · CMR-Frachtbrief (Logistik)
//   Frachtbrief mit allen Pflichtangaben nach Art. 6 CMR, Warenpositionen,
//   Gefahrgut (UN-Nummer, Klasse, Verpackungsgruppe, Tunnelcode), laufende
//   Nummer, Druck in drei Ausfertigungen (Absender, Empfänger, Frachtführer).
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// Unterpfad von /dashboard/logistik (erbt dessen Freigabe). Löschen nur der Chef.
// Pfad: app/dashboard/logistik/cmr/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  CMR_HINWEIS, pruefeCmr, naechsteCmrNummer, datumDe, heuteBerlin,
  type Cmr, type CmrPosition, type CmrGefahrgut,
} from '@/lib/papiereIdentifizierung';

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
const druckZelle: CSSProperties = { border: '1px solid #000', padding: 6, verticalAlign: 'top', fontSize: 11.5 };
const AUSFERTIGUNG = ['1 · Exemplar für den Absender', '2 · Exemplar für den Empfänger', '3 · Exemplar für den Frachtführer'];

type Tour = { id: string; datum: string; fahrzeug: string | null; fahrer: string | null };
type Brief = Cmr & { id?: string; nummer: string; tour_id?: string | null; nachfolgend?: string; vereinbarungen?: string; status?: string };
const LEER_POS: CmrPosition = { zeichen: '', anzahl: '', verpackung: '', bezeichnung: '', gewicht_kg: '', volumen_m3: '' };
const LEER_GG: CmrGefahrgut = { un_nr: '', bezeichnung: '', klasse: '', vg: '', tunnel: '' };

export default function CmrSeite() {
  const heute = heuteBerlin();
  const [liste, setListe] = useState<Brief[]>([]);
  const [touren, setTouren] = useState<Tour[]>([]);
  const [firma, setFirma] = useState('');
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [b, setB] = useState<Brief | null>(null);
  const [druck, setDruck] = useState<Brief | null>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('cmr_frachtbrief').select('*').order('erstellt_am', { ascending: false }).limit(300);
    if (r.error) { if (/cmr_frachtbrief/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setListe((r.data as Brief[]) ?? []);
    const t = await supabase.from('logistik_touren').select('id, datum, fahrzeug, fahrer').gte('datum', heute).order('datum', { ascending: true }).limit(100);
    setTouren((t.data as Tour[]) ?? []);
  }, [heute]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === data?.user?.id);
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || data?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  function neu() {
    setB({ nummer: naechsteCmrNummer(liste.map((x) => x.nummer), Number(heute.slice(0, 4))), absender: firma, absender_land: 'DE', empfaenger: '', empfaenger_land: '', frachtfuehrer: firma, uebernahme_ort: '', uebernahme_datum: heute, ablieferung_ort: '', ausgestellt_ort: '', ausgestellt_am: heute, positionen: [{ ...LEER_POS }], gefahrgut: [], weisungen: '', kosten: '', nachfolgend: '', vereinbarungen: '', tour_id: null });
    setOk(null); setFehler(null);
  }
  const pruefung = b ? pruefeCmr(b) : null;

  async function speichern(ausstellen: boolean) {
    if (!b || !pruefung) return;
    if (ausstellen && !pruefung.vollstaendig) { setFehler('Zum Ausstellen fehlt: ' + pruefung.fehlt.join(', ')); return; }
    const daten = {
      nummer: b.nummer, tour_id: b.tour_id || null, absender: b.absender, absender_land: b.absender_land, empfaenger: b.empfaenger, empfaenger_land: b.empfaenger_land,
      frachtfuehrer: b.frachtfuehrer, nachfolgend: b.nachfolgend || null, uebernahme_ort: b.uebernahme_ort, uebernahme_datum: b.uebernahme_datum || null, ablieferung_ort: b.ablieferung_ort,
      positionen: b.positionen ?? [], gefahrgut: (b.gefahrgut ?? []).filter((g) => g.un_nr || g.bezeichnung), weisungen: b.weisungen || null, kosten: b.kosten || null,
      vereinbarungen: b.vereinbarungen || null, ausgestellt_ort: b.ausgestellt_ort, ausgestellt_am: b.ausgestellt_am || heute, status: ausstellen ? 'ausgestellt' : (b.status ?? 'entwurf'),
    };
    const { error } = b.id ? await supabase.from('cmr_frachtbrief').update(daten).eq('id', b.id) : await supabase.from('cmr_frachtbrief').insert(daten);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk(ausstellen ? `Frachtbrief ${b.nummer} ausgestellt — jetzt drucken.` : 'Entwurf gespeichert.');
    if (ausstellen) setDruck({ ...b, status: 'ausgestellt' });
    setB(null); await laden();
  }
  async function status(x: Brief, s: string) {
    if (!x.id) return;
    const { error } = await supabase.from('cmr_frachtbrief').update({ status: s }).eq('id', x.id);
    if (error) { setFehler('Ändern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  const setPos = (i: number, t: Partial<CmrPosition>) => b && setB({ ...b, positionen: (b.positionen ?? []).map((p, j) => (j === i ? { ...p, ...t } : p)) });
  const setGg = (i: number, t: Partial<CmrGefahrgut>) => b && setB({ ...b, gefahrgut: (b.gefahrgut ?? []).map((p, j) => (j === i ? { ...p, ...t } : p)) });
  const eingabe = (k: keyof Brief, label: string, breite = 220, typ = 'text') => (
    <label>{label}<br /><input type={typ} style={{ ...feld, width: breite }} value={String((b?.[k] as string | null | undefined) ?? '')} onChange={(e) => b && setB({ ...b, [k]: e.target.value })} /></label>
  );

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <style>{`@media print { body * { visibility: hidden !important; } #cmr-druck, #cmr-druck * { visibility: visible !important; } #cmr-druck { position: absolute; left: 0; top: 0; width: 100%; } .cmr-blatt { page-break-after: always; } }`}</style>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Logistik</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>📄 CMR-Frachtbrief</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Vollständig ausgefüllt, bevor der Lkw vom Hof fährt. <a href="/dashboard/logistik" style={{ color: C.cyan }}>← Zur Logistik</a></p>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Der Frachtbrief ist noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && !b && (
        <div style={karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><b>Frachtbriefe</b><button style={primaer} onClick={neu}>＋ Neuer Frachtbrief</button></div>
          {liste.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Noch keine Frachtbriefe.</div>}
          {liste.map((x) => (
            <div key={x.id} style={zeile}>
              <span><b>{x.nummer}</b> · {datumDe(x.uebernahme_datum ?? null)} · {x.uebernahme_ort} → {x.ablieferung_ort} · {x.empfaenger}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: x.status === 'ausgestellt' ? C.cyan : x.status === 'abgeliefert' ? C.green : C.textDim, fontSize: 13 }}>{x.status}</span>
                {x.status === 'entwurf' && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setB({ ...x, positionen: x.positionen?.length ? x.positionen : [{ ...LEER_POS }] })}>bearbeiten</button>}
                <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setDruck(x)}>🖨</button>
                {x.status === 'ausgestellt' && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => status(x, 'abgeliefert')}>✓ abgeliefert</button>}
                {istChef && x.status !== 'storniert' && x.status !== 'abgeliefert' && <button style={{ ...knopf, padding: '3px 8px', color: C.danger }} onClick={() => window.confirm(`${x.nummer} stornieren?`) && status(x, 'storniert')}>stornieren</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {b && pruefung && (
        <>
          <div style={karte}>
            <b>{b.nummer}</b>
            {touren.length > 0 && <div style={{ marginTop: 8 }}><label>Tour <select style={feld} value={b.tour_id ?? ''} onChange={(e) => { const t = touren.find((x) => x.id === e.target.value); setB({ ...b, tour_id: e.target.value || null, uebernahme_datum: t?.datum ?? b.uebernahme_datum }); }}><option value="">— ohne —</option>{touren.map((t) => <option key={t.id} value={t.id}>{datumDe(t.datum)} · {t.fahrzeug ?? ''} {t.fahrer ?? ''}</option>)}</select></label></div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
              {eingabe('absender', '1 Absender (Name, Anschrift)', 320)}{eingabe('absender_land', 'Land', 70)}
              {eingabe('empfaenger', '2 Empfänger (Name, Anschrift)', 320)}{eingabe('empfaenger_land', 'Land', 70)}
              {eingabe('ablieferung_ort', '3 Auslieferungsort', 260)}
              {eingabe('uebernahme_ort', '4 Übernahmeort', 260)}{eingabe('uebernahme_datum', 'Übernahmetag', 160, 'date')}
              {eingabe('frachtfuehrer', '16 Frachtführer (Name, Anschrift)', 320)}{eingabe('nachfolgend', '17 Nachfolgende Frachtführer', 260)}
              {eingabe('weisungen', '13 Anweisungen des Absenders (Zoll u. a.)', 320)}{eingabe('kosten', '14 Frankatur / Kosten', 200)}
              {eingabe('vereinbarungen', '19 Besondere Vereinbarungen', 320)}
              {eingabe('ausgestellt_ort', '21 Ausgefertigt in', 200)}{eingabe('ausgestellt_am', 'am', 160, 'date')}
            </div>
          </div>
          <div style={karte}>
            <b>Waren (Felder 6–12)</b>
            {(b.positionen ?? []).map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <input style={{ ...feld, width: 110 }} placeholder="Zeichen/Nr." value={p.zeichen ?? ''} onChange={(e) => setPos(i, { zeichen: e.target.value })} />
                <input style={{ ...feld, width: 70 }} placeholder="Anzahl" value={String(p.anzahl ?? '')} onChange={(e) => setPos(i, { anzahl: e.target.value })} />
                <input style={{ ...feld, width: 120 }} placeholder="Verpackung" value={p.verpackung ?? ''} onChange={(e) => setPos(i, { verpackung: e.target.value })} />
                <input style={{ ...feld, width: 220 }} placeholder="Bezeichnung des Gutes" value={p.bezeichnung ?? ''} onChange={(e) => setPos(i, { bezeichnung: e.target.value })} />
                <input style={{ ...feld, width: 110 }} placeholder="Brutto kg" value={String(p.gewicht_kg ?? '')} onChange={(e) => setPos(i, { gewicht_kg: e.target.value })} />
                <input style={{ ...feld, width: 90 }} placeholder="m³" value={String(p.volumen_m3 ?? '')} onChange={(e) => setPos(i, { volumen_m3: e.target.value })} />
                {(b.positionen ?? []).length > 1 && <button style={{ ...knopf, color: C.danger }} onClick={() => setB({ ...b, positionen: (b.positionen ?? []).filter((_, j) => j !== i) })}>✕</button>}
              </div>
            ))}
            <button style={{ ...knopf, marginTop: 6 }} onClick={() => setB({ ...b, positionen: [...(b.positionen ?? []), { ...LEER_POS }] })}>＋ Position</button>
            <div style={{ marginTop: 12 }}><b>Gefahrgut (ADR)</b></div>
            {(b.gefahrgut ?? []).map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <input style={{ ...feld, width: 100 }} placeholder="UN 1234" value={g.un_nr ?? ''} onChange={(e) => setGg(i, { un_nr: e.target.value })} />
                <input style={{ ...feld, width: 240 }} placeholder="offizielle Benennung" value={g.bezeichnung ?? ''} onChange={(e) => setGg(i, { bezeichnung: e.target.value })} />
                <input style={{ ...feld, width: 70 }} placeholder="Klasse" value={g.klasse ?? ''} onChange={(e) => setGg(i, { klasse: e.target.value })} />
                <input style={{ ...feld, width: 60 }} placeholder="VG" value={g.vg ?? ''} onChange={(e) => setGg(i, { vg: e.target.value })} />
                <input style={{ ...feld, width: 80 }} placeholder="Tunnel" value={g.tunnel ?? ''} onChange={(e) => setGg(i, { tunnel: e.target.value })} />
                <button style={{ ...knopf, color: C.danger }} onClick={() => setB({ ...b, gefahrgut: (b.gefahrgut ?? []).filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button style={{ ...knopf, marginTop: 6 }} onClick={() => setB({ ...b, gefahrgut: [...(b.gefahrgut ?? []), { ...LEER_GG }] })}>＋ Gefahrgut</button>
          </div>
          <div style={karte}>
            <div style={{ color: pruefung.vollstaendig ? C.green : C.warn }}>{pruefung.vollstaendig ? `✓ Alle Pflichtangaben vorhanden · ${pruefung.packstuecke} Packstücke · ${pruefung.gewichtKg?.toLocaleString('de-DE')} kg` : `Es fehlt: ${pruefung.fehlt.join(', ')}`}</div>
            {pruefung.befunde.map((x, i) => <div key={i} style={{ color: C.warn, fontSize: 13.5 }}>{x.text}</div>)}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={knopf} onClick={() => speichern(false)}>💾 Entwurf speichern</button>
              <button style={primaer} onClick={() => speichern(true)}>✍️ Ausstellen & drucken</button>
              <button style={knopf} onClick={() => setB(null)}>Abbrechen</button>
            </div>
          </div>
        </>
      )}

      {druck && (
        <div style={karte}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><button style={primaer} onClick={() => window.print()}>🖨 Drucken (3 Ausfertigungen)</button><button style={knopf} onClick={() => setDruck(null)}>Schließen</button></div>
          <div id="cmr-druck">
            {AUSFERTIGUNG.map((a) => (
              <div key={a} className="cmr-blatt" style={{ background: '#fff', color: '#000', padding: 14, marginBottom: 12, borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>INTERNATIONALER FRACHTBRIEF · CMR</b><span>{a}</span><b>Nr. {druck.nummer}</b></div>
                <div style={{ fontSize: 10, margin: '4px 0' }}>Diese Beförderung unterliegt trotz einer gegenteiligen Abmachung den Bestimmungen des Übereinkommens über den Beförderungsvertrag im internationalen Straßengüterverkehr (CMR).</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                  <tr><td style={druckZelle}>1 Absender<br />{druck.absender} ({druck.absender_land})</td><td style={druckZelle}>16 Frachtführer<br />{druck.frachtfuehrer}</td></tr>
                  <tr><td style={druckZelle}>2 Empfänger<br />{druck.empfaenger} ({druck.empfaenger_land})</td><td style={druckZelle}>17 Nachfolgende Frachtführer<br />{druck.nachfolgend}</td></tr>
                  <tr><td style={druckZelle}>3 Auslieferungsort<br />{druck.ablieferung_ort}</td><td style={druckZelle}>18 Vorbehalte des Frachtführers<br />&nbsp;</td></tr>
                  <tr><td style={druckZelle}>4 Übernahme: Ort und Tag<br />{druck.uebernahme_ort}, {datumDe(druck.uebernahme_datum ?? null)}</td><td style={druckZelle}>19 Besondere Vereinbarungen<br />{druck.vereinbarungen}</td></tr>
                  <tr><td style={druckZelle}>13 Anweisungen des Absenders<br />{druck.weisungen}</td><td style={druckZelle}>14 Frankatur / 20 Kosten<br />{druck.kosten}</td></tr>
                </tbody></table>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                  <thead><tr>{['6 Zeichen/Nr.', '7 Anzahl', '8 Verpackung', '9 Bezeichnung', '11 Brutto kg', '12 m³'].map((h) => <th key={h} style={{ ...druckZelle, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>{(druck.positionen ?? []).map((p, i) => <tr key={i}>{[p.zeichen, p.anzahl, p.verpackung, p.bezeichnung, p.gewicht_kg, p.volumen_m3].map((v, j) => <td key={j} style={druckZelle}>{String(v ?? '')}</td>)}</tr>)}</tbody>
                </table>
                {(druck.gefahrgut ?? []).length > 0 && <div style={{ fontSize: 11.5, marginTop: 6 }}><b>Gefahrgut:</b> {(druck.gefahrgut ?? []).map((g) => `${/^UN/i.test(String(g.un_nr)) ? g.un_nr : `UN ${g.un_nr}`} ${g.bezeichnung}, ${g.klasse}${g.vg ? `, ${g.vg}` : ''}${g.tunnel ? `, (${g.tunnel})` : ''}`).join(' · ')}</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}><tbody><tr>
                  <td style={{ ...druckZelle, height: 60 }}>21 Ausgefertigt in {druck.ausgestellt_ort} am {datumDe(druck.ausgestellt_am ?? null)}<br /><br />22 Unterschrift und Stempel des Absenders</td>
                  <td style={druckZelle}><br /><br />23 Unterschrift und Stempel des Frachtführers</td>
                  <td style={druckZelle}>24 Gut empfangen am ______<br /><br />Unterschrift und Stempel des Empfängers</td>
                </tr></tbody></table>
              </div>
            ))}
          </div>
        </div>
      )}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>{CMR_HINWEIS}</p>
    </div>
  );
}
