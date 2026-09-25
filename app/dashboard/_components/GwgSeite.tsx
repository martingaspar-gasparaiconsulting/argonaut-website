'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · GwG-Identifizierung (gemeinsame Seite)
//   Eingebunden unter /dashboard/kfz/gwg (Güterhandel, Bar ab 10.000 €),
//   /dashboard/immobilien/gwg (Makler) und /dashboard/kanzlei/gwg
//   (Kataloggeschäfte). Pflicht-Prüfung, verbundene Barzahlungen,
//   Vollständigkeit, PEP/Risiko, Aufbewahrung 5 Jahre + Vernichtung.
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// RLS: Chef sieht alles; Mitarbeiter legen an und sehen nur ihre eigenen Fälle.
// Keine Ausweiskopie in ARGONAUT — nur der Vermerk, dass eine vorliegt.
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  GWG_HINWEIS, KANZLEI_KATALOG, gwgPflicht, verbundeneBarzahlungen, pruefeIdentifizierung, gwgAufbewahrung, datumDe, heuteBerlin, euroText,
  type GwgBereich, type GwgPerson,
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

const TITEL: Record<GwgBereich, { modul: string; zurueck: string; unter: string }> = {
  kfz: { modul: 'KFZ-Fachpaket', zurueck: '/dashboard/kfz', unter: 'Fahrzeugverkauf mit Barzahlung ab 10.000 € — Käufer identifizieren, bevor das Geld angenommen wird.' },
  immobilien: { modul: 'Immobilienverwaltung', zurueck: '/dashboard/immobilien', unter: 'Makler: beide Vertragsparteien beim Kauf, bei Mieten ab 10.000 € im Monat.' },
  kanzlei: { modul: 'Kanzlei & Steuer', zurueck: '/dashboard/kanzlei', unter: 'Kataloggeschäfte nach § 2 Abs. 1 Nr. 10 GwG — Mandanten vor Beginn identifizieren.' },
  handel: { modul: 'Handel', zurueck: '/dashboard', unter: 'Güterhandel bar ab 10.000 €, Edelmetalle ab 2.000 €, Kunst ab 10.000 €.' },
};

type Fall = GwgPerson & { id: string; bereich: GwgBereich; datum: string; anlass: string | null; vorgang: string | null; betrag: number | null; bar: number | null; pflicht_grund: string | null; person_art: 'natuerlich' | 'juristisch'; kopie_vorhanden: boolean; verdacht: boolean; verdacht_gemeldet_am: string | null; vernichtet_am: string | null };
const LEER = {
  anlass: '', vorgang: '', betrag: '', bar: '', ware: 'allgemein' as 'allgemein' | 'edelmetall' | 'kunst', makler: 'kauf' as 'kauf' | 'miete', monatsmiete: '', katalog: [] as string[],
  person_art: 'natuerlich' as 'natuerlich' | 'juristisch', nachname: '', vornamen: '', geburtsdatum: '', geburtsort: '', staatsangehoerigkeit: '', anschrift: '',
  ausweis_art: 'Personalausweis', ausweis_nr: '', ausweis_behoerde: '', ausweis_gueltig_bis: '', firma: '', rechtsform: '', register_nr: '', vertreter: '', wirtschaftlich_berechtigte: '',
  transparenzregister: false, pep: false, mittelherkunft: '', leitung_zugestimmt: false, risiko: 'normal' as 'gering' | 'normal' | 'hoch', kopie_vorhanden: false,
};
function kundeVon(f: { person_art: string; firma?: string | null; nachname?: string | null; vornamen?: string | null }): string {
  return f.person_art === 'juristisch' && f.firma ? f.firma : `${f.vornamen ?? ''} ${f.nachname ?? ''}`.trim();
}

