"use client";
import Link from "next/link";
import { useState } from "react";

const agenten = {
  solo: [
    { code: "A1", name: "A1 Empfänger", beschreibung: "Onboarded neue Kunden automatisch" },
    { code: "A5", name: "A5 Schreiber", beschreibung: "Erstellt Inhalte und Texte" },
  ],
  start: [
    { code: "A1", name: "A1 Empfänger", beschreibung: "Onboarded neue Kunden automatisch" },
    { code: "A5", name: "A5 Schreiber", beschreibung: "Erstellt Inhalte und Texte" },
    { code: "A3", name: "A3 Wächter", beschreibung: "Überwacht alle laufenden Prozesse" },
    { code: "A4", name: "A4 Buchhalter", beschreibung: "Automatisiert Buchhaltung und Rechnungen" },
    { code: "A6", name: "A6 Planer", beschreibung: "Koordiniert Termine und Kalender" },
    { code: "A7", name: "A7 Verkäufer", beschreibung: "Generiert Leads und Follow-ups" },
    { code: "B3", name: "B3 Moderator", beschreibung: "Managed Community und Social Media" },
    { code: "B4", name: "B4 Personalchef", beschreibung: "Automatisiert HR-Prozesse" },
  ],
  pro: [
    { code: "A2", name: "A2 Schmied", beschreibung: "Baut und entwickelt Automatisierungen" },
    { code: "A8", name: "A8 Regisseur", beschreibung: "Steuert Kampagnen und Marketing" },
    { code: "B1", name: "B1 Forscher", beschreibung: "Analysiert Märkte und Wettbewerb" },
    { code: "B2", name: "B2 Übersetzer", beschreibung: "Lokalisiert Inhalte in alle Sprachen" },
    { code: "B5", name: "B5 Einkäufer", beschreibung: "Optimiert Beschaffung und Lieferanten" },
    { code: "C1", name: "C1 Analyst", beschreibung: "Wertet Daten aus und erstellt Reports" },
    { code: "D1", name: "D1 Techniker", beschreibung: "Wartet Systeme und IT-Infrastruktur" },
    { code: "E4", name: "E4 Assistent", beschreibung: "Unterstützt täglich bei allen Aufgaben" },
  ],
  business: [
    { code: "C2", name: "C2 Stratege", beschreibung: "Entwickelt Konzepte und Strategien" },
    { code: "C4", name: "C4 Trainer", beschreibung: "Schult Mitarbeiter automatisch" },
    { code: "D2", name: "D2 Sicherheitschef", beschreibung: "Schützt Daten und überwacht Compliance" },
    { code: "E1", name: "E1 Netzwerker", beschreibung: "Pflegt Kontakte und Partnerschaften" },
  ],
  enterprise: [
    { code: "C3", name: "C3 Jurist", beschreibung: "Prüft Verträge und rechtliche Dokumente" },
    { code: "D3", name: "D3 Integrator", beschreibung: "Verbindet alle Systeme und APIs" },
    { code: "E2", name: "E2 Botschafter", beschreibung: "Repräsentiert die Marke nach außen" },
    { code: "E3", name: "E3 Späher", beschreibung: "Beobachtet Wettbewerb und Märkte" },
  ],
};

