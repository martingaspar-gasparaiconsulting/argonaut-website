'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/veranstaltungen/motorsport/teile — Teile mit Laufzeit (Paket 296, T1)
//
// Je Leihfahrzeug der Mietflotte (Kart, Rennfahrzeug, …) die eingebauten
// Teile mit Laufzeit-Grenze in Betriebsstunden oder Runden: Stand aus den
// Laufzeit-Einträgen ab Einbau, Ampel (ab 80 % gelb, ab 100 % rot), Tausch
// mit Datum (das alte Teil bleibt als Verlauf). Laufzeiten aus Events trägt
// die Event-Akte ein, Training/Vermietung ohne Event hier.
// Logik: lib/motorsport.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TEIL_KATEGORIEN, EINHEITEN, teilPruefen, einsatzPruefen, laufzeit, laufzeitText, label, berlinTagVon, datumDe, type TeilForm, type Teil } from '@/lib/motorsport';
import { zahlText, zahlFeld, leseZahl } from '@/lib/zahlen';
import Leerzustand from '../../../_components/Leerzustand';
import { C, s, AMPEL_FARBE } from '../../../werkstatt/zweirad/_teile/stil';
import { supabase, fehlerText, fzName, type MietFz, type Einsatz } from '../_teile/typen';

type TeilRoh = Teil & { bezeichnung: string; kategorie: string; seriennummer: string | null; notiz: string | null };
const LEER_TEIL = (fz: string, heute: string): TeilForm => ({ mietFahrzeugId: fz, bezeichnung: '', kategorie: 'motor', seriennummer: '', einheit: 'stunden', grenze: '', startwert: '0', eingebautAm: heute, notiz: '' });
const AMPEL_TEXT = { ueber: 'überschritten', bald: 'bald fällig', ok: 'in Ordnung' } as const;

