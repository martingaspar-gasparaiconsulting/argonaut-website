// ============================================================
// ARGONAUT OS · app/api/wartung-erinnerung/route.ts
// Täglicher Cron-Endpunkt: erinnert den BETRIEB an fällige Wartungen.
// - Geschützt per Geheim-Header (x-cron-secret == TERMIN_CRON_GEHEIM).
// - Läuft mit Service-Role (kein Login) über ALLE Betriebe hinweg.
// - Fällig = naechste_faelligkeit_am liegt innerhalb von erinnerung_tage_vorher
//   (oder ist bereits überfällig). Je Vertrag genau EINE Mail.
// - erinnerung_gesendet_am verhindert Doppel-Versand; beim nächsten „Gewartet"
//   wird es in der Wartungsseite wieder auf null gesetzt (neuer Zyklus).
// Aufruf: 1x täglich per n8n-Cron, POST mit Header x-cron-secret.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Kalendertag in Europe/Berlin als 'YYYY-MM-DD'. */
function berlinDatum(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Ganze Tage von heute bis zum Zieldatum (negativ = überfällig). */
function tageBis(zielIso: string, heuteIso: string): number {
  const a = new Date(zielIso + 'T12:00:00Z').getTime();
  const b = new Date(heuteIso + 'T12:00:00Z').getTime();
  return Math.round((a - b) / 86_400_000);
}

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

type WartungZeile = {
  id: string; owner_user_id: string; titel: string | null; kunde_name: string | null;
  intervall_monate: number | null; naechste_faelligkeit_am: string | null;
  erinnerung_tage_vorher: number | null;
};

export async function POST(req: NextRequest) {
  // 1) Autorisierung per Geheim-Header
  const secret = process.env.TERMIN_CRON_GEHEIM;
  const gegeben = req.headers.get('x-cron-secret');
  if (!secret || gegeben !== secret) {
    return NextResponse.json({ ok: false, fehler: 'Nicht autorisiert.' }, { status: 401 });
  }

  // 2) Service-Role-Client (betriebsübergreifend)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );

  const heuteIso = berlinDatum(new Date());

  // 3) Kandidaten: aktiv, nicht archiviert, mit Fälligkeit, noch nicht erinnert
  const { data, error } = await supabase
    .from('wartungsvertraege')
    .select('id, owner_user_id, titel, kunde_name, intervall_monate, naechste_faelligkeit_am, erinnerung_tage_vorher')
    .eq('status', 'aktiv')
    .eq('archiviert', false)
    .is('erinnerung_gesendet_am', null)
    .not('naechste_faelligkeit_am', 'is', null);

  if (error) {
    return NextResponse.json({ ok: false, fehler: error.message }, { status: 500 });
  }

  // 4) Fällig = innerhalb des Erinnerungsfensters (oder überfällig)
  const faellig = ((data as WartungZeile[]) ?? []).filter((w) => {
    if (!w.naechste_faelligkeit_am) return false;
    const fenster = w.erinnerung_tage_vorher ?? 14;
    return tageBis(w.naechste_faelligkeit_am, heuteIso) <= fenster;
  });

  // Owner-E-Mails cachen (mehrere Verträge pro Betrieb -> nur einmal abfragen)
  const mailCache = new Map<string, string | null>();
  async function ownerMail(ownerId: string): Promise<string | null> {
    if (mailCache.has(ownerId)) return mailCache.get(ownerId) ?? null;
    const { data: u } = await supabase.auth.admin.getUserById(ownerId);
    const mail = u?.user?.email ?? null;
    mailCache.set(ownerId, mail);
    return mail;
  }

  let gesendet = 0;
  const fehlerListe: string[] = [];

  for (const w of faellig) {
    const an = await ownerMail(w.owner_user_id);
    if (!an) { fehlerListe.push(`${w.id}: keine Betriebs-E-Mail`); continue; }

    const tage = tageBis(w.naechste_faelligkeit_am as string, heuteIso);
    const dringlich = tage < 0
      ? `<b style="color:#B00020;">überfällig seit ${Math.abs(tage)} Tag(en)</b>`
      : tage === 0 ? '<b>heute fällig</b>' : `fällig in <b>${tage} Tag(en)</b>`;

    const inhalt = `
      <p>Guten Tag,</p>
      <p>eine Wartung steht an — ${dringlich}:</p>
      <div style="background:#F4F1E8;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;margin:16px 0;">
        <div style="font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(w.titel ?? 'Wartungsvertrag')}</div>
        ${w.kunde_name ? `<div style="margin-top:6px;color:#1a2332;">Kunde: ${escapeHtml(w.kunde_name)}</div>` : ''}
        <div style="color:#1a2332;">Fällig am: ${datumHuebsch(w.naechste_faelligkeit_am)}</div>
        ${w.intervall_monate ? `<div style="color:#1a2332;">Intervall: alle ${w.intervall_monate} Monate</div>` : ''}
      </div>
      <p>Nach erledigter Wartung im ARGONAUT-Dashboard unter <b>Wartung</b> das Prüfprotokoll erfassen —
         die nächste Fälligkeit wird dann automatisch fortgeschrieben.</p>`;

    const html = mailLayout('Wartung fällig', inhalt);
    const betreff = `Wartung fällig: ${w.titel ?? 'Wartungsvertrag'} (${datumHuebsch(w.naechste_faelligkeit_am)})`;

    const r = await sendeMail({ an, betreff, html });
    if (r.ok) {
      await supabase.from('wartungsvertraege').update({ erinnerung_gesendet_am: new Date().toISOString() }).eq('id', w.id);
      gesendet++;
    } else {
      fehlerListe.push(`${w.id}: ${r.fehler}`);
    }
  }

  return NextResponse.json({ ok: true, heute: heuteIso, gefunden: faellig.length, gesendet, fehler: fehlerListe });
}
