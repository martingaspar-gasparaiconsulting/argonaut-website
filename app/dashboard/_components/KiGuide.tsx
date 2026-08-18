"use client";
import { useId, useState } from "react";

// ---------------------------------------------------------------------
// ARGONAUT OS · KI-GUIDE · Stufe 2 (Gestalt)
//
// Martins Idee: nicht der „Stern"/das Auge, sondern eine GESTALT, die den
// Kunden an die Hand nimmt. Sprechblase mit Klartext, nächsten Schritten und
// einem Handlungs-Knopf, daneben die Figur in einem leuchtenden Ring.
//
// DIE FIGUR IST GEZEICHNET, KEIN BILD.
// Ein Argonaut — Helm mit Busch, Kompass-Stern auf der Brust — als reines SVG
// in den Markenfarben. Das hat drei Gründe: keine Datei zu laden, bei jeder
// Bildschirmgröße gestochen scharf, und die Farbe folgt der Stimmung (grün =
// alles gut, Gold = Achtung). Bewegung kommt aus CSS: ein ruhiges Wippen und
// ein Blinzeln. Kein Video, kein fremder Dienst, keine Gebühr.
//
// AUSTAUSCHBAR: Wer lieber ein eigenes Bild möchte, setzt `avatarUrl` — dann
// erscheint es im selben Ring, ohne dass sonst etwas geändert werden muss.
//
// STIMME: `onVorlesen` übergeben → der 🔊-Knopf wird sichtbar. Ohne den Prop
// bleibt er unsichtbar (kein toter Code, keine leere Schaltfläche). Die
// Sprachausgabe steckt in lib/vorlesen.ts und läuft im Browser des Nutzers.
//
// EINSATZ: siehe KiGuideStelle.tsx — dort ist der Guide fertig verdrahtet.
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

/**
 * Der Argonaut. Reines SVG, keine Datei.
 *
 * Die IDs der Farbverläufe tragen eine je Instanz eindeutige Kennung. Ohne das
 * würden zwei Guides auf derselben Seite dieselbe ID benutzen — der zweite
 * bekäme die Farbe des ersten, auch wenn seine Stimmung eine andere ist.
 */
function Argonaut({ farbe, kennung }: { farbe: string; kennung: string }) {
  const koerper = `argoKoerper-${kennung}`;
  const aura = `argoAura-${kennung}`;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={koerper} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={farbe} stopOpacity="0.9" />
          <stop offset="100%" stopColor={farbe} stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={aura} cx="50%" cy="36%" r="62%">
          <stop offset="0%" stopColor={farbe} stopOpacity="0.32" />
          <stop offset="100%" stopColor={farbe} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="46" r="46" fill={`url(#${aura})`} />

      <g style={{ animation: "argoWippen 5.5s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "50% 100%" }}>
        {/* Schultern */}
        <path d="M14 100 C14 77 30 67 50 67 C70 67 86 77 86 100 Z" fill={`url(#${koerper})`} />
        {/* Kompass-Stern auf der Brust — das Zeichen des Argonauten */}
        <path
          d="M50 75 L52.6 82.4 L60 85 L52.6 87.6 L50 95 L47.4 87.6 L40 85 L47.4 82.4 Z"
          fill={A.gold}
          opacity="0.92"
        />
        {/* Kopf */}
        <circle cx="50" cy="43" r="19" fill={`url(#${koerper})`} />
        {/* Helm: Kalotte mit Wangenklappen */}
        <path
          d="M31 44 C31 28 39 21 50 21 C61 21 69 28 69 44 L69 49 L63.5 49 L63.5 41 C63.5 33 58 29 50 29 C42 29 36.5 33 36.5 41 L36.5 49 L31 49 Z"
          fill={A.gold}
          opacity="0.88"
        />
        {/* Nasensteg */}
        <rect x="48.4" y="35" width="3.2" height="17" rx="1.6" fill={A.gold} opacity="0.88" />
        {/* Helmbusch */}
        <path d="M50 21 C50 12.5 55.5 6 63 4 C58.5 10 57 15.5 57 21 Z" fill={A.gold} opacity="0.7" />
        {/* Augen — sie blinzeln. Die Animation sitzt an JEDEM Auge einzeln:
            am Gruppen-Element wuerde das Zusammendruecken die Augen zur Mitte
            der Gruppe ziehen statt sie an Ort und Stelle schliessen zu lassen. */}
        <circle cx="43" cy="43" r="2.7" fill={A.cyan} style={augeStil} />
        <circle cx="57" cy="43" r="2.7" fill={A.cyan} style={augeStil} />
      </g>
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
  const kennung = useId().replace(/[^a-zA-Z0-9]/g, "");
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
        @keyframes argoWippen {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-1.6px) rotate(-0.7deg); }
        }
        @keyframes argoBlinzeln {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.12); }
        }
        /* Wer im Betriebssystem "Bewegung reduzieren" eingestellt hat, bekommt
           eine ruhige Figur. Das ist eine Barrierefreiheits-Vorgabe, keine
           Geschmacksfrage: Bewegung kann Schwindel und Uebelkeit ausloesen. */
        @media (prefers-reduced-motion: reduce) {
          .argo-guide-figur *, .argo-guide-ring {
            animation: none !important;
          }
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
          <div className="argo-guide-ring argo-guide-figur" style={{ ...avatarInner, animation: "argoGuidePuls 2.6s ease-out infinite" }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <Argonaut farbe={farbe} kennung={kennung} />
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

const augeStil: React.CSSProperties = {
  transformBox: "fill-box",
  transformOrigin: "center",
  animation: "argoBlinzeln 6.5s ease-in-out infinite",
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
