import { NextResponse } from 'next/server';
import { cronGuard } from '@/lib/cronGuard';
import { createAdminClient } from '@/lib/supabase-admin';
import { sicherungsDurchgang } from '@/lib/speicherSicherungServer';

// ============================================================================
// ARGONAUT OS · /api/cron/speicher-sicherung — Datei-Sicherung (Paket 350, A2)
//
// Stündlich zur Minute 40 (vercel.json). Jede neue oder geänderte Datei im
// Supabase-Speicher geht VERSCHLÜSSELT (AES-256-GCM) an den zweiten Ort
// (S3-kompatibel, Deutschland). Zeitbudget 240 s, der Rest folgt im nächsten
// Durchgang. Einmal am Tag: in der Quelle gelöschte Dateien abgleichen
// (nach 30 Tagen auch im Ziel löschen). Fehler oder über 26 Stunden ohne
// fehlerfreien Durchgang -> Glocke an den Betreiber.
//
// Ohne die sechs Umgebungsvariablen SPEICHER_SICHERUNG_*: „nicht eingerichtet",
// es passiert nichts. Zugang NUR über das Zeitplan-Geheimnis (CRON_SECRET).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const absage = await cronGuard(req);
  if (absage) return absage;
  const bericht = await sicherungsDurchgang(createAdminClient(), { ausgeloest: 'zeitplan' });
  return NextResponse.json(bericht, { status: bericht.ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
}
