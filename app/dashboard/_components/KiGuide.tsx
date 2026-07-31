"use client";
import { useState } from "react";

// ---------------------------------------------------------------------
// ARGONAUT OS · KI-GUIDE „Silhouette" · Stufe 1
//
// Martins Idee: nicht mehr nur der „Stern"/das Auge, sondern eine
// menschliche GESTALT, die den Kunden an die Hand nimmt. Stufe 1 = neutrale
// Silhouette in einem leuchtenden Ring (CSS-Puls, 0 Token) + Sprechblase mit
// Klartext, nächsten Schritten und einem Handlungs-Button.
//
// EVOLUTION ohne Umbau — die Bühne steht schon:
//   • Stufe 2 (Gesicht): prop `avatarUrl` setzen → statt Silhouette erscheint
//     Martins Foto im selben Ring. Keine weitere Änderung nötig.
//   • Stufe 3 (Stimme): prop `onVorlesen` übergeben → der 🔊-Knopf wird sichtbar
//     und ruft z. B. eine TTS-Route. Ohne den Prop bleibt er unsichtbar
//     (kein toter Code, keine leere Schaltfläche).
//
// EINSATZ (Beispiel Onboarding):
//   <KiGuide
//     begruessung="Willkommen bei ARGONAUT, Martin."
//     nachricht="Lass uns dein System startklar machen. Als Nächstes:"
//     schritte={["Firmendaten hinterlegen"]}
//     aktionText="Jetzt hinterlegen" aktionHref="/dashboard/einstellungen"
//     fortschritt={20}
//   />
// ---------------------------------------------------------------------

const A = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  warn: "#E0A24C",
  danger: "#E06666",
  text: "#FFFFFF",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.10)",
};

type Stimmung = "gut" | "neutral" | "achtung";

export type KiGuideProps = {
  /** Überschrift der Sprechblase, z. B. „Willkommen bei ARGONAUT". */
  begruessung?: string;
  /** Kern-Botschaft im Klartext. */
  nachricht: string;
  /** Optional: nummerierte nächste Schritte. */
  schritte?: string[];
  /** Optional: Handlungs-Button. */
  aktionText?: string;
  aktionHref?: string;
  onAktion?: () => void;
  /** Aura-Farbe: gut=grün, neutral=cyan, achtung=gold. */
  stimmung?: Stimmung;
  /** Optional: Fortschritt 0–100 → dünner Ring um den Guide. */
  fortschritt?: number;
  /** STUFE 2: Foto-URL (Martins Gesicht) statt Silhouette. */
  avatarUrl?: string;
  /** STUFE 3: wird der Callback übergeben, erscheint der 🔊-Vorlesen-Knopf. */
  onVorlesen?: () => void;
  /** Anzeigename unter dem Avatar. */
  name?: string;
};

function auraFarbe(s: Stimmung): string {
  if (s === "achtung") return A.warn;
  if (s === "gut") return A.green;
  return A.cyan;
}

function Silhouette({ farbe }: { farbe: string }) {
  // Kopf + Schultern als weiche, leuchtende Gestalt (reines SVG, skaliert mit).
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <radialGradient id="argoGuideFill" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor={farbe} stopOpacity="0.95" />
          <stop offset="60%" stopColor={farbe} stopOpacity="0.55" />
          <stop offset="100%" stopColor={farbe} stopOpacity="0.20" />
        </radialGradient>
      </defs>
      {/* Schultern */}
      <path d="M18 100 C18 74 34 64 50 64 C66 64 82 74 82 100 Z" fill="url(#argoGuideFill)" />
      {/* Kopf */}
      <circle cx="50" cy="38" r="20" fill="url(#argoGuideFill)" />
    </svg>
  );
}

