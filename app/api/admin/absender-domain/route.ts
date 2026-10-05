import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import {
  domainPruefen, lokalteilPruefen, eigeneDomainsAn, pruefenErlaubt, absenderAdresse, statusText,
  type AbsenderZeile,
} from '@/lib/absenderDomain';
import {
  absenderCacheLeeren, resendDomainAnlegen, resendDomainPruefen, resendDomainEntfernen,
} from '@/lib/absenderDomainServer';

// ============================================================================
// ARGONAUT OS · /api/admin/absender-domain   (Paket 210, 05.10.2026 · B7)
//
// Der Betreiber richtet für einen Betrieb die eigene Absender-Domain ein.
//   GET  ?betrieb=<id>                                   -> Stand
//   POST { betrieb, aktion: 'anlegen', domain, lokalteil }  -> bei Resend anlegen
//   POST { betrieb, aktion: 'pruefen' }                  -> DNS bei Resend prüfen
//   POST { betrieb, aktion: 'lokalteil', lokalteil }     -> Teil vor dem @ ändern
//   POST { betrieb, aktion: 'aktiv', aktiv: true|false } -> Schalter
//   POST { betrieb, aktion: 'entfernen' }                -> bei Resend löschen, zurück auf Standard
//
// Anlegen nur mit Env RESEND_EIGENE_DOMAINS=an (Resend Pro: 10 Domains,
// Scale: 1.000). Einschalten nur, wenn Resend die Domain bestätigt hat —
// die Datenbank prüft das zusätzlich (Check aktiv_nur_verifiziert).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPALTEN = 'owner_user_id, domain, lokalteil, resend_id, status, dns, aktiv, fehler, angelegt_am, geprueft_am, verifiziert_am';
const istKennung = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

function antwort(ok: boolean, text: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json(ok ? { ok: true, hinweis: text, ...extra } : { ok: false, error: text, ...extra }, { status });
}

type Zeile = AbsenderZeile & {
  resend_id?: string | null; dns?: unknown; fehler?: string | null;
  angelegt_am?: string | null; geprueft_am?: string | null; verifiziert_am?: string | null;
};

function stand(z: Zeile | null) {
  return {
    zeile: z ? {
      domain: z.domain, lokalteil: z.lokalteil, status: z.status, aktiv: z.aktiv, dns: z.dns ?? [],
      fehler: z.fehler ?? null, angelegt_am: z.angelegt_am ?? null, geprueft_am: z.geprueft_am ?? null,
      verifiziert_am: z.verifiziert_am ?? null, adresse: absenderAdresse(z),
    } : null,
    text: statusText(z),
    anlegenMoeglich: eigeneDomainsAn(process.env),
  };
}

async function lade(db: ReturnType<typeof createAdminClient>, betrieb: string): Promise<Zeile | null | 'fehlt'> {
  const { data, error } = await db.from('absender_domain').select(SPALTEN).eq('owner_user_id', betrieb).maybeSingle();
  if (error) return 'fehlt';
  return (data ?? null) as Zeile | null;
}

export async function GET(req: Request) {
  const { absage } = await betreiberPruefung();
  if (absage) return absage;
  const betrieb = (new URL(req.url).searchParams.get('betrieb') || '').trim().toLowerCase();
  if (!istKennung(betrieb)) return antwort(false, 'Betrieb fehlt.', 400);
  const z = await lade(createAdminClient(), betrieb);
  if (z === 'fehlt') return antwort(false, 'Die Tabelle absender_domain fehlt noch (SQL p210 ausführen).', 503);
  return antwort(true, '', 200, stand(z));
}

