'use client';

// ============================================================
// ARGONAUT OS · Paket 352 (13.10.2026) · A4a Fachpaket Bestatter
// Sterbefälle: Akte (verstorbene Person, Auftraggeber, Bestattungsart,
// Termine), Checkliste (Standesamt, Friedhof, Rente, Krankenkasse …),
// Kostenvoranschlag aus dem Leistungskatalog mit Auslagen für Dritte,
// Partner (Steinmetz, Florist, Trauerredner …), Vollmacht zum Drucken.
// Dazu „Meine Checkliste": die eigenen Aufgaben des Betriebs mit eigenen
// Fristen — ARGONAUT liefert nur Stationen ohne Fristen (Landesrecht).
// Rechnen und Prüfen: lib/bestattung.ts (tests/bestattungP352).
// Datenbank: supabase-sql/p352-bestattung.sql (Rechte Modul „bestattung").
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import {
  BESTATTUNGSARTEN, STATUS, FAMILIENSTAND, LAUFEND, STANDARD_AUFGABEN, aktePruefen, aufgabenFuerFall, vorlagePruefen,
  fallUebersicht, statusName, statusStufe, artName, verstorbenName, datumDe, zeitDe, aufgabenStand,
  type AufgabeVorlage, type Aufgabe, type AkteEingabe,
} from '@/lib/bestattung';
import Leerzustand from '../_components/Leerzustand';
import SterbefallAkte, { type Fall } from './SterbefallAkte';
import { C, STUFE_FARBE, heute, Feld, s } from './bestattungUi';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);


type Kontakt = { id: string; name: string | null; email: string | null; telefon: string | null };
type VorlageZeile = AufgabeVorlage & { id: string; aktiv: boolean };
type AufgabeZeile = Aufgabe & { id: string; sterbefall_id: string };
type Reiter = 'faelle' | 'checkliste';

const FALL_FELDER = 'id, nummer, verstorben_vorname, verstorben_nachname, geburtsname, geburtsdatum, sterbedatum, sterbeort, letzte_anschrift, familienstand, feier, bestattungsart, friedhof, grabart, trauerfeier_am, beisetzung_am, kontakt_id, auftraggeber_name, auftraggeber_verhaeltnis, auftraggeber_tel, auftraggeber_mail, auftraggeber_anschrift, status, notiz, erstellt_am';

type Neu = Record<'verstorben_vorname' | 'verstorben_nachname' | 'geburtsname' | 'geburtsdatum' | 'sterbedatum' | 'sterbeort' | 'letzte_anschrift'
  | 'familienstand' | 'bestattungsart' | 'feier' | 'friedhof' | 'grabart' | 'kontakt_id' | 'auftraggeber_name' | 'auftraggeber_verhaeltnis'
  | 'auftraggeber_tel' | 'auftraggeber_mail' | 'auftraggeber_anschrift' | 'notiz', string>;
const leerNeu = (): Neu => ({
  verstorben_vorname: '', verstorben_nachname: '', geburtsname: '', geburtsdatum: '', sterbedatum: '', sterbeort: '', letzte_anschrift: '',
  familienstand: '', bestattungsart: 'erd', feier: '', friedhof: '', grabart: '', kontakt_id: '', auftraggeber_name: '', auftraggeber_verhaeltnis: '',
  auftraggeber_tel: '', auftraggeber_mail: '', auftraggeber_anschrift: '', notiz: '',
});
const oderNull = (t: string) => (t.trim() ? t.trim() : null);

