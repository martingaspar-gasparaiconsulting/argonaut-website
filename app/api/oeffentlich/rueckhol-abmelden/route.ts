import { createClient } from '@supabase/supabase-js';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/rueckhol-abmelden
//
// Der Abmelde-Link aus jeder Rückhol-Mail. Ohne Login, ohne Rückfrage, ohne
// Formular: ein Klick genügt. Art. 21 DSGVO und § 7 UWG verlangen, dass der
// Widerspruch so einfach ist wie die Werbung selbst.
//
// Ausgewiesen wird über die Lauf-Kennung (UUID) aus der Mail. Sie ist nicht
// zu erraten und gehört genau einem Empfänger — deshalb braucht es keinen
// zusätzlichen Token und keine neue Spalte in public.kontakte.
//
// Der Widerspruch gilt nicht nur für diese Strecke, sondern für die Werbung
// des Betriebs insgesamt (kontakte.werbe_widerspruch_am). Alles andere wäre
// eine Falle: wer „keine Werbung mehr" klickt, meint nicht „nur diese eine".
//
// Bewusst GET: Manche Mail-Programme öffnen Links vorab. Ein versehentlicher
// Widerspruch bedeutet weniger Post — ein versehentlich NICHT ausgeführter
// Widerspruch bedeutet eine Abmahnung. Die sichere Richtung gewinnt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seite(titel: string, text: string, farbe = '#0A1628'): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${titel}</title></head>
<body style="margin:0;background:#f6f7f9;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:12vh auto;padding:32px 28px;background:#fff;border-radius:14px;box-shadow:0 2px 18px rgba(10,22,40,.08);">
    <h1 style="margin:0 0 12px;font-size:22px;color:${farbe};">${titel}</h1>
    <p style="margin:0;color:#4a5568;">${text}</p>
  </div>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get('lauf') || '').trim();

  if (!UUID.test(id)) {
    return seite('Link nicht lesbar', 'Dieser Abmelde-Link ist unvollständig. Bitte antworten Sie einfach auf die E-Mail — wir tragen den Widerspruch dann von Hand ein.');
  }

  const db = service();

  const { data, error } = await db
    .from('rueckhol_lauf')
    .select('id, owner_user_id, kontakt_id, status')
    .eq('id', id)
    .limit(1);

  if (error) {
    console.error('[rueckhol-abmelden]', error.message);
    return seite('Das hat gerade nicht geklappt', 'Bitte versuchen Sie es in ein paar Minuten noch einmal oder antworten Sie auf die E-Mail.');
  }

  const lauf = (data ?? [])[0] as { id: string; owner_user_id: string; kontakt_id: string | null; status: string } | undefined;
  if (!lauf) {
    return seite('Schon erledigt', 'Zu diesem Link gibt es nichts mehr zu tun. Sie erhalten keine weitere Werbung von uns.');
  }

  // 1) Den Widerspruch beim Kontakt festhalten — das ist der Teil, der zählt.
  if (lauf.kontakt_id) {
    const { error: kFehler } = await db
      .from('kontakte')
      .update({ werbe_widerspruch_am: new Date().toISOString() })
      .eq('id', lauf.kontakt_id)
      .eq('owner_user_id', lauf.owner_user_id);
    if (kFehler) console.error('[rueckhol-abmelden] Kontakt', kFehler.message);
  }

  // 2) Den laufenden Vorgang beenden, damit morgen nichts mehr rausgeht.
  if (lauf.status === 'aktiv') {
    await db.from('rueckhol_lauf')
      .update({ status: 'gestoppt', stopp_grund: 'hat der Werbung widersprochen', beendet_am: new Date().toISOString().slice(0, 10), faellig_am: null })
      .eq('id', lauf.id)
      .eq('owner_user_id', lauf.owner_user_id);
  }

  return seite(
    'Erledigt — Sie bekommen keine Werbung mehr',
    'Ihr Widerspruch ist eingetragen. Wichtige Nachrichten zu laufenden Aufträgen, Rechnungen und Terminen erreichen Sie weiterhin — nur Werbung nicht mehr.',
  );
}
