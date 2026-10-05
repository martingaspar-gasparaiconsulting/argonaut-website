'use client';

// ============================================================
// ARGONAUT OS · Paket 213 (05.10.2026) · Stufe 3 B6b
// Foto markieren: Pfeil, Kreis, Rahmen, Freihand, Text — mit Finger oder Maus.
// Das Original bleibt; „Speichern“ liefert eine markierte JPEG-Fassung.
// Pfad: app/dashboard/bautagebuch/FotoMarkierung.tsx
// ============================================================

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import {
  FARBEN, MAX_FORMEN, zielGroesse, strichstaerke, schriftgroesse, aufBild, pfeilspitze, ellipse,
  formGueltig, textSaeubern, type Farbe, type Form, type Punkt, type Werkzeug,
} from '@/lib/fotoMarkierung';

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', danger: '#E06666' };

const WERKZEUGE: { key: Werkzeug; label: string }[] = [
  { key: 'pfeil', label: '➚ Pfeil' }, { key: 'kreis', label: '◯ Kreis' }, { key: 'rahmen', label: '▭ Rahmen' },
  { key: 'stift', label: '✎ Stift' }, { key: 'text', label: 'T Text' },
];

function zeichne(ctx: CanvasRenderingContext2D, f: Form, b: number, h: number) {
  const lw = strichstaerke(b, h);
  ctx.strokeStyle = FARBEN[f.farbe]; ctx.fillStyle = FARBEN[f.farbe];
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = lw;
  if (f.art === 'pfeil') {
    ctx.beginPath(); ctx.moveTo(f.von.x, f.von.y); ctx.lineTo(f.bis.x, f.bis.y); ctx.stroke();
    const [a, c] = pfeilspitze(f.von, f.bis, lw * 5);
    ctx.beginPath(); ctx.moveTo(f.bis.x, f.bis.y); ctx.lineTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill();
  } else if (f.art === 'kreis') {
    const e = ellipse(f.von, f.bis);
    ctx.beginPath(); ctx.ellipse(e.cx, e.cy, Math.max(1, e.rx), Math.max(1, e.ry), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (f.art === 'rahmen') {
    ctx.strokeRect(Math.min(f.von.x, f.bis.x), Math.min(f.von.y, f.bis.y), Math.abs(f.bis.x - f.von.x), Math.abs(f.bis.y - f.von.y));
  } else if (f.art === 'stift') {
    ctx.beginPath(); f.punkte.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
  } else if (f.art === 'text') {
    const fs = schriftgroesse(b, h);
    ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, Math.round(fs / 7));
    ctx.strokeStyle = f.farbe === 'schwarz' ? '#FFFFFF' : '#000000';
    ctx.strokeText(f.text, f.bei.x, f.bei.y);
    ctx.fillText(f.text, f.bei.x, f.bei.y);
  }
  ctx.shadowBlur = 0;
}

export default function FotoMarkierung({ quelle, onSpeichern, onSchliessen }: {
  /** Bild als Blob (aus storage.download) — kein fremder Ursprung, Canvas bleibt exportierbar. */
  quelle: Blob;
  onSpeichern: (jpeg: Blob) => Promise<void>;
  onSchliessen: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bildRef = useRef<HTMLImageElement | null>(null);
  const [groesse, setGroesse] = useState<{ breite: number; hoehe: number } | null>(null);
  const [formen, setFormen] = useState<Form[]>([]);
  const [entwurf, setEntwurf] = useState<Form | null>(null);
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('pfeil');
  const [farbe, setFarbe] = useState<Farbe>('rot');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Bild laden
  useEffect(() => {
    const url = URL.createObjectURL(quelle);
    const img = new Image();
    img.onload = () => { bildRef.current = img; setGroesse(zielGroesse(img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => setFehler('Das Foto konnte nicht geöffnet werden.');
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [quelle]);

  // Neu zeichnen
  useEffect(() => {
    const cv = canvasRef.current; const img = bildRef.current;
    if (!cv || !img || !groesse) return;
    cv.width = groesse.breite; cv.height = groesse.hoehe;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.drawImage(img, 0, 0, groesse.breite, groesse.hoehe);
    for (const f of formen) zeichne(ctx, f, groesse.breite, groesse.hoehe);
    if (entwurf) zeichne(ctx, entwurf, groesse.breite, groesse.hoehe);
  }, [groesse, formen, entwurf]);

  function punkt(ev: RPointerEvent<HTMLCanvasElement>): Punkt | null {
    const cv = canvasRef.current; if (!cv || !groesse) return null;
    const r = cv.getBoundingClientRect();
    return aufBild({ x: ev.clientX - r.left, y: ev.clientY - r.top }, { breite: r.width, hoehe: r.height }, groesse);
  }

  function runter(ev: RPointerEvent<HTMLCanvasElement>) {
    const p = punkt(ev); if (!p || formen.length >= MAX_FORMEN) return;
    if (werkzeug === 'text') {
      const t = textSaeubern(typeof window !== 'undefined' ? window.prompt('Text für die Markierung:') : '');
      if (t) setFormen((fs) => [...fs, { art: 'text', farbe, bei: p, text: t }]);
      return;
    }
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setEntwurf(werkzeug === 'stift' ? { art: 'stift', farbe, punkte: [p] } : { art: werkzeug, farbe, von: p, bis: p });
  }
  function bewegen(ev: RPointerEvent<HTMLCanvasElement>) {
    if (!entwurf) return; const p = punkt(ev); if (!p) return;
    setEntwurf(entwurf.art === 'stift' ? { ...entwurf, punkte: [...entwurf.punkte, p] } : entwurf.art === 'text' ? entwurf : { ...entwurf, bis: p });
  }
  function hoch() {
    if (entwurf && formGueltig(entwurf)) setFormen((fs) => [...fs, entwurf]);
    setEntwurf(null);
  }

  async function speichern() {
    const cv = canvasRef.current; if (!cv || formen.length === 0) return;
    setBusy(true); setFehler(null);
    try {
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Bild konnte nicht erzeugt werden.');
      await onSpeichern(blob);
    } catch (e: unknown) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally { setBusy(false); }
  }

  return (
    <div style={st.overlay} onClick={() => !busy && onSchliessen()}>
      <div style={st.fenster} onClick={(e) => e.stopPropagation()}>
        <div style={st.leiste}>
          {WERKZEUGE.map((w) => (
            <button key={w.key} type="button" onClick={() => setWerkzeug(w.key)} style={{ ...st.knopf, ...(werkzeug === w.key ? st.aktiv : {}) }}>{w.label}</button>
          ))}
          <span style={{ width: 8 }} />
          {(Object.keys(FARBEN) as Farbe[]).map((f) => (
            <button key={f} type="button" aria-label={`Farbe ${f}`} onClick={() => setFarbe(f)}
              style={{ ...st.farbe, background: FARBEN[f], outline: farbe === f ? `2px solid ${C.gold}` : 'none' }} />
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" disabled={formen.length === 0 || busy} onClick={() => setFormen((fs) => fs.slice(0, -1))} style={st.knopf}>↶ Zurück</button>
        </div>
        {fehler && <div style={{ color: C.danger, fontSize: 13, margin: '6px 0' }}>{fehler}</div>}
        <div style={st.flaeche}>
          {groesse ? (
            <canvas ref={canvasRef} style={st.canvas}
              onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={() => setEntwurf(null)} />
          ) : <div style={{ color: C.dim, padding: 30 }}>{fehler ? '' : 'Foto lädt …'}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ color: C.dim, fontSize: 12.5 }}>Das Original bleibt unverändert. Die markierte Fassung wird zusätzlich gespeichert.</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={onSchliessen} style={st.knopf}>Abbrechen</button>
            <button type="button" disabled={busy || formen.length === 0} onClick={speichern} style={st.gold}>{busy ? 'Speichert …' : 'Markiert speichern'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, width: 'min(1100px, 100%)', maxHeight: '96vh', display: 'flex', flexDirection: 'column' },
  leiste: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  knopf: { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  aktiv: { borderColor: C.cyan, color: C.cyan },
  farbe: { width: 24, height: 24, borderRadius: '50%', border: `1px solid ${C.border}`, cursor: 'pointer', padding: 0 },
  flaeche: { marginTop: 10, flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'center', background: C.navy, borderRadius: 10 },
  canvas: { maxWidth: '100%', maxHeight: '72vh', touchAction: 'none', cursor: 'crosshair', display: 'block' },
  gold: { padding: '8px 16px', borderRadius: 8, border: 'none', background: C.gold, color: '#0A1628', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
