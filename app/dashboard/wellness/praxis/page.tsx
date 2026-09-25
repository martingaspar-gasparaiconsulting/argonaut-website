'use client';

// ============================================================
// ARGONAUT OS · Praxis-Paket (Paket PQ · Gesundheit Stufe 1)
// Für Selbstzahler-Betriebe (Privatpraxis, Heilpraktiker, Physio privat,
// Kosmetik, Beratung) — aufbauend auf der Kundenkartei „Gesundheit & Wellness".
//
//   Recall            fällige Folgetermine, Erinnerung nur mit Einwilligung
//   Ausfälle          Ausfallhonorar nur mit vorher unterschriebener Vereinbarung
//   Einwilligungen    Mustertexte mit Unterschrift, Widerruf als neue Zeile
//   Gesundheitsangaben   getrennt, verschlüsselt, jeder Zugriff protokolliert (H03)
//   Werbe-Prüfer      Heilmittelwerbegesetz (H02)
//   Zugriffsprotokoll nur Inhaber
//
// KEINE Befunde, keine Diagnosen, keine Kassenabrechnung (Stufe 2, C5).
// Logik: lib/praxis.ts, lib/hwgWaechter.ts (getestet). Verschlüsselung nur
// auf dem Server: /api/gesundheit-notiz.
// Pfad: app/dashboard/wellness/praxis/page.tsx (Unterpfad, erbt die Freigabe von Wellness)
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties, type PointerEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  berlinTag, datumDe, berlinZeit, EINWILLIGUNGEN, EINWILLIGUNG_VERSION, KANAELE, einwilligungText, einwilligungStand,
  darfErinnern, ausfallVereinbarungAm, pruefeAusfall, ausfallSchreiben, pruefeEinwilligung, recallListe, recallText,
  RECALL_VORSCHLAEGE, RECALL_LABEL, AUSFALL_LABEL, NOTIZ_ARTEN, NOTIZ_MAX, unterschriftGueltig,
  type EinwilligungArt, type EinwilligungDaten, type EinwilligungZeile, type Kanal, type RecallEinstellung, type RecallStatus, type AusfallErgebnis,
} from '@/lib/praxis';
import { pruefeHwg, HWG_STAND } from '@/lib/hwgWaechter';
import { leseZahl, zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Tab = 'recall' | 'ausfall' | 'einwilligung' | 'gesundheit' | 'hwg' | 'protokoll';
type Kunde = { id: string; name: string; email: string | null; telefon: string | null; hinweise: string | null };
type Einw = EinwilligungZeile & { id: string; version: string | null; name_unterschrift: string | null };
type Recall = RecallEinstellung & { id: string; anlass: string | null; zuletzt_kanal: string | null };
type Ausfall = { id: string; kunde_id: string; termin_am: string; abgesagt_am: string | null; neu_vergeben: boolean; ergebnis: string | null; betrag: number | null; status: string; notiz: string | null };
type Notiz = { id: string; art: string; text: string; unlesbar: boolean; erstellt_am: string; von_mir: boolean };
type MA = { auth_user_id: string; name: string };

const STATUS_FARBE: Record<RecallStatus, string> = { ueberfaellig: C.danger, faellig: C.warn, termin: C.green, geplant: C.textDim, ohne_besuch: C.textDim, pausiert: C.textDim };

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function zahl(s: string): number | null { return leseZahl(s); }
function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)); }
function dtDe(iso: string | null) { return iso ? `${datumDe(berlinTag(iso))} ${berlinZeit(iso)}` : '—'; }

