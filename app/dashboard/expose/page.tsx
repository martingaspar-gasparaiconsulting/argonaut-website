'use client';

// ============================================================
// ARGONAUT OS · B-IV · Immobilien · Exposé & Vermarktung
// Objekt-Exposés mit automatischer Energieeffizienzklasse (GEG Anlage 10) und
// Prüfung der GEG-§87-Pflichtangaben, Vermarktungsstatus, Preis/m², Provision
// und druckfertigem Exposé-PDF. Reine Formeln aus lib/expose (0 €, getestet).
// Pfad: app/dashboard/expose/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import {
  OBJEKT_ARTEN, VERMARKTUNG_ARTEN, AUSWEIS_TYPEN, STATUS_INFO,
  energieKlasse, preisProM2, provision, pflichtangabenVollstaendig, fehlendePflichtangaben,
  zaehleExpose, INTERESSENT_STATUS, zaehleInteressenten,
  type ObjektArt, type VermarktungArt, type AusweisTyp, type ExposeStatus, type InteressentLite,
} from '@/lib/expose';
import { augeExpose } from '@/lib/auge';
import { exposePdf } from '@/lib/exposePdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<string, string> = { gold: C.gold, cyan: C.cyan, green: C.green, textDim: C.textDim, danger: C.danger, warn: C.warn };

type Expose = {
  id: string; bezeichnung: string; objekt_art: ObjektArt; vermarktung_art: VermarktungArt;
  ort: string | null; adresse: string | null; wohnflaeche: number | null; grundstuecksflaeche: number | null;
  zimmer: number | null; baujahr: number | null; etage: string | null; verfuegbar_ab: string | null;
  preis: number; nebenkosten: number | null; provision_prozent: number | null;
  energieausweis_vorhanden: boolean; energie_typ: AusweisTyp | null; energiekennwert: number | null;
  energietraeger: string | null; lage_text: string | null; ausstattung_text: string | null;
  objekt_text: string | null; status: string;
};

type Interessent = { id: string; expose_id: string; name: string; email: string | null; telefon: string | null; status: string; notiz: string | null; created_at: string };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

const LEER: Record<string, string> = {
  bezeichnung: '', objekt_art: 'wohnung', vermarktung_art: 'kauf', ort: '', adresse: '',
  wohnflaeche: '', grundstuecksflaeche: '', zimmer: '', baujahr: '', etage: '', verfuegbar_ab: '',
  preis: '', nebenkosten: '', provision_prozent: '', energie_typ: 'verbrauch', energiekennwert: '',
  energietraeger: '', lage_text: '', ausstattung_text: '', objekt_text: '',
};

