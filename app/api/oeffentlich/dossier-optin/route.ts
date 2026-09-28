import { NextResponse } from 'next/server';
import { starteDossierOptin } from '@/lib/dossierFunnel';
import { createAdminClient } from '@/lib/supabase-admin';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-optin  (I4 · Double-Opt-In)
// ÖFFENTLICH. POST { email, name?, branche? } -> Lead 'unbestaetigt' anlegen +
// Bestätigungsmail (bzw. bei bereits bestätigten direkt das Dossier).
// Kernlogik in lib/dossierFunnel.ts (geteilt mit /api/website-anfrage).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = (body?.name || '').toString().trim().slice(0, 120) || null;
  const branche = (body?.branche || '').toString().trim().slice(0, 120) || null;

  // S1: Mengen-Deckel je Absender und je Mail-Adresse (lib/drossel.ts) —
  // jede Anfrage verschickt eine Mail an die eingegebene Adresse.
  try {
    const zuViel = await drossel(createAdminClient(), 'oeffentlich/dossier-optin', {
      ip: drosselIp(req.headers), ziel: typeof body?.email === 'string' ? body.email : null,
    });
    if (zuViel) return NextResponse.json({ ok: false, error: drosselText(zuViel) }, { status: 429 });
  } catch { /* ohne Datenbank-Zugang: wie bisher weiter (nie aussperren) */ }

  const ergebnis = await starteDossierOptin(body?.email, name, branche, 'dossier');

  if (ergebnis === 'ungueltig') {
    return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });
  }
  if (ergebnis === 'fehler') {
    return NextResponse.json({ ok: false, error: 'Anfrage fehlgeschlagen. Bitte später erneut versuchen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: ergebnis });
}
