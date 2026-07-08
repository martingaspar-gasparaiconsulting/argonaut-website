// app/api/arbeitszeit-nachweis-pdf/route.ts
// ============================================================
// ARGONAUT OS · Block 1.1d · Arbeitszeit-Nachweis als PDF
// Serverseitig & tamper-sicher: laedt die Zeiten selbst, prueft sie mit demselben
// ArbZG-Waechter (arbzgLogik) und rendert einen unterschriftsreifen Nachweis.
// HTML -> Gotenberg -> PDF. Keine KI noetig (reine Fakten).
// Body: { mitarbeiterId, jahr, monat (1-12), optionen: WaechterOptionen }
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  berechneNachweis, stundenText,
  type ZeitSitzung, type WaechterOptionen, type TagesNachweis, type Schwere,
} from '../../dashboard/_components/arbzgLogik';

export const runtime = 'nodejs';

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function zwei(n: number): string { return n < 10 ? '0' + n : String(n); }
function uhrzeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return zwei(d.getHours()) + ':' + zwei(d.getMinutes());
}
function tagNr(iso: string): string { const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.` : iso; }
// Druck-taugliche Ampelfarben (kraeftiger als die Bildschirm-Toene)
function druckFarbe(s: Schwere): string { return s === 'rot' ? '#c0392b' : s === 'gelb' ? '#b7791f' : '#2e7d32'; }
function statusWort(s: Schwere): string { return s === 'rot' ? 'Verstoss' : s === 'gelb' ? 'Pruefen' : 'i.O.'; }

function baueHtml(maName: string, monatName: string, nachweis: ReturnType<typeof berechneNachweis>, rows: ZeitSitzung[], opt: Required<WaechterOptionen>): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  const rohProTag = new Map<string, ZeitSitzung[]>();
  for (const r of rows) { if (!rohProTag.has(r.datum)) rohProTag.set(r.datum, []); rohProTag.get(r.datum)!.push(r); }
  const spanne = (datum: string): string => {
    const arr = rohProTag.get(datum) || [];
    if (arr.length === 0) return '—';
    const k = arr.map((a) => a.kommen_um).sort()[0];
    const g = arr.filter((a) => a.gehen_um).map((a) => a.gehen_um as string).sort().pop() || null;
    return `${uhrzeit(k)} – ${uhrzeit(g)}`;
  };

  const zeilen = nachweis.tage.map((t: TagesNachweis) => {
    const verstoss = t.verstoesse.length > 0
      ? `<div class="v">${t.verstoesse.map((v) => `<span style="color:${druckFarbe(v.schwere)}">&#9656; ${esc(v.text)}</span>`).join('<br>')}</div>`
      : '';
    return `<tr>
      <td class="tag">${tagNr(t.datum)} <span class="wt">${esc(t.wochentag.slice(0, 2))}</span></td>
      <td>${esc(spanne(t.datum))}</td>
      <td class="r">${esc(stundenText(t.arbeitsminuten))}</td>
      <td class="r">${t.pauseMinuten} min</td>
      <td class="c"><span class="dot" style="background:${druckFarbe(t.ampel)}"></span> <span style="color:${druckFarbe(t.ampel)}">${statusWort(t.ampel)}</span></td>
    </tr>${verstoss ? `<tr><td colspan="5" class="vzelle">${verstoss}</td></tr>` : ''}`;
  }).join('');

  const optText = [
    opt.sonntagErlaubt ? 'Sonntagsarbeit betrieblich erlaubt' : '',
    opt.ruhezeitStunden === 10 ? 'reduzierte Ruhezeit 10 h' : '',
  ].filter(Boolean).join(' · ') || 'Standard-Einstellungen';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 44px 52px; font-size: 12px; line-height: 1.5; }
  .kopf { border-bottom: 3px solid #C9A84C; padding-bottom: 16px; margin-bottom: 20px; }
  .marke { color: #C9A84C; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  h1 { font-size: 22px; margin: 6px 0 4px; }
  .meta { color: #5b6b80; font-size: 12px; }
  .summen { display: flex; gap: 10px; margin: 18px 0; }
  .kachel { flex: 1; border: 1px solid #e1e6ee; border-radius: 8px; padding: 10px 12px; }
  .kachel .z { font-size: 18px; font-weight: bold; }
  .kachel .l { font-size: 10px; color: #5b6b80; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #5b6b80; border-bottom: 1px solid #cfd6e2; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef1f6; font-size: 12px; }
  td.r { text-align: right; } td.c { text-align: center; }
  .tag { font-weight: bold; } .wt { color: #8a99ad; font-weight: normal; font-size: 11px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: middle; }
  .vzelle { padding-top: 0; border-bottom: 1px solid #eef1f6; }
  .v { font-size: 11px; padding-left: 8px; }
  .sig { display: flex; gap: 40px; margin-top: 48px; }
  .sig div { flex: 1; border-top: 1px solid #0A1628; padding-top: 6px; font-size: 11px; color: #5b6b80; }
  .fuss { margin-top: 26px; border-top: 1px solid #e1e6ee; padding-top: 10px; color: #8a99ad; font-size: 10px; line-height: 1.5; }
</style></head><body>
  <div class="kopf">
    <div class="marke">ARGONAUT OS · Arbeitszeitnachweis</div>
    <h1>${esc(maName)}</h1>
    <div class="meta">Zeitraum: ${esc(monatName)} &middot; Erstellt: ${heute} &middot; Einstellung: ${esc(optText)}</div>
  </div>

  <div class="summen">
    <div class="kachel"><div class="z">${esc(stundenText(nachweis.summeArbeitsminuten))}</div><div class="l">Arbeitszeit</div></div>
    <div class="kachel"><div class="z">${esc(stundenText(nachweis.summePauseMinuten))}</div><div class="l">Pausen</div></div>
    <div class="kachel"><div class="z" style="color:${nachweis.anzahlVerstoesse > 0 ? '#c0392b' : '#2e7d32'}">${nachweis.anzahlVerstoesse}</div><div class="l">Verstoesse</div></div>
    <div class="kachel"><div class="z" style="color:${druckFarbe(nachweis.schlimmsteAmpel)}">${statusWort(nachweis.schlimmsteAmpel)}</div><div class="l">Status</div></div>
  </div>

  <table>
    <thead><tr><th>Tag</th><th>Kommen–Gehen</th><th style="text-align:right">Arbeit</th><th style="text-align:right">Pause</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${zeilen || '<tr><td colspan="5" style="color:#8a99ad;padding:14px 8px">Keine Buchungen in diesem Zeitraum.</td></tr>'}</tbody>
  </table>

  <div class="sig">
    <div>Datum, Unterschrift Mitarbeiter/in</div>
    <div>Datum, Unterschrift Arbeitgeber/in</div>
  </div>

  <div class="fuss">
    Rechtsgrundlage: Arbeitszeitgesetz (§3 Höchstarbeitszeit, §4 Pausen, §5 Ruhezeit, §9/§10 Sonn- und Feiertagsruhe).
    Die Statusbewertung ist ein automatisierter Hinweis; branchenspezifische Ausnahmen und der zulässige Ausgleich im
    Sechs-Monats-Durchschnitt sind vom Betrieb zu prüfen. Aufbewahrung der Aufzeichnungen mind. 2 Jahre (§16 ArbZG).
    Erstellt mit ARGONAUT OS &middot; ${heute}.
  </div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mitarbeiterId = String(body?.mitarbeiterId || '');
    const jahr = Number(body?.jahr);
    const monat = Number(body?.monat); // 1-12
    const optionen: WaechterOptionen = (body?.optionen && typeof body.optionen === 'object') ? body.optionen : {};
    if (!mitarbeiterId || !jahr || !monat || monat < 1 || monat > 12) {
      return NextResponse.json({ error: 'Ungueltige Angaben.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // Mitarbeiter (owner-gescoped) prüfen
    const { data: ma } = await supabase.from('mitarbeiter')
      .select('id,vorname,nachname').eq('id', mitarbeiterId).eq('owner_user_id', user.id).maybeSingle();
    if (!ma) return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });

    // Monatsbereich
    const start = `${jahr}-${zwei(monat)}-01`;
    const endeDate = new Date(jahr, monat, 0); // letzter Tag des Monats
    const ende = `${jahr}-${zwei(monat)}-${zwei(endeDate.getDate())}`;

    const { data: rowsRaw } = await supabase.from('hr_zeiterfassung')
      .select('id,mitarbeiter_id,datum,kommen_um,gehen_um,pause_minuten')
      .eq('mitarbeiter_id', mitarbeiterId).eq('owner_user_id', user.id)
      .gte('datum', start).lte('datum', ende)
      .order('kommen_um', { ascending: true });
    const rows = (rowsRaw as ZeitSitzung[]) ?? [];

    const nachweis = berechneNachweis(rows, optionen);
    const optMerged: Required<WaechterOptionen> = {
      sonntagErlaubt: !!optionen.sonntagErlaubt,
      ruhezeitStunden: optionen.ruhezeitStunden ?? 11,
      maxArbeitStunden: optionen.maxArbeitStunden ?? 10,
      warnUeber8h: optionen.warnUeber8h ?? true,
    };
    const monatName = new Date(jahr, monat - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const maName = `${ma.vorname} ${ma.nachname}`.trim();

    const html = baueHtml(maName, monatName, nachweis, rows, optMerged);

    // Gotenberg: HTML -> PDF
    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl) return NextResponse.json({ error: 'PDF-Dienst nicht konfiguriert.' }, { status: 500 });

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.5');
    form.append('marginBottom', '0.5');

    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const pdfResp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('Nachweis Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const safeName = maName.replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '').replace(/\s+/g, '_').slice(0, 50);
    const dateiName = `Arbeitszeitnachweis_${safeName}_${jahr}-${zwei(monat)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Nachweis-PDF Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
