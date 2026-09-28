// app/api/import-aufraeumen/route.ts
// ============================================================
// ARGONAUT OS · Umzug Schritt 5 · KI-Aufraeumer (Paket 145, 28.09.2026)
// Nimmt ROHTEXT (aus PDF/Word/E-Mail/unordentlicher Liste kopiert) und das
// gewaehlte Import-Ziel und liefert die Datensaetze (nur bekannte Felder)
// zurueck. Die Seite baut daraus eine CSV mit den ARGONAUT-Feldnamen als
// Kopfzeile und gibt sie in den normalen Import-Motor (Pruefen, Rueckgaengig).
// Schreibt NICHTS in die Datenbank und speichert den Text nicht.
// Muster wie /api/lieferanten-import: kiFetch (Deckel, Rate-Limit, Rueckfall),
// Login-Pflicht, Import-Recht wie im Import-Center.
// ============================================================
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { zielDef } from '@/lib/importParser';
import {
  aufraeumerErlaubt, aufraeumerPrompt, extrahiereJsonArray, antwortZuZeilen, AUFRAEUMER_MAX_ZEICHEN,
} from '@/lib/importAufraeumer';
import { importErlaubt, leseRechtStand } from '@/lib/importRechte';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const zielKey = typeof body?.zielKey === 'string' ? body.zielKey : '';
    const rohtext = typeof body?.rohtext === 'string' ? body.rohtext.trim() : '';
    if (!rohtext) return NextResponse.json({ error: 'Kein Text übergeben.' }, { status: 400 });
    if (rohtext.length > AUFRAEUMER_MAX_ZEICHEN) {
      return NextResponse.json({ error: 'Text zu lang für eine Portion. Bitte in kleineren Teilen einlesen.' }, { status: 400 });
    }
    const ziel = zielDef(zielKey);
    const erlaubt = aufraeumerErlaubt(zielKey);
    if (!ziel || !erlaubt.ok) return NextResponse.json({ error: erlaubt.ok ? 'Unbekanntes Import-Ziel.' : erlaubt.grund }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // Gleiche Regel wie im Import-Center (Paket 137): Chef alles, Mitarbeiter nur mit Bereich + „darf ändern".
    // Keine mitarbeiter-Zeile = Geschaeftsleitung (wie die Import-Seite).
    const { data: ma } = await supabase.from('mitarbeiter').select('id').eq('auth_user_id', user.id).maybeSingle();
    const maId = (ma as { id?: string } | null)?.id;
    if (maId) {
      const r1 = await supabase.from('mitarbeiter_rechte').select('module, schreib_module').eq('mitarbeiter_id', maId).maybeSingle();
      const stand = !r1.error
        ? leseRechtStand(r1.data, true)
        : leseRechtStand((await supabase.from('mitarbeiter_rechte').select('module').eq('mitarbeiter_id', maId).maybeSingle()).data, false);
      const recht = importErlaubt(zielKey, stand);
      if (!recht.ok) return NextResponse.json({ error: recht.grund }, { status: 403 });
    }

    const kiRes = await kiFetch('import-aufraeumen', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        system: aufraeumerPrompt(ziel),
        messages: [{ role: 'user', content: `Hier ist der Text:\n\n${rohtext}` }],
      }),
    });
    if (kiRes.status === 429) {
      const j = await kiRes.json().catch(() => ({}));
      return NextResponse.json({ error: (j as { error?: string }).error || 'Zu viele KI-Anfragen — bitte kurz warten.' }, { status: 429 });
    }
    if (!kiRes.ok) {
      console.error('Import-Aufräumer KI-Fehler:', (await kiRes.text()).slice(0, 500));
      return NextResponse.json({ error: 'Aufbereitung fehlgeschlagen.' }, { status: 502 });
    }
    const kiData = await kiRes.json();
    const roh = (Array.isArray(kiData?.content) ? kiData.content : [])
      .filter((b: { type?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text || '').join('').trim();

    let liste: unknown[];
    try { liste = extrahiereJsonArray(roh); }
    catch {
      return NextResponse.json({ error: 'Die KI-Antwort war keine lesbare Liste. Bitte kleinere Portion versuchen.' }, { status: 422 });
    }
    const { zeilen, verworfen } = antwortZuZeilen(liste, ziel);
    // Die Seite fuegt alle Portionen zusammen und baut daraus EINE CSV (zeilenZuCsv).
    return NextResponse.json({ zeilen, anzahl: zeilen.length, verworfen });
  } catch (err) {
    console.error('Import-Aufräumer Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
