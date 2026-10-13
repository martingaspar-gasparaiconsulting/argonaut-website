'use client';

// ARGONAUT OS · Paket 355 (13.10.2026) · Wiegeschein.
// Nummer, Wägezeiten und Netto setzt die Datenbank. Abgeschlossen bleibt der Schein,
// wie er ist; stornieren (mit Grund) darf nur die Geschäftsleitung. Korrektur = neuer Schein.

import { useState, useEffect } from 'react';
import {
  wiegePruefen, kgLesen, kgText, tonnenText, nettoKg, schluesselLesbar, richtungName, wiegeStatusName, wiegescheinHtml, containerName, zeitDe,
  type Wiegeschein, type Container, type Auftrag,
} from '@/lib/entsorgung';
import { C, s, Feld, schreiben, firmaLaden, zeige, type Db, type Melde, type Kontakt } from './entsorgungUi';
import type { Schluessel } from './Schluessel';

export const WIEGE_FELDER = 'id, nummer, richtung, kontakt_id, kunde_name, kennzeichen, fahrer, herkunft, container_id, auftrag_id, abfall_schluessel_id, abfall_schluessel, abfall_bezeichnung, gefaehrlich, waage, brutto_kg, brutto_am, tara_kg, tara_am, netto_kg, status, abgeschlossen_am, abgeschlossen_name, storno_grund, storniert_am, notiz, erstellt_am';
const WAAGE_SCHLUESSEL = 'argonaut_entsorgung_waage';

type Form = {
  richtung: string; kontakt_id: string; kunde_name: string; kennzeichen: string; fahrer: string; herkunft: string; container_id: string;
  auftrag_id: string; abfall_schluessel_id: string; waage: string; brutto: string; tara: string; notiz: string;
};
function leer(waage: string): Form {
  return { richtung: 'eingang', kontakt_id: '', kunde_name: '', kennzeichen: '', fahrer: '', herkunft: '', container_id: '', auftrag_id: '', abfall_schluessel_id: '', waage, brutto: '', tara: '', notiz: '' };
}
function gemerkteWaage(): string {
  try { return window.localStorage.getItem(WAAGE_SCHLUESSEL) ?? ''; } catch { return ''; }
}

