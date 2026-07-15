"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ALLE_MODULE,
  ALLE_MODUL_KEYS,
  verteilbareModule,
  istSensibel,
  darfVerteilen,
} from "../../../lib/rechte";
import type { Rolle } from "../../../lib/rechte";

// ============================================================
// ARGONAUT OS · RECHTE-SYSTEM · WELLE 3 — VERTEIL-OBERFLÄCHE "ZUGRIFFSRECHTE"
// /dashboard/rechte
// Pro Mitarbeiter Module freischalten (Checkboxen) + Rollen-Vorlagen.
// Speichert in mitarbeiter_rechte (module text[]).
//
// NEU (Welle 3):
//  1. WER BIN ICH?   Rolle + Verteil-Vollmacht des eingeloggten Nutzers.
//                    Keine mitarbeiter-Zeile = Eigentuemer (identisch zum proxy).
//                    Reiner Mitarbeiter ohne Vollmacht -> Seite gesperrt.
//  2. WAS DARF ICH ZEIGEN?  nur verteilbareModule(rolle, eigeneModule).
//                    Eigentuemer/Admin sehen sensible Module, Abteilungsleiter nicht.
//  3. DOPPEL-BESTAETIGUNG bei sensiblen Modulen:
//                    Rueckfrage beim Aktivieren UND Zusammenfassung beim Speichern.
//  4. OWNER-FIX (2b): Rechte-Zeilen gehoeren immer dem CHEF (owner_user_id),
//                    egal ob Chef oder Administrator sie speichert.
//  5. VOLLMACHT (2c): NUR der Eigentuemer kann einen Mitarbeiter zum
//                    Administrator machen (darf_verteilen setzen). Die eiserne
//                    Grenze: ein Administrator kann keine weiteren Admins ernennen.
//
// NEU (PUNKT 8 · Schreibrechte, zweite Achse SEHEN vs. AENDERN):
//  - Pro freigegebenem Modul kann zusaetzlich "✏️ darf ändern" gesetzt werden.
//    Das schreibt in mitarbeiter_rechte.schreib_module (text[]).
//  - Aendern setzt Sehen voraus: die Aendern-Checkbox erscheint nur, wenn das
//    Modul auch gesehen werden darf. Wird Sehen abgewaehlt, faellt das
//    Schreibrecht automatisch mit weg (kein verwaistes schreib_module).
//  - DB-Gegenstueck: darf_ich_modul_aendern(modul) liest schreib_module.
//
// Modul-Schluessel = identisch mit der Nav-Filterung.
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

// Modul-Katalog (Schlüssel = Nav-Filter-Schlüssel), gruppiert
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

// Schluessel -> lesbares Label (fuer die Bestaetigungs-Dialoge).
const LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALLE_GRUPPEN.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

// Rolle -> deutsche Anzeige (Header-Badge).
const ROLLE_LABEL: Record<Rolle, string> = {
  eigentuemer: "Eigentümer",
  administrator: "Administrator",
  abteilungsleiter: "Abteilungsleiter",
  mitarbeiter: "Mitarbeiter",
};

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
  rolle: string | null;
  darf_verteilen: boolean | null;
};
// PUNKT 8: schreibModule als zweite Achse ergaenzt (Sicht = module, Aendern = schreibModule).
type Recht = { rolle: string | null; module: string[]; schreibModule: string[] };

// Bestaetigungs-Dialog: sensibles Modul aktivieren, speichern, oder Vollmacht.
type Modal =
  | { art: "sensibel-an"; mid: string; key: string }
  | { art: "speichern"; mid: string }
  | { art: "vollmacht"; mid: string; an: boolean }
  | null;

