'use client';

// ============================================================
// ARGONAUT OS · Block 1 · A4-3 + F1-3 + A3b-4 · Brennholz-Aufträge
//
// DIE SEITE RECHNET NICHTS.
//   auftragLogik baut die Positionen, positionsLogik summiert.
//   Diese Datei zeigt an und speichert. Dieselbe Zahl wie Preisauskunft,
//   API und PDF — weil alle durch dieselbe Rechenstelle gehen.
//
// PREISE SIND EINGEFROREN.
//   Beim Speichern wird der Preis in die Position geschrieben, nicht verwiesen.
//   Ändert sich die Preisliste, zeigt `preisAbweichung()` es an — und ändert
//   nichts. Ein Auftrag von gestern hat den Preis von gestern.
//
// AB "GELIEFERT" IST SCHLUSS.
//   Positionen lassen sich nicht mehr ändern. Ein Beleg, dessen Zeilen sich
//   nachträglich anpassen lassen, ist kein Beleg.
//
// F1-3: LIEFERSCHEIN UND RECHNUNG
//   Der Lieferschein zieht seine Daten aus den GESPEICHERTEN Positionen,
//   nicht aus dem Formular. Was gedruckt wird, ist das, was gespeichert ist.
//
//   Die Rechnung entsteht nur aus Status "geliefert" und nur einmal. Steht
//   sie, verschwindet der Knopf und ein Link tritt an seine Stelle.
//
// A3b-4: PAKETE
//   Ein Paket wird HINZUGEFÜGT, nicht statt der Ware gewählt. Es klappt auf,
//   seine Positionen erscheinen mit dem ANTEILIG VERTEILTEN Fixpreis.
//
//   Diese Zeilen sind schreibgeschützt: Wer an einem verteilten Fixpreis
//   herumtippt, zerstört die Summe. Wer etwas ändern will, entfernt das Paket
//   und fügt es neu hinzu.
//
//   Lieferschein und Rechnung sehen davon nichts. Für sie sind es Positionen
//   wie alle anderen.
//
// Pfad: app/dashboard/holz/auftraege/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { EINHEITEN, einheitKurz, formatZahl, type HolzEinheit } from '../../_components/holzLogik';
import { sortiereSortimente, anzeigeName, type Sortiment } from '../../_components/sortimentLogik';
import { bepreisteEinheiten, istVerkaufsfertig, type Preis, type Mengenrabatt } from '../../_components/preisLogik';
import type { AnfahrtKonfig, FahrtkostenStufe, DistanzQuelle } from '../../_components/anfahrtLogik';
import {
  ausKontakt, ausFirma, hatKoordinaten, verortungVeraltet, adresseEinzeilig, anschriftBlock,
  type KontaktQuelle, type FirmaQuelle, type Empfaenger,
} from '../../_components/empfaengerLogik';
import {
  baueAuftrag, preisAbweichung, statusInfo, erlaubteFolgeStatus, istBearbeitbar,
  feuchteProtokoll, STATUS_LISTE,
  type AuftragStatus,
} from '../../_components/auftragLogik';
import { eur, steuerAusweisZeilen, type Position } from '../../_components/positionsLogik';
import { lieferscheinPdf } from '../../_components/lieferscheinPdf';
import { klappeAuf, paketKurz, type Paket, type PaketPosition } from '../../_components/paketLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const STATUS_FARBE: Record<string, string> = {
  grau: C.textDim, cyan: C.cyan, gruen: C.green, gold: C.gold, rot: C.danger,
};

const K_FELDER = 'id, vorname, nachname, firma, firma_id, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse';
const F_FELDER = 'id, name, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse';

type AuftragRow = {
  id: string; nummer: string | null; status: string;
  kontakt_id: string | null; ziel_firma_id: string | null; empfaenger_name: string | null;
  liefer_strasse: string | null; liefer_plz: string | null; liefer_ort: string | null;
  entfernung_m: number | null; entfernung_quelle: string | null; entfernung_geschaetzt: boolean;
  restfeuchte_prozent: number | null; restfeuchte_gemessen_am: string | null;
  liefertermin: string | null; geliefert_am: string | null;
  notiz: string | null; interne_notiz: string | null;
  rechnung_id: string | null;
  erstellt_am: string;
};

type PositionRow = Position & { id: string; auftrag_id: string; sortiment_id: string | null; artikel_id: string | null };
type KundenEintrag = { art: 'kontakt' | 'firma'; empf: Empfaenger };
type Zusatz = { bezeichnung: string; menge: string; einheit: string; preis: string; steuer: string };

function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : '—';
}