export default function BestattungPage() {
  const tag = heute();
  const [faelle, setFaelle] = useState<Fall[]>([]);
  const [aufgaben, setAufgaben] = useState<AufgabeZeile[]>([]);
  const [vorlagen, setVorlagen] = useState<VorlageZeile[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [ich, setIch] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('faelle');
  const [neu, setNeu] = useState<Neu | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [alle, setAlle] = useState(false);
  const [suche, setSuche] = useState('');
  const [vNeu, setVNeu] = useState({ titel: '', stelle: '', tage: '', nur_bei: [] as string[] });

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : null;
    setIstChef(!chefId || chefId === uid);
    setIch(chefId ?? uid);
    const [f, a, v] = await Promise.all([
      supabase.from('sterbefall').select(FALL_FELDER).order('erstellt_am', { ascending: false }).limit(2000),
      supabase.from('sterbefall_aufgabe').select('id, sterbefall_id, titel, stelle, faellig_am, erledigt_am, position, notiz').order('position', { ascending: true }).limit(20000),
      supabase.from('bestattung_aufgabe_vorlage').select('id, titel, stelle, tage_nach_tod, nur_bei, position, aktiv').order('position', { ascending: true }).limit(500),
    ]);
    if (f.error || a.error || v.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    setFaelle(((f.data as unknown) as Fall[]) ?? []);
    setAufgaben(((a.data as unknown) as AufgabeZeile[]) ?? []);
    setVorlagen(((v.data as unknown) as VorlageZeile[]) ?? []);
    // Kontakte (Auftraggeber übernehmen) — ohne Recht „Vertrieb" geht es ohne
    const k = await supabase.from('kontakte').select('id, name, email, telefon').order('name', { ascending: true }).limit(3000);
    setKontakte(k.error ? [] : (((k.data as unknown) as Kontakt[]) ?? []));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const ueb = fallUebersicht(faelle, aufgaben, tag);

  // --- Neuer Sterbefall --------------------------------------------------------
  function kontaktWaehlen(id: string) {
    if (!neu) return;
    const k = kontakte.find((x) => x.id === id);
    setNeu({
      ...neu, kontakt_id: id,
      auftraggeber_name: k?.name ?? neu.auftraggeber_name, auftraggeber_mail: k?.email ?? neu.auftraggeber_mail, auftraggeber_tel: k?.telefon ?? neu.auftraggeber_tel,
    });
  }

  async function anlegen() {
    if (!neu) return;
    const e: AkteEingabe = { ...neu, geburtsdatum: oderNull(neu.geburtsdatum), sterbedatum: oderNull(neu.sterbedatum) };
    const r = aktePruefen(e, tag);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const felder: Record<string, string | null> = {};
      for (const [k, w] of Object.entries(neu)) felder[k] = oderNull(w);
      felder.verstorben_nachname = neu.verstorben_nachname.trim();
      felder.auftraggeber_name = neu.auftraggeber_name.trim();
      felder.bestattungsart = neu.bestattungsart;
      const { data, error } = await supabase.from('sterbefall').insert(felder).select('id, nummer');
      if (error || nichtsGeschrieben(data)) {
        melde(error && /Kontakt/.test(error.message) ? error.message : 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Bestattung" (und SQL Paket 352).');
        return;
      }
      const fall = (data as { id: string; nummer: string | null }[])[0];
      // Checkliste anlegen: eigene Checkliste des Betriebs, sonst die ARGONAUT-Stationen
      const plan = aufgabenFuerFall(vorlagen, neu.bestattungsart, oderNull(neu.sterbedatum));
      let hinweis = '';
      if (plan.aufgaben.length) {
        const { error: aErr } = await supabase.from('sterbefall_aufgabe').insert(plan.aufgaben.map((x) => ({ ...x, sterbefall_id: fall.id })));
        if (aErr) hinweis = ' Die Checkliste konnte nicht angelegt werden — bitte in der Akte von Hand ergänzen.';
        else if (plan.quelle === 'standard') hinweis = ' Checkliste aus den ARGONAUT-Stationen (ohne Fristen) — eigene Fristen hinterlegen Sie unter „Meine Checkliste".';
      }
      melde(null, `Sterbefall ${fall.nummer ?? ''} für ${verstorbenName(neu)} angelegt.${hinweis}`);
      setNeu(null); setOffen(fall.id); await lade();
    } finally { setBusy(false); }
  }

  // --- Meine Checkliste ----------------------------------------------------------
  async function schreibe(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, okText: string, fehlText = 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Bestattung".') {
    setBusy(true); melde(null);
    try {
      const { data, error } = await q;
      if (error) { melde(/Akte|Kontakt|Leistung|abgeschlossen|wandert/.test(error.message) ? error.message : fehlText); return false; }
      if (nichtsGeschrieben(data)) { melde(fehlText); return false; }
      melde(null, okText); await lade(); return true;
    } finally { setBusy(false); }
  }

  async function vorlageAnlegen() {
    const tage = vNeu.tage.trim() ? Number(vNeu.tage.trim()) : null;
    const v = { titel: vNeu.titel, stelle: vNeu.stelle, tage_nach_tod: tage, nur_bei: vNeu.nur_bei.length ? vNeu.nur_bei : null };
    const r = vorlagePruefen(v);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    const pos = Math.max(0, ...vorlagen.map((x) => x.position)) + 1;
    if (await schreibe(supabase.from('bestattung_aufgabe_vorlage').insert({ titel: v.titel.trim(), stelle: oderNull(v.stelle), tage_nach_tod: tage, nur_bei: v.nur_bei, position: pos }).select('id'),
      `„${v.titel.trim()}" steht in Ihrer Checkliste.`)) setVNeu({ titel: '', stelle: '', tage: '', nur_bei: [] });
  }

  async function standardUebernehmen() {
    const rows = STANDARD_AUFGABEN.map((s) => ({ titel: s.titel, stelle: s.stelle, tage_nach_tod: null, nur_bei: s.nur_bei, position: s.position }));
    await schreibe(supabase.from('bestattung_aufgabe_vorlage').insert(rows).select('id'),
      `${rows.length} Stationen übernommen — tragen Sie jetzt Ihre Fristen ein (Tage nach dem Sterbetag).`);
  }

  async function vorlageFrist(v: VorlageZeile, wert: string) {
    const tage = wert.trim() ? Number(wert.trim()) : null;
    const r = vorlagePruefen({ titel: v.titel, tage_nach_tod: tage });
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    await schreibe(supabase.from('bestattung_aufgabe_vorlage').update({ tage_nach_tod: tage }).eq('id', v.id).select('id'), `Frist für „${v.titel}" gespeichert.`);
  }

  async function vorlageAktiv(v: VorlageZeile) {
    await schreibe(supabase.from('bestattung_aufgabe_vorlage').update({ aktiv: !v.aktiv }).eq('id', v.id).select('id'), v.aktiv ? `„${v.titel}" ausgeblendet.` : `„${v.titel}" wieder aktiv.`);
  }

  async function vorlageEntfernen(v: VorlageZeile) {
    if (!window.confirm(`„${v.titel}" aus Ihrer Checkliste entfernen? Bestehende Sterbefälle behalten ihre Aufgaben.`)) return;
    await schreibe(supabase.from('bestattung_aufgabe_vorlage').delete().eq('id', v.id).select('id'), `„${v.titel}" entfernt.`, 'Entfernen darf nur die Geschäftsleitung — Mitarbeiter blenden aus.');
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Sterbefälle …</p></div>;

  const q = suche.trim().toLowerCase();
  const gezeigt = faelle
    .filter((f) => alle || (LAUFEND as readonly string[]).includes(f.status))
    .filter((f) => !q || [f.nummer, verstorbenName(f), f.auftraggeber_name, f.friedhof].some((x) => String(x ?? '').toLowerCase().includes(q)));

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🕊️ Bestattung</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie je Sterbefall eine Akte an — verstorbene Person, Auftraggeber, Bestattungsart. ARGONAUT legt die Checkliste an
        (Standesamt, Friedhof, Rente, Krankenkasse …) — mit Ihren eigenen Fristen aus „Meine Checkliste". Den Kostenvoranschlag stellen Sie aus
        Ihrem Leistungskatalog zusammen; Auslagen für Dritte wie Friedhofsgebühren stehen getrennt und ohne Umsatzsteuer. Partner wie Steinmetz,
        Florist und Trauerredner tragen Sie je Sterbefall ein. Die Vollmacht drucken Sie mit Ihrem eigenen Text aus „Meine Rechtstexte".
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Die Bestattungs-Akte ist noch nicht eingerichtet (SQL Paket 352 fehlt) oder Ihnen fehlt das Recht „Bestattung".</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Laufende Sterbefälle</div><b style={s.zahl}>{ueb.laufend}</b></div>
          <div style={s.kachel}><div style={s.dim}>Trauerfeiern und Beisetzungen (7 Tage)</div><b style={s.zahl}>{ueb.termineWoche}</b></div>
          <div style={s.kachel}><div style={s.dim}>Aufgaben überfällig</div><b style={{ ...s.zahl, color: ueb.aufgabenUeberfaellig ? C.bad : C.text }}>{ueb.aufgabenUeberfaellig}</b></div>
          <div style={s.kachel}><div style={s.dim}>Aufgaben offen</div><b style={s.zahl}>{ueb.aufgabenOffen}</b></div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px', alignItems: 'center' }}>
          <button style={reiter === 'faelle' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('faelle')}>Sterbefälle ({faelle.length})</button>
          <button style={reiter === 'checkliste' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('checkliste')}>Meine Checkliste ({vorlagen.length})</button>
          <span style={{ flex: 1 }} />
          {reiter === 'faelle' && !neu && <button style={s.btnGold} onClick={() => { setNeu(leerNeu()); melde(null); }}>+ Neuer Sterbefall</button>}
        </div>

        {reiter === 'faelle' && (<>
          {neu && (
            <div style={{ ...s.box, marginBottom: 12 }}>
              <b style={{ color: C.gold }}>Neuer Sterbefall</b>
              <h3 style={s.h3}>Verstorbene Person</h3>
              <div style={s.raster}>
                <Feld label="Vorname" w={neu.verstorben_vorname} max={80} on={(x) => setNeu({ ...neu, verstorben_vorname: x })} />
                <Feld label="Nachname *" w={neu.verstorben_nachname} max={80} on={(x) => setNeu({ ...neu, verstorben_nachname: x })} />
                <Feld label="Geburtsname" w={neu.geburtsname} max={80} on={(x) => setNeu({ ...neu, geburtsname: x })} />
                <Feld label="Geburtsdatum" typ="date" w={neu.geburtsdatum} on={(x) => setNeu({ ...neu, geburtsdatum: x })} />
                <Feld label="Sterbedatum" typ="date" w={neu.sterbedatum} on={(x) => setNeu({ ...neu, sterbedatum: x })} />
                <Feld label="Sterbeort" w={neu.sterbeort} max={160} on={(x) => setNeu({ ...neu, sterbeort: x })} />
                <label style={s.feld}>Familienstand
                  <select style={s.input} value={neu.familienstand} onChange={(e) => setNeu({ ...neu, familienstand: e.target.value })}>
                    <option value="">—</option>{FAMILIENSTAND.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                  </select>
                </label>
                <Feld label="Letzte Anschrift" w={neu.letzte_anschrift} max={300} span on={(x) => setNeu({ ...neu, letzte_anschrift: x })} />
              </div>
              <h3 style={s.h3}>Bestattung</h3>
              <div style={s.raster}>
                <label style={s.feld}>Bestattungsart *
                  <select style={s.input} value={neu.bestattungsart} onChange={(e) => setNeu({ ...neu, bestattungsart: e.target.value })}>
                    {BESTATTUNGSARTEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                  </select>
                </label>
                <Feld label="Art der Feier (z. B. kirchlich, weltlich)" w={neu.feier} max={120} on={(x) => setNeu({ ...neu, feier: x })} />
                <Feld label="Friedhof bzw. Ort der Beisetzung" w={neu.friedhof} max={160} on={(x) => setNeu({ ...neu, friedhof: x })} />
                <Feld label="Grabart" w={neu.grabart} max={120} on={(x) => setNeu({ ...neu, grabart: x })} />
              </div>
              <h3 style={s.h3}>Auftraggeber (Angehörige)</h3>
              <div style={s.raster}>
                {kontakte.length > 0 && (
                  <label style={s.feld}>Aus Kontakten übernehmen
                    <select style={s.input} value={neu.kontakt_id} onChange={(e) => kontaktWaehlen(e.target.value)}>
                      <option value="">— neuer Auftraggeber —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name ?? 'ohne Namen'}</option>)}
                    </select>
                  </label>
                )}
                <Feld label="Name *" w={neu.auftraggeber_name} max={120} on={(x) => setNeu({ ...neu, auftraggeber_name: x })} />
                <Feld label="Verhältnis (z. B. Ehefrau, Sohn)" w={neu.auftraggeber_verhaeltnis} max={60} on={(x) => setNeu({ ...neu, auftraggeber_verhaeltnis: x })} />
                <Feld label="Telefon" w={neu.auftraggeber_tel} max={40} on={(x) => setNeu({ ...neu, auftraggeber_tel: x })} />
                <Feld label="E-Mail" w={neu.auftraggeber_mail} max={160} on={(x) => setNeu({ ...neu, auftraggeber_mail: x })} />
                <Feld label="Anschrift" w={neu.auftraggeber_anschrift} max={300} span on={(x) => setNeu({ ...neu, auftraggeber_anschrift: x })} />
                <Feld label="Notiz" w={neu.notiz} max={1000} span on={(x) => setNeu({ ...neu, notiz: x })} />
              </div>
              <p style={s.klein}>Die Fallnummer vergibt ARGONAUT je Jahr fortlaufend. Die Checkliste entsteht beim Anlegen passend zur Bestattungsart.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>Sterbefall anlegen</button>
                <button style={s.btnAus} onClick={() => setNeu(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {faelle.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <input style={{ ...s.input, minWidth: 240 }} placeholder="Suchen: Nummer, Name, Auftraggeber, Friedhof" value={suche} onChange={(e) => setSuche(e.target.value)} />
              <label style={s.klein}><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> auch abgeschlossene und stornierte</label>
            </div>
          )}

          {!faelle.length && !neu && (
            <Leerzustand icon="🕊️" titel="Noch kein Sterbefall"
              text="Hier führen Sie jeden Sterbefall in einer Akte: Daten der verstorbenen Person, Auftraggeber, Checkliste, Kostenvoranschlag, Partner und Vollmacht."
              schritte={['„+ Neuer Sterbefall" — Name, Bestattungsart und Auftraggeber eintragen', 'Checkliste abhaken und Termine eintragen', 'Kostenvoranschlag aus Ihrem Leistungskatalog zusammenstellen und drucken']} />
          )}
          {faelle.length > 0 && !gezeigt.length && <p style={s.dim}>Keine Treffer für diese Auswahl.</p>}

          <div style={{ display: 'grid', gap: 8 }}>
            {gezeigt.map((f) => {
              const auf = offen === f.id;
              const st = aufgabenStand(aufgaben.filter((a) => a.sterbefall_id === f.id), tag);
              const farbe = STUFE_FARBE[statusStufe(f.status)] ?? C.dim;
              return (
                <div key={f.id} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={s.titelKnopf} onClick={() => setOffen(auf ? null : f.id)}>{auf ? '▾' : '▸'} {f.nummer ? `${f.nummer} · ` : ''}{verstorbenName(f)}</button>
                    <span style={{ ...s.pill, color: farbe, borderColor: farbe }}>{statusName(f.status)}</span>
                    <span style={s.klein}>
                      {artName(f.bestattungsart)}{f.sterbedatum ? ` · † ${datumDe(f.sterbedatum)}` : ''}{f.beisetzung_am ? ` · Beisetzung ${zeitDe(f.beisetzung_am)}` : ''} · Auftraggeber {f.auftraggeber_name}
                      {' · '}Checkliste {st.erledigt}/{st.gesamt}{st.ueberfaellig ? <b style={{ color: C.bad }}> · {st.ueberfaellig} überfällig</b> : null}
                    </span>
                  </div>
                  {auf && (
                    <SterbefallAkte supabase={supabase} fall={f} aufgaben={aufgaben.filter((a) => a.sterbefall_id === f.id)} istChef={istChef} ich={ich}
                      kontakte={kontakte} heute={tag} onGeaendert={lade} melde={melde} />
                  )}
                </div>
              );
            })}
          </div>
        </>)}

        {reiter === 'checkliste' && (
          <div style={s.box}>
            <b style={{ color: C.gold }}>Meine Checkliste</b>
            <p style={s.klein}>
              Diese Aufgaben bekommt jeder neue Sterbefall — mit Ihrer Frist in Tagen nach dem Sterbetag. Fristen regeln Bundes- und Landesrecht
              unterschiedlich; ARGONAUT gibt deshalb keine vor. Ohne eigene Checkliste nimmt ARGONAUT seine Stationen ohne Fristen.
              „Nur bei" begrenzt eine Aufgabe auf bestimmte Bestattungsarten (z. B. Krematorium nur bei Feuerbestattung).
            </p>
            {!vorlagen.length && (
              <div style={{ margin: '10px 0' }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void standardUebernehmen()}>ARGONAUT-Stationen als Startpunkt übernehmen</button>
              </div>
            )}
            {vorlagen.length > 0 && (
              <table style={{ ...s.tabelle, marginTop: 8 }}>
                <thead><tr><th style={s.th}>Aufgabe</th><th style={s.th}>Stelle</th><th style={s.th}>Frist (Tage nach Tod)</th><th style={s.th}>Nur bei</th><th style={s.th}></th></tr></thead>
                <tbody>
                  {vorlagen.map((v) => (
                    <tr key={v.id} style={{ opacity: v.aktiv ? 1 : 0.5 }}>
                      <td style={s.td}>{v.titel}</td>
                      <td style={s.td}>{v.stelle ?? '—'}</td>
                      <td style={s.td}>
                        <input style={{ ...s.input, width: 70 }} inputMode="numeric" defaultValue={v.tage_nach_tod ?? ''} placeholder="—"
                          onBlur={(e) => { if (e.target.value.trim() !== String(v.tage_nach_tod ?? '')) void vorlageFrist(v, e.target.value); }} />
                      </td>
                      <td style={s.td}>{v.nur_bei?.length ? v.nur_bei.map(artName).join(', ') : 'alle'}</td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        <button style={s.mini} disabled={busy} onClick={() => void vorlageAktiv(v)}>{v.aktiv ? 'ausblenden' : 'aktivieren'}</button>{' '}
                        {istChef && <button style={s.mini} disabled={busy} onClick={() => void vorlageEntfernen(v)}>entfernen</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 style={s.h3}>Aufgabe hinzufügen</h3>
            <div style={s.raster}>
              <Feld label="Aufgabe" w={vNeu.titel} max={160} span on={(x) => setVNeu({ ...vNeu, titel: x })} />
              <Feld label="Stelle (z. B. Standesamt)" w={vNeu.stelle} max={80} on={(x) => setVNeu({ ...vNeu, stelle: x })} />
              <Feld label="Frist (Tage nach dem Sterbetag)" w={vNeu.tage} on={(x) => setVNeu({ ...vNeu, tage: x })} />
            </div>
            <div style={{ ...s.klein, margin: '8px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              Nur bei:{BESTATTUNGSARTEN.map((a) => (
                <label key={a.key}><input type="checkbox" checked={vNeu.nur_bei.includes(a.key)}
                  onChange={(e) => setVNeu({ ...vNeu, nur_bei: e.target.checked ? [...vNeu.nur_bei, a.key] : vNeu.nur_bei.filter((x) => x !== a.key) })} /> {a.name}</label>
              ))}
              <span>(nichts angehakt = alle)</span>
            </div>
            <button style={s.btnGold} disabled={busy} onClick={() => void vorlageAnlegen()}>＋ Aufgabe</button>
          </div>
        )}
      </>)}
      <p style={{ ...s.klein, marginTop: 18 }}>Status: {STATUS.map((x) => x.name).join(' → ')}.</p>
    </div>
  );
}
