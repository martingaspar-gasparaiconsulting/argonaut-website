'use client';

// ============================================================
// ARGONAUT OS · Präsentations-Modus (Auto-Loop für Frühstück/Video)
// Startet auf Klick, springt dann VON SELBST durch die Werkzeuge:
// dunkelt ab, der aktive Schritt/Text leuchtet gold, geht automatisch
// weiter — am Ende in Endlosschleife. Ideal als Bildschirmaufnahme oder
// als Dauerschleife am großen Screen. Läuft über die Übungswelt-Daten.
// Robuste Variante: NUR navigieren + hervorheben, keine Live-Eingaben.
// Eingehängt global in app/dashboard/layout.tsx → läuft über alle Seiten.
// Pfad: app/dashboard/_components/PraesentationsModus.tsx
// ============================================================

import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

type Schritt = { href: string; titel: string; text: string; sekunden: number };

// Die goldene Kette — einmal eintragen, überall angekommen.
const SKRIPT: Schritt[] = [
  { href: '/dashboard',            titel: 'Ein System statt zwölf', text: 'Ihr ganzes Unternehmen an einem Ort — ein Login, alles greift ineinander.', sekunden: 6 },
  { href: '/dashboard/crm',        titel: '🤝 Kunden', text: 'Ihre Kunden einmal anlegen — und für Angebot, Auftrag, Rechnung immer wieder nutzen.', sekunden: 6 },
  { href: '/dashboard/pipeline',   titel: '📊 Deal-Pipeline', text: 'Verkaufschancen im Blick, mit gewichtetem Forecast — vom Erstkontakt bis gewonnen.', sekunden: 6 },
  { href: '/dashboard/angebote',   titel: '🧾 Angebote', text: 'Angebote in Minuten. Der Kunde sagt zu — und ein Klick macht daraus die Rechnung.', sekunden: 6 },
  { href: '/dashboard/rechnungen', titel: '🧾 Rechnungen', text: '§14-konform, mit GiroCode zum Scannen. Ohne je etwas doppelt zu tippen.', sekunden: 6 },
  { href: '/dashboard/banking',    titel: '🏦 Banking-Abgleich', text: 'Zahlungen werden automatisch erkannt und der Rechnung zugeordnet.', sekunden: 6 },
  { href: '/dashboard/euer',       titel: '📗 EÜR & Umsatzsteuer', text: 'Und die Steuer? Rechnet sich von selbst — dieselben Zahlen, eine Quelle.', sekunden: 6 },
  { href: '/dashboard/versand',    titel: '📦 Versand', text: 'Versandlabels, Sendungsverfolgung und Retouren — inklusive.', sekunden: 5 },
  { href: '/dashboard/anschluesse',titel: '🔌 Anschlüsse', text: 'Bank, Postfach, Marktplätze, ELSTER — alles sicher verbunden, an einem Ort.', sekunden: 6 },
  { href: '/dashboard/verein',     titel: '⚙️ Eigene Felder', text: 'Ihr Betrieb ist besonders? Jeder baut sich seine eigenen Spalten selbst — für jede Branche.', sekunden: 6 },
  { href: '/dashboard',            titel: 'Alles greift ineinander', text: 'Ein System. Ein Login. ARGONAUT OS — das KI-Betriebssystem für den Mittelstand.', sekunden: 6 },
];

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(201,168,76,0.5)',
};

