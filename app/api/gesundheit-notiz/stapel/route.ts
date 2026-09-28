// ============================================================================
// ARGONAUT OS · app/api/gesundheit-notiz/stapel/route.ts — Gesundheitsangaben
// aus einem Import verschluesselt ablegen (Paket 153, 28.09.2026)
//
//   POST { notizen: [{ kunde_id, art, text }, …] }  (hoechstens 200)
//        -> { ok, angelegt }
//
// Vorgebaut, GESPERRT bis zur Anwalt-Freigabe (lib/anwaltFreigabe.ts,
// Bereich 'gesundheit'). Die Sperre gilt hier auf dem Server zusaetzlich zur
// Seite — ein direkter Aufruf wird genauso abgelehnt.
//
// Regeln wie /api/gesundheit-notiz:
//   - Nur eingeloggt, mit dem Nutzer-Login (nie Service-Key); RLS entscheidet mit.
//   - Nur die Geschaeftsleitung: jeder Patient muss dem eigenen Betrieb gehoeren.
//   - Schluessel NUR hier (GESUNDHEIT_SCHLUESSEL). Fehlt er: nichts, auch kein Klartext.
//   - Protokoll VOR dem Speichern (eine Zeile je Patient, aktion 'anlegen').
//     Klappt das Protokoll nicht, wird nichts gespeichert (fail closed).
//   - Alles oder nichts: die Notizen einer Anfrage gehen in EINEM insert.
// ============================================================================
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { leseSchluessel, verschluessele, bindung } from '@/lib/gesundheitsdaten';
import { pruefeStapel, anzahlJePatient } from '@/lib/gesundheitImport';
import { anwaltSperrGrund } from '@/lib/anwaltFreigabe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fehler(meldung: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: meldung, code }, { status });
}

export async function POST(req: Request) {
  const sperre = anwaltSperrGrund('gesundheit');
  if (sperre) return fehler(sperre, 403, 'anwalt');

  let body: unknown;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);

  const p = pruefeStapel(body);
  if (!p.ok) return fehler(p.fehler);
  const key = leseSchluessel(process.env.GESUNDHEIT_SCHLUESSEL);
  if (!key) return fehler('Die geschützte Ablage ist noch nicht eingerichtet (Schlüssel fehlt auf dem Server).', 503, 'kein_schluessel');

  // Jeder Patient muss dem eigenen Betrieb gehoeren (Import macht nur die Geschaeftsleitung).
  const jePatient = anzahlJePatient(p.notizen);
  const ids = [...jePatient.keys()];
  const { data: kunden, error: ek } = await sb.from('wellness_kunden').select('id, owner_user_id').in('id', ids);
  if (ek) return fehler('Patienten konnten nicht geprüft werden.', 500);
  const eigene = new Set(((kunden ?? []) as { id: string; owner_user_id: string }[])
    .filter((k) => k.owner_user_id === user.id).map((k) => String(k.id)));
  if (ids.some((id) => !eigene.has(id))) return fehler('Gesundheitsangaben importiert nur die Geschäftsleitung für eigene Patienten.', 403, 'nicht_eigen');

  // Protokoll zuerst — ohne Protokoll keine Daten.
  const { error: ep } = await sb.from('gesundheit_zugriff').insert(ids.map((kunde) => ({
    owner_user_id: user.id, kunde_id: kunde, notiz_id: null, aktion: 'anlegen', anzahl: jePatient.get(kunde) ?? 1,
  })));
  if (ep) return fehler('Der Zugriff konnte nicht protokolliert werden — es wurde nichts gespeichert.', 500, 'kein_protokoll');

  const zeilen = p.notizen.map((n) => ({
    id: randomUUID(), owner_user_id: user.id, kunde_id: n.kunde_id, art: n.art,
    inhalt: verschluessele(n.text, key, bindung(user.id, n.kunde_id)),
  }));
  const { error } = await sb.from('gesundheit_notiz').insert(zeilen);
  if (error) return fehler('Speichern nicht erlaubt oder fehlgeschlagen.', error.code === '42501' ? 403 : 500);
  return NextResponse.json({ ok: true, angelegt: zeilen.length });
}
