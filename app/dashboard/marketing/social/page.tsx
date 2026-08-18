'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  SOCIAL_PLATTFORMEN, SOCIAL_STATUS, plattformFuer, plattformenNachGruppe,
  bindendesLimit, zaehleZeichen, validiereBeitrag, zaehleBeitraege, zaehleKanaele,
  META_PLATTFORMEN, metaVerbindungFeld, verbindungFeld,
  VERBINDBARE_PLATTFORMEN, POSTBARE_PLATTFORMEN,
} from '@/lib/social';

// Die Meta-Kanaele haben oben einen eigenen Kasten — hier stehen alle uebrigen.
const WEITERE_VERBINDBAR: string[] = VERBINDBARE_PLATTFORMEN.filter((id) => !META_PLATTFORMEN.includes(id));
const POSTBARE: string[] = POSTBARE_PLATTFORMEN;
import { videoEinbettung, videoHinweis, sichereMedienUrl } from '@/lib/landingpages';

// ============================================================
// ARGONAUT OS · MARKETING · Social (Paket 1 · Fundament)
// Beitrag-Editor (Text + Bild/Video + Live-Vorschau je Kanal) +
// Kanal-Verwaltung + aufklappbare Transparenz-Box (Kosten/Regeln je Plattform).
// Das echte Verbinden (OAuth) + Posten kommen in den Folgepaketen (P2+).
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Beitrag = {
  id: string;
  text: string;
  medien_urls: string[] | null;
  kanaele: string[] | null;
  status: string;
  geplant_am: string | null;
  created_at: string;
};

type KanalRow = { plattform: string; aktiv: boolean; verbunden: boolean; konto_name: string | null; geprueft_am: string | null };
type VStatus = { verbunden: boolean; ziel_id: string; konto_name: string; hatToken: boolean };
const V_LEER: VStatus = { verbunden: false, ziel_id: '', konto_name: '', hatToken: false };

