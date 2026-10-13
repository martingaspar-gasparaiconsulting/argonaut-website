'use client';

// ============================================================
// ARGONAUT OS · Paket 355 (13.10.2026) · A4c Fachpaket Entsorgung, Teil 1
// Container-Dienst und Wiegeschein.
// Reiter: Aufträge (Stellen/Tauschen/Abholen, Tagesliste für die Fahrer) ·
// Container (Bestand: Hof / beim Kunden / voll / Reparatur) · Wiegescheine
// (Erst- und Zweitwägung, Netto von der Datenbank, Druck) · Abfallschlüssel
// (eigene Liste des Betriebs).
// Logik: lib/entsorgung.ts (tests/entsorgungP355).
// Datenbank: supabase-sql/p355-entsorgung-container-wiegeschein.sql (Modul „entsorgung").
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { uebersicht, kgText, tonnenText, type Container, type Auftrag, type Wiegeschein } from '@/lib/entsorgung';
import Leerzustand from '../_components/Leerzustand';
import { C, s, heute, type Kontakt } from './entsorgungUi';
import Auftraege, { type Vorlage } from './Auftraege';
import ContainerBestand from './ContainerBestand';
import Wiegescheine, { WIEGE_FELDER } from './Wiegescheine';
import SchluesselListe, { type Schluessel } from './Schluessel';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Reiter = 'auftraege' | 'container' | 'wiege' | 'schluessel';
const AUFTRAG_FELDER = 'id, art, termin, zeitfenster, kontakt_id, kunde_name, stellplatz, telefon, container_id, container_alt_id, groesse_m3, abfall_schluessel_id, fahrer, status, erledigt_am, notiz';

