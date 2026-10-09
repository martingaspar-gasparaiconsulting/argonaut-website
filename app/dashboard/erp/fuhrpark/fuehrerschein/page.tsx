'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/erp/fuhrpark/fuehrerschein — F1a Führerscheinkontrolle (Paket 289)
//
// Fahrer mit Ampel (fehlt / Mangel / überfällig / bald / ok), Kontrolle
// eintragen (Prüfvermerk ohne Nummer und ohne Kopie), Verlauf je Fahrer,
// Intervall und Fahrerliste (Chef). Gesperrt, bis die Rechts-Freigabe
// „Führerscheinkontrolle" bestätigt ist — die Datenbank prüft das zusätzlich.
// Logik: lib/fuehrerscheinKontrolle.ts (getestet). Kundentext mit „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  FS_MODUL, INTERVALL_MIN, INTERVALL_MAX, KLASSEN, einstellungLesen, eingabePruefen, fahrerUebersicht, stufeText, zaehlen,
  type Kontrolle, type FahrerZeile, type Stufe,
} from '@/lib/fuehrerscheinKontrolle';
import { useRechtsFreigabe, FreigabeHinweis } from '../../../_components/RechtsFreigabe';
import Leerzustand from '../../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
const FARBE: Record<Stufe, string> = { fehlt: C.dim, mangel: C.bad, ueberfaellig: C.bad, bald: C.warn, ok: C.ok };

type Ma = { id: string; vorname: string | null; nachname: string | null; austrittsdatum: string | null };
type Form = { mitarbeiterId: string; name: string; klassen: string; dokumentBis: string; geprueftAm: string; ergebnis: 'gueltig' | 'mangel'; bemerkung: string };

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
function maName(m: Ma): string { return [m.vorname, m.nachname].filter(Boolean).join(' ').trim() || 'Ohne Namen'; }

