'use client';

// ============================================================
// ARGONAUT OS · Paket 263 · K4 Ankauf und Bewertung (Teil 1) — Ankaufsakte
// Reiter: Fahrzeug und Verkäufer · Prüfprotokoll · Schäden (Foto + Markierung)
// · Bewertung (Höchstpreis, Angebot) · Abschluss (in den Bestand übernehmen).
// Pfad: app/dashboard/kfz/ankauf/[id]/page.tsx — erbt die Freigabe von
// /dashboard/kfz (Modul „kfz"). Schadenfotos im Speicherordner
// „fahrzeug-medien" unter <Betrieb>/ankauf/<Ankauf>/ (Regeln aus Paket 262).
// Paket 264 (K4 Teil 2): „🖨 Ankaufschein (PDF)" im Reiter Abschluss; Anfragen aus dem
// Online-Formular (Quelle „online") mit Hinweis. Andockpunkt K6: Inzahlungnahme am Verkauf.
// Paket 307 (FM3): beim Ankaufen werden die Fahrzeugfotos der Fahrzeugmappe gleich in die
// Fahrzeugakte kopiert (weitere Auswahl in der Karte „Fahrzeugmappe").
// Paket 308 (FM4): Reiter „Bewertung" mit Marktvergleich, DAT/Schwacke und Bewertungs-Empfehlung;
// beim Ankaufen gehen Vergleiche und DAT/Schwacke-Werte mit an das Bestandsfahrzeug.
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { verkleinereBild } from '@/lib/bildKlein';
import { finPruefen, ezAusEingabe, ezText, euro, naechsteNr } from '@/lib/kfzBestand';
import { vorlageFuer, mitKunde, type KundenEinstellung } from '@/lib/branchenVorlage';
import { MEDIEN_BUCKET, pruefeMedium, endungFuer } from '@/lib/kfzMedien';
import {
  ANKAUF_STATUS, QUELLEN, PRUEFPUNKTE, BEREICHE, SCHADEN_ARTEN, STUFEN, pruefBereinigen, pruefStand,
  richtwerteMit, schadenBereinigen, schadenKosten, schadenSumme, bewertung, angebotAmpel, zuBestand,
  schadenFotoPfad, ankaufscheinInhalt, type Pruefstand, type Schaden, type Stufe, type Richtwerte, type Firmenkopf,
} from '@/lib/kfzAnkauf';
import { ankaufscheinPdf } from '@/lib/kfzAnkaufPdf';
import FotoMarkierung from '../../../bautagebuch/FotoMarkierung';
import MappeKarte from './MappeKarte';
import EmpfehlungKarte from './EmpfehlungKarte';
import KfzMarkt from '../../bestand/KfzMarkt';
import KfzBewertung from '../../bestand/KfzBewertung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8',
};
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Ankauf = {
  id: string; owner_user_id: string; nr: string | null; status: string; quelle: string;
  verkaeufer_art: string; verkaeufer_name: string | null; verkaeufer_firma: string | null; verkaeufer_anschrift: string | null;
  verkaeufer_tel: string | null; verkaeufer_email: string | null; ausweis_geprueft: boolean;
  marke: string | null; modell: string | null; variante: string | null; fin: string | null; kennzeichen: string | null;
  erstzulassung: string | null; km_stand: number | null; leistung_kw: number | null; kraftstoff: string | null; farbe: string | null;
  vorbesitzer: number | null; hu_bis: string | null; schluessel: number | null; serviceheft: string | null;
  unfall_angabe: string | null; unfall_text: string | null; pruefung: unknown; schaeden: unknown;
  ziel_vk: number | null; aufbereitung: number | null; sonstige_kosten: number | null; standtage_plan: number | null; marge: number | null;
  angebot: number | null; ankaufpreis: number | null; angekauft_am: string | null; bestand_id: string | null; notiz: string | null;
  erstellt_am: string; aktualisiert_am: string;
  historie_befund?: unknown; empfehlung?: unknown;
  bewertung_anbieter?: string | null; bewertung_ek?: number | null; bewertung_vk?: number | null; bewertung_am?: string | null; bewertung_url?: string | null;
};
type Reiter = 'fahrzeug' | 'pruefung' | 'schaeden' | 'bewertung' | 'abschluss';
const REITER: [Reiter, string][] = [['fahrzeug', 'Fahrzeug und Verkäufer'], ['pruefung', 'Prüfprotokoll'], ['schaeden', 'Schäden'], ['bewertung', 'Bewertung'], ['abschluss', 'Abschluss']];

