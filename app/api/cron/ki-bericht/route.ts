import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { SCHWELLEN } from '../../../../lib/schwellen';
import { sendeMail, mailLayout } from '../../../../lib/mail';

// ============================================================================
// ARGONAUT OS · app/api/cron/ki-bericht/route.ts
//
// MONATSBERICHT zur KI-Nutzung — geht ausschliesslich an den BETREIBER, nie an
// den Kunden. Zeigt je Betrieb: Firmen-Topf, tatsaechliche Nutzung, Kosten und
// vor allem die VERTEILUNG — wer nutzt viel, wie viele Sitze liegen brach.
//
// Warum das wichtig ist: Die KI-Nutzung ist in jedem Betrieb ungleich verteilt.
// Zwei, drei Poweruser machen den Grossteil, viele Kollegen fassen sie kaum an.
// Der Bericht macht genau das sichtbar — und damit zwei Dinge verhandelbar:
//   · faellt ein Betrieb dauerhaft ueber den Topf, kann man darueber reden,
//   · liegen viele Sitze brach, zahlt der Kunde womoeglich zu viel (Jahresgespraech).
//
// Aufloesung: rollende 30 Tage. Cron laeuft am 1. jeden Monats.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAGE = 30;

function service() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type ServiceClient = ReturnType<typeof service>;

/** Cron-Secret ODER eingeloggter Admin. Ohne beides: 403. */
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
  return p?.role === 'admin';
}

type Zeile = { user_id: string | null; kosten_usd: number | null };
type Mitarbeiter = {
  auth_user_id: string | null;
  owner_user_id: string | null;
  nutzer_typ: string | null;
  vorname: string | null;
  nachname: string | null;
};

type BetriebsBericht = {
  tenantId: string;
  firma: string;
  pool: number;
  aufrufe: number;
  kostenUsd: number;
  sitzeGesamt: number;
  aktiveNutzer: number;
  top: { name: string; anzahl: number }[];
};

function euroName(m: Mitarbeiter): string {
  const n = [m.vorname, m.nachname].filter(Boolean).join(' ').trim();
  return n || 'Unbenannt';
}

async function baueBericht(admin: ServiceClient): Promise<BetriebsBericht[]> {
  const seit = new Date(Date.now() - TAGE * 86_400_000).toISOString();

  const [{ data: mitarbeiterRoh }, { data: nutzungRoh }, { data: profileRoh }] = await Promise.all([
    admin.from('mitarbeiter').select('auth_user_id, owner_user_id, nutzer_typ, vorname, nachname'),
    admin.from('ki_nutzung').select('user_id, kosten_usd').gte('created_at', seit).neq('route', '_warnung'),
    admin.from('profiles').select('*'),
  ]);

  const team = (mitarbeiterRoh as Mitarbeiter[] | null) || [];
  const nutzung = (nutzungRoh as Zeile[] | null) || [];
  const profile = (profileRoh as Array<Record<string, unknown>> | null) || [];

  /**
   * Firmenname robust lesen: in profiles existieren historisch mehrere Spalten
   * (firma_name, firma, company_name, company). Wir nehmen die erste gefuellte,
   * damit der Bericht nie an einem fehlenden Feld scheitert.
   */
  const firmaAus = (p: Record<string, unknown>): string => {
    for (const k of ['firma_name', 'firma', 'company_name', 'company', 'email']) {
      const v = p[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '—';
  };

  const firmaVon = new Map(profile.map((p) => [String(p.id), firmaAus(p)]));

  // Login-ID -> Tenant und Anzeigename
  const tenantVonUser = new Map<string, string>();
  const nameVonUser = new Map<string, string>();
  const sitzeJeTenant = new Map<string, number>();
  const poolJeTenant = new Map<string, number>();

  // Chef zaehlt in jedem Betrieb als Voll-Sitz.
  for (const p of profile) {
    const id = String(p.id);
    tenantVonUser.set(id, id);
    nameVonUser.set(id, 'Chef / Inhaber');
    poolJeTenant.set(id, SCHWELLEN.ki.tagProSitz.voll);
    sitzeJeTenant.set(id, 1);
  }

  for (const m of team) {
    const tenant = m.owner_user_id;
    if (!tenant) continue;
    const typ = m.nutzer_typ && SCHWELLEN.ki.tagProSitz[m.nutzer_typ] ? m.nutzer_typ : 'standard';
    poolJeTenant.set(tenant, (poolJeTenant.get(tenant) ?? SCHWELLEN.ki.tagProSitz.voll) + SCHWELLEN.ki.tagProSitz[typ]);
    sitzeJeTenant.set(tenant, (sitzeJeTenant.get(tenant) ?? 1) + 1);
    if (m.auth_user_id) {
      tenantVonUser.set(m.auth_user_id, tenant);
      nameVonUser.set(m.auth_user_id, `${euroName(m)} (${typ})`);
    }
  }

  // Nutzung je Tenant und je Nutzer zusammenzaehlen.
  const aufrufeJeTenant = new Map<string, number>();
  const kostenJeTenant = new Map<string, number>();
  const jeNutzer = new Map<string, Map<string, number>>();

  for (const z of nutzung) {
    if (!z.user_id) continue;
    const tenant = tenantVonUser.get(z.user_id);
    if (!tenant) continue;
    aufrufeJeTenant.set(tenant, (aufrufeJeTenant.get(tenant) || 0) + 1);
    kostenJeTenant.set(tenant, (kostenJeTenant.get(tenant) || 0) + (Number(z.kosten_usd) || 0));
    if (!jeNutzer.has(tenant)) jeNutzer.set(tenant, new Map());
    const m = jeNutzer.get(tenant)!;
    m.set(z.user_id, (m.get(z.user_id) || 0) + 1);
  }

  const berichte: BetriebsBericht[] = [];
  for (const [tenantId, aufrufe] of aufrufeJeTenant) {
    const nutzerMap = jeNutzer.get(tenantId) || new Map<string, number>();
    const top = [...nutzerMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, anzahl]) => ({ name: nameVonUser.get(uid) || uid, anzahl }));
    berichte.push({
      tenantId,
      firma: firmaVon.get(tenantId) || '—',
      pool: poolJeTenant.get(tenantId) ?? SCHWELLEN.ki.tagProSitz.voll,
      aufrufe,
      kostenUsd: kostenJeTenant.get(tenantId) || 0,
      sitzeGesamt: sitzeJeTenant.get(tenantId) ?? 1,
      aktiveNutzer: nutzerMap.size,
      top,
    });
  }
  return berichte.sort((a, b) => b.aufrufe - a.aufrufe);
}

