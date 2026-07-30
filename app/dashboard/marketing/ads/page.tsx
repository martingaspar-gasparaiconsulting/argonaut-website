'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ADS_PLATTFORMEN, ADS_ZIELE, ADS_STATUS, plattformFuer, plattformenNachGruppe,
  zielFuer, gesamtBudget, laufzeitTage, budgetProblemeFuerKanal, validiereKampagne,
  zaehleKampagnen, zaehleAdsKanaele, formatEuro, zuBetrag,
  VERBINDBARE_ADS, adsVerbindungFeld,
} from '@/lib/ads';
import { sichereMedienUrl } from '@/lib/landingpages';

// ============================================================
// ARGONAUT OS · MARKETING · Ads (Paket 1 · Fundament)
// Kampagnen-Editor (Ziel + Budget/Laufzeit + Zielgruppe + Text/Bild + Kanäle,
// Live-Budget-Vorschau + Validierung) + Werbekanal-Verwaltung +
// aufklappbare Transparenz-Box (Kosten/Freigaben je Plattform).
// Das echte Verbinden (Werbekonto) + Schalten kommen in den Folgepaketen (P2+).
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Kampagne = {
  id: string;
  name: string;
  ziel: string | null;
  kanaele: string[] | null;
  tagesbudget: number | null;
  start_datum: string | null;
  end_datum: string | null;
  zielgruppe: string | null;
  ueberschrift: string | null;
  text: string | null;
  ziel_url: string | null;
  medien_urls: string[] | null;
  status: string;
  created_at: string;
};

type KanalRow = { plattform: string; aktiv: boolean; verbunden: boolean; konto_name: string | null; geprueft_am: string | null };
type VStatus = { verbunden: boolean; konto_id: string; konto_name: string; hatToken: boolean };
const V_LEER: VStatus = { verbunden: false, konto_id: '', konto_name: '', hatToken: false };