const pakete = [
  {
    name: "START",
    agents: "8 Agenten",
    calls: "15.000 KI-Calls",
    price: "1.500",
    hot: false,
    badge: "",
    features: ["8 KI-Agenten aktiv", "40 Automatisierungen", "15.000 KI-Calls/Monat", "Dashboard inklusive", "Priority Support", "1 Standort"],
    agentKeys: ["start"],
    stripeUrl: "https://buy.stripe.com/dRmeVd3TY0A2cRf1zi6wE0b",
  },
  {
    name: "PRO",
    agents: "16 Agenten",
    calls: "35.000 KI-Calls",
    price: "3.000",
    hot: true,
    badge: "Beliebteste Wahl",
    features: ["16 KI-Agenten aktiv", "70 Automatisierungen", "35.000 KI-Calls/Monat", "Dashboard inklusive", "Dedizierter Support", "1 Standort"],
    agentKeys: ["start", "pro"],
    stripeUrl: "https://buy.stripe.com/aFafZh0HMgz0aJ7em46wE0a",
  },
  {
    name: "BUSINESS",
    agents: "20 Agenten",
    calls: "75.000 KI-Calls",
    price: "6.000",
    hot: false,
    badge: "",
    features: ["20 KI-Agenten aktiv", "110 Automatisierungen", "75.000 KI-Calls/Monat", "Dashboard inklusive", "Account Manager", "1 Standort"],
    agentKeys: ["start", "pro", "business"],
    stripeUrl: "https://buy.stripe.com/cNifZheyC0A2cRf5Py6wE09",
  },
  {
    name: "ENTERPRISE",
    agents: "24 Agenten",
    calls: "150.000 KI-Calls",
    price: "9.000",
    hot: false,
    badge: "",
    features: ["24 KI-Agenten aktiv", "128 Automatisierungen + Branchen-Workflows", "150.000 KI-Calls/Monat", "Dashboard inklusive", "VIP Support & Onboarding", "1 Standort"],
    agentKeys: ["start", "pro", "business", "enterprise"],
    stripeUrl: "https://buy.stripe.com/8x29AT4Y24Qi18xem46wE0c",
    enterpriseText: "24 KI-Agenten. 128 Automatisierungen. Während Ihre Mitbewerber noch manuell arbeiten, ist bei Ihnen bereits alles erledigt — kein Prozess zu klein, kein Fehler zu groß, kein Mitarbeiter der noch Zeit mit Routineaufgaben verliert.",
  },
];

