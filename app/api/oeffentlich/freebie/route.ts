import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import {
  pruefeAnmeldung, bestaetigenUrl, setzePlatzhalter, anrede,
  STATUS_AKTIV, STATUS_ABGEMELDET,
} from '@/lib/freebie';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/freebie   (D3)
//
// ÖFFENTLICH — ohne Login. Zwei Aufgaben:
//   GET  ?key=<schluessel>  -> was die oeffentliche Seite anzeigen darf
//   POST { key, email, name } -> Double-Opt-in starten
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route liest und schreibt mit der Service-Rolle und umgeht RLS — sie
// MUSS das, weil der Interessent nicht eingeloggt ist. Deshalb gilt hier:
// Jede Abfrage haengt am oeffentlichen Schluessel des Freebies, und die
// owner_user_id wird IMMER aus der gefundenen Freebie-Zeile uebernommen,
// nie aus der Anfrage. Wer die owner_user_id vom Browser annimmt, laesst
// Fremde Zeilen in fremde Betriebe schreiben. tsc faengt das NICHT.
//
// Was NICHT herausgegeben wird: die Datei. Die kommt erst nach bestaetigter
// Anmeldung ueber eine signierte Adresse — sonst braucht sich niemand
// anzumelden und der ganze Trichter ist tot.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

type FreebieRow = {
  id: string; owner_user_id: string; titel: string; untertitel: string | null;
  beschreibung: string | null; nutzen: string[] | null; aktiv: boolean;
  oeffentlich_key: string;
};

const PROFIL_SPALTEN =
  'firma_name, firma_akzentfarbe, firma_rechtsform, firma_strasse, firma_plz, firma_ort, '
  + 'firma_telefon, firma_email, firma_website, firma_geschaeftsfuehrer, firma_ust_id, '
  + 'firma_registergericht, firma_hrb, firma_steuernummer';

