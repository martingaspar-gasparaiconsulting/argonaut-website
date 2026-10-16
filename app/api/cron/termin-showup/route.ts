import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cronGuard } from '@/lib/cronGuard';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import {
  einstellungLesen, faelligEineStunde, rueckholFaellig, rueckholZeit, rueckholText, buchungsLink,
  istAktiv, type ShowTermin, type ShowEinstellung,
} from '@/lib/showUp';

// ============================================================================
// ARGONAUT OS · /api/cron/termin-showup — Paket VK5 Teil 2 (16.10.2026)
// Alle 15 Minuten (vercel.json). Nur fuer Betriebe, die es unter Termine →
// „Erinnerung & Rueckholung" eingeschaltet haben (vk_showup, Voreinstellung AUS):
//  1) Erinnerung 1 Stunde vor dem Termin (zusaetzlich zur Erinnerung am Vortag)
//  2) Rueckhol-Folge nach „nicht erschienen": bis zu 3 Mails an den eingestellten
//     Tagen, nur 9–18 Uhr, Schluss sobald der Kunde neu gebucht hat.
// Doppelschutz: der Termin wird VOR dem Versand per bedingtem Update „belegt"
// (erinnerung_1h_am ist leer bzw. rueckhol_stufe unveraendert); scheitert die
// Mail, wird die Belegung zurueckgenommen. Zwei gleichzeitige Laeufe schicken
// so nie dieselbe Mail zweimal.
// Service-Rolle → jede Abfrage hart auf owner_user_id gefiltert.
// Ohne SQL p411 antwortet der Lauf „uebersprungen" und tut nichts.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const MAX_MAILS = 150;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function zeit(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}
function datum(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
}

type Zeile = ShowTermin & { owner_user_id: string; titel: string | null; ende_am: string | null; kunde_name: string | null; ort: string | null };
const SPALTEN = 'id, owner_user_id, titel, beginn_am, ende_am, ort, status, kunde_name, kunde_email, erschienen, erinnerung_1h_am, rueckhol_stufe, rueckhol_letzte_am';