export default function Wiegescheine({ supabase, scheine, container, schluessel, kontakte, istChef, ausAuftrag, melde, onGeaendert }: {
  supabase: Db; scheine: Wiegeschein[]; container: Container[]; schluessel: Schluessel[]; kontakte: Kontakt[]; istChef: boolean;
  ausAuftrag: Auftrag | null; melde: Melde; onGeaendert: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [zweit, setZweit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    if (!ausAuftrag) return;
    setForm({
      ...leer(gemerkteWaage()), kontakt_id: ausAuftrag.kontakt_id ?? '', kunde_name: ausAuftrag.kunde_name, herkunft: ausAuftrag.stellplatz,
      container_id: ausAuftrag.container_alt_id ?? '', auftrag_id: ausAuftrag.id, abfall_schluessel_id: ausAuftrag.abfall_schluessel_id ?? '', fahrer: ausAuftrag.fahrer ?? '',
    });
  }, [ausAuftrag]);

  function kontaktWaehlen(id: string) {
    if (!form) return;
    const k = kontakte.find((x) => x.id === id);
    setForm({ ...form, kontakt_id: id, kunde_name: k ? k.anzeige : form.kunde_name });
  }

  async function speichern(abschliessen: boolean) {
    if (!form) return;
    const p = wiegePruefen({ kennzeichen: form.kennzeichen, brutto: form.brutto, tara: form.tara, abfall_schluessel_id: form.abfall_schluessel_id || null, abschliessen });
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      try { window.localStorage.setItem(WAAGE_SCHLUESSEL, form.waage.trim()); } catch { /* ohne Speicher geht es auch */ }
      const r = await schreiben(supabase.from('wiegeschein').insert({
        richtung: form.richtung, kontakt_id: form.kontakt_id || null, kunde_name: form.kunde_name.trim() || null, kennzeichen: form.kennzeichen.trim(),
        fahrer: form.fahrer.trim() || null, herkunft: form.herkunft.trim() || null, container_id: form.container_id || null, auftrag_id: form.auftrag_id || null,
        abfall_schluessel_id: form.abfall_schluessel_id || null, waage: form.waage.trim() || null, brutto_kg: p.brutto, tara_kg: p.tara,
        notiz: form.notiz.trim() || null, status: abschliessen ? 'abgeschlossen' : 'offen',
      }).select(WIEGE_FELDER));
      if (!r.ok) { melde(r.fehler); return; }
      const w = ((r.data as Wiegeschein[]) ?? [])[0];
      melde(null, abschliessen ? `Wiegeschein ${w?.nummer ?? ''} abgeschlossen: ${kgText(w?.netto_kg)} netto.` : `Wiegeschein ${w?.nummer ?? ''} angelegt — offen bis zur zweiten Wägung.`);
      setForm(null);
      await onGeaendert();
      if (abschliessen && w) await drucken(w);
    } finally { setBusy(false); }
  }

  async function zweiteWaegung(w: Wiegeschein, abschliessen: boolean) {
    const roh = zweit[w.id] ?? '';
    const feld = w.brutto_kg == null ? 'brutto_kg' : 'tara_kg';
    const kg = kgLesen(roh);
    if (roh.trim() && kg === undefined) { melde('Gewicht: ganze Kilogramm.'); return; }
    const brutto = feld === 'brutto_kg' ? kg ?? null : w.brutto_kg;
    const tara = feld === 'tara_kg' ? (roh.trim() ? kg ?? null : w.tara_kg) : w.tara_kg;
    const p = wiegePruefen({ kennzeichen: w.kennzeichen, brutto: brutto == null ? '' : String(brutto), tara: tara == null ? '' : String(tara), abfall_schluessel_id: w.abfall_schluessel_id, abschliessen });
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const felder: Record<string, unknown> = {};
      if (roh.trim()) felder[feld] = kg;
      if (abschliessen) felder.status = 'abgeschlossen';
      if (!Object.keys(felder).length) { melde('Bitte das Gewicht eintragen.'); return; }
      const r = await schreiben(supabase.from('wiegeschein').update(felder).eq('id', w.id).select(WIEGE_FELDER));
      if (!r.ok) { melde(r.fehler); return; }
      const neu = ((r.data as Wiegeschein[]) ?? [])[0];
      setZweit({ ...zweit, [w.id]: '' });
      melde(null, abschliessen ? `Wiegeschein ${w.nummer} abgeschlossen: ${kgText(neu?.netto_kg)} netto.` : 'Gewicht gespeichert.');
      await onGeaendert();
      if (abschliessen && neu) await drucken(neu);
    } finally { setBusy(false); }
  }

  async function stornieren(w: Wiegeschein) {
    const grund = window.prompt(`Wiegeschein ${w.nummer} stornieren — bitte den Grund eintragen (z. B. „falsches Fahrzeug"):`);
    if (grund == null) return;
    if (!grund.trim()) { melde('Ohne Grund wird nicht storniert.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wiegeschein').update({ status: 'storniert', storno_grund: grund.trim().slice(0, 300) }).eq('id', w.id).select('id'),
        'Nicht storniert — einen abgeschlossenen Wiegeschein storniert nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Wiegeschein ${w.nummer} storniert. Für die Korrektur einen neuen Schein anlegen.`);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function loeschen(w: Wiegeschein) {
    if (!window.confirm(`Offenen Wiegeschein ${w.nummer} löschen?`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wiegeschein').delete().eq('id', w.id).select('id'), 'Nicht gelöscht — Löschen darf nur die Geschäftsleitung, und nur offene Scheine.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Gelöscht.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function drucken(w: Wiegeschein) {
    const firma = await firmaLaden();
    if (!zeige(wiegescheinHtml(w, container.find((c) => c.id === w.container_id) ?? null, firma))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  const vorschau = form ? nettoKg(kgLesen(form.brutto) ?? null, kgLesen(form.tara) ?? null) : null;
  const q = suche.trim().toLowerCase();
  const sichtbar = scheine.filter((w) => !q || [w.nummer, w.kennzeichen, w.kunde_name, w.abfall_schluessel, w.abfall_bezeichnung].some((x) => String(x ?? '').toLowerCase().includes(q)));
  const offen = sichtbar.filter((w) => w.status === 'offen');
  const rest = sichtbar.filter((w) => w.status !== 'offen');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!form && <div><button style={s.btnGold} onClick={() => { setForm(leer(gemerkteWaage())); melde(null); }}>+ Neuer Wiegeschein</button></div>}

      {form && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>Neuer Wiegeschein{form.auftrag_id ? ' (aus Auftrag)' : ''}</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {(['eingang', 'ausgang'] as const).map((r) => <button key={r} style={form.richtung === r ? s.reiterAn : s.reiterAus} onClick={() => setForm({ ...form, richtung: r })}>{richtungName(r)}</button>)}
          </div>
          <div style={s.raster}>
            <Feld label="Kennzeichen *" w={form.kennzeichen} max={15} on={(x) => setForm({ ...form, kennzeichen: x })} />
            {kontakte.length > 0 && (
              <label style={s.feld}>Aus Kontakten
                <select style={s.input} value={form.kontakt_id} onChange={(e) => kontaktWaehlen(e.target.value)}>
                  <option value="">— ohne Kontakt —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.anzeige}</option>)}
                </select>
              </label>
            )}
            <Feld label="Kunde" w={form.kunde_name} max={120} on={(x) => setForm({ ...form, kunde_name: x })} />
            <Feld label="Fahrer" w={form.fahrer} max={80} on={(x) => setForm({ ...form, fahrer: x })} />
            <Feld label="Herkunft / Anfallstelle" w={form.herkunft} max={200} on={(x) => setForm({ ...form, herkunft: x })} />
            <label style={s.feld}>Container
              <select style={s.input} value={form.container_id} onChange={(e) => setForm({ ...form, container_id: e.target.value })}>
                <option value="">—</option>{container.filter((c) => c.aktiv).map((c) => <option key={c.id} value={c.id}>{containerName(c)}</option>)}
              </select>
            </label>
            <label style={s.feld}>Abfallschlüssel (zum Abschließen nötig)
              <select style={s.input} value={form.abfall_schluessel_id} onChange={(e) => setForm({ ...form, abfall_schluessel_id: e.target.value })}>
                <option value="">—</option>
                {schluessel.filter((x) => x.aktiv).map((x) => <option key={x.id} value={x.id}>{schluesselLesbar(x.schluessel)} {x.bezeichnung}{x.gefaehrlich ? ' (gefährlich)' : ''}</option>)}
              </select>
            </label>
            <Feld label="Waage (z. B. Fahrzeugwaage Hof)" w={form.waage} max={80} on={(x) => setForm({ ...form, waage: x })} />
            <Feld label="Brutto (voll) in kg" w={form.brutto} max={8} on={(x) => setForm({ ...form, brutto: x })} />
            <Feld label="Tara (leer) in kg" w={form.tara} max={8} on={(x) => setForm({ ...form, tara: x })} />
            <Feld label="Bemerkung" w={form.notiz} max={500} span on={(x) => setForm({ ...form, notiz: x })} />
          </div>
          {!schluessel.some((x) => x.aktiv) && <p style={s.klein}>Noch keine Abfallschlüssel — bitte zuerst im Reiter „Abfallschlüssel" anlegen.</p>}
          <p style={s.klein}>Netto (Vorschau): <b>{kgText(vorschau)}</b>{vorschau != null ? ` = ${tonnenText(vorschau)}` : ''}. Gespeichert rechnet die Datenbank; die Uhrzeit jeder Wägung setzt der Server.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={s.btnAus} disabled={busy} onClick={() => void speichern(false)}>Erstwägung speichern (offen)</button>
            <button style={s.btnGold} disabled={busy} onClick={() => void speichern(true)}>Abschließen und drucken</button>
            <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={s.box}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <b style={{ color: C.gold }}>Wiegescheine (letzte 60 Tage)</b>
          <label style={{ ...s.feld, marginLeft: 'auto' }}>Suchen<input style={s.input} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Nummer, Kennzeichen, Kunde" /></label>
        </div>
        {offen.length > 0 && <h3 style={s.h3}>Offen — zweite Wägung ({offen.length})</h3>}
        <div style={{ display: 'grid', gap: 8 }}>
          {offen.map((w) => (
            <div key={w.id} style={s.innen}>
              <b>{w.nummer}</b> · {w.kennzeichen} · {w.kunde_name ?? '—'}
              <div style={s.klein}>Brutto {kgText(w.brutto_kg)}{w.brutto_am ? ` (${zeitDe(w.brutto_am)})` : ''} · Tara {kgText(w.tara_kg)} · {w.abfall_schluessel ? `${schluesselLesbar(w.abfall_schluessel)} ${w.abfall_bezeichnung ?? ''}` : 'ohne Abfallschlüssel'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'end' }}>
                <label style={s.feld}>{w.brutto_kg == null ? 'Brutto (voll) in kg' : 'Tara (leer) in kg'}
                  <input style={{ ...s.input, width: 130 }} value={zweit[w.id] ?? ''} maxLength={8} onChange={(e) => setZweit({ ...zweit, [w.id]: e.target.value })} />
                </label>
                <button style={s.btnAus} disabled={busy} onClick={() => void zweiteWaegung(w, false)}>speichern</button>
                <button style={s.btnGold} disabled={busy} onClick={() => void zweiteWaegung(w, true)}>abschließen und drucken</button>
                <button style={s.mini} onClick={() => void drucken(w)}>🖨 Entwurf</button>
                {istChef && <button style={s.mini} disabled={busy} onClick={() => void loeschen(w)}>löschen</button>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={s.tabelle}>
            <thead><tr><th style={s.th}>Nr.</th><th style={s.th}>Abgeschlossen</th><th style={s.th}>Kennzeichen / Kunde</th><th style={s.th}>Abfall</th><th style={{ ...s.th, textAlign: 'right' }}>Netto</th><th style={s.th}></th></tr></thead>
            <tbody>
              {rest.map((w) => (
                <tr key={w.id} style={{ opacity: w.status === 'storniert' ? 0.55 : 1 }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{w.nummer}{w.status === 'storniert' && <div style={{ color: C.bad, fontSize: 12 }}>storniert</div>}</td>
                  <td style={s.td}>{zeitDe(w.abgeschlossen_am ?? w.erstellt_am)}<div style={s.klein}>{richtungName(w.richtung)}</div></td>
                  <td style={s.td}>{w.kennzeichen}<div style={s.klein}>{w.kunde_name ?? ''}</div></td>
                  <td style={s.td}>{w.abfall_schluessel ? schluesselLesbar(w.abfall_schluessel) : '—'}{w.gefaehrlich ? <span style={{ color: C.bad }}> ✱</span> : null}<div style={s.klein}>{w.abfall_bezeichnung ?? ''}</div></td>
                  <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{kgText(w.netto_kg)}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button style={s.mini} onClick={() => void drucken(w)}>🖨</button>{' '}
                    {istChef && w.status === 'abgeschlossen' && <button style={s.mini} disabled={busy} onClick={() => void stornieren(w)}>stornieren</button>}
                  </td>
                </tr>
              ))}
              {!rest.length && <tr><td style={s.td} colSpan={6}><span style={s.klein}>Keine abgeschlossenen Wiegescheine{q ? ' zu dieser Suche' : ''}.</span></td></tr>}
            </tbody>
          </table>
        </div>
        <p style={s.klein}>Status: {wiegeStatusName('offen')} = Entwurf, {wiegeStatusName('abgeschlossen')} = unveränderbar, {wiegeStatusName('storniert')} = mit Grund ungültig gemacht. Gewichte übernehmen Sie von Ihrer Waage — ARGONAUT wiegt nicht selbst.</p>
      </div>
    </div>
  );
}
