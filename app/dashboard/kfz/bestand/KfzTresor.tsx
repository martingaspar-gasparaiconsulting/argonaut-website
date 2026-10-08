'use client';

// ============================================================
// ARGONAUT OS · Paket 277 · K13 Reiter „Brief und Schlüssel" in der Handelsakte
// 1) Tresor: Brief (ZB II), Schein, Schlüssel, CoC … mit Ort, Ausgabe an wen, bis wann.
//    Verlauf schreibt nur die Datenbank. Brief an den Käufer erst nach Zahlung.
// 2) Zulassungsauftrag mit Unterlagen-Haken (Richtwerte).
// 3) Aufbereitung als interner Auftrag im Werkstatt-Board; Kosten danach per Knopf
//    in die Kalkulation (nie doppelt). Keine Kundenrechnung für interne Aufträge.
// Schreiben mit Schreibrecht „kfz" (RLS Paket 277); Werkstattauftrag braucht das
// Werkstatt-Recht. Ohne SQL 277 Hinweis statt Absturz.
// ============================================================

import { useCallback, useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { betraege, geld } from '@/lib/kfzVerkauf';
import {
  TRESOR_ARTEN, TRESOR_STATUS, ZULASSUNG_ARTEN, ZULASSUNG_STATUS, artName, statusName, statusStufe, eintragPruefen, statusWechsel,
  ueberfaellig, briefLage, zulassungArt, zulassungFortschritt, unterlagenBereinigen, evbPruefen, zulassungStatusPruefen, kzNorm,
  aufbereitungAuftrag, kostenUebernahme, kostenBezeichnung, restOffenAus, type TresorEintrag,
} from '@/lib/kfzTresor';
import { auftragsSumme, type PositionBasis } from '../../_components/leistungLogik';
import { statusDef } from '../../_components/werkstattLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

type Fz = { id: string; owner_user_id: string; status: string; interne_nr: string | null; marke: string | null; modell: string | null; kennzeichen: string | null; fin: string | null; km_stand: number | null };
type Eintrag = TresorEintrag & { id: string; notiz: string | null };
type Log = { id: string; tresor_id: string; von_status: string | null; nach_status: string; an: string | null; geaendert_am: string };
type Zul = { id: string; art: string; status: string; halter: string | null; evb: string | null; wunschkennzeichen: string | null; kennzeichen_neu: string | null; termin: string | null; unterlagen: Record<string, boolean>; erledigt_am: string | null };
type Auftrag = { id: string; nummer: string | null; titel: string; status: string; zugesagt_am: string | null; angenommen_am: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function KfzTresor({ fz, onGeaendert }: { fz: Fz; onGeaendert: () => void }) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [zul, setZul] = useState<Zul[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [summen, setSummen] = useState<Record<string, number>>({});
  const [kostenBez, setKostenBez] = useState<(string | null)[]>([]);
  const [restOffen, setRestOffen] = useState<number | null>(null);
  const [fehltSql, setFehltSql] = useState(false);
  const [neu, setNeu] = useState({ art: 'zb2', anzahl: '1', ort: '', status: 'im_haus', bezeichnung: '' });
  const [wechsel, setWechsel] = useState<{ id: string; nach: string; an: string; bis: string } | null>(null);
  const [neueZul, setNeueZul] = useState({ art: 'zulassung', halter: '', evb: '', wunsch: '', termin: '' });
  const [aufb, setAufb] = useState({ wunsch: '', bis: '' });
  const [kostenEntwurf, setKostenEntwurf] = useState<Record<string, string>>({});
  const [kzNeu, setKzNeu] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    const [t, l, z, a, k, v] = await Promise.all([
      supabase.from('kfz_tresor').select('id, art, bezeichnung, anzahl, ort, status, ausgegeben_an, ausgegeben_am, zurueck_bis, notiz').eq('bestand_id', fz.id).order('erstellt_am'),
      supabase.from('kfz_tresor_log').select('id, tresor_id, von_status, nach_status, an, geaendert_am').eq('bestand_id', fz.id).order('geaendert_am', { ascending: false }).limit(30),
      supabase.from('kfz_zulassung').select('id, art, status, halter, evb, wunschkennzeichen, kennzeichen_neu, termin, unterlagen, erledigt_am').eq('bestand_id', fz.id).order('erstellt_am', { ascending: false }),
      supabase.from('werkstatt_auftraege').select('id, nummer, titel, status, zugesagt_am, angenommen_am').eq('kfz_bestand_id', fz.id).order('angenommen_am', { ascending: false }),
      supabase.from('kfz_bestand_kosten').select('bezeichnung').eq('bestand_id', fz.id),
      supabase.from('kfz_verkauf').select('status, preis_brutto, zusatz, inzahlung_ankauf_id, inzahlung_betrag, anzahlung, rechnung_id, erstellt_am').eq('bestand_id', fz.id).order('erstellt_am', { ascending: false }).limit(5),
    ]);
    setFehltSql(!!t.error);
    setEintraege(t.error ? [] : (((t.data as unknown) as Eintrag[]) ?? []));
    setLog(l.error ? [] : (((l.data as unknown) as Log[]) ?? []));
    setZul(z.error ? [] : (((z.data as unknown) as Zul[]) ?? []));
    const af = a.error ? [] : (((a.data as unknown) as Auftrag[]) ?? []);
    setAuftraege(af);
    setKostenBez((((k.data as unknown) as { bezeichnung: string | null }[]) ?? []).map((x) => x.bezeichnung));
    if (af.length) {
      const p = await supabase.from('werkstatt_positionen').select('*').in('auftrag_id', af.map((x) => x.id));
      const jeAuftrag: Record<string, PositionBasis[]> = {};
      for (const z2 of (((p.data as unknown) as (PositionBasis & { auftrag_id: string })[]) ?? [])) (jeAuftrag[z2.auftrag_id] ??= []).push(z2);
      setSummen(Object.fromEntries(af.map((x) => [x.id, auftragsSumme(jeAuftrag[x.id] ?? []).gesamtBetrag ?? 0])));
    } else setSummen({});
    // Brief-Sperre: offener Betrag aus dem jüngsten gültigen Verkauf
    const vk = ((((v.data as unknown) as Record<string, unknown>[]) ?? []).find((x) => x.status !== 'storniert')) ?? null;
    if (vk) {
      const rest = betraege(vk as unknown as Parameters<typeof betraege>[0]).rest;
      let rech: { zahlungsstatus: string | null } | null = null;
      if (typeof vk.rechnung_id === 'string') {
        const r = await supabase.from('rechnungen').select('zahlungsstatus').eq('id', vk.rechnung_id).maybeSingle();
        rech = (r.data as { zahlungsstatus: string | null } | null) ?? null;
      }
      setRestOffen(restOffenAus({ status: String(vk.status), rest }, rech));
    } else setRestOffen(null);
  }, [fz.id]);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const brief = briefLage(fz.status, eintraege);

  async function tun<T>(f: () => Promise<{ ok: boolean; text: string } | T>) {
    setBusy(true); setMeldung(null);
    try { const r = await f(); if (r && typeof r === 'object' && 'text' in (r as object)) setMeldung(r as { ok: boolean; text: string }); await lade(); }
    finally { setBusy(false); }
  }

  const eintragNeu = () => tun(async () => {
    const p = eintragPruefen({ art: neu.art, bezeichnung: neu.bezeichnung, anzahl: leseZahl(neu.anzahl), ort: neu.ort, status: neu.status });
    if (!p.ok) return { ok: false, text: p.fehler };
    const { data, error } = await supabase.from('kfz_tresor').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bestand_id: fz.id }).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: error ? 'Speichern fehlgeschlagen (Schreibrecht „KFZ"? SQL Paket 277?).' : NICHT_GESPEICHERT };
    setNeu({ ...neu, ort: '', bezeichnung: '' });
    return { ok: true, text: `${artName(p.felder.art, true)} erfasst.` };
  });

  const statusSetzen = () => tun(async () => {
    if (!wechsel) return { ok: false, text: '' };
    const e = eintraege.find((x) => x.id === wechsel.id);
    if (!e) return { ok: false, text: 'Eintrag nicht gefunden.' };
    const p = statusWechsel(e, wechsel.nach, { an: wechsel.an, bis: wechsel.bis || null, restOffen }, tag, new Date().toISOString());
    if (!p.ok) return { ok: false, text: p.fehler };
    const { data, error } = await supabase.from('kfz_tresor').update({ ...p.felder, aktualisiert_am: new Date().toISOString() }).eq('id', e.id).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: NICHT_GESPEICHERT };
    setWechsel(null);
    return { ok: true, text: `${artName(e.art, true)}: ${statusName(wechsel.nach)}.${p.hinweis ? ' ' + p.hinweis : ''}` };
  });

  const zulNeu = () => tun(async () => {
    const e = evbPruefen(neueZul.evb);
    if (!e.ok) return { ok: false, text: e.fehler };
    const { data, error } = await supabase.from('kfz_zulassung').insert({
      owner_user_id: fz.owner_user_id, bestand_id: fz.id, art: neueZul.art, halter: neueZul.halter.trim().slice(0, 160) || null, evb: e.evb,
      wunschkennzeichen: kzNorm(neueZul.wunsch), termin: neueZul.termin || null, unterlagen: unterlagenBereinigen(neueZul.art, e.evb ? { evb: true } : {}),
    }).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: error ? 'Speichern fehlgeschlagen (Schreibrecht „KFZ"? SQL Paket 277?).' : NICHT_GESPEICHERT };
    setNeueZul({ art: 'zulassung', halter: '', evb: '', wunsch: '', termin: '' });
    return { ok: true, text: 'Zulassungsauftrag angelegt.' };
  });

  const zulHaken = (z: Zul, key: string, wert: boolean) => tun(async () => {
    const u = { ...unterlagenBereinigen(z.art, z.unterlagen), [key]: wert };
    const { data, error } = await supabase.from('kfz_zulassung').update({ unterlagen: u, aktualisiert_am: new Date().toISOString() }).eq('id', z.id).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: NICHT_GESPEICHERT };
    return null;
  });

  const zulStatus = (z: Zul, nach: string, kz?: string) => tun(async () => {
    const p = zulassungStatusPruefen(z.status, nach, z.art, unterlagenBereinigen(z.art, z.unterlagen));
    if (!p.ok) return { ok: false, text: p.fehler };
    const felder: Record<string, unknown> = { status: nach, aktualisiert_am: new Date().toISOString() };
    if (nach === 'erledigt') { felder.erledigt_am = tag; if (kz) felder.kennzeichen_neu = kzNorm(kz); }
    const { data, error } = await supabase.from('kfz_zulassung').update(felder).eq('id', z.id).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: NICHT_GESPEICHERT };
    if (nach === 'erledigt' && kz && (z.art === 'zulassung' || z.art === 'ummeldung')) {
      await supabase.from('kfz_bestand').update({ kennzeichen: kzNorm(kz), aktualisiert_am: new Date().toISOString() }).eq('id', fz.id);
      onGeaendert();
    }
    return { ok: true, text: `Zulassungsauftrag: ${ZULASSUNG_STATUS.find((s) => s.key === nach)?.name}.` };
  });

  const aufbereitung = () => tun(async () => {
    const felder = aufbereitungAuftrag(fz, aufb.wunsch, aufb.bis || null);
    const { data, error } = await supabase.from('werkstatt_auftraege').insert({ ...felder, owner_user_id: fz.owner_user_id, aktualisiert_am: new Date().toISOString() }).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: 'Auftrag ließ sich nicht anlegen. Haben Sie das Recht „Werkstatt" und ist SQL Paket 277 ausgeführt?' };
    if (fz.status === 'bestand' || fz.status === 'zulauf') {
      await supabase.from('kfz_bestand').update({ status: 'aufbereitung', aktualisiert_am: new Date().toISOString() }).eq('id', fz.id);
      onGeaendert();
    }
    setAufb({ wunsch: '', bis: '' });
    return { ok: true, text: 'Aufbereitung im Werkstatt-Board angelegt; Fahrzeug steht auf „In Aufbereitung".' };
  });

  const kostenRein = (a: Auftrag) => tun(async () => {
    const roh = kostenEntwurf[a.id];
    const betrag = roh !== undefined ? leseZahl(roh) : (summen[a.id] ?? null);
    const p = kostenUebernahme(a, betrag, kostenBez);
    if (!p.ok) return { ok: false, text: p.fehler };
    const { data, error } = await supabase.from('kfz_bestand_kosten').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bestand_id: fz.id }).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: 'Übernehmen fehlgeschlagen (Schreibrecht „KFZ"?).' };
    return { ok: true, text: `${geld(p.felder.betrag_netto)} netto als Aufbereitungskosten in der Kalkulation.` };
  });

  const bestandFertig = () => tun(async () => {
    const { data, error } = await supabase.from('kfz_bestand').update({ status: 'bestand', aktualisiert_am: new Date().toISOString() }).eq('id', fz.id).select('id');
    if (error || nichtsGeschrieben(data)) return { ok: false, text: NICHT_GESPEICHERT };
    onGeaendert();
    return { ok: true, text: 'Fahrzeug steht wieder „Im Bestand".' };
  });

  const offeneZul = zul.filter((z) => z.status === 'offen' || z.status === 'beim_amt');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {fehltSql && <div style={{ ...k.karte, color: C.warn }}>Brief-Tresor ist noch nicht eingerichtet (SQL Paket 277 fehlt).</div>}
      {meldung && meldung.text && <div style={{ ...k.karte, borderColor: meldung.ok ? C.ok : C.bad }} role={meldung.ok ? 'status' : 'alert'}>{meldung.text}</div>}

      {/* 1) Tresor */}
      <div style={k.karte}>
        <h3 style={k.h3}>Brief und Schlüssel</h3>
        <div style={{ fontSize: 13.5, color: FARBE[brief.stufe] }}>{brief.text}</div>
        {restOffen !== null && restOffen > 0 && <div style={{ ...k.dim, color: C.warn, marginTop: 4 }}>Aus dem Verkauf sind noch {geld(restOffen)} offen — der Brief bleibt bis zur Zahlung im Haus.</div>}
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {eintraege.map((e) => (
            <div key={e.id} style={k.zeile}>
              <div>
                <b>{artName(e.art, true)}</b>{e.bezeichnung ? ` · ${e.bezeichnung}` : ''}{e.anzahl > 1 ? ` · ${e.anzahl} Stück` : ''}{e.ort ? <span style={k.dim}> · {e.ort}</span> : null}
                <div style={{ fontSize: 13, color: ueberfaellig(e, tag) ? C.bad : FARBE[statusStufe(e.status)] }}>
                  {statusName(e.status)}{e.status === 'ausgegeben' ? ` an ${e.ausgegeben_an} seit ${de(e.ausgegeben_am)}${e.zurueck_bis ? ` · zurück bis ${de(e.zurueck_bis)}` : ''}` : ''}{ueberfaellig(e, tag) ? ' — überfällig' : ''}
                  {e.status === 'beim_kaeufer' && e.ausgegeben_an ? ` (${e.ausgegeben_an}, ${de(e.ausgegeben_am)})` : ''}
                </div>
              </div>
              {e.status !== 'beim_kaeufer' && (wechsel?.id === e.id ? (
                <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                  <select style={k.inp} value={wechsel.nach} onChange={(x) => setWechsel({ ...wechsel, nach: x.target.value })}>
                    {TRESOR_STATUS.filter((s) => s.key !== e.status).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                  {(wechsel.nach === 'ausgegeben' || wechsel.nach === 'beim_kaeufer') && <input style={k.inp} placeholder={wechsel.nach === 'ausgegeben' ? 'An wen? (Pflicht)' : 'Name des Käufers'} value={wechsel.an} onChange={(x) => setWechsel({ ...wechsel, an: x.target.value })} />}
                  {wechsel.nach === 'ausgegeben' && <label style={k.lab}>Zurück bis (optional)<input type="date" style={k.inp} value={wechsel.bis} onChange={(x) => setWechsel({ ...wechsel, bis: x.target.value })} /></label>}
                  <div style={{ display: 'flex', gap: 6 }}><button style={k.gold} disabled={busy} onClick={() => void statusSetzen()}>Speichern</button><button style={k.aus} onClick={() => setWechsel(null)}>Abbrechen</button></div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {e.status !== 'im_haus' && <button style={k.aus} disabled={busy} onClick={() => setWechsel({ id: e.id, nach: 'im_haus', an: '', bis: '' })}>Zurück im Haus</button>}
                  {e.status === 'im_haus' && <button style={k.aus} onClick={() => setWechsel({ id: e.id, nach: 'ausgegeben', an: '', bis: '' })}>Ausgeben</button>}
                  <button style={k.aus} onClick={() => setWechsel({ id: e.id, nach: TRESOR_STATUS.find((s) => s.key !== e.status)?.key ?? 'im_haus', an: '', bis: '' })}>Status …</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 12 }}>
          <label style={k.lab}>Art<select style={k.inp} value={neu.art} onChange={(x) => setNeu({ ...neu, art: x.target.value })}>{TRESOR_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.kurz}</option>)}</select></label>
          <label style={k.lab}>Anzahl<input style={k.inp} inputMode="numeric" value={neu.anzahl} onChange={(x) => setNeu({ ...neu, anzahl: x.target.value })} /></label>
          <label style={k.lab}>Ort (z. B. Tresor Fach 3)<input style={k.inp} value={neu.ort} onChange={(x) => setNeu({ ...neu, ort: x.target.value })} /></label>
          <label style={k.lab}>Liegt<select style={k.inp} value={neu.status} onChange={(x) => setNeu({ ...neu, status: x.target.value })}>{TRESOR_STATUS.filter((s) => s.key !== 'ausgegeben' && s.key !== 'beim_kaeufer').map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
          {neu.art === 'sonstiges' && <label style={k.lab}>Bezeichnung<input style={k.inp} value={neu.bezeichnung} onChange={(x) => setNeu({ ...neu, bezeichnung: x.target.value })} /></label>}
        </div>
        <button style={{ ...k.gold, marginTop: 8 }} disabled={busy} onClick={() => void eintragNeu()}>＋ In den Tresor</button>
        {log.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ ...k.dim, cursor: 'pointer' }}>Verlauf ({log.length})</summary>
            <div style={{ display: 'grid', gap: 2, marginTop: 6 }}>
              {log.map((x) => {
                const e = eintraege.find((y) => y.id === x.tresor_id);
                return <div key={x.id} style={k.dim}>{new Date(x.geaendert_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {artName(e?.art, true)}: {x.von_status ? `${statusName(x.von_status)} → ` : 'erfasst: '}{statusName(x.nach_status)}{x.an ? ` (${x.an})` : ''}</div>;
              })}
            </div>
          </details>
        )}
      </div>

      {/* 2) Zulassung */}
      <div style={k.karte}>
        <h3 style={k.h3}>Zulassungsauftrag</h3>
        <div style={k.dim}>Unterlagen-Liste als Richtwert — Ihre Zulassungsstelle kann mehr verlangen.</div>
        {zul.map((z) => {
          const a = zulassungArt(z.art);
          const u = unterlagenBereinigen(z.art, z.unterlagen);
          const f = zulassungFortschritt(z.art, u);
          const zu = z.status === 'erledigt' || z.status === 'storniert';
          return (
            <div key={z.id} style={{ ...k.zeile, display: 'block', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b>{a?.name ?? z.art}{z.halter ? ` · ${z.halter}` : ''}</b>
                <span style={{ fontSize: 13, color: zu ? C.dim : f.vollstaendig ? C.ok : C.warn }}>{ZULASSUNG_STATUS.find((s) => s.key === z.status)?.name} · Unterlagen {f.erledigt}/{f.gesamt}</span>
              </div>
              <div style={k.dim}>{z.evb ? `eVB ${z.evb}` : 'eVB fehlt'}{z.wunschkennzeichen ? ` · Wunsch ${z.wunschkennzeichen}` : ''}{z.termin ? ` · Termin ${de(z.termin)}` : ''}{z.kennzeichen_neu ? ` · neues Kennzeichen ${z.kennzeichen_neu}` : ''}{z.erledigt_am ? ` · erledigt ${de(z.erledigt_am)}` : ''}</div>
              {!zu && (
                <>
                  <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                    {a?.unterlagen.map((x) => (
                      <label key={x.key} style={k.haken}><input type="checkbox" disabled={busy} checked={u[x.key] === true} onChange={(ev) => void zulHaken(z, x.key, ev.target.checked)} /> {x.name}{x.pflicht ? '' : ' (falls nötig)'}</label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {z.status === 'offen' && <button style={k.aus} disabled={busy} onClick={() => void zulStatus(z, 'beim_amt')}>Zur Zulassungsstelle</button>}
                    {(z.art === 'zulassung' || z.art === 'ummeldung') && <input style={{ ...k.inp, width: 130 }} aria-label="Neues Kennzeichen" placeholder="Neues Kennzeichen" value={kzNeu[z.id] ?? z.wunschkennzeichen ?? ''} onChange={(ev) => setKzNeu({ ...kzNeu, [z.id]: ev.target.value })} />}
                    <button style={k.gold} disabled={busy} onClick={() => void zulStatus(z, 'erledigt', (kzNeu[z.id] ?? z.wunschkennzeichen ?? '').trim() || undefined)}>✓ Erledigt</button>
                    <button style={k.aus} disabled={busy} onClick={() => void zulStatus(z, 'storniert')}>Stornieren</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {offeneZul.length === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
            <label style={k.lab}>Art<select style={k.inp} value={neueZul.art} onChange={(x) => setNeueZul({ ...neueZul, art: x.target.value })}>{ZULASSUNG_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
            <label style={k.lab}>Halter (Name)<input style={k.inp} value={neueZul.halter} onChange={(x) => setNeueZul({ ...neueZul, halter: x.target.value })} /></label>
            <label style={k.lab}>eVB-Nummer<input style={k.inp} value={neueZul.evb} maxLength={9} onChange={(x) => setNeueZul({ ...neueZul, evb: x.target.value })} /></label>
            <label style={k.lab}>Wunschkennzeichen<input style={k.inp} value={neueZul.wunsch} onChange={(x) => setNeueZul({ ...neueZul, wunsch: x.target.value })} /></label>
            <label style={k.lab}>Termin<input type="date" style={k.inp} value={neueZul.termin} onChange={(x) => setNeueZul({ ...neueZul, termin: x.target.value })} /></label>
          </div>
        )}
        {offeneZul.length === 0 && <button style={{ ...k.gold, marginTop: 8 }} disabled={busy} onClick={() => void zulNeu()}>＋ Zulassungsauftrag</button>}
      </div>

      {/* 3) Aufbereitung */}
      <div style={k.karte}>
        <h3 style={k.h3}>Aufbereitung (interner Werkstattauftrag)</h3>
        <div style={k.dim}>Der Auftrag erscheint im Werkstatt-Board als „{'Intern · Fahrzeughandel'}". Er bekommt keine Kundenrechnung — die Kosten übernehmen Sie hier in die Kalkulation.</div>
        {auftraege.map((a) => {
          const sd = statusDef(a.status);
          const fertig = a.status === 'fertig' || a.status === 'abgeholt';
          const schon = kostenBez.some((b) => String(b ?? '').includes(kostenBezeichnung(a)));
          return (
            <div key={a.id} style={{ ...k.zeile, marginTop: 8 }}>
              <div>
                <b>{a.nummer ? `${a.nummer} · ` : ''}{a.titel}</b>
                <div style={{ fontSize: 13, color: sd.farbe }}>{sd.label}{a.zugesagt_am ? ` · fertig bis ${de(a.zugesagt_am)}` : ''} · Positionen {geld(summen[a.id] ?? 0)} netto</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <a href="/dashboard/werkstatt" style={k.link}>Im Werkstatt-Board ↗</a>
                {fertig && !schon && (
                  <>
                    <input style={{ ...k.inp, width: 110 }} inputMode="decimal" aria-label="Betrag netto" value={kostenEntwurf[a.id] ?? String(summen[a.id] ?? '').replace('.', ',')} onChange={(x) => setKostenEntwurf({ ...kostenEntwurf, [a.id]: x.target.value })} />
                    <button style={k.gold} disabled={busy} onClick={() => void kostenRein(a)}>In Kalkulation</button>
                  </>
                )}
                {schon && <span style={{ ...k.dim, color: C.ok }}>✓ in der Kalkulation</span>}
              </div>
            </div>
          );
        })}
        {fz.status === 'aufbereitung' && auftraege.length > 0 && auftraege.every((a) => a.status === 'fertig' || a.status === 'abgeholt') && (
          <button style={{ ...k.gold, marginTop: 10 }} disabled={busy} onClick={() => void bestandFertig()}>Aufbereitung fertig → „Im Bestand"</button>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 12 }}>
          <label style={k.lab}>Was soll gemacht werden?<input style={k.inp} value={aufb.wunsch} placeholder="z. B. Innenraum, Politur, Smart-Repair Stoßfänger" onChange={(x) => setAufb({ ...aufb, wunsch: x.target.value })} /></label>
          <label style={k.lab}>Fertig bis<input type="date" style={k.inp} value={aufb.bis} onChange={(x) => setAufb({ ...aufb, bis: x.target.value })} /></label>
        </div>
        <button style={{ ...k.gold, marginTop: 8 }} disabled={busy} onClick={() => void aufbereitung()}>＋ Aufbereitung beauftragen</button>
      </div>
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0, color: C.text },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13 },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 8 },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13 },
};