export async function POST(req: Request) {
  const { absage, userId } = await betreiberPruefung();
  if (absage) return absage;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const betrieb = String(body?.betrieb ?? '').trim().toLowerCase();
  const aktion = String(body?.aktion ?? '');
  if (!istKennung(betrieb)) return antwort(false, 'Betrieb fehlt.', 400);
  const db = createAdminClient();
  const alt = await lade(db, betrieb);
  if (alt === 'fehlt') return antwort(false, 'Die Tabelle absender_domain fehlt noch (SQL p210 ausführen).', 503);
  const jetzt = new Date().toISOString();

  const speichere = async (felder: Record<string, unknown>) => {
    const { error } = await db.from('absender_domain').update({ ...felder, geaendert_am: jetzt }).eq('owner_user_id', betrieb);
    absenderCacheLeeren();
    return error;
  };

  if (aktion === 'anlegen') {
    if (!eigeneDomainsAn(process.env)) {
      return antwort(false, 'Eigene Absender-Domains sind noch nicht eingeschaltet. In Vercel RESEND_EIGENE_DOMAINS=an setzen (Resend Pro: 10 Domains, Scale: 1.000).', 409);
    }
    if (alt && alt.status !== 'entfernt') return antwort(false, 'Für diesen Betrieb ist schon eine Domain eingetragen. Erst entfernen.', 409);
    const d = domainPruefen(body?.domain);
    if (!d.ok) return antwort(false, d.fehler, 400);
    const l = lokalteilPruefen(body?.lokalteil);
    if (!l.ok) return antwort(false, l.fehler, 400);
    const { data: belegt } = await db.from('absender_domain').select('owner_user_id')
      .ilike('domain', d.domain).neq('status', 'entfernt').neq('owner_user_id', betrieb).limit(1);
    if ((belegt ?? []).length > 0) return antwort(false, 'Diese Domain ist schon bei einem anderen Betrieb eingetragen.', 409);
    const r = await resendDomainAnlegen(d.domain);
    if (!r.ok) return antwort(false, `Resend: ${r.fehler}`, 502);
    const { error } = await db.from('absender_domain').upsert({
      owner_user_id: betrieb, domain: d.domain, lokalteil: l.lokalteil, resend_id: r.id,
      status: r.status, dns: r.dns, aktiv: false, fehler: null,
      angelegt_am: jetzt, angelegt_von: userId, geprueft_am: jetzt,
      verifiziert_am: r.status === 'verifiziert' ? jetzt : null, geaendert_am: jetzt,
    }, { onConflict: 'owner_user_id' });
    if (error) {
      await resendDomainEntfernen(r.id);
      return antwort(false, 'Speichern fehlgeschlagen — bei Resend wieder entfernt.', 500);
    }
    absenderCacheLeeren();
    return antwort(true, 'Domain angelegt. Jetzt die DNS-Einträge beim Domain-Anbieter des Betriebs eintragen lassen, dann „Prüfen".', 200, stand(await lade(db, betrieb) as Zeile | null));
  }

  if (!alt || alt.status === 'entfernt') return antwort(false, 'Für diesen Betrieb ist keine Domain eingetragen.', 404);

  if (aktion === 'pruefen') {
    if (!alt.resend_id) return antwort(false, 'Keine Resend-Kennung gespeichert.', 409);
    if (!pruefenErlaubt(alt.geprueft_am, new Date())) return antwort(false, 'Bitte eine Minute warten, dann erneut prüfen.', 429);
    const r = await resendDomainPruefen(alt.resend_id, String(alt.domain));
    if (!r.ok) {
      await speichere({ geprueft_am: jetzt, fehler: r.fehler.slice(0, 500) });
      return antwort(false, `Resend: ${r.fehler}`, 502);
    }
    // Fällt eine bestätigte Domain zurück, wird sie sofort ausgeschaltet.
    const aktiv = r.status === 'verifiziert' ? !!alt.aktiv : false;
    const err = await speichere({
      status: r.status, dns: r.dns, aktiv, fehler: null, geprueft_am: jetzt,
      verifiziert_am: r.status === 'verifiziert' ? (alt.verifiziert_am || jetzt) : alt.verifiziert_am ?? null,
    });
    if (err) return antwort(false, 'Speichern fehlgeschlagen.', 500);
    return antwort(true, r.status === 'verifiziert' ? 'Bestätigt.' : 'Noch nicht bestätigt — DNS-Einträge brauchen manchmal bis zu einigen Stunden.', 200, stand(await lade(db, betrieb) as Zeile | null));
  }

  if (aktion === 'lokalteil') {
    const l = lokalteilPruefen(body?.lokalteil);
    if (!l.ok) return antwort(false, l.fehler, 400);
    const err = await speichere({ lokalteil: l.lokalteil });
    if (err) return antwort(false, 'Speichern fehlgeschlagen.', 500);
    return antwort(true, 'Gespeichert.', 200, stand(await lade(db, betrieb) as Zeile | null));
  }

  if (aktion === 'aktiv') {
    const an = body?.aktiv === true;
    if (an && alt.status !== 'verifiziert') return antwort(false, 'Erst einschalten, wenn Resend die Domain bestätigt hat.', 409);
    const err = await speichere({ aktiv: an });
    if (err) return antwort(false, 'Speichern fehlgeschlagen.', 500);
    return antwort(true, an ? 'Eingeschaltet — Kunden-Mails dieses Betriebs gehen ab jetzt von der eigenen Domain.' : 'Ausgeschaltet — wieder Standard-Absender.', 200, stand(await lade(db, betrieb) as Zeile | null));
  }

  if (aktion === 'entfernen') {
    if (alt.resend_id) {
      const r = await resendDomainEntfernen(alt.resend_id);
      if (!r.ok) return antwort(false, `Resend: ${r.fehler}`, 502);
    }
    const err = await speichere({ status: 'entfernt', aktiv: false, resend_id: null, dns: [] });
    if (err) return antwort(false, 'Speichern fehlgeschlagen.', 500);
    return antwort(true, 'Entfernt — der Betrieb versendet wieder über den Standard-Absender.', 200, stand(await lade(db, betrieb) as Zeile | null));
  }

  return antwort(false, 'Unbekannte Aktion.', 400);
}