export default function AuftraegePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const [auftraege, setAuftraege] = useState<AuftragRow[]>([]);
  const [sortimente, setSortimente] = useState<Sortiment[]>([]);
  const [preise, setPreise] = useState<Preis[]>([]);
  const [rabatte, setRabatte] = useState<Mengenrabatt[]>([]);
  const [konfig, setKonfig] = useState<AnfahrtKonfig | null>(null);
  const [stufen, setStufen] = useState<FahrtkostenStufe[]>([]);
  const [kunden, setKunden] = useState<KundenEintrag[]>([]);
  const [profil, setProfil] = useState<Record<string, string | null>>({});
  const [pakete, setPakete] = useState<Paket[]>([]);
  const [paketInhalte, setPaketInhalte] = useState<PaketPosition[]>([]);

  // --- Modal -------------------------------------------------------------
  const [modalAuf, setModalAuf] = useState(false);
  const [auftragId, setAuftragId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuftragStatus>('entwurf');
  const [nummer, setNummer] = useState<string | null>(null);
  const [kundeKey, setKundeKey] = useState('');
  const [freieKm, setFreieKm] = useState('');
  const [entfernung, setEntfernung] = useState<{ meter: number; quelle: DistanzQuelle; geschaetzt: boolean } | null>(null);
  const [entfernungLaeuft, setEntfernungLaeuft] = useState(false);

  const [sortimentId, setSortimentId] = useState('');
  const [einheit, setEinheit] = useState<HolzEinheit>('srm');
  const [menge, setMenge] = useState('8');

  const [zusatz, setZusatz] = useState<Zusatz[]>([]);
  /** Aufgeklappte Paketpositionen. Schreibgeschützt — der Fixpreis ist verteilt. */
  const [paketZeilen, setPaketZeilen] = useState<Position[]>([]);
  const [paketWahl, setPaketWahl] = useState('');
  const [liefertermin, setLiefertermin] = useState('');
  const [restfeuchte, setRestfeuchte] = useState('');
  const [notiz, setNotiz] = useState('');
  const [gespeichertePositionen, setGespeichertePositionen] = useState<PositionRow[]>([]);
  const [rechnungId, setRechnungId] = useState<string | null>(null);
  const [rechnungLaeuft, setRechnungLaeuft] = useState(false);

  const [speichert, setSpeichert] = useState(false);

  function melde(t: string) { setErfolg(t); setFehler(null); setTimeout(() => setErfolg(null), 3500); }

  // --- Laden -------------------------------------------------------------
  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); return; }
      setUid(id);

      const [aRes, sRes, pRes, rRes, kRes, stRes, kontRes, firmRes, profRes, pkRes, ppRes] = await Promise.all([
        supabase.from('holz_auftraege').select('*').eq('owner_user_id', id).order('erstellt_am', { ascending: false }),
        supabase.from('holz_sortiment').select('*').eq('owner_user_id', id),
        supabase.from('holz_preise').select('*').eq('owner_user_id', id),
        supabase.from('holz_mengenrabatt').select('*').eq('owner_user_id', id),
        supabase.from('anfahrt_konfig').select('*').eq('owner_user_id', id).maybeSingle(),
        supabase.from('fahrtkosten_staffel').select('*').eq('owner_user_id', id),
        supabase.from('kontakte').select(K_FELDER).eq('owner_user_id', id),
        supabase.from('firmen').select(F_FELDER).eq('owner_user_id', id),
        supabase.from('profiles').select(
          'firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb',
        ).eq('id', id).maybeSingle(),
        supabase.from('pakete').select('*').eq('owner_user_id', id).eq('aktiv', true).order('bezeichnung'),
        supabase.from('paket_positionen').select('*').eq('owner_user_id', id).order('position_nr'),
      ]);

      if (aRes.error) throw aRes.error;
      setAuftraege((aRes.data as AuftragRow[]) ?? []);
      setSortimente(sortiereSortimente((sRes.data as Sortiment[]) ?? []));
      setPreise((pRes.data as Preis[]) ?? []);
      setRabatte((rRes.data as Mengenrabatt[]) ?? []);
      setKonfig((kRes.data as AnfahrtKonfig) ?? null);
      setStufen((stRes.data as FahrtkostenStufe[]) ?? []);

      setProfil((profRes.data as Record<string, string | null>) ?? {});
      setPakete((pkRes.data as Paket[]) ?? []);
      setPaketInhalte((ppRes.data as unknown as PaketPosition[]) ?? []);
      setKunden([
        ...(((kontRes.data as unknown as KontaktQuelle[]) ?? []).map((k) => ({ art: 'kontakt' as const, empf: ausKontakt(k) }))),
        ...(((firmRes.data as unknown as FirmaQuelle[]) ?? []).map((f) => ({ art: 'firma' as const, empf: ausFirma(f) }))),
      ].sort((a, b) => a.empf.name.localeCompare(b.empf.name, 'de')));
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void alles(); }, [alles]);

  // --- Ableitungen -------------------------------------------------------
  const verkaufbar = useMemo(
    () => sortimente.filter((s) => s.aktiv && istVerkaufsfertig(preise, s.id)),
    [sortimente, preise],
  );
  const sortiment = useMemo(() => verkaufbar.find((s) => s.id === sortimentId) ?? null, [verkaufbar, sortimentId]);
  const moeglicheEinheiten = useMemo(
    () => (sortiment ? bepreisteEinheiten(preise, sortiment.id) : []),
    [sortiment, preise],
  );
  useEffect(() => {
    if (moeglicheEinheiten.length > 0 && !moeglicheEinheiten.includes(einheit)) setEinheit(moeglicheEinheiten[0]);
  }, [moeglicheEinheiten, einheit]);

  const kunde = useMemo(() => {
    if (!kundeKey) return null;
    const [art, id] = kundeKey.split(':');
    return kunden.find((k) => k.art === art && k.empf.id === id) ?? null;
  }, [kundeKey, kunden]);

  const bearbeitbar = istBearbeitbar(status);

  // --- Entfernung holen ---------------------------------------------------
  const entfernungHolen = useCallback(async () => {
    if (!kunde || !hatKoordinaten(kunde.empf) || verortungVeraltet(kunde.empf)) { setEntfernung(null); return; }
    setEntfernungLaeuft(true);
    try {
      const res = await fetch('/api/entfernung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ art: kunde.art, id: kunde.empf.id }),
      });
      const d = await res.json();
      if (res.ok && d?.ok) {
        setEntfernung({ meter: d.distanzMeter, quelle: d.quelle === 'ors' ? 'route' : 'luftlinie', geschaetzt: !!d.geschaetzt });
      } else setEntfernung(null);
    } catch { setEntfernung(null); }
    finally { setEntfernungLaeuft(false); }
  }, [kunde]);

  useEffect(() => { if (bearbeitbar && kunde) void entfernungHolen(); }, [kunde, bearbeitbar, entfernungHolen]);

  // --- Der Auftrag --------------------------------------------------------
  const freieKmZahl = num(freieKm);
  const distanz = useMemo(() => {
    if (kunde && entfernung) return { meter: entfernung.meter, quelle: entfernung.quelle };
    if (!kunde && freieKmZahl !== null && freieKmZahl >= 0) return { meter: freieKmZahl * 1000, quelle: 'manuell' as DistanzQuelle };
    return null;
  }, [kunde, entfernung, freieKmZahl]);

  const zusatzPositionen: Position[] = useMemo(
    () => zusatz
      .filter((z) => z.bezeichnung.trim() && num(z.menge) !== null && num(z.preis) !== null)
      .map((z) => ({
        art: 'leistung' as const,
        bezeichnung: z.bezeichnung.trim(),
        menge: num(z.menge) as number,
        einheit: z.einheit.trim() || 'Stk',
        einzelpreis_netto: num(z.preis) as number,
        steuersatz_prozent: num(z.steuer) ?? 19,
      })),
    [zusatz],
  );

  const mengeZahl = num(menge);

  /**
   * Pakete und freie Zusatzzeilen laufen beide über `zusatz` in baueAuftrag.
   * Die Paketzeilen tragen bereits ihren Anteil am Fixpreis — sie werden
   * nicht noch einmal gerechnet.
   */
  const alleZusatz = useMemo(
    () => [...paketZeilen, ...zusatzPositionen],
    [paketZeilen, zusatzPositionen],
  );

  const befund = useMemo(() => {
    // Ohne Ware, aber mit Paket: der Auftrag besteht nur aus dem Paket.
    const waren = sortiment && mengeZahl !== null && mengeZahl > 0
      ? [{ sortiment, menge: mengeZahl, einheit }]
      : [];
    if (waren.length === 0 && alleZusatz.length === 0) return null;

    return baueAuftrag({
      waren,
      preise, rabatte,
      distanzMeter: distanz?.meter ?? null,
      distanzQuelle: distanz?.quelle,
      konfig, stufen,
      zusatz: alleZusatz,
    });
  }, [sortiment, mengeZahl, einheit, preise, rabatte, distanz, konfig, stufen, alleZusatz]);

  /** Bei gespeicherten Aufträgen: hat sich die Preisliste seither geändert? */
  const abweichungen = useMemo(
    () => (auftragId && gespeichertePositionen.length > 0 ? preisAbweichung(gespeichertePositionen, preise) : []),
    [auftragId, gespeichertePositionen, preise],
  );

  // --- Öffnen -------------------------------------------------------------
  function neu() {
    setAuftragId(null); setNummer(null); setStatus('entwurf');
    setKundeKey(''); setFreieKm(''); setEntfernung(null);
    setSortimentId(''); setMenge('8'); setZusatz([]); setPaketZeilen([]); setPaketWahl('');
    setLiefertermin(''); setRestfeuchte(''); setNotiz('');
    setGespeichertePositionen([]); setRechnungId(null);
    setFehler(null); setModalAuf(true);
  }

  async function oeffne(a: AuftragRow) {
    setAuftragId(a.id); setNummer(a.nummer); setStatus(a.status as AuftragStatus);
    setKundeKey(a.kontakt_id ? `kontakt:${a.kontakt_id}` : a.ziel_firma_id ? `firma:${a.ziel_firma_id}` : '');
    setFreieKm(a.entfernung_m !== null && !a.kontakt_id && !a.ziel_firma_id ? String(a.entfernung_m / 1000) : '');
    setEntfernung(a.entfernung_m !== null
      ? { meter: Number(a.entfernung_m), quelle: (a.entfernung_quelle as DistanzQuelle) ?? 'manuell', geschaetzt: a.entfernung_geschaetzt }
      : null);
    setLiefertermin(a.liefertermin ?? '');
    setRestfeuchte(a.restfeuchte_prozent !== null ? String(a.restfeuchte_prozent) : '');
    setNotiz(a.notiz ?? '');
    setRechnungId(a.rechnung_id ?? null);
    setFehler(null); setModalAuf(true);

    const { data } = await supabase.from('holz_auftrag_positionen').select('*')
      .eq('auftrag_id', a.id).order('position_nr', { ascending: true });
    const pos = ((data as unknown as PositionRow[]) ?? []).map((p) => ({
      ...p,
      quelle_id: p.sortiment_id ?? p.artikel_id ?? null,
    }));
    setGespeichertePositionen(pos);

    // Ware und Zusatz zurück ins Formular
    const ware = pos.find((p) => p.art === 'sortiment');
    if (ware?.quelle_id) {
      setSortimentId(ware.quelle_id);
      setMenge(String(ware.menge));
      const e = EINHEITEN.find((x) => x.kurz === ware.einheit);
      if (e) setEinheit(e.wert);
    }
    setZusatz(pos.filter((p) => p.art === 'leistung').map((p) => ({
      bezeichnung: p.bezeichnung, menge: String(p.menge), einheit: p.einheit,
      preis: String(p.einzelpreis_netto), steuer: String(p.steuersatz_prozent),
    })));
    // Paketzeilen kommen fertig aus der DB — mit ihrem verteilten Fixpreis.
    setPaketZeilen(pos.filter((p) => p.art === 'paket').map((p) => ({
      art: 'paket' as const,
      quelle_id: p.quelle_id ?? null,
      bezeichnung: p.bezeichnung,
      detail: p.detail ?? null,
      menge: Number(p.menge),
      einheit: p.einheit,
      einzelpreis_netto: Number(p.einzelpreis_netto),
      steuersatz_prozent: Number(p.steuersatz_prozent),
      rabatt_prozent: null,
    })));
    setPaketWahl('');
  }

  // --- A3b-4: Paket hinzufügen --------------------------------------------
  /**
   * Klappt das Paket auf und übernimmt die Positionen MIT dem verteilten
   * Fixpreis. `art` wird auf 'paket' gesetzt — so erkennt man sie später
   * im Auftrag wieder, und sie lassen sich als Block entfernen.
   */
  function paketHinzufuegen() {
    if (!paketWahl) return;
    const paket = pakete.find((p) => p.id === paketWahl);
    if (!paket) return;

    const inhalt = paketInhalte.filter((x) => x.paket_id === paket.id);
    if (inhalt.length === 0) { setFehler('Dieses Paket enthält keine Positionen.'); return; }

    const b = klappeAuf(paket, inhalt);
    if (!b.ok) { setFehler(b.fehler.join(' ')); return; }

    setPaketZeilen((z) => [
      ...z,
      ...b.positionen.map((p) => ({
        ...p,
        art: 'paket' as const,
        quelle_id: paket.id,
        detail: `aus Paket „${paket.bezeichnung}"`,
        position_nr: null,
      })),
    ]);
    setPaketWahl('');
    if (b.gemischteSteuer) {
      melde('Paket hinzugefügt. Es enthält zwei Steuersätze — der Ausweis erfolgt getrennt.');
    }
  }

  /** Ein Paket wird als Block entfernt, nicht zeilenweise. */
  function paketEntfernen(paketId: string, bezeichnung: string) {
    if (!window.confirm(`Paket „${bezeichnung}" aus dem Auftrag entfernen?`)) return;
    setPaketZeilen((z) => z.filter((p) => p.quelle_id !== paketId));
  }

  /** Welche Pakete stecken im Auftrag? Für die Anzeige als Block. */
  const paketBloecke = useMemo(() => {
    const karte = new Map<string, { id: string; bezeichnung: string; zeilen: Position[] }>();
    for (const z of paketZeilen) {
      const id = z.quelle_id ?? '';
      const paket = pakete.find((p) => p.id === id);
      const eintrag = karte.get(id) ?? { id, bezeichnung: paket?.bezeichnung ?? 'Paket', zeilen: [] };
      eintrag.zeilen.push(z);
      karte.set(id, eintrag);
    }
    return [...karte.values()];
  }, [paketZeilen, pakete]);

  // --- F1-3: Lieferschein ------------------------------------------------
  /**
   * Druckt die GESPEICHERTEN Positionen, nicht das Formular.
   * Was auf dem Papier steht, ist das, was in der Datenbank steht — mit den
   * eingefrorenen Preisen und dem Restfeuchte-Protokoll dieser Lieferung.
   */
  function lieferscheinDrucken() {
    if (!auftragId || gespeichertePositionen.length === 0) {
      setFehler('Bitte den Auftrag zuerst speichern.');
      return;
    }

    const a = auftraege.find((x) => x.id === auftragId);
    const empf = kunde ? anschriftBlock(kunde.empf) : (a?.empfaenger_name ? [a.empfaenger_name] : null);

    const liefer = a && (a.liefer_strasse || a.liefer_ort)
      ? [a.liefer_strasse, [a.liefer_plz, a.liefer_ort].filter(Boolean).join(' ')].filter(Boolean) as string[]
      : null;

    const protokoll: string[] = [];
    const feuchte = feuchteProtokoll(a?.restfeuchte_prozent ?? null, a?.restfeuchte_gemessen_am ?? null);
    if (feuchte) protokoll.push(feuchte);

    lieferscheinPdf({
      nummer: a?.nummer ?? null,
      auftragsnummer: a?.nummer ?? null,
      lieferdatum: a?.geliefert_am ?? a?.liefertermin ?? null,
      firma: {
        name: profil.firma_name, strasse: profil.firma_strasse,
        plz_ort: [profil.firma_plz, profil.firma_ort].filter(Boolean).join(' ') || null,
        telefon: profil.firma_telefon, email: profil.firma_email, website: profil.firma_website,
        rechtsform: profil.firma_rechtsform, registergericht: profil.firma_registergericht, hrb: profil.firma_hrb,
      },
      empfaengerZeilen: empf,
      // Nur zeigen, wenn sie sich vom Empfänger unterscheidet.
      lieferanschrift: liefer && kunde && liefer.join() !== [kunde.empf.strasse, [kunde.empf.plz, kunde.empf.ort].filter(Boolean).join(' ')].filter(Boolean).join() ? liefer : null,
      positionen: gespeichertePositionen.map((p) => ({
        position_nr: p.position_nr,
        bezeichnung: p.bezeichnung,
        detail: p.detail ?? null,
        menge: Number(p.menge),
        einheit: p.einheit,
      })),
      protokoll: protokoll.length > 0 ? protokoll : null,
      notiz: a?.notiz ?? null,
      dateiname: a?.nummer ? `Lieferschein_${a.nummer}` : null,
    });
  }

  // --- F1-3: Rechnung erstellen ------------------------------------------
  async function rechnungErstellen() {
    if (!auftragId) return;

    if (!window.confirm(
      'Rechnung aus diesem Auftrag erstellen?\n\n' +
      'Die Positionen werden mit ihren eingefrorenen Preisen übernommen. ' +
      'Der Auftrag wird auf „Abgerechnet" gesetzt und lässt sich danach nicht mehr ändern.',
    )) return;

    setRechnungLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/rechnung-aus-brennholz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auftragId }),
      });
      const d = await res.json();

      if (!res.ok || !d?.rechnungId) {
        setFehler(d?.error ?? 'Die Rechnung konnte nicht erstellt werden.');
        return;
      }

      setRechnungId(d.rechnungId as string);
      setStatus('abgerechnet');
      await alles();

      melde(
        d.bereitsVorhanden
          ? 'Für diesen Auftrag gab es bereits eine Rechnung.'
          : `Rechnung erstellt: ${eur(Number(d.brutto ?? 0))} brutto.` +
            (d.hinweis ? ` ${d.hinweis}` : ''),
      );
    } catch {
      setFehler('Die Rechnung konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally { setRechnungLaeuft(false); }
  }

  // --- Speichern ----------------------------------------------------------
  async function speichern() {
    if (!uid || !befund || !befund.ok) return;

    const empf = kunde ? kunde.empf : null;
    const istNeu = !auftragId;

    if (!window.confirm(
      `${istNeu ? 'Auftrag anlegen' : 'Änderungen speichern'}?\n\n` +
      `${empf?.name ?? 'Ohne Kunde'}\n` +
      `${befund.positionen.length} Position(en) · ${eur(befund.summe.brutto)} brutto`,
    )) return;

    setSpeichert(true); setFehler(null);
    try {
      let id = auftragId;
      let nr = nummer;

      const kopf: Record<string, unknown> = {
        owner_user_id: uid,
        status,
        kontakt_id: kunde?.art === 'kontakt' ? kunde.empf.id : null,
        ziel_firma_id: kunde?.art === 'firma' ? kunde.empf.id : null,
        empfaenger_name: empf?.name ?? null,
        liefer_strasse: empf?.strasse ?? null,
        liefer_plz: empf?.plz ?? null,
        liefer_ort: empf?.ort ?? null,
        entfernung_m: distanz?.meter ?? null,
        entfernung_quelle: distanz?.quelle ?? null,
        entfernung_geschaetzt: befund.geschaetzt,
        restfeuchte_prozent: num(restfeuchte),
        restfeuchte_gemessen_am: num(restfeuchte) !== null ? new Date().toISOString() : null,
        liefertermin: liefertermin || null,
        notiz: notiz.trim() || null,
      };

      if (istNeu) {
        const { data: nrData } = await supabase.rpc('naechste_holz_auftragsnummer', { p_owner: uid });
        nr = (nrData as string) ?? null;
        const { data, error } = await supabase.from('holz_auftraege').insert({ ...kopf, nummer: nr }).select('id').single();
        if (error) throw error;
        id = data.id as string;
        setAuftragId(id); setNummer(nr);
      } else {
        const { error } = await supabase.from('holz_auftraege').update(kopf).eq('id', id);
        if (error) throw error;
      }

      // Positionen: alte löschen, neue schreiben. Kein Diff — bei zehn Zeilen
      // ist das schneller und fehlerfrei.
      if (bearbeitbar) {
        await supabase.from('holz_auftrag_positionen').delete().eq('auftrag_id', id);

        const zeilen = befund.positionen.map((p) => ({
          owner_user_id: uid,
          auftrag_id: id,
          position_nr: p.position_nr,
          art: p.art,
          sortiment_id: p.art === 'sortiment' ? p.quelle_id : null,
          // Paketzeilen merken sich ihr Paket — nur zum Wiederfinden.
          artikel_id: p.art === 'paket' ? p.quelle_id : null,
          bezeichnung: p.bezeichnung,
          detail: p.detail ?? null,
          menge: p.menge,
          einheit: p.einheit,
          einzelpreis_netto: p.einzelpreis_netto,   // eingefroren
          steuersatz_prozent: p.steuersatz_prozent,
          rabatt_prozent: p.rabatt_prozent ?? null,
        }));

        const { error } = await supabase.from('holz_auftrag_positionen').insert(zeilen);
        if (error) throw error;
      }

      // Positionen neu laden — sonst druckt der Lieferschein den alten Stand.
      if (id) {
        const { data } = await supabase.from('holz_auftrag_positionen').select('*')
          .eq('auftrag_id', id).order('position_nr', { ascending: true });
        setGespeichertePositionen((data as unknown as PositionRow[]) ?? []);
      }

      await alles();
      melde(istNeu ? `Auftrag ${nr} angelegt.` : 'Gespeichert.');
      if (istNeu) setModalAuf(false);
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  async function statusSetzen(neuStatus: AuftragStatus) {
    if (!auftragId) return;
    const label = statusInfo(neuStatus).label;
    const warnung = !istBearbeitbar(neuStatus)
      ? '\n\nAb diesem Status lassen sich die Positionen nicht mehr ändern.'
      : '';
    if (!window.confirm(`Status auf „${label}" setzen?${warnung}`)) return;

    setSpeichert(true);
    try {
      const patch: Record<string, unknown> = { status: neuStatus };
      if (neuStatus === 'geliefert') patch.geliefert_am = new Date().toISOString();
      const { error } = await supabase.from('holz_auftraege').update(patch).eq('id', auftragId);
      if (error) throw error;
      setStatus(neuStatus);
      await alles();
      melde(`Status: ${label}`);
    } catch (e: unknown) {
      setFehler('Status ändern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // ----------------------------------------------------------------------
  const offen = auftraege.filter((a) => a.status === 'entwurf' || a.status === 'bestaetigt').length;
  const zuLiefern = auftraege.filter((a) => a.status === 'bestaetigt').length;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Brennholz</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Aufträge</h1>
          <p style={styles.sub}>
            Kunde, Variante, Menge — Preis und Anfahrt erscheinen von selbst.
            Der Preis wird beim Speichern eingefroren und ändert sich nie wieder.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard/holz" style={styles.ghostBtn}>← Sortiment</a>
          <button onClick={neu} style={styles.goldBtn}>+ Neuer Auftrag</button>
        </div>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.okBox}>{erfolg}</div>}

      {!laden && (
        <div style={styles.zahlenGrid}>
          <Zahl label="Aufträge" wert={auftraege.length} farbe={C.cyan} />
          <Zahl label="Offen" wert={offen} farbe={offen ? C.warn : C.green} />
          <Zahl label="Zu liefern" wert={zuLiefern} farbe={zuLiefern ? C.cyan : C.textDim} />
        </div>
      )}

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Alle Aufträge</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : verkaufbar.length === 0 ? (
          <div style={styles.warnBox}>
            Es ist noch keine Variante <strong>mit Preis</strong> angelegt.
            {' '}<a href="/dashboard/holz" style={{ color: C.cyan }}>Zum Sortiment →</a>
          </div>
        ) : auftraege.length === 0 ? (
          <div style={styles.hint}>Noch kein Auftrag. Leg oben rechts den ersten an.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {auftraege.map((a) => {
              const si = statusInfo(a.status);
              return (
                <button key={a.id} onClick={() => oeffne(a)} style={styles.listItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_FARBE[si.farbe], flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {a.nummer ?? '—'} · {a.empfaenger_name ?? 'ohne Kunde'}
                      </div>
                      <div style={{ fontSize: 12, color: C.textDim }}>
                        {[a.liefer_ort, a.liefertermin ? `Termin ${datumHuebsch(a.liefertermin)}` : null, datumHuebsch(a.erstellt_am)]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: STATUS_FARBE[si.farbe], flexShrink: 0 }}>{si.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ MODAL ============ */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h2 style={styles.modalTitel}>{nummer ?? 'Neuer Auftrag'}</h2>
              <span style={{ color: STATUS_FARBE[statusInfo(status).farbe], fontSize: 13, fontWeight: 700 }}>
                {statusInfo(status).label}
              </span>
            </div>

            {!bearbeitbar && (
              <div style={styles.warnBox}>
                🔒 Ab Status „{statusInfo(status).label}" sind die Positionen gesperrt. Ein Beleg,
                dessen Zeilen sich nachträglich ändern lassen, ist kein Beleg.
              </div>
            )}

            {abweichungen.length > 0 && (
              <div style={styles.warnBox}>
                {abweichungen.map((a, i) => <div key={i} style={{ marginBottom: 4 }}>⚠ {a.text}</div>)}
              </div>
            )}

            {/* --- Kunde --- */}
            <div style={styles.sektion}>
              <span style={styles.sektionTitel}>1 · Kunde</span>
              <select style={{ ...styles.input, marginTop: 10 }} value={kundeKey} disabled={!bearbeitbar}
                onChange={(e) => setKundeKey(e.target.value)}>
                <option value="">— ohne Kunde, Entfernung von Hand —</option>
                {kunden.map((k) => (
                  <option key={`${k.art}:${k.empf.id}`} value={`${k.art}:${k.empf.id}`}>
                    {k.empf.name}{k.empf.ort ? ` · ${k.empf.ort}` : ''}{k.art === 'firma' ? ' (Firma)' : ''}
                  </option>
                ))}
              </select>

              {!kunde ? (
                <div style={{ marginTop: 12 }}>
                  <label style={styles.lbl}>Entfernung in km (optional)</label>
                  <input style={{ ...styles.input, maxWidth: 160 }} inputMode="decimal" value={freieKm}
                    disabled={!bearbeitbar} onChange={(e) => setFreieKm(e.target.value)} placeholder="42" />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>{adresseEinzeilig(kunde.empf) || 'Keine Anschrift'}</div>
                  {verortungVeraltet(kunde.empf) ? (
                    <div style={styles.warnBox}>⚠ Anschrift geändert — bitte neu verorten. Es wird keine Anfahrt berechnet.</div>
                  ) : !hatKoordinaten(kunde.empf) ? (
                    <div style={styles.warnBox}>⚠ Nicht verortet — die Anfahrt fehlt im Preis.</div>
                  ) : entfernungLaeuft ? (
                    <div style={styles.hint}>Entfernung wird ermittelt …</div>
                  ) : entfernung ? (
                    <div style={entfernung.geschaetzt ? styles.warnBox : styles.infoBox}>
                      <strong>{formatZahl(entfernung.meter / 1000, 1)} km</strong>
                      {entfernung.geschaetzt ? ' (geschätzt, Luftlinie)' : ' (Fahrstrecke)'}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* --- Ware --- */}
            <div style={styles.sektion}>
              <span style={styles.sektionTitel}>2 · Ware</span>
              <select style={{ ...styles.input, marginTop: 10 }} value={sortimentId} disabled={!bearbeitbar}
                onChange={(e) => setSortimentId(e.target.value)}>
                <option value="">— Variante wählen —</option>
                {verkaufbar.map((s) => <option key={s.id} value={s.id}>{anzeigeName(s)}</option>)}
              </select>

              {sortiment && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 110px' }}>
                    <label style={styles.lbl}>Menge</label>
                    <input style={styles.input} inputMode="decimal" value={menge} disabled={!bearbeitbar}
                      onChange={(e) => setMenge(e.target.value)} />
                  </div>
                  <div style={{ flex: '1 1 110px' }}>
                    <label style={styles.lbl}>Einheit</label>
                    <select style={styles.input} value={einheit} disabled={!bearbeitbar}
                      onChange={(e) => setEinheit(e.target.value as HolzEinheit)}>
                      {moeglicheEinheiten.map((e) => <option key={e} value={e}>{einheitKurz(e)}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* --- A3b-4: Pakete --- */}
            {(pakete.length > 0 || paketBloecke.length > 0) && (
              <div style={styles.sektion}>
                <span style={styles.sektionTitel}>3 · Pakete</span>
                <div style={{ fontSize: 12, color: C.textDim, margin: '6px 0 10px', lineHeight: 1.5 }}>
                  Ein Paket klappt in seine Positionen auf. Der Festpreis wird anteilig verteilt —
                  auf dem Beleg steht, was der Kunde bekommt.
                </div>

                {paketBloecke.map((b) => (
                  <div key={b.id} style={styles.paketBlock}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13.5 }}>📦 {b.bezeichnung}</strong>
                      {bearbeitbar && (
                        <button onClick={() => paketEntfernen(b.id, b.bezeichnung)} style={styles.xBtn}>✕ entfernen</button>
                      )}
                    </div>
                    {b.zeilen.map((z, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                        {formatZahl(z.menge, 2)} {z.einheit} {z.bezeichnung} · {eur(z.einzelpreis_netto)} · {z.steuersatz_prozent} % USt.
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, fontStyle: 'italic' }}>
                      Preise aus der Festpreis-Verteilung — nicht einzeln änderbar.
                    </div>
                  </div>
                ))}

                {bearbeitbar && pakete.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <select style={{ ...styles.input, flex: '1 1 220px' }} value={paketWahl}
                      onChange={(e) => setPaketWahl(e.target.value)}>
                      <option value="">— Paket wählen —</option>
                      {pakete.map((p) => <option key={p.id} value={p.id}>{p.bezeichnung} · {eur(p.fixpreis_netto)} netto</option>)}
                    </select>
                    <button onClick={paketHinzufuegen} disabled={!paketWahl} style={{ ...styles.miniBtn, opacity: paketWahl ? 1 : 0.5 }}>
                      + Hinzufügen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* --- Zusatzpositionen --- */}
            <div style={styles.sektion}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={styles.sektionTitel}>4 · Zusatzleistungen</span>
                {bearbeitbar && (
                  <button onClick={() => setZusatz((z) => [...z, { bezeichnung: '', menge: '1', einheit: 'Std', preis: '', steuer: '19' }])}
                    style={styles.miniBtn}>+ Zeile</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, margin: '6px 0 10px' }}>
                Schichten beim Kunden, Feuchtemessung vor Ort, alles Weitere.
              </div>
              {zusatz.map((z, i) => (
                <div key={i} style={styles.zusatzZeile}>
                  <input style={{ ...styles.posInput, flex: '2 1 160px' }} placeholder="Bezeichnung" value={z.bezeichnung} disabled={!bearbeitbar}
                    onChange={(e) => setZusatz((x) => x.map((y, j) => (j === i ? { ...y, bezeichnung: e.target.value } : y)))} />
                  <input style={{ ...styles.posInput, flex: '0 1 70px', textAlign: 'right' }} placeholder="1" value={z.menge} disabled={!bearbeitbar}
                    onChange={(e) => setZusatz((x) => x.map((y, j) => (j === i ? { ...y, menge: e.target.value } : y)))} />
                  <input style={{ ...styles.posInput, flex: '0 1 66px' }} placeholder="Std" value={z.einheit} disabled={!bearbeitbar}
                    onChange={(e) => setZusatz((x) => x.map((y, j) => (j === i ? { ...y, einheit: e.target.value } : y)))} />
                  <input style={{ ...styles.posInput, flex: '0 1 84px', textAlign: 'right' }} placeholder="45,00" value={z.preis} disabled={!bearbeitbar}
                    onChange={(e) => setZusatz((x) => x.map((y, j) => (j === i ? { ...y, preis: e.target.value } : y)))} />
                  <input style={{ ...styles.posInput, flex: '0 1 56px', textAlign: 'right' }} value={z.steuer} disabled={!bearbeitbar}
                    onChange={(e) => setZusatz((x) => x.map((y, j) => (j === i ? { ...y, steuer: e.target.value } : y)))} />
                  {bearbeitbar && (
                    <button onClick={() => setZusatz((x) => x.filter((_, j) => j !== i))} style={styles.xBtn}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* --- Ergebnis --- */}
            {befund && (
              <div style={styles.sektion}>
                <span style={styles.sektionTitel}>5 · Der Auftrag</span>
                {!befund.ok ? (
                  <div style={styles.err}>{befund.fehler.map((f, i) => <div key={i}>{f}</div>)}</div>
                ) : (
                  <>
                    <table style={{ ...styles.tabelle, marginTop: 10 }}>
                      <tbody>
                        {befund.positionen.map((p) => (
                          <tr key={p.position_nr}>
                            <td style={{ ...styles.td, color: C.textDim, width: 24 }}>{p.position_nr}</td>
                            <td style={styles.td}>
                              {p.bezeichnung}
                              <div style={{ fontSize: 11.5, color: C.textDim }}>
                                {formatZahl(p.menge, 2)} {p.einheit} × {eur(p.einzelpreis_netto)}
                                {p.rabatt_prozent ? ` − ${formatZahl(p.rabatt_prozent, 0)} %` : ''}
                                {` · ${p.steuersatz_prozent} % USt.`}
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={2} style={{ ...styles.td, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                              <span>Summe netto</span><span>{eur(befund.summe.netto)}</span>
                            </div>
                            {steuerAusweisZeilen(befund.summe).map((z, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: C.textDim, fontSize: 12.5, marginTop: 3 }}>
                                <span>{z.split(':')[0]}</span><span>{z.split(':')[1]}</span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16 }}>
                              <span>Gesamt brutto</span><span style={{ color: C.gold }}>{eur(befund.summe.brutto)}</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {befund.hinweise.length > 0 && (
                      <div style={{ fontSize: 12, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
                        {befund.hinweise.map((h, i) => <div key={i}>· {h}</div>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* --- Lieferung --- */}
            <div style={styles.sektion}>
              <span style={styles.sektionTitel}>6 · Lieferung</span>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={styles.lbl}>Liefertermin</label>
                  <input type="date" style={styles.input} value={liefertermin} onChange={(e) => setLiefertermin(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={styles.lbl}>Restfeuchte bei Lieferung %</label>
                  <input style={styles.input} inputMode="decimal" placeholder="18,5" value={restfeuchte}
                    onChange={(e) => setRestfeuchte(e.target.value)} />
                </div>
              </div>
              {num(restfeuchte) !== null && (
                <div style={styles.infoBox}>{feuchteProtokoll(num(restfeuchte), new Date().toISOString())}</div>
              )}
              <div style={{ marginTop: 12 }}>
                <label style={styles.lbl}>Notiz (erscheint auf dem Lieferschein)</label>
                <textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }} value={notiz}
                  onChange={(e) => setNotiz(e.target.value)} />
              </div>
            </div>

            {/* --- F1-3: Beleg & Rechnung --- */}
            {auftragId && (
              <div style={styles.sektion}>
                <span style={styles.sektionTitel}>7 · Beleg</span>

                {rechnungId ? (
                  <div style={styles.infoBox}>
                    ✓ <strong>Abgerechnet.</strong> Für diesen Auftrag besteht eine Rechnung.
                    {' '}<a href={`/dashboard/rechnungen/${rechnungId}`} style={{ color: C.cyan }}>Rechnung ansehen →</a>
                  </div>
                ) : status !== 'geliefert' ? (
                  <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8, lineHeight: 1.55 }}>
                    Die Rechnung entsteht aus dem Status <strong>Geliefert</strong>. Erst liefern,
                    dann abrechnen — sonst ändern sich die Positionen nach der Rechnung.
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8, lineHeight: 1.55 }}>
                    Die Positionen werden mit ihren <strong>eingefrorenen</strong> Preisen übernommen.
                    Danach ist der Auftrag gesperrt.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={lieferscheinDrucken}
                    disabled={gespeichertePositionen.length === 0 || speichert}
                    style={{ ...styles.ghostBtn, opacity: gespeichertePositionen.length === 0 ? 0.5 : 1 }}
                    title={gespeichertePositionen.length === 0 ? 'Auftrag zuerst speichern' : 'Lieferschein als PDF'}>
                    🖨 Lieferschein
                  </button>

                  {!rechnungId && status === 'geliefert' && (
                    <button onClick={rechnungErstellen} disabled={rechnungLaeuft || speichert}
                      style={{ ...styles.goldBtn, opacity: rechnungLaeuft ? 0.6 : 1 }}>
                      {rechnungLaeuft ? 'Erstellt …' : '→ Rechnung erstellen'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* --- Aktionen --- */}
            <div style={styles.modalAktionen}>
              {/* "Abgerechnet" wird nicht von Hand gesetzt — nur über die Rechnung.
                  Sonst gäbe es einen abgerechneten Auftrag ohne Beleg. */}
              {auftragId && erlaubteFolgeStatus(status)
                .filter((s) => s !== 'abgerechnet')
                .map((s) => (
                  <button key={s} onClick={() => statusSetzen(s)} disabled={speichert} style={styles.ghostBtn}>
                    → {statusInfo(s).label}
                  </button>
                ))}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={{ ...styles.ghostBtn, marginLeft: 'auto' }}>
                Schließen
              </button>
              <button onClick={speichern} disabled={speichert || !befund?.ok}
                style={{ ...styles.goldBtn, opacity: speichert || !befund?.ok ? 0.5 : 1 }}>
                {speichert ? 'Speichert …' : auftragId ? 'Speichern' : 'Auftrag anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Zahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={styles.zahlBox}>
      <div style={styles.zahlLabel}>{label}</div>
      <div style={{ ...styles.zahlWert, color: farbe }}>{wert}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 600, lineHeight: 1.5 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text },

  sektion: { marginTop: 16, padding: 16, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  sektionTitel: { fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  paketBlock: { background: C.navy2, border: `1px solid rgba(201,168,76,0.25)`, borderRadius: 10, padding: '11px 13px', marginBottom: 8 },
  zusatzZeile: { display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' },
  posInput: { boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit' },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' },

  tabelle: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 4px', fontSize: 13, verticalAlign: 'top' },

  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit' },

  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 13.5, padding: '12px 0' },
  err: { color: C.danger, fontSize: 13.5, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '11px 13px', marginTop: 12, lineHeight: 1.5 },
  okBox: { color: C.green, fontSize: 13.5, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '11px 13px', marginBottom: 16 },
  infoBox: { marginTop: 10, padding: '10px 12px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 9, fontSize: 12.5, color: C.text, lineHeight: 1.55 },
  warnBox: { marginTop: 10, marginBottom: 10, padding: '11px 13px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 12.5, color: C.text, lineHeight: 1.6 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 720, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: C.text, margin: 0 },
  modalAktionen: { display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
};