export default function PraxisSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [firma, setFirma] = useState('');
  const [tab, setTab] = useState<Tab>('recall');
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [einw, setEinw] = useState<Einw[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [besuche, setBesuche] = useState<{ kunde_id: string; datum: string }[]>([]);
  const [termine, setTermine] = useState<{ kunde_email: string | null; beginn_am: string | null; status: string | null }[]>([]);
  const [ausfaelle, setAusfaelle] = useState<Ausfall[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [kundeId, setKundeId] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = berlinTag(new Date()) as string;

  const laden = useCallback(async () => {
    const vorgestern = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const [k, e, r, b, t, a] = await Promise.all([
      supabase.from('wellness_kunden').select('id, name, email, telefon, hinweise').order('name', { ascending: true }),
      supabase.from('praxis_einwilligung').select('id, kunde_id, art, widerruf, daten, erteilt_am, version, name_unterschrift').order('erteilt_am', { ascending: false }).limit(5000),
      supabase.from('praxis_recall').select('id, kunde_id, intervall_monate, naechster_am, pausiert, anlass, zuletzt_erinnert_am, zuletzt_kanal'),
      supabase.from('wellness_behandlungen').select('kunde_id, datum').order('datum', { ascending: false }).limit(10000),
      supabase.from('termine').select('kunde_email, beginn_am, status').gte('beginn_am', vorgestern).limit(3000),
      supabase.from('praxis_ausfall').select('id, kunde_id, termin_am, abgesagt_am, neu_vergeben, ergebnis, betrag, status, notiz').order('termin_am', { ascending: false }).limit(500),
    ]);
    setKunden((k.data as Kunde[]) ?? []);
    setSqlFehlt(!!(e.error && /praxis_/.test(e.error.message)));
    setEinw((e.data as Einw[]) ?? []);
    setRecalls((r.data as Recall[]) ?? []);
    setBesuche((b.data as { kunde_id: string; datum: string }[]) ?? []);
    setTermine((t.data as { kunde_email: string | null; beginn_am: string | null; status: string | null }[]) ?? []);
    setAusfaelle((a.data as Ausfall[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user ?? null;
      if (!u) { setFehler('Nicht angemeldet.'); return; }
      setUid(u.id);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === u.id);
      try {
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u.id).maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* egal */ }
      try {
        const q = new URLSearchParams(window.location.search);
        const kq = q.get('kunde'); if (kq) setKundeId(kq);
        const tq = q.get('tab') as Tab | null; if (tq) setTab(tq);
      } catch { /* egal */ }
      await laden();
    })();
  }, [laden]);

  const kunde = kunden.find((k) => k.id === kundeId) ?? null;
  const name = (id: string) => kunden.find((k) => k.id === id)?.name ?? 'Kunde';

  function meldung(o: string | null, f: string | null = null) { setOk(o); setFehler(f); }

  const TABS: Array<[Tab, string]> = [
    ['recall', '🔁 Recall'], ['ausfall', '⏰ Ausfälle'], ['einwilligung', '✍ Einwilligungen'],
    ['gesundheit', '🔒 Gesundheitsangaben'], ['hwg', '📣 Werbe-Prüfer'],
    ...(istChef ? [['protokoll', '🧾 Zugriffsprotokoll'] as [Tab, string]] : []),
  ];

  return (
    <div style={s.page}>
      <a href="/dashboard/wellness" style={s.zurueck}>← Gesundheit & Wellness</a>
      <h1 style={s.h1}>🩺 Praxis-Paket</h1>
      <p style={s.sub}>Recall, Ausfallhonorar, Einwilligungen und geschützte Gesundheitsangaben für Selbstzahler-Betriebe. Reines Verwaltungswerkzeug — keine Befunde, keine Diagnosen, keine Kassenabrechnung.</p>
      {sqlFehlt && <div style={s.err}>Das Praxis-Paket ist noch nicht eingerichtet (SQL von Paket PQ fehlt).</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.tabs}>
        {TABS.map(([k, l]) => (
          <button key={k} style={{ ...s.tab, ...(tab === k ? s.tabAktiv : {}) }} onClick={() => { setTab(k); meldung(null); }}>{l}</button>
        ))}
      </div>

      {tab === 'recall' && <RecallTab kunden={kunden} recalls={recalls} besuche={besuche} termine={termine} einw={einw} heute={heute} firma={firma} laden={laden} meldung={meldung} />}
      {tab === 'ausfall' && <AusfallTab kunden={kunden} einw={einw} ausfaelle={ausfaelle} istChef={istChef} firma={firma} name={name} laden={laden} meldung={meldung} />}
      {(tab === 'einwilligung' || tab === 'gesundheit') && (
        <div style={s.card}>
          <label style={s.lab}>Kunde
            <select style={s.inp} value={kundeId} onChange={(e) => setKundeId(e.target.value)}>
              <option value="">— bitte wählen —</option>
              {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          {!kunden.length && <div style={s.dim}>Noch keine Kunden — zuerst in „Gesundheit & Wellness" anlegen.</div>}
        </div>
      )}
      {tab === 'einwilligung' && kunde && <EinwilligungTab kunde={kunde} einw={einw} firma={firma} istChef={istChef} laden={laden} meldung={meldung} />}
      {tab === 'gesundheit' && <GesundheitTab kunde={kunde} istChef={istChef} uid={uid} laden={laden} meldung={meldung} />}
      {tab === 'hwg' && <HwgTab />}
      {tab === 'protokoll' && istChef && <ProtokollTab uid={uid} name={name} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

function RecallTab(p: {
  kunden: Kunde[]; recalls: Recall[]; besuche: { kunde_id: string; datum: string }[];
  termine: { kunde_email: string | null; beginn_am: string | null; status: string | null }[];
  einw: Einw[]; heute: string; firma: string; laden: () => Promise<void>; meldung: (o: string | null, f?: string | null) => void;
}) {
  const [form, setForm] = useState({ kunde_id: '', intervall: '6', naechster_am: '', anlass: '' });
  const liste = useMemo(() => recallListe(p.kunden, p.recalls, p.besuche, p.termine, p.heute), [p.kunden, p.recalls, p.besuche, p.termine, p.heute]);
  const ohne = p.kunden.filter((k) => !p.recalls.some((r) => r.kunde_id === k.id));
  const zahlen = { ueber: liste.filter((z) => z.status === 'ueberfaellig').length, bald: liste.filter((z) => z.status === 'faellig').length };

  async function speichern() {
    const iv = zahl(form.intervall);
    if (!form.kunde_id) { p.meldung(null, 'Bitte einen Kunden wählen.'); return; }
    if (!iv || iv < 1 || iv > 60) { p.meldung(null, 'Das Intervall muss zwischen 1 und 60 Monaten liegen.'); return; }
    const zeile = { kunde_id: form.kunde_id, intervall_monate: Math.round(iv), naechster_am: form.naechster_am || null, anlass: form.anlass.trim().slice(0, 120) || null };
    const vorhanden = p.recalls.find((r) => r.kunde_id === form.kunde_id);
    const { error } = vorhanden
      ? await supabase.from('praxis_recall').update(zeile).eq('id', vorhanden.id)
      : await supabase.from('praxis_recall').insert(zeile);
    if (error) { p.meldung(null, 'Recall konnte nicht gespeichert werden.'); return; }
    setForm({ kunde_id: '', intervall: '6', naechster_am: '', anlass: '' });
    p.meldung('Recall gespeichert.'); await p.laden();
  }

  async function erinnert(r: Recall, kanal: Kanal) {
    const { error } = await supabase.from('praxis_recall').update({ zuletzt_erinnert_am: p.heute, zuletzt_kanal: kanal }).eq('id', r.id);
    if (error) { p.meldung(null, 'Konnte nicht vermerkt werden.'); return; }
    p.meldung('Als erinnert vermerkt.'); await p.laden();
  }
  async function pause(r: Recall) {
    await supabase.from('praxis_recall').update({ pausiert: !r.pausiert }).eq('id', r.id);
    await p.laden();
  }
  function kopieren(t: string) { try { void navigator.clipboard.writeText(t); p.meldung('Text kopiert.'); } catch { /* egal */ } }

  return (
    <>
      <div style={s.kpis}>
        <div style={{ ...s.kpi, borderLeftColor: C.danger }}><div style={s.kpiL}>Überfällig</div><div style={{ ...s.kpiW, color: C.danger }}>{zahlen.ueber}</div></div>
        <div style={{ ...s.kpi, borderLeftColor: C.warn }}><div style={s.kpiL}>In 14 Tagen fällig</div><div style={{ ...s.kpiW, color: C.warn }}>{zahlen.bald}</div></div>
        <div style={{ ...s.kpi, borderLeftColor: C.cyan }}><div style={s.kpiL}>Mit Recall</div><div style={{ ...s.kpiW, color: C.cyan }}>{liste.length}</div></div>
      </div>

      <div style={s.card}>
        <b>Recall einrichten</b>
        <div style={s.row}>
          <label style={s.lab}>Kunde
            <select style={s.inp} value={form.kunde_id} onChange={(e) => {
              const r = p.recalls.find((x) => x.kunde_id === e.target.value);
              setForm(r ? { kunde_id: r.kunde_id, intervall: zahlFeld(r.intervall_monate), naechster_am: r.naechster_am ?? '', anlass: r.anlass ?? '' } : { ...form, kunde_id: e.target.value });
            }}>
              <option value="">— wählen —</option>
              {ohne.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              {p.recalls.length > 0 && <option disabled>── schon eingerichtet ──</option>}
              {p.recalls.map((r) => <option key={r.id} value={r.kunde_id}>{p.kunden.find((k) => k.id === r.kunde_id)?.name ?? 'Kunde'} (ändern)</option>)}
            </select>
          </label>
          <label style={s.lab}>Intervall (Monate)
            <input style={{ ...s.inp, width: 90 }} value={form.intervall} onChange={(e) => setForm({ ...form, intervall: e.target.value })} inputMode="numeric" list="recall-vorschlag" />
            <datalist id="recall-vorschlag">{RECALL_VORSCHLAEGE.map((v) => <option key={v.monate} value={v.monate}>{v.label}</option>)}</datalist>
          </label>
          <label style={s.lab}>oder fest am
            <input type="date" style={s.inp} value={form.naechster_am} onChange={(e) => setForm({ ...form, naechster_am: e.target.value })} />
          </label>
          <label style={{ ...s.lab, flex: 1, minWidth: 180 }}>Anlass (neutral, intern)
            <input style={s.inp} value={form.anlass} onChange={(e) => setForm({ ...form, anlass: e.target.value })} placeholder="z. B. Folgetermin, Jahrestermin" />
          </label>
          <button style={s.primaer} onClick={() => void speichern()}>Speichern</button>
        </div>
        <div style={s.hint}>Der Anlass bleibt intern und steht nie in der Erinnerung. Bitte keine Diagnosen eintragen — Gesundheitsangaben gehören in den Reiter „Gesundheitsangaben".</div>
      </div>

      {liste.length === 0 && <div style={s.dim}>Noch kein Recall eingerichtet. Fällig wird er ab der letzten Behandlung in der Kundenkartei plus Intervall.</div>}
      {liste.map((z) => {
        const k = z.kunde as Kunde;
        const r = z.einstellung as Recall;
        const mailOk = darfErinnern(p.einw, k.id, 'email') && !!k.email;
        const smsOk = darfErinnern(p.einw, k.id, 'sms') && !!k.telefon;
        const telOk = darfErinnern(p.einw, k.id, 'telefon') && !!k.telefon;
        const keineEinw = einwilligungStand(p.einw, k.id, 'recall').status !== 'aktiv';
        const m = recallText({ name: k.name, firma: p.firma, kanal: 'email' });
        return (
          <div key={r.id} style={s.zeile}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700 }}>{k.name} <span style={{ ...s.chip, color: STATUS_FARBE[z.status], borderColor: STATUS_FARBE[z.status] }}>{RECALL_LABEL[z.status]}</span></div>
              <div style={s.klein}>
                letzter Besuch {datumDe(z.letzterBesuch)} · fällig {datumDe(z.faelligAm)}{z.tage !== null && z.status !== 'termin' ? ` (${z.tage < 0 ? `seit ${-z.tage} Tagen` : `in ${z.tage} Tagen`})` : ''}
                {z.naechsterTermin && ` · Termin am ${datumDe(z.naechsterTermin)}`}
                {r.anlass && ` · ${r.anlass}`}
                {r.zuletzt_erinnert_am && ` · erinnert am ${datumDe(r.zuletzt_erinnert_am)}${r.zuletzt_kanal ? ` (${r.zuletzt_kanal})` : ''}`}
              </div>
              {keineEinw && <div style={{ ...s.klein, color: C.warn }}>Keine Recall-Einwilligung — Erinnern nur, wenn der Kunde selbst anfragt.</div>}
            </div>
            <div style={s.knoepfe}>
              {mailOk && <a style={s.mini} href={`mailto:${encodeURIComponent(k.email as string)}?subject=${encodeURIComponent(m.betreff)}&body=${encodeURIComponent(m.text)}`} onClick={() => void erinnert(r, 'email')}>✉ Erinnern</a>}
              {smsOk && <button style={s.mini} onClick={() => { kopieren(recallText({ name: k.name, firma: p.firma, kanal: 'sms' }).text); void erinnert(r, 'sms'); }}>📱 SMS-Text</button>}
              {telOk && <a style={s.mini} href={`tel:${(k.telefon as string).replace(/[^\d+]/g, '')}`} onClick={() => void erinnert(r, 'telefon')}>📞 Anrufen</a>}
              <a style={s.mini} href="/dashboard/termine">🗓 Termin</a>
              <button style={s.mini} onClick={() => void pause(r)}>{r.pausiert ? '▶ Fortsetzen' : '⏸ Pause'}</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ausfälle
// ---------------------------------------------------------------------------

function AusfallTab(p: {
  kunden: Kunde[]; einw: Einw[]; ausfaelle: Ausfall[]; istChef: boolean; firma: string; name: (id: string) => string;
  laden: () => Promise<void>; meldung: (o: string | null, f?: string | null) => void;
}) {
  const [f, setF] = useState({ kunde_id: '', termin: '', abgesagt: '', neu: false, notiz: '' });
  const [brief, setBrief] = useState<{ text: string; email: string | null } | null>(null);
  const terminIso = f.termin ? new Date(f.termin).toISOString() : '';
  const abgesagtIso = f.abgesagt ? new Date(f.abgesagt).toISOString() : null;
  const vorschau = f.kunde_id && terminIso ? pruefeAusfall({
    terminAm: terminIso, abgesagtAm: abgesagtIso, neuVergeben: f.neu,
    vereinbarung: ausfallVereinbarungAm(p.einw, f.kunde_id, terminIso), jetzt: new Date().toISOString(),
  }) : null;
  const offen = p.ausfaelle.filter((a) => a.ergebnis === 'faellig' && (a.status === 'offen' || a.status === 'gefordert'));

  async function speichern() {
    if (!vorschau || !f.kunde_id) { p.meldung(null, 'Bitte Kunde und Terminzeit angeben.'); return; }
    if (vorschau.ergebnis === 'zu_frueh') { p.meldung(null, 'Der Termin liegt noch in der Zukunft.'); return; }
    const { error } = await supabase.from('praxis_ausfall').insert({
      kunde_id: f.kunde_id, termin_am: terminIso, abgesagt_am: abgesagtIso, neu_vergeben: f.neu,
      ergebnis: vorschau.ergebnis, betrag: vorschau.betrag, notiz: f.notiz.trim().slice(0, 500) || null,
      status: vorschau.ergebnis === 'faellig' ? 'offen' : 'erlassen',
    });
    if (error) { p.meldung(null, 'Ausfall konnte nicht gespeichert werden.'); return; }
    setF({ kunde_id: '', termin: '', abgesagt: '', neu: false, notiz: '' });
    p.meldung('Ausfall gespeichert.'); await p.laden();
  }
  async function status(a: Ausfall, st: string) {
    const { error } = await supabase.from('praxis_ausfall').update({ status: st }).eq('id', a.id);
    if (error) { p.meldung(null, 'Nur der Inhaber kann den Status ändern.'); return; }
    await p.laden();
  }
  function schreiben(a: Ausfall) {
    const v = ausfallVereinbarungAm(p.einw, a.kunde_id, a.termin_am);
    if (!v || a.betrag == null) { p.meldung(null, 'Keine gültige Vereinbarung gefunden.'); return; }
    const k = p.kunden.find((x) => x.id === a.kunde_id);
    setBrief({ text: ausfallSchreiben({ name: k?.name ?? '', firma: p.firma, terminAm: a.termin_am, betrag: Number(a.betrag), fristStunden: v.frist_stunden, vereinbartAm: v.erteilt_am }), email: k?.email ?? null });
  }

  return (
    <>
      <div style={s.kpis}>
        <div style={{ ...s.kpi, borderLeftColor: C.warn }}><div style={s.kpiL}>Offene Ausfallhonorare</div><div style={{ ...s.kpiW, color: C.warn }}>{offen.length}</div></div>
        <div style={{ ...s.kpi, borderLeftColor: C.gold }}><div style={s.kpiL}>Summe offen</div><div style={{ ...s.kpiW, color: C.gold }}>{eur(offen.reduce((x, a) => x + Number(a.betrag || 0), 0))}</div></div>
      </div>
      <div style={s.card}>
        <b>Ausfall erfassen</b>
        <div style={s.row}>
          <label style={s.lab}>Kunde
            <select style={s.inp} value={f.kunde_id} onChange={(e) => setF({ ...f, kunde_id: e.target.value })}>
              <option value="">— wählen —</option>
              {p.kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label style={s.lab}>Termin war am<input type="datetime-local" style={s.inp} value={f.termin} onChange={(e) => setF({ ...f, termin: e.target.value })} /></label>
          <label style={s.lab}>Abgesagt am (leer = nicht erschienen)<input type="datetime-local" style={s.inp} value={f.abgesagt} onChange={(e) => setF({ ...f, abgesagt: e.target.value })} /></label>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={f.neu} onChange={(e) => setF({ ...f, neu: e.target.checked })} /> Termin konnte neu vergeben werden</label>
        </div>
        <input style={s.inp} value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} placeholder="Notiz (optional, keine Gesundheitsangaben)" />
        {vorschau && (
          <div style={{ ...s.box, borderColor: vorschau.ergebnis === 'faellig' ? C.warn : C.border }}>
            <b style={{ color: vorschau.ergebnis === 'faellig' ? C.warn : C.text }}>{AUSFALL_LABEL[vorschau.ergebnis]}</b>
            <div style={{ marginTop: 4 }}>{vorschau.text}</div>
            {vorschau.hinweise.length > 0 && <ul style={s.liste}>{vorschau.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
          </div>
        )}
        <div><button style={s.primaer} onClick={() => void speichern()}>Ausfall speichern</button></div>
      </div>

      {p.ausfaelle.map((a) => (
        <div key={a.id} style={s.zeile}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700 }}>{p.name(a.kunde_id)} · {dtDe(a.termin_am)}</div>
            <div style={s.klein}>
              {AUSFALL_LABEL[(a.ergebnis as AusfallErgebnis)] ?? a.ergebnis ?? '—'}{a.betrag != null ? ` · ${eur(a.betrag)}` : ''} · Status: {a.status}
              {a.abgesagt_am ? ` · abgesagt ${dtDe(a.abgesagt_am)}` : ''}{a.notiz ? ` · ${a.notiz}` : ''}
            </div>
          </div>
          {a.ergebnis === 'faellig' && (
            <div style={s.knoepfe}>
              <button style={s.mini} onClick={() => schreiben(a)}>📄 Zahlungsaufforderung</button>
              {p.istChef && a.status !== 'gefordert' && <button style={s.mini} onClick={() => void status(a, 'gefordert')}>gefordert</button>}
              {p.istChef && a.status !== 'bezahlt' && <button style={s.mini} onClick={() => void status(a, 'bezahlt')}>bezahlt</button>}
              {p.istChef && a.status !== 'erlassen' && <button style={s.mini} onClick={() => void status(a, 'erlassen')}>erlassen</button>}
            </div>
          )}
        </div>
      ))}

      {brief && (
        <div style={s.hinter} onClick={() => setBrief(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <b>Zahlungsaufforderung (Muster)</b>
            <div style={s.hint}>Bitte [Zahlungsziel] und [Bankverbindung] ersetzen. Umsatzsteuer mit der Steuerberatung klären. Mustertext — vor dem ersten Einsatz anwaltlich prüfen lassen.</div>
            <textarea style={{ ...s.inp, minHeight: 260, width: '100%' }} value={brief.text} onChange={(e) => setBrief({ ...brief, text: e.target.value })} />
            <div style={s.knoepfe}>
              <button style={s.mini} onClick={() => { try { void navigator.clipboard.writeText(brief.text); } catch { /* egal */ } }}>📋 Kopieren</button>
              {brief.email && !/\[[^\]]+\]/.test(brief.text) && <a style={s.mini} href={`mailto:${encodeURIComponent(brief.email)}?subject=${encodeURIComponent('Ausfallhonorar')}&body=${encodeURIComponent(brief.text)}`}>✉ E-Mail</a>}
              {/\[[^\]]+\]/.test(brief.text) && <span style={{ ...s.klein, color: C.warn }}>E-Mail erst ohne offene [Platzhalter].</span>}
              <button style={s.mini} onClick={() => setBrief(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Einwilligungen
// ---------------------------------------------------------------------------

function EinwilligungTab(p: { kunde: Kunde; einw: Einw[]; firma: string; istChef: boolean; laden: () => Promise<void>; meldung: (o: string | null, f?: string | null) => void }) {
  const [art, setArt] = useState<EinwilligungArt | null>(null);

  async function widerruf(a: EinwilligungArt) {
    if (!window.confirm('Widerruf erfassen? Die bisherige Einwilligung bleibt als Nachweis erhalten, gilt aber ab jetzt nicht mehr.')) return;
    const { error } = await supabase.from('praxis_einwilligung').insert({ kunde_id: p.kunde.id, art: a, widerruf: true, version: EINWILLIGUNG_VERSION, text_kopie: 'Widerruf erfasst.' });
    if (error) { p.meldung(null, 'Widerruf konnte nicht gespeichert werden.'); return; }
    p.meldung('Widerruf gespeichert.'); await p.laden();
  }

  async function ansehen(id: string) {
    const { data } = await supabase.from('praxis_einwilligung').select('art, text_kopie, name_unterschrift, unterschrift, erteilt_am').eq('id', id).maybeSingle();
    const z = data as { art: string; text_kopie: string | null; name_unterschrift: string | null; unterschrift: string | null; erteilt_am: string } | null;
    if (!z) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const titel = EINWILLIGUNGEN.find((e) => e.key === z.art)?.label ?? z.art;
    const bild = z.unterschrift && unterschriftGueltig(z.unterschrift) ? `<img src="${z.unterschrift}" style="height:90px;border-bottom:1px solid #999">` : '';
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title></head><body style="font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#111;line-height:1.55">
      <div style="font-size:13px;color:#555">${esc(p.firma)}</div><h2>${esc(titel)}</h2><p><b>${esc(p.kunde.name)}</b></p>
      <p>${esc(z.text_kopie ?? '')}</p><p>${bild}<br>${esc(z.name_unterschrift ?? '')} · ${esc(dtDe(z.erteilt_am))}</p>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  return (
    <>
      <div style={s.card}>
        <b>Einwilligungen von {p.kunde.name}</b>
        <div style={s.hint}>Mustertexte — vor dem ersten Einsatz anwaltlich prüfen lassen. Eine Einwilligung wird nie geändert: ein Widerruf ist ein neuer Eintrag, die alte Unterschrift bleibt als Nachweis.</div>
        {EINWILLIGUNGEN.map((e) => {
          const st = einwilligungStand(p.einw, p.kunde.id, e.key);
          const farbe = st.status === 'aktiv' ? C.green : st.status === 'widerrufen' ? C.danger : C.textDim;
          const z = st.zeile as Einw | null;
          return (
            <div key={e.key} style={s.zeile}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{e.label} <span style={{ ...s.chip, color: farbe, borderColor: farbe }}>{st.status === 'aktiv' ? `erteilt ${datumDe(berlinTag(z?.erteilt_am))}` : st.status === 'widerrufen' ? `widerrufen ${datumDe(berlinTag(z?.erteilt_am))}` : 'fehlt'}</span></div>
                <div style={s.klein}>{e.kurz}</div>
                {st.status === 'aktiv' && e.key === 'recall' && <div style={s.klein}>Wege: {(z?.daten?.kanaele ?? []).join(', ')}</div>}
                {st.status === 'aktiv' && e.key === 'ausfall' && <div style={s.klein}>Frist {z?.daten?.frist_stunden} Std. · {eur(z?.daten?.betrag)}</div>}
                {st.status === 'aktiv' && e.key === 'weitergabe' && <div style={s.klein}>an {z?.daten?.empfaenger}</div>}
              </div>
              <div style={s.knoepfe}>
                <button style={s.mini} onClick={() => setArt(e.key)}>{st.status === 'aktiv' ? 'Neu unterschreiben' : 'Aufnehmen'}</button>
                {st.status === 'aktiv' && <button style={s.mini} onClick={() => void widerruf(e.key)}>Widerruf</button>}
                {st.status === 'aktiv' && z && <button style={s.mini} onClick={() => void ansehen(z.id)}>📄 Drucken</button>}
              </div>
            </div>
          );
        })}
      </div>
      {art && <Unterschreiben art={art} kunde={p.kunde} firma={p.firma} onZu={() => setArt(null)} onFertig={async () => { setArt(null); p.meldung('Einwilligung gespeichert.'); await p.laden(); }} />}
    </>
  );
}

function Unterschreiben(p: { art: EinwilligungArt; kunde: Kunde; firma: string; onZu: () => void; onFertig: () => Promise<void> }) {
  const [daten, setDaten] = useState<EinwilligungDaten>(p.art === 'ausfall' ? { frist_stunden: 24 } : p.art === 'recall' ? { kanaele: ['email'] } : {});
  const [betrag, setBetrag] = useState('');
  const [nameU, setNameU] = useState(p.kunde.name);
  const [fehler, setFehler] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const hatStrich = useRef(false);
  const d: EinwilligungDaten = p.art === 'ausfall' ? { ...daten, betrag: zahl(betrag) ?? undefined } : daten;
  const text = einwilligungText(p.art, p.firma, d);
  const info = EINWILLIGUNGEN.find((e) => e.key === p.art);

  function punkt(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current?.getContext('2d'); const q = punkt(e); if (!ctx || !q) return;
    zeichnet.current = true; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0A1628'; ctx.beginPath(); ctx.moveTo(q.x, q.y);
  }
  function zug(e: PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return;
    const ctx = canvas.current?.getContext('2d'); const q = punkt(e); if (!ctx || !q) return;
    ctx.lineTo(q.x, q.y); ctx.stroke(); hatStrich.current = true;
  }
  function leeren() {
    const c = canvas.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); hatStrich.current = false;
  }
  useEffect(() => { setTimeout(leeren, 0); }, []);

  async function speichern() {
    const bild = hatStrich.current ? canvas.current?.toDataURL('image/png') ?? '' : '';
    const f = pruefeEinwilligung({ art: p.art, name: nameU, unterschrift: bild, daten: d });
    if (/\[[^\]]+\]/.test(text)) f.push('Im Text sind noch [Platzhalter] offen — bitte den Firmennamen im Profil hinterlegen bzw. die Felder ausfüllen.');
    setFehler(f);
    if (f.length) return;
    const { error } = await supabase.from('praxis_einwilligung').insert({
      kunde_id: p.kunde.id, art: p.art, version: EINWILLIGUNG_VERSION, text_kopie: text, daten: d,
      name_unterschrift: nameU.trim().slice(0, 120), unterschrift: bild,
    });
    if (error) { setFehler(['Speichern fehlgeschlagen.']); return; }
    await p.onFertig();
  }

  return (
    <div style={s.hinter} onClick={p.onZu}>
      <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}><b style={{ fontSize: 17 }}>✍ {info?.label}</b><span style={{ flex: 1 }} /><button style={s.mini} onClick={p.onZu}>✕</button></div>
        {p.art === 'recall' && (
          <div style={s.row}>
            {KANAELE.map((k) => (
              <label key={k.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={(daten.kanaele ?? []).includes(k.key)} onChange={(e) => {
                  const alt = daten.kanaele ?? [];
                  setDaten({ ...daten, kanaele: e.target.checked ? [...alt, k.key] : alt.filter((x) => x !== k.key) });
                }} /> {k.label}
              </label>
            ))}
          </div>
        )}
        {p.art === 'ausfall' && (
          <div style={s.row}>
            <label style={s.lab}>Absagefrist (Stunden)<input style={{ ...s.inp, width: 90 }} inputMode="numeric" value={String(daten.frist_stunden ?? '')} onChange={(e) => setDaten({ ...daten, frist_stunden: zahl(e.target.value) ?? undefined })} /></label>
            <label style={s.lab}>Ausfallhonorar (€)<input style={{ ...s.inp, width: 110 }} inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="z. B. 45" /></label>
          </div>
        )}
        {p.art === 'weitergabe' && (
          <label style={s.lab}>Empfänger<input style={s.inp} value={daten.empfaenger ?? ''} onChange={(e) => setDaten({ ...daten, empfaenger: e.target.value.slice(0, 160) })} placeholder="z. B. Labor Muster GmbH" /></label>
        )}
        <div style={s.textbox}>{text}</div>
        <label style={s.lab}>Name der unterschreibenden Person<input style={s.inp} value={nameU} onChange={(e) => setNameU(e.target.value)} /></label>
        <canvas ref={canvas} width={600} height={200} style={{ width: '100%', height: 150, background: '#fff', borderRadius: 10, touchAction: 'none', marginTop: 8 }}
          onPointerDown={start} onPointerMove={zug} onPointerUp={() => { zeichnet.current = false; }} onPointerLeave={() => { zeichnet.current = false; }} />
        {fehler.length > 0 && <ul style={{ ...s.liste, color: C.danger }}>{fehler.map((f, i) => <li key={i}>{f}</li>)}</ul>}
        <div style={s.knoepfe}>
          <button style={s.primaer} onClick={() => void speichern()}>Unterschrift speichern</button>
          <button style={s.mini} onClick={leeren}>Neu</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gesundheitsangaben (H03)
// ---------------------------------------------------------------------------

function GesundheitTab(p: { kunde: Kunde | null; istChef: boolean; uid: string | null; laden: () => Promise<void>; meldung: (o: string | null, f?: string | null) => void }) {
  const [notizen, setNotizen] = useState<Notiz[] | null>(null);
  const [darfLoeschen, setDarfLoeschen] = useState(false);
  const [problem, setProblem] = useState<{ text: string; code?: string } | null>(null);
  const [neu, setNeu] = useState({ art: 'allergie', text: '' });
  const [laeuft, setLaeuft] = useState(false);
  const kid = p.kunde?.id ?? null;

  useEffect(() => { setNotizen(null); setProblem(null); }, [kid]);

  async function anzeigen() {
    if (!kid) return;
    setLaeuft(true); setProblem(null);
    try {
      const r = await fetch(`/api/gesundheit-notiz?kunde=${kid}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setProblem({ text: j?.error || 'Laden fehlgeschlagen.', code: j?.code }); setNotizen(null); return; }
      setNotizen(j.notizen as Notiz[]); setDarfLoeschen(!!j.darf_loeschen);
    } catch { setProblem({ text: 'Verbindung fehlgeschlagen.' }); }
    finally { setLaeuft(false); }
  }

  async function anlegen(text: string, art: string): Promise<boolean> {
    if (!kid) return false;
    const r = await fetch('/api/gesundheit-notiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kunde_id: kid, art, text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setProblem({ text: j?.error || 'Speichern fehlgeschlagen.', code: j?.code }); return false; }
    return true;
  }

  async function speichern() {
    if (!neu.text.trim()) return;
    setLaeuft(true);
    const gut = await anlegen(neu.text.trim(), neu.art);
    setLaeuft(false);
    if (gut) { setNeu({ art: neu.art, text: '' }); p.meldung('Geschützt gespeichert.'); await anzeigen(); }
  }

  async function loeschen(n: Notiz) {
    if (!window.confirm('Diese Angabe endgültig löschen? Der Vorgang wird protokolliert.')) return;
    const r = await fetch(`/api/gesundheit-notiz?id=${n.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setProblem({ text: j?.error || 'Löschen fehlgeschlagen.' }); return; }
    await anzeigen();
  }

  async function uebernehmen() {
    if (!p.kunde?.hinweise) return;
    if (!window.confirm('Den Hinweis aus der Kundenkartei in die geschützte Ablage übernehmen und dort in der Kartei löschen?')) return;
    if (!(await anlegen(p.kunde.hinweise, 'hinweis'))) return;
    const { error } = await supabase.from('wellness_kunden').update({ hinweise: null }).eq('id', p.kunde.id);
    if (error) { p.meldung(null, 'Übernommen, aber in der Kartei nicht gelöscht — bitte dort von Hand entfernen.'); }
    else p.meldung('Hinweis in die geschützte Ablage übernommen.');
    await p.laden(); await anzeigen();
  }

  return (
    <>
      <div style={s.box}>
        🔒 Gesundheitsangaben liegen getrennt von der Kundenkartei und verschlüsselt. Lesbar werden sie nur hier — jeder Zugriff wird mit Person und Uhrzeit protokolliert.
        Sehen dürfen sie der Inhaber und Mitarbeiter, die er ausdrücklich freigibt. Voraussetzung: Einwilligung „Gesundheitsangaben speichern".
      </div>
      {p.istChef && <Freigaben meldung={p.meldung} />}
      {!p.kunde && <div style={s.dim}>Bitte oben einen Kunden wählen.</div>}
      {p.kunde && (
        <div style={s.card}>
          <b>{p.kunde.name}</b>
          {p.istChef && p.kunde.hinweise && (
            <div style={{ ...s.box, borderColor: C.warn }}>
              In der Kundenkartei steht ungeschützt: „{p.kunde.hinweise}". Falls das Gesundheitsangaben sind (z. B. Allergien), gehören sie hierher.
              <div><button style={s.mini} onClick={() => void uebernehmen()}>In geschützte Ablage übernehmen</button></div>
            </div>
          )}
          {notizen === null ? (
            <div><button style={s.primaer} disabled={laeuft} onClick={() => void anzeigen()}>{laeuft ? 'Lädt …' : 'Angaben anzeigen (wird protokolliert)'}</button></div>
          ) : (
            <>
              {notizen.length === 0 && <div style={s.dim}>Keine Angaben gespeichert.</div>}
              {notizen.map((n) => (
                <div key={n.id} style={s.zeile}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{NOTIZ_ARTEN.find((a) => a.key === n.art)?.label ?? n.art}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.unlesbar ? <span style={{ color: C.danger }}>Nicht lesbar (Schlüssel passt nicht oder Eintrag verändert).</span> : n.text}</div>
                    <div style={s.klein}>{dtDe(n.erstellt_am)}{n.von_mir ? ' · von Ihnen' : ''}</div>
                  </div>
                  {darfLoeschen && <button style={s.mini} onClick={() => void loeschen(n)}>Löschen</button>}
                </div>
              ))}
              <div style={s.row}>
                <select style={s.inp} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>
                  {NOTIZ_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
                <input style={{ ...s.inp, flex: 1, minWidth: 200 }} maxLength={NOTIZ_MAX} value={neu.text} onChange={(e) => setNeu({ ...neu, text: e.target.value })} placeholder="z. B. Latex-Allergie — keine Latexhandschuhe" />
                <button style={s.primaer} disabled={laeuft || !neu.text.trim()} onClick={() => void speichern()}>Geschützt speichern</button>
              </div>
              <div style={s.hint}>Nur was der Kunde selbst mitteilt und was für die Behandlung beachtet werden muss. Keine Befunde oder Diagnosen. Einträge werden nicht geändert — zum Korrigieren einen neuen Eintrag anlegen.</div>
            </>
          )}
          {problem && (
            <div style={s.err}>
              {problem.text}
              {problem.code === 'kein_schluessel' && p.istChef && <div style={{ marginTop: 6 }}>Einmalig einrichten: in Vercel unter Settings → Environment Variables den Wert GESUNDHEIT_SCHLUESSEL hinterlegen (Anleitung im Übergabe-Dokument). Den Schlüssel sicher aufbewahren — ohne ihn sind die Angaben nicht mehr lesbar.</div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Freigaben({ meldung }: { meldung: (o: string | null, f?: string | null) => void }) {
  const [ma, setMa] = useState<MA[]>([]);
  const [frei, setFrei] = useState<Array<{ id: string; auth_user_id: string }>>([]);
  const [offen, setOffen] = useState(false);
  const laden = useCallback(async () => {
    const [m, f] = await Promise.all([
      supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname, status'),
      supabase.from('gesundheit_freigabe').select('id, auth_user_id'),
    ]);
    const inaktiv = ['inaktiv', 'ausgeschieden', 'archiviert', 'gekuendigt'];
    setMa(((m.data as Array<{ auth_user_id: string | null; vorname: string | null; nachname: string | null; status: string | null }>) ?? [])
      .filter((x) => x.auth_user_id && !inaktiv.includes(String(x.status || 'aktiv').toLowerCase()))
      .map((x) => ({ auth_user_id: x.auth_user_id as string, name: `${x.vorname || ''} ${x.nachname || ''}`.trim() || 'Ohne Namen' })));
    setFrei((f.data as Array<{ id: string; auth_user_id: string }>) ?? []);
  }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);

  async function umschalten(m: MA) {
    const f = frei.find((x) => x.auth_user_id === m.auth_user_id);
    const { error } = f
      ? await supabase.from('gesundheit_freigabe').delete().eq('id', f.id)
      : await supabase.from('gesundheit_freigabe').insert({ auth_user_id: m.auth_user_id, name: m.name });
    if (error) { meldung(null, 'Freigabe konnte nicht geändert werden.'); return; }
    await laden();
  }

  return (
    <div style={s.card}>
      <button style={{ ...s.mini, alignSelf: 'flex-start' }} onClick={() => setOffen(!offen)}>{offen ? '▾' : '▸'} Wer darf Gesundheitsangaben sehen?</button>
      {offen && (
        <>
          {ma.length === 0 && <div style={s.dim}>Keine Mitarbeiter mit eigenem Login.</div>}
          {ma.map((m) => {
            const an = frei.some((x) => x.auth_user_id === m.auth_user_id);
            return (
              <label key={m.auth_user_id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={an} onChange={() => void umschalten(m)} /> {m.name}
              </label>
            );
          })}
          <div style={s.hint}>Nur freigeben, wer die Angaben für die Behandlung braucht. Mitarbeiter können lesen und neue Angaben anlegen, aber nichts löschen.</div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Werbe-Prüfer (H02)
// ---------------------------------------------------------------------------

function HwgTab() {
  const [text, setText] = useState('');
  const e = useMemo(() => pruefeHwg(text), [text]);
  const farbe = e.ampel === 'rot' ? C.danger : e.ampel === 'gelb' ? C.warn : C.green;
  return (
    <div style={s.card}>
      <b>Werbetext auf das Heilmittelwerbegesetz prüfen</b>
      <div style={s.hint}>Für Website, Social Media, Flyer und Newsletter. Die Prüfung läuft sofort im Browser und kostet nichts. Die Text-Werkstatt prüft Gesundheitstexte automatisch mit.</div>
      <textarea style={{ ...s.inp, minHeight: 160 }} value={text} onChange={(x) => setText(x.target.value)} placeholder="Werbetext hier einfügen …" />
      {text.trim() && (
        <div style={{ ...s.box, borderColor: farbe }}>
          <b style={{ color: farbe }}>
            {!e.betroffen ? 'Kein Gesundheitsbezug erkannt — das Heilmittelwerbegesetz greift hier voraussichtlich nicht.'
              : e.ampel === 'gruen' ? 'Keine heiklen Stellen gefunden.' : `${e.treffer.length} Stelle(n) prüfen`}
          </b>
          {e.treffer.map((t) => (
            <div key={t.id} style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: t.schwere === 'rot' ? C.danger : C.warn }}>{t.schwere === 'rot' ? '⛔' : '⚠'} {t.titel} <span style={s.klein}>({t.paragraf})</span></div>
              <div style={s.klein}>Fundstelle: „{t.stelle}"</div>
              <div style={{ fontSize: 14, marginTop: 3 }}>{t.erklaerung}</div>
              <div style={{ fontSize: 14, marginTop: 3, color: C.green }}>Besser: {t.vorschlag}</div>
            </div>
          ))}
        </div>
      )}
      <div style={s.hint}>Hilfe zur Selbstkontrolle, keine Rechtsberatung (Stand {HWG_STAND}). Im Zweifel anwaltlich prüfen lassen.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zugriffsprotokoll (nur Inhaber)
// ---------------------------------------------------------------------------

function ProtokollTab({ uid, name }: { uid: string | null; name: (id: string) => string }) {
  const [zeilen, setZeilen] = useState<Array<{ id: string; user_id: string; kunde_id: string; aktion: string; anzahl: number; zeit: string }>>([]);
  const [personen, setPersonen] = useState<Record<string, string>>({});
  const [fehlt, setFehlt] = useState(false);
  useEffect(() => {
    (async () => {
      const [z, m] = await Promise.all([
        supabase.from('gesundheit_zugriff').select('id, user_id, kunde_id, aktion, anzahl, zeit').order('zeit', { ascending: false }).limit(300),
        supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname'),
      ]);
      setFehlt(!!z.error);
      setZeilen((z.data as typeof zeilen) ?? []);
      const map: Record<string, string> = {};
      for (const x of (m.data as Array<{ auth_user_id: string | null; vorname: string | null; nachname: string | null }>) ?? []) {
        if (x.auth_user_id) map[x.auth_user_id] = `${x.vorname || ''} ${x.nachname || ''}`.trim();
      }
      setPersonen(map);
    })();
  }, []);
  const AKTION: Record<string, string> = { lesen: 'angesehen', anlegen: 'angelegt', loeschen: 'gelöscht' };
  return (
    <div style={s.card}>
      <b>Zugriffsprotokoll Gesundheitsangaben</b>
      <div style={s.hint}>Jeder Zugriff steht hier — niemand kann Einträge ändern oder löschen, auch der Inhaber nicht. Die letzten 300 Zugriffe.</div>
      {fehlt && <div style={s.err}>Protokoll nicht verfügbar (SQL von Paket PQ fehlt).</div>}
      {!fehlt && zeilen.length === 0 && <div style={s.dim}>Noch keine Zugriffe.</div>}
      {zeilen.map((z) => (
        <div key={z.id} style={s.posZeile}>
          <span style={{ minWidth: 130 }}>{dtDe(z.zeit)}</span>
          <span style={{ minWidth: 140 }}>{z.user_id === uid ? 'Inhaber' : personen[z.user_id] || 'Mitarbeiter'}</span>
          <span style={{ flex: 1 }}>{name(z.kunde_id)} · {AKTION[z.aktion] ?? z.aktion}{z.aktion === 'lesen' ? ` (${z.anzahl} Einträge)` : ''}</span>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1060, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13.5, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAktiv: { borderColor: C.gold, color: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  knoepfe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 8 },
  chip: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '1px 9px', fontSize: 11.5, fontWeight: 700, marginLeft: 6 },
  klein: { color: C.textDim, fontSize: 13, marginTop: 2 },
  hint: { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 },
  box: { background: 'rgba(0,229,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, lineHeight: 1.5, marginTop: 10 },
  textbox: { background: '#fff', color: '#111', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.55, marginTop: 10 },
  liste: { margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderLeft: '3px solid', borderRadius: 12, padding: '12px 16px' },
  kpiL: { color: C.textDim, fontSize: 13, fontWeight: 600 },
  kpiW: { fontSize: 26, fontWeight: 800, marginTop: 4 },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14, flexWrap: 'wrap' },
  hinter: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
