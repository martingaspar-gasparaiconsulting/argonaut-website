"use client";
import Link from "next/link";
import { useState } from "react";

const agenten = {
  start: [
    { code: "A1", name: "Der Stratege", beschreibung: "Analysiert Prozesse & entwickelt Automatisierungsstrategien" },
    { code: "A2", name: "Der Architekt", beschreibung: "Plant und strukturiert komplexe Workflow-Architekturen" },
    { code: "A3", name: "Der Wächter", beschreibung: "Überwacht alle laufenden Prozesse & meldet Abweichungen" },
    { code: "A4", name: "Der Koordinator", beschreibung: "Koordiniert agentenübergreifende Aufgaben & Handoffs" },
    { code: "E1", name: "Der Akquisiteur", beschreibung: "Automatisiert Leadgenerierung und Erstansprache" },
    { code: "E2", name: "Der Verfolger", beschreibung: "Führt automatisiertes Follow-up mit Interessenten durch" },
    { code: "E3", name: "Der Abschluss-Agent", beschreibung: "Unterstützt den Verkaufsprozess bis zum Abschluss" },
    { code: "E4", name: "Der Kundenbetreuer", beschreibung: "Automatisiert Onboarding und Kundenkommunikation" },
  ],
  pro: [
    { code: "A5", name: "Der Analyst", beschreibung: "Wertet Daten aus und erstellt automatische Berichte" },
    { code: "A6", name: "Der Optimierer", beschreibung: "Identifiziert Schwachstellen & optimiert Prozesse" },
    { code: "E5", name: "Der Beziehungsmanager", beschreibung: "Pflegt langfristige Kundenbeziehungen automatisch" },
    { code: "B1", name: "Der Buchhalter", beschreibung: "Automatisiert Buchhaltung und Rechnungsstellung" },
    { code: "B2", name: "Der Rechnungsprüfer", beschreibung: "Prüft und verarbeitet eingehende Rechnungen" },
    { code: "B3", name: "Der Mahnungsagent", beschreibung: "Verwaltet automatisch Mahnläufe & Zahlungserinnerungen" },
    { code: "B4", name: "Der Berichter", beschreibung: "Erstellt Finanzberichte und KPI-Dashboards automatisch" },
    { code: "C1", name: "Der Sekretär", beschreibung: "Verwaltet Termine, E-Mails und administrative Aufgaben" },
  ],
  business: [
    { code: "C2", name: "Der Dokumentenmanager", beschreibung: "Organisiert und verarbeitet Dokumente automatisch" },
    { code: "C3", name: "Der HR-Agent", beschreibung: "Automatisiert HR-Prozesse von Recruiting bis Onboarding" },
    { code: "D1", name: "Der Content-Creator", beschreibung: "Erstellt Marketing-Content für alle Kanäle automatisch" },
    { code: "D2", name: "Der Social-Media-Agent", beschreibung: "Verwaltet und bespielt Social-Media-Kanäle automatisch" },
  ],
  enterprise: [
    { code: "C4", name: "Der Compliance-Wächter", beschreibung: "Überwacht Compliance-Anforderungen und Fristen" },
    { code: "D3", name: "Der SEO-Agent", beschreibung: "Optimiert Content und überwacht SEO-Performance" },
    { code: "D4", name: "Der Kampagnen-Manager", beschreibung: "Plant und steuert automatisierte Marketing-Kampagnen" },
    { code: "A10", name: "Der Sammler", beschreibung: "Aggregiert Daten aus allen Quellen für maximale OS-Intelligenz" },
  ],
};

