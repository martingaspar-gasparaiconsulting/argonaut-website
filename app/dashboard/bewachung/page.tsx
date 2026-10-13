'use client';

// ============================================================
// ARGONAUT OS · Paket 353 (13.10.2026) · A4b Fachpaket Bewachung, Teil 1
// Wachbuch und Kontrollgänge je Objekt (Objekte aus „Objektzeiten").
// Reiter: Kontrollgang (Handy: Rundgang beginnen, QR scannen oder Code
// tippen, beenden) · Wachbuch (nur anhängen, Korrektur als Nachtrag) ·
// Kontrollpunkte (QR-Aufkleber drucken) · Nachweis (für den Auftraggeber).
// Paket 354: Dienstplan je Objekt (Warnung bei fehlendem Nachweis) ·
// Betrieb & Nachweise (Erlaubnis § 34a GewO, Bewacherregister, Bewacher-ID).
// Logik: lib/bewachung.ts (tests/bewachungP353).
// Datenbank: supabase-sql/p353-bewachung-wachbuch.sql (Modul „bewachung").
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { uebersicht, angabenLesen, angabenVollstaendig, EINSTELLUNG_MODUL, type Kontrollpunkt, type Eintrag, type BetriebAngaben, type Quali } from '@/lib/bewachung';
import Leerzustand from '../_components/Leerzustand';
import { C, s, heute, Feld, schreiben, type Objekt } from './bewachungUi';
import Kontrollgang, { type RundgangZeile } from './Kontrollgang';
import Wachbuch from './Wachbuch';
import Kontrollpunkte from './Kontrollpunkte';
import Nachweis from './Nachweis';
import Dienstplan, { type Person, type Vorgabe } from './Dienstplan';
import BetriebNachweise from './BetriebNachweise';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Reiter = 'gang' | 'buch' | 'punkte' | 'plan' | 'nachweis' | 'betrieb';
const OBJEKT_SCHLUESSEL = 'argonaut_bewachung_objekt';

