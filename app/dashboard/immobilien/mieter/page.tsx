'use client';

// ============================================================
// ARGONAUT OS · Paket PS4 · Mieter-Vorgänge (Immobilien)
//   Schadensmeldungen   erfassen, Dringlichkeit, Handwerker, Termin, erledigt
//   Mietanpassung       Vergleichsmiete (§ 558) oder Indexmiete (§ 557b) prüfen,
//                       Fristen, Erklärung als Text, nach Wirksamwerden in den
//                       Mietvertrag übernehmen
//   Kautionen           Höchstbetrag (§ 551), drei Raten, Eingänge, Anlage,
//                       Abrechnung bei Auszug
// Logik: lib/versammlungObjekte.ts (getestet). SQL: supabase-sql/ps4-versammlungen-objekte.sql.
// Unterpfad von /dashboard/immobilien (erbt dessen Freigabe). Mietanpassung und
// Kaution sind per RLS nur für den Chef.
// Pfad: app/dashboard/immobilien/mieter/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  SCHADEN_KATEGORIEN, DRINGLICHKEIT, SCHADEN_STATUS, MINDERUNG_HINWEIS, KAUTION_HINWEIS,
  vorschlagDringlichkeit, schadenStand, pruefeMieterhoehung, pruefeIndexmiete, indexErklaerung,
  pruefeKaution, kautionsRaten, kautionsStand, kautionsAbrechnung, offenePlatzhalter, heuteBerlin, datumDe, euroText,
  type SchadenKategorie, type Dringlichkeit, type SchadenStatus, type KautionEingang,
} from '@/lib/versammlungObjekte';
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

type Einheit = { id: string; objekt: string | null; bezeichnung: string; flaeche_qm: number | null };
type Vertrag = { id: string; einheit_id: string | null; mieter_name: string | null; mieter_email: string | null; beginn: string | null; kaltmiete: number; kaution: number; status: string };
type Schaden = { id: string; vertrag_id: string | null; einheit_id: string | null; kategorie: SchadenKategorie; dringlichkeit: Dringlichkeit; status: SchadenStatus; beschreibung: string; gemeldet_am: string; gemeldet_von: string | null; handwerker: string | null; termin: string | null; kosten: number | null; erledigt_am: string | null };
type Anpassung = { id: string; vertrag_id: string; art: 'vergleich' | 'index'; miete_alt: number; miete_neu: number; zugang_am: string; wirksam_ab: string; index_alt: number | null; index_neu: number | null; status: string; uebernommen: boolean; erstellt_am: string };
type Kaution = { id: string; vertrag_id: string; soll: number; eingaenge: KautionEingang[]; anlage: string | null; zinsen: number | null; einbehalte: { grund: string; betrag: number }[]; rueckgabe_am: string | null; ausgezahlt: number | null };

function zahlAus(s: string): number | null { return leseZahl(s); }