export default function KiGuide({
  begruessung,
  nachricht,
  schritte,
  aktionText,
  aktionHref,
  onAktion,
  stimmung = "neutral",
  fortschritt,
  avatarUrl,
  onVorlesen,
  name = "ARGONAUT",
}: KiGuideProps) {
  const [zu, setZu] = useState(false);
  const farbe = auraFarbe(stimmung);
  const zeigeRing = typeof fortschritt === "number" && fortschritt >= 0;
  const p = Math.min(Math.max(fortschritt ?? 0, 0), 100);

  return (
    <div style={{ ...wrap, borderColor: farbe + "44" }}>
      <style>{`
        @keyframes argoGuidePuls {
          0%   { box-shadow: 0 0 0 0 ${farbe}55; }
          70%  { box-shadow: 0 0 0 14px ${farbe}00; }
          100% { box-shadow: 0 0 0 0 ${farbe}00; }
        }
      `}</style>

      {/* Avatar im leuchtenden Ring */}
      <div style={avatarSpalte}>
        <div
          style={{
            ...ring,
            // Fortschritts-Ring (conic) hinter dem pulsierenden Rahmen
            background: zeigeRing
              ? `conic-gradient(${farbe} ${p * 3.6}deg, ${A.border} ${p * 3.6}deg)`
              : farbe + "22",
          }}
        >
          <div style={{ ...avatarInner, animation: "argoGuidePuls 2.6s ease-out infinite" }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <Silhouette farbe={farbe} />
            )}
          </div>
        </div>
        <div style={nameStil}>{name}</div>
        {zeigeRing && <div style={{ color: farbe, fontSize: 12, fontWeight: 800 }}>{p}%</div>}
      </div>

      {/* Sprechblase */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={bubbleKopf}>
          <span>👋 {begruessung || "Dein KI-Guide"}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onVorlesen && (
              <button onClick={onVorlesen} style={vorlesenBtn} title="Vorlesen">🔊</button>
            )}
            <button onClick={() => setZu((v) => !v)} style={minBtn} title={zu ? "Ausklappen" : "Einklappen"}>
              {zu ? "▾" : "▴"}
            </button>
          </div>
        </div>

        {!zu && (
          <div style={{ marginTop: 8 }}>
            <p style={nachrichtStil}>{nachricht}</p>

            {schritte && schritte.length > 0 && (
              <ol style={schritteListe}>
                {schritte.map((s, i) => (
                  <li key={i} style={schrittZeile}>
                    <span style={{ ...schrittNr, background: farbe + "22", color: farbe }}>{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}

            {aktionText && (aktionHref ? (
              <a href={aktionHref} style={aktionBtn}>{aktionText}</a>
            ) : (
              <button type="button" onClick={onAktion} style={aktionBtn}>{aktionText}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: "flex",
  gap: 20,
  alignItems: "flex-start",
  background: A.navy2,
  border: "1px solid",
  borderRadius: 18,
  padding: "20px 22px",
  marginBottom: 20,
  fontFamily: "var(--font-dm-sans), sans-serif",
};

const avatarSpalte: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const ring: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: "50%",
  padding: 5,
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
};

const avatarInner: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  overflow: "hidden",
  background: A.navy,
  display: "grid",
  placeItems: "end center",
};

const nameStil: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: A.textDim,
  fontWeight: 700,
};

const bubbleKopf: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  fontSize: "clamp(15px, 1.4vw, 22px)",
  fontWeight: 800,
  color: A.gold,
};

const nachrichtStil: React.CSSProperties = {
  margin: 0,
  color: A.text,
  fontSize: "clamp(14px, 1.25vw, 20px)",
  lineHeight: 1.55,
};

const schritteListe: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "12px 0 0",
  display: "grid",
  gap: 8,
};

const schrittZeile: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  color: A.text,
  fontSize: "clamp(14px, 1.2vw, 19px)",
};

const schrittNr: React.CSSProperties = {
  flex: "0 0 auto",
  width: 24,
  height: 24,
  borderRadius: "50%",
  fontWeight: 800,
  fontSize: 13,
  display: "grid",
  placeItems: "center",
};

const aktionBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 14,
  background: A.gold,
  color: A.navy,
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 800,
  fontSize: "clamp(14px, 1.25vw, 19px)",
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

const vorlesenBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "4px 9px",
  fontSize: 14,
  cursor: "pointer",
  color: A.text,
};

const minBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "4px 9px",
  fontSize: 13,
  cursor: "pointer",
  color: A.textDim,
  fontFamily: "inherit",
};
