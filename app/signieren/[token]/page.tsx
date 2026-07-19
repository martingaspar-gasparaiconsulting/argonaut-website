'use client';

// ============================================================
// ARGONAUT OS · Welle 5 · Öffentliche Unterschriftsseite (ohne Login)
// Zeigt das Dokument, nimmt eine gezeichnete Unterschrift + Einwilligung ab
// und speichert sie (Token-basiert). Pfad: app/signieren/[token]/page.tsx
// ============================================================

import { useState, useEffect, useRef, useCallback, CSSProperties, type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from 'react';
import { useParams } from 'next/navigation';

type Daten = { titel: string; empfaenger_name: string | null; dokument: string; ort: string | null; firma: string; status: string; signiert_am: string | null; unterzeichner_name: string | null; error?: string };

export default function SignierenPage() {
  const params = useParams();
  const token = String((params?.token as string) || '');
  const [d, setD] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ort, setOrt] = useState('');
  const [einwilligung, setEinwilligung] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fertig, setFertig] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const [gezeichnet, setGezeichnet] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/oeffentlich/signatur?token=${encodeURIComponent(token)}`);
        const j = (await res.json()) as Daten;
        if (!res.ok || j.error) { setFehler(j.error || 'Nicht gefunden.'); }
        else { setD(j); setName(j.empfaenger_name || ''); if (j.status === 'signiert') setFertig(true); }
      } catch { setFehler('Verbindungsfehler.'); }
      finally { setLaden(false); }
    })();
  }, [token]);

  const punkt = useCallback((e: RMouseEvent | RTouchEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] : (e as RMouseEvent);
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  }, []);
  function start(e: RMouseEvent | RTouchEvent) { e.preventDefault(); zeichnet.current = true; const ctx = canvasRef.current!.getContext('2d')!; const { x, y } = punkt(e); ctx.beginPath(); ctx.moveTo(x, y); }
  function move(e: RMouseEvent | RTouchEvent) { if (!zeichnet.current) return; e.preventDefault(); const ctx = canvasRef.current!.getContext('2d')!; const { x, y } = punkt(e); ctx.lineTo(x, y); ctx.strokeStyle = '#0A1628'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); setGezeichnet(true); }
  function ende() { zeichnet.current = false; }
  function leeren() { const c = canvasRef.current; if (!c) return; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setGezeichnet(false); }

  async function signieren() {
    if (!gezeichnet) { setFehler('Bitte im Feld unterschreiben.'); return; }
    if (!name.trim()) { setFehler('Bitte Ihren Namen angeben.'); return; }
    if (!einwilligung) { setFehler('Bitte der elektronischen Signatur zustimmen.'); return; }
    setBusy(true); setFehler(null);
    try {
      const signaturBild = canvasRef.current!.toDataURL('image/png');
      const res = await fetch('/api/oeffentlich/signatur', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, unterzeichner_name: name.trim(), ort: ort.trim(), signaturBild, einwilligung: true }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setFehler(j?.error || 'Signieren fehlgeschlagen.'); setBusy(false); return; }
      setFertig(true);
    } catch { setFehler('Verbindungsfehler.'); setBusy(false); }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.marke}>◉ ARGONAUT OS · Elektronische Signatur</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : fehler && !d ? <div style={styles.err}>{fehler}</div> : d && (
          <>
            <div style={styles.absender}>Von: <b>{d.firma}</b></div>
            <h1 style={styles.h1}>{d.titel}</h1>

            <div style={styles.dokument}>{d.dokument || '(kein Dokumenttext)'}</div>

            {fertig ? (
              <div style={styles.ok}>
                <div style={{ fontSize: 34 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: 18, margin: '6px 0' }}>Vielen Dank — das Dokument ist signiert.</div>
                <div style={{ color: '#55606b', fontSize: 14 }}>Sie können Ihr signiertes Exemplar jetzt herunterladen.</div>
                <a href={`/api/signatur-pdf?token=${encodeURIComponent(token)}`} style={styles.dlBtn}>⬇ Signiertes PDF herunterladen</a>
              </div>
            ) : (
              <>
                <div style={styles.feldGrid}>
                  <label style={styles.lab}>Ihr Name<input style={styles.inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" /></label>
                  <label style={styles.lab}>Ort (optional)<input style={styles.inp} value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="z. B. München" /></label>
                </div>

                <div style={styles.sigLabelZeile}><span style={styles.sigLabel}>Ihre Unterschrift</span><button style={styles.leerBtn} onClick={leeren} type="button">Löschen</button></div>
                <canvas
                  ref={canvasRef} width={600} height={200} style={styles.canvas}
                  onMouseDown={start} onMouseMove={move} onMouseUp={ende} onMouseLeave={ende}
                  onTouchStart={start} onTouchMove={move} onTouchEnd={ende}
                />
                <div style={styles.hint}>Mit Maus oder Finger im Feld unterschreiben.</div>

                <label style={styles.check}>
                  <input type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} />
                  <span>Ich stimme zu, dieses Dokument <b>elektronisch zu signieren</b>, und bestätige, dass meine Angaben korrekt sind. (Einfache/fortgeschrittene elektronische Signatur nach eIDAS.)</span>
                </label>

                {fehler && <div style={styles.err}>{fehler}</div>}
                <button style={{ ...styles.signBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={signieren}>{busy ? 'Wird signiert …' : '✍️ Jetzt verbindlich signieren'}</button>
                <div style={styles.recht}>Mit dem Signieren werden Zeitpunkt, IP-Adresse und Gerät zu Nachweiszwecken protokolliert und das Dokument per Prüfsumme gegen Veränderung gesichert.</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0A1628', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 16px 60px', fontFamily: "'DM Sans', system-ui, sans-serif" },
  card: { background: '#ffffff', color: '#14202e', width: '100%', maxWidth: 640, borderRadius: 16, padding: '28px 30px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' },
  marke: { fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A84C', fontWeight: 700 },
  absender: { color: '#55606b', fontSize: 13, marginTop: 14 },
  h1: { fontSize: 22, fontWeight: 800, color: '#0A1628', margin: '4px 0 14px' },
  dokument: { whiteSpace: 'pre-wrap', background: '#f7f9fc', border: '1px solid #e3e8ef', borderRadius: 10, padding: '16px 18px', fontSize: 14, lineHeight: 1.6, maxHeight: 340, overflowY: 'auto' },
  feldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#55606b', fontWeight: 600 },
  inp: { background: '#fff', color: '#14202e', border: '1px solid #cdd5dd', borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  sigLabelZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 6 },
  sigLabel: { fontSize: 12.5, color: '#55606b', fontWeight: 700 },
  leerBtn: { background: 'transparent', border: '1px solid #cdd5dd', borderRadius: 8, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer', color: '#55606b', fontFamily: 'inherit' },
  canvas: { width: '100%', height: 200, background: '#fff', border: '2px dashed #b9c2cf', borderRadius: 10, touchAction: 'none', cursor: 'crosshair' },
  hint: { color: '#8a949e', fontSize: 12, marginTop: 6 },
  check: { display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13, color: '#33404f', lineHeight: 1.5, cursor: 'pointer' },
  signBtn: { width: '100%', marginTop: 16, background: '#0A1628', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  recht: { color: '#8a949e', fontSize: 11.5, marginTop: 10, lineHeight: 1.5 },
  dlBtn: { display: 'inline-block', marginTop: 14, background: '#0A1628', color: '#fff', textDecoration: 'none', padding: '11px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14 },
  ok: { textAlign: 'center', padding: '24px 10px' },
  dim: { color: '#55606b', fontSize: 14 },
  err: { color: '#c0392b', background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 9, padding: '10px 14px', marginTop: 12, fontSize: 13.5 },
};
