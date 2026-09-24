'use client';

// ============================================================
// ARGONAUT OS · Fahrzeug-Akte (Paket PJ, B18)
// Ein Fahrzeug, alles darüber: Fristen (HU, UVV, Wartung, Versicherung,
// Leasing), Fahrer, km-Verlauf, Tanken/Laden, Werkstatt, Reifen, Schäden —
// mit Kosten je Monat, Kosten je km und Verbrauch (nur wenn die Zahlen es
// hergeben). Logik: lib/fuhrparkGeraete.ts (getestet). Kein KI-Aufruf.
//
// Der QR-Code am Fahrzeug führt hierher: Fahrer tragen unterwegs Tanken,
// km-Stand, Schäden und Übergaben ein. Kosten für Werkstatt/Reifen, Fristen
// und das Abhaken von Schäden macht der Chef (RLS: pj-fuhrpark-geraete.sql).
//
// Pfad: app/dashboard/erp/fuhrpark/[id]/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { heuteIso } from '@/lib/nachweisMotor';
import {
  EINTRAG_ARTEN, eintragArt, fahrzeugFristen, fahrzeugHinweise, kostenAuswertung, aktuellerKm, aktuellerFahrer,
  offeneSchaeden, leseZahl, akteLink, qrSvg, datumDe, type Ampel, type FahrzeugEintrag,
} from '@/lib/fuhrparkGeraete';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const AMPEL_FARBE: Record<Ampel, string> = { ueberfaellig: C.danger, fehlt: C.warn, bald: C.warn, ok: C.green };
const STUFE_FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, info: C.textDim };

type Fahrzeug = {
  id: string; bezeichnung: string; kennzeichen: string | null; fahrzeugtyp: string | null; kraftstoff: string | null;
  km_stand: number | null; tuev_bis: string | null; wartung_bis: string | null; versicherung_bis: string | null;
  uvv_bis?: string | null; leasing_ende?: string | null; fahrer_name?: string | null; aktiv: boolean;
  [feld: string]: unknown;
};
type Eintrag = FahrzeugEintrag & { id: string; beschreibung: string | null; erstellt_am: string };
type Form = { art: string; datum: string; km_stand: string; betrag_brutto: string; menge: string; fahrer_name: string; beschreibung: string };

function euro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function monatDe(m: string): string {
  const [j, mo] = m.split('-');
  return `${mo}/${j}`;
}

