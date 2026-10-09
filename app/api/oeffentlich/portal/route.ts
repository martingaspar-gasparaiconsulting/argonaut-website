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
import { trackingLink, carrierName, statusInfo } from '@/lib/versand';
import { portalKauf, type PortalKauf, type KaufVorgang, type KaufFahrzeug, type KaufZulassung } from '@/lib/kfzKaufstatus';

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
      .select('id, rechnungsnummer, titel, rechnungsdatum, faelligkeitsdatum, brutto_summe, zahlungsstatus, bezahlt_am, zahlung_gemeldet_am')
      .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .neq('zahlungsstatus', 'storniert')
      .order('rechnungsdatum', { ascending: false })
      .limit(200);
    const rechnungen = (rRaw || []).map((r) => ({
      id: r.id,
      nummer: r.rechnungsnummer || '—',
      titel: r.titel || 'Rechnung',
      datum: r.rechnungsdatum || null,
      faellig: r.faelligkeitsdatum || null,
      betrag: Number(r.brutto_summe) || 0,
      status: r.zahlungsstatus || 'offen',
      bezahlt: !!r.bezahlt_am,
      gemeldet: !!r.zahlung_gemeldet_am,
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

    // 5) Offene Angebote dieses Kunden (hart: Betrieb + kontakt_id). Nur offene,
    //    mit Token für die Online-Zusage-Seite /angebot/<token>.
    const { data: aRaw } = await db.from('angebote')
      .select('titel, brutto_summe, gueltig_bis, status, token, kontakt_id')
      .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .eq('status', 'gesendet') // Paket 182: Entwürfe nie im Portal
      .order('erstellt_am', { ascending: false })
      .limit(50);
    const angebote = (aRaw || []).map((a) => ({
      titel: a.titel || 'Angebot',
      betrag: Number(a.brutto_summe) || 0,
      gueltig_bis: a.gueltig_bis || null,
      token: a.token || null,
    }));

    // 6) Sendungen dieses Kunden (hart: Betrieb + kontakt_id). Mit Tracking-Link.
    const { data: sRaw } = await db.from('versand_sendung')
      .select('status, carrier, tracking_nr, erstellt_am, kontakt_id, richtung')
      .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .order('erstellt_am', { ascending: false })
      .limit(50);
    const sendungen = (sRaw || []).map((s) => ({
      dienstleister: carrierName(s.carrier),
      status: statusInfo(s.status).label,
      istRetoure: s.richtung === 'retoure',
      verfolgen_url: trackingLink(s.carrier, s.tracking_nr),
      datum: s.erstellt_am || null,
    }));

    // 6b) Paket 281: Fahrzeugkauf dieses Kunden (hart: Betrieb + kontakt_id), ab „reserviert".
    //     Positivliste aus lib/kfzKaufstatus — nie FIN, Einkauf, Kalkulation, Notizen.
    //     Fail-open: ohne Kfz-Tabellen bleibt die Liste leer.
    const kaeufe: PortalKauf[] = [];
    try {
      const { data: vRaw, error: vErr } = await db.from('kfz_verkauf')
        .select('bestand_id, nr, status, reserviert_bis, vertrag_am, liefertermin, uebergabe_am, preis_brutto, zusatz, inzahlung_ankauf_id, inzahlung_betrag, anzahlung')
        .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
        .in('status', ['reserviert', 'vertrag', 'uebergeben'])
        .order('erstellt_am', { ascending: false })
        .limit(20);
      const vListe = vErr ? [] : ((vRaw ?? []) as unknown as (KaufVorgang & { bestand_id: string })[]);
      const ids = vListe.map((v) => v.bestand_id);
      if (ids.length) {
        const [fz, zul, tr] = await Promise.all([
          db.from('kfz_bestand').select('id, marke, modell, variante, erstzulassung, farbe').eq('owner_user_id', ownerId).in('id', ids),
          db.from('kfz_zulassung').select('bestand_id, art, status, termin, kennzeichen_neu, erstellt_am').eq('owner_user_id', ownerId).in('bestand_id', ids).neq('status', 'storniert').order('erstellt_am', { ascending: false }),
          db.from('kfz_tresor').select('bestand_id, status').eq('owner_user_id', ownerId).eq('art', 'zb2').in('bestand_id', ids),
        ]);
        const fzJe = new Map(((fz.data ?? []) as unknown as (KaufFahrzeug & { id: string })[]).map((x) => [x.id, x]));
        const zulJe = new Map<string, KaufZulassung>();
        for (const z of ((zul.error ? [] : zul.data ?? []) as unknown as (NonNullable<KaufZulassung> & { bestand_id: string })[])) if (!zulJe.has(z.bestand_id)) zulJe.set(z.bestand_id, z);
        const briefJe = new Map(((tr.error ? [] : tr.data ?? []) as unknown as { bestand_id: string; status: string }[]).map((x) => [x.bestand_id, x.status]));
        const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        for (const v of vListe) {
          const k = portalKauf(v, fzJe.get(v.bestand_id) ?? null, zulJe.get(v.bestand_id) ?? null, briefJe.get(v.bestand_id) ?? null, heute);
          if (k) kaeufe.push(k);
        }
      }
    } catch { /* ohne Fahrzeughandel keine Käufe */ }

    // 7) Zugriffszeit vermerken (rein informativ, best effort).
    await db.from('portal_zugaenge')
      .update({ letzter_zugriff_am: new Date().toISOString() })
      .eq('id', zugang.id);

    const betrieb = await betriebName(db, ownerId);
    return NextResponse.json({ betrieb, kunde: kundeName, rechnungen, termine, angebote, sendungen, kaeufe });
  } catch (e: unknown) {
    console.error('Portal GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}
