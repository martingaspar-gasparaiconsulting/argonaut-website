import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { rechtsgrundFuer, istEmail, type KontaktRoh } from '@/lib/zielgruppe';

// ============================================================================
// ARGONAUT OS · /api/marketing/zielgruppe   (D5 Teil 1)
//
// Zwei Schreibvorgänge, die NICHT im Browser passieren dürfen:
//
//   aktion 'einwilligung' — trägt die Einwilligung eines Kontakts ein.
//   aktion 'uebernehmen'  — schiebt Kontakte in den Newsletter-Verteiler.
//
// ▄▄▄ WARUM DIE PRUEFUNG HIER NOCHMAL LAEUFT ▄▄▄
// Die Oberflaeche zeigt schon an, wer darf. Aber die Liste, die hier ankommt,
// kommt vom Browser — sie liesse sich veraendern. Deshalb wird die
// Rechtsgrundlage JE KONTAKT hier erneut aus der Datenbank geprueft, nicht
// aus der Anfrage uebernommen. Ein Verteiler ist genau die Stelle, an der
// man das nicht dem Browser glauben darf.
//
// UND: In den Dauerverteiler kommt NUR, wer ausdruecklich eingewilligt hat.
// Ein Bestandskunde darf eine einzelne Mail zu einer aehnlichen Leistung
// bekommen (§ 7 Abs. 3 UWG) — das ist aber kein Newsletter-Abo. Wer das
// vermischt, verliert die Ausnahme.
//
// Alles ueber den SITZUNGS-Client: RLS entscheidet, welche Kontakte
// ueberhaupt sichtbar sind.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wie viele Kontakte ein Durchgang höchstens anfasst. */
const MAX_STAPEL = 500;

const QUELLEN = ['formular', 'papier', 'telefonisch', 'persoenlich', 'freebie', 'sonstige'];

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const aktion = String(body?.aktion ?? '');

    // ---- Zielgruppe anlegen / speichern ----------------------------------
    if (aktion === 'speichern') {
      const id = String(body?.id ?? '').trim();
      const felder = {
        name: String(body?.name ?? '').trim().slice(0, 120) || 'Neue Zielgruppe',
        beschreibung: String(body?.beschreibung ?? '').trim().slice(0, 500) || null,
        regeln: (body?.regeln && typeof body.regeln === 'object') ? body.regeln : {},
        geaendert_am: new Date().toISOString(),
      };
      if (id) {
        const { error } = await supabase.from('zielgruppe').update(felder).eq('id', id);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, id });
      }
      const { data: neu, error } = await supabase.from('zielgruppe')
        .insert({ owner_user_id: user.id, ...felder }).select('id').maybeSingle();
      if (error || !neu) {
        return NextResponse.json({ ok: false, error: error?.message || 'Anlegen fehlgeschlagen.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id: String((neu as { id: string }).id) });
    }

    // ---- Einwilligung eintragen ------------------------------------------
    if (aktion === 'einwilligung') {
      const kontaktId = String(body?.kontaktId ?? '').trim();
      if (!kontaktId) return NextResponse.json({ ok: false, error: 'Kein Kontakt angegeben.' }, { status: 400 });

      const setzen = body?.setzen !== false;
      const quelleRoh = String(body?.quelle ?? '').trim().toLowerCase();
      const quelle = QUELLEN.includes(quelleRoh) ? quelleRoh : 'sonstige';

      // Eine Einwilligung ohne Datum und Herkunft ist kein Nachweis. Beides
      // wird deshalb IMMER mitgeschrieben, nie nur das Häkchen.
      const felder = setzen
        ? {
            werbe_einwilligung: true,
            werbe_einwilligung_am: new Date().toISOString(),
            werbe_einwilligung_quelle: quelle,
            werbe_widerspruch_am: null,
          }
        : {
            werbe_einwilligung: false,
            werbe_einwilligung_am: null,
            werbe_einwilligung_quelle: null,
          };

      const { error } = await supabase.from('kontakte').update(felder).eq('id', kontaktId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ---- Widerspruch eintragen -------------------------------------------
    if (aktion === 'widerspruch') {
      const kontaktId = String(body?.kontaktId ?? '').trim();
      if (!kontaktId) return NextResponse.json({ ok: false, error: 'Kein Kontakt angegeben.' }, { status: 400 });

      const { error } = await supabase.from('kontakte').update({
        werbe_widerspruch_am: new Date().toISOString(),
        werbe_einwilligung: false,
      }).eq('id', kontaktId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      // Auch im Verteiler abmelden — sonst widerspricht jemand und bekommt
      // trotzdem weiter Post, weil er dort noch als aktiv steht.
      const { data: k } = await supabase.from('kontakte').select('email').eq('id', kontaktId).maybeSingle();
      const mail = String((k as { email?: string } | null)?.email ?? '').trim().toLowerCase();
      if (mail) {
        await supabase.from('newsletter_abonnenten')
          .update({ status: 'abgemeldet' }).eq('email', mail);
      }
      return NextResponse.json({ ok: true });
    }

    // ---- In den Verteiler übernehmen -------------------------------------
    if (aktion === 'uebernehmen') {
      const ids = Array.isArray(body?.kontaktIds)
        ? (body.kontaktIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Keine Kontakte ausgewählt.' }, { status: 400 });
      if (ids.length > MAX_STAPEL) {
        return NextResponse.json({ ok: false, error: `Höchstens ${MAX_STAPEL} auf einmal.` }, { status: 400 });
      }

      // Frisch aus der Datenbank lesen — NICHT der Anfrage glauben.
      const { data: roh, error } = await supabase
        .from('kontakte')
        .select('id, vorname, nachname, firma, email, werbe_einwilligung, werbe_widerspruch_am, kunde_seit')
        .in('id', ids);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      const jetzt = new Date().toISOString();
      const nehmen: { email: string; name: string | null }[] = [];
      let abgelehnt = 0;
      let nurBestandskunde = 0;

      for (const k of ((roh ?? []) as KontaktRoh[])) {
        const grund = rechtsgrundFuer(k, jetzt);
        // NUR ausdrückliche Einwilligung kommt in den Dauerverteiler.
        if (grund !== 'einwilligung') {
          abgelehnt++;
          if (grund === 'bestandskunde') nurBestandskunde++;
          continue;
        }
        const email = String(k.email ?? '').trim().toLowerCase();
        if (!istEmail(email)) { abgelehnt++; continue; }
        const name = [k.vorname, k.nachname].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ')
          || String(k.firma ?? '').trim() || null;
        nehmen.push({ email, name });
      }

      let uebernommen = 0;
      let schonDrin = 0;
      for (const n of nehmen) {
        const { error: e } = await supabase.from('newsletter_abonnenten').insert({
          email: n.email, name: n.name, quelle: 'crm-zielgruppe',
        });
        if (!e) { uebernommen++; continue; }
        if ((e as { code?: string }).code === '23505') { schonDrin++; continue; }
        console.error('Übernahme fehlgeschlagen', n.email, e.message);
        abgelehnt++;
      }

      return NextResponse.json({ ok: true, uebernommen, schonDrin, abgelehnt, nurBestandskunde });
    }

    return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('Zielgruppe fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok: false, error: 'Kein Eintrag angegeben.' }, { status: 400 });

    const { error } = await supabase.from('zielgruppe').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('Zielgruppe löschen fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
