'use client';

// ============================================================
// ARGONAUT OS · Bündel 9 · Lager/WMS mit Scanner
// Mobil-first: Artikel per Barcode buchen. Funktioniert mit Hardware-Scannern
// (die tippen den Code ins Feld + Enter) UND optionalem Kamera-Scan.
// Drei Modi: Wareneingang (+), Warenausgang (−), Inventur (= zählen).
// Pfad: app/dashboard/lager-scanner/page.tsx
//
// ▄▄▄ WAS SICH AM 08.09.26 GEÄNDERT HAT (D1) ▄▄▄
// Gebucht wird jetzt je Filiale, über `lager_buchen` — Bewegung, Bestand und
// Gesamtsumme in einem einzigen Vorgang statt in zwei getrennten Schritten.
//
// Der gefährlichste Punkt war die INVENTUR: Sie war mit der Gesamtzahl über
// alle Filialen vorbelegt. Wer in Filiale Nord 7 Stück zählt und bestätigt,
// hätte damit den Bestand aller Filialen zusammen auf 7 gesetzt — der
// Bestand der anderen Filialen wäre stillschweigend verschwunden. Jetzt wird
// mit dem Bestand DIESER Filiale vorbelegt; wo noch nie gezählt wurde,
// bleibt das Feld leer statt eine 0 zu behaupten.
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort } from '@/lib/standortDaten';
import { standortFuerBuchung, buchenArgumente, RPC_BUCHEN } from '@/lib/lagerBuchung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Artikel = { id: string; artikelnummer: string | null; bezeichnung: string; einheit: string; aktueller_bestand: number; ean: string | null; lagerort: string | null };
type StandortRow = { id: string; name: string };
type Modus = 'eingang' | 'ausgang' | 'inventur';
const MODI: { w: Modus; label: string; farbe: string; zeichen: string }[] = [
  { w: 'eingang', label: 'Wareneingang', farbe: '#4CAF7D', zeichen: '+' },
  { w: 'ausgang', label: 'Warenausgang', farbe: '#E0A24C', zeichen: '−' },
  { w: 'inventur', label: 'Inventur (zählen)', farbe: '#00e5ff', zeichen: '=' },
];
/** Die drei Modi in der Sprache der Datenbank. Inventur SETZT den Bestand. */
const MODUS_ART = { eingang: 'zugang', ausgang: 'abgang', inventur: 'korrektur' } as const;
function modusInfo(m: Modus) { return MODI.find((x) => x.w === m) as (typeof MODI)[number]; }
function num(s: string): number { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmt(n: number) { return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE'); }
function clean(code: string) { return (code || '').trim().replace(/[^A-Za-z0-9\-_.]/g, ''); }

export default function LagerScannerPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>('eingang');
  const [code, setCode] = useState('');
  const [artikel, setArtikel] = useState<Artikel | null>(null);
  const [standorte, setStandorte] = useState<StandortRow[]>([]);
  /** Bestand des gefundenen Artikels an DIESEM Ort. null = hier nie gezählt. */
  const [bestandHier, setBestandHier] = useState<number | null>(null);
  const [menge, setMenge] = useState('1');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [log, setLog] = useState<{ t: string; text: string; farbe: string }[]>([]);
  const [kameraAuf, setKameraAuf] = useState(false);
  const [kameraGeht, setKameraGeht] = useState(false);
  const [anlegenCode, setAnlegenCode] = useState<string | null>(null);
  const [neuForm, setNeuForm] = useState({ bez: '', einheit: 'Stk', nr: '' });
  const [anlegenBusy, setAnlegenBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data: st } = await supabase.from('standorte')
          .select('id, name').eq('owner_user_id', id).eq('aktiv', true).order('name');
        setStandorte((st as StandortRow[]) ?? []);
      }
    })();
    setKameraGeht(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  /**
   * Auf welche Filiale wird gebucht? Wer alle Filialen zusammen sieht und
   * mehrere hat, muss wählen — geraten wird hier nicht.
   */
  const wahl = useMemo(
    () => standortFuerBuchung(konkreterStandort(leseStandortCookie()), standorte),
    [standorte],
  );
  const filialName = wahl.ok && wahl.standortId
    ? (standorte.find((s) => s.id === wahl.standortId)?.name ?? 'Filiale')
    : null;

  useEffect(() => { inputRef.current?.focus(); }, [artikel, modus]);

  const suche = useCallback(async (roh: string) => {
    const c = clean(roh);
    if (!c) return;
    setFehler(null); setArtikel(null); setAnlegenCode(null); setBestandHier(null);
    try {
      const { data, error } = await supabase
        .from('artikel')
        .select('id, artikelnummer, bezeichnung, einheit, aktueller_bestand, ean, lagerort')
        .or(`ean.eq.${c},artikelnummer.eq.${c}`)
        .eq('aktiv', true).limit(1);
      if (error) throw error;
      const a = (data as Artikel[])?.[0];
      if (!a) {
        // Unbekannt -> gleich anlegen anbieten (Erstaufnahme im leeren Lager).
        setAnlegenCode(c);
        setNeuForm({ bez: '', einheit: 'Stk', nr: '' });
        return;
      }

      // Bestand an DIESEM Ort holen. Fehlt die Zeile, ist der Bestand
      // unbekannt — nicht null Stück. Der Unterschied entscheidet, was bei
      // einer Inventur im Feld steht.
      let hier: number | null = null;
      if (wahl.ok) {
        const basis = supabase.from('artikel_bestand_standort').select('bestand').eq('artikel_id', a.id);
        const { data: bz } = await (wahl.standortId
          ? basis.eq('standort_id', wahl.standortId)
          : basis.is('standort_id', null)).maybeSingle();
        const roher = Number((bz as { bestand: number | null } | null)?.bestand);
        hier = Number.isFinite(roher) ? roher : null;
      }
      setBestandHier(hier);
      setArtikel(a);
      // Inventur: mit dem Bestand DIESER Filiale vorbelegen. Wurde hier noch
      // nie gezählt, bleibt das Feld leer — eine vorgeschlagene 0 wäre eine
      // Behauptung über ein Regal, das niemand angesehen hat.
      setMenge(modus === 'inventur' ? (hier === null ? '' : String(hier)) : '1');
    } catch (e: unknown) {
      setFehler('Suche fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }, [modus, wahl]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Scanner schließen den Code meist mit Enter (CR) ab — manche mit Tab.
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void suche(code); setCode(''); }
  }

  async function buchen() {
    if (!artikel) return;
    if (!wahl.ok) { setFehler(wahl.fehler); return; }
    const m = num(menge);
    if (modus !== 'inventur' && m <= 0) { setFehler('Bitte eine Menge > 0 angeben.'); return; }
    if (modus === 'inventur' && menge.trim() === '') {
      setFehler('Bitte den gezählten Bestand eintragen — auch wenn er 0 ist.');
      return;
    }
    setBusy(true); setFehler(null);
    try {
      // Eine einzige Buchung: Bewegung, Bestand der Filiale und die
      // Gesamtsumme des Artikels werden zusammen geschrieben. Zurück kommt
      // der neue Bestand AN DIESEM ORT.
      const { data: neuRoh, error: bErr } = await supabase.rpc(RPC_BUCHEN, buchenArgumente({
        artikelId: artikel.id,
        standortId: wahl.standortId,
        art: MODUS_ART[modus],
        menge: m,
        herkunft: modus === 'inventur' ? 'inventur' : 'scanner',
        notiz: modus === 'inventur' ? 'Inventur (Scanner)' : 'Scanner',
      }));
      if (bErr) throw bErr;

      const neu = Number(neuRoh);
      const alt = bestandHier;
      const delta = modus === 'inventur'
        ? (alt === null ? m : m - alt)
        : (modus === 'eingang' ? m : -m);
      const mi = modusInfo(modus);
      const wo = filialName ? ` · ${filialName}` : '';
      setLog((l) => [{
        t: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        text: `${mi.zeichen}${fmt(Math.abs(delta))} ${artikel.einheit} · ${artikel.bezeichnung}${wo}`
          + ` → Bestand ${Number.isFinite(neu) ? fmt(neu) : '—'}`,
        farbe: mi.farbe,
      }, ...l].slice(0, 30));
      setArtikel(null); setCode(''); setMenge('1'); setBestandHier(null);
      inputRef.current?.focus();
    } catch (e: unknown) {
      setFehler('Buchen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  // Unbekannten Code als neuen Artikel anlegen (Erstaufnahme), dann direkt buchen.
  async function artikelAnlegen() {
    if (!anlegenCode) return;
    if (!neuForm.bez.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setAnlegenBusy(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('artikel').insert({
        owner_user_id: uid, bezeichnung: neuForm.bez.trim(), einheit: neuForm.einheit.trim() || 'Stk',
        ean: anlegenCode, artikelnummer: neuForm.nr.trim() || null, aktueller_bestand: 0, aktiv: true,
      }).select('id, artikelnummer, bezeichnung, einheit, aktueller_bestand, ean, lagerort').single();
      if (error) throw error;
      const a = data as Artikel;
      setAnlegenCode(null);
      setArtikel(a);
      // Frisch angelegt: Der Bestand ist hier tatsächlich 0, nicht unbekannt.
      setBestandHier(0);
      setMenge(modus === 'inventur' ? '0' : '1');
    } catch (e: unknown) {
      setFehler('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setAnlegenBusy(false); }
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
      setFehler('Kamera nicht verfügbar. Nutzen Sie das Eingabefeld — ein Handscanner tippt den Code dort ein.');
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

      {!wahl.ok ? (
        <div style={styles.err}>{wahl.fehler}</div>
      ) : filialName ? (
        <div style={styles.filialLeiste}>Gebucht wird auf <b style={{ color: C.text }}>{filialName}</b>.</div>
      ) : null}

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
              {filialName ? `${filialName}: ` : 'Bestand: '}
              <b style={{ color: C.text }}>
                {bestandHier === null ? 'hier noch nicht gezählt' : `${fmt(bestandHier)} ${artikel.einheit}`}
              </b>
              {filialName ? <> · gesamt {fmt(artikel.aktueller_bestand)} {artikel.einheit}</> : null}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
              <div>
                <label style={styles.lbl}>{modus === 'inventur' ? `Gezählter Bestand${filialName ? ` in ${filialName}` : ''}` : 'Menge'}</label>
                <input style={{ ...styles.input, maxWidth: 140, fontSize: 'clamp(18px, 1.6vw, 26px)', textAlign: 'center' }} inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} placeholder={modus === 'inventur' ? 'zählen' : ''} />
              </div>
              <button onClick={buchen} disabled={busy || !wahl.ok} style={{ ...styles.buchenBtn, background: mi.farbe, opacity: busy || !wahl.ok ? 0.6 : 1 }}>
                {busy ? 'Bucht …' : `${mi.zeichen} ${mi.label} buchen`}
              </button>
              <button onClick={() => { setArtikel(null); setCode(''); inputRef.current?.focus(); }} style={styles.ghostBtn}>Abbrechen</button>
            </div>
          </div>
        )}

        {anlegenCode && !artikel && (
          <div style={styles.trefferBox}>
            <div style={{ fontWeight: 800, color: C.warn, marginBottom: 4 }}>Neuer Artikel · Code „{anlegenCode}"</div>
            <p style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', margin: '0 0 12px' }}>
              Diese Nummer kennt das System noch nicht. Legen Sie den Artikel jetzt an — die gescannte Nummer wird als EAN gespeichert, danach buchen Sie direkt weiter.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Bezeichnung *</label><input style={styles.input} value={neuForm.bez} onChange={(e) => setNeuForm((f) => ({ ...f, bez: e.target.value }))} placeholder="z. B. Schraube M8 verzinkt" autoFocus /></div>
              <div><label style={styles.lbl}>Einheit</label><input style={styles.input} value={neuForm.einheit} onChange={(e) => setNeuForm((f) => ({ ...f, einheit: e.target.value }))} /></div>
              <div><label style={styles.lbl}>Artikelnr. (optional)</label><input style={styles.input} value={neuForm.nr} onChange={(e) => setNeuForm((f) => ({ ...f, nr: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={artikelAnlegen} disabled={anlegenBusy} style={{ ...styles.primaer, opacity: anlegenBusy ? 0.6 : 1 }}>{anlegenBusy ? 'Legt an …' : '+ Artikel anlegen & weiter'}</button>
              <button onClick={() => { setAnlegenCode(null); setCode(''); inputRef.current?.focus(); }} style={styles.ghostBtn}>Abbrechen</button>
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
  filialLeiste: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', marginBottom: 14, color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' },
  hilfeInhalt: { marginTop: 10, fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.text, lineHeight: 1.5 },
};

