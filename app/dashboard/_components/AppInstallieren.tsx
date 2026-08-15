'use client';

// ============================================================================
// ARGONAUT OS · _components/AppInstallieren.tsx
//
// Der fehlende Schritt zur echten App: ein Knopf, der ARGONAUT auf den
// Startbildschirm legt. Manifest und Service-Worker waren schon da — nur die
// Einladung fehlte, und ohne die findet kaum ein Nutzer die Funktion.
//
// Zwei Wege, weil die Browser sich unterscheiden:
//   · Android/Chrome/Edge: das Ereignis "beforeinstallprompt" abfangen und
//     spaeter den echten Installations-Dialog oeffnen. Ein Klick, fertig.
//   · iPhone/iPad (Safari): dort gibt es dieses Ereignis nicht — Apple laesst
//     die Installation nur ueber "Teilen -> Zum Home-Bildschirm" zu. Also wird
//     genau dieser Weg in einfachen Worten erklaert.
//
// Hoeflichkeitsregeln: nie anzeigen, wenn die App schon installiert laeuft.
// "Spaeter" haelt 30 Tage Ruhe. Nach erfolgreicher Installation sofort weg.
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';

const SPEICHER_KEY = 'argonaut-install-spaeter';
const RUHE_TAGE = 30;

type InstallEreignis = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.22)',
};

/** Laeuft die Seite bereits als installierte App? */
function laeuftAlsApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  if (window.matchMedia?.('(display-mode: minimal-ui)')?.matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function istApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS meldet sich seit Version 13 als Mac — am Touch erkennbar.
  const iPadNeu = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOS || iPadNeu;
}

function ruhtNoch(): boolean {
  try {
    const wert = window.localStorage.getItem(SPEICHER_KEY);
    if (!wert) return false;
    const seit = Number(wert);
    if (!seit || isNaN(seit)) return false;
    return Date.now() - seit < RUHE_TAGE * 86400000;
  } catch { return false; }
}

export default function AppInstallieren() {
  const [ereignis, setEreignis] = useState<InstallEreignis | null>(null);
  const [zeigen, setZeigen] = useState(false);
  const [appleHilfe, setAppleHilfe] = useState(false);
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    if (laeuftAlsApp() || ruhtNoch()) return;

    function beiPrompt(e: Event) {
      e.preventDefault();                     // eigenen Zeitpunkt waehlen
      setEreignis(e as InstallEreignis);
      setZeigen(true);
    }
    function beiInstalliert() {
      setZeigen(false); setEreignis(null); setFertig(true);
      try { window.localStorage.removeItem(SPEICHER_KEY); } catch { /* egal */ }
    }

    window.addEventListener('beforeinstallprompt', beiPrompt);
    window.addEventListener('appinstalled', beiInstalliert);

    // Safari feuert kein beforeinstallprompt — dort nach kurzer Wartezeit
    // die Anleitung anbieten, damit der Hinweis nicht beim Seitenaufbau stoert.
    let uhr: ReturnType<typeof setTimeout> | null = null;
    if (istApple()) uhr = setTimeout(() => setZeigen(true), 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', beiPrompt);
      window.removeEventListener('appinstalled', beiInstalliert);
      if (uhr) clearTimeout(uhr);
    };
  }, []);

  async function installieren() {
    if (istApple() || !ereignis) { setAppleHilfe(true); return; }
    try {
      await ereignis.prompt();
      const wahl = await ereignis.userChoice;
      if (wahl.outcome === 'accepted') { setZeigen(false); setFertig(true); }
      else spaeter();
    } catch {
      setAppleHilfe(true);
    }
  }

  function spaeter() {
    try { window.localStorage.setItem(SPEICHER_KEY, String(Date.now())); } catch { /* egal */ }
    setZeigen(false); setAppleHilfe(false);
  }

  if (fertig) {
    return (
      <div style={stile.leiste}>
        <span style={{ fontSize: 20 }}>✓</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={stile.titel}>ARGONAUT ist installiert</div>
          <div style={stile.text}>Sie finden das Symbol ab sofort auf Ihrem Startbildschirm.</div>
        </div>
        <button type="button" onClick={() => setFertig(false)} style={stile.knopfRand}>Schließen</button>
      </div>
    );
  }

  if (!zeigen) return null;

  return (
    <div style={stile.leiste}>
      <span style={{ fontSize: 22 }}>📲</span>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={stile.titel}>ARGONAUT als App installieren</div>
        {appleHilfe ? (
          <div style={stile.text}>
            Tippen Sie unten in Safari auf das <b style={{ color: C.text }}>Teilen-Symbol</b> (Quadrat mit Pfeil nach oben),
            wählen Sie <b style={{ color: C.text }}>„Zum Home-Bildschirm"</b> und bestätigen Sie mit
            <b style={{ color: C.text }}> „Hinzufügen"</b>. Danach starten Sie ARGONAUT wie jede andere App.
          </div>
        ) : (
          <div style={stile.text}>
            Direkt vom Startbildschirm öffnen — ohne Browserleiste, mit eigenem Symbol.
            Auf der Baustelle und beim Kunden deutlich schneller zur Hand.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!appleHilfe && (
          <button type="button" onClick={installieren} style={stile.knopfGold}>
            {istApple() ? 'Wie geht das?' : 'Jetzt installieren'}
          </button>
        )}
        <button type="button" onClick={spaeter} style={stile.knopfRand}>
          {appleHilfe ? 'Verstanden' : 'Später'}
        </button>
      </div>
    </div>
  );
}

const stile: Record<string, CSSProperties> = {
  leiste: {
    position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 60,
    maxWidth: 760, margin: '0 auto',
    display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap',
    background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14,
    padding: '13px 16px', boxShadow: '0 10px 34px rgba(0,0,0,0.45)',
    color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  },
  titel: { fontWeight: 800, fontSize: 14.5, marginBottom: 3 },
  text: { color: C.dim, fontSize: 12.8, lineHeight: 1.55 },
  knopfGold: {
    padding: '9px 15px', borderRadius: 9, border: 'none', background: C.gold,
    color: C.navy, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
  },
  knopfRand: {
    padding: '9px 13px', borderRadius: 9, border: `1px solid ${C.border}`,
    background: 'transparent', color: C.text, fontWeight: 700, fontSize: 13.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
