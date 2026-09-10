// ============================================================================
// ARGONAUT OS · app/api/mail/nachricht/route.ts — eine Nachricht im Klartext
//
// Der Posteingang zeigt bis heute nur den Umschlag: Absender, Betreff, Datum,
// gelesen. Damit sieht man, DASS etwas da ist — arbeiten kann man damit nicht.
// Diese Route holt den Inhalt.
//
//   GET ?uid=123  ->  { text, betreff, von, datumIso, messageId, anhaenge[] }
//
// ▄▄▄ WARUM NUR TEXT UND KEIN HTML ▄▄▄
// Eine E-Mail ist fremder Inhalt. Wer fremdes HTML in die eigene Oberfläche
// stellt, holt sich alles ins Haus, was darin steckt: Skripte, Zählpixel,
// nachgeladene Bilder, die dem Absender melden, wann und wo gelesen wurde.
// Deshalb geht hier ausschliesslich Text an den Client. Liegt nur eine
// HTML-Fassung vor, wird sie serverseitig in Text gewandelt (textAusHtml).
// Eine abgesicherte HTML-Ansicht kann später kommen — als eigene Entscheidung,
// nicht als Nebenwirkung.
//
// Anhänge werden benannt, aber nicht ausgeliefert: Name, Typ, Größe. Der
// Download ist ein eigener Schritt mit eigener Prüfung.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { imapPort } from '@/lib/mailKalender';
import { textAusHtml } from '@/lib/mailSmtp';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Längenbremse: Eine Werbemail kann Megabyte an Text enthalten. */
const MAX_TEXT = 200_000;

type ZugangRow = {
  konto_id?: string | null;
  token_verschluesselt?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  verbunden?: boolean | null;
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  const uid = parseInt(new URL(req.url).searchParams.get('uid') || '', 10);
  if (!Number.isFinite(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: 'Keine gültige Nachrichten-Nummer.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('mail_zugang')
    .select('konto_id, token_verschluesselt, imap_host, imap_port, verbunden')
    .eq('owner_user_id', user.id)
    .eq('anbieter', 'imap')
    .maybeSingle();
  const z = data as ZugangRow | null;

  if (!z || z.verbunden !== true || !z.token_verschluesselt) {
    return NextResponse.json({ ok: false, verbunden: false, error: 'Es ist kein Postfach verbunden.' }, { status: 400 });
  }
  if (!z.imap_host) {
    return NextResponse.json({ ok: false, verbunden: true, error: 'Für dieses Postfach fehlt der IMAP-Server.' }, { status: 400 });
  }

  let passwort = '';
  try { passwort = entschluessele(z.token_verschluesselt); }
  catch { return NextResponse.json({ ok: false, error: 'Zugangsdaten konnten nicht entschlüsselt werden.' }, { status: 500 }); }

  const client = new ImapFlow({
    host: z.imap_host,
    port: imapPort(z.imap_port),
    secure: true,
    auth: { user: z.konto_id || '', pass: passwort },
    logger: false,
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let roh: Buffer | null = null;
    try {
      // uid: true — die Nummer aus dem Posteingang ist eine UID, keine
      // laufende Nummer. Ohne das Kennzeichen läse man eine fremde Nachricht.
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      const quelle = (msg && typeof msg === 'object') ? (msg as { source?: unknown }).source : null;
      roh = Buffer.isBuffer(quelle) ? quelle : null;
    } finally {
      lock.release();
    }
    await client.logout();

    if (!roh) {
      return NextResponse.json({ ok: false, error: 'Diese Nachricht ist im Postfach nicht (mehr) zu finden.' }, { status: 404 });
    }

    const geparst = await simpleParser(roh);

    const text = String(geparst.text ?? '').trim() || textAusHtml(geparst.html || '');
    const vonErster = geparst.from?.value?.[0];

    return NextResponse.json({
      ok: true,
      uid,
      betreff: String(geparst.subject ?? '').trim(),
      vonName: String(vonErster?.name ?? '').trim(),
      vonAdresse: String(vonErster?.address ?? '').trim(),
      datumIso: geparst.date instanceof Date && !isNaN(geparst.date.getTime()) ? geparst.date.toISOString() : '',
      messageId: String(geparst.messageId ?? '').trim(),
      text: text.slice(0, MAX_TEXT),
      gekuerzt: text.length > MAX_TEXT,
      nurHtmlVorhanden: !String(geparst.text ?? '').trim() && !!geparst.html,
      anhaenge: (geparst.attachments ?? []).map((a) => ({
        name: String(a.filename ?? 'Anhang').slice(0, 200),
        typ: String(a.contentType ?? '').slice(0, 100),
        groesse: Number(a.size) || 0,
      })),
    });
  } catch (e) {
    try { await client.close(); } catch { /* egal */ }
    const meldung = e instanceof Error ? e.message : 'Verbindung zum Postfach nicht möglich.';
    console.error('mail/nachricht:', meldung);
    return NextResponse.json({ ok: false, error: 'Abruf fehlgeschlagen: ' + meldung }, { status: 502 });
  }
}
