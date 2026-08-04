"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augePersonal, type AugeErgebnis } from "@/lib/auge";

// ---------------------------------------------------------------------
// ARGONAUT OS · PERSONAL-AUGE (Übersichts-Auge fürs Personal-Cockpit)
//
// Lädt selbst die Personal-Kennzahlen (Team, heutige Abwesenheiten,
// ablaufende Zertifikate, offene Bewerbungen) und übergibt die fertig
// berechnete Regel-Antwort aus lib/auge.ts (augePersonal) ans
// wiederverwendbare KiAuge — 0 €, kein KI-Aufruf.
//
// Schema-treu zu app/dashboard/personal/page.tsx: mitarbeiter.status
// (aktiv/inaktiv/beurlaubt), hr_abwesenheiten (typ/von/bis/status),
// hr_schulungen (gueltig_bis), bewerber (status). Alle Abfragen ohne
// owner-Filter — die Row-Level-Security scopet je Betrieb, genau wie
// die Cockpit-Seite selbst.
//
// EINBAU (bereits erledigt in page.tsx):
//   import PersonalAuge from "./PersonalAuge";
//   <PersonalAuge />  (direkt unter der Personal-Überschrift)
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

type MaRow = { status?: string | null };
type AbwRow = { typ?: string | null; von?: string | null; bis?: string | null; status?: string | null };
type SchulRow = { gueltig_bis?: string | null };
type BewRow = { status?: string | null };

export default function PersonalAuge() {
  const [ergebnis, setErgebnis] = useState<AugeErgebnis | null>(null);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const heute = ymd(new Date());

        // Mitarbeiter — Feld ist `status` (aktiv/inaktiv/beurlaubt), RLS-scoped.
        const { data: ma } = await supabase.from("mitarbeiter").select("id,status");
        const maListe = (ma || []) as MaRow[];
        const mitarbeiterGesamt = maListe.length;
        const mitarbeiterAktiv = maListe.filter((m) => (m.status || "") === "aktiv").length;

        // Heutige Abwesenheiten: Zeitraum überlappt heute, nicht abgelehnt/storniert.
        const { data: abw } = await supabase
          .from("hr_abwesenheiten")
          .select("typ,von,bis,status");
        const abwHeute = ((abw || []) as AbwRow[]).filter((a) => {
          const von = (a.von || "").slice(0, 10);
          const bis = (a.bis || "").slice(0, 10);
          const st = (a.status || "").toLowerCase();
          return von && bis && von <= heute && bis >= heute && st !== "abgelehnt" && st !== "storniert";
        });
        const abwesendHeute = abwHeute.length;
        const krankHeute = abwHeute.filter(
          (a) => (a.typ || "").toLowerCase().includes("krank")
        ).length;

        // Schulungen/Zertifikate — abgelaufen / in den nächsten 30 Tagen fällig.
        const { data: schul } = await supabase.from("hr_schulungen").select("gueltig_bis");
        const in30 = ymd(new Date(Date.now() + 30 * 86400000));
        let schulungAbgelaufen = 0;
        let schulungBald = 0;
        for (const s of (schul || []) as SchulRow[]) {
          const g = (s.gueltig_bis || "").slice(0, 10);
          if (!g) continue;
          if (g < heute) schulungAbgelaufen++;
          else if (g <= in30) schulungBald++;
        }

        // Offene Bewerbungen (warten auf Rückmeldung).
        const { data: bew } = await supabase.from("bewerber").select("status");
        const offeneBewerber = ((bew || []) as BewRow[]).filter((b) => {
          const st = (b.status || "").toLowerCase();
          return st === "neu" || st === "in_pruefung" || st === "eingeladen";
        }).length;

        setErgebnis(
          augePersonal({
            mitarbeiterGesamt,
            mitarbeiterAktiv,
            abwesendHeute,
            krankHeute,
            schulungAbgelaufen,
            schulungBald,
            offeneBewerber,
          })
        );
        setBereit(true);
      } catch {
        setBereit(true);
      }
    })();
  }, []);

  // Solange noch nicht geladen: nichts anzeigen (kein Flackern).
  if (!bereit || !ergebnis) return null;

  return (
    <KiAuge
      modul="Personal"
      regel={ergebnis}
      aktionHref="/dashboard/personal"
      aktionText="Zum Personal-Cockpit"
    />
  );
}
