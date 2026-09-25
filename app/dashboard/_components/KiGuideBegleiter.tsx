"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import KiGuide from "./KiGuide";
import { NAV_LINKS } from "@/lib/rechte";
import { guideLage, firmaFelderAusProfil, type Datenstand, type Rolle } from "@/lib/guideLage";
import { pruefeFirma } from "../einstellungen/firmaPruefung";
import { createBrowserClient } from "@supabase/ssr";
import {
  istVorlesenMoeglich, sprich, stoppeVorlesen, baueVorleseText,
  deutscheStimmen, leseStimmProfil, speichereStimmProfil,
  type Stimme, type StimmProfil,
} from "@/lib/vorlesen";
import { zahlText } from '@/lib/zahlen';

// ---------------------------------------------------------------------
// ARGONAUT OS · KI-GUIDE STUFE 3 — der Begleiter, der mitwandert
//
// Stufe 2 sass auf der Einrichtungsseite und blieb dort. Stufe 3 haengt im
// Dashboard-LAYOUT: der Guide liest den aktuellen Pfad und sagt zu JEDEM
// Baustein etwas — ohne dass eine der rund 130 Modulseiten angefasst wird.
//
// ZURUECKHALTEND, NICHT AUFDRINGLICH
// Standard ist ZU: unten links ein runder Knopf. Erst ein Klick klappt die
// Sprechblase auf. Der Zustand wird im Browser gemerkt (localStorage) — wer
// ihn zumacht, hat ihn beim naechsten Aufruf wieder zu. Kein Server, keine
// Datenbank, keine Spalte.
//
// PLATZWAHL: links unten, aber ueber dem Praesentations-Knopf (der sitzt auf
// left 16 / bottom 16). Rechts unten liegt der PULS-Chat. Deshalb 16/84.
//
// STIMME: der 🔊-Knopf erscheint nur, wenn der Browser wirklich vorlesen kann
// (istVorlesenMoeglich). Beim Seitenwechsel wird das Vorlesen gestoppt —
// sonst redet der Guide ueber die alte Seite weiter.
// ---------------------------------------------------------------------

const SPEICHER_SCHLUESSEL = "argonaut_guide_offen";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

/**
 * Paket A3: Was der Guide ueber den Betrieb weiss. Geladen wird erst, wenn der
 * Guide aufgeklappt wird — wer ihn zu laesst, loest keine einzige Abfrage aus.
 * Jede Zahl ist einzeln abgesichert: scheitert eine Abfrage, bleibt das Feld
 * leer und der Guide sagt dazu nichts (lieber kein Hinweis als ein falscher).
 */
async function ladeDatenstand(rolle: Rolle): Promise<Datenstand> {
  const { data: u } = await supabase.auth.getUser();
  const id = u?.user?.id;
  if (!id) return {};
  const zaehle = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | undefined> => {
    try {
      const r = await q;
      return r.error ? undefined : r.count ?? 0;
    } catch {
      return undefined;
    }
  };
  const kurse = zaehle(
    supabase.from("academy_fortschritt").select("kurs_id", { count: "exact", head: true }).eq("user_id", id).eq("abgeschlossen", true),
  );
  if (rolle === "mitarbeiter") {
    const [k, z] = await Promise.all([
      kurse,
      zaehle(supabase.from("hr_zeiterfassung").select("id", { count: "exact", head: true })),
    ]);
    return { kurse: k, zeiten: z };
  }
  const firma = (async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) return undefined;
      return pruefeFirma(firmaFelderAusProfil((data as Record<string, unknown> | null) ?? null)).anzahlFehler === 0;
    } catch {
      return undefined;
    }
  })();
  const welt = (async () => {
    try {
      const r = await fetch("/api/uebungswelt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aktion: "status" }) });
      if (!r.ok) return undefined;
      const j = await r.json();
      return typeof j?.geladen === "boolean" ? j.geladen : undefined;
    } catch {
      return undefined;
    }
  })();
  const [k, firmaOk, uebungswelt, kunden, mitarbeiter, eingeladen] = await Promise.all([
    kurse,
    firma,
    welt,
    zaehle(supabase.from("kontakte").select("id", { count: "exact", head: true })),
    zaehle(supabase.from("mitarbeiter").select("id", { count: "exact", head: true })),
    zaehle(supabase.from("mitarbeiter").select("id", { count: "exact", head: true }).not("auth_user_id", "is", null)),
  ]);
  return { kurse: k, firmaOk, uebungswelt, kunden, mitarbeiter, eingeladen };
}