function PaketCard({ plan }: { plan: typeof pakete[0] }) {
  const [open, setOpen] = useState(false);
  const alleAgenten = plan.agentKeys.flatMap((k) => agenten[k as keyof typeof agenten]);
  return (
    <div style={{ background: plan.hot ? "#0D1B3E" : "#ffffff", border: plan.hot ? "2px solid #C9A84C" : "1px solid #e5e5e5", borderRadius: "14px", padding: "20px 16px", display: "flex", flexDirection: "column", position: "relative" }}>
      {plan.badge && (
        <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "#C9A84C", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}>
          {plan.badge}
        </div>
      )}
      <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "4px" }}>{plan.name}</p>
      <p style={{ fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.5)" : "#999", marginBottom: "4px" }}>{plan.agents}</p>
      <p style={{ fontSize: "12px", color: plan.hot ? "rgba(201,168,76,0.8)" : "#C9A84C", marginBottom: "10px", fontWeight: 600 }}>{plan.calls}</p>
      <div style={{ marginBottom: "12px" }}>
        <span style={{ fontSize: "28px", fontWeight: 800, color: plan.hot ? "#ffffff" : "#0D1B3E", lineHeight: 1 }}>{plan.price} €</span>
        <span style={{ fontSize: "12px", color: plan.hot ? "rgba(255,255,255,0.4)" : "#aaa", marginLeft: "4px" }}>/ Monat</span>
      </div>
      {plan.enterpriseText && (
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", fontStyle: "italic", marginBottom: "12px", lineHeight: 1.5 }}>{plan.enterpriseText}</p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", flex: 1 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.75)" : "#444", padding: "3px 0", display: "flex", gap: "6px" }}>
            <span style={{ color: "#C9A84C", fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <button onClick={() => setOpen(!open)} style={{ background: "transparent", border: plan.hot ? "1px solid rgba(201,168,76,0.4)" : "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 12px", fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.65)" : "#555", cursor: "pointer", marginBottom: "10px", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
        KI-Agenten anzeigen ({alleAgenten.length})
      </button>
      {open && (
        <div style={{ marginBottom: "12px", maxHeight: "260px", overflowY: "auto" }}>
          {alleAgenten.map((a) => (
            <div key={a.code} style={{ padding: "8px 0", borderBottom: plan.hot ? "0.5px solid rgba(255,255,255,0.08)" : "0.5px solid #f0f0f0" }}>
              <p style={{ fontSize: "14px", fontWeight: 700, color: plan.hot ? "#C9A84C" : "#0D1B3E", marginBottom: "2px" }}>{a.name}</p>
              <p style={{ fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.6)" : "#666" }}>{a.beschreibung}</p>
            </div>
          ))}
        </div>
      )}
      <Link href={plan.stripeUrl} style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, textDecoration: "none", background: plan.hot ? "#C9A84C" : "transparent", color: plan.hot ? "#ffffff" : "#0D1B3E", border: plan.hot ? "none" : "1.5px solid #0D1B3E" }}>
        Jetzt starten
      </Link>
    </div>
  );
}

function SoloCard() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "#ffffff", border: "1.5px solid #e8dfc8", borderRadius: "12px", padding: "20px 24px", marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Nur 3 Monate · Dann Upgrade auf min. START</p>
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#0D1B3E", marginBottom: "6px" }}>SOLO Beta — 2 Agenten</p>
          <p style={{ fontSize: "13px", color: "#888", marginBottom: "4px" }}>Für Solopreneure & Teams bis 3 Personen · Dashboard inklusive · kein Basis-Paket nötig</p>
          <p style={{ fontSize: "12px", color: "#C9A84C", fontWeight: 600, marginBottom: "12px" }}>5.000 KI-Calls/Monat</p>
          <button onClick={() => setOpen(!open)} style={{ background: "transparent", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 12px", fontSize: "13px", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
            KI-Agenten anzeigen (2)
          </button>
          {open && (
            <div style={{ marginTop: "12px" }}>
              {agenten.solo.map((a) => (
                <div key={a.code} style={{ padding: "8px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#0D1B3E", marginBottom: "2px" }}>{a.name}</p>
                  <p style={{ fontSize: "13px", color: "#666" }}>{a.beschreibung}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontSize: "34px", fontWeight: 800, color: "#0D1B3E", lineHeight: 1 }}>499 €</span>
          <span style={{ fontSize: "13px", color: "#aaa", display: "block" }}>/ Monat</span>
          <Link href="https://buy.stripe.com/6oUaEX3TYdmO9F31zi6wE08" style={{ display: "inline-block", marginTop: "10px", padding: "11px 24px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, textDecoration: "none", background: "#0D1B3E", color: "#ffffff" }}>
            Jetzt testen
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  return (
    <section id="preise" style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "12px" }}>PREISE</p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, color: "#0D1B3E", marginBottom: "10px", lineHeight: 1.2 }}>Ihr KI-Team. Transparent bepreist.</h2>
          <p style={{ fontSize: "14px", color: "#999" }}>Alle Preise zzgl. 19% MwSt. · 12 Monate Laufzeit</p>
        </div>

        <div style={{ background: "#fdf6e3", border: "1.5px solid #C9A84C", borderRadius: "12px", padding: "16px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "44px", height: "44px", background: "#C9A84C", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "20px", color: "#fff" }}>▪▪</span>
          </div>
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#0D1B3E", marginBottom: "4px" }}>Jedes Paket inklusive: Ihr persönliches ARGONAUT Dashboard</p>
            <p style={{ fontSize: "13px", color: "#7a6a3a" }}>Alle Automatisierungen, Agenten, Leads & Ergebnisse — live auf einen Blick. 24/7. Nur für Sie.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "28px" }}>
          {pakete.map((plan) => <PaketCard key={plan.name} plan={plan} />)}
        </div>

        <div style={{ borderTop: "1px dashed #ddd", paddingTop: "24px", marginBottom: "20px" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", textAlign: "center", marginBottom: "14px" }}>SOLO BETA — Zum Testen & Starten</p>
          <SoloCard />
          <p style={{ fontSize: "13px", color: "#aaa", textAlign: "center" }}>Nach 3 Monaten automatischer Upgrade-Hinweis auf START.</p>
        </div>

        <div style={{ background: "#f8f6f0", border: "1px solid #e8dfc8", borderRadius: "10px", padding: "16px 24px", textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "14px", color: "#0D1B3E" }}>
            <strong>1.229 Automatisierungen</strong> decken alle wichtigen Prozesse ab — zusätzlich erhalten Sie branchenspezifische Automatisierungen, exakt auf Ihre Branche zugeschnitten.
          </p>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#666" }}>Mehrere Standorte? <Link href="/multistandort" style={{ color: "#C9A84C", fontWeight: 600, textDecoration: "none" }}>Multistandort-Lösung ansehen →</Link></p>
        </div>

      </div>
    </section>
  );
}