export default function BewachungPage() {
  const tag = heute();
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [punkte, setPunkte] = useState<Kontrollpunkt[]>([]);
  const [rundgaenge, setRundgaenge] = useState<RundgangZeile[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [objektId, setObjektId] = useState<string>('');
  const [uid, setUid] = useState<string | null>(null);
  const [ich, setIch] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('gang');
  const [neuObjekt, setNeuObjekt] = useState<{ bezeichnung: string; adresse: string } | null>(null);
  const [angaben, setAngaben] = useState<BetriebAngaben>(angabenLesen(null));
  const [personen, setPersonen] = useState<Person[]>([]);
  const [qualis, setQualis] = useState<(Quali & { id: string })[]>([]);
  const [vorgaben, setVorgaben] = useState<Vorgabe[]>([]);

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    setUid(me);
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : null;
    setIstChef(!chefId || chefId === me);
    setIch(chefId ?? me);
    const seit = new Date(Date.now() - 60 * 86400000).toISOString();
    const [o, p, r] = await Promise.all([
      supabase.from('objekte').select('id, bezeichnung, adresse, kennung').eq('archiviert', false).order('bezeichnung', { ascending: true }).limit(2000),
      supabase.from('wach_kontrollpunkt').select('id, objekt_id, name, hinweis, code, position, aktiv').order('position', { ascending: true }).limit(5000),
      supabase.from('wach_rundgang').select('id, objekt_id, mitarbeiter_user, mitarbeiter_name, gestartet_am, beendet_am, status, notiz').gte('gestartet_am', seit).order('gestartet_am', { ascending: false }).limit(2000),
    ]);
    if (p.error || r.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    const obj = o.error ? [] : (((o.data as unknown) as Objekt[]) ?? []);
    setObjekte(obj);
    setPunkte(((p.data as unknown) as Kontrollpunkt[]) ?? []);
    let rg = ((r.data as unknown) as RundgangZeile[]) ?? [];
    // Ein eigener laufender Rundgang, der älter als 60 Tage ist, gehört trotzdem auf die Seite
    const alt = await supabase.from('wach_rundgang').select('id, objekt_id, mitarbeiter_user, mitarbeiter_name, gestartet_am, beendet_am, status, notiz').eq('status', 'laeuft').lt('gestartet_am', seit).limit(200);
    if (!alt.error && alt.data?.length) rg = [...rg, ...(((alt.data as unknown) as RundgangZeile[]) ?? [])];
    setRundgaenge(rg);
    // Paket 354: Pflichtangaben, Wachpersonen, Nachweise, Objekt-Vorgaben (Fehler = leer, die Seite bleibt nutzbar)
    const [e, m, q, v] = await Promise.all([
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', chefId ?? me).eq('modul', EINSTELLUNG_MODUL).maybeSingle(),
      supabase.from('mitarbeiter').select('id, vorname, nachname, austrittsdatum').order('nachname', { ascending: true }).limit(2000),
      supabase.from('mitarbeiter_qualifikation').select('id, mitarbeiter_id, art, gueltig_bis, nachweis').limit(20000),
      supabase.from('wach_objekt_vorgabe').select('id, objekt_id, anforderungen, notiz').limit(5000),
    ]);
    setAngaben(angabenLesen(e.error ? null : (e.data as { einstellung?: unknown } | null)?.einstellung));
    const heuteTag = heute();
    const ma = m.error ? [] : (((m.data as unknown) as { id: string; vorname: string | null; nachname: string | null; austrittsdatum: string | null }[]) ?? []);
    setPersonen(ma.filter((x) => !x.austrittsdatum || x.austrittsdatum >= heuteTag)
      .map((x) => ({ id: x.id, name: [x.vorname, x.nachname].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ') || 'ohne Namen' })));
    setQualis(q.error ? [] : (((q.data as unknown) as (Quali & { id: string })[]) ?? []));
    setVorgaben(v.error ? [] : (((v.data as unknown) as Vorgabe[]) ?? []));
    setObjektId((vorher) => {
      if (vorher && obj.some((x) => x.id === vorher)) return vorher;
      const eigen = rg.find((x) => x.status === 'laeuft' && x.mitarbeiter_user === me);
      if (eigen && obj.some((x) => x.id === eigen.objekt_id)) return eigen.objekt_id;
      let gemerkt = '';
      try { gemerkt = window.localStorage.getItem(OBJEKT_SCHLUESSEL) ?? ''; } catch { gemerkt = ''; }
      return obj.some((x) => x.id === gemerkt) ? gemerkt : obj[0]?.id ?? '';
    });
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const buchLaden = useCallback(async () => {
    if (!objektId) { setEintraege([]); return; }
    const e = await supabase.from('wachbuch_eintrag').select('id, objekt_id, art, text, ereignis_am, bezug_id, rundgang_id, erfasst_am, erfasst_name')
      .eq('objekt_id', objektId).order('erfasst_am', { ascending: false }).limit(500);
    setEintraege(e.error ? [] : (((e.data as unknown) as Eintrag[]) ?? []));
  }, [objektId]);
  useEffect(() => { void buchLaden(); }, [buchLaden]);

  function objektWaehlen(id: string) {
    setObjektId(id); melde(null);
    try { window.localStorage.setItem(OBJEKT_SCHLUESSEL, id); } catch { /* ohne Speicher geht es auch */ }
  }

  async function objektAnlegen() {
    if (!neuObjekt || !neuObjekt.bezeichnung.trim()) { melde('Bitte eine Bezeichnung für das Objekt eintragen.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('objekte').insert({
        owner_user_id: ich, bezeichnung: neuObjekt.bezeichnung.trim().slice(0, 200), adresse: neuObjekt.adresse.trim() || null, typ: 'Standort', status: 'aktiv',
      }).select('id'), 'Das Objekt wurde nicht angelegt — Objekte legt an, wer das Recht „Objektzeiten" hat.');
      if (!r.ok) { melde(r.fehler); return; }
      const id = ((r.data as { id: string }[])[0])?.id;
      setNeuObjekt(null);
      melde(null, `Objekt „${neuObjekt.bezeichnung.trim()}" angelegt — jetzt Kontrollpunkte anlegen.`);
      await lade();
      if (id) { objektWaehlen(id); setReiter('punkte'); }
    } finally { setBusy(false); }
  }

  const neuLaden = async () => { await lade(); await buchLaden(); };

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Bewachung …</p></div>;

  const objekt = objekte.find((x) => x.id === objektId) ?? null;
  const ueb = uebersicht(rundgaenge, eintraege, tag);
  const meinLaufend = rundgaenge.find((r) => r.status === 'laeuft' && r.mitarbeiter_user === uid && r.objekt_id === objektId)?.id ?? null;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🛡️ Bewachung</h1>
      <p style={s.dim}>
        So geht&apos;s: Objekt wählen. Unter „Kontrollpunkte" die Stellen anlegen, die bei jedem Rundgang angelaufen werden, und die QR-Aufkleber
        ausdrucken. Beim „Kontrollgang" wird jeder Punkt mit dem Handy gescannt (oder der Code eingetippt) — die Uhrzeit setzt ARGONAUT. Ins „Wachbuch"
        kommen Meldungen, Vorkommnisse und Schichtübergaben; Einträge bleiben, wie sie sind, Korrekturen sind Nachträge. Der „Nachweis" fasst Rundgänge
        und Wachbuch für den Auftraggeber zusammen.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {!sqlFehlt && !laden && !angabenVollstaendig(angaben) && (
        <div style={s.fehler}>
          Pflichtangaben fehlen: Erlaubnis nach § 34a GewO und Registriernummer im Bewacherregister.{' '}
          <button style={s.mini} onClick={() => setReiter('betrieb')}>{istChef ? 'jetzt eintragen' : 'ansehen'}</button>
        </div>
      )}
      {sqlFehlt && <div style={s.hinweis}>Wachbuch und Kontrollgänge sind noch nicht eingerichtet (SQL Paket 353 fehlt) oder das Recht „Bewachung" fehlt.</div>}

      {!sqlFehlt && (<>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', margin: '12px 0' }}>
          {objekte.length > 0 && (
            <label style={{ ...s.feld, minWidth: 240 }}>Objekt
              <select style={{ ...s.input, fontSize: 15 }} value={objektId} onChange={(e) => objektWaehlen(e.target.value)}>
                {objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung ?? 'ohne Namen'}{o.kennung ? ` (${o.kennung})` : ''}</option>)}
              </select>
            </label>
          )}
          {!neuObjekt && <button style={s.btnAus} onClick={() => { setNeuObjekt({ bezeichnung: '', adresse: '' }); melde(null); }}>+ Objekt</button>}
        </div>

        {neuObjekt && (
          <div style={{ ...s.box, marginBottom: 12 }}>
            <b style={{ color: C.gold }}>Neues Objekt</b>
            <div style={{ ...s.raster, marginTop: 8 }}>
              <Feld label="Bezeichnung * (z. B. Lager Müller, Sindelfingen)" w={neuObjekt.bezeichnung} max={200} on={(x) => setNeuObjekt({ ...neuObjekt, bezeichnung: x })} />
              <Feld label="Adresse" w={neuObjekt.adresse} max={300} on={(x) => setNeuObjekt({ ...neuObjekt, adresse: x })} />
            </div>
            <p style={s.klein}>Das Objekt steht auch unter „Objektzeiten" — dort lassen sich Stunden erfassen und abrechnen.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={s.btnGold} disabled={busy} onClick={() => void objektAnlegen()}>Objekt anlegen</button>
              <button style={s.btnAus} onClick={() => setNeuObjekt(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {!objekte.length && !neuObjekt && (
          <Leerzustand icon="🛡️" titel="Noch kein Objekt"
            text="Bewacht wird je Objekt: jedes Objekt hat seine Kontrollpunkte, sein Wachbuch und seinen Nachweis."
            schritte={['„+ Objekt" — Bezeichnung und Adresse', 'Kontrollpunkte anlegen und QR-Aufkleber drucken', 'Rundgang beginnen und scannen']} />
        )}

        {objekt && (<>
          <div style={s.kacheln}>
            <div style={s.kachel}><div style={s.dim}>Rundgänge laufen (alle Objekte)</div><b style={s.zahl}>{ueb.laufend}</b></div>
            <div style={s.kachel}><div style={s.dim}>Rundgänge heute (alle Objekte)</div><b style={s.zahl}>{ueb.heuteRundgaenge}</b></div>
            <div style={s.kachel}><div style={s.dim}>Wachbuch heute (dieses Objekt)</div><b style={s.zahl}>{ueb.heuteEintraege}</b></div>
            <div style={s.kachel}><div style={s.dim}>Vorkommnisse, Schäden, Einsätze (7 Tage)</div><b style={{ ...s.zahl, color: ueb.vorkommnisse7 ? C.warn : C.text }}>{ueb.vorkommnisse7}</b></div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 12px' }}>
            <button style={reiter === 'gang' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('gang')}>🚶 Kontrollgang</button>
            <button style={reiter === 'buch' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('buch')}>📒 Wachbuch</button>
            <button style={reiter === 'punkte' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('punkte')}>📍 Kontrollpunkte ({punkte.filter((p) => p.objekt_id === objekt.id && p.aktiv).length})</button>
            <button style={reiter === 'plan' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('plan')}>📅 Dienstplan</button>
            <button style={reiter === 'nachweis' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('nachweis')}>🧾 Nachweis</button>
            <button style={reiter === 'betrieb' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('betrieb')}>🪪 Betrieb &amp; Nachweise</button>
          </div>

          {reiter === 'gang' && <Kontrollgang supabase={supabase} objekt={objekt} punkte={punkte} rundgaenge={rundgaenge} uid={uid} istChef={istChef} melde={melde} onGeaendert={neuLaden} />}
          {reiter === 'buch' && <Wachbuch supabase={supabase} objekt={objekt} eintraege={eintraege} laufenderRundgang={meinLaufend} melde={melde} onGeaendert={buchLaden} />}
          {reiter === 'punkte' && <Kontrollpunkte supabase={supabase} objekt={objekt} punkte={punkte} istChef={istChef} melde={melde} onGeaendert={lade} />}
          {reiter === 'plan' && <Dienstplan supabase={supabase} objekt={objekt} personen={personen} qualis={qualis} vorgabe={vorgaben.find((v) => v.objekt_id === objekt.id) ?? null}
            angaben={angaben} heute={tag} istChef={istChef} melde={melde} onVorgabe={lade} />}
          {reiter === 'nachweis' && <Nachweis supabase={supabase} objekt={objekt} punkte={punkte} heute={tag} angaben={angaben} melde={melde} />}
          {reiter === 'betrieb' && <BetriebNachweise supabase={supabase} ich={ich} istChef={istChef} angaben={angaben} personen={personen} qualis={qualis} heute={tag} melde={melde} onGeaendert={lade} />}
        </>)}
      </>)}
    </div>
  );
}