export default function RechtePage() {
  const router = useRouter();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [rechte, setRechte] = useState<Record<string, Recht>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);

  // WELLE 3: wer bin ich + was darf ich verteilen
  const [meineRolle, setMeineRolle] = useState<Rolle>("mitarbeiter");
  const [erlaubteKeys, setErlaubteKeys] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal>(null);

  // owner_user_id, dem die Rechte-Zeilen gehoeren = IMMER der CHEF.
  // Eigentuemer: seine eigene UID. Verteiler (Admin): die owner_user_id
  // seiner mitarbeiter-Zeile (= UID seines Chefs). So gehoeren die Daten
  // stets dem Chef, egal wer speichert (heilt den alten owner-Bug + ist
  // noetig fuer die RLS-Policy owner_user_id = mein_chef_id()).
  const [meinOwnerId, setMeinOwnerId] = useState<string | null>(null);

  // 2c: laeuft gerade ein Vollmacht-Wechsel fuer diesen Mitarbeiter?
  const [vollmachtBusyId, setVollmachtBusyId] = useState<string | null>(null);

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

    // -----------------------------------------------------------------
    // 1) WER BIN ICH? — Rolle + Verteil-Vollmacht bestimmen.
    // KEINE mitarbeiter-Zeile = Eigentuemer (Chef). Dieselbe Definition
    // wie im proxy — sonst haetten wir zwei widerspruechliche Chef-Begriffe.
    // -----------------------------------------------------------------
    let rolle: Rolle;
    let vollmacht: boolean;
    let eigeneModule: string[];

    try {
      const { data: meineZeile } = await supabase
        .from("mitarbeiter")
        .select("id, rolle, darf_verteilen, owner_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!meineZeile) {
        rolle = "eigentuemer";
        vollmacht = true;
        eigeneModule = ALLE_MODUL_KEYS;
        // Eigentuemer besitzt seine Daten selbst.
        setMeinOwnerId(user.id);
      } else {
        rolle = (meineZeile.rolle as Rolle) ?? "mitarbeiter";
        vollmacht = !!meineZeile.darf_verteilen;
        // Rechte-Zeilen gehoeren dem CHEF dieses Verteilers, nicht ihm selbst.
        setMeinOwnerId((meineZeile.owner_user_id as string) ?? user.id);
        // Eigene Module des Verteilers laden (Grundlage fuer verteilbareModule).
        const { data: meinRecht } = await supabase
          .from("mitarbeiter_rechte")
          .select("module")
          .eq("mitarbeiter_id", meineZeile.id)
          .maybeSingle();
        eigeneModule = Array.isArray(meinRecht?.module) ? (meinRecht!.module as string[]) : [];
      }
    } catch (e: any) {
      setFehler(e?.message || "Fehler beim Prüfen der Berechtigung.");
      setLaden(false);
      return;
    }

    // Reiner Mitarbeiter ohne Verteil-Vollmacht -> Seite gesperrt.
    if (!darfVerteilen(rolle, vollmacht)) {
      router.push("/dashboard");
      return;
    }

    setMeineRolle(rolle);

    // -----------------------------------------------------------------
    // 2) WAS DARF ICH ZEIGEN? — nur die verteilbaren Module.
    // Eigentuemer -> alle. Abteilungsleiter -> keine sensiblen (Ebene 2).
    // -----------------------------------------------------------------
    setErlaubteKeys(new Set(verteilbareModule(rolle, eigeneModule)));

    // -----------------------------------------------------------------
    // 3) Mitarbeiter + bestehende Rechte laden (wie bisher).
    // -----------------------------------------------------------------
    try {
      const [mRes, rRes] = await Promise.all([
        supabase
          .from("mitarbeiter")
          .select("id,vorname,nachname,position,abteilung,status,auth_user_id,rolle,darf_verteilen")
          .order("nachname", { ascending: true }),
        // PUNKT 8: schreib_module mitladen.
        supabase.from("mitarbeiter_rechte").select("mitarbeiter_id,rolle,module,schreib_module"),
      ]);
      if (mRes.error) throw mRes.error;

      const liste = (mRes.data as Mitarbeiter[]) || [];
      setMitarbeiter(liste);

      const map: Record<string, Recht> = {};
      ((rRes.data as any[]) || []).forEach((r) => {
        map[r.mitarbeiter_id] = {
          rolle: r.rolle || null,
          module: Array.isArray(r.module) ? r.module : [],
          // PUNKT 8: Schreibrechte laden (Fallback leer).
          schreibModule: Array.isArray(r.schreib_module) ? r.schreib_module : [],
        };
      });
      // Für MA ohne Eintrag: leere Rechte vorbelegen
      liste.forEach((m) => {
        if (!map[m.id]) map[m.id] = { rolle: null, module: [], schreibModule: [] };
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

  // --- Toggle ---------------------------------------------------------
  // Sensibles Modul AKTIVIEREN loest zuerst die Rueckfrage aus.
  function toggle(mid: string, key: string) {
    const akt = rechte[mid] || { rolle: null, module: [], schreibModule: [] };
    const wirdAktiviert = !akt.module.includes(key);
    if (wirdAktiviert && istSensibel(key)) {
      setModal({ art: "sensibel-an", mid, key });
      return;
    }
    _toggle(mid, key);
  }

  // Die eigentliche Umschaltung (nach evtl. Bestaetigung).
  // PUNKT 8: Wird die Sicht ABGEWAEHLT, faellt das Schreibrecht automatisch mit weg.
  function _toggle(mid: string, key: string) {
    setRechte((prev) => {
      const akt = prev[mid] || { rolle: null, module: [], schreibModule: [] };
      const hat = akt.module.includes(key);
      const neuModule = hat ? akt.module.filter((k) => k !== key) : [...akt.module, key];
      // Sicht weg -> Schreibrecht fuer dieses Modul ebenfalls entfernen.
      const neuSchreib = hat ? akt.schreibModule.filter((k) => k !== key) : akt.schreibModule;
      return { ...prev, [mid]: { rolle: "Individuell", module: neuModule, schreibModule: neuSchreib } };
    });
    setOkId(null);
  }

  // PUNKT 8: Schreibrecht ("darf ändern") pro Modul umschalten.
  // Nur moeglich, wenn das Modul auch gesehen werden darf (Sicht = an).
  function toggleSchreib(mid: string, key: string) {
    setRechte((prev) => {
      const akt = prev[mid] || { rolle: null, module: [], schreibModule: [] };
      // Sicherheit: ohne Sicht kein Schreibrecht.
      if (!akt.module.includes(key)) return prev;
      const hat = akt.schreibModule.includes(key);
      const neuSchreib = hat
        ? akt.schreibModule.filter((k) => k !== key)
        : [...akt.schreibModule, key];
      return { ...prev, [mid]: { ...akt, rolle: "Individuell", schreibModule: neuSchreib } };
    });
    setOkId(null);
  }

  // Vorlage: nur Module setzen, die ich auch verteilen DARF.
  // PUNKT 8: Vorlagen setzen NUR Sicht-Rechte; Schreibrechte werden bewusst
  // zurueckgesetzt (Aendern ist immer eine ausdrueckliche Einzelentscheidung).
  function vorlageSetzen(mid: string, v: { name: string; module: string[] }) {
    const gefiltert = v.module.filter((k) => erlaubteKeys.has(k));
    setRechte((prev) => ({
      ...prev,
      [mid]: { rolle: v.name, module: gefiltert, schreibModule: [] },
    }));
    setOkId(null);
  }

  // --- Speichern ------------------------------------------------------
  // Sind sensible Module dabei -> erst Zusammenfassung bestaetigen.
  async function speichern(mid: string) {
    if (busyId) return;
    const akt = rechte[mid] || { rolle: null, module: [], schreibModule: [] };
    const sensibleDrin = akt.module.filter((k) => istSensibel(k));
    if (sensibleDrin.length > 0) {
      setModal({ art: "speichern", mid });
      return;
    }
    await _speichern(mid);
  }

  // Der eigentliche Schreibvorgang.
  async function _speichern(mid: string) {
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
      const akt = rechte[mid] || { rolle: null, module: [], schreibModule: [] };
      // PUNKT 8: Schreibrechte defensiv auf die Sicht-Module begrenzen
      // (kein Schreibrecht ohne Sicht landet je in der DB).
      const schreibSauber = akt.schreibModule.filter((k) => akt.module.includes(k));
      const { error } = await supabase.from("mitarbeiter_rechte").upsert(
        {
          mitarbeiter_id: mid,
          // Daten gehoeren dem CHEF (meinOwnerId), nicht dem Anlegenden.
          // Fuer den Eigentuemer ist das seine eigene UID; fuer einen
          // Administrator die UID seines Chefs. Passt zur RLS-Policy.
          owner_user_id: meinOwnerId ?? user.id,
          rolle: akt.rolle,
          module: akt.module,
          // PUNKT 8: zweite Achse mitschreiben.
          schreib_module: schreibSauber,
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

  // --- 2c: Verteil-Vollmacht (nur Eigentuemer) ------------------------
  // Oeffnet die Bestaetigung. an=true -> zum Administrator machen, an=false -> entziehen.
  function vollmachtToggle(mid: string, an: boolean) {
    if (meineRolle !== "eigentuemer") return; // eiserne Grenze (UI-Seite)
    setModal({ art: "vollmacht", mid, an });
  }

  // Schreibt rolle + darf_verteilen auf die mitarbeiter-Zeile.
  // Die DB erlaubt das nur dem Owner (Chef) -> zweite Absicherung.
  async function _vollmachtSetzen(mid: string, an: boolean) {
    setVollmachtBusyId(mid);
    setFehler(null);
    try {
      const { error } = await supabase
        .from("mitarbeiter")
        .update({ rolle: an ? "administrator" : "mitarbeiter", darf_verteilen: an })
        .eq("id", mid);
      if (error) throw error;
      setMitarbeiter((prev) =>
        prev.map((m) =>
          m.id === mid ? { ...m, rolle: an ? "administrator" : "mitarbeiter", darf_verteilen: an } : m
        )
      );
    } catch (e: any) {
      setFehler("Vollmacht ändern fehlgeschlagen: " + (e?.message || "unbekannt"));
    }
    setVollmachtBusyId(null);
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontSize: 30,
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              🔐 Zugriffsrechte
            </h1>
            {!laden && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.cyan,
                  background: `${C.cyan}18`,
                  border: `1px solid ${C.cyan}55`,
                  borderRadius: 999,
                  padding: "4px 12px",
                }}
              >
                Angemeldet als: {ROLLE_LABEL[meineRolle]}
              </span>
            )}
          </div>
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
          Wähle eine Vorlage und passe danach einzelne Häkchen an. Bereiche mit
          <span style={{ color: C.warn, fontWeight: 700 }}> 🔒 sensibel</span> sind rechtlich/kaufmännisch
          heikel — sie brauchen beim Freigeben und beim Speichern eine Bestätigung.
          Mit <span style={{ color: C.cyan, fontWeight: 700 }}>✏️ darf ändern</span> gibst du zusätzlich
          das Recht, in einem Bereich zu speichern und zu löschen — ohne dieses Häkchen darf der
          Mitarbeiter den Bereich nur ansehen.
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
            const akt = rechte[m.id] || { rolle: null, module: [], schreibModule: [] };
            const busy = busyId === m.id;
            const ok = okId === m.id;
            const istVerteiler = !!m.darf_verteilen;
            const vBusy = vollmachtBusyId === m.id;
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
                    <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 18, fontWeight: 700 }}>{name(m)}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>
                      {[m.position, m.abteilung].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {istVerteiler && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.gold,
                        background: `${C.gold}22`,
                        border: `1px solid ${C.gold}66`,
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      ⚡ Administrator
                    </span>
                  )}
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

                {/* 2c: Verteil-Vollmacht — NUR fuer den Eigentuemer sichtbar */}
                {meineRolle === "eigentuemer" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      background: istVerteiler ? `${C.gold}10` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${istVerteiler ? C.gold + "44" : C.border}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.textDim }}>
                      Verteil-Vollmacht:{" "}
                      <strong style={{ color: istVerteiler ? C.gold : "#fff" }}>
                        {istVerteiler ? "Administrator — darf Rechte verteilen" : "Kein Verteiler"}
                      </strong>
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => vollmachtToggle(m.id, !istVerteiler)}
                      disabled={vBusy}
                      style={{
                        background: istVerteiler ? "transparent" : C.gold,
                        color: istVerteiler ? C.textDim : C.navy,
                        border: `1px solid ${istVerteiler ? C.border : C.gold}`,
                        borderRadius: 999,
                        padding: "7px 14px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: vBusy ? "wait" : "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: vBusy ? 0.6 : 1,
                      }}
                    >
                      {vBusy
                        ? "Ändert…"
                        : istVerteiler
                        ? "Vollmacht entziehen"
                        : "⚡ Als Administrator einsetzen"}
                    </button>
                  </div>
                )}

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

                {/* Modul-Checkboxen, gruppiert — nur verteilbare Module */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
                  {ALLE_GRUPPEN.map((g) => {
                    const items = g.items.filter((it) => erlaubteKeys.has(it.key));
                    if (items.length === 0) return null;
                    return (
                      <div key={g.titel}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: g.farbe, marginBottom: 8 }}>{g.titel}</div>
                        {items.map((it) => {
                          const an = akt.module.includes(it.key);
                          const sensibel = istSensibel(it.key);
                          // PUNKT 8: darf dieser MA das Modul aendern?
                          const darfAendern = akt.schreibModule.includes(it.key);
                          return (
                            <div
                              key={it.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "6px 0",
                                flexWrap: "wrap",
                                fontSize: 14,
                              }}
                            >
                              {/* Sicht-Haekchen (wie bisher) */}
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  cursor: "pointer",
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
                              {sensibel && (
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: C.warn,
                                    background: `${C.warn}1E`,
                                    border: `1px solid ${C.warn}55`,
                                    borderRadius: 999,
                                    padding: "1px 7px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  🔒 sensibel
                                </span>
                              )}
                              {/* PUNKT 8: "darf ändern" — nur sichtbar, wenn Sicht an ist */}
                              {an && (
                                <label
                                  title="Darf in diesem Bereich speichern und löschen. Ohne Häkchen nur ansehen."
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    cursor: "pointer",
                                    marginLeft: "auto",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: darfAendern ? C.cyan : C.textDim,
                                    background: darfAendern ? `${C.cyan}18` : "transparent",
                                    border: `1px solid ${darfAendern ? C.cyan + "66" : C.border}`,
                                    borderRadius: 999,
                                    padding: "2px 9px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={darfAendern}
                                    onChange={() => toggleSchreib(m.id, it.key)}
                                    style={{ width: 14, height: 14, accentColor: C.cyan, cursor: "pointer" }}
                                  />
                                  ✏️ darf ändern
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Speichern */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
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
                    {akt.module.length} von {erlaubteKeys.size} Modulen freigeschaltet
                    {akt.schreibModule.length > 0 && (
                      <span style={{ color: C.cyan }}>
                        {" "}
                        · {akt.schreibModule.length} mit ✏️ Änderungsrecht
                      </span>
                    )}
                  </span>
                  {ok && <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>✓ Gespeichert</span>}
                </div>
              </div>
            );
          })
        )}

        <div style={{ height: 30 }} />
      </div>

      {/* ===================== BESTAETIGUNGS-DIALOG ===================== */}
      {modal &&
        (() => {
          const m = mitarbeiter.find((x) => x.id === modal.mid);
          const nm = m ? name(m) : "Mitarbeiter";

          const overlay = (inhalt: React.ReactNode) => (
            <div
              onClick={() => setModal(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(4,10,20,0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                zIndex: 1000,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: C.navy2,
                  border: `1px solid ${C.warn}66`,
                  borderRadius: 16,
                  padding: "26px 26px 22px",
                  maxWidth: 480,
                  width: "100%",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                {inhalt}
              </div>
            </div>
          );

          const knoepfe = (jaLabel: string, onJa: () => void, gefahr = false) => (
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  background: "transparent",
                  color: C.textDim,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={onJa}
                style={{
                  background: gefahr ? C.warn : C.gold,
                  color: C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {jaLabel}
              </button>
            </div>
          );

          if (modal.art === "sensibel-an") {
            const lab = LABEL_MAP[modal.key] || modal.key;
            return overlay(
              <>
                <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 19, fontWeight: 800, marginBottom: 10 }}>
                  🔒 Sensiblen Bereich freigeben
                </div>
                <p style={{ color: "#fff", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 8px" }}>
                  Du gibst <strong>{nm}</strong> Zugriff auf <strong style={{ color: C.warn }}>{lab}</strong>.
                </p>
                <p style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                  Dieser Bereich ist rechtlich und kaufmännisch heikel. Bitte bestätige die Freigabe bewusst.
                </p>
                {knoepfe("Ja, freigeben", () => {
                  _toggle(modal.mid, modal.key);
                  setModal(null);
                })}
              </>
            );
          }

          if (modal.art === "vollmacht") {
            return overlay(
              <>
                <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 19, fontWeight: 800, marginBottom: 10 }}>
                  ⚡ Verteil-Vollmacht {modal.an ? "vergeben" : "entziehen"}
                </div>
                {modal.an ? (
                  <>
                    <p style={{ color: "#fff", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 8px" }}>
                      <strong>{nm}</strong> wird <strong style={{ color: C.gold }}>Administrator</strong> und darf
                      künftig selbst Rechte an andere Mitarbeiter verteilen — nur die Module, die er selbst hat.
                    </p>
                    <p style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                      Diese Vollmacht kann nur der Eigentümer vergeben. Ein Administrator kann keine weiteren
                      Administratoren ernennen.
                    </p>
                  </>
                ) : (
                  <p style={{ color: "#fff", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
                    <strong>{nm}</strong> verliert die Verteil-Vollmacht und wird wieder normaler Mitarbeiter.
                    Bereits vergebene Modul-Rechte bleiben unverändert.
                  </p>
                )}
                {knoepfe(
                  modal.an ? "Ja, einsetzen" : "Ja, entziehen",
                  () => {
                    setModal(null);
                    _vollmachtSetzen(modal.mid, modal.an);
                  },
                  true
                )}
              </>
            );
          }

          // art === "speichern"
          const aktM = rechte[modal.mid] || { rolle: null, module: [], schreibModule: [] };
          const sensibleListe = aktM.module.filter((k) => istSensibel(k)).map((k) => LABEL_MAP[k] || k);
          // PUNKT 8: sensible Module MIT Aenderungsrecht gesondert ausweisen.
          const sensibelAendern = aktM.module
            .filter((k) => istSensibel(k) && aktM.schreibModule.includes(k))
            .map((k) => LABEL_MAP[k] || k);
          return overlay(
            <>
              <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 19, fontWeight: 800, marginBottom: 12 }}>
                💾 Rechte speichern — Zusammenfassung
              </div>
              <p style={{ color: "#fff", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 12px" }}>
                <strong>{nm}</strong> erhält <strong>{aktM.module.length}</strong>{" "}
                {aktM.module.length === 1 ? "Modul" : "Module"} — darunter{" "}
                <strong style={{ color: C.warn }}>{sensibleListe.length}</strong> sensible
                {sensibleListe.length === 1 ? "n Bereich" : " Bereiche"}:
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "12px 14px",
                  background: `${C.warn}12`,
                  border: `1px solid ${C.warn}44`,
                  borderRadius: 12,
                }}
              >
                {sensibleListe.map((lab) => (
                  <span
                    key={lab}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: C.warn,
                      background: `${C.warn}1E`,
                      border: `1px solid ${C.warn}55`,
                      borderRadius: 999,
                      padding: "3px 11px",
                    }}
                  >
                    🔒 {lab}
                  </span>
                ))}
              </div>
              {/* PUNKT 8: Warnhinweis, wenn sensible Bereiche AENDERN dürfen */}
              {sensibelAendern.length > 0 && (
                <p style={{ color: C.cyan, fontSize: 13, lineHeight: 1.6, margin: "12px 0 0" }}>
                  ✏️ Mit <strong>Änderungsrecht</strong> (darf speichern/löschen):{" "}
                  <strong>{sensibelAendern.join(", ")}</strong>
                </p>
              )}
              {knoepfe(
                "Speichern bestätigen",
                () => {
                  setModal(null);
                  _speichern(modal.mid);
                },
                true
              )}
            </>
          );
        })()}
    </div>
  );
}
