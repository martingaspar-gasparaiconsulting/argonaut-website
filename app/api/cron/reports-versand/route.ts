import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { sendeMail, mailLayout } from '@/lib/mail';
import {
  quelle, baueReport, formatWert, pruefeGespeicherten, zeitraumSpanne,
  istFaellig, empfaengerListe,
  type GespeicherterReport,
} from '@/lib/reportBaukasten';

// ============================================================================
// ARGONAUT OS · /api/cron/reports-versand
//
// Schickt gespeicherte Auswertungen nach Plan per Mail. Laeuft taeglich.
//
// ▄▄▄ DER GEFAEHRLICHSTE PUNKT DIESER DATEI ▄▄▄
// Ein Cron hat keine Nutzer-Sitzung und liest mit der Service-Rolle — die
// umgeht RLS vollstaendig. JEDE Abfrage auf eine Quell-Tabelle MUSS deshalb
// .eq('owner_user_id', ...) tragen. Fehlt der Filter an einer Stelle,
// bekommt ein Kunde per Mail die Zahlen eines anderen. Das faellt niemandem
// auf, weil die Zahlen ja plausibel aussehen — und es ist eine meldepflichtige
// Datenpanne, kein Schoenheitsfehler.
//
// Am 18.08. am Schema geprueft: rechnungen, angebote, crm_deal und
// versand_sendung tragen alle owner_user_id als uuid. Kommt je eine Quelle
// dazu, MUSS das vorher genauso geprueft werden.
//
// WARUM DER ABSTAND ZAEHLT UND NICHT DER WOCHENTAG
// Der Cron laeuft taeglich. Ohne Abstandspruefung ginge der „monatliche"
// Bericht jeden Tag raus — 30 Mails statt einer. istFaellig() rechnet den
// Abstand zum letzten tatsaechlichen Versand; ein ausgefallener Lauf holt
// sich damit selbst nach, statt fuer immer verloren zu sein.
//
// AUSLOESUNG: Vercel-Cron (CRON_SECRET) oder eingeloggter Admin.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Hoechstens so viele Berichte je Durchgang — der Rest kommt morgen. */
const MAX_JE_LAUF = 40;
/** Hoechstens so viele Zeilen je Quelle. Wie im Baukasten. */
const MAX_ZEILEN = 5000;

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

type PlanZeile = GespeicherterReport & {
  owner_user_id: string;
  plan: string | null;
  plan_empfaenger: string | null;
  zuletzt_gesendet: string | null;
};

