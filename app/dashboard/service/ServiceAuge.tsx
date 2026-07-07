"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · SERVICE-AUGE (Übersichts-Auge fürs Ticketing)
// Lädt Tickets, findet offene/überfällige/lange unbeantwortete und
// übergibt die Lage ans KiAuge.
//
// EINBAU in app/dashboard/service/page.tsx:
//   1) Import ergänzen:   import ServiceAuge from "./ServiceAuge";
//   2) Im sichtbaren Bereich (nach Modul-Kopf / KPIs) einfügen:  <ServiceAuge />
//   (Kein altes KiKlartext vorhanden — nur einfügen.)
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function tageSeit(iso: string): number {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}
function istGeloest(status?: string, geloest_am?: string | null): boolean {
  if (geloest_am) return true;
  const s = (status || "").toLowerCase();
  return s.includes("gelöst") || s.includes("geschlossen") || s.includes("erledigt") || s.includes("closed");
}
function ticketLabel(t: { ticket_nummer?: string | null; betreff?: string | null; kunde_name?: string | null }): string {
  const nr = (t.ticket_nummer || "").trim();
  const b = (t.betreff || "").trim();
  const k = (t.kunde_name || "").trim();
  let s = nr ? nr : "Ticket";
  if (b) s += `: ${b}`;
  if (k) s += ` (${k})`;
  return s;
}

export default function ServiceAuge() {
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
          .from("tickets")
          .select(
            "ticket_nummer, betreff, kunde_name, status, prioritaet, created_at, faellig_am, geloest_am"
          )
          .eq("owner_user_id", uid);

        const tickets = rows || [];

        // Offene Tickets
        const offene = tickets.filter(
          (t: { status?: string; geloest_am?: string | null }) =>
            !istGeloest(t.status, t.geloest_am)
        );
        const offeneAnzahl = offene.length;

        type Off = {
          label: string;
          tageOffen: number;
          ueberfaellig: boolean;
          hochPrio: boolean;
        };
        const liste: Off[] = [];
        const jetzt = Date.now();
        for (const t of offene as Array<{
          ticket_nummer?: string;
          betreff?: string;
          kunde_name?: string;
          prioritaet?: string;
          created_at?: string;
          faellig_am?: string | null;
        }>) {
          const tageOffen = t.created_at ? tageSeit(t.created_at) : 0;
          const ueberfaellig =
            !!t.faellig_am && new Date(t.faellig_am).getTime() < jetzt;
          const hochPrio = (t.prioritaet || "").toLowerCase().includes("hoch") ||
            (t.prioritaet || "").toLowerCase().includes("dringend");
          liste.push({
            label: ticketLabel(t),
            tageOffen,
            ueberfaellig,
            hochPrio,
          });
        }

        const ueberfaellige = liste.filter((o) => o.ueberfaellig);
        const hochPrioOffen = liste.filter((o) => o.hochPrio);

        // Dringlichkeit: überfällig + hohe Prio zuerst, dann am längsten offen
        liste.sort((a, b) => {
          const sa = (a.ueberfaellig ? 2 : 0) + (a.hochPrio ? 1 : 0);
          const sb = (b.ueberfaellig ? 2 : 0) + (b.hochPrio ? 1 : 0);
          if (sa !== sb) return sb - sa;
          return b.tageOffen - a.tageOffen;
        });

        const zeilen: string[] = [];
        zeilen.push(`${offeneAnzahl} offene Tickets von ${tickets.length} insgesamt.`);
        if (ueberfaellige.length > 0) {
          zeilen.push(`${ueberfaellige.length} davon überfällig (Fälligkeit überschritten).`);
        }
        if (hochPrioOffen.length > 0) {
          zeilen.push(`${hochPrioOffen.length} mit hoher Priorität offen.`);
        }
        if (offeneAnzahl > 0) {
          const top = liste
            .slice(0, 3)
            .map(
              (o) =>
                `${o.label} — seit ${o.tageOffen} Tagen offen${
                  o.ueberfaellig ? ", ÜBERFÄLLIG" : ""
                }${o.hochPrio ? ", Priorität hoch" : ""}`
            )
            .join("; ");
          zeilen.push(`Am dringendsten: ${top}.`);
        } else {
          zeilen.push(`Alle Tickets gelöst — kein offener Servicefall.`);
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
      modul="Kundenservice / Tickets"
      kontext={kontext}
      aktionHref="/dashboard/service"
      aktionText="Zum Kundenservice"
    />
  );
}
