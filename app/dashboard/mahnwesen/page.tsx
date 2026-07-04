"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · Block C-3 — MAHN-COCKPIT
// /dashboard/mahnwesen — überfällige Rechnungen, Mahnstufen-Ampel, Hochstufen
// "Überfällig" ist datengetrieben (wie Block B):
//   Fälligkeit < heute  UND  offener Rest > 0
//   UND Status weder "bezahlt" noch "storniert".
// Nutzt die vorhandenen Spalten rechnungen.mahnstufe + letzte_mahnung_am.
// ============================================================

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  lila: "#A98CE0",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Rechnung = {
  id: string;
  rechnungsnummer: string | null;
  titel: string | null;
  kontakt_id: string | null;
  firma_id: string | null;
  zahlungsstatus: string;
  faelligkeitsdatum: string | null;
  brutto_summe: number | null;
  bezahlter_betrag: number | null;
  waehrung: string | null;
  mahnstufe: number | null;
  letzte_mahnung_am: string | null;
};

// Mahnstufen: 0 = überfällig/nicht gemahnt, 1 = Erinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung
const MAHN_META = [
  { label: "Überfällig", kurz: "Nicht gemahnt", farbe: C.warn, aktion: "→ Zahlungserinnerung" },
  { label: "Zahlungserinnerung", kurz: "Erinnerung raus", farbe: "#E07B3C", aktion: "→ 1. Mahnung" },
  { label: "1. Mahnung", kurz: "1. Mahnung raus", farbe: C.danger, aktion: "→ 2. Mahnung" },
  { label: "2. Mahnung", kurz: "2. Mahnung raus", farbe: "#B03030", aktion: null },
];

