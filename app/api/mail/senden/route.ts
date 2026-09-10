// ============================================================================
// ARGONAUT OS · app/api/mail/senden/route.ts — der Mensch schreibt, sein
// Postfach verschickt
//
// ▄▄▄ DIE TRENNLINIE ▄▄▄
// Was die MASCHINE verschickt — Rechnungen, Mahnungen, Terminbestätigungen,
// Newsletter — geht über Resend (lib/mail.ts, noreply@argonaut-os.com).
// Was der MENSCH tippt, geht über SEIN Postfach. Diese Route ist der zweite
// Weg und rührt den ersten nicht an.
//
//   POST { an, betreff, text, kopie?, antwortAufMessageId? } -> verschickt
//
// WARUM DAS KEIN VERSAND-DIENST FÜR ALLE IST
// Der Absender ist immer das Postfach des EINGELOGGTEN Nutzers; eine fremde
// Adresse lässt sich nicht angeben. Höchstens fünf Empfänger je Nachricht
// (lib/mailSmtp.ts) — darüber ist es Massenversand, und der sperrt bei IONOS
// oder Strato das Konto des Kunden, nicht unseres. Wer viele anschreiben will,
// nimmt den Newsletter über Resend.
//
// Zugangsdaten liegen verschlüsselt in mail_zugang; das Passwort wird nur
// serverseitig kurz entschlüsselt und nie an den Client gegeben.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import {
  baueBetreff,
  baueVon,
  istImplizitesTls,
  leseEmpfaenger,
  pruefeVersand,
  smtpHost,
  smtpPort,
  MAX_EMPFAENGER,
} from '@/lib/mailSmtp';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Längenbremse für den Nachrichtentext. */
const MAX_TEXT = 100_000;

type ZugangRow = {
  konto_id?: string | null;
  token_verschluesselt?: string | null;
  imap_host?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  verbunden?: boolean | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // --- Das Postfach des Absenders -------------------------------------------
  const { data: zRoh } = await admin
    .from('mail_zugang')
    .select('konto_id, token_verschluesselt, imap_host, smtp_host, smtp_port, verbunden')
    .eq('owner_user_id', user.id)
    .eq('anbieter', 'imap')
    .maybeSingle();
  const z = zRoh as ZugangRow | null;

  if (!z || z.verbunden !== true || !z.token_verschluesselt) {
    return NextResponse.json(
      { ok: false, error: 'Es ist kein Postfach verbunden. Bitte zuerst unter „Mail & Kalender“ die Zugangsdaten hinterlegen.' },
      { status: 400 },
    );
  }

  const host = smtpHost(z.smtp_host, z.imap_host);
  const port = smtpPort(z.smtp_port);

  // --- Wie der Absender heißt ------------------------------------------------
  // Firmenname zuerst: Eine Mail von „Muster Bau“ wird gelesen, eine von einer
  // nackten Adresse landet im Zweifel im Papierkorb.
  let anzeigeName = '';
  try {
    const { data: ci } = await admin.from('web_ci').select('firma').eq('owner_user_id', user.id).maybeSingle();
    anzeigeName = String((ci as { firma?: string } | null)?.firma ?? '').trim();
  } catch { /* still — der Name ist Komfort, kein Muss */ }
  if (!anzeigeName) {
    try {
      const { data: p } = await admin.from('profiles').select('firma, company_name').eq('id', user.id).maybeSingle();
      const prof = p as { firma?: string | null; company_name?: string | null } | null;
      anzeigeName = String(prof?.firma || prof?.company_name || '').trim();
    } catch { /* still */ }
  }

  const von = baueVon(anzeigeName, z.konto_id);
  const an = leseEmpfaenger(body.an);
  const kopie = leseEmpfaenger(body.kopie, MAX_EMPFAENGER);
  const betreff = baueBetreff(body.betreff);
  const text = String(body.text ?? '').slice(0, MAX_TEXT);

  const fehler = pruefeVersand({ von, an, betreff, text, host, port, sicher: istImplizitesTls(port) });
  if (fehler.length) {
    return NextResponse.json({ ok: false, error: fehler.join(' '), fehler }, { status: 400 });
  }

  // --- Passwort nur hier, nur kurz ------------------------------------------
  let passwort = '';
  try {
    passwort = entschluessele(z.token_verschluesselt);
  } catch {
    return NextResponse.json({ ok: false, error: 'Zugangsdaten konnten nicht entschlüsselt werden.' }, { status: 500 });
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    // Nur 465 ist von Anfang an verschlüsselt. Auf 587 beginnt die Verbindung
    // im Klartext und wird per STARTTLS hochgestuft — steht dort `secure: true`,
    // wartet der Verbindungsaufbau ins Leere, bis der Zeitgeber zuschlägt.
    secure: istImplizitesTls(port),
    auth: { user: String(z.konto_id ?? ''), pass: passwort },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  // Damit die Antwort im Mailprogramm des Empfängers am richtigen Gespräch
  // hängt und nicht als neue Nachricht auftaucht.
  const bezug = String(body.antwortAufMessageId ?? '').trim().slice(0, 500);
  const kopfzeilen = bezug ? { 'In-Reply-To': bezug, References: bezug } : undefined;

  try {
    const ergebnis = await transport.sendMail({
      from: von,
      to: an,
      cc: kopie.length ? kopie : undefined,
      subject: betreff,
      text,
      headers: kopfzeilen,
    });
    return NextResponse.json({
      ok: true,
      messageId: String(ergebnis?.messageId ?? ''),
      an,
      kopie,
      ueber: host,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : 'Versand fehlgeschlagen.';
    console.error('mail/senden:', meldung);
    return NextResponse.json(
      {
        ok: false,
        error:
          'Der Versand über das eigene Postfach ist fehlgeschlagen: ' + meldung +
          ' — bitte Versand-Server, E-Mail und (App-)Passwort prüfen.',
      },
      { status: 502 },
    );
  } finally {
    try { transport.close(); } catch { /* egal */ }
  }
}
