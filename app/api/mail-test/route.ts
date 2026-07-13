// ============================================================================
// ARGONAUT OS · /api/mail-test — TEMPORAERE Test-Route fuer den Mail-Versand.
//
// Zweck: einmalig pruefen, dass sendeMail() ueber Resend echt zustellt.
// NACH dem erfolgreichen Test WIEDER LOESCHEN (Housekeeping).
//
// Schutz: erfordert ?geheim=<MAIL_TEST_GEHEIM>. Ohne korrektes Geheimnis 401.
// So kann niemand ueber diese Route ungefragt Mails ueber deine Domain schicken.
//
// Aufruf-Beispiel:
//   /api/mail-test?geheim=DEIN_GEHEIMNIS&an=deine@adresse.de
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sendeMail, mailLayout } from "../../../lib/mail";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const geheim = searchParams.get("geheim");
  const an = searchParams.get("an");

  // --- Schutz -------------------------------------------------------------
  const erwartet = process.env.MAIL_TEST_GEHEIM;
  if (!erwartet) {
    return NextResponse.json(
      { ok: false, fehler: "MAIL_TEST_GEHEIM ist nicht gesetzt (Env-Variable fehlt)." },
      { status: 500 }
    );
  }
  if (geheim !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "Zugriff verweigert." }, { status: 401 });
  }

  // --- Empfaenger ---------------------------------------------------------
  if (!an) {
    return NextResponse.json(
      { ok: false, fehler: "Bitte ?an=<empfaenger@adresse> angeben." },
      { status: 400 }
    );
  }

  // --- Testmail senden ----------------------------------------------------
  const html = mailLayout(
    "Test-E-Mail",
    `<p>Hallo!</p>
     <p>Diese E-Mail wurde von ARGONAUT OS ueber <strong>Resend</strong> versendet.
     Wenn du sie liest, funktioniert der Versand einwandfrei.</p>
     <p>Absender: <strong>noreply@argonaut-os.com</strong><br>
     Antworten landen bei: <strong>info@argonaut-os.com</strong></p>
     <p style="margin-top:20px;color:#4CAF7D;font-weight:700;">✓ Mail-Versand ist scharf.</p>`
  );

  const ergebnis = await sendeMail({
    an,
    betreff: "ARGONAUT OS · Versand-Test ✓",
    html,
    text:
      "Diese E-Mail wurde von ARGONAUT OS ueber Resend versendet. Wenn du sie liest, funktioniert der Versand.",
  });

  if (!ergebnis.ok) {
    return NextResponse.json({ ok: false, fehler: ergebnis.fehler }, { status: 502 });
  }
  return NextResponse.json({ ok: true, nachricht_id: ergebnis.id, gesendet_an: an });
}