function fmtDatum(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdsSeite() {
  const [infoOffen, setInfoOffen] = useState(false);

  const [liste, setListe] = useState<Kampagne[]>([]);
  const [kanaele, setKanaele] = useState<KanalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Editor
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eZiel, setEZiel] = useState('');
  const [eKanaele, setEKanaele] = useState<string[]>([]);
  const [eBudget, setEBudget] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnde, setEEnde] = useState('');
  const [eZielgruppe, setEZielgruppe] = useState('');
  const [eUeberschrift, setEUeberschrift] = useState('');
  const [eText, setEText] = useState('');
  const [eZielUrl, setEZielUrl] = useState('');
  const [eBild, setEBild] = useState('');
  const [eStatus, setEStatus] = useState<'entwurf' | 'bereit'>('entwurf');
  const [eBusy, setEBusy] = useState(false);
  const [eMeldung, setEMeldung] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  // Kanal-Verwaltung
  const [kanalBusy, setKanalBusy] = useState<string | null>(null);

  // Schalten (Meta)
  const [schaltBusyId, setSchaltBusyId] = useState<string | null>(null);
  const [schaltMeldung, setSchaltMeldung] = useState<string | null>(null);

  // Werbekonto-Verbindung (Meta/Google/LinkedIn/TikTok)
  const [verb, setVerb] = useState<Record<string, VStatus>>({});
  const [vEncKey, setVEncKey] = useState(true);
  const [vKonto, setVKonto] = useState<Record<string, string>>({});
  const [vKontoName, setVKontoName] = useState<Record<string, string>>({});
  const [vToken, setVToken] = useState<Record<string, string>>({});
  const [vBusy, setVBusy] = useState<string | null>(null);
  const [vMeldung, setVMeldung] = useState<Record<string, string | null>>({});

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const [rK, rC, rV] = await Promise.all([
        fetch('/api/marketing/ads-kampagnen'),
        fetch('/api/marketing/ads-kanaele'),
        fetch('/api/marketing/ads-verbindung'),
      ]);
      const jK = await rK.json();
      const jC = await rC.json();
      const jV = await rV.json();
      if (jC?.ok) setKanaele((jC.liste as KanalRow[]) || []);
      if (jV?.ok) {
        const st = (k: string) => (jV[k] as VStatus) || V_LEER;
        const neu: Record<string, VStatus> = {};
        VERBINDBARE_ADS.forEach((k) => { neu[k] = st(k); });
        setVerb(neu);
        setVEncKey(jV.encKeyBereit !== false);
        setVKonto((prev) => { const o: Record<string, string> = {}; VERBINDBARE_ADS.forEach((k) => { o[k] = st(k).konto_id; }); return { ...o, ...prev }; });
        setVKontoName((prev) => { const o: Record<string, string> = {}; VERBINDBARE_ADS.forEach((k) => { o[k] = st(k).konto_name; }); return { ...o, ...prev }; });
        setVToken({});
      }
      if (!rK.ok || !jK?.ok) setFehler(jK?.error || 'Laden fehlgeschlagen.');
      else setListe(jK.liste as Kampagne[]);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  const kpi = useMemo(() => zaehleKampagnen(liste), [liste]);
  const kanalKpi = useMemo(() => zaehleAdsKanaele(kanaele), [kanaele]);

  const budgetZahl = zuBetrag(eBudget);
  const tage = useMemo(() => laufzeitTage(eStart, eEnde), [eStart, eEnde]);
  const gesamt = useMemo(() => gesamtBudget(budgetZahl, eStart, eEnde), [budgetZahl, eStart, eEnde]);

  const pruef = useMemo(
    () => validiereKampagne({ name: eName, ziel: eZiel || null, kanaele: eKanaele, tagesBudget: budgetZahl, startDatum: eStart || null, endDatum: eEnde || null }),
    [eName, eZiel, eKanaele, budgetZahl, eStart, eEnde],
  );

  // Budget-Warnungen je gewaehltem Kanal (weich, informativ).
  const budgetWarnungen = useMemo(() => {
    const out: string[] = [];
    for (const id of eKanaele) out.push(...budgetProblemeFuerKanal(id, budgetZahl));
    return out;
  }, [eKanaele, budgetZahl]);

  const kanalAktiv = (id: string) => kanaele.find((k) => k.plattform === id)?.aktiv === true;

  function neueKampagne() {
    setEditId(null); setEName(''); setEZiel(''); setEKanaele([]); setEBudget('');
    setEStart(''); setEEnde(''); setEZielgruppe(''); setEUeberschrift(''); setEText('');
    setEZielUrl(''); setEBild(''); setEStatus('entwurf'); setEMeldung(null);
  }
  function bearbeiten(k: Kampagne) {
    setEditId(k.id);
    setEName(k.name || '');
    setEZiel(k.ziel || '');
    setEKanaele(Array.isArray(k.kanaele) ? k.kanaele : []);
    setEBudget(k.tagesbudget != null ? String(k.tagesbudget).replace('.', ',') : '');
    setEStart(k.start_datum || '');
    setEEnde(k.end_datum || '');
    setEZielgruppe(k.zielgruppe || '');
    setEUeberschrift(k.ueberschrift || '');
    setEText(k.text || '');
    setEZielUrl(k.ziel_url || '');
    setEBild(Array.isArray(k.medien_urls) && k.medien_urls[0] ? k.medien_urls[0] : '');
    setEStatus(k.status === 'bereit' ? 'bereit' : 'entwurf');
    setEMeldung(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toggleEditorKanal(id: string) {
    setEKanaele((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function bildHochladen(datei: File) {
    setUploadBusy(true); setEMeldung(null);
    try {
      const fd = new FormData();
      fd.append('datei', datei);
      const res = await fetch('/api/marketing/lp-medien', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j?.ok) setEMeldung(j?.error || 'Upload fehlgeschlagen.');
      else setEBild(j.url);
    } catch { setEMeldung('Upload fehlgeschlagen.'); }
    finally { setUploadBusy(false); if (dateiRef.current) dateiRef.current.value = ''; }
  }

  async function speichereKampagne() {
    if (!pruef.ok) { setEMeldung(pruef.fehler.join(' ')); return; }
    setEBusy(true); setEMeldung(null);
    const bild = sichereMedienUrl(eBild);
    try {
      const res = await fetch('/api/marketing/ads-kampagnen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editId, name: eName, ziel: eZiel || null, kanaele: eKanaele,
          tagesbudget: budgetZahl, start_datum: eStart || null, end_datum: eEnde || null,
          zielgruppe: eZielgruppe, ueberschrift: eUeberschrift, text: eText, ziel_url: eZielUrl,
          medien_urls: bild ? [bild] : [], status: eStatus,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setEMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { neueKampagne(); laden(); }
    } catch { setEMeldung('Speichern fehlgeschlagen.'); }
    finally { setEBusy(false); }
  }

  async function loeschen(k: Kampagne) {
    if (!confirm('Diese Kampagne wirklich löschen?')) return;
    const res = await fetch(`/api/marketing/ads-kampagnen?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { alert('Löschen fehlgeschlagen.'); return; }
    if (editId === k.id) neueKampagne();
    laden();
  }

  async function toggleKanalAktiv(id: string) {
    const neu = !kanalAktiv(id);
    setKanalBusy(id);
    try {
      const res = await fetch('/api/marketing/ads-kanaele', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plattform: id, aktiv: neu }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) {
        setKanaele((prev) => {
          const rest = prev.filter((k) => k.plattform !== id);
          return [...rest, { plattform: id, aktiv: neu, verbunden: false, konto_name: null, geprueft_am: null }];
        });
      }
    } catch { /* still */ }
    finally { setKanalBusy(null); }
  }

  async function verbinde(plattform: string) {
    setVBusy(plattform); setVMeldung((m) => ({ ...m, [plattform]: null }));
    try {
      const res = await fetch('/api/marketing/ads-verbindung', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plattform, konto_id: vKonto[plattform] || '', konto_name: vKontoName[plattform] || '', token: vToken[plattform] || '' }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) setVMeldung((m) => ({ ...m, [plattform]: j?.error || 'Speichern fehlgeschlagen.' }));
      else { setVMeldung((m) => ({ ...m, [plattform]: '✓ Verbunden.' })); setVToken((t) => ({ ...t, [plattform]: '' })); laden(); }
    } catch { setVMeldung((m) => ({ ...m, [plattform]: 'Speichern fehlgeschlagen.' })); }
    finally { setVBusy(null); }
  }
  async function trenne(plattform: string) {
    if (!confirm('Verbindung wirklich trennen? Der gespeicherte Zugang wird entfernt.')) return;
    setVBusy(plattform); setVMeldung((m) => ({ ...m, [plattform]: null }));
    try {
      const res = await fetch(`/api/marketing/ads-verbindung?plattform=${encodeURIComponent(plattform)}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j?.ok) setVMeldung((m) => ({ ...m, [plattform]: j?.error || 'Trennen fehlgeschlagen.' }));
      else { setVMeldung((m) => ({ ...m, [plattform]: null })); laden(); }
    } catch { setVMeldung((m) => ({ ...m, [plattform]: 'Trennen fehlgeschlagen.' })); }
    finally { setVBusy(null); }
  }

  async function schalten(k: Kampagne, aktion: 'schalten' | 'aktivieren' | 'pausieren' | 'beenden') {
    const fragen: Record<string, string> = {
      schalten: `Kampagne „${k.name}" jetzt auf den verbundenen Werbekanälen anlegen? Sie wird überall zunächst PAUSIERT angelegt — es fließt noch kein Budget.`,
      aktivieren: `Kampagne „${k.name}" AKTIV schalten? Ab jetzt wird das Tagesbudget ausgegeben.`,
      pausieren: `Kampagne „${k.name}" pausieren?`,
      beenden: `Kampagne „${k.name}" beenden (archivieren)?`,
    };
    if (!confirm(fragen[aktion])) return;
    setSchaltBusyId(k.id); setSchaltMeldung(null);
    try {
      const res = await fetch('/api/marketing/ads-schalten', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kampagne_id: k.id, aktion }),
      });
      const j = await res.json();
      const fehlerTxt = Array.isArray(j?.fehler) && j.fehler.length ? ` (${j.fehler.join('; ')})` : '';
      if (!res.ok || !j?.ok) setSchaltMeldung((j?.error || (Array.isArray(j?.fehler) ? j.fehler.join('; ') : 'Aktion fehlgeschlagen.')) || 'Aktion fehlgeschlagen.');
      else if (aktion === 'schalten') setSchaltMeldung(`✓ Auf ${j.angelegt} Kanal${j.angelegt === 1 ? '' : 'en'} angelegt (pausiert). Zum Ausspielen „Aktiv schalten".${fehlerTxt}`);
      else setSchaltMeldung(`✓ ${aktion === 'aktivieren' ? 'Aktiv geschaltet' : aktion === 'pausieren' ? 'Pausiert' : 'Beendet'} auf ${j.geaendert} Kanal${j.geaendert === 1 ? '' : 'en'}.${fehlerTxt}`);
      laden();
    } catch { setSchaltMeldung('Aktion fehlgeschlagen.'); }
    finally { setSchaltBusyId(null); }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              📢 Ads
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Bezahlte Werbung planen — Ziel, Budget und Kanäle festlegen, als Entwurf sichern oder für das Schalten bereitstellen.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zum Marketing</a>
            <a href="/dashboard/marketing/ads/auswertung" style={{ background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>📊 Auswertung</a>
            <a href="/dashboard/marketing/ads/kosten" style={{ background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>💶 Kosten</a>
            {editId && (
              <button onClick={neueKampagne} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: 'pointer' }}>+ Neue Kampagne</button>
            )}
          </div>
        </div>

        {/* Transparenz-Box: Kanäle, Kosten & Freigaben (aufklappbar) */}
        <div style={{ background: C.navy2, borderRadius: 14, border: `1px solid ${C.cyan}`, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={() => setInfoOffen((o) => !o)} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', color: '#fff', fontFamily: 'var(--font-dm-sans), sans-serif' }}>
            <span style={{ fontWeight: 700, color: C.cyan, fontSize: 'clamp(15px, 1.35vw, 21px)' }}>ℹ️ Werbekanäle, Kosten &amp; Freigaben — was jede Plattform braucht</span>
            <span style={{ color: C.cyan, fontSize: 20 }}>{infoOffen ? '▲' : '▼'}</span>
          </button>
          {infoOffen && (
            <div style={{ padding: '0 22px 20px', fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                ARGONAUT schaltet Ihre Anzeigen <strong style={{ color: '#fff' }}>direkt</strong> über Ihr eigenes Werbekonto — <strong style={{ color: '#fff' }}>ohne Zwischendienst</strong>, Ihre Daten bleiben im Haus.
                Jedes Werbekonto wird einmalig verbunden (kommt im nächsten Schritt). Das <strong style={{ color: '#fff' }}>Werbebudget</strong> rechnet die jeweilige Plattform direkt mit Ihnen ab — ARGONAUT nimmt darauf keinen Aufschlag. Die Mindestbudgets sind Richtwerte (Stand&nbsp;07/2026, plattform- und länderabhängig).
              </p>
              {(['kern', 'schwanz'] as const).map((g) => (
                <div key={g} style={{ marginBottom: 6 }}>
                  <div style={{ color: g === 'kern' ? C.green : C.warn, fontWeight: 700, margin: '10px 0 6px' }}>
                    {g === 'kern' ? 'Kern-Kanäle (verbreitet, empfohlen)' : 'Weitere Kanäle (mit Audit/Hürde)'}
                  </div>
                  {plattformenNachGruppe(g).map((p) => (
                    <div key={p.id} style={{ background: C.navy, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>{p.icon} {p.name}</div>
                      <div style={{ marginBottom: 4 }}>{p.apiKurz}</div>
                      <div style={{ color: C.gold }}>💶 {p.kostenKurz}</div>
                      <div style={{ marginBottom: 4 }}>🔑 {p.freigabeKurz}</div>
                      <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontSize: 'clamp(12px, 1vw, 15px)' }}>Offizielle Doku ↗</a>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 8 }}>So geht&apos;s</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            1. Kampagne benennen, Ziel und Werbekanäle wählen. 2. Tagesbudget und Laufzeit festlegen — ARGONAUT rechnet das Gesamtbudget aus und warnt, wenn ein Kanal mehr verlangt.
            3. Zielgruppe, Anzeigentext und optional ein Bild ergänzen. 4. Als <strong style={{ color: '#fff' }}>Entwurf</strong> sichern oder <strong style={{ color: '#fff' }}>bereit zum Schalten</strong> markieren. Das echte Ausspielen folgt, sobald das Werbekonto verbunden ist.
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Kampagnen', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Entwürfe', wert: kpi.entwurf, farbe: C.gold },
            { label: 'Bereit', wert: kpi.bereit, farbe: C.green },
            { label: 'Aktive Kanäle', wert: kanalKpi.aktiv, farbe: C.warn },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{kp.label}</div>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: `1px solid ${editId ? C.cyan : 'rgba(255,255,255,0.08)'}`, marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>
            {editId ? 'Kampagne bearbeiten' : 'Neue Kampagne'}
          </div>

          <label style={lbl}>Name der Kampagne</label>
          <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="z. B. Herbst-Aktion Brennholz" style={input} />
          <div style={{ marginBottom: 16 }} />

          {/* Ziel */}
          <label style={lbl}>Ziel</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            {ADS_ZIELE.map((z) => {
              const an = eZiel === z.id;
              return (
                <button key={z.id} onClick={() => setEZiel(an ? '' : z.id)}
                  style={{ background: an ? C.cyan : 'transparent', color: an ? C.navy : C.textDim, border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.15)'}`, borderRadius: 18, padding: '6px 14px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', fontWeight: an ? 700 : 400, cursor: 'pointer' }}>
                  {z.label}
                </button>
              );
            })}
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            {zielFuer(eZiel)?.hinweis || 'Wählen Sie das Hauptziel dieser Kampagne.'}
          </p>

          {/* Budget + Laufzeit */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={lbl}>Tagesbudget (€)</label>
              <input value={eBudget} onChange={(e) => setEBudget(e.target.value)} placeholder="z. B. 15" inputMode="decimal" style={input} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={lbl}>Start</label>
              <input type="date" value={eStart} onChange={(e) => setEStart(e.target.value)} style={input} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={lbl}>Ende</label>
              <input type="date" value={eEnde} onChange={(e) => setEEnde(e.target.value)} style={input} />
            </div>
          </div>
          <div style={{ margin: '6px 0 16px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)', color: C.textDim }}>
            {gesamt != null && tage != null ? (
              <span>Geschätztes Gesamtbudget: <strong style={{ color: C.green }}>{formatEuro(gesamt)}</strong> ({formatEuro(budgetZahl)}/Tag × {tage} Tag{tage === 1 ? '' : 'e'}).</span>
            ) : budgetZahl > 0 ? (
              <span>{formatEuro(budgetZahl)}/Tag — für das Gesamtbudget bitte Start und Ende wählen.</span>
            ) : (
              <span>Tagesbudget eingeben — mit Start und Ende rechnet ARGONAUT das Gesamtbudget aus.</span>
            )}
          </div>

          {/* Kanäle */}
          <label style={{ ...lbl, marginTop: 6 }}>Werbekanäle</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {ADS_PLATTFORMEN.map((p) => {
              const an = eKanaele.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggleEditorKanal(p.id)}
                  style={{ background: an ? C.cyan : 'transparent', color: an ? C.navy : C.textDim, border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.15)'}`, borderRadius: 18, padding: '6px 14px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', fontWeight: an ? 700 : 400, cursor: 'pointer' }}>
                  {p.icon} {p.name}
                </button>
              );
            })}
          </div>
          {budgetWarnungen.length > 0 && (
            <div style={{ marginBottom: 14, background: 'rgba(224,162,76,0.1)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '10px 14px' }}>
              {budgetWarnungen.map((w, i) => (
                <div key={i} style={{ fontFamily: 'DM Sans, sans-serif', color: C.warn, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>⚠️ {w}</div>
              ))}
            </div>
          )}
          {budgetWarnungen.length === 0 && <div style={{ marginBottom: 14 }} />}

          {/* Zielgruppe */}
          <label style={lbl}>Zielgruppe (frei beschrieben)</label>
          <textarea value={eZielgruppe} onChange={(e) => setEZielgruppe(e.target.value)} rows={2} placeholder={'z. B. Hausbesitzer im Umkreis 30 km, 30–65 Jahre, Interesse an Heizen mit Holz'} style={{ ...input, resize: 'vertical' }} />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 16px', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            In diesem Schritt als Notiz. Die genaue Zielgruppen-Steuerung (Region, Alter, Interessen) folgt beim Verbinden des Werbekontos.
          </p>

          {/* Anzeige-Inhalt */}
          <label style={lbl}>Überschrift (optional)</label>
          <input value={eUeberschrift} onChange={(e) => setEUeberschrift(e.target.value)} placeholder="z. B. Trockenes Brennholz – jetzt vorbestellen" style={input} />
          <div style={{ marginBottom: 16 }} />

          <label style={lbl}>Anzeigentext</label>
          <textarea value={eText} onChange={(e) => setEText(e.target.value)} rows={4} placeholder={'Der Text Ihrer Anzeige. Z. B. „Ofenfertiges Buchenholz aus der Region – Lieferung frei Haus. Jetzt für den Winter sichern."'} style={{ ...input, resize: 'vertical' }} />
          <div style={{ marginBottom: 16 }} />

          <label style={lbl}>Ziel-URL (wohin die Anzeige führt)</label>
          <input value={eZielUrl} onChange={(e) => setEZielUrl(e.target.value)} placeholder="https://www.ihre-seite.de/aktion" inputMode="url" style={input} />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 16px', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            Für das echte Schalten nötig — z. B. Ihre Landingpage oder Startseite. Kann als Entwurf noch leer bleiben.
          </p>

          {/* Bild */}
          <label style={lbl}>Anzeigenbild (optional)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            {eBild ? (
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={eBild} alt="" style={{ width: 120, height: 84, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }} />
                <button onClick={() => setEBild('')} title="Entfernen"
                  style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: C.danger, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>×</button>
              </div>
            ) : (
              <button onClick={() => dateiRef.current?.click()} disabled={uploadBusy}
                style={{ width: 120, height: 84, borderRadius: 10, background: C.navy, border: '1px dashed rgba(255,255,255,0.25)', color: C.textDim, cursor: uploadBusy ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
                {uploadBusy ? '…' : '+ Bild'}
              </button>
            )}
            <input ref={dateiRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) bildHochladen(f); }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(11px, 1vw, 14px)' }}>JPG, PNG oder WebP, bis 6 MB.</span>
          </div>

          {/* Status */}
          <label style={{ ...lbl, marginTop: 6 }}>Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            {(['entwurf', 'bereit'] as const).map((s) => (
              <button key={s} onClick={() => setEStatus(s)}
                style={{ background: eStatus === s ? C.gold : 'transparent', color: eStatus === s ? C.navy : C.textDim, border: `1px solid ${eStatus === s ? C.gold : 'rgba(255,255,255,0.15)'}`, borderRadius: 18, padding: '6px 16px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', fontWeight: eStatus === s ? 700 : 400, cursor: 'pointer' }}>
                {s === 'entwurf' ? '📝 Als Entwurf' : '✅ Bereit zum Schalten'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={speichereKampagne} disabled={eBusy || !pruef.ok}
              style={{ ...btnGold, opacity: (eBusy || !pruef.ok) ? 0.5 : 1, cursor: (eBusy || !pruef.ok) ? 'not-allowed' : 'pointer' }}>
              {eBusy ? 'Speichere…' : editId ? 'Änderungen speichern' : (eStatus === 'bereit' ? 'Kampagne bereitstellen' : 'Als Entwurf speichern')}
            </button>
            {editId && <button onClick={neueKampagne} style={btnGhost}>Abbrechen</button>}
            {!pruef.ok && (eName.trim() || eKanaele.length > 0) && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.warn, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{pruef.fehler[0]}</span>
            )}
            {eMeldung && <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{eMeldung}</span>}
          </div>
        </div>

        {/* Verbindungen — Werbekonten */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 6 }}>Verbindungen — Werbekonten</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>
            Verbinden Sie Ihr Werbekonto je Plattform. Der Zugangs-Token wird <strong style={{ color: '#fff' }}>verschlüsselt</strong> gespeichert und nie wieder angezeigt. Die genaue Schritt-für-Schritt-Einrichtung erhalten Sie separat.
          </p>

          {!vEncKey && (
            <div style={{ background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
              <strong style={{ color: C.warn }}>⚠️ Sicherheits-Schlüssel fehlt.</strong> Zum sicheren Speichern des Tokens muss einmalig die Umgebungsvariable <strong style={{ color: '#fff' }}>APP_ENC_KEY</strong> gesetzt werden. Danach lässt sich die Verbindung speichern.
            </div>
          )}

          <div style={{ display: 'grid', gap: 14 }}>
            {VERBINDBARE_ADS.map((id) => {
              const p = plattformFuer(id)!;
              const feld = adsVerbindungFeld(id)!;
              const st = verb[id] || V_LEER;
              return (
                <div key={id} style={{ background: C.navy, border: `1px solid ${st.verbunden ? C.green : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.3vw, 20px)' }}>{p.icon} {p.name}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: st.verbunden ? C.green : C.textDim, border: `1px solid ${st.verbunden ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 12px' }}>{st.verbunden ? '✓ Verbunden' : 'Nicht verbunden'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={lbl}>{feld.kontoLabel}</label>
                      <input value={vKonto[id] ?? ''} onChange={(e) => setVKonto((v) => ({ ...v, [id]: e.target.value }))} placeholder="z. B. act_1234567890" style={input} />
                    </div>
                    <div>
                      <label style={lbl}>Anzeigename (optional)</label>
                      <input value={vKontoName[id] ?? ''} onChange={(e) => setVKontoName((v) => ({ ...v, [id]: e.target.value }))} placeholder="z. B. Schäfer Holzernte" style={input} />
                    </div>
                  </div>
                  <label style={lbl}>{feld.tokenLabel}</label>
                  <input type="password" value={vToken[id] ?? ''} onChange={(e) => setVToken((v) => ({ ...v, [id]: e.target.value }))} placeholder={st.hatToken ? '•••••••• (gespeichert — zum Ändern neu eingeben)' : 'hier einfügen'} style={{ ...input, maxWidth: 460 }} />
                  <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 12px', fontSize: 'clamp(11px, 1vw, 14px)' }}>{feld.kontoHinweis}</p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => verbinde(id)} disabled={vBusy === id} style={{ ...btnGold, opacity: vBusy === id ? 0.6 : 1, cursor: vBusy === id ? 'wait' : 'pointer' }}>{vBusy === id ? 'Speichere…' : st.verbunden ? 'Zugang aktualisieren' : 'Verbinden'}</button>
                    {st.verbunden && <button onClick={() => trenne(id)} disabled={vBusy === id} style={btn(C.danger)}>Trennen</button>}
                    {vMeldung[id] && <span style={{ fontFamily: 'DM Sans, sans-serif', color: vMeldung[id]!.startsWith('✓') ? C.green : C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{vMeldung[id]}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '14px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            Sobald verbunden, kann ARGONAUT im nächsten Schritt Ihre Kampagnen direkt über dieses Werbekonto schalten und das Budget steuern.
          </p>
        </div>

        {/* Werbekanal-Verwaltung */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 6 }}>Werbekanal-Verwaltung</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>
            Merken Sie vor, über welche Plattformen Sie werben möchten. Das eigentliche Verbinden des Werbekontos (einmalig je Kanal) kommt im nächsten Schritt.
          </p>
          {(['kern', 'schwanz'] as const).map((g) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ color: g === 'kern' ? C.green : C.warn, fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 'clamp(13px, 1.1vw, 17px)', margin: '6px 0 8px' }}>
                {g === 'kern' ? 'Kern-Kanäle' : 'Weitere Kanäle'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {plattformenNachGruppe(g).map((p) => {
                  const an = kanalAktiv(p.id);
                  const istVerbunden = verb[p.id]?.verbunden === true;
                  const statusText = istVerbunden ? '✓ verbunden' : an ? 'vorgemerkt · verbinden folgt' : 'nicht vorgemerkt';
                  return (
                    <div key={p.id} style={{ background: C.navy, border: `1px solid ${istVerbunden ? C.green : an ? 'rgba(76,175,125,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.icon} {p.name}</div>
                        <div style={{ fontFamily: 'DM Sans, sans-serif', color: istVerbunden ? C.green : C.textDim, fontSize: 12 }}>{statusText}</div>
                      </div>
                      <button onClick={() => toggleKanalAktiv(p.id)} disabled={kanalBusy === p.id}
                        style={{ flexShrink: 0, background: an ? 'transparent' : C.green, color: an ? C.textDim : C.navy, border: `1px solid ${an ? 'rgba(255,255,255,0.2)' : C.green}`, borderRadius: 8, padding: '6px 12px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: kanalBusy === p.id ? 'wait' : 'pointer' }}>
                        {kanalBusy === p.id ? '…' : an ? 'Entfernen' : 'Vormerken'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Kampagnen-Liste */}
        <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>Ihre Kampagnen</div>
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>📢</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: 0 }}>Noch keine Kampagne. Legen Sie oben Ihre erste an.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {liste.map((k) => {
              const urls = Array.isArray(k.medien_urls) ? k.medien_urls : [];
              const bild = urls[0];
              const statusLabel = ADS_STATUS.find((s) => s.id === k.status)?.label || 'Entwurf';
              const statusFarbe = k.status === 'aktiv' ? C.green : k.status === 'bereit' ? C.cyan : k.status === 'pausiert' ? C.warn : k.status === 'beendet' ? C.textDim : C.gold;
              const g = gesamtBudget(k.tagesbudget, k.start_datum, k.end_datum);
              return (
                <div key={k.id} style={{ background: C.navy2, borderRadius: 14, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {bild && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bild} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)' }}>{k.name}</span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: statusFarbe, border: `1px solid ${statusFarbe}`, borderRadius: 10, padding: '1px 10px' }}>{statusLabel}</span>
                      {(k.kanaele || []).map((id) => plattformFuer(id)).filter(Boolean).map((p) => (
                        <span key={p!.id} title={p!.name} style={{ fontSize: 15 }}>{p!.icon}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', color: C.textDim, marginBottom: k.text ? 6 : 0 }}>
                      {zielFuer(k.ziel) && <span>🎯 {zielFuer(k.ziel)!.label}</span>}
                      {k.tagesbudget != null && k.tagesbudget > 0 && <span>💶 {formatEuro(k.tagesbudget)}/Tag{g != null ? ` · ${formatEuro(g)} gesamt` : ''}</span>}
                      {(k.start_datum || k.end_datum) && <span>🗓 {fmtDatum(k.start_datum) || '—'} – {fmtDatum(k.end_datum) || '—'}</span>}
                    </div>
                    {k.text && (
                      <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#dbe4f0', fontSize: 'clamp(13px, 1.1vw, 17px)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {k.ueberschrift ? <strong style={{ color: '#fff' }}>{k.ueberschrift}: </strong> : null}{k.text}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    {(k.kanaele || []).some((id) => ['meta', 'google', 'linkedin', 'tiktok'].includes(id)) && (() => {
                      const busy = schaltBusyId === k.id;
                      const b = (label: string, farbe: string, akt: 'schalten' | 'aktivieren' | 'pausieren' | 'beenden') => (
                        <button onClick={() => schalten(k, akt)} disabled={busy} style={{ ...btn(farbe), opacity: busy ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer' }}>{busy ? '…' : label}</button>
                      );
                      if (k.status === 'entwurf' || k.status === 'bereit') return b('📢 Schalten', C.green, 'schalten');
                      if (k.status === 'pausiert') return <>{b('▶️ Aktiv schalten', C.green, 'aktivieren')}{b('⏹ Beenden', C.textDim, 'beenden')}</>;
                      if (k.status === 'aktiv') return <>{b('⏸ Pausieren', C.warn, 'pausieren')}{b('⏹ Beenden', C.textDim, 'beenden')}</>;
                      return null;
                    })()}
                    <button onClick={() => bearbeiten(k)} style={btn(C.gold)}>Bearbeiten</button>
                    <button onClick={() => loeschen(k)} style={btn(C.danger)}>Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {schaltMeldung && (
          <div style={{ marginTop: 14, background: schaltMeldung.startsWith('✓') ? 'rgba(76,175,125,0.12)' : 'rgba(224,162,76,0.12)', border: `1px solid ${schaltMeldung.startsWith('✓') ? C.green : C.warn}`, borderRadius: 12, padding: '12px 16px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{schaltMeldung}</div>
        )}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#8FA3BE', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box' };
const btnGold: React.CSSProperties = { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(14px, 1.2vw, 19px)' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#8FA3BE', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' };
function btn(farbe: string): React.CSSProperties {
  return { background: 'transparent', color: farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' };
}
