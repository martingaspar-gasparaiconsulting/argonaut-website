"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";

// ---------------------------------------------------------------------
// ARGONAUT OS · MAHNWESEN-AUGE (Übersichts-Auge)
// Lädt offene/überfällige Rechnungen inkl. Mahnstufe und übergibt die
// Lage ans KiAuge → konkrete nächste Schritte (z.B. "Inkasso prüfen").
//
// EINBAU in app/dashboard/mahnwesen/page.tsx:
//   1) Import ergänzen:   import MahnwesenAuge from "./MahnwesenAuge";
//   2) Das alte <KiKlartext .../> (Zeile ~383) durch  <MahnwesenAuge />  ersetzen.
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

export default function MahnwesenAuge() {
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
            "rechnungsnummer, zahlungsstatus, faelligkeitsdatum, brutto_summe, bezahlter_betrag, bezahlt_am, mahnstufe, letzte_mahnung_am"
          )
          .eq("owner_user_id", uid);

        const rechnungen = rows || [];
        const heute = ymdHeute();

        const istBezahlt = (r: { zahlungsstatus?: string; bezahlt_am?: string | null }) =>
          !!r.bezahlt_am || (r.zahlungsstatus || "").toLowerCase().includes("bezahlt");

        // Nur offene Rechnungen mit Restbetrag
        type Off = {
          nr: string;
          offen: number;
          tageUeberfaellig: number;
          mahnstufe: number;
        };
        const offene: Off[] = [];
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
          const offen = (Number(r.brutto_summe) || 0) - (Number(r.bezahlter_betrag) || 0);
          if (offen <= 0) continue;
          let tage = 0;
          if (r.faelligkeitsdatum && r.faelligkeitsdatum < heute) {
            tage = Math.max(
              0,
              Math.floor(
                (new Date(heute).getTime() - new Date(r.faelligkeitsdatum).getTime()) /
                  (24 * 60 * 60 * 1000)
              )
            );
          }
          offene.push({
            nr: r.rechnungsnummer || "ohne Nr.",
            offen,
            tageUeberfaellig: tage,
            mahnstufe: Number(r.mahnstufe) || 0,
          });
        }

        // Nach Mahnstufe gruppieren
        const proStufe: Record<number, { anzahl: number; summe: number }> = {};
        let offeneMahnsumme = 0;
        for (const o of offene) {
          if (o.tageUeberfaellig <= 0 && o.mahnstufe === 0) continue; // noch im Ziel, nicht gemahnt
          offeneMahnsumme += o.offen;
          const s = o.mahnstufe;
          if (!proStufe[s]) proStufe[s] = { anzahl: 0, summe: 0 };
          proStufe[s].anzahl++;
          proStufe[s].summe += o.offen;
        }

        // Eskalations-Kandidaten (Mahnstufe 3 = reif für Inkasso/gerichtlich)
        const inkassoReif = offene
          .filter((o) => o.mahnstufe >= 3)
          .sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);

        // Kontext bauen
        const zeilen: string[] = [];
        const stufenTexte: string[] = [];
        for (const stufe of [0, 1, 2, 3]) {
          const d = proStufe[stufe];
          if (!d) continue;
          const label =
            stufe === 0 ? "überfällig, noch nicht gemahnt" : `Mahnstufe ${stufe}`;
          stufenTexte.push(`${d.anzahl}× ${label} (${eur(d.summe)})`);
        }
        if (stufenTexte.length === 0) {
          zeilen.push("Keine offenen Mahnfälle — alle Zahlungen im Ziel.");
        } else {
          zeilen.push(
            `Offene Mahnsumme gesamt: ${eur(offeneMahnsumme)}. Verteilung: ${stufenTexte.join(", ")}.`
          );
        }
        if (inkassoReif.length > 0) {
          const top = inkassoReif
            .slice(0, 3)
            .map((o) => `${o.nr} (${eur(o.offen)}, ${o.tageUeberfaellig} Tage)`)
            .join("; ");
          zeilen.push(
            `${inkassoReif.length} Fall/Fälle in Mahnstufe 3 — reif für Inkasso oder gerichtliches Mahnverfahren: ${top}.`
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
      modul="Mahnwesen"
      kontext={kontext}
      aktionHref="/dashboard/mahnwesen"
      aktionText="Zum Mahnwesen"
    />
  );
}
