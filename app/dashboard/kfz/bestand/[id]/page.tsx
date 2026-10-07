'use client';

// ============================================================
// ARGONAUT OS · Paket 261 · K2 Handelsakte
// Die Akte eines Bestandsfahrzeugs: Übersicht, Ausstattung, Energie und CO₂,
// Inserat (Titel-Wächter, Inserats-Ampel), Preisverlauf, Historie.
// Pfad: app/dashboard/kfz/bestand/[id]/page.tsx — erbt die Freigabe von
// /dashboard/kfz (Modul „kfz"). Stammdaten ändern weiterhin im Bestand
// („✎ Stammdaten"), die Akte pflegt die neuen Felder aus SQL 261.
// Paket 262 (K3): Reiter „Fotos und Video" (KfzMedien), Foto-Zahl fließt in die Inserats-Ampel.
// Andockpunkte: K5 Kalkulation, K6 Verkaufsunterlagen,
// K18 Partner (eigener Reiter).
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { vorlageFuer, mitKunde, standtageAmpel, type KundenEinstellung } from '@/lib/branchenVorlage';
import { standtage, ezText, euro, psAusKw, finTreffer, type Bestand, type FinTreffer } from '@/lib/kfzBestand';
import {
  titelPruefen, titelVorschlag, inseratAmpel, pflichtFehlt, co2KlasseVorschlag, istElektro, AUSSTATTUNG,
  merkmaleBereinigen, preisVerlauf, type PreisEintrag,
} from '@/lib/kfzAkte';
import KfzMedien from '../KfzMedien';

const MODUL = 'kfz-bestand';
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8',
};
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Akte = Bestand & {
  ausstattung: string[] | null; polster: string | null; vorbesitzer: number | null; hu_bis: string | null;
  vorschaden: string | null; vorschaden_text: string | null; inserat_titel: string | null; inserat_text: string | null;
  verbrauch_komb: number | null; verbrauch_einheit: string | null; co2_g_km: number | null; co2_klasse: string | null;
  erstellt_am: string | null; aktualisiert_am: string | null;
};
type Reiter = 'uebersicht' | 'fotos' | 'ausstattung' | 'energie' | 'inserat' | 'preis' | 'historie';
const REITER: [Reiter, string][] = [['uebersicht', 'Übersicht'], ['fotos', 'Fotos und Video'], ['ausstattung', 'Ausstattung'], ['energie', 'Energie und CO₂'], ['inserat', 'Inserat'], ['preis', 'Preisverlauf'], ['historie', 'Historie']];

