// ============================================================================
// ARGONAUT OS · app/api/schnittstellen/route.ts — verschlüsselte Speicher-Zentrale
//
// GET  -> lädt die Integrationen des Betriebs; geheime Werte werden NIE an den
//         Client zurückgegeben, nur als „gesetzt"-Liste gemeldet.
// POST -> speichert eine Integration; geheime Felder (Passwort-Typ) werden mit
//         AES-256-GCM (lib/crypto) verschlüsselt in betrieb_integrationen abgelegt.
//         Leer gelassenes Geheimfeld => bestehender Wert bleibt unverändert.
// Nur der Chef (RLS-scoped). Nicht-geheime Felder (URLs, Kontonummern) bleiben
// im Klartext, damit die verbrauchenden Module (z. B. DATEV) unverändert lesen.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { bereich, anbieterVon, istInline, type IntegrationTyp } from '@/lib/konnektoren';
import { geheimeFeldKeys, maskiereConfig } from '@/lib/integrationen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { typ: string; anbieter: string; config: Record<string, unknown>; aktiv: boolean };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const { data } = await supabase.from('betrieb_integrationen').select('typ, anbieter, config, aktiv');
  const rows = (data || []) as Row[];
  const integrationen = rows.map((r) => {
    const geheim = geheimeFeldKeys(r.typ, r.anbieter);
    const { config, gesetzt } = maskiereConfig(r.config || {}, geheim);
    return { typ: r.typ, anbieter: r.anbieter, aktiv: r.aktiv, config, gesetzt };
  });
  return NextResponse.json({ ok: true, integrationen });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });
  const roh = body as Record<string, unknown>;

  const typ = String(roh.typ || '');
  const b = bereich(typ as IntegrationTyp);
  if (!b || !istInline(b)) return NextResponse.json({ ok: false, error: 'Unbekannte oder nicht direkt befüllbare Schnittstelle.' }, { status: 400 });

  const anbieterKey = String(roh.anbieter || '');
  const anb = anbieterVon(typ as IntegrationTyp, anbieterKey);
  if (!anb) return NextResponse.json({ ok: false, error: 'Unbekannter Anbieter.' }, { status: 400 });

  const eingang = (roh.config && typeof roh.config === 'object') ? (roh.config as Record<string, unknown>) : {};
  const geheim = geheimeFeldKeys(typ, anbieterKey);
  const istDemo = !!anb.demo;
  const aktivGewuenscht = !!roh.aktiv && !istDemo;

  // Bestehende Zeile: unverändert gelassene Geheimnisse übernehmen wir daraus.
  const { data: alt } = await supabase.from('betrieb_integrationen')
    .select('config').eq('owner_user_id', user.id).eq('typ', typ).maybeSingle();
  const altConfig = ((alt?.config) || {}) as Record<string, unknown>;

  const neuGeheim = geheim.filter((k) => { const v = eingang[k]; return v != null && String(v) !== ''; });
  if (neuGeheim.length && !encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Verschlüsselung ist serverseitig nicht konfiguriert (APP_ENC_KEY fehlt). Bitte den 32-Byte-Schlüssel in den Umgebungsvariablen setzen.' }, { status: 503 });
  }

  const gespeichert: Record<string, unknown> = {};
  for (const f of (anb.felder || [])) {
    const k = f.key;
    const wert = eingang[k];
    if (geheim.includes(k)) {
      if (wert != null && String(wert) !== '') gespeichert[k] = verschluessele(String(wert));
      else if (altConfig[k] != null) gespeichert[k] = altConfig[k]; // unverändert behalten
    } else {
      gespeichert[k] = wert == null ? '' : String(wert);
    }
  }

  if (aktivGewuenscht) {
    const fehlt = (anb.felder || []).filter((f) => {
      const v = gespeichert[f.key];
      return v == null || String(v) === '';
    });
    if (fehlt.length) return NextResponse.json({ ok: false, error: `Bitte alle Felder ausfüllen: ${fehlt.map((f) => f.label).join(', ')}` }, { status: 400 });
  }

  const { error } = await supabase.from('betrieb_integrationen').upsert({
    owner_user_id: user.id, typ, anbieter: anbieterKey, config: gespeichert,
    aktiv: istDemo ? false : aktivGewuenscht, aktualisiert_am: new Date().toISOString(),
  }, { onConflict: 'owner_user_id,typ' });
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
