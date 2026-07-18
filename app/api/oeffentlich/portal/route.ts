// ============================================================
// ARGONAUT OS · Bündel 11 · app/api/oeffentlich/portal/route.ts
// ÖFFENTLICHER (login-freier) Kunden-Portal-Endpunkt — Token-basiert.
//   GET ?token=..  -> { betrieb, kunde, rechnungen[], termine[] }
//
// SICHERHEIT (fail-closed):
//  · Der Token loest genau EINEN Zugang auf (portal_zugaenge). Ist er
//    unbekannt oder inaktiv -> 404, keine Daten.
//  · JEDE Folge-Abfrage wird HART auf owner_user_id (Betrieb) UND den
//    kontakt_id / die Kontakt-E-Mail aus dem Zugang gefiltert. Fehlt eine
//    Spalte, schlaegt die Abfrage fehl statt Fremddaten zu liefern.
//  · Nach aussen gehen nur die minimal noetigen Felder — keine internen IDs,
//    keine Notizen, keine fremden Kunden.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

async function betriebName(db: ReturnType<typeof admin>, ownerId: string): Promise<string> {
  const { data } = await db.from('profiles').select('firma_name').eq('id', ownerId).maybeSingle();
  return (data?.firma_name as string) || 'Ihr Betrieb';
}

// Anzeigename aus den vorhandenen Kontakt-Feldern (gleiche Reihenfolge wie im Dashboard).
function kontaktName(k: {
  anzeigename?: string | null; vorname?: string | null; nachname?: string | null;
  name?: string | null; email?: string | null;
}): string {
  if (k.anzeigename && k.anzeigename.trim()) return k.anzeigename.trim();
  const vn = `${k.vorname || ''} ${k.nachname || ''}`.trim();
  if (vn) return vn;
  if (k.name && k.name.trim()) return k.name.trim();
  return (k.email || '').trim();
}

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Kein Portal-Link.' }, { status: 400 });

    const db = admin();

    // 1) Token -> Zugang (nur aktiv). Fail-closed: unbekannt/inaktiv -> 404.
    const { data: zugang } = await db.from('portal_zugaenge')
      .select('id, owner_user_id, kontakt_id, aktiv')
      .eq('token', token).maybeSingle();
    if (!zugang || zugang.aktiv !== true) {
      return NextResponse.json({ error: 'Dieser Portal-Link ist ungültig oder wurde deaktiviert.' }, { status: 404 });
    }
    const ownerId = String(zugang.owner_user_id);
    const kontaktId = String(zugang.kontakt_id);

    // 2) Kontakt laden (hart auf Betrieb + genau diesen Kontakt).
    const { data: kontakt } = await db.from('kontakte')
      .select('id, anzeigename, vorname, nachname, name, email')
      .eq('owner_user_id', ownerId).eq('id', kontaktId).maybeSingle();
    if (!kontakt) {
      return NextResponse.json({ error: 'Der zugehörige Kunde wurde nicht gefunden.' }, { status: 404 });
    }
    const kundeName = kontaktName(kontakt);
    const kundeMail = (kontakt.email || '').trim().toLowerCase();

    // 3) Rechnungen dieses Kunden (hart: Betrieb + kontakt_id). Stornierte raus.
    const { data: rRaw } = await db.from('rechnungen')
      .select('id, rechnungsnummer, titel, rechnungsdatum, faelligkeitsdatum, brutto_summe, zahlungsstatus, bezahlt_am')
      .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .neq('zahlungsstatus', 'storniert')
      .order('rechnungsdatum', { ascending: false })
      .limit(200);
    const rechnungen = (rRaw || []).map((r) => ({
      nummer: r.rechnungsnummer || '—',
      titel: r.titel || 'Rechnung',
      datum: r.rechnungsdatum || null,
      faellig: r.faelligkeitsdatum || null,
      betrag: Number(r.brutto_summe) || 0,
      status: r.zahlungsstatus || 'offen',
      bezahlt: !!r.bezahlt_am,
    }));

    // 4) Termine dieses Kunden. termine hat KEIN kontakt_id -> ueber die
    //    Kunden-E-Mail (hart: Betrieb + kunde_email). Ohne E-Mail keine Termine.
    let termine: { titel: string; beginn: string | null; ende: string | null; status: string }[] = [];
    if (kundeMail) {
      const abHeute = new Date(); abHeute.setHours(0, 0, 0, 0);
      const { data: tRaw } = await db.from('termine')
        .select('titel, beginn_am, ende_am, status, kunde_email')
        .eq('owner_user_id', ownerId).eq('kunde_email', kundeMail)
        .gte('beginn_am', abHeute.toISOString())
        .order('beginn_am', { ascending: true })
        .limit(50);
      termine = (tRaw || []).map((t) => ({
        titel: t.titel || 'Termin',
        beginn: t.beginn_am || null,
        ende: t.ende_am || null,
        status: t.status || 'geplant',
      }));
    }

    // 5) Zugriffszeit vermerken (rein informativ, best effort).
    await db.from('portal_zugaenge')
      .update({ letzter_zugriff_am: new Date().toISOString() })
      .eq('id', zugang.id);

    const betrieb = await betriebName(db, ownerId);
    return NextResponse.json({ betrieb, kunde: kundeName, rechnungen, termine });
  } catch (e: unknown) {
    console.error('Portal GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}