function heute(): string { return new Date().toISOString().slice(0, 10); }
function deDatum(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function zahlText(n: number | null | undefined): string { return n === null || n === undefined ? '' : String(n).replace('.', ','); }

export default function HandelsaktePage() {
  const params = useParams();
  const id = String((params as Record<string, string | string[]>)?.id ?? '');
  const [akte, setAkte] = useState<Akte | null>(null);
  const [preise, setPreise] = useState<PreisEintrag[]>([]);
  const [standort, setStandort] = useState<string>('—');
  const [einstellung, setEinstellung] = useState<KundenEinstellung | null>(null);
  const [branche, setBranche] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<FinTreffer | null>(null);
  const [reiter, setReiter] = useState<Reiter>('uebersicht');
  const [fotoZahl, setFotoZahl] = useState(0);
  const zaehle = useCallback((n: number) => setFotoZahl(n), []);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Entwürfe der Reiter
  const [aus, setAus] = useState<string[]>([]);
  const [eigenesMerkmal, setEigenesMerkmal] = useState('');
  const [polster, setPolster] = useState('');
  const [en, setEn] = useState({ kraftstoff: '', verbrauch: '', einheit: 'l', co2: '', klasse: '' });
  const [ins, setIns] = useState({ titel: '', text: '', inseriert: false });
  const [zust, setZust] = useState({ vorbesitzer: '', hu_bis: '', vorschaden: '', vorschaden_text: '' });

  const vorlage = useMemo(() => { const v = vorlageFuer(MODUL, branche); return v ? mitKunde(v, einstellung) : null; }, [branche, einstellung]);
  const tag = heute();

  const lade = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('kfz_bestand').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setFehler(error ? 'Die Akte lässt sich nicht laden. Fehlt SQL Paket 261 oder das Recht „KFZ"?' : 'Dieses Fahrzeug gibt es nicht (mehr).'); setLaden(false); return; }
    const a = data as unknown as Akte;
    setAkte(a);
    setAus(merkmaleBereinigen(a.ausstattung ?? []));
    setPolster(a.polster ?? '');
    setEn({ kraftstoff: a.kraftstoff ?? '', verbrauch: zahlText(a.verbrauch_komb), einheit: a.verbrauch_einheit ?? (istElektro(a.kraftstoff) ? 'kwh' : 'l'), co2: zahlText(a.co2_g_km), klasse: a.co2_klasse ?? '' });
    setIns({ titel: a.inserat_titel ?? '', text: a.inserat_text ?? '', inseriert: !!a.inseriert });
    setZust({ vorbesitzer: zahlText(a.vorbesitzer), hu_bis: a.hu_bis ?? '', vorschaden: a.vorschaden ?? '', vorschaden_text: a.vorschaden_text ?? '' });
    const [p, s, e, pr] = await Promise.all([
      supabase.from('kfz_bestand_preis').select('vk_alt, vk_neu, geaendert_am').eq('bestand_id', id).order('geaendert_am'),
      a.standort_id ? supabase.from('standorte').select('name').eq('id', a.standort_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', (a as unknown as { owner_user_id: string }).owner_user_id).eq('modul', MODUL).maybeSingle(),
      supabase.from('profiles').select('branche').eq('id', (a as unknown as { owner_user_id: string }).owner_user_id).maybeSingle(),
    ]);
    setPreise(((p.data as unknown) as PreisEintrag[]) ?? []);
    try { const { count } = await supabase.from('kfz_bestand_medien').select('id', { count: 'exact', head: true }).eq('bestand_id', id).eq('art', 'foto'); setFotoZahl(count ?? 0); } catch { setFotoZahl(0); }
    setStandort(((s.data as { name?: string } | null)?.name) ?? '—');
    setEinstellung(((e.data as { einstellung?: KundenEinstellung } | null)?.einstellung) ?? null);
    setBranche(((pr.data as { branche?: string | null } | null)?.branche) ?? null);
    try {
      if (a.fin) {
        const w = await supabase.from('werkstatt_fahrzeuge').select('id, fin').eq('fin', a.fin);
        const wf = ((w.data as unknown) as { id: string; fin: string | null }[]) ?? [];
        const au = wf.length ? await supabase.from('werkstatt_auftraege').select('fahrzeug_id').in('fahrzeug_id', wf.map((x) => x.id)) : { data: [] };
        setTreffer(finTreffer([a], wf, ((au.data as unknown) as { fahrzeug_id: string | null }[]) ?? [])[a.id] ?? null);
      }
    } catch { setTreffer(null); }
    setLaden(false);
  }, [id]);

  useEffect(() => { void lade(); }, [lade]);

  async function speichern(patch: Record<string, unknown>, meldung: string) {
    if (!akte) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_bestand').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', akte.id);
      if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 261 ausgeführt?'); return; }
      setOk(meldung); await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  if (!akte || !vorlage) return <div style={s.page}><a href="/dashboard/kfz/bestand" style={s.zurueck}>← Zum Bestand</a>{fehler && <div style={s.fehler}>{fehler}</div>}</div>;

  const t = standtage(akte, tag);
  const st = vorlage.status.find((x) => x.key === akte.status) ?? { label: akte.status, farbe: 'dim' as const };
  const ps = psAusKw(akte.leistung_kw);
  const titel = [akte.marke, akte.modell, akte.variante].filter(Boolean).join(' ') || vorlage.einheit;
  const entwurfFelder = {
    marke: akte.marke, modell: akte.modell, vk_brutto: akte.vk_brutto, status: akte.status,
    kraftstoff: en.kraftstoff || null, verbrauch_komb: leseZahl(en.verbrauch), verbrauch_einheit: en.einheit,
    co2_g_km: leseZahl(en.co2), co2_klasse: en.klasse || null, vorschaden: zust.vorschaden || null,
    inserat_titel: ins.titel, inserat_text: ins.text, inseriert: ins.inseriert, ausstattung: aus, fotos: fotoZahl,
  };
  const ampel = inseratAmpel(entwurfFelder);
  const fehlt = pflichtFehlt(entwurfFelder);
  const vorschlagKlasse = co2KlasseVorschlag(leseZahl(en.co2), en.kraftstoff);
  const verlauf = preisVerlauf(preise);

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz/bestand" style={s.zurueck}>← Zum {vorlage.titel}</a>
      <div style={s.kopf}>
        <div style={{ minWidth: 0 }}>
          <div style={s.knopfReihe}>
            <span style={{ ...s.pill, color: FARBE[st.farbe] }}>{st.label}</span>
            <span style={{ ...s.pill, color: FARBE[standtageAmpel(t, vorlage.ampel)] }}>{t === null ? '—' : `${t} Standtage`}</span>
            <span style={{ ...s.pill, color: FARBE[ampel.stufe] }}>Inserat {ampel.prozent} %</span>
          </div>
          <h1 style={s.h1}>{titel}</h1>
          <div style={s.dim}>{akte.interne_nr ?? ''} · EZ {ezText(akte.erstzulassung)} · {akte.km_stand !== null ? `${akte.km_stand.toLocaleString('de-DE')} km` : '— km'}{ps ? ` · ${ps} PS (${akte.leistung_kw} kW)` : ''}{akte.kraftstoff ? ` · ${akte.kraftstoff}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={s.preis}>{euro(akte.vk_brutto)}</div>
          <div style={s.dim}>{akte.besteuerung === '25a' ? 'differenzbesteuert (§ 25a)' : akte.besteuerung === 'regel' ? 'Regelsteuer' : 'Besteuerung offen'}</div>
          <a href={`/dashboard/kfz/bestand?bearbeiten=${akte.id}`} style={{ ...s.btn, display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>✎ Stammdaten</a>
        </div>
      </div>

      {treffer && <div style={s.hinweis}>🔧 Diese FIN kennt Ihre Werkstatt: {treffer.auftraege} {treffer.auftraege === 1 ? 'Auftrag' : 'Aufträge'} in der <a href="/dashboard/fahrzeugakte" style={{ color: C.info }}>Fahrzeugakte</a>. Nach dem Verkauf läuft die Lebensakte dort weiter.</div>}
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok} role="status">{ok}</div>}

      <div style={s.reiter} role="tablist">
        {REITER.map(([k, n]) => <button key={k} role="tab" aria-selected={reiter === k} style={reiter === k ? s.reiterAn : s.reiterAus} onClick={() => { setReiter(k); setOk(null); }}>{n}{k === 'energie' && fehlt.length ? ' ⚠' : ''}</button>)}
      </div>

      {reiter === 'uebersicht' && (
        <div style={s.raster}>
          <div style={s.karte}><h3 style={s.h3}>Fahrzeug</h3>
            <dl style={s.kv}>
              <dt>FIN</dt><dd style={s.mono}>{akte.fin ?? '—'}</dd><dt>Kennzeichen</dt><dd style={s.mono}>{akte.kennzeichen ?? '—'}</dd>
              <dt>Sparte</dt><dd>{akte.sparte ?? '—'}</dd><dt>Farbe</dt><dd>{akte.farbe ?? '—'}{akte.farbcode ? ` · ${akte.farbcode}` : ''}</dd>
              <dt>Polster</dt><dd>{akte.polster ?? '—'}</dd><dt>Standort</dt><dd>{standort}</dd><dt>Eingang</dt><dd>{deDatum(akte.eingang_am)}</dd>
            </dl>
          </div>
          <div style={s.karte}><h3 style={s.h3}>Zustand und Herkunft</h3>
            <div style={s.feldRaster}>
              <label style={s.lab}>Vorbesitzer<input style={s.inp} inputMode="numeric" value={zust.vorbesitzer} onChange={(e) => setZust({ ...zust, vorbesitzer: e.target.value })} /></label>
              <label style={s.lab}>HU bis<input type="date" style={s.inp} value={zust.hu_bis} onChange={(e) => setZust({ ...zust, hu_bis: e.target.value })} /></label>
              <label style={s.lab}>Vorschäden<select style={s.inp} value={zust.vorschaden} onChange={(e) => setZust({ ...zust, vorschaden: e.target.value })}>
                <option value="">nicht erfasst</option><option value="keine_bekannt">keine bekannt</option><option value="ja">ja (bitte beschreiben)</option><option value="unbekannt">unbekannt</option></select></label>
            </div>
            {zust.vorschaden === 'ja' && <label style={{ ...s.lab, marginTop: 8 }}>Welche Vorschäden?<textarea style={{ ...s.inp, minHeight: 60 }} value={zust.vorschaden_text} onChange={(e) => setZust({ ...zust, vorschaden_text: e.target.value })} /></label>}
            <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => {
              const vb = leseZahl(zust.vorbesitzer);
              void speichern({ vorbesitzer: vb === null ? null : Math.max(0, Math.round(vb)), hu_bis: zust.hu_bis || null, vorschaden: zust.vorschaden || null, vorschaden_text: zust.vorschaden === 'ja' ? (zust.vorschaden_text.trim() || null) : null }, 'Zustand gespeichert.');
            }}>💾 Speichern</button>
          </div>
          <div style={s.karte}><h3 style={s.h3}>Inserat auf einen Blick</h3>
            {ampel.punkte.map((p) => <div key={p.name} style={s.ampelZeile}><span>{p.name}</span><span style={{ color: p.ok ? C.ok : C.warn, textAlign: 'right' }}>{p.hinweis}</span></div>)}
          </div>
        </div>
      )}

      {reiter === 'fotos' && <KfzMedien bestandId={akte.id} betrieb={(akte as unknown as { owner_user_id: string }).owner_user_id} onAnzahl={zaehle} />}
      {reiter === 'inserat' && fotoZahl === 0 && <div style={s.hinweis}>Noch keine Fotos: Reiter „Fotos und Video" öffnen.</div>}

      {reiter === 'ausstattung' && (
        <div style={s.karte}>
          <div style={{ ...s.dim, marginBottom: 10 }}>{aus.length} Merkmale gewählt. Dieselben Merkmale gehen später an alle Börsen (K11).</div>
          {AUSSTATTUNG.map((g) => (
            <div key={g.gruppe} style={{ marginBottom: 12 }}>
              <div style={s.tag}>{g.gruppe}</div>
              <div style={s.chips}>{g.merkmale.map((m) => {
                const an = aus.some((x) => x.toLowerCase() === m.toLowerCase());
                return <button key={m} style={an ? s.chipAn : s.chip} aria-pressed={an} onClick={() => setAus(an ? aus.filter((x) => x.toLowerCase() !== m.toLowerCase()) : merkmaleBereinigen([...aus, m]))}>{an ? '✓ ' : ''}{m}</button>;
              })}</div>
            </div>
          ))}
          <div style={s.tag}>Eigene Merkmale</div>
          <div style={s.chips}>
            {aus.filter((x) => !AUSSTATTUNG.some((g) => g.merkmale.some((m) => m.toLowerCase() === x.toLowerCase()))).map((x) => (
              <span key={x} style={s.chipAn}>{x} <button style={s.chipX} aria-label={`${x} entfernen`} onClick={() => setAus(aus.filter((y) => y !== x))}>✕</button></span>
            ))}
            <input style={{ ...s.inp, width: 220 }} value={eigenesMerkmal} placeholder="z. B. Carbon-Paket" onChange={(e) => setEigenesMerkmal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && eigenesMerkmal.trim()) { setAus(merkmaleBereinigen([...aus, eigenesMerkmal])); setEigenesMerkmal(''); } }} aria-label="Eigenes Merkmal" />
            <button style={s.btn} onClick={() => { if (eigenesMerkmal.trim()) { setAus(merkmaleBereinigen([...aus, eigenesMerkmal])); setEigenesMerkmal(''); } }}>＋ Hinzufügen</button>
          </div>
          <label style={{ ...s.lab, marginTop: 10, maxWidth: 320 }}>Polster<input style={s.inp} value={polster} onChange={(e) => setPolster(e.target.value)} placeholder="z. B. Leder Schwarz" /></label>
          <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern({ ausstattung: merkmaleBereinigen(aus), polster: polster.trim() || null }, 'Ausstattung gespeichert.')}>💾 Ausstattung speichern</button>
        </div>
      )}

      {reiter === 'energie' && (
        <div style={s.karte}>
          <div style={{ ...s.dim, marginBottom: 10 }}>Diese Angaben gehören in jedes Inserat eines neuen bzw. jungen Pkw. Übernehmen Sie die Werte aus dem Datenblatt.</div>
          <div style={s.feldRaster}>
            <label style={s.lab}>Kraftstoff / Antrieb<input style={s.inp} value={en.kraftstoff} onChange={(e) => setEn({ ...en, kraftstoff: e.target.value, einheit: istElektro(e.target.value) ? 'kwh' : en.einheit })} placeholder="Benzin, Diesel, Elektro, Plug-in-Hybrid …" /></label>
            <label style={s.lab}>Verbrauch kombiniert<input style={s.inp} inputMode="decimal" value={en.verbrauch} onChange={(e) => setEn({ ...en, verbrauch: e.target.value })} /></label>
            <label style={s.lab}>Einheit<select style={s.inp} value={en.einheit} onChange={(e) => setEn({ ...en, einheit: e.target.value })}><option value="l">l/100 km</option><option value="kwh">kWh/100 km</option><option value="kg">kg/100 km (Gas)</option></select></label>
            <label style={s.lab}>CO₂-Emissionen (g/km)<input style={s.inp} inputMode="numeric" value={en.co2} onChange={(e) => setEn({ ...en, co2: e.target.value })} /></label>
            <label style={s.lab}>CO₂-Klasse<select style={s.inp} value={en.klasse} onChange={(e) => setEn({ ...en, klasse: e.target.value })}><option value="">—</option>{['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          </div>
          {vorschlagKlasse && vorschlagKlasse !== en.klasse && <div style={{ ...s.hinweis, marginTop: 10 }}>Vorschlag nach {leseZahl(en.co2)} g/km: Klasse <b>{vorschlagKlasse}</b>. Bitte mit dem Datenblatt vergleichen. <button style={{ ...s.btn, marginLeft: 8 }} onClick={() => setEn({ ...en, klasse: vorschlagKlasse })}>Übernehmen</button></div>}
          {/plug|phev/i.test(en.kraftstoff) && <div style={{ ...s.hinweis, marginTop: 10 }}>Plug-in-Hybride haben eine gewichtete Klasse. Bitte die Klasse aus dem Datenblatt eintragen.</div>}
          <div style={{ marginTop: 10, color: fehlt.length ? C.warn : C.ok }}>{fehlt.length ? `Es fehlt noch: ${fehlt.join(', ')}.` : 'Alle Angaben vollständig.'}</div>
          <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => {
            const v = leseZahl(en.verbrauch); const c = leseZahl(en.co2);
            void speichern({ kraftstoff: en.kraftstoff.trim() || null, verbrauch_komb: v === null || v < 0 ? null : v, verbrauch_einheit: en.einheit || null, co2_g_km: c === null || c < 0 ? null : Math.round(c), co2_klasse: en.klasse || null }, 'Energie und CO₂ gespeichert.');
          }}>💾 Speichern</button>
        </div>
      )}

      {reiter === 'inserat' && (
        <div style={s.raster}>
          <div style={s.karte}>
            <h3 style={s.h3}>Titel und Beschreibung</h3>
            <label style={s.lab}>Titel<input style={s.inp} value={ins.titel} maxLength={120} onChange={(e) => setIns({ ...ins, titel: e.target.value })} /></label>
            {!ins.titel.trim() && <button style={{ ...s.btn, marginTop: 6 }} onClick={() => setIns({ ...ins, titel: titelVorschlag({ marke: akte.marke, modell: akte.modell, variante: akte.variante, ps, kraftstoff: akte.kraftstoff }) })}>Titel aus Stammdaten vorschlagen</button>}
            <div style={{ display: 'grid', gap: 6, margin: '10px 0' }}>
              <div style={s.tag}>Titel-Wächter</div>
              {titelPruefen(ins.titel, zust.vorschaden || akte.vorschaden).map((h, i) => <div key={i} style={{ color: FARBE[h.stufe], fontSize: 13.5 }}>● {h.text}</div>)}
            </div>
            <label style={s.lab}>Beschreibung<textarea style={{ ...s.inp, minHeight: 140 }} value={ins.text} onChange={(e) => setIns({ ...ins, text: e.target.value })} /></label>
            <div style={s.dim}>{ins.text.trim().length} Zeichen</div>
            <label style={{ ...s.haken, marginTop: 8 }}><input type="checkbox" checked={ins.inseriert} onChange={(e) => setIns({ ...ins, inseriert: e.target.checked })} /> Inserat ist online</label>
            <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern({ inserat_titel: ins.titel.trim() || null, inserat_text: ins.text.trim() || null, inseriert: ins.inseriert }, 'Inserat gespeichert.')}>💾 Speichern</button>
          </div>
          <div style={s.karte}>
            <h3 style={s.h3}>Inserats-Ampel <span style={{ color: FARBE[ampel.stufe] }}>{ampel.prozent} %</span></h3>
            <div style={s.meter}><i style={{ display: 'block', height: '100%', width: `${ampel.prozent}%`, background: FARBE[ampel.stufe], borderRadius: 99 }} /></div>
            {ampel.punkte.map((p) => <div key={p.name} style={s.ampelZeile}><span>{p.ok ? '✓' : '○'} {p.name}</span><span style={{ color: p.ok ? C.ok : C.warn, textAlign: 'right' }}>{p.hinweis}</span></div>)}
            <div style={{ ...s.dim, marginTop: 8 }}>Fotos pflegen Sie im Reiter „Fotos und Video". Die Übertragung an die Börsen folgt mit K11.</div>
          </div>
        </div>
      )}

      {reiter === 'preis' && (
        <div style={s.karte}>
          <h3 style={s.h3}>Preisverlauf</h3>
          {verlauf.punkte.length === 0 ? <div style={s.dim}>Noch kein Preis gesetzt.</div> : (
            <>
              <Verlauf punkte={verlauf.punkte} />
              <div style={{ ...s.dim, marginTop: 6 }}>{verlauf.gesenkt === null ? 'Noch keine Preisänderung.' : verlauf.gesenkt > 0 ? `Seit dem ersten Preis um ${euro(verlauf.gesenkt)} gesenkt.` : verlauf.gesenkt < 0 ? `Seit dem ersten Preis um ${euro(-verlauf.gesenkt)} erhöht.` : 'Preis wieder auf dem Anfangswert.'}</div>
              <table style={{ ...s.tab, marginTop: 10 }}><tbody>
                {[...preise].reverse().map((p, i) => <tr key={i}><td style={s.td}>{deDatum(p.geaendert_am)}</td><td style={s.tdR}>{p.vk_alt === null ? 'erster Preis' : euro(p.vk_alt)}</td><td style={s.td}>→</td><td style={s.tdR}><b>{euro(p.vk_neu)}</b></td></tr>)}
              </tbody></table>
            </>
          )}
          <div style={{ ...s.dim, marginTop: 8 }}>Den Preis ändern Sie im Bestand (einzeln unter „✎ Stammdaten" oder für mehrere per Häkchen). Jede Änderung landet hier automatisch.</div>
        </div>
      )}

      {reiter === 'historie' && (
        <div style={s.karte}>
          <h3 style={s.h3}>Verlauf</h3>
          <ul style={s.zeitstrahl}>
            {akte.erstellt_am && <li style={s.zeit}>Aufgenommen<span style={s.dim}> · {deDatum(akte.erstellt_am)}</span></li>}
            {akte.eingang_am && <li style={s.zeit}>Eingang auf dem Hof<span style={s.dim}> · {deDatum(akte.eingang_am)}</span></li>}
            {preise.map((p, i) => <li key={i} style={s.zeit}>{p.vk_alt === null ? `Erster Preis ${euro(p.vk_neu)}` : `Preis ${euro(p.vk_alt)} → ${euro(p.vk_neu)}`}<span style={s.dim}> · {deDatum(p.geaendert_am)}</span></li>)}
            {akte.verkauft_am && <li style={s.zeit}>Verkauft<span style={s.dim}> · {deDatum(akte.verkauft_am)}</span></li>}
            {akte.aktualisiert_am && <li style={s.zeit}>Zuletzt geändert<span style={s.dim}> · {deDatum(akte.aktualisiert_am)}</span></li>}
          </ul>
          {akte.notiz && <div style={{ marginTop: 10 }}><div style={s.tag}>Notiz</div><div style={{ whiteSpace: 'pre-wrap' }}>{akte.notiz}</div></div>}
        </div>
      )}
    </div>
  );
}

function Verlauf({ punkte }: { punkte: { am: string; preis: number }[] }) {
  const w = 520, h = 140, l = 12, r = 12, o = 14, u = 28;
  const werte = punkte.length > 1 ? punkte : [punkte[0], punkte[0]];
  const max = Math.max(...werte.map((p) => p.preis)), min = Math.min(...werte.map((p) => p.preis));
  const sp = max - min || max * 0.05 || 1;
  const lo = min - sp * 0.2, hi = max + sp * 0.2;
  const x = (i: number) => l + (i * (w - l - r)) / (werte.length - 1);
  const y = (n: number) => o + (h - o - u) * (1 - (n - lo) / (hi - lo));
  const pts = werte.map((p, i) => `${x(i).toFixed(1)},${y(p.preis).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Preisverlauf" style={{ maxWidth: 640 }}>
      <polygon points={`${l},${h - u} ${pts} ${x(werte.length - 1)},${h - u}`} fill="rgba(201,168,76,0.12)" />
      <polyline points={pts} fill="none" stroke={C.gold} strokeWidth={2} />
      {werte.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.preis)} r={i === werte.length - 1 ? 4.5 : 3} fill={i === werte.length - 1 ? C.gold : C.navy2} stroke={C.gold} strokeWidth={1.5} />)}
      {punkte.map((p, i) => <text key={i} x={punkte.length > 1 ? x(i) : x(0)} y={h - 8} fill={C.dim} fontSize={11} textAnchor={i === 0 ? 'start' : i === punkte.length - 1 ? 'end' : 'middle'}>{(p.preis / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€</text>)}
    </svg>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  kopf: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', margin: '8px 0 12px' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 2px' },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  preis: { fontSize: 28, fontWeight: 800, color: C.gold, fontVariantNumeric: 'tabular-nums' },
  dim: { color: C.dim, fontSize: 13 },
  mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, margin: 0 },
  knopfReihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, margin: '6px 0' },
  reiter: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  kv: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13.5, margin: 0 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  tag: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 6 },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  chip: { border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  chipAn: { border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.14)', color: C.gold, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  chipX: { background: 'none', border: 0, color: C.dim, cursor: 'pointer', marginLeft: 4 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  ampelZeile: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px dashed ${C.border}`, fontSize: 13.5 },
  meter: { height: 8, background: C.navy3, borderRadius: 99, overflow: 'hidden', margin: '4px 0 8px' },
  tab: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  zeitstrahl: { listStyle: 'none', padding: 0, margin: 0, borderLeft: `2px solid ${C.border}`, display: 'grid', gap: 10 },
  zeit: { paddingLeft: 14, fontSize: 13.5 },
};
