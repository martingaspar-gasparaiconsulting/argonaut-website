'use client';

// ============================================================
// ARGONAUT OS · Teil C · Singleton #3 · Assets & Freigaben / Proofing
// Kreativ-Assets mit Versionsständen + Kunden-Freigabe-Workflow.
// Reine Formeln aus lib/proofing (0 €, node-getestet).
// Pfad: app/dashboard/freigaben/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KATEGORIEN, VERSION_STATUS, FEEDBACK_TYPEN,
  kategorieLabel, versionStatusLabel, assetStatusLabel, feedbackTypLabel,
  naechsteVersion, assetStatus, zaehleProofing,
  type VersionLite,
} from '@/lib/proofing';
import { augeProofing } from '@/lib/auge';
import { proofingPdf } from '@/lib/proofingPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Asset = { id: string; titel: string; kunde: string | null; kategorie: string; notiz: string | null };
type Version = { id: string; asset_id: string; version_nr: number; beschreibung: string | null; datei_url: string | null; status: string; eingereicht_am: string | null };
type Feedback = { id: string; version_id: string; autor: string | null; typ: string; text: string | null; created_at: string };

function jetztIso() { return new Date().toISOString(); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function pct(n: number) { return `${(Number(n) * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`; }
const ST_FARBE: Record<string, string> = { freigegeben: C.green, aenderung: C.warn, abgelehnt: C.danger, in_pruefung: C.cyan, in_arbeit: C.textDim };

export default function FreigabenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versionen, setVersionen] = useState<Version[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [nAsset, setNAsset] = useState({ titel: '', kunde: '', kategorie: 'design' });
  const [nVersion, setNVersion] = useState<{ asset_id: string; beschreibung: string; datei_url: string } | null>(null);
  const [nFeedback, setNFeedback] = useState<{ version_id: string; autor: string; typ: string; text: string } | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, v, f] = await Promise.all([
        supabase.from('proof_asset').select('*').order('created_at', { ascending: false }),
        supabase.from('proof_version').select('*').order('version_nr', { ascending: false }),
        supabase.from('proof_feedback').select('*').order('created_at', { ascending: true }),
      ]);
      setAssets((a.data as Asset[]) ?? []);
      setVersionen((v.data as Version[]) ?? []);
      setFeedback((f.data as Feedback[]) ?? []);
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
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [meta.firmenname, meta.firma, meta.unternehmen, meta.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  const versProAsset = useMemo(() => {
    const map = new Map<string, Version[]>();
    for (const v of versionen) { const a = map.get(v.asset_id) || []; a.push(v); map.set(v.asset_id, a); }
    return map;
  }, [versionen]);
  const fbProVersion = useMemo(() => {
    const map = new Map<string, Feedback[]>();
    for (const f of feedback) { const a = map.get(f.version_id) || []; a.push(f); map.set(f.version_id, a); }
    return map;
  }, [feedback]);

  const kennzahlen = useMemo(() => zaehleProofing(assets, versionen as (VersionLite & { asset_id?: string })[]), [assets, versionen]);

  async function assetAnlegen() {
    if (!uid || !nAsset.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setBusy('asset'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('proof_asset').insert({
        owner_user_id: uid, titel: nAsset.titel.trim(), kunde: nAsset.kunde.trim() || null, kategorie: nAsset.kategorie,
      });
      if (error) throw error;
      setNAsset({ titel: '', kunde: '', kategorie: 'design' }); setOk('Asset angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function versionAnlegen() {
    if (!uid || !nVersion) return;
    const nr = naechsteVersion((versProAsset.get(nVersion.asset_id) || []) as VersionLite[]);
    setBusy('version'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('proof_version').insert({
        owner_user_id: uid, asset_id: nVersion.asset_id, version_nr: nr,
        beschreibung: nVersion.beschreibung.trim() || null, datei_url: nVersion.datei_url.trim() || null,
        status: 'in_pruefung', eingereicht_am: jetztIso(),
      });
      if (error) throw error;
      setNVersion(null); setOk(`Version ${nr} eingereicht.`); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function versionStatusSetzen(v: Version, status: string) {
    setBusy(v.id); setFehler(null);
    try {
      await supabase.from('proof_version').update({ status, eingereicht_am: status === 'in_pruefung' ? jetztIso() : v.eingereicht_am }).eq('id', v.id);
      await laden_();
    } catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function feedbackSpeichern() {
    if (!uid || !nFeedback) return;
    if (!nFeedback.text.trim() && nFeedback.typ === 'kommentar') { setFehler('Bitte einen Text angeben.'); return; }
    setBusy('fb'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('proof_feedback').insert({
        owner_user_id: uid, version_id: nFeedback.version_id, autor: nFeedback.autor.trim() || null, typ: nFeedback.typ, text: nFeedback.text.trim() || null,
      });
      if (error) throw error;
      // Entscheidungs-Feedback setzt den Versionsstatus.
      const neu = nFeedback.typ === 'freigabe' ? 'freigegeben' : nFeedback.typ === 'aenderung' ? 'aenderung' : nFeedback.typ === 'ablehnung' ? 'abgelehnt' : null;
      if (neu) await supabase.from('proof_version').update({ status: neu }).eq('id', nFeedback.version_id);
      setNFeedback(null); setOk('Feedback erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loesche(tabelle: string, id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from(tabelle).delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(a: Asset) {
    const vs = (versProAsset.get(a.id) || []).slice().sort((x, y) => x.version_nr - y.version_nr);
    const fbZeilen = vs.flatMap((v) => (fbProVersion.get(v.id) || []).map((f) => ({
      datum: fmtDatum(f.created_at), autor: f.autor || '', typ: `v${v.version_nr} · ${feedbackTypLabel(f.typ)}`, text: f.text || '',
    })));
    proofingPdf({
      aussteller: aussteller || 'Mein Betrieb',
      titel: a.titel, kunde: a.kunde || '', kategorie: kategorieLabel(a.kategorie),
      status: assetStatusLabel(assetStatus(vs as VersionLite[])),
      versionen: vs.map((v) => ({ version: `v${v.version_nr}`, datum: fmtDatum(v.eingereicht_am), status: versionStatusLabel(v.status), beschreibung: v.beschreibung || '' })),
      feedback: fbZeilen,
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Marketing</div>
      <h1 style={styles.h1}>✅ Freigaben &amp; Proofing</h1>
      <p style={styles.sub}>Kreativ-Assets (Design, Video, Text, Web, Print, Social) mit Versionsständen und Kunden-Freigabe. Jede Version geht in Prüfung, Feedback setzt den Status (Freigabe / Änderung / Ablehnung), Änderungen führen zur nächsten Version. Je Asset ein Freigabe-Protokoll als PDF.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPIs */}
      <div style={styles.kpis}>
        <Kpi label="Assets" value={String(kennzahlen.assets)} accent={C.text} />
        <Kpi label="In Prüfung" value={String(kennzahlen.inPruefung)} accent={kennzahlen.inPruefung ? C.cyan : C.textDim} />
        <Kpi label="Änderung offen" value={String(kennzahlen.offeneAenderungen)} accent={kennzahlen.offeneAenderungen ? C.warn : C.green} />
        <Kpi label="Freigegeben" value={String(kennzahlen.freigegeben)} accent={C.green} />
        <Kpi label="Freigabequote" value={pct(kennzahlen.freigabeQuote)} accent={C.gold} />
        <Kpi label="Ø Versionsschleifen" value={kennzahlen.schnittSchleifen.toLocaleString('de-DE', { maximumFractionDigits: 1 })} accent={C.text} />
      </div>
      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Freigaben & Proofing" regel={augeProofing(kennzahlen)} /></div>}

      {/* Neues Asset */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neues Asset</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Titel<input style={styles.inp} value={nAsset.titel} onChange={(e) => setNAsset({ ...nAsset, titel: e.target.value })} placeholder="z. B. Kampagnen-Keyvisual" /></label>
          <label style={styles.lab}>Kunde<input style={styles.inp} value={nAsset.kunde} onChange={(e) => setNAsset({ ...nAsset, kunde: e.target.value })} /></label>
          <label style={styles.lab}>Kategorie
            <select style={styles.inp} value={nAsset.kategorie} onChange={(e) => setNAsset({ ...nAsset, kategorie: e.target.value })}>
              {KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'asset' ? 0.6 : 1 }} disabled={busy === 'asset'} onClick={assetAnlegen}>＋ Asset</button>
      </div>

      {/* Asset-Karten */}
      {assets.length === 0 ? (
        <div style={styles.hint}>Noch keine Assets — leg das erste an und reiche eine Version zur Freigabe ein.</div>
      ) : assets.map((a) => {
        const vs = (versProAsset.get(a.id) || []).slice().sort((x, y) => y.version_nr - x.version_nr);
        const st = assetStatus(vs as VersionLite[]);
        return (
          <div key={a.id} style={{ ...styles.card, marginTop: 14 }}>
            <div style={styles.buchKopf}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'clamp(15px,1.3vw,20px)' }}>{a.titel} <span style={{ color: C.textDim, fontWeight: 400 }}>· {kategorieLabel(a.kategorie)}{a.kunde ? ` · ${a.kunde}` : ''}</span></div>
              </div>
              <span style={{ ...styles.statusPill, color: ST_FARBE[st] || C.textDim, borderColor: (ST_FARBE[st] || C.textDim) + '55' }}>{assetStatusLabel(st)}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {nVersion?.asset_id === a.id
                ? <button style={styles.mini} onClick={() => setNVersion(null)}>abbrechen</button>
                : <button style={styles.mini} onClick={() => setNVersion({ asset_id: a.id, beschreibung: '', datei_url: '' })}>＋ Version einreichen</button>}
              <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(a)} disabled={!vs.length}>📄 Freigabe-Protokoll</button>
              <button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === a.id} onClick={() => loesche('proof_asset', a.id)}>✕ Asset</button>
            </div>

            {nVersion && nVersion.asset_id === a.id && (
              <div style={{ ...styles.subCard, marginBottom: 10 }}>
                <div style={styles.grid}>
                  <label style={styles.lab}>Beschreibung<input style={styles.inp} value={nVersion.beschreibung} onChange={(e) => setNVersion({ ...nVersion, beschreibung: e.target.value })} placeholder="Was ist neu in dieser Version?" /></label>
                  <label style={styles.lab}>Datei-Link (URL)<input style={styles.inp} value={nVersion.datei_url} onChange={(e) => setNVersion({ ...nVersion, datei_url: e.target.value })} placeholder="https://…" /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'version' ? 0.6 : 1 }} disabled={busy === 'version'} onClick={versionAnlegen}>Version {naechsteVersion((versProAsset.get(a.id) || []) as VersionLite[])} einreichen</button>
              </div>
            )}

            {vs.length === 0 ? <div style={{ color: C.textDim, fontSize: 13 }}>Noch keine Version.</div> : vs.map((v) => {
              const fbs = fbProVersion.get(v.id) || [];
              return (
                <div key={v.id} style={styles.versionBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>v{v.version_nr} <span style={{ color: ST_FARBE[v.status] || C.textDim, fontWeight: 700 }}>· {versionStatusLabel(v.status)}</span>{v.eingereicht_am ? <span style={{ color: C.textDim, fontWeight: 400 }}> · {fmtDatum(v.eingereicht_am)}</span> : ''}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {v.datei_url && <a href={v.datei_url} target="_blank" rel="noreferrer" style={styles.link}>🔗 Datei</a>}
                      <select style={styles.selMini} value={v.status} onChange={(e) => versionStatusSetzen(v, e.target.value)} disabled={busy === v.id}>
                        {VERSION_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      {nFeedback?.version_id === v.id
                        ? <button style={styles.mini} onClick={() => setNFeedback(null)}>abbrechen</button>
                        : <button style={styles.mini} onClick={() => setNFeedback({ version_id: v.id, autor: '', typ: 'kommentar', text: '' })}>＋ Feedback</button>}
                      <button style={styles.miniX} disabled={busy === v.id} onClick={() => loesche('proof_version', v.id)}>✕</button>
                    </span>
                  </div>
                  {v.beschreibung && <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{v.beschreibung}</div>}

                  {fbs.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {fbs.map((f) => (
                        <div key={f.id} style={styles.fbZeile}>
                          <span><b style={{ color: ST_FARBE[f.typ === 'freigabe' ? 'freigegeben' : f.typ === 'ablehnung' ? 'abgelehnt' : f.typ === 'aenderung' ? 'aenderung' : 'in_pruefung'] || C.text }}>{feedbackTypLabel(f.typ)}</b>{f.autor ? ` · ${f.autor}` : ''}{f.text ? `: ${f.text}` : ''}</span>
                          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ color: C.textDim, fontSize: 12 }}>{fmtDatum(f.created_at)}</span><button style={styles.miniX} disabled={busy === f.id} onClick={() => loesche('proof_feedback', f.id)}>✕</button></span>
                        </div>
                      ))}
                    </div>
                  )}

                  {nFeedback && nFeedback.version_id === v.id && (
                    <div style={{ ...styles.subCard, marginTop: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <label style={styles.lab}>Von (Kunde/Prüfer)<input style={styles.inp} value={nFeedback.autor} onChange={(e) => setNFeedback({ ...nFeedback, autor: e.target.value })} /></label>
                        <label style={styles.lab}>Art
                          <select style={styles.inp} value={nFeedback.typ} onChange={(e) => setNFeedback({ ...nFeedback, typ: e.target.value })}>
                            {FEEDBACK_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <label style={{ ...styles.lab, marginTop: 8 }}>Anmerkung<textarea style={{ ...styles.inp, minHeight: 60, resize: 'vertical' }} value={nFeedback.text} onChange={(e) => setNFeedback({ ...nFeedback, text: e.target.value })} /></label>
                      <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>{nFeedback.typ !== 'kommentar' ? `Setzt Version v${v.version_nr} auf „${nFeedback.typ === 'freigabe' ? 'freigegeben' : nFeedback.typ === 'aenderung' ? 'Änderung gewünscht' : 'abgelehnt'}".` : 'Reiner Kommentar — ändert den Status nicht.'}</div>
                      <button style={{ ...styles.primaer, marginTop: 8, opacity: busy === 'fb' ? 0.6 : 1 }} disabled={busy === 'fb'} onClick={feedbackSpeichern}>Feedback speichern</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
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
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 900, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  buchKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  statusPill: { border: '1px solid', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  versionBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginTop: 8 },
  fbZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(143,163,190,0.08)', fontSize: 'clamp(12.5px,1.05vw,16px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  selMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  link: { color: C.cyan, textDecoration: 'none', fontSize: 13, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '5px 9px' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