/** Was der Guide zur Probe sagt, wenn man eine Stimme aussucht. */
const PROBE_SATZ =
  "Guten Tag. Ich bin Ihr ARGONAUT-Guide und begleite Sie durch das System. So klinge ich.";

const A = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.10)",
};

export default function KiGuideBegleiter({ rolle = "chef" }: { rolle?: Rolle }) {
  const pfad = usePathname();
  const [stand, setStand] = useState<Datenstand>({});
  const [standGeladen, setStandGeladen] = useState(false);
  const [detailsOffen, setDetailsOffen] = useState(false);
  const [offen, setOffen] = useState(false);
  const [kannVorlesen, setKannVorlesen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [stimmenOffen, setStimmenOffen] = useState(false);
  const [stimmen, setStimmen] = useState<Stimme[]>([]);
  const [profil, setProfil] = useState<StimmProfil>(() => leseStimmProfil());

  // Erst nach dem ersten Zeichnen: auf dem Server gibt es weder window noch
  // localStorage, und ein Unterschied zwischen Server- und Browser-Ausgabe
  // waere ein Hydrations-Fehler.
  useEffect(() => {
    setKannVorlesen(istVorlesenMoeglich());
    setProfil(leseStimmProfil());
    try {
      if (window.localStorage.getItem(SPEICHER_SCHLUESSEL) === "1") setOffen(true);
    } catch {
      // Privater Modus oder gesperrte Speicherung: dann bleibt er einfach zu.
    }

    // Die Stimmen-Liste ist beim ersten Fragen oft noch LEER — der Browser laedt
    // sie nach und meldet sich mit onvoiceschanged. Ohne dieses Nachfassen sieht
    // der Nutzer eine leere Auswahl und denkt, sein Rechner koenne nichts.
    const holen = () => setStimmen(deutscheStimmen());
    holen();
    const syn = (window as unknown as { speechSynthesis?: { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } }).speechSynthesis;
    syn?.addEventListener?.("voiceschanged", holen);
    const nachfassen = window.setTimeout(holen, 900);

    return () => {
      stoppeVorlesen();
      syn?.removeEventListener?.("voiceschanged", holen);
      window.clearTimeout(nachfassen);
    };
  }, []);

  // Seitenwechsel: Stimme aus, damit nicht der Text der vorigen Seite
  // weiterlaeuft.
  useEffect(() => {
    stoppeVorlesen();
    setLaeuft(false);
  }, [pfad]);

  // Datenstand einmal laden, sobald der Guide offen ist. Das Layout bleibt beim
  // Seitenwechsel stehen, also gilt der Stand fuer die ganze Sitzung.
  useEffect(() => {
    if (!offen || standGeladen) return;
    let aktiv = true;
    setStandGeladen(true);
    ladeDatenstand(rolle).then((s) => { if (aktiv) setStand(s); }).catch(() => {});
    return () => { aktiv = false; };
  }, [offen, standGeladen, rolle]);

  useEffect(() => { setDetailsOffen(false); }, [pfad]);

  const inhalt = useMemo(() => guideLage(pfad || "/dashboard", NAV_LINKS, rolle, stand), [pfad, rolle, stand]);

  function umschalten() {
    setOffen((v) => {
      const neu = !v;
      try {
        window.localStorage.setItem(SPEICHER_SCHLUESSEL, neu ? "1" : "0");
      } catch {
        // Nicht speichern zu koennen ist kein Grund, den Knopf nicht zu bedienen.
      }
      if (!neu) {
        stoppeVorlesen();
        setLaeuft(false);
      }
      return neu;
    });
  }

  function vorlesen() {
    if (laeuft) {
      stoppeVorlesen();
      setLaeuft(false);
      return;
    }
    const text = baueVorleseText({
      begruessung: inhalt.begruessung,
      nachricht: inhalt.nachricht,
      schritte: inhalt.schritte,
    });
    setLaeuft(sprich(text, profil));
  }

  /** Eine Aenderung an der Stimme wirkt sofort und wird gemerkt. */
  function setzeProfil(teil: Partial<StimmProfil>) {
    const neu = speichereStimmProfil({ ...profil, ...teil });
    setProfil(neu);
  }

  function probeHoeren() {
    stoppeVorlesen();
    setLaeuft(false);
    sprich(PROBE_SATZ, profil);
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={umschalten}
        title="ARGONAUT-Guide zu dieser Seite"
        aria-label="ARGONAUT-Guide öffnen"
        style={knopf}
      >
        <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true" style={{ display: "block" }}>
          <path
            d="M50 8 L58 38 L88 46 L58 54 L50 84 L42 54 L12 46 L42 38 Z"
            fill={A.gold}
            opacity="0.95"
          />
        </svg>
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={panelKopf}>
        <span style={{ color: A.textDim, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
          Ihr Guide
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {kannVorlesen && (
            <button
              type="button"
              onClick={() => setStimmenOffen((v) => !v)}
              style={{ ...schliessenBtn, color: stimmenOffen ? A.gold : A.textDim }}
              title="Stimme einstellen"
            >
              🎚 Stimme
            </button>
          )}
          <button type="button" onClick={umschalten} style={schliessenBtn} title="Guide schließen">
            ✕
          </button>
        </div>
      </div>

      {kannVorlesen && stimmenOffen && (
        <div style={stimmKasten}>
          <label style={stimmLabel}>Stimme auf diesem Gerät</label>
          <select
            value={profil.stimmName ?? ""}
            onChange={(e) => setzeProfil({ stimmName: e.target.value || null })}
            style={stimmFeld}
          >
            <option value="">Automatisch — beste Männerstimme</option>
            {stimmen.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          {stimmen.length === 0 && (
            <div style={stimmHinweis}>
              Dieses Gerät meldet noch keine deutschen Stimmen. In Edge stehen die besseren
              (Conrad, Christoph) zur Verfügung.
            </div>
          )}

          <label style={stimmLabel}>Tempo · {zahlText(profil.tempo, 2)}</label>
          <input
            type="range" min={0.6} max={1.4} step={0.05}
            value={profil.tempo}
            onChange={(e) => setzeProfil({ tempo: Number(e.target.value) })}
            style={{ width: "100%" }}
          />

          <label style={stimmLabel}>Tonhöhe · {zahlText(profil.tonhoehe, 2)} (tiefer = ruhiger)</label>
          <input
            type="range" min={0.6} max={1.4} step={0.05}
            value={profil.tonhoehe}
            onChange={(e) => setzeProfil({ tonhoehe: Number(e.target.value) })}
            style={{ width: "100%" }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={probeHoeren} style={probeBtn}>▶ Probe hören</button>
            <button
              type="button"
              onClick={() => setzeProfil({ stimmName: null, tempo: 0.9, tonhoehe: 0.9 })}
              style={schliessenBtn}
            >
              zurücksetzen
            </button>
          </div>
        </div>
      )}
      <KiGuide
        begruessung={inhalt.begruessung}
        nachricht={inhalt.nachricht}
        schritte={inhalt.schritte}
        aktionText={inhalt.aktionText}
        aktionHref={inhalt.aktionHref}
        stimmung={inhalt.stimmung}
        fortschritt={inhalt.fortschritt}
        onVorlesen={kannVorlesen ? vorlesen : undefined}
      />

      {/* Paket A3: Rolle, naechster Schritt, Rang und die ganze Anleitung */}
      <div style={lageKasten}>
        {inhalt.rollenHinweis && <div style={hinweisGold}>👤 {inhalt.rollenHinweis}</div>}
        {!inhalt.rollenHinweis && inhalt.werKurz && (
          <div style={zeile}><b style={{ color: A.gold }}>Wer trägt ein:</b> {inhalt.werKurz}</div>
        )}
        {inhalt.uebungsHinweis && <div style={hinweisCyan}>🎁 {inhalt.uebungsHinweis}</div>}
        {inhalt.naechster && (
          <div style={zeile}>
            <b style={{ color: A.gold }}>Ihr nächster Schritt:</b>{" "}
            <a href={inhalt.naechster.href} style={linkStil}>{inhalt.naechster.text} ›</a>
            <div style={{ color: A.textDim, marginTop: 2 }}>{inhalt.naechster.warum}</div>
          </div>
        )}
        {inhalt.rang && (
          <div style={zeile}>
            {inhalt.rang.icon} {inhalt.rang.text}{" "}
            <a href="/dashboard/academy" style={linkStil}>Academy ›</a>
            {inhalt.lernziel && <div style={{ color: A.textDim, marginTop: 2 }}>{inhalt.lernziel}</div>}
          </div>
        )}
        <button type="button" onClick={() => setDetailsOffen((v) => !v)} style={detailsBtn}>
          {detailsOffen ? "▲ Anleitung zuklappen" : "▼ Ganze Anleitung, Probe-Eintrag, wo es ankommt"}
        </button>
        {detailsOffen && (
          <div style={{ marginTop: 8 }}>
            {inhalt.werText && <div style={zeile}><b style={{ color: A.gold }}>Wer darf was:</b> {inhalt.werText}</div>}
            <ol style={{ margin: "6px 0 8px 18px", padding: 0 }}>
              {inhalt.alleSchritte.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
            </ol>
            {inhalt.probe && (
              <div style={zeile}>
                <b style={{ color: A.gold }}>Probe-Eintrag:</b> {inhalt.probe.anlegen}
                <div style={{ marginTop: 2 }}><b style={{ color: A.gold }}>Wieder löschen:</b> {inhalt.probe.loeschen}</div>
              </div>
            )}
            {inhalt.landetIn.length > 0 && (
              <div style={zeile}>
                <b style={{ color: A.gold }}>Das landet in:</b>{" "}
                {inhalt.landetIn.map((v, i) => (
                  <span key={v.href ?? i}>{i > 0 ? " · " : ""}<a href={v.href} style={linkStil}>{v.text}</a></span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const knopf: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 84,
  zIndex: 9997,
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: A.navy2,
  border: `1px solid ${A.gold}55`,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
};

const panel: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 84,
  zIndex: 9997,
  width: "min(400px, calc(100vw - 32px))",
  maxHeight: "min(70vh, 620px)",
  overflowY: "auto",
  background: A.navy,
  border: `1px solid ${A.border}`,
  borderRadius: 18,
  padding: "12px 12px 0",
  boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
};

const panelKopf: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "2px 4px 8px",
};

const stimmKasten: React.CSSProperties = {
  border: `1px solid ${A.border}`,
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 10,
  background: A.navy2,
};

const stimmLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: A.textDim,
  fontWeight: 700,
  margin: "8px 0 4px",
};

const stimmFeld: React.CSSProperties = {
  width: "100%",
  background: A.navy,
  color: "#fff",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12.5,
  fontFamily: "inherit",
};

const stimmHinweis: React.CSSProperties = {
  fontSize: 11.5,
  color: A.textDim,
  marginTop: 6,
  lineHeight: 1.5,
};

const probeBtn: React.CSSProperties = {
  background: A.gold,
  color: A.navy,
  border: "none",
  borderRadius: 8,
  padding: "6px 13px",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const schliessenBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "2px 9px",
  fontSize: 13,
  cursor: "pointer",
  color: A.textDim,
  fontFamily: "inherit",
};

const lageKasten: React.CSSProperties = {
  borderTop: `1px solid ${A.border}`,
  margin: "10px -12px 0",
  padding: "10px 16px 14px",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "rgba(255,255,255,0.88)",
};

const zeile: React.CSSProperties = { marginBottom: 8 };

const hinweisGold: React.CSSProperties = {
  marginBottom: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${A.gold}55`,
  background: "rgba(201,168,76,0.08)",
};

const hinweisCyan: React.CSSProperties = {
  marginBottom: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,229,255,0.3)",
  background: "rgba(0,229,255,0.06)",
};

const linkStil: React.CSSProperties = { color: A.cyan, fontWeight: 700, textDecoration: "none" };

const detailsBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  color: A.textDim,
  fontFamily: "inherit",
  width: "100%",
  textAlign: "left",
};
