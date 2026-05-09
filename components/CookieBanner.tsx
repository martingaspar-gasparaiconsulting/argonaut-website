"use client";

import { useState, useEffect } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "90%",
      maxWidth: "720px",
      backgroundColor: "#0D1B3E",
      border: "1px solid #D4A843",
      borderRadius: "12px",
      padding: "20px 28px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}>
      <p style={{ color: "#FFFFFF", fontSize: "14px", lineHeight: "1.6", margin: 0 }}>
        Wir verwenden Cookies, um Ihnen die bestmögliche Erfahrung auf unserer Website zu bieten.
        Anonymisierte Nutzungsdaten können zur Verbesserung von ARGONAUT OS verwendet werden.
        Weitere Informationen finden Sie in unserer{" "}
        <a href="/datenschutz" style={{ color: "#D4A843", textDecoration: "underline" }}>
          Datenschutzerklärung
        </a>.
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={accept}
          style={{
            backgroundColor: "#D4A843",
            color: "#0D1B3E",
            border: "none",
            borderRadius: "8px",
            padding: "10px 24px",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}>
          Akzeptieren
        </button>
        <button
          onClick={decline}
          style={{
            backgroundColor: "transparent",
            color: "#FFFFFF",
            border: "1px solid #FFFFFF",
            borderRadius: "8px",
            padding: "10px 24px",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}>
          Ablehnen
        </button>
      </div>
    </div>
  );
}