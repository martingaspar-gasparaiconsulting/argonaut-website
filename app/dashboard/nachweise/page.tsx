'use client';

// ============================================================
// ARGONAUT OS · Nachweise & Fristen (Paket PE)
// EIN Motor für fünf Mappen: Arbeitsschutz (B08), Pflichten der Branche +
// Gesetzes-Radar (B09), Subunternehmer (B17), Versicherungen (B19),
// Entsorgung (B20). Katalog, Ampel und Monatsrechnung: lib/nachweisMotor.ts
// (getestet). Unterweisungen werden mit Unterschrift der Beschäftigten
// bestätigt (Anwalt-Punkt R05: Beweiswert der digitalen Unterschrift).
//
// Bestehendes bleibt, wo es ist: Führerscheinkontrolle, UVV/TÜV-Prüffristen,
// Sofortmeldung und §48b-Freistellung stehen im Compliance-Center und werden
// hier nur verlinkt — nichts doppelt.
//
// Pfad: app/dashboard/nachweise/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties, type PointerEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  MAPPEN, katalogFuer, katalogArt, vorschlaege, bewerte, zaehle, sortiere, heuteIso, datumDe,
  unterschriftenStand, unterschriftGueltig, radarKommend, RADAR_STAND, HINWEIS_RICHTWERTE, VORSCHLAG_MAPPEN,
  type Mappe, type NachweisZeile, type Person, type Unterschrift,
} from '@/lib/nachweisMotor';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<string, string> = { fehlt: C.danger, ueberfaellig: C.danger, bald: C.warn, ok: C.green, anlass: C.textDim };

type Zeile = NachweisZeile & { id: string; owner_user_id: string; mappe: Mappe; art: string; bezeichnung: string; betrag: number | string | null; notiz: string | null };
type Form = { id: string | null; art: string; bezeichnung: string; bezug: string; letzte_am: string; intervall_monate: string; gueltig_bis: string; kuendigungsfrist_monate: string; betrag: string; notiz: string };
const LEER: Form = { id: null, art: '', bezeichnung: '', bezug: '', letzte_am: '', intervall_monate: '', gueltig_bis: '', kuendigungsfrist_monate: '', betrag: '', notiz: '' };

