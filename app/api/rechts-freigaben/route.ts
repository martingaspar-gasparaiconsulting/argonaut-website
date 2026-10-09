import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { rolleImBetrieb } from '@/lib/zweiFaktorTeamServer';
import {
  FREIGABEN, freigabeStand, freigabePruefen, widerrufPruefen, gueltigBis, sperrText, datumDe,
  type FreigabeZeile,
} from '@/lib/rechtsFreigaben';

// ============================================================================
// ARGONAUT OS · /api/rechts-freigaben — Rechts-Freigaben-Zentrale (Paket 287, RF1)
//
// GET:  jeder angemeldete Zugang — Liste der heiklen Funktionen mit Stand
//       (offen / frei / abgelaufen / neue Fassung / widerrufen). Den Nachweis
//       (wer, wann, Häkchen, Zweck, Anbieter) sieht nur die Geschäftsleitung.
// POST: { aktion: 'freigeben', funktion, haken[], betriebsrat?, zweck?, dienstleister? }
//       { aktion: 'widerrufen', funktion }
//       nur Geschäftsleitung. Betrieb und Rolle kommen aus der Datenbank, nie
//       vom Browser. Geschrieben wird nur mit dem Service-Schlüssel; die
//       Tabellen haben keine Regel für Nutzer. Jede Aktion landet im Protokoll.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function anmeldung() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

const SPALTEN = 'funktion, fassung, haken, betriebsrat, zweck, dienstleister, bestaetigt_name, bestaetigt_am, gueltig_bis, widerrufen_am';

export async function GET() {
  const user = await anmeldung();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, user.id);
  const istChef = ich.rolle === 'chef';
  const { data, error } = await admin.from('rechts_freigabe').select(SPALTEN).eq('owner_user_id', ich.betrieb).limit(100);
  // Ohne SQL (Tabelle fehlt) gilt alles als offen — gesperrt, nie frei.
  const zeilen = new Map<string, FreigabeZeile>();
  if (!error) for (const z of (data ?? []) as FreigabeZeile[]) if (z.funktion) zeilen.set(z.funktion, z);
  const jetzt = new Date();
  const funktionen = FREIGABEN.map((f) => {
    const z = zeilen.get(f.key) ?? null;
    const stand = freigabeStand(f, z, jetzt);
    return {
      key: f.key, titel: f.titel, wofuer: f.wofuer, warum: f.warum, wo: f.wo, verfuegbar: f.verfuegbar,
      haken: f.haken, betriebsrat: f.betriebsrat, zweck: f.zweck, dienstleister: f.dienstleister,
      stand, sperrText: stand.aktiv ? null : sperrText(f, stand, istChef),
      nachweis: istChef && z?.bestaetigt_am ? {
        name: z.bestaetigt_name ?? null, am: z.bestaetigt_am, fassung: z.fassung ?? null,
        haken: Array.isArray(z.haken) ? z.haken : [], betriebsrat: z.betriebsrat ?? null,
        zweck: z.zweck ?? null, dienstleister: z.dienstleister ?? null, widerrufenAm: z.widerrufen_am ?? null,
      } : null,
    };
  });
  return NextResponse.json({ ok: true, rolle: istChef ? 'chef' : 'mitarbeiter', bereit: !error, funktionen }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await anmeldung();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, user.id);
  const jetzt = new Date();
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = String(meta.full_name ?? meta.name ?? user.email ?? 'Geschäftsleitung').slice(0, 120);

  if (body.aktion === 'widerrufen') {
    const d = widerrufPruefen({ rolle: ich.rolle, funktion: body.funktion });
    if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });
    const { data, error } = await admin.from('rechts_freigabe')
      .update({ widerrufen_am: jetzt.toISOString(), widerrufen_von: user.id, geaendert_am: jetzt.toISOString() })
      .eq('owner_user_id', ich.betrieb).eq('funktion', d.f.key).is('widerrufen_am', null).select('funktion');
    if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ ok: false, error: 'Diese Funktion ist nicht freigegeben.' }, { status: 409 });
    await admin.from('rechts_freigabe_protokoll').insert({
      owner_user_id: ich.betrieb, funktion: d.f.key, aktion: 'widerrufen', durch_user_id: user.id, durch_name: name,
    });
    return NextResponse.json({ ok: true, meldung: `„${d.f.titel}" ist widerrufen und ab sofort gesperrt.` });
  }

  if (body.aktion !== 'freigeben') return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  const d = freigabePruefen({
    rolle: ich.rolle, funktion: body.funktion, haken: body.haken,
    betriebsrat: body.betriebsrat, zweck: body.zweck, dienstleister: body.dienstleister,
  });
  if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });
  const bis = gueltigBis(jetzt);
  const zeile = {
    owner_user_id: ich.betrieb, funktion: d.f.key, fassung: d.f.fassung, haken: d.eingabe.haken,
    betriebsrat: d.eingabe.betriebsrat, zweck: d.eingabe.zweck, dienstleister: d.eingabe.dienstleister,
    bestaetigt_von: user.id, bestaetigt_name: name, bestaetigt_am: jetzt.toISOString(), gueltig_bis: bis,
    widerrufen_am: null, widerrufen_von: null, geaendert_am: jetzt.toISOString(),
  };
  const { error } = await admin.from('rechts_freigabe').upsert(zeile, { onConflict: 'owner_user_id,funktion' });
  if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar. Ist das SQL zu Paket 287 eingespielt?' }, { status: 500 });
  await admin.from('rechts_freigabe_protokoll').insert({
    owner_user_id: ich.betrieb, funktion: d.f.key, aktion: 'freigegeben', fassung: d.f.fassung, haken: d.eingabe.haken,
    betriebsrat: d.eingabe.betriebsrat, zweck: d.eingabe.zweck, dienstleister: d.eingabe.dienstleister,
    gueltig_bis: bis, durch_user_id: user.id, durch_name: name,
  });
  return NextResponse.json({ ok: true, meldung: `„${d.f.titel}" ist freigegeben bis ${datumDe(bis)}. Ab 30 Tagen vor Ablauf weist die Seite auf die Erneuerung hin.` });
}
