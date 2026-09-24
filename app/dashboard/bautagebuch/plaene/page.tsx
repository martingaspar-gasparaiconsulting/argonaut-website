'use client';

// ============================================================
// ARGONAUT OS · Pläne mit Mängel-Pins + Foto-KI (Paket PK, B22 + B27)
// Plan je Baustelle hochladen (Foto oder Bild des Plans), auf den Plan tippen,
// Pin setzen: Mangel, Schaden, Hinweis oder Aufmaß-Stelle — mit Foto vorher
// und nachher, Gewerk, Frist, Zuständigkeit. Neue Plan-Version übernimmt die
// offenen Pins. Mängelliste als PDF. Foto-KI schlägt Titel, Beschreibung und
// Gewerk vor — nie Maße oder Preise; der Mensch entscheidet.
//
// Unterpfad von /dashboard/bautagebuch (erbt dessen Freigabe). Monteure
// sehen die Pläne des Betriebs, setzen Pins und melden "behoben"; abnehmen
// und löschen kann nur der Chef (RLS + Speicher: supabase-sql/pk-bau-plaene.sql).
// Logik: lib/bauPlan.ts (getestet).
//
// Pfad: app/dashboard/bautagebuch/plaene/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties, ChangeEvent, MouseEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verkleinereBild } from '@/lib/bildKlein';
import { heuteIso } from '@/lib/nachweisMotor';
import {
  PIN_ARTEN, PIN_STATUS, GEWERKE, pinArt, pinStatus, naechsterStatus, klickZuLage, leseLage, naechstePinNummer,
  speicherPfad, istUeberfaellig, pinZahlen, sortierePins, pinsFuerNeueVersion, maengelListeText, datumDe,
  type FotoVorschlag,
} from '@/lib/bauPlan';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const BUCKET = 'bau-plaene';

type Projekt = { id: string; name: string | null };
type Plan = { id: string; owner_user_id: string; projekt_id: string | null; titel: string; version: number; vorgaenger_id: string | null; datei_pfad: string; breite: number | null; hoehe: number | null; aktiv: boolean; erstellt_am: string };
type Pin = {
  id: string; plan_id: string; nummer: number; x: number; y: number; titel: string; art: string; status: string;
  gewerk: string | null; frist: string | null; zustaendig: string | null; beschreibung: string | null;
  foto_pfad: string | null; foto_nachher_pfad: string | null; erstellt_am: string;
};
type PinForm = {
  id: string | null; x: number; y: number; titel: string; art: string; gewerk: string; frist: string; zustaendig: string; beschreibung: string;
  foto: Blob | null; fotoName: string; fotoVorschau: string | null;
};

function base64Von(blob: Blob): Promise<string> {
  return new Promise((ja, nein) => {
    const r = new FileReader();
    r.onload = () => ja(String(r.result).split(',')[1] || '');
    r.onerror = () => nein(new Error('lesen'));
    r.readAsDataURL(blob);
  });
}

