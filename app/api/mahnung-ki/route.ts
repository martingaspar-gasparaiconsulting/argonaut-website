// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 6 (Rechnung) · Block C-4 — KI-Mahnschreiben-Assistent
// Formuliert aus den echten Rechnungsdaten einen Mahntext-ENTWURF (kein Versand).
// Ton passt sich an die Mahnstufe an (Erinnerung -> 1. Mahnung -> 2. Mahnung).
// Gleiche Anthropic-Anbindung wie der Brief-Assistent (Block 12 · K4).
// ---------------------------------------------------------------------

export const runtime = "nodejs";

type MahnInput = {
  stufe?: number; // 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung
  rechnungsnummer?: string;
  betrag?: string | number; // offener Betrag
  waehrung?: string;
  faelligkeitsdatum?: string;
  tage_ueberfaellig?: number;
  empfaenger_name?: string;
  absender_name?: string;
};

const STUFE_HINWEIS: Record<number, string> = {
  1: "eine erste, freundliche Zahlungserinnerung. Höflich und verständnisvoll – gehe davon aus, dass die Rechnung schlicht übersehen wurde. Bitte freundlich um Ausgleich.",
  2: "eine erste Mahnung. Freundlich, aber bestimmt. Weise sachlich darauf hin, dass die Zahlungsfrist bereits überschritten ist, und setze eine neue, konkrete Zahlungsfrist (z. B. 7 Tage).",
  3: "eine zweite und letzte Mahnung. Deutlich und bestimmt, aber weiterhin sachlich und korrekt. Setze eine letzte kurze Frist und weise darauf hin, dass andernfalls weitere Schritte (z. B. ein gerichtliches Mahnverfahren) eingeleitet werden können – ohne zu drohen.",
};

export async function POST(req: Request) {
  let m: MahnInput = {};
  try {
    const body = await req.json();
    m = (body?.mahnung ?? {}) as MahnInput;
  } catch {
    return Response.json({ text: "", fehler: "Ungültige Anfrage." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({
      text: "",
      fehler: "KI derzeit nicht verfügbar (kein API-Key konfiguriert).",
    });
  }

  const stufe = Number(m.stufe) === 3 ? 3 : Number(m.stufe) === 2 ? 2 : 1;
  const stufeHinweis = STUFE_HINWEIS[stufe];
  const waehrung = m.waehrung || "EUR";

  let betragText = "[offener Betrag]";
  if (m.betrag != null && String(m.betrag).trim() !== "") {
    const n = Number(String(m.betrag).replace(",", "."));
    if (!isNaN(n)) {
      try {
        betragText = new Intl.NumberFormat("de-DE", { style: "currency", currency: waehrung }).format(n);
      } catch {
        betragText = `${n.toFixed(2)} ${waehrung}`;
      }
    }
  }

  let faelligText = m.faelligkeitsdatum ? "" : "[Fälligkeitsdatum]";
  if (m.faelligkeitsdatum) {
    try {
      faelligText = new Date(m.faelligkeitsdatum).toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
    } catch {
      faelligText = String(m.faelligkeitsdatum);
    }
  }

  const verzugText =
    typeof m.tage_ueberfaellig === "number" && m.tage_ueberfaellig > 0
      ? `${m.tage_ueberfaellig} Tage`
      : "[Anzahl] Tage";

  const prompt = `Du bist ARGONAUT, der Schreibassistent eines mittelständischen Unternehmens. Formuliere auf Deutsch den FLIESSTEXT eines Mahnschreibens. Es soll ${stufeHinweis}

Echte Vorgangsdaten (bitte genau so verwenden, NICHTS erfinden):
- Rechnungsnummer: ${m.rechnungsnummer || "[Rechnungsnummer]"}
- Offener Betrag: ${betragText}
- Fällig war die Zahlung am: ${faelligText}
- Bereits überfällig seit: ${verzugText}
- Empfänger: ${m.empfaenger_name || "der Empfänger"}
- Absender (Unternehmen): ${m.absender_name || "[Unternehmen]"}

Anforderungen:
- Beginne mit einer passenden Anrede (nutze den Empfängernamen, falls sinnvoll, sonst "Sehr geehrte Damen und Herren,").
- Nimm konkret Bezug auf die oben genannte Rechnungsnummer, den offenen Betrag und das Fälligkeitsdatum.
- Formuliere einen vollständigen, gut lesbaren Fließtext in ganzen Sätzen und sinnvollen Absätzen, im Ton passend zur Mahnstufe.
- Wo Angaben fehlen (z. B. eine Kontoverbindung), nutze KEINE erfundenen Werte – lasse solche Details weg (die Zahlungsangaben ergänzt das System automatisch unter dem Brief).
- Schließe mit "Mit freundlichen Grüßen" und in der nächsten Zeile dem Absendernamen (${m.absender_name || "[Unternehmen]"}).
- WICHTIG: Nenne dich im Text niemals "Claude" oder "KI" – das Schreiben kommt vom Unternehmen selbst.
- Gib NUR den Brief-Fließtext aus (KEINE Betreffzeile, KEINE Absender-/Empfängeradresse, KEINE Erklärungen davor oder danach).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({
        text: "",
        fehler: "Die KI konnte das Mahnschreiben nicht formulieren. Bitte erneut versuchen.",
      });
    }

    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    if (!text.trim()) {
      return Response.json({
        text: "",
        fehler: "Leere Antwort erhalten. Bitte erneut versuchen.",
      });
    }
    return Response.json({ text: text.trim() });
  } catch {
    return Response.json({
      text: "",
      fehler: "Verbindungsfehler zur KI. Bitte erneut versuchen.",
    });
  }
}