type KontaktRoh = { id: string; name?: string | null; firma?: string | null; vorname?: string | null; nachname?: string | null; telefon?: string | null; strasse?: string | null; plz?: string | null; ort?: string | null };
function kontaktAnzeige(k: KontaktRoh): Kontakt {
  const person = [k.vorname, k.nachname].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ');
  const anzeige = String(k.firma ?? '').trim() || String(k.name ?? '').trim() || person || 'ohne Namen';
  const adresse = [String(k.strasse ?? '').trim(), [k.plz, k.ort].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { id: k.id, anzeige: anzeige.slice(0, 120), telefon: k.telefon ?? null, adresse: adresse.slice(0, 300) };
}

export default function EntsorgungPage() {
  const tag = heute();
  const [container, setContainer] = useState<Container[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [scheine, setScheine] = useState<Wiegeschein[]>([]);
  const [schluessel, setSchluessel] = useState<Schluessel[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('auftraege');
  const [vorlage, setVorlage] = useState<Vorlage>(null);
  const [ausAuftrag, setAusAuftrag] = useState<Auftrag | null>(null);

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : null;
    setIstChef(!chefId || chefId === me);
    const seit = new Date(Date.now() - 60 * 86400000).toISOString();
    const seitTag = seit.slice(0, 10);
    const [c, a, ag, w, k] = await Promise.all([
      supabase.from('container_bestand').select('id, nummer, art, groesse_m3, status, kontakt_id, kunde_name, stellplatz, gestellt_seit, notiz, aktiv').order('nummer', { ascending: true }).limit(5000),
      supabase.from('container_auftrag').select(AUFTRAG_FELDER).gte('termin', seitTag).order('termin', { ascending: true }).limit(5000),
      supabase.from('container_auftrag').select(AUFTRAG_FELDER).eq('status', 'geplant').lt('termin', seitTag).limit(1000),
      supabase.from('wiegeschein').select(WIEGE_FELDER).gte('erstellt_am', seit).order('erstellt_am', { ascending: false }).limit(3000),
      supabase.from('abfall_schluessel').select('id, schluessel, gefaehrlich, bezeichnung, aktiv').order('schluessel', { ascending: true }).limit(2000),
    ]);
    if (c.error || a.error || w.error || k.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    setContainer(((c.data as unknown) as Container[]) ?? []);
    const alt = ag.error ? [] : (((ag.data as unknown) as Auftrag[]) ?? []);
    setAuftraege([...alt, ...(((a.data as unknown) as Auftrag[]) ?? [])]);
    setScheine(((w.data as unknown) as Wiegeschein[]) ?? []);
    setSchluessel(((k.data as unknown) as Schluessel[]) ?? []);
    // Kontakte: Fehler = leer, die Seite bleibt nutzbar
    const kt = await supabase.from('kontakte').select('id, name, firma, vorname, nachname, telefon, strasse, plz, ort').limit(3000);
    const kl = kt.error ? [] : (((kt.data as unknown) as KontaktRoh[]) ?? []).map(kontaktAnzeige);
    setKontakte(kl.sort((x, y) => x.anzeige.localeCompare(y.anzeige, 'de')));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Entsorgung …</p></div>;

  const ueb = uebersicht(container, auftraege, scheine, tag);
  const leer = !container.length && !auftraege.length && !scheine.length && !schluessel.length;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>♻️ Entsorgung</h1>
      <p style={s.dim}>
        So geht&apos;s: Unter „Abfallschlüssel" die Schlüssel eintragen, mit denen Ihr Betrieb arbeitet, und unter „Container" Ihren Bestand anlegen.
        Aufträge (Stellen, Tauschen, Abholen) planen Sie je Tag; mit „✓ erledigt" setzt ARGONAUT die Container um — der neue steht dann beim Kunden,
        der alte wieder auf dem Hof. Am Wiegeschein tragen Sie Brutto und Tara von Ihrer Waage ein; Nummer, Uhrzeit und Netto setzt ARGONAUT, und nach dem
        Abschluss bleibt der Schein, wie er ist.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Container und Wiegescheine sind noch nicht eingerichtet (SQL Paket 355 fehlt) oder das Recht „Entsorgung" fehlt.</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Container auf dem Hof</div><b style={s.zahl}>{ueb.hof}</b></div>
          <div style={s.kachel}><div style={s.dim}>Container beim Kunden</div><b style={s.zahl}>{ueb.kunde}{ueb.voll ? <span style={{ fontSize: 13, color: C.warn }}> · {ueb.voll} voll</span> : null}</b></div>
          <div style={s.kachel}><div style={s.dim}>Aufträge heute offen</div><b style={s.zahl}>{ueb.auftraegeHeute}{ueb.ueberfaellig ? <span style={{ fontSize: 13, color: C.bad }}> · {ueb.ueberfaellig} überfällig</span> : null}</b></div>
          <div style={s.kachel}><div style={s.dim}>Gewogen heute (netto)</div><b style={s.zahl}>{ueb.scheineHeute ? tonnenText(ueb.nettoHeute) : '—'}</b><span style={s.klein}>{ueb.scheineHeute} Scheine{ueb.scheineHeute ? ` · ${kgText(ueb.nettoHeute)}` : ''}</span></div>
        </div>

        {leer && (
          <Leerzustand icon="♻️" titel="Noch nichts angelegt"
            text="Container, Aufträge und Wiegescheine hängen an Ihrer eigenen Liste der Abfallschlüssel und Ihrem Containerbestand."
            schritte={['Reiter „Abfallschlüssel": z. B. 17 09 04 Gemischte Bau- und Abbruchabfälle', 'Reiter „Container": Nummer, Art und Größe', '„+ Neuer Auftrag": Stellen beim Kunden planen und erledigen']} />
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 12px' }}>
          <button style={reiter === 'auftraege' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('auftraege')}>🚛 Aufträge</button>
          <button style={reiter === 'container' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('container')}>🗑️ Container ({container.filter((c) => c.aktiv).length})</button>
          <button style={reiter === 'wiege' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('wiege')}>⚖️ Wiegescheine</button>
          <button style={reiter === 'schluessel' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('schluessel')}>🏷️ Abfallschlüssel ({schluessel.filter((x) => x.aktiv).length})</button>
        </div>

        {reiter === 'auftraege' && <Auftraege supabase={supabase} auftraege={auftraege} container={container} schluessel={schluessel} kontakte={kontakte} heute={tag}
          istChef={istChef} vorlage={vorlage} melde={melde} onGeaendert={lade} onWiegen={(a) => { setAusAuftrag(a); setReiter('wiege'); melde(null); }} />}
        {reiter === 'container' && <ContainerBestand supabase={supabase} container={container} heute={tag} istChef={istChef} melde={melde} onGeaendert={lade}
          onAuftrag={(art, c) => { setVorlage({ art, container: c }); setReiter('auftraege'); melde(null); }} />}
        {reiter === 'wiege' && <Wiegescheine supabase={supabase} scheine={scheine} container={container} schluessel={schluessel} kontakte={kontakte} istChef={istChef}
          ausAuftrag={ausAuftrag} melde={melde} onGeaendert={lade} />}
        {reiter === 'schluessel' && <SchluesselListe supabase={supabase} liste={schluessel} istChef={istChef} melde={melde} onGeaendert={lade} />}
      </>)}
    </div>
  );
}
