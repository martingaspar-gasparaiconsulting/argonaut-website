'use client';

// ============================================================
// ARGONAUT OS · Präsentations-Modus (Auto-Rundgang für Frühstück/Screen)
// NEU (v2): Ein durchgehender Rundgang am Beispiel der Bäckerei Sonnenschein.
//   · Startet mit einem hellen Willkommens-Screen (kein Abdunkeln der Daten).
//   · Danach 10 Stationen, je 12 Sekunden, jede mit eigener Headline, die
//     EINEN Auftrag von Marketing bis Steuer erzählt (Catering, 1.800 €).
//   · Feste Unterzeile unten mittig — sie springt NIE (Flex-Zentrierung statt
//     transform), nur der Text wechselt per sanftem Überblenden.
//   · Endlosschleife; Steuerung Pause/Zurück/Weiter/Beenden; ESC beendet.
// Eingehängt global in app/dashboard/layout.tsx → läuft über alle Seiten.
// Pfad: app/dashboard/_components/PraesentationsModus.tsx
// ============================================================

import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

type Schritt = {
  href: string;
  kapitel: string;
  titel: string;
  text: string;
  sekunden: number;
  gross?: boolean; // Willkommen/Abschluss: großer Screen mittig
};

const FIRMA = 'Bäckerei Sonnenschein';
const SEK = 12; // Mindest-Standzeit je Seite (Wunsch: >= 12 s)

// Der rote Faden: ein Catering-Auftrag über 1.800 € — von Anfang bis Ende.
const SKRIPT: Schritt[] = [
  { href: '/dashboard', gross: true, kapitel: 'Willkommen', titel: 'Ihr Rundgang durch ARGONAUT OS',
    text: `Am Beispiel der ${FIRMA} begleiten wir einen echten Auftrag — von der ersten Anfrage bis zur fertigen Steuer. Lehnen Sie sich zurück, der Rundgang startet automatisch.`, sekunden: SEK },

  { href: '/dashboard/marketing', kapitel: '1 · Marketing', titel: 'Es beginnt mit einer Kampagne',
    text: 'Die Aktion „Frühlings-Catering 2026“ geht an die Stammkunden — so kommen neue Aufträge herein.', sekunden: SEK },

  { href: '/dashboard/leads', kapitel: '2 · Leads', titel: 'Eine Anfrage kommt herein',
    text: 'Die Stadtwerke Böblingen fragen: Catering für 40 Personen zum Firmenjubiläum. Die Anfrage landet automatisch als Lead im System.', sekunden: SEK },

  { href: '/dashboard/crm', kapitel: '3 · Kunden / CRM', titel: 'Aus der Anfrage wird ein Kunde',
    text: 'Ein Klick macht aus dem Lead einen Kunden in der Kunden-Akte — Adresse, Kontakt und Historie an einem Ort.', sekunden: SEK },

  { href: '/dashboard/pipeline', kapitel: '4 · Deal-Pipeline', titel: 'Der Auftrag wandert durch die Pipeline',
    text: 'Von der Anfrage über das Angebot bis „gewonnen“ — immer sichtbar, was als Nächstes zu tun ist.', sekunden: SEK },

  { href: '/dashboard/angebote', kapitel: '5 · Angebote', titel: 'Das Angebot steht',
    text: 'Catering-Paket Firmenjubiläum, 40 Personen, 1.800 €. Der Kunde sagt zu — Angebot angenommen.', sekunden: SEK },

  { href: '/dashboard/rechnungen', kapitel: '6 · Rechnungen', titel: 'Ein Klick zur Rechnung',
    text: 'Aus dem angenommenen Angebot wird per Klick die Rechnung — §14-konform, mit GiroCode zum Scannen. Nichts doppelt tippen.', sekunden: SEK },

  { href: '/dashboard/banking', kapitel: '7 · Banking', titel: 'Die Zahlung kommt an',
    text: '1.800 € von den Stadtwerken gehen ein — ARGONAUT erkennt die Zahlung und ordnet sie der Rechnung automatisch zu.', sekunden: SEK },

  { href: '/dashboard/euer', kapitel: '8 · EÜR & Steuer', titel: 'Die Steuer rechnet sich selbst',
    text: 'Der Umsatz landet automatisch in der Einnahmenüberschussrechnung — dieselben Zahlen, eine einzige Quelle.', sekunden: SEK },

  { href: '/dashboard/anschluesse', kapitel: '9 · Anschlüsse', titel: 'Alles sicher verbunden',
    text: 'Bank, Postfach, Marktplätze und ELSTER — an einem Ort verbunden, damit alles automatisch zusammenläuft.', sekunden: SEK },

  { href: '/dashboard/rezeptur', kapitel: '10 · Ihre Branche', titel: 'Für Ihre Branche gemacht',
    text: 'Die Bäckerei rechnet Rezepturen und Ausbeute — jeder Betrieb bekommt genau die Werkzeuge, die er braucht.', sekunden: SEK },

  { href: '/dashboard', gross: true, kapitel: 'Abschluss', titel: 'Ein System. Ein Login.',
    text: `Von der ersten Anfrage bis zur Steuer — alles greift ineinander. ARGONAUT OS für die ${FIRMA}.`, sekunden: SEK },
];

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#EAF1F6', textDim: '#9fb3bd', border: 'rgba(201,168,76,0.55)',
};

