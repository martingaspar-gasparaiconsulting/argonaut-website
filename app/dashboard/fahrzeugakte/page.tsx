'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.5 · Fahrzeugakte (Lebensakte je FIN)
// Fahrzeug per FIN/Kennzeichen suchen → komplette Historie: Halterwechsel,
// alle Werkstattaufträge chronologisch mit Leistungen/Material + Summen,
// nächste HU mit Ampel, Gesamt-Statistik.
//
// 12.09.26 (Punkt 3.7): Die Akte kann jetzt auch SCHREIBEN — Stammdaten
// bearbeiten und Halterwechsel eintragen. Aufträge und Positionen bleiben
// bewusst lesend: die gehören der Werkstatt, hier würde man sie nur
// versehentlich verändern. Die FIN ist der Schlüssel der Akte und wird nie
// geändert. Gelöscht wird nichts — der alte Halter bekommt ein bis_datum.
// Design 1:1 wie das übrige Dashboard.
// Pfad: app/dashboard/fahrzeugakte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import { augeFahrzeugakte } from '@/lib/auge';
import {
  positionsMinuten, positionsBetrag, auftragsSumme, zeitText, eur,
  type PositionBasis,
} from '../_components/leistungLogik';
import { statusDef } from '../_components/werkstattLogik';
import AnhaengeBox from '../_components/AnhaengeBox';
import {
  pruefeStammdaten, stammdatenNutzlast, halterWechselPlan,
  type StammEingabe, type HalterEintrag,
} from '@/lib/fahrzeugAkte';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', lila: '#A855F7',
};

type FahrzeugRow = {
  id: string; fin: string; kennzeichen: string | null;
  hersteller: string | null; modell: string | null; erstzulassung: string | null;
  farbe: string | null; kraftstoff: string | null; halter_name: string | null;
  naechste_hu: string | null; notiz: string | null;
};
type HalterRow = { id: string; halter_name: string | null; von_datum: string | null; bis_datum: string | null; notiz: string | null };
type AuftragRow = {
  id: string; nummer: string | null; titel: string; status: string;
  angenommen_am: string; fertig_am: string | null; kunde_name: string | null;
};
type PositionRow = PositionBasis & { id: string; auftrag_id: string; extern_firma: string | null };

