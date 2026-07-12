"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ALLE_MODULE, ALLE_MODUL_KEYS } from "../../../lib/rechte";

// ============================================================
// ARGONAUT OS · RECHTE-SYSTEM · R-2 — CHEF-OBERFLÄCHE "ZUGRIFFSRECHTE"
// /dashboard/rechte
// Pro Mitarbeiter Module freischalten (Checkboxen) + Rollen-Vorlagen.
// Speichert in mitarbeiter_rechte (module text[]). Nur der Chef.
// Modul-Schlüssel = identisch mit der Nav-Filterung (R-3).
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// Modul-Katalog (Schlüssel = Nav-Filter-Schlüssel in R-3), gruppiert
const GRUPPEN: { titel: string; farbe: string; items: { key: string; label: string }[] }[] = [
  {
    titel: "💶 Finanzen",
    farbe: C.gold,
    items: [
      { key: "rechnungen", label: "Rechnungen" },
      { key: "mahnwesen", label: "Mahnwesen" },
      { key: "finanzen", label: "Finanzen" },
      { key: "vertraege", label: "Verträge" },
    ],
  },
  {
    titel: "🤝 Vertrieb & Marketing",
    farbe: C.lila,
    items: [
      { key: "leads", label: "Leads" },
      { key: "crm", label: "Vertrieb/CRM" },
      { key: "marketing", label: "Marketing" },
    ],
  },
  {
    titel: "🏭 Betrieb",
    farbe: "#4f94e8",
    items: [
      { key: "auftraege", label: "Aufträge" },
      { key: "projekte", label: "Projekte" },
      { key: "service", label: "Service" },
      { key: "erp", label: "ERP/Lager" },
    ],
  },
  {
    titel: "👥 Personal",
    farbe: C.green,
    items: [
      { key: "personal", label: "Personal" },
      { key: "schichtplan", label: "Schichtplan" },
    ],
  },
  {
    titel: "💬 Kommunikation",
    farbe: C.cyan,
    items: [
      { key: "chat", label: "Chat (KI-Assistent)" },
      { key: "team-chat", label: "Team-Chat" },
      { key: "korrespondenz", label: "Korrespondenz" },
      { key: "dokumente", label: "Dokumente" },
    ],
  },
  {
    titel: "🧩 Tools & KI",
    farbe: C.warn,
    items: [
      { key: "agenten", label: "Agenten" },
      { key: "academy", label: "Academy" },
      { key: "analytics", label: "Analytics" },
      { key: "automatisierungen", label: "Automatisierungen" },
    ],
  },
];

// Keys, die bereits in einer festen Gruppe stehen
const GRUPPIERTE_KEYS = GRUPPEN.flatMap((g) => g.items.map((i) => i.key));

// Self-filling: jedes Modul aus NAV_LINKS, das noch KEINE Gruppe hat,
// kommt automatisch hier rein. Neues Modul = automatisch ein Schalter.
const REST_ITEMS = ALLE_MODULE.filter((m) => !GRUPPIERTE_KEYS.includes(m.key));

// Vollstaendige Gruppen-Liste inkl. Auffang-Gruppe (nur falls es Reste gibt)
const ALLE_GRUPPEN =
  REST_ITEMS.length > 0
    ? [...GRUPPEN, { titel: "⚙️ Betrieb & Werkstatt", farbe: C.cyan, items: REST_ITEMS }]
    : GRUPPEN;

// Zaehlbasis = ALLE Modul-Keys aus NAV_LINKS (nicht nur die hartcodierten)
const ALLE_KEYS = ALLE_MODUL_KEYS;

// Rollen-Vorlagen (Ein-Klick-Presets)
const VORLAGEN: { name: string; module: string[] }[] = [
  { name: "Lager", module: ["erp", "auftraege"] },
  { name: "Produktion", module: ["projekte", "auftraege", "service", "erp"] },
  { name: "Büro", module: ["rechnungen", "korrespondenz", "dokumente", "crm", "auftraege"] },
  { name: "Vertrieb", module: ["leads", "crm", "marketing", "auftraege", "rechnungen"] },
  { name: "Alle", module: [...ALLE_KEYS] },
  { name: "Keine", module: [] },
];

type Mitarbeiter = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  position: string | null;
  abteilung: string | null;
  status: string | null;
  auth_user_id: string | null;
};
type Recht = { rolle: string | null; module: string[] };

