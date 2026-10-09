'use client';

// ARGONAUT OS · Paket 295 · Formular Rad-Akte (neu und ändern)
// Prüfung: lib/zweirad.ts radPruefen (getestet); die Datenbank prüft noch einmal.

import { useState } from 'react';
import { RAD_ARTEN, HERKUNFT, MIT_MOTOR, radPruefen, type RadForm, type RadZeile, type ZrKontakt } from '@/lib/zweirad';
import { zahlFeld } from '@/lib/zahlen';
import { C, s } from './stil';

export type RadRoh = RadZeile & { id: string; status: string; owner_user_id: string; verkauft_am: string | null };

export function formAusRad(r: RadRoh | null): RadForm {
  const z = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const e = (c: number | null | undefined) => (c === null || c === undefined ? '' : zahlFeld(c / 100));
  return {
    herkunft: r?.herkunft ?? 'bestand', art: r?.art ?? 'pedelec', marke: r?.marke ?? '', modell: r?.modell ?? '', modelljahr: z(r?.modelljahr),
    farbe: r?.farbe ?? '', rahmengroesse: r?.rahmengroesse ?? '', rahmennummer: r?.rahmennummer ?? '', motorHersteller: r?.motor_hersteller ?? '',
    motorNr: r?.motor_nr ?? '', akkuNr: r?.akku_nr ?? '', akkuWh: z(r?.akku_wh), displayNr: r?.display_nr ?? '', schluesselNr: r?.schluessel_nr ?? '',
    versicherungskennzeichen: r?.versicherungskennzeichen ?? '', kontaktId: r?.kontakt_id ?? '', halterName: r?.halter_name ?? '',
    kaufdatum: r?.kaufdatum ?? '', garantieBis: r?.garantie_bis ?? '', intervallMonate: r ? String(r.inspektion_intervall_monate) : '12',
    letzteInspektion: r?.letzte_inspektion ?? '', ek: e(r?.ek_cent), vk: e(r?.vk_cent), notiz: r?.notiz ?? '',
  };
}

export default function RadFormular({ start, kontakte, gesperrt, busy, onSpeichern, onAbbrechen }: {
  start: RadForm; kontakte: ZrKontakt[]; gesperrt: boolean; busy: boolean;
  onSpeichern: (zeile: RadZeile, hinweise: string[]) => void; onAbbrechen: () => void;
}) {
  const [f, setF] = useState<RadForm>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const motor = MIT_MOTOR.includes(f.art);
  const set = <K extends keyof RadForm>(k: K, v: RadForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const feld = (k: keyof RadForm, label: string, extra: Record<string, unknown> = {}) => (
    <label style={s.feld}>{label}
      <input value={f[k]} style={s.eingabe} disabled={gesperrt && ['marke', 'modell', 'rahmennummer', 'motorNr', 'akkuNr'].includes(k)} onChange={(e) => set(k, e.target.value)} {...extra} />
    </label>
  );

  function speichern() {
    const p = radPruefen(f, new Date().getFullYear());
    if (!p.ok) { setFehler(p.grund); return; }
    setFehler(null);
    onSpeichern(p.zeile, p.hinweise);
  }

  return (
    <div style={s.box}>
      <b style={{ color: C.gold }}>{gesperrt ? 'Rad-Akte (als Dienstrad übergeben — Nummern sind fest)' : 'Rad-Akte'}</b>
      <div style={s.raster}>
        <label style={s.feld}>Herkunft *
          <select value={f.herkunft} style={s.eingabe} disabled={gesperrt} onChange={(e) => set('herkunft', e.target.value)}>
            {HERKUNFT.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </select>
        </label>
        <label style={s.feld}>Art *
          <select value={f.art} style={s.eingabe} onChange={(e) => set('art', e.target.value)}>
            {RAD_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
        {feld('marke', 'Marke *', { maxLength: 60 })}
        {feld('modell', 'Modell', { maxLength: 80 })}
        {feld('modelljahr', 'Modelljahr', { inputMode: 'numeric' })}
        {feld('farbe', 'Farbe', { maxLength: 40 })}
        {feld('rahmengroesse', 'Rahmengröße', { maxLength: 20, placeholder: 'z. B. M, 52 cm' })}
        {feld('rahmennummer', 'Rahmennummer', { maxLength: 40, placeholder: 'wie eingeschlagen' })}
        {motor && feld('motorHersteller', 'Motor-Hersteller', { maxLength: 40 })}
        {motor && feld('motorNr', 'Motornummer', { maxLength: 40 })}
        {motor && feld('akkuNr', 'Akkunummer', { maxLength: 40 })}
        {motor && feld('akkuWh', 'Akku (Wh)', { inputMode: 'numeric' })}
        {motor && feld('displayNr', 'Display-Nummer', { maxLength: 40 })}
        {feld('schluesselNr', 'Schlüsselnummer', { maxLength: 40 })}
        {f.art === 's_pedelec' && feld('versicherungskennzeichen', 'Versicherungskennzeichen', { maxLength: 20 })}
        <label style={s.feld}>Kunde / Halter aus Kontakten
          <select value={f.kontaktId} style={s.eingabe} onChange={(e) => {
            const k = kontakte.find((x) => x.id === e.target.value);
            setF((x) => ({ ...x, kontaktId: e.target.value, halterName: k ? k.name : x.halterName }));
          }}>
            <option value="">— keiner —</option>
            {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
        {feld('halterName', 'Name Kunde / Halter', { maxLength: 120 })}
        {feld('kaufdatum', f.herkunft === 'kunde' ? 'Kaufdatum' : 'Eingang / Kaufdatum', { type: 'date' })}
        {feld('garantieBis', 'Herstellergarantie bis', { type: 'date' })}
        {feld('intervallMonate', 'Inspektion alle … Monate (0 = keine)', { inputMode: 'numeric' })}
        {feld('letzteInspektion', 'Letzte Inspektion', { type: 'date' })}
        {f.herkunft === 'bestand' && feld('ek', 'Einkaufspreis netto (€)', { inputMode: 'decimal' })}
        {f.herkunft === 'bestand' && feld('vk', 'Verkaufspreis brutto (€)', { inputMode: 'decimal' })}
        {feld('notiz', 'Notiz', { maxLength: 1000 })}
      </div>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" style={s.btnGold} disabled={busy} onClick={speichern}>{busy ? 'Speichert …' : '💾 Speichern'}</button>
        <button type="button" style={s.btnAus} onClick={onAbbrechen}>Abbrechen</button>
      </div>
    </div>
  );
}
