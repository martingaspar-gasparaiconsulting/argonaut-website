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
//
// PAKET 384 · LK7 (16.10.2026): Wartung legt Termine selbst an.
// Ist beim Vertrag „Termin automatisch vorschlagen" an (termin_auto, Standard
// an), legt der Lauf EINEN Terminvorschlag an (lib/wartungTermin.ts) und
// schickt dem Kunden — wenn am Kontakt eine E-Mail hinterlegt ist — einen
// Link zum Bestätigen oder Ändern (/wartungstermin/<token>).
// Doppelschutz: offener Termin mit derselben wartungsvertrag_id.
// Läuft auch VOR dem SQL p384: fehlen die Spalten, bleibt alles wie bisher
// (nur die Mail an den Betrieb).
// ============================================================

import { cronGuard } from '@/lib/cronGuard';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendeMail, mailLayout, kundenMailLayout, absenderBranding } from '@/lib/mail';
import {
  autoTerminAn, terminVorschlag, hatOffenenTermin, bestaetigungsUrl,
  kundenMailInhalt, terminText, type TerminKurz,
} from '@/lib/wartungTermin';

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
  // ab SQL p384 bzw. schon vorhanden — select('*'), damit der Lauf vor dem SQL nicht bricht
  termin_auto?: boolean | null; kontakt_id?: string | null; standort_id?: string | null;
  vertragsnummer?: string | null;
};

function basisUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com').trim().replace(/\/+$/, '');
}

export const dynamic = 'force-dynamic';

// Paket 187b: eigene Prüfung (mit ?secret= in der Adresse und === statt
// zeitgleichem Vergleich) durch lib/cronGuard ersetzt — Bearer CRON_SECRET
// oder der Alt-Weg TERMIN_CRON_GEHEIM (Kopf), kein Geheimnis mehr in der Adresse.

async function lauf(req: NextRequest) {
  // Autorisierung: Vercel-Cron (Bearer CRON_SECRET) oder Alt-Header
  const gesperrt = await cronGuard(req, { altGeheimnisNutzen: true });
  if (gesperrt) return gesperrt;

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
    .select('*')
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
  let vorschlaege = 0;
  let kundenMails = 0;
  const fehlerListe: string[] = [];

  // LK7: Gibt es die Spalten schon (SQL p384)? Sonst kein Terminvorschlag.
  const { error: spaltenFehler } = await supabase
    .from('termine').select('wartungsvertrag_id, bestaetigung_token, kunde_bestaetigt_am').limit(1);
  const autoMoeglich = !spaltenFehler;

  /** Legt höchstens EINEN Vorschlag an; liefert die Zeile für die Betriebs-Mail. */
  async function vorschlagAnlegen(w: WartungZeile): Promise<string> {
    if (!autoMoeglich || !autoTerminAn(w)) return '';
    const { data: vorhandene, error: vErr } = await supabase
      .from('termine').select('beginn_am, status, wartungsvertrag_id')
      .eq('owner_user_id', w.owner_user_id).eq('wartungsvertrag_id', w.id);
    if (vErr) { fehlerListe.push(`${w.id}: Termine nicht lesbar`); return ''; }
    if (hatOffenenTermin((vorhandene ?? []) as TerminKurz[], w.id, new Date())) {
      return '<p>Für diese Wartung besteht bereits ein offener Terminvorschlag.</p>';
    }
    let kundeEmail: string | null = null;
    if (w.kontakt_id) {
      const { data: k } = await supabase.from('kontakte').select('email')
        .eq('id', w.kontakt_id).eq('owner_user_id', w.owner_user_id).maybeSingle();
      const m = String((k as { email?: string | null } | null)?.email || '').trim();
      kundeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m : null;
    }
    const token = randomBytes(24).toString('base64url');
    const zeile = terminVorschlag(
      { id: w.id, owner_user_id: w.owner_user_id, titel: w.titel, kunde_name: w.kunde_name,
        kontakt_id: w.kontakt_id ?? null, standort_id: w.standort_id ?? null, vertragsnummer: w.vertragsnummer ?? null },
      w.naechste_faelligkeit_am, heuteIso, token, kundeEmail,
    );
    if (!zeile) return '';
    const { error: iErr } = await supabase.from('termine').insert(zeile);
    if (iErr) { fehlerListe.push(`${w.id}: Terminvorschlag nicht angelegt`); return ''; }
    vorschlaege++;
    const { datum, zeit } = terminText(String(zeile.beginn_am), String(zeile.ende_am));
    let kundeZeile = 'Am Kunden ist keine E-Mail hinterlegt — bitte stimmen Sie den Termin selbst ab.';
    if (kundeEmail) {
      try {
        const brand = await absenderBranding(supabase, w.owner_user_id);
        const inhalt = kundenMailInhalt({
          kundeName: w.kunde_name, betrieb: brand.firma, vertragTitel: w.titel,
          beginnIso: String(zeile.beginn_am), endeIso: String(zeile.ende_am),
          link: bestaetigungsUrl(basisUrl(), token), akzent: brand.akzent,
        });
        const r = await sendeMail({
          an: kundeEmail, betreff: `Terminvorschlag Wartung am ${datum}`,
          html: kundenMailLayout(brand.firma, brand.akzent, 'Terminvorschlag Wartung', inhalt),
          absenderName: brand.firma, antwortAn: brand.email, betriebId: brand.betriebId,
        });
        if (r.ok) { kundenMails++; kundeZeile = 'Der Kunde wurde per E-Mail um Bestätigung gebeten.'; }
        else kundeZeile = 'Die E-Mail an den Kunden ist fehlgeschlagen — bitte stimmen Sie den Termin selbst ab.';
      } catch {
        kundeZeile = 'Die E-Mail an den Kunden ist fehlgeschlagen — bitte stimmen Sie den Termin selbst ab.';
      }
    }
    return `<p>📅 Terminvorschlag angelegt: <b>${escapeHtml(datum)}, ${escapeHtml(zeit)}</b>. ${escapeHtml(kundeZeile)}
      Sie finden ihn unter <b>Termine</b>; bestätigt der Kunde, entsteht automatisch ein Einsatz.</p>`;
  }

  for (const w of faellig) {
    const vorschlagZeile = await vorschlagAnlegen(w);
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
      ${vorschlagZeile}
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

  return NextResponse.json({ ok: true, heute: heuteIso, gefunden: faellig.length, gesendet, vorschlaege, kundenMails, fehler: fehlerListe });
}

export async function GET(req: NextRequest) { return lauf(req); }
export async function POST(req: NextRequest) { return lauf(req); }
