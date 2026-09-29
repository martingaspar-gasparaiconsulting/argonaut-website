import { createAdminClient } from '@/lib/supabase-admin';
import { absenderBranding } from '@/lib/mail';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import { abmeldeParameterLesen } from '@/lib/werbeAbmeldeLink';
import { widerspruchEintragen } from '@/lib/werbeErlaubnisServer';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/werbung-abmelden   (Paket 173, 29.09.2026)
//
// DER Abmeldelink für jede Werbe-Mail, die keinen eigenen Kanal-Link hat
// (Bewertungsbitte, Lead- und Termin-Nachfass, Abläufe, Automationen,
// Webinar-Nachbereitung). Ohne Login, ohne Formular: ein Klick genügt.
//
// Der Widerspruch gilt für die Werbung des Betriebs INSGESAMT — Sperrliste,
// Kontakt, Newsletter, Serien, Rückholung (lib/werbeErlaubnisServer).
//
// GET  = Klick aus der Mail (auch Link-Scanner lösen ihn aus — die sichere
//        Richtung: lieber versehentlich weniger Post als eine Abmahnung).
// POST = Abmeldeknopf oben in Gmail/Outlook (RFC 8058, List-Unsubscribe-Post).
// Nur mit gültiger Unterschrift (lib/werbeAbmeldeLink) — sonst könnte jeder
// fremde Adressen bei fremden Betrieben abmelden.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seite(firma: string, akzent: string, titel: string, text: string): Response {
  const a = sichereFarbe(akzent);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(titel)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;color:#1a2332;">
  <div style="max-width:520px;margin:0 auto;padding:56px 24px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 28px;text-align:center;">
      <div style="font-size:20px;font-weight:800;color:${a};">${escapeHtml(firma)}</div>
      <div style="height:3px;width:56px;background:${a};margin:14px auto 24px;border-radius:2px;"></div>
      <h1 style="font-size:22px;margin:0 0 12px;font-weight:700;">${escapeHtml(titel)}</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0;">${escapeHtml(text)}</p>
    </div>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function eintragen(p: URLSearchParams): Promise<{ ok: boolean; betrieb?: string }> {
  const daten = abmeldeParameterLesen(p);
  if (!daten) return { ok: false };
  const db = createAdminClient();
  const ok = await widerspruchEintragen(db, daten.betrieb, daten.email, 'abmeldelink');
  return { ok, betrieb: daten.betrieb };
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  try {
    const r = await eintragen(p);
    if (!r.betrieb) {
      return seite('Abmeldung', '#1a2332', 'Link nicht lesbar',
        'Dieser Abmelde-Link ist unvollständig. Bitte antworten Sie einfach auf die E-Mail — der Widerspruch wird dann von Hand eingetragen.');
    }
    const marke = await absenderBranding(createAdminClient(), r.betrieb);
    if (!r.ok) {
      return seite(marke.firma, marke.akzent, 'Das hat gerade nicht geklappt',
        'Bitte versuchen Sie es in ein paar Minuten noch einmal oder antworten Sie auf die E-Mail.');
    }
    return seite(marke.firma, marke.akzent, 'Erledigt — Sie bekommen keine Werbung mehr',
      'Ihr Widerspruch ist eingetragen und gilt für alle Werbe-E-Mails dieses Absenders. Nachrichten zu laufenden Aufträgen, Rechnungen und Terminen erreichen Sie weiterhin.');
  } catch (e) {
    console.error('[werbung-abmelden]', e instanceof Error ? e.message : e);
    return seite('Abmeldung', '#1a2332', 'Das hat gerade nicht geklappt',
      'Bitte versuchen Sie es in ein paar Minuten noch einmal oder antworten Sie auf die E-Mail.');
  }
}

export async function POST(req: Request) {
  // Die Parameter stehen in der Adresse; der Rumpf ist „List-Unsubscribe=One-Click".
  try {
    const r = await eintragen(new URL(req.url).searchParams);
    if (!r.betrieb) return new Response(null, { status: 400 });
    return new Response(null, { status: r.ok ? 200 : 500 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
