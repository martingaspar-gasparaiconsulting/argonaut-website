'use client';

// ============================================================
// ARGONAUT OS · Paket PS3 · SLA-Bericht (IT & MSP)
//   Monatsbericht je Kunde aus dem Ticket-Cockpit: Reaktions- und Lösungszeit
//   gegen die SLA-Verträge (Assets & Lizenzen -> Reiter SLA), gezählt in der
//   vereinbarten Servicezeit (z. B. „Mo-Fr 8-17", Feiertage frei), Wartezeit
//   auf den Kunden (Status „Wartet") abziehbar. Verstöße einzeln, Druck/PDF.
// Kein SQL — liest tickets, ticket_verlauf, it_sla.
// Logik: lib/kundenVorgaenge.ts (getestet).
// Unterpfad von /dashboard/itassets (erbt dessen Freigabe).
// Pfad: app/dashboard/itassets/sla/page.tsx
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  slaBericht, stundenText, monatText, ticketsImMonat, SLA_STANDARD_STUNDEN, heuteBerlin,
  type TicketLite, type VerlaufLite, type SlaVertrag,
} from '@/lib/kundenVorgaenge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', color: C.textDim, fontSize: 12.5, borderBottom: `1px solid ${C.border}` };
const td: CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 };

function quoteFarbe(q: number | null): string { return q == null ? C.textDim : q >= 95 ? C.green : q >= 80 ? C.warn : C.danger; }
function quoteText(q: number | null): string { return q == null ? '—' : `${q.toLocaleString('de-DE')} %`; }
function escapeHtml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export default function SlaBerichtSeite() {
  const heute = heuteBerlin();
  const [monat, setMonat] = useState(heute.slice(0, 7));
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [verlauf, setVerlauf] = useState<VerlaufLite[]>([]);
  const [vertraege, setVertraege] = useState<SlaVertrag[]>([]);
  const [warteAbziehen, setWarteAbziehen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [firma, setFirma] = useState('');
  const [kundeFilter, setKundeFilter] = useState('');

  useEffect(() => {
    (async () => {
      setLaedt(true); setFehler(null);
      const [von, bis] = [`${monat}-01`, `${monat}-31`];
      // Einen Tag Puffer auf beiden Seiten — der Monat wird danach in Berliner Ortszeit geschnitten.
      const t = await supabase.from('tickets').select('id, ticket_nummer, betreff, status, prioritaet, kunde_name, created_at, geloest_am')
        .gte('created_at', new Date(Date.parse(von + 'T00:00:00Z') - 86_400_000).toISOString())
        .lte('created_at', new Date(Date.parse(bis + 'T23:59:59Z') + 86_400_000).toISOString());
      if (t.error) { setFehler('Tickets konnten nicht geladen werden: ' + t.error.message); setLaedt(false); return; }
      const liste = (t.data as TicketLite[]) ?? [];
      setTickets(liste);
      const ids = liste.map((x) => x.id);
      const alle: VerlaufLite[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const v = await supabase.from('ticket_verlauf').select('ticket_id, typ, alt_status, neu_status, created_at').in('ticket_id', ids.slice(i, i + 200));
        alle.push(...((v.data as VerlaufLite[]) ?? []));
      }
      setVerlauf(alle);
      const s = await supabase.from('it_sla').select('kunde, bezeichnung, reaktion_std, wiederherstell_std, servicezeit, verfuegbarkeit, gueltig_bis');
      setVertraege((s.data as SlaVertrag[]) ?? []);
      setLaedt(false);
    })();
  }, [monat]);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        let chef: string | null = null;
        try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
    })();
  }, []);

  const jetzt = new Date().toISOString();
  const bericht = useMemo(() => slaBericht(tickets, verlauf, vertraege, monat, jetzt, { warteAbziehen }), [tickets, verlauf, vertraege, monat, warteAbziehen]); // eslint-disable-line react-hooks/exhaustive-deps
  const anzahl = ticketsImMonat(tickets, monat).length;
  const sichtbar = bericht.filter((k) => !kundeFilter || k.kunde === kundeFilter);

  function drucken(nurKunde?: string) {
    const teil = bericht.filter((k) => !nurKunde || k.kunde === nurKunde);
    const zeilen = teil.map((k) => `
      <h2>${escapeHtml(k.kunde)}</h2>
      <p>${k.vertrag ? `Vertrag: ${escapeHtml(k.vertrag)}${k.servicezeit ? ` · Servicezeit ${escapeHtml(k.servicezeit)}` : ''}` : 'Ohne SLA-Vertrag (Standardziele)'}</p>
      <table><tr><th>Tickets</th><th>gelöst</th><th>offen</th><th>Reaktion eingehalten</th><th>Lösung eingehalten</th><th>Ø Lösungszeit</th></tr>
      <tr><td>${k.tickets}</td><td>${k.geloest}</td><td>${k.offen}</td><td>${quoteText(k.reaktionQuote)}</td><td>${quoteText(k.loesungQuote)}</td><td>${stundenText(k.mittlereLoesung)}</td></tr></table>
      ${k.verstoesse.length ? `<h3>Abweichungen</h3><table><tr><th>Ticket</th><th>Betreff</th><th>Priorität</th><th>Reaktion</th><th>Lösung</th></tr>${k.verstoesse.map((v) => `<tr><td>${escapeHtml(v.nummer)}</td><td>${escapeHtml(v.betreff)}</td><td>${escapeHtml(v.prio)}</td><td>${stundenText(v.reaktionStd)}${v.reaktionZiel ? ` / Ziel ${stundenText(v.reaktionZiel)}` : ''}</td><td>${v.offen ? 'noch offen' : stundenText(v.loesungStd)} / Ziel ${stundenText(v.loesungZiel)}</td></tr>`).join('')}</table>` : '<p>Keine Abweichungen.</p>'}
      ${k.hinweise.map((h) => `<p class="h">${escapeHtml(h)}</p>`).join('')}`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>SLA-Bericht ${escapeHtml(monatText(monat))}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:5px 7px;font-size:12px;text-align:left}.h{color:#555;font-size:11px}</style></head>
      <body><h1>SLA-Bericht ${escapeHtml(monatText(monat))}</h1><p>${escapeHtml(firma || '')} · erstellt am ${new Date().toLocaleDateString('de-DE')}${warteAbziehen ? ' · Wartezeit auf den Kunden nicht mitgezählt' : ''}</p>${zeilen || '<p>Keine Tickets im Monat.</p>'}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · IT &amp; MSP</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>📈 SLA-Bericht</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Was Sie zugesagt haben — und was Sie geliefert haben. Je Kunde und Monat, direkt aus den Tickets. <a href="/dashboard/itassets" style={{ color: C.cyan }}>← SLA-Verträge pflegen</a> · <a href="/dashboard/service" style={{ color: C.cyan }}>Ticket-Cockpit</a></p>

      <div style={{ ...karte, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Monat <input type="month" style={feld} value={monat} onChange={(e) => e.target.value && setMonat(e.target.value)} /></label>
        <label>Kunde <select style={feld} value={kundeFilter} onChange={(e) => setKundeFilter(e.target.value)}><option value="">alle</option>{bericht.map((k) => <option key={k.kunde} value={k.kunde}>{k.kunde}</option>)}</select></label>
        <label><input type="checkbox" checked={warteAbziehen} onChange={(e) => setWarteAbziehen(e.target.checked)} /> Wartezeit auf den Kunden (Status „Wartet") nicht mitzählen</label>
        <button style={knopf} onClick={() => drucken(kundeFilter || undefined)} disabled={!bericht.length}>🖨 Bericht drucken / PDF</button>
      </div>

      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {laedt && <div style={karte}>Lädt …</div>}
      {!laedt && !fehler && anzahl === 0 && <div style={karte}>Keine Tickets im {monatText(monat)}.</div>}

      {!laedt && sichtbar.map((k) => (
        <div key={k.kunde} style={karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div><b style={{ fontSize: 17 }}>{k.kunde}</b><div style={{ color: C.textDim, fontSize: 13 }}>{k.vertrag ? `Vertrag „${k.vertrag}"${k.servicezeit ? ` · ${k.servicezeit}` : ''}` : 'ohne SLA-Vertrag'}</div></div>
            <button style={knopf} onClick={() => drucken(k.kunde)}>🖨 Nur diesen Kunden</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
            {[['Tickets', String(k.tickets), C.text], ['gelöst / offen', `${k.geloest} / ${k.offen}`, C.text], ['Reaktion eingehalten', quoteText(k.reaktionQuote), quoteFarbe(k.reaktionQuote)], ['Lösung eingehalten', quoteText(k.loesungQuote), quoteFarbe(k.loesungQuote)], ['Ø Lösungszeit', stundenText(k.mittlereLoesung), C.text]].map(([t, w, f]) => (
              <div key={t} style={{ background: C.navy, borderRadius: 10, padding: 10 }}><div style={{ color: C.textDim, fontSize: 12.5 }}>{t}</div><div style={{ fontSize: 20, fontWeight: 800, color: f }}>{w}</div></div>
            ))}
          </div>
          {k.verstoesse.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Ticket</th><th style={th}>Betreff</th><th style={th}>Priorität</th><th style={th}>Reaktion</th><th style={th}>Lösung</th></tr></thead>
                <tbody>
                  {k.verstoesse.map((v) => (
                    <tr key={v.id}>
                      <td style={td}><a href={`/dashboard/service/${v.id}`} style={{ color: C.cyan }}>{v.nummer || 'öffnen'}</a></td>
                      <td style={td}>{v.betreff}</td><td style={td}>{v.prio}</td>
                      <td style={{ ...td, color: v.reaktionOk === false ? C.danger : C.text }}>{stundenText(v.reaktionStd)}{v.reaktionZiel ? ` / ${stundenText(v.reaktionZiel)}` : ''}</td>
                      <td style={{ ...td, color: v.loesungOk === false ? C.danger : C.text }}>{v.offen ? 'offen' : stundenText(v.loesungStd)} / {stundenText(v.loesungZiel)}{v.wartenStd ? ` (−${stundenText(v.wartenStd)} Warten)` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {k.hinweise.map((h) => <div key={h} style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>ℹ {h}</div>)}
        </div>
      ))}

      <p style={{ color: C.textDim, fontSize: 12.5 }}>
        So wird gemessen: Reaktion = erster Kommentar oder erster Statuswechsel weg von „Offen" (interne Notizen zählen nicht). Lösung = Eingang bis „Gelöst". Ohne Vertrag gelten die Standardziele des Ticket-Cockpits
        ({Object.entries(SLA_STANDARD_STUNDEN).map(([k, v]) => `${k} ${v} Std.`).join(', ')}). Offene Tickets über dem Ziel zählen als Abweichung. Die Kundenzuordnung läuft über den Kundennamen im Ticket und im SLA-Vertrag. Bei fester Servicezeit zählen Wochenenden und bundesweite Feiertage nicht mit (Landesfeiertage bitte selbst berücksichtigen).
      </p>
    </div>
  );
}