const pakete = [
  { name: "START", agents: "8 Agenten", price: "1.500", total: "3.000", hot: false, badge: "", features: ["8 KI-Agenten aktiv", "Dashboard inklusive", "Priority Support", "1 Standort"], agentKeys: ["start"] },
  { name: "PRO", agents: "16 Agenten", price: "2.500", total: "4.000", hot: true, badge: "Beliebteste Wahl", features: ["16 KI-Agenten aktiv", "Dashboard inklusive", "Dedizierter Support", "1 Standort"], agentKeys: ["start", "pro"] },
  { name: "BUSINESS", agents: "20 Agenten", price: "4.500", total: "6.000", hot: false, badge: "", features: ["20 KI-Agenten aktiv", "Dashboard inklusive", "Account Manager", "1 Standort"], agentKeys: ["start", "pro", "business"] },
  { name: "ENTERPRISE", agents: "24 Agenten", price: "7.500", total: "9.000", hot: false, badge: "", features: ["24 KI-Agenten aktiv", "Dashboard inklusive", "VIP Support & Onboarding", "1 Standort"], agentKeys: ["start", "pro", "business", "enterprise"] },
];

function PaketCard({ plan }: { plan: typeof pakete[0] }) {
  const [open, setOpen] = useState(false);
  const alleAgenten = plan.agentKeys.flatMap((k) => agenten[k as keyof typeof agenten]);
  return (
    <div style={{ background: plan.hot ? "#0D1B3E" : "#ffffff", border: plan.hot ? "2px solid #C9A84C" : "1px solid #e5e5e5", borderRadius: "14px", padding: "20px 16px", display: "flex", flexDirection: "column", position: "relative" }}>
      {plan.badge && <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "#C9A84C", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}>{plan.badge}</div>}
      <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "4px" }}>{plan.name}</p>
      <p style={{ fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.5)" : "#999", marginBottom: "10px" }}>{plan.agents}</p>
      <div style={{ marginBottom: "6px" }}>
        <span style={{ fontSize: "28px", fontWeight: 800, color: plan.hot ? "#ffffff" : "#0D1B3E", lineHeight: 1 }}>{plan.price} &euro;</span>
        <span style={{ fontSize: "12px", color: plan.hot ? "rgba(255,255,255,0.4)" : "#aaa", marginLeft: "4px" }}>/ Monat</span>
      </div>
      <div style={{ borderTop: plan.hot ? "0.5px solid rgba(255,255,255,0.15)" : "0.5px solid #eee", paddingTop: "8px", marginBottom: "12px" }}>
        <p style={{ fontSize: "11px", color: plan.hot ? "rgba(255,255,255,0.45)" : "#888" }}>+ 1.500 Basis =</p>
        <p style={{ fontSize: "15px", fontWeight: 700, color: plan.hot ? "#C9A84C" : "#0D1B3E" }}>gesamt {plan.total} &euro;/Monat</p>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", flex: 1 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ fontSize: "13px", color: plan.hot ? "rgba(255,255,255,0.75)" : "#444", padding: "3px 0", display: "flex", gap: "6px" }}>
            <span style={{ color: "#C9A84C", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>{f}
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
      <Link href="#" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, textDecoration: "none", background: plan.hot ? "#C9A84C" : "transparent", color: plan.hot ? "#ffffff" : "#0D1B3E", border: plan.hot ? "none" : "1.5px solid #0D1B3E" }}>Jetzt starten</Link>
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
          <p style={{ fontSize: "14px", color: "#999" }}>Alle Preise zzgl. 19% MwSt. &middot; Monatlich kündbar</p>
        </div>

        <div style={{ background: "#fdf6e3", border: "1.5px solid #C9A84C", borderRadius: "12px", padding: "16px 24px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "44px", height: "44px", background: "#C9A84C", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "20px", color: "#fff" }}>&#9646;&#9646;</span>
          </div>
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#0D1B3E", marginBottom: "4px" }}>Jedes Paket inklusive: Ihr persönliches ARGONAUT Dashboard</p>
            <p style={{ fontSize: "13px", color: "#7a6a3a" }}>Alle Automatisierungen, Agenten, Leads &amp; Ergebnisse — live auf einen Blick. 24/7. Nur für Sie.</p>
          </div>
        </div>

        <div style={{ background: "#0D1B3E", borderRadius: "14px", padding: "24px 28px", marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "2px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "6px" }}>BASIS-PAKET — Pflichtbestandteil</p>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.55)" }}>Für alle Pakete (außer SOLO Beta) · 25 Standard-Automatisierungen inklusive</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>1.500 &euro;</span>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginLeft: "6px" }}>/ Monat</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            {[
              { title: "Vertrieb (10)", items: ["Lead-Aufnahme & Routing", "Angebot erstellen & senden", "Follow-up Tag 3 + Tag 7", "Terminvorschlag & Bestätigung", "Lead-Qualifizierung KI", "Auftragsumwandlung", "Abschluss Won/Lost", "Interne Übergabe", "Rückrufwunsch erfassen", "Angebotsanfrage aufnehmen"] },
              { title: "Marketing (8)", items: ["Bewertungsanfrage nach Auftrag", "Reaktivierung inaktiver Leads", "Social Media Entwurf KI", "Leadquellen-Tagging", "Wöchentlicher Performance-Report", "Content-Ideen KI", "Kampagnen-Textmodule", "Aktionsnachricht saisonal"] },
              { title: "Frontdesk (7)", items: ["Begrüßung & Intent-Erkennung", "FAQ-Antworten automatisch", "Rückrufwunsch erfassen", "Statusanfrage beantworten", "Dokumentenanfrage", "Eskalation an Mensch", "Abschlussfeedback anfragen"] },
            ].map((col) => (
              <div key={col.title}>
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{col.title}</p>
                {col.items.map((item) => (
                  <p key={item} style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", padding: "3px 0 3px 12px", position: "relative", lineHeight: 1.4 }}>
                    <span style={{ position: "absolute", left: 0, color: "#C9A84C" }}>&rsaquo;</span>{item}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "14px", paddingTop: "12px", borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
            + Branchenspezifische Zusatz-Automatisierungen individuell erweiterbar à 85 &euro;/Monat
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", margin: "8px 0", textAlign: "center" }}>
          {["START", "PRO", "BUSINESS", "ENTERPRISE"].map((name) => (
            <div key={name}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#C9A84C", letterSpacing: "1px" }}>{name}</p>
              <p style={{ fontSize: "20px", color: "#C9A84C", lineHeight: 1 }}>&#8595;</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "28px" }}>
          {pakete.map((plan) => <PaketCard key={plan.name} plan={plan} />)}
        </div>

        <div style={{ borderTop: "1px dashed #ddd", paddingTop: "24px", marginBottom: "20px" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", textAlign: "center", marginBottom: "14px" }}>SOLO BETA — Zum Testen &amp; Starten</p>
          <div style={{ background: "#ffffff", border: "1.5px solid #e8dfc8", borderRadius: "12px", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Nur 3 Monate · Dann Upgrade auf min. START</p>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0D1B3E", marginBottom: "6px" }}>SOLO Beta — 2 Agenten</p>
              <p style={{ fontSize: "13px", color: "#888" }}>Für Solopreneure &amp; Teams bis 3 Personen · Dashboard inklusive · kein Basis-Paket nötig</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "34px", fontWeight: 800, color: "#0D1B3E", lineHeight: 1 }}>499 &euro;</span>
              <span style={{ fontSize: "13px", color: "#aaa", display: "block" }}>/ Monat</span>
              <Link href="#" style={{ display: "inline-block", marginTop: "10px", padding: "11px 24px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, textDecoration: "none", background: "#0D1B3E", color: "#ffffff" }}>Jetzt testen</Link>
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "#aaa", textAlign: "center" }}>Nach 3 Monaten automatischer Upgrade-Hinweis auf START — Basis-Paket wird dann Pflicht.</p>
        </div>

        <div style={{ background: "#f8f6f0", border: "1px solid #e8dfc8", borderRadius: "10px", padding: "16px 24px", textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "14px", color: "#0D1B3E" }}>
            <strong>Die 25 Standard-Automatisierungen</strong> decken die wichtigsten Prozesse ab — zusätzlich erhalten Sie branchenspezifische Automatisierungen, exakt auf Ihre Branche zugeschnitten.
          </p>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#666" }}>Mehrere Standorte? <Link href="/multistandort" style={{ color: "#C9A84C", fontWeight: 600, textDecoration: "none" }}>Multistandort-Lösung ansehen &rarr;</Link></p>
        </div>

      </div>
    </section>
  );
}
