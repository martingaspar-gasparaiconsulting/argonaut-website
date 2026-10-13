'use client';

// ARGONAUT OS · Paket 356 (13.10.2026) · ADR-Beförderungspapier (Inland) mit
// 1000-Punkte-Rechnung. Einstufung und Mengen trägt der Betrieb ein — ARGONAUT
// stuft nichts ein. Ausstellen erst nach Freigabe (Start-Schalter „adrPapier",
// R58); bis dahin druckt jedes Papier „ENTWURF".

import { useState } from 'react';
import {
  KLASSEN, VERPACKUNGSGRUPPEN, TUNNELCODES, KATEGORIEN, PUNKTE_GRENZE, positionZeile, punkteRechnen, punkteMengeLesen, papierPruefen, ausWiegeschein, adrHtml, zahlDe,
  type AdrPapier, type Position,
} from '@/lib/adrPapier';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { useFreigabeStand } from '@/lib/useFreigabeStand';
import { datumDe, kgText, type Wiegeschein } from '@/lib/entsorgung';
import { C, s, Feld, schreiben, firmaLaden, zeige, type Db, type Melde } from './entsorgungUi';

export const ADR_FELDER = 'id, nummer, datum, absender, empfaenger, befoerderer, kennzeichen, wiegeschein_id, positionen, hinweise, status, ausgestellt_am, ausgestellt_name, storno_grund, storniert_am, erstellt_am';

type Kopf = { id: string | null; datum: string; absender: string; empfaenger: string; befoerderer: string; kennzeichen: string; wiegeschein_id: string | null; hinweise: string };
const LEERE_POS: Position = { un_nr: '', benennung: '', klasse: '', nebengefahr: '', vg: '', tunnel: '', versandstuecke: '', menge: '', kategorie: '', menge_punkte: null, abfall: true, umwelt: false };

async function absenderText(): Promise<string> {
  const f = await firmaLaden();
  if (!f?.name) return '';
  return [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(' ')].filter((x) => x && String(x).trim()).join(', ');
}

