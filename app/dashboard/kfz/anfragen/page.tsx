'use client';

// ============================================================
// ARGONAUT OS · Paket 271 · K10 Anfragen und Suchaufträge
// Anfragen von Kaufinteressenten — auf Wunsch am Fahrzeug —, Verantwortlicher
// per Klick, nächster Kontakt (fällig), Stand bis zum Abschluss mit Grund und
// Auswertung der Gründe. Suchaufträge mit Laufzeit und Treffer-Hinweis aus dem
// Bestand („neu seit dem letzten Blick"). Nichts wird automatisch verschickt.
// Pfad: app/dashboard/kfz/anfragen/page.tsx — Unterpfad von /dashboard/kfz, erbt dessen Freigabe.
// Rechte: lesen mit „KFZ", schreiben mit Schreibrecht „KFZ", löschen nur der Chef.
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  QUELLEN, STATUS, GRUENDE, naechsteNr, statusLabel, istOffen, faelligkeit, startFaellig, anfragePruefen, statusFelder, auswertung,
  kriterienBereinigen, kriterienText, treffer, laeuft, plusTage, SUCH_LAUFZEIT_TAGE,
  type Anfrage, type FahrzeugFuerSuche, type Kriterien,
} from '@/lib/kfzAnfrage';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Zeile = Anfrage & { id: string; owner_user_id: string; notiz: string | null };
type Such = { id: string; nr: string | null; name: string | null; tel: string | null; email: string | null; kriterien: Kriterien; aktiv: boolean; gueltig_bis: string | null; gesehen_bis: string | null; verantwortlich_name: string | null; notiz: string | null };
type Fz = FahrzeugFuerSuche & { interne_nr: string | null };
type Person = { id: string; name: string };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null): string { return iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—'; }
const LEER_A = { bestand_id: '', quelle: 'telefon', name: '', tel: '', email: '', nachricht: '', verantwortlich: '' };
const LEER_S = { name: '', tel: '', email: '', marke: '', modell: '', preis_min: '', preis_max: '', ez_ab: '', km_max: '', kraftstoff: '', notiz: '', verantwortlich: '' };

export default function AnfragenPage() {
  const [reiter, setReiter] = useState<'anfragen' | 'suche'>('anfragen');
  const [liste, setListe] = useState<Zeile[]>([]);
  const [suchen, setSuchen] = useState<Such[]>([]);
  const [fz, setFz] = useState<Fz[]>([]);
  const [leute, setLeute] = useState<Person[]>([]);
  const [ich, setIch] = useState<{ id: string; chef: boolean } | null>(null);
  const [filter, setFilter] = useState<'offen' | 'faellig' | 'mein' | 'zu' | 'alle'>('offen');
  const [na, setNa] = useState(LEER_A);
  const [ns, setNs] = useState(LEER_S);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [grund, setGrund] = useState<Record<string, string>>({});
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const istChef = !(typeof chef === 'string' && chef && chef !== u?.user?.id);
    setIch(u?.user?.id ? { id: u.user.id, chef: istChef } : null);
    const [a, s, b, m] = await Promise.all([
      supabase.from('kfz_anfrage').select('*').order('erstellt_am', { ascending: false }).limit(3000),
      supabase.from('kfz_suchauftrag').select('*').order('erstellt_am', { ascending: false }).limit(1000),
      supabase.from('kfz_bestand').select('id, interne_nr, status, marke, modell, vk_brutto, erstzulassung, km_stand, kraftstoff, sparte, erstellt_am').limit(5000),
      supabase.from('mitarbeiter').select('id, vorname, nachname, auth_user_id').not('auth_user_id', 'is', null).limit(500),
    ]);
    if (a.error) { setFehler('Anfragen lassen sich nicht laden. Ist SQL Paket 271 ausgeführt und haben Sie das Recht „KFZ"?'); setLaden(false); return; }
    setListe(((a.data as unknown) as Zeile[]) ?? []);
    setSuchen(((s.data as unknown) as Such[]) ?? []);
    setFz(((b.data as unknown) as Fz[]) ?? []);
    const ps: Person[] = [{ id: '', name: 'Geschäftsleitung' }];
    for (const x of ((m.data as unknown) as { auth_user_id: string; vorname: string | null; nachname: string | null }[]) ?? []) {
      const n = [x.vorname, x.nachname].filter(Boolean).join(' ').trim();
      if (n) ps.push({ id: x.auth_user_id, name: n });
    }
    setLeute(ps);
    try {
      const neu = new URLSearchParams(window.location.search).get('fahrzeug');
      if (neu) setNa((alt) => ({ ...alt, bestand_id: neu }));
    } catch { /* egal */ }
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const ausw = useMemo(() => auswertung(liste, tag), [liste, tag]);
  const fzName = (id: string | null) => { const f = fz.find((x) => x.id === id); return f ? `${f.interne_nr ?? ''} ${[f.marke, f.modell].filter(Boolean).join(' ')}`.trim() : '—'; };
  const gezeigt = liste.filter((a) => filter === 'alle' ? true : filter === 'zu' ? !istOffen(a.status)
    : filter === 'faellig' ? ['ueberfaellig', 'heute'].includes(faelligkeit(a, tag))
    : filter === 'mein' ? istOffen(a.status) && (a.verantwortlich_id === ich?.id || (!a.verantwortlich_id && !!ich?.chef))
    : istOffen(a.status));
  const personName = (id: string) => leute.find((p) => p.id === id)?.name ?? null;
  const meld = () => { setFehler(null); setOk(null); };

  async function anfrageAnlegen() {
    meld();
    const p = anfragePruefen({ name: na.name, tel: na.tel, email: na.email, status: 'neu', abschluss_grund: null });
    if (p.fehler.length) { setFehler(p.fehler.join(' ')); return; }
    setBusy(true);
    try {
      const nr = naechsteNr('A', liste.map((x) => x.nr));
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('kfz_anfrage').insert({
        owner_user_id: u?.user?.id, nr, bestand_id: na.bestand_id || null, quelle: na.quelle,
        name: na.name.trim().slice(0, 120), tel: na.tel.trim() || null, email: na.email.trim() || null, nachricht: na.nachricht.trim().slice(0, 2000) || null,
        verantwortlich_id: na.verantwortlich || null, verantwortlich_name: personName(na.verantwortlich), faellig_am: startFaellig(na.quelle, tag),
      });
      if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?'); return; }
      setNa(LEER_A); setOk(`Anfrage ${nr} angelegt.`); await lade();
    } finally { setBusy(false); }
  }

  async function aendern(a: Zeile, felder: Record<string, unknown>, meldung = 'Gespeichert.') {
    meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_anfrage').update({ ...felder, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?'); return; }
      setOk(meldung); await lade();
    } finally { setBusy(false); }
  }

  async function statusSetzen(a: Zeile, neu: string) {
    const g = neu === 'gewonnen' ? 'gekauft' : neu === 'verloren' ? (grund[a.id] ?? '') : null;
    const p = anfragePruefen({ ...a, status: neu, abschluss_grund: g || null });
    if (p.fehler.length) { setFehler(p.fehler.join(' ')); return; }
    await aendern(a, { ...statusFelder(neu, new Date().toISOString()), ...(neu === 'verloren' ? { abschluss_grund: g } : {}) }, `Stand: ${statusLabel(neu)}.`);
  }

  async function anfrageLoeschen(a: Zeile) {
    meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_anfrage').delete().eq('id', a.id);
      if (error) { setFehler('Löschen fehlgeschlagen — nur die Geschäftsleitung löscht.'); return; }
      setOffenId(null); setOk('Anfrage gelöscht.'); await lade();
    } finally { setBusy(false); }
  }

  async function sucheAnlegen() {
    meld();
    if (!ns.name.trim() || (!ns.tel.trim() && !ns.email.trim())) { setFehler('Name und Telefon oder E-Mail angeben.'); return; }
    const k = kriterienBereinigen(ns);
    if (!Object.keys(k).length) { setFehler('Mindestens ein Suchkriterium angeben.'); return; }
    setBusy(true);
    try {
      const nr = naechsteNr('S', suchen.map((x) => x.nr));
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('kfz_suchauftrag').insert({
        owner_user_id: u?.user?.id, nr, name: ns.name.trim().slice(0, 120), tel: ns.tel.trim() || null, email: ns.email.trim() || null,
        kriterien: k, gueltig_bis: plusTage(tag, SUCH_LAUFZEIT_TAGE), gesehen_bis: new Date().toISOString(), notiz: ns.notiz.trim() || null,
        verantwortlich_id: ns.verantwortlich || null, verantwortlich_name: personName(ns.verantwortlich),
      });
      if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?'); return; }
      const t = treffer({ kriterien: k, aktiv: true, gueltig_bis: null, gesehen_bis: null }, fz, tag).alle.length;
      setNs(LEER_S); setOk(`Suchauftrag ${nr} angelegt (läuft ${SUCH_LAUFZEIT_TAGE} Tage).${t ? ` Schon jetzt ${t} passende Fahrzeuge im Bestand.` : ''}`); await lade();
    } finally { setBusy(false); }
  }

  async function sucheAendern(s: Such, felder: Record<string, unknown>, meldung: string) {
    meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_suchauftrag').update({ ...felder, aktualisiert_am: new Date().toISOString() }).eq('id', s.id);
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setOk(meldung); await lade();
    } finally { setBusy(false); }
  }

  async function sucheLoeschen(s: Such) {
    meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_suchauftrag').delete().eq('id', s.id);
      if (error) { setFehler('Löschen fehlgeschlagen — nur die Geschäftsleitung löscht.'); return; }
      setOk('Suchauftrag gelöscht.'); await lade();
    } finally { setBusy(false); }
  }

  const neueTreffer = suchen.reduce((n, s) => n + treffer(s, fz, tag).neu.length, 0);
  const fzWahl = fz.filter((f) => ['zulauf', 'aufbereitung', 'bestand', 'reserviert'].includes(f.status));

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>📨 Anfragen und Suchaufträge</h1>
      <p style={s.dim}>Jede Anfrage bekommt einen Verantwortlichen und einen nächsten Kontakt. Suchaufträge melden passende Fahrzeuge aus Ihrem Bestand — verschickt wird nichts automatisch.</p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}

      <div style={s.kacheln}>
        <div style={s.kachel}><div style={s.dim}>Offene Anfragen</div><b style={s.zahl}>{ausw.offen}</b></div>
        <div style={s.kachel}><div style={s.dim}>Heute fällig / überfällig</div><b style={{ ...s.zahl, color: ausw.ueberfaellig ? C.bad : ausw.heute ? C.warn : C.ok }}>{ausw.heute} / {ausw.ueberfaellig}</b></div>
        <div style={s.kachel}><div style={s.dim}>Abschlussquote</div><b style={s.zahl}>{ausw.quote === null ? '—' : `${ausw.quote} %`}</b><div style={s.dim}>{ausw.gewonnen} gewonnen · {ausw.verloren} verloren</div></div>
        <div style={s.kachel}><div style={s.dim}>Neue Treffer für Suchaufträge</div><b style={{ ...s.zahl, color: neueTreffer ? C.gold : C.dim }}>{neueTreffer}</b></div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '14px 0' }}>
        <button style={reiter === 'anfragen' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('anfragen')}>Anfragen</button>
        <button style={reiter === 'suche' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('suche')}>Suchaufträge ({suchen.filter((x) => laeuft(x, tag)).length})</button>
      </div>

      {laden ? <p style={s.dim}>Lädt …</p> : reiter === 'anfragen' ? (
        <>
          <div style={s.karte}>
            <h2 style={s.h2}>Neue Anfrage</h2>
            <div style={s.feldRaster}>
              <label style={s.lab}>Fahrzeug (optional)<select style={s.inp} value={na.bestand_id} onChange={(x) => setNa({ ...na, bestand_id: x.target.value })}><option value="">— ohne Fahrzeug —</option>{fzWahl.map((f) => <option key={f.id} value={f.id}>{fzName(f.id)}</option>)}</select></label>
              <label style={s.lab}>Quelle<select style={s.inp} value={na.quelle} onChange={(x) => setNa({ ...na, quelle: x.target.value })}>{QUELLEN.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select></label>
              <label style={s.lab}>Name<input style={s.inp} value={na.name} onChange={(x) => setNa({ ...na, name: x.target.value })} /></label>
              <label style={s.lab}>Telefon<input style={s.inp} value={na.tel} onChange={(x) => setNa({ ...na, tel: x.target.value })} /></label>
              <label style={s.lab}>E-Mail<input style={s.inp} value={na.email} onChange={(x) => setNa({ ...na, email: x.target.value })} /></label>
              <label style={s.lab}>Verantwortlich<select style={s.inp} value={na.verantwortlich} onChange={(x) => setNa({ ...na, verantwortlich: x.target.value })}>{leute.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            <label style={{ ...s.lab, marginTop: 8 }}>Nachricht / Wunsch<textarea style={{ ...s.inp, minHeight: 50 }} value={na.nachricht} onChange={(x) => setNa({ ...na, nachricht: x.target.value })} /></label>
            <button style={{ ...s.gold, marginTop: 10 }} disabled={busy} onClick={() => void anfrageAnlegen()}>＋ Anfrage anlegen</button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
            {([['offen', 'Offen'], ['faellig', 'Heute fällig'], ['mein', 'Meine'], ['zu', 'Abgeschlossen'], ['alle', 'Alle']] as const).map(([k, n]) => <button key={k} style={filter === k ? s.reiterAn : s.reiterAus} onClick={() => setFilter(k)}>{n}</button>)}
          </div>
          {gezeigt.length === 0 ? <p style={s.dim}>Keine Anfragen in dieser Ansicht.</p> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {gezeigt.map((a) => {
                const f = faelligkeit(a, tag);
                const st = STATUS.find((x) => x.key === a.status);
                const auf = offenId === a.id;
                return (
                  <div key={a.id} style={{ ...s.karte, padding: 12, borderColor: f === 'ueberfaellig' ? C.bad : f === 'heute' ? C.warn : C.border }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOffenId(auf ? null : a.id)}>
                      <b>{a.nr ?? '—'}</b>
                      <span>{a.name ?? '—'}</span>
                      <span style={s.dim}>{a.bestand_id ? fzName(a.bestand_id) : 'ohne Fahrzeug'}</span>
                      <span style={{ ...s.pill, color: FARBE[st?.farbe ?? 'dim'] }}>{statusLabel(a.status)}</span>
                      <span style={s.dim}>👤 {a.verantwortlich_name ?? 'Geschäftsleitung'}</span>
                      {istOffen(a.status) && <span style={{ color: f === 'ueberfaellig' ? C.bad : f === 'heute' ? C.warn : C.dim, fontSize: 13 }}>{f === 'ohne' ? 'ohne Termin' : `nächster Kontakt ${de(a.faellig_am)}${f === 'ueberfaellig' ? ' (überfällig)' : f === 'heute' ? ' (heute)' : ''}`}</span>}
                      {!istOffen(a.status) && a.abschluss_grund && <span style={s.dim}>{GRUENDE.find((g) => g.key === a.abschluss_grund)?.label}</span>}
                    </div>
                    {auf && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        <div style={s.dim}>{QUELLEN.find((q) => q.key === a.quelle)?.label} · eingegangen {de(a.erstellt_am)}{a.tel ? ` · ☎ ${a.tel}` : ''}{a.email ? ` · ✉ ${a.email}` : ''}</div>
                        {a.nachricht && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{a.nachricht}</div>}
                        {a.bestand_id && <a href={`/dashboard/kfz/bestand/${a.bestand_id}`} style={{ color: C.info, fontSize: 13 }}>Fahrzeugakte öffnen →</a>}
                        <div style={s.reihe}>
                          <label style={s.lab}>Verantwortlich<select style={s.inp} value={a.verantwortlich_id ?? ''} disabled={busy} onChange={(x) => void aendern(a, { verantwortlich_id: x.target.value || null, verantwortlich_name: personName(x.target.value) }, 'Verantwortlich geändert.')}>{leute.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                          {istOffen(a.status) && <label style={s.lab}>Nächster Kontakt<input type="date" style={s.inp} value={a.faellig_am ?? ''} disabled={busy} onChange={(x) => void aendern(a, { faellig_am: x.target.value || null }, 'Termin gespeichert.')} /></label>}
                          {istOffen(a.status) && <button style={s.btn} disabled={busy} onClick={() => void aendern(a, { faellig_am: plusTage(tag, 2) }, 'Auf übermorgen verschoben.')}>+2 Tage</button>}
                        </div>
                        <div style={s.reihe}>
                          {STATUS.filter((x) => x.offen && x.key !== a.status).map((x) => <button key={x.key} style={s.btn} disabled={busy} onClick={() => void statusSetzen(a, x.key)}>{x.label}</button>)}
                          {a.status !== 'gewonnen' && <button style={{ ...s.btn, borderColor: C.ok, color: C.ok }} disabled={busy} onClick={() => void statusSetzen(a, 'gewonnen')}>✓ Gewonnen</button>}
                        </div>
                        {a.status !== 'verloren' && (
                          <div style={s.reihe}>
                            <select style={s.inp} value={grund[a.id] ?? ''} onChange={(x) => setGrund({ ...grund, [a.id]: x.target.value })}><option value="">— Grund wählen —</option>{GRUENDE.filter((g) => !g.gewonnen).map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
                            <button style={s.btnRot} disabled={busy || !grund[a.id]} onClick={() => void statusSetzen(a, 'verloren')}>✕ Verloren</button>
                          </div>
                        )}
                        {ich?.chef && <div><button style={s.btnKlein} disabled={busy} onClick={() => void anfrageLoeschen(a)}>🗑 Anfrage löschen</button></div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {ausw.gruende.length > 0 && (
            <div style={{ ...s.karte, marginTop: 14 }}>
              <h2 style={s.h2}>Warum Anfragen verloren gehen</h2>
              {ausw.gruende.map((g) => <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}><span>{g.label}</span><b>{g.anzahl}</b></div>)}
              <div style={{ ...s.dim, marginTop: 8 }}>Nach Quelle: {ausw.quellen.map((q) => `${q.label} ${q.gewonnen}/${q.anzahl}`).join(' · ')}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={s.karte}>
            <h2 style={s.h2}>Neuer Suchauftrag</h2>
            <div style={s.feldRaster}>
              <label style={s.lab}>Name<input style={s.inp} value={ns.name} onChange={(x) => setNs({ ...ns, name: x.target.value })} /></label>
              <label style={s.lab}>Telefon<input style={s.inp} value={ns.tel} onChange={(x) => setNs({ ...ns, tel: x.target.value })} /></label>
              <label style={s.lab}>E-Mail<input style={s.inp} value={ns.email} onChange={(x) => setNs({ ...ns, email: x.target.value })} /></label>
              <label style={s.lab}>Marke<input style={s.inp} value={ns.marke} onChange={(x) => setNs({ ...ns, marke: x.target.value })} /></label>
              <label style={s.lab}>Modell<input style={s.inp} value={ns.modell} onChange={(x) => setNs({ ...ns, modell: x.target.value })} /></label>
              <label style={s.lab}>Preis ab €<input style={s.inp} inputMode="numeric" value={ns.preis_min} onChange={(x) => setNs({ ...ns, preis_min: x.target.value })} /></label>
              <label style={s.lab}>Preis bis €<input style={s.inp} inputMode="numeric" value={ns.preis_max} onChange={(x) => setNs({ ...ns, preis_max: x.target.value })} /></label>
              <label style={s.lab}>Erstzulassung ab Jahr<input style={s.inp} inputMode="numeric" value={ns.ez_ab} onChange={(x) => setNs({ ...ns, ez_ab: x.target.value })} /></label>
              <label style={s.lab}>Kilometer bis<input style={s.inp} inputMode="numeric" value={ns.km_max} onChange={(x) => setNs({ ...ns, km_max: x.target.value })} /></label>
              <label style={s.lab}>Kraftstoff<input style={s.inp} value={ns.kraftstoff} placeholder="z. B. Diesel" onChange={(x) => setNs({ ...ns, kraftstoff: x.target.value })} /></label>
              <label style={s.lab}>Verantwortlich<select style={s.inp} value={ns.verantwortlich} onChange={(x) => setNs({ ...ns, verantwortlich: x.target.value })}>{leute.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            <label style={{ ...s.lab, marginTop: 8 }}>Notiz<input style={s.inp} value={ns.notiz} onChange={(x) => setNs({ ...ns, notiz: x.target.value })} /></label>
            <div style={{ ...s.dim, marginTop: 6 }}>Läuft {SUCH_LAUFZEIT_TAGE} Tage und lässt sich verlängern. Bitte nur mit Einverständnis des Kunden anlegen, dass Sie ihn bei Treffern anrufen oder anschreiben dürfen.</div>
            <button style={{ ...s.gold, marginTop: 10 }} disabled={busy} onClick={() => void sucheAnlegen()}>＋ Suchauftrag anlegen</button>
          </div>

          {suchen.length === 0 ? <p style={s.dim}>Noch keine Suchaufträge.</p> : (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {suchen.map((x) => {
                const t = treffer(x, fz, tag);
                const l = laeuft(x, tag);
                return (
                  <div key={x.id} style={{ ...s.karte, padding: 12, borderColor: t.neu.length ? C.gold : C.border, opacity: l ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <b>{x.nr ?? '—'}</b><span>{x.name ?? '—'}</span>
                      <span style={s.dim}>{kriterienText(kriterienBereinigen(x.kriterien as Record<string, unknown>))}</span>
                      <span style={s.dim}>{l ? `bis ${de(x.gueltig_bis)}` : 'beendet'}</span>
                      {l && <span style={{ ...s.pill, color: t.neu.length ? C.gold : C.dim }}>{t.alle.length} Treffer{t.neu.length ? `, ${t.neu.length} neu` : ''}</span>}
                      <span style={s.dim}>👤 {x.verantwortlich_name ?? 'Geschäftsleitung'}{x.tel ? ` · ☎ ${x.tel}` : ''}{x.email ? ` · ✉ ${x.email}` : ''}</span>
                    </div>
                    {l && t.alle.length > 0 && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                        {t.alle.map((f) => <a key={f.id} href={`/dashboard/kfz/bestand/${f.id}`} style={{ color: t.neu.includes(f) ? C.gold : C.info, fontSize: 13.5 }}>{t.neu.includes(f) ? '● neu · ' : ''}{fzName(f.id)}{f.vk_brutto ? ` · ${f.vk_brutto.toLocaleString('de-DE')} €` : ''}{f.km_stand !== null ? ` · ${f.km_stand.toLocaleString('de-DE')} km` : ''}</a>)}
                      </div>
                    )}
                    <div style={{ ...s.reihe, marginTop: 8 }}>
                      {l && t.neu.length > 0 && <button style={s.btn} disabled={busy} onClick={() => void sucheAendern(x, { gesehen_bis: new Date().toISOString() }, 'Treffer als gesehen markiert.')}>✓ Treffer gesehen</button>}
                      <button style={s.btn} disabled={busy} onClick={() => void sucheAendern(x, { aktiv: true, gueltig_bis: plusTage(tag, SUCH_LAUFZEIT_TAGE) }, `Verlängert bis ${de(plusTage(tag, SUCH_LAUFZEIT_TAGE))}.`)}>↻ {SUCH_LAUFZEIT_TAGE} Tage verlängern</button>
                      {l && <button style={s.btn} disabled={busy} onClick={() => void sucheAendern(x, { aktiv: false }, 'Suchauftrag beendet.')}>■ Beenden</button>}
                      {ich?.chef && <button style={s.btnKlein} disabled={busy} onClick={() => void sucheLoeschen(x)}>🗑 Löschen</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 2px' },
  h2: { fontSize: 16, fontWeight: 800, margin: '0 0 8px' },
  dim: { color: C.dim, fontSize: 13 },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 12 },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  zahl: { fontSize: 26, fontWeight: 800, color: C.gold },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  btn: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 },
  btnRot: { background: 'transparent', border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 },
  btnKlein: { background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
};