function zahl(s: string): number | null {
  const t = s.trim(); if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function NachweisSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [tab, setTab] = useState<Mappe | 'radar'>('arbeitsschutz');
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [unterweisung, setUnterweisung] = useState<Zeile | null>(null);
  const heute = heuteIso(new Date());

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('nachweis').select('*').order('erstellt_am', { ascending: true });
    if (error) {
      setFehler(/nachweis/.test(error.message) ? 'Die Nachweis-Mappen sind noch nicht eingerichtet (SQL von Paket PE fehlt).' : 'Laden fehlgeschlagen.');
      return;
    }
    setZeilen((data as Zeile[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data: p } = await supabase.from('profiles').select('kategorie').eq('id', id).maybeSingle();
        setKategorie(((p as { kategorie?: string | null } | null)?.kategorie) || null);
      }
      await laden();
    })();
  }, [laden]);

  const mappeZeilen = useMemo(() => (tab === 'radar' ? [] : sortiere(zeilen.filter((z) => z.mappe === tab), heute)), [zeilen, tab, heute]);
  const zahlen = useMemo(() => zaehle(mappeZeilen, heute), [mappeZeilen, heute]);
  const vorschlagListe = useMemo(() => (tab !== 'radar' && VORSCHLAG_MAPPEN.includes(tab))
    ? vorschlaege(kategorie, zeilen.map((z) => z.art)).filter((k) => k.mappe === tab) : [], [tab, kategorie, zeilen]);

  function neu(art?: string) {
    if (tab === 'radar') return;
    const k = katalogArt(art ?? katalogFuer(tab)[0]?.key);
    setForm({
      ...LEER,
      art: k?.key ?? '',
      bezeichnung: k?.label ?? '',
      intervall_monate: k?.intervall ? String(k.intervall) : '',
      kuendigungsfrist_monate: k?.kuendigung ? String(k.kuendigung) : '',
    });
  }

  function bearbeiten(z: Zeile) {
    setForm({
      id: z.id, art: z.art, bezeichnung: z.bezeichnung, bezug: z.bezug ?? '', letzte_am: z.letzte_am ?? '',
      intervall_monate: z.intervall_monate ? String(z.intervall_monate) : '', gueltig_bis: z.gueltig_bis ?? '',
      kuendigungsfrist_monate: z.kuendigungsfrist_monate != null ? String(z.kuendigungsfrist_monate) : '',
      betrag: z.betrag != null ? String(z.betrag).replace('.', ',') : '', notiz: z.notiz ?? '',
    });
  }

  async function speichern() {
    if (!form || !uid || tab === 'radar') return;
    setFehler(null); setOk(null);
    if (!form.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    const intervall = zahl(form.intervall_monate);
    const frist = zahl(form.kuendigungsfrist_monate);
    const betrag = zahl(form.betrag);
    if (form.intervall_monate.trim() && (intervall === null || intervall < 1 || intervall > 120)) { setFehler('Das Intervall muss zwischen 1 und 120 Monaten liegen.'); return; }
    if (form.betrag.trim() && betrag === null) { setFehler('Der Betrag ist nicht lesbar.'); return; }
    const zeile = {
      mappe: tab, art: form.art || 'sonstige', bezeichnung: form.bezeichnung.trim().slice(0, 200),
      bezug: form.bezug.trim() || null, letzte_am: form.letzte_am || null,
      intervall_monate: intervall ? Math.round(intervall) : null, gueltig_bis: form.gueltig_bis || null,
      kuendigungsfrist_monate: frist !== null ? Math.round(frist) : null,
      betrag: betrag !== null ? Math.round(betrag * 100) / 100 : null,
      notiz: form.notiz.trim() || null, aktualisiert_am: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from('nachweis').update(zeile).eq('id', form.id)
      : await supabase.from('nachweis').insert({ ...zeile, owner_user_id: uid });
    if (error) { setFehler(/mappe_check/.test(error.message) ? 'Die Mappe „Meldungen & Register" ist noch nicht eingerichtet (SQL von Paket PS1 fehlt).' : 'Speichern fehlgeschlagen.'); return; }
    setForm(null); setOk('Gespeichert.'); await laden();
  }

  async function heuteErledigt(z: Zeile) {
    const { error } = await supabase.from('nachweis').update({ letzte_am: heute, aktualisiert_am: new Date().toISOString() }).eq('id', z.id);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    await laden();
  }

  async function loeschen(z: Zeile) {
    if (!window.confirm(`„${z.bezeichnung}" löschen?`)) return;
    await supabase.from('nachweis').delete().eq('id', z.id);
    await laden();
  }

  async function vorschlaegeAnlegen() {
    if (!uid || vorschlagListe.length === 0) return;
    const zeilenNeu = vorschlagListe.map((k) => ({
      owner_user_id: uid, mappe: k.mappe, art: k.key, bezeichnung: k.label,
      intervall_monate: k.intervall, kuendigungsfrist_monate: k.kuendigung ?? null,
    }));
    const { error } = await supabase.from('nachweis').insert(zeilenNeu);
    if (error) { setFehler(/mappe_check/.test(error.message) ? 'Die Mappe „Meldungen & Register" ist noch nicht eingerichtet (SQL von Paket PS1 fehlt).' : 'Vorschläge konnten nicht angelegt werden.'); return; }
    setOk(`${zeilenNeu.length} Pflichten angelegt — tragen Sie jeweils das letzte Datum ein.`);
    await laden();
  }

  const k = form ? katalogArt(form.art) : null;
  const mappeInfo = MAPPEN.find((m) => m.key === tab);

  return (
    <div style={s.page}>
      <div style={s.eyebrow}>ARGONAUT OS · Büro</div>
      <h1 style={s.h1}>🗂 Nachweise &amp; Fristen</h1>
      <p style={s.sub}>
        Alles, was Sie regelmäßig nachweisen müssen, an einem Ort — mit Ampel, bevor es teuer wird.
        Führerscheinkontrolle, UVV/TÜV, Sofortmeldung und §48b-Freistellung finden Sie weiterhin im{' '}
        <a href="/dashboard/compliance" style={{ color: C.cyan }}>Compliance-Center</a>.
        {' '}Gefahrstoffe führen Sie im <a href="/dashboard/nachweise/gefahrstoffe" style={{ color: C.cyan }}>Gefahrstoffverzeichnis</a>.
      </p>

      <div style={s.tabs}>
        {MAPPEN.map((m) => (
          <button key={m.key} onClick={() => { setTab(m.key); setForm(null); }} style={{ ...s.tab, ...(tab === m.key ? s.tabAn : {}) }}>{m.icon} {m.label}</button>
        ))}
        <button onClick={() => { setTab('radar'); setForm(null); }} style={{ ...s.tab, ...(tab === 'radar' ? s.tabAn : {}) }}>📡 Gesetzes-Radar</button>
      </div>

      {fehler && <div style={s.err}>{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}

      {tab === 'radar' ? (
        <div>
          <p style={s.sub}>Was sich in den nächsten Monaten ändert — gepflegt von ARGONAUT, Stand {datumDe(RADAR_STAND)}. Ohne Gewähr.</p>
          {radarKommend(heute, kategorie).map((r, i) => (
            <div key={i} style={s.zeile}>
              <div style={{ color: C.gold, fontWeight: 800, minWidth: 96 }}>ab {datumDe(r.ab)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{r.titel}</div>
                <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 2 }}>Betrifft: {r.wen}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{r.tun}</div>
                <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>Quelle: {r.quelle}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <p style={{ ...s.sub, marginTop: 0 }}>{mappeInfo?.beschreibung}</p>
          <div style={s.kpis}>
            <Kpi label="Fehlt" wert={zahlen.fehlt} farbe={zahlen.fehlt ? C.danger : C.textDim} />
            <Kpi label="Überfällig" wert={zahlen.ueberfaellig} farbe={zahlen.ueberfaellig ? C.danger : C.textDim} />
            <Kpi label="Bald fällig" wert={zahlen.bald} farbe={zahlen.bald ? C.warn : C.textDim} />
            <Kpi label="In Ordnung" wert={zahlen.ok} farbe={C.green} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 14px' }}>
            <button style={s.primaer} onClick={() => neu()}>＋ Nachweis</button>
            {vorschlagListe.length > 0 && (
              <button style={s.mini} onClick={() => void vorschlaegeAnlegen()}>
                ✨ {vorschlagListe.length} Pflicht{vorschlagListe.length === 1 ? '' : 'en'} für {kategorie ? `„${kategorie}"` : 'jeden Betrieb'} anlegen
              </button>
            )}
          </div>

          {form && (
            <div style={s.karte}>
              <div style={s.zwei}>
                <label style={s.lab}>Art
                  <select style={s.inp} value={form.art} onChange={(e) => {
                    const nk = katalogArt(e.target.value);
                    setForm({ ...form, art: e.target.value, bezeichnung: nk?.label ?? form.bezeichnung, intervall_monate: nk?.intervall ? String(nk.intervall) : '', kuendigungsfrist_monate: nk?.kuendigung ? String(nk.kuendigung) : form.kuendigungsfrist_monate });
                  }}>
                    {katalogFuer(tab).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
                <label style={s.lab}>Bezeichnung<input style={s.inp} value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} /></label>
                {(k?.jeBezug || form.bezug) && <label style={s.lab}>{k?.jeBezug || 'Bezug'}<input style={s.inp} value={form.bezug} onChange={(e) => setForm({ ...form, bezug: e.target.value })} /></label>}
                <label style={s.lab}>Zuletzt erledigt am<input type="date" style={s.inp} value={form.letzte_am} onChange={(e) => setForm({ ...form, letzte_am: e.target.value })} /></label>
                {k?.stichtag
                  ? <div style={{ ...s.lab, fontWeight: 500 }}>Fester Termin: jedes Jahr bis {k.stichtag.tag.slice(3)}.{k.stichtag.tag.slice(0, 2)}. — „Zuletzt erledigt am" eintragen, die nächste Frist rechnet ARGONAUT.</div>
                  : <label style={s.lab}>Intervall (Monate, leer = nach Anlass)<input style={s.inp} value={form.intervall_monate} onChange={(e) => setForm({ ...form, intervall_monate: e.target.value })} inputMode="numeric" /></label>}
                <label style={s.lab}>{tab === 'versicherung' || tab === 'entsorgung' ? 'Vertrag läuft ab am' : tab === 'meldungen' ? 'Frist / gültig bis (falls festes Datum)' : 'Gültig bis (falls festes Datum)'}<input type="date" style={s.inp} value={form.gueltig_bis} onChange={(e) => setForm({ ...form, gueltig_bis: e.target.value })} /></label>
                {(tab === 'versicherung' || k?.kuendigung) && (
                  <label style={s.lab}>Kündigungsfrist (Monate vor Ablauf)<input style={s.inp} value={form.kuendigungsfrist_monate} onChange={(e) => setForm({ ...form, kuendigungsfrist_monate: e.target.value })} inputMode="numeric" /></label>
                )}
                {tab === 'versicherung' && <label style={s.lab}>Beitrag im Jahr (€)<input style={s.inp} value={form.betrag} onChange={(e) => setForm({ ...form, betrag: e.target.value })} inputMode="decimal" /></label>}
              </div>
              <label style={s.lab}>Notiz<input style={s.inp} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
              {k && <div style={s.grund}>{k.grundlage}{k.hinweis ? ` — ${k.hinweis}` : ''}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={s.primaer} onClick={() => void speichern()}>💾 Speichern</button>
                <button style={s.mini} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {mappeZeilen.length === 0 && !fehler && <div style={s.hint}>Noch nichts angelegt.</div>}
          {mappeZeilen.map((z) => {
            const b = bewerte(z, heute);
            const art = katalogArt(z.art);
            return (
              <div key={z.id} style={s.zeile}>
                <span style={{ ...s.punkt, background: FARBE[b.status] }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{z.bezeichnung}{z.bezug ? <span style={{ color: C.textDim, fontWeight: 400 }}> · {z.bezug}</span> : null}</div>
                  <div style={{ color: FARBE[b.status], fontSize: 13.5, marginTop: 2 }}>{b.text}</div>
                  {art && <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>{art.grundlage}</div>}
                  {z.betrag != null && <div style={{ color: C.textDim, fontSize: 12.5 }}>Beitrag: {Number(z.betrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} im Jahr</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {art?.unterschrift && <button style={s.mini} onClick={() => setUnterweisung(z)}>✍ Unterschriften</button>}
                  {!z.gueltig_bis && <button style={s.mini} onClick={() => void heuteErledigt(z)}>✓ Heute erledigt</button>}
                  <button style={s.mini} onClick={() => bearbeiten(z)}>Bearbeiten</button>
                  <button style={{ ...s.mini, color: C.textDim }} onClick={() => void loeschen(z)}>✕</button>
                </div>
              </div>
            );
          })}
          <p style={{ ...s.grund, marginTop: 16 }}>{HINWEIS_RICHTWERTE}</p>
        </>
      )}

      {unterweisung && <UnterschriftFenster nachweis={unterweisung} onZu={() => { setUnterweisung(null); void laden(); }} />}
    </div>
  );
}

function Kpi({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return <div style={s.kpi}><div style={{ fontSize: 26, fontWeight: 800, color: farbe }}>{wert}</div><div style={{ color: C.textDim, fontSize: 12.5 }}>{label}</div></div>;
}

// ------------------------------------------------------------------
// Unterschriften unter einer Unterweisung
// ------------------------------------------------------------------
function UnterschriftFenster({ nachweis, onZu }: { nachweis: Zeile; onZu: () => void }) {
  const [personen, setPersonen] = useState<Person[]>([]);
  const [liste, setListe] = useState<(Unterschrift & { id: string; thema: string | null })[]>([]);
  const [thema, setThema] = useState('');
  const [wer, setWer] = useState<Person | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const hatStrich = useRef(false);

  const laden = useCallback(async () => {
    const { data: m } = await supabase.from('mitarbeiter').select('id, vorname, nachname, status').eq('owner_user_id', nachweis.owner_user_id);
    const inaktiv = ['inaktiv', 'ausgeschieden', 'archiviert', 'gekuendigt'];
    setPersonen(((m as Array<{ id: string; vorname: string | null; nachname: string | null; status: string | null }>) ?? [])
      .filter((x) => !inaktiv.includes(String(x.status || 'aktiv').toLowerCase()))
      .map((x) => ({ id: x.id, name: `${x.vorname || ''} ${x.nachname || ''}`.trim() || 'Ohne Namen' })));
    const { data: u } = await supabase.from('nachweis_unterschrift').select('id, mitarbeiter_id, name, thema, unterschrieben_am').eq('nachweis_id', nachweis.id).order('unterschrieben_am', { ascending: false });
    setListe((u as (Unterschrift & { id: string; thema: string | null })[]) ?? []);
  }, [nachweis]);

  useEffect(() => { void laden(); }, [laden]);

  const stand = unterschriftenStand(nachweis.letzte_am, personen, liste);

  function punkt(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current?.getContext('2d'); const p = punkt(e); if (!ctx || !p) return;
    zeichnet.current = true; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0A1628';
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function zug(e: PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return;
    const ctx = canvas.current?.getContext('2d'); const p = punkt(e); if (!ctx || !p) return;
    ctx.lineTo(p.x, p.y); ctx.stroke(); hatStrich.current = true;
  }
  function leeren() {
    const c = canvas.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); hatStrich.current = false;
  }
  useEffect(() => { if (wer) setTimeout(leeren, 0); }, [wer]);

  async function speichern() {
    setFehler(null);
    if (!wer) return;
    if (!thema.trim()) { setFehler('Bitte kurz eintragen, worin unterwiesen wurde.'); return; }
    if (!hatStrich.current) { setFehler('Bitte unterschreiben.'); return; }
    const bild = canvas.current?.toDataURL('image/png') ?? '';
    if (!unterschriftGueltig(bild)) { setFehler('Die Unterschrift ist ungültig oder zu groß.'); return; }
    const { error } = await supabase.from('nachweis_unterschrift').insert({
      owner_user_id: nachweis.owner_user_id, nachweis_id: nachweis.id, mitarbeiter_id: wer.id,
      name: wer.name, thema: thema.trim().slice(0, 2000), unterschrift: bild,
    });
    if (error) { setFehler('Unterschrift konnte nicht gespeichert werden.'); return; }
    setWer(null); await laden();
  }

  return (
    <div style={s.hinter} onClick={onZu}>
      <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 17 }}>✍ {nachweis.bezeichnung}</b>
          <span style={{ flex: 1 }} />
          <button style={s.mini} onClick={onZu}>✕</button>
        </div>
        <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>
          Unterweisung vom {datumDe(nachweis.letzte_am)} · {stand.unterschrieben} von {stand.gesamt} haben unterschrieben
          {!nachweis.letzte_am && ' — bitte zuerst „Heute erledigt" setzen oder das Datum eintragen.'}
        </div>
        <label style={s.lab}>Worin wurde unterwiesen? (steht bei jeder Unterschrift)
          <textarea style={{ ...s.inp, minHeight: 60 }} value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z. B. Umgang mit Leitern, Gefahrstoffe im Lager, Verhalten im Brandfall" />
        </label>

        {!wer ? (
          <div style={{ marginTop: 12 }}>
            {stand.fehlend.length === 0 && personen.length > 0 && <div style={{ color: C.green }}>✓ Alle haben unterschrieben.</div>}
            {personen.length === 0 && <div style={{ color: C.textDim }}>Keine aktiven Mitarbeiter gefunden.</div>}
            {stand.fehlend.map((p) => (
              <button key={p.id} style={{ ...s.mini, margin: '0 6px 6px 0' }} onClick={() => setWer(p)}>{p.name} unterschreibt</button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Unterschrift: {wer.name}</div>
            <canvas
              ref={canvas} width={600} height={200}
              style={{ width: '100%', height: 160, background: '#fff', borderRadius: 10, touchAction: 'none' }}
              onPointerDown={start} onPointerMove={zug} onPointerUp={() => { zeichnet.current = false; }} onPointerLeave={() => { zeichnet.current = false; }}
            />
            <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>
              Mit der Unterschrift bestätigt {wer.name}, an der Unterweisung teilgenommen und den Inhalt verstanden zu haben.
            </div>
            {fehler && <div style={{ color: C.danger, marginTop: 6 }}>{fehler}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={s.primaer} onClick={() => void speichern()}>Unterschrift speichern</button>
              <button style={s.mini} onClick={leeren}>Neu</button>
              <button style={s.mini} onClick={() => setWer(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {liste.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: C.textDim, fontSize: 12.5, fontWeight: 700 }}>BISHERIGE UNTERSCHRIFTEN</div>
            {liste.slice(0, 50).map((u) => (
              <div key={u.id} style={{ fontSize: 13.5, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                {u.name} · {new Date(u.unterschrieben_am).toLocaleString('de-DE')}{u.thema ? <span style={{ color: C.textDim }}> · {u.thema.slice(0, 80)}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1050, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.2vw, 18px)', maxWidth: 840, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { borderColor: C.gold, background: 'rgba(201,168,76,0.12)' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 14 },
  zwei: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 },
  lab: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 },
  inp: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 14.5, fontFamily: 'inherit' },
  grund: { color: C.textDim, fontSize: 12.5, lineHeight: 1.5, marginTop: 8 },
  zeile: { display: 'flex', gap: 12, alignItems: 'flex-start', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 8 },
  punkt: { width: 12, height: 12, borderRadius: 999, marginTop: 5, flexShrink: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 14.5, padding: '10px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', margin: '0 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.35)', borderRadius: 10, padding: '12px 14px', margin: '0 0 12px' },
  hinter: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 },
  fenster: { background: C.navy2, color: C.text, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', borderRadius: 16, padding: '18px 20px', boxSizing: 'border-box' },
};
