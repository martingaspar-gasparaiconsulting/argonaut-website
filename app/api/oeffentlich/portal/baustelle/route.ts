// ============================================================
// ARGONAUT OS · Paket PN · app/api/oeffentlich/portal/baustelle/route.ts
// ÖFFENTLICH (login-frei): Baufortschritt, Dokumente, Freigaben und
// Monteur-Status für EINEN Kunden — ergänzt das bestehende Portal.
//   GET ?token=..  -> { projekte[], dokumente[], freigaben[], monteur }
//
// SICHERHEIT (fail-closed, gleiches Muster wie /api/oeffentlich/portal):
//  · Token -> genau EIN aktiver Zugang (portal_zugaenge) -> Betrieb + Kontakt.
//  · JEDE Abfrage hart auf owner_user_id + kontakt_id (bzw. auf die Projekte,
//    die der Betrieb für DIESEN Kontakt freigegeben hat).
//  · Fotos NUR mit fuer_kunde = true, Dateien nur mit Pfad unter
//    <Betrieb>/<Kontakt>/, alles als 60-Minuten-Links.
//  · Monteur: nur Status + Uhrzeit, NIE Standort oder Name des Mitarbeiters.
//  · Fehlen die PN-Tabellen (SQL noch nicht gelaufen), kommt eine leere
//    Antwort statt eines Fehlers — das alte Portal läuft weiter.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fortschrittAus, angezeigterFortschritt, monteurStatus, monteurSatz, tagInBerlin, fristAbgelaufen,
  pfadGehoertZu, istUuid, DOK_BUCKET, FREIGABE_LABEL, freigabeStatusFuer,
} from '@/lib/kundenPortalPlus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LINK_SEKUNDEN = 3600;
const MAX_FOTOS_JE_PROJEKT = 24;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

