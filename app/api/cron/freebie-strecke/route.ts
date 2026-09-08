import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, absenderBranding, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, textZuHtml } from '@/lib/newsletter';
import { werbeDeckel, tagesBudget, begruendung } from '@/lib/mailBudget';
import {
  entscheide, nachVersandWerte, setzePlatzhalter, anrede, abmeldenUrl,
  type StreckenSchritt,
} from '@/lib/freebie';

// ============================================================================
// ARGONAUT OS · /api/cron/freebie-strecke   (D3)
//
// Tages-Cron fuer die Freebie-Strecke. Die Mail geht im Namen des BETRIEBS
// raus — Absendername, Farbe und Antwort-Adresse aus seinem Profil.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route liest mit der Service-Rolle und umgeht RLS. Jede Zeile traegt
// ihre eigene owner_user_id, und Branding UND Strecke werden JE ZEILE aus
// genau dieser Zeile geladen. Wer hier die Strecke eines Betriebs an den
// Empfaenger eines anderen schickt, verschickt eine Datenpanne. tsc faengt
// das NICHT — dasselbe Muster wie in /api/cron/reports-versand.
//
// DER PROTOKOLL-EINTRAG KOMMT VOR DEM VERSAND:
// Bricht der Lauf zwischen Versand und Protokoll ab, bekaeme der Empfaenger
// dieselbe Mail beim naechsten Durchgang noch einmal. Ein Eintrag ohne Mail
// ist aergerlich; eine Mail doppelt ist eine Beschwerde. Der eindeutige
// Schluessel (lead_id, schritt) macht den Eintrag zur Sperre.
//
// Ausloesung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=.
// Mit ?probe=1 laeuft er trocken.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

type LeadRow = {
  id: string; owner_user_id: string; freebie_id: string; email: string;
  name: string | null; status: string; schritt: number | null;
  faellig_am: string | null; bestaetigt_am: string | null; abmelde_token: string;
};
type MailRow = { freebie_id: string; schritt: number; tag: number; betreff: string; text: string; aktiv: boolean };
type FreebieRow = { id: string; titel: string };

