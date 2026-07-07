"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · CRM-AUGE (Übersichts-Auge fürs Vertrieb/CRM)
// Eigenständiger Baustein: lädt selbst die CRM-Kennzahlen aus "kontakte"
// und übergibt sie als Kontext ans wiederverwendbare KiAuge.
//
// EINBAU in app/dashboard/crm/page.tsx:
//   1) Oben bei den Imports EINE Zeile ergänzen:
//        import CrmAuge from "./CrmAuge";
//   2) Das ALTE <KiKlartext ... /> (Zeile ~894) auskommentieren/entfernen
//      und dort stattdessen EINE Zeile einsetzen:
//        <CrmAuge />
//
// Ersetzt das alte auto-ladende KiKlartext durch das neue Klick-Auge
// (spart Token: KI startet erst beim Aufklappen).
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Name eines Kontakts hübsch zusammenbauen
function kontaktName(k: {
  vorname?: string | null;
  nachname?: string | null;
  firma?: string | null;
}): string {
  const n = `${k.vorname || ""} ${k.nachname || ""}`.trim();
  if (n && k.firma) return `${n} (${k.firma})`;
  if (n) return n;
  if (k.firma) return k.firma;
  return "Kontakt";
}

export default function CrmAuge() {
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
          .from("kontakte")
          .select(
            "vorname, nachname, firma, status, letzter_kontakt_am, naechster_kontakt_am, betreuungs_intervall_tage"
          )
          .eq("owner_user_id", uid);

        const kontakte = rows || [];
        const jetzt = Date.now();
        const tag = 24 * 60 * 60 * 1000;

        const gesamt = kontakte.length;

        // Kunden vs. übrige (status enthält "kunde")
        const kunden = kontakte.filter((k: { status?: string }) =>
          (k.status || "").toLowerCase().includes("kunde")
        ).length;

        // Wiedervorlage fällig: naechster_kontakt_am liegt in Vergangenheit/heute
        type Faellig = { name: string; tageUeberfaellig: number };
        const faelligeListe: Faellig[] = [];
        for (const k of kontakte as Array<{
          vorname?: string;
          nachname?: string;
          firma?: string;
          naechster_kontakt_am?: string | null;
        }>) {
          if (!k.naechster_kontakt_am) continue;
          const t = new Date(k.naechster_kontakt_am).getTime();
          if (isNaN(t)) continue;
          if (t <= jetzt) {
            faelligeListe.push({
              name: kontaktName(k),
              tageUeberfaellig: Math.floor((jetzt - t) / tag),
            });
          }
        }
        faelligeListe.sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);
        const faelligAnzahl = faelligeListe.length;

        // Einschlafende: seit > 60 Tagen kein Kontakt (letzter_kontakt_am)
        let einschlafend = 0;
        for (const k of kontakte as Array<{ letzter_kontakt_am?: string | null }>) {
          if (!k.letzter_kontakt_am) continue;
          const t = new Date(k.letzter_kontakt_am).getTime();
          if (isNaN(t)) continue;
          if ((jetzt - t) / tag > 60) einschlafend++;
        }

        // Kontext-Text für die KI (nur echte Zahlen + die 3 dringendsten Namen)
        const zeilen: string[] = [];
        zeilen.push(`${gesamt} Kontakte insgesamt, davon ${kunden} Kunden.`);
        if (faelligAnzahl > 0) {
          const top = faelligeListe
            .slice(0, 3)
            .map((f) => `${f.name} (seit ${f.tageUeberfaellig} Tagen überfällig)`)
            .join("; ");
          zeilen.push(
            `${faelligAnzahl} Wiedervorlagen fällig. Am dringendsten: ${top}.`
          );
        } else {
          zeilen.push(`Keine überfälligen Wiedervorlagen.`);
        }
        if (einschlafend > 0) {
          zeilen.push(
            `${einschlafend} Kontakte einschlafend (über 60 Tage kein Kontakt).`
          );
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
      modul="Vertrieb / CRM"
      kontext={kontext}
      aktionHref="/dashboard/crm"
      aktionText="Zum CRM-Cockpit"
    />
  );
}
