// ============================================================================
// ARGONAUT OS · lib/belegAblageServer.ts — Beleg fest ablegen (Paket 198)
// NUR serverseitig (Route Handler) — nutzt den Server-Schlüssel für Speicher
// und Tabelle. Prüfung, Pfad und Nachweis stehen testbar in lib/belegAblage.ts.
//
// Ablauf (gleich wie Paket 197):
//  1. Datei prüfen (Mahnung = echtes PDF, Zusage = JSON), SHA-256 bilden.
//  2. Gleiche Datei zu diesem Bezug schon abgelegt? Dann nur ein neuer Eintrag,
//     kein zweiter Upload.
//  3. Sonst unverändert in den privaten Ordner „rechnung-ablage" (kein upsert).
//  4. Eintrag in beleg_ablage (ändern/löschen verbietet die Datenbank).
// Wer den Bezug sehen darf, prüft der AUFRUFER vorher (Sitzung bzw. Token).
// ============================================================================

import { createHash } from 'node:crypto';
import { createAdminClient } from './supabase-admin';
import { ABLAGE_BUCKET } from './rechnungAblage';
import { belegAblageFehlt, belegName, belegPfad, istBelegArt, pruefeBelegDatei, type BelegArt } from './belegAblage';

export type BelegErgebnis =
  | { ok: true; id: string; hash: string; neuHochgeladen: boolean }
  | { ok: false; fehler: string; status: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function legeBelegAb(opts: {
  betrieb: string;
  art: BelegArt;
  bezugId: string;             // Rechnung (Mahnung) bzw. Angebot (Zusage)
  bezugNummer?: string | null;
  stufe?: number | null;       // nur Mahnung
  bytes: Uint8Array;
  dateiname?: string | null;
  erstelltVon?: string | null; // leer bei der Zusage über den Link (Kunde, kein Login)
}): Promise<BelegErgebnis> {
  const { betrieb, art, bezugId, bytes } = opts;
  if (!UUID.test(String(betrieb)) || !UUID.test(String(bezugId)) || !istBelegArt(art)) {
    return { ok: false, fehler: 'Ungültige Angabe.', status: 400 };
  }
  const pr = pruefeBelegDatei(bytes, art);
  if (!pr.ok) return { ok: false, fehler: pr.fehler, status: 400 };

  const hash = sha256Hex(bytes);
  const admin = createAdminClient();

  const { data: vorh, error: vErr } = await admin.from('beleg_ablage')
    .select('id, datei_hash, datei_pfad').eq('owner_user_id', betrieb).eq('art', art).eq('bezug_id', bezugId);
  if (vErr) {
    return belegAblageFehlt(vErr.message)
      ? { ok: false, fehler: 'Die Beleg-Ablage ist noch nicht eingerichtet (SQL p198).', status: 503 }
      : { ok: false, fehler: 'Ablage nicht erreichbar: ' + vErr.message, status: 502 };
  }
  const gleich = ((vorh as Array<{ datei_hash: string; datei_pfad: string }> | null) || [])
    .find((z) => z.datei_hash === hash && !!z.datei_pfad) || null;

  const name = belegName(opts.dateiname || art, pr.typ);
  let pfad = gleich?.datei_pfad || '';
  let neu = false;
  if (!pfad) {
    pfad = belegPfad(betrieb, art, bezugId, Date.now(), name);
    const { error: upErr } = await admin.storage.from(ABLAGE_BUCKET).upload(pfad, Buffer.from(bytes), { contentType: pr.typ, upsert: false });
    if (upErr) return { ok: false, fehler: 'Datei konnte nicht abgelegt werden: ' + upErr.message, status: 502 };
    neu = true;
  }

  const stufe = opts.stufe == null ? null : Math.max(0, Math.min(9, Math.floor(Number(opts.stufe) || 0)));
  const { data: zeile, error: insErr } = await admin.from('beleg_ablage').insert({
    owner_user_id: betrieb,
    art,
    bezug_id: bezugId,
    bezug_nummer: opts.bezugNummer ? String(opts.bezugNummer).slice(0, 120) : null,
    stufe: art === 'mahnung' ? stufe : null,
    datei_pfad: pfad,
    datei_name: name,
    datei_typ: pr.typ,
    datei_hash: hash,
    datei_groesse: bytes.length,
    erstellt_von: opts.erstelltVon && UUID.test(opts.erstelltVon) ? opts.erstelltVon : null,
  }).select('id').single();
  if (insErr || !zeile) {
    return { ok: false, fehler: 'Ablage-Eintrag fehlgeschlagen: ' + (insErr?.message || 'unbekannt'), status: 502 };
  }
  return { ok: true, id: String((zeile as { id: string }).id), hash, neuHochgeladen: neu };
}
