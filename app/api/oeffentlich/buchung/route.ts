// ============================================================
// ARGONAUT OS · Bündel 6 · app/api/oeffentlich/buchung/route.ts
// ÖFFENTLICHER (login-freier) Buchungs-Endpunkt.
//
// SICHERHEIT — die Leitplanken dieser Route:
//  · Nur über den geheimen-genug Buchungs-Slug erreichbar; die Seite muss
//    ausdrücklich freigeschaltet sein (profiles.buchung_aktiv = true).
//  · JEDE Abfrage wird HART auf den Betrieb (owner_user_id) aus dem Slug
//    gefiltert. Fehlt die Spalte irgendwo, schlägt die Abfrage fehl statt
//    Fremddaten zu liefern (fail-closed).
//  · Kapazität wird SERVERSEITIG erneut über berechneSlots geprüft — der
//    Client kann sich keinen freien Slot „erfinden".
//  · Es werden nur die minimal nötigen Felder nach außen gegeben
//    (Betriebsname, freie Slots) — keine internen Daten.
//
// GET  ?slug=..&artId=..&tage=21  -> { betrieb, artId, arten[], slots[] }
// POST { slug, artId, beginn_am, ende_am, mitarbeiter_id?, kunde_name,
//        kunde_email, telefon?, notiz? } -> { ok } | { error }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { berechneSlots, type VerfuegbarkeitRow, type TerminRow, type AbwesenheitRow, type TerminArt } from '@/app/dashboard/_components/slotLogik';
import { sendeMail, mailLayout } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
function istMail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function isoTag(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const VERF_SPALTEN = 'id, ebene, art, mitarbeiter_id, wochentag, datum_von, datum_bis, ganztags, von_uhrzeit, bis_uhrzeit, kapazitaet, ueberbuchung_erlaubt, aktiv, titel';

type ArtRow = {
  id: string; name: string | null; modus: string | null; dauer_minuten: number | null;
  dauer_min_minuten: number | null; dauer_max_minuten: number | null; std_pro_tag: number | null;
  puffer_minuten: number | null; kapazitaet: number | null;
};
function alsTerminArt(a: ArtRow): TerminArt {
  return {
    modus: a.modus, dauer_minuten: a.dauer_minuten, dauer_min_minuten: a.dauer_min_minuten,
    dauer_max_minuten: a.dauer_max_minuten, std_pro_tag: a.std_pro_tag,
    puffer_minuten: a.puffer_minuten, kapazitaet: a.kapazitaet,
  };
}

/** Betrieb aus dem Slug ermitteln — nur wenn Buchung freigeschaltet ist. */
async function betriebAusSlug(db: ReturnType<typeof admin>, slug: string) {
  const { data } = await db.from('profiles')
    .select('id, firma_name, buchung_aktiv')
    .eq('buchung_slug', slug).maybeSingle();
  if (!data || data.buchung_aktiv !== true) return null;
  return { ownerId: data.id as string, name: (data.firma_name as string) || 'Termin' };
}

async function ladeSlotDaten(db: ReturnType<typeof admin>, ownerId: string, vonIso: string, bisIso: string, art: TerminArt) {
  const vonD = new Date(vonIso + 'T00:00:00');
  const bisD = new Date(bisIso + 'T23:59:59');
  const [verf, term, abw, hr] = await Promise.all([
    db.from('verfuegbarkeiten').select(VERF_SPALTEN).eq('owner_user_id', ownerId).eq('aktiv', true),
    db.from('termine').select('id, mitarbeiter_id, beginn_am, ende_am, status').eq('owner_user_id', ownerId)
      .lte('beginn_am', bisD.toISOString()).gte('ende_am', vonD.toISOString()),
    db.from('hr_abwesenheiten').select('mitarbeiter_id, von, bis, status').eq('owner_user_id', ownerId),
    db.from('hr_einstellungen').select('bundesland').eq('owner_user_id', ownerId).limit(1),
  ]);
  if (verf.error) throw verf.error;
  if (term.error) throw term.error;
  const bundesland = (hr.data && hr.data[0] && (hr.data[0] as { bundesland: string | null }).bundesland) || null;
  return berechneSlots({
    von: vonIso, bis: bisIso,
    verfuegbarkeiten: (verf.data as unknown as VerfuegbarkeitRow[]) ?? [],
    termine: (term.data as unknown as TerminRow[]) ?? [],
    abwesenheiten: (abw.data as unknown as AbwesenheitRow[]) ?? [],
    bundesland, art, mitarbeiterId: null, jetzt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// GET — freie Slots
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
    const artId = (url.searchParams.get('artId') || '').trim();
    const tage = Math.min(Math.max(Number(url.searchParams.get('tage') || '21') || 21, 1), 42);
    if (!slug) return NextResponse.json({ error: 'Kein Buchungs-Link angegeben.' }, { status: 400 });

    const db = admin();
    const betrieb = await betriebAusSlug(db, slug);
    if (!betrieb) return NextResponse.json({ error: 'Diese Buchungsseite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const { data: arten, error: aErr } = await db.from('termin_arten')
      .select('id, name, modus, dauer_minuten, dauer_min_minuten, dauer_max_minuten, std_pro_tag, puffer_minuten, kapazitaet, sortierung')
      .eq('owner_user_id', betrieb.ownerId).eq('aktiv', true).order('sortierung', { ascending: true });
    if (aErr) throw aErr;
    const artenL = (arten as ArtRow[]) ?? [];
    if (!artenL.length) {
      return NextResponse.json({ betrieb: betrieb.name, artId: null, arten: [], slots: [] });
    }
    const art = artenL.find((a) => a.id === artId) ?? artenL[0];

    const von = isoTag(new Date());
    const bis = isoTag(new Date(Date.now() + tage * 86_400_000));
    const ergebnis = await ladeSlotDaten(db, betrieb.ownerId, von, bis, alsTerminArt(art));

    const slots = ergebnis.slots.filter((s) => s.frei).map((s) => ({
      datum: s.datum, beginn: s.beginn.toISOString(), ende: s.ende.toISOString(), mitarbeiter_id: s.mitarbeiter_id,
    }));
    return NextResponse.json({
      betrieb: betrieb.name, artId: art.id,
      arten: artenL.map((a) => ({ id: a.id, name: a.name })), slots,
    });
  } catch (e: unknown) {
    console.error('Öffentliche Buchung GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Buchungsdaten konnten nicht geladen werden.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Termin buchen
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (typeof body?.slug === 'string' ? body.slug : '').trim().toLowerCase();
    const artId = typeof body?.artId === 'string' ? body.artId.trim() : '';
    const beginnIso = typeof body?.beginn_am === 'string' ? body.beginn_am : '';
    const endeIso = typeof body?.ende_am === 'string' ? body.ende_am : '';
    const mitarbeiterId = typeof body?.mitarbeiter_id === 'string' && body.mitarbeiter_id ? body.mitarbeiter_id : null;
    const kundeName = (typeof body?.kunde_name === 'string' ? body.kunde_name : '').trim();
    const kundeMail = (typeof body?.kunde_email === 'string' ? body.kunde_email : '').trim();
    const telefon = (typeof body?.telefon === 'string' ? body.telefon : '').trim();
    const notizIn = (typeof body?.notiz === 'string' ? body.notiz : '').trim();

    if (!slug || !artId) return NextResponse.json({ error: 'Buchung unvollständig.' }, { status: 400 });
    if (!kundeName) return NextResponse.json({ error: 'Bitte deinen Namen angeben.' }, { status: 400 });
    if (!istMail(kundeMail)) return NextResponse.json({ error: 'Bitte eine gültige E-Mail angeben.' }, { status: 400 });
    const beginnD = new Date(beginnIso); const endeD = new Date(endeIso);
    if (isNaN(beginnD.getTime()) || isNaN(endeD.getTime()) || endeD <= beginnD) {
      return NextResponse.json({ error: 'Ungültiger Termin-Zeitpunkt.' }, { status: 400 });
    }
    if (beginnD.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: 'Dieser Zeitpunkt liegt in der Vergangenheit.' }, { status: 400 });
    }

    const db = admin();
    const betrieb = await betriebAusSlug(db, slug);
    if (!betrieb) return NextResponse.json({ error: 'Diese Buchungsseite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const { data: artRow, error: aErr } = await db.from('termin_arten')
      .select('id, name, modus, dauer_minuten, dauer_min_minuten, dauer_max_minuten, std_pro_tag, puffer_minuten, kapazitaet, aktiv')
      .eq('owner_user_id', betrieb.ownerId).eq('id', artId).maybeSingle();
    if (aErr) throw aErr;
    if (!artRow || (artRow as { aktiv: boolean }).aktiv !== true) {
      return NextResponse.json({ error: 'Diese Terminart ist nicht buchbar.' }, { status: 400 });
    }
    const art = artRow as unknown as ArtRow;

    // SERVERSEITIGE Kapazitätsprüfung: Slot am gewählten Tag neu berechnen und
    // bestätigen, dass genau dieser Beginn (+ Mitarbeiter) noch FREI ist.
    const tag = isoTag(beginnD);
    const ergebnis = await ladeSlotDaten(db, betrieb.ownerId, tag, tag, alsTerminArt(art));
    const passt = ergebnis.slots.find((s) =>
      s.frei && s.beginn.toISOString() === beginnD.toISOString() && (s.mitarbeiter_id ?? null) === mitarbeiterId,
    );
    if (!passt) {
      return NextResponse.json({ error: 'Dieser Termin ist leider gerade vergeben worden. Bitte einen anderen wählen.' }, { status: 409 });
    }

    const notiz = [notizIn, telefon ? `Tel.: ${telefon}` : ''].filter(Boolean).join('\n') || null;
    const { error: insErr } = await db.from('termine').insert({
      owner_user_id: betrieb.ownerId, termin_art_id: art.id,
      beginn_am: beginnD.toISOString(), ende_am: endeD.toISOString(),
      titel: `${art.name || 'Termin'} (online gebucht)`,
      kunde_name: kundeName, kunde_email: kundeMail, notiz,
      mitarbeiter_id: mitarbeiterId, status: 'geplant', quelle: 'online',
    });
    if (insErr) throw insErr;

    // Bestätigungs-Mail an den Kunden (bricht die Buchung bei Mailproblem nicht ab).
    try {
      const datumStr = beginnD.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
      const zeitStr = `${beginnD.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}–${endeD.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`;
      const inhalt = `
        <p>Guten Tag ${escapeHtml(kundeName)},</p>
        <p>vielen Dank — Ihr Termin bei <b>${escapeHtml(betrieb.name)}</b> ist gebucht:</p>
        <div style="background:#F4F1E8;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(art.name || 'Termin')}</div>
          <div style="margin-top:6px;color:#1a2332;">${datumStr}</div>
          <div style="color:#1a2332;">${zeitStr}</div>
        </div>
        <p>Sollten Sie den Termin nicht wahrnehmen können, antworten Sie einfach auf diese E-Mail.</p>`;
      await sendeMail({ an: kundeMail, betreff: `Terminbestätigung: ${art.name || 'Termin'} am ${beginnD.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`, html: mailLayout('Terminbestätigung', inhalt) });
    } catch { /* Mail optional */ }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('Öffentliche Buchung POST:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Die Buchung konnte nicht abgeschlossen werden.' }, { status: 500 });
  }
}
