import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { AGGREGATOR, baueShipmentBody, parseShipcloudAntwort, buchungProbleme } from '@/lib/versandBuchung';

// ============================================================================
// ARGONAUT OS · Versand 4b · app/api/versand/buchen/route.ts
// Bucht eine Sendung real über den Aggregator (shipcloud): erzeugt Label +
// Tracking und schreibt beides in versand_sendung zurueck.
//   POST {sendungId}
// Demo-Konten buchen NICHT real. Ohne verbundenes Versand-Konto -> Hinweis.
// Absender = im shipcloud-Konto hinterlegter Standard (from wird weggelassen).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sendungId = String(body?.sendungId || '').trim();
  if (!sendungId) return NextResponse.json({ ok: false, error: 'Keine Sendung übergeben.' }, { status: 400 });

  // Demo-Konto: nicht real frankieren.
  const { data: prof } = await supabase.from('profiles').select('demo').eq('id', user.id).maybeSingle();
  if ((prof as { demo?: boolean } | null)?.demo) {
    return NextResponse.json({ ok: false, demo: true, error: 'Im Demo-Modus wird nicht real frankiert. Trag ersatzweise die Tracking-Nummer von Hand ein.' }, { status: 400 });
  }

  if (!encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt. Bitte einmalig setzen.' }, { status: 400 });
  }

  // Sendung laden (RLS -> nur eigene).
  const { data: s } = await supabase.from('versand_sendung')
    .select('id, empfaenger_name, empfaenger_firma, strasse, plz, ort, land, gewicht_kg, laenge_cm, breite_cm, hoehe_cm, carrier, service, referenz, kosten')
    .eq('id', sendungId).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: 'Sendung nicht gefunden.' }, { status: 404 });

  const probleme = buchungProbleme(s);
  if (probleme.length) return NextResponse.json({ ok: false, error: 'Buchung nicht möglich: ' + probleme.join(' · ') }, { status: 400 });

  // Aggregator-Zugang (Service-Role) laden + Key entschluesseln.
  const admin = createAdminClient();
  const { data: zugang } = await admin.from('versand_zugang')
    .select('token_verschluesselt, verbunden').eq('owner_user_id', user.id).eq('aggregator', AGGREGATOR.key).maybeSingle();
  if (!zugang?.verbunden || !zugang?.token_verschluesselt) {
    return NextResponse.json({ ok: false, error: `Kein ${AGGREGATOR.name}-Konto verbunden. Bitte zuerst unter „Versand-Konto verbinden" den API-Key hinterlegen.` }, { status: 400 });
  }
  let apiKey: string;
  try { apiKey = entschluessele(zugang.token_verschluesselt); }
  catch { return NextResponse.json({ ok: false, error: 'Zugang konnte nicht entschlüsselt werden.' }, { status: 500 }); }

  // Bei shipcloud buchen.
  let antwort;
  try {
    const res = await fetch(AGGREGATOR.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(baueShipmentBody(s)),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json && (json.errors || json.error)) ? JSON.stringify(json.errors || json.error) : `HTTP ${res.status}`;
      return NextResponse.json({ ok: false, error: 'Versanddienst meldet: ' + msg }, { status: 502 });
    }
    antwort = parseShipcloudAntwort(json);
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Verbindung zum Versanddienst fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler') }, { status: 502 });
  }

  // Label + Tracking zurueckschreiben (RLS -> nur eigene Sendung).
  const update: Record<string, unknown> = { status: 'gebucht', aktualisiert_am: new Date().toISOString() };
  if (antwort.trackingNr) update.tracking_nr = antwort.trackingNr;
  if (antwort.labelUrl) update.label_url = antwort.labelUrl;
  if (antwort.preis != null && !(Number(s.kosten) > 0)) update.kosten = antwort.preis;
  const { error: upErr } = await supabase.from('versand_sendung').update(update).eq('id', sendungId);
  if (upErr) return NextResponse.json({ ok: false, error: 'Buchung erfolgt, aber Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true, trackingNr: antwort.trackingNr, labelUrl: antwort.labelUrl, preis: antwort.preis });
}
