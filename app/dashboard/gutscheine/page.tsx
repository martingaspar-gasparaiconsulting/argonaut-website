'use client';

// ============================================================
// ARGONAUT OS · B-III · Verkaufsförderung · Gutscheine & Pakete
// Drei Arten in EINEM Modul: Wertgutschein · Mehrfachkarte (10er-Karte) ·
// Leistungsgutschein. Einlösungen sind Log-Zeilen (gutschein_einloesung) —
// Restwert/Restnutzungen werden LIVE aus der Summe berechnet (kein Drift).
// Recht: Verjährung §195/§199 BGB (3 J. ab Jahresende), USt Einzweck/Mehrzweck
// §3 Abs. 13–15 UStG. Reine Formeln aus lib/gutscheine (0 €, node-getestet).
// Pfad: app/dashboard/gutscheine/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import Leerzustand from '../_components/Leerzustand';
import { createBrowserClient } from '@supabase/ssr';
import {
  GUTSCHEIN_ARTEN, gutscheinArtInfo, MWST_TYPEN, verjaehrungEnde, tageBisVerfall,
  restwert, restNutzungen, gutscheinStatus, pruefeEinloesungBetrag, pruefeEinloesungNutzung,
  nettoAusBrutto, zaehleGutscheine, BALD_VERFALL_TAGE,
  type GutscheinArt, type MwStTyp, type GutscheinLite,
} from '@/lib/gutscheine';
import { augeGutscheine } from '@/lib/auge';
import { gutscheinPdf } from '@/lib/gutscheinPdf';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'gutschein';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const STATUS_FARBE: Record<string, string> = { aktiv: C.green, eingeloest: C.textDim, verfallen: C.danger, storniert: C.textDim };
const STATUS_LABEL: Record<string, string> = { aktiv: 'aktiv', eingeloest: 'eingelöst', verfallen: 'verfallen', storniert: 'storniert' };

type Gutschein = {
  id: string; code: string; art: GutscheinArt; mwst_typ: MwStTyp;
  wert: number; mwst_satz: number; nutzungen_gesamt: number | null; leistung_text: string | null;
  kontakt_id: string | null; empfaenger_name: string | null; anlass: string | null;
  ausgestellt_am: string; gueltig_bis: string | null; status: string; notiz: string | null;
};
type Einloesung = { id: string; gutschein_id: string; datum: string; betrag: number; nutzungen: number; bemerkung: string | null };
type Kontakt = { id: string; name: string };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function neuerCode() { const r = Math.random().toString(36).slice(2, 7).toUpperCase(); return `GS-${new Date().getFullYear()}-${r}`; }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}

const LEER_NG = {
  art: 'wert' as GutscheinArt, code: '', empfaenger_name: '', kontakt_id: '',
  wert: '', nutzungen_gesamt: '', leistung_text: '', mwst_typ: 'mehrzweck' as MwStTyp, mwst_satz: '19',
  anlass: '', ausgestellt_am: heuteLokal(), gueltig_bis: verjaehrungEnde(heuteLokal()), notiz: '',
};

