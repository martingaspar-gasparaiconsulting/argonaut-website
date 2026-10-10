import { NextResponse } from 'next/server';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { kennungGueltig } from '@/lib/kfzAnkauf';
import { angabenBereinigen } from '@/lib/fahrzeugMappe';
import { betriebZuKennung, mappeDb, tokenNeu } from '@/lib/fahrzeugMappeServer';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/fahrzeugmappe/start — Paket 305 · FM1
// ÖFFENTLICH. Legt für einen Verkäufer eine leere Fahrzeugmappe (Entwurf) bei
// GENAU dem Betrieb an, dessen Kennung auf der Seite steht. Antwort: der
// persönliche Link-Schlüssel (nur hier einmal im Klartext; gespeichert wird
// allein sein SHA-256-Prüfwert). Mengen-Deckel je Absender (lib/drossel.ts).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return KEIN(400, 'Ungültige Anfrage.');
    const k = typeof b.k === 'string' ? b.k.trim() : '';
    if (!kennungGueltig(k)) return KEIN(404, 'Diese Seite gibt es nicht.');
    const db = mappeDb();
    const zuViel = await drossel(db, 'oeffentlich/fahrzeugmappe/start', { ip: drosselIp(req.headers) });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
    const betrieb = await betriebZuKennung(db, k);
    if (!betrieb) return KEIN(404, 'Das Autohaus nimmt gerade keine Fahrzeugmappen an.');

    const angaben = angabenBereinigen({ wunsch: b.wunsch, gewerblich: b.gewerblich });
    const { token, hash } = tokenNeu();
    const { error } = await db.from('kfz_mappe').insert({
      owner_user_id: betrieb, token_hash: hash, status: 'entwurf',
      wunsch: angaben.wunsch === 'inzahlungnahme' ? 'inzahlungnahme' : 'verkauf', angaben,
    });
    if (error) {
      console.error('fahrzeugmappe/start:', error.message);
      return KEIN(500, 'Die Fahrzeugmappe ist gerade nicht verfügbar. Bitte versuchen Sie es später erneut.');
    }
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('fahrzeugmappe/start Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
