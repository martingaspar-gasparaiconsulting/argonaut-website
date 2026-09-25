'use client';

// ============================================================
// ARGONAUT OS · Paket PS3 · Retouren & Widerruf (Shop)
//   Widerruf, Reklamation oder Kulanz zu einer Shop-Bestellung erfassen,
//   Widerrufsfrist prüfen (§§ 355, 356 BGB), Erstattungsbetrag rechnen
//   (§§ 357, 357a BGB), Erstattungsfrist 14 Tage mit Zurückbehaltungsrecht,
//   Ware wieder ins Lager buchen, Kundentexte zum Kopieren.
// Keine Gutschrift/Rechnungskorrektur automatisch — die erstellen Sie in
// „Rechnungen" (Geld-Formulare bleiben unberührt).
// Logik: lib/kundenVorgaenge.ts (getestet). SQL: supabase-sql/ps3-kunden-vorgaenge.sql.
// Unterpfad von /dashboard/shop (erbt dessen Freigabe).
// Pfad: app/dashboard/shop/retouren/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { planeLagerabzug } from '@/lib/lagerAbzug';
import {
  RETOUREN_ARTEN, RETOUREN_STATUS, ZUSTAENDE, RETOUREN_GRUENDE,
  pruefeWiderruf, erstattungsBetrag, erstattungsStand, gewaehrleistung, retourenZahlen, retourenText, naechsteNummer,
  offenePlatzhalter, heuteBerlin, datumDe,
  type RetourenArt, type RetourenStatus, type Zustand, type RetourePosition,
} from '@/lib/kundenVorgaenge';
import { leseZahl } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };
const raster: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };
const FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, gruen: C.green, erledigt: C.textDim, offen: C.cyan };

type Bestellung = { id: string; extern_id: string | null; besteller: string | null; email: string | null; positionen: RetourePosition[] | null; brutto_summe: number | null; bestell_am: string | null; erstellt_am: string };
type Retoure = {
  id: string; nummer: string; bestellung_id: string | null; art: RetourenArt; status: RetourenStatus;
  kunde_name: string | null; email: string | null; bestellnummer: string | null; positionen: RetourePosition[]; vollstaendig: boolean;
  erhalten_am: string | null; widerruf_am: string | null; belehrung_ok: boolean; abholung_angeboten: boolean;
  ware_zurueck_am: string | null; rueckversand_nachweis: boolean; zustand: Zustand | null;
  hinversand: number | null; mehrkosten_lieferart: number | null; wertersatz: number | null; wertersatz_grund: string | null;
  erstattung_betrag: number | null; erstattet_am: string | null; erstattungsweg: string | null;
  lager_gebucht: boolean; grund: string | null; notiz: string | null; erstellt_am: string;
};

