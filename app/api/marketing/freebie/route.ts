import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import {
  pruefeDatei, pfadFuer, standardStreckeFuer, fehltZumStart, DATEI_MAX_BYTES,
} from '@/lib/freebie';
import { impressumVollstaendig } from '@/lib/landingpages';
import { limitBytes, passtNochRein, formatBytes } from '@/lib/speicher';

// ============================================================================
// ARGONAUT OS · /api/marketing/freebie   (D3)
//
// Die Verwaltungsroute. Laeuft ueber den SITZUNGS-Client, damit RLS
// entscheidet, welchem Betrieb eine Zeile gehoert — anders als die
// oeffentlichen Routen, die ohne Login auskommen muessen.
//
// POST { aktion: 'anlegen' }                  -> neues Freebie + Standard-Strecke
// POST { aktion: 'speichern', id, felder }    -> Kopfdaten aendern
// POST { aktion: 'mail', id, schritt, ... }   -> eine Mail der Strecke aendern
// POST { aktion: 'datei', id, dateiname, ... }-> signierte Adresse zum Hochladen
// POST { aktion: 'datei-fertig', id, pfad }   -> Datei eintragen
// POST { aktion: 'schalten', id, aktiv }      -> oeffentlich schalten
// DELETE ?id=                                 -> Freebie samt Strecke entfernen
//
// Die Admin-Rolle wird NUR fuer den Speicher gebraucht (signierte Adressen
// und Loeschen von Dateien) — nie zum Lesen oder Schreiben von Zeilen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'freebies';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const aktion = String(body?.aktion ?? '');
    const id = String(body?.id ?? '').trim();

    // ---- neues Freebie ----------------------------------------------------
    if (aktion === 'anlegen') {
      const { data: neu, error } = await supabase.from('freebie').insert({
        owner_user_id: user.id,
        titel: String(body?.titel ?? '').trim() || 'Mein Ratgeber',
      }).select('id, oeffentlich_key').maybeSingle();
      if (error || !neu) {
        return NextResponse.json({ ok: false, error: error?.message || 'Anlegen fehlgeschlagen.' }, { status: 500 });
      }
      const f = neu as { id: string; oeffentlich_key: string };

      // Die Standard-Strecke gleich mitliefern: Ein leerer Baukasten sieht
      // aus wie Arbeit. Der Betrieb ueberschreibt die Texte mit seinen eigenen.
      const { error: mailFehler } = await supabase
        .from('freebie_mail').insert(standardStreckeFuer(f.id, user.id));
      if (mailFehler) console.error('Standard-Strecke fehlgeschlagen', f.id, mailFehler.message);

      return NextResponse.json({ ok: true, id: f.id, key: f.oeffentlich_key });
    }

    if (!id) return NextResponse.json({ ok: false, error: 'Kein Eintrag angegeben.' }, { status: 400 });

    // ---- Kopfdaten --------------------------------------------------------
    if (aktion === 'speichern') {
      const nutzenRoh = Array.isArray(body?.nutzen) ? (body.nutzen as unknown[]) : [];
      const { error } = await supabase.from('freebie').update({
        titel: String(body?.titel ?? '').trim().slice(0, 120) || 'Mein Ratgeber',
        untertitel: String(body?.untertitel ?? '').trim().slice(0, 200) || null,
        beschreibung: String(body?.beschreibung ?? '').trim().slice(0, 2000) || null,
        nutzen: nutzenRoh.map((n) => String(n ?? '').trim()).filter(Boolean).slice(0, 8),
        geaendert_am: new Date().toISOString(),
      }).eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ---- eine Mail der Strecke -------------------------------------------
    if (aktion === 'mail') {
      const schritt = Math.floor(Number(body?.schritt));
      if (!Number.isFinite(schritt) || schritt < 1) {
        return NextResponse.json({ ok: false, error: 'Kein gültiger Schritt.' }, { status: 400 });
      }
      const tagRoh = Math.floor(Number(body?.tag));
      const { error } = await supabase.from('freebie_mail').update({
        // Tag 0 waere die Auslieferung selbst — die geht schon beim
        // Bestaetigen raus. Deshalb hier mindestens Tag 1.
        tag: Number.isFinite(tagRoh) ? Math.min(180, Math.max(1, tagRoh)) : 2,
        betreff: String(body?.betreff ?? '').trim().slice(0, 160),
        text: String(body?.text ?? '').slice(0, 5000),
        aktiv: body?.aktiv !== false,
      }).eq('freebie_id', id).eq('schritt', schritt);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ---- Datei: signierte Adresse ----------------------------------------
    if (aktion === 'datei') {
      const dateiname = String(body?.dateiname ?? '');
      const typ = String(body?.typ ?? '');
      const groesse = Number(body?.groesse ?? 0);

      const pruefung = pruefeDatei(dateiname, typ, groesse);
      if (!pruefung.ok) return NextResponse.json({ ok: false, error: pruefung.fehler }, { status: 400 });

      const db = admin();
      // Kontingent. Faellt die Messung aus, wird NICHT blockiert — ein
      // kaputter Waechter darf niemanden aussperren; die Datei-Grenze gilt.
      try {
        const [{ data: belegt }, { data: profil }] = await Promise.all([
          db.rpc('speicher_bytes_fuer', { owner_key: user.id }),
          db.from('profiles').select('stufe, zusatz_speicher_gb').eq('id', user.id).maybeSingle(),
        ]);
        const p = (profil ?? {}) as { stufe?: string | null; zusatz_speicher_gb?: number | null };
        const limit = limitBytes(p.stufe, p.zusatz_speicher_gb);
        const genutzt = Number(belegt) || 0;
        if (!passtNochRein(genutzt, limit, groesse)) {
          return NextResponse.json({
            ok: false,
            error: `Ihr Speicher ist voll (${formatBytes(genutzt)} von ${formatBytes(limit)} belegt). `
              + 'Löschen Sie nicht mehr benötigte Dateien oder buchen Sie Speicher dazu.',
          }, { status: 413 });
        }
      } catch { /* Waechter ausgefallen — Datei-Grenze greift weiterhin */ }

      const pfad = pfadFuer(user.id, id, dateiname);
      if (!pfad) return NextResponse.json({ ok: false, error: 'Dateiname nicht verwendbar.' }, { status: 400 });

      const { data: signiert, error } = await db.storage.from(BUCKET).createSignedUploadUrl(pfad);
      if (error || !signiert) {
        return NextResponse.json({ ok: false, error: 'Der Speicherplatz konnte nicht vorbereitet werden.' }, { status: 500 });
      }
      return NextResponse.json({
        ok: true, pfad, signedUrl: signiert.signedUrl, token: signiert.token, maxBytes: DATEI_MAX_BYTES,
      });
    }

    // ---- Datei: eintragen -------------------------------------------------
    if (aktion === 'datei-fertig') {
      const pfad = String(body?.pfad ?? '').trim();
      // Der Pfad kommt vom Browser — er MUSS im eigenen Ordner liegen.
      if (!pfad.startsWith(`${user.id}/`)) {
        return NextResponse.json({ ok: false, error: 'Pfad gehört nicht zu diesem Konto.' }, { status: 403 });
      }
      const groesse = Number(body?.groesse ?? 0);
      const { error } = await supabase.from('freebie').update({
        datei_pfad: pfad,
        datei_name: String(body?.dateiname ?? '').trim().slice(0, 120) || 'ratgeber.pdf',
        datei_bytes: Number.isFinite(groesse) && groesse > 0 ? Math.round(groesse) : 0,
        geaendert_am: new Date().toISOString(),
      }).eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ---- öffentlich schalten ---------------------------------------------
    if (aktion === 'schalten') {
      const anschalten = body?.aktiv === true;

      if (anschalten) {
        // Vor dem Scharfschalten pruefen, nicht danach. Eine oeffentliche
        // Seite ohne Impressum ist abmahnfaehig — das darf nicht erst
        // auffallen, wenn der Brief kommt.
        const [{ data: f }, { data: mails }, { data: profil }] = await Promise.all([
          supabase.from('freebie').select('titel, beschreibung, datei_pfad').eq('id', id).maybeSingle(),
          supabase.from('freebie_mail').select('aktiv').eq('freebie_id', id),
          supabase.from('profiles')
            .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_email, firma_telefon')
            .eq('id', user.id).maybeSingle(),
        ]);
        const imp = impressumVollstaendig(profil as Parameters<typeof impressumVollstaendig>[0]);
        const fehlt = fehltZumStart(
          f as Parameters<typeof fehltZumStart>[0],
          (mails ?? []) as { aktiv?: unknown }[],
          imp.fehlend,
        );
        if (fehlt.length > 0) {
          return NextResponse.json({ ok: false, error: 'Es fehlt noch etwas.', fehlt }, { status: 400 });
        }
      }

      const { error } = await supabase.from('freebie')
        .update({ aktiv: anschalten, geaendert_am: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('freebie-Verwaltung fehlgeschlagen:', e instanceof Error ? e.message : e);
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

    // Ueber den Sitzungs-Client lesen: RLS entscheidet, ob es ueberhaupt zu
    // diesem Betrieb gehoert. Erst danach faellt die Datei.
    const { data: f } = await supabase.from('freebie').select('id, datei_pfad').eq('id', id).maybeSingle();
    if (!f) return NextResponse.json({ ok: false, error: 'Nicht gefunden.' }, { status: 404 });

    const pfad = (f as { datei_pfad: string | null }).datei_pfad;
    if (pfad) {
      try { await admin().storage.from(BUCKET).remove([pfad]); } catch { /* Datei weg, Zeile faellt trotzdem */ }
    }
    // Strecke und Empfaenger haengen per ON DELETE CASCADE daran.
    const { error } = await supabase.from('freebie').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('freebie Löschen fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
