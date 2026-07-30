import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { sendeMail } from '../../../../lib/mail';
import { autoresponderMailHtml, autoresponderAbmeldeUrl } from '../../../../lib/newsletter';
import {
  faelligerSchritt,
  naechsterAktiverSchrittNachPosition,
  tageAddieren,
} from '../../../../lib/autoresponder';

// ============================================================================
// ARGONAUT OS · app/api/cron/autoresponder/route.ts  (Paket 2)
//
// Der Versand-MOTOR. Verschickt faellige Autoresponder-Schritte automatisch:
// je Lauf (status='aktiv', naechster_versand_am <= jetzt) genau den faelligen
// Schritt — im Branding DES KUNDEN, mit Abmelde-Link (§7 UWG). Danach wird der
// Lauf auf den naechsten aktiven Schritt weitergestellt oder auf 'fertig'.
//
// Ausloesung: Vercel Cron (Bearer CRON_SECRET) ODER eingeloggter Admin (Test).
// Demo-Konten senden NICHT (Spam-/Kostenschutz). Service-Role umgeht RLS.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sicherheits-Deckel pro Lauf-Durchgang (verhindert Timeout bei grossen Listen).
const MAX_PRO_DURCHGANG = 300;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type ServiceClient = ReturnType<typeof service>;

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

type Schritt = {
  id: string;
  position: number;
  verzoegerung_tage: number;
  betreff: string;
  inhalt: string;
  aktiv: boolean;
};

type Branding = { firma: string; email: string | undefined; akzent: string | null; demo: boolean };

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  const admin = service();
  const jetzt = new Date().toISOString();

  const { data: laeufeD, error } = await admin
    .from('autoresponder_lauf')
    .select('id, owner_user_id, sequenz_id, email, name, abmelde_token, status, naechste_position, gestartet_am')
    .eq('status', 'aktiv')
    .lte('naechster_versand_am', jetzt)
    .order('naechster_versand_am', { ascending: true })
    .limit(MAX_PRO_DURCHGANG);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const laeufe = (laeufeD ?? []) as Array<{
    id: string;
    owner_user_id: string;
    sequenz_id: string;
    email: string;
    name: string | null;
    abmelde_token: string;
    status: string;
    naechste_position: number;
    gestartet_am: string;
  }>;

  const seqCache = new Map<string, { status: string } | null>();
  const schritteCache = new Map<string, Schritt[]>();
  const brandingCache = new Map<string, Branding>();

  async function seqLaden(id: string) {
    if (!seqCache.has(id)) {
      const { data } = await admin.from('autoresponder_sequenz').select('status').eq('id', id).maybeSingle();
      seqCache.set(id, (data as { status: string } | null) ?? null);
    }
    return seqCache.get(id) ?? null;
  }
  async function schritteLaden(seqId: string): Promise<Schritt[]> {
    if (!schritteCache.has(seqId)) {
      const { data } = await admin
        .from('autoresponder_schritt')
        .select('id, position, verzoegerung_tage, betreff, inhalt, aktiv')
        .eq('sequenz_id', seqId);
      schritteCache.set(seqId, (data ?? []) as Schritt[]);
    }
    return schritteCache.get(seqId) ?? [];
  }
  async function brandingLaden(ownerId: string): Promise<Branding> {
    if (!brandingCache.has(ownerId)) {
      const { data } = await admin
        .from('profiles')
        .select('firma_name, firma_email, firma_akzentfarbe, full_name, demo')
        .eq('id', ownerId)
        .maybeSingle();
      const p = (data ?? {}) as {
        firma_name?: string | null;
        firma_email?: string | null;
        firma_akzentfarbe?: string | null;
        full_name?: string | null;
        demo?: boolean | null;
      };
      brandingCache.set(ownerId, {
        firma: (p.firma_name || '').trim() || (p.full_name || '').trim() || 'Info-Serie',
        email: (p.firma_email || '').trim() || undefined,
        akzent: p.firma_akzentfarbe ?? null,
        demo: !!p.demo,
      });
    }
    return brandingCache.get(ownerId)!;
  }

  let gesendet = 0;
  let fertig = 0;
  let uebersprungen = 0;

  for (const l of laeufe) {
    try {
      const seq = await seqLaden(l.sequenz_id);
      // Sequenz pausiert/geloescht -> nichts tun, nicht weiterstellen.
      if (!seq || seq.status !== 'aktiv') {
        uebersprungen++;
        continue;
      }

      const branding = await brandingLaden(l.owner_user_id);
      // Demo-Konto: kein Versand (Lauf bleibt stehen).
      if (branding.demo) {
        uebersprungen++;
        continue;
      }

      const schritte = await schritteLaden(l.sequenz_id);
      const schritt = faelligerSchritt(schritte, l.naechste_position);
      if (!schritt) {
        await admin.from('autoresponder_lauf').update({ status: 'fertig' }).eq('id', l.id);
        fertig++;
        continue;
      }

      const abmelde = autoresponderAbmeldeUrl(BASIS_URL, l.abmelde_token);
      const html = autoresponderMailHtml(branding.firma, schritt.betreff, schritt.inhalt, abmelde, branding.akzent);
      const r = await sendeMail({
        an: l.email,
        betreff: schritt.betreff,
        html,
        absenderName: branding.firma,
        antwortAn: branding.email,
      });

      await admin.from('autoresponder_versand').insert({
        owner_user_id: l.owner_user_id,
        lauf_id: l.id,
        schritt_id: schritt.id,
        sequenz_id: l.sequenz_id,
        email: l.email,
        betreff: schritt.betreff,
        erfolg: r.ok,
        fehler: r.ok ? null : r.fehler,
      });
      if (r.ok) gesendet++;

      // Weiterstellen auf den naechsten aktiven Schritt, sonst fertig.
      const naechster = naechsterAktiverSchrittNachPosition(schritte, schritt.position);
      if (naechster) {
        await admin
          .from('autoresponder_lauf')
          .update({
            naechste_position: naechster.position,
            naechster_versand_am: tageAddieren(l.gestartet_am, naechster.verzoegerung_tage),
            letzter_versand_am: jetzt,
          })
          .eq('id', l.id);
      } else {
        await admin.from('autoresponder_lauf').update({ status: 'fertig', letzter_versand_am: jetzt }).eq('id', l.id);
        fertig++;
      }
    } catch (e) {
      console.error('Autoresponder-Lauf fehlgeschlagen', l.id, e instanceof Error ? e.message : e);
      uebersprungen++;
    }
  }

  return NextResponse.json({
    ok: true,
    geprueft: laeufe.length,
    gesendet,
    fertig,
    uebersprungen,
    gedeckelt: laeufe.length >= MAX_PRO_DURCHGANG,
  });
}

export async function GET(req: Request) {
  return lauf(req);
}
export async function POST(req: Request) {
  return lauf(req);
}
