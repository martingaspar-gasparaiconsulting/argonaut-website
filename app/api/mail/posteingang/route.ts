import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { imapPort } from '@/lib/mailKalender';
import { mailZeile, type MailZeile } from '@/lib/posteingang';
import { ImapFlow } from 'imapflow';

// ============================================================================
// ARGONAUT OS · app/api/mail/posteingang/route.ts — IMAP-Posteingang-Abruf
//
// GET ?n=25 -> ruft die letzten N Nachrichten des verbundenen IMAP-Postfachs ab
// (Absender, Betreff, Datum, gelesen/ungelesen). Zugangsdaten kommen verschlüsselt
// aus mail_zugang (anbieter='imap'); das Passwort wird nur serverseitig kurz
// entschlüsselt und nie an den Client gegeben. Microsoft/Google (OAuth) folgen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from('mail_zugang')
    .select('konto_id, token_verschluesselt, imap_host, imap_port, verbunden')
    .eq('owner_user_id', user.id).eq('anbieter', 'imap').maybeSingle();
  const z = data as { konto_id?: string; token_verschluesselt?: string; imap_host?: string; imap_port?: number; verbunden?: boolean } | null;

  if (!z || !z.verbunden || !z.token_verschluesselt) {
    return NextResponse.json({ ok: true, verbunden: false, mails: [] });
  }
  if (!z.imap_host) {
    return NextResponse.json({ ok: false, verbunden: true, error: 'Für dieses IMAP-Konto fehlt der Server. Bitte unter „Mail & Kalender" den IMAP-Server ergänzen.' }, { status: 400 });
  }

  let passwort = '';
  try { passwort = entschluessele(z.token_verschluesselt); }
  catch { return NextResponse.json({ ok: false, error: 'Zugangsdaten konnten nicht entschlüsselt werden.' }, { status: 500 }); }

  const url = new URL(req.url);
  const grenze = Math.max(1, Math.min(50, parseInt(url.searchParams.get('n') || '25', 10) || 25));

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

  const mails: MailZeile[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mbx = (client.mailbox && typeof client.mailbox === 'object') ? (client.mailbox as { exists?: number }) : null;
      const total = mbx?.exists || 0;
      if (total > 0) {
        const von = Math.max(1, total - grenze + 1);
        for await (const msg of client.fetch(`${von}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
          mails.push(mailZeile(msg as unknown as Parameters<typeof mailZeile>[0]));
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.close(); } catch { /* egal */ }
    return NextResponse.json({
      ok: false, verbunden: true,
      error: 'Abruf fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Verbindung zum Postfach nicht möglich. Bitte Server, E-Mail und (App-)Passwort prüfen.'),
    }, { status: 502 });
  }

  mails.reverse(); // neueste zuerst
  return NextResponse.json({ ok: true, verbunden: true, konto: z.konto_id || '', mails });
}
