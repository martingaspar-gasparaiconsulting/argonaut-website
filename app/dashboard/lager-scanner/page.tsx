'use client';

// ============================================================
// ARGONAUT OS · Bündel 9 · Lager/WMS mit Scanner
// Mobil-first: Artikel per Barcode buchen. Funktioniert mit Hardware-Scannern
// (die tippen den Code ins Feld + Enter) UND optionalem Kamera-Scan.
// Drei Modi: Wareneingang (+), Warenausgang (−), Inventur (= zählen).
// Bucht sauber: artikel.aktueller_bestand fortschreiben + lagerbewegung (Nachweis).
// Pfad: app/dashboard/lager-scanner/page.tsx
// ============================================================

import { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Artikel = { id: string; artikelnummer: string | null; bezeichnung: string; einheit: string; aktueller_bestand: number; ean: string | null; lagerort: string | null };
type Modus = 'eingang' | 'ausgang' | 'inventur';
const MODI: { w: Modus; label: string; farbe: string; zeichen: string }[] = [
  { w: 'eingang', label: 'Wareneingang', farbe: '#4CAF7D', zeichen: '+' },
  { w: 'ausgang', label: 'Warenausgang', farbe: '#E0A24C', zeichen: '−' },
  { w: 'inventur', label: 'Inventur (zählen)', farbe: '#00e5ff', zeichen: '=' },
];
function modusInfo(m: Modus) { return MODI.find((x) => x.w === m) as (typeof MODI)[number]; }
function num(s: string): number { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmt(n: number) { return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE'); }
function clean(code: string) { return (code || '').trim().replace(/[^A-Za-z0-9\-_.]/g, ''); }

export default function LagerScannerPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>('eingang');
  const [code, setCode] = useState('');
  const [artikel, setArtikel] = useState<Artikel | null>(null);
  const [menge, setMenge] = useState('1');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [log, setLog] = useState<{ t: string; text: string; farbe: string }[]>([]);
  const [kameraAuf, setKameraAuf] = useState(false);
  const [kameraGeht, setKameraGeht] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
    })();
    setKameraGeht(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, [artikel, modus]);

  const suche = useCallback(async (roh: string) => {
    const c = clean(roh);
    if (!c) return;
    setFehler(null); setArtikel(null);
    try {
      const { data, error } = await supabase
        .from('artikel')
        .select('id, artikelnummer, bezeichnung, einheit, aktueller_bestand, ean, lagerort')
        .or(`ean.eq.${c},artikelnummer.eq.${c}`)
        .eq('aktiv', true).limit(1);
      if (error) throw error;
      const a = (data as Artikel[])?.[0];
      if (!a) { setFehler(`Kein Artikel zu „${c}" gefunden. (EAN im Sortiment hinterlegen?)`); return; }
      setArtikel(a);
      setMenge(modus === 'inventur' ? String(a.aktueller_bestand) : '1');
    } catch (e: unknown) {
      setFehler('Suche fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }, [modus]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Scanner schließen den Code meist mit Enter (CR) ab — manche mit Tab.
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void suche(code); setCode(''); }
  }

  async function buchen() {
    if (!artikel) return;
    const m = num(menge);
    if (modus !== 'inventur' && m <= 0) { setFehler('Bitte eine Menge > 0 angeben.'); return; }
    setBusy(true); setFehler(null);
    try {
      const alt = artikel.aktueller_bestand;
      const neu = modus === 'inventur' ? m : modus === 'eingang' ? alt + m : alt - m;
      const delta = neu - alt;
      const { error: uErr } = await supabase.from('artikel').update({ aktueller_bestand: neu }).eq('id', artikel.id);
      if (uErr) throw uErr;
      const { error: bErr } = await supabase.from('lagerbewegungen').insert({
        owner_user_id: uid, artikel_id: artikel.id, typ: modus, menge: delta, grund: 'Scanner', referenz: null,
      });
      if (bErr) throw bErr;
      const mi = modusInfo(modus);
      setLog((l) => [{ t: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), text: `${mi.zeichen}${fmt(Math.abs(delta))} ${artikel.einheit} · ${artikel.bezeichnung} → Bestand ${fmt(neu)}`, farbe: mi.farbe }, ...l].slice(0, 30));
      setArtikel(null); setCode(''); setMenge('1');
      inputRef.current?.focus();
    } catch (e: unknown) {
      setFehler('Buchen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  // ---- Kamera-Scan (optional) ----
  const stopKamera = useCallback(() => {
    if (loopRef.current) { window.clearInterval(loopRef.current); loopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setKameraAuf(false);
  }, []);

  async function startKamera() {
    if (!kameraGeht) return;
    setFehler(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setKameraAuf(true);
      // Video anbinden (nach Render)
      window.setTimeout(async () => {
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; await v.play().catch(() => {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        const det = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
        loopRef.current = window.setInterval(async () => {
          try {
            const codes = await det.detect(v);
            if (codes && codes.length) {
              const raw = codes[0].rawValue as string;
              if (raw) { stopKamera(); await suche(raw); }
            }
          } catch { /* Frame ohne Treffer */ }
        }, 500);
      }, 100);
    } catch {
      setFehler('Kamera nicht verfügbar. Nutze das Eingabefeld (Hardware-Scanner tippt den Code dort ein).');
      setKameraAuf(false);
    }
  }
  useEffect(() => () => stopKamera(), [stopKamera]);

  const mi = modusInfo(modus);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Lager</div>
      <h1 style={styles.h1}>Lager-Scanner</h1>
      <p style={styles.sub}>Artikel per Barcode buchen — mit Handscanner (Code ins Feld + Enter) oder Kamera.</p>

      {/* Modus */}
      <div style={styles.modusReihe}>
        {MODI.map((x) => (
          <button key={x.w} onClick={() => { setModus(x.w); setArtikel(null); setCode(''); }}
            style={{ ...styles.modusBtn, ...(modus === x.w ? { background: 'rgba(255,255,255,0.06)', borderColor: x.farbe, color: x.farbe } : {}) }}>
            <span style={{ fontWeight: 800, fontSize: 'clamp(18px, 1.6vw, 26px)' }}>{x.zeichen}</span> {x.label}
          </button>
        ))}
      </div>

      {/* Scan-Feld */}
      <div style={{ ...styles.card, borderColor: mi.farbe }}>
        <label style={styles.lbl}>Barcode / Artikelnummer scannen</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={inputRef} style={{ ...styles.input, flex: 1, minWidth: 180, fontSize: 'clamp(16px, 1.5vw, 24px)' }}
            value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onInputKey}
            placeholder="hier scannen oder tippen …" autoFocus inputMode="text" />
          <button onClick={() => { void suche(code); setCode(''); }} style={styles.primaer}>Suchen</button>
          {kameraGeht && <button onClick={kameraAuf ? stopKamera : startKamera} style={styles.ghostBtn}>{kameraAuf ? '✕ Kamera' : '📷 Kamera'}</button>}
        </div>

        {kameraAuf && (
          <div style={{ marginTop: 12, position: 'relative' }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} style={styles.video} playsInline muted />
            <div style={styles.scanLinie} />
          </div>
        )}

        {fehler && <div style={styles.err}>{fehler}</div>}

        {artikel && (
          <div style={styles.trefferBox}>
            <div style={{ fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)' }}>{artikel.bezeichnung}</div>
            <div style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginTop: 2 }}>
              {artikel.artikelnummer ? `Nr. ${artikel.artikelnummer} · ` : ''}{artikel.ean ? `EAN ${artikel.ean} · ` : ''}{artikel.lagerort ? `Lager: ${artikel.lagerort} · ` : ''}
              Bestand: <b style={{ color: C.text }}>{fmt(artikel.aktueller_bestand)} {artikel.einheit}</b>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
              <div>
                <label style={styles.lbl}>{modus === 'inventur' ? 'Gezählter Bestand' : 'Menge'}</label>
                <input style={{ ...styles.input, maxWidth: 140, fontSize: 'clamp(18px, 1.6vw, 26px)', textAlign: 'center' }} inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} />
              </div>
              <button onClick={buchen} disabled={busy} style={{ ...styles.buchenBtn, background: mi.farbe, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Bucht …' : `${mi.zeichen} ${mi.label} buchen`}
              </button>
              <button onClick={() => { setArtikel(null); setCode(''); inputRef.current?.focus(); }} style={styles.ghostBtn}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>

      {/* Hilfe: Scanner verbinden */}
      <details style={styles.hilfe}>
        <summary style={styles.hilfeKopf}>❓ Wie verbinde ich meinen Scanner?</summary>
        <div style={styles.hilfeInhalt}>
          <p style={{ margin: '0 0 8px' }}><b>Handscanner (USB oder Bluetooth)</b> sind fast immer „Tastatur-Scanner" (HID) — sie tippen den Code einfach ins Feld. Kein Treiber, keine App nötig.</p>
          <ol style={{ margin: '0 0 8px', paddingLeft: 20, lineHeight: 1.7 }}>
            <li><b>USB:</b> Scanner einstecken → oben ins Scan-Feld tippen (Cursor blinkt) → scannen. Fertig.</li>
            <li><b>Bluetooth:</b> Scanner einmal in den <b>Bluetooth-Einstellungen</b> von Handy/PC koppeln → dann wie USB nutzen.</li>
            <li><b>Kamera:</b> kein Gerät nötig — „📷 Kamera" antippen (am Handy).</li>
          </ol>
          <p style={{ margin: '0 0 8px', color: C.textDim }}>Springt es nach dem Scan nicht automatisch weiter? Im <b>Scanner-Handbuch</b> den Code für <b>„Enter/CR-Suffix"</b> einscannen. Steht der Scanner auf „SPP/seriell", mit dem Handbuch-Code auf <b>„HID/Keyboard"</b> umstellen.</p>
          <p style={{ margin: 0, color: C.textDim }}>Laser, CCD oder 2D-Imager ist nur die Lese-Technik (welche Codes) — für die Verbindung zählt nur der <b>HID/Tastatur-Modus</b>. Fast alle Scanner können das.</p>
        </div>
      </details>

      {/* Session-Log */}
      {log.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 'clamp(15px, 1.31vw, 21px)' }}>Gebucht in dieser Sitzung</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {log.map((z, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 'clamp(13.5px, 1.19vw, 19px)', borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                <span style={{ color: C.textDim, flexShrink: 0 }}>{z.t}</span>
                <span style={{ color: z.farbe }}>{z.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '24px 16px 64px', maxWidth: 720, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px, 2.44vw, 39px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', lineHeight: 1.5 },
  modusReihe: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 },
  modusBtn: { background: C.navy2, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 10px', fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 },
  lbl: { display: 'block', fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  input: { boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', width: '100%' },
  primaer: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  video: { width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 12, background: '#000', border: `1px solid ${C.border}`, display: 'block' },
  scanLinie: { position: 'absolute', left: '8%', right: '8%', top: '50%', height: 2, background: 'rgba(0,229,255,0.8)', boxShadow: '0 0 8px rgba(0,229,255,0.8)' },
  trefferBox: { marginTop: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 },
  buchenBtn: { color: '#0A1628', border: 'none', borderRadius: 12, padding: '14px 20px', fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', minHeight: 52 },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginTop: 12 },
  hilfe: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginTop: 14 },
  hilfeKopf: { cursor: 'pointer', fontWeight: 700, color: C.cyan, fontSize: 'clamp(14px, 1.25vw, 20px)' },
  hilfeInhalt: { marginTop: 10, fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.text, lineHeight: 1.5 },
};

