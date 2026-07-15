"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// ============================================================================
// ARGONAUT OS · components/CookieBanner.tsx
//
// STAND 15.07.26 — ZWEI FEHLER BEHOBEN:
//
//  (1) DER BANNER HAT NICHTS GESPEICHERT.
//      Vorher: `const [visible, setVisible] = useState(true)` und beide Knöpfe
//      riefen nur `setVisible(false)`. Die Entscheidung lebte ausschliesslich im
//      React-State -> jeder Seitenwechsel, jeder neue Tab, jeder Neuladen holte
//      ihn zurueck. Jetzt: localStorage, ueberlebt Tabs und Sitzungen.
//
//  (2) ER ERSCHIEN IM EINGELOGGTEN BEREICH.
//      Er haengt in app/layout.tsx (Root) und zog damit ueber /dashboard und
//      /admin mit. Dort laeuft aber nur die Supabase-Session-Cookie — technisch
//      notwendig, dafuer braucht es keine Einwilligung. Jetzt: nur auf den
//      oeffentlichen Seiten.
//
// ⚠️ WICHTIG — DER BANNER IST AKTUELL FOLGENLOS:
//      "Akzeptieren" und "Ablehnen" unterscheiden sich nur darin, WAS gespeichert
//      wird. Es wird nichts blockiert, weil es (Stand heute) kein Tracking gibt,
//      das man blockieren muesste. Sobald echtes Tracking dazukommt (Analytics,
//      Pixel, Marketing-Skripte), MUSS es an `cookieEntscheidung()` haengen und
//      darf erst nach "akzeptiert" laden. Der Andockpunkt steht unten.
//      Rechtliche Abnahme: eRecht24.
// ============================================================================

const SPEICHER_SCHLUESSEL = "argonaut_cookie_entscheidung";

/** Pfade, auf denen der Banner NIE erscheint (eingeloggter Bereich). */
const OHNE_BANNER = ["/dashboard", "/admin", "/admin-login"];

export type CookieEntscheidung = "akzeptiert" | "abgelehnt" | null;

/**
 * ANDOCKPUNKT fuer spaeteres Tracking.
 * Liefert die gespeicherte Entscheidung. Ein Analytics-/Marketing-Skript darf
 * erst laden, wenn hier "akzeptiert" zurueckkommt.
 *
 * Beispiel:
 *   if (cookieEntscheidung() === "akzeptiert") { /* Skript laden *\/ }
 */
export function cookieEntscheidung(): CookieEntscheidung {
  if (typeof window === "undefined") return null;
  try {
    const wert = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
    return wert === "akzeptiert" || wert === "abgelehnt" ? wert : null;
  } catch {
    return null;
  }
}

export default function CookieBanner() {
  const pfad = usePathname();
  const [zeigen, setZeigen] = useState(false);

  // Eingeloggter Bereich -> Banner gar nicht erst aufbauen.
  const imGeschuetztenBereich = OHNE_BANNER.some(
    (p) => pfad === p || pfad?.startsWith(p + "/"),
  );

  useEffect(() => {
    if (imGeschuetztenBereich) {
      setZeigen(false);
      return;
    }
    // Start bewusst mit false und erst hier auf true: sonst wuerde der Server
    // den Banner rendern und der Browser ihn direkt wieder entfernen
    // (Hydration-Sprung, sichtbares Flackern).
    try {
      if (window.localStorage.getItem(SPEICHER_SCHLUESSEL) === null) {
        setZeigen(true);
      }
    } catch {
      // localStorage gesperrt (privater Modus, Cookies blockiert):
      // lieber zeigen als verschlucken — die Entscheidung laesst sich dann
      // nur fuer diese Sitzung merken.
      setZeigen(true);
    }
  }, [imGeschuetztenBereich, pfad]);

  function entscheiden(wert: Exclude<CookieEntscheidung, null>) {
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, wert);
    } catch {
      // Nicht speicherbar -> Banner verschwindet trotzdem fuer diese Sitzung.
      // Kein Grund, den Nutzer festzuhalten.
    }
    setZeigen(false);
  }

  if (imGeschuetztenBereich || !zeigen) return null;

  const knopf: React.CSSProperties = {
    borderRadius: "8px",
    padding: "10px 24px",
    fontSize: "clamp(14px, 1.05vw, 17px)",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie-Hinweis"
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "90%",
        maxWidth: "720px",
        backgroundColor: "#0A1628",
        border: "1px solid #C9A84C",
        borderRadius: "12px",
        padding: "20px 28px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily: "var(--font-dm-sans), sans-serif",
      }}
    >
      <p style={{ color: "#FFFFFF", fontSize: "clamp(14px, 1.05vw, 17px)", lineHeight: 1.6, margin: 0 }}>
        Wir verwenden Cookies, um Ihnen die bestmögliche Erfahrung auf unserer Website zu bieten.
        Anonymisierte Nutzungsdaten können zur Verbesserung von ARGONAUT OS verwendet werden.
        Weitere Informationen finden Sie in unserer{" "}
        <a href="/datenschutz" style={{ color: "#C9A84C", textDecoration: "underline" }}>
          Datenschutzerklärung
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={() => entscheiden("akzeptiert")}
          style={{ ...knopf, backgroundColor: "#C9A84C", color: "#0A1628", border: "none" }}
        >
          Akzeptieren
        </button>
        <button
          onClick={() => entscheiden("abgelehnt")}
          style={{ ...knopf, backgroundColor: "transparent", color: "#FFFFFF", border: "1px solid #FFFFFF" }}
        >
          Ablehnen
        </button>
      </div>
    </div>
  );
}
