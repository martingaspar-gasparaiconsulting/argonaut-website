"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · RECHNUNGEN-AUGE (Übersichts-Auge)
// Lädt selbst die Rechnungs-Kennzahlen und übergibt sie ans KiAuge.
//
// EINBAU in app/dashboard/rechnungen/page.tsx:
//   1) Import ergänzen:   import RechnungenAuge from "./RechnungenAuge";
//   2) Das alte <KiKlartext .../> (Zeile ~363) durch  <RechnungenAuge />  ersetzen.
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

export default function RechnungenAuge() {
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
          .from("rechnungen")
          .select(
            "rechnungsnummer, zahlungsstatus, faelligkeitsdatum, brutto_summe, bezahlter_betrag, bezahlt_am, mahnstufe"
          )
          .eq("owner_user_id", uid);

        const rechnungen = rows || [];
        const heute = ymdHeute();
        const gesamt = rechnungen.length;

        // "offen" = nicht als bezahlt markiert (kein bezahlt_am und Status nicht "bezahlt")
        const istBezahlt = (r: { zahlungsstatus?: string; bezahlt_am?: string | null }) =>
          !!r.bezahlt_am || (r.zahlungsstatus || "").toLowerCase().includes("bezahlt");

        type Offen = {
          nr: string;
          offen: number;
          faellig: string | null;
          tageUeberfaellig: number;
          mahnstufe: number;
        };
        const offeneListe: Offen[] = [];
        let offeneSumme = 0;

        for (const r of rechnungen as Array<{
          rechnungsnummer?: string;
          zahlungsstatus?: string;
          faelligkeitsdatum?: string | null;
          brutto_summe?: number;
          bezahlter_betrag?: number;
          bezahlt_am?: string | null;
          mahnstufe?: number;
        }>) {
          if (istBezahlt(r)) continue;
          const brutto = Number(r.brutto_summe) || 0;
          const bezahlt = Number(r.bezahlter_betrag) || 0;
          const offen = brutto - bezahlt;
          if (offen <= 0) continue;
          offeneSumme += offen;

          let tageUeberfaellig = 0;
          if (r.faelligkeitsdatum && r.faelligkeitsdatum < heute) {
            const diff =
              (new Date(heute).getTime() - new Date(r.faelligkeitsdatum).getTime()) /
              (24 * 60 * 60 * 1000);
            tageUeberfaellig = Math.max(0, Math.floor(diff));
          }
          offeneListe.push({
            nr: r.rechnungsnummer || "ohne Nr.",
            offen,
            faellig: r.faelligkeitsdatum || null,
            tageUeberfaellig,
            mahnstufe: Number(r.mahnstufe) || 0,
          });
        }

        const offeneAnzahl = offeneListe.length;
        const ueberfaellige = offeneListe.filter((o) => o.tageUeberfaellig > 0);
        ueberfaellige.sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);
        const ueberfaelligeSumme = ueberfaellige.reduce((s, o) => s + o.offen, 0);

        const zeilen: string[] = [];
        zeilen.push(
          `${gesamt} Rechnungen insgesamt. ${offeneAnzahl} offen mit ${eur(offeneSumme)} ausstehend.`
        );
        if (ueberfaellige.length > 0) {
          const top = ueberfaellige
            .slice(0, 3)
            .map(
              (o) =>
                `${o.nr} (${eur(o.offen)}, ${o.tageUeberfaellig} Tage überfällig${
                  o.mahnstufe > 0 ? `, Mahnstufe ${o.mahnstufe}` : ""
                })`
            )
            .join("; ");
          zeilen.push(
            `${ueberfaellige.length} davon überfällig (${eur(ueberfaelligeSumme)}). Am längsten: ${top}.`
          );
        } else if (offeneAnzahl > 0) {
          zeilen.push(`Keine überfälligen Rechnungen — alles im Zahlungsziel.`);
        } else {
          zeilen.push(`Alle Rechnungen bezahlt.`);
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
      modul="Rechnungen"
      kontext={kontext}
      aktionHref="/dashboard/rechnungen"
      aktionText="Zu den Rechnungen"
    />
  );
}
