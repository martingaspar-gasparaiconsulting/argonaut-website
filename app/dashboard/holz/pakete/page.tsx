'use client';

// ============================================================
// ARGONAUT OS · Block 1 · A3b-3 · Pakete
//
// EIN PAKET IST EIN PREISMODELL, KEIN ARTIKEL.
//   Auf dem Beleg erscheinen die einzelnen Positionen mit ihrem Anteil am
//   Fixpreis — nicht eine Zeile "Starterkit 249 €". Bei zwei Steuersätzen
//   wäre die eine Zeile nicht ausweisbar.
//
// DIE VORSCHAU IST DER KERN.
//   Schäfer sieht sofort, was jede Zeile am Ende kostet, wie der Steuerausweis
//   aussieht und ob der Fixpreis über oder unter den Einzelpreisen liegt.
//   Er tippt eine Zahl, die Aufteilung folgt.
//
// Pfad: app/dashboard/holz/pakete/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { EINHEITEN, einheitKurz, holzartName } from '../../_components/holzLogik';
import { sortiereSortimente, trocknungsgradName, type Sortiment } from '../../_components/sortimentLogik';
import { findePreis, bepreisteEinheiten, istVerkaufsfertig, type Preis } from '../../_components/preisLogik';
import { eur, formatZahl, cent, type PositionsArt } from '../../_components/positionsLogik';
import {
  klappeAuf, pruefePaket, pruefePaketPosition, paketKurz, STEUER_HINWEIS_PAKET,
  type Paket, type PaketPosition,
} from '../../_components/paketLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const ARTEN: Array<{ wert: PositionsArt; label: string }> = [
  { wert: 'sortiment', label: 'Brennholz' },
  { wert: 'artikel', label: 'Artikel' },
  { wert: 'leistung', label: 'Leistung' },
  { wert: 'freitext', label: 'Freitext' },
];

type PosForm = {
  id?: string;
  art: PositionsArt;
  sortiment_id: string | null;
  bezeichnung: string;
  menge: string;
  einheit: string;
  preis: string;
  steuer: string;
};

function leerePos(): PosForm {
  return { art: 'freitext', sortiment_id: null, bezeichnung: '', menge: '1', einheit: 'Stk', preis: '', steuer: '19' };
}

function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}

