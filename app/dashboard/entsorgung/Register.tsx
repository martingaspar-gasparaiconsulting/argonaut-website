'use client';

// ARGONAUT OS · Paket 356 (13.10.2026) · Abfallregister (Nachweisbuch).
// Nur anhängen: Korrektur = Storno mit Grund (Geschäftsleitung) und neuer Eintrag.
// Abgeschlossene Wiegescheine lassen sich mit einem Klick übernehmen.
// ARGONAUT übermittelt nichts an das eANV — das bleibt beim Betrieb.

import { useState, useEffect } from 'react';
import {
  RICHTUNGEN, EINHEITEN, EINSTELLUNG_MODUL, richtungName, eintragPruefen, ausWiegeschein, offeneScheine, summen, mengeText, registerHtml, registerCsv,
  type RegisterEintrag, type RegisterEingabe, type BetriebNummern,
} from '@/lib/abfallRegister';
import { schluesselLesbar, kgText, datumDe, zeitDe, type Wiegeschein } from '@/lib/entsorgung';
import { C, s, Feld, schreiben, firmaLaden, zeige, type Db, type Melde } from './entsorgungUi';
import type { Schluessel } from './Schluessel';

const LEER = (tag: string, n: BetriebNummern): RegisterEingabe => ({
  datum: tag, richtung: 'annahme', abfall_schluessel_id: null, menge: '', einheit: 'kg', erzeuger: '', erzeuger_nr: '', befoerderer: '', befoerderer_nr: '',
  entsorger: '', entsorger_nr: n.entsorger_nr, nachweis_nr: '', schein_nr: '', verfahren: '', kennzeichen: '', notiz: '',
});

