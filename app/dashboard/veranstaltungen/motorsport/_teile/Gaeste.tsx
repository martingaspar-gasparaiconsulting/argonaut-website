'use client';

// ARGONAUT OS · Paket 296 · Sponsoren, Gäste, Presse und Helfer eines Motorsport-Events
// Bereich Tribüne, Fahrerlager oder Boxengasse; Akkreditierung (Bändchen/Ausweis
// ausgegeben) setzt die Datenbank — für die Boxengasse nur mit unterschriebenem
// Haftungsverzicht. Sponsoren mit vereinbarter Leistung und Betrag (Info).

import { useState, useMemo } from 'react';
import { GAST_ARTEN, BEREICHE, gastPruefen, akkreditierFehlt, verzichtDokument, label, wannText, type GastForm } from '@/lib/motorsport';
import { signaturStarten } from '@/lib/signaturStart';
import { euro } from '@/lib/geld';
import { C, s } from '../../../werkstatt/zweirad/_teile/stil';
import { supabase, fehlerText, type Ev, type Gast, type SigStatus } from './typen';

type Props = { ev: Ev; gaeste: Gast[]; sig: SigStatus; betriebName: string; lade: () => Promise<void>; meldung: (ok: string | null, fehler: string | null) => void };
const LEER: GastForm = { art: 'gast', name: '', firma: '', email: '', personen: '1', bereich: 'tribuene', leistung: '', betrag: '', notiz: '' };

