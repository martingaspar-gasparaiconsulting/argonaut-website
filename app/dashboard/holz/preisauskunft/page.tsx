'use client';

// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · C4-2 · Automatische Preisauskunft
//
// DER HEBEL. Vier Handgriffe: Kunde, Variante, Menge — fertig.
// Heraus kommt der Text, den Schäfer sofort verschickt.
//
// WAS DIESE SEITE NICHT TUT:
//   Sie rechnet nichts selbst. Alles kommt aus preisauskunftLogik, das
//   wiederum preisLogik und anfahrtLogik nutzt. Dieselbe Wahrheit wie später
//   in der API (C4-3) und im PDF (C4-4). Drei Orte, eine Rechnung.
//
// WAS SIE VERHINDERT:
//   - Kein Preis in der Einheit? Die Einheit erscheint gar nicht erst.
//   - Kunde nicht verortet? Warnung mit Link, keine stillen 0 km.
//   - Verortung veraltet? Blockiert, statt zur alten Adresse zu rechnen.
//   - Lücke in der Fahrtkosten-Staffel? Blockierender Hinweis, kein 0-€-Angebot.
//
// Pfad: app/dashboard/holz/preisauskunft/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  EINHEITEN, einheitKurz, formatZahl,
  type HolzEinheit,
} from '../../_components/holzLogik';
import {
  sortiereSortimente, anzeigeName,
  type Sortiment,
} from '../../_components/sortimentLogik';
import {
  bepreisteEinheiten, istVerkaufsfertig, eur,
  type Preis, type Mengenrabatt,
} from '../../_components/preisLogik';
import {
  type AnfahrtKonfig, type FahrtkostenStufe, type DistanzQuelle,
} from '../../_components/anfahrtLogik';
import {
  ausKontakt, ausFirma, anrede, hatKoordinaten, verortungVeraltet, adresseEinzeilig,
  type KontaktQuelle, type FirmaQuelle, type Empfaenger,
} from '../../_components/empfaengerLogik';
import {
  erstellePreisauskunft, preisauskunftText, preisauskunftKurz, auskunftZeilen,
} from '../../_components/preisauskunftLogik';
import { preisauskunftPdf } from '../../_components/preisauskunftPdf';
import { anschriftBlock } from '../../_components/empfaengerLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const K_FELDER = 'id, vorname, nachname, firma, firma_id, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse';
const F_FELDER = 'id, name, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse';

type KundenEintrag = { art: 'kontakt' | 'firma'; empf: Empfaenger };

type Entfernung = {
  distanzMeter: number;
  quelle: DistanzQuelle;
  geschaetzt: boolean;
  ausCache: boolean;
  hinweis?: string | null;
};

function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}

