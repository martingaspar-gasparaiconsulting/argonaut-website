'use client';

// ============================================================
// ARGONAUT OS · Paket PS3 · Schadenabwicklung mit Versicherern (KFZ)
//   Schadenfall je Fahrzeug: Art (Haftpflicht/Kasko/Selbstzahler), Versicherer,
//   Schadennummer, Unterlagen-Checkliste, Gutachten/KVA, Freigabe, Reparatur,
//   Ersatzwagen-Tage, Rechnung, Zahlungen (Versicherer / Kunde),
//   Selbstbeteiligung, Kürzung, Nachfassen nach Richtwert, feste Schreiben.
// Keine Rechtsberatung, keine Haftungsargumente (RDG) — nur Abwicklung.
// Die Rechnung selbst schreiben Sie wie gewohnt in der Werkstatt/Rechnungen.
// Logik: lib/kundenVorgaenge.ts (getestet). SQL: supabase-sql/ps3-kunden-vorgaenge.sql.
// Unterpfad von /dashboard/kfz (erbt dessen Freigabe).
// Pfad: app/dashboard/kfz/schaden/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  SCHADEN_ARTEN, SCHADEN_STATUS, PRUEFFRIST_TAGE, BAGATELLGRENZE,
  unterlagenFuer, fehlendeUnterlagen, schadenOffen, schadenStand, ersatzTage, schadenZahlen, schadenSchreiben,
  naechsteNummer, offenePlatzhalter, heuteBerlin, datumDe,
  type SchadenArt, type SchadenStatus, type Zahlung,
} from '@/lib/kundenVorgaenge';
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
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };
const raster: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };
const FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, gruen: C.green, grau: C.textDim };

type Fahrzeug = { id: string; kennzeichen: string | null; halter: string | null; marke: string | null; modell: string | null };
type Fall = {
  id: string; nummer: string; fahrzeug_id: string | null; kunde_name: string | null; kennzeichen: string | null;
  art: SchadenArt; status: SchadenStatus; schadentag: string | null; versicherer: string | null; schadennummer: string | null;
  gutachter: string | null; kva_betrag: number | null; gemeldet_am: string | null; freigabe_am: string | null;
  ersatz_von: string | null; ersatz_bis: string | null; ersatz_art: string | null;
  rechnung_betrag: number | null; rechnung_am: string | null; unterlagen_komplett_am: string | null; selbstbeteiligung: number | null;
  zahlungen: Zahlung[]; unterlagen: Record<string, boolean>; notiz: string | null; abgeschlossen_am: string | null; erstellt_am: string;
};