function heute(): string { return new Date().toISOString().slice(0, 10); }
function t(v: string | number | null | undefined): string { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
function nurText(v: string): string | null { const x = v.trim(); return x ? x : null; }
function ganz(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : Math.round(n); }
function betrag(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : n; }

type FzForm = Record<'verkaeufer_art' | 'verkaeufer_name' | 'verkaeufer_firma' | 'verkaeufer_anschrift' | 'verkaeufer_tel' | 'verkaeufer_email' | 'quelle'
  | 'marke' | 'modell' | 'variante' | 'fin' | 'kennzeichen' | 'ez' | 'km' | 'kw' | 'kraftstoff' | 'farbe' | 'vorbesitzer' | 'hu_bis'
  | 'schluessel' | 'serviceheft' | 'unfall_angabe' | 'unfall_text' | 'notiz', string>;

export default function AnkaufAktePage() {
  const params = useParams();
  const id = String((params as Record<string, string | string[]>)?.id ?? '');
  const [a, setA] = useState<Ankauf | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [richtwerte, setRichtwerte] = useState<Richtwerte>(richtwerteMit(null));
  const [standkostenTag, setStandkostenTag] = useState<number>(0);
  const [reiter, setReiter] = useState<Reiter>('fahrzeug');
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [fz, setFz] = useState<FzForm | null>(null);
  const [pruef, setPruef] = useState<Record<string, Pruefstand>>({});
  const [schaeden, setSchaeden] = useState<Schaden[]>([]);
  const [neuS, setNeuS] = useState<{ bereich: string; art: string; stufe: Stufe; kosten: string; notiz: string }>({ bereich: BEREICHE[0], art: 'kratzer', stufe: 'leicht', kosten: '', notiz: '' });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [fotoBusy, setFotoBusy] = useState<string | null>(null);
  const [markieren, setMarkieren] = useState<{ schadenId: string; pfad: string; blob: Blob } | null>(null);
  const [bew, setBew] = useState({ ziel_vk: '', aufbereitung: '', sonstige: '', standtage: '', marge: '', angebot: '' });
  const [abs, setAbs] = useState({ ankaufpreis: '', angekauft_am: heute(), ausweis: false });
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [marktNeu, setMarktNeu] = useState(0);

  const lade = useCallback(async () => {
    if (!id) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    const { data, error } = await supabase.from('kfz_ankauf').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setFehler(error ? 'Der Ankauf lässt sich nicht laden. Fehlt SQL Paket 263 oder das Recht „KFZ"?' : 'Diesen Ankauf gibt es nicht (mehr).'); setLaden(false); return; }
    const x = data as unknown as Ankauf;
    setA(x); setIstChef(!!uid && uid === x.owner_user_id);
    setFz({
      verkaeufer_art: x.verkaeufer_art, verkaeufer_name: x.verkaeufer_name ?? '', verkaeufer_firma: x.verkaeufer_firma ?? '', verkaeufer_anschrift: x.verkaeufer_anschrift ?? '',
      verkaeufer_tel: x.verkaeufer_tel ?? '', verkaeufer_email: x.verkaeufer_email ?? '', quelle: x.quelle,
      marke: x.marke ?? '', modell: x.modell ?? '', variante: x.variante ?? '', fin: x.fin ?? '', kennzeichen: x.kennzeichen ?? '',
      ez: x.erstzulassung ? ezText(x.erstzulassung) : '', km: t(x.km_stand), kw: t(x.leistung_kw), kraftstoff: x.kraftstoff ?? '', farbe: x.farbe ?? '',
      vorbesitzer: t(x.vorbesitzer), hu_bis: x.hu_bis ?? '', schluessel: t(x.schluessel), serviceheft: x.serviceheft ?? '',
      unfall_angabe: x.unfall_angabe ?? '', unfall_text: x.unfall_text ?? '', notiz: x.notiz ?? '',
    });
    setPruef(pruefBereinigen(x.pruefung));
    const sch = schadenBereinigen(x.schaeden);
    setSchaeden(sch);
    setBew({ ziel_vk: t(x.ziel_vk), aufbereitung: t(x.aufbereitung), sonstige: t(x.sonstige_kosten), standtage: t(x.standtage_plan), marge: t(x.marge), angebot: t(x.angebot) });
    setAbs({ ankaufpreis: t(x.ankaufpreis ?? x.angebot), angekauft_am: x.angekauft_am ?? heute(), ausweis: !!x.ausweis_geprueft });
    const [e1, e2, pr] = await Promise.all([
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', x.owner_user_id).eq('modul', 'kfz-ankauf').maybeSingle(),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', x.owner_user_id).eq('modul', 'kfz-bestand').maybeSingle(),
      supabase.from('profiles').select('branche').eq('id', x.owner_user_id).maybeSingle(),
    ]);
    setRichtwerte(richtwerteMit(((e1.data as { einstellung?: { richtwerte?: unknown } } | null)?.einstellung)?.richtwerte));
    const v = vorlageFuer('kfz-bestand', ((pr.data as { branche?: string | null } | null)?.branche) ?? null);
    const vk = v ? mitKunde(v, ((e2.data as { einstellung?: KundenEinstellung } | null)?.einstellung) ?? null) : null;
    setStandkostenTag(vk?.standkostenTag ?? 0);
    const pfade = sch.flatMap((y) => y.fotos);
    if (pfade.length) {
      const { data: su } = await supabase.storage.from(MEDIEN_BUCKET).createSignedUrls(pfade, 3600);
      const m: Record<string, string> = {};
      (su ?? []).forEach((z) => { if (z.path && z.signedUrl) m[z.path] = z.signedUrl; });
      setUrls(m);
    } else setUrls({});
    setLaden(false);
  }, [id]);

  useEffect(() => { void lade(); }, [lade]);
  // Paket 306: Antwort aus der Fahrzeugmappe ändert Status/Angebot in der Datenbank -> Akte neu laden
  useEffect(() => { const neu = () => { void lade(); }; window.addEventListener('kfz-ankauf-neu', neu); return () => window.removeEventListener('kfz-ankauf-neu', neu); }, [lade]);

  async function speichern(patch: Record<string, unknown>, meldung: string): Promise<boolean> {
    if (!a) return false;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_ankauf').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"? Bitte Eingaben prüfen.'); return false; }
      setOk(meldung); await lade(); return true;
    } finally { setBusy(false); }
  }

  const summe = useMemo(() => schadenSumme(schaeden, richtwerte), [schaeden, richtwerte]);
  const b = useMemo(() => bewertung({
    zielVk: betrag(bew.ziel_vk), schaeden: summe, aufbereitung: betrag(bew.aufbereitung), sonstige: betrag(bew.sonstige),
    standtagePlan: ganz(bew.standtage), standkostenTag, marge: betrag(bew.marge), verkaeuferArt: fz?.verkaeufer_art ?? a?.verkaeufer_art ?? 'privat',
  }), [bew, summe, standkostenTag, fz, a]);
  const ampel = angebotAmpel(betrag(bew.angebot), b.maxAnkauf);

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  if (!a || !fz) return <div style={s.page}><a href="/dashboard/kfz/ankauf" style={s.zurueck}>← Zu den Ankäufen</a>{fehler && <div style={s.fehler}>{fehler}</div>}</div>;

  const st = ANKAUF_STATUS.find((x) => x.key === a.status) ?? { label: a.status, farbe: 'dim' as const };
  const ps = pruefStand(pruef);
  const titel = [a.marke, a.modell, a.variante].filter(Boolean).join(' ') || 'Fahrzeug';
  const abgeschlossen = a.status === 'angekauft' || a.status === 'abgelehnt';

  async function fzSpeichern() {
    if (!fz) return;
    const f = finPruefen(fz.fin);
    if (!f.ok) { setFehler(f.fehler); return; }
    const ez = fz.ez.trim() ? ezAusEingabe(fz.ez) : null;
    if (fz.ez.trim() && !ez) { setFehler('Erstzulassung bitte als MM/JJJJ eintragen, z. B. 03/2021.'); return; }
    const vb = ganz(fz.vorbesitzer); const sl = ganz(fz.schluessel);
    await speichern({
      verkaeufer_art: fz.verkaeufer_art, quelle: fz.quelle, verkaeufer_name: nurText(fz.verkaeufer_name), verkaeufer_firma: nurText(fz.verkaeufer_firma),
      verkaeufer_anschrift: nurText(fz.verkaeufer_anschrift), verkaeufer_tel: nurText(fz.verkaeufer_tel), verkaeufer_email: nurText(fz.verkaeufer_email),
      marke: nurText(fz.marke), modell: nurText(fz.modell), variante: nurText(fz.variante), fin: f.fin, kennzeichen: nurText(fz.kennzeichen.toUpperCase()),
      erstzulassung: ez, km_stand: ganz(fz.km), leistung_kw: ganz(fz.kw), kraftstoff: nurText(fz.kraftstoff), farbe: nurText(fz.farbe),
      vorbesitzer: vb, hu_bis: fz.hu_bis || null, schluessel: sl, serviceheft: fz.serviceheft || null,
      unfall_angabe: fz.unfall_angabe || null, unfall_text: fz.unfall_angabe === 'ja' ? nurText(fz.unfall_text) : null, notiz: nurText(fz.notiz),
    }, 'Fahrzeug und Verkäufer gespeichert.');
  }

  async function schaedenSpeichern(liste: Schaden[], meldung: string) {
    setSchaeden(liste);
    await speichern({ schaeden: liste }, meldung);
  }

  function schadenNeu() {
    const k = neuS.kosten.trim() ? betrag(neuS.kosten) : null;
    if (neuS.kosten.trim() && k === null) { setFehler('Der Betrag ist keine gültige Zahl.'); return; }
    const neu: Schaden = { id: `s${Date.now().toString(36)}`, bereich: neuS.bereich, art: neuS.art, stufe: neuS.stufe, kosten: k, notiz: neuS.notiz.trim().slice(0, 300), fotos: [] };
    void schaedenSpeichern([...schaeden, neu], 'Schaden erfasst. Fotos können Sie jetzt am Schaden hinzufügen.');
    setNeuS({ ...neuS, kosten: '', notiz: '' });
  }

  async function fotoHoch(schadenId: string, datei: File | null | undefined) {
    if (!a || !datei) return;
    const p = pruefeMedium('foto', datei.name, datei.type, datei.size);
    if (!p.ok) { setFehler(p.fehler); return; }
    setFotoBusy(schadenId); setFehler(null);
    try {
      const blob = await verkleinereBild(datei, 2400, 0.85);
      const typ = blob.type || datei.type || 'image/jpeg';
      const pfad = schadenFotoPfad(a.owner_user_id, a.id, endungFuer(typ, datei.name), Date.now(), Math.random().toString(36).slice(2));
      if (!pfad) throw new Error('Ablageort ungültig.');
      const { error } = await supabase.storage.from(MEDIEN_BUCKET).upload(pfad, blob, { upsert: false, contentType: typ });
      if (error) throw new Error('Hochladen nicht erlaubt oder fehlgeschlagen (Schreibrecht „KFZ"? SQL Paket 262?).');
      const liste = schaeden.map((x) => (x.id === schadenId ? { ...x, fotos: [...x.fotos, pfad].slice(0, 10) } : x));
      await schaedenSpeichern(liste, 'Foto gespeichert. Mit „✎ markieren" zeigen Sie den Schaden auf dem Bild.');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Foto konnte nicht hochgeladen werden.');
    } finally { setFotoBusy(null); }
  }

  async function markierenOeffnen(schadenId: string, pfad: string) {
    const { data, error } = await supabase.storage.from(MEDIEN_BUCKET).download(pfad);
    if (error || !data) { setFehler('Foto konnte nicht geöffnet werden.'); return; }
    setMarkieren({ schadenId, pfad, blob: data });
  }

  async function markiertSpeichern(jpeg: Blob) {
    if (!a || !markieren) return;
    const pfad = schadenFotoPfad(a.owner_user_id, a.id, 'jpg', Date.now(), 'markiert');
    if (!pfad) throw new Error('Ablageort ungültig.');
    const { error } = await supabase.storage.from(MEDIEN_BUCKET).upload(pfad, jpeg, { upsert: false, contentType: 'image/jpeg' });
    if (error) throw new Error('Hochladen fehlgeschlagen.');
    const liste = schaeden.map((x) => (x.id === markieren.schadenId ? { ...x, fotos: [...x.fotos, pfad].slice(0, 10) } : x));
    setMarkieren(null);
    await schaedenSpeichern(liste, 'Markierte Fassung gespeichert. Das Original bleibt erhalten.');
  }

  async function schadenWeg(sId: string) {
    const weg = schaeden.find((x) => x.id === sId);
    setLoeschFrage(null);
    const ok2 = await speichern({ schaeden: schaeden.filter((x) => x.id !== sId) }, 'Schaden entfernt.');
    if (ok2 && weg?.fotos.length) await supabase.storage.from(MEDIEN_BUCKET).remove(weg.fotos);
  }

  async function fotoWeg(sId: string, pfad: string) {
    setLoeschFrage(null);
    const ok2 = await speichern({ schaeden: schaeden.map((x) => (x.id === sId ? { ...x, fotos: x.fotos.filter((p) => p !== pfad) } : x)) }, 'Foto entfernt.');
    if (ok2) await supabase.storage.from(MEDIEN_BUCKET).remove([pfad]);
  }

  async function bewSpeichern(alsAngebot: boolean) {
    const angebot = betrag(bew.angebot);
    if (alsAngebot && angebot === null) { setFehler('Bitte zuerst einen Angebotspreis eintragen.'); return; }
    await speichern({
      ziel_vk: betrag(bew.ziel_vk), aufbereitung: betrag(bew.aufbereitung), sonstige_kosten: betrag(bew.sonstige),
      standtage_plan: ganz(bew.standtage), marge: betrag(bew.marge), angebot,
      ...(alsAngebot && a && a.status === 'offen' ? { status: 'angeboten' } : {}),
    }, alsAngebot ? 'Angebot gespeichert, Status „Angebot abgegeben".' : 'Bewertung gespeichert.');
  }

  async function ankaufen() {
    if (!a) return;
    const preis = betrag(abs.ankaufpreis);
    if (preis === null) { setFehler('Bitte den vereinbarten Ankaufspreis eintragen.'); return; }
    if (a.bestand_id) { setFehler('Dieses Fahrzeug ist schon im Bestand.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error: e1 } = await supabase.from('kfz_ankauf').update({ ankaufpreis: preis, angekauft_am: abs.angekauft_am || heute(), ausweis_geprueft: abs.ausweis, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (e1) { setFehler('Speichern fehlgeschlagen (Schreibrecht „KFZ"?).'); return; }
      const datensatz = zuBestand({ ...a, ankaufpreis: preis, ziel_vk: betrag(bew.ziel_vk) ?? a.ziel_vk, schaeden, aufbereitung: betrag(bew.aufbereitung) ?? a.aufbereitung }, abs.angekauft_am || heute());
      let neuId: string | null = null;
      for (let versuch = 0; versuch < 2 && !neuId; versuch++) {
        const { data: nrs } = await supabase.from('kfz_bestand').select('interne_nr').eq('owner_user_id', a.owner_user_id);
        const interne_nr = naechsteNr((((nrs as unknown) as { interne_nr: string | null }[]) ?? []).map((x) => x.interne_nr));
        const { data, error } = await supabase.from('kfz_bestand').insert({ ...datensatz, owner_user_id: a.owner_user_id, interne_nr }).select('id').single();
        if (!error && data) neuId = (data as { id: string }).id;
        else if (versuch === 1) { setFehler('Das Fahrzeug ließ sich nicht im Bestand anlegen. Ist SQL Paket 261 ausgeführt?'); return; }
      }
      const { error: e2 } = await supabase.from('kfz_ankauf').update({ status: 'angekauft', bestand_id: neuId, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (e2) { setFehler('Im Bestand angelegt, aber der Ankauf konnte nicht abgeschlossen werden. Bitte Seite neu laden.'); return; }
      // Paket 308: Marktvergleiche des Ankaufs gelten auch am Bestandsfahrzeug (Fehler ändern nichts am Ankauf).
      await supabase.from('kfz_marktvergleich').update({ bestand_id: neuId }).eq('ankauf_id', a.id).is('bestand_id', null);
      // Paket 307: Fotos aus der Fahrzeugmappe gleich mitnehmen (Fehler hier ändern nichts am Ankauf).
      let mappeText = '';
      if (a.quelle === 'online') {
        try {
          const r = await fetch('/api/kfz/fahrzeugmappe/uebernehmen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ankauf: a.id }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && (Number(j.fotos) || Number(j.videos))) mappeText = ` ${String(j.text ?? '')}`;
          else if (!r.ok && r.status !== 404) mappeText = ' Die Fotos der Fahrzeugmappe bitte in der Karte „Fahrzeugmappe" übernehmen.';
        } catch { mappeText = ' Die Fotos der Fahrzeugmappe bitte in der Karte „Fahrzeugmappe" übernehmen.'; }
        window.dispatchEvent(new Event('kfz-mappe-neu'));
      }
      setOk(`Angekauft und in den Bestand übernommen.${mappeText}`); await lade();
    } finally { setBusy(false); }
  }

  async function scheinDrucken() {
    if (!a) return;
    setFehler(null);
    let firma: Firmenkopf | null = null;
    try {
      const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as { firma?: Record<string, string | null> };
        const x = j.firma ?? {};
        firma = { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null };
      }
    } catch { firma = null; }
    const preis = betrag(abs.ankaufpreis) ?? a.ankaufpreis;
    const inhalt = ankaufscheinInhalt({ ...a, ankaufpreis: preis, schaeden }, firma, heute());
    ankaufscheinPdf(inhalt, `Ankaufschein-${a.nr ?? 'Ankauf'}.pdf`);
    if (!firma?.name) setOk('Ankaufschein erstellt. Ihre Firmendaten fehlen darin (Einstellungen → Firmendaten oder Recht für Rechnungen) — Ankäufer bitte von Hand eintragen.');
  }

  async function ankaufLoeschen() {
    if (!a || !istChef) return;
    setLoeschFrage(null); setBusy(true);
    try {
      const pfade = schaeden.flatMap((x) => x.fotos);
      // Paket 305: Fahrzeugmappe des Verkäufers (Fotos, Videos, Unterlagen) zuerst mit löschen —
      // sonst blieben seine Dateien im Speicher liegen. Klappt das nicht, bleibt alles stehen.
      const mr = await fetch(`/api/kfz/fahrzeugmappe?ankauf=${a.id}`, { method: 'DELETE' }).catch(() => null);
      if (!mr || !mr.ok) { setFehler('Die Fahrzeugmappe ließ sich nicht löschen. Der Ankauf bleibt erhalten — bitte später erneut versuchen.'); return; }
      const { error } = await supabase.from('kfz_ankauf').delete().eq('id', a.id);
      if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
      if (pfade.length) await supabase.storage.from(MEDIEN_BUCKET).remove(pfade);
      window.location.href = '/dashboard/kfz/ankauf';
    } finally { setBusy(false); }
  }

  const feld = (k: keyof FzForm, label: string, extra?: { typ?: string; mode?: 'numeric' | 'decimal'; ph?: string }) => (
    <label style={s.lab}>{label}<input style={s.inp} type={extra?.typ ?? 'text'} inputMode={extra?.mode} placeholder={extra?.ph} value={fz[k]} onChange={(e) => setFz({ ...fz, [k]: e.target.value })} /></label>
  );

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz/ankauf" style={s.zurueck}>← Zu den Ankäufen</a>
      <div style={s.kopf}>
        <div style={{ minWidth: 0 }}>
          <div style={s.knopfReihe}>
            <span style={{ ...s.pill, color: FARBE[st.farbe] }}>{st.label}</span>
            <span style={{ ...s.pill, color: ps.mangel ? C.warn : ps.offen ? C.dim : C.ok }}>Prüfung {ps.prozent} %</span>
            <span style={{ ...s.pill, color: schaeden.length ? C.warn : C.ok }}>{schaeden.length} {schaeden.length === 1 ? 'Schaden' : 'Schäden'} · {euro(summe)}</span>
          </div>
          <h1 style={s.h1}>{a.nr ?? 'Ankauf'} · {titel}</h1>
          <div style={s.dim}>{QUELLEN.find((x) => x.key === a.quelle)?.label} · {a.verkaeufer_firma || a.verkaeufer_name || 'Verkäufer offen'}{a.kennzeichen ? ` · ${a.kennzeichen}` : ''}{a.km_stand !== null ? ` · ${a.km_stand.toLocaleString('de-DE')} km` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={s.preis}>{b.maxAnkauf !== null ? euro(b.maxAnkauf) : '—'}</div>
          <div style={s.dim}>Höchstpreis {b.besteuerung === '25a' ? '(§ 25a)' : '(netto, Regelsteuer)'}</div>
          {a.bestand_id && <a href={`/dashboard/kfz/bestand/${a.bestand_id}`} style={{ ...s.btn, display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>🚘 Zur Handelsakte</a>}
        </div>
      </div>

      {a.quelle === 'online' && a.status === 'offen' && <div style={s.hinweis}>🌐 Über Ihr Online-Formular angeboten. Die Angaben stammen vom Verkäufer; Preisvorstellung und Beschreibung stehen unter „Notiz". Bitte bei der Besichtigung prüfen.</div>}
      {a.quelle === 'online' && <MappeKarte ankaufId={a.id} />}
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok} role="status">{ok}</div>}

      <div style={s.reiter} role="tablist">
        {REITER.map(([k, n]) => <button key={k} role="tab" aria-selected={reiter === k} style={reiter === k ? s.reiterAn : s.reiterAus} onClick={() => { setReiter(k); setOk(null); }}>{n}</button>)}
      </div>

      {reiter === 'fahrzeug' && (
        <div style={s.raster}>
          <div style={s.karte}><h3 style={s.h3}>Verkäufer</h3>
            <div style={s.feldRaster}>
              <label style={s.lab}>Verkäufer ist<select style={s.inp} value={fz.verkaeufer_art} onChange={(e) => setFz({ ...fz, verkaeufer_art: e.target.value })}>
                <option value="privat">Privatperson</option><option value="gewerblich_25a">Händler (differenzbesteuert)</option><option value="gewerblich">Unternehmen mit Umsatzsteuer</option></select></label>
              <label style={s.lab}>Woher<select style={s.inp} value={fz.quelle} onChange={(e) => setFz({ ...fz, quelle: e.target.value })}>{QUELLEN.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
              {feld('verkaeufer_name', 'Name')}{feld('verkaeufer_firma', 'Firma (falls gewerblich)')}
              {feld('verkaeufer_tel', 'Telefon', { typ: 'tel' })}{feld('verkaeufer_email', 'E-Mail', { typ: 'email' })}
            </div>
            <label style={{ ...s.lab, marginTop: 10 }}>Anschrift<textarea style={{ ...s.inp, minHeight: 56 }} value={fz.verkaeufer_anschrift} onChange={(e) => setFz({ ...fz, verkaeufer_anschrift: e.target.value })} /></label>
            <div style={{ ...s.dim, marginTop: 8 }}>Ausweisnummern speichert ARGONAUT hier bewusst nicht. Bei Barzahlung ab 10.000 € nutzen Sie die <a href="/dashboard/kfz/gwg" style={{ color: C.info }}>GwG-Identifizierung</a>.</div>
          </div>
          <div style={s.karte}><h3 style={s.h3}>Fahrzeug</h3>
            <div style={s.feldRaster}>
              {feld('marke', 'Marke')}{feld('modell', 'Modell')}{feld('variante', 'Variante')}
              {feld('fin', 'FIN (17 Zeichen)')}{feld('kennzeichen', 'Kennzeichen')}{feld('ez', 'Erstzulassung', { ph: 'MM/JJJJ' })}
              {feld('km', 'Kilometerstand', { mode: 'numeric' })}{feld('kw', 'Leistung (kW)', { mode: 'numeric' })}{feld('kraftstoff', 'Kraftstoff')}
              {feld('farbe', 'Farbe')}{feld('vorbesitzer', 'Vorbesitzer', { mode: 'numeric' })}{feld('hu_bis', 'HU bis', { typ: 'date' })}
              {feld('schluessel', 'Anzahl Schlüssel', { mode: 'numeric' })}
              <label style={s.lab}>Serviceheft<select style={s.inp} value={fz.serviceheft} onChange={(e) => setFz({ ...fz, serviceheft: e.target.value })}>
                <option value="">nicht erfasst</option><option value="lueckenlos">lückenlos</option><option value="teilweise">teilweise</option><option value="keins">keins</option><option value="unbekannt">unbekannt</option></select></label>
              <label style={s.lab}>Unfall / Vorschäden laut Verkäufer<select style={s.inp} value={fz.unfall_angabe} onChange={(e) => setFz({ ...fz, unfall_angabe: e.target.value })}>
                <option value="">nicht erfragt</option><option value="keine_bekannt">keine bekannt</option><option value="ja">ja</option><option value="unbekannt">unbekannt</option></select></label>
            </div>
            {fz.unfall_angabe === 'ja' && <label style={{ ...s.lab, marginTop: 8 }}>Welche Vorschäden nennt der Verkäufer?<textarea style={{ ...s.inp, minHeight: 56 }} value={fz.unfall_text} onChange={(e) => setFz({ ...fz, unfall_text: e.target.value })} /></label>}
            <label style={{ ...s.lab, marginTop: 8 }}>Notiz<textarea style={{ ...s.inp, minHeight: 56 }} value={fz.notiz} onChange={(e) => setFz({ ...fz, notiz: e.target.value })} /></label>
          </div>
          <div><button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void fzSpeichern()}>💾 Speichern</button></div>
        </div>
      )}

      {reiter === 'pruefung' && (
        <div style={s.karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={s.dim}>Je Punkt antippen: ✓ in Ordnung oder ⚠ Mangel. Mängel mit Kosten tragen Sie im Reiter „Schäden" ein.</div>
            <div style={{ fontSize: 13.5 }}><span style={{ color: C.ok }}>{ps.ok} in Ordnung</span> · <span style={{ color: C.warn }}>{ps.mangel} Mängel</span> · <span style={{ color: C.dim }}>{ps.offen} offen</span></div>
          </div>
          <div style={s.raster}>
            {PRUEFPUNKTE.map((g) => (
              <div key={g.gruppe}>
                <div style={s.tag}>{g.gruppe}</div>
                {g.punkte.map((p) => {
                  const w = pruef[p.key];
                  const setze = (v: Pruefstand) => { const n = { ...pruef }; if (v === 'offen' || w === v) delete n[p.key]; else n[p.key] = v; setPruef(n); };
                  return (
                    <div key={p.key} style={s.pruefZeile}>
                      <span>{p.name}</span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button style={w === 'ok' ? { ...s.mini, borderColor: C.ok, color: C.ok } : s.mini} aria-pressed={w === 'ok'} aria-label={`${p.name} in Ordnung`} onClick={() => setze('ok')}>✓</button>
                        <button style={w === 'mangel' ? { ...s.mini, borderColor: C.warn, color: C.warn } : s.mini} aria-pressed={w === 'mangel'} aria-label={`${p.name} Mangel`} onClick={() => setze('mangel')}>⚠</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <button style={{ ...s.gold, marginTop: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern({ pruefung: pruef }, 'Prüfprotokoll gespeichert.')}>💾 Prüfprotokoll speichern</button>
        </div>
      )}

      {reiter === 'schaeden' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {!abgeschlossen && (
            <div style={s.karte}><h3 style={s.h3}>Schaden erfassen</h3>
              <div style={s.feldRaster}>
                <label style={s.lab}>Wo<select style={s.inp} value={neuS.bereich} onChange={(e) => setNeuS({ ...neuS, bereich: e.target.value })}>{BEREICHE.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label style={s.lab}>Art<select style={s.inp} value={neuS.art} onChange={(e) => setNeuS({ ...neuS, art: e.target.value })}>{SCHADEN_ARTEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
                <label style={s.lab}>Stärke<select style={s.inp} value={neuS.stufe} onChange={(e) => setNeuS({ ...neuS, stufe: e.target.value as Stufe })}>{STUFEN.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
                <label style={s.lab}>Eigener Betrag netto (leer = Richtwert {euro(schadenKosten({ art: neuS.art, stufe: neuS.stufe, kosten: null }, richtwerte))})<input style={s.inp} inputMode="decimal" value={neuS.kosten} onChange={(e) => setNeuS({ ...neuS, kosten: e.target.value })} /></label>
              </div>
              <label style={{ ...s.lab, marginTop: 8 }}>Beschreibung<input style={s.inp} value={neuS.notiz} maxLength={300} onChange={(e) => setNeuS({ ...neuS, notiz: e.target.value })} placeholder="z. B. Kratzer 15 cm bis auf die Grundierung" /></label>
              <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={schadenNeu}>＋ Schaden hinzufügen</button>
            </div>
          )}
          {schaeden.length === 0 ? <div style={{ ...s.karte, ...s.dim }}>Noch keine Schäden erfasst.</div> : schaeden.map((x) => (
            <div key={x.id} style={s.karte}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div><b>{x.bereich}</b> · {SCHADEN_ARTEN.find((y) => y.key === x.art)?.name} · {x.stufe}{x.notiz && <div style={s.dim}>{x.notiz}</div>}</div>
                <div style={{ textAlign: 'right' }}><b style={{ color: C.gold }}>{euro(schadenKosten(x, richtwerte))}</b><div style={s.klein}>{x.kosten === null ? 'Richtwert' : 'eigener Betrag'}</div></div>
              </div>
              <div style={s.galerie}>
                {x.fotos.map((p) => (
                  <div key={p} style={s.bild}>
                    {urls[p] ? <img src={urls[p]} alt={`Schaden ${x.bereich}`} style={s.vorschau} /> : <div style={s.leer}>…</div>}
                    {!abgeschlossen && <div style={s.leiste}>
                      <button style={s.mini} onClick={() => void markierenOeffnen(x.id, p)}>✎ markieren</button>
                      {loeschFrage === p
                        ? <span><button style={{ ...s.mini, color: C.bad }} onClick={() => void fotoWeg(x.id, p)}>Ja, weg</button><button style={s.mini} onClick={() => setLoeschFrage(null)}>Nein</button></span>
                        : <button style={s.mini} aria-label="Foto löschen" onClick={() => setLoeschFrage(p)}>🗑</button>}
                    </div>}
                  </div>
                ))}
                {!abgeschlossen && x.fotos.length < 10 && (
                  <label style={{ ...s.bild, ...s.leer, cursor: 'pointer', fontSize: 14 }}>{fotoBusy === x.id ? 'lädt …' : '📷 Foto'}
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fotoHoch(x.id, e.target.files?.[0]); e.target.value = ''; }} /></label>
                )}
              </div>
              {!abgeschlossen && (loeschFrage === x.id
                ? <div style={{ marginTop: 8 }}><button style={{ ...s.btn, color: C.bad }} onClick={() => void schadenWeg(x.id)}>Ja, Schaden mit Fotos entfernen</button> <button style={s.btn} onClick={() => setLoeschFrage(null)}>Nein</button></div>
                : <button style={{ ...s.btn, marginTop: 8 }} onClick={() => setLoeschFrage(x.id)}>🗑 Schaden entfernen</button>)}
            </div>
          ))}
          <div style={{ ...s.karte, display: 'flex', justifyContent: 'space-between' }}><b>Summe Schäden (netto)</b><b style={{ color: C.gold }}>{euro(summe)}</b></div>
        </div>
      )}

      {reiter === 'bewertung' && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
          <EmpfehlungKarte a={a} istChef={istChef} darfSchreiben={!abgeschlossen} neuLaden={marktNeu}
            kosten={{ schaeden: summe, aufbereitung: betrag(bew.aufbereitung), sonstige: betrag(bew.sonstige), standtagePlan: ganz(bew.standtage), standkostenTag, marge: betrag(bew.marge), verkaeuferArt: fz.verkaeufer_art }}
            onVk={(vk) => { setBew({ ...bew, ziel_vk: t(vk) }); setOk('Empfohlener Verkaufspreis eingetragen — mit „💾 Bewertung speichern“ übernehmen.'); }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <KfzMarkt fz={{ id: a.id, owner_user_id: a.owner_user_id, vk_brutto: betrag(bew.ziel_vk), km_stand: a.km_stand, erstzulassung: a.erstzulassung }} bezug="ankauf" onGeaendert={() => setMarktNeu((n) => n + 1)} />
            <KfzBewertung id={a.id} tabelle="kfz_ankauf" fin={a.fin} vkBrutto={betrag(bew.ziel_vk)} onGespeichert={() => void lade()}
              werte={{ bewertung_anbieter: (a.bewertung_anbieter as 'dat' | 'schwacke' | 'sonstige' | null) ?? null, bewertung_ek: a.bewertung_ek ?? null, bewertung_vk: a.bewertung_vk ?? null, bewertung_am: a.bewertung_am ?? null, bewertung_url: a.bewertung_url ?? null }} />
          </div>
        </div>
      )}

      {reiter === 'bewertung' && (
        <div style={s.raster}>
          <div style={s.karte}><h3 style={s.h3}>Eingaben</h3>
            <div style={s.feldRaster}>
              <label style={s.lab}>Geplanter Verkaufspreis (brutto)<input style={s.inp} inputMode="decimal" value={bew.ziel_vk} onChange={(e) => setBew({ ...bew, ziel_vk: e.target.value })} /></label>
              <label style={s.lab}>Schäden (aus Reiter, netto)<input style={{ ...s.inp, opacity: 0.7 }} readOnly value={t(summe)} /></label>
              <label style={s.lab}>Aufbereitung (netto)<input style={s.inp} inputMode="decimal" value={bew.aufbereitung} onChange={(e) => setBew({ ...bew, aufbereitung: e.target.value })} /></label>
              <label style={s.lab}>Sonstige Kosten (netto)<input style={s.inp} inputMode="decimal" value={bew.sonstige} onChange={(e) => setBew({ ...bew, sonstige: e.target.value })} placeholder="HU, Service, Überführung" /></label>
              <label style={s.lab}>Geplante Standtage<input style={s.inp} inputMode="numeric" value={bew.standtage} onChange={(e) => setBew({ ...bew, standtage: e.target.value })} /></label>
              <label style={s.lab}>Gewünschte Marge (netto)<input style={s.inp} inputMode="decimal" value={bew.marge} onChange={(e) => setBew({ ...bew, marge: e.target.value })} /></label>
            </div>
            <div style={{ ...s.dim, marginTop: 8 }}>Standkosten: {euro(standkostenTag)} je Tag (stellt die Geschäftsleitung im Bestand unter „⚙ Spalten und Einstellungen" ein) = {euro(b.standkosten)}.</div>
            <button style={{ ...s.btn, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void bewSpeichern(false)}>💾 Bewertung speichern</button>
          </div>
          <div style={s.karte}><h3 style={s.h3}>Ergebnis</h3>
            <div style={s.ergebnis}>{b.maxAnkauf !== null ? euro(b.maxAnkauf) : '—'}</div>
            <div style={s.dim}>höchster sinnvoller Ankaufspreis {b.besteuerung === '25a' ? '(Zahlbetrag, § 25a)' : `(netto${b.maxAnkaufBrutto !== null ? `, brutto ${euro(b.maxAnkaufBrutto)}` : ''})`}</div>
            <div style={{ margin: '10px 0', display: 'grid', gap: 4 }}>{b.rechenweg.map((r, i) => <div key={i} style={{ fontSize: 13.5, color: b.lohntSich === false ? C.bad : C.text }}>{r}</div>)}</div>
            <div style={s.dim}>Kosten gesamt (netto): {euro(b.kosten)}. Richtrechnung mit 19 % — die genaue Kalkulation steht nach dem Ankauf am Fahrzeug im Bestand (Reiter „Kalkulation“).</div>
            <hr style={{ border: 0, borderTop: `1px solid ${C.border}`, margin: '12px 0' }} />
            <label style={s.lab}>Angebot an den Verkäufer<input style={s.inp} inputMode="decimal" value={bew.angebot} onChange={(e) => setBew({ ...bew, angebot: e.target.value })} /></label>
            <div style={{ marginTop: 6, color: FARBE[ampel.stufe], fontSize: 13.5 }}>● {ampel.text}</div>
            {!abgeschlossen && <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void bewSpeichern(true)}>💾 Angebot speichern</button>}
          </div>
        </div>
      )}

      {reiter === 'abschluss' && (
        <div style={s.raster}>
          <div style={s.karte}><h3 style={s.h3}>Ankauf abschließen</h3>
            {a.status === 'angekauft' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ color: C.ok }}>✓ Angekauft am {a.angekauft_am ? a.angekauft_am.split('-').reverse().join('.') : '—'} für {euro(a.ankaufpreis)}.</div>
                {a.bestand_id && <a href={`/dashboard/kfz/bestand/${a.bestand_id}`} style={{ ...s.gold, textDecoration: 'none', width: 'fit-content' }}>🚘 Zur Handelsakte im Bestand</a>}
              </div>
            ) : (
              <>
                <div style={s.feldRaster}>
                  <label style={s.lab}>Vereinbarter Ankaufspreis{b.besteuerung === 'regel' ? ' (netto)' : ''}<input style={s.inp} inputMode="decimal" value={abs.ankaufpreis} onChange={(e) => setAbs({ ...abs, ankaufpreis: e.target.value })} /></label>
                  <label style={s.lab}>Datum<input type="date" style={s.inp} value={abs.angekauft_am} onChange={(e) => setAbs({ ...abs, angekauft_am: e.target.value })} /></label>
                </div>
                <label style={{ ...s.haken, marginTop: 10 }}><input type="checkbox" checked={abs.ausweis} onChange={(e) => setAbs({ ...abs, ausweis: e.target.checked })} /> Ausweis des Verkäufers geprüft und Zulassungsbescheinigung Teil II mit Name verglichen</label>
                <div style={{ ...s.dim, marginTop: 8 }}>Das Fahrzeug wird mit allen Angaben in den Bestand übernommen ({schaeden.length || betrag(bew.aufbereitung) ? '„In Aufbereitung"' : '„Im Bestand"'}), mit Einkaufspreis, geplantem Verkaufspreis und Besteuerung {b.besteuerung === '25a' ? '§ 25a' : 'Regelsteuer'}. Die Vorschaden-Angabe des Verkäufers geht unverändert mit.</div>
                <div style={{ ...s.knopfReihe, marginTop: 12 }}>
                  <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void ankaufen()}>✓ Ankaufen und in den Bestand übernehmen</button>
                  {a.status !== 'abgelehnt'
                    ? <button style={s.btn} disabled={busy} onClick={() => void speichern({ status: 'abgelehnt' }, 'Als „Nicht angekauft" abgelegt.')}>Nicht angekauft</button>
                    : <button style={s.btn} disabled={busy} onClick={() => void speichern({ status: 'offen' }, 'Wieder in Bewertung.')}>Wieder öffnen</button>}
                </div>
              </>
            )}
          </div>
          <div style={s.karte}><h3 style={s.h3}>Zusammenfassung</h3>
            <dl style={s.kv}>
              <dt>Prüfprotokoll</dt><dd>{ps.ok} in Ordnung · {ps.mangel} Mängel · {ps.offen} offen</dd>
              <dt>Schäden</dt><dd>{schaeden.length} · {euro(summe)} netto</dd>
              <dt>Höchstpreis</dt><dd>{euro(b.maxAnkauf)}</dd>
              <dt>Angebot</dt><dd>{euro(a.angebot)}</dd>
              <dt>Angelegt</dt><dd>{a.erstellt_am.slice(0, 10).split('-').reverse().join('.')}</dd>
            </dl>
            <button style={{ ...s.btn, marginTop: 12 }} onClick={() => void scheinDrucken()}>🖨 Ankaufschein (PDF)</button>
            <div style={{ ...s.dim, marginTop: 6 }}>Zum Ausdrucken und Unterschreiben: Verkäufer, Fahrzeug, Angaben des Verkäufers, festgestellte Schäden (ohne Beträge), Kaufpreis und Erklärungen. Vorher Preis im Feld links eintragen.</div>
            {istChef && (loeschFrage === 'akte'
              ? <div style={{ marginTop: 12 }}><button style={{ ...s.btn, color: C.bad }} onClick={() => void ankaufLoeschen()}>Ja, Ankauf, Schadenfotos und Fahrzeugmappe löschen</button> <button style={s.btn} onClick={() => setLoeschFrage(null)}>Nein</button>{a.bestand_id && <div style={{ ...s.dim, marginTop: 6 }}>Das Fahrzeug im Bestand bleibt erhalten.</div>}</div>
              : <button style={{ ...s.btn, marginTop: 12 }} onClick={() => setLoeschFrage('akte')}>🗑 Ankauf löschen</button>)}
          </div>
        </div>
      )}

      {markieren && <FotoMarkierung quelle={markieren.blob} onSpeichern={markiertSpeichern} onSchliessen={() => setMarkieren(null)} />}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  kopf: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', margin: '8px 0 12px' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 2px' },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  preis: { fontSize: 28, fontWeight: 800, color: C.gold, fontVariantNumeric: 'tabular-nums' },
  ergebnis: { fontSize: 32, fontWeight: 800, color: C.gold, fontVariantNumeric: 'tabular-nums' },
  dim: { color: C.dim, fontSize: 13 },
  klein: { color: C.dim, fontSize: 12 },
  knopfReihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', display: 'inline-block' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, margin: '6px 0' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  reiter: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  kv: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13.5, margin: 0 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  tag: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, margin: '8px 0 6px' },
  pruefZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px dashed ${C.border}`, fontSize: 13.5 },
  mini: { background: 'none', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 13 },
  haken: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 },
  galerie: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginTop: 10 },
  bild: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, display: 'grid', gap: 6, minWidth: 0 },
  leer: { aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: C.navy3, borderRadius: 8, color: C.gold, fontSize: 20 },
  vorschau: { width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, display: 'block', maxWidth: '100%' },
  leiste: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
};
