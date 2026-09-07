import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, absenderBranding, kundenMailLayout } from '@/lib/mail';
import { werbeDeckel, tagesBudget, begruendung } from '@/lib/mailBudget';
import { entscheide, mailFuerSchritt, weiterWerte, stoppWerte } from '@/lib/leadNachfass';

// ============================================================================
// ARGONAUT OS · /api/cron/lead-nachfass   (Vertrieb · C4)
//
// Tages-Cron fuer die Nachfass-Kette zu Anfragen: Tag 2, Tag 7, Tag 21.
// Die Mail geht im Namen des BETRIEBS raus (Absendername, Farbe, Antwort-Adresse
// aus seinem Profil) — nicht im Namen von ARGONAUT.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route liest mit der Service-Rolle und umgeht damit RLS. Jede Zeile
// traegt ihre eigene owner_user_id, und das Branding wird JE ZEILE aus genau
// dieser owner_user_id geladen. Wer hier eine Zeile mit dem Branding eines
// anderen Betriebs verschickt, verschickt eine Datenpanne. tsc faengt das
// NICHT — dasselbe Muster wie in /api/cron/reports-versand.
//
// Der Deckel aus lib/mailBudget gilt: Werbepost darf die Betriebspost
// (Mahnungen, Terminerinnerungen) nicht aus dem Tageskontingent draengen.
//
// Ausloesung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wie viele Anfragen ein Durchgang hoechstens ansieht (nicht: verschickt). */
const MAX_ZEILEN = 500;

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function erlaubt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

type LeadRow = {
  id: string;
  owner_user_id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  dienstleistung: string | null;
  stufe: string | null;
  nachfass_status: string | null;
  nachfass_schritt: number | null;
  nachfass_faellig_am: string | null;
};

function absatzHtml(text: string): string {
  const sicher = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p style="margin:0 0 12px;">${sicher}</p>`;
}

async function lauf(req: Request) {
  if (!erlaubt(req)) {
    return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const db = service();
  const jetztIso = new Date().toISOString();
  const budget = tagesBudget(process.env.MAIL_TAGESBUDGET);
  const deckel = werbeDeckel(process.env.MAIL_TAGESBUDGET);

  const { data, error } = await db
    .from('leads')
    .select('id, owner_user_id, created_at, name, email, dienstleistung, stufe, nachfass_status, nachfass_schritt, nachfass_faellig_am')
    .eq('nachfass_status', 'aktiv')
    .lte('nachfass_faellig_am', jetztIso)
    .order('nachfass_faellig_am', { ascending: true })
    .limit(MAX_ZEILEN);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const zeilen = (data ?? []) as LeadRow[];

  // Branding je Betrieb nur EINMAL laden — und immer aus der owner_user_id
  // der jeweiligen Zeile. Siehe Warnung oben.
  const brandingCache = new Map<string, { firma: string; akzent: string; email: string | undefined }>();
  async function brandingVon(ownerId: string) {
    if (!brandingCache.has(ownerId)) {
      brandingCache.set(ownerId, await absenderBranding(db, ownerId));
    }
    return brandingCache.get(ownerId)!;
  }

  let gesendet = 0;
  let gestoppt = 0;
  let uebersprungen = 0;
  let fehler = 0;

  for (const l of zeilen) {
    if (gesendet >= deckel) break; // Deckel: der Rest kommt morgen dran.

    const e = entscheide(l, jetztIso);

    if (e.tun === 'nichts') {
      uebersprungen++;
      continue;
    }
    if (e.tun === 'stoppen') {
      await db.from('leads').update(stoppWerte('gestoppt')).eq('id', l.id);
      gestoppt++;
      continue;
    }

    try {
      const marke = await brandingVon(l.owner_user_id);
      const mail = mailFuerSchritt(e.schritt, {
        name: l.name,
        leistung: l.dienstleistung,
        firma: marke.firma,
      });
      if (!mail) { uebersprungen++; continue; }

      const inhalt = [
        absatzHtml(mail.anrede),
        ...mail.absaetze.map(absatzHtml),
        `<p style="margin:18px 0 0;color:#8a94a6;font-size:12px;line-height:1.5;">${mail.fuss}</p>`,
      ].join('');

      const r = await sendeMail({
        an: String(l.email),
        betreff: mail.betreff,
        html: kundenMailLayout(marke.firma, marke.akzent, '', inhalt),
        absenderName: marke.firma,
        antwortAn: marke.email,
      });
      if (!r.ok) throw new Error(r.fehler);

      await db.from('leads').update(weiterWerte(e.schritt, l.created_at, jetztIso)).eq('id', l.id);
      gesendet++;
    } catch (err) {
      console.error('Lead-Nachfass fehlgeschlagen', l.id, err instanceof Error ? err.message : err);
      fehler++;
    }
  }

  return NextResponse.json({
    ok: true,
    geprueft: zeilen.length,
    gesendet,
    gestoppt,
    uebersprungen,
    fehler,
    hinweis: begruendung(budget, deckel, gesendet),
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