export default function PlaeneSeite() {
  const heute = heuteIso(new Date());
  const [uid, setUid] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [projektId, setProjektId] = useState('');
  const [plaene, setPlaene] = useState<Plan[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [auswahl, setAuswahl] = useState<Pin | null>(null);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [setzen, setSetzen] = useState(false);
  const [nurOffene, setNurOffene] = useState(true);
  const [form, setForm] = useState<PinForm | null>(null);
  const [neuerPlan, setNeuerPlan] = useState<{ titel: string; datei: File | null; alsVersion: boolean } | null>(null);
  const [ki, setKi] = useState<{ laeuft: boolean; vorschlag: FotoVorschlag | null }>({ laeuft: false, vorschlag: null });
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bildRef = useRef<HTMLImageElement | null>(null);

  // --- Laden -----------------------------------------------------------------
  const ladePlaene = useCallback(async (pid: string) => {
    let q = supabase.from('bau_plan').select('*').eq('aktiv', true).order('erstellt_am', { ascending: false });
    if (pid) q = q.eq('projekt_id', pid);
    const { data, error } = await q;
    if (error) {
      setFehler(/bau_plan/.test(error.message) ? 'Die Pläne sind noch nicht eingerichtet (SQL von Paket PK fehlt).' : 'Pläne konnten nicht geladen werden.');
      return;
    }
    setPlaene((data as Plan[]) ?? []);
  }, []);

  const ladePins = useCallback(async (planId: string) => {
    const { data } = await supabase.from('bau_plan_pin').select('*').eq('plan_id', planId).order('nummer', { ascending: true });
    setPins((data as Pin[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstMitarbeiter(!!chef && chef !== id);
      setBetrieb(chef || id);
      const { data: p } = await supabase.from('projekte').select('id, name').eq('archiviert', false);
      setProjekte((p as Projekt[]) ?? []);
      await ladePlaene('');
    })();
  }, [ladePlaene]);

  useEffect(() => { ladePlaene(projektId); }, [projektId, ladePlaene]);

  async function planOeffnen(p: Plan) {
    setPlan(p); setAuswahl(null); setSetzen(false); setPlanUrl(null); setOk(null); setFehler(null);
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.datei_pfad, 3600);
    setPlanUrl(data?.signedUrl ?? null);
    if (!data?.signedUrl) setFehler('Das Planbild konnte nicht geladen werden.');
    await ladePins(p.id);
  }

  // Fotos des gewählten Pins nachladen
  useEffect(() => {
    const pfade = [auswahl?.foto_pfad, auswahl?.foto_nachher_pfad].filter((x): x is string => !!x && !fotoUrls[x]);
    if (!pfade.length) return;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(pfade, 3600);
      const neu: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) neu[d.path] = d.signedUrl;
      setFotoUrls((alt) => ({ ...alt, ...neu }));
    })();
  }, [auswahl, fotoUrls]);

  const zahlen = useMemo(() => pinZahlen(pins, heute), [pins, heute]);
  const liste = useMemo(() => sortierePins(nurOffene ? pins.filter((p) => p.status !== 'abgenommen') : pins, heute), [pins, nurOffene, heute]);
  const projektName = (id: string | null) => projekte.find((p) => p.id === id)?.name ?? null;

  // --- Plan hochladen ------------------------------------------------------
  async function planSpeichern() {
    if (!neuerPlan || !uid || !betrieb) return;
    if (!neuerPlan.datei) { setFehler('Bitte ein Bild des Plans wählen (JPG, PNG oder WebP).'); return; }
    const titel = (neuerPlan.alsVersion && plan ? plan.titel : neuerPlan.titel).trim();
    if (!titel) { setFehler('Bitte einen Titel angeben, z. B. „Grundriss EG".'); return; }
    setBusy(true); setFehler(null);
    try {
      const blob = await verkleinereBild(neuerPlan.datei, 3200, 0.9);
      const id = crypto.randomUUID();
      const pfad = speicherPfad(betrieb, 'plan', id, blob.type);
      if (!pfad) { setFehler('Dieses Format geht nicht. Bitte JPG, PNG oder WebP — einen PDF-Plan bitte vorher als Bild speichern oder abfotografieren.'); return; }
      let breite: number | null = null; let hoehe: number | null = null;
      try { const bmp = await createImageBitmap(blob); breite = bmp.width; hoehe = bmp.height; bmp.close?.(); } catch { /* ohne Maße */ }
      const up = await supabase.storage.from(BUCKET).upload(pfad, blob, { upsert: false, contentType: blob.type });
      if (up.error) { setFehler('Hochladen fehlgeschlagen.'); return; }
      const alt = neuerPlan.alsVersion ? plan : null;
      const zeile: Record<string, unknown> = {
        id, projekt_id: alt?.projekt_id ?? (projektId || null), titel, version: alt ? alt.version + 1 : 1, vorgaenger_id: alt?.id ?? null,
        datei_pfad: pfad, breite, hoehe, erstellt_von: uid,
      };
      if (!istMitarbeiter) zeile.owner_user_id = uid;
      const { error } = await supabase.from('bau_plan').insert(zeile);
      if (error) { setFehler('Plan konnte nicht gespeichert werden.'); await supabase.storage.from(BUCKET).remove([pfad]); return; }
      let meldung = alt ? `Version ${alt.version + 1} gespeichert.` : 'Plan gespeichert.';
      if (alt) {
        await supabase.from('bau_plan').update({ aktiv: false }).eq('id', alt.id);
        const ueb = pinsFuerNeueVersion(pins);
        if (ueb.pins.length) {
          const { error: e2 } = await supabase.from('bau_plan_pin').insert(ueb.pins.map((p) => ({
            plan_id: id, nummer: p.nummer, x: p.x, y: p.y, titel: p.titel || 'ohne Titel', art: p.art, status: p.status,
            gewerk: p.gewerk, frist: p.frist, zustaendig: p.zustaendig, beschreibung: p.beschreibung, owner_user_id: uid, erstellt_von: uid,
          })));
          meldung += e2 ? ' Die offenen Pins konnten NICHT übernommen werden — sie hängen weiter an der alten Version.' : ` ${ueb.hinweis}`;
        }
      }
      setNeuerPlan(null); setOk(meldung);
      await ladePlaene(projektId);
      const { data: neu } = await supabase.from('bau_plan').select('*').eq('id', id).maybeSingle();
      if (neu) await planOeffnen(neu as Plan);
    } finally { setBusy(false); }
  }

  // --- Pins ----------------------------------------------------------------
  function aufPlanGeklickt(e: MouseEvent<HTMLDivElement>) {
    if (!setzen || !bildRef.current) return;
    const lage = klickZuLage(e.clientX, e.clientY, bildRef.current.getBoundingClientRect());
    if (!lage) return;
    setSetzen(false);
    setKi({ laeuft: false, vorschlag: null });
    setForm({ id: null, x: lage.x, y: lage.y, titel: '', art: 'mangel', gewerk: '', frist: '', zustaendig: '', beschreibung: '', foto: null, fotoName: '', fotoVorschau: null });
  }

  function pinBearbeiten(p: Pin) {
    setKi({ laeuft: false, vorschlag: null });
    setForm({ id: p.id, x: p.x, y: p.y, titel: p.titel, art: p.art, gewerk: p.gewerk ?? '', frist: p.frist ?? '', zustaendig: p.zustaendig ?? '', beschreibung: p.beschreibung ?? '', foto: null, fotoName: '', fotoVorschau: null });
  }

  async function fotoGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !form) return;
    if (!f.type.startsWith('image/')) { setFehler('Bitte ein Foto wählen.'); return; }
    const klein = await verkleinereBild(f, 1800, 0.85);
    setForm({ ...form, foto: klein, fotoName: f.name, fotoVorschau: URL.createObjectURL(klein) });
    setKi({ laeuft: false, vorschlag: null });
  }

  async function fotoKi() {
    if (!form?.foto) return;
    setKi({ laeuft: true, vorschlag: null }); setFehler(null);
    try {
      const res = await fetch('/api/baustelle-foto-ki', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: await base64Von(form.foto), mediaType: form.foto.type, projekt: projektName(plan?.projekt_id ?? null), plan: plan?.titel, notiz: form.beschreibung }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) { setFehler(j?.error || 'Die Foto-KI ist gerade nicht erreichbar.'); setKi({ laeuft: false, vorschlag: null }); return; }
      const v = j.vorschlag as FotoVorschlag;
      setKi({ laeuft: false, vorschlag: v });
    } catch {
      setFehler('Die Foto-KI ist gerade nicht erreichbar.'); setKi({ laeuft: false, vorschlag: null });
    }
  }

  function vorschlagUebernehmen() {
    const v = ki.vorschlag;
    if (!v || !form) return;
    const extra = [v.massnahme ? `Vorschlag: ${v.massnahme}` : null, v.schwere ? `Einschätzung: ${v.schwere}` : null].filter(Boolean).join('\n');
    setForm({
      ...form, art: v.art, titel: v.titel, gewerk: v.gewerk ?? form.gewerk,
      beschreibung: [form.beschreibung.trim(), v.beschreibung, extra].filter(Boolean).join('\n'),
    });
  }

  async function pinSpeichern() {
    if (!form || !plan || !uid || !betrieb) return;
    if (!form.titel.trim()) { setFehler('Bitte einen kurzen Titel angeben.'); return; }
    setBusy(true); setFehler(null);
    try {
      const id = form.id ?? crypto.randomUUID();
      let fotoPfad: string | null = null;
      if (form.foto) {
        fotoPfad = speicherPfad(betrieb, 'pin', id, form.foto.type, 'vorher-' + Date.now());
        if (!fotoPfad) { setFehler('Dieses Fotoformat geht nicht (JPG, PNG oder WebP).'); return; }
        const up = await supabase.storage.from(BUCKET).upload(fotoPfad, form.foto, { upsert: false, contentType: form.foto.type });
        if (up.error) { setFehler('Foto konnte nicht hochgeladen werden.'); return; }
      }
      const daten: Record<string, unknown> = {
        titel: form.titel.trim().slice(0, 200), art: form.art, gewerk: form.gewerk || null, frist: form.frist || null,
        zustaendig: form.zustaendig.trim() || null, beschreibung: form.beschreibung.trim().slice(0, 3000) || null,
        aktualisiert_am: new Date().toISOString(),
        ...(fotoPfad ? { foto_pfad: fotoPfad } : {}),
      };
      if (form.id) {
        const { error } = await supabase.from('bau_plan_pin').update(daten).eq('id', form.id);
        if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      } else {
        const zeile: Record<string, unknown> = { ...daten, id, plan_id: plan.id, nummer: naechstePinNummer(pins.map((p) => p.nummer)), x: form.x, y: form.y, erstellt_von: uid };
        if (!istMitarbeiter) zeile.owner_user_id = uid;
        const { error } = await supabase.from('bau_plan_pin').insert(zeile);
        if (error) { setFehler('Pin konnte nicht gespeichert werden.'); if (fotoPfad) await supabase.storage.from(BUCKET).remove([fotoPfad]); return; }
      }
      setForm(null); setOk('Pin gespeichert.');
      await ladePins(plan.id);
    } finally { setBusy(false); }
  }

  async function statusWeiter(p: Pin) {
    const n = naechsterStatus(p.status, istMitarbeiter);
    if (!n) return;
    const patch: Record<string, unknown> = { status: n, aktualisiert_am: new Date().toISOString() };
    if (n === 'behoben') patch.erledigt_am = new Date().toISOString();
    const { error } = await supabase.from('bau_plan_pin').update(patch).eq('id', p.id);
    if (error) { setFehler('Status konnte nicht geändert werden.'); return; }
    setOk(`Nr. ${p.nummer}: ${pinStatus(n)?.label}.`);
    if (plan) await ladePins(plan.id);
    setAuswahl((a) => (a && a.id === p.id ? { ...a, status: n } : a));
  }

  async function nachherFoto(p: Pin, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !betrieb) return;
    setBusy(true); setFehler(null);
    try {
      const klein = await verkleinereBild(f, 1800, 0.85);
      const pfad = speicherPfad(betrieb, 'pin', p.id, klein.type, 'nachher-' + Date.now());
      if (!pfad) { setFehler('Dieses Fotoformat geht nicht (JPG, PNG oder WebP).'); return; }
      const up = await supabase.storage.from(BUCKET).upload(pfad, klein, { upsert: false, contentType: klein.type });
      if (up.error) { setFehler('Foto konnte nicht hochgeladen werden.'); return; }
      const { error } = await supabase.from('bau_plan_pin').update({ foto_nachher_pfad: pfad, aktualisiert_am: new Date().toISOString() }).eq('id', p.id);
      if (error) { setFehler('Foto hochgeladen, aber nicht am Pin gespeichert.'); return; }
      setOk('Nachher-Foto gespeichert.');
      if (plan) await ladePins(plan.id);
      setAuswahl({ ...p, foto_nachher_pfad: pfad });
    } finally { setBusy(false); }
  }

  async function pinLoeschen(p: Pin) {
    if (!window.confirm(`Pin Nr. ${p.nummer} „${p.titel}" löschen? Die Nummer wird nicht neu vergeben.`)) return;
    const { error } = await supabase.from('bau_plan_pin').delete().eq('id', p.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    const weg = [p.foto_pfad, p.foto_nachher_pfad].filter((x): x is string => !!x);
    if (weg.length) await supabase.storage.from(BUCKET).remove(weg);
    setAuswahl(null);
    if (plan) await ladePins(plan.id);
  }

  async function alsPdf() {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await fetch('/api/text-motor/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: `Mängelliste – ${plan.titel} (Version ${plan.version})`,
          untertitel: projektName(plan.projekt_id) ?? '',
          kapitel: [{ titel: '', text: maengelListeText(pins, heute, nurOffene) }],
        }),
      });
      if (!res.ok) { setFehler('Das PDF konnte gerade nicht erzeugt werden.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'maengelliste.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally { setBusy(false); }
  }

  // --- Anzeige -------------------------------------------------------------
  return (
    <div style={s.page}>
      <a href="/dashboard/bautagebuch" style={s.zurueck}>← Bautagebuch</a>
      <h1 style={s.h1}>🗺 Pläne &amp; Mängel-Pins</h1>
      <p style={s.sub}>Plan hochladen, auf die Stelle tippen, Mangel mit Foto festhalten. Jeder sieht sofort, wo was offen ist — und wer es erledigt.</p>

      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.leiste}>
        <select style={s.inp} value={projektId} onChange={(e) => { setProjektId(e.target.value); setPlan(null); setPins([]); }}>
          <option value="">Alle Baustellen</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt ohne Name'}</option>)}
        </select>
        <button style={s.primaer} onClick={() => setNeuerPlan({ titel: '', datei: null, alsVersion: false })}>＋ Plan hochladen</button>
      </div>

      <div style={s.planListe}>
        {plaene.map((p) => (
          <button key={p.id} style={{ ...s.planKarte, borderColor: plan?.id === p.id ? C.gold : C.border }} onClick={() => planOeffnen(p)}>
            <div style={{ fontWeight: 800 }}>{p.titel}</div>
            <div style={s.dim}>Version {p.version}{projektName(p.projekt_id) ? ` · ${projektName(p.projekt_id)}` : ''} · {datumDe(p.erstellt_am.slice(0, 10))}</div>
          </button>
        ))}
        {!plaene.length && !fehler && <div style={s.dim}>Noch keine Pläne{projektId ? ' für diese Baustelle' : ''}. Tipp: Ein Foto vom Papierplan reicht.</div>}
      </div>

      {plan && (
        <div style={s.bereich}>
          <div style={s.planSpalte}>
            <div style={s.leiste}>
              <button style={{ ...s.primaer, background: setzen ? C.cyan : C.gold }} onClick={() => setSetzen(!setzen)}>{setzen ? '👆 Jetzt auf die Stelle tippen …' : '📍 Pin setzen'}</button>
              {!istMitarbeiter && <button style={s.klein} onClick={() => setNeuerPlan({ titel: plan.titel, datei: null, alsVersion: true })}>⬆ Neue Version</button>}
              <button style={s.klein} disabled={busy} onClick={alsPdf}>📄 Mängelliste PDF</button>
            </div>
            <div style={{ ...s.planRahmen, cursor: setzen ? 'crosshair' : 'default' }} onClick={aufPlanGeklickt}>
              {planUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={bildRef} src={planUrl} alt={plan.titel} style={{ width: '100%', display: 'block', userSelect: 'none' }} draggable={false} />
              ) : <div style={{ padding: 40, color: C.textDim }}>Plan wird geladen …</div>}
              {planUrl && pins.map((p) => {
                const lage = leseLage(p.x, p.y);
                if (!lage || (nurOffene && p.status === 'abgenommen')) return null;
                const farbe = istUeberfaellig(p, heute) ? C.danger : (pinStatus(p.status)?.farbe ?? C.textDim);
                return (
                  <button key={p.id} title={`${p.nummer}: ${p.titel}`}
                    onClick={(e) => { e.stopPropagation(); if (!setzen) setAuswahl(p); }}
                    style={{ ...s.pin, left: `${lage.x * 100}%`, top: `${lage.y * 100}%`, background: farbe, outline: auswahl?.id === p.id ? `3px solid ${C.gold}` : 'none' }}>
                    {p.nummer}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={s.seite}>
            <div style={s.kpis}>
              <div style={s.kpi}><b style={{ color: C.danger }}>{zahlen.offen}</b> offen</div>
              <div style={s.kpi}><b style={{ color: C.warn }}>{zahlen.inArbeit}</b> in Arbeit</div>
              <div style={s.kpi}><b style={{ color: C.cyan }}>{zahlen.wartetAufAbnahme}</b> zur Abnahme</div>
              <div style={s.kpi}><b style={{ color: zahlen.ueberfaellig ? C.danger : C.text }}>{zahlen.ueberfaellig}</b> überfällig</div>
            </div>
            {zahlen.jeGewerk.length > 0 && <div style={s.dim}>{zahlen.jeGewerk.map((g) => `${g.gewerk}: ${g.offen}`).join(' · ')}</div>}
            <label style={s.check}><input type="checkbox" checked={nurOffene} onChange={(e) => setNurOffene(e.target.checked)} /> Abgenommene ausblenden</label>

            {auswahl ? (
              <div style={s.detail}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...s.nr, background: pinStatus(auswahl.status)?.farbe }}>{auswahl.nummer}</span>
                  <div style={{ fontWeight: 800, flex: 1 }}>{auswahl.titel}</div>
                  <button style={s.klein} onClick={() => setAuswahl(null)}>✕</button>
                </div>
                <div style={s.dim}>{[pinArt(auswahl.art)?.label, pinStatus(auswahl.status)?.label, auswahl.gewerk, auswahl.frist ? `Frist ${datumDe(auswahl.frist)}${istUeberfaellig(auswahl, heute) ? ' (überfällig)' : ''}` : null, auswahl.zustaendig].filter(Boolean).join(' · ')}</div>
                {auswahl.beschreibung && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{auswahl.beschreibung}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {auswahl.foto_pfad && fotoUrls[auswahl.foto_pfad] && <a href={fotoUrls[auswahl.foto_pfad]} target="_blank" rel="noreferrer"><img src={fotoUrls[auswahl.foto_pfad]} alt="vorher" style={s.foto} /></a>}
                  {auswahl.foto_nachher_pfad && fotoUrls[auswahl.foto_nachher_pfad] && <a href={fotoUrls[auswahl.foto_nachher_pfad]} target="_blank" rel="noreferrer"><img src={fotoUrls[auswahl.foto_nachher_pfad]} alt="nachher" style={{ ...s.foto, borderColor: C.green }} /></a>}
                </div>
                <div style={s.leiste}>
                  {naechsterStatus(auswahl.status, istMitarbeiter) && (
                    <button style={s.primaer} onClick={() => statusWeiter(auswahl)}>→ {pinStatus(naechsterStatus(auswahl.status, istMitarbeiter))?.label}</button>
                  )}
                  {auswahl.status !== 'abgenommen' && (
                    <label style={s.klein}>📷 Nachher-Foto<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => nachherFoto(auswahl, e)} /></label>
                  )}
                  {(!istMitarbeiter || auswahl.status !== 'abgenommen') && <button style={s.klein} onClick={() => pinBearbeiten(auswahl)}>✏️</button>}
                  {!istMitarbeiter && <button style={{ ...s.klein, color: C.danger }} onClick={() => pinLoeschen(auswahl)}>🗑</button>}
                </div>
              </div>
            ) : (
              <div style={s.pinListe}>
                {liste.map((p) => (
                  <button key={p.id} style={s.pinZeile} onClick={() => setAuswahl(p)}>
                    <span style={{ ...s.nr, background: istUeberfaellig(p, heute) ? C.danger : pinStatus(p.status)?.farbe }}>{p.nummer}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700 }}>{pinArt(p.art)?.icon} {p.titel}</div>
                      <div style={s.dim}>{[pinStatus(p.status)?.label, p.gewerk, p.frist ? `Frist ${datumDe(p.frist)}` : null].filter(Boolean).join(' · ')}</div>
                    </span>
                  </button>
                ))}
                {!liste.length && <div style={s.dim}>Noch keine Pins. „📍 Pin setzen" und auf den Plan tippen.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Plan hochladen ---------- */}
      {neuerPlan && (
        <div style={s.schleier} onClick={() => setNeuerPlan(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{neuerPlan.alsVersion && plan ? `Neue Version von „${plan.titel}"` : 'Plan hochladen'}</div>
            {!neuerPlan.alsVersion && <label style={s.lab}>Titel<input style={s.inp} value={neuerPlan.titel} onChange={(e) => setNeuerPlan({ ...neuerPlan, titel: e.target.value })} placeholder="z. B. Grundriss EG" /></label>}
            {!neuerPlan.alsVersion && !projektId && <div style={{ ...s.dim, color: C.warn }}>Keine Baustelle gewählt — der Plan wird ohne Projekt gespeichert. Oben eine Baustelle wählen, um ihn zuzuordnen.</div>}
            <label style={s.lab}>Bild des Plans (JPG, PNG, WebP — ein Foto vom Papierplan reicht)
              <input type="file" accept="image/jpeg,image/png,image/webp" style={s.inp} onChange={(e) => setNeuerPlan({ ...neuerPlan, datei: e.target.files?.[0] ?? null })} />
            </label>
            {neuerPlan.alsVersion && <div style={s.dim}>Offene Pins werden mit Nummer und Lage übernommen. Die alte Version bleibt mit allen Fotos erhalten.</div>}
            <div style={s.leiste}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={planSpeichern}>⬆ Hochladen</button>
              <button style={s.klein} onClick={() => setNeuerPlan(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Pin anlegen / bearbeiten ---------- */}
      {form && (
        <div style={s.schleier} onClick={() => setForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{form.id ? 'Pin bearbeiten' : 'Neuer Pin'}</div>
            <div style={s.leiste}>
              <label style={s.klein}>📷 {form.fotoName ? form.fotoName.slice(0, 22) : 'Foto'}<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={fotoGewaehlt} /></label>
              {form.foto && <button style={s.klein} disabled={ki.laeuft} onClick={fotoKi}>{ki.laeuft ? '… wertet aus' : '🤖 Vorschlag aus dem Foto'}</button>}
            </div>
            {form.fotoVorschau && <img src={form.fotoVorschau} alt="Foto" style={{ ...s.foto, width: 160, height: 120 }} />}
            {ki.vorschlag && (
              <div style={s.kiBox}>
                <div style={{ fontWeight: 700 }}>Vorschlag: {pinArt(ki.vorschlag.art)?.label} · {ki.vorschlag.titel}</div>
                <div style={{ fontSize: 13.5 }}>{ki.vorschlag.beschreibung}</div>
                {ki.vorschlag.gewerk && <div style={s.dim}>Gewerk: {ki.vorschlag.gewerk}{ki.vorschlag.schwere ? ` · Einschätzung: ${ki.vorschlag.schwere}` : ''}</div>}
                {ki.vorschlag.massnahme && <div style={s.dim}>Maßnahme: {ki.vorschlag.massnahme}</div>}
                {ki.vorschlag.aufmass && <div style={s.dim}>Aufmaß-Position (Vorschlag, ohne Menge): {ki.vorschlag.aufmass.kurztext} · Einheit {ki.vorschlag.aufmass.einheit}</div>}
                {ki.vorschlag.hinweise.map((h, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>⚠️ {h}</div>)}
                <button style={{ ...s.klein, alignSelf: 'flex-start' }} onClick={vorschlagUebernehmen}>✔ Übernehmen und anpassen</button>
                <div style={{ ...s.dim, fontSize: 11.5 }}>Von einer KI erzeugt — bitte prüfen. Maße und Mengen immer aus dem Aufmaß.</div>
              </div>
            )}
            <label style={s.lab}>Titel<input style={s.inp} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} placeholder="z. B. Fuge Dusche offen" /></label>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Art<select style={s.inp} value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
                {PIN_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
              </select></label>
              <label style={{ ...s.lab, flex: 1 }}>Gewerk<select style={s.inp} value={form.gewerk} onChange={(e) => setForm({ ...form, gewerk: e.target.value })}>
                <option value="">—</option>{GEWERKE.map((g) => <option key={g} value={g}>{g}</option>)}
              </select></label>
            </div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Frist<input type="date" style={s.inp} value={form.frist} onChange={(e) => setForm({ ...form, frist: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Zuständig<input style={s.inp} value={form.zustaendig} onChange={(e) => setForm({ ...form, zustaendig: e.target.value })} placeholder="Person oder Firma" /></label>
            </div>
            <label style={s.lab}>Beschreibung<textarea style={{ ...s.inp, minHeight: 80 }} value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} /></label>
            <div style={s.leiste}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={pinSpeichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: '6px 0 0', maxWidth: 760 },
  leiste: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 },
  planListe: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  planKarte: { textAlign: 'left', background: C.navy2, border: '1px solid', borderRadius: 12, padding: '10px 14px', color: C.text, cursor: 'pointer', fontFamily: 'inherit', minWidth: 200 },
  bereich: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 8 },
  planSpalte: { flex: '3 1 560px', minWidth: 0 },
  planRahmen: { position: 'relative', marginTop: 10, background: '#fff', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` },
  pin: { position: 'absolute', transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', border: '2px solid #fff', color: '#0A1628', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.45)', padding: 0, fontFamily: 'inherit' },
  seite: { flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  kpis: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', fontSize: 13.5 },
  pinListe: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 620, overflowY: 'auto' },
  pinZeile: { display: 'flex', gap: 10, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', color: C.text, cursor: 'pointer', fontFamily: 'inherit' },
  nr: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 26, borderRadius: '50%', color: '#0A1628', fontWeight: 800, fontSize: 12.5 },
  detail: { background: C.navy2, border: `1px solid ${C.gold}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  foto: { width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: `2px solid ${C.border}` },
  kiBox: { background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 },
  dim: { color: C.textDim, fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.text, cursor: 'pointer' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 },
  schleier: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflowY: 'auto', zIndex: 50 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 10 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
