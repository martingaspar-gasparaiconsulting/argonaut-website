'use client';

// ARGONAUT OS · Paket 355 (13.10.2026) · Containerbestand — wo steht welcher Container?
// Umgesetzt werden Container über Aufträge (Stellen/Tauschen/Abholen); hier nur
// anlegen, „voll gemeldet", Reparatur und ausblenden.

import { useState } from 'react';
import {
  CONTAINER_ARTEN, CONTAINER_STATUS, containerArtName, containerStatusName, containerStatusStufe, containerPruefen, groesseText, standzeitTage, datumDe,
  type Container,
} from '@/lib/entsorgung';
import { C, s, STUFE_FARBE, Feld, schreiben, type Db, type Melde } from './entsorgungUi';

export default function ContainerBestand({ supabase, container, heute, istChef, melde, onGeaendert, onAuftrag }: {
  supabase: Db; container: Container[]; heute: string; istChef: boolean; melde: Melde;
  onGeaendert: () => Promise<void> | void; onAuftrag: (art: 'abholen' | 'tauschen', c: Container) => void;
}) {
  const [neu, setNeu] = useState({ nummer: '', art: 'absetz', groesse_m3: '' });
  const [filter, setFilter] = useState<string>('alle');
  const [busy, setBusy] = useState(false);

  async function anlegen() {
    const p = containerPruefen(neu, container.map((c) => c.nummer));
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_bestand').insert({ nummer: neu.nummer.trim(), art: neu.art, groesse_m3: p.groesse }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Container ${neu.nummer.trim()} angelegt — er steht auf dem Hof.`);
      setNeu({ ...neu, nummer: '' });
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function setze(c: Container, felder: Partial<Pick<Container, 'status' | 'aktiv'>>, ok: string) {
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_bestand').update(felder).eq('id', c.id).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, ok);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function entfernen(c: Container) {
    if (!window.confirm(`Container ${c.nummer} entfernen? Hatte er schon Aufträge oder Wiegescheine, bleibt er erhalten.`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('container_bestand').delete().eq('id', c.id).select('id'), 'Nicht entfernt — Entfernen darf nur die Geschäftsleitung.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Entfernt.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  const sichtbar = container.filter((c) => (filter === 'aus' ? !c.aktiv : c.aktiv && (filter === 'alle' || c.status === filter)))
    .slice().sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));

  return (
    <div style={s.box}>
      <b style={{ color: C.gold }}>Containerbestand</b>
      <p style={s.klein}>
        Neue Container stehen auf dem Hof. Zum Kunden und zurück kommen sie über einen Auftrag: Wird „Stellen", „Tauschen" oder „Abholen" erledigt,
        setzt ARGONAUT die Container um. Hier melden Sie einen Container voll oder schicken ihn in die Reparatur.
      </p>
      <div style={{ ...s.raster, alignItems: 'end' }}>
        <Feld label="Nummer (z. B. A-07)" w={neu.nummer} max={30} on={(x) => setNeu({ ...neu, nummer: x })} />
        <label style={s.feld}>Art
          <select style={s.input} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>
            {CONTAINER_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </label>
        <Feld label="Größe in m³" w={neu.groesse_m3} max={6} on={(x) => setNeu({ ...neu, groesse_m3: x })} />
        <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>+ Container anlegen</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 8px' }}>
        {[{ key: 'alle', name: 'Alle' }, ...CONTAINER_STATUS, { key: 'aus', name: 'Ausgeblendet' }].map((f) => (
          <button key={f.key} style={filter === f.key ? s.reiterAn : s.reiterAus} onClick={() => setFilter(f.key)}>{f.name}</button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Nummer</th><th style={s.th}>Art</th><th style={s.th}>Stand</th><th style={s.th}>Kunde / Stellplatz</th><th style={s.th}>Standzeit</th><th style={s.th}></th></tr></thead>
          <tbody>
            {sichtbar.map((c) => {
              const tage = standzeitTage(c.gestellt_seit, heute);
              const draussen = c.status === 'gestellt' || c.status === 'voll';
              return (
                <tr key={c.id} style={{ opacity: c.aktiv ? 1 : 0.5 }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{c.nummer}</td>
                  <td style={s.td}>{containerArtName(c.art)}{c.groesse_m3 ? <div style={s.klein}>{groesseText(c.groesse_m3)}</div> : null}</td>
                  <td style={s.td}><span style={{ ...s.pill, color: STUFE_FARBE[containerStatusStufe(c.status)], borderColor: STUFE_FARBE[containerStatusStufe(c.status)] }}>{containerStatusName(c.status)}</span></td>
                  <td style={s.td}>{draussen ? (<><b>{c.kunde_name ?? '—'}</b><div style={s.klein}>{c.stellplatz ?? ''}</div></>) : <span style={s.klein}>—</span>}</td>
                  <td style={s.td}>{draussen && tage != null ? <>{tage} {tage === 1 ? 'Tag' : 'Tage'}<div style={s.klein}>seit {datumDe(c.gestellt_seit)}</div></> : <span style={s.klein}>—</span>}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    {c.aktiv && c.status === 'gestellt' && <button style={s.mini} disabled={busy} onClick={() => void setze(c, { status: 'voll' }, `Container ${c.nummer} voll gemeldet.`)}>voll gemeldet</button>}{' '}
                    {c.aktiv && draussen && <button style={s.mini} disabled={busy} onClick={() => onAuftrag('tauschen', c)}>🔁 Tausch planen</button>}{' '}
                    {c.aktiv && draussen && <button style={s.mini} disabled={busy} onClick={() => onAuftrag('abholen', c)}>⬆️ Abholung planen</button>}
                    {c.aktiv && c.status === 'lager' && <button style={s.mini} disabled={busy} onClick={() => void setze(c, { status: 'defekt' }, `Container ${c.nummer} in Reparatur.`)}>in Reparatur</button>}
                    {c.aktiv && c.status === 'defekt' && <button style={s.mini} disabled={busy} onClick={() => void setze(c, { status: 'lager' }, `Container ${c.nummer} wieder auf dem Hof.`)}>repariert</button>}{' '}
                    {!draussen && <button style={s.mini} disabled={busy} onClick={() => void setze(c, { aktiv: !c.aktiv }, c.aktiv ? 'Ausgeblendet.' : 'Wieder eingeblendet.')}>{c.aktiv ? 'ausblenden' : 'einblenden'}</button>}{' '}
                    {istChef && !draussen && <button style={s.mini} disabled={busy} onClick={() => void entfernen(c)}>entfernen</button>}
                  </td>
                </tr>
              );
            })}
            {!sichtbar.length && <tr><td style={s.td} colSpan={6}><span style={s.klein}>Keine Container in dieser Auswahl.</span></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
