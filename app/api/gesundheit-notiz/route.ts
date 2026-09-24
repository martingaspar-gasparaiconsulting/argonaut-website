// ============================================================================
// ARGONAUT OS · app/api/gesundheit-notiz/route.ts — geschützte Gesundheitsangaben (Paket PQ, H03)
//
//   GET    ?kunde=<uuid>        -> { ok, notizen: [{ id, art, text, erstellt_am, von_mir, unlesbar }] }
//   POST   { kunde_id, art, text } -> { ok, id }
//   DELETE ?id=<uuid>           -> { ok }            (nur Inhaber)
//
// Regeln:
//   - Nur eingeloggt. Wer darf, entscheidet die Datenbank (RLS, pq-gesundheit.sql):
//     der Inhaber und Mitarbeiter, die er ausdrücklich freigegeben hat.
//   - Der Schlüssel liegt NUR hier auf dem Server (GESUNDHEIT_SCHLUESSEL).
//     Fehlt er, geht nichts — auch kein Speichern im Klartext.
//   - Jeder Zugriff wird VOR dem Entschlüsseln bzw. Speichern protokolliert.
//     Schlägt das Protokoll fehl, gibt es keine Daten (fail closed).
//   - Mit dem Nutzer-Login, nie mit dem Service-Key.
// ============================================================================
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { leseSchluessel, verschluessele, entschluessele, bindung } from '@/lib/gesundheitsdaten';
import { pruefeNotiz, type ZugriffAktion } from '@/lib/praxis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Client = Awaited<ReturnType<typeof createClient>>;

function fehler(meldung: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: meldung, code }, { status });
}

function schluessel() {
  return leseSchluessel(process.env.GESUNDHEIT_SCHLUESSEL);
}
const OHNE_SCHLUESSEL = 'Die geschützte Ablage ist noch nicht eingerichtet (Schlüssel fehlt auf dem Server).';

function fehltTabelle(msg: string | undefined): boolean {
  return /gesundheit_(notiz|zugriff|freigabe)/.test(String(msg ?? '')) && /(does not exist|not find|schema cache)/i.test(String(msg ?? ''));
}

/** Zu welchem Betrieb gehört der Kunde, und darf der Nutzer an dessen Gesundheitsangaben? */
async function berechtigung(sb: Client, userId: string, kundeId: string): Promise<{ owner: string } | { fehler: NextResponse }> {
  const { data: k } = await sb.from('wellness_kunden').select('id, owner_user_id').eq('id', kundeId).maybeSingle();
  const owner = (k as { owner_user_id?: string } | null)?.owner_user_id;
  if (!owner) return { fehler: fehler('Kunde nicht gefunden.', 404) };
  if (owner === userId) return { owner };
  const { data: f, error } = await sb.from('gesundheit_freigabe').select('id').eq('owner_user_id', owner).eq('auth_user_id', userId).maybeSingle();
  if (error && fehltTabelle(error.message)) return { fehler: fehler('Die Gesundheits-Ablage ist noch nicht eingerichtet (SQL von Paket PQ fehlt).', 503, 'kein_sql') };
  if (!f) return { fehler: fehler('Für Gesundheitsangaben sind Sie nicht freigegeben. Bitte beim Inhaber melden.', 403, 'keine_freigabe') };
  return { owner };
}

async function protokolliere(sb: Client, e: { owner: string; kunde_id: string; notiz_id?: string | null; aktion: ZugriffAktion; anzahl?: number }): Promise<boolean> {
  const { error } = await sb.from('gesundheit_zugriff').insert({
    owner_user_id: e.owner, kunde_id: e.kunde_id, notiz_id: e.notiz_id ?? null, aktion: e.aktion, anzahl: e.anzahl ?? 1,
  });
  return !error;
}