// ISO -> Wert fuer <input type="datetime-local"> (lokale Zeit, ohne Sekunden).
function isoZuLokal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDatum(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SocialSeite() {
  const [infoOffen, setInfoOffen] = useState(false);

  const [liste, setListe] = useState<Beitrag[]>([]);
  const [kanaele, setKanaele] = useState<KanalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Editor
  const [editId, setEditId] = useState<string | null>(null);
  const [eText, setEText] = useState('');
  const [eKanaele, setEKanaele] = useState<string[]>([]);
  const [eBilder, setEBilder] = useState<string[]>([]);
  const [eVideo, setEVideo] = useState('');
  const [eStatus, setEStatus] = useState<'entwurf' | 'geplant'>('entwurf');
  const [eGeplant, setEGeplant] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eMeldung, setEMeldung] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  // Kanal-Verwaltung
  const [kanalBusy, setKanalBusy] = useState<string | null>(null);

  // Meta-Verbindung (Facebook + Instagram)
  const [verb, setVerb] = useState<Record<string, VStatus>>({ facebook: V_LEER, instagram: V_LEER });
  const [vEncKey, setVEncKey] = useState(true);
  const [vZiel, setVZiel] = useState<Record<string, string>>({});
  const [vKonto, setVKonto] = useState<Record<string, string>>({});
  const [vToken, setVToken] = useState<Record<string, string>>({});
  const [vBusy, setVBusy] = useState<string | null>(null);
  const [vMeldung, setVMeldung] = useState<Record<string, string | null>>({});

  // Sofort posten
  const [sendBusyId, setSendBusyId] = useState<string | null>(null);
  const [sendMeldung, setSendMeldung] = useState<string | null>(null);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const [rB, rK, rV] = await Promise.all([
        fetch('/api/marketing/social-beitraege'),
        fetch('/api/marketing/social-kanaele'),
        fetch('/api/marketing/social-verbindung'),
      ]);
      const jB = await rB.json();
      const jK = await rK.json();
      const jV = await rV.json();
      if (jK?.ok) setKanaele((jK.liste as KanalRow[]) || []);
      if (jV?.ok) {
        const st = (k: string) => (jV[k] as VStatus) || V_LEER;
        const alle: string[] = VERBINDBARE_PLATTFORMEN;
        const neu: Record<string, VStatus> = {};
        alle.forEach((k) => { neu[k] = st(k); });
        setVerb(neu);
        setVEncKey(jV.encKeyBereit !== false);
        setVZiel((prev) => { const o: Record<string, string> = {}; alle.forEach((k) => { o[k] = st(k).ziel_id; }); return { ...o, ...prev }; });
        setVKonto((prev) => { const o: Record<string, string> = {}; alle.forEach((k) => { o[k] = st(k).konto_name; }); return { ...o, ...prev }; });
        setVToken({});
      }
      if (!rB.ok || !jB?.ok) setFehler(jB?.error || 'Laden fehlgeschlagen.');
      else setListe(jB.liste as Beitrag[]);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  const kpi = useMemo(() => zaehleBeitraege(liste), [liste]);
  const kanalKpi = useMemo(() => zaehleKanaele(kanaele), [kanaele]);

  const videoInfo = useMemo(() => videoEinbettung(eVideo), [eVideo]);
  const medienAnzahl = eBilder.length + (videoInfo.embedUrl ? 1 : 0);
  const limit = useMemo(() => bindendesLimit(eKanaele), [eKanaele]);
  const laenge = zaehleZeichen(eText);
  const ueberLimit = limit != null && laenge > limit;

  const pruef = useMemo(
    () => validiereBeitrag({ text: eText, medienAnzahl, kanaele: eKanaele }),
    [eText, medienAnzahl, eKanaele],
  );

  const kanalAktiv = (id: string) => kanaele.find((k) => k.plattform === id)?.aktiv === true;

  function neuerBeitrag() {
    setEditId(null); setEText(''); setEKanaele([]); setEBilder([]); setEVideo('');
    setEStatus('entwurf'); setEGeplant(''); setEMeldung(null);
  }
  function bearbeiten(b: Beitrag) {
    setEditId(b.id);
    setEText(b.text || '');
    setEKanaele(Array.isArray(b.kanaele) ? b.kanaele : []);
    const urls = Array.isArray(b.medien_urls) ? b.medien_urls : [];
    const vid = urls.find((u) => videoEinbettung(u).embedUrl) || '';
    setEBilder(urls.filter((u) => u !== vid));
    setEVideo(vid);
    setEStatus(b.status === 'geplant' ? 'geplant' : 'entwurf');
    setEGeplant(isoZuLokal(b.geplant_am));
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
      else setEBilder((prev) => [...prev, j.url].slice(0, 10));
    } catch { setEMeldung('Upload fehlgeschlagen.'); }
    finally { setUploadBusy(false); if (dateiRef.current) dateiRef.current.value = ''; }
  }

  async function speichereBeitrag() {
    if (!pruef.ok) { setEMeldung(pruef.fehler.join(' ')); return; }
    setEBusy(true); setEMeldung(null);
    const medien_urls = [...eBilder];
    const vid = sichereMedienUrl(eVideo);
    if (vid) medien_urls.push(vid);
    const geplant_am = eStatus === 'geplant' && eGeplant ? new Date(eGeplant).toISOString() : null;
    try {
      const res = await fetch('/api/marketing/social-beitraege', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editId, text: eText, medien_urls, kanaele: eKanaele, status: eStatus, geplant_am }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setEMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { neuerBeitrag(); laden(); }
    } catch { setEMeldung('Speichern fehlgeschlagen.'); }
    finally { setEBusy(false); }
  }

  async function loeschen(b: Beitrag) {
    if (!confirm('Diesen Beitrag wirklich löschen?')) return;
    const res = await fetch(`/api/marketing/social-beitraege?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { alert('Löschen fehlgeschlagen.'); return; }
    if (editId === b.id) neuerBeitrag();
    laden();
  }

  async function toggleKanalAktiv(id: string) {
    const neu = !kanalAktiv(id);
    setKanalBusy(id);
    try {
      const res = await fetch('/api/marketing/social-kanaele', {
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
      const res = await fetch('/api/marketing/social-verbindung', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plattform, ziel_id: vZiel[plattform] || '', konto_name: vKonto[plattform] || '', token: vToken[plattform] || '' }),
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
      const res = await fetch(`/api/marketing/social-verbindung?plattform=${encodeURIComponent(plattform)}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j?.ok) setVMeldung((m) => ({ ...m, [plattform]: j?.error || 'Trennen fehlgeschlagen.' }));
      else { setVMeldung((m) => ({ ...m, [plattform]: null })); laden(); }
    } catch { setVMeldung((m) => ({ ...m, [plattform]: 'Trennen fehlgeschlagen.' })); }
    finally { setVBusy(null); }
  }

  async function jetztPosten(b: Beitrag) {
    const kanaele = (b.kanaele || []).filter((k) => POSTBARE.includes(k));
    if (kanaele.length === 0) {
      const moeglich = POSTBARE.map((k) => plattformFuer(k)?.name || k).join(', ');
      setSendMeldung(`Für das automatische Posten sind aktuell möglich: ${moeglich} — weitere Kanäle folgen.`);
      return;
    }
    const namen = kanaele.map((k) => plattformFuer(k)?.name || k).join(' + ');
    if (!confirm(`Diesen Beitrag jetzt auf ${namen} posten?`)) return;
    setSendBusyId(b.id); setSendMeldung(null);
    try {
      const res = await fetch('/api/marketing/social-senden', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beitrag_id: b.id }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) setSendMeldung(j?.error || 'Posten fehlgeschlagen.');
      else setSendMeldung(`✓ Gepostet: ${j.gesendet} Kanal${j.gesendet === 1 ? '' : 'e'}${j.fehler ? `, ${j.fehler} fehlgeschlagen` : ''}.`);
      laden();
    } catch { setSendMeldung('Posten fehlgeschlagen.'); }
    finally { setSendBusyId(null); }
  }

  const vorschauKanaele = eKanaele.map((id) => plattformFuer(id)).filter(Boolean);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              📣 Social
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Einen Beitrag schreiben, Kanäle anhaken — als Entwurf sichern oder einplanen.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zum Marketing</a>
            <a href="/dashboard/marketing/social/kalender" style={{ background: 'rgba(76,175,125,0.12)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>📅 Kalender</a>
            {editId && (
              <button onClick={neuerBeitrag} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: 'pointer' }}>+ Neuer Beitrag</button>
            )}
          </div>
        </div>

        {/* Transparenz-Box: Kanäle, Kosten & Freigaben (aufklappbar) */}
        <div style={{ background: C.navy2, borderRadius: 14, border: `1px solid ${C.cyan}`, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={() => setInfoOffen((o) => !o)} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', color: '#fff', fontFamily: 'var(--font-dm-sans), sans-serif' }}>
            <span style={{ fontWeight: 700, color: C.cyan, fontSize: 'clamp(15px, 1.35vw, 21px)' }}>ℹ️ Kanäle, Kosten &amp; Freigaben — was jede Plattform braucht</span>
            <span style={{ color: C.cyan, fontSize: 20 }}>{infoOffen ? '▲' : '▼'}</span>
          </button>
          {infoOffen && (
            <div style={{ padding: '0 22px 20px', fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                ARGONAUT postet <strong style={{ color: '#fff' }}>direkt</strong> auf Ihre Kanäle — <strong style={{ color: '#fff' }}>ohne Zwischendienst</strong>, Ihre Daten bleiben im Haus.
                Jeder Kanal wird einmalig verbunden (kommt im nächsten Schritt). Was dort anfällt, rechnet die jeweilige Plattform direkt ab (Stand: 07/2026, kann sich ändern).
              </p>
              {(['kern', 'schwanz'] as const).map((g) => (
                <div key={g} style={{ marginBottom: 6 }}>
                  <div style={{ color: g === 'kern' ? C.green : C.warn, fontWeight: 700, margin: '10px 0 6px' }}>
                    {g === 'kern' ? 'Kern-Kanäle (direkt, empfohlen)' : 'Weitere Kanäle (mit Hürde/Kosten)'}
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
            1. Beitrag schreiben und optional Bild/Video anhängen. 2. Kanäle anhaken — die Live-Vorschau zeigt jeden Kanal einzeln, der Zähler warnt, wenn der Text für einen Kanal zu lang wird.
            3. Als <strong style={{ color: '#fff' }}>Entwurf</strong> sichern oder für später <strong style={{ color: '#fff' }}>einplanen</strong>. Das automatische Veröffentlichen folgt, sobald der jeweilige Kanal verbunden ist.
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Beiträge', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Entwürfe', wert: kpi.entwurf, farbe: C.gold },
            { label: 'Geplant', wert: kpi.geplant, farbe: C.green },
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
            {editId ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}
          </div>

          <label style={lbl}>Text</label>
          <textarea value={eText} onChange={(e) => setEText(e.target.value)} rows={5} placeholder={'Was möchten Sie posten? Z. B. „Frisches Brot ab 7 Uhr – heute mit Walnuss-Kruste …"'} style={{ ...input, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '6px 0 16px' }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(11px, 1vw, 14px)' }}>
              {limit == null ? 'Kanal wählen, dann greift das passende Zeichenlimit.' : `Bindendes Limit (engster Kanal): ${limit} Zeichen.`}
            </span>
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: ueberLimit ? C.danger : C.textDim, fontSize: 'clamp(11px, 1vw, 14px)', fontWeight: ueberLimit ? 700 : 400 }}>
              {laenge}{limit != null ? ` / ${limit}` : ''} Zeichen{ueberLimit ? ' — zu lang!' : ''}
            </span>
          </div>

          {/* Medien */}
          <label style={lbl}>Bilder</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            {eBilder.map((u, i) => (
              <div key={u + i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }} />
                <button onClick={() => setEBilder((prev) => prev.filter((x) => x !== u))} title="Entfernen"
                  style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: C.danger, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button onClick={() => dateiRef.current?.click()} disabled={uploadBusy || eBilder.length >= 10}
              style={{ width: 84, height: 84, borderRadius: 10, background: C.navy, border: '1px dashed rgba(255,255,255,0.25)', color: C.textDim, cursor: uploadBusy ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
              {uploadBusy ? '…' : '+ Bild'}
            </button>
            <input ref={dateiRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) bildHochladen(f); }} />
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(11px, 1vw, 14px)' }}>JPG, PNG, WebP oder GIF, bis 6 MB je Bild.</p>

          <label style={lbl}>Video-Link (optional)</label>
          <input value={eVideo} onChange={(e) => setEVideo(e.target.value)} placeholder="YouTube-, Vimeo- oder .mp4-Link" style={input} />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            🔒 Videos werden nur <strong style={{ color: '#fff' }}>verlinkt</strong> und nicht bei uns gespeichert. Später hochgeladene Videos werden <strong style={{ color: '#fff' }}>nach dem Posten automatisch von unseren Servern gelöscht</strong>.
          </p>
          {eVideo.trim() && (
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: videoInfo.embedUrl ? C.green : C.warn, margin: '6px 0 16px', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{videoHinweis(eVideo)}</p>
          )}
          {!eVideo.trim() && <div style={{ marginBottom: 16 }} />}

          {/* Kanäle */}
          <label style={{ ...lbl, marginTop: 6 }}>Kanäle</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {SOCIAL_PLATTFORMEN.map((p) => {
              const an = eKanaele.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggleEditorKanal(p.id)}
                  style={{ background: an ? C.cyan : 'transparent', color: an ? C.navy : C.textDim, border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.15)'}`, borderRadius: 18, padding: '6px 14px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', fontWeight: an ? 700 : 400, cursor: 'pointer' }}>
                  {p.icon} {p.name}
                </button>
              );
            })}
          </div>

          {/* Live-Vorschau je Kanal */}
          {vorschauKanaele.length > 0 && (eText.trim() || eBilder.length > 0 || videoInfo.embedUrl) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 12, marginBottom: 8 }}>Vorschau je Kanal</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {vorschauKanaele.map((p) => {
                  const zuLang = zaehleZeichen(eText) > p!.zeichenlimit;
                  const medienFehlt = p!.medienPflicht && medienAnzahl <= 0;
                  return (
                    <div key={p!.id} style={{ background: '#0b141a', border: `1px solid ${(zuLang || medienFehlt) ? C.danger : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 14 }}>{p!.icon} {p!.name}</span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: zuLang ? C.danger : C.textDim }}>{zaehleZeichen(eText)}/{p!.zeichenlimit}</span>
                      </div>
                      {eBilder[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={eBilder[0]} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                      )}
                      {!eBilder[0] && videoInfo.embedUrl && (
                        <div style={{ width: '100%', height: 120, borderRadius: 8, marginBottom: 8, background: '#000', color: C.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>▶️ Video</div>
                      )}
                      <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#dbe4f0', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{eText || <span style={{ color: C.textDim }}>(kein Text)</span>}</div>
                      {(zuLang || medienFehlt) && (
                        <div style={{ marginTop: 8, color: C.danger, fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                          {zuLang ? 'Text zu lang für diesen Kanal. ' : ''}{medienFehlt ? (p!.medienArt === 'video' ? 'Braucht ein Video.' : p!.medienArt === 'bild' ? 'Braucht ein Bild.' : 'Braucht ein Bild oder Video.') : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status / Einplanen */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {(['entwurf', 'geplant'] as const).map((s) => (
              <button key={s} onClick={() => setEStatus(s)}
                style={{ background: eStatus === s ? C.gold : 'transparent', color: eStatus === s ? C.navy : C.textDim, border: `1px solid ${eStatus === s ? C.gold : 'rgba(255,255,255,0.15)'}`, borderRadius: 18, padding: '6px 16px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', fontWeight: eStatus === s ? 700 : 400, cursor: 'pointer' }}>
                {s === 'entwurf' ? '📝 Als Entwurf' : '🕒 Einplanen'}
              </button>
            ))}
            {eStatus === 'geplant' && (
              <input type="datetime-local" value={eGeplant} onChange={(e) => setEGeplant(e.target.value)} style={{ ...input, maxWidth: 260 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={speichereBeitrag} disabled={eBusy || !pruef.ok}
              style={{ ...btnGold, opacity: (eBusy || !pruef.ok) ? 0.5 : 1, cursor: (eBusy || !pruef.ok) ? 'not-allowed' : 'pointer' }}>
              {eBusy ? 'Speichere…' : editId ? 'Änderungen speichern' : (eStatus === 'geplant' ? 'Beitrag einplanen' : 'Als Entwurf speichern')}
            </button>
            {editId && <button onClick={neuerBeitrag} style={btnGhost}>Abbrechen</button>}
            {!pruef.ok && (eText.trim() || eKanaele.length > 0) && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.warn, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{pruef.fehler[0]}</span>
            )}
            {eMeldung && <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{eMeldung}</span>}
          </div>
        </div>

        {/* Verbindungen — Meta (Facebook + Instagram) */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 6 }}>Verbindungen — Meta (Facebook &amp; Instagram)</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>
            Verbinden Sie Ihre Facebook-Seite und Ihr Instagram-Business-Konto. Der Zugangs-Token wird <strong style={{ color: '#fff' }}>verschlüsselt</strong> gespeichert und nie wieder angezeigt. Die genaue Schritt-für-Schritt-Einrichtung erhalten Sie separat.
          </p>

          {!vEncKey && (
            <div style={{ background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
              <strong style={{ color: C.warn }}>⚠️ Sicherheits-Schlüssel fehlt.</strong> Zum sicheren Speichern des Tokens muss einmalig die Umgebungsvariable <strong style={{ color: '#fff' }}>APP_ENC_KEY</strong> gesetzt werden. Danach lässt sich die Verbindung speichern.
            </div>
          )}

          <div style={{ display: 'grid', gap: 14 }}>
            {META_PLATTFORMEN.map((id) => {
              const p = plattformFuer(id)!;
              const feld = metaVerbindungFeld(id)!;
              const st = verb[id] || V_LEER;
              return (
                <div key={id} style={{ background: C.navy, border: `1px solid ${st.verbunden ? C.green : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.3vw, 20px)' }}>{p.icon} {p.name}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: st.verbunden ? C.green : C.textDim, border: `1px solid ${st.verbunden ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 12px' }}>{st.verbunden ? '✓ Verbunden' : 'Nicht verbunden'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={lbl}>{feld.zielLabel}</label>
                      <input value={vZiel[id] ?? ''} onChange={(e) => setVZiel((v) => ({ ...v, [id]: e.target.value }))} placeholder="z. B. 1234567890" style={input} />
                    </div>
                    <div>
                      <label style={lbl}>Anzeigename (optional)</label>
                      <input value={vKonto[id] ?? ''} onChange={(e) => setVKonto((v) => ({ ...v, [id]: e.target.value }))} placeholder="z. B. Bäckerei Sonnenschein" style={input} />
                    </div>
                  </div>
                  <label style={lbl}>{feld.tokenLabel}</label>
                  <input type="password" value={vToken[id] ?? ''} onChange={(e) => setVToken((v) => ({ ...v, [id]: e.target.value }))} placeholder={st.hatToken ? '•••••••• (gespeichert — zum Ändern neu eingeben)' : 'hier einfügen'} style={{ ...input, maxWidth: 460 }} />
                  <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 12px', fontSize: 'clamp(11px, 1vw, 14px)' }}>{feld.zielHinweis}</p>
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
            Sobald verbunden, postet ARGONAUT direkt auf diese Kanäle — sofort oder nach Plan. Alle weiteren Kanäle richten Sie im nächsten Kasten ein.
          </p>
        </div>

        {/* Verbindungen — alle weiteren Kanäle */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 6 }}>Weitere Verbindungen</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>
            Auch hier gilt: Der Zugang wird <strong style={{ color: '#fff' }}>verschlüsselt</strong> gespeichert und nie wieder angezeigt.
            Bei <strong style={{ color: '#fff' }}>Mastodon</strong> und <strong style={{ color: '#fff' }}>Bluesky</strong> genügen ein Konto und ein
            selbst erzeugter Zugang — kein Antrag, keine Prüfung, keine Gebühren. Diese beiden Kanäle übertragen bislang
            nur Text und Links; ein angehängtes Bild bleibt bei ihnen außen vor.
          </p>
          <div style={{ display: 'grid', gap: 14 }}>
            {WEITERE_VERBINDBAR.map((id) => {
              const p = plattformFuer(id)!;
              const feld = verbindungFeld(id)!;
              const st = verb[id] || V_LEER;
              return (
                <div key={id} style={{ background: C.navy, border: `1px solid ${st.verbunden ? C.green : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.3vw, 20px)' }}>{p.icon} {p.name}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: st.verbunden ? C.green : C.textDim, border: `1px solid ${st.verbunden ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 12px' }}>{st.verbunden ? '✓ Verbunden' : 'Nicht verbunden'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={lbl}>{feld.zielLabel}</label>
                      <input value={vZiel[id] ?? ''} onChange={(e) => setVZiel((v) => ({ ...v, [id]: e.target.value }))} placeholder={feld.platzhalter ?? ''} style={input} />
                    </div>
                    <div>
                      <label style={lbl}>Anzeigename (optional)</label>
                      <input value={vKonto[id] ?? ''} onChange={(e) => setVKonto((v) => ({ ...v, [id]: e.target.value }))} placeholder="z. B. Bäckerei Sonnenschein" style={input} />
                    </div>
                  </div>
                  <label style={lbl}>{feld.tokenLabel}</label>
                  <input type="password" value={vToken[id] ?? ''} onChange={(e) => setVToken((v) => ({ ...v, [id]: e.target.value }))} placeholder={st.hatToken ? '•••••••• (gespeichert — zum Ändern neu eingeben)' : 'hier einfügen'} style={{ ...input, maxWidth: 460 }} />
                  <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 12px', fontSize: 'clamp(11px, 1vw, 14px)' }}>{feld.zielHinweis}</p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => verbinde(id)} disabled={vBusy === id} style={{ ...btnGold, opacity: vBusy === id ? 0.6 : 1, cursor: vBusy === id ? 'wait' : 'pointer' }}>{vBusy === id ? 'Speichere…' : st.verbunden ? 'Zugang aktualisieren' : 'Verbinden'}</button>
                    {st.verbunden && <button onClick={() => trenne(id)} disabled={vBusy === id} style={btn(C.danger)}>Trennen</button>}
                    {vMeldung[id] && <span style={{ fontFamily: 'DM Sans, sans-serif', color: vMeldung[id]!.startsWith('✓') ? C.green : C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{vMeldung[id]}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kanal-Verwaltung */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 6 }}>Kanal-Verwaltung</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>
            Merken Sie vor, welche Plattformen Sie nutzen möchten. Kanäle mit grünem Haken sind verbunden und werden automatisch bespielt; bei allen übrigen dient der Eintrag bislang nur der Planung.
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

        {/* Beitrags-Liste */}
        <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>Ihre Beiträge</div>
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>📣</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: 0 }}>Noch kein Beitrag. Schreiben Sie oben Ihren ersten.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {liste.map((b) => {
              const urls = Array.isArray(b.medien_urls) ? b.medien_urls : [];
              const bild = urls.find((u) => !videoEinbettung(u).embedUrl);
              const hatPostbaren = (b.kanaele || []).some((k) => POSTBARE.includes(k));
              const statusLabel = SOCIAL_STATUS.find((s) => s.id === b.status)?.label || 'Entwurf';
              const statusFarbe = b.status === 'gesendet' ? C.green : b.status === 'geplant' ? C.cyan : C.textDim;
              return (
                <div key={b.id} style={{ background: C.navy2, borderRadius: 14, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {bild && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bild} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: statusFarbe, border: `1px solid ${statusFarbe}`, borderRadius: 10, padding: '1px 10px' }}>{statusLabel}</span>
                      {b.status === 'geplant' && b.geplant_am && (
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.textDim }}>🕒 {fmtDatum(b.geplant_am)}</span>
                      )}
                      {(b.kanaele || []).map((id) => plattformFuer(id)).filter(Boolean).map((p) => (
                        <span key={p!.id} title={p!.name} style={{ fontSize: 15 }}>{p!.icon}</span>
                      ))}
                    </div>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#dbe4f0', fontSize: 'clamp(13px, 1.1vw, 17px)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {b.text || <span style={{ color: C.textDim }}>(kein Text)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    {hatPostbaren && b.status !== 'gesendet' && (
                      <button onClick={() => jetztPosten(b)} disabled={sendBusyId === b.id} style={{ ...btn(C.green), opacity: sendBusyId === b.id ? 0.5 : 1, cursor: sendBusyId === b.id ? 'wait' : 'pointer' }}>
                        {sendBusyId === b.id ? 'Poste…' : '📤 Jetzt posten'}
                      </button>
                    )}
                    <button onClick={() => bearbeiten(b)} style={btn(C.gold)}>Bearbeiten</button>
                    <button onClick={() => loeschen(b)} style={btn(C.danger)}>Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sendMeldung && (
          <div style={{ marginTop: 14, background: sendMeldung.startsWith('✓') ? 'rgba(76,175,125,0.12)' : 'rgba(224,162,76,0.12)', border: `1px solid ${sendMeldung.startsWith('✓') ? C.green : C.warn}`, borderRadius: 12, padding: '12px 16px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{sendMeldung}</div>
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
