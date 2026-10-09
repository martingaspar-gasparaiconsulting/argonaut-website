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
import { baueExtf, extfHinweise, extfDefaults, type ExtfKonfig, type RechnungRoh, type BelegRoh } from '@/lib/datevExtf';
import { datevVorschlag, DATEV_FALLBACK } from '@/lib/datevKonten';
import { leseZahlOder, centRunden } from '@/lib/zahlen';

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
    // Paket 284: mit Kfz-Sonderfall (Spalten aus SQL p268). Fehlen die Spalten,
    // laeuft der Export wie bisher ohne sie.
    const BASIS = 'rechnungsnummer, rechnungsdatum, empfaenger_name, netto_summe, mwst_summe, brutto_summe, zahlungsstatus';
    const ladeRechnungen = async (spalten: string) => {
      let q = supabase.from('rechnungen').select(spalten)
        .eq('owner_user_id', user.id).neq('zahlungsstatus', 'storniert').order('rechnungsdatum', { ascending: true });
      if (von) q = q.gte('rechnungsdatum', von);
      if (bis) q = q.lte('rechnungsdatum', bis);
      return q;
    };
    let rRes = await ladeRechnungen(`id, ${BASIS}, steuer_sonderfall, diff_bemessung, diff_steuer`);
    if (rRes.error) rRes = await ladeRechnungen(BASIS);
    const rechnungen = ((rRes.data as unknown) || []) as (RechnungRoh & { id?: string })[];

    // Paket 284: 0-%-Anteil (Fahrzeug) aus den Positionen und Fahrzeugnummer aus dem Verkauf
    const sonderIds = rechnungen.filter((r) => typeof r.steuer_sonderfall === 'string' && r.steuer_sonderfall && r.id).map((r) => String(r.id));
    if (sonderIds.length > 0) {
      const p = await supabase.from('rechnung_positionen').select('rechnung_id, mwst_satz, gesamt_netto').in('rechnung_id', sonderIds).limit(20000);
      if (!p.error) {
        const summe = new Map<string, number>();
        for (const z of ((p.data as unknown) as Array<Record<string, unknown>>) ?? []) {
          if (leseZahlOder(z.mwst_satz, -1) !== 0) continue;
          summe.set(String(z.rechnung_id), centRunden((summe.get(String(z.rechnung_id)) ?? 0) + leseZahlOder(z.gesamt_netto, 0)));
        }
        for (const r of rechnungen) if (r.id && sonderIds.includes(String(r.id))) r.netto0 = summe.get(String(r.id)) ?? 0;
      }
    }
    const rIds = rechnungen.map((r) => r.id).filter((x): x is string => typeof x === 'string');
    if (rIds.length > 0) {
      const v = await supabase.from('kfz_verkauf').select('rechnung_id, kfz_bestand(interne_nr)').in('rechnung_id', rIds).limit(5000);
      if (!v.error) {
        const nr = new Map<string, string>();
        for (const z of ((v.data as unknown) as Array<{ rechnung_id: string | null; kfz_bestand: { interne_nr: string | null } | { interne_nr: string | null }[] | null }>) ?? []) {
          const b = Array.isArray(z.kfz_bestand) ? z.kfz_bestand[0] : z.kfz_bestand;
          if (z.rechnung_id && b?.interne_nr) nr.set(z.rechnung_id, b.interne_nr);
        }
        for (const r of rechnungen) if (r.id && nr.has(r.id)) r.fahrzeug_nr = nr.get(r.id);
      }
    }

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
      // Paket 284: Kfz-Sonderfaelle (leer = Vorbelegung aus kfzKontenStandard)
      erloeskontoDiff19: cfg.erloeskonto_diff19 || undefined,
      erloeskontoDiff0: cfg.erloeskonto_diff0 || undefined,
      erloeskontoAusfuhr: cfg.erloeskonto_ausfuhr || undefined,
      erloeskontoEu: cfg.erloeskonto_eu || undefined,
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

    const eingabe = {
      rechnungen, belege, konfig, aufwandFallback,
      datumVon: jjjjmmtt(von), datumBis: jjjjmmtt(bis),
      erzeugtAm: erzeugtStempel(heute),
    };

    // A7 (22.09.2026): Vorabpruefung statt Datei — ?pruefen=1.
    // extfHinweise war gebaut, getestet und nirgends angeschlossen. Fehlt zum
    // Beispiel die Beraternummer, lehnt DATEV den Import ab; das erfuhr der
    // Betrieb bisher erst beim Steuerberater. Dieser Zweig erzeugt NICHTS und
    // veraendert NICHTS — er sagt nur, was an der Datei nicht stimmen wird.
    if (url.searchParams.get('pruefen') === '1') {
      return NextResponse.json({
        ok: true,
        von,
        bis,
        anzahlRechnungen: rechnungen.length,
        anzahlBelege: belege.length,
        hinweise: extfHinweise(eingabe),
      });
    }

    const inhalt = baueExtf(eingabe);

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
