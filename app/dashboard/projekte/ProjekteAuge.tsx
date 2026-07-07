"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · PROJEKTE-AUGE (Übersichts-Auge)
// Lädt Projekte + Aufgaben, findet überfällige Projekte und offene
// Aufgaben und übergibt die Lage ans KiAuge.
//
// EINBAU in app/dashboard/projekte/page.tsx:
//   1) Import ergänzen:   import ProjekteAuge from "./ProjekteAuge";
//   2) Im sichtbaren Bereich (nach Modul-Kopf / KPIs) einfügen:  <ProjekteAuge />
//   (Kein altes KiKlartext vorhanden — nur einfügen, nichts ersetzen.)
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function tageUeberfaellig(datum: string): number {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  return Math.round((heute.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}
function istAbgeschlossen(status?: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("abgeschlossen") || s.includes("fertig") || s.includes("erledigt");
}

export default function ProjekteAuge() {
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

        const [projRes, aufgRes] = await Promise.all([
          supabase
            .from("projekte")
            .select("name, status, prioritaet, end_datum, verantwortlich, archiviert")
            .eq("owner_user_id", uid),
          supabase
            .from("aufgaben")
            .select("id, projekt_id, erledigt, status")
            .eq("owner_user_id", uid),
        ]);

        const projekte = (projRes.data || []).filter(
          (p: { archiviert?: boolean }) => p.archiviert !== true
        );
        const aufgaben = aufgRes.data || [];

        const aktiv = projekte.filter(
          (p: { status?: string }) => !istAbgeschlossen(p.status)
        );
        const gesamtAktiv = aktiv.length;

        // Überfällige Projekte (end_datum in Vergangenheit, nicht abgeschlossen)
        type Ueber = { name: string; tage: number; prio: string };
        const ueberfaellig: Ueber[] = [];
        for (const p of aktiv as Array<{
          name?: string;
          end_datum?: string | null;
          prioritaet?: string;
        }>) {
          if (!p.end_datum) continue;
          const tage = tageUeberfaellig(p.end_datum);
          if (tage > 0) {
            ueberfaellig.push({
              name: p.name || "Projekt",
              tage,
              prio: (p.prioritaet || "").toLowerCase(),
            });
          }
        }
        // Hohe Priorität zuerst, dann am längsten überfällig
        ueberfaellig.sort((a, b) => {
          const pa = a.prio.includes("hoch") ? 1 : 0;
          const pb = b.prio.includes("hoch") ? 1 : 0;
          if (pa !== pb) return pb - pa;
          return b.tage - a.tage;
        });

        // Offene Aufgaben (nicht erledigt)
        const offeneAufgaben = aufgaben.filter(
          (a: { erledigt?: boolean; status?: string }) =>
            a.erledigt !== true && !istAbgeschlossen(a.status)
        ).length;

        const zeilen: string[] = [];
        zeilen.push(
          `${gesamtAktiv} aktive Projekte, ${offeneAufgaben} offene Aufgaben insgesamt.`
        );
        if (ueberfaellig.length > 0) {
          const top = ueberfaellig
            .slice(0, 3)
            .map(
              (u) =>
                `${u.name} (${u.tage} Tage überfällig${
                  u.prio.includes("hoch") ? ", Priorität HOCH" : ""
                })`
            )
            .join("; ");
          zeilen.push(
            `${ueberfaellig.length} Projekt/Projekte überfällig. Am dringendsten: ${top}.`
          );
        } else if (gesamtAktiv > 0) {
          zeilen.push(`Kein Projekt überfällig — alle Termine im Rahmen.`);
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
      modul="Projekte"
      kontext={kontext}
      aktionHref="/dashboard/projekte"
      aktionText="Zu den Projekten"
    />
  );
}
