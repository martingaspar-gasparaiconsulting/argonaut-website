import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { imapPort } from '@/lib/mailKalender';
import { mailZeile, type MailZeile } from '@/lib/posteingang';
import { ordnerListe, ordnerErlaubt, suchText, suchKriterium } from '@/lib/mailAbruf';
import { ImapFlow } from 'imapflow';

// ============================================================================
// ARGONAUT OS · app/api/mail/posteingang/route.ts — IMAP-Posteingang-Abruf
//
// GET ?n=25[&ordner=INBOX][&q=Suchbegriff]
//   -> ruft Nachrichten des verbundenen IMAP-Postfachs ab (Absender, Betreff,
//      Datum, gelesen/ungelesen) und meldet die vorhandenen Ordner mit.
//      Zugangsdaten kommen verschlüsselt aus mail_zugang (anbieter='imap');
//      das Passwort wird nur serverseitig kurz entschlüsselt und nie an den
//      Client gegeben. Microsoft/Google (OAuth) folgen.
//
// 12.09.26 (Punkt 3.4): Ordner und Suche kamen dazu — ADDITIV. Ohne die neuen
// Parameter verhält sich die Route exakt wie vorher: letzte N aus INBOX.
//
// Der Ordner kommt vom Browser, die Ordnerliste vom Server. Geöffnet wird nur,
// was der Server selbst gemeldet hat (ordnerErlaubt) — kein Rateversuch mit
// einem Namen, den sich jemand ausgedacht hat. Gesucht wird mit einem
// Kriterien-OBJEKT, nicht mit zusammengebautem Text: so kann kein Suchbegriff
// die Abfrage selbst verändern.
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
  const suche = suchText(url.searchParams.get('q'));

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
  let ordner = 'INBOX';
  let ordnerAlle: string[] = [];
  try {
    await client.connect();

    ordnerAlle = ordnerListe((await client.list()) as Array<{ path?: unknown }>);
    const gewaehlt = ordnerErlaubt(url.searchParams.get('ordner'), ordnerAlle);
    if (!gewaehlt) {
      await client.logout();
      return NextResponse.json({
        ok: false, verbunden: true, ordner: ordnerAlle,
        error: 'Diesen Ordner gibt es in Ihrem Postfach nicht.',
      }, { status: 400 });
    }
    ordner = gewaehlt;

    const lock = await client.getMailboxLock(ordner);
    try {
      if (suche) {
        // Suche: der Server sucht, wir holen nur die letzten Treffer. Findet
        // er nichts, bleibt die Liste leer — das ist eine Antwort, kein Fehler.
        const treffer = (await client.search(suchKriterium(suche), { uid: true })) as number[] | false;
        const uids = Array.isArray(treffer) ? treffer.slice(-grenze) : [];
        if (uids.length > 0) {
          for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
            mails.push(mailZeile(msg as unknown as Parameters<typeof mailZeile>[0]));
          }
        }
      } else {
        const mbx = (client.mailbox && typeof client.mailbox === 'object') ? (client.mailbox as { exists?: number }) : null;
        const total = mbx?.exists || 0;
        if (total > 0) {
          const von = Math.max(1, total - grenze + 1);
          for await (const msg of client.fetch(`${von}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
            mails.push(mailZeile(msg as unknown as Parameters<typeof mailZeile>[0]));
          }
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
  return NextResponse.json({
    ok: true, verbunden: true, konto: z.konto_id || '', mails,
    ordner, ordnerAlle, suche: suche || '',
  });
}
