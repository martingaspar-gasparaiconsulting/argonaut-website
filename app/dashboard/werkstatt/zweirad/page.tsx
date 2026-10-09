'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/werkstatt/zweirad — Z1 Zweirad und E-Bike (Paket 295)
//
// Rad-Akten für Fahrradhandel und -werkstatt: Bestand (Verkauf) und Kunden-
// räder mit Rahmen-, Motor-, Akku- und Schlüsselnummer. Suche auch nach
// Rahmen- und Akkunummer (Diebstahl, Rückruf). Fällige Inspektionen und
// ablaufende Herstellergarantien, offene Garantiefälle. Reparatur-Annahme und
// Inspektion laufen über die Rad-Akte ins Werkstatt-Board. Dienstrad-Leasing:
// eigene Seite. Unterpfad von /dashboard/werkstatt — erbt dessen Freigabe.
// Logik: lib/zweirad.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { berlinTag } from '@/lib/fahrzeugMiete';
import {
  RAD_ARTEN, RAD_STATUS, GARANTIE_STATUS, BAUTEILE, inspektionFaellig, garantieAmpel, radName, radPasst, kontaktLesen, datumDe,
  type RadZeile, type ZrKontakt,
} from '@/lib/zweirad';
import { euro } from '@/lib/geld';
import Leerzustand from '../../_components/Leerzustand';
import RadFormular, { formAusRad, type RadRoh } from './_teile/RadFormular';
import { C, s, AMPEL_FARBE } from './_teile/stil';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
type Garantie = { id: string; zweirad_id: string; bauteil: string; fehler: string; status: string; gemeldet_am: string; hersteller_nr: string | null };
const ART_NAME: Record<string, string> = Object.fromEntries(RAD_ARTEN.map((a) => [a.key, a.label]));
const BAUTEIL_NAME: Record<string, string> = Object.fromEntries(BAUTEILE.map((b) => [b.key, b.label]));

