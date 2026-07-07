"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · PERSONAL-AUGE (Pilot des Übersichts-Auges)
// Eigenständiger Baustein: lädt selbst die Personal-Kennzahlen und
// übergibt sie als Kontext ans wiederverwendbare KiAuge.
//
// EINBAU im Personal-Cockpit (app/dashboard/personal/page.tsx):
//   1) Oben bei den Imports EINE Zeile ergänzen:
//        import PersonalAuge from "./PersonalAuge";
//   2) Im sichtbaren Bereich (direkt nach der Personal-Überschrift)
//      EINE Zeile einfügen:
//        <PersonalAuge />
//
// So bleibt die große page.tsx praktisch unangetastet (rein additiv).
// Das Auge lädt seine Zahlen selbst — unabhängig vom restlichen Cockpit.
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Datum in YYYY-MM-DD (lokal)
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

export default function PersonalAuge() {
  const [kontext, setKontext] = useState<string>("");
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) {
          setBereit(true);
          return;
        }

        const heute = ymd(new Date());

        // Mitarbeiter (aktiv)
        const { data: ma } = await supabase
          .from("mitarbeiter")
          .select("id, aktiv")
          .eq("owner_user_id", uid);
        const mitarbeiterListe = ma || [];
        const anzahlAktiv = mitarbeiterListe.filter(
          (m: { aktiv?: boolean }) => m.aktiv !== false
        ).length;
        const anzahlGesamt = mitarbeiterListe.length;

        // Aktuelle Abwesenheiten (heute) — nur definitive.
        // select("*") statt fester Spalten: robust, falls Felder anders heißen.
        const { data: abw } = await supabase
          .from("hr_abwesenheiten")
          .select("*")
          .eq("owner_user_id", uid)
          .lte("von", heute)
          .gte("bis", heute);
        const abwHeute = (abw || []).filter(
          (a: { status?: string }) =>
            a.status === "genehmigt" || a.status === "erfasst"
        );
        const krankHeute = abwHeute.filter((a: { art?: string; typ?: string }) => {
          const wert = (a.art || a.typ || "").toString().toLowerCase();
          return wert.includes("krank");
        }).length;
        const abwesendGesamt = abwHeute.length;

        // Schulungen — abgelaufen / laufen bald ab (nächste 30 Tage)
        let schulungAbgelaufen = 0;
        let schulungBald = 0;
        try {
          const { data: schul } = await supabase
            .from("hr_schulungen")
            .select("gueltig_bis")
            .eq("owner_user_id", uid);
          const in30 = new Date();
          in30.setDate(in30.getDate() + 30);
          for (const s of schul || []) {
            const g = (s as { gueltig_bis?: string }).gueltig_bis;
            if (!g) continue;
            const d = new Date(g);
            if (isNaN(d.getTime())) continue;
            if (d < new Date()) schulungAbgelaufen++;
            else if (d <= in30) schulungBald++;
          }
        } catch {
          // Tabelle evtl. anders benannt — Schulungen dann einfach weglassen.
        }

        // Kontext-Text für die KI zusammenbauen (nur echte Zahlen).
        const zeilen: string[] = [];
        zeilen.push(
          `${anzahlGesamt} Mitarbeiter im System (${anzahlAktiv} aktiv).`
        );
        zeilen.push(
          abwesendGesamt > 0
            ? `Heute abwesend: ${abwesendGesamt} (davon ${krankHeute} krankgemeldet).`
            : `Heute sind alle anwesend.`
        );
        if (schulungAbgelaufen > 0 || schulungBald > 0) {
          zeilen.push(
            `Schulungen/Zertifikate: ${schulungAbgelaufen} abgelaufen, ${schulungBald} laufen in den nächsten 30 Tagen ab.`
          );
        }
        // Krank-Quote als Kontext (hilft der KI, Dringlichkeit einzuschätzen)
        if (anzahlAktiv > 0 && abwesendGesamt > 0) {
          const quote = Math.round((abwesendGesamt / anzahlAktiv) * 100);
          zeilen.push(`Abwesenheitsquote heute: ca. ${quote}%.`);
        }

        setKontext(zeilen.join("\n"));
        setBereit(true);
      } catch {
        setBereit(true);
      }
    })();
  }, []);

  // Solange noch nicht geladen: nichts anzeigen (kein Flackern).
  if (!bereit || !kontext) return null;

  return (
    <KiAuge
      modul="Personal"
      kontext={kontext}
      aktionHref="/dashboard/personal"
      aktionText="Zum Personal-Cockpit"
    />
  );
}