export default function GutscheinePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [gutscheine, setGutscheine] = useState<Gutschein[]>([]);
  const [einloesungen, setEinloesungen] = useState<Einloesung[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ng, setNg] = useState({ ...LEER_NG, code: '' });
  const [einloeseZiel, setEinloeseZiel] = useState<string | null>(null);
  const [einloeseWert, setEinloeseWert] = useState('');
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [g, e, k] = await Promise.all([
        supabase.from('gutschein').select('*').order('ausgestellt_am', { ascending: false }),
        supabase.from('gutschein_einloesung').select('*').order('datum', { ascending: false }),
        supabase.from('kontakte').select('*'),
      ]);
      const gr = (g.data as Gutschein[]) ?? [];
      setGutscheine(gr);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, gr.map((r) => r.id)));
      setEinloesungen((e.data as Einloesung[]) ?? []);
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((a, b) => a.name.localeCompare(b.name)));
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
      setNg((f) => ({ ...f, code: neuerCode() }));
      await laden_();
    })();
  }, [laden_]);

  // Aggregierte Einlösung je Gutschein (Summe der Log-Zeilen).
  const agg = useMemo(() => {
    const m: Record<string, { betrag: number; nutzungen: number }> = {};
    for (const e of einloesungen) {
      const a = m[e.gutschein_id] ?? { betrag: 0, nutzungen: 0 };
      a.betrag += Number(e.betrag) || 0; a.nutzungen += Number(e.nutzungen) || 0;
      m[e.gutschein_id] = a;
    }
    return m;
  }, [einloesungen]);

  const lite = useCallback((g: Gutschein): GutscheinLite => ({
    art: g.art, wert: g.wert, eingeloest: agg[g.id]?.betrag ?? 0,
    nutzungen_gesamt: g.nutzungen_gesamt, nutzungen_verbraucht: agg[g.id]?.nutzungen ?? 0,
    gueltig_bis: g.gueltig_bis, status: g.status,
  }), [agg]);

  const kennzahlen = useMemo(() => zaehleGutscheine(gutscheine.map(lite), new Date()), [gutscheine, lite]);
  const info = gutscheinArtInfo(ng.art);

  const vorschauSteuer = useMemo(() => {
    if (ng.mwst_typ !== 'einzweck' || !ng.wert) return null;
    return nettoAusBrutto(num(ng.wert), num(ng.mwst_satz) || 19);
  }, [ng.mwst_typ, ng.wert, ng.mwst_satz]);

  function artWechsel(art: GutscheinArt) {
    setNg((f) => ({ ...f, art, code: f.code || neuerCode() }));
  }
  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setNg((f) => ({ ...f, kontakt_id: id, empfaenger_name: k ? k.name : f.empfaenger_name }));
  }
  function ausstellDatum(d: string) {
    setNg((f) => ({ ...f, ausgestellt_am: d, gueltig_bis: verjaehrungEnde(d) }));
  }

  async function gutscheinAnlegen() {
    if (!uid) return;
    if (!ng.empfaenger_name.trim() && !ng.kontakt_id) { setFehler('Bitte Empfänger (Kontakt oder Freitext) angeben.'); return; }
    if (info.hatBetrag && ng.art !== 'mehrfachkarte' && num(ng.wert) <= 0) { setFehler('Bitte einen Wert (€) angeben.'); return; }
    if (info.hatNutzungen && Math.round(num(ng.nutzungen_gesamt)) <= 0) { setFehler('Bitte die Anzahl der Nutzungen angeben.'); return; }
    setBusy('anlegen'); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('gutschein').insert({
        owner_user_id: uid, code: ng.code.trim() || neuerCode(), art: ng.art, mwst_typ: ng.mwst_typ,
        wert: num(ng.wert), mwst_satz: num(ng.mwst_satz) || 19,
        nutzungen_gesamt: info.hatNutzungen ? Math.round(num(ng.nutzungen_gesamt)) : null,
        leistung_text: ng.leistung_text.trim() || null,
        kontakt_id: ng.kontakt_id || null, empfaenger_name: ng.empfaenger_name.trim() || null,
        anlass: ng.anlass.trim() || null, ausgestellt_am: ng.ausgestellt_am,
        gueltig_bis: ng.gueltig_bis || null, status: 'aktiv', notiz: ng.notiz.trim() || null,
      }).select('id').single();
      if (error) throw error;
      try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      setNg({ ...LEER_NG, code: neuerCode() }); setNmExtra({});
      setOk('Gutschein angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const zielG = gutscheine.find((g) => g.id === einloeseZiel) || null;
  const zielLite = zielG ? lite(zielG) : null;
  const einloesePruef = useMemo(() => {
    if (!zielG || !zielLite) return null;
    return zielG.art === 'mehrfachkarte'
      ? pruefeEinloesungNutzung(zielLite, Math.round(num(einloeseWert)), new Date())
      : pruefeEinloesungBetrag(zielLite, num(einloeseWert), new Date());
  }, [zielG, zielLite, einloeseWert]);

  function einloeseStart(g: Gutschein) {
    setEinloeseZiel(g.id);
    setEinloeseWert(g.art === 'mehrfachkarte' ? '1' : '');
    setOk(null); setFehler(null);
  }

  async function einloeseBuchen() {
    if (!uid || !zielG || !einloesePruef?.ok) return;
    setBusy('einloesen'); setFehler(null); setOk(null);
    try {
      const istKarte = zielG.art === 'mehrfachkarte';
      const { error } = await supabase.from('gutschein_einloesung').insert({
        owner_user_id: uid, gutschein_id: zielG.id, datum: new Date().toISOString(),
        betrag: istKarte ? 0 : num(einloeseWert), nutzungen: istKarte ? Math.round(num(einloeseWert)) : 0,
        bemerkung: null,
      });
      if (error) throw error;
      setEinloeseZiel(null); setEinloeseWert(''); setOk('Einlösung gebucht.'); await laden_();
    } catch (err: unknown) { setFehler('Einlösung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stornieren(g: Gutschein) {
    setBusy(g.id); setFehler(null);
    try {
      const { error } = await supabase.from('gutschein').update({ status: 'storniert' }).eq('id', g.id);
      if (error) throw error;
      if (einloeseZiel === g.id) setEinloeseZiel(null);
      await laden_();
    } catch (err: unknown) { setFehler('Stornieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(g: Gutschein) {
    const l = lite(g);
    const wertText = g.art === 'mehrfachkarte'
      ? `${g.nutzungen_gesamt ?? 0} Nutzungen`
      : eur(g.wert);
    gutscheinPdf({
      aussteller: aussteller || 'Mein Betrieb',
      code: g.code,
      artLabel: gutscheinArtInfo(g.art).label,
      wertText,
      leistung: g.leistung_text || '',
      empfaenger: g.empfaenger_name || kontakte.find((k) => k.id === g.kontakt_id)?.name || '',
      anlass: g.anlass || '',
      ausgestelltAm: fmtDatum(g.ausgestellt_am),
      gueltigBis: fmtDatum(g.gueltig_bis),
      restText: g.art === 'mehrfachkarte'
        ? `${restNutzungen(g.nutzungen_gesamt || 0, l.nutzungen_verbraucht || 0)} von ${g.nutzungen_gesamt ?? 0}`
        : eur(restwert(g.wert, l.eingeloest || 0)),
    });
  }

  const kontaktName_ = (id: string | null) => kontakte.find((k) => k.id === id)?.name ?? null;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Verkaufsförderung</div>
      <h1 style={styles.h1}>🎁 Gutscheine & Pakete</h1>
      <p style={styles.sub}>Wertgutscheine, Mehrfachkarten (10er-Karte) und Leistungsgutscheine — mit Teil-Einlösung, live berechnetem Restwert und Verjährungs-Ampel (3 Jahre nach §195/§199 BGB). Einzweck- oder Mehrzweckgutschein je nach Steuerfall.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Aktive Gutscheine" value={String(kennzahlen.aktive)} accent={C.green} />
        <Kpi label="Offener Restwert" value={eur(kennzahlen.offenerRestwert)} accent={C.gold} />
        <Kpi label="Karten offen" value={String(kennzahlen.kartenOffen)} accent={C.cyan} />
        <Kpi label="Bald verfallend" value={String(kennzahlen.baldVerfallend)} accent={kennzahlen.baldVerfallend ? C.warn : C.text} />
        <Kpi label="Verfallen" value={String(kennzahlen.verfallen)} accent={kennzahlen.verfallen ? C.danger : C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Gutscheine" regel={augeGutscheine(kennzahlen)} />
        </div>
      )}

      {/* ---------- NEUER GUTSCHEIN ---------- */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neuen Gutschein ausstellen</div>
        <div style={styles.artRow}>
          {GUTSCHEIN_ARTEN.map((a) => (
            <button key={a.key} onClick={() => artWechsel(a.key)} style={{ ...styles.artBtn, ...(ng.art === a.key ? styles.artBtnAn : {}) }}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
        <div style={styles.grid}>
          <label style={styles.lab}>Code<input style={styles.inp} value={ng.code} onChange={(e) => setNg({ ...ng, code: e.target.value })} /></label>
          <label style={styles.lab}>Empfänger (Kontakt)
            <select style={styles.inp} value={ng.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
              <option value="">— kein Kontakt —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Empfänger (Freitext)<input style={styles.inp} value={ng.empfaenger_name} onChange={(e) => setNg({ ...ng, empfaenger_name: e.target.value })} /></label>

          {ng.art !== 'mehrfachkarte' && (
            <label style={styles.lab}>Wert (€, brutto)<input style={styles.inp} inputMode="decimal" value={ng.wert} onChange={(e) => setNg({ ...ng, wert: e.target.value })} /></label>
          )}
          {ng.art === 'mehrfachkarte' && (
            <>
              <label style={styles.lab}>Nutzungen gesamt<input style={styles.inp} inputMode="numeric" value={ng.nutzungen_gesamt} onChange={(e) => setNg({ ...ng, nutzungen_gesamt: e.target.value })} placeholder="z. B. 10" /></label>
              <label style={styles.lab}>Paketpreis (€, brutto, optional)<input style={styles.inp} inputMode="decimal" value={ng.wert} onChange={(e) => setNg({ ...ng, wert: e.target.value })} /></label>
            </>
          )}
          {(ng.art === 'mehrfachkarte' || ng.art === 'leistung') && (
            <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Leistung / Inhalt<input style={styles.inp} value={ng.leistung_text} onChange={(e) => setNg({ ...ng, leistung_text: e.target.value })} placeholder={ng.art === 'mehrfachkarte' ? 'z. B. 1 Waschgang je Nutzung' : 'z. B. Menü für 2 Personen'} /></label>
          )}

          <label style={styles.lab}>Steuerart
            <select style={styles.inp} value={ng.mwst_typ} onChange={(e) => setNg({ ...ng, mwst_typ: e.target.value as MwStTyp })}>
              {MWST_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          {ng.mwst_typ === 'einzweck' && (
            <label style={styles.lab}>MwSt.-Satz
              <select style={styles.inp} value={ng.mwst_satz} onChange={(e) => setNg({ ...ng, mwst_satz: e.target.value })}>
                <option value="19">19 %</option>
                <option value="7">7 %</option>
              </select>
            </label>
          )}
          <NurVoll><label style={styles.lab}>Anlass (optional)<input style={styles.inp} value={ng.anlass} onChange={(e) => setNg({ ...ng, anlass: e.target.value })} placeholder="z. B. Geburtstag" /></label></NurVoll>
          <label style={styles.lab}>Ausgestellt am<input type="date" style={styles.inp} value={ng.ausgestellt_am} onChange={(e) => ausstellDatum(e.target.value)} /></label>
          <NurVoll><label style={styles.lab}>Gültig bis (§195 BGB)<input type="date" style={styles.inp} value={ng.gueltig_bis} onChange={(e) => setNg({ ...ng, gueltig_bis: e.target.value })} /></label></NurVoll>
          <NurVoll><EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} /></NurVoll>
        </div>

        <div style={styles.hintBox}>
          {MWST_TYPEN.find((t) => t.key === ng.mwst_typ)?.hinweis}
          {vorschauSteuer && <> · <b style={{ color: C.gold }}>{eur(vorschauSteuer.netto)}</b> netto + {eur(vorschauSteuer.mwst)} USt ({vorschauSteuer.mwstSatz} %)</>}
          {' · gültig bis '}<b>{fmtDatum(ng.gueltig_bis)}</b>
        </div>
        <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'anlegen' ? 0.6 : 1 }} disabled={busy === 'anlegen'} onClick={gutscheinAnlegen}>＋ {info.label} ausstellen</button>
      </div>

      {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

      {/* ---------- EINLÖSE-PANEL ---------- */}
      {zielG && zielLite && (
        <div style={{ ...styles.card, marginTop: 16, borderColor: C.cyan }}>
          <div style={styles.cardTitel}>Einlösen · {zielG.code} <span style={{ color: C.textDim, fontWeight: 400 }}>({gutscheinArtInfo(zielG.art).label})</span></div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={styles.lab}>{zielG.art === 'mehrfachkarte' ? 'Nutzungen abbuchen' : 'Betrag einlösen (€)'}
              <input style={{ ...styles.inp, maxWidth: 200 }} inputMode={zielG.art === 'mehrfachkarte' ? 'numeric' : 'decimal'} value={einloeseWert} onChange={(e) => setEinloeseWert(e.target.value)} autoFocus />
            </label>
            <div style={{ fontSize: 'clamp(13px,1.13vw,18px)', color: einloesePruef?.ok ? C.green : C.danger, fontWeight: 700, paddingBottom: 10 }}>
              {zielG.art === 'mehrfachkarte'
                ? `Rest: ${restNutzungen(zielG.nutzungen_gesamt || 0, zielLite.nutzungen_verbraucht || 0)} Nutzungen`
                : `Restwert: ${eur(restwert(zielG.wert, zielLite.eingeloest || 0))}`}
              {einloeseWert && einloesePruef && (einloesePruef.ok ? ` → neu: ${zielG.art === 'mehrfachkarte' ? einloesePruef.neuerRest + ' Nutz.' : eur(einloesePruef.neuerRest)}` : ` · ${einloesePruef.grund}`)}
            </div>
            <button style={{ ...styles.primaer, opacity: (!einloesePruef?.ok || busy === 'einloesen') ? 0.5 : 1, marginBottom: 2 }} disabled={!einloesePruef?.ok || busy === 'einloesen'} onClick={einloeseBuchen}>✓ Einlösung buchen</button>
            <button style={{ ...styles.mini, marginBottom: 8 }} onClick={() => setEinloeseZiel(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* ---------- LISTE ---------- */}
      {laden ? <p style={styles.hint}>Lädt …</p> : (
        <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
          {gutscheine.length === 0 ? <Leerzustand icon="🎁" titel="Noch keine Gutscheine" text="Wert-, Mehrfach- oder Leistungsgutscheine ausgeben und einlösen." schritte={["Gutschein oben anlegen", "Art und Wert festlegen", "Einlösungen erfassen — Restwert rechnet sich live"]} /> : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Code / Art</th><th style={styles.th}>Empfänger</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Wert / Rest</th><th style={styles.th}>Gültig bis</th>
                <th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
              </tr></thead>
              <tbody>
                {gutscheine.map((g) => {
                  const l = lite(g);
                  const st = gutscheinStatus(l, new Date());
                  const ai = gutscheinArtInfo(g.art);
                  const rest = g.art === 'mehrfachkarte'
                    ? `${restNutzungen(g.nutzungen_gesamt || 0, l.nutzungen_verbraucht || 0)} / ${g.nutzungen_gesamt ?? 0}`
                    : `${eur(restwert(g.wert, l.eingeloest || 0))} / ${eur(g.wert)}`;
                  const tage = g.gueltig_bis ? tageBisVerfall(g.gueltig_bis, new Date()) : null;
                  const verfallFarbe = tage == null ? C.textDim : tage < 0 ? C.danger : tage <= BALD_VERFALL_TAGE ? C.warn : C.textDim;
                  const offen = st === 'aktiv';
                  return (
                    <tr key={g.id} style={{ opacity: (st === 'storniert' || st === 'eingeloest') ? 0.55 : 1 }}>
                      <td style={styles.td}><span style={{ fontWeight: 700 }}>{g.code}</span><div style={{ color: C.textDim, fontSize: 13 }}>{ai.icon} {ai.label}{g.leistung_text ? ` · ${g.leistung_text}` : ''}</div><EigeneFelderAnzeige felder={felder} werte={werteMap[g.id]} /></td>
                      <td style={styles.td}>{g.empfaenger_name || kontaktName_(g.kontakt_id) || '—'}{g.anlass ? <span style={{ color: C.textDim }}> · {g.anlass}</span> : ''}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{rest}</td>
                      <td style={{ ...styles.td, color: verfallFarbe }}>{fmtDatum(g.gueltig_bis)}{tage != null && tage >= 0 && tage <= BALD_VERFALL_TAGE ? <div style={{ fontSize: 12 }}>noch {tage} T</div> : ''}</td>
                      <td style={styles.td}><span style={{ ...styles.badge, color: STATUS_FARBE[st], borderColor: STATUS_FARBE[st] }}>{STATUS_LABEL[st]}</span></td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {offen && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === g.id} onClick={() => einloeseStart(g)}>Einlösen</button>}
                        <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(g)}>📄 PDF</button>
                        {g.status !== 'storniert' && <button style={styles.mini} disabled={busy === g.id} onClick={() => stornieren(g)}>Stornieren</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
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
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  artRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  artBtn: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  artBtnAn: { background: C.cyan, color: C.navy, borderColor: C.cyan },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  hintBox: { marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(12.5px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, marginBottom: 4, whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
