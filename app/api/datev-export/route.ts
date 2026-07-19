// ============================================================
// ARGONAUT OS · Bündel 20 · app/api/datev-export/route.ts
// Export der Rechnungen als DATEV-nahe Buchungsstapel-CSV (EXTF-Format-Idee:
// Belegdatum, Belegfeld1 = Rechnungsnummer, Umsatz brutto, Konto/Gegenkonto,
// BU-Schlüssel je Steuersatz). Für den Import beim Steuerberater / DATEV.
//   GET ?von=YYYY-MM-DD&bis=YYYY-MM-DD -> CSV
//
// HINWEIS: DATEV verlangt einen exakten EXTF-Header mit Beraternummer/
// Mandantennummer/Sachkontenlänge. Diese betriebs- und beraterindividuellen
// Werte trägt der Betrieb unter „🔌 Schnittstellen" (typ 'datev') ein; fehlen
// sie, wird ein neutraler, gut importierbarer CSV-Stapel erzeugt. Die echte
// DATEV-Online-Übermittlung (mit Zertifikat) ist als Brücke vorgesehen.
// Authentifiziert: nur der Chef (Finanzdaten).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csv(v: unknown): string {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function betrag(n: unknown): string { return (Number(n) || 0).toFixed(2).replace('.', ','); }
function datZeit(iso: unknown): string {
  const d = new Date(String(iso || '')); if (isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}${p(d.getMonth() + 1)}`; // DATEV Belegdatum TTMM (Wirtschaftsjahr aus Kopf)
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const von = (url.searchParams.get('von') || '').trim();
    const bis = (url.searchParams.get('bis') || '').trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    let q = supabase.from('rechnungen')
      .select('rechnungsnummer, rechnungsdatum, empfaenger_name, netto_summe, mwst_summe, brutto_summe, zahlungsstatus')
      .eq('owner_user_id', user.id).neq('zahlungsstatus', 'storniert').order('rechnungsdatum', { ascending: true });
    if (von) q = q.gte('rechnungsdatum', von);
    if (bis) q = q.lte('rechnungsdatum', bis);
    const { data } = await q;
    const liste = data || [];

    // Optionale DATEV-Parameter aus der Schnittstelle (typ 'datev')
    const { data: intg } = await supabase.from('betrieb_integrationen').select('config').eq('typ', 'datev').maybeSingle();
    const cfg = (intg?.config || {}) as Record<string, string>;
    const erloeskonto = cfg.erloeskonto || '8400';   // Erlöse 19 % USt (SKR03-Beispiel)
    const erloeskonto7 = cfg.erloeskonto_7 || '8300';
    const debitor = cfg.debitor_sammel || '10000';

    // Buchungsstapel: eine Zeile je Rechnung (Umsatz brutto, Gegenkonto Erlös, BU-Schlüssel)
    const kopf = ['Umsatz', 'SollHaben', 'Konto', 'Gegenkonto', 'BU-Schluessel', 'Belegdatum', 'Belegfeld1', 'Buchungstext'];
    const zeilen: string[] = [kopf.join(';')];
    for (const r of liste) {
      // BU-Schlüssel: 3 = 19 %, 2 = 7 % (DATEV-Standard, vereinfachte Zuordnung)
      const hatNur7 = (Number(r.mwst_summe) || 0) > 0 && Math.abs((Number(r.netto_summe) || 0) * 0.07 - (Number(r.mwst_summe) || 0)) < 0.02;
      const bu = (Number(r.mwst_summe) || 0) === 0 ? '' : (hatNur7 ? '2' : '3');
      const gegenkonto = hatNur7 ? erloeskonto7 : erloeskonto;
      zeilen.push([
        betrag(r.brutto_summe), 'S', debitor, gegenkonto, bu, datZeit(r.rechnungsdatum),
        r.rechnungsnummer || '', `Rechnung ${r.empfaenger_name || ''}`.trim(),
      ].map(csv).join(';'));
    }
    const inhalt = '﻿' + zeilen.join('\r\n');
    const name = `DATEV-Buchungsstapel_${von || 'anfang'}_${bis || 'heute'}.csv`;
    return new NextResponse(inhalt, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e: unknown) {
    console.error('DATEV-Export Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Export fehlgeschlagen.' }, { status: 500 });
  }
}