export default function FuehrerscheinPage() {
  const tag = heute();
  const freigabe = useRechtsFreigabe('fuehrerschein');
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [meinName, setMeinName] = useState('');
  const [ma, setMa] = useState<Ma[]>([]);
  const [kontrollen, setKontrollen] = useState<Kontrolle[]>([]);
  const [einst, setEinst] = useState<Record<string, unknown>>({});
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [neuFahrer, setNeuFahrer] = useState('');

  const { intervall, fahrer: fahrerIds } = useMemo(() => einstellungLesen(einst), [einst]);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid) { setLaden(false); return; }
    const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
    setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.user?.email ?? '').split('@')[0]);
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const b = typeof chef === 'string' && chef ? chef : uid;
    setBetrieb(b); setIstChef(b === uid);
    const [m, k, e] = await Promise.all([
      supabase.from('mitarbeiter').select('id, vorname, nachname, austrittsdatum').eq('owner_user_id', b).order('nachname').limit(1000),
      supabase.from('fuehrerschein_kontrolle').select('id, mitarbeiter_id, person_name, klassen, dokument_gueltig_bis, geprueft_am, geprueft_name, ergebnis, bemerkung, naechste_am').eq('owner_user_id', b).order('geprueft_am', { ascending: false }).limit(1000),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', b).eq('modul', FS_MODUL).maybeSingle(),
    ]);
    if (k.error) setFehler('Die Führerscheinkontrolle ist noch nicht eingerichtet (SQL zu Paket 289 fehlt) oder Ihnen fehlt das Recht „Fuhrpark".');
    setMa((m.data as Ma[] | null) ?? []);
    setKontrollen((k.data as Kontrolle[] | null) ?? []);
    setEinst(((e.data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? {});
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const aktiveMa = useMemo(() => ma.filter((m) => !m.austrittsdatum || m.austrittsdatum >= tag), [ma, tag]);
  const fahrerListe = useMemo(() => aktiveMa.filter((m) => fahrerIds.includes(m.id)).map((m) => ({ id: m.id, name: maName(m) })), [aktiveMa, fahrerIds]);
  const uebersicht = useMemo(() => fahrerUebersicht(fahrerListe, kontrollen, tag), [fahrerListe, kontrollen, tag]);
  const anz = useMemo(() => zaehlen(uebersicht), [uebersicht]);

  async function einstSpeichern(neu: Record<string, unknown>, meldung: string) {
    if (!betrieb || !istChef) return;
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('modul_einstellung').upsert(
      { owner_user_id: betrieb, modul: FS_MODUL, einstellung: neu, aktualisiert_am: new Date().toISOString() },
      { onConflict: 'owner_user_id,modul' },
    ).select('modul');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Die Einstellung wurde nicht gespeichert.'); return; }
    setOk(meldung); await lade();
  }

  function kontrolleStarten(z?: FahrerZeile) {
    setOk(null); setFehler(null);
    setForm({ mitarbeiterId: z?.mitarbeiterId ?? '', name: z?.name ?? '', klassen: z?.letzte?.klassen ?? '', dokumentBis: z?.letzte?.dokument_gueltig_bis ?? '', geprueftAm: tag, ergebnis: 'gueltig', bemerkung: '' });
  }

  async function speichern() {
    if (!form || !betrieb) return;
    const p = eingabePruefen({ mitarbeiterId: form.mitarbeiterId || null, name: form.name, klassen: form.klassen, dokumentBis: form.dokumentBis, geprueftAm: form.geprueftAm, ergebnis: form.ergebnis, bemerkung: form.bemerkung, intervall, heute: tag });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('fuehrerschein_kontrolle').insert({ ...p.zeile, owner_user_id: betrieb, geprueft_name: meinName.slice(0, 120) || null }).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) {
      setFehler(/row-level security/i.test(error?.message ?? '') ? 'Nicht gespeichert: Die Rechts-Freigabe „Führerscheinkontrolle" fehlt oder Ihnen fehlt das Schreibrecht für den Fuhrpark.' : 'Die Kontrolle wurde nicht gespeichert.');
      return;
    }
    setForm(null);
    setOk(`Kontrolle eingetragen. Nächste Kontrolle: ${de(p.zeile.naechste_am)}.`);
    await lade();
  }

  async function loeschen(id: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('fuehrerschein_kontrolle').delete().eq('id', id).select('id');
    setBusy(false); setLoeschFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — löschen kann nur die Geschäftsleitung.'); return; }
    setOk('Eintrag gelöscht.'); await lade();
  }

  const gesperrt = !freigabe.aktiv;

  return (
    <div style={s.page}>
      <a href="/dashboard/erp/fuhrpark" style={s.zurueck}>← Fuhrpark</a>
      <h1 style={s.h1}>🪪 Führerscheinkontrolle</h1>
      <p style={s.dim}>
        So geht&apos;s: Wer Mitarbeitern Firmenfahrzeuge überlässt, prüft regelmäßig, ob sie eine gültige Fahrerlaubnis haben. Sehen Sie sich den Führerschein
        im Original an und tragen Sie hier nur den Prüfvermerk ein: Datum, Klassen, Ablauf der Karte, Ergebnis. Keine Führerscheinnummer, keine Kopie.
        ARGONAUT OS rechnet die nächste Kontrolle aus (alle {intervall} Monate, früher, wenn die Karte vorher abläuft).
      </p>
      <FreigabeHinweis lage={freigabe} />

      {laden && <p style={s.dim}>Lädt …</p>}
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={{ ...s.zahl, color: anz.mangel + anz.ueberfaellig ? C.bad : C.text }}>{anz.mangel + anz.ueberfaellig}</b><span style={s.dim}>Mangel oder überfällig</span></div>
            <div style={s.kachel}><b style={{ ...s.zahl, color: anz.fehlt ? C.warn : C.text }}>{anz.fehlt}</b><span style={s.dim}>noch nie kontrolliert</span></div>
            <div style={s.kachel}><b style={{ ...s.zahl, color: anz.bald ? C.warn : C.text }}>{anz.bald}</b><span style={s.dim}>in 30 Tagen fällig</span></div>
            <div style={s.kachel}><b style={{ ...s.zahl, color: C.ok }}>{anz.ok}</b><span style={s.dim}>in Ordnung</span></div>
          </div>

          {!gesperrt && !form && <button type="button" style={s.btnGold} onClick={() => kontrolleStarten()}>＋ Kontrolle eintragen</button>}

          {form && !gesperrt && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>Kontrolle eintragen</b>
              <div style={s.raster}>
                <label style={s.feld}>Mitarbeiter
                  <select value={form.mitarbeiterId} style={s.eingabe} onChange={(e) => { const m = aktiveMa.find((x) => x.id === e.target.value); setForm({ ...form, mitarbeiterId: e.target.value, name: m ? maName(m) : form.name }); }}>
                    <option value="">— anderer Name —</option>
                    {aktiveMa.map((m) => <option key={m.id} value={m.id}>{maName(m)}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Name<input value={form.name} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label style={s.feld}>Geprüft am<input type="date" value={form.geprueftAm} max={tag} style={s.eingabe} onChange={(e) => setForm({ ...form, geprueftAm: e.target.value })} /></label>
                <label style={s.feld}>Klassen (z. B. B, BE)<input value={form.klassen} maxLength={60} placeholder={KLASSEN.slice(4, 7).join(', ')} style={s.eingabe} onChange={(e) => setForm({ ...form, klassen: e.target.value })} /></label>
                <label style={s.feld}>Karte gültig bis (Feld 4b)<input type="date" value={form.dokumentBis} style={s.eingabe} onChange={(e) => setForm({ ...form, dokumentBis: e.target.value })} /></label>
                <label style={s.feld}>Ergebnis
                  <select value={form.ergebnis} style={s.eingabe} onChange={(e) => setForm({ ...form, ergebnis: e.target.value === 'mangel' ? 'mangel' : 'gueltig' })}>
                    <option value="gueltig">Gültig, Klassen passen</option>
                    <option value="mangel">Mangel (abgelaufen, entzogen, Klasse fehlt …)</option>
                  </select>
                </label>
              </div>
              <label style={s.feld}>Bemerkung (ohne Führerscheinnummer)<input value={form.bemerkung} maxLength={300} style={s.eingabe} onChange={(e) => setForm({ ...form, bemerkung: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" style={s.btnGold} disabled={busy} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Prüfvermerk speichern'}</button>
                <button type="button" style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
              <p style={{ ...s.dim, fontSize: 12.5 }}>Ein gespeicherter Vermerk lässt sich nicht ändern (Nachweis). Bei einem Fehler löscht die Geschäftsleitung ihn und Sie tragen ihn neu ein.</p>
            </div>
          )}

          {uebersicht.length === 0 ? (
            <Leerzustand icon="🪪" titel="Noch keine Fahrer" text={istChef ? 'Fügen Sie unten die Mitarbeiter hinzu, die Firmenfahrzeuge fahren, oder tragen Sie direkt eine Kontrolle ein.' : 'Die Geschäftsleitung legt fest, wer Firmenfahrzeuge fährt.'} />
          ) : uebersicht.map((z) => (
            <div key={z.schluessel} style={{ ...s.box, borderColor: FARBE[z.stufe] }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <b style={{ flex: 1, minWidth: 180 }}>{z.name}</b>
                <span style={{ color: FARBE[z.stufe], fontWeight: 700, fontSize: 13.5 }}>{stufeText(z)}</span>
              </div>
              {z.letzte && (
                <div style={{ ...s.dim, margin: '4px 0 0' }}>
                  Zuletzt geprüft {de(z.letzte.geprueft_am)}{z.letzte.geprueft_name ? ` von ${z.letzte.geprueft_name}` : ''}
                  {z.letzte.klassen ? ` · Klassen ${z.letzte.klassen}` : ''}{z.letzte.dokument_gueltig_bis ? ` · Karte gültig bis ${de(z.letzte.dokument_gueltig_bis)}` : ''}
                  {` · nächste Kontrolle ${de(z.letzte.naechste_am)}`}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {!gesperrt && <button type="button" style={s.btnAus} onClick={() => kontrolleStarten(z)}>Kontrolle eintragen</button>}
                {z.anzahl > 0 && <button type="button" style={s.btnAus} onClick={() => setOffen(offen === z.schluessel ? null : z.schluessel)}>{offen === z.schluessel ? 'Verlauf schließen' : `Verlauf (${z.anzahl})`}</button>}
                {istChef && z.mitarbeiterId && fahrerIds.includes(z.mitarbeiterId) && (
                  <button type="button" style={s.btnAus} disabled={busy} onClick={() => void einstSpeichern({ ...einst, fahrer: fahrerIds.filter((x) => x !== z.mitarbeiterId) }, `${z.name} ist nicht mehr in der Fahrerliste.`)}>Aus der Fahrerliste nehmen</button>
                )}
              </div>
              {offen === z.schluessel && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                  {kontrollen.filter((k) => (z.mitarbeiterId ? k.mitarbeiter_id === z.mitarbeiterId : !k.mitarbeiter_id && k.person_name.trim().toLowerCase() === z.name.trim().toLowerCase())).map((k) => (
                    <li key={k.id}>
                      {de(k.geprueft_am)} · {k.ergebnis === 'mangel' ? <span style={{ color: C.bad }}>Mangel</span> : 'gültig'}{k.klassen ? ` · ${k.klassen}` : ''}{k.geprueft_name ? ` · ${k.geprueft_name}` : ''}{k.bemerkung ? ` · ${k.bemerkung}` : ''}
                      {istChef && k.id && (loeschFrage === k.id
                        ? <> · <button type="button" style={s.link} onClick={() => void loeschen(k.id as string)}>Ja, löschen</button> <button type="button" style={s.link} onClick={() => setLoeschFrage(null)}>Abbrechen</button></>
                        : <> · <button type="button" style={s.link} onClick={() => setLoeschFrage(k.id as string)}>löschen</button></>)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {istChef && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>Einstellungen (nur Geschäftsleitung)</b>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
                <label style={s.feld}>Fahrer hinzufügen
                  <select value={neuFahrer} style={s.eingabe} onChange={(e) => setNeuFahrer(e.target.value)}>
                    <option value="">— Mitarbeiter wählen —</option>
                    {aktiveMa.filter((m) => !fahrerIds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{maName(m)}</option>)}
                  </select>
                </label>
                <button type="button" style={s.btnAus} disabled={busy || !neuFahrer} onClick={() => { const id = neuFahrer; setNeuFahrer(''); void einstSpeichern({ ...einst, fahrer: [...fahrerIds, id] }, 'Fahrer hinzugefügt.'); }}>Hinzufügen</button>
                <label style={s.feld}>Kontrolle alle … Monate
                  <select value={intervall} style={s.eingabe} onChange={(e) => void einstSpeichern({ ...einst, fsIntervall: Number(e.target.value) }, 'Intervall gespeichert. Es gilt für neue Kontrollen.')}>
                    {Array.from({ length: INTERVALL_MAX - INTERVALL_MIN + 1 }, (_, i) => i + INTERVALL_MIN).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <p style={{ ...s.dim, fontSize: 12.5 }}>Üblich ist eine Kontrolle alle sechs Monate. Ein neues Intervall gilt für die nächste eingetragene Kontrolle.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1000, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 26, fontWeight: 800 },
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13.5 },
};