async function freebiePerKey(db: ReturnType<typeof admin>, key: string) {
  const { data } = await db
    .from('freebie')
    .select('id, owner_user_id, titel, untertitel, beschreibung, nutzen, aktiv, oeffentlich_key')
    .eq('oeffentlich_key', key)
    .maybeSingle();
  return (data as FreebieRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// GET — die Seite fuellen
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const key = (new URL(req.url).searchParams.get('key') || '').trim();
  if (!key) return NextResponse.json({ ok: false, error: 'Kein Schlüssel angegeben.' }, { status: 400 });

  try {
    const db = admin();
    const f = await freebiePerKey(db, key);
    // Bewusst dieselbe Antwort fuer „gibt es nicht" und „nicht freigeschaltet":
    // sonst kann man durch Ausprobieren herausfinden, welche Schluessel es gibt.
    if (!f || !f.aktiv) {
      return NextResponse.json({ ok: false, error: 'Diese Seite ist nicht verfügbar.' }, { status: 404 });
    }

    const { data: profil } = await db
      .from('profiles').select(PROFIL_SPALTEN).eq('id', f.owner_user_id).maybeSingle();
    const p = (profil ?? {}) as Record<string, string | null>;

    return NextResponse.json({
      ok: true,
      titel: f.titel,
      untertitel: f.untertitel,
      beschreibung: f.beschreibung,
      nutzen: Array.isArray(f.nutzen) ? f.nutzen.filter((n) => String(n || '').trim()) : [],
      betrieb: (p.firma_name || '').trim() || 'Ihr Ansprechpartner',
      akzent: sichereFarbe(p.firma_akzentfarbe),
      impressum: {
        firma_name: p.firma_name || '', rechtsform: p.firma_rechtsform || '',
        strasse: p.firma_strasse || '', plz: p.firma_plz || '', ort: p.firma_ort || '',
        telefon: p.firma_telefon || '', email: p.firma_email || '', website: p.firma_website || '',
        geschaeftsfuehrer: p.firma_geschaeftsfuehrer || '', ust_id: p.firma_ust_id || '',
        registergericht: p.firma_registergericht || '', hrb: p.firma_hrb || '',
        steuernummer: p.firma_steuernummer || '',
      },
    });
  } catch (e: unknown) {
    console.error('freebie GET fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Anmeldung starten (Double-Opt-in)
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const key = String(body?.key ?? '').trim();
    if (!key) return NextResponse.json({ ok: false, error: 'Kein Schlüssel angegeben.' }, { status: 400 });

    const geprueft = pruefeAnmeldung(body?.email, body?.name);
    if (!geprueft.ok) return NextResponse.json({ ok: false, error: geprueft.fehler }, { status: 400 });

    const db = admin();
    const f = await freebiePerKey(db, key);
    if (!f || !f.aktiv) {
      return NextResponse.json({ ok: false, error: 'Diese Seite ist nicht verfügbar.' }, { status: 404 });
    }

    // Die Betriebszuordnung kommt aus der Freebie-Zeile — NIE aus der Anfrage.
    const ownerId = f.owner_user_id;

    const { data: vorhanden } = await db
      .from('freebie_lead')
      .select('id, status, token')
      .eq('freebie_id', f.id)
      .eq('email', geprueft.email)
      .maybeSingle();
    const v = (vorhanden as { id: string; status: string; token: string } | null) ?? null;

    // Wer sich abgemeldet hat, wird NICHT durch eine neue Eintragung
    // wiederbelebt — sonst ist die Abmeldung nichts wert. Freundliche
    // Antwort, aber keine Mail.
    if (v && v.status === STATUS_ABGEMELDET) {
      return NextResponse.json({ ok: true, status: 'abgemeldet' });
    }
    if (v && v.status === STATUS_AKTIV) {
      return NextResponse.json({ ok: true, status: 'bereits' });
    }

    let token = v?.token || '';
    if (v) {
      await db.from('freebie_lead')
        .update({ name: geprueft.name, erstellt_am: new Date().toISOString() })
        .eq('id', v.id);
    } else {
      const { data: neu, error } = await db.from('freebie_lead').insert({
        owner_user_id: ownerId,
        freebie_id: f.id,
        email: geprueft.email,
        name: geprueft.name,
        quelle: 'freebie',
      }).select('token').maybeSingle();
      if (error || !neu) {
        return NextResponse.json({ ok: false, error: 'Die Anmeldung konnte nicht gespeichert werden.' }, { status: 500 });
      }
      token = String((neu as { token: string }).token);
    }

    const { data: profil } = await db
      .from('profiles').select('firma_name, firma_akzentfarbe, firma_email').eq('id', ownerId).maybeSingle();
    const p = (profil ?? {}) as { firma_name?: string | null; firma_akzentfarbe?: string | null; firma_email?: string | null };
    const firma = (p.firma_name || '').trim() || 'Ihr Ansprechpartner';

    const url = bestaetigenUrl(ursprung(req), token);
    const titel = setzePlatzhalter(f.titel, { firma });

    const inhalt = `
      <p style="margin:0 0 12px;">${escapeHtml(anrede(geprueft.name))}</p>
      <p style="margin:0 0 12px;">Sie haben „${escapeHtml(titel)}" angefordert. Ein Klick fehlt noch — dann schicken wir Ihnen die Datei sofort zu:</p>
      <p style="margin:22px 0;">
        <a href="${url}" style="display:inline-block;background:${sichereFarbe(p.firma_akzentfarbe)};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;">Anforderung bestätigen</a>
      </p>
      <p style="margin:0 0 12px;color:#8a94a6;font-size:13px;">Sie haben das nicht angefordert? Dann ignorieren Sie diese E-Mail einfach — ohne Ihren Klick passiert nichts weiter.</p>`;

    const r = await sendeMail({
      an: geprueft.email,
      betreff: `Bitte bestätigen Sie Ihre Anforderung — ${firma}`,
      html: kundenMailLayout(firma, p.firma_akzentfarbe, '', inhalt),
      absenderName: firma,
      antwortAn: (p.firma_email || '').trim() || undefined,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: 'Die Bestätigungsmail konnte nicht zugestellt werden.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    console.error('freebie POST fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