async function lauf(req: NextRequest) {
  const gesperrt = await cronGuard(req);
  if (gesperrt) return gesperrt;

  const db: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
  const jetzt = new Date();

  const { data: einst, error: eErr } = await db.from('vk_showup')
    .select('owner_user_id, erinnerung_1h, rueckhol_an, rueckhol_tage')
    .or('erinnerung_1h.eq.true,rueckhol_an.eq.true').limit(5000);
  if (eErr) return NextResponse.json({ ok: true, uebersprungen: 'Tabelle vk_showup fehlt (SQL p411).' });

  const einstellung = new Map<string, ShowEinstellung>();
  for (const z of (einst as Record<string, unknown>[] | null) ?? []) {
    if (typeof z.owner_user_id === 'string') einstellung.set(z.owner_user_id, einstellungLesen(z));
  }
  const mit1h = [...einstellung].filter(([, e]) => e.erinnerung_1h).map(([o]) => o);
  const mitRueck = [...einstellung].filter(([, e]) => e.rueckhol_an).map(([o]) => o);

  const brandCache = new Map<string, Awaited<ReturnType<typeof absenderBranding>>>();
  async function brand(owner: string) {
    const b = brandCache.get(owner) ?? await absenderBranding(db, owner);
    brandCache.set(owner, b);
    return b;
  }

  let mails = 0;
  const fehler: string[] = [];
  const ergebnis = { erinnerung_1h: 0, rueckhol: 0 };

  // ── 1) Erinnerung 1 Stunde vorher ───────────────────────────────────────
  if (mit1h.length) {
    const { data } = await db.from('termine').select(SPALTEN)
      .in('owner_user_id', mit1h)
      .gt('beginn_am', new Date(jetzt.getTime() + 30 * 60000).toISOString())
      .lte('beginn_am', new Date(jetzt.getTime() + 90 * 60000).toISOString())
      .is('erinnerung_1h_am', null).not('kunde_email', 'is', null).limit(500);
    for (const t of (data as Zeile[] | null) ?? []) {
      if (mails >= MAX_MAILS || !faelligEineStunde(t, jetzt)) continue;
      const { data: beleg } = await db.from('termine').update({ erinnerung_1h_am: jetzt.toISOString() })
        .eq('id', t.id).eq('owner_user_id', t.owner_user_id).is('erinnerung_1h_am', null).select('id');
      if (!beleg || beleg.length === 0) continue;
      const b = await brand(t.owner_user_id);
      const beginn = new Date(t.beginn_am as string);
      const inhalt = `
        <p>${t.kunde_name ? `Guten Tag ${escapeHtml(t.kunde_name)},` : 'Guten Tag,'}</p>
        <p>in etwa einer Stunde ist es so weit — wir freuen uns auf Sie:</p>
        <div style="background:#f7f8fa;border-left:4px solid ${b.akzent};border-radius:8px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(t.titel ?? 'Termin')}</div>
          <div style="margin-top:6px;color:#1a2332;">${datum(beginn)}, ${zeit(beginn)} Uhr</div>
          ${t.ort ? `<div style="color:#1a2332;">${escapeHtml(t.ort)}</div>` : ''}
        </div>
        <p>Falls etwas dazwischengekommen ist, antworten Sie bitte kurz auf diese E-Mail.</p>`;
      const r = await sendeMail({
        an: t.kunde_email as string, betreff: `Gleich ist es so weit: ${t.titel ?? 'Ihr Termin'} um ${zeit(beginn)} Uhr`,
        html: kundenMailLayout(b.firma, b.akzent, 'Terminerinnerung', inhalt),
        absenderName: b.firma, antwortAn: b.email, betriebId: b.betriebId,
      });
      mails++;
      if (r.ok) ergebnis.erinnerung_1h++;
      else {
        fehler.push(`1h ${t.id}: ${r.fehler}`);
        await db.from('termine').update({ erinnerung_1h_am: null }).eq('id', t.id).eq('owner_user_id', t.owner_user_id);
      }
    }
  }

  // ── 2) Rueckhol-Folge nach „nicht erschienen" ───────────────────────────
  if (mitRueck.length && rueckholZeit(jetzt)) {
    const { data } = await db.from('termine').select(SPALTEN)
      .in('owner_user_id', mitRueck).eq('erschienen', false).lt('rueckhol_stufe', 3)
      .gte('beginn_am', new Date(jetzt.getTime() - 40 * 86400000).toISOString())
      .lte('beginn_am', jetzt.toISOString())
      .not('kunde_email', 'is', null).limit(500);
    const linkCache = new Map<string, string | null>();
    for (const t of (data as Zeile[] | null) ?? []) {
      const e = einstellung.get(t.owner_user_id);
      if (!e || mails >= MAX_MAILS || !rueckholFaellig(t, e, jetzt)) continue;

      // Schon neu gebucht? Dann ist die Folge zu Ende (gleicher Betrieb, gleiche Adresse, spaeter, aktiv).
      const { data: neu } = await db.from('termine').select('id, status')
        .eq('owner_user_id', t.owner_user_id).ilike('kunde_email', (t.kunde_email as string).trim().replace(/[%_\\]/g, '\\$&'))
        .gt('beginn_am', t.beginn_am as string).neq('id', t.id).limit(20);
      const neuGebucht = ((neu as { id: string; status: string | null }[] | null) ?? []).some((x) => istAktiv(x.status));
      if (neuGebucht) {
        await db.from('termine').update({ rueckhol_stufe: 3 }).eq('id', t.id).eq('owner_user_id', t.owner_user_id);
        continue;
      }

      const stufe = Math.max(0, Number(t.rueckhol_stufe ?? 0));
      const { data: beleg } = await db.from('termine')
        .update({ rueckhol_stufe: stufe + 1, rueckhol_letzte_am: jetzt.toISOString() })
        .eq('id', t.id).eq('owner_user_id', t.owner_user_id).eq('rueckhol_stufe', stufe).select('id');
      if (!beleg || beleg.length === 0) continue;

      if (!linkCache.has(t.owner_user_id)) {
        const { data: p } = await db.from('profiles').select('buchung_slug, buchung_aktiv').eq('id', t.owner_user_id).maybeSingle();
        linkCache.set(t.owner_user_id, buchungsLink(BASIS_URL, p?.buchung_slug as string | null, p?.buchung_aktiv as boolean | null));
      }
      const link = linkCache.get(t.owner_user_id) ?? null;
      const letzte = stufe + 1 >= e.rueckhol_tage.length;
      const txt = rueckholText(stufe, link, letzte);
      const b = await brand(t.owner_user_id);
      const inhalt = `
        <p>${t.kunde_name ? `Guten Tag ${escapeHtml(t.kunde_name)},` : 'Guten Tag,'}</p>
        ${txt.absaetze.map((a) => `<p>${escapeHtml(a)}</p>`).join('')}
        ${link ? `<p style="margin:20px 0;"><a href="${link}" style="background:${b.akzent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;display:inline-block;">Neuen Termin wählen</a></p>` : ''}`;
      const r = await sendeMail({
        an: t.kunde_email as string, betreff: txt.betreff,
        html: kundenMailLayout(b.firma, b.akzent, 'Ihr Termin', inhalt),
        absenderName: b.firma, antwortAn: b.email, betriebId: b.betriebId,
      });
      mails++;
      if (r.ok) ergebnis.rueckhol++;
      else {
        fehler.push(`rueckhol ${t.id}: ${r.fehler}`);
        await db.from('termine').update({ rueckhol_stufe: stufe, rueckhol_letzte_am: t.rueckhol_letzte_am ?? null })
          .eq('id', t.id).eq('owner_user_id', t.owner_user_id);
      }
    }
  }

  return NextResponse.json({ ok: true, betriebe: einstellung.size, ...ergebnis, fehler });
}

export async function GET(req: NextRequest) { return lauf(req); }
export async function POST(req: NextRequest) { return lauf(req); }
