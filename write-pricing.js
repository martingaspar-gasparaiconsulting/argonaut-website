const fs = require('fs');

const content = `"use client";
import Link from "next/link";

export default function Pricing() {
  return (
    <section id="preise" style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "12px" }}>PREISE</p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, color: "#0D1B3E", marginBottom: "10px", lineHeight: 1.2 }}>Ihr KI-Team. Transparent bepreist.</h2>
          <p style={{ fontSize: "13px", color: "#999" }}>Alle Preise zzgl. 19% MwSt. &middot; Monatlich k&uuml;ndbar</p>
        </div>

        {/* Dashboard Banner */}
        <div style={{ background: "#fdf6e3", border: "1.5px solid #C9A84C", borderRadius: "12px", padding: "16px 24px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "44px", height: "44px", background: "#C9A84C", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "22px" }}>&#9646;&#9646;</span>
          </div>
          <div>
            <p style={{ fontSize: "14px", fontWeight: 700, color: "#0D1B3E", marginBottom: "3px" }}>Jedes Paket inklusive: Ihr pers&ouml;nliches ARGONAUT Dashboard</p>
            <p style={{ fontSize: "12px", color: "#7a6a3a" }}>Alle Automatisierungen, Agenten, Leads &amp; Ergebnisse &mdash; live auf einen Blick. 24/7. Nur f&uuml;r Sie.</p>
          </div>
        </div>

        {/* Basis-Paket */}
        <div style={{ background: "#0D1B3E", borderRadius: "14px", padding: "24px 28px", marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "6px" }}>BASIS-PAKET &mdash; Pflichtbestandteil</p>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>F&uuml;r alle Pakete (au&szlig;er SOLO Beta) &middot; 25 Standard-Automatisierungen inklusive</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "34px", fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>1.500 &euro;</span>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginLeft: "6px" }}>/ Monat</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Vertrieb (10)</p>
              {["Lead-Aufnahme & Routing", "Angebot erstellen & senden", "Follow-up Tag 3 + Tag 7", "Terminvorschlag & Best&auml;tigung", "Lead-Qualifizierung KI", "Auftragsumwandlung", "Abschluss Won/Lost", "Interne &Uuml;bergabe", "R&uuml;ckrufwunsch erfassen", "Angebotsanfrage aufnehmen"].map((item) => (
                <p key={item} style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", padding: "2px 0", paddingLeft: "10px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: "#C9A84C" }}>&rsaquo;</span>
                  <span dangerouslySetInnerHTML={{ __html: item }} />
                </p>
              ))}
            </div>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Marketing (8)</p>
              {["Bewertungsanfrage nach Auftrag", "Reaktivierung inaktiver Leads", "Social Media Entwurf KI", "Leadquellen-Tagging", "W&ouml;chentlicher Performance-Report", "Content-Ideen KI", "Kampagnen-Textmodule", "Aktionsnachricht saisonal"].map((item) => (
                <p key={item} style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", padding: "2px 0", paddingLeft: "10px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: "#C9A84C" }}>&rsaquo;</span>
                  <span dangerouslySetInnerHTML={{ __html: item }} />
                </p>
              ))}
            </div>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Frontdesk (7)</p>
              {["Begr&uuml;&szlig;ung & Intent-Erkennung", "FAQ-Antworten automatisch", "R&uuml;ckrufwunsch erfassen", "Statusanfrage beantworten", "Dokumentenanfrage", "Eskalation an Mensch", "Abschlussfeedback anfragen"].map((item) => (
                <p key={item} style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", padding: "2px 0", paddingLeft: "10px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: "#C9A84C" }}>&rsaquo;</span>
                  <span dangerouslySetInnerHTML={{ __html: item }} />
                </p>
              ))}
            </div>
          </div>
          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "14px", paddingTop: "12px", borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
            + Branchenspezifische Zusatz-Automatisierungen je nach Ihrer Branche &mdash; individuell erweiterbar &agrave; 85 &euro;/Monat
          </p>
        </div>

        {/* 4 Pfeile */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", margin: "8px 0", textAlign: "center" }}>
          {["START", "PRO", "BUSINESS", "ENTERPRISE"].map((name) => (
            <div key={name}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#C9A84C", letterSpacing: "1px" }}>{name}</p>
              <p style={{ fontSize: "20px", color: "#C9A84C", lineHeight: 1 }}>&#8595;</p>
            </div>
          ))}
        </div>

        {/* Pakete */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { name: "START", agents: "8 Agenten", price: "1.500", total: "3.000", hot: false, badge: "", features: ["8 KI-Agenten aktiv", "Dashboard inklusive", "Priority Support", "1 Standort"] },
            { name: "PRO", agents: "16 Agenten", price: "2.500", total: "4.000", hot: true, badge: "Beliebteste Wahl", features: ["16 KI-Agenten aktiv", "Dashboard inklusive", "Dedizierter Support", "1 Standort"] },
            { name: "BUSINESS", agents: "20 Agenten", price: "4.500", total: "6.000", hot: false, badge: "", features: ["20 KI-Agenten aktiv", "Dashboard inklusive", "Account Manager", "1 Standort"] },
            { name: "ENTERPRISE", agents: "24 Agenten", price: "7.500", total: "9.000", hot: false, badge: "", features: ["24 KI-Agenten aktiv", "Dashboard inklusive", "VIP Support & Onboarding", "1 Standort"] },
          ].map((plan) => (
            <div key={plan.name} style={{ background: plan.hot ? "#0D1B3E" : "#ffffff", border: plan.hot ? "2px solid #C9A84C" : "1px solid #e5e5e5", borderRadius: "14px", padding: "20px 16px", display: "flex", flexDirection: "column", position: "relative" }}>
              {plan.badge && <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "#C9A84C", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}>{plan.badge}</div>}
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", marginBottom: "4px" }}>{plan.name}</p>
              <p style={{ fontSize: "12px", color: plan.hot ? "rgba(255,255,255,0.5)" : "#999", marginBottom: "10px" }}>{plan.agents}</p>
              <div style={{ marginBottom: "6px" }}>
                <span style={{ fontSize: "28px", fontWeight: 800, color: plan.hot ? "#ffffff" : "#0D1B3E", lineHeight: 1 }}>{plan.price} &euro;</span>
                <span style={{ fontSize: "11px", color: plan.hot ? "rgba(255,255,255,0.4)" : "#aaa", marginLeft: "4px" }}>/ Monat</span>
              </div>
              <div style={{ borderTop: plan.hot ? "0.5px solid rgba(255,255,255,0.15)" : "0.5px solid #eee", paddingTop: "8px", marginBottom: "12px" }}>
                <p style={{ fontSize: "10px", color: plan.hot ? "rgba(255,255,255,0.45)" : "#888" }}>+ 1.500 Basis =</p>
                <p style={{ fontSize: "14px", fontWeight: 700, color: plan.hot ? "#C9A84C" : "#0D1B3E" }}>gesamt {plan.total} &euro;/Monat</p>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontSize: "11px", color: plan.hot ? "rgba(255,255,255,0.75)" : "#444", padding: "3px 0", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#C9A84C", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="#" style={{ display: "block", textAlign: "center", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, textDecoration: "none", background: plan.hot ? "#C9A84C" : "transparent", color: plan.hot ? "#ffffff" : "#0D1B3E", border: plan.hot ? "none" : "1.5px solid #0D1B3E" }}>Jetzt starten</Link>
            </div>
          ))}
        </div>

        {/* Divider + SOLO Beta */}
        <div style={{ borderTop: "1px dashed #ddd", paddingTop: "24px", marginBottom: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: "#C9A84C", textTransform: "uppercase", textAlign: "center", marginBottom: "14px" }}>SOLO BETA &mdash; Zum Testen &amp; Starten</p>
          <div style={{ background: "#ffffff", border: "1.5px solid #e8dfc8", borderRadius: "12px", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Nur 3 Monate &middot; Dann Upgrade auf min. START</p>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "#0D1B3E", marginBottom: "4px" }}>SOLO Beta &mdash; 2 Agenten</p>
              <p style={{ fontSize: "12px", color: "#888" }}>F&uuml;r Solopreneure &amp; Teams bis 3 Personen &middot; Dashboard inklusive &middot; kein Basis-Paket n&ouml;tig</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: "#0D1B3E", lineHeight: 1 }}>499 &euro;</span>
              <span style={{ fontSize: "12px", color: "#aaa", display: "block", textAlign: "right" }}>/ Monat</span>
              <Link href="#" style={{ display: "inline-block", marginTop: "10px", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, textDecoration: "none", background: "#0D1B3E", color: "#ffffff" }}>Jetzt testen</Link>
            </div>
          </div>
          <p style={{ fontSize: "12px", color: "#aaa", textAlign: "center" }}>Nach 3 Monaten automatischer Upgrade-Hinweis auf START &mdash; Basis-Paket wird dann Pflicht.</p>
        </div>

        {/* Automatisierungen Hinweis */}
        <div style={{ background: "#f8f6f0", border: "1px solid #e8dfc8", borderRadius: "10px", padding: "14px 20px", textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "13px", color: "#0D1B3E" }}>
            <strong>Die 25 Standard-Automatisierungen</strong> decken die wichtigsten Prozesse ab &mdash; zus&auml;tzlich erhalten Sie branchenspezifische Automatisierungen, die exakt auf Ihre Branche zugeschnitten sind.
          </p>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#666" }}>Mehrere Standorte? <Link href="/multistandort" style={{ color: "#C9A84C", fontWeight: 600, textDecoration: "none" }}>Multistandort-L&ouml;sung ansehen &rarr;</Link></p>
        </div>

      </div>
    </section>
  );
}
`;

fs.writeFileSync('components/Pricing.tsx', content, { encoding: 'utf8' });
console.log('Pricing.tsx erfolgreich geschrieben!');