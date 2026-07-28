import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { paketModule, branchenPaket, KERN_MODULE } from '../../../../lib/pakete';
import { ALLE_MODUL_KEYS } from '../../../../lib/rechte';
import { sendeMail, mailLayout } from '../../../../lib/mail';

// ============================================================================
// ARGONAUT OS · app/api/admin/kunde-einladen/route.ts  (Onboarding · Baustein 1)
//
// OPERATOR lädt einen NEUEN Kunden per E-Mail ein. Ablauf:
//   1. Admin-Guard (nur profiles.role === 'admin').
//   2. Supabase-Einladungslink erzeugen (generateLink type 'invite') — legt den
//      Auth-Nutzer an. Redirect führt über /auth/callback nach /auth/passwort-neu,
//      wo der Kunde SELBST sein Passwort setzt (bestehende Seite, Reiser-Prinzip).
//   3. profiles-Zeile setzen (Firma, Plan, Status) — update-or-insert, ohne die
//      role zu überschreiben (Trigger-kompatibel).
//   4. Optional: gewähltes Branchen-Paket sofort scharfschalten (tenant_module).
//   5. Einladungs-Mail on-brand über Resend (sendeMail + mailLayout) verschicken.
//
// KEIN SQL nötig — profiles und tenant_module existieren bereits.
// Der Einladungslink wird NICHT von Supabase, sondern von uns per Resend
// verschickt (verifizierte Domain argonaut-os.com, volle Marken-Kontrolle).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

/** Türsteher: eingeloggt + role === 'admin'. null = erlaubt. */
async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || profil.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  return null;
}

function istEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  // --- Eingabe ---------------------------------------------------------------
  let body: { email?: string; firma?: string; branchKey?: string; plan?: string; module?: unknown; branche?: string; kategorie?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Ungültiger Body.' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const firma = (body.firma || '').trim();
  const branchKey = (body.branchKey || '').trim();
  const plan = (body.plan || '').trim();
  const brancheName = (body.branche || '').trim();
  const kategorie = (body.kategorie || '').trim();
  const explizitModule = Array.isArray(body.module) ? body.module.map((m) => String(m)) : [];

  if (!istEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
  }

  // Modul-Set bestimmen: explizites Set (Branchen-Katalog) hat Vorrang,
  // sonst der klassische Branchen-Paket-Key (abwärtskompatibel).
  const gueltigeKeys = new Set<string>([...ALLE_MODUL_KEYS, ...KERN_MODULE, 'automatisierungen']);
  const branchePaket = branchKey ? branchenPaket(branchKey) : undefined;
  if (branchKey && !branchePaket) {
    return NextResponse.json({ ok: false, error: `Unbekannte Branche: ${branchKey}` }, { status: 400 });
  }
  let modulSet: string[] = [];
  if (explizitModule.length) modulSet = [...new Set(explizitModule.filter((m) => gueltigeKeys.has(m)))];
  else if (branchePaket) modulSet = paketModule(branchePaket.key);
  const anzeigeBranche = brancheName || branchePaket?.name || '';
  const brancheIcon = branchePaket?.icon ? `${branchePaket.icon} ` : '';

  const admin = getClient();
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/auth/passwort-neu')}`;

  // --- 1. Einladungslink erzeugen (legt den Auth-Nutzer an) ------------------
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.user?.id) {
    const msg = linkErr?.message || 'Einladung fehlgeschlagen.';
    const freundlich = /already|registered|exist/i.test(msg)
      ? 'Diese E-Mail ist bereits registriert.'
      : msg;
    return NextResponse.json({ ok: false, error: freundlich }, { status: 400 });
  }
  const userId = linkData.user.id;
  const actionLink = linkData.properties?.action_link;
  if (!actionLink) {
    return NextResponse.json({ ok: false, error: 'Kein Einladungslink erhalten.' }, { status: 500 });
  }

  // --- 2. profiles setzen (update-or-insert, role NICHT anfassen) ------------
  const felder = {
    email,
    firma_name: firma || null,
    plan: plan || null,
    branche: anzeigeBranche || null,
    kategorie: kategorie || null,
    status: 'active',
    onboarding_completed: false,
  };
  const { data: upd } = await admin.from('profiles').update(felder).eq('id', userId).select('id');
  if (!upd || upd.length === 0) {
    // Kein Trigger-Profil vorhanden -> selbst anlegen.
    const { error: insErr } = await admin.from('profiles').insert({ id: userId, ...felder });
    if (insErr) {
      return NextResponse.json({ ok: false, error: `Kundendatensatz fehlgeschlagen: ${insErr.message}` }, { status: 500 });
    }
  }

  // --- 3. Optional: Branchen-Paket sofort scharfschalten ---------------------
  let freigeschaltet = 0;
  if (modulSet.length) {
    const rows = modulSet.map((modulKey) => ({
      owner_user_id: userId, modul_key: modulKey, aktiv: true,
    }));
    const { error: tmErr } = await admin
      .from('tenant_module')
      .upsert(rows, { onConflict: 'owner_user_id,modul_key' });
    if (tmErr) {
      return NextResponse.json(
        { ok: false, error: `Kunde angelegt, aber Branche nicht freigeschaltet: ${tmErr.message}` },
        { status: 500 },
      );
    }
    freigeschaltet = rows.length;
  }

  // --- 4. Einladungs-Mail on-brand verschicken -------------------------------
  const brancheText = anzeigeBranche ? `<p>Freigeschaltet: <b>${brancheIcon}${anzeigeBranche}</b> (${freigeschaltet} Module).</p>` : '';
  const html = mailLayout(
    'Ihr Zugang steht bereit',
    `<p>Herzlich willkommen bei ARGONAUT OS${firma ? `, ${firma}` : ''}!</p>
     <p>Ihr Zugang wurde eingerichtet. Klicken Sie auf den Button, um Ihr Passwort zu setzen und direkt loszulegen:</p>
     <p style="margin:24px 0;">
       <a href="${actionLink}" style="display:inline-block;background:#C9A84C;color:#0A1628;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:8px;">Passwort setzen &amp; starten</a>
     </p>
     ${brancheText}
     <p style="color:#8FA3BE;font-size:13px;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>${actionLink}</p>`,
  );
  const mail = await sendeMail({ an: email, betreff: 'Willkommen bei ARGONAUT OS — Zugang aktivieren', html });

  return NextResponse.json({
    ok: true,
    userId,
    email,
    branche: anzeigeBranche || null,
    freigeschaltet,
    mailVersandt: mail.ok,
    mailFehler: mail.ok ? null : mail.fehler,
  });
}
