import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { nachsehen, abholen, fasseZusammen, istAbgelaufen, type BatchErgebnis } from '@/lib/kiBatch';
import { parseTextVarianten } from '@/lib/contentFliessband';

// ============================================================================
// ARGONAUT OS · /api/cron/ki-batch-abholen
//
// Der Postbote der Stapel-Verarbeitung. Laeuft alle 15 Minuten und schaut
// nach, ob ein abgeschickter Stapel fertig ist. Ist er es, werden die
// Ergebnisse abgeholt und dorthin geschrieben, wo sie hingehoeren.
//
// Die Route ist billig, wenn nichts offen ist: eine Abfrage, dann Ende.
//
// WICHTIG — ABGELAUFENE STAPEL: Die Schnittstelle gibt nach 24 Stunden auf.
// Ein Stapel, der dann immer noch "laeuft", wird hier abgeschlossen und als
// Fehler markiert. Sonst haengt er ewig in der Liste und der Betrieb wartet
// auf Beitraege, die nie kommen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STAPEL_JE_LAUF = 20;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (p as { role?: string } | null)?.role === 'admin';
}

type Stapel = {
  id: string;
  owner_user_id: string;
  route: string;
  zweck: string | null;
  extern_id: string | null;
  status: string;
  anzahl: number;
  zuordnung: Record<string, Record<string, unknown>>;
  erstellt_am: string;
};

type AdminClient = ReturnType<typeof service>;

/**
 * Ergebnisse eines Content-Fliessband-Stapels als Entwuerfe ablegen.
 * Bewusst als Entwurf und nicht geplant: was ueber Nacht entstanden ist,
 * soll morgens jemand ansehen, bevor es an Kunden geht.
 */
async function verarbeiteFliessband(
  admin: AdminClient, stapel: Stapel, ergebnisse: BatchErgebnis[],
): Promise<{ angelegt: number; fehler: number }> {
  let angelegt = 0, fehler = 0;

  for (const e of ergebnisse) {
    if (!e.ok) { fehler++; continue; }
    const ziel = stapel.zuordnung?.[e.custom_id] ?? {};
    const kanal = typeof ziel.kanal === 'string' ? ziel.kanal : '';
    const anzahl = Number(ziel.anzahl ?? 5) || 5;
    if (!kanal) { fehler++; continue; }

    let texte: string[] = [];
    try {
      texte = parseTextVarianten(e.text, kanal, anzahl).map((v) => String((v as { text?: string })?.text ?? '')).filter(Boolean);
    } catch { texte = []; }

    if (texte.length === 0) { fehler++; continue; }

    const saetze = texte.map((text) => ({
      owner_user_id: stapel.owner_user_id,
      text,
      kanaele: [kanal],
      status: 'entwurf',
      ki_batch_id: stapel.id,
    }));

    const { error } = await admin.from('social_beitrag').insert(saetze);
    if (error) fehler++; else angelegt += saetze.length;
  }

  return { angelegt, fehler };
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }

  const admin = service();
  const jetzt = new Date();

  const { data, error } = await admin.from('ki_batch')
    .select('id,owner_user_id,route,zweck,extern_id,status,anzahl,zuordnung,erstellt_am')
    .in('status', ['wartet', 'laeuft'])
    .order('erstellt_am', { ascending: true })
    .limit(MAX_STAPEL_JE_LAUF);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const offene = (data ?? []) as Stapel[];
  if (offene.length === 0) {
    return NextResponse.json({ ok: true, offen: 0, hinweis: 'Nichts abzuholen.' });
  }

  const bericht: Array<Record<string, unknown>> = [];

  for (const stapel of offene) {
    // Kein Stapel bei der Schnittstelle? Dann ist beim Absenden etwas
    // schiefgegangen — nicht ewig weiterprobieren.
    if (!stapel.extern_id) {
      await admin.from('ki_batch').update({
        status: 'fehler', fehler_text: 'Der Stapel wurde nie abgeschickt.', beendet_am: jetzt.toISOString(),
      }).eq('id', stapel.id);
      bericht.push({ stapel: stapel.zweck ?? stapel.route, ergebnis: 'nie abgeschickt' });
      continue;
    }

    if (istAbgelaufen(stapel.erstellt_am, jetzt)) {
      await admin.from('ki_batch').update({
        status: 'fehler',
        fehler_text: 'Die Schnittstelle hat nach 24 Stunden kein Ergebnis geliefert.',
        beendet_am: jetzt.toISOString(),
      }).eq('id', stapel.id);
      bericht.push({ stapel: stapel.zweck ?? stapel.route, ergebnis: 'abgelaufen' });
      continue;
    }

    const stand = await nachsehen(stapel.extern_id);
    if (!stand.ok) {
      bericht.push({ stapel: stapel.zweck ?? stapel.route, ergebnis: 'Stand nicht abrufbar', meldung: stand.fehler });
      continue;
    }

    if (stand.stand.laeuft) {
      if (stapel.status !== 'laeuft') {
        await admin.from('ki_batch').update({ status: 'laeuft' }).eq('id', stapel.id);
      }
      bericht.push({
        stapel: stapel.zweck ?? stapel.route, ergebnis: 'läuft noch',
        fertig: stand.stand.erfolgreich, offen: stand.stand.verarbeitet,
      });
      continue;
    }

    // Fertig — abholen.
    const geholt = await abholen(stapel.extern_id);
    if (!geholt.ok) {
      bericht.push({ stapel: stapel.zweck ?? stapel.route, ergebnis: 'Abholen fehlgeschlagen', meldung: geholt.fehler });
      continue;
    }

    const zusammen = fasseZusammen(geholt.ergebnisse, stapel.anzahl);
    let verarbeitet = { angelegt: 0, fehler: 0 };

    if (stapel.route === 'content-fliessband') {
      verarbeitet = await verarbeiteFliessband(admin, stapel, geholt.ergebnisse);
    }

    // Die Rohtexte bleiben erhalten — falls die Weiterverarbeitung hakt,
    // ist die (bezahlte) Antwort nicht verloren.
    const roh: Record<string, string> = {};
    for (const e of geholt.ergebnisse) if (e.ok) roh[e.custom_id] = e.text;

    await admin.from('ki_batch').update({
      status: verarbeitet.fehler > 0 && verarbeitet.angelegt === 0 ? 'fehler' : zusammen.status,
      fertig_anzahl: zusammen.fertig,
      fehler_anzahl: zusammen.fehler + verarbeitet.fehler,
      ergebnis: roh,
      fehler_text: zusammen.status === 'fertig' && verarbeitet.fehler === 0 ? null : zusammen.text,
      abgeholt_am: jetzt.toISOString(),
      beendet_am: jetzt.toISOString(),
    }).eq('id', stapel.id);

    bericht.push({
      stapel: stapel.zweck ?? stapel.route,
      ergebnis: zusammen.text,
      ...(stapel.route === 'content-fliessband' ? { entwuerfe_angelegt: verarbeitet.angelegt } : {}),
    });
  }

  return NextResponse.json({ ok: true, zeitpunkt: jetzt.toISOString(), geprueft: offene.length, bericht });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
