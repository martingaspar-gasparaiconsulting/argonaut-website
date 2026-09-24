'use client';

// ============================================================
// ARGONAUT OS · Kassen-Meldung ans Finanzamt (Paket PR · K03)
// Verzeichnis aller Kassen/Aufzeichnungssysteme mit TSE je Betriebsstätte,
// Fristen nach § 146a Abs. 4 AO, Ausfüllhilfe für „Mein ELSTER" und Vermerk,
// wann gemeldet wurde. ARGONAUT übermittelt NICHT selbst an ELSTER.
// Logik: lib/kassenMeldung.ts (getestet).
// Pfad: app/dashboard/kasse/meldung/page.tsx (Unterpfad, erbt die Freigabe der Kasse)
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  SYSTEM_ARTEN, TSE_ARTEN, AUSSER_GRUENDE, pruefeSystem, meldeStand, snapshotFuer, ausfuellhilfe, verzeichnisCsv, datumDe, meldepflichtig,
  type KassenSystem, type Meldung, type StaetteStand,
} from '@/lib/kassenMeldung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const AMPEL: Record<string, string> = { rot: C.danger, gelb: C.warn, gruen: C.green };

type Form = {
  id: string | null; betriebsstaette: string; art: string; hersteller: string; modell: string; software: string; seriennummer: string;
  anschaffung_am: string; gemietet: boolean; tse_art: string; tse_seriennummer: string; tse_bsi_id: string; tse_anschaffung_am: string; notiz: string;
};
const LEER: Form = { id: null, betriebsstaette: '', art: 'kasse_pc', hersteller: '', modell: '', software: '', seriennummer: '', anschaffung_am: '', gemietet: false, tse_art: '', tse_seriennummer: '', tse_bsi_id: '', tse_anschaffung_am: '', notiz: '' };

function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const t = (v: string) => v.trim() || null;

