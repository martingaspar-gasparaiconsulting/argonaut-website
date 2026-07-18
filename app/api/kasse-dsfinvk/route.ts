// ============================================================
// ARGONAUT OS · Bündel 16 · app/api/kasse-dsfinvk/route.ts
// Export der Kassenbelege als CSV (DSFinV-K-naher Aufbau, Positions-Ebene).
//   GET ?von=YYYY-MM-DD&bis=YYYY-MM-DD -> CSV-Download
//
// HINWEIS: Dies ist ein vereinfachter Export für die eigene Ablage/Prüfung.
// Der vollständige, zertifizierte DSFinV-K-Export (mit allen Pflichtdateien)
// wird vom angebundenen TSE-Anbieter bereitgestellt und hier später ergänzt.
// Authentifiziert: nur der Chef (Finanz-/Kassendaten).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvFeld(v: unknown): string {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const von = (url.searchParams.get('von') || '').trim();
    const bis = (url.searchParams.get('bis') || '').trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    let q = supabase.from('kassen_belege')
      .select('id, beleg_nr, typ, zahlart, netto_summe, mwst_summe, brutto_summe, tse_modus, tse_anbieter, tse_seriennummer, tse_signatur, erstellt_am, storniert')
      .eq('owner_user_id', user.id).order('erstellt_am', { ascending: true });
    if (von) q = q.gte('erstellt_am', `${von}T00:00:00`);
    if (bis) q = q.lte('erstellt_am', `${bis}T23:59:59`);
    const { data: belege } = await q;
    const liste = belege || [];

    // Positionen aller Belege laden
    const ids = liste.map((b) => b.id);
    const posMap: Record<string, { position: number; bezeichnung: string; menge: number; einzelpreis: number; mwst_satz: number; gesamt_brutto: number }[]> = {};
    if (ids.length) {
      const { data: pos } = await supabase.from('kassen_positionen')
        .select('beleg_id, position, bezeichnung, menge, einzelpreis, mwst_satz, gesamt_brutto').in('beleg_id', ids).order('position', { ascending: true });
      for (const p of (pos || []) as Record<string, unknown>[]) {
        const bid = String(p.beleg_id);
        (posMap[bid] = posMap[bid] || []).push({
          position: Number(p.position) || 0, bezeichnung: String(p.bezeichnung || ''), menge: Number(p.menge) || 0,
          einzelpreis: Number(p.einzelpreis) || 0, mwst_satz: Number(p.mwst_satz) || 0, gesamt_brutto: Number(p.gesamt_brutto) || 0,
        });
      }
    }

    const kopf = ['Beleg_Nr', 'Datum_Zeit', 'Typ', 'Zahlart', 'Pos', 'Bezeichnung', 'Menge', 'Einzelpreis_Brutto', 'MwSt_Satz', 'Pos_Brutto', 'Beleg_Netto', 'Beleg_MwSt', 'Beleg_Brutto', 'Storniert', 'TSE_Modus', 'TSE_Anbieter', 'TSE_Seriennr', 'TSE_Signatur'];
    const zeilen: string[] = [kopf.join(';')];
    for (const b of liste) {
      const ps = posMap[b.id] || [];
      const rows = ps.length ? ps : [{ position: 0, bezeichnung: '', menge: 0, einzelpreis: 0, mwst_satz: 0, gesamt_brutto: 0 }];
      for (const p of rows) {
        zeilen.push([
          b.beleg_nr, b.erstellt_am, b.typ, b.zahlart, p.position, p.bezeichnung,
          String(p.menge).replace('.', ','), String(p.einzelpreis).replace('.', ','), String(p.mwst_satz).replace('.', ','), String(p.gesamt_brutto).replace('.', ','),
          String(b.netto_summe).replace('.', ','), String(b.mwst_summe).replace('.', ','), String(b.brutto_summe).replace('.', ','),
          b.storniert ? 'ja' : 'nein', b.tse_modus, b.tse_anbieter || '', b.tse_seriennummer || '', b.tse_signatur || '',
        ].map(csvFeld).join(';'));
      }
    }
    // BOM für Excel-Umlaute
    const csv = '﻿' + zeilen.join('\r\n');
    const name = `Kasse-Export_${von || 'anfang'}_${bis || 'heute'}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e: unknown) {
    console.error('DSFinV-K Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Export fehlgeschlagen.' }, { status: 500 });
  }
}