function zahlAus(s: string): number | null { return leseZahl(s); }
function euro(n: number | null | undefined): string { return n == null ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function txt(n: number | null | undefined): string { return n == null ? '' : String(n).replace('.', ','); }

export default function SchadenSeite() {
  const heute = heuteBerlin();
  const [faelle, setFaelle] = useState<Fall[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [offenId, setOffenId] = useState<string | null>(null);
  const [nurOffen, setNurOffen] = useState(true);
  const [neu, setNeu] = useState({ fahrzeug_id: '', kunde_name: '', kennzeichen: '', art: 'haftpflicht' as SchadenArt, schadentag: heute, versicherer: '', schadennummer: '' });
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('kfz_schadenfall').select('*').order('erstellt_am', { ascending: false });
    if (r.error) { if (/kfz_schadenfall/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setFaelle(((r.data as Fall[]) ?? []).map((f) => ({ ...f, zahlungen: f.zahlungen ?? [], unterlagen: f.unterlagen ?? {} })));
    const fz = await supabase.from('kfz_fahrzeuge').select('id, kennzeichen, halter, marke, modell').order('kennzeichen', { ascending: true });
    setFahrzeuge((fz.data as Fahrzeug[]) ?? []);
  }, []);

  useEffect(() => {
    laden();
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        let chef: string | null = null;
        try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
    })();
  }, [laden]);

  const zahlen = useMemo(() => schadenZahlen(faelle, heute), [faelle, heute]);
  const sichtbar = faelle.filter((f) => !nurOffen || !(f.status === 'abgeschlossen' || f.abgeschlossen_am));

  function fahrzeugWaehlen(id: string) {
    const f = fahrzeuge.find((x) => x.id === id);
    setNeu((n) => ({ ...n, fahrzeug_id: id, kennzeichen: f?.kennzeichen ?? n.kennzeichen, kunde_name: f?.halter ?? n.kunde_name }));
  }

  async function anlegen() {
    setFehler(null); setOk(null);
    if (!neu.kennzeichen.trim() && !neu.fahrzeug_id) { setFehler('Bitte Fahrzeug wählen oder Kennzeichen eintragen.'); return; }
    setBusy(true);
    try {
      const nummer = naechsteNummer(faelle.map((f) => f.nummer), 'SF', Number(heute.slice(0, 4)));
      const { error } = await supabase.from('kfz_schadenfall').insert({
        nummer, fahrzeug_id: neu.fahrzeug_id || null, kunde_name: neu.kunde_name.trim() || null, kennzeichen: neu.kennzeichen.trim() || null,
        art: neu.art, status: 'aufgenommen', schadentag: neu.schadentag || null, versicherer: neu.versicherer.trim() || null, schadennummer: neu.schadennummer.trim() || null,
      });
      if (error) throw error;
      setNeu({ fahrzeug_id: '', kunde_name: '', kennzeichen: '', art: 'haftpflicht', schadentag: heute, versicherer: '', schadennummer: '' });
      setOk(`Schadenfall ${nummer} angelegt.`);
      await laden();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · KFZ</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🛡 Schadenabwicklung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Vom Unfallwagen bis zum letzten Euro vom Versicherer: Unterlagen, Freigabe, Zahlungen und Nachfassen an einem Ort. <a href="/dashboard/kfz" style={{ color: C.cyan }}>← Zum KFZ-Fachpaket</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Schaden-Tabelle ist noch nicht eingerichtet (SQL von Paket PS3 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={{ ...raster, marginBottom: 14 }}>
            {[['Offene Fälle', String(zahlen.offen), C.cyan], ['Nachfassen', String(zahlen.nachfassen), zahlen.nachfassen ? C.danger : C.green], ['Noch offen (€)', euro(zahlen.summeOffen), C.gold], ['Gekürzt', String(zahlen.gekuerzt), zahlen.gekuerzt ? C.warn : C.text]].map(([t, w, f]) => (
              <div key={t} style={{ ...karte, marginBottom: 0 }}><div style={{ color: C.textDim, fontSize: 13 }}>{t}</div><div style={{ fontSize: 24, fontWeight: 800, color: f }}>{w}</div></div>
            ))}
          </div>

          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Neuer Schadenfall</h2>
            <div style={raster}>
              <div>
                <label style={lab}>Fahrzeug aus der Kartei</label>
                <select style={feld} value={neu.fahrzeug_id} onChange={(e) => fahrzeugWaehlen(e.target.value)}>
                  <option value="">— neu / nicht in der Kartei —</option>
                  {fahrzeuge.map((f) => <option key={f.id} value={f.id}>{f.kennzeichen || 'ohne Kz.'} · {[f.marke, f.modell].filter(Boolean).join(' ')} · {f.halter || ''}</option>)}
                </select>
              </div>
              <div><label style={lab}>Kennzeichen</label><input style={feld} value={neu.kennzeichen} onChange={(e) => setNeu({ ...neu, kennzeichen: e.target.value })} /></div>
              <div><label style={lab}>Kunde / Geschädigter</label><input style={feld} value={neu.kunde_name} onChange={(e) => setNeu({ ...neu, kunde_name: e.target.value })} /></div>
              <div>
                <label style={lab}>Art</label>
                <select style={feld} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value as SchadenArt })}>{SCHADEN_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
              </div>
              <div><label style={lab}>Schadentag</label><input type="date" style={feld} value={neu.schadentag} onChange={(e) => setNeu({ ...neu, schadentag: e.target.value })} /></div>
              <div><label style={lab}>Versicherer</label><input style={feld} value={neu.versicherer} onChange={(e) => setNeu({ ...neu, versicherer: e.target.value })} /></div>
              <div><label style={lab}>Schadennummer</label><input style={feld} value={neu.schadennummer} onChange={(e) => setNeu({ ...neu, schadennummer: e.target.value })} /></div>
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>{SCHADEN_ARTEN.find((a) => a.key === neu.art)?.hinweis}</div>
            <div style={{ marginTop: 12 }}><button style={primaer} disabled={busy} onClick={anlegen}>{busy ? '…' : '＋ Schadenfall anlegen'}</button></div>
          </div>

          <label style={{ display: 'block', marginBottom: 10 }}><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> Nur offene Fälle</label>
          {sichtbar.length === 0 && <div style={karte}>Keine {nurOffen ? 'offenen ' : ''}Schadenfälle.</div>}
          {sichtbar.map((f) => (
            <FallKarte key={f.id} f={f} heute={heute} firma={firma} offen={offenId === f.id} onToggle={() => setOffenId(offenId === f.id ? null : f.id)}
              onFehler={setFehler} onOk={setOk} neuLaden={laden} />
          ))}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>Hinweis: Die Prüffrist von {PRUEFFRIST_TAGE} Tagen und die Bagatellgrenze von etwa {BAGATELLGRENZE} € sind Richtwerte aus der Rechtsprechung, keine gesetzlichen Fristen. Streit über Haftung oder Kürzungen klärt der Anwalt des Kunden — die Werkstatt wickelt nur ab. Keine Rechtsberatung.</p>
        </>
      )}
    </div>
  );
}