export default function FahrzeugAkte() {
  const params = useParams();
  const id = String((params as Record<string, string | string[]>)?.id ?? '');
  const heute = heuteIso(new Date());
  const [uid, setUid] = useState<string | null>(null);
  const [meinName, setMeinName] = useState('');
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [f, setF] = useState<Fahrzeug | null>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [stamm, setStamm] = useState<{ uvv_bis: string; leasing_ende: string; fahrer_name: string } | null>(null);
  const [zeitraum, setZeitraum] = useState<'jahr' | '12' | 'alles'>('12');
  const [origin, setOrigin] = useState('');

  const laden = useCallback(async () => {
    const [fz, ei] = await Promise.all([
      supabase.from('fahrzeuge').select('*').eq('id', id).maybeSingle(),
      supabase.from('fahrzeug_eintrag').select('*').eq('fahrzeug_id', id).order('datum', { ascending: false }).order('erstellt_am', { ascending: false }),
    ]);
    setF((fz.data as Fahrzeug | null) ?? null);
    if (ei.error) setFehler(/fahrzeug_eintrag/.test(ei.error.message) ? 'Die Fahrzeug-Akte ist noch nicht eingerichtet (SQL von Paket PJ fehlt).' : 'Einträge konnten nicht geladen werden.');
    setEintraege((ei.data as Eintrag[]) ?? []);
    setGeladen(true);
  }, [id]);

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUid(u?.id ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.email ?? '').split('@')[0]);
      try {
        const { data: chef } = await supabase.rpc('mein_chef_id');
        setIstMitarbeiter(!!chef && chef !== u?.id);
      } catch { /* Chef-Ansicht; RLS schuetzt ohnehin */ }
      await laden();
    })();
  }, [laden]);

  const fristen = useMemo(() => (f ? fahrzeugFristen(f, heute) : []), [f, heute]);
  const hinweise = useMemo(() => (f ? fahrzeugHinweise(f, eintraege, heute) : []), [f, eintraege, heute]);
  const kmJetzt = useMemo(() => aktuellerKm(f?.km_stand, eintraege), [f, eintraege]);
  const fahrer = useMemo(() => aktuellerFahrer(f?.fahrer_name, eintraege), [f, eintraege]);
  const von = zeitraum === 'jahr' ? `${heute.slice(0, 4)}-01-01` : zeitraum === '12' ? `${Number(heute.slice(0, 4)) - 1}${heute.slice(4)}` : null;
  const kosten = useMemo(() => kostenAuswertung(eintraege, von, heute), [eintraege, von, heute]);
  const maxMonat = Math.max(1, ...kosten.jeMonat.map((m) => m.betrag));
  const schaeden = useMemo(() => offeneSchaeden(eintraege), [eintraege]);
  const qr = useMemo(() => {
    const link = origin ? akteLink(origin, 'fahrzeug', id) : null;
    return link ? qrSvg(link).svg : null;
  }, [origin, id]);

  const erlaubteArten = EINTRAG_ARTEN.filter((a) => !istMitarbeiter || a.mitarbeiter);

  function neu(art: string) {
    setOk(null); setFehler(null);
    setForm({ art, datum: heute, km_stand: '', betrag_brutto: '', menge: '', fahrer_name: art === 'uebergabe' ? '' : meinName, beschreibung: '' });
  }

  async function speichern() {
    if (!form || !uid || !f) return;
    const art = eintragArt(form.art);
    if (!art) return;
    const km = leseZahl(form.km_stand);
    const betrag = leseZahl(form.betrag_brutto);
    const menge = leseZahl(form.menge);
    if (form.km_stand.trim() && (km == null || km < 0)) { setFehler('Der km-Stand ist nicht lesbar.'); return; }
    if (form.art === 'km' && km == null) { setFehler('Bitte den km-Stand eintragen.'); return; }
    if (form.betrag_brutto.trim() && betrag == null) { setFehler('Der Betrag ist nicht lesbar.'); return; }
    if (form.menge.trim() && menge == null) { setFehler('Die Menge ist nicht lesbar.'); return; }
    if (form.art === 'uebergabe' && !form.fahrer_name.trim()) { setFehler('An wen wurde das Fahrzeug übergeben?'); return; }
    if (form.art === 'schaden' && !form.beschreibung.trim()) { setFehler('Bitte den Schaden kurz beschreiben.'); return; }
    if (km != null && kmJetzt != null && km < kmJetzt && !window.confirm(`Der eingetragene km-Stand (${km.toLocaleString('de-DE')}) ist kleiner als der bisher höchste (${kmJetzt.toLocaleString('de-DE')}). Trotzdem speichern?`)) return;
    setBusy(true); setFehler(null);
    try {
      const zeile: Record<string, unknown> = {
        fahrzeug_id: f.id, art: form.art, datum: form.datum || heute,
        km_stand: km != null ? Math.round(km) : null,
        betrag_brutto: art.kosten && betrag != null ? Math.round(betrag * 100) / 100 : null,
        menge: (form.art === 'tanken' || form.art === 'laden') && menge != null ? Math.round(menge * 100) / 100 : null,
        fahrer_name: form.fahrer_name.trim() || null, beschreibung: form.beschreibung.trim().slice(0, 1000) || null,
        erstellt_von: uid,
      };
      if (!istMitarbeiter) zeile.owner_user_id = uid;
      const { error } = await supabase.from('fahrzeug_eintrag').insert(zeile);
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setForm(null); setOk(`${art.label} eingetragen.`);
      await laden();
    } finally { setBusy(false); }
  }

  async function schadenErledigt(e: Eintrag) {
    const { error } = await supabase.from('fahrzeug_eintrag').update({ erledigt: true }).eq('id', e.id);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    setOk('Schaden als erledigt markiert.'); await laden();
  }
  async function loeschen(e: Eintrag) {
    if (!window.confirm('Diesen Eintrag löschen?')) return;
    const { error } = await supabase.from('fahrzeug_eintrag').delete().eq('id', e.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }
  async function stammSpeichern() {
    if (!stamm || !f) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('fahrzeuge').update({
        uvv_bis: stamm.uvv_bis || null, leasing_ende: stamm.leasing_ende || null, fahrer_name: stamm.fahrer_name.trim() || null,
      }).eq('id', f.id);
      if (error) { setFehler(/uvv_bis|leasing_ende|fahrer_name/.test(error.message) ? 'Die neuen Felder fehlen noch (SQL von Paket PJ).' : 'Speichern fehlgeschlagen.'); return; }
      setStamm(null); setOk('Gespeichert.'); await laden();
    } finally { setBusy(false); }
  }

  if (geladen && !f) {
    return (
      <div style={s.page}>
        <a href="/dashboard/erp/fuhrpark" style={s.zurueck}>← Fuhrpark</a>
        <div style={{ ...s.card, marginTop: 16 }}>Dieses Fahrzeug gibt es nicht oder Sie haben keinen Zugriff darauf.</div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/erp/fuhrpark" style={s.zurueck}>← Fuhrpark</a>
      <div style={s.kopf}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={s.h1}>🚐 {f?.bezeichnung ?? '…'}</h1>
          <div style={s.dim}>
            {f?.kennzeichen ? `${f.kennzeichen} · ` : ''}{f?.fahrzeugtyp ? `${f.fahrzeugtyp} · ` : ''}
            {kmJetzt != null ? `${kmJetzt.toLocaleString('de-DE')} km` : 'km-Stand unbekannt'}
            {fahrer ? ` · Fahrer: ${fahrer}` : ''}
          </div>
        </div>
        {qr && (
          <div style={{ textAlign: 'center' }}>
            <div style={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
            {!istMitarbeiter && <a href={`/dashboard/erp/etiketten?fahrzeug=${id}`} style={{ ...s.dim, fontSize: 12 }}>🏷 Etikett drucken</a>}
          </div>
        )}
      </div>

      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.knoepfe}>
        {erlaubteArten.map((a) => <button key={a.key} style={s.schnell} onClick={() => neu(a.key)}>{a.icon} {a.label}</button>)}
      </div>

      {hinweise.length > 0 && (
        <div style={s.card}>
          {hinweise.map((h, i) => <div key={i} style={{ color: STUFE_FARBE[h.stufe], fontSize: 14 }}>{h.stufe === 'rot' ? '⛔ ' : h.stufe === 'gelb' ? '⚠️ ' : 'ℹ️ '}{h.text}</div>)}
        </div>
      )}

      <div style={s.card}>
        <div style={s.titel}>Fristen</div>
        <div style={s.fristen}>
          {fristen.map((fr) => (
            <div key={fr.key} style={{ ...s.frist, borderColor: AMPEL_FARBE[fr.ampel] }} title={fr.grundlage}>
              <div style={{ fontSize: 12, color: C.textDim }}>{fr.label}</div>
              <div style={{ fontWeight: 800, color: AMPEL_FARBE[fr.ampel] }}>{fr.datum ? datumDe(fr.datum) : 'fehlt'}</div>
            </div>
          ))}
        </div>
        {!istMitarbeiter && f && (
          <button style={{ ...s.klein, alignSelf: 'flex-start' }} onClick={() => setStamm({ uvv_bis: f.uvv_bis ?? '', leasing_ende: f.leasing_ende ?? '', fahrer_name: f.fahrer_name ?? '' })}>
            ✏️ UVV, Leasing, fester Fahrer
          </button>
        )}
        <div style={{ ...s.dim, fontSize: 12 }}>HU, Wartung und Versicherung pflegen Sie in der Fuhrpark-Liste. UVV: DGUV Vorschrift 70 — mindestens jährlich durch einen Sachkundigen (Richtwert, keine Rechtsberatung).</div>
      </div>

      {!istMitarbeiter && (
        <div style={s.card}>
          <div style={s.kopf}>
            <div style={s.titel}>Kosten</div>
            <select style={s.inp} value={zeitraum} onChange={(e) => setZeitraum(e.target.value as 'jahr' | '12' | 'alles')}>
              <option value="12">Letzte 12 Monate</option>
              <option value="jahr">Dieses Jahr</option>
              <option value="alles">Alles</option>
            </select>
          </div>
          <div style={s.kpis}>
            <div style={s.kpi}><div style={s.kpiZahl}>{euro(kosten.gesamt)}</div><div style={s.kpiText}>Kosten brutto{kosten.ohneBetrag ? ` · ${kosten.ohneBetrag} ohne Betrag` : ''}</div></div>
            <div style={s.kpi}><div style={s.kpiZahl}>{kosten.km != null ? `${kosten.km.toLocaleString('de-DE')} km` : '—'}</div><div style={s.kpiText}>gefahren (aus km-Ständen)</div></div>
            <div style={s.kpi}><div style={s.kpiZahl}>{kosten.jeKm != null ? `${kosten.jeKm.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €` : '—'}</div><div style={s.kpiText}>je km</div></div>
            <div style={s.kpi}><div style={s.kpiZahl}>{kosten.verbrauch != null ? `${kosten.verbrauch.toLocaleString('de-DE')} l` : '—'}</div><div style={s.kpiText}>je 100 km (Tank-Methode)</div></div>
          </div>
          {kosten.jeMonat.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {kosten.jeMonat.map((m) => (
                <div key={m.monat} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <div style={{ width: 62, color: C.textDim }}>{monatDe(m.monat)}</div>
                  <div style={{ flex: 1, background: C.navy, borderRadius: 6, height: 12 }}>
                    <div style={{ width: `${Math.round((m.betrag / maxMonat) * 100)}%`, background: C.gold, height: 12, borderRadius: 6 }} />
                  </div>
                  <div style={{ width: 100, textAlign: 'right' }}>{euro(m.betrag)}</div>
                </div>
              ))}
            </div>
          ) : <div style={s.dim}>Im Zeitraum keine Kosten erfasst.</div>}
          {Object.keys(kosten.jeArt).length > 0 && (
            <div style={s.dim}>{Object.entries(kosten.jeArt).map(([k, v]) => `${eintragArt(k)?.label ?? k}: ${euro(v)}`).join(' · ')}</div>
          )}
        </div>
      )}

      <div style={s.card}>
        <div style={s.titel}>Verlauf{schaeden.length ? ` · ${schaeden.length} offene Schäden` : ''}</div>
        {eintraege.length === 0 && <div style={s.dim}>Noch keine Einträge. Tanken, km-Stand oder Schaden oben eintragen.</div>}
        {eintraege.map((e) => {
          const a = eintragArt(e.art);
          const km = leseZahl(e.km_stand);
          const betrag = leseZahl(e.betrag_brutto);
          const menge = leseZahl(e.menge);
          return (
            <div key={e.id} style={s.zeile}>
              <div style={{ width: 88, color: C.textDim, fontSize: 13 }}>{datumDe(e.datum)}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{a?.icon} {a?.label ?? e.art}{e.art === 'schaden' && e.erledigt ? ' · erledigt' : ''}</div>
                <div style={{ fontSize: 13, color: C.textDim }}>
                  {[km != null ? `${km.toLocaleString('de-DE')} km` : null, menge != null ? `${menge.toLocaleString('de-DE')} ${e.art === 'laden' ? 'kWh' : 'l'}` : null, e.fahrer_name, e.beschreibung].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!istMitarbeiter && betrag != null && <div style={{ fontWeight: 700 }}>{euro(betrag)}</div>}
              {!istMitarbeiter && e.art === 'schaden' && !e.erledigt && <button style={{ ...s.klein, color: C.green }} onClick={() => schadenErledigt(e)}>✔ erledigt</button>}
              {!istMitarbeiter && <button style={{ ...s.klein, color: C.danger }} onClick={() => loeschen(e)}>🗑</button>}
            </div>
          );
        })}
      </div>

      {form && (
        <div style={s.schleier} onClick={() => setForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{eintragArt(form.art)?.icon} {eintragArt(form.art)?.label}</div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Datum<input type="date" style={s.inp} value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>km-Stand<input style={s.inp} inputMode="numeric" value={form.km_stand} onChange={(e) => setForm({ ...form, km_stand: e.target.value })} placeholder={kmJetzt != null ? `zuletzt ${kmJetzt.toLocaleString('de-DE')}` : ''} /></label>
            </div>
            {(form.art === 'tanken' || form.art === 'laden' || eintragArt(form.art)?.kosten) && (
              <div style={s.row}>
                {(form.art === 'tanken' || form.art === 'laden') && <label style={{ ...s.lab, flex: 1 }}>{form.art === 'laden' ? 'kWh' : 'Liter'}<input style={s.inp} inputMode="decimal" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} /></label>}
                <label style={{ ...s.lab, flex: 1 }}>Betrag brutto €<input style={s.inp} inputMode="decimal" value={form.betrag_brutto} onChange={(e) => setForm({ ...form, betrag_brutto: e.target.value })} /></label>
              </div>
            )}
            <label style={s.lab}>{form.art === 'uebergabe' ? 'Übergeben an' : 'Fahrer'}<input style={s.inp} value={form.fahrer_name} onChange={(e) => setForm({ ...form, fahrer_name: e.target.value })} /></label>
            <label style={s.lab}>{form.art === 'schaden' ? 'Was ist passiert? (Ort, Hergang, Beteiligte)' : 'Notiz'}<textarea style={{ ...s.inp, minHeight: 60 }} value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} /></label>
            {form.art === 'schaden' && <div style={s.dim}>Bei einem Unfall mit Fremdschaden: Polizei und Versicherung informieren, Fotos machen, nichts schriftlich anerkennen.</div>}
            {form.art === 'tanken' && <div style={s.dim}>Für den Verbrauch bitte bei jeder Tankung km-Stand und Liter eintragen und immer voll tanken.</div>}
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {stamm && (
        <div style={s.schleier} onClick={() => setStamm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>UVV, Leasing, fester Fahrer</div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Nächste UVV-Prüfung<input type="date" style={s.inp} value={stamm.uvv_bis} onChange={(e) => setStamm({ ...stamm, uvv_bis: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Leasing-Ende<input type="date" style={s.inp} value={stamm.leasing_ende} onChange={(e) => setStamm({ ...stamm, leasing_ende: e.target.value })} /></label>
            </div>
            <label style={s.lab}>Fester Fahrer (wenn es einen gibt)<input style={s.inp} value={stamm.fahrer_name} onChange={(e) => setStamm({ ...stamm, fahrer_name: e.target.value })} /></label>
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={stammSpeichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setStamm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13, textDecoration: 'none' },
  kopf: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  titel: { fontWeight: 800, fontSize: 16 },
  qr: { width: 96, height: 96, background: '#fff', borderRadius: 8, padding: 4 },
  knoepfe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 },
  schnell: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  fristen: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  frist: { border: '1px solid', borderRadius: 12, padding: '8px 14px', minWidth: 130 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  kpi: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  kpiZahl: { fontSize: 20, fontWeight: 800 },
  kpiText: { color: C.textDim, fontSize: 12.5, marginTop: 2 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8, flexWrap: 'wrap' },
  dim: { color: C.textDim, fontSize: 13.5, marginTop: 2 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  schleier: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflowY: 'auto', zIndex: 50 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