export default function ExposePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [exposes, setExposes] = useState<Expose[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ ...LEER });
  const [ausweisVorhanden, setAusweisVorhanden] = useState(true);
  const [interessenten, setInteressenten] = useState<Interessent[]>([]);
  const [selInter, setSelInter] = useState<string>('');
  const [nInter, setNInter] = useState({ name: '', email: '', telefon: '', status: 'neu', notiz: '' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [ex, it] = await Promise.all([
        supabase.from('expose').select('*').order('created_at', { ascending: false }),
        supabase.from('expose_interessent').select('*').order('created_at', { ascending: false }),
      ]);
      const liste = (ex.data as Expose[]) ?? [];
      setExposes(liste);
      setInteressenten((it.data as Interessent[]) ?? []);
      setSelInter((cur) => cur || (liste[0]?.id ?? ''));
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [m.firmenname, m.firma, m.unternehmen, m.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleExpose(exposes), [exposes]);
  const interDesObjekts = useMemo(() => interessenten.filter((i) => i.expose_id === selInter), [interessenten, selInter]);
  const interKennzahlen = useMemo(() => zaehleInteressenten(interessenten as InteressentLite[]), [interessenten]);
  const vermarktung = VERMARKTUNG_ARTEN.find((v) => v.key === f.vermarktung_art) ?? VERMARKTUNG_ARTEN[0];
  const klasse = energieKlasse(num(f.energiekennwert));
  const m2Preis = preisProM2(num(f.preis), num(f.wohnflaeche));
  const prov = f.provision_prozent && f.preis ? provision(num(f.preis), num(f.provision_prozent)) : null;
  const fehltForm = useMemo(() => fehlendePflichtangaben({
    objekt_art: f.objekt_art as ObjektArt, energieausweis_vorhanden: ausweisVorhanden,
    energie_typ: f.energie_typ, energiekennwert: num(f.energiekennwert), energietraeger: f.energietraeger, baujahr: num(f.baujahr),
  }), [f, ausweisVorhanden]);

  async function anlegen() {
    if (!uid || !f.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('anlegen'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('expose').insert({
        owner_user_id: uid, bezeichnung: f.bezeichnung.trim(), objekt_art: f.objekt_art, vermarktung_art: f.vermarktung_art,
        ort: f.ort.trim() || null, adresse: f.adresse.trim() || null,
        wohnflaeche: f.wohnflaeche.trim() ? num(f.wohnflaeche) : null, grundstuecksflaeche: f.grundstuecksflaeche.trim() ? num(f.grundstuecksflaeche) : null,
        zimmer: f.zimmer.trim() ? num(f.zimmer) : null, baujahr: f.baujahr.trim() ? Math.round(num(f.baujahr)) : null,
        etage: f.etage.trim() || null, verfuegbar_ab: f.verfuegbar_ab || null,
        preis: num(f.preis), nebenkosten: f.nebenkosten.trim() ? num(f.nebenkosten) : null,
        provision_prozent: f.provision_prozent.trim() ? num(f.provision_prozent) : null,
        energieausweis_vorhanden: ausweisVorhanden,
        energie_typ: ausweisVorhanden ? f.energie_typ : null,
        energiekennwert: ausweisVorhanden && f.energiekennwert.trim() ? num(f.energiekennwert) : null,
        energietraeger: ausweisVorhanden ? (f.energietraeger.trim() || null) : null,
        lage_text: f.lage_text.trim() || null, ausstattung_text: f.ausstattung_text.trim() || null, objekt_text: f.objekt_text.trim() || null,
        status: 'entwurf',
      });
      if (error) throw error;
      setF({ ...LEER }); setAusweisVorhanden(true); setOk('Exposé angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function setzeStatus(e: Expose, status: string) {
    setBusy(e.id); setFehler(null);
    try {
      const { error } = await supabase.from('expose').update({ status }).eq('id', e.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function interessentAnlegen() {
    if (!uid || !selInter) { setFehler('Bitte zuerst ein Exposé wählen.'); return; }
    if (!nInter.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setBusy('inter'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('expose_interessent').insert({
        owner_user_id: uid, expose_id: selInter, name: nInter.name.trim(),
        email: nInter.email.trim() || null, telefon: nInter.telefon.trim() || null,
        status: nInter.status, notiz: nInter.notiz.trim() || null,
      });
      if (error) throw error;
      setNInter({ name: '', email: '', telefon: '', status: 'neu', notiz: '' });
      setOk('Interessent hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function interStatus(i: Interessent, status: string) {
    setBusy(i.id); setFehler(null);
    try { await supabase.from('expose_interessent').update({ status }).eq('id', i.id); await laden_(); }
    catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function interLoeschen(id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from('expose_interessent').delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(e: Expose) {
    const va = VERMARKTUNG_ARTEN.find((v) => v.key === e.vermarktung_art) ?? VERMARKTUNG_ARTEN[0];
    const oa = OBJEKT_ARTEN.find((o) => o.key === e.objekt_art)?.label ?? e.objekt_art;
    exposePdf({
      aussteller: aussteller || 'Mein Betrieb',
      bezeichnung: e.bezeichnung, objektArt: oa, vermarktungArt: va.label, preisLabel: va.preisLabel,
      ort: e.ort || '', adresse: e.adresse || '',
      preis: eur(e.preis), nebenkosten: e.nebenkosten ? eur(e.nebenkosten) : '',
      wohnflaeche: e.wohnflaeche ? `${e.wohnflaeche} m²` : '', grundstueck: e.grundstuecksflaeche ? `${e.grundstuecksflaeche} m²` : '',
      zimmer: e.zimmer != null ? String(e.zimmer) : '', baujahr: e.baujahr != null ? String(e.baujahr) : '',
      etage: e.etage || '', verfuegbar: e.verfuegbar_ab || '',
      preisProM2: e.wohnflaeche ? eur(preisProM2(e.preis, e.wohnflaeche)) + ' /m²' : '',
      energieausweisVorhanden: e.energieausweis_vorhanden,
      energieTyp: e.energie_typ === 'bedarf' ? 'Bedarfsausweis' : e.energie_typ === 'verbrauch' ? 'Verbrauchsausweis' : '',
      energiekennwert: e.energiekennwert != null ? `${e.energiekennwert} kWh/(m²·a)` : '',
      energieklasse: energieKlasse(e.energiekennwert) || '',
      energietraeger: e.energietraeger || '',
      lageText: e.lage_text || '', ausstattungText: e.ausstattung_text || '', objektText: e.objekt_text || '',
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Immobilien</div>
      <h1 style={styles.h1}>🏢 Exposé & Vermarktung</h1>
      <p style={styles.sub}>Objekt-Exposés mit automatischer Energieeffizienzklasse und geprüften GEG-§87-Pflichtangaben, Vermarktungsstatus und druckfertigem Exposé-PDF. Preise netto/brutto wie angegeben.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Aktiv vermarktet" value={String(kennzahlen.aktiv)} accent={C.cyan} />
        <Kpi label="Reserviert" value={String(kennzahlen.reserviert)} accent={C.gold} />
        <Kpi label="Abgeschlossen" value={String(kennzahlen.abgeschlossen)} accent={C.green} />
        <Kpi label="Volumen aktiv (Kauf)" value={eur(kennzahlen.volumenAktiv)} accent={C.text} />
        <Kpi label="GEG-Lücken" value={String(kennzahlen.pflichtLuecken)} accent={kennzahlen.pflichtLuecken ? C.danger : C.green} />
        <Kpi label="Interessenten offen" value={String(interKennzahlen.offen)} accent={interKennzahlen.offen ? C.gold : C.textDim} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Exposé" regel={augeExpose(kennzahlen)} />
        </div>
      )}

      {/* ---------- NEUES EXPOSÉ ---------- */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neues Exposé</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} placeholder="z. B. 3-Zi-Wohnung Zentrum" /></label>
          <label style={styles.lab}>Objektart
            <select style={styles.inp} value={f.objekt_art} onChange={(e) => setF({ ...f, objekt_art: e.target.value })}>
              {OBJEKT_ARTEN.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Vermarktung
            <select style={styles.inp} value={f.vermarktung_art} onChange={(e) => setF({ ...f, vermarktung_art: e.target.value })}>
              {VERMARKTUNG_ARTEN.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Ort<input style={styles.inp} value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></label>
          <label style={styles.lab}>Adresse<input style={styles.inp} value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></label>
          <label style={styles.lab}>{vermarktung.preisLabel} (€)<input style={styles.inp} inputMode="decimal" value={f.preis} onChange={(e) => setF({ ...f, preis: e.target.value })} /></label>
          <label style={styles.lab}>Nebenkosten/Hausgeld (€, optional)<input style={styles.inp} inputMode="decimal" value={f.nebenkosten} onChange={(e) => setF({ ...f, nebenkosten: e.target.value })} /></label>
          <label style={styles.lab}>Provision (%, optional)<input style={styles.inp} inputMode="decimal" value={f.provision_prozent} onChange={(e) => setF({ ...f, provision_prozent: e.target.value })} /></label>
          <label style={styles.lab}>Wohnfläche (m²)<input style={styles.inp} inputMode="decimal" value={f.wohnflaeche} onChange={(e) => setF({ ...f, wohnflaeche: e.target.value })} /></label>
          <label style={styles.lab}>Grundstück (m², optional)<input style={styles.inp} inputMode="decimal" value={f.grundstuecksflaeche} onChange={(e) => setF({ ...f, grundstuecksflaeche: e.target.value })} /></label>
          <label style={styles.lab}>Zimmer<input style={styles.inp} inputMode="decimal" value={f.zimmer} onChange={(e) => setF({ ...f, zimmer: e.target.value })} /></label>
          <label style={styles.lab}>Baujahr<input style={styles.inp} inputMode="numeric" value={f.baujahr} onChange={(e) => setF({ ...f, baujahr: e.target.value })} /></label>
          <label style={styles.lab}>Etage (optional)<input style={styles.inp} value={f.etage} onChange={(e) => setF({ ...f, etage: e.target.value })} /></label>
          <label style={styles.lab}>Verfügbar ab (optional)<input type="date" style={styles.inp} value={f.verfuegbar_ab} onChange={(e) => setF({ ...f, verfuegbar_ab: e.target.value })} /></label>
        </div>

        {/* Energie / GEG */}
        <div style={{ ...styles.subCard, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Energieausweis (GEG §87-Pflichtangaben)</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.textDim, fontSize: 14 }}>
              <input type="checkbox" checked={ausweisVorhanden} onChange={(e) => setAusweisVorhanden(e.target.checked)} /> Energieausweis liegt vor
            </label>
          </div>
          {ausweisVorhanden && (
            <div style={{ ...styles.grid, marginTop: 10 }}>
              <label style={styles.lab}>Ausweis-Art
                <select style={styles.inp} value={f.energie_typ} onChange={(e) => setF({ ...f, energie_typ: e.target.value })}>
                  {AUSWEIS_TYPEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Endenergie kWh/(m²·a)<input style={styles.inp} inputMode="decimal" value={f.energiekennwert} onChange={(e) => setF({ ...f, energiekennwert: e.target.value })} /></label>
              <label style={styles.lab}>Energieträger Heizung<input style={styles.inp} value={f.energietraeger} onChange={(e) => setF({ ...f, energietraeger: e.target.value })} placeholder="z. B. Gas, Wärmepumpe" /></label>
              <div style={{ ...styles.lab, justifyContent: 'flex-end' }}>
                <span>Energieeffizienzklasse</span>
                <div style={{ fontWeight: 800, fontSize: 22, color: klasse ? C.gold : C.textDim }}>{klasse ?? '—'}</div>
              </div>
            </div>
          )}
          {ausweisVorhanden && f.objekt_art !== 'grundstueck' && fehltForm.length > 0 && (
            <div style={{ marginTop: 8, color: C.warn, fontSize: 13.5 }}>⚠ Für eine Anzeige nach GEG §87 fehlt noch: {fehltForm.join(', ')}.</div>
          )}
        </div>

        {/* Texte */}
        <div style={{ ...styles.grid, marginTop: 12 }}>
          <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Lage<textarea style={styles.ta} value={f.lage_text} onChange={(e) => setF({ ...f, lage_text: e.target.value })} /></label>
          <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Ausstattung<textarea style={styles.ta} value={f.ausstattung_text} onChange={(e) => setF({ ...f, ausstattung_text: e.target.value })} /></label>
          <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Objektbeschreibung<textarea style={styles.ta} value={f.objekt_text} onChange={(e) => setF({ ...f, objekt_text: e.target.value })} /></label>
        </div>

        <div style={styles.hintBox}>
          {m2Preis > 0 && <>Preis: <b style={{ color: C.gold }}>{eur(m2Preis)} /m²</b>{prov ? ' · ' : ''}</>}
          {prov && <>Provision {prov.prozent} %: <b>{eur(prov.brutto)}</b> brutto</>}
          {(m2Preis <= 0 && !prov) && 'Fläche & Preis eingeben für Preis/m² und Provision.'}
        </div>
        <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'anlegen' ? 0.6 : 1 }} disabled={busy === 'anlegen'} onClick={anlegen}>＋ Exposé anlegen</button>
      </div>

      {/* ---------- LISTE ---------- */}
      {laden ? <p style={styles.hint}>Lädt …</p> : (
        <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
          {exposes.length === 0 ? <Leerzustand icon="🏡" titel="Noch keine Exposés" text="Erstelle Immobilien-Exposés mit Energieklasse und druckfertigem PDF." schritte={["Exposé oben anlegen", "Objektdaten und Energieausweis erfassen", "Als PDF exportieren"]} /> : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Objekt</th><th style={styles.th}>Ort</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Preis</th><th style={styles.th}>Energie</th>
                <th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
              </tr></thead>
              <tbody>
                {exposes.map((e) => {
                  const st = (e.status ?? 'entwurf') as ExposeStatus;
                  const sm = STATUS_INFO[st] ?? STATUS_INFO.entwurf;
                  const kl = energieKlasse(e.energiekennwert);
                  const luecke = !pflichtangabenVollstaendig({ objekt_art: e.objekt_art, energieausweis_vorhanden: e.energieausweis_vorhanden, energie_typ: e.energie_typ, energiekennwert: e.energiekennwert, energietraeger: e.energietraeger, baujahr: e.baujahr });
                  const oa = OBJEKT_ARTEN.find((o) => o.key === e.objekt_art)?.label ?? e.objekt_art;
                  return (
                    <tr key={e.id} style={{ opacity: (st === 'verkauft' || st === 'vermietet') ? 0.6 : 1 }}>
                      <td style={styles.td}>{e.bezeichnung}<div style={{ color: C.textDim, fontSize: 13 }}>{oa} · {e.vermarktung_art === 'kauf' ? 'Kauf' : 'Miete'}{e.wohnflaeche ? ` · ${e.wohnflaeche} m²` : ''}</div></td>
                      <td style={{ ...styles.td, color: C.textDim }}>{e.ort || '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{eur(e.preis)}{e.wohnflaeche ? <div style={{ color: C.textDim, fontSize: 12 }}>{eur(preisProM2(e.preis, e.wohnflaeche))}/m²</div> : ''}</td>
                      <td style={styles.td}>{kl ? <span style={{ ...styles.badge, color: C.gold, borderColor: C.gold }}>{kl}</span> : <span style={{ color: C.textDim }}>—</span>}{luecke && st === 'aktiv' ? <div style={{ color: C.warn, fontSize: 12 }}>⚠ GEG unvollst.</div> : ''}</td>
                      <td style={styles.td}><span style={{ ...styles.badge, color: FARBE[sm.farbe], borderColor: FARBE[sm.farbe] }}>{sm.label}</span></td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {st === 'entwurf' && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} disabled={busy === e.id} onClick={() => setzeStatus(e, 'aktiv')}>📣 Aktiv</button>}
                        {st === 'aktiv' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === e.id} onClick={() => setzeStatus(e, 'reserviert')}>🔒 Reservieren</button>}
                        {(st === 'aktiv' || st === 'reserviert') && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === e.id} onClick={() => setzeStatus(e, e.vermarktung_art === 'kauf' ? 'verkauft' : 'vermietet')}>✓ {e.vermarktung_art === 'kauf' ? 'Verkauft' : 'Vermietet'}</button>}
                        {(st === 'reserviert') && <button style={styles.mini} disabled={busy === e.id} onClick={() => setzeStatus(e, 'aktiv')}>↩ Aktiv</button>}
                        <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(e)}>📄 Exposé</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------- INTERESSENTEN / LEADS ---------- */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={styles.cardTitel}>Interessenten &amp; Leads</div>
          <label style={{ ...styles.lab, minWidth: 240 }}>Objekt
            <select style={styles.inp} value={selInter} onChange={(e) => setSelInter(e.target.value)}>
              <option value="">— Exposé wählen —</option>
              {exposes.map((e) => <option key={e.id} value={e.id}>{e.bezeichnung}</option>)}
            </select>
          </label>
        </div>

        {!selInter ? <div style={styles.hint}>Wähle oben ein Exposé, um Interessenten zu erfassen.</div> : (
          <>
            <div style={{ ...styles.grid, marginTop: 10 }}>
              <label style={styles.lab}>Name<input style={styles.inp} value={nInter.name} onChange={(e) => setNInter({ ...nInter, name: e.target.value })} /></label>
              <label style={styles.lab}>E-Mail<input style={styles.inp} value={nInter.email} onChange={(e) => setNInter({ ...nInter, email: e.target.value })} /></label>
              <label style={styles.lab}>Telefon<input style={styles.inp} value={nInter.telefon} onChange={(e) => setNInter({ ...nInter, telefon: e.target.value })} /></label>
              <label style={styles.lab}>Status
                <select style={styles.inp} value={nInter.status} onChange={(e) => setNInter({ ...nInter, status: e.target.value })}>
                  {INTERESSENT_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz<input style={styles.inp} value={nInter.notiz} onChange={(e) => setNInter({ ...nInter, notiz: e.target.value })} placeholder="z. B. Wunschtermin Besichtigung" /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'inter' ? 0.6 : 1 }} disabled={busy === 'inter'} onClick={interessentAnlegen}>＋ Interessent</button>

            {interDesObjekts.length === 0 ? <div style={{ ...styles.hint, marginTop: 8 }}>Noch keine Interessenten für dieses Objekt.</div> : (
              <div style={{ marginTop: 12, overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Name</th><th style={styles.th}>Kontakt</th>
                    <th style={styles.th}>Status</th><th style={styles.th}>Notiz</th><th style={{ ...styles.th, textAlign: 'right' }}></th>
                  </tr></thead>
                  <tbody>
                    {interDesObjekts.map((i) => (
                      <tr key={i.id}>
                        <td style={styles.td}>{i.name}</td>
                        <td style={{ ...styles.td, color: C.textDim, fontSize: 14 }}>{[i.email, i.telefon].filter(Boolean).join(' · ') || '—'}</td>
                        <td style={styles.td}>
                          <select style={styles.selMini} value={i.status} onChange={(e) => interStatus(i, e.target.value)} disabled={busy === i.id}>
                            {INTERESSENT_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </td>
                        <td style={{ ...styles.td, color: C.textDim, fontSize: 14 }}>{i.notiz || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={styles.miniX} disabled={busy === i.id} onClick={() => interLoeschen(i.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, color: C.textDim, fontSize: 13 }}>Besichtigungen: {interDesObjekts.filter((i) => i.status === 'besichtigung').length} · Angebote: {interDesObjekts.filter((i) => i.status === 'angebot').length} · offen: {interDesObjekts.filter((i) => i.status !== 'zusage' && i.status !== 'abgesagt').length}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  ta: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minHeight: 60, resize: 'vertical', boxSizing: 'border-box' },
  hintBox: { marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(12.5px, 1.06vw, 17px)', color: C.textDim },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, marginBottom: 4, whiteSpace: 'nowrap' },
  selMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
