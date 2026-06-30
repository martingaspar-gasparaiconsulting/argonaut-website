import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P11 — KI-Statusbericht als PDF
// Projektdaten -> Claude (Bericht-Text) -> HTML -> Gotenberg -> PDF.
// Eigenstaendig. Nutzt vorhandene Gotenberg-Infrastruktur.
// ============================================================

const SYSTEM_PROMPT = `Du bist der Projekt-Berichterstatter von ARGONAUT OS, einem Betriebssystem für den deutschen Mittelstand.

Du erhältst strukturierte Projektdaten (Eckdaten, Aufgaben nach Status, Auslastung). Daraus schreibst du einen professionellen, sachlichen Fortschrittsbericht auf Deutsch — so, wie ihn ein Unternehmer einem Kunden oder der eigenen Geschäftsführung vorlegen würde.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt, ohne Markdown, ohne Backticks, ohne Erklärung. Struktur exakt:

{
  "zusammenfassung": "2-4 Sätze Gesamtstand in Prosa",
  "abschnitte": [
    { "titel": "Überschrift", "text": "Fließtext, 2-5 Sätze" }
  ],
  "ausblick": "2-4 Sätze: nächste Schritte / Empfehlung"
}

Regeln:
- 3 bis 5 Abschnitte (z.B. Fortschritt, Erledigte Arbeiten, Offene Punkte, Risiken/Überfälliges, Auslastung).
- Sachlich, konkret, keine Floskeln. Beziehe dich auf die echten Zahlen und Aufgaben aus den Daten.
- Wenn etwas überfällig ist, benenne es klar aber konstruktiv.
- Keine erfundenen Fakten, Termine oder Namen, die nicht in den Daten stehen.
- Sprache: professionelles Deutsch.`;

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baueHtml(projekt: any, bericht: any, kennzahlen: any): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const abschnitte = Array.isArray(bericht?.abschnitte) ? bericht.abschnitte : [];
  const abschnitteHtml = abschnitte.map((a: any) => `
    <div class="abschnitt">
      <h2>${esc(a.titel)}</h2>
      <p>${esc(a.text)}</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 48px 56px; font-size: 13px; line-height: 1.6; }
  .kopf { border-bottom: 3px solid #C9A84C; padding-bottom: 18px; margin-bottom: 24px; }
  .marke { color: #C9A84C; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  h1 { font-size: 24px; margin: 6px 0 4px; color: #0A1628; }
  .meta { color: #5b6b80; font-size: 12px; }
  .kennzahlen { display: flex; gap: 12px; margin: 22px 0; }
  .kachel { flex: 1; border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px 14px; }
  .kachel .zahl { font-size: 22px; font-weight: bold; color: #0A1628; }
  .kachel .label { font-size: 11px; color: #5b6b80; }
  .zusammenfassung { background: #f4f6fa; border-left: 4px solid #00b3cc; padding: 14px 18px; border-radius: 6px; margin-bottom: 22px; }
  .abschnitt { margin-bottom: 16px; }
  h2 { font-size: 15px; color: #0A1628; margin: 0 0 4px; border-bottom: 1px solid #e1e6ee; padding-bottom: 4px; }
  .abschnitt p { margin: 6px 0 0; }
  .ausblick { margin-top: 22px; background: #fbf7ec; border: 1px solid #ecdfb8; border-radius: 8px; padding: 14px 18px; }
  .ausblick h2 { border: none; }
  .fuss { margin-top: 40px; border-top: 1px solid #e1e6ee; padding-top: 12px; color: #8a99ad; font-size: 11px; text-align: center; }
</style></head><body>
  <div class="kopf">
    <div class="marke">ARGONAUT OS · Projektbericht</div>
    <h1>${esc(projekt?.name)}</h1>
    <div class="meta">Stand: ${heute}${projekt?.verantwortlich ? ' &middot; Verantwortlich: ' + esc(projekt.verantwortlich) : ''}</div>
  </div>

  <div class="kennzahlen">
    <div class="kachel"><div class="zahl">${kennzahlen.gesamt}</div><div class="label">Aufgaben gesamt</div></div>
    <div class="kachel"><div class="zahl">${kennzahlen.erledigt}</div><div class="label">Erledigt</div></div>
    <div class="kachel"><div class="zahl">${kennzahlen.offen}</div><div class="label">Offen</div></div>
    <div class="kachel"><div class="zahl">${kennzahlen.ueberfaellig}</div><div class="label">Überfällig</div></div>
    <div class="kachel"><div class="zahl">${kennzahlen.fortschritt}%</div><div class="label">Fortschritt</div></div>
  </div>

  <div class="zusammenfassung">${esc(bericht?.zusammenfassung)}</div>

  ${abschnitteHtml}

  ${bericht?.ausblick ? `<div class="ausblick"><h2>Ausblick &amp; nächste Schritte</h2><p>${esc(bericht.ausblick)}</p></div>` : ''}

  <div class="fuss">Erstellt mit ARGONAUT OS &middot; ${heute}</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projekt = body?.projekt;
    const aufgaben: any[] = Array.isArray(body?.aufgaben) ? body.aufgaben : [];
    const auslastung: any[] = Array.isArray(body?.auslastung) ? body.auslastung : [];
    if (!projekt?.name) {
      return NextResponse.json({ error: 'Projektdaten fehlen.' }, { status: 400 });
    }

    // Kennzahlen serverseitig berechnen
    const heute = new Date(new Date().toDateString());
    const gesamt = aufgaben.length;
    const erledigt = aufgaben.filter((a) => a.erledigt || a.status === 'fertig').length;
    const offen = gesamt - erledigt;
    const ueberfaellig = aufgaben.filter((a) => !a.erledigt && a.status !== 'fertig' && a.faellig_am && new Date(a.faellig_am) < heute).length;
    const fortschritt = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
    const kennzahlen = { gesamt, erledigt, offen, ueberfaellig, fortschritt };

    // Daten kompakt fuer die KI aufbereiten
    const aufgabenText = aufgaben.map((a) => {
      const st = a.status === 'fertig' ? 'fertig' : a.status;
      const ueb = !a.erledigt && a.status !== 'fertig' && a.faellig_am && new Date(a.faellig_am) < heute ? ' (ÜBERFÄLLIG)' : '';
      const faellig = a.faellig_am ? `, fällig ${a.faellig_am}` : '';
      return `- ${a.titel} [${st}, Prio ${a.prioritaet}${faellig}]${ueb}`;
    }).join('\n');
    const auslastungText = auslastung.length > 0
      ? auslastung.map((z) => `- ${z.name}${z.istTeam ? ' (Team)' : ''}: ${z.offen} offen / ${z.gesamt} gesamt`).join('\n')
      : 'Keine Zuweisungen erfasst.';

    const userInhalt = `PROJEKT: ${projekt.name}
Beschreibung: ${projekt.beschreibung || '—'}
Status: ${projekt.status || '—'} · Priorität: ${projekt.prioritaet || '—'}
Zeitraum: ${projekt.start_datum || '—'} bis ${projekt.end_datum || '—'}
Budget: ${projekt.budget != null ? projekt.budget + ' EUR' : '—'}

KENNZAHLEN: ${gesamt} Aufgaben gesamt, ${erledigt} erledigt, ${offen} offen, ${ueberfaellig} überfällig, ${fortschritt}% Fortschritt.

AUFGABEN:
${aufgabenText || 'Keine Aufgaben erfasst.'}

AUSLASTUNG:
${auslastungText}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI-Dienst nicht konfiguriert.' }, { status: 500 });

    // 1) Claude: Berichtstext erzeugen
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userInhalt }],
      }),
    });
    if (!claudeResp.ok) {
      const t = await claudeResp.text();
      console.error('Statusbericht Claude Fehler:', claudeResp.status, t.slice(0, 300));
      return NextResponse.json({ error: 'KI-Anfrage fehlgeschlagen.' }, { status: 502 });
    }
    const claudeData = await claudeResp.json();
    let roh = (Array.isArray(claudeData?.content) ? claudeData.content.find((c: any) => c.type === 'text')?.text : '') || '';
    const s = roh.indexOf('{'); const e = roh.lastIndexOf('}');
    if (s >= 0 && e > s) roh = roh.slice(s, e + 1);
    let bericht: any;
    try { bericht = JSON.parse(roh); } catch {
      return NextResponse.json({ error: 'KI-Bericht konnte nicht gelesen werden.' }, { status: 502 });
    }

    // 2) HTML bauen
    const html = baueHtml(projekt, bericht, kennzahlen);

    // 3) Gotenberg: HTML -> PDF
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
      console.error('Statusbericht Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const dateiName = `Statusbericht_${String(projekt.name).replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '').replace(/\s+/g, '_').slice(0, 60)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Statusbericht Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
