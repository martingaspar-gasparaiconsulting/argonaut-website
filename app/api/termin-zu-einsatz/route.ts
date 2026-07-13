import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARGONAUT OS · MODUL · P43 — TERMIN → EINSATZ
// ------------------------------------------------------------
// Erzeugt aus einem bestehenden Termin einen Field-Service-Einsatz
// und verknüpft beide beidseitig (termine.einsatz_id <-> einsaetze.termin_id).
//
// Feld-Mapping (termine -> einsaetze):
//   titel/beschreibung/notiz -> titel/beschreibung
//   beginn_am/ende_am        -> beginn_am/ende_am
//   ort                      -> einsatzort
//   kontakt_id/firma_id      -> kontakt_id/firma_id
//   mitarbeiter_id           -> mitarbeiter_id
//   kunde_name/email/telefon -> kunde_name/email/telefon
//   auftrag_id               -> auftrag_id
//   owner_user_id            -> owner_user_id
//   quelle                   -> 'termin' (Herkunft markiert)
//
// DOPPELSCHUTZ: Ist der Termin schon mit einem Einsatz verknüpft,
// wird KEIN zweiter erzeugt, sondern der bestehende zurückgegeben.
//
// ADDITIV: eigene Route, ändert keine bestehende Logik.
// ============================================================

function envClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = envClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Dienst nicht konfiguriert.' }, { status: 500 });
    }

    const body = await req.json();
    const terminId = String(body?.termin_id || '').trim();
    const ownerId = String(body?.owner_user_id || '').trim();
    if (!terminId) return NextResponse.json({ error: 'termin_id fehlt.' }, { status: 400 });
    if (!ownerId) return NextResponse.json({ error: 'owner_user_id fehlt.' }, { status: 400 });

    // 1) Termin laden
    const { data: termin, error: tErr } = await supabase
      .from('termine')
      .select('*')
      .eq('id', terminId)
      .single();
    if (tErr || !termin) {
      return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });
    }

    // 2) Doppelschutz: bereits ein Einsatz verknüpft?
    if (termin.einsatz_id) {
      // Prüfen, ob der verknüpfte Einsatz wirklich existiert
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

    // 3) Einsatz anlegen (Feld-Mapping)
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
      // Einsatz existiert bereits; Verknüpfung fehlt -> melden, nicht verschweigen
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