export default function PraesentationsModus() {
  const router = useRouter();
  const [aktiv, setAktiv] = useState(false);
  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopp = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const beenden = useCallback(() => { stopp(); setAktiv(false); }, [stopp]);

  // Navigiere zum aktuellen Schritt + plane den nächsten (Schleife).
  useEffect(() => {
    if (!aktiv) return;
    router.push(SKRIPT[i].href);
    stopp();
    if (pause) return;
    timer.current = setTimeout(() => {
      setI((x) => (x + 1) % SKRIPT.length);
    }, Math.max(2, SKRIPT[i].sekunden) * 1000);
    return stopp;
  }, [aktiv, i, pause, router, stopp]);

  // ESC beendet.
  useEffect(() => {
    if (!aktiv) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') beenden(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aktiv, beenden]);

  function starten() { setI(0); setPause(false); setAktiv(true); }
  function weiter() { stopp(); setI((x) => (x + 1) % SKRIPT.length); }
  function zurueck() { stopp(); setI((x) => (x - 1 + SKRIPT.length) % SKRIPT.length); }

  if (!aktiv) {
    return (
      <button onClick={starten} style={styles.startBtn} title="Präsentations-Modus starten (Auto-Loop)">
        🎬 Präsentation
      </button>
    );
  }

  const s = SKRIPT[i];
  return (
    <div style={styles.wrap} aria-hidden>
      <style>{`
        @keyframes argoFortschritt { from { width: 0% } to { width: 100% } }
        @keyframes argoGoldPuls { 0%,100% { box-shadow: inset 0 0 0 2px rgba(201,168,76,0.35) } 50% { box-shadow: inset 0 0 0 3px rgba(201,168,76,0.85) } }
        @keyframes argoAuf { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      `}</style>
      {/* Abdunkeln + Gold-Rahmen (Puls) */}
      <div style={styles.dim} />
      <div style={styles.rahmen} />
      {/* Text-Karte */}
      <div key={i} style={styles.karte}>
        <div style={styles.eyebrow}>ARGONAUT OS · Präsentation · {i + 1}/{SKRIPT.length}</div>
        <div style={styles.titel}>{s.titel}</div>
        <div style={styles.text}>{s.text}</div>
        <div style={styles.balken}>
          <div key={`${i}-${pause}`} style={{ ...styles.balkenFill, animation: pause ? 'none' : `argoFortschritt ${Math.max(2, s.sekunden)}s linear forwards` }} />
        </div>
        <div style={styles.controls}>
          <button style={styles.ctrl} onClick={zurueck}>‹ Zurück</button>
          <button style={styles.ctrl} onClick={() => setPause((p) => !p)}>{pause ? '▶ Weiter' : '⏸ Pause'}</button>
          <button style={styles.ctrl} onClick={weiter}>Weiter ›</button>
          <button style={styles.ctrlWeg} onClick={beenden}>✕ Beenden (Esc)</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  startBtn: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
    background: 'rgba(15,32,54,0.9)', color: C.gold, border: `1px solid ${C.border}`,
    borderRadius: 999, padding: '9px 15px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
    fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', backdropFilter: 'blur(6px)',
  },
  wrap: { position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  dim: { position: 'absolute', inset: 0, background: 'rgba(10,22,40,0.42)' },
  rahmen: { position: 'absolute', inset: 0, animation: 'argoGoldPuls 2.4s ease-in-out infinite' },
  karte: {
    position: 'absolute', left: '50%', bottom: '7vh', transform: 'translateX(-50%)',
    width: 'min(720px, 92vw)', background: 'rgba(15,32,54,0.97)', border: `1px solid ${C.border}`,
    borderRadius: 18, padding: '20px 26px', pointerEvents: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'argoAuf .4s ease',
  },
  eyebrow: { color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', fontSize: 12, fontWeight: 700, marginBottom: 8 },
  titel: { color: C.text, fontSize: 'clamp(22px, 2.4vw, 32px)', fontWeight: 800, marginBottom: 6, fontFamily: 'var(--font-dm-sans), sans-serif' },
  text: { color: C.textDim, fontSize: 'clamp(15px, 1.4vw, 19px)', lineHeight: 1.5 },
  balken: { height: 6, background: 'rgba(143,163,190,0.18)', borderRadius: 999, overflow: 'hidden', margin: '16px 0 14px' },
  balkenFill: { height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.cyan})`, borderRadius: 999, width: '0%' },
  controls: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  ctrl: { background: 'transparent', color: C.text, border: `1px solid rgba(143,163,190,0.3)`, borderRadius: 9, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  ctrlWeg: { background: 'transparent', color: '#E06666', border: '1px solid rgba(224,102,102,0.4)', borderRadius: 9, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