export default function Gefahrgut({ supabase, papiere, scheine, istChef, heute, melde, onGeaendert }: {
  supabase: Db; papiere: AdrPapier[]; scheine: Wiegeschein[]; istChef: boolean; heute: string; melde: Melde; onGeaendert: () => Promise<void> | void;
}) {
  const freigabe = useFreigabeStand().start; // Paket 346: Code ODER Freigabe-Zentrale
  const frei = startFrei('adrPapier', freigabe);
  const [kopf, setKopf] = useState<Kopf | null>(null);
  const [pos, setPos] = useState<Position[]>([]);
  const [punkteRoh, setPunkteRoh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function neu(w?: Wiegeschein) {
    const abs = await absenderText();
    if (w) {
      const v = ausWiegeschein(w, abs, heute);
      setKopf({ id: null, ...v.kopf, befoerderer: '', hinweise: '' });
      setPos(v.positionen); setPunkteRoh(v.positionen.map((p) => (p.menge_punkte != null ? String(p.menge_punkte) : '')));
    } else {
      setKopf({ id: null, datum: heute, absender: abs, empfaenger: '', befoerderer: '', kennzeichen: '', wiegeschein_id: null, hinweise: '' });
      setPos([{ ...LEERE_POS }]); setPunkteRoh(['']);
    }
    melde(null);
  }

  function bearbeiten(a: AdrPapier) {
    setKopf({ id: a.id, datum: a.datum, absender: a.absender, empfaenger: a.empfaenger, befoerderer: a.befoerderer ?? '', kennzeichen: a.kennzeichen ?? '', wiegeschein_id: a.wiegeschein_id, hinweise: a.hinweise ?? '' });
    const p = Array.isArray(a.positionen) ? a.positionen : [];
    setPos(p.map((x) => ({ ...LEERE_POS, ...x }))); setPunkteRoh(p.map((x) => (x.menge_punkte != null ? String(x.menge_punkte).replace('.', ',') : '')));
    melde(null);
  }

  function setzeP(i: number, teil: Partial<Position>) { setPos(pos.map((p, j) => (j === i ? { ...p, ...teil } : p))); }
  function setzePunkte(i: number, roh: string) {
    setPunkteRoh(punkteRoh.map((x, j) => (j === i ? roh : x)));
    const z = punkteMengeLesen(roh);
    setzeP(i, { menge_punkte: z == null ? null : z });
  }

  async function speichern(ausstellen: boolean) {
    if (!kopf) return;
    if (ausstellen && !frei) { melde(startSperrGrund('adrPapier', freigabe)); return; }
    if (punkteRoh.some((r) => r.trim() && punkteMengeLesen(r) === undefined)) { melde('Menge für die Punkte: eine Zahl (kg bzw. l).'); return; }
    const f = papierPruefen(kopf, pos, ausstellen);
    if (f.length) { melde(f.join(' ')); return; }
    if (ausstellen && !window.confirm('Beförderungspapier ausstellen? Danach lässt es sich nicht mehr ändern (nur stornieren).')) return;
    setBusy(true); melde(null);
    try {
      const daten = {
        datum: kopf.datum, absender: kopf.absender.trim(), empfaenger: kopf.empfaenger.trim(), befoerderer: kopf.befoerderer.trim() || null, kennzeichen: kopf.kennzeichen.trim() || null,
        wiegeschein_id: kopf.wiegeschein_id, hinweise: kopf.hinweise.trim() || null, status: ausstellen ? 'ausgestellt' : 'entwurf',
        positionen: pos.map((p) => ({ ...p, un_nr: String(p.un_nr ?? '').trim().toUpperCase().replace(/^UN\s*/, ''), benennung: p.benennung.trim(), versandstuecke: p.versandstuecke.trim(), menge: p.menge.trim() })),
      };
      const q = kopf.id ? supabase.from('adr_papier').update(daten).eq('id', kopf.id).select(ADR_FELDER) : supabase.from('adr_papier').insert(daten).select(ADR_FELDER);
      const r = await schreiben(q);
      if (!r.ok) { melde(r.fehler); return; }
      const a = ((r.data as AdrPapier[]) ?? [])[0];
      melde(null, ausstellen ? `Beförderungspapier ${a?.nummer ?? ''} ausgestellt.` : `Entwurf ${a?.nummer ?? ''} gespeichert.`);
      setKopf(null);
      await onGeaendert();
      if (ausstellen && a) await drucken(a);
    } finally { setBusy(false); }
  }

  async function stornieren(a: AdrPapier) {
    const grund = window.prompt(`Beförderungspapier ${a.nummer} stornieren — bitte den Grund eintragen:`);
    if (grund == null) return;
    if (!grund.trim()) { melde('Ohne Grund wird nicht storniert.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('adr_papier').update({ status: 'storniert', storno_grund: grund.trim().slice(0, 300) }).eq('id', a.id).select('id'), 'Nicht storniert — stornieren darf nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Storniert.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function loeschen(a: AdrPapier) {
    if (!window.confirm(`Entwurf ${a.nummer} löschen?`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('adr_papier').delete().eq('id', a.id).select('id'), 'Nicht gelöscht — Entwürfe löscht nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Gelöscht.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function drucken(a: AdrPapier) {
    const firma = await firmaLaden();
    if (!zeige(adrHtml(a, firma, frei))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  const pt = punkteRechnen(pos);
  const gefScheine = scheine.filter((w) => w.status === 'abgeschlossen' && w.gefaehrlich).slice(0, 10);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={s.hinweis}>
        Einstufung (UN-Nummer, Klasse, Verpackungsgruppe, Beförderungskategorie) und Mengen tragen Sie bzw. Ihr Gefahrgutbeauftragter ein — ARGONAUT hat
        keine Gefahrgut-Datenbank und stuft nichts ein. {!frei && <b>{startSperrGrund('adrPapier', freigabe)}</b>}
      </div>

      {!kopf && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={s.btnGold} onClick={() => void neu()}>+ Neues Beförderungspapier</button>
          {gefScheine.length > 0 && (
            <select style={{ ...s.input, fontSize: 13 }} value="" onChange={(e) => { const w = gefScheine.find((x) => x.id === e.target.value); if (w) void neu(w); }}>
              <option value="">aus Wiegeschein (gefährlicher Abfall) …</option>
              {gefScheine.map((w) => <option key={w.id} value={w.id}>{w.nummer} · {w.kunde_name ?? ''} · {kgText(w.netto_kg)}</option>)}
            </select>
          )}
        </div>
      )}

      {kopf && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>{kopf.id ? 'Entwurf bearbeiten' : 'Neues Beförderungspapier'}</b>
          <div style={{ ...s.raster, marginTop: 8 }}>
            <label style={s.feld}>Datum der Beförderung *<input style={s.input} type="date" value={kopf.datum} onChange={(e) => setKopf({ ...kopf, datum: e.target.value })} /></label>
            <Feld label="Kennzeichen" w={kopf.kennzeichen} max={15} on={(x) => setKopf({ ...kopf, kennzeichen: x })} />
            <Feld label="Absender (Name, Anschrift) *" w={kopf.absender} max={300} span on={(x) => setKopf({ ...kopf, absender: x })} />
            <Feld label="Empfänger (Name, Anschrift) *" w={kopf.empfaenger} max={300} span on={(x) => setKopf({ ...kopf, empfaenger: x })} />
            <Feld label="Beförderer" w={kopf.befoerderer} max={300} span on={(x) => setKopf({ ...kopf, befoerderer: x })} />
          </div>

          <h3 style={s.h3}>Positionen</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {pos.map((p, i) => (
              <div key={i} style={s.innen}>
                <div style={{ ...s.raster, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                  <Feld label="UN-Nummer *" w={p.un_nr} max={7} on={(x) => setzeP(i, { un_nr: x })} />
                  <Feld label="Offizielle Benennung *" w={p.benennung} max={300} span on={(x) => setzeP(i, { benennung: x })} />
                  <label style={s.feld}>Klasse *
                    <select style={s.input} value={p.klasse} onChange={(e) => setzeP(i, { klasse: e.target.value })}>
                      <option value="">—</option>{KLASSEN.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                    </select>
                  </label>
                  <Feld label="Nebengefahren (z. B. 6.1)" w={p.nebengefahr ?? ''} max={20} on={(x) => setzeP(i, { nebengefahr: x })} />
                  <label style={s.feld}>Verpackungsgruppe
                    <select style={s.input} value={p.vg ?? ''} onChange={(e) => setzeP(i, { vg: e.target.value })}>{VERPACKUNGSGRUPPEN.map((v) => <option key={v} value={v}>{v || '—'}</option>)}</select>
                  </label>
                  <label style={s.feld}>Tunnelcode
                    <select style={s.input} value={p.tunnel ?? ''} onChange={(e) => setzeP(i, { tunnel: e.target.value })}>{TUNNELCODES.map((v) => <option key={v} value={v}>{v || '—'}</option>)}</select>
                  </label>
                  <Feld label="Versandstücke * (z. B. 2 Big Bags)" w={p.versandstuecke} max={120} on={(x) => setzeP(i, { versandstuecke: x })} />
                  <Feld label="Gesamtmenge * (z. B. 800 kg)" w={p.menge} max={60} on={(x) => setzeP(i, { menge: x })} />
                  <label style={s.feld}>Beförderungskategorie
                    <select style={s.input} value={p.kategorie ?? ''} onChange={(e) => setzeP(i, { kategorie: e.target.value })}>
                      <option value="">—</option>{KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                    </select>
                  </label>
                  <Feld label="Menge für Punkte (kg bzw. l)" w={punkteRoh[i] ?? ''} max={12} on={(x) => setzePunkte(i, x)} />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <label style={s.klein}><input type="checkbox" checked={!!p.abfall} onChange={(e) => setzeP(i, { abfall: e.target.checked })} /> Abfall (mit „ABFALL“ davor)</label>
                  <label style={s.klein}><input type="checkbox" checked={!!p.umwelt} onChange={(e) => setzeP(i, { umwelt: e.target.checked })} /> umweltgefährdend</label>
                  {pos.length > 1 && <button style={s.mini} onClick={() => { setPos(pos.filter((_, j) => j !== i)); setPunkteRoh(punkteRoh.filter((_, j) => j !== i)); }}>Position entfernen</button>}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 6 }}>{positionZeile(p)}</div>
              </div>
            ))}
          </div>
          {pos.length < 20 && <button style={{ ...s.mini, marginTop: 8 }} onClick={() => { setPos([...pos, { ...LEERE_POS }]); setPunkteRoh([...punkteRoh, '']); }}>+ Position</button>}

          <div style={{ ...s.innen, marginTop: 10, borderColor: pt.freistellung ? C.ok : C.warn }}>
            <b>1000-Punkte-Rechnung (ADR 1.1.3.6)</b>
            <div style={s.klein}>
              {pt.jeKategorie.map((k) => `Kategorie ${k.kategorie}: ${zahlDe(k.menge)} → ${zahlDe(k.punkte)} Punkte`).join(' · ') || 'Noch keine Kategorie eingetragen.'}
            </div>
            <div style={{ marginTop: 4 }}>
              Summe: <b>{zahlDe(pt.summe)}</b> von {PUNKTE_GRENZE} —{' '}
              {pt.kat0 ? <span style={{ color: C.bad }}>Kategorie 0 enthalten: keine Freistellung möglich.</span>
                : pt.ohneKategorie ? <span style={{ color: C.warn }}>{pt.ohneKategorie} Position(en) ohne Kategorie.</span>
                : pt.freistellung ? <span style={{ color: C.ok }}>unter der Grenze — Freistellung nach 1.1.3.6 möglich.</span>
                : <span style={{ color: C.bad }}>über der Grenze — volle ADR-Vorschriften.</span>}
            </div>
          </div>

          <Feld label="Weitere Angaben (z. B. Vermerke nach 5.4.1.1)" w={kopf.hinweise} max={1000} span on={(x) => setKopf({ ...kopf, hinweise: x })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={s.btnAus} disabled={busy} onClick={() => void speichern(false)}>Als Entwurf speichern</button>
            <button style={frei ? s.btnGold : { ...s.btnGold, opacity: 0.45, cursor: 'not-allowed' }} disabled={busy || !frei} title={frei ? '' : String(startSperrGrund('adrPapier', freigabe))} onClick={() => void speichern(true)}>Ausstellen und drucken</button>
            <button style={s.btnAus} onClick={() => setKopf(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={s.box}>
        <b style={{ color: C.gold }}>Beförderungspapiere (letzte 60 Tage)</b>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={s.tabelle}>
            <thead><tr><th style={s.th}>Nr.</th><th style={s.th}>Datum</th><th style={s.th}>Empfänger</th><th style={s.th}>Güter</th><th style={s.th}>Stand</th><th style={s.th}></th></tr></thead>
            <tbody>
              {papiere.map((a) => {
                const p = Array.isArray(a.positionen) ? a.positionen : [];
                return (
                  <tr key={a.id} style={{ opacity: a.status === 'storniert' ? 0.55 : 1 }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>{a.nummer}</td>
                    <td style={s.td}>{datumDe(a.datum)}<div style={s.klein}>{a.kennzeichen ?? ''}</div></td>
                    <td style={s.td}>{a.empfaenger}</td>
                    <td style={{ ...s.td, fontSize: 12.5 }}>{p.map((x, i) => <div key={i}>{positionZeile(x)}</div>)}</td>
                    <td style={s.td}>{a.status === 'ausgestellt' ? 'ausgestellt' : a.status === 'storniert' ? <span style={{ color: C.bad }}>storniert</span> : 'Entwurf'}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button style={s.mini} onClick={() => void drucken(a)}>🖨</button>{' '}
                      {a.status === 'entwurf' && <button style={s.mini} disabled={busy} onClick={() => bearbeiten(a)}>bearbeiten</button>}{' '}
                      {istChef && a.status === 'entwurf' && <button style={s.mini} disabled={busy} onClick={() => void loeschen(a)}>löschen</button>}
                      {istChef && a.status === 'ausgestellt' && <button style={s.mini} disabled={busy} onClick={() => void stornieren(a)}>stornieren</button>}
                    </td>
                  </tr>
                );
              })}
              {!papiere.length && <tr><td style={s.td} colSpan={6}><span style={s.klein}>Noch keine Beförderungspapiere.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