export default function ZweiradPage() {
  const [tab, setTab] = useState<'bestand' | 'kunde' | 'faellig' | 'garantie'>('bestand');
  const [raeder, setRaeder] = useState<RadRoh[]>([]);
  const [garantien, setGarantien] = useState<Garantie[]>([]);
  const [kontakte, setKontakte] = useState<ZrKontakt[]>([]);
  const [suche, setSuche] = useState('');
  const [mitArchiv, setMitArchiv] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [neuAuf, setNeuAuf] = useState(false);

  const lade = useCallback(async () => {
    const [r, g, k] = await Promise.all([
      supabase.from('zweirad').select('*').order('aktualisiert_am', { ascending: false }).limit(5000),
      supabase.from('zweirad_garantie').select('id, zweirad_id, bauteil, fehler, status, gemeldet_am, hersteller_nr').neq('status', 'erledigt').order('gemeldet_am').limit(1000),
      supabase.from('kontakte').select('*').limit(1000),
    ]);
    if (r.error) setFehler('Zweirad und E-Bike sind noch nicht eingerichtet (SQL zu Paket 295 fehlt) oder Ihnen fehlt das Recht „Werkstatt".');
    setRaeder((r.data as RadRoh[] | null) ?? []);
    setGarantien((g.data as Garantie[] | null) ?? []);
    setKontakte(((k.data as Record<string, unknown>[] | null) ?? []).map(kontaktLesen).sort((a, b) => a.name.localeCompare(b.name, 'de')));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const h = berlinTag(Date.now());
  const zahlen = useMemo(() => {
    const aktiv = raeder.filter((r) => r.status !== 'archiv');
    return {
      bestand: aktiv.filter((r) => r.status === 'bestand' || r.status === 'reserviert').length,
      wert: aktiv.filter((r) => r.status === 'bestand' || r.status === 'reserviert').reduce((x, r) => x + (r.vk_cent ?? 0), 0),
      kunden: aktiv.filter((r) => r.herkunft === 'kunde').length,
      faellig: aktiv.filter((r) => ['ueber', 'bald'].includes(inspektionFaellig(r, h).ampel)).length,
      garantie: garantien.length,
    };
  }, [raeder, garantien, h]);

  const liste = useMemo(() => {
    const basis = raeder.filter((r) => (mitArchiv || r.status !== 'archiv') && radPasst(r, suche));
    if (tab === 'bestand') return basis.filter((r) => r.herkunft === 'bestand');
    if (tab === 'kunde') return basis.filter((r) => r.herkunft === 'kunde');
    if (tab === 'faellig') {
      return basis
        .filter((r) => r.status !== 'archiv' && (['ueber', 'bald'].includes(inspektionFaellig(r, h).ampel) || garantieAmpel(r.garantie_bis, h).ampel === 'bald'))
        .sort((a, b) => (inspektionFaellig(a, h).am ?? '9999').localeCompare(inspektionFaellig(b, h).am ?? '9999'));
    }
    return basis;
  }, [raeder, tab, suche, mitArchiv, h]);
  const radVon = useCallback((id: string) => raeder.find((r) => r.id === id) ?? null, [raeder]);

  async function anlegen(zeile: RadZeile, hinweise: string[]) {
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('zweirad').insert({ ...zeile, status: zeile.herkunft === 'kunde' ? 'kunde' : 'bestand' }).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) {
      const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
      setFehler(/23505|duplicate/i.test(m) ? 'Diese Rahmennummer ist schon erfasst — suchen Sie oben danach.' : /row-level|permission/i.test(m) ? 'Anlegen braucht das Schreibrecht „Werkstatt".' : 'Das Rad wurde nicht gespeichert.');
      return;
    }
    setNeuAuf(false);
    setOk(['Rad aufgenommen.', ...hinweise].join(' '));
    window.location.href = `/dashboard/werkstatt/zweirad/${data[0].id}`;
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/werkstatt" style={s.zurueck}>← Werkstatt</a>
      <h1 style={s.h1}>🚲 Zweirad &amp; E-Bike</h1>
      <p style={s.dim}>
        So geht&apos;s: Jedes Rad bekommt eine Akte mit Rahmen-, Motor-, Akku- und Schlüsselnummer — Ihre Verkaufsräder ebenso wie die Räder Ihrer Kunden.
        In der Akte nehmen Sie Reparaturen und Inspektionen an (sie landen im Werkstatt-Board und werden dort abgerechnet) und führen Garantiefälle.
        Die Suche findet ein Rad auch über Rahmen- oder Akkunummer.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.bestand}</b><span style={s.dim}>Räder im Bestand</span></div>
            <div style={s.kachel}><b style={s.zahl}>{euro(zahlen.wert / 100)}</b><span style={s.dim}>Bestand zu Verkaufspreisen</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.kunden}</b><span style={s.dim}>Kundenräder</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.faellig ? C.warn : C.border }}><b style={{ ...s.zahl, color: zahlen.faellig ? C.warn : C.text }}>{zahlen.faellig}</b><span style={s.dim}>Inspektion fällig (30 Tage)</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.garantie}</b><span style={s.dim}>offene Garantiefälle</span></div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px', alignItems: 'center' }}>
            {([['bestand', '🏪 Bestand'], ['kunde', '👤 Kundenräder'], ['faellig', '⏰ Fällig'], ['garantie', '🛡 Garantiefälle']] as [typeof tab, string][]).map(([k, l]) => (
              <button key={k} type="button" style={tab === k ? s.tabAn : s.tab} onClick={() => setTab(k)}>{l}</button>
            ))}
            <a href="/dashboard/werkstatt/zweirad/dienstrad" style={{ ...s.tab, textDecoration: 'none' }}>💼 Dienstrad-Leasing</a>
            {!neuAuf && <button type="button" style={{ ...s.btnGold, marginLeft: 'auto' }} onClick={() => { setNeuAuf(true); setOk(null); }}>＋ Rad aufnehmen</button>}
          </div>

          {neuAuf && (
            <RadFormular start={{ ...formAusRad(null), herkunft: tab === 'kunde' ? 'kunde' : 'bestand' }} kontakte={kontakte} gesperrt={false} busy={busy}
              onSpeichern={(z, hw) => void anlegen(z, hw)} onAbbrechen={() => setNeuAuf(false)} />
          )}

          {tab !== 'garantie' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={suche} placeholder="Suche: Marke, Modell, Rahmen- oder Akkunummer, Kunde …" style={{ ...s.eingabe, flex: '1 1 280px' }} onChange={(e) => setSuche(e.target.value)} />
              <label style={{ ...s.dim, margin: 0 }}><input type="checkbox" checked={mitArchiv} onChange={(e) => setMitArchiv(e.target.checked)} /> mit Archiv</label>
            </div>
          )}

          {raeder.length === 0 && !neuAuf && (
            <Leerzustand icon="🚲" titel="Noch keine Räder" text="Nehmen Sie das erste Rad auf — mit Rahmennummer finden Sie es später auch im Diebstahlfall oder bei einem Rückruf wieder." aktionText="＋ Rad aufnehmen" onAktion={() => setNeuAuf(true)} />
          )}

          {tab !== 'garantie' && raeder.length > 0 && (
            liste.length === 0 ? <p style={s.dim}>{tab === 'faellig' ? 'Keine Inspektion in den nächsten 30 Tagen fällig und keine Garantie läuft bald ab.' : 'Keine Räder gefunden.'}</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}>
                  <thead><tr><th style={s.th}>Rad</th><th style={s.th}>Rahmen · Akku</th><th style={s.th}>{tab === 'bestand' ? 'Preis' : 'Kunde'}</th><th style={s.th}>Status</th><th style={s.th}>Inspektion</th><th style={s.th}>Garantie</th><th style={s.th}></th></tr></thead>
                  <tbody>
                    {liste.map((r) => {
                      const i = inspektionFaellig(r, h);
                      const g = garantieAmpel(r.garantie_bis, h);
                      return (
                        <tr key={r.id}>
                          <td style={s.td}><b>{radName(r)}</b><div style={{ color: C.dim, fontSize: 12 }}>{ART_NAME[r.art] ?? r.art}{r.modelljahr ? ` · ${r.modelljahr}` : ''}{r.farbe ? ` · ${r.farbe}` : ''}</div></td>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12.5 }}>{r.rahmennummer ?? <span style={{ color: C.warn }}>keine Rahmennr.</span>}{r.akku_nr ? <div style={{ color: C.dim }}>Akku {r.akku_nr}</div> : null}</td>
                          <td style={s.td}>{tab === 'bestand' ? (r.vk_cent !== null ? euro(r.vk_cent / 100) : '—') : (r.halter_name ?? '—')}</td>
                          <td style={s.td}><span style={s.marke}>{RAD_STATUS[r.status] ?? r.status}</span></td>
                          <td style={{ ...s.td, color: AMPEL_FARBE[i.ampel], fontWeight: i.ampel === 'ok' || i.ampel === 'keine' ? 400 : 700 }}>{i.am ? datumDe(i.am) : '—'}</td>
                          <td style={{ ...s.td, color: AMPEL_FARBE[g.ampel] }}>{r.garantie_bis ? datumDe(r.garantie_bis) : '—'}</td>
                          <td style={s.td}><a href={`/dashboard/werkstatt/zweirad/${r.id}`} style={s.link}>öffnen</a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'garantie' && (
            garantien.length === 0 ? <p style={s.dim}>Keine offenen Garantiefälle. Einen neuen Fall legen Sie in der Rad-Akte an.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}>
                  <thead><tr><th style={s.th}>Gemeldet</th><th style={s.th}>Rad</th><th style={s.th}>Bauteil · Fehler</th><th style={s.th}>Hersteller-Nr.</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                  <tbody>
                    {garantien.map((g) => {
                      const r = radVon(g.zweirad_id);
                      return (
                        <tr key={g.id}>
                          <td style={s.td}>{datumDe(g.gemeldet_am)}</td>
                          <td style={s.td}>{r ? radName(r, true) : '—'}</td>
                          <td style={s.td}><b>{BAUTEIL_NAME[g.bauteil] ?? g.bauteil}</b><div style={{ color: C.dim, fontSize: 12.5 }}>{g.fehler}</div></td>
                          <td style={s.td}>{g.hersteller_nr ?? '—'}</td>
                          <td style={s.td}><span style={s.marke}>{GARANTIE_STATUS[g.status] ?? g.status}</span></td>
                          <td style={s.td}><a href={`/dashboard/werkstatt/zweirad/${g.zweirad_id}#garantie`} style={s.link}>zur Akte</a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
