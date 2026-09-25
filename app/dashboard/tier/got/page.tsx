'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · GOT-Rechner (Tierarztpraxis)
//   Eigene Leistungsliste mit einfachem Satz, Rechner mit Faktor je Leistung,
//   Notdienst automatisch aus Datum/Uhrzeit (18–8 Uhr, Wochenende, Feiertag),
//   Notdienstgebühr, Wegegeld, Abweichung nur mit Vereinbarung in Textform.
//   Ergebnis als Kostenaufstellung kopieren oder als Behandlung in die
//   Tierakte übernehmen — es entsteht KEINE Rechnung.
// Logik: lib/gebuehrenHonorare.ts (getestet). SQL: supabase-sql/ps5-gebuehren-honorare.sql.
// Unterpfad von /dashboard/tier (erbt dessen Freigabe).
// Pfad: app/dashboard/tier/got/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  GOT_HINWEIS, gotBerechnung, gotRahmen, istNotdienstZeit, kostenText, euro, euroText, heuteBerlin,
} from '@/lib/gebuehrenHonorare';
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
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: `1px solid ${C.border}`, fontSize: 14 };
const LAENDER = ['', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'];

type Leistung = { id: string; nr: string | null; bezeichnung: string; einfach_satz: number; aktiv: boolean };
type Tier = { id: string; name: string; halter: string | null };
type Pos = { key: string; nr: string; bezeichnung: string; einfach: string; faktor: string; anzahl: string };

export default function GotSeite() {
  const [leistungen, setLeistungen] = useState<Leistung[]>([]);
  const [tiere, setTiere] = useState<Tier[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nl, setNl] = useState({ nr: '', bezeichnung: '', einfach: '' });
  const [datum, setDatum] = useState(heuteBerlin());
  const [uhrzeit, setUhrzeit] = useState(() => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date()));
  const [land, setLand] = useState('');
  const [notdienstManuell, setNotdienstManuell] = useState<boolean | null>(null);
  const [vereinbart, setVereinbart] = useState(false);
  const [km, setKm] = useState('');
  const [ust, setUst] = useState('19');
  const [tierId, setTierId] = useState('');
  const [pos, setPos] = useState<Pos[]>([]);

  const laden = useCallback(async () => {
    setFehler(null);
    const l = await supabase.from('tier_got_leistung').select('id, nr, bezeichnung, einfach_satz, aktiv').order('bezeichnung', { ascending: true });
    if (l.error) { if (/tier_got_leistung/.test(l.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + l.error.message); return; }
    setLeistungen((l.data as Leistung[]) ?? []);
    const t = await supabase.from('tier_tiere').select('id, name, halter').order('name', { ascending: true });
    setTiere((t.data as Tier[]) ?? []);
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const auto = istNotdienstZeit(datum, uhrzeit, land || null);
  const notdienst = notdienstManuell ?? auto.notdienst;
  const [min] = gotRahmen(notdienst);
  const ergebnis = useMemo(() => gotBerechnung({
    notdienst, vereinbartTextform: vereinbart, doppelKm: km, ustSatz: ust,
    positionen: pos.map((p) => ({ nr: p.nr, bezeichnung: p.bezeichnung, einfachSatz: p.einfach, faktor: p.faktor, anzahl: p.anzahl })),
  }), [notdienst, vereinbart, km, ust, pos]);

  function hinzu(l: Leistung) {
    setPos([...pos, { key: `${l.id}-${Date.now()}`, nr: l.nr ?? '', bezeichnung: l.bezeichnung, einfach: zahlFeld(l.einfach_satz).replace('.', ','), faktor: zahlFeld(min), anzahl: '1' }]);
  }
  async function leistungAnlegen() {
    const e = leseZahl(nl.einfach);
    if (!nl.bezeichnung.trim() || e == null || e <= 0) { setFehler('Bezeichnung und einfachen Satz angeben.'); return; }
    const { error } = await supabase.from('tier_got_leistung').insert({ nr: nl.nr.trim() || null, bezeichnung: nl.bezeichnung.trim(), einfach_satz: e });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setNl({ nr: '', bezeichnung: '', einfach: '' }); setOk('Leistung angelegt.'); await laden();
  }
  async function umschalten(l: Leistung) {
    const { error } = await supabase.from('tier_got_leistung').update({ aktiv: !l.aktiv }).eq('id', l.id);
    if (error) { setFehler('Ändern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  function text(): string {
    const tier = tiere.find((t) => t.id === tierId);
    return kostenText(
      `Kostenaufstellung nach GOT${tier ? ` · ${tier.name}${tier.halter ? ` (${tier.halter})` : ''}` : ''} · ${datum.split('-').reverse().join('.')}${notdienst ? ' · Notdienst' : ''}`,
      [...ergebnis.zeilen.map((z) => ({ label: `${z.nr ? z.nr + ' ' : ''}${z.bezeichnung}${z.faktor !== 1 ? ` · ${String(z.faktor).replace('.', ',')}-fach` : ''}${z.anzahl > 1 ? ` · ${z.anzahl}×` : ''}`, betragCent: z.betragCent })), { label: 'Umsatzsteuer', betragCent: ergebnis.ustCent }],
      ergebnis.bruttoCent,
      ergebnis.warnungen,
    );
  }
  async function alsBehandlung() {
    if (!tierId) { setFehler('Zuerst ein Tier wählen.'); return; }
    if (!ergebnis.ok) return;
    if (!window.confirm(`Als Behandlung mit ${euroText(euro(ergebnis.bruttoCent))} in die Tierakte übernehmen?`)) return;
    const { error } = await supabase.from('tier_behandlungen').insert({
      tier_id: tierId, datum, art: 'behandlung',
      bezeichnung: ergebnis.zeilen.map((z) => z.bezeichnung).join(', ').slice(0, 300),
      preis: euro(ergebnis.bruttoCent), notiz: text().slice(0, 4000),
    });
    if (error) { setFehler('Übernehmen fehlgeschlagen: ' + error.message); return; }
    setOk('In die Tierakte übernommen.');
  }

  const aktive = leistungen.filter((l) => l.aktiv);
  return (
    <div style={{ color: C.text, maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Tier-Fachpaket</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧾 GOT-Rechner</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Gebühren nach der Tierärzte-Gebührenordnung — mit Notdienst, Wegegeld und Rahmenprüfung. <a href="/dashboard/tier" style={{ color: C.cyan }}>← Zum Tier-Fachpaket</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die GOT-Leistungsliste ist noch nicht eingerichtet (SQL von Paket PS5 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <b>Behandlung</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
              <label>Tier<br /><select style={feld} value={tierId} onChange={(e) => setTierId(e.target.value)}><option value="">— optional —</option>{tiere.map((t) => <option key={t.id} value={t.id}>{t.name}{t.halter ? ` · ${t.halter}` : ''}</option>)}</select></label>
              <label>Datum<br /><input type="date" style={feld} value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
              <label>Uhrzeit<br /><input type="time" style={feld} value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} /></label>
              <label>Bundesland<br /><select style={feld} value={land} onChange={(e) => setLand(e.target.value)}>{LAENDER.map((l) => <option key={l} value={l}>{l || 'nur bundesweite Feiertage'}</option>)}</select></label>
              <label>Doppel-km<br /><input style={{ ...feld, width: 90 }} value={km} onChange={(e) => setKm(e.target.value)} placeholder="Hausbesuch" /></label>
              <label>USt %<br /><input style={{ ...feld, width: 70 }} value={ust} onChange={(e) => setUst(e.target.value)} /></label>
            </div>
            <div style={{ marginTop: 8, color: notdienst ? C.warn : C.textDim, fontSize: 13.5 }}>
              {notdienst ? `🌙 Notdienst${auto.grund && notdienstManuell == null ? ` — ${auto.grund}` : ''}: Rahmen 2- bis 4-fach + 50 € Notdienstgebühr.` : 'Regulär: Rahmen 1- bis 3-fach.'}
              {' '}<button style={{ ...knopf, padding: '3px 8px' }} onClick={() => setNotdienstManuell(notdienstManuell == null ? !auto.notdienst : null)}>{notdienstManuell == null ? 'manuell umschalten' : 'automatisch'}</button>
            </div>
            <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={vereinbart} onChange={(e) => setVereinbart(e.target.checked)} /> Abweichung vom Rahmen vorher in Textform vereinbart (§ 5 GOT)</label>
          </div>

          <div style={karte}>
            <b>Leistungen</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {aktive.length === 0 && <span style={{ color: C.textDim }}>Noch keine Leistungen — unten Ihre Leistungsliste anlegen.</span>}
              {aktive.map((l) => <button key={l.id} style={knopf} onClick={() => hinzu(l)}>＋ {l.nr ? `${l.nr} · ` : ''}{l.bezeichnung} ({euroText(Number(l.einfach_satz))})</button>)}
            </div>
            {pos.map((p, i) => (
              <div key={p.key} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <span style={{ minWidth: 220 }}>{p.nr ? `${p.nr} · ` : ''}{p.bezeichnung}</span>
                <label style={{ fontSize: 13 }}>einfach € <input style={{ ...feld, width: 80 }} value={p.einfach} onChange={(e) => setPos(pos.map((x, j) => j === i ? { ...x, einfach: e.target.value } : x))} /></label>
                <label style={{ fontSize: 13 }}>Faktor <input style={{ ...feld, width: 60 }} value={p.faktor} onChange={(e) => setPos(pos.map((x, j) => j === i ? { ...x, faktor: e.target.value } : x))} /></label>
                <label style={{ fontSize: 13 }}>Anzahl <input style={{ ...feld, width: 55 }} value={p.anzahl} onChange={(e) => setPos(pos.map((x, j) => j === i ? { ...x, anzahl: e.target.value } : x))} /></label>
                <button style={{ ...knopf, color: C.danger }} onClick={() => setPos(pos.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>

          <div style={karte}>
            {pos.length === 0 ? <div style={{ color: C.textDim }}>Oben Leistungen hinzufügen.</div> : !ergebnis.ok ? <div style={{ color: C.warn }}>{ergebnis.fehler}</div> : (
              <>
                {ergebnis.zeilen.map((z, i) => <div key={i} style={zeile}><span>{z.nr ? `${z.nr} · ` : ''}{z.bezeichnung}{z.faktor !== 1 ? ` · ${String(z.faktor).replace('.', ',')}-fach` : ''}{z.anzahl > 1 ? ` · ${z.anzahl}×` : ''}</span><span>{euroText(euro(z.betragCent))}</span></div>)}
                <div style={zeile}><span>Umsatzsteuer</span><span>{euroText(euro(ergebnis.ustCent))}</span></div>
                <div style={{ ...zeile, fontWeight: 800, fontSize: 15.5 }}><span>Gesamt</span><span style={{ color: C.gold }}>{euroText(euro(ergebnis.bruttoCent))}</span></div>
                {ergebnis.warnungen.map((w, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>{w}</div>)}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button style={knopf} onClick={() => { navigator.clipboard?.writeText(text()); setOk('Kostenaufstellung kopiert.'); }}>📋 Als Text kopieren</button>
                  <button style={primaer} onClick={alsBehandlung} disabled={!tierId}>🐾 In die Tierakte übernehmen</button>
                </div>
              </>
            )}
          </div>

          <div style={karte}>
            <b>Ihre Leistungsliste</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <input style={{ ...feld, width: 90 }} placeholder="GOT-Nr." value={nl.nr} onChange={(e) => setNl({ ...nl, nr: e.target.value })} />
              <input style={{ ...feld, width: 260 }} placeholder="Bezeichnung" value={nl.bezeichnung} onChange={(e) => setNl({ ...nl, bezeichnung: e.target.value })} />
              <input style={{ ...feld, width: 120 }} placeholder="einfacher Satz €" value={nl.einfach} onChange={(e) => setNl({ ...nl, einfach: e.target.value })} />
              <button style={primaer} onClick={leistungAnlegen}>＋ Anlegen</button>
            </div>
            <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>Den einfachen Satz entnehmen Sie dem Gebührenverzeichnis der GOT.</div>
            {leistungen.map((l) => (
              <div key={l.id} style={{ ...zeile, opacity: l.aktiv ? 1 : 0.5 }}>
                <span>{l.nr ? `${l.nr} · ` : ''}{l.bezeichnung}</span>
                <span>{euroText(Number(l.einfach_satz))} <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => umschalten(l)}>{l.aktiv ? 'ausblenden' : 'einblenden'}</button></span>
              </div>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{GOT_HINWEIS}</p>
        </>
      )}
    </div>
  );
}