export default function Gaeste({ ev, gaeste, sig, betriebName, lade, meldung }: Props) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<(GastForm & { id: string | null }) | null>(null);
  const [filter, setFilter] = useState<string>('alle');
  const liste = useMemo(() => gaeste.filter((g) => filter === 'alle' || g.art === filter).sort((a, b) => a.art.localeCompare(b.art) || a.name.localeCompare(b.name, 'de')), [gaeste, filter]);
  const zahlen = useMemo(() => ({
    personen: gaeste.reduce((x, g) => x + g.personen, 0),
    akkreditiert: gaeste.filter((g) => g.akkreditiert_am).reduce((x, g) => x + g.personen, 0),
    sponsoren: gaeste.filter((g) => g.art === 'sponsor').length,
    sponsorBetrag: gaeste.filter((g) => g.art === 'sponsor').reduce((x, g) => x + (g.betrag_netto_cent ?? 0), 0),
  }), [gaeste]);

  async function lauf(fn: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, okText: string, std: string): Promise<boolean> {
    setBusy(true); meldung(null, null);
    const { data, error } = await fn();
    setBusy(false);
    if (error || !data || (Array.isArray(data) && data.length === 0)) { meldung(null, fehlerText(error, std)); return false; }
    meldung(okText, null); await lade(); return true;
  }

  async function speichern() {
    if (!form) return;
    const p = gastPruefen(form);
    if (!p.ok) { meldung(null, p.grund); return; }
    const ok = form.id
      ? await lauf(() => supabase.from('ms_gast').update(p.zeile).eq('id', form.id as string).select('id'), 'Gespeichert.', 'Nicht gespeichert.')
      : await lauf(() => supabase.from('ms_gast').insert({ ...p.zeile, event_id: ev.id }).select('id'), `${p.zeile.name} eingetragen.`, 'Nicht eingetragen.');
    if (ok) setForm(null);
  }

  async function verzicht(g: Gast) {
    if (!(ev.verzicht_text ?? '').trim()) { meldung(null, 'Bitte zuerst im Reiter „📜 Haftungsverzicht" Ihren eigenen Text hinterlegen.'); return; }
    setBusy(true); meldung(null, null);
    const r = await signaturStarten(supabase, ev.owner_user_id, {
      titel: `Haftungsverzicht ${ev.titel} — ${g.name}`, empfaenger_name: g.name, empfaenger_email: g.email,
      dokument: verzichtDokument({ betrieb: betriebName, event: ev, person: g.firma ? `${g.name} (${g.firma})` : g.name, rolle: 'gast', bereich: g.bereich }),
      aufbewahrung_jahre: 10,
    });
    setBusy(false);
    if (!r.ok || !r.token) { meldung(null, 'Die Unterschrifts-Anfrage ließ sich nicht anlegen.'); return; }
    if (await lauf(() => supabase.from('ms_gast').update({ verzicht_token: r.token }).eq('id', g.id).select('id'), '', 'Nicht gespeichert.')) {
      try { await navigator.clipboard.writeText(r.link || ''); } catch { /* ohne Zwischenablage weiter */ }
      meldung(`Unterschrifts-Link für ${g.name} erstellt und kopiert: ${r.link}`, null);
    }
  }

  async function akkreditieren(g: Gast) {
    await lauf(() => supabase.from('ms_gast').update({ akkreditiert_am: new Date().toISOString() }).eq('id', g.id).select('id'), `${g.name} akkreditiert.`, 'Nicht akkreditiert.');
  }

  async function loeschen(g: Gast) {
    if (!window.confirm(`${g.name} entfernen?`)) return;
    await lauf(() => supabase.from('ms_gast').delete().eq('id', g.id).select('id'), 'Entfernt.', 'Nicht entfernt — löschen darf nur der Chef.');
  }

  const sigText = (tok: string | null) => !tok ? '—' : sig[tok] === 'signiert' ? '✔ unterschrieben' : sig[tok] === 'abgelehnt' ? '✖ abgelehnt' : 'versendet';

  return (
    <div>
      <h2 style={s.h2}>Sponsoren &amp; Gäste</h2>
      <p style={s.dim}>Tragen Sie Sponsoren (mit vereinbarter Leistung), Gäste, Presse und Helfer ein und haken Sie am Eingang ab, wer sein Bändchen bekommen hat. Für die Boxengasse braucht es den unterschriebenen Haftungsverzicht.</p>
      <div style={s.kacheln}>
        <div style={s.kachel}><span style={s.dim}>Personen gesamt</span><span style={s.zahl}>{zahlen.personen}</span></div>
        <div style={s.kachel}><span style={s.dim}>davon akkreditiert</span><span style={s.zahl}>{zahlen.akkreditiert}</span></div>
        <div style={s.kachel}><span style={s.dim}>Sponsoren</span><span style={s.zahl}>{zahlen.sponsoren}</span></div>
        <div style={s.kachel}><span style={s.dim}>Sponsoring netto (vereinbart)</span><span style={s.zahl}>{euro(zahlen.sponsorBetrag / 100)}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!form && <button style={s.btnGold} onClick={() => setForm({ ...LEER, id: null })}>＋ Eintragen</button>}
        {['alle', ...GAST_ARTEN.map((a) => a.key)].map((k) => (
          <button key={k} style={filter === k ? s.tabAn : s.tab} onClick={() => setFilter(k)}>{k === 'alle' ? 'Alle' : label(GAST_ARTEN, k)}</button>
        ))}
      </div>

      {form && (
        <div style={s.box}>
          <div style={s.raster}>
            <label style={s.feld}>Art<select style={s.eingabe} value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>{GAST_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
            <label style={s.feld}>Name<input style={s.eingabe} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label style={s.feld}>Firma<input style={s.eingabe} value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} /></label>
            <label style={s.feld}>E-Mail<input style={s.eingabe} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label style={s.feld}>Personen<input style={s.eingabe} inputMode="numeric" value={form.personen} onChange={(e) => setForm({ ...form, personen: e.target.value })} /></label>
            <label style={s.feld}>Bereich<select style={s.eingabe} value={form.bereich} onChange={(e) => setForm({ ...form, bereich: e.target.value })}>{BEREICHE.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
            {form.art === 'sponsor' && <>
              <label style={s.feld}>Vereinbarte Leistung (z. B. Logo auf Startnummern)<input style={s.eingabe} value={form.leistung} onChange={(e) => setForm({ ...form, leistung: e.target.value })} /></label>
              <label style={s.feld}>Betrag netto (€, Info)<input style={s.eingabe} inputMode="decimal" value={form.betrag} onChange={(e) => setForm({ ...form, betrag: e.target.value })} /></label>
            </>}
            <label style={s.feld}>Notiz<input style={s.eingabe} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void speichern()}>💾 Speichern</button>
            <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {gaeste.length === 0 ? <p style={s.dim}>Noch niemand eingetragen — legen Sie oben Sponsoren und Gäste an.</p> : (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Art</th><th style={s.th}>Name</th><th style={s.th}>Pers.</th><th style={s.th}>Bereich</th><th style={s.th}>Verzicht</th><th style={s.th}>Akkreditiert</th><th style={s.th}></th></tr></thead>
          <tbody>
            {liste.map((g) => {
              const fehlt = akkreditierFehlt(g, g.verzicht_token ? sig[g.verzicht_token] === 'signiert' : false);
              return (
                <tr key={g.id}>
                  <td style={s.td}>{label(GAST_ARTEN, g.art)}</td>
                  <td style={s.td}><b>{g.name}</b>{g.firma ? <div style={{ color: C.dim, fontSize: 12 }}>{g.firma}</div> : null}{g.leistung ? <div style={{ color: C.dim, fontSize: 12 }}>{g.leistung}{g.betrag_netto_cent ? ` · ${euro(g.betrag_netto_cent / 100)}` : ''}</div> : null}</td>
                  <td style={s.td}>{g.personen}</td>
                  <td style={s.td}>{label(BEREICHE, g.bereich).replace(' (nur mit Verzicht)', '')}</td>
                  <td style={s.td}>{sigText(g.verzicht_token)}</td>
                  <td style={s.td}>{g.akkreditiert_am ? <span style={{ color: C.ok }}>✔ {wannText(g.akkreditiert_am)}</span> : fehlt ? <span style={{ color: C.warn, fontSize: 12.5 }}>{fehlt}</span> : '—'}</td>
                  <td style={s.td}>
                    {!g.akkreditiert_am && !fehlt && <button style={s.link} disabled={busy} onClick={() => void akkreditieren(g)}>🎫 Akkreditieren</button>}
                    {!g.akkreditiert_am && (!g.verzicht_token || sig[g.verzicht_token] === 'abgelehnt') && <> · <button style={s.link} disabled={busy} onClick={() => void verzicht(g)}>✍️ Verzicht</button></>}
                    {!g.akkreditiert_am && <> · <button style={s.link} onClick={() => setForm({ id: g.id, art: g.art, name: g.name, firma: g.firma ?? '', email: g.email ?? '', personen: String(g.personen), bereich: g.bereich, leistung: g.leistung ?? '', betrag: g.betrag_netto_cent ? String(g.betrag_netto_cent / 100).replace('.', ',') : '', notiz: g.notiz ?? '' })}>✎</button></>}
                    {' · '}<button style={{ ...s.link, color: C.bad }} onClick={() => void loeschen(g)}>entfernen</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
