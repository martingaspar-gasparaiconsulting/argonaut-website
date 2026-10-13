'use client';

// ARGONAUT OS · Paket 355 (13.10.2026) · Container-Aufträge: Stellen, Tauschen, Abholen.
// Erledigen setzt die Container in der Datenbank um (neuer zum Kunden, alter auf den Hof).

import { useState, useEffect } from 'react';
import {
  AUFTRAG_ARTEN, auftragArtName, braucht, auftragPruefen, erledigenPruefen, tagesListe, tageslisteHtml, containerName, groesseLesen, groesseText,
  schluesselLesbar, datumDe, type Auftrag, type Container,
} from '@/lib/entsorgung';
import { C, s, Feld, schreiben, firmaLaden, zeige, type Db, type Melde, type Kontakt } from './entsorgungUi';
import type { Schluessel } from './Schluessel';

export type Vorlage = { art: 'stellen' | 'tauschen' | 'abholen'; container?: Container | null } | null;

type Form = {
  art: string; termin: string; zeitfenster: string; kontakt_id: string; kunde_name: string; stellplatz: string; telefon: string;
  container_id: string; container_alt_id: string; groesse_m3: string; abfall_schluessel_id: string; fahrer: string; notiz: string;
};
const LEER = (tag: string): Form => ({
  art: 'stellen', termin: tag, zeitfenster: '', kontakt_id: '', kunde_name: '', stellplatz: '', telefon: '',
  container_id: '', container_alt_id: '', groesse_m3: '', abfall_schluessel_id: '', fahrer: '', notiz: '',
});