export default function GwgSeite({ bereich }: { bereich: GwgBereich }) {
  const heute = heuteBerlin();
  const t = TITEL[bereich];
  const [istChef, setIstChef] = useState(true);
  const [faelle, setFaelle] = useState<Fall[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState(LEER);
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('gwg_identifizierung').select('*').eq('bereich', bereich).order('datum', { ascending: false }).limit(1000);
    if (r.error) { if (/gwg_identifizierung/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setFaelle((r.data as Fall[]) ?? []);
  }, [bereich]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === data?.user?.id);
      await laden();
    })();
  }, [laden]);

  const pflicht = gwgPflicht({ bereich, bar: f.bar, betrag: f.betrag, ware: f.ware, makler: f.makler, monatsmiete: f.monatsmiete, katalog: f.katalog });
  const person: GwgPerson = { ...f, art: f.person_art };
  const pruefung = pruefeIdentifizierung(person, heute);
  const kunde = kundeVon({ person_art: f.person_art, firma: f.firma, nachname: f.nachname, vornamen: f.vornamen });
  const verbunden = useMemo(() => (bereich !== 'kanzlei' && kunde ? verbundeneBarzahlungen(faelle.map((x) => ({ kunde: kundeVon(x), datum: x.datum, bar: Number(x.bar) || 0 })), kunde, heute, leseZahl(f.bar) ?? 0) : null), [bereich, kunde, faelle, heute, f.bar]);
  const muss = pflicht.pflichtig || !!verbunden?.erreicht;

  async function speichern() {
    if (!muss && !window.confirm('Nach Ihren Angaben besteht keine Pflicht zur Identifizierung. Trotzdem freiwillig dokumentieren?')) return;
    if (!pruefung.vollstaendig) { setFehler('Es fehlt: ' + pruefung.fehlt.join(', ')); return; }
    if (pruefung.befunde.some((b) => b.stufe === 'rot')) { setFehler(pruefung.befunde.filter((b) => b.stufe === 'rot').map((b) => b.text).join(' ')); return; }
    const { data } = await supabase.auth.getUser();
    const z = (s: string) => (s.trim() ? leseZahl(s) : null);
    const { error } = await supabase.from('gwg_identifizierung').insert({
      bereich, datum: heute, anlass: f.anlass.trim() || (bereich === 'kanzlei' ? f.katalog.join(', ') : null), vorgang: f.vorgang.trim() || null,
      betrag: z(f.betrag) ?? z(f.monatsmiete), bar: z(f.bar), pflicht_grund: verbunden?.erreicht ? `Verbundene Barzahlungen zusammen ${euroText(verbunden.summe)}` : pflicht.grund,
      person_art: f.person_art, nachname: f.nachname.trim(), vornamen: f.vornamen.trim(), geburtsdatum: f.geburtsdatum || null, geburtsort: f.geburtsort.trim(),
      staatsangehoerigkeit: f.staatsangehoerigkeit.trim(), anschrift: f.anschrift.trim() || null, ausweis_art: f.ausweis_art, ausweis_nr: f.ausweis_nr.trim(), ausweis_behoerde: f.ausweis_behoerde.trim(),
      ausweis_gueltig_bis: f.ausweis_gueltig_bis || null, firma: f.firma.trim() || null, rechtsform: f.rechtsform.trim() || null, register_nr: f.register_nr.trim() || null,
      vertreter: f.vertreter.trim() || null, wirtschaftlich_berechtigte: f.wirtschaftlich_berechtigte.trim() || null, transparenzregister: f.transparenzregister,
      pep: f.pep, mittelherkunft: f.mittelherkunft.trim() || null, leitung_zugestimmt: f.leitung_zugestimmt, risiko: f.risiko, kopie_vorhanden: f.kopie_vorhanden,
      erstellt_von: data?.user?.id,
    });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Identifizierung dokumentiert.'); setF(LEER); setOffen(false); await laden();
  }
  async function vermerk(x: Fall, teil: Record<string, unknown>, text: string) {
    const { error } = await supabase.from('gwg_identifizierung').update(teil).eq('id', x.id);
    if (error) { setFehler('Ändern fehlgeschlagen: ' + error.message); return; }
    setOk(text); await laden();
  }
  async function vernichten(x: Fall) {
    if (!window.confirm(`Aufzeichnung ${kundeVon(x)} vom ${datumDe(x.datum)} endgültig löschen?`)) return;
    const { error } = await supabase.from('gwg_identifizierung').delete().eq('id', x.id);
    if (error) { setFehler('Löschen fehlgeschlagen: ' + error.message); return; }
    setOk('Aufzeichnung vernichtet.'); await laden();
  }
  const ein = (k: keyof typeof LEER, label: string, breite = 200, typ = 'text') => (
    <label>{label}<br /><input type={typ} style={{ ...feld, width: breite }} value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  const faellig = faelle.filter((x) => gwgAufbewahrung(x.datum, heute).stufe !== 'ok');

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · {t.modul}</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🛂 GwG-Identifizierung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>{t.unter} <a href={t.zurueck} style={{ color: C.cyan }}>← Zurück</a></p>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die GwG-Identifizierung ist noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <b>1 · Muss ich identifizieren?</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
              {ein('vorgang', bereich === 'kfz' ? 'Fahrzeug / Vorgang' : 'Objekt / Vorgang', 240)}
              {bereich === 'immobilien' && (
                <label>Art<br /><select style={feld} value={f.makler} onChange={(e) => setF({ ...f, makler: e.target.value as 'kauf' | 'miete' })}><option value="kauf">Kauf vermitteln</option><option value="miete">Miete vermitteln</option></select></label>
              )}
              {bereich === 'immobilien' && f.makler === 'miete' && ein('monatsmiete', 'Monatsmiete €', 130)}
              {bereich === 'handel' && <label>Ware<br /><select style={feld} value={f.ware} onChange={(e) => setF({ ...f, ware: e.target.value as typeof f.ware })}><option value="allgemein">allgemein</option><option value="edelmetall">Edelmetall</option><option value="kunst">Kunst</option></select></label>}
              {bereich !== 'kanzlei' && ein('betrag', 'Kaufpreis €', 130)}
              {bereich !== 'kanzlei' && ein('bar', 'davon bar €', 130)}
            </div>
            {bereich === 'kanzlei' && (
              <div style={{ marginTop: 8 }}>
                {KANZLEI_KATALOG.map((k) => <label key={k.key} style={{ display: 'block', fontSize: 13.5 }}><input type="checkbox" checked={f.katalog.includes(k.key)} onChange={(e) => setF({ ...f, katalog: e.target.checked ? [...f.katalog, k.key] : f.katalog.filter((x) => x !== k.key) })} /> {k.label}</label>)}
              </div>
            )}
            <div style={{ marginTop: 10, fontWeight: 700, color: muss ? C.warn : C.green }}>{muss ? '⚠ Identifizierung Pflicht: ' : '✓ Keine Pflicht: '}{verbunden?.erreicht ? `${verbunden.anzahl} verbundene Barzahlungen dieses Kunden zusammen ${euroText(verbunden.summe)} — Stückelung zählt zusammen.` : pflicht.grund}</div>
            {!offen && <button style={{ ...primaer, marginTop: 10 }} onClick={() => setOffen(true)}>{muss ? '🛂 Jetzt identifizieren' : 'Trotzdem dokumentieren'}</button>}
          </div>

          {offen && (
            <div style={karte}>
              <b>2 · Person</b>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {([['natuerlich', 'Privatperson'], ['juristisch', 'Firma / Gesellschaft']] as const).map(([k, l]) => <button key={k} onClick={() => setF({ ...f, person_art: k })} style={{ ...knopf, ...(f.person_art === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{l}</button>)}
              </div>
              {f.person_art === 'juristisch' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                  {ein('firma', 'Firma', 240)}{ein('rechtsform', 'Rechtsform', 120)}{ein('register_nr', 'Registernummer', 150)}{ein('anschrift', 'Anschrift Sitz', 260)}
                  {ein('vertreter', 'Vertretungsberechtigte', 240)}{ein('wirtschaftlich_berechtigte', 'wirtschaftlich Berechtigte (über 25 %)', 300)}
                  <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={f.transparenzregister} onChange={(e) => setF({ ...f, transparenzregister: e.target.checked })} /> Transparenzregister-Auszug eingesehen</label>
                </div>
              )}
              <div style={{ color: C.textDim, fontSize: 13, marginTop: 10 }}>{f.person_art === 'juristisch' ? 'Für die Firma auftretende Person:' : 'Angaben aus dem vorgelegten Ausweis:'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
                {ein('nachname', 'Nachname', 170)}{ein('vornamen', 'Vornamen', 170)}{ein('geburtsdatum', 'Geburtsdatum', 150, 'date')}{ein('geburtsort', 'Geburtsort', 150)}
                {ein('staatsangehoerigkeit', 'Staatsangehörigkeit', 150)}{f.person_art === 'natuerlich' && ein('anschrift', 'Wohnanschrift', 280)}
                <label>Ausweis<br /><select style={feld} value={f.ausweis_art} onChange={(e) => setF({ ...f, ausweis_art: e.target.value })}><option>Personalausweis</option><option>Reisepass</option><option>Aufenthaltstitel mit Passersatz</option><option>eID (Online-Ausweis)</option></select></label>
                {ein('ausweis_nr', 'Ausweisnummer', 150)}{ein('ausweis_behoerde', 'ausstellende Behörde', 200)}{ein('ausweis_gueltig_bis', 'gültig bis', 150, 'date')}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 13.5 }}>
                <label><input type="checkbox" checked={f.kopie_vorhanden} onChange={(e) => setF({ ...f, kopie_vorhanden: e.target.checked })} /> Ausweiskopie liegt in der Papierakte</label>
                <label><input type="checkbox" checked={f.pep} onChange={(e) => setF({ ...f, pep: e.target.checked })} /> Politisch exponierte Person (oder Angehörige)</label>
                <label>Risiko <select style={feld} value={f.risiko} onChange={(e) => setF({ ...f, risiko: e.target.value as typeof f.risiko })}><option value="gering">gering</option><option value="normal">normal</option><option value="hoch">hoch</option></select></label>
              </div>
              {(f.pep || f.risiko === 'hoch') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                  {ein('mittelherkunft', 'Herkunft der Mittel', 320)}
                  <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={f.leitung_zugestimmt} onChange={(e) => setF({ ...f, leitung_zugestimmt: e.target.checked })} /> Geschäftsleitung hat zugestimmt</label>
                </div>
              )}
              {pruefung.fehlt.length > 0 && <div style={{ color: C.warn, fontSize: 13.5, marginTop: 10 }}>Es fehlt: {pruefung.fehlt.join(', ')}</div>}
              {pruefung.befunde.map((b, i) => <div key={i} style={{ color: FARBE[b.stufe], fontSize: 13.5 }}>{b.text}</div>)}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button style={primaer} onClick={speichern}>💾 Identifizierung speichern</button><button style={knopf} onClick={() => { setOffen(false); setF(LEER); }}>Abbrechen</button></div>
            </div>
          )}

          <div style={karte}>
            <b>{istChef ? 'Dokumentierte Fälle' : 'Ihre dokumentierten Fälle'}</b>
            {faelle.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Noch keine.</div>}
            {faelle.slice(0, 100).map((x) => { const a = gwgAufbewahrung(x.datum, heute); return (
              <div key={x.id} style={zeile}>
                <span>{datumDe(x.datum)} · <b>{kundeVon(x)}</b>{x.vorgang ? ` · ${x.vorgang}` : ''}{x.bar ? ` · bar ${euroText(Number(x.bar))}` : ''}{x.pep ? ' · PEP' : ''}{x.verdacht ? <span style={{ color: C.danger }}> · Verdacht{x.verdacht_gemeldet_am ? ` gemeldet ${datumDe(x.verdacht_gemeldet_am)}` : ' — noch nicht gemeldet'}</span> : ''}<br />
                  <span style={{ color: FARBE[a.stufe ?? 'ok'], fontSize: 12.5 }}>{a.text}</span></span>
                {istChef && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!x.verdacht && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => window.confirm('Verdachtsfall vermerken? Dem Kunden gegenüber nichts erwähnen.') && vermerk(x, { verdacht: true }, 'Verdacht vermerkt — Meldung über goAML an die FIU.')}>⚑ Verdacht</button>}
                    {x.verdacht && !x.verdacht_gemeldet_am && <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => vermerk(x, { verdacht_gemeldet_am: heute }, 'Meldung vermerkt.')}>an FIU gemeldet</button>}
                    {a.stufe !== 'ok' && <button style={{ ...knopf, padding: '3px 8px', color: C.danger }} onClick={() => vernichten(x)}>🗑 vernichten</button>}
                  </span>
                )}
              </div>
            ); })}
            {istChef && faellig.length > 0 && <div style={{ color: C.warn, marginTop: 8 }}>{faellig.length} Aufzeichnungen haben die Aufbewahrungsfrist überschritten.</div>}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{GWG_HINWEIS} Keine Rechtsberatung.</p>
        </>
      )}
    </div>
  );
}