function FallKarte({ f, heute, firma, offen, onToggle, onFehler, onOk, neuLaden }: {
  f: Fall; heute: string; firma: string; offen: boolean; onToggle: () => void;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [e, setE] = useState({
    versicherer: f.versicherer ?? '', schadennummer: f.schadennummer ?? '', gutachter: f.gutachter ?? '', kva: txt(f.kva_betrag),
    gemeldet_am: f.gemeldet_am ?? '', freigabe_am: f.freigabe_am ?? '', ersatz_von: f.ersatz_von ?? '', ersatz_bis: f.ersatz_bis ?? '', ersatz_art: f.ersatz_art ?? 'mietwagen',
    rechnung: txt(f.rechnung_betrag), rechnung_am: f.rechnung_am ?? '', komplett_am: f.unterlagen_komplett_am ?? '', sb: txt(f.selbstbeteiligung), notiz: f.notiz ?? '',
  });
  const [unterlagen, setUnterlagen] = useState<Record<string, boolean>>(f.unterlagen ?? {});
  const [zahlung, setZahlung] = useState({ am: heute, betrag: '', von: 'versicherer' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const aktuell = { ...f, unterlagen, rechnung_betrag: zahlAus(e.rechnung), selbstbeteiligung: zahlAus(e.sb), unterlagen_komplett_am: e.komplett_am || null, kva_betrag: zahlAus(e.kva) };
  const stand = schadenStand(aktuell, heute);
  const o = schadenOffen(aktuell);
  const artInfo = SCHADEN_ARTEN.find((a) => a.key === f.art);
  const tage = ersatzTage(e.ersatz_von || null, e.ersatz_bis || null);
  const fehlend = fehlendeUnterlagen(f.art, unterlagen);

  async function speichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.') {
    setBusy(true); onFehler(null); onOk(null);
    try {
      const { error } = await supabase.from('kfz_schadenfall').update({
        versicherer: e.versicherer.trim() || null, schadennummer: e.schadennummer.trim() || null, gutachter: e.gutachter.trim() || null,
        kva_betrag: zahlAus(e.kva), gemeldet_am: e.gemeldet_am || null, freigabe_am: e.freigabe_am || null,
        ersatz_von: e.ersatz_von || null, ersatz_bis: e.ersatz_bis || null, ersatz_art: e.ersatz_art || null,
        rechnung_betrag: zahlAus(e.rechnung), rechnung_am: e.rechnung_am || null, unterlagen_komplett_am: e.komplett_am || null,
        selbstbeteiligung: zahlAus(e.sb), notiz: e.notiz.trim() || null, unterlagen, aktualisiert_am: new Date().toISOString(), ...extra,
      }).eq('id', f.id);
      if (error) throw error;
      onOk(meldung); await neuLaden();
    } catch (err) { onFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function zahlungBuchen() {
    const b = zahlAus(zahlung.betrag);
    if (b == null || b === 0) { onFehler('Bitte einen Betrag eintragen.'); return; }
    const liste = [...f.zahlungen, { am: zahlung.am || heute, betrag: b, von: zahlung.von }];
    const rechnung = zahlAus(e.rechnung);
    const summe = liste.reduce((a, z) => a + (Number(z.betrag) || 0), 0);
    let status: SchadenStatus = f.status;
    if (rechnung != null) status = summe + 0.005 >= rechnung ? 'bezahlt' : zahlung.von === 'versicherer' ? 'gekuerzt' : f.status;
    setZahlung({ am: heute, betrag: '', von: 'versicherer' });
    await speichern({ zahlungen: liste, status }, `Zahlung über ${euro(b)} gebucht.`);
  }

  const platz = offenePlatzhalter(text);
  const brief = (art: 'meldung' | 'erinnerung' | 'pruefbericht' | 'kunde_sb') => setText(schadenSchreiben(art, {
    firma, versicherer: e.versicherer, schadennummer: e.schadennummer, kennzeichen: f.kennzeichen, schadentag: f.schadentag, kunde: f.kunde_name,
    betrag: zahlAus(e.rechnung), rechnungAm: e.rechnung_am || null, sb: zahlAus(e.sb),
    unterlagen: unterlagenFuer(f.art).filter((u) => unterlagen[u.key] && !['auftrag'].includes(u.key)).map((u) => u.label),
  }));

  return (
    <div style={{ ...karte, borderLeft: `4px solid ${FARBE[stand.stufe]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <b>{f.nummer}</b> · {f.kennzeichen || 'ohne Kz.'} · {f.kunde_name || 'ohne Name'} · {artInfo?.label.split(' —')[0].split(' (')[0]}
          <div style={{ color: FARBE[stand.stufe], fontSize: 13.5, marginTop: 2 }}>{stand.text}</div>
        </div>
        <div style={{ color: C.textDim, fontSize: 13, textAlign: 'right' }}>{SCHADEN_STATUS.find((s) => s.key === f.status)?.label}<br />{o.offen != null && o.offen > 0 ? `offen ${euro(o.offen)}` : ''} {offen ? '▲' : '▼'}</div>
      </div>
      {offen && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: C.textDim, fontSize: 13 }}>{artInfo?.hinweis}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {SCHADEN_STATUS.map((s) => (
              <button key={s.key} style={{ ...knopf, ...(f.status === s.key ? { background: C.cyan, color: C.navy, border: 'none' } : {}) }} disabled={busy}
                onClick={() => speichern({ status: s.key, ...(s.key === 'abgeschlossen' ? { abgeschlossen_am: heute } : { abgeschlossen_am: null }), ...(s.key === 'gemeldet' && !e.gemeldet_am ? { gemeldet_am: heute } : {}) }, `Status: ${s.label}`)}>{s.label}</button>
            ))}
          </div>

          <div style={raster}>
            <div><label style={lab}>Versicherer</label><input style={feld} value={e.versicherer} onChange={(x) => setE({ ...e, versicherer: x.target.value })} /></div>
            <div><label style={lab}>Schadennummer</label><input style={feld} value={e.schadennummer} onChange={(x) => setE({ ...e, schadennummer: x.target.value })} /></div>
            <div><label style={lab}>Gemeldet am</label><input type="date" style={feld} value={e.gemeldet_am} onChange={(x) => setE({ ...e, gemeldet_am: x.target.value })} /></div>
            <div><label style={lab}>Gutachter</label><input style={feld} value={e.gutachter} onChange={(x) => setE({ ...e, gutachter: x.target.value })} /></div>
            <div><label style={lab}>Kostenvoranschlag / Gutachten (€)</label><input style={feld} value={e.kva} onChange={(x) => setE({ ...e, kva: x.target.value })} /></div>
            <div><label style={lab}>Reparaturfreigabe am</label><input type="date" style={feld} value={e.freigabe_am} onChange={(x) => setE({ ...e, freigabe_am: x.target.value })} /></div>
            {artInfo?.sb && <div><label style={lab}>Selbstbeteiligung Kunde (€)</label><input style={feld} value={e.sb} onChange={(x) => setE({ ...e, sb: x.target.value })} /></div>}
            <div>
              <label style={lab}>Ersatz</label>
              <select style={feld} value={e.ersatz_art} onChange={(x) => setE({ ...e, ersatz_art: x.target.value })}>
                <option value="mietwagen">Mietwagen / Werkstattersatzwagen</option><option value="nutzungsausfall">Nutzungsausfall (kein Ersatzwagen)</option><option value="keiner">Keiner</option>
              </select>
            </div>
            {e.ersatz_art !== 'keiner' && <div><label style={lab}>Ersatz von</label><input type="date" style={feld} value={e.ersatz_von} onChange={(x) => setE({ ...e, ersatz_von: x.target.value })} /></div>}
            {e.ersatz_art !== 'keiner' && <div><label style={lab}>Ersatz bis {tage ? `(${tage} Tage)` : ''}</label><input type="date" style={feld} value={e.ersatz_bis} onChange={(x) => setE({ ...e, ersatz_bis: x.target.value })} /></div>}
            <div><label style={lab}>Rechnung brutto (€)</label><input style={feld} value={e.rechnung} onChange={(x) => setE({ ...e, rechnung: x.target.value })} /></div>
            <div><label style={lab}>Rechnung vom</label><input type="date" style={feld} value={e.rechnung_am} onChange={(x) => setE({ ...e, rechnung_am: x.target.value })} /></div>
            <div><label style={lab}>Unterlagen vollständig beim Versicherer am</label><input type="date" style={feld} value={e.komplett_am} onChange={(x) => setE({ ...e, komplett_am: x.target.value })} /></div>
          </div>

          <div style={{ ...karte, background: C.navy, marginTop: 10 }}>
            <b>Unterlagen</b>{fehlend.length ? <span style={{ color: C.warn }}> · {fehlend.length} fehlen</span> : <span style={{ color: C.green }}> · vollständig</span>}
            {unterlagenFuer(f.art).map((u) => (
              <label key={u.key} style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={!!unterlagen[u.key]} onChange={(x) => setUnterlagen({ ...unterlagen, [u.key]: x.target.checked })} /> {u.label}</label>
            ))}
          </div>

          <div style={{ ...karte, background: C.navy }}>
            <b>Zahlungen</b>
            {f.zahlungen.length === 0 && <div style={{ color: C.textDim }}>Noch keine Zahlung eingegangen.</div>}
            {f.zahlungen.map((z, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{datumDe(z.am)} · {z.von === 'kunde' ? 'Kunde' : 'Versicherer'}</span><span>{euro(Number(z.betrag))}</span></div>)}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rechnung</span><span>{euro(o.rechnung)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Eingegangen</span><span>{euro(o.gezahlt)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Offen</span><span>{euro(o.offen)}</span></div>
              {artInfo?.sb && <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textDim }}><span>davon Selbstbeteiligung Kunde</span><span>{euro(o.sbKunde)}</span></div>}
              {o.offenVersicherer != null && <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textDim }}><span>davon Versicherer</span><span>{euro(o.offenVersicherer)}</span></div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input type="date" style={{ ...feld, width: 160 }} value={zahlung.am} onChange={(x) => setZahlung({ ...zahlung, am: x.target.value })} />
              <input style={{ ...feld, width: 130 }} placeholder="Betrag" value={zahlung.betrag} onChange={(x) => setZahlung({ ...zahlung, betrag: x.target.value })} />
              <select style={{ ...feld, width: 150 }} value={zahlung.von} onChange={(x) => setZahlung({ ...zahlung, von: x.target.value })}><option value="versicherer">vom Versicherer</option><option value="kunde">vom Kunden</option></select>
              <button style={knopf} disabled={busy} onClick={zahlungBuchen}>＋ Zahlung</button>
            </div>
          </div>

          <label style={lab}>Notiz</label>
          <textarea style={{ ...feld, minHeight: 50 }} value={e.notiz} onChange={(x) => setE({ ...e, notiz: x.target.value })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={primaer} disabled={busy} onClick={() => speichern()}>Speichern</button>
            <button style={knopf} onClick={() => brief('meldung')}>✉ Schadenmeldung</button>
            <button style={knopf} onClick={() => brief('erinnerung')}>✉ Zahlungserinnerung</button>
            <button style={knopf} onClick={() => brief('pruefbericht')}>✉ Prüfbericht anfordern</button>
            {artInfo?.sb && <button style={knopf} onClick={() => brief('kunde_sb')}>✉ Kunde: Selbstbeteiligung</button>}
          </div>
          {text && (
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...feld, minHeight: 180 }} value={text} onChange={(x) => setText(x.target.value)} />
              {platz.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>Noch ausfüllen: {platz.join(', ')}</div>}
              <button style={{ ...knopf, marginTop: 6 }} disabled={platz.length > 0} onClick={() => { navigator.clipboard?.writeText(text); onOk('Text kopiert.'); }}>📋 Kopieren</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
