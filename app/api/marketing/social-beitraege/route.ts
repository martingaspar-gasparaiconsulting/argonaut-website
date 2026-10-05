import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { bereinigeKanaele, validiereBeitrag, validierePlanung } from '@/lib/social';
import { sichereMedienUrl } from '@/lib/landingpages';
import { modulRechtPruefen, type ModulRechtArt } from '@/lib/modulRecht';
import { darfVeroeffentlichen, pruefStandNachSpeichern } from '@/lib/socialPruefung';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-beitraege/route.ts  (Social P1)
//
// Beitraege eines Betriebs anlegen/aendern/loeschen (Entwurf oder eingeplant).
//   GET            -> { liste }
//   POST {..}      -> anlegen/aktualisieren (status 'entwurf' | 'geplant')
//   DELETE ?id=..  -> loeschen
//
// Das echte Veroeffentlichen (status 'gesendet') setzt der Posting-Job
// je Plattform, sobald der Zugang beim Betrieb hinterlegt ist.
// Alles hart auf owner_user_id = Betrieb beschraenkt (Service-Role-Client).
//
// Paket 208 (B1): Modulrecht Marketing (GET sehen, POST/DELETE aendern) —
// vorher konnte jeder Mitarbeiter Beitraege des Betriebs anlegen, aendern und
// loeschen. KI-Entwuerfe (ki: true beim Anlegen) brauchen vor dem Einplanen
// die Pruef-Bestaetigung (geprueft: true); eine Textaenderung hebt sie auf.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function zugang(art: ModulRechtArt): Promise<{ ok: true; betrieb: string; person: string } | { ok: false; antwort: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const recht = await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', art);
  if (!recht.ok) return { ok: false, antwort: NextResponse.json({ ok: false, error: recht.fehler }, { status: recht.status }) };
  return { ok: true, betrieb: recht.betrieb, person: user?.id ?? '' };
}

const FELDER = 'id, text, medien_urls, kanaele, status, geplant_am, created_at';

export async function GET() {
  const z = await zugang('sehen');
  if (!z.ok) return z.antwort;
  const admin = createAdminClient();
  const lies = (felder: string) => admin
    .from('social_beitrag')
    .select(felder)
    .eq('owner_user_id', z.betrieb)
    .order('created_at', { ascending: false });
  // Pruef-Spalten mitlesen; ohne SQL p208 wie bisher.
  let antwort = await lies(FELDER + ', ki_entwurf, geprueft_am');
  if (antwort.error) antwort = await lies(FELDER);
  return NextResponse.json({ ok: true, liste: antwort.data ?? [] });
}

export async function POST(req: Request) {
  const z = await zugang('aendern');
  if (!z.ok) return z.antwort;
  const besitzer = z.betrieb;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const id = (body.id || '').toString().trim() || null;
  const text = (body.text || '').toString().slice(0, 8000);
  const kanaele = bereinigeKanaele(body.kanaele);

  // Medien-URLs saeubern: nur echte http(s)-Links, max 10.
  const medienRoh = Array.isArray(body.medien_urls) ? body.medien_urls : [];
  const medien_urls = medienRoh
    .map((u: unknown) => sichereMedienUrl(typeof u === 'string' ? u : ''))
    .filter((u: string) => !!u)
    .slice(0, 10);

  const status = body.status === 'geplant' ? 'geplant' : 'entwurf';
  const geplant_am = status === 'geplant' && body.geplant_am ? new Date(body.geplant_am).toISOString() : null;

  // Fachliche Pruefung (gleiche Logik wie im Editor).
  const pruef = validiereBeitrag({ text, medienAnzahl: medien_urls.length, kanaele });
  if (!pruef.ok) return NextResponse.json({ ok: false, error: pruef.fehler.join(' ') }, { status: 400 });
  const plan = validierePlanung(status, geplant_am, new Date().toISOString());
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.fehler }, { status: 400 });

  const admin = createAdminClient();
  const jetzt = new Date().toISOString();

  // Pruef-Stand: alter Stand nur beim Aendern. Fehlen die Spalten (SQL p208
  // offen), laeuft alles wie bisher ohne Pruefpflicht.
  type Alt = { text: string | null; ki_entwurf: boolean | null; geprueft_am: string | null; geprueft_von: string | null };
  let alt: Alt | null = null;
  let pruefSpalten = true;
  if (id) {
    const r = await admin.from('social_beitrag').select('text, ki_entwurf, geprueft_am, geprueft_von').eq('id', id).eq('owner_user_id', besitzer).maybeSingle();
    if (r.error) pruefSpalten = false;
    else {
      alt = r.data as Alt | null;
      if (!alt) return NextResponse.json({ ok: false, error: 'Beitrag nicht gefunden.' }, { status: 404 });
    }
  }
  const kiEntwurf = id ? alt?.ki_entwurf === true : body.ki === true;
  const pruefung = pruefStandNachSpeichern(alt, text, body.geprueft === true, jetzt, z.person);
  if (pruefSpalten && status === 'geplant') {
    const darf = darfVeroeffentlichen({ ki_entwurf: kiEntwurf, geprueft_am: pruefung.geprueft_am });
    if (!darf.ok) return NextResponse.json({ ok: false, error: darf.fehler }, { status: 400 });
  }

  const felder: Record<string, unknown> = { text, medien_urls, kanaele, status, geplant_am };
  if (pruefSpalten) Object.assign(felder, pruefung);
  let error;
  let neuId = id;
  if (id) {
    ({ error } = await admin.from('social_beitrag').update(felder).eq('id', id).eq('owner_user_id', besitzer));
  } else {
    let r = await admin.from('social_beitrag').insert({ ...felder, owner_user_id: besitzer, ki_entwurf: kiEntwurf }).select('id').single();
    if (r.error && /ki_entwurf|geprueft/.test(r.error.message || '')) {
      if (kiEntwurf && status === 'geplant') {
        return NextResponse.json({ ok: false, error: 'Die Prüf-Funktion wird gerade eingerichtet (SQL p208 fehlt). Bitte als Entwurf speichern.' }, { status: 503 });
      }
      r = await admin.from('social_beitrag').insert({ text, medien_urls, kanaele, status, geplant_am, owner_user_id: besitzer }).select('id').single();
    }
    error = r.error;
    neuId = (r.data as { id: string } | null)?.id ?? null;
  }

  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, id: neuId });
}

export async function DELETE(req: Request) {
  const z = await zugang('aendern');
  if (!z.ok) return z.antwort;

  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('social_beitrag').delete().eq('id', id).eq('owner_user_id', z.betrieb);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
