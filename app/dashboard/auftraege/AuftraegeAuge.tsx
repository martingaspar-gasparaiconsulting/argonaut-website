"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augeAuftraege, type AugeErgebnis } from "@/lib/auge";

// ---------------------------------------------------------------------
// ARGONAUT OS · AUFTRÄGE-AUGE (Übersichts-Auge fürs Auftrags-Cockpit)
//
// Lädt die Aufträge und übergibt die fertig berechnete Regel-Antwort aus
// lib/auge.ts (augeAuftraege) ans wiederverwendbare KiAuge — 0 €, kein
// KI-Aufruf. Drei Signale: überfällig (Lieferdatum überschritten),
// abgeschlossen-ohne-Rechnung, beauftragt-ohne-Liefertermin.
//
// Schema-treu zu app/dashboard/auftraege (Liste + Detailseite):
//   auftraege: status (entwurf/beauftragt/in_bearbeitung/abgeschlossen/
//   storniert), lieferdatum, brutto_summe, rechnung_id. RLS scopet je
//   Betrieb — genau wie die Cockpit-Seiten selbst (kein owner-Filter).
//
// EINBAU (bereits erledigt in page.tsx):
//   import AuftraegeAuge from "./AuftraegeAuge";
//   <AuftraegeAuge />
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Datum in YYYY-MM-DD (lokal)
function ymdHeute(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

function auftragLabel(a: { auftragsnummer?: string | null; titel?: string | null }): string {
  const nr = (a.auftragsnummer || "").trim();
  const ti = (a.titel || "").trim();
  if (nr && ti) return `${nr}: ${ti}`;
  if (nr) return nr;
  if (ti) return ti;
  return "Auftrag";
}

// Tage, die das Lieferdatum bereits zurückliegt (positiv = überfällig).
function tageUeber(lieferdatum: string, heute: string): number {
  const l = new Date(lieferdatum + "T00:00:00Z").getTime();
  const h = new Date(heute + "T00:00:00Z").getTime();
  return Math.round((h - l) / 86400000);
}

type Row = {
  auftragsnummer?: string | null;
  titel?: string | null;
  status?: string | null;
  lieferdatum?: string | null;
  brutto_summe?: number | null;
  rechnung_id?: string | null;
};

// Offene (noch laufende) Auftrags-Status.
const OFFEN = ["entwurf", "beauftragt", "in_bearbeitung"];
// Status, die einen zugesagten Liefertermin brauchen (Entwurf noch nicht).
const BRAUCHT_TERMIN = ["beauftragt", "in_bearbeitung"];

export default function AuftraegeAuge() {
  const [ergebnis, setErgebnis] = useState<AugeErgebnis | null>(null);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const heute = ymdHeute();
        const { data } = await supabase
          .from("auftraege")
          .select("auftragsnummer, titel, status, lieferdatum, brutto_summe, rechnung_id");
        const rows = (data || []) as Row[];

        const st = (r: Row) => (r.status || "").toLowerCase();
        const wertOf = (r: Row) => Number(r.brutto_summe) || 0;
        const liefer = (r: Row) => (r.lieferdatum || "").slice(0, 10);

        // Offene Aufträge
        const offene = rows.filter((r) => OFFEN.includes(st(r)));
        const offeneAnzahl = offene.length;
        const offenerWert = offene.reduce((s, r) => s + wertOf(r), 0);

        // Überfällig: offen und Lieferdatum liegt vor heute
        const ueberfaelligeRows = offene.filter((r) => {
          const l = liefer(r);
          return l !== "" && l < heute;
        });
        const ueberfaelligAnzahl = ueberfaelligeRows.length;
        const ueberfaelligWert = ueberfaelligeRows.reduce((s, r) => s + wertOf(r), 0);
        const topUeberfaellig = ueberfaelligeRows
          .map((r) => ({ label: auftragLabel(r), tageUeber: tageUeber(liefer(r), heute), wert: wertOf(r) }))
          .sort((a, b) => b.tageUeber - a.tageUeber)
          .slice(0, 3);

        // Abgeschlossen, aber noch keine Rechnung erzeugt
        const nichtAbgerechnetRows = rows.filter((r) => st(r) === "abgeschlossen" && !r.rechnung_id);
        const nichtAbgerechnetAnzahl = nichtAbgerechnetRows.length;
        const nichtAbgerechnetWert = nichtAbgerechnetRows.reduce((s, r) => s + wertOf(r), 0);

        // Beauftragt/in Bearbeitung, aber ohne Liefertermin
        const ohneTerminAnzahl = rows.filter(
          (r) => BRAUCHT_TERMIN.includes(st(r)) && liefer(r) === ""
        ).length;

        setErgebnis(
          augeAuftraege({
            offeneAnzahl,
            offenerWert,
            ueberfaelligAnzahl,
            ueberfaelligWert,
            topUeberfaellig,
            nichtAbgerechnetAnzahl,
            nichtAbgerechnetWert,
            ohneTerminAnzahl,
          })
        );
        setBereit(true);
      } catch {
        setBereit(true);
      }
    })();
  }, []);

  if (!bereit || !ergebnis) return null;

  return (
    <KiAuge
      modul="Aufträge"
      regel={ergebnis}
      aktionHref="/dashboard/auftraege"
      aktionText="Zu den Aufträgen"
    />
  );
}
