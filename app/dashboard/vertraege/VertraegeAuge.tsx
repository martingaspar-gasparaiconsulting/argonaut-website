"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · VERTRÄGE-AUGE (Übersichts-Auge)
// Lädt Verträge, findet auslaufende und Kündigungsfristen (inkl. Auto-
// Verlängerung) und übergibt die Lage ans KiAuge.
//
// EINBAU in app/dashboard/vertraege/page.tsx:
//   1) Import ergänzen:   import VertraegeAuge from "./VertraegeAuge";
//   2) Im sichtbaren Bereich (z.B. nach den KPI-Kacheln) einfügen:
//        <VertraegeAuge />
//   (Hier gibt es noch KEIN altes KiKlartext — also nur einfügen, nichts ersetzen.)
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function tageBis(datum: string): number {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
}
function vName(v: { bezeichnung?: string | null; vertragspartner?: string | null }): string {
  const b = (v.bezeichnung || "").trim();
  const p = (v.vertragspartner || "").trim();
  if (b && p) return `${b} (${p})`;
  if (b) return b;
  if (p) return p;
  return "Vertrag";
}

export default function VertraegeAuge() {
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
          .from("vertraege")
          .select(
            "bezeichnung, vertragspartner, ende, kuendigungsfrist_tage, auto_verlaengerung, status, kosten_betrag"
          )
          .eq("owner_user_id", uid);

        const vertraege = (rows || []).filter(
          (v: { status?: string }) =>
            !(v.status || "").toLowerCase().includes("gekündigt") &&
            !(v.status || "").toLowerCase().includes("beendet")
        );
        const gesamt = vertraege.length;

        type Frist = {
          name: string;
          tageBisKuendigung: number;
          tageBisEnde: number;
          autoVerl: boolean;
        };
        const kuendigungBald: Frist[] = [];
        const laeuftAus: Frist[] = [];

        for (const v of vertraege as Array<{
          bezeichnung?: string;
          vertragspartner?: string;
          ende?: string | null;
          kuendigungsfrist_tage?: number;
          auto_verlaengerung?: boolean;
          kosten_betrag?: number;
        }>) {
          if (!v.ende) continue;
          const bisEnde = tageBis(v.ende);
          if (bisEnde < 0) continue; // schon vorbei

          const frist = Number(v.kuendigungsfrist_tage) || 0;
          const bisKuendigung = bisEnde - frist; // letzter Kündigungstag ab heute
          const eintrag: Frist = {
            name: vName(v),
            tageBisKuendigung: bisKuendigung,
            tageBisEnde: bisEnde,
            autoVerl: !!v.auto_verlaengerung,
          };

          // Kündigungsfrist läuft in den nächsten 45 Tagen ab (oder ist knapp)
          if (bisKuendigung >= 0 && bisKuendigung <= 45) {
            kuendigungBald.push(eintrag);
          }
          // Vertrag läuft in den nächsten 60 Tagen aus
          if (bisEnde <= 60) {
            laeuftAus.push(eintrag);
          }
        }

        kuendigungBald.sort((a, b) => a.tageBisKuendigung - b.tageBisKuendigung);
        laeuftAus.sort((a, b) => a.tageBisEnde - b.tageBisEnde);

        const zeilen: string[] = [];
        zeilen.push(`${gesamt} aktive Verträge.`);

        if (kuendigungBald.length > 0) {
          const top = kuendigungBald
            .slice(0, 3)
            .map(
              (k) =>
                `${k.name}: Kündigung noch ${k.tageBisKuendigung} Tage möglich${
                  k.autoVerl ? " (verlängert sich sonst automatisch!)" : ""
                }`
            )
            .join("; ");
          zeilen.push(
            `${kuendigungBald.length} Vertrag/Verträge mit bald ablaufender Kündigungsfrist: ${top}.`
          );
        }
        if (laeuftAus.length > 0) {
          const top = laeuftAus
            .slice(0, 3)
            .map((l) => `${l.name} (in ${l.tageBisEnde} Tagen)`)
            .join("; ");
          zeilen.push(`${laeuftAus.length} Vertrag/Verträge laufen bald aus: ${top}.`);
        }
        if (kuendigungBald.length === 0 && laeuftAus.length === 0) {
          zeilen.push(`Keine dringenden Fristen — alle Verträge laufen ruhig.`);
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
      modul="Verträge & Fristen"
      kontext={kontext}
      aktionHref="/dashboard/vertraege"
      aktionText="Zu den Verträgen"
    />
  );
}
