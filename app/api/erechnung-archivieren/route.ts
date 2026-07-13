import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P36 — E-RECHNUNG ARCHIVIEREN
// ------------------------------------------------------------
// Legt eine E-Rechnung (XML oder ZUGFeRD-PDF) revisionssicher ab:
//   1) SHA-256-Hash der Original-Datei berechnen (Unverfälschtheits-Nachweis)
//   2) Datei UNVERÄNDERT in privaten Bucket 'erechnungen' legen
//      Pfad: {owner_user_id}/{jahr}/{zeit}_{name}
//   3) Metadaten + Hash in Tabelle erechnung_archiv protokollieren
//
// Eingang: multipart/form-data:
//   datei (File), richtung ('ausgang'|'eingang'), und optionale Metadaten
//   (rechnungsnummer, format, lieferant_name, empfaenger_name,
//    brutto_summe, waehrung, rechnungsdatum, rechnung_id, notiz)
//
// ADDITIV. Nutzt Service-Role-Client (Env), damit Storage+Insert sicher
// laufen; owner_user_id wird serverseitig aus dem übergebenen Wert bzw.
// via Trigger gesetzt.
// ============================================================

function envClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = envClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Archiv-Dienst nicht konfiguriert.' }, { status: 500 });
    }

    const form = await req.formData();
    const datei = form.get('datei');
    if (!datei || typeof datei === 'string') {
      return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
    }
    const file = datei as File;
    const buf = Buffer.from(await file.arrayBuffer());

    // owner_user_id muss mitgegeben werden (aus der Client-Session),
    // da Service-Role keine auth.uid() hat.
    const ownerId = String(form.get('owner_user_id') || '').trim();
    if (!ownerId) {
      return NextResponse.json({ error: 'owner_user_id fehlt.' }, { status: 400 });
    }

    const richtung = String(form.get('richtung') || 'ausgang');
    const rechnungsnummer = String(form.get('rechnungsnummer') || '');
    const format = String(form.get('format') || '');
    const lieferant_name = String(form.get('lieferant_name') || '');
    const empfaenger_name = String(form.get('empfaenger_name') || '');
    const brutto_summe = Number(form.get('brutto_summe') || 0) || 0;
    const waehrung = String(form.get('waehrung') || 'EUR');
    const rechnungsdatumRaw = String(form.get('rechnungsdatum') || '');
    const rechnungsdatum = /^\d{4}-\d{2}-\d{2}/.test(rechnungsdatumRaw) ? rechnungsdatumRaw.slice(0, 10) : null;
    const rechnung_id = String(form.get('rechnung_id') || '') || null;
    const notiz = String(form.get('notiz') || '');

    // 1) Hash
    const hash = createHash('sha256').update(buf).digest('hex');

    // 1b) Doppelschutz: gibt es diese Datei (gleicher Hash) schon im Archiv?
    const { data: vorhanden } = await supabase
      .from('erechnung_archiv')
      .select('id, archiviert_am')
      .eq('owner_user_id', ownerId)
      .eq('datei_hash', hash)
      .limit(1)
      .maybeSingle();
    if (vorhanden) {
      return NextResponse.json({
        ok: false,
        bereits: vorhanden.id,
        bereits_am: vorhanden.archiviert_am,
        error: 'Diese Rechnung ist bereits im Archiv.',
      }, { status: 200 });
    }

    // 2) Pfad + Upload
    const jahr = (rechnungsdatum ? rechnungsdatum.slice(0, 4) : String(new Date().getFullYear()));
    const sicherName = (file.name || 'erechnung')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const pfad = `${ownerId}/${jahr}/${Date.now()}_${sicherName}`;

    const contentType = file.type
      || (sicherName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/xml');

    const { error: upErr } = await supabase.storage
      .from('erechnungen')
      .upload(pfad, buf, { contentType, upsert: false });

    if (upErr) {
      console.error('Archiv-Upload Fehler:', upErr.message);
      return NextResponse.json({ error: 'Datei konnte nicht archiviert werden: ' + upErr.message }, { status: 502 });
    }

    // 3) Protokoll-Eintrag
    const { data: row, error: insErr } = await supabase
      .from('erechnung_archiv')
      .insert({
        owner_user_id: ownerId,
        richtung,
        rechnung_id,
        rechnungsnummer,
        format,
        lieferant_name,
        empfaenger_name,
        brutto_summe,
        waehrung,
        rechnungsdatum,
        datei_pfad: pfad,
        datei_name: sicherName,
        datei_hash: hash,
        datei_groesse: buf.length,
        notiz,
      })
      .select('id, archiviert_am, datei_hash')
      .single();

    if (insErr) {
      console.error('Archiv-Insert Fehler:', insErr.message);
      // Datei liegt schon im Bucket; Protokoll fehlt -> Fehler melden, nicht stillschweigend
      return NextResponse.json({ error: 'Archiv-Protokoll fehlgeschlagen: ' + insErr.message }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      id: row?.id,
      archiviert_am: row?.archiviert_am,
      hash: row?.datei_hash,
      pfad,
    });
  } catch (e: any) {
    console.error('E-Rechnung-Archivieren Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler beim Archivieren.' }, { status: 500 });
  }
}