async function lauf(req: Request) {
  if (!erlaubt(req)) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  const db = service();
  const jetztIso = new Date().toISOString();
  const basis = ursprung(req);
  const budget = tagesBudget(process.env.MAIL_TAGESBUDGET);
  const deckel = werbeDeckel(process.env.MAIL_TAGESBUDGET);

  // Nur bestaetigte Empfaenger mit faelligem Termin. Abgemeldete haben
  // faellig_am = null und tauchen hier gar nicht erst auf.
  const { data, error } = await db
    .from('freebie_lead')
    .select('id, owner_user_id, freebie_id, email, name, status, schritt, faellig_am, bestaetigt_am, abmelde_token')
    .eq('status', 'aktiv')
    .not('faellig_am', 'is', null)
    .lte('faellig_am', jetztIso)
    .order('faellig_am', { ascending: true })
    .limit(MAX_ZEILEN);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const zeilen = (data ?? []) as LeadRow[];
  if (zeilen.length === 0) {
    return NextResponse.json({ ok: true, geprueft: 0, gesendet: 0, hinweis: begruendung(budget, deckel, 0) });
  }

  // Strecken je Freebie einmal holen — aber immer ueber die freebie_id der
  // jeweiligen Zeile zugeordnet. Siehe Warnung oben.
  const freebieIds = Array.from(new Set(zeilen.map((z) => z.freebie_id)));
  const [{ data: mailsRoh }, { data: freebiesRoh }] = await Promise.all([
    db.from('freebie_mail')
      .select('freebie_id, schritt, tag, betreff, text, aktiv')
      .in('freebie_id', freebieIds).eq('aktiv', true).order('schritt', { ascending: true }),
    db.from('freebie').select('id, titel').in('id', freebieIds),
  ]);

  const streckeJeFreebie = new Map<string, StreckenSchritt[]>();
  for (const m of ((mailsRoh ?? []) as MailRow[])) {
    const liste = streckeJeFreebie.get(m.freebie_id) ?? [];
    liste.push({ schritt: m.schritt, tag: m.tag, betreff: m.betreff, text: m.text });
    streckeJeFreebie.set(m.freebie_id, liste);
  }
  const titelJeFreebie = new Map<string, string>();
  for (const f of ((freebiesRoh ?? []) as FreebieRow[])) titelJeFreebie.set(f.id, f.titel);

  const brandingCache = new Map<string, { firma: string; akzent: string; email: string | undefined }>();
  async function brandingVon(ownerId: string) {
    if (!brandingCache.has(ownerId)) brandingCache.set(ownerId, await absenderBranding(db, ownerId));
    return brandingCache.get(ownerId)!;
  }

  let gesendet = 0, fertig = 0, uebersprungen = 0, fehler = 0;
  const wuerde: { email: string; schritt: number }[] = [];

  for (const l of zeilen) {
    if (gesendet >= deckel) break; // Deckel: der Rest kommt morgen dran.

    const strecke = streckeJeFreebie.get(l.freebie_id) ?? [];
    const e = entscheide(l, strecke, jetztIso);

    if (e.tun === 'nichts') { uebersprungen++; continue; }
    if (e.tun === 'fertig') {
      await db.from('freebie_lead').update({ faellig_am: null }).eq('id', l.id);
      fertig++;
      continue;
    }

    const schritt = strecke.find((s) => s.schritt === e.schritt);
    if (!schritt) { uebersprungen++; continue; }

    if (probe) { wuerde.push({ email: l.email, schritt: e.schritt }); gesendet++; continue; }

    try {
      // Erst sperren, dann senden — siehe Warnung oben. Schlaegt der Eintrag
      // fehl (Doppelschluessel), hat ein anderer Lauf die Mail schon.
      const { error: sperrFehler } = await db.from('freebie_versand').insert({
        owner_user_id: l.owner_user_id, lead_id: l.id, schritt: e.schritt,
      });
      if (sperrFehler) { uebersprungen++; continue; }

      const marke = await brandingVon(l.owner_user_id);
      const titel = titelJeFreebie.get(l.freebie_id) || '';
      const werte = { firma: marke.firma, name: l.name, titel };

      const betreff = setzePlatzhalter(schritt.betreff, werte).trim() || `Kurze Nachricht von ${marke.firma}`;
      const text = setzePlatzhalter(schritt.text, werte);
      const abUrl = abmeldenUrl(basis, l.abmelde_token);

      const inhalt = `
        <p style="margin:0 0 12px;">${escapeHtml(anrede(l.name))}</p>
        <div style="margin:0 0 12px;">${textZuHtml(text)}</div>
        <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
          Sie erhalten diese E-Mail, weil Sie „${escapeHtml(titel)}" angefordert haben.
          <a href="${abUrl}" style="color:#8a94a6;">Hier mit einem Klick abmelden</a>.
        </p>`;

      const r = await sendeMail({
        an: l.email,
        betreff,
        html: kundenMailLayout(marke.firma, marke.akzent, '', inhalt),
        absenderName: marke.firma,
        antwortAn: marke.email,
      });
      if (!r.ok) throw new Error(r.fehler);

      await db.from('freebie_lead')
        .update(nachVersandWerte(e.schritt, strecke, l.bestaetigt_am))
        .eq('id', l.id);
      gesendet++;
    } catch (err) {
      console.error('Freebie-Strecke fehlgeschlagen', l.id, err instanceof Error ? err.message : err);
      fehler++;
    }
  }

  return NextResponse.json({
    ok: true,
    probe: probe || undefined,
    geprueft: zeilen.length,
    gesendet, fertig, uebersprungen, fehler,
    wuerdeSenden: probe ? wuerde.slice(0, 20) : undefined,
    hinweis: begruendung(budget, deckel, gesendet),
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