export default function KassenMeldungSeite() {
  const [istChef, setIstChef] = useState(false);
  const [firma, setFirma] = useState('');
  const [steuernummer, setSteuernummer] = useState('');
  const [systeme, setSysteme] = useState<(KassenSystem & { notiz?: string | null })[]>([]);
  const [meldungen, setMeldungen] = useState<(Meldung & { id: string })[]>([]);
  const [standorte, setStandorte] = useState<string[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [hilfe, setHilfe] = useState<{ g: StaetteStand; text: string } | null>(null);
  const [vermerk, setVermerk] = useState<{ g: StaetteStand; datum: string; ticket: string } | null>(null);
  const [ausser, setAusser] = useState<{ s: KassenSystem; datum: string; grund: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = heuteBerlin();

  const laden = useCallback(async () => {
    const [s, m] = await Promise.all([
      supabase.from('kassen_system').select('*').order('betriebsstaette', { ascending: true }),
      supabase.from('kassen_meldung').select('id, betriebsstaette, gemeldet_am, transferticket, snapshot').order('gemeldet_am', { ascending: false }),
    ]);
    setSqlFehlt(!!(s.error && /kassen_system/.test(s.error.message)));
    setSysteme((s.data as KassenSystem[]) ?? []);
    setMeldungen((m.data as (Meldung & { id: string })[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user ?? null;
      if (!u) { setFehler('Nicht angemeldet.'); return; }
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === u.id);
      // Steuernummer ist nicht in jedem Profil vorhanden — dann nur der Firmenname.
      try {
        const r = await supabase.from('profiles').select('firma_name, steuernummer').eq('id', chef || u.id).maybeSingle();
        if (r.error) {
          const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u.id).maybeSingle();
          setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
        } else {
          const pp = r.data as { firma_name?: string | null; steuernummer?: string | null } | null;
          setFirma(pp?.firma_name ?? ''); setSteuernummer(pp?.steuernummer ?? '');
        }
      } catch { /* egal */ }
      try {
        const { data: st } = await supabase.from('standorte').select('name, strasse, plz, ort').eq('aktiv', true);
        setStandorte(((st as Array<{ name: string; strasse: string | null; plz: string | null; ort: string | null }>) ?? [])
          .map((x) => [x.strasse, [x.plz, x.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || x.name));
      } catch { /* egal */ }
      await laden();
    })();
  }, [laden]);

  const stand = useMemo(() => meldeStand(systeme, meldungen, heute), [systeme, meldungen, heute]);
  const pruefung = form ? pruefeSystem({ ...form, anschaffung_am: form.anschaffung_am || null } as Partial<KassenSystem>, heute) : null;

  function meldung(o: string | null, f: string | null = null) { setOk(o); setFehler(f); }

  async function speichern() {
    if (!form || !pruefung) return;
    if (pruefung.fehler.length) { meldung(null, pruefung.fehler.join(' ')); return; }
    const zeile = {
      betriebsstaette: form.betriebsstaette.trim().slice(0, 200), art: form.art, hersteller: t(form.hersteller), modell: t(form.modell), software: t(form.software),
      seriennummer: t(form.seriennummer), anschaffung_am: form.anschaffung_am || null, gemietet: form.gemietet, tse_art: t(form.tse_art),
      tse_seriennummer: t(form.tse_seriennummer), tse_bsi_id: t(form.tse_bsi_id), tse_anschaffung_am: form.tse_anschaffung_am || null, notiz: t(form.notiz),
    };
    const { error } = form.id
      ? await supabase.from('kassen_system').update(zeile).eq('id', form.id)
      : await supabase.from('kassen_system').insert(zeile);
    if (error) { meldung(null, 'Speichern fehlgeschlagen (nur der Inhaber kann das Verzeichnis ändern).'); return; }
    setForm(null); meldung('Gespeichert.'); await laden();
  }

  async function ausserSpeichern() {
    if (!ausser) return;
    const p = pruefeSystem({ ...ausser.s, ausser_betrieb_am: ausser.datum, ausser_grund: ausser.grund }, heute);
    if (p.fehler.length) { meldung(null, p.fehler.join(' ')); return; }
    const { error } = await supabase.from('kassen_system').update({ ausser_betrieb_am: ausser.datum, ausser_grund: ausser.grund || null }).eq('id', ausser.s.id);
    if (error) { meldung(null, 'Speichern fehlgeschlagen.'); return; }
    setAusser(null); meldung('Außerbetriebnahme vermerkt — bitte innerhalb eines Monats melden.'); await laden();
  }

  async function vermerkSpeichern() {
    if (!vermerk) return;
    if (!vermerk.datum) { meldung(null, 'Bitte das Datum der Übermittlung angeben.'); return; }
    const { error } = await supabase.from('kassen_meldung').insert({
      betriebsstaette: vermerk.g.betriebsstaette, gemeldet_am: vermerk.datum, transferticket: t(vermerk.ticket), snapshot: snapshotFuer(vermerk.g),
    });
    if (error) { meldung(null, 'Vermerk fehlgeschlagen.'); return; }
    setVermerk(null); meldung('Als gemeldet vermerkt.'); await laden();
  }

  function csv() {
    const blob = new Blob([verzeichnisCsv(systeme)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Kassenverzeichnis-${heute}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function bearbeiten(x: KassenSystem & { notiz?: string | null }) {
    setForm({
      id: x.id, betriebsstaette: x.betriebsstaette, art: x.art, hersteller: x.hersteller ?? '', modell: x.modell ?? '', software: x.software ?? '',
      seriennummer: x.seriennummer ?? '', anschaffung_am: x.anschaffung_am ?? '', gemietet: !!x.gemietet, tse_art: x.tse_art ?? '',
      tse_seriennummer: x.tse_seriennummer ?? '', tse_bsi_id: x.tse_bsi_id ?? '', tse_anschaffung_am: x.tse_anschaffung_am ?? '', notiz: x.notiz ?? '',
    });
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/kasse" style={s.zurueck}>← Kasse</a>
      <h1 style={s.h1}>🏛 Kassen-Meldung ans Finanzamt</h1>
      <p style={s.sub}>Seit 2025 müssen Kassen mit TSE dem Finanzamt über „Mein ELSTER" mitgeteilt werden (§ 146a Abs. 4 AO) — je Betriebsstätte, immer mit allen Geräten. Hier führen Sie das Verzeichnis, sehen die Fristen und bekommen eine Ausfüllhilfe. Die Übermittlung selbst machen Sie oder Ihre Steuerberatung in Mein ELSTER.</p>
      <div style={s.box}>
        <b>Fristen:</b> neue Kasse (auch gemietet oder geleast) innerhalb eines Monats · Außerbetriebnahme (Verkauf, Defekt, Diebstahl, Verschrottung) innerhalb eines Monats · Geräte, die vor dem 01.07.2025 angeschafft wurden, waren bis 31.07.2025 zu melden. Taxameter und Wegstreckenzähler ohne TSE: derzeit keine Meldung.
        <div style={{ ...s.klein, marginTop: 6 }}>Die ARGONAUT-Kasse läuft ohne echte TSE (Demo). Sie gehört erst in dieses Verzeichnis, wenn eine zertifizierte TSE angeschlossen ist.</div>
      </div>
      {sqlFehlt && <div style={s.err}>Das Kassenverzeichnis ist noch nicht eingerichtet (SQL von Paket PR fehlt).</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.knoepfe}>
        {istChef && <button style={s.primaer} onClick={() => setForm({ ...LEER, betriebsstaette: stand[0]?.betriebsstaette ?? standorte[0] ?? '' })}>＋ Kasse / Gerät erfassen</button>}
        {systeme.length > 0 && <button style={s.mini} onClick={csv}>⬇ Verzeichnis als CSV</button>}
      </div>

      {stand.length === 0 && !sqlFehlt && <div style={s.dim}>Noch keine Geräte erfasst.</div>}
      {stand.map((g) => (
        <div key={g.schluessel} style={{ ...s.card, borderLeft: `3px solid ${AMPEL[g.ampel]}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 17 }}>📍 {g.betriebsstaette}</b>
            <span style={{ ...s.chip, color: AMPEL[g.ampel], borderColor: AMPEL[g.ampel] }}>{g.ampel === 'gruen' ? 'alles gemeldet' : g.ampel === 'rot' ? 'Frist überschritten' : 'Meldung offen'}</span>
            <span style={s.klein}>{g.letzteMeldung ? `zuletzt gemeldet am ${datumDe(g.letzteMeldung.gemeldet_am)}${g.letzteMeldung.transferticket ? ` (Ticket ${g.letzteMeldung.transferticket})` : ''}` : 'noch nie gemeldet'}</span>
            <span style={{ flex: 1 }} />
            <button style={s.mini} onClick={() => setHilfe({ g, text: ausfuellhilfe(g, { name: firma, steuernummer }) })}>📋 Ausfüllhilfe ELSTER</button>
            {istChef && <button style={s.mini} onClick={() => setVermerk({ g, datum: heute, ticket: '' })}>✓ Als gemeldet vermerken</button>}
          </div>
          {g.offen.length > 0 && (
            <ul style={s.liste}>
              {g.offen.map((o, i) => (
                <li key={i} style={{ color: o.ampel === 'rot' ? C.danger : C.warn }}>
                  {o.ereignis === 'anschaffung' ? 'Neu' : 'Außer Betrieb'}: {SYSTEM_ARTEN.find((a) => a.key === o.system.art)?.label} {o.system.seriennummer ? `(SN ${o.system.seriennummer})` : ''} seit {datumDe(o.datum)} — melden bis {datumDe(o.frist)}
                </li>
              ))}
            </ul>
          )}
          {g.systeme.map((x) => (
            <div key={x.id} style={{ ...s.zeile, opacity: x.ausser_betrieb_am ? 0.6 : 1 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700 }}>{SYSTEM_ARTEN.find((a) => a.key === x.art)?.label ?? x.art} {[x.hersteller, x.modell].filter(Boolean).join(' ')}</div>
                <div style={s.klein}>
                  SN {x.seriennummer || '—'} · seit {datumDe(x.anschaffung_am)}{x.gemietet ? ' (gemietet/geleast)' : ''} · TSE {x.tse_seriennummer || '—'}{x.tse_bsi_id ? ` · ${x.tse_bsi_id}` : ''}
                  {x.ausser_betrieb_am ? ` · außer Betrieb seit ${datumDe(x.ausser_betrieb_am)}${x.ausser_grund ? ` (${x.ausser_grund})` : ''}` : ''}
                  {!meldepflichtig(x) ? ' · keine Meldepflicht (ohne TSE)' : ''}
                </div>
              </div>
              {istChef && (
                <div style={s.knoepfe}>
                  <button style={s.mini} onClick={() => bearbeiten(x)}>Bearbeiten</button>
                  {!x.ausser_betrieb_am && <button style={s.mini} onClick={() => setAusser({ s: x, datum: heute, grund: '' })}>Außer Betrieb</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {form && pruefung && (
        <div style={s.hinter} onClick={() => setForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 17 }}>{form.id ? 'Gerät bearbeiten' : 'Kasse / Gerät erfassen'}</b>
            <label style={s.lab}>Betriebsstätte (Anschrift, an der das Gerät steht)
              <input style={s.inp} list="staetten" value={form.betriebsstaette} onChange={(e) => setForm({ ...form, betriebsstaette: e.target.value })} placeholder="Straße Nr., PLZ Ort" />
              <datalist id="staetten">{[...new Set([...stand.map((g) => g.betriebsstaette), ...standorte])].map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <div style={s.row}>
              <label style={s.lab}>Art<select style={s.inp} value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>{SYSTEM_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
              <label style={s.lab}>Hersteller<input style={s.inp} value={form.hersteller} onChange={(e) => setForm({ ...form, hersteller: e.target.value })} /></label>
              <label style={s.lab}>Modell<input style={s.inp} value={form.modell} onChange={(e) => setForm({ ...form, modell: e.target.value })} /></label>
              <label style={s.lab}>Software<input style={s.inp} value={form.software} onChange={(e) => setForm({ ...form, software: e.target.value })} /></label>
            </div>
            <div style={s.row}>
              <label style={s.lab}>Seriennummer des Geräts<input style={s.inp} value={form.seriennummer} onChange={(e) => setForm({ ...form, seriennummer: e.target.value })} /></label>
              <label style={s.lab}>Angeschafft / Mietbeginn<input type="date" style={s.inp} value={form.anschaffung_am} onChange={(e) => setForm({ ...form, anschaffung_am: e.target.value })} /></label>
              <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.gemietet} onChange={(e) => setForm({ ...form, gemietet: e.target.checked })} /> gemietet / geleast</label>
            </div>
            <div style={s.row}>
              <label style={s.lab}>Art der TSE<select style={s.inp} value={form.tse_art} onChange={(e) => setForm({ ...form, tse_art: e.target.value })}><option value="">— wählen —</option>{TSE_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
              <label style={s.lab}>Seriennummer der TSE<input style={s.inp} value={form.tse_seriennummer} onChange={(e) => setForm({ ...form, tse_seriennummer: e.target.value })} /></label>
              <label style={s.lab}>BSI-Zertifizierungs-ID<input style={s.inp} value={form.tse_bsi_id} onChange={(e) => setForm({ ...form, tse_bsi_id: e.target.value })} placeholder="BSI-K-TR-0000-2020" /></label>
              <label style={s.lab}>TSE seit<input type="date" style={s.inp} value={form.tse_anschaffung_am} onChange={(e) => setForm({ ...form, tse_anschaffung_am: e.target.value })} /></label>
            </div>
            <input style={s.inp} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="Notiz (optional)" />
            {pruefung.fehler.length > 0 && <ul style={{ ...s.liste, color: C.danger }}>{pruefung.fehler.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            {pruefung.hinweise.length > 0 && <ul style={{ ...s.liste, color: C.warn }}>{pruefung.hinweise.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            <div style={s.hint}>Seriennummern und BSI-ID stehen auf dem Gerät, im TSE-Zertifikat oder beim Kassenhändler. Nach einer Änderung an der Betriebsstätte muss erneut gemeldet werden — dann mit allen Geräten.</div>
            <div style={s.knoepfe}><button style={s.primaer} onClick={() => void speichern()}>Speichern</button><button style={s.mini} onClick={() => setForm(null)}>Abbrechen</button></div>
          </div>
        </div>
      )}

      {ausser && (
        <div style={s.hinter} onClick={() => setAusser(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <b>Außer Betrieb nehmen: {ausser.s.seriennummer || 'Gerät'}</b>
            <div style={s.row}>
              <label style={s.lab}>Datum<input type="date" style={s.inp} value={ausser.datum} onChange={(e) => setAusser({ ...ausser, datum: e.target.value })} /></label>
              <label style={s.lab}>Grund<select style={s.inp} value={ausser.grund} onChange={(e) => setAusser({ ...ausser, grund: e.target.value })}><option value="">— wählen —</option>{AUSSER_GRUENDE.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            </div>
            <div style={s.hint}>Das Gerät bleibt im Verzeichnis (Aufbewahrung). Die Außerbetriebnahme ist innerhalb eines Monats zu melden.</div>
            <div style={s.knoepfe}><button style={s.primaer} onClick={() => void ausserSpeichern()}>Speichern</button><button style={s.mini} onClick={() => setAusser(null)}>Abbrechen</button></div>
          </div>
        </div>
      )}

      {hilfe && (
        <div style={s.hinter} onClick={() => setHilfe(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <b>Ausfüllhilfe für Mein ELSTER</b>
            <div style={s.hint}>In Mein ELSTER das Formular zur Mitteilung nach § 146a Abs. 4 AO öffnen (in der Formularsuche „Kasse" eingeben). Die Werte hier abtippen oder kopieren. Nach dem Absenden das Transferticket notieren und oben „Als gemeldet vermerken".</div>
            <textarea readOnly style={{ ...s.inp, minHeight: 320, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={hilfe.text} />
            <div style={s.knoepfe}>
              <button style={s.mini} onClick={() => { try { void navigator.clipboard.writeText(hilfe.text); meldung('Kopiert.'); } catch { /* egal */ } }}>📋 Kopieren</button>
              <a style={s.mini} href="https://www.elster.de/eportal/login" target="_blank" rel="noopener noreferrer">Mein ELSTER öffnen ↗</a>
              <button style={s.mini} onClick={() => setHilfe(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {vermerk && (
        <div style={s.hinter} onClick={() => setVermerk(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <b>Meldung vermerken: {vermerk.g.betriebsstaette}</b>
            <div style={s.row}>
              <label style={s.lab}>Übermittelt am<input type="date" style={s.inp} value={vermerk.datum} onChange={(e) => setVermerk({ ...vermerk, datum: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Transferticket (aus ELSTER)<input style={s.inp} value={vermerk.ticket} onChange={(e) => setVermerk({ ...vermerk, ticket: e.target.value })} /></label>
            </div>
            <div style={s.hint}>Vermerkt wird der Stand ALLER Geräte dieser Betriebsstätte ({vermerk.g.systeme.filter(meldepflichtig).length}). Spätere Änderungen erscheinen danach wieder als offen.</div>
            <div style={s.knoepfe}><button style={s.primaer} onClick={() => void vermerkSpeichern()}>Vermerken</button><button style={s.mini} onClick={() => setVermerk(null)}>Abbrechen</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1060, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13.5, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  box: { background: 'rgba(0,229,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, lineHeight: 1.5, marginTop: 12 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  knoepfe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 8 },
  chip: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '1px 9px', fontSize: 11.5, fontWeight: 700 },
  klein: { color: C.textDim, fontSize: 13 },
  hint: { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 },
  liste: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 },
  hinter: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
