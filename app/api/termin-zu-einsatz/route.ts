import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';

// ============================================================
// ARGONAUT OS · MODUL · P43 — TERMIN → EINSATZ
// ------------------------------------------------------------
// Erzeugt aus einem bestehenden Termin einen Field-Service-Einsatz
// und verknüpft beide beidseitig (termine.einsatz_id <-> einsaetze.termin_id).
//
// SICHERHEIT (14.07.26 nachgeruestet):
//   Frueher hatte diese Route KEINEN Login-Check und nahm owner_user_id aus
//   dem Body -> jeder haette im Namen fremder Kunden Einsaetze anlegen und
//   fremde Termine umbiegen koennen. Jetzt:
//     1) Login-Pflicht (getUser -> sonst 401).
//     2) owner_user_id kommt AUS DER SESSION; der Chef-Anker ist der Owner
//        (coalesce(mein_chef_id, auth.uid)) — Mitarbeiter erzeugen unter ihrem
//        Chef. Der Body-Wert owner_user_id wird IGNORIERT.
//     3) Besitzpruefung: der Termin muss dem eigenen Tenant gehoeren, sonst 403.
//   Rest (Feld-Mapping, Doppelschutz, Rueck-Verknuepfung) unveraendert.
// ============================================================

function envClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    // --- Tuersteher: eingeloggt? ---------------------------------------
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    }

    // Owner-Anker = eigener Chef (Mitarbeiter) ODER man selbst (Chef).
    // mein_chef_id() liefert beim Chef NULL -> dann auth.uid().
    let ownerId = user.id;
    const { data: chef } = await userClient.rpc('mein_chef_id');
    if (typeof chef === 'string' && chef) ownerId = chef;

    const supabase = envClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Dienst nicht konfiguriert.' }, { status: 500 });
    }

    const body = await req.json();
    const terminId = String(body?.termin_id || '').trim();
    if (!terminId) return NextResponse.json({ error: 'termin_id fehlt.' }, { status: 400 });

    // 1) Termin laden
    const { data: termin, error: tErr } = await supabase
      .from('termine')
      .select('*')
      .eq('id', terminId)
      .single();
    if (tErr || !termin) {
      return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });
    }

    // 1b) BESITZPRUEFUNG: Termin muss dem eigenen Tenant gehoeren.
    if (termin.owner_user_id !== ownerId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Termin.' }, { status: 403 });
    }

    // 2) Doppelschutz: bereits ein Einsatz verknüpft?
    if (termin.einsatz_id) {
      const { data: vorhanden } = await supabase
        .from('einsaetze')
        .select('id, titel, status')
        .eq('id', termin.einsatz_id)
        .maybeSingle();
      if (vorhanden) {
        return NextResponse.json({
          ok: true,
          bereits: true,
          einsatz_id: vorhanden.id,
          hinweis: 'Für diesen Termin existiert bereits ein Einsatz.',
        });
      }
      // verknüpfte ID zeigt ins Leere -> wir erzeugen neu (und überschreiben Verknüpfung)
    }

    // 3) Einsatz anlegen (Feld-Mapping) — owner_user_id aus der Session!
    const neuerEinsatz: any = {
      owner_user_id: ownerId,
      termin_id: termin.id,
      titel: termin.titel || termin.terminart || 'Einsatz',
      beschreibung: termin.beschreibung || termin.notiz || null,
      beginn_am: termin.beginn_am || null,
      ende_am: termin.ende_am || null,
      einsatzort: termin.ort || null,
      kontakt_id: termin.kontakt_id || null,
      firma_id: termin.firma_id || null,
      mitarbeiter_id: termin.mitarbeiter_id || null,
      kunde_name: termin.kunde_name || null,
      kunde_email: termin.kunde_email || null,
      kunde_telefon: termin.kunde_telefon || null,
      auftrag_id: termin.auftrag_id || null,
      status: 'geplant',
      quelle: 'termin',
    };

    const { data: einsatz, error: eErr } = await supabase
      .from('einsaetze')
      .insert(neuerEinsatz)
      .select('id, titel, status')
      .single();

    if (eErr || !einsatz) {
      console.error('Einsatz-Anlage Fehler:', eErr?.message);
      return NextResponse.json({ error: 'Einsatz konnte nicht erstellt werden: ' + (eErr?.message || '') }, { status: 502 });
    }

    // 4) Termin mit Einsatz verknüpfen (Rückrichtung)
    const { error: vErr } = await supabase
      .from('termine')
      .update({ einsatz_id: einsatz.id })
      .eq('id', termin.id);
    if (vErr) {
      console.error('Termin-Verknüpfung Fehler:', vErr.message);
      return NextResponse.json({
        ok: true,
        einsatz_id: einsatz.id,
        warnung: 'Einsatz erstellt, aber Rück-Verknüpfung am Termin schlug fehl.',
      });
    }

    return NextResponse.json({
      ok: true,
      einsatz_id: einsatz.id,
      titel: einsatz.titel,
      hinweis: 'Einsatz aus Termin erstellt und verknüpft.',
    });
  } catch (e: any) {
    console.error('Termin-zu-Einsatz Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
