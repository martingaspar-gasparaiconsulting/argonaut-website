import { createClient } from '@supabase/supabase-js';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/mail-pixel   (D5 Teil 3)
//
// ÖFFENTLICH. Das Postfach laedt beim Öffnen ein 1×1-Bild — das ist der
// ganze Vorgang. Hochgezaehlt wird eine SUMME am Versand, sonst nichts:
// keine Adresse, kein Hash, keine IP, kein Zeitstempel je Person.
//
// ▄▄▄ WARUM NIE EIN FEHLER SICHTBAR WIRD ▄▄▄
// Diese Route antwortet IMMER mit einem gueltigen Bild, auch bei falschem
// Schluessel oder Datenbankfehler. Ein kaputtes Bild im Postfach sieht der
// Empfaenger — und der Betrieb steht mit einem Platzhalter-Symbol in seiner
// Werbemail da. Die Messung ist eine Zugabe; sie darf die Mail nie
// beschaedigen.
//
// Gezaehlt wird ueber eine Datenbank-Funktion mit passendem Schluessel:
// Die Service-Rolle kann hier also nur hochzaehlen, nicht lesen oder aendern.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ein transparentes 1×1-GIF — 43 Byte, funktioniert in jedem Postfach.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function bild(): Response {
  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      // Kein Zwischenspeichern: Sonst zaehlt das zweite Öffnen nie mit.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const versand = (url.searchParams.get('v') || '').trim();
    const schluessel = (url.searchParams.get('s') || '').trim();
    if (!versand || !schluessel) return bild();

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );
    // Passt der Schluessel nicht, tut die Funktion still nichts.
    await db.rpc('mail_oeffnung_zaehlen', { p_versand: versand, p_schluessel: schluessel });
  } catch (e) {
    console.error('mail-pixel:', e instanceof Error ? e.message : e);
  }
  return bild();
}
