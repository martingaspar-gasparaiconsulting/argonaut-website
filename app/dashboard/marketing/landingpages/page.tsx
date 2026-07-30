'use client';

import { useEffect, useState, useMemo } from 'react';
import { LP_VORLAGEN, LP_KATEGORIEN, vorlageFuer, zaehleLandingpages, nutzenAusText, type LpVorlage } from '@/lib/landingpages';

// ============================================================
// ARGONAUT OS · MARKETING · Landingpage-Bauer (LP Paket 1)
// Aus Vorlage starten → füllen → aktiv schalten. Rechts-Fuß (Impressum +
// Datenschutz) entsteht automatisch aus den Firmendaten. Aktivschalten nur
// bei vollständigem Impressum.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Lp = {
  id: string; slug: string; typ: string; titel: string; untertitel: string | null;
  nutzen: string[] | null; cta_text: string | null; aktiv: boolean; created_at: string;
};

export default function LandingpagesSeite() {
  const [liste, setListe] = useState<Lp[]>([]);
  const [impressum, setImpressum] = useState<{ ok: boolean; fehlend: string[] }>({ ok: true, fehlend: [] });
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [pickerOffen, setPickerOffen] = useState(false);
  const [editOffen, setEditOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [eTyp, setETyp] = useState('newsletter');
  const [eSlug, setESlug] = useState('');
  const [eTitel, setETitel] = useState('');
  const [eUnter, setEUnter] = useState('');
  const [eNutzen, setENutzen] = useState('');
  const [eCta, setECta] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eMeldung, setEMeldung] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [eKategorie, setEKategorie] = useState('');
  const [vorschlagBusy, setVorschlagBusy] = useState(false);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const res = await fetch('/api/marketing/landingpages');
      const j = await res.json();
      if (!res.ok || !j?.ok) { setFehler(j?.error || 'Laden fehlgeschlagen.'); }
      else { setListe(j.liste as Lp[]); setImpressum(j.impressum || { ok: true, fehlend: [] }); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  const kpi = useMemo(() => zaehleLandingpages(liste), [liste]);

  function ausVorlage(v: LpVorlage) {
    setEditId(null);
    setETyp(v.id);
    setESlug('');
    setETitel(v.titel);
    setEUnter(v.untertitel);
    setENutzen(v.nutzen.join('\n'));
    setECta(v.cta_text);
    setEKategorie('');
    setEMeldung(null);
    setPickerOffen(false);
    setEditOffen(true);
  }

  function bearbeiten(lp: Lp) {
    setEditId(lp.id);
    setETyp(lp.typ);
    setESlug(lp.slug);
    setETitel(lp.titel);
    setEUnter(lp.untertitel ?? '');
    setENutzen((lp.nutzen ?? []).join('\n'));
    setECta(lp.cta_text ?? '');
    setEKategorie('');
    setEMeldung(null);
    setEditOffen(true);
  }

  async function vorschlagHolen() {
    if (!eKategorie) { setEMeldung('Bitte zuerst eine Branche wählen.'); return; }
    setVorschlagBusy(true); setEMeldung(null);
    try {
      const res = await fetch(`/api/marketing/lp-vorschlag?kategorie=${encodeURIComponent(eKategorie)}&typ=${encodeURIComponent(eTyp)}`);
      const j = await res.json();
      if (!res.ok || !j?.ok) { setEMeldung(j?.error || 'Vorschlag fehlgeschlagen.'); }
      else {
        if (j.untertitel) setEUnter(j.untertitel);
        if (Array.isArray(j.nutzen) && j.nutzen.length) setENutzen(j.nutzen.join('\n'));
      }
    } catch { setEMeldung('Vorschlag fehlgeschlagen.'); }
    finally { setVorschlagBusy(false); }
  }

  async function speichern(aktiv: boolean) {
    if (!eTitel.trim()) { setEMeldung('Bitte eine Überschrift eingeben.'); return; }
    setEBusy(true); setEMeldung(null);
    try {
      const res = await fetch('/api/marketing/landingpages', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editId, typ: eTyp, slug: eSlug, titel: eTitel.trim(),
          untertitel: eUnter.trim(), nutzen: nutzenAusText(eNutzen), cta_text: eCta.trim(), aktiv,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setEMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { setEditOffen(false); laden(); }
    } catch { setEMeldung('Speichern fehlgeschlagen.'); }
    finally { setEBusy(false); }
  }

  async function aktivSetzen(lp: Lp, aktiv: boolean) {
    const res = await fetch('/api/marketing/landingpages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: lp.id, typ: lp.typ, slug: lp.slug, titel: lp.titel,
        untertitel: lp.untertitel ?? '', nutzen: lp.nutzen ?? [], cta_text: lp.cta_text ?? '', aktiv,
      }),
    });
    const j = await res.json();
    if (!res.ok || !j?.ok) { alert(j?.error || 'Fehler.'); return; }
    laden();
  }

  async function loeschen(lp: Lp) {
    if (!confirm(`Landingpage „${lp.titel}" wirklich löschen?`)) return;
    const res = await fetch(`/api/marketing/landingpages?id=${encodeURIComponent(lp.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { alert('Löschen fehlgeschlagen.'); return; }
    laden();
  }

  async function kopieren(slug: string) {
    try { await navigator.clipboard.writeText(`https://argonaut-os.com/lp/${slug}`); setKopiert(slug); setTimeout(() => setKopiert(null), 2000); } catch { /* ignore */ }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              🖼️ Landingpages
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Eigene Anmelde-Seiten aus Vorlagen — in Ihren Farben, mit Double-Opt-In.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zum Marketing</a>
            <button onClick={() => setPickerOffen(true)} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: 'pointer' }}>+ Neue Landingpage</button>
          </div>
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 8 }}>So geht&apos;s</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            Vorlage wählen → Überschrift, Text und Nutzen anpassen → <strong style={{ color: C.green }}>Aktiv</strong> schalten. Sie erhalten einen teilbaren Link
            <strong style={{ color: '#fff' }}> argonaut-os.com/lp/ihr-name</strong>. Wer sich einträgt, bekommt eine Bestätigungsmail (Double-Opt-In) und landet erst nach dem Klick
            in Ihrer Liste — und startet automatisch Ihre Willkommens-Sequenz (falls im Newsletter-Bereich hinterlegt). Impressum &amp; Datenschutz erscheinen automatisch aus Ihren Firmendaten.
          </p>
        </div>

        {/* Impressum-Warnung */}
        {!impressum.ok && (
          <div style={{ background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
            <strong style={{ color: C.warn }}>⚠️ Impressum unvollständig.</strong> Bevor eine Landingpage öffentlich gehen darf, ergänzen Sie bitte in den
            {' '}<a href="/dashboard/einstellungen" style={{ color: C.cyan }}>Einstellungen</a> Ihre Firmendaten. Es fehlt: {impressum.fehlend.join(', ')}.
          </div>
        )}

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Landingpages', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Aktiv (live)', wert: kpi.aktiv, farbe: C.green },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{kp.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Landingpages…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>🖼️</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: '0 0 18px' }}>Noch keine Landingpage. Starten Sie mit einer Vorlage.</p>
            <button onClick={() => setPickerOffen(true)} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800, cursor: 'pointer' }}>+ Aus Vorlage starten</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {liste.map((lp) => (
              <div key={lp.id} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 24px)' }}>{lp.titel}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: lp.aktiv ? C.green : C.textDim, border: `1px solid ${lp.aktiv ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 10px' }}>{lp.aktiv ? 'Live' : 'Entwurf'}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '1px 8px' }}>{vorlageFuer(lp.typ).icon} {vorlageFuer(lp.typ).name}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.cyan, fontSize: 'clamp(13px, 1.06vw, 17px)', wordBreak: 'break-all' }}>argonaut-os.com/lp/{lp.slug}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => kopieren(lp.slug)} style={btn(C.cyan)}>{kopiert === lp.slug ? '✓ Kopiert' : 'Link kopieren'}</button>
                  <a href={`https://argonaut-os.com/lp/${lp.slug}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(C.textDim), textDecoration: 'none' }}>Vorschau</a>
                  {lp.aktiv ? (
                    <button onClick={() => aktivSetzen(lp, false)} style={btn(C.warn)}>Offline</button>
                  ) : (
                    <button onClick={() => aktivSetzen(lp, true)} style={btn(C.green)}>Live schalten</button>
                  )}
                  <button onClick={() => bearbeiten(lp)} style={btn(C.gold)}>Bearbeiten</button>
                  <button onClick={() => loeschen(lp)} style={btn(C.danger)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vorlagen-Picker */}
      {pickerOffen && (
        <div style={overlay} onClick={() => setPickerOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modal, maxWidth: 680 }}>
            <h2 style={modalTitel}>Vorlage wählen</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {LP_VORLAGEN.map((v) => (
                <button key={v.id} onClick={() => ausVorlage(v)} style={{ textAlign: 'left', background: C.navy2, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', color: '#fff' }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{v.icon}</div>
                  <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{v.name}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14, lineHeight: 1.45 }}>{v.untertitel}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setPickerOffen(false)} style={btnGhost}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      {editOffen && (
        <div style={overlay} onClick={() => setEditOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={modalTitel}>{editId ? 'Landingpage bearbeiten' : 'Neue Landingpage'}</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Link-Name</label>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 17px)', padding: '10px 4px 10px 0' }}>argonaut-os.com/lp/</span>
                <input value={eSlug} onChange={(e) => setESlug(e.target.value)} placeholder="herbst-aktion" style={{ ...input, flex: '1 1 160px', width: 'auto' }} />
              </div>
            </div>
            <div style={{ marginBottom: 14, background: '#0F1F33', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 10, padding: '14px 16px' }}>
              <label style={lbl}>Branche — für automatische Text-Vorschläge</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={eKategorie} onChange={(e) => setEKategorie(e.target.value)} style={{ ...input, flex: '1 1 220px', width: 'auto' }}>
                  <option value="">— Branche wählen —</option>
                  {LP_KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button
                  onClick={vorschlagHolen}
                  disabled={vorschlagBusy || !eKategorie}
                  style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '10px 16px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: (vorschlagBusy || !eKategorie) ? 'not-allowed' : 'pointer', opacity: (vorschlagBusy || !eKategorie) ? 0.6 : 1 }}
                >
                  {vorschlagBusy ? 'Hole…' : '✨ Branchen-Text vorschlagen'}
                </button>
              </div>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', fontSize: 'clamp(12px, 1vw, 15px)' }}>
                Füllt Untertitel und Nutzen-Punkte passend zu Ihrer Branche vor — Sie können anschließend alles frei anpassen.
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Überschrift *</label>
              <input value={eTitel} onChange={(e) => setETitel(e.target.value)} style={input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Untertitel</label>
              <input value={eUnter} onChange={(e) => setEUnter(e.target.value)} style={input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Nutzen-Punkte (eine Zeile = ein Punkt)</label>
              <textarea value={eNutzen} onChange={(e) => setENutzen(e.target.value)} rows={4} style={{ ...input, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Knopf-Text (CTA)</label>
              <input value={eCta} onChange={(e) => setECta(e.target.value)} placeholder="Jetzt anmelden" style={input} />
            </div>
            {eMeldung && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, margin: '0 0 12px', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{eMeldung}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setEditOffen(false)} style={btnGhost}>Abbrechen</button>
              <button onClick={() => speichern(false)} disabled={eBusy} style={{ ...btnGhost, color: '#fff', borderColor: C.textDim, opacity: eBusy ? 0.7 : 1 }}>Als Entwurf speichern</button>
              <button onClick={() => speichern(true)} disabled={eBusy} style={{ ...btnGold, opacity: eBusy ? 0.7 : 1, cursor: eBusy ? 'wait' : 'pointer' }}>{eBusy ? 'Speichere…' : 'Speichern & live'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#8FA3BE', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#0A1628', borderRadius: 18, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: '1px solid #C9A84C' };
const modalTitel: React.CSSProperties = { fontFamily: 'var(--font-dm-sans), sans-serif', color: '#C9A84C', fontSize: 'clamp(22px, 2vw, 32px)', margin: '0 0 20px' };
const btnGold: React.CSSProperties = { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#8FA3BE', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' };
function btn(farbe: string): React.CSSProperties {
  return { background: 'transparent', color: farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' };
}