function datumKurz(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function tageBis(iso: string | null): number | null {
  if (!iso) return null;
  const ziel = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  if (isNaN(ziel.getTime())) return null;
  const heute = new Date(); const h0 = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  const z0 = new Date(ziel.getFullYear(), ziel.getMonth(), ziel.getDate());
  return Math.round((z0.getTime() - h0.getTime()) / 86400000);
}

export default function FahrzeugaktePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [fahrzeuge, setFahrzeuge] = useState<FahrzeugRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  // Detaildaten des gewählten Fahrzeugs
  const [halter, setHalter] = useState<HalterRow[]>([]);
  const [auftraege, setAuftraege] = useState<AuftragRow[]>([]);
  const [positionen, setPositionen] = useState<PositionRow[]>([]);
  const [detailLaden, setDetailLaden] = useState(false);
  const [offen, setOffen] = useState<Set<string>>(new Set());

  // Schreiben (3.7): Stammdaten bearbeiten + Halterwechsel
  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState<StammEingabe>({
    kennzeichen: '', hersteller: '', modell: '', erstzulassung: '',
    farbe: '', kraftstoff: '', naechste_hu: '', notiz: '',
  });
  const [formFehler, setFormFehler] = useState<string[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [halterOffen, setHalterOffen] = useState(false);
  const [neuerHalter, setNeuerHalter] = useState('');
  const [halterAb, setHalterAb] = useState(() => new Date().toISOString().slice(0, 10));
  const [halterFehler, setHalterFehler] = useState<string | null>(null);
  const [halterBusy, setHalterBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const ladeFahrzeuge = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('werkstatt_fahrzeuge')
        .select('id, fin, kennzeichen, hersteller, modell, erstzulassung, farbe, kraftstoff, halter_name, naechste_hu, notiz')
        .eq('archiviert', false)
        .order('hersteller', { ascending: true });
      if (error) throw error;
      setFahrzeuge((data as FahrzeugRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Fahrzeuge konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void ladeFahrzeuge(); }, [ladeFahrzeuge]);

  // Detail laden, wenn Fahrzeug gewählt
  const ladeDetail = useCallback(async (fahrzeugId: string) => {
    if (!uid) return;
    setDetailLaden(true); setOffen(new Set());
    try {
      const [hRes, aRes] = await Promise.all([
        supabase.from('werkstatt_fahrzeug_halter_log').select('*').eq('fahrzeug_id', fahrzeugId).order('von_datum', { ascending: false }),
        supabase.from('werkstatt_auftraege').select('id, nummer, titel, status, angenommen_am, fertig_am, kunde_name').eq('fahrzeug_id', fahrzeugId).order('angenommen_am', { ascending: false }),
      ]);
      const auf = (aRes.data as AuftragRow[]) ?? [];
      setHalter((hRes.data as HalterRow[]) ?? []);
      setAuftraege(auf);
      // Positionen aller Aufträge dieses Fahrzeugs holen
      if (auf.length > 0) {
        const ids = auf.map((a) => a.id);
        const { data: pos } = await supabase.from('werkstatt_positionen').select('*').in('auftrag_id', ids);
        setPositionen((pos as PositionRow[]) ?? []);
      } else {
        setPositionen([]);
      }
    } catch (e: unknown) {
      setFehler('Akte konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setDetailLaden(false); }
  }, [uid]);

  useEffect(() => { if (gewaehlt) void ladeDetail(gewaehlt); }, [gewaehlt, ladeDetail]);

  // Beim Wechsel des Fahrzeugs beide Formulare schliessen — sonst stünden
  // die Eingaben des vorigen Fahrzeugs im Feld.
  useEffect(() => {
    setBearbeiten(false); setFormFehler([]); setMeldung(null);
    setHalterOffen(false); setNeuerHalter(''); setHalterFehler(null);
    setHalterAb(new Date().toISOString().slice(0, 10));
  }, [gewaehlt]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return fahrzeuge;
    return fahrzeuge.filter((f) =>
      (f.fin || '').toLowerCase().includes(q) ||
      (f.kennzeichen || '').toLowerCase().includes(q) ||
      (f.hersteller || '').toLowerCase().includes(q) ||
      (f.modell || '').toLowerCase().includes(q) ||
      (f.halter_name || '').toLowerCase().includes(q)
    );
  }, [suche, fahrzeuge]);

  const fz = fahrzeuge.find((f) => f.id === gewaehlt) || null;
  const posJeAuftrag = useMemo(() => {
    const m = new Map<string, PositionRow[]>();
    for (const p of positionen) {
      if (!p.auftrag_id) continue;
      if (!m.has(p.auftrag_id)) m.set(p.auftrag_id, []);
      m.get(p.auftrag_id)!.push(p);
    }
    return m;
  }, [positionen]);

  // Gesamt-Statistik
  const gesamtBetrag = useMemo(() => {
    let s = 0; let unvoll = false;
    for (const p of positionen) { const b = positionsBetrag(p); if (b == null) unvoll = true; else s += b; }
    return { betrag: unvoll ? null : Math.round(s * 100) / 100 };
  }, [positionen]);

  function toggle(id: string) {
    setOffen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  /** Formular mit den Werten des gewaehlten Fahrzeugs fuellen und oeffnen. */
  function bearbeitenStarten() {
    const f = fahrzeuge.find((x) => x.id === gewaehlt);
    if (!f) return;
    setForm({
      kennzeichen: f.kennzeichen || '', hersteller: f.hersteller || '', modell: f.modell || '',
      erstzulassung: (f.erstzulassung || '').slice(0, 10), farbe: f.farbe || '',
      kraftstoff: f.kraftstoff || '', naechste_hu: (f.naechste_hu || '').slice(0, 10), notiz: f.notiz || '',
    });
    setFormFehler([]); setMeldung(null); setBearbeiten(true);
  }

  async function stammdatenSpeichern() {
    if (!gewaehlt) return;
    const fehlerListe = pruefeStammdaten(form);
    setFormFehler(fehlerListe);
    if (fehlerListe.length > 0) return;
    setSpeichern(true); setMeldung(null);
    try {
      const { error } = await supabase.from('werkstatt_fahrzeuge')
        .update(stammdatenNutzlast(form))
        .eq('id', gewaehlt);
      if (error) throw error;
      setBearbeiten(false);
      setMeldung('Stammdaten gespeichert.');
      await ladeFahrzeuge();
    } catch (e: unknown) {
      setFormFehler(['Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')]);
    } finally { setSpeichern(false); }
  }

  /**
   * Halterwechsel. Der Plan entsteht zuerst vollstaendig in lib/fahrzeugAkte
   * und wird hier nur ausgefuehrt — bricht ein Schritt ab, bricht alles ab.
   * Reihenfolge mit Absicht: erst den alten Eintrag schliessen, dann den neuen
   * anlegen. Andersherum gaebe es kurz zwei offene Halter.
   */
  async function halterWechseln() {
    if (!gewaehlt || !uid) return;
    const plan = halterWechselPlan(halter as HalterEintrag[], neuerHalter, halterAb);
    setHalterFehler(plan.fehler);
    if (plan.fehler || !plan.neu) return;
    setHalterBusy(true); setMeldung(null);
    try {
      if (plan.schliessen) {
        const { error } = await supabase.from('werkstatt_fahrzeug_halter_log')
          .update({ bis_datum: plan.schliessen.bis_datum })
          .eq('id', plan.schliessen.id);
        if (error) throw error;
      }
      const { error: insErr } = await supabase.from('werkstatt_fahrzeug_halter_log').insert({
        owner_user_id: uid,
        fahrzeug_id: gewaehlt,
        halter_name: plan.neu.halter_name,
        von_datum: plan.neu.von_datum,
      });
      if (insErr) throw insErr;
      // Der Name am Fahrzeug ist nur die Abkuerzung fuer die Anzeige — die
      // Wahrheit steht im Log. Schlaegt das hier fehl, ist der Wechsel
      // trotzdem eingetragen.
      await supabase.from('werkstatt_fahrzeuge')
        .update({ halter_name: plan.neu.halter_name, aktualisiert_am: new Date().toISOString() })
        .eq('id', gewaehlt);
      setHalterOffen(false); setNeuerHalter('');
      setMeldung('Halterwechsel eingetragen.');
      await ladeDetail(gewaehlt);
      await ladeFahrzeuge();
    } catch (e: unknown) {
      setHalterFehler('Halterwechsel fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setHalterBusy(false); }
  }

  const huTage = tageBis(fz?.naechste_hu ?? null);
  const huFarbe = huTage == null ? C.textDim : huTage < 0 ? C.danger : huTage <= 30 ? C.warn : C.green;
  const huText = huTage == null ? 'kein Termin' : huTage < 0 ? `${Math.abs(huTage)} Tage überfällig` : huTage === 0 ? 'heute' : `in ${huTage} Tagen`;

  const kiKontext = fz
    ? `Fahrzeugakte ${[fz.hersteller, fz.modell].filter(Boolean).join(' ')}, FIN ${fz.fin}. ${auftraege.length} Werkstattbesuche, HU ${huText}.`
    : '';

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <h1 style={styles.h1}>Fahrzeugakte</h1>
      <p style={styles.sub}>Die komplette Lebensakte je Fahrzeug — über die FIN geführt, auch bei Halterwechsel. Alle Besuche, Leistungen und die HU auf einen Blick.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.layout}>
        {/* Linke Spalte: Suche + Liste */}
        <div style={styles.linksSpalte}>
          <input style={styles.input} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="🔎 FIN, Kennzeichen, Halter …" />
          <div style={styles.fzListe}>
            {laden ? (
              <div style={styles.hint}>Lädt …</div>
            ) : gefiltert.length === 0 ? (
              <div style={styles.hint}>{fahrzeuge.length === 0 ? 'Noch keine Fahrzeuge. Sie entstehen von selbst, sobald Sie einen Werkstatt-Auftrag mit Kennzeichen anlegen.' : 'Kein Treffer.'}</div>
            ) : (
              gefiltert.map((f) => (
                <button key={f.id} onClick={() => setGewaehlt(f.id)}
                  style={{ ...styles.fzItem, ...(f.id === gewaehlt ? styles.fzItemAktiv : {}) }}>
                  <div style={{ fontWeight: 700, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{[f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</div>
                  <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim }}>{f.kennzeichen || '—'} · FIN …{f.fin.slice(-6)}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rechte Spalte: Akte */}
        <div style={styles.rechtsSpalte}>
          {!fz ? (
            <div style={styles.card}><div style={styles.hint}>Wählen Sie links ein Fahrzeug, um seine Akte zu öffnen.</div></div>
          ) : (
            <>
              {/* Fahrzeug-Kopf */}
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ ...styles.cardTitle, marginBottom: 4 }}>{[fz.hersteller, fz.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</h2>
                    <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim }}>FIN {fz.fin}{fz.kennzeichen ? ` · ${fz.kennzeichen}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Nächste HU</div>
                    <div style={{ color: huFarbe, fontWeight: 700 }}>{datumKurz(fz.naechste_hu)} · {huText}</div>
                  </div>
                </div>
                <div style={styles.kopfGrid}>
                  <Info label="Erstzulassung" wert={datumKurz(fz.erstzulassung)} />
                  <Info label="Kraftstoff" wert={fz.kraftstoff || '—'} />
                  <Info label="Farbe" wert={fz.farbe || '—'} />
                  <Info label="Aktueller Halter" wert={fz.halter_name || '—'} />
                </div>

                {fz.notiz && !bearbeiten && (
                  <div style={styles.notizBox}>{fz.notiz}</div>
                )}

                {meldung && <div style={styles.ok}>{meldung}</div>}

                {!bearbeiten ? (
                  <button onClick={bearbeitenStarten} style={styles.knopfLeise}>✏️ Stammdaten bearbeiten</button>
                ) : (
                  <div style={styles.formBox}>
                    <div style={styles.formGrid}>
                      <Feld label="Kennzeichen" wert={form.kennzeichen} setz={(v) => setForm((f) => ({ ...f, kennzeichen: v }))} />
                      <Feld label="Hersteller" wert={form.hersteller} setz={(v) => setForm((f) => ({ ...f, hersteller: v }))} />
                      <Feld label="Modell" wert={form.modell} setz={(v) => setForm((f) => ({ ...f, modell: v }))} />
                      <Feld label="Erstzulassung" wert={form.erstzulassung} setz={(v) => setForm((f) => ({ ...f, erstzulassung: v }))} typ="date" />
                      <Feld label="Farbe" wert={form.farbe} setz={(v) => setForm((f) => ({ ...f, farbe: v }))} />
                      <Feld label="Kraftstoff" wert={form.kraftstoff} setz={(v) => setForm((f) => ({ ...f, kraftstoff: v }))} />
                      <Feld label="Nächste HU" wert={form.naechste_hu} setz={(v) => setForm((f) => ({ ...f, naechste_hu: v }))} typ="date" />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={styles.feldLabel}>Notiz</div>
                      <textarea
                        value={form.notiz}
                        onChange={(e) => setForm((f) => ({ ...f, notiz: e.target.value }))}
                        rows={3}
                        style={{ ...styles.input, resize: 'vertical' }}
                      />
                    </div>
                    <div style={styles.finHinweis}>
                      Die FIN <strong>{fz.fin}</strong> ist der Schlüssel dieser Akte und lässt sich hier nicht ändern —
                      sonst verlöre das Fahrzeug seine Geschichte.
                    </div>
                    {formFehler.length > 0 && (
                      <ul style={styles.fehlerListe}>{formFehler.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={() => void stammdatenSpeichern()} disabled={speichern} style={styles.knopf}>
                        {speichern ? 'Speichert …' : 'Speichern'}
                      </button>
                      <button onClick={() => { setBearbeiten(false); setFormFehler([]); }} disabled={speichern} style={styles.knopfLeise}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Statistik-Kacheln */}
              <div style={styles.statGrid}>
                <SummeKarte label="Werkstattbesuche" value={String(auftraege.length)} accent={C.cyan} />
                <SummeKarte label="Gesamtumsatz netto" value={gesamtBetrag.betrag != null ? eur(gesamtBetrag.betrag) : 'teils offen'} accent={C.gold} />
                <SummeKarte label="Letzter Besuch" value={auftraege[0] ? datumKurz(auftraege[0].angenommen_am) : '—'} accent={C.green} />
              </div>

              {kiKontext && <KiAuge modul="Fahrzeugakte" regel={augeFahrzeugakte({ huTage, besuche: auftraege.length, fahrzeugName: [fz.hersteller, fz.modell].filter(Boolean).join(' ') })} aktionHref="/dashboard/fahrzeugakte" aktionText="Zur Fahrzeugakte" />}

              {/* Anhänge am Fahrzeug (HU-Bericht, Papiere …) */}
              <div style={{ ...styles.card, marginTop: 12 }}>
                <AnhaengeBox bezug="fahrzeug" bezugId={fz.id} titel="Fahrzeug-Anhänge (HU-Bericht, Papiere)" />
              </div>

              {/* Halter-Historie */}
              <div style={{ ...styles.card, marginTop: 12 }}>
                  <h2 style={styles.cardTitle}>Halter-Historie</h2>
                  {halter.length === 0 && (
                    <div style={{ ...styles.hint, padding: '0 0 10px' }}>Noch kein Halter eingetragen.</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {halter.map((h) => (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.bis_datum ? C.textDim : C.green, display: 'inline-block' }} />
                        <span style={{ fontWeight: 600, minWidth: 200 }}>{h.halter_name || '—'}</span>
                        <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                          {datumKurz(h.von_datum)} – {h.bis_datum ? datumKurz(h.bis_datum) : 'aktuell'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {!halterOffen ? (
                    <button onClick={() => { setHalterOffen(true); setHalterFehler(null); }} style={{ ...styles.knopfLeise, marginTop: 14 }}>
                      🔁 Halterwechsel eintragen
                    </button>
                  ) : (
                    <div style={styles.formBox}>
                      <div style={styles.formGrid}>
                        <Feld label="Neuer Halter" wert={neuerHalter} setz={setNeuerHalter} />
                        <Feld label="Gilt ab" wert={halterAb} setz={setHalterAb} typ="date" />
                      </div>
                      <div style={styles.finHinweis}>
                        Der bisherige Halter wird zu diesem Datum abgeschlossen — nichts wird gelöscht,
                        die Akte behält die vollständige Geschichte.
                      </div>
                      {halterFehler && <ul style={styles.fehlerListe}><li>{halterFehler}</li></ul>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <button onClick={() => void halterWechseln()} disabled={halterBusy} style={styles.knopf}>
                          {halterBusy ? 'Trägt ein …' : 'Halterwechsel eintragen'}
                        </button>
                        <button onClick={() => { setHalterOffen(false); setHalterFehler(null); }} disabled={halterBusy} style={styles.knopfLeise}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
              </div>

              {/* Auftrags-Historie */}
              <div style={{ ...styles.card, marginTop: 12 }}>
                <h2 style={styles.cardTitle}>Werkstatt-Historie {detailLaden ? '· lädt …' : ''}</h2>
                {auftraege.length === 0 ? (
                  <div style={styles.hint}>Noch keine Werkstattaufträge für dieses Fahrzeug — sobald einer in der Werkstatt angelegt wird, erscheint er hier mit Positionen und Kosten.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {auftraege.map((a) => {
                      const pos = posJeAuftrag.get(a.id) ?? [];
                      const summe = auftragsSumme(pos);
                      const auf = offen.has(a.id);
                      const sd = statusDef(a.status);
                      return (
                        <div key={a.id} style={styles.aufKarte}>
                          <button onClick={() => toggle(a.id)} style={styles.aufKopf}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sd.farbe, display: 'inline-block', flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {a.nummer ? `${a.nummer} · ` : ''}{a.titel}
                                </div>
                                <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim }}>{datumKurz(a.angenommen_am)} · {sd.label}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ color: C.gold, fontWeight: 700 }}>{summe.gesamtBetrag != null ? eur(summe.gesamtBetrag) : '—'}</div>
                              <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim }}>{zeitText(summe.gesamtMinuten)} · {auf ? '▲' : '▼'}</div>
                            </div>
                          </button>
                          {auf && (
                            <div style={styles.aufDetail}>
                              {pos.length === 0 ? (
                                <div style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>Keine Positionen erfasst — Arbeitszeit und Material trägt die Werkstatt beim Auftrag ein.</div>
                              ) : (
                                <table style={styles.posTable}>
                                  <tbody>
                                    {pos.map((p) => {
                                      const min = positionsMinuten(p);
                                      const betrag = positionsBetrag(p);
                                      return (
                                        <tr key={p.id}>
                                          <td style={styles.posTd}>
                                            {p.bezeichnung}
                                            {p.extern && <span style={styles.externBadge}>extern{p.extern_firma ? ` · ${p.extern_firma}` : ''}</span>}
                                          </td>
                                          <td style={{ ...styles.posTd, textAlign: 'right', color: C.textDim, whiteSpace: 'nowrap' }}>{min > 0 ? zeitText(min) : (p.menge ? `${p.menge}×` : '')}</td>
                                          <td style={{ ...styles.posTd, textAlign: 'right', color: C.gold, whiteSpace: 'nowrap' }}>{betrag != null ? eur(betrag) : '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600 }}>{wert}</div>
    </div>
  );
}
function Feld({ label, wert, setz, typ }: { label: string; wert: string; setz: (v: string) => void; typ?: string }) {
  return (
    <div>
      <div style={styles.feldLabel}>{label}</div>
      <input
        type={typ || 'text'}
        value={wert}
        onChange={(e) => setz(e.target.value)}
        style={styles.input}
      />
    </div>
  );
}
function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 720, lineHeight: 1.5 },

  layout: { display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' },
  linksSpalte: { display: 'flex', flexDirection: 'column', gap: 10 },
  rechtsSpalte: { minWidth: 0 },

  fzListe: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 560, overflowY: 'auto' },
  fzItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', color: C.text },
  fzItemAktiv: { border: `1px solid ${C.cyan}`, background: 'rgba(0,229,255,0.08)' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 14px', color: C.text },
  kopfGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginTop: 16 },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12, marginBottom: 12 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  summeLabel: { fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800 },

  aufKarte: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' },
  aufKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', background: 'transparent', border: 'none', color: C.text, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  aufDetail: { padding: '0 14px 12px', borderTop: `1px solid ${C.border}` },
  posTable: { width: '100%', borderCollapse: 'collapse', marginTop: 8 },
  posTd: { padding: '6px 4px', fontSize: 'clamp(13px, 1.13vw, 18px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  externBadge: { marginLeft: 6, fontSize: 'clamp(10px, 0.88vw, 14px)', color: C.lila, border: `1px solid ${C.lila}`, borderRadius: 5, padding: '1px 5px' },

  input: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },

  formBox: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  feldLabel: { fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  knopf: { background: C.cyan, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'clamp(14px, 1.25vw, 20px)' },
  knopfLeise: { marginTop: 14, background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'clamp(13.5px, 1.19vw, 19px)' },
  notizBox: { marginTop: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 13px', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', whiteSpace: 'pre-wrap' },
  finHinweis: { marginTop: 10, color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', lineHeight: 1.5 },
  fehlerListe: { margin: '10px 0 0', paddingLeft: 20, color: C.danger, fontSize: 'clamp(13px, 1.13vw, 18px)' },
  ok: { marginTop: 14, color: C.green, fontSize: 'clamp(13.5px, 1.19vw, 19px)', background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '9px 13px' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 4px' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
};