export default function PraesentationsModus() {
  const router = useRouter();
  const [aktiv, setAktiv] = useState(false);
  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopp = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const beenden = useCallback(() => { stopp(); setAktiv(false); }, [stopp]);

  // Zum aktuellen Schritt navigieren + den nächsten planen (Endlosschleife).
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
      <button onClick={starten} style={styles.startBtn} title="Präsentations-Modus starten (Auto-Rundgang)">
        🎬 Präsentation
      </button>
    );
  }

  const s = SKRIPT[i];

  // Gemeinsame Karten-Innereien (Kapitel, Titel, Text, Fortschritt, Steuerung).
  const Karte = (
    <div key={i} style={s.gross ? styles.karteGross : styles.karte}>
      <div style={styles.eyebrow}>ARGONAUT OS · {FIRMA} · {s.kapitel}</div>
      <div style={s.gross ? styles.titelGross : styles.titel}>{s.titel}</div>
      <div style={s.gross ? styles.textGross : styles.text}>{s.text}</div>
      <div style={styles.balken}>
        <div key={`${i}-${pause}`} style={{ ...styles.balkenFill, animation: pause ? 'none' : `argoBar ${Math.max(2, s.sekunden)}s linear forwards` }} />
      </div>
      <div style={styles.controls}>
        <button style={styles.ctrl} onClick={zurueck}>‹ Zurück</button>
        <button style={styles.ctrl} onClick={() => setPause((p) => !p)}>{pause ? '▶ Weiter' : '⏸ Pause'}</button>
        <button style={styles.ctrl} onClick={weiter}>Weiter ›</button>
        <button style={styles.ctrlWeg} onClick={beenden}>✕ Beenden (Esc)</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes argoBar { from { width: 0% } to { width: 100% } }
        @keyframes argoIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes argoFade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {s.gross ? (
        // Willkommen / Abschluss: großer Screen mittig, weicher Hintergrund.
        <div style={styles.grossWrap}>{Karte}</div>
      ) : (
        // Tour: KEIN Abdunkeln — nur die feste Unterzeile unten mittig.
        <div style={styles.unterzeileWrap}>{Karte}</div>
      )}
    </>
  );
}

const cardBase: CSSProperties = {
  background: 'rgba(15,32,54,0.97)',
  border: `1px solid ${C.border}`,
  borderTop: `3px solid ${C.gold}`,
  borderRadius: 16,
  boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
  pointerEvents: 'auto',
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
};

const styles: Record<string, CSSProperties> = {
  startBtn: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
    background: 'rgba(15,32,54,0.92)', color: C.gold, border: `1px solid ${C.border}`,
    borderRadius: 999, padding: '9px 15px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
    fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', backdropFilter: 'blur(6px)',
  },

  // Tour-Unterzeile: fest unten, mittig via Flex (kein transform → springt nie).
  unterzeileWrap: {
    position: 'fixed', left: 0, right: 0, bottom: '3.5vh', zIndex: 9999,
    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
  },
  karte: {
    ...cardBase, width: 'min(880px, 94vw)', padding: '18px 26px 16px',
    animation: 'argoIn .45s ease',
  },

  // Willkommen/Abschluss: ganzflächig, weicher Schleier NUR hier (keine Daten dahinter nötig).
  grossWrap: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(1200px 700px at 50% 30%, rgba(10,22,40,0.86), rgba(10,22,40,0.94))',
    pointerEvents: 'auto', animation: 'argoFade .4s ease',
  },
  karteGross: {
    ...cardBase, width: 'min(820px, 92vw)', padding: '46px 52px 30px', textAlign: 'center',
    animation: 'argoIn .5s ease',
  },

  eyebrow: { color: C.gold, letterSpacing: 1.6, textTransform: 'uppercase', fontSize: 12, fontWeight: 800, marginBottom: 8 },
  titel: { color: C.text, fontSize: 'clamp(20px, 2.1vw, 28px)', fontWeight: 800, marginBottom: 6, lineHeight: 1.15 },
  titelGross: { color: C.text, fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 800, marginBottom: 14, lineHeight: 1.1 },
  text: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 17px)', lineHeight: 1.5 },
  textGross: { color: C.textDim, fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: 1.6, maxWidth: 640, margin: '0 auto' },

  balken: { height: 5, background: 'rgba(143,163,190,0.18)', borderRadius: 999, overflow: 'hidden', margin: '15px 0 13px' },
  balkenFill: { height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.cyan})`, borderRadius: 999, width: '0%' },

  controls: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  ctrl: { background: 'transparent', color: C.text, border: '1px solid rgba(143,163,190,0.32)', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  ctrlWeg: { background: 'transparent', color: '#E06666', border: '1px solid rgba(224,102,102,0.42)', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