function eur(n: number | null | undefined, waehrung = "EUR"): string {
  const v = typeof n === "number" ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: waehrung || "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function datum(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

// Tage bis Fälligkeit (negativ = überfällig)
function tageBisFaellig(faellig: string | null | undefined): number | null {
  if (!faellig) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const f = new Date(faellig);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
}

function offenerRest(r: Rechnung): number {
  return (r.brutto_summe || 0) - (r.bezahlter_betrag || 0);
}

function istUeberfaellig(r: Rechnung): boolean {
  if (r.zahlungsstatus === "bezahlt" || r.zahlungsstatus === "storniert") return false;
  if (offenerRest(r) <= 0.005) return false;
  const t = tageBisFaellig(r.faelligkeitsdatum);
  return t !== null && t < 0;
}

export default function MahnwesenCockpit() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      ),
    []
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [kontaktMap, setKontaktMap] = useState<Record<string, string>>({});
  const [firmaMap, setFirmaMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      setLaden(true);
      setFehler(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: rData, error: rErr } = await supabase
          .from("rechnungen")
          .select(
            "id,rechnungsnummer,titel,kontakt_id,firma_id,zahlungsstatus,faelligkeitsdatum,brutto_summe,bezahlter_betrag,waehrung,mahnstufe,letzte_mahnung_am"
          )
          .order("faelligkeitsdatum", { ascending: true });

        if (rErr) throw rErr;
        const liste = (rData || []) as Rechnung[];

        // Kontakt-Namen defensiv auflösen
        const kIds = Array.from(new Set(liste.map((r) => r.kontakt_id).filter(Boolean))) as string[];
        const kMap: Record<string, string> = {};
        if (kIds.length) {
          const { data: kData } = await supabase.from("kontakte").select("*").in("id", kIds);
          (kData || []).forEach((k: any) => {
            kMap[k.id] =
              k.anzeigename ||
              [k.vorname, k.nachname].filter(Boolean).join(" ") ||
              k.name ||
              k.email ||
              "Kontakt";
          });
        }

        // Firmen-Namen defensiv auflösen
        const fIds = Array.from(new Set(liste.map((r) => r.firma_id).filter(Boolean))) as string[];
        const fMap: Record<string, string> = {};
        if (fIds.length) {
          const { data: fData } = await supabase.from("firmen").select("*").in("id", fIds);
          (fData || []).forEach((f: any) => {
            fMap[f.id] = f.name || f.firmenname || f.firma || "Firma";
          });
        }

        if (!aktiv) return;
        setRechnungen(liste);
        setKontaktMap(kMap);
        setFirmaMap(fMap);
      } catch (e: any) {
        if (aktiv) setFehler(e?.message || "Fehler beim Laden der Rechnungen.");
      } finally {
        if (aktiv) setLaden(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [supabase, router]);

  // Nur überfällige Rechnungen, sortiert nach längstem Verzug zuerst
  const ueberfaellige = useMemo(() => {
    return rechnungen
      .filter(istUeberfaellig)
      .sort((a, b) => (tageBisFaellig(a.faelligkeitsdatum) ?? 0) - (tageBisFaellig(b.faelligkeitsdatum) ?? 0));
  }, [rechnungen]);

  // KPIs
  const kpis = useMemo(() => {
    let offenerBetrag = 0;
    let nichtGemahnt = 0;
    let inMahnung = 0;
    for (const r of ueberfaellige) {
      offenerBetrag += offenerRest(r);
      if ((r.mahnstufe || 0) === 0) nichtGemahnt += 1;
      else inMahnung += 1;
    }
    return { anzahl: ueberfaellige.length, offenerBetrag, nichtGemahnt, inMahnung };
  }, [ueberfaellige]);

  async function mahnstufeSetzen(r: Rechnung, neu: number) {
    if (busyId) return;
    setBusyId(r.id);
    setFehler(null);
    const heute = new Date().toISOString().slice(0, 10);
    const patch: any = {
      mahnstufe: neu,
      letzte_mahnung_am: neu > 0 ? heute : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("rechnungen").update(patch).eq("id", r.id);
    if (error) {
      setFehler("Konnte Mahnstufe nicht ändern: " + error.message);
      setBusyId(null);
      return;
    }
    setRechnungen((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, mahnstufe: neu, letzte_mahnung_am: patch.letzte_mahnung_am } : x
      )
    );
    setBusyId(null);
  }

  const spalten = "120px 1fr 150px 130px 160px 270px";

  return (
    <div
      style={{
        background: C.navy,
        minHeight: "100vh",
        padding: "32px 24px 64px",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Kopfzeile */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 30,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            ⚠️ Mahnwesen
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Überfällige Rechnungen im Blick – Mahnstufe verfolgen und hochstufen
          </p>
        </div>

        {/* KPI-Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard label="Überfällige Rechnungen" wert={String(kpis.anzahl)} farbe={C.danger} />
          <KpiCard label="Offener Betrag" wert={eur(kpis.offenerBetrag)} farbe={C.gold} />
          <KpiCard label="Noch nicht gemahnt" wert={String(kpis.nichtGemahnt)} farbe={C.warn} />
          <KpiCard label="In Mahnung" wert={String(kpis.inMahnung)} farbe="#E07B3C" />
        </div>

        {/* Inhalt */}
        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT lädt die überfälligen Rechnungen…
          </div>
        ) : fehler ? (
          <div
            style={{
              background: "rgba(224,102,102,0.1)",
              border: `1px solid ${C.danger}`,
              borderRadius: 12,
              padding: 16,
              color: C.danger,
            }}
          >
            {fehler}
          </div>
        ) : ueberfaellige.length === 0 ? (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "48px 24px",
              textAlign: "center",
              color: C.textDim,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 17, color: "#fff", marginBottom: 6 }}>
              Keine überfälligen Rechnungen
            </div>
            <div style={{ fontSize: 14 }}>Alles im grünen Bereich – kein Mahnbedarf.</div>
          </div>
        ) : (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              {/* Tabellenkopf */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: spalten,
                  gap: 12,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.textDim,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  minWidth: 980,
                }}
              >
                <div>Nummer</div>
                <div>Empfänger / Titel</div>
                <div>Verzug</div>
                <div style={{ textAlign: "right" }}>Offen</div>
                <div>Mahnstufe</div>
                <div>Aktion</div>
              </div>

              {ueberfaellige.map((r) => {
                const stufe = Math.min(Math.max(r.mahnstufe || 0, 0), 3);
                const meta = MAHN_META[stufe];
                const empfaenger =
                  (r.kontakt_id && kontaktMap[r.kontakt_id]) ||
                  (r.firma_id && firmaMap[r.firma_id]) ||
                  r.titel ||
                  "—";
                const t = tageBisFaellig(r.faelligkeitsdatum);
                const tage = t === null ? 0 : Math.abs(t);
                const verzugFarbe = tage > 30 ? C.danger : tage > 7 ? "#E07B3C" : C.warn;
                const busy = busyId === r.id;

                return (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/dashboard/mahnwesen/${r.id}`)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: spalten,
                      gap: 12,
                      padding: "16px 18px",
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                      alignItems: "center",
                      minWidth: 980,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Nummer */}
                    <div
                      style={{
                        fontFamily: "'Syne', sans-serif",
                        fontWeight: 700,
                        color: C.gold,
                        fontSize: 14,
                      }}
                    >
                      {r.rechnungsnummer || "—"}
                    </div>

                    {/* Empfänger / Titel */}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {empfaenger}
                      </div>
                      {r.titel && empfaenger !== r.titel && (
                        <div
                          style={{
                            color: C.textDim,
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.titel}
                        </div>
                      )}
                    </div>

                    {/* Verzug */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: verzugFarbe,
                          flexShrink: 0,
                          boxShadow: `0 0 8px ${verzugFarbe}66`,
                        }}
                      />
                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>
                        {tage} {tage === 1 ? "Tag" : "Tage"}
                      </span>
                      <span style={{ fontSize: 12, color: C.textDim }}>fällig: {datum(r.faelligkeitsdatum)}</span>
                    </div>

                    {/* Offener Betrag */}
                    <div style={{ textAlign: "right", fontWeight: 700, fontSize: 15 }}>
                      {eur(offenerRest(r), r.waehrung || "EUR")}
                    </div>

                    {/* Mahnstufe */}
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          background: `${meta.farbe}22`,
                          color: meta.farbe,
                          border: `1px solid ${meta.farbe}55`,
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {meta.label}
                      </span>
                      {r.letzte_mahnung_am && (
                        <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>
                          seit {datum(r.letzte_mahnung_am)}
                        </div>
                      )}
                    </div>

                    {/* Aktion */}
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => router.push(`/dashboard/mahnwesen/${r.id}`)}
                        style={{
                          background: meta.farbe,
                          color: C.navy,
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✉️ Mahnung erstellen
                      </button>

                      {stufe < 3 && (
                        <button
                          onClick={() => mahnstufeSetzen(r, stufe + 1)}
                          disabled={busy}
                          title="Direkt hochstufen (ohne Schreiben)"
                          style={{
                            background: "transparent",
                            color: meta.farbe,
                            border: `1px solid ${meta.farbe}77`,
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: busy ? "wait" : "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          {busy ? "…" : "⏫"}
                        </button>
                      )}

                      {stufe > 0 && (
                        <button
                          onClick={() => mahnstufeSetzen(r, 0)}
                          disabled={busy}
                          title="Mahnstufe zurücksetzen"
                          style={{
                            background: "transparent",
                            color: C.textDim,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 13,
                            cursor: busy ? "wait" : "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!laden && !fehler && ueberfaellige.length > 0 && (
          <p style={{ color: C.textDim, fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
            Hinweis: „✉️ Mahnung erstellen" öffnet den Assistenten (Text von ARGONAUT + PDF).
            Mit „⏫" stufst du direkt hoch (ohne Schreiben), „↺" setzt die Stufe zurück.
          </p>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 4,
          height: "100%",
          background: farbe,
        }}
      />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: farbe }}>
        {wert}
      </div>
    </div>
  );
}