function alsHtml(berichte: BetriebsBericht[]): string {
  if (!berichte.length) {
    return '<p style="margin:0;">In den letzten 30 Tagen wurde die KI von keinem Konto genutzt.</p>';
  }
  const gesamtKosten = berichte.reduce((a, b) => a + b.kostenUsd, 0);
  const gesamtAufrufe = berichte.reduce((a, b) => a + b.aufrufe, 0);

  const bloecke = berichte.map((b) => {
    const poolMonat = b.pool * TAGE;
    const quote = Math.round((b.aufrufe / Math.max(1, poolMonat)) * 100);
    const brach = b.sitzeGesamt - b.aktiveNutzer;
    const ampel = quote >= 100 ? '#e06666' : quote >= 70 ? '#C9A84C' : '#4CAF7D';
    const liste = b.top
      .map((t) => `<li>${t.name}: <b>${t.anzahl}</b> Aufrufe (${Math.round((t.anzahl / Math.max(1, b.aufrufe)) * 100)} % des Betriebs)</li>`)
      .join('');
    return `
      <div style="border:1px solid #e2e8f0;border-left:4px solid ${ampel};border-radius:10px;padding:14px 16px;margin:0 0 14px;">
        <p style="margin:0 0 6px;font-weight:700;font-size:15px;">${b.firma}</p>
        <p style="margin:0 0 10px;font-size:13px;color:#5a6675;">
          ${b.aufrufe.toLocaleString('de-DE')} Aufrufe in 30 Tagen · Topf ${poolMonat.toLocaleString('de-DE')} ·
          <b style="color:${ampel};">${quote} % ausgeschoepft</b> · Kosten ${b.kostenUsd.toFixed(2)} USD
        </p>
        <p style="margin:0 0 6px;font-size:13px;color:#5a6675;">
          ${b.sitzeGesamt} Sitze · ${b.aktiveNutzer} aktiv${brach > 0 ? ` · <b>${brach} ungenutzt</b>` : ''}
        </p>
        <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#5a6675;">${liste}</ul>
      </div>`;
  }).join('');

  return `
    <p style="margin:0 0 14px;">KI-Nutzung der letzten ${TAGE} Tage — <b>${gesamtAufrufe.toLocaleString('de-DE')} Aufrufe</b>,
    Gesamtkosten <b>${gesamtKosten.toFixed(2)} USD</b> ueber ${berichte.length} Betrieb(e).</p>
    ${bloecke}
    <p style="margin:14px 0 0;font-size:12px;color:#8e9cad;">
      Gruen = unter 70 % des Topfs · Gold = 70 bis 99 % · Rot = ueber 100 % (laeuft im stillen Puffer).
      Viele ungenutzte Sitze sind ein Gespraechsanlass fuers Jahresgespraech.
    </p>`;
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  try {
    const admin = service();
    const berichte = await baueBericht(admin);
    const html = mailLayout('KI-Monatsbericht', alsHtml(berichte));
    const r = await sendeMail({
      an: 'info@argonaut-os.com',
      betreff: `ARGONAUT: KI-Monatsbericht — ${berichte.length} Betrieb(e)`,
      html,
    });
    return NextResponse.json({
      ok: true,
      betriebe: berichte.length,
      aufrufe: berichte.reduce((a, b) => a + b.aufrufe, 0),
      kostenUsd: Number(berichte.reduce((a, b) => a + b.kostenUsd, 0).toFixed(2)),
      mailVersendet: r.ok,
    });
  } catch (e) {
    console.error('[ki-bericht] fehlgeschlagen:', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Fehler' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return lauf(req);
}
export async function POST(req: Request) {
  return lauf(req);
}