export default function PaketePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const [pakete, setPakete] = useState<Paket[]>([]);
  const [alleInhalte, setAlleInhalte] = useState<PaketPosition[]>([]);
  const [sortimente, setSortimente] = useState<Sortiment[]>([]);
  const [preise, setPreise] = useState<Preis[]>([]);

  // --- Modal -------------------------------------------------------------
  const [modalAuf, setModalAuf] = useState(false);
  const [paketId, setPaketId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [fixpreis, setFixpreis] = useState('');
  const [pflichtangaben, setPflichtangaben] = useState('');
  const [aktiv, setAktiv] = useState(true);
  const [posten, setPosten] = useState<PosForm[]>([]);
  const [speichert, setSpeichert] = useState(false);

  function melde(t: string) { setErfolg(t); setFehler(null); setTimeout(() => setErfolg(null), 3500); }

  // --- Laden --------------------------------------------------------------
  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); return; }
      setUid(id);

      const [pRes, ppRes, sRes, prRes] = await Promise.all([
        supabase.from('pakete').select('*').order('bezeichnung'),
        supabase.from('paket_positionen').select('*').order('position_nr'),
        supabase.from('holz_sortiment').select('*'),
        supabase.from('holz_preise').select('*'),
      ]);

      if (pRes.error) throw pRes.error;
      setPakete((pRes.data as Paket[]) ?? []);
      setAlleInhalte((ppRes.data as unknown as PaketPosition[]) ?? []);
      setSortimente(sortiereSortimente((sRes.data as Sortiment[]) ?? []));
      setPreise((prRes.data as Preis[]) ?? []);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void alles(); }, [alles]);

  const verkaufbar = useMemo(
    () => sortimente.filter((s) => s.aktiv && istVerkaufsfertig(preise, s.id)),
    [sortimente, preise],
  );

  // --- Der Entwurf als Paket + Positionen --------------------------------
  const entwurfPositionen: PaketPosition[] = useMemo(
    () => posten
      .filter((p) => p.bezeichnung.trim() && num(p.menge) !== null && num(p.preis) !== null)
      .map((p, i) => ({
        id: p.id ?? `neu-${i}`, owner_user_id: uid ?? '', paket_id: paketId ?? '',
        position_nr: i + 1, art: p.art,
        sortiment_id: p.art === 'sortiment' ? p.sortiment_id : null,
        artikel_id: null, leistung_id: null,
        bezeichnung: p.bezeichnung.trim(), detail: null,
        menge: num(p.menge) as number,
        einheit: p.einheit.trim() || 'Stk',
        einzelpreis_netto: num(p.preis) as number,
        steuersatz_prozent: num(p.steuer) ?? 19,
      })),
    [posten, uid, paketId],
  );

  const entwurfPaket: Paket | null = useMemo(() => {
    const f = num(fixpreis);
    if (f === null) return null;
    return {
      id: paketId ?? 'entwurf', owner_user_id: uid ?? '', firma_id: null,
      bezeichnung: bezeichnung.trim() || 'Ohne Namen',
      beschreibung: beschreibung.trim() || null,
      fixpreis_netto: f,
      pflichtangaben: pflichtangaben.trim() || null,
      aktiv, notiz: null, erstellt_am: '', aktualisiert_am: '',
    };
  }, [paketId, uid, bezeichnung, beschreibung, fixpreis, pflichtangaben, aktiv]);

  const befund = useMemo(
    () => (entwurfPaket && entwurfPositionen.length > 0 ? klappeAuf(entwurfPaket, entwurfPositionen) : null),
    [entwurfPaket, entwurfPositionen],
  );

  const pruefung = useMemo(
    () => (entwurfPaket
      ? pruefePaket({ bezeichnung: entwurfPaket.bezeichnung, fixpreis_netto: entwurfPaket.fixpreis_netto, pflichtangaben: entwurfPaket.pflichtangaben }, entwurfPositionen)
      : null),
    [entwurfPaket, entwurfPositionen],
  );

  const posFehler = useMemo(
    () => posten.flatMap((p, i) => {
      const r = pruefePaketPosition({
        bezeichnung: p.bezeichnung, menge: num(p.menge) ?? 0,
        einheit: p.einheit, einzelpreis_netto: num(p.preis) ?? -1,
        steuersatz_prozent: num(p.steuer) ?? 19,
      });
      return r.fehler.map((f) => `Zeile ${i + 1}: ${f}`);
    }),
    [posten],
  );

  const kannSpeichern = Boolean(pruefung?.ok && posFehler.length === 0 && entwurfPositionen.length > 0 && !speichert);

  // --- Öffnen -------------------------------------------------------------
  function neu() {
    setPaketId(null); setBezeichnung(''); setBeschreibung(''); setFixpreis('');
    setPflichtangaben(''); setAktiv(true); setPosten([leerePos()]);
    setFehler(null); setModalAuf(true);
  }

  function oeffne(p: Paket) {
    setPaketId(p.id); setBezeichnung(p.bezeichnung); setBeschreibung(p.beschreibung ?? '');
    setFixpreis(String(p.fixpreis_netto)); setPflichtangaben(p.pflichtangaben ?? ''); setAktiv(p.aktiv);
    setPosten(alleInhalte.filter((x) => x.paket_id === p.id).map((x) => ({
      id: x.id, art: x.art, sortiment_id: x.sortiment_id,
      bezeichnung: x.bezeichnung, menge: String(x.menge), einheit: x.einheit,
      preis: String(x.einzelpreis_netto), steuer: String(x.steuersatz_prozent),
    })));
    setFehler(null); setModalAuf(true);
  }

  /** Wählt Schäfer eine Brennholz-Variante, füllt sich die Zeile von selbst. */
  function variantenWahl(i: number, sid: string) {
    const s = verkaufbar.find((x) => x.id === sid);
    if (!s) return;
    const einheiten = bepreisteEinheiten(preise, s.id);
    const e = einheiten[0] ?? 'srm';
    const p = findePreis(preise, s.id, e);

    setPosten((liste) => liste.map((z, j) => (j === i ? {
      ...z,
      sortiment_id: sid,
      bezeichnung: `${holzartName(s.holzart)} ${s.scheitlaenge_cm} cm, ${trocknungsgradName(s.trocknungsgrad).toLowerCase()}`,
      einheit: einheitKurz(e),
      preis: p ? String(p.preis_netto) : '',
      steuer: p ? String(p.steuersatz_prozent) : '7',
    } : z)));
  }

  // --- Speichern ----------------------------------------------------------
  async function speichern() {
    if (!uid || !kannSpeichern || !entwurfPaket) return;
    const istNeu = !paketId;

    if (!window.confirm(
      `${istNeu ? 'Paket anlegen' : 'Änderungen speichern'}?\n\n` +
      `${entwurfPaket.bezeichnung}\n` +
      `${entwurfPositionen.length} Position(en) · ${eur(entwurfPaket.fixpreis_netto)} netto Festpreis`,
    )) return;

    setSpeichert(true); setFehler(null);
    try {
      let id = paketId;

      const kopf = {
        owner_user_id: uid,
        bezeichnung: entwurfPaket.bezeichnung,
        beschreibung: entwurfPaket.beschreibung,
        fixpreis_netto: entwurfPaket.fixpreis_netto,
        pflichtangaben: entwurfPaket.pflichtangaben,
        aktiv,
      };

      if (istNeu) {
        const { data, error } = await supabase.from('pakete').insert(kopf).select('id').single();
        if (error) throw error;
        id = data.id as string;
        setPaketId(id);
      } else {
        const { error } = await supabase.from('pakete').update(kopf).eq('id', id);
        if (error) throw error;
      }

      // Positionen: alte weg, neue rein. Bei zehn Zeilen fehlerfrei und schnell.
      await supabase.from('paket_positionen').delete().eq('paket_id', id);

      const zeilen = entwurfPositionen.map((p, i) => ({
        owner_user_id: uid,
        paket_id: id,
        position_nr: i + 1,
        art: p.art,
        sortiment_id: p.sortiment_id,
        bezeichnung: p.bezeichnung,
        menge: p.menge,
        einheit: p.einheit,
        einzelpreis_netto: p.einzelpreis_netto,
        steuersatz_prozent: p.steuersatz_prozent,
      }));

      const { error: pErr } = await supabase.from('paket_positionen').insert(zeilen);
      if (pErr) throw pErr;

      await alles();
      melde(istNeu ? 'Paket angelegt.' : 'Gespeichert.');
      if (istNeu) setModalAuf(false);
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  async function aktivUmschalten(p: Paket) {
    const ziel = !p.aktiv;
    if (!window.confirm(ziel ? `„${p.bezeichnung}" wieder verkaufen?` : `„${p.bezeichnung}" aus dem Verkauf nehmen?`)) return;
    try {
      const { error } = await supabase.from('pakete').update({ aktiv: ziel }).eq('id', p.id);
      if (error) throw error;
      setModalAuf(false);
      await alles();
    } catch (e: unknown) {
      setFehler('Umschalten fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // ----------------------------------------------------------------------
  const aktive = pakete.filter((p) => p.aktiv).length;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Brennholz</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Pakete</h1>
          <p style={styles.sub}>
            Ein Festpreis für einen Korb aus Holz, Zubehör und Leistungen. Auf dem Beleg erscheinen
            die Positionen einzeln — sonst ließe sich bei zwei Steuersätzen die Umsatzsteuer nicht ausweisen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard/holz" style={styles.ghostBtn}>← Sortiment</a>
          <button onClick={neu} style={styles.goldBtn}>+ Neues Paket</button>
        </div>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.okBox}>{erfolg}</div>}

      {!laden && (
        <div style={styles.zahlenGrid}>
          <Zahl label="Pakete" wert={pakete.length} farbe={C.cyan} />
          <Zahl label="Im Verkauf" wert={aktive} farbe={C.green} />
        </div>
      )}

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Alle Pakete</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : pakete.length === 0 ? (
          <div style={styles.hint}>
            Noch kein Paket. Ein Starterkit zum Beispiel: Holz, Anzünder, Zubehör — ein Festpreis.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pakete.map((p) => {
              const inhalt = alleInhalte.filter((x) => x.paket_id === p.id);
              const b = inhalt.length > 0 ? klappeAuf(p, inhalt) : null;
              return (
                <button key={p.id} onClick={() => oeffne(p)} style={{ ...styles.listItem, opacity: p.aktiv ? 1 : 0.55 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{b ? paketKurz(p, b) : p.bezeichnung}</div>
                    <div style={{ fontSize: 12, color: C.textDim }}>
                      {inhalt.length} Position(en)
                      {b?.gemischteSteuer ? ' · zwei Steuersätze' : ''}
                      {p.pflichtangaben ? ' · Pflichtangaben hinterlegt' : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: p.aktiv ? C.green : C.textDim, flexShrink: 0 }}>
                    {p.aktiv ? 'im Verkauf' : 'inaktiv'}
                  </span>
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
            <h2 style={styles.modalTitel}>{paketId ? 'Paket bearbeiten' : 'Neues Paket'}</h2>

            {/* --- Stammdaten --- */}
            <div style={styles.sektion}>
              <span style={styles.sektionTitel}>1 · Das Paket</span>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 220px' }}>
                  <label style={styles.lbl}>Bezeichnung *</label>
                  <input style={styles.input} value={bezeichnung} placeholder="Starterkit"
                    onChange={(e) => setBezeichnung(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={styles.lbl}>Festpreis netto *</label>
                  <input style={styles.input} inputMode="decimal" value={fixpreis} placeholder="249,00"
                    onChange={(e) => setFixpreis(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={styles.lbl}>Beschreibung</label>
                <input style={styles.input} value={beschreibung} placeholder="Alles für den ersten Winter."
                  onChange={(e) => setBeschreibung(e.target.value)} />
              </div>
              <label style={{ ...styles.checkZeile, marginTop: 12 }}>
                <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
                <span style={{ fontSize: 13.5 }}>{aktiv ? 'Wird angeboten' : 'Nicht im Verkauf'}</span>
              </label>
            </div>

            {/* --- Positionen --- */}
            <div style={styles.sektion}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={styles.sektionTitel}>2 · Was ist drin?</span>
                <button onClick={() => setPosten((p) => [...p, leerePos()])} style={styles.miniBtn}>+ Zeile</button>
              </div>
              <div style={{ fontSize: 12, color: C.textDim, margin: '6px 0 10px', lineHeight: 1.5 }}>
                Der <strong>Einzelpreis</strong> ist der Preis ohne Paket. Er bestimmt, welchen Anteil
                am Festpreis die Zeile bekommt.
              </div>

              {posten.map((z, i) => (
                <div key={i} style={styles.posBlock}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select style={{ ...styles.posInput, flex: '0 1 108px' }} value={z.art}
                      onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, art: e.target.value as PositionsArt, sortiment_id: null } : y)))}>
                      {ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
                    </select>

                    {z.art === 'sortiment' ? (
                      <select style={{ ...styles.posInput, flex: '2 1 190px' }} value={z.sortiment_id ?? ''}
                        onChange={(e) => variantenWahl(i, e.target.value)}>
                        <option value="">— Variante wählen —</option>
                        {verkaufbar.map((s) => (
                          <option key={s.id} value={s.id}>
                            {holzartName(s.holzart)} {s.scheitlaenge_cm} cm, {trocknungsgradName(s.trocknungsgrad).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input style={{ ...styles.posInput, flex: '2 1 190px' }} placeholder="Bezeichnung" value={z.bezeichnung}
                        onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, bezeichnung: e.target.value } : y)))} />
                    )}

                    <button onClick={() => setPosten((l) => l.filter((_, j) => j !== i))} style={styles.xBtn}>✕</button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <input style={{ ...styles.posInput, flex: '0 1 72px', textAlign: 'right' }} placeholder="1" value={z.menge}
                      onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, menge: e.target.value } : y)))} />
                    <input style={{ ...styles.posInput, flex: '0 1 66px' }} placeholder="Stk" value={z.einheit}
                      onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, einheit: e.target.value } : y)))} />
                    <input style={{ ...styles.posInput, flex: '1 1 96px', textAlign: 'right' }} placeholder="Einzelpreis" value={z.preis}
                      onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, preis: e.target.value } : y)))} />
                    <input style={{ ...styles.posInput, flex: '0 1 62px', textAlign: 'right' }} value={z.steuer}
                      onChange={(e) => setPosten((l) => l.map((y, j) => (j === i ? { ...y, steuer: e.target.value } : y)))} />
                    <span style={{ fontSize: 11.5, color: C.textDim, alignSelf: 'center' }}>% USt.</span>
                  </div>
                </div>
              ))}

              {posFehler.length > 0 && (
                <div style={styles.err}>{posFehler.map((f, i) => <div key={i}>{f}</div>)}</div>
              )}
            </div>

            {/* --- Pflichtangaben --- */}
            <div style={styles.sektion}>
              <span style={styles.sektionTitel}>3 · Pflichtangaben</span>
              <div style={{ fontSize: 12, color: C.textDim, margin: '6px 0 10px', lineHeight: 1.5 }}>
                Enthält das Paket Lebensmittel, Gefahrgut oder altersbeschränkte Ware? Dann müssen
                Zutaten, Allergene und Haltbarkeit <strong>vor der Bestellung</strong> sichtbar sein.
              </div>
              <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={pflichtangaben}
                placeholder="Brot: Weizenmehl, Wasser, Salz, Hefe. Enthält Gluten. Mindestens haltbar 5 Tage."
                onChange={(e) => setPflichtangaben(e.target.value)} />
            </div>

            {/* --- Vorschau --- */}
            {befund && befund.ok && (
              <div style={styles.sektion}>
                <span style={styles.sektionTitel}>4 · So wird abgerechnet</span>
                <div style={{ fontSize: 12, color: C.textDim, margin: '6px 0 12px' }}>
                  Der Festpreis wird nach dem Verhältnis der Einzelpreise verteilt.
                </div>

                <table style={styles.tabelle}>
                  <tbody>
                    {befund.positionen.map((p, i) => (
                      <tr key={i}>
                        <td style={styles.td}>
                          {p.bezeichnung}
                          <div style={{ fontSize: 11.5, color: C.textDim }}>
                            {formatZahl(p.menge, 2)} {p.einheit} × {eur(p.einzelpreis_netto)} · {p.steuersatz_prozent} % USt.
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {eur(cent(p.menge * p.einzelpreis_netto))}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, borderTop: `1px solid ${C.border}`, fontWeight: 700 }}>Summe netto</td>
                      <td style={{ ...styles.td, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700 }}>
                        {eur(befund.summe.netto)}
                      </td>
                    </tr>
                    {befund.summe.gruppen.map((g) => (
                      <tr key={g.steuersatzProzent}>
                        <td style={{ ...styles.td, color: C.textDim, fontSize: 12.5 }}>
                          zzgl. {formatZahl(g.steuersatzProzent, 0)} % USt. auf {eur(g.netto)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim, fontSize: 12.5 }}>{eur(g.steuerBetrag)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15 }}>Gesamt brutto</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: C.gold }}>
                        {eur(befund.summe.brutto)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={befund.ersparnis >= 0 ? styles.infoBox : styles.warnBox}>
                  Einzeln gekauft: <strong>{eur(befund.einzelSumme)}</strong> netto.
                  {befund.ersparnis > 0
                    ? <> Der Kunde spart <strong>{eur(befund.ersparnis)}</strong> ({formatZahl(befund.ersparnisProzent, 1)} %).</>
                    : befund.ersparnis === 0
                      ? ' Kein Vorteil gegenüber dem Einzelkauf.'
                      : <> ⚠ Der Festpreis liegt <strong>{eur(Math.abs(befund.ersparnis))}</strong> darüber — das ist ein Aufschlag.</>}
                </div>

                {befund.gemischteSteuer && (
                  <div style={styles.warnBox}>⚖ {STEUER_HINWEIS_PAKET}</div>
                )}
              </div>
            )}

            {pruefung && pruefung.hinweise.length > 0 && (
              <div style={styles.warnBox}>
                {pruefung.hinweise.map((h, i) => <div key={i} style={{ marginBottom: 5 }}>⚠ {h}</div>)}
              </div>
            )}
            {pruefung && pruefung.fehler.length > 0 && (
              <div style={styles.err}>{pruefung.fehler.map((f, i) => <div key={i}>{f}</div>)}</div>
            )}

            <div style={styles.modalAktionen}>
              {paketId && (
                <button onClick={() => { const p = pakete.find((x) => x.id === paketId); if (p) aktivUmschalten(p); }}
                  disabled={speichert} style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>
                  {aktiv ? 'Aus dem Verkauf nehmen' : 'Wieder verkaufen'}
                </button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Schließen</button>
              <button onClick={speichern} disabled={!kannSpeichern}
                style={{ ...styles.goldBtn, opacity: kannSpeichern ? 1 : 0.45, cursor: kannSpeichern ? 'pointer' : 'not-allowed' }}>
                {speichert ? 'Speichert …' : paketId ? 'Speichern' : 'Paket anlegen'}
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
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 620, lineHeight: 1.5 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text },

  sektion: { marginTop: 16, padding: 16, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  sektionTitel: { fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  posBlock: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8 },
  posInput: { boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit' },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' },

  tabelle: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 4px', fontSize: 13, verticalAlign: 'top' },

  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit' },
  checkZeile: { display: 'flex', alignItems: 'center', gap: 10, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', cursor: 'pointer' },

  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 13.5, padding: '12px 0', lineHeight: 1.6 },
  err: { color: C.danger, fontSize: 13, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '11px 13px', marginTop: 12, lineHeight: 1.5 },
  okBox: { color: C.green, fontSize: 13.5, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '11px 13px', marginBottom: 16 },
  infoBox: { marginTop: 12, padding: '11px 13px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 10, fontSize: 12.5, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 12, padding: '11px 13px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 12.5, color: C.text, lineHeight: 1.6 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 700, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: C.text, margin: 0 },
  modalAktionen: { display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
};
