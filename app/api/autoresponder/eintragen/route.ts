import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { emailNormalisieren, istEmailGueltig } from '@/lib/newsletter';
import { ersterAktiverSchritt, naechsterVersandAm } from '@/lib/autoresponder';

// ============================================================================
// ARGONAUT OS · app/api/autoresponder/eintragen/route.ts  (Paket 2)
//
// POST { sequenzId, emails?: [{email,name?}], ausNewsletter?: boolean }
// Traegt Empfaenger in eine Autoresponder-Sequenz ein (= startet je einen
// "Lauf"). Der eigentliche Versand passiert spaeter automatisch ueber den
// Cron (/api/cron/autoresponder), sobald ein Schritt faellig ist.
//
// Quellen: manuell eingegebene E-Mails UND/ODER die aktive Newsletter-Liste.
// Doppelte werden uebersprungen (ein Empfaenger nur einmal je Sequenz).
// RLS sorgt dafuer, dass nur die eigene Sequenz/Liste erreichbar ist.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EMPFAENGER = 1000;

type EingangEmail = { email?: string | null; name?: string | null };

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const sequenzId = (body?.sequenzId || '').toString().trim();
    if (!sequenzId) return NextResponse.json({ ok: false, error: 'Keine Sequenz angegeben.' }, { status: 400 });

    // Sequenz laden (RLS: nur eigene) + aktive Schritte holen.
    const { data: seq } = await supabase
      .from('autoresponder_sequenz')
      .select('id, status')
      .eq('id', sequenzId)
      .maybeSingle();
    if (!seq) return NextResponse.json({ ok: false, error: 'Sequenz nicht gefunden.' }, { status: 404 });

    const { data: schritte } = await supabase
      .from('autoresponder_schritt')
      .select('position, verzoegerung_tage, aktiv')
      .eq('sequenz_id', sequenzId);

    const erster = ersterAktiverSchritt((schritte ?? []) as { position: number; verzoegerung_tage: number; aktiv: boolean }[]);
    if (!erster) {
      return NextResponse.json(
        { ok: false, error: 'Diese Sequenz hat noch keinen aktiven Schritt. Bitte zuerst einen Mail-Schritt anlegen und aktivieren.' },
        { status: 400 },
      );
    }

    // Empfaenger sammeln.
    const roh: EingangEmail[] = Array.isArray(body?.emails) ? (body.emails as EingangEmail[]) : [];
    const kandidaten = new Map<string, string | null>(); // lowerEmail -> name

    for (const e of roh) {
      const em = emailNormalisieren(e?.email);
      if (istEmailGueltig(em) && !kandidaten.has(em)) kandidaten.set(em, (e?.name || '').toString().trim() || null);
    }

    if (body?.ausNewsletter) {
      const { data: abos } = await supabase
        .from('newsletter_abonnenten')
        .select('email, name')
        .eq('status', 'aktiv');
      for (const a of abos ?? []) {
        const em = emailNormalisieren((a as { email?: string }).email);
        if (istEmailGueltig(em) && !kandidaten.has(em)) kandidaten.set(em, ((a as { name?: string }).name || '').trim() || null);
      }
    }

    if (kandidaten.size === 0) {
      return NextResponse.json({ ok: false, error: 'Keine gültigen E-Mail-Adressen gefunden.' }, { status: 400 });
    }
    if (kandidaten.size > MAX_EMPFAENGER) {
      return NextResponse.json(
        { ok: false, error: `Zu viele Empfänger auf einmal (max. ${MAX_EMPFAENGER}).` },
        { status: 400 },
      );
    }

    // Schon eingetragene Empfaenger dieser Sequenz ermitteln (Dedupe).
    const { data: vorhanden } = await supabase
      .from('autoresponder_lauf')
      .select('email')
      .eq('sequenz_id', sequenzId);
    const schon = new Set<string>((vorhanden ?? []).map((v) => emailNormalisieren((v as { email?: string }).email)));

    const jetzt = new Date().toISOString();
    const startVersand = naechsterVersandAm(jetzt, erster.verzoegerung_tage ?? 0);

    let eingetragen = 0;
    let uebersprungen = 0;
    for (const [email, name] of kandidaten) {
      if (schon.has(email)) {
        uebersprungen++;
        continue;
      }
      const { error } = await supabase.from('autoresponder_lauf').insert({
        sequenz_id: sequenzId,
        email,
        name,
        naechste_position: erster.position ?? 1,
        naechster_versand_am: startVersand,
        gestartet_am: jetzt,
        status: 'aktiv',
      });
      if (error) {
        // 23505 = bereits vorhanden (Race) -> als uebersprungen zaehlen.
        uebersprungen++;
      } else {
        eingetragen++;
      }
    }

    return NextResponse.json({ ok: true, eingetragen, uebersprungen });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Eintragen fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
