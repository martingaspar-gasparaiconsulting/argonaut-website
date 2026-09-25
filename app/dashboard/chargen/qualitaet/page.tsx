'use client';

// ============================================================
// ARGONAUT OS · Paket PS2 · Qualität & Rückverfolgung
//   Reklamationen (8D)      Kunde / Lieferant / intern, acht Schritte mit Fristen,
//                           Abschluss erst nach bestätigter Wirksamkeit, Bericht drucken
//   Lieferanten-Bewertung   Qualität, Liefertreue, Preis, Service -> A/B/C,
//                           Reklamationen im Zeitraum als Plausibilitäts-Hinweis
//   Rückruf                 Charge wählen -> betroffene Folgechargen (mehrstufig),
//                           Abnehmer, Mengenbilanz, Checkliste mit Meldepflichten,
//                           Abnehmer-Text (erst ohne [Platzhalter] kopierbar)
// Logik: lib/qualitaet.ts (getestet). SQL: supabase-sql/ps2-qualitaet.sql.
// Unterpfad von /dashboard/chargen (erbt dessen Freigabe); dieselbe Seite liegt
// auch unter /dashboard/lebensmittel/qualitaet.
// Pfad: app/dashboard/chargen/qualitaet/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  RICHTUNGEN, SCHRITTE, HINWEIS_8D, naechsteNummer, schrittStaende, naechsterSchritt, abschlussSperre, rekStatus, rekZahlen, berichtText,
  KRITERIEN, KLASSEN_TEXT, gesamtWert, klasse, bewertungsHinweise, reklamationenGegen, bewertungFaellig, gueltigeNote,
  betroffeneChargen, abnehmerListe, mengenBilanz, RUECKRUF_SCHRITTE, HINWEIS_RUECKRUF, abnehmerText, offenePlatzhalter,
  heuteBerlin, datumDe,
  type Richtung, type SchrittKey, type Schritte, type Reklamation, type Kriterium, type Noten, type Los, type Verwendung, type RueckrufArt, type Abnehmer,
} from '@/lib/qualitaet';
import { leseZahl, zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Rek = Reklamation & { id: string; nummer: string; richtung: Richtung; eingang_am: string; gegenstand: string | null; charge_nr: string | null; partner: string | null; lieferant_id: string | null; kosten: number | null; schritte: Schritte; wirksam: boolean; abgeschlossen_am: string | null };
type Lieferant = { id: string; name: string };
type Bewertung = { id: string; lieferant_id: string; datum: string; qualitaet: number | null; liefertreue: number | null; preis: number | null; service: number | null; wert: number | null; klasse: string | null; notiz: string | null };
type LmCharge = { id: string; bezeichnung: string; charge_nr: string | null; menge: number | null; einheit: string | null; status: string | null; verwendung: string | null };
type Rueckruf = { id: string; art: RueckrufArt; quelle: 'charge_los' | 'lm_chargen'; charge_id: string; charge_nr: string | null; produkt: string; grund: string | null; gestartet_am: string; schritte: Record<string, string>; abnehmer: { referenz: string; menge: number | null }[]; zurueck: Record<string, number>; abgeschlossen_am: string | null };

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };

function zahlAus(s: string): number | null { return leseZahl(s); }
function euro(n: number): string { return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function QualitaetSeite() {
  const [tab, setTab] = useState<'rek' | 'lief' | 'rueck'>('rek');
  const [uid, setUid] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = heuteBerlin();

  const [reks, setReks] = useState<Rek[]>([]);
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [bewertungen, setBewertungen] = useState<Bewertung[]>([]);
  const [lose, setLose] = useState<Los[]>([]);
  const [verwendungen, setVerwendungen] = useState<Verwendung[]>([]);
  const [lmChargen, setLmChargen] = useState<LmCharge[]>([]);
  const [rueckrufe, setRueckrufe] = useState<Rueckruf[]>([]);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('qs_reklamation').select('*').order('eingang_am', { ascending: false });
    if (r.error) { if (/qs_reklamation/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); return; }
    setReks(((r.data as Rek[]) ?? []).map((x) => ({ ...x, schritte: x.schritte ?? {} })));
    const [l, b, cl, cv, lm, rr] = await Promise.all([
      supabase.from('lieferanten').select('id, name').order('name', { ascending: true }),
      supabase.from('qs_lieferant_bewertung').select('*').order('datum', { ascending: false }),
      supabase.from('charge_los').select('id, charge_nr, bezeichnung, menge, einheit, status'),
      supabase.from('charge_verwendung').select('id, los_id, richtung, referenz, menge, datum'),
      supabase.from('lm_chargen').select('id, bezeichnung, charge_nr, menge, einheit, status, verwendung'),
      supabase.from('qs_rueckruf').select('*').order('gestartet_am', { ascending: false }),
    ]);
    setLieferanten((l.data as Lieferant[]) ?? []);
    setBewertungen((b.data as Bewertung[]) ?? []);
    setLose((cl.data as Los[]) ?? []);
    setVerwendungen((cv.data as Verwendung[]) ?? []);
    setLmChargen((lm.data as LmCharge[]) ?? []);
    setRueckrufe(((rr.data as Rueckruf[]) ?? []).map((x) => ({ ...x, schritte: x.schritte ?? {}, abnehmer: x.abnehmer ?? [], zurueck: x.zurueck ?? {} })));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      await laden();
    })();
  }, [laden]);

  const zahlen = useMemo(() => rekZahlen(reks, heute), [reks, heute]);

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Qualität</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧪 Qualität &amp; Rückverfolgung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Reklamationen sauber abarbeiten, Lieferanten bewerten und im Ernstfall in Minuten wissen, welche Ware wo ist.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['rek', `🛠 Reklamationen (8D)${zahlen.offen ? ` · ${zahlen.offen}` : ''}`], ['lief', '⭐ Lieferanten-Bewertung'], ['rueck', '🚨 Rückruf']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); setFehler(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Qualitäts-Tabellen sind noch nicht eingerichtet (SQL von Paket PS2 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'rek' && (
        <Reklamationen reks={reks} lieferanten={lieferanten} heute={heute} zahlen={zahlen} istChef={istChef} uid={uid}
          onFehler={setFehler} onOk={setOk} neuLaden={laden} />
      )}
      {!sqlFehlt && tab === 'lief' && (
        istChef
          ? <Lieferanten lieferanten={lieferanten} bewertungen={bewertungen} reks={reks} heute={heute} onFehler={setFehler} onOk={setOk} neuLaden={laden} />
          : <div style={karte}>Die Lieferanten-Bewertung pflegt der Chef.</div>
      )}
      {!sqlFehlt && tab === 'rueck' && (
        <RueckrufTab lose={lose} verwendungen={verwendungen} lmChargen={lmChargen} rueckrufe={rueckrufe} heute={heute} istChef={istChef}
          onFehler={setFehler} onOk={setOk} neuLaden={laden} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reklamationen (8D)
// ---------------------------------------------------------------------------

function Reklamationen({ reks, lieferanten, heute, zahlen, istChef, uid, onFehler, onOk, neuLaden }: {
  reks: Rek[]; lieferanten: Lieferant[]; heute: string; zahlen: ReturnType<typeof rekZahlen>; istChef: boolean; uid: string | null;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [neu, setNeu] = useState<{ richtung: Richtung; gegenstand: string; charge_nr: string; partner: string; lieferant_id: string; eingang_am: string } | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);

  const liste = reks.filter((r) => filter === 'alle' || rekStatus(r) !== 'abgeschlossen');

  async function anlegen() {
    if (!neu || !uid) return;
    if (!neu.gegenstand.trim()) { onFehler('Bitte angeben, worum es geht.'); return; }
    const jahr = Number(neu.eingang_am.slice(0, 4)) || Number(heute.slice(0, 4));
    const lief = lieferanten.find((l) => l.id === neu.lieferant_id);
    const zeile = {
      nummer: naechsteNummer(reks.map((r) => r.nummer), jahr), richtung: neu.richtung, eingang_am: neu.eingang_am || heute,
      gegenstand: neu.gegenstand.trim().slice(0, 300), charge_nr: neu.charge_nr.trim() || null,
      partner: (neu.richtung === 'lieferant' ? lief?.name : neu.partner.trim()) || null,
      lieferant_id: neu.richtung === 'lieferant' ? neu.lieferant_id || null : null, schritte: {},
    };
    const { data, error } = await supabase.from('qs_reklamation').insert(zeile).select('id').maybeSingle();
    if (error) { onFehler(/nummer/.test(error.message) ? 'Nummer schon vergeben — bitte neu laden und erneut anlegen.' : 'Anlegen fehlgeschlagen.'); return; }
    setNeu(null); onOk(`Reklamation ${zeile.nummer} angelegt.`);
    await neuLaden();
    if (data && (data as { id: string }).id) setOffenId((data as { id: string }).id);
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Offen" wert={String(zahlen.offen)} farbe={zahlen.offen ? C.warn : C.textDim} />
        <Kpi label="Frist überschritten" wert={String(zahlen.ueberfaellig)} farbe={zahlen.ueberfaellig ? C.danger : C.textDim} />
        <Kpi label="Abgeschlossen" wert={String(zahlen.abgeschlossen)} farbe={C.green} />
        <Kpi label="Ø Tage bis Abschluss" wert={zahlen.mittlereTage == null ? '—' : String(zahlen.mittlereTage)} farbe={C.text} />
        <Kpi label="Kosten gesamt" wert={euro(zahlen.kosten)} farbe={C.text} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button style={primaer} onClick={() => setNeu({ richtung: 'kunde', gegenstand: '', charge_nr: '', partner: '', lieferant_id: '', eingang_am: heute })}>＋ Reklamation</button>
        <button style={knopf} onClick={() => setFilter(filter === 'offen' ? 'alle' : 'offen')}>{filter === 'offen' ? 'Auch abgeschlossene zeigen' : 'Nur offene zeigen'}</button>
      </div>

      {neu && (
        <div style={karte}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={lab}>Art
              <select style={feld} value={neu.richtung} onChange={(e) => setNeu({ ...neu, richtung: e.target.value as Richtung })}>
                {RICHTUNGEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
            <label style={lab}>Eingang am<input type="date" style={feld} value={neu.eingang_am} onChange={(e) => setNeu({ ...neu, eingang_am: e.target.value })} /></label>
            {neu.richtung === 'lieferant' ? (
              <label style={lab}>Lieferant
                <select style={feld} value={neu.lieferant_id} onChange={(e) => setNeu({ ...neu, lieferant_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {lieferanten.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            ) : neu.richtung === 'kunde' ? (
              <label style={lab}>Kunde<input style={feld} value={neu.partner} onChange={(e) => setNeu({ ...neu, partner: e.target.value })} /></label>
            ) : null}
            <label style={lab}>Charge / Serie (falls bekannt)<input style={feld} value={neu.charge_nr} onChange={(e) => setNeu({ ...neu, charge_nr: e.target.value })} /></label>
          </div>
          <label style={lab}>Worum geht es?<input style={feld} value={neu.gegenstand} onChange={(e) => setNeu({ ...neu, gegenstand: e.target.value })} placeholder="z. B. Gehäuse Typ B mit Riss, 12 Stück" /></label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={primaer} onClick={() => void anlegen()}>Anlegen</button>
            <button style={knopf} onClick={() => setNeu(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {liste.length === 0 && <div style={{ ...karte, color: C.textDim }}>{filter === 'offen' ? 'Keine offenen Reklamationen.' : 'Noch keine Reklamationen erfasst.'}</div>}
      {liste.map((r) => (
        <RekKarte key={r.id} r={r} heute={heute} offen={offenId === r.id} istChef={istChef}
          onToggle={() => setOffenId(offenId === r.id ? null : r.id)} onFehler={onFehler} onOk={onOk} neuLaden={neuLaden} />
      ))}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>{HINWEIS_8D}</p>
    </>
  );
}

function RekKarte({ r, heute, offen, istChef, onToggle, onFehler, onOk, neuLaden }: {
  r: Rek; heute: string; offen: boolean; istChef: boolean; onToggle: () => void;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [schritte, setSchritte] = useState<Schritte>(r.schritte ?? {});
  const [wirksam, setWirksam] = useState<boolean>(!!r.wirksam);
  const [kosten, setKosten] = useState<string>(r.kosten != null ? String(r.kosten).replace('.', ',') : '');
  useEffect(() => { setSchritte(r.schritte ?? {}); setWirksam(!!r.wirksam); setKosten(r.kosten != null ? zahlFeld(r.kosten).replace('.', ',') : ''); }, [r]);

  const entwurf: Rek = { ...r, schritte, wirksam };
  const staende = schrittStaende(entwurf, heute);
  const status = rekStatus(r);
  const naechster = naechsterSchritt(r);
  const ueber = staende.some((s) => s.ueberfaellig);
  const sperre = abschlussSperre(entwurf);

  function setzeText(k: SchrittKey, text: string) { setSchritte({ ...schritte, [k]: { ...(schritte[k] ?? {}), text } }); }
  function setzeFrist(k: SchrittKey, frist: string) { setSchritte({ ...schritte, [k]: { ...(schritte[k] ?? {}), frist: frist || null } }); }
  function erledigt(k: SchrittKey, an: boolean) { setSchritte({ ...schritte, [k]: { ...(schritte[k] ?? {}), erledigt_am: an ? heute : null } }); }

  async function speichern(abschliessen = false) {
    const k = zahlAus(kosten);
    if (kosten.trim() && k === null) { onFehler('Die Kosten sind nicht lesbar.'); return; }
    let neueSchritte = schritte;
    if (abschliessen) {
      if (sperre.length) { onFehler(`Abschluss nicht möglich: ${sperre.join(' · ')}`); return; }
      neueSchritte = { ...schritte, D8: { ...(schritte.D8 ?? {}), erledigt_am: heute } };
    }
    const { error } = await supabase.from('qs_reklamation').update({
      schritte: neueSchritte, wirksam, kosten: k, abgeschlossen_am: abschliessen ? heute : r.abgeschlossen_am, aktualisiert_am: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) { onFehler('Speichern fehlgeschlagen.'); return; }
    onOk(abschliessen ? `${r.nummer} abgeschlossen.` : 'Gespeichert.');
    await neuLaden();
  }

  function drucken() {
    const text = berichtText({ ...entwurf, gegenstand: r.gegenstand, charge_nr: r.charge_nr, partner: r.partner });
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(`<html lang="de"><head><title>${esc(r.nummer)}</title><style>body{font-family:Arial,sans-serif;padding:32px;white-space:pre-wrap;line-height:1.5;color:#111}</style></head><body>${esc(text)}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  const farbe = status === 'abgeschlossen' ? C.green : ueber ? C.danger : C.warn;
  return (
    <div style={{ ...karte, borderLeft: `4px solid ${farbe}` }}>
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{r.nummer} · {r.gegenstand}</div>
          <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 2 }}>
            {RICHTUNGEN.find((x) => x.key === r.richtung)?.label}{r.partner ? ` · ${r.partner}` : ''}{r.charge_nr ? ` · Charge ${r.charge_nr}` : ''} · Eingang {datumDe(r.eingang_am)}
          </div>
        </div>
        <div style={{ color: farbe, fontSize: 13.5, fontWeight: 700 }}>
          {status === 'abgeschlossen' ? `✓ abgeschlossen ${datumDe(r.abgeschlossen_am)}` : `${naechster ?? ''} ${SCHRITTE.find((s) => s.key === naechster)?.titel ?? ''}${ueber ? ' · Frist überschritten' : ''}`} {offen ? '▲' : '▼'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {staende.map((s) => (
          <div key={s.key} title={`${s.key} ${s.titel}`} style={{ flex: 1, height: 6, borderRadius: 3, background: s.erledigt ? C.green : s.ueberfaellig ? C.danger : 'rgba(143,163,190,0.25)' }} />
        ))}
      </div>

      {offen && (
        <div style={{ marginTop: 12 }}>
          {SCHRITTE.filter((s) => s.key !== 'D8').map((s) => {
            const st = staende.find((x) => x.key === s.key)!;
            const e = schritte[s.key] ?? {};
            return (
              <div key={s.key} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b>{s.key} · {s.titel}</b>
                  <span style={{ color: st.erledigt ? C.green : st.ueberfaellig ? C.danger : C.textDim, fontSize: 13 }}>
                    {st.erledigt ? `erledigt ${datumDe(e.erledigt_am)}` : st.frist ? `Frist ${datumDe(st.frist)}${st.ueberfaellig ? ' · überschritten' : ''}` : ''}
                  </span>
                </div>
                <div style={{ color: C.textDim, fontSize: 13, margin: '2px 0 6px' }}>{s.frage}</div>
                <textarea style={{ ...feld, minHeight: 60 }} value={e.text ?? ''} disabled={status === 'abgeschlossen'} onChange={(ev) => setzeText(s.key, ev.target.value)} />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: 13.5 }}>
                  <label><input type="checkbox" checked={!!e.erledigt_am} disabled={status === 'abgeschlossen'} onChange={(ev) => erledigt(s.key, ev.target.checked)} /> erledigt</label>
                  <label style={{ color: C.textDim }}>eigene Frist <input type="date" style={{ ...feld, width: 160, display: 'inline-block', padding: '4px 6px' }} value={e.frist ?? ''} disabled={status === 'abgeschlossen'} onChange={(ev) => setzeFrist(s.key, ev.target.value)} /></label>
                  {s.key === 'D6' && (
                    <label style={{ color: wirksam ? C.green : C.warn, fontWeight: 700 }}>
                      <input type="checkbox" checked={wirksam} disabled={status === 'abgeschlossen'} onChange={(ev) => setWirksam(ev.target.checked)} /> Wirksamkeit nachgewiesen
                    </label>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <label style={{ ...lab, marginTop: 0 }}>Kosten (€, optional)<input style={{ ...feld, width: 160 }} value={kosten} inputMode="decimal" disabled={status === 'abgeschlossen'} onChange={(e) => setKosten(e.target.value)} /></label>
            {status !== 'abgeschlossen' && <button style={primaer} onClick={() => void speichern(false)}>💾 Speichern</button>}
            {status !== 'abgeschlossen' && istChef && (
              <button style={{ ...knopf, color: sperre.length ? C.textDim : C.green }} title={sperre.join('\n')} onClick={() => void speichern(true)}>✓ D8 Abschließen</button>
            )}
            <button style={knopf} onClick={drucken}>🖨 8D-Bericht</button>
          </div>
          {status !== 'abgeschlossen' && sperre.length > 0 && <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>Für den Abschluss fehlt: {sperre.join(' · ')}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lieferanten-Bewertung
// ---------------------------------------------------------------------------

function Lieferanten({ lieferanten, bewertungen, reks, heute, onFehler, onOk, neuLaden }: {
  lieferanten: Lieferant[]; bewertungen: Bewertung[]; reks: Rek[]; heute: string;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [form, setForm] = useState<{ lieferant_id: string; noten: Noten; notiz: string } | null>(null);

  const letzte = (id: string) => bewertungen.find((b) => b.lieferant_id === id) ?? null;
  const sortiert = [...lieferanten].sort((a, b) => {
    const fa = bewertungFaellig(letzte(a.id), heute).faellig ? 0 : 1;
    const fb = bewertungFaellig(letzte(b.id), heute).faellig ? 0 : 1;
    return fa - fb || a.name.localeCompare(b.name, 'de');
  });

  const wert = form ? gesamtWert(form.noten) : null;
  const kl = klasse(wert);
  const anzRek = form ? reklamationenGegen(form.lieferant_id, reks, heute) : 0;
  const hinweise = form ? bewertungsHinweise(form.noten, anzRek) : [];

  async function speichern() {
    if (!form) return;
    if (wert == null) { onFehler('Ohne Bewertung der Qualität gibt es keinen Gesamtwert.'); return; }
    const n = form.noten;
    const { error } = await supabase.from('qs_lieferant_bewertung').insert({
      lieferant_id: form.lieferant_id, lieferant_name: lieferanten.find((l) => l.id === form.lieferant_id)?.name ?? null, datum: heute,
      qualitaet: gueltigeNote(n.qualitaet), liefertreue: gueltigeNote(n.liefertreue), preis: gueltigeNote(n.preis), service: gueltigeNote(n.service),
      wert, klasse: kl, reklamationen: anzRek, notiz: form.notiz.trim() || null,
    });
    if (error) { onFehler('Speichern fehlgeschlagen.'); return; }
    setForm(null); onOk('Bewertung gespeichert.'); await neuLaden();
  }

  if (lieferanten.length === 0) return <div style={karte}>Noch keine Lieferanten angelegt — <a href="/dashboard/erp/lieferanten" style={{ color: C.cyan }}>zu den Lieferanten</a>.</div>;

  return (
    <>
      {form && (
        <div style={{ ...karte, borderColor: C.gold }}>
          <b>{lieferanten.find((l) => l.id === form.lieferant_id)?.name}</b>
          <span style={{ color: C.textDim, fontSize: 13 }}> · {anzRek} Reklamation{anzRek === 1 ? '' : 'en'} in den letzten 12 Monaten</span>
          {KRITERIEN.map((k) => (
            <div key={k.key} style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>{k.label} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 13 }}>· Gewicht {k.gewicht} % · {k.frage}</span></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {[1, 2, 3, 4, 5].map((p) => (
                  <button key={p} onClick={() => setForm({ ...form, noten: { ...form.noten, [k.key]: form.noten[k.key as Kriterium] === p ? null : p } })}
                    style={{ ...knopf, minWidth: 40, ...(form.noten[k.key as Kriterium] === p ? { background: C.gold, color: C.navy, border: 'none', fontWeight: 800 } : {}) }}>{p}</button>
                ))}
                <span style={{ color: C.textDim, fontSize: 12.5, alignSelf: 'center' }}>1 = schlecht · 5 = sehr gut</span>
              </div>
            </div>
          ))}
          <label style={lab}>Notiz<input style={feld} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          <div style={{ marginTop: 10, fontSize: 15 }}>
            Gesamt: <b>{wert == null ? '—' : `${wert} von 100`}</b>{kl && <> · Klasse <b style={{ color: kl === 'A' ? C.green : kl === 'B' ? C.warn : C.danger }}>{kl}</b> — {KLASSEN_TEXT[kl]}</>}
          </div>
          {hinweise.map((h) => <div key={h} style={{ color: C.warn, fontSize: 13.5, marginTop: 4 }}>⚠ {h}</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={primaer} onClick={() => void speichern()}>💾 Bewertung speichern</button>
            <button style={knopf} onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}
      {sortiert.map((l) => {
        const b = letzte(l.id);
        const f = bewertungFaellig(b, heute);
        const kl2 = (b?.klasse ?? null) as 'A' | 'B' | 'C' | null;
        return (
          <div key={l.id} style={{ ...karte, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <b>{l.name}</b>
              <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 2 }}>
                {b ? <>zuletzt {datumDe(b.datum)} · {b.wert} von 100 · Klasse <b style={{ color: kl2 === 'A' ? C.green : kl2 === 'B' ? C.warn : C.danger }}>{b.klasse}</b></> : 'noch nie bewertet'}
                {' · '}{f.faellig ? <span style={{ color: C.warn }}>Bewertung fällig</span> : `nächste ${datumDe(f.am)}`}
                {' · '}{reklamationenGegen(l.id, reks, heute)} Reklamationen (12 Mon.)
              </div>
            </div>
            <button style={knopf} onClick={() => setForm({ lieferant_id: l.id, noten: {}, notiz: '' })}>⭐ Bewerten</button>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rückruf
// ---------------------------------------------------------------------------

function RueckrufTab({ lose, verwendungen, lmChargen, rueckrufe, heute, istChef, onFehler, onOk, neuLaden }: {
  lose: Los[]; verwendungen: Verwendung[]; lmChargen: LmCharge[]; rueckrufe: Rueckruf[]; heute: string; istChef: boolean;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [start, setStart] = useState<{ wahl: string; art: RueckrufArt; grund: string } | null>(null);
  const [aktivId, setAktivId] = useState<string | null>(null);

  const auswahl = [
    ...lose.map((l) => ({ wert: `charge_los:${l.id}`, text: `${l.charge_nr}${l.bezeichnung ? ` · ${l.bezeichnung}` : ''} (Chargen & Prüfplan)` })),
    ...lmChargen.map((l) => ({ wert: `lm_chargen:${l.id}`, text: `${l.charge_nr || 'ohne Nr.'} · ${l.bezeichnung} (Lebensmittel)` })),
  ];

  async function starten() {
    if (!start || !start.wahl) { onFehler('Bitte eine Charge wählen.'); return; }
    if (!start.grund.trim()) { onFehler('Bitte den Grund angeben.'); return; }
    const [quelle, id] = start.wahl.split(':') as ['charge_los' | 'lm_chargen', string];
    const los = quelle === 'charge_los' ? lose.find((l) => l.id === id) : null;
    const lm = quelle === 'lm_chargen' ? lmChargen.find((l) => l.id === id) : null;
    const produkt = los ? (los.bezeichnung || los.charge_nr) : lm?.bezeichnung ?? '';
    // Mehrere Lieferungen an denselben Abnehmer zu EINER Zeile zusammenfassen (Rücklauf wird je Abnehmer erfasst)
    const jeRef = new Map<string, number | null>();
    for (const a of los ? abnehmerListe(betroffeneChargen(id, lose, verwendungen), verwendungen) : []) {
      const bisher = jeRef.get(a.referenz);
      jeRef.set(a.referenz, bisher === undefined ? a.menge : bisher == null || a.menge == null ? null : Math.round((bisher + a.menge) * 1000) / 1000);
    }
    const abnehmer = [...jeRef.entries()].map(([referenz, menge]) => ({ referenz, menge }));
    const { data, error } = await supabase.from('qs_rueckruf').insert({
      art: start.art, quelle, charge_id: id, charge_nr: los?.charge_nr ?? lm?.charge_nr ?? null, produkt, grund: start.grund.trim(),
      gestartet_am: heute, schritte: {}, abnehmer, zurueck: {},
    }).select('id').maybeSingle();
    if (error) { onFehler('Rückruf konnte nicht angelegt werden.'); return; }
    setStart(null); onOk('Rückruf angelegt — arbeiten Sie die Checkliste von oben nach unten ab.');
    await neuLaden();
    if (data) setAktivId((data as { id: string }).id);
  }

  return (
    <>
      <div style={{ ...karte, borderColor: C.danger }}>
        <b style={{ color: C.danger }}>Im Ernstfall zählt jede Stunde.</b>
        <span style={{ color: C.textDim }}> Charge wählen — ARGONAUT sucht alle Folgechargen, in die sie eingegangen ist, und alle Abnehmer.</span>
        {istChef && !start && <div style={{ marginTop: 10 }}><button style={{ ...primaer, background: C.danger, color: '#fff' }} onClick={() => setStart({ wahl: '', art: 'lebensmittel', grund: '' })}>🚨 Rückruf starten</button></div>}
        {start && (
          <div style={{ marginTop: 10 }}>
            <label style={lab}>Charge
              <select style={feld} value={start.wahl} onChange={(e) => setStart({ ...start, wahl: e.target.value, art: e.target.value.startsWith('lm_') ? 'lebensmittel' : start.art })}>
                <option value="">— wählen —</option>
                {auswahl.map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}
              </select>
            </label>
            {start.wahl.startsWith('charge_los:') && (() => {
              const id = start.wahl.split(':')[1];
              const betr = betroffeneChargen(id, lose, verwendungen);
              const ab = abnehmerListe(betr, verwendungen);
              return (
                <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 6 }}>
                  Betroffen: {betr.map((l) => l.charge_nr).join(', ')} · {ab.length} Auslieferung{ab.length === 1 ? '' : 'en'}
                </div>
              );
            })()}
            <label style={lab}>Art
              <select style={feld} value={start.art} onChange={(e) => setStart({ ...start, art: e.target.value as RueckrufArt })}>
                <option value="lebensmittel">Lebensmittel / Futtermittel</option>
                <option value="produkt">Sonstiges Produkt</option>
              </select>
            </label>
            <label style={lab}>Grund<input style={feld} value={start.grund} onChange={(e) => setStart({ ...start, grund: e.target.value })} placeholder="z. B. Fremdkörper (Glas), Listerien-Befund, Überhitzungsgefahr" /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={primaer} onClick={() => void starten()}>Rückruf anlegen</button>
              <button style={knopf} onClick={() => setStart(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>

      {rueckrufe.length === 0 && <div style={{ ...karte, color: C.textDim }}>Kein Rückruf angelegt.</div>}
      {rueckrufe.map((rr) => (
        <RueckrufKarte key={rr.id} rr={rr} offen={aktivId === rr.id} onToggle={() => setAktivId(aktivId === rr.id ? null : rr.id)}
          lose={lose} verwendungen={verwendungen} lmChargen={lmChargen} heute={heute} istChef={istChef} onFehler={onFehler} onOk={onOk} neuLaden={neuLaden} />
      ))}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>{HINWEIS_RUECKRUF}</p>
    </>
  );
}

function RueckrufKarte({ rr, offen, onToggle, lose, verwendungen, lmChargen, heute, istChef, onFehler, onOk, neuLaden }: {
  rr: Rueckruf; offen: boolean; onToggle: () => void; lose: Los[]; verwendungen: Verwendung[]; lmChargen: LmCharge[]; heute: string; istChef: boolean;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [schritte, setSchritte] = useState<Record<string, string>>(rr.schritte);
  const [abnehmer, setAbnehmer] = useState(rr.abnehmer);
  const [zurueck, setZurueck] = useState<Record<string, string>>(Object.fromEntries(Object.entries(rr.zurueck).map(([k, v]) => [k, String(v).replace('.', ',')])));
  const [neuRef, setNeuRef] = useState({ referenz: '', menge: '' });
  const [text, setText] = useState('');
  useEffect(() => { setSchritte(rr.schritte); setAbnehmer(rr.abnehmer); }, [rr]);

  const betroffen = rr.quelle === 'charge_los' ? betroffeneChargen(rr.charge_id, lose, verwendungen) : [];
  const lm = rr.quelle === 'lm_chargen' ? lmChargen.find((l) => l.id === rr.charge_id) : null;
  const hergestellt = rr.quelle === 'charge_los' ? lose.find((l) => l.id === rr.charge_id)?.menge ?? null : lm?.menge ?? null;
  const abnehmerAlsListe: Abnehmer[] = abnehmer.map((a) => ({ los_id: rr.charge_id, charge_nr: rr.charge_nr ?? '', referenz: a.referenz, menge: a.menge, datum: null }));
  const zurueckZahlen: Record<string, number | null> = Object.fromEntries(Object.entries(zurueck).map(([k, v]) => [k, zahlAus(v)]));
  const bilanz = mengenBilanz(rr.quelle === 'charge_los' && betroffen.length > 1 ? null : hergestellt, abnehmerAlsListe, zurueckZahlen);
  const schrittListe = RUECKRUF_SCHRITTE[rr.art];
  const erledigt = schrittListe.filter((s) => schritte[s.key]).length;
  const chargenNr = rr.quelle === 'charge_los' ? betroffen.map((l) => l.charge_nr) : [rr.charge_nr ?? ''];
  const platzhalter = offenePlatzhalter(text);

  async function speichern(abschliessen = false) {
    if (abschliessen && (erledigt < schrittListe.length || !bilanz.vollstaendig)) {
      onFehler('Abschluss erst, wenn alle Schritte erledigt sind, jede Liefermenge bekannt ist und keine Ware mehr draußen ist.'); return;
    }
    const z: Record<string, number> = {};
    for (const [k, v] of Object.entries(zurueck)) { const n = zahlAus(v); if (v.trim() && n === null) { onFehler(`Menge bei „${k}" ist nicht lesbar.`); return; } if (n !== null) z[k] = n; }
    const { error } = await supabase.from('qs_rueckruf').update({ schritte, abnehmer, zurueck: z, abgeschlossen_am: abschliessen ? heute : rr.abgeschlossen_am }).eq('id', rr.id);
    if (error) { onFehler('Speichern fehlgeschlagen.'); return; }
    onOk(abschliessen ? 'Rückruf abgeschlossen.' : 'Gespeichert.'); await neuLaden();
  }

  async function sperren() {
    const n = rr.quelle === 'charge_los' ? betroffen.length : 1;
    if (!window.confirm(`${n} Charge${n === 1 ? '' : 'n'} auf „gesperrt" setzen?`)) return;
    const r = rr.quelle === 'charge_los'
      ? await supabase.from('charge_los').update({ status: 'gesperrt' }).in('id', betroffen.map((l) => l.id))
      : await supabase.from('lm_chargen').update({ status: 'gesperrt' }).eq('id', rr.charge_id);
    if (r.error) { onFehler('Sperren fehlgeschlagen.'); return; }
    setSchritte({ ...schritte, sperren: heute });
    onOk('Gesperrt — bitte Speichern nicht vergessen.'); await neuLaden();
  }

  const fertig = !!rr.abgeschlossen_am;
  return (
    <div style={{ ...karte, borderLeft: `4px solid ${fertig ? C.green : C.danger}` }}>
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <b>{rr.produkt}</b> <span style={{ color: C.textDim }}>· Charge {chargenNr.filter(Boolean).join(', ') || '—'}</span>
          <div style={{ color: C.textDim, fontSize: 13.5 }}>{rr.grund} · gestartet {datumDe(rr.gestartet_am)}</div>
        </div>
        <div style={{ color: fertig ? C.green : C.warn, fontWeight: 700, fontSize: 13.5 }}>
          {fertig ? `✓ abgeschlossen ${datumDe(rr.abgeschlossen_am)}` : `${erledigt}/${schrittListe.length} Schritte · ${bilanz.vollstaendig ? 'nichts mehr draußen' : bilanz.ohneMenge > 0 ? 'Mengen unvollständig' : `${String(bilanz.draussen).replace('.', ',')} noch draußen`}`} {offen ? '▲' : '▼'}
        </div>
      </div>

      {offen && (
        <div style={{ marginTop: 12 }}>
          <b>Checkliste</b>
          {schrittListe.map((s) => (
            <div key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
              <input type="checkbox" disabled={fertig || !istChef} checked={!!schritte[s.key]} onChange={(e) => setSchritte({ ...schritte, [s.key]: e.target.checked ? heute : '' })} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                {s.text}{s.grundlage && <span style={{ color: C.textDim, fontSize: 12.5 }}> · {s.grundlage}</span>}
                {schritte[s.key] && <span style={{ color: C.green, fontSize: 12.5 }}> · erledigt {datumDe(schritte[s.key])}</span>}
                {s.key === 'sperren' && istChef && !fertig && <button style={{ ...knopf, marginLeft: 8, padding: '3px 8px' }} onClick={() => void sperren()}>⛔ Jetzt sperren</button>}
              </div>
            </div>
          ))}

          {rr.quelle === 'charge_los' && betroffen.length > 1 && (
            <div style={{ color: C.warn, fontSize: 13.5, margin: '8px 0' }}>Eingegangen in: {betroffen.slice(1).map((l) => l.charge_nr).join(', ')} — diese Chargen gehören zum Rückruf.</div>
          )}

          <b style={{ display: 'block', marginTop: 12 }}>Abnehmer und Rücklauf</b>
          {abnehmer.length === 0 && <div style={{ color: C.textDim, fontSize: 13.5 }}>Keine Auslieferungen hinterlegt{lm?.verwendung ? ` — Notiz an der Charge: „${lm.verwendung}"` : ''}. Bitte Abnehmer von Hand ergänzen.</div>}
          {abnehmer.map((a) => (
            <div key={a.referenz} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', fontSize: 14, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 160 }}>{a.referenz}{a.menge != null ? <span style={{ color: C.textDim }}> · geliefert {String(a.menge).replace('.', ',')}</span> : null}</span>
              <label style={{ color: C.textDim }}>zurück <input style={{ ...feld, width: 90, display: 'inline-block', padding: '4px 6px' }} disabled={fertig} value={zurueck[a.referenz] ?? ''} inputMode="decimal" onChange={(e) => setZurueck({ ...zurueck, [a.referenz]: e.target.value })} /></label>
            </div>
          ))}
          {!fertig && istChef && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <input style={{ ...feld, width: 220 }} placeholder="Abnehmer / Lieferschein" value={neuRef.referenz} onChange={(e) => setNeuRef({ ...neuRef, referenz: e.target.value })} />
              <input style={{ ...feld, width: 110 }} placeholder="Menge" inputMode="decimal" value={neuRef.menge} onChange={(e) => setNeuRef({ ...neuRef, menge: e.target.value })} />
              <button style={knopf} onClick={() => {
                const ref = neuRef.referenz.trim();
                if (!ref || abnehmer.some((a) => a.referenz === ref)) return;
                setAbnehmer([...abnehmer, { referenz: ref, menge: zahlAus(neuRef.menge) }]); setNeuRef({ referenz: '', menge: '' });
              }}>＋ Abnehmer</button>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 14 }}>
            Bilanz: {bilanz.hergestellt != null ? <>hergestellt {String(bilanz.hergestellt).replace('.', ',')} · im Haus {String(bilanz.imHaus).replace('.', ',')} · </> : null}
            ausgeliefert {String(bilanz.ausgeliefert).replace('.', ',')} · zurück {String(bilanz.zurueck).replace('.', ',')} · <b style={{ color: bilanz.draussen > 0 ? C.danger : C.green }}>noch draußen {String(bilanz.draussen).replace('.', ',')}</b>
            {bilanz.draussen < 0 && <span style={{ color: C.warn }}> — mehr zurück als ausgeliefert, bitte Mengen prüfen</span>}
            {bilanz.ohneMenge > 0 && <span style={{ color: C.danger }}> — bei {bilanz.ohneMenge} Abnehmer{bilanz.ohneMenge === 1 ? '' : 'n'} fehlt die gelieferte Menge</span>}
          </div>

          <b style={{ display: 'block', marginTop: 12 }}>Text an die Abnehmer</b>
          {!text
            ? <button style={{ ...knopf, marginTop: 6 }} onClick={() => setText(abnehmerText(rr.art, rr.produkt, chargenNr, rr.grund ?? ''))}>Entwurf erzeugen</button>
            : <>
                <textarea style={{ ...feld, minHeight: 200, marginTop: 6 }} value={text} onChange={(e) => setText(e.target.value)} />
                {platzhalter.length > 0
                  ? <div style={{ color: C.warn, fontSize: 13 }}>Noch ersetzen: {platzhalter.join(', ')}</div>
                  : <button style={{ ...knopf, marginTop: 6 }} onClick={() => { void navigator.clipboard.writeText(text); onOk('Text kopiert.'); }}>📋 Kopieren</button>}
              </>}

          {!fertig && istChef && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={primaer} onClick={() => void speichern(false)}>💾 Speichern</button>
              <button style={{ ...knopf, color: C.green }} onClick={() => void speichern(true)}>✓ Rückruf abschließen</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: farbe }}>{wert}</div>
      <div style={{ color: C.textDim, fontSize: 12.5 }}>{label}</div>
    </div>
  );
}
