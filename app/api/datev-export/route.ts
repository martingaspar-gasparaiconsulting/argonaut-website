// ============================================================
// ARGONAUT OS · app/api/datev-export/route.ts
// Echter DATEV-EXTF-Buchungsstapel (Abschnitt 4 · „DATEV-EXTF echt machen").
// Exportiert BEIDE Richtungen für den Steuerberater:
//   · Ausgangsrechnungen (Erlöse)  aus `rechnungen`
//   · Eingangsbelege (Aufwand+VSt) aus `eingangsbelege` (OCR-erfasst)
//   GET ?von=YYYY-MM-DD&bis=YYYY-MM-DD -> EXTF-CSV
// Berater-/Mandantennummer/Kontenrahmen kommen aus `betrieb_integrationen`
// (typ 'datev'); fehlen sie, wird ein importierbarer Stapel mit Standardwerten
// erzeugt (Kopf ohne Berater/Mandant -> beim Import ergänzbar).
// Authentifiziert: nur der Chef (Finanzdaten).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { baueExtf, extfDefaults, type ExtfKonfig, type RechnungRoh, type BelegRoh } from '@/lib/datevExtf';
import { datevVorschlag, DATEV_FALLBACK } from '@/lib/datevKonten';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jjjjmmtt(iso: string): string { return (iso || '').slice(0, 10).replace(/-/g, ''); }

function erzeugtStempel(d: Date): string {
  const p = (x: number, n = 2) => String(x).padStart(n, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const heute = new Date();
    const von = (url.searchParams.get('von') || `${heute.getFullYear()}-01-01`).trim();
    const bis = (url.searchParams.get('bis') || heute.toISOString().slice(0, 10)).trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // --- Ausgangsrechnungen ---
    let q = supabase.from('rechnungen')
      .select('rechnungsnummer, rechnungsdatum, empfaenger_name, netto_summe, mwst_summe, brutto_summe, zahlungsstatus')
      .eq('owner_user_id', user.id).neq('zahlungsstatus', 'storniert').order('rechnungsdatum', { ascending: true });
    if (von) q = q.gte('rechnungsdatum', von);
    if (bis) q = q.lte('rechnungsdatum', bis);
    const { data: rData } = await q;
    const rechnungen = (rData || []) as RechnungRoh[];

    // --- Eingangsbelege (OCR) — defensiv: fehlt die Tabelle/Spalte, bleibt es leer ---
    let belege: BelegRoh[] = [];
    try {
      let bq = supabase.from('eingangsbelege')
        .select('belegnummer, belegdatum, lieferant, netto, ust_betrag, brutto, kategorie, datev_konto')
        .eq('owner_user_id', user.id).order('belegdatum', { ascending: true });
      if (von) bq = bq.gte('belegdatum', von);
      if (bis) bq = bq.lte('belegdatum', bis);
      const { data: bData, error: bErr } = await bq;
      if (!bErr) belege = (bData || []) as BelegRoh[];
    } catch { belege = []; }

    // --- DATEV-Konfig aus der Schnittstelle (typ 'datev') ---
    const { data: intg } = await supabase.from('betrieb_integrationen').select('config').eq('typ', 'datev').maybeSingle();
    const cfg = (intg?.config || {}) as Record<string, string>;
    const skr: '03' | '04' = String(cfg.skr || '').includes('04') ? '04' : '03';
    const std = extfDefaults(skr);

    const konfig: ExtfKonfig = {
      beraterNr: cfg.berater_nr || '',
      mandantNr: cfg.mandant_nr || '',
      wjBeginn: (cfg.wj_beginn || `${von.slice(0, 4)}0101`).replace(/-/g, ''),
      sachkontenlaenge: Number(cfg.sachkontenlaenge) || 4,
      skr,
      erloeskonto19: cfg.erloeskonto || std.erloeskonto19,
      erloeskonto7: cfg.erloeskonto_7 || std.erloeskonto7,
      debitorSammel: cfg.debitor_sammel || std.debitorSammel,
      kreditorSammel: cfg.kreditor_sammel || std.kreditorSammel,
      bezeichnung: `ARGONAUT ${von} bis ${bis}`,
    };

    // Eingangsbelegen ihr Aufwandskonto zuordnen (vorhandenes datev_konto ODER Regel-Vorschlag).
    const aufwandFallback = skr === '04' ? DATEV_FALLBACK.skr04 : DATEV_FALLBACK.skr03;
    for (const b of belege) {
      if (!b.datev_konto) {
        const v = datevVorschlag(String(b.kategorie ?? ''), String(b.lieferant ?? ''));
        b.datev_konto = skr === '04' ? v.skr04 : v.skr03;
      }
    }

    const inhalt = baueExtf({
      rechnungen, belege, konfig, aufwandFallback,
      datumVon: jjjjmmtt(von), datumBis: jjjjmmtt(bis),
      erzeugtAm: erzeugtStempel(heute),
    });

    const name = `EXTF_Buchungsstapel_${von}_${bis}.csv`;
    return new NextResponse(inhalt, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    console.error('DATEV-EXTF-Export Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Export fehlgeschlagen.' }, { status: 500 });
  }
}
