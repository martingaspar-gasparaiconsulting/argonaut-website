"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · AUFTRÄGE-AUGE (Übersichts-Auge)
// Lädt Aufträge, findet offene/überfällige und noch nicht abgerechnete
// und übergibt die Lage ans KiAuge.
//
// EINBAU in app/dashboard/auftraege/page.tsx:
//   1) Import ergänzen:   import AuftraegeAuge from "./AuftraegeAuge";
//   2) Im sichtbaren Bereich (nach Modul-Kopf / KPIs) einfügen:  <AuftraegeAuge />
//   (Kein altes KiKlartext vorhanden — nur einfügen.)
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function ymdHeute(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
function istAbgeschlossen(status?: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("abgeschlossen") || s.includes("abgerechnet") ||
    s.includes("erledigt") || s.includes("storniert") || s.includes("abgebrochen");
}
function auftragLabel(a: { auftragsnummer?: string | null; titel?: string | null }): string {
  const nr = (a.auftragsnummer || "").trim();
  const ti = (a.titel || "").trim();
  if (nr && ti) return `${nr}: ${ti}`;
  if (nr) return nr;
  if (ti) return ti;
  return "Auftrag";
}

export default function AuftraegeAuge() {
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

        const { data: rows } = await supabase
          .from("auftraege")
          .select(
            "auftragsnummer, titel, status, lieferdatum, brutto_summe, rechnung_id"
          );

        const auftraege = rows || [];
        const heute = ymdHeute();

        // Offene (nicht abgeschlossene) Aufträge
        const offene = auftraege.filter(
          (a: { status?: string }) => !istAbgeschlossen(a.status)
        );
        const offeneAnzahl = offene.length;
        let offenerWert = 0;

        type Auf = {
          label: string;
          wert: number;
          tageBisLieferung: number | null;
          ueberfaellig: boolean;
        };
        const liste: Auf[] = [];
        // Aufträge, die erledigt/lieferbereit wirken aber KEINE Rechnung haben
        type Abr = { label: string; wert: number };
        const nichtAbgerechnet: Abr[] = [];

        for (const a of offene as Array<{
          auftragsnummer?: string;
          titel?: string;
          lieferdatum?: string | null;
          brutto_summe?: number;
          rechnung_id?: string | null;
        }>) {
          const wert = Number(a.brutto_summe) || 0;
          offenerWert += wert;

          let tageBis: number | null = null;
          let ueberfaellig = false;
          if (a.lieferdatum) {
            const diff =
              (new Date(a.lieferdatum).getTime() - new Date(heute).getTime()) /
              (24 * 60 * 60 * 1000);
            tageBis = Math.round(diff);
            if (tageBis < 0) ueberfaellig = true;
          }
          liste.push({ label: auftragLabel(a), wert, tageBisLieferung: tageBis, ueberfaellig });
        }

        // Nicht abgerechnete: Aufträge OHNE rechnung_id, deren Lieferdatum erreicht ist
        for (const a of auftraege as Array<{
          auftragsnummer?: string;
          titel?: string;
          status?: string;
          lieferdatum?: string | null;
          brutto_summe?: number;
          rechnung_id?: string | null;
        }>) {
          if (a.rechnung_id) continue; // schon abgerechnet
          if ((a.status || "").toLowerCase().includes("storniert")) continue;
          if ((a.status || "").toLowerCase().includes("abgebrochen")) continue;
          const lieferErreicht = a.lieferdatum ? a.lieferdatum <= heute : false;
          if (lieferErreicht) {
            nichtAbgerechnet.push({
              label: auftragLabel(a),
              wert: Number(a.brutto_summe) || 0,
            });
          }
        }

        const ueberfaellige = liste.filter((o) => o.ueberfaellig);
        ueberfaellige.sort((a, b) => (a.tageBisLieferung ?? 0) - (b.tageBisLieferung ?? 0));

        const zeilen: string[] = [];
        zeilen.push(
          `${offeneAnzahl} offene Aufträge im Wert von ${eur(offenerWert)}.`
        );
        if (ueberfaellige.length > 0) {
          const top = ueberfaellige
            .slice(0, 3)
            .map(
              (o) =>
                `${o.label} (${eur(o.wert)}, Lieferung ${Math.abs(
                  o.tageBisLieferung ?? 0
                )} Tage überfällig)`
            )
            .join("; ");
          zeilen.push(
            `${ueberfaellige.length} mit überschrittenem Lieferdatum: ${top}.`
          );
        }
        if (nichtAbgerechnet.length > 0) {
          const summe = nichtAbgerechnet.reduce((s, x) => s + x.wert, 0);
          const top = nichtAbgerechnet
            .slice(0, 3)
            .map((x) => `${x.label} (${eur(x.wert)})`)
            .join("; ");
          zeilen.push(
            `${nichtAbgerechnet.length} gelieferte Aufträge noch NICHT abgerechnet (${eur(summe)} offen): ${top}.`
          );
        }
        if (ueberfaellige.length === 0 && nichtAbgerechnet.length === 0 && offeneAnzahl > 0) {
          zeilen.push(`Alle Aufträge im Zeitplan und keine offene Abrechnung.`);
        }
        if (offeneAnzahl === 0 && nichtAbgerechnet.length === 0) {
          zeilen.push(`Aktuell keine offenen Aufträge.`);
        }

        setKontext(zeilen.join("\n"));
        setBereit(true);
      } catch {
        setBereit(true);
      }
    })();
  }, []);

  if (!bereit || !kontext) return null;

  return (
    <KiAuge
      modul="Aufträge"
      kontext={kontext}
      aktionHref="/dashboard/auftraege"
      aktionText="Zu den Aufträgen"
    />
  );
}
