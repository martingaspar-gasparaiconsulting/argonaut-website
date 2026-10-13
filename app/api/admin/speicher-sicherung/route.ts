import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { ampel, BESTAETIGUNG_WORT, ENV_NAMEN } from '@/lib/speicherSicherung';
import {
  notfallWiederherstellen, probeWiederherstellung, sicherungKonfig, sicherungsDurchgang, standLaden, zielBuckets,
} from '@/lib/speicherSicherungServer';

// ============================================================================
// ARGONAUT OS · /api/admin/speicher-sicherung — Datei-Sicherung (Paket 350, A2)
//
// Nur der Betreiber (Doppelschloss) UND nur mit eingerichtetem und in dieser
// Sitzung bestätigtem zweiten Faktor (wie die Freigabe-Zentrale).
// GET:  Stand (eingerichtet?, Zahlen, Ampel, Läufe, letzte Probe, Fehler-Dateien)
// POST: { aktion: 'jetzt' }                       — einen Durchgang sofort starten
//       { aktion: 'probe' }                       — Probe-Wiederherstellung
//       { aktion: 'ziel_buckets' }                — welche Buckets liegen im Ziel
//       { aktion: 'wiederherstellen', bucket, weiter, bestaetigt: 'WIEDERHERSTELLEN' }
//         — Notfall: Bucket aus dem Ziel zurück, vorhandene Dateien bleiben
//           unangetastet (nie überschreiben)
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function pruefen(): Promise<NextResponse | null> {
  const { absage } = await betreiberPruefung();
  if (absage) return absage;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const stand = await zweiFaktorStand(supabase, user, true);
  if (!stand.hatFaktor || stand.aal !== 'aal2') {
    return NextResponse.json({ ok: false, error: 'Die Datei-Sicherung öffnet nur mit eingerichteter und bestätigter Zwei-Faktor-Anmeldung.' }, { status: 403 });
  }
  return null;
}

const KEIN_CACHE = { 'cache-control': 'no-store' };

export async function GET() {
  const absage = await pruefen();
  if (absage) return absage;
  const k = sicherungKonfig();
  const s = await standLaden(createAdminClient());
  return NextResponse.json({
    ok: true,
    eingerichtet: k.eingerichtet,
    fehlend: k.eingerichtet ? [] : k.fehlend,
    konfigFehler: k.eingerichtet ? [] : k.fehler,
    envNamen: ENV_NAMEN,
    ziel: k.eingerichtet ? { endpoint: k.cfg.endpoint, region: k.cfg.region, bucket: k.cfg.bucket } : null,
    ampel: ampel(k.eingerichtet, s.sqlFehlt ? null : s.zahlen, s.letzterErfolg, new Date()),
    ...s,
  }, { headers: KEIN_CACHE });
}

export async function POST(req: Request) {
  const absage = await pruefen();
  if (absage) return absage;
  const body = await req.json().catch(() => ({})) as { aktion?: string; bucket?: string; weiter?: string | null; bestaetigt?: string };
  const k = sicherungKonfig();
  if (!k.eingerichtet) {
    return NextResponse.json({ ok: false, error: k.fehler.length ? k.fehler.join(' ') : 'Die Datei-Sicherung ist noch nicht eingerichtet (Umgebungsvariablen fehlen).' }, { status: 400 });
  }
  const admin = createAdminClient();
  try {
    if (body.aktion === 'jetzt') {
      const b = await sicherungsDurchgang(admin, { ausgeloest: 'betreiber' });
      return NextResponse.json({ ok: b.ok, meldung: b.meldung, error: b.ok ? undefined : b.meldung, bericht: b }, { headers: KEIN_CACHE });
    }
    if (body.aktion === 'probe') {
      const p = await probeWiederherstellung(admin, k.cfg);
      return NextResponse.json({ ok: p.ok, meldung: p.meldung, error: p.ok ? undefined : p.meldung, ergebnisse: p.ergebnisse }, { headers: KEIN_CACHE });
    }
    if (body.aktion === 'ziel_buckets') {
      return NextResponse.json({ ok: true, buckets: await zielBuckets(k.cfg) }, { headers: KEIN_CACHE });
    }
    if (body.aktion === 'wiederherstellen') {
      if (String(body.bestaetigt ?? '') !== BESTAETIGUNG_WORT) {
        return NextResponse.json({ ok: false, error: `Zur Sicherheit bitte ${BESTAETIGUNG_WORT} eintippen.` }, { status: 400 });
      }
      const bucket = String(body.bucket ?? '');
      if (!/^[a-z0-9][a-z0-9_.-]{0,62}$/i.test(bucket)) return NextResponse.json({ ok: false, error: 'Ungültiger Bucket.' }, { status: 400 });
      const w = await notfallWiederherstellen(admin, k.cfg, bucket, typeof body.weiter === 'string' ? body.weiter : null);
      return NextResponse.json({ ok: w.ok, meldung: w.meldung, error: w.ok ? undefined : w.meldung, bericht: w }, { headers: KEIN_CACHE });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Fehler.' }, { status: 500 });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
