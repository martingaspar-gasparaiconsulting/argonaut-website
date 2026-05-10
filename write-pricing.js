const fs = require('fs');

const content = `"use client";
import Link from "next/link";

const plans = [
  { name: "SOLO Beta", price: "299", unit: "/ Monat", duration: "3 Monate", agents: "2 Agenten", highlight: false, badge: "", description: "Fuer Solopreneure & Teams bis 3 Personen", features: ["2 KI-Agenten", "25 Automatisierungen", "1 Standort", "E-Mail Support", "Upgrade ab Woche 10"], cta: "Jetzt starten", stripeLink: "#" },
  { name: "START", price: "1.500", unit: "/ Monat", duration: "", agents: "8 Agenten", highlight: false, badge: "", description: "Fuer wachsende Betriebe", features: ["8 KI-Agenten", "25 Automatisierungen inkl.", "Basis-Paket inklusive", "1 Standort", "Priority Support"], cta: "Jetzt starten", stripeLink: "#" },
  { name: "PRO", price: "2.500", unit: "/ Monat", duration: "", agents: "16 Agenten", highlight: true, badge: "Beliebteste Wahl", description: "Fuer etablierte Mittelstaendler", features: ["16 KI-Agenten", "25 Automatisierungen inkl.", "Basis-Paket inklusive", "1 Standort", "Dedizierter Support"], cta: "Jetzt starten", stripeLink: "#" },
  { name: "BUSINESS", price: "4.500", unit: "/ Monat", duration: "", agents: "20 Agenten", highlight: false, badge: "", description: "Fuer groessere Unternehmen", features: ["20 KI-Agenten", "25 Automatisierungen inkl.", "Basis-Paket inklusive", "1 Standort", "Account Manager"], cta: "Jetzt starten", stripeLink: "#" },
  { name: "ENTERPRISE", price: "7.500", unit: "/ Monat", duration: "", agents: "24 Agenten", highlight: false, badge: "", description: "Volle KI-Power fuer Ihr Unternehmen", features: ["24 KI-Agenten", "25 Automatisierungen inkl.", "Basis-Paket inklusive", "1 Standort", "VIP Support & Onboarding"], cta: "Jetzt starten", stripeLink: "#" },
];

export default function Pricing() {
  return (
    <section id="preise" style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "16px" }}>PREISE</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 700, color: "#0D1B3E", marginBottom: "16px", lineHeight: 1.2 }}>Ihr KI-Team. Transparent bepreist.</h2>
          <p style={{ fontSize: "16px", color: "#666", maxWidth: "560px", margin: "0 auto 12px", lineHeight: 1.6 }}>Alle Pakete beinhalten das Basis-Paket (1.500 EUR/Monat) mit 25 Automatisierungen.</p>
          <p style={{ fontSize: "13px", color: "#999" }}>Alle Preise zzgl. 19% MwSt. - Monatlich kuendbar</p>
        </div>
        <div style={{ background: "#f8f6f0", border: "1px solid #e8dfc8", borderRadius: "12px", padding: "16px 24px", textAlign: "center", maxWidth: "700px", margin: "24px auto 48px" }}>
          <p style={{ fontSize: "14px", color: "#0D1B3E" }}><strong>Basis-Paket 1.500 EUR/Monat</strong> ist Pflichtbestandteil aller Pakete - 25 Automatisierungen, Infrastruktur & Support inklusive.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "20px", alignItems: "stretch" }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{ background: plan.highlight ? "#0D1B3E" : "#ffffff", border: plan.highlight ? "2px solid #C9A84C" : "1px solid #e5e5e5", borderRadius: "16px", padding: "28px 22px", display: "flex", flexDirection: "column", position: "relative" }}>
              {plan.badge && (<div style={{ position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)", background: "#C9A84C", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "4px 16px", borderRadius: "20px", whiteSpace: "nowrap" }}>{plan.badge}</div>)}
              <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "8px" }}>{plan.name}</p>
              <p style={{ fontSize: "13px", color: plan.highlight ? "rgba(255,255,255,0.6)" : "#999", marginBottom: "12px" }}>{plan.agents}</p>
              <div style={{ marginBottom: "8px" }}>
                <span style={{ fontSize: "36px", fontWeight: 800, color: plan.highlight ? "#ffffff" : "#0D1B3E", lineHeight: 1 }}>{plan.price} &euro;</span>
                <span style={{ fontSize: "13px", color: plan.highlight ? "rgba(255,255,255,0.5)" : "#999", marginLeft: "4px" }}>{plan.unit}</span>
              </div>
              {plan.duration && <p style={{ fontSize: "12px", color: plan.highlight ? "rgba(255,255,255,0.5)" : "#999", marginBottom: "8px" }}>{plan.duration}</p>}
              <p style={{ fontSize: "13px", color: plan.highlight ? "rgba(255,255,255,0.7)" : "#666", marginBottom: "20px", lineHeight: 1.5 }}>{plan.description}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontSize: "13px", color: plan.highlight ? "rgba(255,255,255,0.8)" : "#444", padding: "5px 0", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#C9A84C", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
              <Link href={plan.stripeLink} style={{ display: "block", textAlign: "center", padding: "12px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 700, textDecoration: "none", background: plan.highlight ? "#C9A84C" : "transparent", color: plan.highlight ? "#ffffff" : "#0D1B3E", border: plan.highlight ? "none" : "1.5px solid #0D1B3E" }}>{plan.cta}</Link>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <p style={{ fontSize: "14px", color: "#666" }}>Mehrere Standorte? <Link href="/multistandort" style={{ color: "#C9A84C", fontWeight: 600, textDecoration: "none" }}>Multistandort-Loesung ansehen &rarr;</Link></p>
        </div>
      </div>
    </section>
  );
}
`;

fs.writeFileSync('components/Pricing.tsx', content, { encoding: 'utf8' });
console.log('Pricing.tsx erfolgreich geschrieben!');