export default function PreisauskunftPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const [sortimente, setSortimente] = useState<Sortiment[]>([]);
  const [preise, setPreise] = useState<Preis[]>([]);
  const [rabatte, setRabatte] = useState<Mengenrabatt[]>([]);
  const [konfig, setKonfig] = useState<AnfahrtKonfig | null>(null);
  const [stufen, setStufen] = useState<FahrtkostenStufe[]>([]);
  const [kunden, setKunden] = useState<KundenEintrag[]>([]);
  const [absender, setAbsender] = useState<string | null>(null);
  const [profil, setProfil] = useState<Record<string, string | null>>({});

  // --- Auswahl ----------------------------------------------------------
  const [kundenSuche, setKundenSuche] = useState('');
  const [kundeKey, setKundeKey] = useState('');           // "kontakt:uuid" | "firma:uuid" | ""
  const [freieKm, setFreieKm] = useState('');
  const [sortimentId, setSortimentId] = useState('');
  const [einheit, setEinheit] = useState<HolzEinheit>('srm');
  const [menge, setMenge] = useState('8');

  const [entfernung, setEntfernung] = useState<Entfernung | null>(null);
  const [entfernungLaeuft, setEntfernungLaeuft] = useState(false);
  const [entfernungFehler, setEntfernungFehler] = useState<string | null>(null);

  // --- Laden ------------------------------------------------------------
  const allesLaden = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); return; }
      setUid(id);

      const [sRes, pRes, rRes, kRes, stRes, kontRes, firmRes, profRes] = await Promise.all([
        supabase.from('holz_sortiment').select('*'),
        supabase.from('holz_preise').select('*'),
        supabase.from('holz_mengenrabatt').select('*'),
        supabase.from('anfahrt_konfig').select('*').maybeSingle(),
        supabase.from('fahrtkosten_staffel').select('*'),
        supabase.from('kontakte').select(K_FELDER),
        supabase.from('firmen').select(F_FELDER),
        supabase.from('profiles').select(
          'firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb, firma_ust_id, firma_steuernummer',
        ).eq('id', id).maybeSingle(),
      ]);

      if (sRes.error) throw sRes.error;
      setSortimente(sortiereSortimente((sRes.data as Sortiment[]) ?? []));
      setPreise((pRes.data as Preis[]) ?? []);
      setRabatte((rRes.data as Mengenrabatt[]) ?? []);
      setKonfig((kRes.data as AnfahrtKonfig) ?? null);
      setStufen((stRes.data as FahrtkostenStufe[]) ?? []);
      setAbsender((profRes.data?.firma_name as string) ?? null);
      setProfil((profRes.data as Record<string, string | null>) ?? {});

      const liste: KundenEintrag[] = [
        ...(((kontRes.data as unknown as KontaktQuelle[]) ?? []).map((k) => ({ art: 'kontakt' as const, empf: ausKontakt(k) }))),
        ...(((firmRes.data as unknown as FirmaQuelle[]) ?? []).map((f) => ({ art: 'firma' as const, empf: ausFirma(f) }))),
      ].sort((a, b) => a.empf.name.localeCompare(b.empf.name, 'de'));
      setKunden(liste);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void allesLaden(); }, [allesLaden]);

  // --- Nur verkaufsfertige Varianten -----------------------------------
  const verkaufbar = useMemo(
    () => sortimente.filter((s) => s.aktiv && istVerkaufsfertig(preise, s.id)),
    [sortimente, preise],
  );

  const sortiment = useMemo(
    () => verkaufbar.find((s) => s.id === sortimentId) ?? null,
    [verkaufbar, sortimentId],
  );

  // Nur Einheiten, für die ein Preis hinterlegt ist.
  const moeglicheEinheiten = useMemo(
    () => (sortiment ? bepreisteEinheiten(preise, sortiment.id) : []),
    [sortiment, preise],
  );

  useEffect(() => {
    if (moeglicheEinheiten.length > 0 && !moeglicheEinheiten.includes(einheit)) {
      setEinheit(moeglicheEinheiten[0]);
    }
  }, [moeglicheEinheiten, einheit]);

  // --- Kunde ------------------------------------------------------------
  const gefilterteKunden = useMemo(() => {
    const q = kundenSuche.trim().toLowerCase();
    if (!q) return kunden.slice(0, 50);
    return kunden.filter((k) =>
      k.empf.name.toLowerCase().includes(q) ||
      (k.empf.ort ?? '').toLowerCase().includes(q) ||
      (k.empf.plz ?? '').includes(q),
    ).slice(0, 50);
  }, [kunden, kundenSuche]);

  const kunde = useMemo(() => {
    if (!kundeKey) return null;
    const [art, id] = kundeKey.split(':');
    return kunden.find((k) => k.art === art && k.empf.id === id) ?? null;
  }, [kundeKey, kunden]);

  const kundeVerortet = kunde ? hatKoordinaten(kunde.empf) : false;
  const kundeVeraltet = kunde ? verortungVeraltet(kunde.empf) : false;

  // --- Entfernung holen -------------------------------------------------
  const entfernungHolen = useCallback(async (neu = false) => {
    if (!kunde) return;
    setEntfernungLaeuft(true); setEntfernungFehler(null); setEntfernung(null);
    try {
      const res = await fetch('/api/entfernung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ art: kunde.art, id: kunde.empf.id, neu }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) { setEntfernungFehler(d?.error ?? 'Entfernung konnte nicht ermittelt werden.'); return; }

      setEntfernung({
        distanzMeter: d.distanzMeter,
        quelle: d.quelle === 'ors' ? 'route' : 'luftlinie',
        geschaetzt: !!d.geschaetzt,
        ausCache: !!d.ausCache,
        hinweis: d.hinweis ?? null,
      });
    } catch {
      setEntfernungFehler('Entfernung konnte nicht ermittelt werden.');
    } finally { setEntfernungLaeuft(false); }
  }, [kunde]);

  useEffect(() => {
    setEntfernung(null); setEntfernungFehler(null);
    if (kunde && kundeVerortet && !kundeVeraltet) void entfernungHolen(false);
  }, [kunde, kundeVerortet, kundeVeraltet, entfernungHolen]);

  // --- Distanz für die Rechnung -----------------------------------------
  const freieKmZahl = num(freieKm);
  const distanz: { meter: number; quelle: DistanzQuelle } | null = useMemo(() => {
    if (kunde && entfernung) return { meter: entfernung.distanzMeter, quelle: entfernung.quelle };
    if (!kunde && freieKmZahl !== null && freieKmZahl >= 0) {
      // Von Hand eingetragene Kilometer sind keine Schätzung — sie sind gesetzt.
      return { meter: freieKmZahl * 1000, quelle: 'manuell' };
    }
    return null;
  }, [kunde, entfernung, freieKmZahl]);

  // --- Die Auskunft ------------------------------------------------------
  const mengeZahl = num(menge);
  const auskunft = useMemo(() => {
    if (!sortiment || mengeZahl === null) return null;
    return erstellePreisauskunft({
      menge: mengeZahl,
      einheit,
      sortiment,
      preise,
      rabatte,
      distanzMeter: distanz?.meter ?? null,
      distanzQuelle: distanz?.quelle,
      konfig,
      stufen,
    });
  }, [sortiment, mengeZahl, einheit, preise, rabatte, distanz, konfig, stufen]);

  const volltext = useMemo(() => {
    if (!auskunft?.ok || !sortiment) return '';
    return preisauskunftText(auskunft, sortiment, {
      anrede: kunde ? anrede(kunde.empf) : null,
      absender: absender ?? null,
    });
  }, [auskunft, sortiment, kunde, absender]);

  const kurztext = useMemo(
    () => (auskunft?.ok && sortiment ? preisauskunftKurz(auskunft, sortiment) : ''),
    [auskunft, sortiment],
  );

  /** Erzeugt das Angebots-PDF — mit denselben Zahlen wie oben auf dem Bildschirm. */
  function pdfLaden() {
    if (!auskunft?.ok || !sortiment) return;
    preisauskunftPdf(auskunft, sortiment, {
      firma: {
        name: profil.firma_name, strasse: profil.firma_strasse,
        plz_ort: [profil.firma_plz, profil.firma_ort].filter(Boolean).join(' ') || null,
        telefon: profil.firma_telefon, email: profil.firma_email, website: profil.firma_website,
        rechtsform: profil.firma_rechtsform, registergericht: profil.firma_registergericht,
        hrb: profil.firma_hrb, ust_id: profil.firma_ust_id, steuernummer: profil.firma_steuernummer,
      },
      empfaengerZeilen: kunde ? anschriftBlock(kunde.empf) : null,
    });
  }

  async function kopieren(text: string, was: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 2500);
    } catch {
      setFehler('Kopieren nicht möglich. Bitte den Text von Hand markieren.');
    }
  }

  // ----------------------------------------------------------------------
  const zeilen = auskunft && sortiment ? auskunftZeilen(auskunft, sortiment) : [];

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Brennholz</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Preisauskunft</h1>
          <p style={styles.sub}>
            Kunde, Variante, Menge — fertig. Der Text ist so formuliert, dass du ihn
            unverändert verschicken kannst. Anfahrt und Steuer sind bereits drin.
          </p>
        </div>
        <a href="/dashboard/holz" style={styles.ghostBtn}>← Sortiment</a>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : verkaufbar.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.warnBox}>
            Es ist noch keine Variante <strong>mit Preis</strong> angelegt. Ohne Preis kann keine
            Auskunft erstellt werden. <a href="/dashboard/holz" style={{ color: C.cyan }}>Zum Sortiment →</a>
          </div>
        </div>
      ) : (
        <div style={styles.spalten}>
          {/* ============ LINKS: EINGABE ============ */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>1 · Kunde</h2>

            <input style={styles.input} placeholder="Suchen nach Name, Ort oder PLZ …"
              value={kundenSuche} onChange={(e) => setKundenSuche(e.target.value)} />

            <select style={{ ...styles.input, marginTop: 10 }} value={kundeKey}
              onChange={(e) => setKundeKey(e.target.value)}>
              <option value="">— ohne Kunde, Entfernung von Hand —</option>
              {gefilterteKunden.map((k) => (
                <option key={`${k.art}:${k.empf.id}`} value={`${k.art}:${k.empf.id}`}>
                  {k.empf.name}{k.empf.ort ? ` · ${k.empf.ort}` : ''}{k.art === 'firma' ? ' (Firma)' : ''}
                </option>
              ))}
            </select>

            {/* Kein Kunde -> Kilometer von Hand */}
            {!kunde && (
              <div style={{ marginTop: 14 }}>
                <label style={styles.lbl}>Entfernung in km (optional)</label>
                <input style={{ ...styles.input, maxWidth: 160 }} inputMode="decimal" placeholder="z. B. 42"
                  value={freieKm} onChange={(e) => setFreieKm(e.target.value)} />
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                  Leer lassen, wenn die Anfahrt nicht in den Preis soll.
                </div>
              </div>
            )}

            {/* Kunde gewählt -> Status der Verortung */}
            {kunde && (
              <>
                <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 10 }}>
                  {adresseEinzeilig(kunde.empf) || 'Keine Anschrift hinterlegt'}
                </div>

                {kundeVeraltet ? (
                  <div style={styles.warnBox}>
                    ⚠ Die Anschrift wurde geändert, seit die Koordinaten ermittelt wurden.
                    Es wird <strong>keine</strong> Anfahrt berechnet — sonst wäre es die zur alten Adresse.
                    <br />
                    <a href={kunde.art === 'kontakt' ? `/dashboard/crm/${kunde.empf.id}` : `/dashboard/crm/firmen/${kunde.empf.id}`}
                      style={{ color: C.cyan }}>Kunde öffnen und neu verorten →</a>
                  </div>
                ) : !kundeVerortet ? (
                  <div style={styles.warnBox}>
                    ⚠ Dieser Kunde ist noch nicht verortet — die Anfahrt fehlt im Preis.
                    <br />
                    <a href={kunde.art === 'kontakt' ? `/dashboard/crm/${kunde.empf.id}` : `/dashboard/crm/firmen/${kunde.empf.id}`}
                      style={{ color: C.cyan }}>Kunde öffnen und verorten →</a>
                  </div>
                ) : entfernungLaeuft ? (
                  <div style={styles.hint}>Entfernung wird ermittelt …</div>
                ) : entfernungFehler ? (
                  <div style={styles.warnBox}>⚠ {entfernungFehler}</div>
                ) : entfernung ? (
                  <div style={entfernung.geschaetzt ? styles.warnBox : styles.infoBox}>
                    <strong>{formatZahl(entfernung.distanzMeter / 1000, 1)} km</strong>
                    {entfernung.geschaetzt ? ' (geschätzt, Luftlinie)' : ' (Fahrstrecke)'}
                    {entfernung.ausCache && <span style={{ color: C.textDim }}> · aus dem Zwischenspeicher</span>}
                    {entfernung.hinweis && <><br /><span style={{ color: C.textDim }}>{entfernung.hinweis}</span></>}
                    <br />
                    <button onClick={() => entfernungHolen(true)} style={styles.miniBtn}>Neu berechnen</button>
                  </div>
                ) : null}
              </>
            )}

            <h2 style={{ ...styles.cardTitle, marginTop: 24 }}>2 · Ware</h2>

            <label style={styles.lbl}>Variante</label>
            <select style={styles.input} value={sortimentId} onChange={(e) => setSortimentId(e.target.value)}>
              <option value="">— bitte wählen —</option>
              {verkaufbar.map((s) => <option key={s.id} value={s.id}>{anzeigeName(s)}</option>)}
            </select>

            {sortiment && (
              <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={styles.lbl}>Menge</label>
                  <input style={styles.input} inputMode="decimal" value={menge}
                    onChange={(e) => setMenge(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={styles.lbl}>Einheit</label>
                  <select style={styles.input} value={einheit} onChange={(e) => setEinheit(e.target.value as HolzEinheit)}>
                    {moeglicheEinheiten.map((e) => (
                      <option key={e} value={e}>{einheitKurz(e)}</option>
                    ))}
                  </select>
                  {moeglicheEinheiten.length < EINHEITEN.length && (
                    <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 5 }}>
                      Nur Einheiten mit hinterlegtem Preis.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ============ RECHTS: ERGEBNIS ============ */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>3 · Der Preis</h2>

            {!sortiment ? (
              <div style={styles.hint}>Variante wählen.</div>
            ) : !auskunft ? (
              <div style={styles.hint}>Menge eingeben.</div>
            ) : !auskunft.ok ? (
              <div style={styles.err}>
                {auskunft.fehler.map((f, i) => <div key={i}>{f}</div>)}
              </div>
            ) : (
              <>
                <table style={styles.tabelle}>
                  <tbody>
                    {zeilen.map((z, i) => (
                      <tr key={i}>
                        <td style={styles.td}>
                          {z.bezeichnung}
                          {z.detail && <div style={{ fontSize: 11.5, color: C.textDim }}>{z.detail}</div>}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: z.istRabatt ? C.green : C.text, whiteSpace: 'nowrap' }}>
                          {z.nettoText}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, borderTop: `1px solid ${C.border}`, fontWeight: 700 }}>Summe netto</td>
                      <td style={{ ...styles.td, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700 }}>
                        {eur(auskunft.gesamt.netto)}
                      </td>
                    </tr>
                    {auskunft.gesamt.gruppen.map((g) => (
                      <tr key={g.steuersatzProzent}>
                        <td style={{ ...styles.td, color: C.textDim, fontSize: 12.5 }}>
                          zzgl. {formatZahl(g.steuersatzProzent, 0)} % USt. auf {eur(g.netto)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim, fontSize: 12.5 }}>
                          {eur(g.steuerBetrag)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16 }}>Gesamt brutto</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: C.gold }}>
                        {eur(auskunft.gesamt.brutto)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {auskunft.geschaetzt && (
                  <div style={styles.warnBox}>
                    ⚠ Die Entfernung ist geschätzt (Luftlinie). Der Text weist das gegenüber dem Kunden aus.
                  </div>
                )}

                {auskunft.hinweise.length > 0 && (
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.6 }}>
                    {auskunft.hinweise.map((h, i) => <div key={i}>· {h}</div>)}
                  </div>
                )}

                {/* Kurzfassung */}
                <div style={styles.sektion}>
                  <div style={styles.sektionKopf}>
                    <span style={styles.sektionTitel}>Kurzfassung — fürs Telefon</span>
                    <button onClick={() => kopieren(kurztext, 'kurz')} style={styles.miniBtn}>
                      {kopiert === 'kurz' ? '✓ kopiert' : 'Kopieren'}
                    </button>
                  </div>
                  <div style={styles.kurzBox}>{kurztext}</div>
                </div>

                {/* Volltext */}
                <div style={styles.sektion}>
                  <div style={styles.sektionKopf}>
                    <span style={styles.sektionTitel}>Für die E-Mail</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={pdfLaden} style={styles.ghostBtn}>🖨 Angebot als PDF</button>
                      <button onClick={() => kopieren(volltext, 'voll')} style={styles.primaerBtn}>
                        {kopiert === 'voll' ? '✓ In der Zwischenablage' : '📋 In die Zwischenablage'}
                      </button>
                    </div>
                  </div>
                  <textarea readOnly style={styles.textarea} value={volltext} rows={18} />
                  {!kunde && (
                    <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>
                      Ohne Kunde fehlt die persönliche Anrede — bitte oben ergänzen.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 620, lineHeight: 1.5 },

  spalten: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },
  textarea: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, resize: 'vertical' },

  tabelle: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '8px 0', fontSize: 13.5, verticalAlign: 'top' },

  sektion: { marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` },
  sektionKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  sektionTitel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  kurzBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.55 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginTop: 8 },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginTop: 14, lineHeight: 1.5 },
  infoBox: { marginTop: 12, padding: '11px 13px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 12, padding: '11px 13px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
};
