// ============================================================================
// ARGONAUT OS · app/api/mail/anhang/route.ts — einen Anhang herunterladen
//
//   GET ?uid=123&i=0[&ordner=INBOX]  ->  die Datei als Download
//
// Die Nachbarroute /api/mail/nachricht benennt Anhänge nur (Name, Typ, Größe)
// und sagt in ihrem eigenen Kopf: „Der Download ist ein eigener Schritt mit
// eigener Prüfung." Das ist dieser Schritt.
//
// ▄▄▄ DREI DINGE, DIE HIER NIE PASSIEREN DÜRFEN ▄▄▄
//  1) INLINE AUSLIEFERN. Eine Mail-Anlage als text/html oder image/svg+xml
//     inline auf unserer eigenen Adresse hiesse: fremdes Skript läuft im
//     angemeldeten Dashboard, mit Zugriff auf die Sitzung. Jeder Anhang geht
//     deshalb als `attachment` raus — ausnahmslos, siehe contentDisposition().
//  2) DEN BEHAUPTETEN TYP ÜBERNEHMEN. Er kommt vom Absender. sichererTyp()
//     lässt nur eine kurze, harmlose Liste durch, alles andere wird
//     octet-stream. Dazu X-Content-Type-Options: nosniff, damit der Browser
//     auch nicht selbst rät.
//  3) DEN NAMEN IN DIE KOPFZEILE SCHREIBEN. Anführungszeichen, Semikolon oder
//     ein Zeilenumbruch im Dateinamen brechen die Kopfzeile auf.
//     sichererDateiname() räumt das weg, RFC 5987 rettet die Umlaute.
//
// Der Anhang wird NICHT gespeichert. Er wird geholt, durchgereicht, fertig —
// es entsteht keine zweite Kopie in unserem Speicher, die jemand aufräumen
// müsste und die irgendwann mit dem Postfach auseinanderläuft.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { imapPort } from '@/lib/mailKalender';
import {
  anhangIndex, sichererTyp, contentDisposition, ordnerErlaubt,
  ordnerListe, MAX_ANHANG_BYTES,
} from '@/lib/mailAbruf';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  const p = new URL(req.url).searchParams;
  const uid = parseInt(p.get('uid') || '', 10);
  const idx = anhangIndex(p.get('i'));
  if (!Number.isFinite(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: 'Keine gültige Nachrichten-Nummer.' }, { status: 400 });
  }
  if (idx === null) {
    return NextResponse.json({ ok: false, error: 'Kein gültiger Anhang angegeben.' }, { status: 400 });
  }

  // Das Postfach gehört dem eingeloggten Nutzer — die Abfrage filtert auf
  // seine owner_user_id. Niemand kann über eine fremde uid an ein fremdes
  // Postfach, weil die Verbindung immer mit SEINEN Zugangsdaten aufgebaut wird.
  const admin = createAdminClient();
  const { data } = await admin
    .from('mail_zugang')
    .select('konto_id, token_verschluesselt, imap_host, imap_port, verbunden')
    .eq('owner_user_id', user.id)
    .eq('anbieter', 'imap')
    .maybeSingle();
  const z = data as ZugangRow | null;

  if (!z || z.verbunden !== true || !z.token_verschluesselt) {
    return NextResponse.json({ ok: false, error: 'Es ist kein Postfach verbunden.' }, { status: 400 });
  }
  if (!z.imap_host) {
    return NextResponse.json({ ok: false, error: 'Für dieses Postfach fehlt der IMAP-Server.' }, { status: 400 });
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

    const vorhandene = ordnerListe((await client.list()) as Array<{ path?: unknown }>);
    const ordner = ordnerErlaubt(p.get('ordner'), vorhandene);
    if (!ordner) {
      await client.logout();
      return NextResponse.json({ ok: false, error: 'Diesen Ordner gibt es in Ihrem Postfach nicht.' }, { status: 400 });
    }

    const lock = await client.getMailboxLock(ordner);
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
    const liste = geparst.attachments ?? [];
    const a = liste[idx];
    if (!a || !Buffer.isBuffer(a.content)) {
      return NextResponse.json({ ok: false, error: 'Diesen Anhang gibt es in der Nachricht nicht.' }, { status: 404 });
    }
    if (a.content.length > MAX_ANHANG_BYTES) {
      return NextResponse.json({
        ok: false,
        error: 'Dieser Anhang ist zu groß für den Download über ARGONAUT. Bitte holen Sie ihn direkt aus Ihrem Postfach.',
      }, { status: 413 });
    }

    const koerper = new Uint8Array(a.content);
    return new NextResponse(koerper, {
      status: 200,
      headers: {
        'Content-Type': sichererTyp(a.contentType),
        'Content-Disposition': contentDisposition(a.filename ?? 'anhang'),
        'Content-Length': String(koerper.byteLength),
        // Der Browser soll NICHT selbst raten, was die Datei ist.
        'X-Content-Type-Options': 'nosniff',
        // Ein Anhang gehört niemandem ausser diesem Nutzer — nirgends zwischenlagern.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    try { await client.close(); } catch { /* egal */ }
    const meldung = e instanceof Error ? e.message : 'Verbindung zum Postfach nicht möglich.';
    console.error('mail/anhang:', meldung);
    return NextResponse.json({ ok: false, error: 'Abruf fehlgeschlagen: ' + meldung }, { status: 502 });
  }
}