export default function MieterSeite() {
  const heute = heuteBerlin();
  const [tab, setTab] = useState<'schaden' | 'miete' | 'kaution'>('schaden');
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [schaeden, setSchaeden] = useState<Schaden[]>([]);
  const [anpassungen, setAnpassungen] = useState<Anpassung[]>([]);
  const [kautionen, setKautionen] = useState<Kaution[]>([]);
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [firma, setFirma] = useState('');

  const laden = useCallback(async () => {
    setFehler(null);
    const s = await supabase.from('immo_schaden').select('*').order('gemeldet_am', { ascending: false });
    if (s.error) { if (/immo_schaden/.test(s.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + s.error.message); return; }
    setSchaeden((s.data as Schaden[]) ?? []);
    const [e, v, a, k] = await Promise.all([
      supabase.from('immo_einheiten').select('id, objekt, bezeichnung, flaeche_qm').order('objekt', { ascending: true }),
      supabase.from('immo_mietvertraege').select('id, einheit_id, mieter_name, mieter_email, beginn, kaltmiete, kaution, status').order('mieter_name', { ascending: true }),
      supabase.from('immo_mietanpassung').select('*').order('erstellt_am', { ascending: false }),
      supabase.from('immo_kaution').select('*'),
    ]);
    setEinheiten((e.data as Einheit[]) ?? []);
    setVertraege((v.data as Vertrag[]) ?? []);
    setAnpassungen((a.data as Anpassung[]) ?? []);
    setKautionen(((k.data as Kaution[]) ?? []).map((x) => ({ ...x, eingaenge: x.eingaenge ?? [], einbehalte: x.einbehalte ?? [] })));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === id);
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  const einheitText = (id: string | null) => { const e = einheiten.find((x) => x.id === id); return e ? [e.objekt, e.bezeichnung].filter(Boolean).join(' · ') : ''; };
  const vertragText = (v: Vertrag) => `${v.mieter_name || 'ohne Name'}${v.einheit_id ? ` · ${einheitText(v.einheit_id)}` : ''}`;
  const offeneSchaeden = schaeden.filter((s) => s.status !== 'erledigt' && s.status !== 'abgelehnt').length;

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Immobilien</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🔑 Mieter-Vorgänge</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Schäden schnell erledigen, Miete rechtssicher anpassen, Kautionen sauber führen. <a href="/dashboard/immobilien" style={{ color: C.cyan }}>← Zur Immobilienverwaltung</a></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['schaden', `🛠 Schadensmeldungen${offeneSchaeden ? ` · ${offeneSchaeden}` : ''}`], ['miete', '📈 Mietanpassung'], ['kaution', '🏦 Kautionen']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); setFehler(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Tabellen für Mieter-Vorgänge sind noch nicht eingerichtet (SQL von Paket PS4 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'schaden' && <SchadenTab schaeden={schaeden} vertraege={vertraege} einheitText={einheitText} vertragText={vertragText} heute={heute} onFehler={setFehler} onOk={setOk} laden={laden} />}
      {!sqlFehlt && tab === 'miete' && (istChef
        ? <MieteTab vertraege={vertraege} einheiten={einheiten} anpassungen={anpassungen} vertragText={vertragText} einheitText={einheitText} heute={heute} firma={firma} onFehler={setFehler} onOk={setOk} laden={laden} />
        : <div style={karte}>Mietanpassungen bearbeitet der Chef.</div>)}
      {!sqlFehlt && tab === 'kaution' && (istChef
        ? <KautionTab vertraege={vertraege} kautionen={kautionen} vertragText={vertragText} heute={heute} onFehler={setFehler} onOk={setOk} laden={laden} />
        : <div style={karte}>Kautionen verwaltet der Chef.</div>)}
    </div>
  );
}

function SchadenTab({ schaeden, vertraege, einheitText, vertragText, heute, onFehler, onOk, laden }: {
  schaeden: Schaden[]; vertraege: Vertrag[]; einheitText: (id: string | null) => string; vertragText: (v: Vertrag) => string; heute: string;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; laden: () => Promise<void>;
}) {
  const [n, setN] = useState({ vertrag_id: '', kategorie: 'wasser' as SchadenKategorie, dringlichkeit: vorschlagDringlichkeit('wasser', Number(heute.slice(5, 7))), beschreibung: '', gemeldet_von: '' });
  const [nurOffen, setNurOffen] = useState(true);
  const jetzt = new Date().toISOString();

  async function anlegen() {
    if (!n.beschreibung.trim()) { onFehler('Bitte kurz beschreiben, was kaputt ist.'); return; }
    const v = vertraege.find((x) => x.id === n.vertrag_id);
    const { error } = await supabase.from('immo_schaden').insert({
      vertrag_id: v?.id ?? null, einheit_id: v?.einheit_id ?? null, kategorie: n.kategorie, dringlichkeit: n.dringlichkeit, status: 'gemeldet',
      beschreibung: n.beschreibung.trim(), gemeldet_am: jetzt, gemeldet_von: n.gemeldet_von.trim() || v?.mieter_name || null,
    });
    if (error) { onFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    onOk('Schaden erfasst.'); setN({ ...n, beschreibung: '', gemeldet_von: '' }); await laden();
  }
  async function aendern(s: Schaden, werte: Record<string, unknown>, meldung: string) {
    const { error } = await supabase.from('immo_schaden').update({ ...werte, aktualisiert_am: new Date().toISOString() }).eq('id', s.id);
    if (error) onFehler('Speichern fehlgeschlagen: ' + error.message); else { onOk(meldung); await laden(); }
  }
  const sichtbar = schaeden.filter((s) => !nurOffen || (s.status !== 'erledigt' && s.status !== 'abgelehnt'));

  return (
    <>
      <div style={karte}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Schaden aufnehmen</h2>
        <div style={raster}>
          <div><label style={lab}>Mieter / Wohnung</label><select style={feld} value={n.vertrag_id} onChange={(e) => setN({ ...n, vertrag_id: e.target.value })}><option value="">— Gemeinschaftsfläche / ohne Vertrag —</option>{vertraege.filter((v) => v.status !== 'beendet').map((v) => <option key={v.id} value={v.id}>{vertragText(v)}</option>)}</select></div>
          <div><label style={lab}>Art</label><select style={feld} value={n.kategorie} onChange={(e) => { const k = e.target.value as SchadenKategorie; setN({ ...n, kategorie: k, dringlichkeit: vorschlagDringlichkeit(k, Number(heute.slice(5, 7))) }); }}>{SCHADEN_KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></div>
          <div><label style={lab}>Dringlichkeit</label><select style={feld} value={n.dringlichkeit} onChange={(e) => setN({ ...n, dringlichkeit: e.target.value as Dringlichkeit })}>{DRINGLICHKEIT.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></div>
          <div><label style={lab}>Gemeldet von</label><input style={feld} value={n.gemeldet_von} onChange={(e) => setN({ ...n, gemeldet_von: e.target.value })} /></div>
        </div>
        <label style={lab}>Was ist passiert?</label>
        <textarea style={{ ...feld, minHeight: 60 }} value={n.beschreibung} onChange={(e) => setN({ ...n, beschreibung: e.target.value })} />
        {n.kategorie === 'gas' && <div style={{ color: C.danger, marginTop: 6 }}>Gasgeruch: Mieter sofort anweisen, Fenster zu öffnen, keine Schalter zu betätigen, das Haus zu verlassen und den Notdienst des Gasversorgers zu rufen.</div>}
        <button style={{ ...primaer, marginTop: 10 }} onClick={anlegen}>＋ Schaden erfassen</button>
      </div>
      <label style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> Nur offene</label>
      {sichtbar.length === 0 && <div style={karte}>Keine {nurOffen ? 'offenen ' : ''}Schadensmeldungen.</div>}
      {sichtbar.map((s) => {
        const st = schadenStand(s, jetzt);
        return (
          <div key={s.id} style={{ ...karte, borderLeft: `4px solid ${FARBE[st.stufe]}` }}>
            <b>{SCHADEN_KATEGORIEN.find((k) => k.key === s.kategorie)?.label}</b> · {DRINGLICHKEIT.find((d) => d.key === s.dringlichkeit)?.label} · {einheitText(s.einheit_id) || 'Gemeinschaft'}{s.gemeldet_von ? ` · ${s.gemeldet_von}` : ''}
            <div style={{ color: C.textDim, fontSize: 13 }}>gemeldet {datumDe(s.gemeldet_am.slice(0, 10))}</div>
            <div style={{ margin: '6px 0' }}>{s.beschreibung}</div>
            <div style={{ color: FARBE[st.stufe], fontSize: 13.5 }}>{st.text}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <input style={{ ...feld, width: 200 }} placeholder="Handwerker" defaultValue={s.handwerker ?? ''} onBlur={(e) => e.target.value !== (s.handwerker ?? '') && aendern(s, { handwerker: e.target.value.trim() || null, status: s.status === 'gemeldet' && e.target.value.trim() ? 'beauftragt' : s.status }, 'Handwerker eingetragen.')} />
              <input type="date" style={{ ...feld, width: 160 }} defaultValue={s.termin ?? ''} onChange={(e) => aendern(s, { termin: e.target.value || null, status: e.target.value ? 'termin' : s.status }, 'Termin eingetragen.')} />
              <input style={{ ...feld, width: 120 }} placeholder="Kosten €" defaultValue={s.kosten ?? ''} onBlur={(e) => aendern(s, { kosten: zahlAus(e.target.value) }, 'Kosten gespeichert.')} />
              {SCHADEN_STATUS.filter((x) => x !== s.status).map((x) => <button key={x} style={knopf} onClick={() => aendern(s, { status: x, erledigt_am: x === 'erledigt' ? heute : null }, `Status: ${x}`)}>{x}</button>)}
            </div>
          </div>
        );
      })}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>{MINDERUNG_HINWEIS} Reaktionsziele (Notfall 24 Std., dringend 3 Tage, normal 14 Tage) sind Richtwerte.</p>
    </>
  );
}

function MieteTab({ vertraege, einheiten, anpassungen, vertragText, einheitText, heute, firma, onFehler, onOk, laden }: {
  vertraege: Vertrag[]; einheiten: Einheit[]; anpassungen: Anpassung[]; vertragText: (v: Vertrag) => string; einheitText: (id: string | null) => string; heute: string; firma: string;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; laden: () => Promise<void>;
}) {
  const [vid, setVid] = useState('');
  const [art, setArt] = useState<'vergleich' | 'index'>('vergleich');
  const [f, setF] = useState({ neu: '', vor3: '', vergleich: '', kappung: '20', letzte: '', zugang: heute, indexAlt: '', indexNeu: '', stichtagAlt: '', stichtagNeu: '' });
  const [text, setText] = useState('');
  const v = vertraege.find((x) => x.id === vid) ?? null;
  const flaeche = einheiten.find((e) => e.id === v?.einheit_id)?.flaeche_qm ?? null;
  const letzteGespeichert = anpassungen.filter((a) => a.vertrag_id === vid && a.uebernommen).map((a) => a.wirksam_ab).sort().pop() ?? null;
  const letzte = f.letzte || letzteGespeichert || null;
  const r558 = v ? pruefeMieterhoehung({ mieteAktuell: v.kaltmiete, mieteNeu: f.neu, mieteVor3Jahren: f.vor3 || v.kaltmiete, vergleichsmiete: f.vergleich, flaeche, kappung: f.kappung === '15' ? 15 : 20, letzteAenderungWirksam: letzte, mietbeginn: v.beginn, zugang: f.zugang }) : null;
  const rIdx = v ? pruefeIndexmiete({ mieteAktuell: v.kaltmiete, indexAlt: f.indexAlt, indexNeu: f.indexNeu, letzteAnpassungWirksam: letzte, mietbeginn: v.beginn, zugang: f.zugang }) : null;
  const r = art === 'vergleich' ? r558 : rIdx;

  async function speichern() {
    if (!v || !r || !r.ok || !r.wirksamAb) { onFehler('Bitte erst die Prüfung fehlerfrei bekommen.'); return; }
    const neu = art === 'vergleich' ? zahlAus(f.neu) : (rIdx?.neueMiete ?? null);
    if (neu == null) return;
    const { error } = await supabase.from('immo_mietanpassung').insert({
      vertrag_id: v.id, art, miete_alt: v.kaltmiete, miete_neu: neu, zugang_am: f.zugang, wirksam_ab: r.wirksamAb,
      index_alt: art === 'index' ? zahlAus(f.indexAlt) : null, index_neu: art === 'index' ? zahlAus(f.indexNeu) : null, status: 'verschickt',
    });
    if (error) { onFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    onOk('Mietanpassung gespeichert. Nach Wirksamwerden in den Vertrag übernehmen.'); await laden();
  }
  async function uebernehmen(a: Anpassung) {
    if (a.wirksam_ab > heute) { onFehler(`Die neue Miete gilt erst ab ${datumDe(a.wirksam_ab)}.`); return; }
    if (a.art === 'vergleich' && a.status !== 'zugestimmt') { onFehler('Bei der Vergleichsmiete braucht es zuerst die Zustimmung des Mieters (Status „zugestimmt").'); return; }
    if (!window.confirm(`Nettokaltmiete im Mietvertrag von ${euroText(a.miete_alt)} auf ${euroText(a.miete_neu)} ändern?`)) return;
    const { error } = await supabase.from('immo_mietvertraege').update({ kaltmiete: a.miete_neu }).eq('id', a.vertrag_id);
    if (error) { onFehler('Vertrag konnte nicht geändert werden: ' + error.message); return; }
    await supabase.from('immo_mietanpassung').update({ uebernommen: true, status: 'wirksam' }).eq('id', a.id);
    onOk('Neue Miete im Mietvertrag eingetragen.'); await laden();
  }
  async function status(a: Anpassung, s: string) {
    const { error } = await supabase.from('immo_mietanpassung').update({ status: s }).eq('id', a.id);
    if (error) onFehler('Speichern fehlgeschlagen: ' + error.message); else await laden();
  }

  function erklaerung() {
    if (!v || !r || !r.wirksamAb) return;
    if (art === 'index' && rIdx?.neueMiete != null) {
      setText(indexErklaerung({ mieter: v.mieter_name, objekt: einheitText(v.einheit_id), mieteAlt: v.kaltmiete, mieteNeu: rIdx.neueMiete, indexAlt: zahlAus(f.indexAlt) ?? 0, indexNeu: zahlAus(f.indexNeu) ?? 0, stichtagAlt: f.stichtagAlt, stichtagNeu: f.stichtagNeu, wirksamAb: r.wirksamAb, vermieter: firma }));
    } else if (art === 'vergleich' && r558) {
      setText(`Mieterhöhungsverlangen nach § 558 BGB\n\nSehr geehrte/r ${v.mieter_name || '[Name]'},\n\nfür die Wohnung ${einheitText(v.einheit_id) || '[Adresse / Lage]'} bitten wir Sie um Zustimmung zur Erhöhung der Nettokaltmiete von ${euroText(v.kaltmiete)} auf ${euroText(zahlAus(f.neu))} ab dem ${datumDe(r558.wirksamAb)}.\n\nBegründung: [Mietspiegel mit Einordnung / Gutachten / drei Vergleichswohnungen]\n\nBitte erklären Sie Ihre Zustimmung bis zum ${datumDe(r558.zustimmungBis)}. Die Betriebskostenvorauszahlung bleibt unverändert.\n\nMit freundlichen Grüßen\n${firma || '[Vermieter]'}`);
    }
  }
  const platz = offenePlatzhalter(text);

  return (
    <>
      <div style={karte}>
        <div style={raster}>
          <div><label style={lab}>Mietvertrag</label><select style={feld} value={vid} onChange={(e) => setVid(e.target.value)}><option value="">— wählen —</option>{vertraege.filter((x) => x.status !== 'beendet').map((x) => <option key={x.id} value={x.id}>{vertragText(x)} · {euroText(x.kaltmiete)}</option>)}</select></div>
          <div><label style={lab}>Art</label><select style={feld} value={art} onChange={(e) => setArt(e.target.value as 'vergleich' | 'index')}><option value="vergleich">Vergleichsmiete (§ 558)</option><option value="index">Indexmiete (§ 557b)</option></select></div>
          <div><label style={lab}>Zugang beim Mieter am</label><input type="date" style={feld} value={f.zugang} onChange={(e) => setF({ ...f, zugang: e.target.value })} /></div>
          <div><label style={lab}>Letzte Mietänderung wirksam ab</label><input type="date" style={feld} value={f.letzte || letzteGespeichert || ''} onChange={(e) => setF({ ...f, letzte: e.target.value })} /></div>
          {art === 'vergleich' ? (
            <>
              <div><label style={lab}>Neue Nettokaltmiete (€)</label><input style={feld} value={f.neu} onChange={(e) => setF({ ...f, neu: e.target.value })} /></div>
              <div><label style={lab}>Miete vor 3 Jahren (€)</label><input style={feld} placeholder="leer = aktuelle" value={f.vor3} onChange={(e) => setF({ ...f, vor3: e.target.value })} /></div>
              <div><label style={lab}>Vergleichsmiete (€/m² oder € gesamt)</label><input style={feld} value={f.vergleich} onChange={(e) => setF({ ...f, vergleich: e.target.value })} /></div>
              <div><label style={lab}>Kappungsgrenze</label><select style={feld} value={f.kappung} onChange={(e) => setF({ ...f, kappung: e.target.value })}><option value="20">20 % (Regelfall)</option><option value="15">15 % (Gebiet mit Verordnung)</option></select></div>
            </>
          ) : (
            <>
              <div><label style={lab}>Index alt</label><input style={feld} placeholder="z. B. 117,4" value={f.indexAlt} onChange={(e) => setF({ ...f, indexAlt: e.target.value })} /></div>
              <div><label style={lab}>Stand alt (Monat/Jahr)</label><input style={feld} value={f.stichtagAlt} onChange={(e) => setF({ ...f, stichtagAlt: e.target.value })} /></div>
              <div><label style={lab}>Index neu</label><input style={feld} value={f.indexNeu} onChange={(e) => setF({ ...f, indexNeu: e.target.value })} /></div>
              <div><label style={lab}>Stand neu (Monat/Jahr)</label><input style={feld} value={f.stichtagNeu} onChange={(e) => setF({ ...f, stichtagNeu: e.target.value })} /></div>
            </>
          )}
        </div>
        {art === 'index' && <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Verbraucherpreisindex für Deutschland (Basis 2020 = 100) beim Statistischen Bundesamt (Destatis) nachschlagen und hier eintragen.</div>}
        {v && r && (
          <div style={{ ...karte, background: C.navy, marginTop: 10 }}>
            {art === 'vergleich' && r558 && <div>Zulässig höchstens: <b>{euroText(r558.maxMiete)}</b>{r558.prozent != null ? ` · Erhöhung ${r558.prozent.toLocaleString('de-DE')} %` : ''}{r558.zustimmungBis ? ` · Zustimmung bis ${datumDe(r558.zustimmungBis)}` : ''}</div>}
            {art === 'index' && rIdx && <div>Neue Miete: <b>{euroText(rIdx.neueMiete)}</b>{rIdx.differenz != null ? ` (${rIdx.differenz >= 0 ? '+' : ''}${euroText(rIdx.differenz)}, Index ${rIdx.prozent?.toLocaleString('de-DE')} %)` : ''}</div>}
            {r.wirksamAb && <div>Gilt ab: <b>{datumDe(r.wirksamAb)}</b></div>}
            {r.fehler.map((x) => <div key={x} style={{ color: C.danger, marginTop: 4 }}>✗ {x}</div>)}
            {r.hinweise.map((x) => <div key={x} style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>ℹ {x}</div>)}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={knopf} onClick={erklaerung} disabled={!r.ok}>✉ Schreiben erstellen</button>
              <button style={primaer} onClick={speichern} disabled={!r.ok}>Als verschickt speichern</button>
            </div>
          </div>
        )}
        {text && (
          <div style={{ marginTop: 10 }}>
            <textarea style={{ ...feld, minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} />
            {platz.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>Noch ausfüllen: {platz.join(', ')}</div>}
            <button style={{ ...knopf, marginTop: 6 }} disabled={platz.length > 0} onClick={() => { navigator.clipboard?.writeText(text); onOk('Text kopiert — in Textform verschicken (Brief oder E-Mail).'); }}>📋 Kopieren</button>
          </div>
        )}
      </div>
      <div style={karte}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Gespeicherte Anpassungen</h3>
        {anpassungen.length === 0 && <div style={{ color: C.textDim }}>Noch keine.</div>}
        {anpassungen.map((a) => {
          const vv = vertraege.find((x) => x.id === a.vertrag_id);
          return (
            <div key={a.id} style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>{vv ? vertragText(vv) : '—'} · {a.art === 'index' ? 'Index' : 'Vergleichsmiete'} · {euroText(a.miete_alt)} → <b>{euroText(a.miete_neu)}</b> ab {datumDe(a.wirksam_ab)}<div style={{ color: C.textDim, fontSize: 13 }}>Status: {a.status}{a.uebernommen ? ' · im Vertrag' : ''}</div></div>
              {!a.uebernommen && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {a.art === 'vergleich' && a.status === 'verschickt' && <><button style={knopf} onClick={() => status(a, 'zugestimmt')}>Mieter stimmt zu</button><button style={knopf} onClick={() => status(a, 'abgelehnt')}>Abgelehnt</button></>}
                  {a.status !== 'abgelehnt' && <button style={knopf} onClick={() => uebernehmen(a)}>In Vertrag übernehmen</button>}
                </div>
              )}
            </div>
          );
        })}
        <p style={{ color: C.textDim, fontSize: 12.5 }}>Stimmt der Mieter bei § 558 nicht bis zum Fristende zu, kann innerhalb von drei weiteren Monaten auf Zustimmung geklagt werden. Keine Rechtsberatung.</p>
      </div>
    </>
  );
}

function KautionTab({ vertraege, kautionen, vertragText, heute, onFehler, onOk, laden }: {
  vertraege: Vertrag[]; kautionen: Kaution[]; vertragText: (v: Vertrag) => string; heute: string;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; laden: () => Promise<void>;
}) {
  const [offenId, setOffenId] = useState<string | null>(null);
  async function anlegen(v: Vertrag) {
    const { error } = await supabase.from('immo_kaution').insert({ vertrag_id: v.id, soll: Number(v.kaution) || 0 });
    if (error) onFehler('Speichern fehlgeschlagen: ' + error.message); else { onOk('Kautionskonto angelegt.'); await laden(); }
  }
  return (
    <>
      {vertraege.map((v) => {
        const k = kautionen.find((x) => x.vertrag_id === v.id);
        const pk = pruefeKaution({ kaltmiete: v.kaltmiete, kaution: k?.soll ?? v.kaution });
        const st = k ? kautionsStand(k.soll, k.eingaenge, v.beginn, heute) : null;
        return (
          <div key={v.id} style={{ ...karte, borderLeft: `4px solid ${pk.ok === false || (st && st.ueberfaellig > 0) ? C.danger : st && st.offen <= 0 ? C.green : C.warn}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOffenId(offenId === v.id ? null : v.id)}>
              <div><b>{vertragText(v)}</b> · Kaution {euroText(k?.soll ?? v.kaution)}<div style={{ fontSize: 13, color: pk.ok === false ? C.danger : C.textDim }}>{pk.text}{st ? ` · ${st.text}` : ' · noch kein Kautionskonto'}</div></div>
              <span style={{ color: C.textDim }}>{offenId === v.id ? '▲' : '▼'}</span>
            </div>
            {offenId === v.id && (k ? <KautionDetail v={v} k={k} heute={heute} onFehler={onFehler} onOk={onOk} laden={laden} /> : <button style={{ ...primaer, marginTop: 8 }} onClick={() => anlegen(v)}>Kautionskonto anlegen</button>)}
          </div>
        );
      })}
      {vertraege.length === 0 && <div style={karte}>Noch keine Mietverträge.</div>}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>{KAUTION_HINWEIS}</p>
    </>
  );
}

function KautionDetail({ v, k, heute, onFehler, onOk, laden }: { v: Vertrag; k: Kaution; heute: string; onFehler: (s: string | null) => void; onOk: (s: string | null) => void; laden: () => Promise<void> }) {
  const [e, setE] = useState({ am: heute, betrag: '' });
  const [anlage, setAnlage] = useState(k.anlage ?? '');
  const [zinsen, setZinsen] = useState(k.zinsen == null ? '' : String(k.zinsen).replace('.', ','));
  const [einbehalte, setEinbehalte] = useState(k.einbehalte);
  const raten = v.beginn ? kautionsRaten(k.soll, v.beginn) : [];
  const abr = kautionsAbrechnung({ kaution: k.eingaenge.reduce((a, z) => a + (Number(z.betrag) || 0), 0), zinsen, einbehalte });

  async function speichern(extra: Record<string, unknown>, meldung: string) {
    const { error } = await supabase.from('immo_kaution').update({ anlage: anlage.trim() || null, zinsen: zahlAus(zinsen), einbehalte, ...extra }).eq('id', k.id);
    if (error) onFehler('Speichern fehlgeschlagen: ' + error.message); else { onOk(meldung); await laden(); }
  }
  return (
    <div style={{ marginTop: 10 }}>
      {raten.length > 0 && <div style={{ color: C.textDim, fontSize: 13 }}>Ratenplan: {raten.map((r) => `${datumDe(r.faellig)} ${euroText(r.betrag)}`).join(' · ')}</div>}
      <div style={{ marginTop: 6 }}>{k.eingaenge.map((z, i) => <div key={i}>{datumDe(z.am)} · {euroText(Number(z.betrag))}</div>)}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <input type="date" style={{ ...feld, width: 160 }} value={e.am} onChange={(x) => setE({ ...e, am: x.target.value })} />
        <input style={{ ...feld, width: 120 }} placeholder="Betrag" value={e.betrag} onChange={(x) => setE({ ...e, betrag: x.target.value })} />
        <button style={knopf} onClick={() => { const b = zahlAus(e.betrag); if (!b) { onFehler('Betrag eintragen.'); return; } void speichern({ eingaenge: [...k.eingaenge, { am: e.am, betrag: b }] }, 'Eingang gebucht.'); setE({ am: heute, betrag: '' }); }}>＋ Eingang</button>
      </div>
      <label style={lab}>Angelegt auf (Kautionskonto / Sparbuch)</label>
      <input style={feld} value={anlage} onChange={(x) => setAnlage(x.target.value)} />
      <div style={{ ...karte, background: C.navy, marginTop: 10 }}>
        <b>Abrechnung bei Auszug</b>
        <div style={raster}>
          <div><label style={lab}>Zinsen (€)</label><input style={feld} value={zinsen} onChange={(x) => setZinsen(x.target.value)} /></div>
        </div>
        {einbehalte.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input style={feld} placeholder="Grund" value={b.grund} onChange={(x) => setEinbehalte(einbehalte.map((y, j) => (j === i ? { ...y, grund: x.target.value } : y)))} />
            <input style={{ ...feld, width: 120 }} placeholder="Betrag" value={String(b.betrag ?? '')} onChange={(x) => setEinbehalte(einbehalte.map((y, j) => (j === i ? { ...y, betrag: zahlAus(x.target.value) ?? 0 } : y)))} />
            <button style={knopf} onClick={() => setEinbehalte(einbehalte.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button style={{ ...knopf, marginTop: 6 }} onClick={() => setEinbehalte([...einbehalte, { grund: '', betrag: 0 }])}>＋ Einbehalt</button>
        <div style={{ marginTop: 8, fontWeight: 800 }}>{abr.text}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={primaer} onClick={() => speichern({}, 'Gespeichert.')}>Speichern</button>
          {!k.rueckgabe_am && <button style={knopf} onClick={() => speichern({ rueckgabe_am: heute, ausgezahlt: abr.auszahlung }, `Rückzahlung ${euroText(abr.auszahlung)} vermerkt.`)}>✓ Kaution zurückgezahlt</button>}
          {k.rueckgabe_am && <span style={{ color: C.green, alignSelf: 'center' }}>Zurückgezahlt am {datumDe(k.rueckgabe_am)} ({euroText(k.ausgezahlt)})</span>}
        </div>
      </div>
    </div>
  );
}
