'use client';

// ============================================================
// ARGONAUT OS · /buehne — Kiosk-/Bühnen-Modus für den großen Screen
// Lädt die öffentliche /vorschau-Seite in einem gleichdomänigen iframe und
// scrollt sie automatisch, LANGSAM Sektion für Sektion durch — endlos im Loop.
// Oben rechts ein QR-Code zum Scannen. Hält den Bildschirm wach (Wake Lock).
// Steuerung per Fernbedienung: ↓/→ weiter · ↑/← zurück · Leertaste Pause · F Vollbild.
// Kein Touch nötig. Gedacht für Laptop→HDMI→Screen, Chrome im Vollbild.
// ============================================================

import { useEffect, useRef, useState, type CSSProperties } from 'react';

// QR-Code (fest eingebettet, kein externer Dienst) — Ziel: eure Website.
const QR = 'data:image/png;base64,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';
const DWELL_MS = 9000; // Verweildauer je Sektion (langsam)
const SCHRITT = 0.82;  // Scroll-Schritt als Anteil der Sichthöhe

export default function BuehnePage() {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [pausiert, setPausiert] = useState(false);
  const pausiertRef = useRef(false);
  const posRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { pausiertRef.current = pausiert; }, [pausiert]);

  useEffect(() => {
    let abbruch = false;
    let gestartet = false;

    function frame(): HTMLIFrameElement | null {
      const el = ref.current;
      try { return el && el.contentWindow && el.contentDocument ? el : null; } catch { return null; }
    }
    function maxScroll(): number {
      const el = frame(); if (!el) return 0;
      const d = el.contentDocument!; const w = el.contentWindow!;
      const h = Math.max(d.body?.scrollHeight || 0, d.documentElement?.scrollHeight || 0);
      return Math.max(0, h - w.innerHeight);
    }
    function schritt(): number {
      const el = frame(); if (!el) return 400;
      return Math.max(200, Math.round(el.contentWindow!.innerHeight * SCHRITT));
    }
    function scrolle(top: number) {
      try { frame()?.contentWindow?.scrollTo({ top, behavior: 'smooth' }); } catch { /* egal */ }
    }
    function planeNaechsten() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, DWELL_MS);
    }
    function tick() {
      if (abbruch) return;
      if (pausiertRef.current) { timerRef.current = setTimeout(tick, 500); return; }
      if (!frame()) { timerRef.current = setTimeout(tick, 800); return; }
      const max = maxScroll();
      let next = posRef.current + schritt();
      if (next >= max - 4) next = 0; // am Ende -> zurück an den Anfang (Loop)
      posRef.current = next;
      scrolle(next);
      timerRef.current = setTimeout(tick, DWELL_MS);
    }

    function starte() {
      if (gestartet) return;
      gestartet = true;
      // Scrollbalken im iframe ausblenden (gleiche Domain erlaubt das).
      try {
        const d = frame()?.contentDocument;
        if (d) {
          const st = d.createElement('style');
          st.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}';
          d.head?.appendChild(st);
        }
      } catch { /* egal */ }
      posRef.current = 0;
      scrolle(0);
      timerRef.current = setTimeout(tick, 3500);
    }

    const el = ref.current;
    if (el) el.addEventListener('load', starte);
    const fallback = setTimeout(starte, 6000); // falls 'load' schon vorbei war

    // Bildschirm wach halten.
    let wl: { release?: () => void } | null = null;
    async function wach() {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } };
        if (nav.wakeLock) wl = await nav.wakeLock.request('screen');
      } catch { /* nicht unterstützt — Geräte-Einstellungen decken das ab */ }
    }
    wach();
    const onVis = () => { if (document.visibilityState === 'visible') wach(); };
    document.addEventListener('visibilitychange', onVis);

    // Steuerung per Tastatur/Fernbedienung.
    function manuell(richtung: number) {
      const max = maxScroll();
      let next = posRef.current + richtung * schritt();
      if (next < 0) next = max;
      if (next > max) next = 0;
      posRef.current = next;
      scrolle(next);
      planeNaechsten();
    }
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); manuell(1); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); manuell(-1); }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); setPausiert((p) => !p); }
      else if (k === 'f' || k === 'F') { document.documentElement.requestFullscreen?.().catch(() => {}); }
    }
    document.addEventListener('keydown', onKey);

    return () => {
      abbruch = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(fallback);
      if (el) el.removeEventListener('load', starte);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      try { wl?.release?.(); } catch { /* egal */ }
    };
  }, []);

  return (
    <div style={S.wrap}>
      <iframe ref={ref} src="/vorschau" style={S.frame} title="ARGONAUT Vorschau" />
      <div style={S.qrBox}>
        <img src={QR} alt="QR-Code zur Website" style={S.qr} />
        <div style={S.qrText}>Jetzt scannen</div>
      </div>
      {pausiert && <div style={S.pause}>❚❚ Pause</div>}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { position: 'fixed', inset: 0, background: '#06101d', overflow: 'hidden', cursor: 'none' },
  frame: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' },
  qrBox: {
    position: 'fixed', top: 'clamp(14px,2.2vw,34px)', right: 'clamp(14px,2.2vw,34px)', zIndex: 20,
    background: 'rgba(10,22,40,0.92)', border: '1px solid rgba(201,168,76,0.55)', borderRadius: 18,
    padding: 'clamp(10px,1vw,16px)', textAlign: 'center', boxShadow: '0 12px 40px -12px rgba(0,0,0,.6)',
  },
  qr: { width: 'clamp(96px,9vw,168px)', height: 'clamp(96px,9vw,168px)', display: 'block', borderRadius: 10, background: '#fff' },
  qrText: { marginTop: 8, color: '#C9A84C', fontWeight: 800, fontSize: 'clamp(12px,1vw,17px)', fontFamily: 'system-ui, sans-serif', letterSpacing: '.02em' },
  pause: { position: 'fixed', top: 'clamp(14px,2.2vw,34px)', left: 'clamp(14px,2.2vw,34px)', zIndex: 20, color: '#00e5ff', fontWeight: 800, fontSize: 'clamp(16px,1.6vw,26px)', fontFamily: 'system-ui, sans-serif' },
};