export default function Register({ supabase, eintraege, scheine, schluessel, nummern, ich, istChef, heute, melde, onGeaendert }: {
  supabase: Db; eintraege: RegisterEintrag[]; scheine: Wiegeschein[]; schluessel: Schluessel[]; nummern: BetriebNummern; ich: string | null;
  istChef: boolean; heute: string; melde: Melde; onGeaendert: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<(RegisterEingabe & { wiegeschein_id?: string | null }) | null>(null);
  const [von, setVon] = useState(heute.slice(0, 4) + '-01-01');
  const [bis, setBis] = useState(heute);
  const [nr, setNr] = useState<BetriebNummern>(nummern);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNr(nummern); }, [nummern]);

  const offen = offeneScheine(scheine, eintraege);
  const gewaehlt = schluessel.find((x) => x.id === form?.abfall_schluessel_id) ?? null;
  const f = (k: keyof RegisterEingabe) => (x: string) => form && setForm({ ...form, [k]: x });

  async function uebernehmen(w: Wiegeschein) {
    const firma = await firmaLaden();
    setForm({ ...ausWiegeschein(w, nummern, firma?.name ?? null), wiegeschein_id: w.id });
    melde(null);
  }

  async function speichern() {
    if (!form) return;
    const p = eintragPruefen(form, heute, !!gewaehlt?.gefaehrlich);
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    if (p.hinweise.length && !window.confirm(p.hinweise.join('\n') + '\n\nTrotzdem eintragen?')) return;
    setBusy(true); melde(null);
    try {
      const t = (x: string | undefined) => String(x ?? '').trim() || null;
      const r = await schreiben(supabase.from('abfall_register').insert({
        datum: form.datum, richtung: form.richtung, abfall_schluessel_id: form.abfall_schluessel_id, menge: p.menge, einheit: form.einheit,
        erzeuger: t(form.erzeuger), erzeuger_nr: t(form.erzeuger_nr), befoerderer: t(form.befoerderer), befoerderer_nr: t(form.befoerderer_nr),
        entsorger: t(form.entsorger), entsorger_nr: t(form.entsorger_nr), nachweis_nr: t(form.nachweis_nr), schein_nr: t(form.schein_nr),
        verfahren: p.verfahren, kennzeichen: t(form.kennzeichen), notiz: t(form.notiz), wiegeschein_id: form.wiegeschein_id ?? null,
      }).select('id'), 'Nicht eingetragen — dafür ist das Schreibrecht „Entsorgung" nötig (und SQL Paket 356).');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Ins Register eingetragen.');
      setForm(null);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function stornieren(e: RegisterEintrag) {
    const grund = window.prompt('Registereintrag stornieren — bitte den Grund eintragen (z. B. „falsche Menge"). Danach den richtigen Eintrag neu anlegen:');
    if (grund == null) return;
    if (!grund.trim()) { melde('Ohne Grund wird nicht storniert.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('abfall_register').update({ status: 'storniert', storno_grund: grund.trim().slice(0, 300) }).eq('id', e.id).select('id'),
        'Nicht storniert — stornieren darf nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Storniert. Der Eintrag bleibt mit Grund im Register sichtbar.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function nummernSpeichern() {
    setBusy(true); melde(null);
    try {
      const n = { erzeuger_nr: nr.erzeuger_nr.trim().toUpperCase().slice(0, 20), befoerderer_nr: nr.befoerderer_nr.trim().toUpperCase().slice(0, 20), entsorger_nr: nr.entsorger_nr.trim().toUpperCase().slice(0, 20) };
      const r = await schreiben(supabase.from('modul_einstellung').upsert({ owner_user_id: ich, modul: EINSTELLUNG_MODUL, einstellung: n, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' }).select('id'), 'Nicht gespeichert — die Betriebsnummern trägt die Geschäftsleitung ein.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Betriebsnummern gespeichert — sie stehen im Register-Druck und werden beim Übernehmen vorbelegt.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function drucken() {
    if (bis < von) { melde('„Bis" liegt vor „Von".'); return; }
    const firma = await firmaLaden();
    if (!zeige(registerHtml(eintraege, von, bis, firma, nummern, new Date().toISOString()))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  function csv() {
    const liste = eintraege.filter((e) => e.datum >= von && e.datum <= bis);
    const url = URL.createObjectURL(new Blob([registerCsv(liste)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `abfallregister-${von}-bis-${bis}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const liste = eintraege.filter((e) => e.datum >= von && e.datum <= bis).slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.erfasst_am.localeCompare(a.erfasst_am));
  const sum = summen(eintraege, von, bis);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={s.klein}>
        Das Register wird nur angehängt: Ein Eintrag bleibt, wie er ist. Ist etwas falsch, storniert die Geschäftsleitung den Eintrag mit Grund, danach wird
        der richtige neu angelegt. Elektronische Begleitscheine und Nachweise (eANV) führen Sie weiter in Ihrem eANV-Zugang — ARGONAUT übermittelt nichts.
      </p>

      {offen.length > 0 && !form && (
        <div style={s.hinweis}>
          <b>Abgeschlossene Wiegescheine ohne Registereintrag ({offen.length}):</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {offen.slice(0, 12).map((w) => (
              <button key={w.id} style={s.mini} onClick={() => void uebernehmen(w)}>{w.nummer} · {kgText(w.netto_kg)} · {w.abfall_schluessel ? schluesselLesbar(w.abfall_schluessel) : '—'} → übernehmen</button>
            ))}
          </div>
        </div>
      )}

      {!form && <div><button style={s.btnGold} onClick={() => { setForm(LEER(heute, nummern)); melde(null); }}>+ Eintrag von Hand</button></div>}

      {form && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>Neuer Registereintrag{form.wiegeschein_id ? ' (aus Wiegeschein)' : ''}</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {RICHTUNGEN.map((r) => <button key={r.key} style={form.richtung === r.key ? s.reiterAn : s.reiterAus} onClick={() => setForm({ ...form, richtung: r.key })}>{r.name}</button>)}
          </div>
          <div style={s.raster}>
            <label style={s.feld}>Datum *<input style={s.input} type="date" value={form.datum} max={heute} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
            <label style={s.feld}>Abfallschlüssel *
              <select style={s.input} value={form.abfall_schluessel_id ?? ''} onChange={(e) => setForm({ ...form, abfall_schluessel_id: e.target.value || null })}>
                <option value="">—</option>
                {schluessel.filter((x) => x.aktiv || x.id === form.abfall_schluessel_id).map((x) => <option key={x.id} value={x.id}>{schluesselLesbar(x.schluessel)} {x.bezeichnung}{x.gefaehrlich ? ' (gefährlich)' : ''}</option>)}
              </select>
            </label>
            <Feld label="Menge *" w={form.menge} max={16} on={f('menge')} />
            <label style={s.feld}>Einheit
              <select style={s.input} value={form.einheit} onChange={(e) => setForm({ ...form, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
            </label>
            <Feld label="Erzeuger (Name, Anschrift)" w={form.erzeuger ?? ''} max={300} on={f('erzeuger')} />
            <Feld label="Erzeugernummer" w={form.erzeuger_nr ?? ''} max={20} on={f('erzeuger_nr')} />
            <Feld label="Beförderer" w={form.befoerderer ?? ''} max={300} on={f('befoerderer')} />
            <Feld label="Beförderernummer" w={form.befoerderer_nr ?? ''} max={20} on={f('befoerderer_nr')} />
            <Feld label="Entsorger" w={form.entsorger ?? ''} max={300} on={f('entsorger')} />
            <Feld label="Entsorgernummer" w={form.entsorger_nr ?? ''} max={20} on={f('entsorger_nr')} />
            <Feld label="Entsorgungs-/Sammelnachweis-Nr." w={form.nachweis_nr ?? ''} max={40} on={f('nachweis_nr')} />
            <Feld label="Begleit-/Übernahmeschein-Nr." w={form.schein_nr ?? ''} max={40} on={f('schein_nr')} />
            <Feld label="Verfahren (R1–R13, D1–D15)" w={form.verfahren ?? ''} max={3} on={f('verfahren')} />
            <Feld label="Kennzeichen" w={form.kennzeichen ?? ''} max={15} on={f('kennzeichen')} />
            <Feld label="Bemerkung" w={form.notiz ?? ''} max={500} span on={f('notiz')} />
          </div>
          {gewaehlt?.gefaehrlich && <p style={{ ...s.klein, color: C.warn }}>Gefährlicher Abfall: Nachweis- und Begleit-/Übernahmeschein-Nummer gehören in der Regel dazu.</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void speichern()}>Ins Register eintragen</button>
            <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={s.box}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={s.feld}>Von<input style={s.input} type="date" value={von} onChange={(e) => setVon(e.target.value)} /></label>
          <label style={s.feld}>Bis<input style={s.input} type="date" value={bis} onChange={(e) => setBis(e.target.value)} /></label>
          <button style={s.btnAus} onClick={() => void drucken()}>🖨 Register drucken</button>
          <button style={s.btnAus} onClick={csv}>⬇ CSV für die Behörde</button>
        </div>
        {sum.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            {sum.map((x) => (
              <div key={x.schluessel + x.richtung} style={{ ...s.innen, padding: '6px 10px' }}>
                <b>{schluesselLesbar(x.schluessel)}</b>{x.gefaehrlich ? <span style={{ color: C.bad }}> *</span> : null} · {richtungName(x.richtung)}
                <div style={s.klein}>{[x.kg ? kgText(x.kg) : '', ...x.sonst.map((y) => mengeText(y.menge, y.einheit))].filter(Boolean).join(' + ')} · {x.anzahl} Einträge</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tabelle}>
            <thead><tr><th style={s.th}>Datum</th><th style={s.th}>Abfall</th><th style={{ ...s.th, textAlign: 'right' }}>Menge</th><th style={s.th}>Erzeuger / Entsorger</th><th style={s.th}>Nachweis / Schein</th><th style={s.th}>Erfasst</th><th style={s.th}></th></tr></thead>
            <tbody>
              {liste.map((e) => (
                <tr key={e.id} style={{ opacity: e.status === 'storniert' ? 0.55 : 1 }}>
                  <td style={s.td}>{datumDe(e.datum)}<div style={s.klein}>{richtungName(e.richtung)}</div>{e.status === 'storniert' && <div style={{ color: C.bad, fontSize: 12 }}>storniert: {e.storno_grund}</div>}</td>
                  <td style={s.td}><b>{schluesselLesbar(e.abfall_schluessel)}</b>{e.gefaehrlich ? <span style={{ color: C.bad }}> *</span> : null}<div style={s.klein}>{e.abfall_bezeichnung}</div></td>
                  <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{mengeText(Number(e.menge), e.einheit)}</td>
                  <td style={s.td}>{e.erzeuger ?? '—'}<div style={s.klein}>→ {e.entsorger ?? '—'}</div></td>
                  <td style={s.td}>{e.nachweis_nr ?? '—'}<div style={s.klein}>{e.schein_nr ?? ''}{e.verfahren ? ` · ${e.verfahren}` : ''}</div></td>
                  <td style={s.td}>{zeitDe(e.erfasst_am)}<div style={s.klein}>{e.erfasst_name ?? ''}</div></td>
                  <td style={s.td}>{istChef && e.status === 'gueltig' && <button style={s.mini} disabled={busy} onClick={() => void stornieren(e)}>stornieren</button>}</td>
                </tr>
              ))}
              {!liste.length && <tr><td style={s.td} colSpan={7}><span style={s.klein}>Im Zeitraum keine Einträge.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div style={s.box}>
        <b style={{ color: C.gold }}>Ihre Betriebsnummern</b>
        <p style={s.klein}>Die Nummern, die Ihnen die Behörde zugeteilt hat (Erzeuger-, Beförderer-, Entsorgernummer). Sie stehen im Register-Druck und werden beim Übernehmen eines Wiegescheins vorbelegt.</p>
        <div style={{ ...s.raster, alignItems: 'end' }}>
          <Feld label="Erzeugernummer" w={nr.erzeuger_nr} max={20} on={(x) => setNr({ ...nr, erzeuger_nr: x })} />
          <Feld label="Beförderernummer" w={nr.befoerderer_nr} max={20} on={(x) => setNr({ ...nr, befoerderer_nr: x })} />
          <Feld label="Entsorgernummer" w={nr.entsorger_nr} max={20} on={(x) => setNr({ ...nr, entsorger_nr: x })} />
          {istChef && <button style={s.btnGold} disabled={busy} onClick={() => void nummernSpeichern()}>Speichern</button>}
        </div>
        {!istChef && <p style={s.klein}>Die Nummern trägt die Geschäftsleitung ein.</p>}
      </div>
    </div>
  );
}