function tagPlus(tag: string, n: number): string {
  const d = new Date(tag + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function Auftraege({ supabase, auftraege, container, schluessel, kontakte, heute, istChef, vorlage, melde, onGeaendert, onWiegen }: {
  supabase: Db; auftraege: Auftrag[]; container: Container[]; schluessel: Schluessel[]; kontakte: Kontakt[]; heute: string; istChef: boolean;
  vorlage: Vorlage; melde: Melde; onGeaendert: () => Promise<void> | void; onWiegen: (a: Auftrag) => void;
}) {
  const [tag, setTag] = useState(heute);
  const [form, setForm] = useState<Form | null>(null);
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Aus dem Containerbestand: „Tausch planen" / „Abholung planen" füllt das Formular vor
  useEffect(() => {
    if (!vorlage) return;
    const c = vorlage.container ?? null;
    setForm({
      ...LEER(heute), art: vorlage.art, kontakt_id: c?.kontakt_id ?? '', kunde_name: c?.kunde_name ?? '', stellplatz: c?.stellplatz ?? '',
      container_alt_id: c && vorlage.art !== 'stellen' ? c.id : '', groesse_m3: c?.groesse_m3 ? String(c.groesse_m3).replace('.', ',') : '',
    });
  }, [vorlage, heute]);

  const hof = container.filter((c) => c.aktiv && c.status === 'lager').sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));
  const draussen = container.filter((c) => c.aktiv && (c.status === 'gestellt' || c.status === 'voll')).sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));
  const cName = (id: string | null) => containerName(container.find((c) => c.id === id) ?? null);

  function kontaktWaehlen(id: string) {
    if (!form) return;
    const k = kontakte.find((x) => x.id === id);
    setForm({ ...form, kontakt_id: id, kunde_name: k ? k.anzeige : form.kunde_name, telefon: k?.telefon ?? form.telefon, stellplatz: form.stellplatz || (k?.adresse ?? '') });
  }

  async function anlegen() {
    if (!form) return;
    const b = braucht(form.art);
    const eingabe = { ...form, container_id: b.neu ? form.container_id || null : null, container_alt_id: b.alt ? form.container_alt_id || null : null };
    const p = auftragPruefen(eingabe);
    const g = groesseLesen(form.groesse_m3);
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    if (g === undefined) { melde('Größe: eine Zahl über 0 bis 100 m³ — oder leer lassen.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_auftrag').insert({
        art: form.art, termin: form.termin, zeitfenster: form.zeitfenster.trim() || null, kontakt_id: form.kontakt_id || null,
        kunde_name: form.kunde_name.trim(), stellplatz: form.stellplatz.trim(), telefon: form.telefon.trim() || null,
        container_id: eingabe.container_id, container_alt_id: eingabe.container_alt_id, groesse_m3: g,
        abfall_schluessel_id: form.abfall_schluessel_id || null, fahrer: form.fahrer.trim() || null, notiz: form.notiz.trim() || null,
      }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Auftrag „${auftragArtName(form.art)}" für ${form.kunde_name.trim()} am ${datumDe(form.termin)} geplant.`);
      setTag(form.termin);
      setForm(null);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function erledigen(a: Auftrag) {
    const gewaehlt = wahl[a.id] || a.container_id;
    const pruef = erledigenPruefen({ ...a, container_id: gewaehlt ?? null }, container);
    if (!pruef.ok) { melde(pruef.fehler); return; }
    setBusy(true); melde(null);
    try {
      const felder: Record<string, unknown> = { status: 'erledigt' };
      if (braucht(a.art).neu && gewaehlt !== a.container_id) felder.container_id = gewaehlt;
      const r = await schreiben(supabase.from('container_auftrag').update(felder).eq('id', a.id).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Erledigt: ${auftragArtName(a.art)} bei ${a.kunde_name} — der Containerbestand ist umgesetzt.`);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function stornieren(a: Auftrag) {
    if (!window.confirm(`Auftrag „${auftragArtName(a.art)}" bei ${a.kunde_name} stornieren?`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_auftrag').update({ status: 'storniert' }).eq('id', a.id).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Storniert.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function loeschen(a: Auftrag) {
    if (!window.confirm('Auftrag endgültig löschen?')) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_auftrag').delete().eq('id', a.id).select('id'), 'Nicht gelöscht — Löschen darf nur die Geschäftsleitung, erledigte Aufträge bleiben.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Gelöscht.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function drucken() {
    const firma = await firmaLaden();
    if (!zeige(tageslisteHtml(tag, auftraege, container, firma))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  const liste = tagesListe(auftraege, tag);
  const ueberfaellig = auftraege.filter((a) => a.status === 'geplant' && a.termin < heute).sort((a, b) => a.termin.localeCompare(b.termin));
  const b = form ? braucht(form.art) : { neu: false, alt: false };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!form && <div><button style={s.btnGold} onClick={() => { setForm(LEER(tag)); melde(null); }}>+ Neuer Auftrag</button></div>}

      {form && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>Neuer Auftrag</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {AUFTRAG_ARTEN.map((x) => (
              <button key={x.key} style={form.art === x.key ? s.reiterAn : s.reiterAus}
                onClick={() => setForm({ ...form, art: x.key, container_id: braucht(x.key).neu ? form.container_id : '', container_alt_id: braucht(x.key).alt ? form.container_alt_id : '' })}>
                {x.zeichen} {x.name}
              </button>
            ))}
          </div>
          <div style={s.raster}>
            <label style={s.feld}>Termin *<input style={s.input} type="date" value={form.termin} onChange={(e) => setForm({ ...form, termin: e.target.value })} /></label>
            <Feld label="Zeitfenster (z. B. 7–9 Uhr)" w={form.zeitfenster} max={40} on={(x) => setForm({ ...form, zeitfenster: x })} />
            {kontakte.length > 0 && (
              <label style={s.feld}>Aus Kontakten
                <select style={s.input} value={form.kontakt_id} onChange={(e) => kontaktWaehlen(e.target.value)}>
                  <option value="">— ohne Kontakt —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.anzeige}</option>)}
                </select>
              </label>
            )}
            <Feld label="Kunde *" w={form.kunde_name} max={120} on={(x) => setForm({ ...form, kunde_name: x })} />
            <Feld label="Stellplatz * (Adresse, Hinweis)" w={form.stellplatz} max={300} span on={(x) => setForm({ ...form, stellplatz: x })} />
            <Feld label="Telefon vor Ort" w={form.telefon} max={40} on={(x) => setForm({ ...form, telefon: x })} />
            {b.alt && (
              <label style={s.feld}>Wird abgeholt (beim Kunden)
                <select style={s.input} value={form.container_alt_id} onChange={(e) => setForm({ ...form, container_alt_id: e.target.value })}>
                  <option value="">— später wählen —</option>
                  {draussen.map((c) => <option key={c.id} value={c.id}>{c.nummer} · {c.kunde_name ?? ''}{c.status === 'voll' ? ' (voll)' : ''}</option>)}
                </select>
              </label>
            )}
            {b.neu && <Feld label="Größe gewünscht (m³)" w={form.groesse_m3} max={6} on={(x) => setForm({ ...form, groesse_m3: x })} />}
            {b.neu && (
              <label style={s.feld}>Wird gestellt (vom Hof)
                <select style={s.input} value={form.container_id} onChange={(e) => setForm({ ...form, container_id: e.target.value })}>
                  <option value="">— beim Erledigen wählen —</option>
                  {hof.map((c) => <option key={c.id} value={c.id}>{containerName(c)}</option>)}
                </select>
              </label>
            )}
            {schluessel.length > 0 && (
              <label style={s.feld}>Abfall (optional)
                <select style={s.input} value={form.abfall_schluessel_id} onChange={(e) => setForm({ ...form, abfall_schluessel_id: e.target.value })}>
                  <option value="">—</option>
                  {schluessel.filter((x) => x.aktiv).map((x) => <option key={x.id} value={x.id}>{schluesselLesbar(x.schluessel)} {x.bezeichnung}</option>)}
                </select>
              </label>
            )}
            <Feld label="Fahrer" w={form.fahrer} max={80} on={(x) => setForm({ ...form, fahrer: x })} />
            <Feld label="Notiz" w={form.notiz} max={500} span on={(x) => setForm({ ...form, notiz: x })} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>Auftrag planen</button>
            <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {ueberfaellig.length > 0 && (
        <div style={s.hinweis}>
          <b>Überfällig ({ueberfaellig.length}):</b>{' '}
          {ueberfaellig.slice(0, 8).map((a) => (
            <button key={a.id} style={{ ...s.mini, marginRight: 4 }} onClick={() => setTag(a.termin)}>{datumDe(a.termin)} {auftragArtName(a.art)} {a.kunde_name}</button>
          ))}
        </div>
      )}

      <div style={s.box}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <button style={s.mini} onClick={() => setTag(tagPlus(tag, -1))}>◀</button>
          <label style={s.feld}>Tag<input style={s.input} type="date" value={tag} onChange={(e) => e.target.value && setTag(e.target.value)} /></label>
          <button style={s.mini} onClick={() => setTag(tagPlus(tag, 1))}>▶</button>
          {tag !== heute && <button style={s.mini} onClick={() => setTag(heute)}>heute</button>}
          <button style={s.btnAus} onClick={() => void drucken()}>🖨 Tagesliste für die Fahrer</button>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {liste.map((a) => {
            const bb = braucht(a.art);
            const fertig = a.status !== 'geplant';
            return (
              <div key={a.id} style={{ ...s.innen, opacity: fertig ? 0.65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <b>{AUFTRAG_ARTEN.find((x) => x.key === a.art)?.zeichen} {auftragArtName(a.art)}</b>{a.zeitfenster ? <span style={s.klein}> · {a.zeitfenster}</span> : null}
                    {' · '}<b>{a.kunde_name}</b>
                    <div style={s.klein}>{a.stellplatz}{a.telefon ? ` · ☎ ${a.telefon}` : ''}{a.fahrer ? ` · Fahrer: ${a.fahrer}` : ''}</div>
                    <div style={s.klein}>
                      {bb.alt && <>ab: {a.container_alt_id ? cName(a.container_alt_id) : 'noch offen'} </>}
                      {bb.neu && <>hin: {a.container_id ? cName(a.container_id) : a.groesse_m3 ? `${groesseText(a.groesse_m3)} (beim Erledigen wählen)` : 'beim Erledigen wählen'}</>}
                    </div>
                    {a.notiz && <div style={s.klein}>{a.notiz}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'start', flexWrap: 'wrap' }}>
                    {fertig && <span style={{ ...s.pill, color: a.status === 'erledigt' ? C.ok : C.dim, borderColor: a.status === 'erledigt' ? C.ok : C.dim }}>{a.status === 'erledigt' ? 'erledigt' : 'storniert'}</span>}
                    {!fertig && bb.neu && !a.container_id && (
                      <select style={{ ...s.input, padding: '4px 6px', fontSize: 13 }} value={wahl[a.id] ?? ''} onChange={(e) => setWahl({ ...wahl, [a.id]: e.target.value })}>
                        <option value="">Container vom Hof …</option>{hof.map((c) => <option key={c.id} value={c.id}>{containerName(c)}</option>)}
                      </select>
                    )}
                    {!fertig && <button style={s.btnGold} disabled={busy} onClick={() => void erledigen(a)}>✓ erledigt</button>}
                    {a.status === 'erledigt' && bb.alt && <button style={s.mini} onClick={() => onWiegen(a)}>⚖️ wiegen</button>}
                    {!fertig && <button style={s.mini} disabled={busy} onClick={() => void stornieren(a)}>stornieren</button>}
                    {istChef && a.status !== 'erledigt' && <button style={s.mini} disabled={busy} onClick={() => void loeschen(a)}>löschen</button>}
                  </div>
                </div>
              </div>
            );
          })}
          {!liste.length && <p style={s.klein}>Für {datumDe(tag)} sind keine Aufträge geplant.</p>}
        </div>
      </div>
    </div>
  );
}