function zahlAus(s: string): number | null { return leseZahl(s); }
function euro(n: number | null | undefined): string { return n == null ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

const LEER = { bestellung_id: '', art: 'widerruf' as RetourenArt, kunde_name: '', email: '', bestellnummer: '', erhalten_am: '', widerruf_am: heuteBerlin(), belehrung_ok: true, hinversand: '', grund: RETOUREN_GRUENDE[0] };

export default function RetourenSeite() {
  const heute = heuteBerlin();
  const [liste, setListe] = useState<Retoure[]>([]);
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [neu, setNeu] = useState(LEER);
  const [auswahl, setAuswahl] = useState<Record<number, string>>({});
  const [offenId, setOffenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [firma, setFirma] = useState('');
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('shop_retoure').select('*').order('erstellt_am', { ascending: false });
    if (r.error) { if (/shop_retoure/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setListe(((r.data as Retoure[]) ?? []).map((x) => ({ ...x, positionen: x.positionen ?? [] })));
    const b = await supabase.from('shop_bestellungen').select('id, extern_id, besteller, email, positionen, brutto_summe, bestell_am, erstellt_am').order('erstellt_am', { ascending: false }).limit(500);
    setBestellungen((b.data as Bestellung[]) ?? []);
  }, []);

  useEffect(() => {
    laden();
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        let chef: string | null = null;
        try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
    })();
  }, [laden]);

  const zahlen = useMemo(() => retourenZahlen(liste, heute, bestellungen.length), [liste, heute, bestellungen.length]);
  const gewaehlt = bestellungen.find((b) => b.id === neu.bestellung_id) ?? null;
  const sichtbar = liste.filter((r) => filter === 'alle' || erstattungsStand(r, heute).stufe !== 'erledigt');

  function bestellungWaehlen(id: string) {
    const b = bestellungen.find((x) => x.id === id);
    setNeu((n) => ({ ...n, bestellung_id: id, kunde_name: b?.besteller ?? n.kunde_name, email: b?.email ?? n.email, bestellnummer: b?.extern_id ?? n.bestellnummer }));
    const vor: Record<number, string> = {};
    (b?.positionen ?? []).forEach((p, i) => { vor[i] = String(p.menge ?? 1); });
    setAuswahl(vor);
  }

  async function anlegen() {
    setFehler(null); setOk(null);
    const pos: RetourePosition[] = [];
    let vollstaendig = false;
    if (gewaehlt) {
      const alle = gewaehlt.positionen ?? [];
      alle.forEach((p, i) => {
        const m = zahlAus(auswahl[i] ?? '');
        if (m && m > 0) pos.push({ bezeichnung: p.bezeichnung, menge: Math.min(m, Number(p.menge) || m), einzelpreis: Number(p.einzelpreis) || 0, artikelnummer: p.artikelnummer ?? null });
      });
      vollstaendig = alle.length > 0 && alle.every((p, i) => (zahlAus(auswahl[i] ?? '') ?? 0) >= (Number(p.menge) || 0));
    }
    if (!gewaehlt && !neu.kunde_name.trim()) { setFehler('Bitte eine Bestellung wählen oder den Kundennamen eintragen.'); return; }
    if (gewaehlt && pos.length === 0) { setFehler('Bitte mindestens eine Position mit Menge angeben.'); return; }
    setBusy(true);
    try {
      const nummer = naechsteNummer(liste.map((r) => r.nummer), 'RT', Number(heute.slice(0, 4)));
      const { error } = await supabase.from('shop_retoure').insert({
        nummer, bestellung_id: gewaehlt?.id ?? null, art: neu.art, status: 'gemeldet',
        kunde_name: neu.kunde_name.trim() || null, email: neu.email.trim() || null, bestellnummer: neu.bestellnummer.trim() || null,
        positionen: pos, vollstaendig, erhalten_am: neu.erhalten_am || null, widerruf_am: neu.widerruf_am || null,
        belehrung_ok: neu.belehrung_ok, hinversand: zahlAus(neu.hinversand), grund: neu.grund,
      });
      if (error) throw error;
      setNeu(LEER); setAuswahl({});
      setOk(`Retoure ${nummer} angelegt.`);
      await laden();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  const wf = neu.art === 'widerruf' ? pruefeWiderruf({ erhalten_am: neu.erhalten_am || null, widerruf_am: neu.widerruf_am || null, belehrung_ok: neu.belehrung_ok }) : null;

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Shop</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>↩️ Retouren &amp; Widerruf</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Jede Rücksendung mit Frist, richtigem Erstattungsbetrag und Lagerbuchung — ohne im Gesetz nachschlagen zu müssen. <a href="/dashboard/shop" style={{ color: C.cyan }}>← Zum Shop</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Retouren-Tabelle ist noch nicht eingerichtet (SQL von Paket PS3 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={{ ...raster, marginBottom: 14 }}>
            {[['Offen', String(zahlen.offen), C.cyan], ['Erstattung überfällig', String(zahlen.ueberfaellig), zahlen.ueberfaellig ? C.danger : C.green], ['Erstattet', euro(zahlen.summeErstattet), C.gold], ['Retourenquote', zahlen.quote == null ? '—' : `${zahlen.quote.toLocaleString('de-DE')} %`, C.text]].map(([t, w, f]) => (
              <div key={t} style={{ ...karte, marginBottom: 0 }}><div style={{ color: C.textDim, fontSize: 13 }}>{t}</div><div style={{ fontSize: 24, fontWeight: 800, color: f }}>{w}</div></div>
            ))}
          </div>

          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Neue Retoure erfassen</h2>
            <div style={raster}>
              <div>
                <label style={lab}>Bestellung</label>
                <select style={feld} value={neu.bestellung_id} onChange={(e) => bestellungWaehlen(e.target.value)}>
                  <option value="">— ohne Bestellung / manuell —</option>
                  {bestellungen.map((b) => <option key={b.id} value={b.id}>{b.extern_id || 'ohne Nr.'} · {b.besteller || 'unbekannt'} · {euro(b.brutto_summe)}</option>)}
                </select>
              </div>
              <div>
                <label style={lab}>Art</label>
                <select style={feld} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value as RetourenArt })}>
                  {RETOUREN_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </div>
              <div><label style={lab}>Kunde</label><input style={feld} value={neu.kunde_name} onChange={(e) => setNeu({ ...neu, kunde_name: e.target.value })} /></div>
              <div><label style={lab}>E-Mail</label><input style={feld} value={neu.email} onChange={(e) => setNeu({ ...neu, email: e.target.value })} /></div>
              <div><label style={lab}>Ware beim Kunden erhalten am</label><input type="date" style={feld} value={neu.erhalten_am} onChange={(e) => setNeu({ ...neu, erhalten_am: e.target.value })} /></div>
              <div><label style={lab}>{neu.art === 'widerruf' ? 'Widerruf erklärt am' : 'Gemeldet am'}</label><input type="date" style={feld} value={neu.widerruf_am} onChange={(e) => setNeu({ ...neu, widerruf_am: e.target.value })} /></div>
              <div><label style={lab}>Hinsendekosten (die der Kunde bezahlt hat)</label><input style={feld} placeholder="z. B. 4,90" value={neu.hinversand} onChange={(e) => setNeu({ ...neu, hinversand: e.target.value })} /></div>
              <div>
                <label style={lab}>Grund</label>
                <select style={feld} value={neu.grund} onChange={(e) => setNeu({ ...neu, grund: e.target.value })}>{RETOUREN_GRUENDE.map((g) => <option key={g}>{g}</option>)}</select>
              </div>
            </div>
            {neu.art === 'widerruf' && (
              <label style={{ ...lab, fontWeight: 400, color: C.text }}>
                <input type="checkbox" checked={neu.belehrung_ok} onChange={(e) => setNeu({ ...neu, belehrung_ok: e.target.checked })} /> Der Kunde wurde korrekt über sein Widerrufsrecht belehrt (Shop-Belehrung + Bestätigung in Textform)
              </label>
            )}
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>{RETOUREN_ARTEN.find((a) => a.key === neu.art)?.hinweis}</div>
            {wf && <div style={{ marginTop: 8, color: wf.stufe === 'ok' ? C.green : wf.stufe === 'spaet' ? C.danger : C.warn }}>{wf.text}</div>}
            {neu.art === 'reklamation' && neu.erhalten_am && <div style={{ marginTop: 8, color: C.textDim }}>{gewaehrleistung(neu.erhalten_am, neu.widerruf_am).text}</div>}
            {gewaehlt && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...lab, marginTop: 0 }}>Welche Positionen kommen zurück? (Menge 0 = behält der Kunde)</div>
                {(gewaehlt.positionen ?? []).map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <input style={{ ...feld, width: 80 }} value={auswahl[i] ?? ''} onChange={(e) => setAuswahl({ ...auswahl, [i]: e.target.value })} />
                    <span>von {p.menge} × {p.bezeichnung} à {euro(Number(p.einzelpreis))}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}><button style={primaer} disabled={busy} onClick={anlegen}>{busy ? '…' : '＋ Retoure anlegen'}</button></div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['offen', 'alle'] as const).map((f) => <button key={f} style={{ ...knopf, ...(filter === f ? { background: C.gold, color: C.navy, border: 'none', fontWeight: 800 } : {}) }} onClick={() => setFilter(f)}>{f === 'offen' ? 'Offene' : 'Alle'}</button>)}
          </div>
          {sichtbar.length === 0 && <div style={karte}>Keine {filter === 'offen' ? 'offenen ' : ''}Retouren.</div>}
          {sichtbar.map((r) => (
            <RetoureKarte key={r.id} r={r} heute={heute} firma={firma} offen={offenId === r.id} onToggle={() => setOffenId(offenId === r.id ? null : r.id)}
              onFehler={setFehler} onOk={setOk} neuLaden={laden} />
          ))}

          {zahlen.gruende.length > 0 && (
            <div style={karte}>
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Häufigste Gründe</h3>
              {zahlen.gruende.slice(0, 6).map((g) => <div key={g.grund} style={{ color: C.textDim }}>{g.anzahl}× {g.grund}</div>)}
            </div>
          )}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>Hinweis: Fristen und Beträge nach BGB (Stand 09/2026). Gilt für Verbraucher; bei Geschäftskunden gibt es kein gesetzliches Widerrufsrecht. Keine Rechtsberatung — Ihre Widerrufsbelehrung lassen Sie am besten anwaltlich prüfen.</p>
        </>
      )}
    </div>
  );
}

