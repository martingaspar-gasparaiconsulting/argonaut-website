import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import {
  pruefeAnmeldung, bestaetigenUrl, kannAnmelden, platzZahlen,
  formatiereTermin, dauerText, anrede, setzePlatzhalter,
  STATUS_AKTIV, STATUS_ABGEMELDET, TERMIN_GEPLANT,
} from '@/lib/webinar';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/webinar   (Paket 5 · Punkt 3.13)
//
// ÖFFENTLICH — ohne Login. Zwei Aufgaben:
//   GET  ?key=<schluessel>          -> was die oeffentliche Seite zeigen darf
//   POST { key, termin_id, email, name, firma } -> Double-Opt-in starten
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route liest und schreibt mit der Service-Rolle und umgeht RLS — sie
// MUSS das, weil der Interessent nicht eingeloggt ist. Deshalb gilt hier:
// Jede Abfrage haengt am oeffentlichen Schluessel des Webinars, und die
// owner_user_id wird IMMER aus der gefundenen Webinar-Zeile uebernommen, nie
// aus der Anfrage. Wer die owner_user_id vom Browser annimmt, laesst Fremde
// Zeilen in fremde Betriebe schreiben. tsc faengt das NICHT.
//
// ▄▄▄ WAS DIESE ROUTE NIE HERAUSGIBT: DEN ZUGANGSLINK ▄▄▄
// zugang_url steht in KEINER Antwort dieser Route. Er geht ausschliesslich
// per Erinnerungsmail an bestaetigte Angemeldete. Ein Link auf der
// oeffentlichen Seite wird weitergereicht, und der Raum ist voll mit Leuten,
// die nie in der Liste standen.
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

type WebinarRow = {
  id: string; owner_user_id: string; titel: string; beschreibung: string;
  referent: string; aktiv: boolean; key: string;
};
type TerminRow = {
  id: string; beginnt_am: string | null; dauer_minuten: number;
  kapazitaet: number | null; status: string;
};

const PROFIL_SPALTEN =
  'firma_name, firma_akzentfarbe, firma_rechtsform, firma_strasse, firma_plz, firma_ort, '
  + 'firma_telefon, firma_email, firma_website, firma_geschaeftsfuehrer, firma_ust_id, '
  + 'firma_registergericht, firma_hrb, firma_steuernummer';

// Eine Zeichenkette, nicht zusammengesetzt — der Supabase-Client liest die
// Spaltenliste auf Typ-Ebene aus (siehe tests/selectLiteral.test.mjs).
const TERMIN_SPALTEN = 'id, beginnt_am, dauer_minuten, kapazitaet, status';

async function webinarPerKey(db: ReturnType<typeof admin>, key: string) {
  const { data } = await db
    .from('webinare')
    .select('id, owner_user_id, titel, beschreibung, referent, aktiv, key')
    .ilike('key', key)
    .maybeSingle();
  return (data as WebinarRow | null) ?? null;
}

/** Wie viele bestaetigte bzw. noch unbestaetigte Anmeldungen je Termin? */
async function belegungJeTermin(db: ReturnType<typeof admin>, terminIds: string[]) {
  const belegt = new Map<string, number>();
  if (terminIds.length === 0) return belegt;
  const { data } = await db
    .from('webinar_anmeldung')
    .select('termin_id, status')
    .in('termin_id', terminIds)
    .neq('status', STATUS_ABGEMELDET)
    .limit(5000);
  // Unbestaetigte zaehlen MIT: sonst verkauft man denselben Platz zweimal,
  // solange jemand seine Bestaetigungsmail noch nicht geoeffnet hat.
  for (const r of ((data ?? []) as { termin_id: string }[])) {
    belegt.set(r.termin_id, (belegt.get(r.termin_id) ?? 0) + 1);
  }
  return belegt;
}