export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const kunde = new URL(req.url).searchParams.get('kunde') ?? '';
  if (!UUID.test(kunde)) return fehler('Ungültiger Kunde.');
  const key = schluessel();
  if (!key) return fehler(OHNE_SCHLUESSEL, 503, 'kein_schluessel');

  const b = await berechtigung(sb, user.id, kunde);
  if ('fehler' in b) return b.fehler;

  const { data, error } = await sb.from('gesundheit_notiz')
    .select('id, owner_user_id, kunde_id, art, inhalt, erstellt_am, erstellt_von')
    .eq('kunde_id', kunde).order('erstellt_am', { ascending: false }).limit(200);
  if (error) {
    return fehltTabelle(error.message)
      ? fehler('Die Gesundheits-Ablage ist noch nicht eingerichtet (SQL von Paket PQ fehlt).', 503, 'kein_sql')
      : fehler('Laden fehlgeschlagen.', 500);
  }
  const zeilen = (data as Array<{ id: string; owner_user_id: string; kunde_id: string; art: string; inhalt: string; erstellt_am: string; erstellt_von: string | null }>) ?? [];

  // Erst protokollieren, dann entschlüsseln.
  if (!(await protokolliere(sb, { owner: b.owner, kunde_id: kunde, aktion: 'lesen', anzahl: zeilen.length }))) {
    return fehler('Der Zugriff konnte nicht protokolliert werden — aus Sicherheitsgründen werden keine Daten angezeigt.', 500, 'kein_protokoll');
  }

  const notizen = zeilen.map((z) => {
    const text = entschluessele(z.inhalt, key, bindung(z.owner_user_id, z.kunde_id));
    return { id: z.id, art: z.art, text: text ?? '', unlesbar: text === null, erstellt_am: z.erstellt_am, von_mir: z.erstellt_von === user.id };
  });
  return NextResponse.json({ ok: true, notizen, darf_loeschen: b.owner === user.id }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const kunde = String(body.kunde_id ?? '');
  if (!UUID.test(kunde)) return fehler('Ungültiger Kunde.');
  const pf = pruefeNotiz({ art: body.art, text: body.text });
  if (pf) return fehler(pf);
  const key = schluessel();
  if (!key) return fehler(OHNE_SCHLUESSEL, 503, 'kein_schluessel');

  const b = await berechtigung(sb, user.id, kunde);
  if ('fehler' in b) return b.fehler;

  const id = randomUUID();
  if (!(await protokolliere(sb, { owner: b.owner, kunde_id: kunde, notiz_id: id, aktion: 'anlegen' }))) {
    return fehler('Der Zugriff konnte nicht protokolliert werden — es wurde nichts gespeichert.', 500, 'kein_protokoll');
  }
  const { error } = await sb.from('gesundheit_notiz').insert({
    id, owner_user_id: b.owner, kunde_id: kunde, art: String(body.art),
    inhalt: verschluessele(String(body.text).trim(), key, bindung(b.owner, kunde)),
  });
  if (error) return fehler(fehltTabelle(error.message) ? 'SQL von Paket PQ fehlt.' : 'Speichern nicht erlaubt oder fehlgeschlagen.', error.code === '42501' ? 403 : 500);
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return fehler('Ungültige Angabe.');

  const { data } = await sb.from('gesundheit_notiz').select('id, owner_user_id, kunde_id').eq('id', id).maybeSingle();
  const z = data as { owner_user_id: string; kunde_id: string } | null;
  if (!z) return fehler('Nicht gefunden.', 404);
  if (z.owner_user_id !== user.id) return fehler('Löschen darf nur der Inhaber.', 403);

  if (!(await protokolliere(sb, { owner: z.owner_user_id, kunde_id: z.kunde_id, notiz_id: id, aktion: 'loeschen' }))) {
    return fehler('Der Zugriff konnte nicht protokolliert werden — es wurde nichts gelöscht.', 500, 'kein_protokoll');
  }
  const { error } = await sb.from('gesundheit_notiz').delete().eq('id', id);
  if (error) return fehler('Löschen fehlgeschlagen.', 500);
  return NextResponse.json({ ok: true });
}
