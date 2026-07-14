import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARGONAUT OS · P47 · Auslöser 1 — Rechnung überfällig → Glocke
// Cron-Route (täglich via n8n aufgerufen, gleicher Geheim-Header wie
// termin-erinnerung). Findet offene/teilbezahlte Rechnungen, deren
// Fälligkeit in der Vergangenheit liegt, und legt pro Rechnung EINE
// Benachrichtigung an (public.benachrichtigung_erstellen, Dedup-Schutz
// = max. 1× pro Rechnung pro 24h). KEIN automatischer Mailversand.
//
// Absicherung 1:1 wie termin-erinnerung:
//   Authorization: Bearer <TERMIN_CRON_GEHEIM>
// n8n-seitig einfach den Termin-Node duplizieren und die URL tauschen:
//   POST https://<domain>/api/rechnungen-ueberfaellig
// Pfad: app/api/rechnungen-ueberfaellig/route.ts
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lokales Heute als 'YYYY-MM-DD' (kein UTC-Versatz)
function heuteStr(): string {
  const d = new Date();
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}

function eur(n: number | null | undefined): string {
  const wert = typeof n === 'number' ? n : 0;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wert);
}

export async function POST(req: NextRequest) {
  // --- Absicherung: gleicher Geheim-Header wie termin-erinnerung ---
  const geheim = process.env.TERMIN_CRON_GEHEIM;
  const auth = req.headers.get('authorization');
  if (!geheim || auth !== `Bearer ${geheim}`) {
    return NextResponse.json({ ok: false, fehler: 'Nicht autorisiert' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, fehler: 'Supabase-Konfiguration fehlt' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const heute = heuteStr();

  // Überfällig = offen ODER teilbezahlt UND Fälligkeit < heute
  const { data: rechnungen, error } = await supabase
    .from('rechnungen')
    .select('id, owner_user_id, rechnungsnummer, brutto_summe, bezahlter_betrag, faelligkeitsdatum, zahlungsstatus')
    .in('zahlungsstatus', ['offen', 'teilbezahlt'])
    .not('faelligkeitsdatum', 'is', null)
    .lt('faelligkeitsdatum', heute);

  if (error) {
    return NextResponse.json({ ok: false, fehler: error.message }, { status: 500 });
  }

  const gefunden = rechnungen?.length ?? 0;
  let erstellt = 0;
  let uebersprungen = 0;

  for (const r of rechnungen ?? []) {
    if (!r.owner_user_id) { uebersprungen++; continue; }

    const brutto = Number(r.brutto_summe) || 0;
    const bezahlt = Number(r.bezahlter_betrag) || 0;
    const offen = Math.round((brutto - bezahlt) * 100) / 100;
    if (offen <= 0) { uebersprungen++; continue; } // nichts mehr offen -> keine Meldung

    // Tage überfällig (lokal)
    let tage = 0;
    try {
      const f = new Date(r.faelligkeitsdatum as string);
      const h = new Date(heute);
      tage = Math.round((h.getTime() - f.getTime()) / 86400000);
    } catch { /* egal, tage bleibt 0 */ }

    const nr = r.rechnungsnummer || 'Rechnung';
    const titel = `Rechnung ${nr} überfällig`;
    const nachricht =
      `${eur(offen)} offen · ${tage > 0 ? `${tage} Tage überfällig` : 'fällig'}. ` +
      `Jetzt nachfassen oder Mahnung anstoßen.`;

    // Dedup-Schutz steckt in der Funktion (max. 1× pro Rechnung/24h)
    const { error: bErr } = await supabase.rpc('benachrichtigung_erstellen', {
      p_owner: r.owner_user_id,
      p_typ: 'rechnung_ueberfaellig',
      p_titel: titel,
      p_nachricht: nachricht,
      p_link: `/dashboard/rechnungen/${r.id}`,
      p_ref_tabelle: 'rechnungen',
      p_ref_id: r.id,
      p_dedup_stunden: 24,
    });

    if (bErr) { uebersprungen++; continue; }
    erstellt++;
  }

  return NextResponse.json({
    ok: true,
    geprueft: gefunden,
    benachrichtigungen_erstellt: erstellt,
    uebersprungen,
    stand: heute,
  });
}