// ---------------------------------------------------------------------------
// GET — die Seite fuellen
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const key = (new URL(req.url).searchParams.get('key') || '').trim();
  if (!key) return NextResponse.json({ ok: false, error: 'Kein Schlüssel angegeben.' }, { status: 400 });

  try {
    const db = admin();
    const w = await webinarPerKey(db, key);
    // Bewusst dieselbe Antwort fuer „gibt es nicht" und „nicht freigeschaltet":
    // sonst kann man durch Ausprobieren herausfinden, welche Schluessel es gibt.
    if (!w || !w.aktiv) {
      return NextResponse.json({ ok: false, error: 'Diese Seite ist nicht verfügbar.' }, { status: 404 });
    }

    const jetzt = new Date().toISOString();
    const { data: termineRoh } = await db
      .from('webinar_termin')
      .select(TERMIN_SPALTEN)
      .eq('webinar_id', w.id)
      .eq('status', TERMIN_GEPLANT)
      .order('beginnt_am', { ascending: true })
      .limit(50);
    const termine = (termineRoh ?? []) as TerminRow[];
    const belegt = await belegungJeTermin(db, termine.map((t) => t.id));

    const { data: profil } = await db
      .from('profiles').select(PROFIL_SPALTEN).eq('id', w.owner_user_id).maybeSingle();
    const p = (profil ?? {}) as Record<string, string | null>;

    return NextResponse.json({
      ok: true,
      titel: w.titel,
      beschreibung: w.beschreibung,
      referent: w.referent,
      betrieb: (p.firma_name || '').trim() || 'Ihr Ansprechpartner',
      akzent: sichereFarbe(p.firma_akzentfarbe),
      termine: termine.map((t) => {
        const plaetze = platzZahlen(t.kapazitaet, belegt.get(t.id) ?? 0);
        const moeglich = kannAnmelden(t, belegt.get(t.id) ?? 0, jetzt);
        return {
          id: t.id,
          beginnt_am: t.beginnt_am,
          termin_text: formatiereTermin(t.beginnt_am),
          dauer_text: dauerText(t.dauer_minuten),
          frei: plaetze.frei,                 // null = unbegrenzt
          ausgebucht: plaetze.ausgebucht,
          anmeldbar: moeglich.ok,
          grund: moeglich.ok ? null : moeglich.grund,
          // zugang_url steht hier BEWUSST nicht. Siehe Dateikopf.
        };
      }),
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
    console.error('webinar GET fehlgeschlagen:', e instanceof Error ? e.message : e);
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
    const terminId = String(body?.termin_id ?? '').trim();
    if (!key) return NextResponse.json({ ok: false, error: 'Kein Schlüssel angegeben.' }, { status: 400 });
    if (!terminId) return NextResponse.json({ ok: false, error: 'Bitte wählen Sie einen Termin.' }, { status: 400 });

    const geprueft = pruefeAnmeldung(body?.email, body?.name, body?.firma);
    if (!geprueft.ok) return NextResponse.json({ ok: false, error: geprueft.fehler }, { status: 400 });

    const db = admin();
    const w = await webinarPerKey(db, key);
    if (!w || !w.aktiv) {
      return NextResponse.json({ ok: false, error: 'Diese Seite ist nicht verfügbar.' }, { status: 404 });
    }

    // Die Betriebszuordnung kommt aus der Webinar-Zeile — NIE aus der Anfrage.
    const ownerId = w.owner_user_id;

    // Der Termin muss zu DIESEM Webinar gehoeren. Ohne diese Pruefung koennte
    // man sich ueber einen fremden Schluessel in einen beliebigen Termin
    // eintragen, indem man eine fremde termin_id mitschickt.
    const { data: tRoh } = await db
      .from('webinar_termin')
      .select(TERMIN_SPALTEN)
      .eq('id', terminId)
      .eq('webinar_id', w.id)
      .maybeSingle();
    const t = (tRoh as TerminRow | null) ?? null;
    if (!t) return NextResponse.json({ ok: false, error: 'Dieser Termin gehört nicht zu dieser Veranstaltung.' }, { status: 404 });

    const belegt = (await belegungJeTermin(db, [t.id])).get(t.id) ?? 0;
    const moeglich = kannAnmelden(t, belegt, new Date().toISOString());
    if (!moeglich.ok) return NextResponse.json({ ok: false, error: moeglich.grund }, { status: 409 });

    const { data: vorhanden } = await db
      .from('webinar_anmeldung')
      .select('id, status, token')
      .eq('termin_id', t.id)
      .eq('email', geprueft.email)
      .maybeSingle();
    const v = (vorhanden as { id: string; status: string; token: string } | null) ?? null;

    // Wer sich abgemeldet hat, wird NICHT durch eine neue Eintragung
    // wiederbelebt — sonst ist die Abmeldung nichts wert.
    if (v && v.status === STATUS_ABGEMELDET) return NextResponse.json({ ok: true, status: 'abgemeldet' });
    if (v && v.status === STATUS_AKTIV) return NextResponse.json({ ok: true, status: 'bereits' });

    let token = v?.token || '';
    if (v) {
      await db.from('webinar_anmeldung')
        .update({ name: geprueft.name, firma: geprueft.firma, erstellt_am: new Date().toISOString() })
        .eq('id', v.id);
    } else {
      const { data: neu, error } = await db.from('webinar_anmeldung').insert({
        owner_user_id: ownerId,
        webinar_id: w.id,
        termin_id: t.id,
        email: geprueft.email,
        name: geprueft.name,
        firma: geprueft.firma,
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
    const titel = setzePlatzhalter(w.titel, { firma });
    const terminText = formatiereTermin(t.beginnt_am);

    const inhalt = `
      <p style="margin:0 0 12px;">${escapeHtml(anrede(geprueft.name))}</p>
      <p style="margin:0 0 12px;">Sie möchten am Webinar „${escapeHtml(titel)}" teilnehmen${terminText ? ` — ${escapeHtml(terminText)}` : ''}. Ein Klick fehlt noch, dann ist Ihr Platz reserviert:</p>
      <p style="margin:22px 0;">
        <a href="${url}" style="display:inline-block;background:${sichereFarbe(p.firma_akzentfarbe)};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;">Anmeldung bestätigen</a>
      </p>
      <p style="margin:0 0 12px;color:#8a94a6;font-size:13px;">Den Zugangslink erhalten Sie rechtzeitig vor dem Termin per E-Mail.</p>
      <p style="margin:0;color:#8a94a6;font-size:13px;">Sie haben sich nicht angemeldet? Dann ignorieren Sie diese E-Mail einfach — ohne Ihren Klick passiert nichts weiter.</p>`;

    const r = await sendeMail({
      an: geprueft.email,
      betreff: `Bitte bestätigen Sie Ihre Anmeldung — ${firma}`,
      html: kundenMailLayout(firma, p.firma_akzentfarbe, '', inhalt),
      absenderName: firma,
      antwortAn: (p.firma_email || '').trim() || undefined,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: 'Die Bestätigungsmail konnte nicht zugestellt werden.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    console.error('webinar POST fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