/** Die Auswertung rechnen — streng auf den Besitzer gefiltert. */
async function rechne(
  db: ReturnType<typeof service>,
  zeile: PlanZeile,
): Promise<{ html: string; betreff: string } | { fehler: string }> {
  const geprueft = pruefeGespeicherten(zeile);
  const q = quelle(geprueft.konfig.quelleKey);
  if (!q) return { fehler: 'Die Quelle gibt es nicht mehr.' };

  const spanne = zeitraumSpanne(geprueft.konfig.zeitraum, new Date());
  const felder = Array.from(new Set([q.datumFeld, ...q.felder.map((f) => f.key)]));

  let abfrage = db
    .from(q.table)
    .select(felder.join(', '))
    // ▼ DER FILTER, OHNE DEN DIESE ROUTE EINE DATENPANNE WAERE ▼
    .eq('owner_user_id', zeile.owner_user_id);

  if (spanne.von) abfrage = abfrage.gte(q.datumFeld, spanne.von);
  if (spanne.bis) abfrage = abfrage.lte(q.datumFeld, spanne.bis + 'T23:59:59');

  const { data, error } = await abfrage.limit(MAX_ZEILEN);
  if (error) return { fehler: error.message };

  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  const erg = baueReport(rows, {
    metrik: geprueft.konfig.metrik,
    summeFeld: geprueft.konfig.summeFeld,
    gruppeFeld: geprueft.konfig.gruppeFeld,
  });

  const gruppeLabel = q.felder.find((f) => f.key === geprueft.konfig.gruppeFeld)?.label ?? 'Gesamt';
  const metrikLabel = geprueft.konfig.metrik === 'anzahl'
    ? 'Anzahl'
    : `Summe ${q.felder.find((f) => f.key === geprueft.konfig.summeFeld)?.label ?? ''}`.trim();

  const zeilenHtml = erg.zeilen.slice(0, 30).map((z) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#1a2332;">${esc(z.gruppe)}</td>
      <td style="padding:6px 0;color:#1a2332;font-weight:700;text-align:right;white-space:nowrap;">${esc(formatWert(z.wert, erg.istGeld))}</td>
      <td style="padding:6px 0 6px 12px;color:#6b7688;text-align:right;white-space:nowrap;">${z.anteil} %</td>
    </tr>`).join('');

  const hinweis = geprueft.ok ? '' : `
    <p style="color:#b45309;font-size:13px;margin:16px 0 0;">
      Hinweis: ${esc(geprueft.fehler.join(' '))}
    </p>`;

  const html = mailLayout(zeile.name, `
    <p>Guten Tag,</p>
    <p>hier ist Ihre Auswertung <b>${esc(zeile.name)}</b> für den Zeitraum
       ${esc(spanne.von || 'Beginn')} bis ${esc(spanne.bis)}.</p>
    <p style="font-size:22px;font-weight:800;color:#0A1628;margin:18px 0 4px;">
      ${esc(formatWert(erg.gesamt, erg.istGeld))}
    </p>
    <p style="color:#6b7688;font-size:13px;margin:0 0 14px;">${esc(metrikLabel)}${geprueft.konfig.gruppeFeld ? ` · nach ${esc(gruppeLabel)}` : ''}</p>
    ${erg.zeilen.length > 0 ? `<table style="border-collapse:collapse;width:100%;font-size:14px;">${zeilenHtml}</table>` : '<p style="color:#6b7688;">Im Zeitraum gab es nichts auszuwerten.</p>'}
    ${erg.zeilen.length > 30 ? `<p style="color:#6b7688;font-size:12px;margin-top:10px;">… und ${erg.zeilen.length - 30} weitere Zeilen. Die vollständige Auswertung steht im Report-Baukasten.</p>` : ''}
    ${hinweis}
    <p style="color:#6b7688;font-size:12px;margin-top:22px;">
      Diese Mail kommt, weil die Auswertung im Report-Baukasten auf automatischen Versand steht.
      Sie lässt sich dort jederzeit abstellen.
    </p>`);

  return { html, betreff: `${zeile.name} — Ihre Auswertung` };
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }

  const db = service();
  const jetzt = new Date();

  const { data, error } = await db
    .from('report_gespeichert')
    .select('id,owner_user_id,name,quelle,metrik,summe_feld,gruppe_feld,zeitraum,plan,plan_empfaenger,zuletzt_gesendet')
    .neq('plan', 'keiner')
    .order('zuletzt_gesendet', { ascending: true, nullsFirst: true })
    .limit(MAX_JE_LAUF * 3);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const alle = (data as PlanZeile[] | null) ?? [];
  const faellig = alle.filter((z) => istFaellig(z.plan, z.zuletzt_gesendet, jetzt)).slice(0, MAX_JE_LAUF);

  if (faellig.length === 0) {
    return NextResponse.json({ ok: true, geprueft: alle.length, gesendet: 0, hinweis: 'Nichts fällig.' });
  }

  const bericht: Array<Record<string, unknown>> = [];
  let gesendet = 0;

  for (const zeile of faellig) {
    const empfaenger = empfaengerListe(zeile.plan_empfaenger);
    if (empfaenger.length === 0) {
      bericht.push({ report: zeile.name, ergebnis: 'kein gültiger Empfänger — übersprungen' });
      continue;
    }

    const gebaut = await rechne(db, zeile);
    if ('fehler' in gebaut) {
      bericht.push({ report: zeile.name, ergebnis: 'nicht gerechnet', meldung: gebaut.fehler });
      continue;
    }

    let zugestellt = 0;
    for (const an of empfaenger) {
      const r = await sendeMail({ an, betreff: gebaut.betreff, html: gebaut.html });
      if (r?.ok !== false) zugestellt++;
    }

    // Der Zeitstempel wird NUR bei tatsaechlichem Versand gesetzt. Sonst gilt
    // der Bericht als erledigt, obwohl niemand ihn bekommen hat — und der
    // naechste kaeme erst in einem Monat.
    if (zugestellt > 0) {
      await db.from('report_gespeichert')
        .update({ zuletzt_gesendet: jetzt.toISOString() })
        .eq('owner_user_id', zeile.owner_user_id)
        .eq('id', zeile.id);
      gesendet++;
    }

    bericht.push({ report: zeile.name, ergebnis: `${zugestellt} von ${empfaenger.length} zugestellt` });
  }

  return NextResponse.json({
    ok: true,
    zeitpunkt: jetzt.toISOString(),
    geprueft: alle.length,
    faellig: faellig.length,
    gesendet,
    bericht,
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
