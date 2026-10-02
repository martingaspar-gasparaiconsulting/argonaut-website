// ============================================================================
// ARGONAUT OS · lib/rechnungAblageServer.ts — Rechnung fest ablegen (Paket 197)
// NUR serverseitig (Route Handler) — nutzt den Server-Schlüssel für Speicher
// und Tabelle. Die Logik (Prüfung, Pfad, Prüfsumme kurz) steht testbar in
// lib/rechnungAblage.ts.
//
// Ablauf:
//  1. Die Rechnung wird MIT DER SITZUNG der Person gelesen (Datenbank-Regeln
//     bestätigen, dass sie sie sehen darf) und muss dem Betrieb gehören.
//  2. Datei prüfen (echtes PDF/XML, ≤ 10 MB), SHA-256 bilden.
//  3. Gleiche Datei bei derselben Rechnung schon abgelegt? Dann nur ein neuer
//     Eintrag (Versand-Ereignis), kein zweiter Upload.
//  4. Sonst unverändert in den privaten Ordner „rechnung-ablage" (kein upsert).
//  5. Eintrag in rechnung_ablage, festgeschrieben_am setzen (nur wenn leer).
// ============================================================================

import { createHash } from 'node:crypto';
import { createAdminClient } from './supabase-admin';
import {
  ABLAGE_BUCKET, ablageFehlt, ablagePfad, gleicheDatei, istUuid, pruefeAblageDatei, sichererName,
  type AblageAnlass, type AblageTyp,
} from './rechnungAblage';

export type AblageErgebnis =
  | { ok: true; id: string; hash: string; neuHochgeladen: boolean; festgeschriebenAm: string | null }
  | { ok: false; fehler: string; status: number };

type Lesbar = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
    };
  };
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function legeRechnungAb(opts: {
  sitzung: unknown;            // Supabase-Client mit der Sitzung der Person (RLS)
  betrieb: string;             // aus abrechnungPruefen
  rechnungId: string;
  bytes: Uint8Array;
  dateiname?: string | null;
  typ?: string | null;
  anlass: AblageAnlass;
  empfaenger?: string | null;
  erstelltVon: string;
}): Promise<AblageErgebnis> {
  const { betrieb, rechnungId, bytes, anlass } = opts;
  if (!istUuid(rechnungId) || !istUuid(betrieb)) return { ok: false, fehler: 'Ungültige Rechnung.', status: 400 };

  const pr = pruefeAblageDatei(bytes, opts.typ);
  if (!pr.ok) return { ok: false, fehler: pr.fehler, status: 400 };
  const typ: AblageTyp = pr.typ;

  // 1) Rechnung mit der Sitzung lesen — sieht die Person sie nicht, gibt es nichts abzulegen.
  const { data: r, error: rErr } = await (opts.sitzung as Lesbar).from('rechnungen')
    .select('id, owner_user_id, rechnungsnummer, rechnungsdatum').eq('id', rechnungId).maybeSingle();
  const rechnung = r as { id: string; owner_user_id: string; rechnungsnummer: string | null; rechnungsdatum: string | null } | null;
  if (rErr || !rechnung) return { ok: false, fehler: 'Rechnung nicht gefunden.', status: 404 };
  if (String(rechnung.owner_user_id) !== betrieb) return { ok: false, fehler: 'Diese Rechnung gehört nicht zu Ihrem Betrieb.', status: 403 };

  const hash = sha256Hex(bytes);
  const admin = createAdminClient();

  // 2) Schon da? (gleiche Datei, gleiche Rechnung)
  const { data: vorh, error: vErr } = await admin.from('rechnung_ablage')
    .select('id, datei_hash, datei_pfad').eq('owner_user_id', betrieb).eq('rechnung_id', rechnungId);
  if (vErr) {
    return ablageFehlt(vErr.message)
      ? { ok: false, fehler: 'Die Rechnungs-Ablage ist noch nicht eingerichtet (SQL p197).', status: 503 }
      : { ok: false, fehler: 'Ablage nicht erreichbar: ' + vErr.message, status: 502 };
  }
  const gleich = gleicheDatei((vorh as Array<{ datei_hash: string; datei_pfad: string }> | null) || [], hash);

  const name = sichererName(opts.dateiname || `Rechnung_${rechnung.rechnungsnummer || ''}`, typ);
  let pfad = gleich?.datei_pfad || '';
  let neu = false;
  if (!pfad) {
    pfad = ablagePfad(betrieb, rechnungId, rechnung.rechnungsdatum, Date.now(), name);
    const { error: upErr } = await admin.storage.from(ABLAGE_BUCKET).upload(pfad, Buffer.from(bytes), { contentType: typ, upsert: false });
    if (upErr) return { ok: false, fehler: 'Datei konnte nicht abgelegt werden: ' + upErr.message, status: 502 };
    neu = true;
  }

  // 3) Eintrag (nur anlegen — ändern/löschen verbietet die Datenbank)
  const { data: zeile, error: insErr } = await admin.from('rechnung_ablage').insert({
    owner_user_id: betrieb,
    rechnung_id: rechnungId,
    rechnungsnummer: rechnung.rechnungsnummer,
    anlass,
    datei_pfad: pfad,
    datei_name: name,
    datei_typ: typ,
    datei_hash: hash,
    datei_groesse: bytes.length,
    empfaenger: opts.empfaenger ? String(opts.empfaenger).slice(0, 320) : null,
    erstellt_von: istUuid(opts.erstelltVon) ? opts.erstelltVon : null,
  }).select('id').single();
  if (insErr || !zeile) {
    return { ok: false, fehler: 'Ablage-Eintrag fehlgeschlagen: ' + (insErr?.message || 'unbekannt'), status: 502 };
  }

  // 4) Festschreiben (nur wenn noch leer — der Zeitpunkt der ERSTEN Ablage zählt)
  const jetzt = new Date().toISOString();
  const { data: fest } = await admin.from('rechnungen')
    .update({ festgeschrieben_am: jetzt }).eq('id', rechnungId).eq('owner_user_id', betrieb).is('festgeschrieben_am', null)
    .select('festgeschrieben_am');
  const festAm = Array.isArray(fest) && fest[0] ? String((fest[0] as { festgeschrieben_am: string }).festgeschrieben_am) : null;

  return { ok: true, id: String((zeile as { id: string }).id), hash, neuHochgeladen: neu, festgeschriebenAm: festAm };
}