const LEER = { projekte: [], dokumente: [], freigaben: [], monteur: null };

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!istUuid(token)) return NextResponse.json({ error: 'Kein gültiger Portal-Link.' }, { status: 400 });
    const db = admin();

    const { data: zugang } = await db.from('portal_zugaenge')
      .select('owner_user_id, kontakt_id, aktiv').eq('token', token).maybeSingle();
    if (!zugang || zugang.aktiv !== true) {
      return NextResponse.json({ error: 'Dieser Portal-Link ist ungültig oder wurde deaktiviert.' }, { status: 404 });
    }
    const ownerId = String(zugang.owner_user_id);
    const kontaktId = String(zugang.kontakt_id);
    const heute = tagInBerlin(new Date().toISOString()) as string;

    // --- Projekte, die der Betrieb für diesen Kunden freigegeben hat --------
    const { data: pp, error: ppErr } = await db.from('portal_projekt')
      .select('projekt_id').eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId);
    if (ppErr) return NextResponse.json(LEER); // PN-SQL fehlt -> nichts zeigen
    const projektIds = (pp ?? []).map((x) => String(x.projekt_id)).filter(istUuid);

    const projekte: {
      id: string; name: string; fortschritt: number | null;
      meldungen: { text: string; datum: string; fortschritt: number | null }[];
      fotos: { url: string; datum: string | null }[];
    }[] = [];

    // Nur Projekte, die WIRKLICH diesem Betrieb gehoeren (portal_projekt koennte
    // theoretisch eine fremde ID enthalten — hier wird sie verworfen).
    const { data: pRows } = projektIds.length
      ? await db.from('projekte').select('id, name').eq('owner_user_id', ownerId).in('id', projektIds)
      : { data: [] as { id: string; name: string | null }[] };
    const eigeneIds = (pRows ?? []).map((p) => String(p.id));

    if (eigeneIds.length) {
      const [{ data: aRows }, { data: mRows }, { data: bRows }] = await Promise.all([
        // aufgaben: nur ueber die geprueften Projekt-IDs (Besitz oben bestaetigt)
        db.from('aufgaben').select('projekt_id, erledigt, status').in('projekt_id', eigeneIds),
        db.from('portal_meldung').select('projekt_id, text, fortschritt, erstellt_am')
          .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).order('erstellt_am', { ascending: false }).limit(100),
        db.from('bautagebuch').select('id, projekt_id').eq('owner_user_id', ownerId).in('projekt_id', eigeneIds),
      ]);
      const tagebuchZuProjekt = new Map<string, string>();
      for (const b of bRows ?? []) tagebuchZuProjekt.set(String(b.id), String(b.projekt_id));
      const tagebuchIds = [...tagebuchZuProjekt.keys()];
      let fotoRows: { pfad: string; bautagebuch_id: string; erstellt_am: string | null }[] = [];
      if (tagebuchIds.length) {
        const { data: f } = await db.from('baustellen_fotos')
          .select('pfad, bautagebuch_id, erstellt_am')
          .eq('owner_user_id', ownerId).eq('fuer_kunde', true).in('bautagebuch_id', tagebuchIds)
          .order('erstellt_am', { ascending: false }).limit(200);
        fotoRows = (f ?? []) as typeof fotoRows;
      }
      const fotoPfade = fotoRows.map((f) => f.pfad).filter((p) => typeof p === 'string' && p.length > 0);
      const urls = new Map<string, string>();
      if (fotoPfade.length) {
        const { data: signed } = await db.storage.from('baustellen-fotos').createSignedUrls(fotoPfade, LINK_SEKUNDEN);
        for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }

      for (const p of pRows ?? []) {
        const id = String(p.id);
        const eigeneMeldungen = (mRows ?? []).filter((m) => String(m.projekt_id) === id);
        const ausAufgaben = fortschrittAus((aRows ?? []).filter((a) => String(a.projekt_id) === id)).pct;
        const fotos = fotoRows
          .filter((f) => tagebuchZuProjekt.get(String(f.bautagebuch_id)) === id && urls.has(f.pfad))
          .slice(0, MAX_FOTOS_JE_PROJEKT)
          .map((f) => ({ url: urls.get(f.pfad) as string, datum: f.erstellt_am }));
        projekte.push({
          id,
          name: String(p.name || 'Projekt'),
          fortschritt: angezeigterFortschritt(
            eigeneMeldungen.map((m) => ({ fortschritt: m.fortschritt as number | null, erstellt_am: String(m.erstellt_am) })),
            ausAufgaben,
          ).pct,
          meldungen: eigeneMeldungen.slice(0, 20).map((m) => ({ text: String(m.text), datum: String(m.erstellt_am), fortschritt: (m.fortschritt as number | null) ?? null })),
          fotos,
        });
      }
    }

    // Allgemeine Meldungen (ohne Projekt) als eigener Block
    const { data: allgemein } = await db.from('portal_meldung')
      .select('text, fortschritt, erstellt_am').eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .is('projekt_id', null).order('erstellt_am', { ascending: false }).limit(20);

    // --- Dokumente -------------------------------------------------------
    const { data: dRows } = await db.from('portal_dokument')
      .select('titel, dateiname, pfad, erstellt_am').eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId)
      .order('erstellt_am', { ascending: false }).limit(100);
    const dokOk = (dRows ?? []).filter((d) => pfadGehoertZu(String(d.pfad), ownerId, kontaktId));
    const dokUrls = new Map<string, string>();
    if (dokOk.length) {
      const { data: signed } = await db.storage.from(DOK_BUCKET).createSignedUrls(dokOk.map((d) => String(d.pfad)), LINK_SEKUNDEN);
      for (const s of signed ?? []) if (s.path && s.signedUrl) dokUrls.set(s.path, s.signedUrl);
    }
    const dokumente = dokOk.filter((d) => dokUrls.has(String(d.pfad))).map((d) => ({
      titel: String(d.titel || d.dateiname || 'Dokument'),
      datum: d.erstellt_am as string | null,
      url: dokUrls.get(String(d.pfad)) as string,
    }));

    // --- Freigaben (zurückgezogene nicht zeigen) --------------------------
    const { data: fRows } = await db.from('portal_freigabe')
      .select('id, titel, text, frist, status, antwort_name, antwort_kommentar, beantwortet_am, erstellt_am')
      .eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).neq('status', 'zurueckgezogen')
      .order('erstellt_am', { ascending: false }).limit(50);
    const freigaben = (fRows ?? []).map((f) => {
      const status = freigabeStatusFuer(f.status);
      return {
        id: String(f.id), titel: String(f.titel), text: String(f.text), frist: (f.frist as string | null) ?? null,
        frist_abgelaufen: status === 'offen' && fristAbgelaufen(f.frist as string | null, heute),
        status, status_text: FREIGABE_LABEL[status],
        antwort_name: status === 'offen' ? null : (f.antwort_name as string | null),
        antwort_kommentar: status === 'offen' ? null : (f.antwort_kommentar as string | null),
        beantwortet_am: (f.beantwortet_am as string | null) ?? null,
      };
    });

    // --- Monteur-Status (über die Kunden-E-Mail wie die Termine) ---------
    let monteur: { art: string; satz: string } | null = null;
    const { data: kontakt } = await db.from('kontakte').select('email').eq('owner_user_id', ownerId).eq('id', kontaktId).maybeSingle();
    const mail = String(kontakt?.email || '').trim().toLowerCase();
    if (mail) {
      const von = new Date(Date.now() - 36 * 3600_000).toISOString();
      const bis = new Date(Date.now() + 36 * 3600_000).toISOString();
      const { data: eRows } = await db.from('einsaetze')
        .select('titel, beginn_am, ende_am, status, unterwegs_am, vor_ort_am, erledigt_am')
        .eq('owner_user_id', ownerId).eq('kunde_email', mail)
        .gte('beginn_am', von).lte('beginn_am', bis).limit(20);
      const s = monteurStatus(eRows ?? [], heute);
      const satz = monteurSatz(s);
      if (s && satz) monteur = { art: s.art, satz };
    }

    return NextResponse.json({
      projekte,
      allgemein: (allgemein ?? []).map((m) => ({ text: String(m.text), datum: String(m.erstellt_am), fortschritt: (m.fortschritt as number | null) ?? null })),
      dokumente,
      freigaben,
      monteur,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    console.error('Portal Baustelle GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}