export default function TeilePage() {
  const heute = berlinTagVon(new Date().toISOString());
  const [flotte, setFlotte] = useState<MietFz[]>([]);
  const [teile, setTeile] = useState<TeilRoh[]>([]);
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fzId, setFzId] = useState<string>('');
  const [teilForm, setTeilForm] = useState<TeilForm | null>(null);
  const [eins, setEins] = useState({ datum: heute, stunden: '', runden: '', notiz: '' });
  const [mitGetauscht, setMitGetauscht] = useState(false);

  const lade = useCallback(async () => {
    const [f, t, e] = await Promise.all([
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen, art, tagessatz_cent, aktiv').order('bezeichnung').limit(1000),
      supabase.from('ms_teil').select('*').order('eingebaut_am', { ascending: false }).limit(5000),
      supabase.from('ms_einsatz').select('*').order('datum', { ascending: false }).limit(10000),
    ]);
    if (t.error) setFehler('Motorsport ist noch nicht eingerichtet (SQL zu Paket 296 fehlt) oder Ihnen fehlt das Recht „Veranstaltungen".');
    const fl = ((f.data as MietFz[] | null) ?? []).sort((a, b) => Number(['kart', 'rennfahrzeug'].includes(b.art)) - Number(['kart', 'rennfahrzeug'].includes(a.art)) || a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
    setFlotte(fl);
    setTeile((t.data as TeilRoh[] | null) ?? []);
    setEinsaetze((e.data as Einsatz[] | null) ?? []);
    setFzId((alt) => alt || fl.find((x) => x.aktiv)?.id || '');
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const stand = useMemo(() => teile.filter((t) => !t.ausgebaut_am).map((t) => ({ t, l: laufzeit(t, einsaetze) })), [teile, einsaetze]);
  const zahlen = useMemo(() => ({
    ueber: stand.filter((x) => x.l.ampel === 'ueber').length,
    bald: stand.filter((x) => x.l.ampel === 'bald').length,
    teile: stand.length,
  }), [stand]);
  const fz = flotte.find((f) => f.id === fzId) ?? null;
  const teileFz = teile.filter((t) => t.miet_fahrzeug_id === fzId && (mitGetauscht || !t.ausgebaut_am));
  const einsFz = einsaetze.filter((e) => e.miet_fahrzeug_id === fzId).slice(0, 30);
  const summeFz = useMemo(() => einsaetze.filter((e) => e.miet_fahrzeug_id === fzId).reduce((x, e) => ({ h: x.h + (leseZahl(e.stunden) ?? 0), r: x.r + (leseZahl(e.runden) ?? 0) }), { h: 0, r: 0 }), [einsaetze, fzId]);

  function meldung(o: string | null, f: string | null) { setOk(o); setFehler(f); }
  async function lauf(fn: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, okText: string, std: string): Promise<boolean> {
    setBusy(true); meldung(null, null);
    const { data, error } = await fn();
    setBusy(false);
    if (error || !data || (Array.isArray(data) && data.length === 0)) { meldung(null, fehlerText(error, std)); return false; }
    meldung(okText, null); await lade(); return true;
  }

  async function teilSpeichern() {
    if (!teilForm) return;
    const p = teilPruefen(teilForm, heute);
    if (!p.ok) { meldung(null, p.grund); return; }
    if (await lauf(() => supabase.from('ms_teil').insert(p.zeile).select('id'), `${p.zeile.bezeichnung} eingebaut.`, 'Teil nicht gespeichert.')) setTeilForm(null);
  }
  async function tauschen(t: TeilRoh) {
    if (!window.confirm(`„${t.bezeichnung}" heute als getauscht markieren? Danach tragen Sie das neue Teil ein.`)) return;
    if (await lauf(() => supabase.from('ms_teil').update({ ausgebaut_am: heute }).eq('id', t.id).select('id'), `${t.bezeichnung} als getauscht markiert — tragen Sie jetzt das neue Teil ein.`, 'Nicht gespeichert.')) {
      setTeilForm({ mietFahrzeugId: t.miet_fahrzeug_id, bezeichnung: t.bezeichnung, kategorie: t.kategorie, seriennummer: '', einheit: t.einheit, grenze: zahlFeld(leseZahl(t.grenze)), startwert: '0', eingebautAm: heute, notiz: '' });
    }
  }
  async function einsatzSpeichern() {
    const p = einsatzPruefen({ ...eins, mietFahrzeugId: fzId, eventId: '' }, heute);
    if (!p.ok) { meldung(null, p.grund); return; }
    if (await lauf(() => supabase.from('ms_einsatz').insert(p.zeile).select('id'), 'Laufzeit eingetragen.', 'Nicht gespeichert.')) setEins({ ...eins, stunden: '', runden: '', notiz: '' });
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/veranstaltungen/motorsport" style={s.zurueck}>← Motorsport</a>
      <h1 style={s.h1}>🔧 Teile &amp; Laufzeiten</h1>
      <p style={s.dim}>
        So geht&apos;s: Wählen Sie ein Leihfahrzeug aus Ihrer Mietflotte und tragen Sie die Teile ein, deren Laufzeit Sie überwachen (Motor, Reifen,
        Bremsen, Kette …) — mit Grenze in Betriebsstunden oder Runden und der Laufzeit beim Einbau. Laufzeiten aus Events tragen Sie in der Event-Akte
        ein, Training oder Vermietung ohne Event hier. Ab 80 % der Grenze wird das Teil gelb, ab 100 % rot. Beim Tausch bleibt das alte Teil als Verlauf.
      </p>
      {fehler && <div style={{ ...s.box, borderColor: C.bad, color: C.bad }}>{fehler}</div>}
      {ok && <div style={{ ...s.box, borderColor: C.ok, color: C.ok }}>{ok}</div>}

      <div style={s.kacheln}>
        <div style={s.kachel}><span style={s.dim}>Überwachte Teile</span><span style={s.zahl}>{zahlen.teile}</span></div>
        <div style={s.kachel}><span style={s.dim}>bald fällig (ab 80 %)</span><span style={{ ...s.zahl, color: zahlen.bald ? C.warn : C.text }}>{zahlen.bald}</span></div>
        <div style={s.kachel}><span style={s.dim}>überschritten</span><span style={{ ...s.zahl, color: zahlen.ueber ? C.bad : C.text }}>{zahlen.ueber}</span></div>
      </div>

      {zahlen.ueber + zahlen.bald > 0 && (
        <div style={s.box}>
          <b>Fällige Teile</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {stand.filter((x) => x.l.ampel !== 'ok').sort((a, b) => b.l.anteil - a.l.anteil).map(({ t, l }) => (
              <li key={t.id} style={{ color: AMPEL_FARBE[l.ampel] }}>
                {fzName(flotte.find((f) => f.id === t.miet_fahrzeug_id))} · {t.bezeichnung}: {laufzeitText(l.verbraucht, t.einheit)} von {laufzeitText(leseZahl(t.grenze) ?? 0, t.einheit)} ({AMPEL_TEXT[l.ampel]})
              </li>
            ))}
          </ul>
        </div>
      )}

      {laden ? <p style={s.dim}>Lädt …</p> : flotte.length === 0 ? (
        <Leerzustand icon="🏎️" titel="Noch keine Leihfahrzeuge" text="Legen Sie Ihre Karts und Rennfahrzeuge zuerst in der Mietflotte an (Art „Kart“ bzw. „Rennfahrzeug“) — danach überwachen Sie hier die Laufzeit ihrer Teile." aktionText="Zur Mietflotte" aktionHref="/dashboard/verleih/fahrzeuge" />
      ) : (
        <>
          <label style={{ ...s.feld, maxWidth: 420 }}>Fahrzeug<select style={s.eingabe} value={fzId} onChange={(e) => { setFzId(e.target.value); setTeilForm(null); }}>
            {flotte.map((f) => <option key={f.id} value={f.id}>{fzName(f)}{f.aktiv ? '' : ' (inaktiv)'}</option>)}
          </select></label>
          {fz && <p style={s.dim}>Gesamt erfasst: {zahlText(summeFz.h, 2)} h · {summeFz.r.toLocaleString('de-DE')} Runden</p>}

          <h2 style={s.h2}>Teile</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!teilForm && fz && <button style={s.btnGold} onClick={() => setTeilForm(LEER_TEIL(fz.id, heute))}>＋ Teil eintragen</button>}
            <label style={{ fontSize: 13.5, color: C.dim }}><input type="checkbox" checked={mitGetauscht} onChange={(e) => setMitGetauscht(e.target.checked)} /> getauschte Teile zeigen</label>
          </div>
          {teilForm && (
            <div style={s.box}>
              <div style={s.raster}>
                <label style={s.feld}>Teil<input style={s.eingabe} value={teilForm.bezeichnung} onChange={(e) => setTeilForm({ ...teilForm, bezeichnung: e.target.value })} placeholder="z. B. Motor, Slicks Satz 3" /></label>
                <label style={s.feld}>Kategorie<select style={s.eingabe} value={teilForm.kategorie} onChange={(e) => setTeilForm({ ...teilForm, kategorie: e.target.value })}>{TEIL_KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
                <label style={s.feld}>Seriennummer<input style={s.eingabe} value={teilForm.seriennummer} onChange={(e) => setTeilForm({ ...teilForm, seriennummer: e.target.value })} /></label>
                <label style={s.feld}>Laufzeit in<select style={s.eingabe} value={teilForm.einheit} onChange={(e) => setTeilForm({ ...teilForm, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
                <label style={s.feld}>Grenze (laut Hersteller / Ihrer Vorgabe)<input style={s.eingabe} inputMode="decimal" value={teilForm.grenze} onChange={(e) => setTeilForm({ ...teilForm, grenze: e.target.value })} /></label>
                <label style={s.feld}>Laufzeit beim Einbau<input style={s.eingabe} inputMode="decimal" value={teilForm.startwert} onChange={(e) => setTeilForm({ ...teilForm, startwert: e.target.value })} /></label>
                <label style={s.feld}>Eingebaut am<input type="date" max={heute} style={s.eingabe} value={teilForm.eingebautAm} onChange={(e) => setTeilForm({ ...teilForm, eingebautAm: e.target.value })} /></label>
                <label style={s.feld}>Notiz<input style={s.eingabe} value={teilForm.notiz} onChange={(e) => setTeilForm({ ...teilForm, notiz: e.target.value })} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void teilSpeichern()}>💾 Eintragen</button>
                <button style={s.btnAus} onClick={() => setTeilForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}
          {teileFz.length === 0 ? <p style={s.dim}>Für dieses Fahrzeug sind noch keine Teile eingetragen.</p> : (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Teil</th><th style={s.th}>Eingebaut</th><th style={s.th}>Stand</th><th style={s.th}>Rest</th><th style={s.th}></th></tr></thead>
              <tbody>
                {teileFz.map((t) => {
                  const l = laufzeit(t, einsaetze);
                  const farbe = t.ausgebaut_am ? C.dim : AMPEL_FARBE[l.ampel];
                  return (
                    <tr key={t.id}>
                      <td style={s.td}><b>{t.bezeichnung}</b><div style={{ color: C.dim, fontSize: 12 }}>{label(TEIL_KATEGORIEN, t.kategorie)}{t.seriennummer ? ` · Nr. ${t.seriennummer}` : ''}</div></td>
                      <td style={s.td}>{datumDe(t.eingebaut_am)}{t.ausgebaut_am ? <div style={{ color: C.dim, fontSize: 12 }}>getauscht {datumDe(t.ausgebaut_am)}</div> : null}</td>
                      <td style={{ ...s.td, color: farbe }}>
                        {laufzeitText(l.verbraucht, t.einheit)} / {laufzeitText(leseZahl(t.grenze) ?? 0, t.einheit)}
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 4, width: 140 }}>
                          <div style={{ height: 6, borderRadius: 3, background: farbe, width: `${Math.min(100, Math.round(l.anteil * 100))}%` }} />
                        </div>
                      </td>
                      <td style={{ ...s.td, color: farbe }}>{t.ausgebaut_am ? '—' : l.rest > 0 ? laufzeitText(l.rest, t.einheit) : AMPEL_TEXT.ueber}</td>
                      <td style={s.td}>{!t.ausgebaut_am && <button style={s.link} disabled={busy} onClick={() => void tauschen(t)}>🔄 Getauscht</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <h2 style={s.h2}>Laufzeit ohne Event eintragen (Training, Vermietung)</h2>
          <div style={s.box}>
            <div style={s.raster}>
              <label style={s.feld}>Datum<input type="date" max={heute} style={s.eingabe} value={eins.datum} onChange={(e) => setEins({ ...eins, datum: e.target.value })} /></label>
              <label style={s.feld}>Stunden (z. B. 1,5)<input style={s.eingabe} inputMode="decimal" value={eins.stunden} onChange={(e) => setEins({ ...eins, stunden: e.target.value })} /></label>
              <label style={s.feld}>Runden<input style={s.eingabe} inputMode="numeric" value={eins.runden} onChange={(e) => setEins({ ...eins, runden: e.target.value })} /></label>
              <label style={s.feld}>Notiz<input style={s.eingabe} value={eins.notiz} onChange={(e) => setEins({ ...eins, notiz: e.target.value })} /></label>
            </div>
            <button style={{ ...s.btnGold, marginTop: 10 }} disabled={busy || !fz} onClick={() => void einsatzSpeichern()}>💾 Laufzeit eintragen</button>
          </div>
          {einsFz.length > 0 && (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Datum</th><th style={s.th}>Stunden</th><th style={s.th}>Runden</th><th style={s.th}>Event</th><th style={s.th}>Notiz</th></tr></thead>
              <tbody>
                {einsFz.map((e) => (
                  <tr key={e.id}><td style={s.td}>{datumDe(e.datum)}</td><td style={s.td}>{zahlText(e.stunden, 2)}</td><td style={s.td}>{String(e.runden)}</td>
                    <td style={s.td}>{e.event_id ? <a href={`/dashboard/veranstaltungen/motorsport/${e.event_id}`} style={{ color: C.gold }}>zum Event</a> : '—'}</td><td style={s.td}>{e.notiz || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
