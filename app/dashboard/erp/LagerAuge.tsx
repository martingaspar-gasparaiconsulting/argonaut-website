"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · LAGER-AUGE (Übersichts-Auge fürs ERP/Lager)
// Lädt selbst die Artikel-Kennzahlen und übergibt sie ans KiAuge.
//
// EINBAU in app/dashboard/erp/page.tsx:
//   1) Import ergänzen:   import LagerAuge from "./LagerAuge";
//   2) Das alte <KiKlartext .../> (Zeile ~453) durch  <LagerAuge />  ersetzen.
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function artName(a: { bezeichnung?: string | null; artikelnummer?: string | null }): string {
  const b = (a.bezeichnung || "").trim();
  if (b) return b;
  if (a.artikelnummer) return `Nr. ${a.artikelnummer}`;
  return "Artikel";
}
function eur(n: number): string {
  return (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function LagerAuge() {
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
          .from("artikel")
          .select(
            "bezeichnung, artikelnummer, einheit, einkaufspreis, mindestbestand, aktueller_bestand, aktiv"
          )
          .eq("owner_user_id", uid);

        const artikel = (rows || []).filter(
          (a: { aktiv?: boolean }) => a.aktiv !== false
        );
        const gesamt = artikel.length;

        type Krit = { name: string; bestand: number; min: number; einheit: string };
        const leere: Krit[] = [];
        const kritisch: Krit[] = [];
        let lagerwert = 0;

        for (const a of artikel as Array<{
          bezeichnung?: string;
          artikelnummer?: string;
          einheit?: string;
          einkaufspreis?: number;
          mindestbestand?: number;
          aktueller_bestand?: number;
        }>) {
          const bestand = Number(a.aktueller_bestand) || 0;
          const min = Number(a.mindestbestand) || 0;
          const ek = Number(a.einkaufspreis) || 0;
          lagerwert += bestand * ek;

          const eintrag: Krit = {
            name: artName(a),
            bestand,
            min,
            einheit: a.einheit || "Stk",
          };
          if (bestand <= 0) {
            leere.push(eintrag);
          } else if (min > 0 && bestand <= min) {
            kritisch.push(eintrag);
          }
        }

        // Dringendste zuerst (am weitesten unter Mindestbestand)
        kritisch.sort((a, b) => a.bestand - a.min - (b.bestand - b.min));

        const zeilen: string[] = [];
        zeilen.push(`${gesamt} aktive Artikel. Lagerwert gesamt: ${eur(lagerwert)}.`);

        if (leere.length > 0) {
          const namen = leere.slice(0, 3).map((l) => l.name).join(", ");
          zeilen.push(`${leere.length} Artikel komplett leer (Bestand 0): ${namen}.`);
        }
        if (kritisch.length > 0) {
          const top = kritisch
            .slice(0, 3)
            .map((k) => `${k.name} (${k.bestand}/${k.min} ${k.einheit})`)
            .join("; ");
          zeilen.push(
            `${kritisch.length} Artikel unter Mindestbestand. Am dringendsten: ${top}.`
          );
        }
        if (leere.length === 0 && kritisch.length === 0) {
          zeilen.push(`Alle Bestände über dem Mindestbestand — kein Nachbestellbedarf.`);
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
      modul="ERP / Lager"
      kontext={kontext}
      aktionHref="/dashboard/erp"
      aktionText="Zum Lager-Cockpit"
    />
  );
}