function RetoureKarte({ r, heute, firma, offen, onToggle, onFehler, onOk, neuLaden }: {
  r: Retoure; heute: string; firma: string; offen: boolean; onToggle: () => void;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [f, setF] = useState({
    ware_zurueck_am: r.ware_zurueck_am ?? '', rueckversand_nachweis: r.rueckversand_nachweis, abholung_angeboten: r.abholung_angeboten,
    zustand: (r.zustand ?? '') as Zustand | '', mehrkosten: r.mehrkosten_lieferart == null ? '' : String(r.mehrkosten_lieferart).replace('.', ','),
    wertersatz: r.wertersatz == null ? '' : String(r.wertersatz).replace('.', ','), wertersatz_grund: r.wertersatz_grund ?? '',
    erstattungsweg: r.erstattungsweg ?? '', notiz: r.notiz ?? '',
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const stand = erstattungsStand({ ...r, ware_zurueck_am: f.ware_zurueck_am || null, rueckversand_nachweis: f.rueckversand_nachweis, abholung_angeboten: f.abholung_angeboten }, heute);
  const rechnung = erstattungsBetrag({ positionen: r.positionen, vollstaendig: r.vollstaendig, hinversand: r.hinversand, mehrkostenLieferart: zahlAus(f.mehrkosten), wertersatz: zahlAus(f.wertersatz), belehrungOk: r.belehrung_ok });
  const zInfo = ZUSTAENDE.find((z) => z.key === f.zustand);

  async function speichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.') {
    setBusy(true); onFehler(null); onOk(null);
    try {
      const { error } = await supabase.from('shop_retoure').update({
        ware_zurueck_am: f.ware_zurueck_am || null, rueckversand_nachweis: f.rueckversand_nachweis, abholung_angeboten: f.abholung_angeboten,
        zustand: f.zustand || null, mehrkosten_lieferart: zahlAus(f.mehrkosten), wertersatz: zahlAus(f.wertersatz), wertersatz_grund: f.wertersatz_grund.trim() || null,
        erstattungsweg: f.erstattungsweg.trim() || null, notiz: f.notiz.trim() || null, aktualisiert_am: new Date().toISOString(), ...extra,
      }).eq('id', r.id);
      if (error) throw error;
      onOk(meldung); await neuLaden();
    } catch (e) { onFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function erstatten() {
    if (rechnung.betrag == null) { onFehler('Erstattungsbetrag nicht berechenbar — bitte Positionen prüfen.'); return; }
    if (zahlAus(f.wertersatz) && !f.wertersatz_grund.trim()) { onFehler('Bitte begründen Sie den Wertersatz (was war über die Prüfung hinaus?).'); return; }
    await speichern({ status: 'erstattet', erstattung_betrag: rechnung.betrag, erstattet_am: heute }, `Als erstattet markiert: ${euro(rechnung.betrag)}. Die Gutschrift erstellen Sie in „Rechnungen".`);
  }

  async function insLager() {
    if (r.lager_gebucht) return;
    if (!zInfo?.lager) { onFehler('Nur neuwertige oder geöffnete, verkaufbare Ware zurück ins Lager buchen.'); return; }
    setBusy(true); onFehler(null); onOk(null);
    try {
      const { data } = await supabase.from('artikel').select('id, bezeichnung, artikelnummer, aktueller_bestand');
      const artikel = (data ?? []) as { id: string; bezeichnung: string | null; artikelnummer: string | null; aktueller_bestand: number | null }[];
      const plan = planeLagerabzug(r.positionen, artikel);
      for (const ab of plan.abzuege) {
        const a = artikel.find((x) => x.id === ab.artikel_id);
        const { error } = await supabase.from('artikel').update({ aktueller_bestand: (Number(a?.aktueller_bestand) || 0) + ab.menge }).eq('id', ab.artikel_id);
        if (error) throw error;
      }
      const { error } = await supabase.from('shop_retoure').update({ lager_gebucht: true }).eq('id', r.id);
      if (error) throw error;
      onOk(`Zurück ins Lager: ${plan.zugeordnet} Position(en)${plan.offen ? `, ${plan.offen} ohne passenden Artikel übersprungen` : ''}.`);
      await neuLaden();
    } catch (e) { onFehler('Lagerbuchung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  const platz = offenePlatzhalter(text);

  return (
    <div style={{ ...karte, borderLeft: `4px solid ${FARBE[stand.stufe]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <b>{r.nummer}</b> · {RETOUREN_ARTEN.find((a) => a.key === r.art)?.label.split(' (')[0]} · {r.kunde_name || 'ohne Name'}{r.bestellnummer ? ` · Bestellung ${r.bestellnummer}` : ''}
          <div style={{ color: FARBE[stand.stufe], fontSize: 13.5, marginTop: 2 }}>{stand.text}</div>
        </div>
        <div style={{ color: C.textDim, fontSize: 13 }}>{RETOUREN_STATUS.find((s) => s.key === r.status)?.label} {offen ? '▲' : '▼'}</div>
      </div>
      {offen && (
        <div style={{ marginTop: 10 }}>
          {r.art === 'widerruf' && <div style={{ color: C.textDim, fontSize: 13.5 }}>{pruefeWiderruf(r).text}</div>}
          <div style={{ margin: '8px 0' }}>
            {r.positionen.map((p, i) => <div key={i} style={{ fontSize: 13.5 }}>{p.menge} × {p.bezeichnung} à {euro(Number(p.einzelpreis))}</div>)}
            {r.positionen.length === 0 && <div style={{ color: C.textDim }}>Keine Positionen erfasst.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {RETOUREN_STATUS.filter((s) => s.key !== 'erstattet').map((s) => (
              <button key={s.key} style={{ ...knopf, ...(r.status === s.key ? { background: C.cyan, color: C.navy, border: 'none' } : {}) }} disabled={busy} onClick={() => speichern({ status: s.key }, `Status: ${s.label}`)}>{s.label}</button>
            ))}
          </div>
          <div style={raster}>
            <div><label style={lab}>Ware bei uns eingegangen am</label><input type="date" style={feld} value={f.ware_zurueck_am} onChange={(e) => setF({ ...f, ware_zurueck_am: e.target.value })} /></div>
            <div>
              <label style={lab}>Zustand</label>
              <select style={feld} value={f.zustand} onChange={(e) => setF({ ...f, zustand: e.target.value as Zustand | '' })}>
                <option value="">— noch nicht geprüft —</option>
                {ZUSTAENDE.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>
            </div>
            {r.art === 'widerruf' && <div><label style={lab}>Mehrkosten Express (nicht erstatten)</label><input style={feld} value={f.mehrkosten} onChange={(e) => setF({ ...f, mehrkosten: e.target.value })} /></div>}
            {r.art === 'widerruf' && <div><label style={lab}>Wertersatz (Abzug)</label><input style={feld} value={f.wertersatz} onChange={(e) => setF({ ...f, wertersatz: e.target.value })} /></div>}
            <div><label style={lab}>Erstattungsweg</label><input style={feld} placeholder="z. B. PayPal, Überweisung" value={f.erstattungsweg} onChange={(e) => setF({ ...f, erstattungsweg: e.target.value })} /></div>
          </div>
          {r.art === 'widerruf' && zahlAus(f.wertersatz) != null && <><label style={lab}>Begründung Wertersatz</label><input style={feld} value={f.wertersatz_grund} onChange={(e) => setF({ ...f, wertersatz_grund: e.target.value })} /></>}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
            <label><input type="checkbox" checked={f.rueckversand_nachweis} onChange={(e) => setF({ ...f, rueckversand_nachweis: e.target.checked })} /> Kunde hat Rücksendung nachgewiesen (Einlieferungsbeleg)</label>
            <label><input type="checkbox" checked={f.abholung_angeboten} onChange={(e) => setF({ ...f, abholung_angeboten: e.target.checked })} /> Wir haben Abholung angeboten</label>
          </div>
          <label style={lab}>Notiz</label>
          <textarea style={{ ...feld, minHeight: 50 }} value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} />
          {r.art === 'widerruf' && (
            <div style={{ ...karte, background: C.navy, marginTop: 10 }}>
              <b>Erstattung</b>
              {rechnung.teile.map((t) => <div key={t.text} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t.text}</span><span>{euro(t.betrag)}</span></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}><span>Zu erstatten</span><span>{euro(rechnung.betrag)}</span></div>
              {rechnung.hinweise.map((h) => <div key={h} style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{h}</div>)}
              <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>Zurückzahlen über dasselbe Zahlungsmittel, mit dem der Kunde bezahlt hat (§ 357 Abs. 3 BGB).</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={primaer} disabled={busy} onClick={() => speichern()}>Speichern</button>
            {r.art === 'widerruf' && !r.erstattet_am && <button style={knopf} disabled={busy} onClick={erstatten}>✓ Erstattet ({euro(rechnung.betrag)})</button>}
            {!r.lager_gebucht ? <button style={knopf} disabled={busy} onClick={insLager}>📦 Zurück ins Lager</button> : <span style={{ color: C.green, alignSelf: 'center' }}>📦 Lager gebucht</span>}
            <button style={knopf} onClick={() => setText(retourenText('eingang', { name: r.kunde_name, nummer: r.nummer, bestellung: r.bestellnummer, firma }))}>✉ Eingangsbestätigung</button>
            <button style={knopf} onClick={() => setText(retourenText('erstattung', { name: r.kunde_name, bestellung: r.bestellnummer, betrag: r.erstattung_betrag ?? rechnung.betrag, firma, weg: f.erstattungsweg }))}>✉ Erstattung</button>
            {r.art === 'widerruf' && <button style={knopf} onClick={() => setText(retourenText('ablehnung_frist', { name: r.kunde_name, bestellung: r.bestellnummer, firma }))}>✉ Frist abgelaufen</button>}
          </div>
          {text && (
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...feld, minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} />
              {platz.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>Noch ausfüllen: {platz.join(', ')}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button style={knopf} disabled={platz.length > 0} onClick={() => { navigator.clipboard?.writeText(text); onOk('Text kopiert.'); }}>📋 Kopieren</button>
                {r.email && <a style={{ ...knopf, textDecoration: 'none', pointerEvents: platz.length ? 'none' : 'auto', opacity: platz.length ? 0.5 : 1 }} href={`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(`Ihre Rücksendung ${r.bestellnummer ?? r.nummer}`)}&body=${encodeURIComponent(text)}`}>✉ Mail öffnen</a>}
              </div>
            </div>
          )}
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>Angelegt am {datumDe(r.erstellt_am.slice(0, 10))}{r.erstattet_am ? ` · erstattet am ${datumDe(r.erstattet_am)} (${euro(r.erstattung_betrag)})` : ''}</div>
        </div>
      )}
    </div>
  );
}