export default function RechtePage() {
  const router = useRouter();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [rechte, setRechte] = useState<Record<string, Recht>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);

  async function laden_() {
    setLaden(true);
    setFehler(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    try {
      const [mRes, rRes] = await Promise.all([
        supabase
          .from("mitarbeiter")
          .select("id,vorname,nachname,position,abteilung,status,auth_user_id")
          .order("nachname", { ascending: true }),
        supabase.from("mitarbeiter_rechte").select("mitarbeiter_id,rolle,module"),
      ]);
      if (mRes.error) throw mRes.error;

      const liste = (mRes.data as Mitarbeiter[]) || [];
      setMitarbeiter(liste);

      const map: Record<string, Recht> = {};
      ((rRes.data as any[]) || []).forEach((r) => {
        map[r.mitarbeiter_id] = { rolle: r.rolle || null, module: Array.isArray(r.module) ? r.module : [] };
      });
      // Für MA ohne Eintrag: leere Rechte vorbelegen
      liste.forEach((m) => {
        if (!map[m.id]) map[m.id] = { rolle: null, module: [] };
      });
      setRechte(map);
    } catch (e: any) {
      setFehler(e?.message || "Fehler beim Laden.");
    }
    setLaden(false);
  }

  useEffect(() => {
    laden_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(mid: string, key: string) {
    setRechte((prev) => {
      const akt = prev[mid] || { rolle: null, module: [] };
      const hat = akt.module.includes(key);
      const neu = hat ? akt.module.filter((k) => k !== key) : [...akt.module, key];
      return { ...prev, [mid]: { rolle: "Individuell", module: neu } };
    });
    setOkId(null);
  }

  function vorlageSetzen(mid: string, v: { name: string; module: string[] }) {
    setRechte((prev) => ({ ...prev, [mid]: { rolle: v.name, module: [...v.module] } }));
    setOkId(null);
  }

  async function speichern(mid: string) {
    if (busyId) return;
    setBusyId(mid);
    setFehler(null);
    setOkId(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFehler("Nicht eingeloggt.");
        setBusyId(null);
        return;
      }
      const akt = rechte[mid] || { rolle: null, module: [] };
      const { error } = await supabase.from("mitarbeiter_rechte").upsert(
        {
          mitarbeiter_id: mid,
          owner_user_id: user.id,
          rolle: akt.rolle,
          module: akt.module,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mitarbeiter_id" }
      );
      if (error) throw error;
      setOkId(mid);
    } catch (e: any) {
      setFehler("Speichern fehlgeschlagen: " + (e?.message || "unbekannt"));
    }
    setBusyId(null);
  }

  const name = (m: Mitarbeiter) =>
    [m.vorname, m.nachname].filter(Boolean).join(" ").trim() || "Mitarbeiter";

  const hatMitarbeiter = mitarbeiter.length > 0;

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
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 30,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            🔐 Zugriffsrechte
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Lege pro Mitarbeiter fest, welche Bereiche er sehen darf
          </p>
        </div>

        <div
          style={{
            background: "rgba(0,229,255,0.06)",
            border: `1px solid ${C.cyan}44`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 24,
            color: C.textDim,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Du als Chef siehst immer alles. „Übersicht" und „Mein Bereich" sieht jeder Mitarbeiter.
          Wähle eine Vorlage und passe danach einzelne Häkchen an.
        </div>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>ARGONAUT lädt die Mitarbeiter…</div>
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
            ⚠️ {fehler}
          </div>
        ) : !hatMitarbeiter ? (
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
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 17, color: "#fff", marginBottom: 6 }}>Noch keine Mitarbeiter</div>
            <div style={{ fontSize: 14 }}>Lege im Personal-Bereich Mitarbeiter an, dann kannst du hier Rechte vergeben.</div>
          </div>
        ) : (
          mitarbeiter.map((m) => {
            const akt = rechte[m.id] || { rolle: null, module: [] };
            const busy = busyId === m.id;
            const ok = okId === m.id;
            return (
              <div
                key={m.id}
                style={{
                  background: C.navy2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: "20px 22px",
                  marginBottom: 18,
                }}
              >
                {/* Kopf */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700 }}>{name(m)}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>
                      {[m.position, m.abteilung].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {!m.auth_user_id && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.warn,
                        background: `${C.warn}22`,
                        border: `1px solid ${C.warn}55`,
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      noch nicht eingeladen
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  {akt.rolle && (
                    <span style={{ color: C.textDim, fontSize: 12.5 }}>
                      Vorlage: <strong style={{ color: "#fff" }}>{akt.rolle}</strong>
                    </span>
                  )}
                </div>

                {/* Vorlagen */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {VORLAGEN.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => vorlageSetzen(m.id, v)}
                      style={{
                        background: akt.rolle === v.name ? C.gold : "transparent",
                        color: akt.rolle === v.name ? C.navy : C.textDim,
                        border: `1px solid ${akt.rolle === v.name ? C.gold : C.border}`,
                        borderRadius: 999,
                        padding: "7px 14px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>

                {/* Modul-Checkboxen, gruppiert */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
                  {ALLE_GRUPPEN.map((g) => (
                    <div key={g.titel}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: g.farbe, marginBottom: 8 }}>{g.titel}</div>
                      {g.items.map((it) => {
                        const an = akt.module.includes(it.key);
                        return (
                          <label
                            key={it.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "6px 0",
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={an}
                              onChange={() => toggle(m.id, it.key)}
                              style={{ width: 17, height: 17, accentColor: g.farbe, cursor: "pointer" }}
                            />
                            <span style={{ color: an ? "#fff" : C.textDim }}>{it.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Speichern */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => speichern(m.id)}
                    disabled={busy}
                    style={{
                      background: C.gold,
                      color: C.navy,
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: busy ? "wait" : "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy ? "Speichert…" : "💾 Rechte speichern"}
                  </button>
                  <span style={{ color: C.textDim, fontSize: 13 }}>
                    {akt.module.length} von {ALLE_KEYS.length} Modulen freigeschaltet
                  </span>
                  {ok && <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>✓ Gespeichert</span>}
                </div>
              </div>
            );
          })
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}
