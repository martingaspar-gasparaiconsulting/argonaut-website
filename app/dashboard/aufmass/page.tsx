'use client';

// ============================================================
// ARGONAUT OS · Phase 2 · Modul E · Block E.3 · Aufmaß
// Aufmaße erfassen: Kopf (Kunde/Projekt/Ort) + Messpositionen + Live-Summe.
// Generisch: Bau, GaLaBau, Maler, Dachdecker, Zaunbau, Umzug, Erdbau, Forst.
// Pfad: app/dashboard/aufmass/page.tsx
//
// E1 — Was neu ist:
//   (1) LEISTUNG AUS DEM KATALOG. Suchen, übernehmen — Einheit, Preis und
//       Steuersatz kommen als Schnappschuss mit. Danach frei überschreibbar.
//   (2) RECHENFELD. Niemand misst "47,31 m²". Man misst 8,20 × 5,77.
//       Auch "4,2 x 2,6 - 0,9 x 2,1" (Wand minus Tür) und "12 × 1,8 × 2,5"
//       (Polter: Länge × Höhe × Breite). Der Rechenweg bleibt stehen.
//   (3) FREIE EINHEIT statt Auswahlliste. Srm und Rm waren nicht wählbar —
//       Schäfers gesamtes Brennholzgeschäft rechnet in Schüttraummetern.
//   (4) PAUSCHALE als eigenes Feld. "1 pauschal × 500 €" war eine Krücke.
//   (5) MWST JE POSITION. Holz 7 %, Arbeit 19 %. Die Summe schlüsselt auf.
//   (6) SPERRE ab Status "abgerechnet". Eine abgerechnete Menge nachträglich
//       ändern, ohne die Rechnung zu ändern — genau das verhindert die GoBD.
//   (7) RECHNUNG AUS AUFMASS. Ein Klick, Doppel-Schutz über aufmasse.rechnung_id.
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  EINHEITEN, STATUS_LISTE, statusDef, istGesperrt, aufmassSumme, positionsBetrag,
  rechneMenge, mengeText, eur, satzText, katalogNachAufmassPosition,
  type PositionBasis,
} from '../_components/aufmassLogik';
import { preisText, type KatalogEintrag } from '../_components/leistungLogik';
import { aufmassPdf } from '../_components/aufmassPdf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type AufmassRow = {
  id: string; owner_user_id: string;
  nummer: string | null; titel: string; kunde_name: string | null;
  projekt: string | null; ort: string | null; status: string;
  aufmass_datum: string; bearbeiter: string | null; notiz: string | null;
  archiviert: boolean; rechnung_id: string | null;
};
type PositionRow = PositionBasis & {
  id: string; owner_user_id: string; aufmass_id: string; position_nr: number | null; notiz: string | null;
};
type KatalogRow = KatalogEintrag & { id: string; aktiv: boolean };

type Form = {
  id: string | null;
  titel: string; nummer: string; kunde_name: string; projekt: string; ort: string;
  status: string; aufmass_datum: string; bearbeiter: string; notiz: string;
};
const LEER: Form = {
  id: null, titel: '', nummer: '', kunde_name: '', projekt: '', ort: '',
  status: 'entwurf', aufmass_datum: new Date().toISOString().slice(0, 10), bearbeiter: '', notiz: '',
};

function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function istPauschal(p: PositionBasis): boolean {
  return p.festpreis_netto != null;
}

export default function AufmassPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [aufmasse, setAufmasse] = useState<AufmassRow[]>([]);
  const [katalog, setKatalog] = useState<KatalogRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(LEER);
  const [speichert, setSpeichert] = useState(false);
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);
  const [positionen, setPositionen] = useState<PositionRow[]>([]);

  // Katalog-Suche
  const [leiSuche, setLeiSuche] = useState('');
  const [leiOffen, setLeiOffen] = useState(false);

  // Rechenfehler je Position (Menge-Eingabe)
  const [mengeFehler, setMengeFehler] = useState<Record<string, string>>({});

  const [rechnungBusy, setRechnungBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const [aRes, kRes] = await Promise.all([
        supabase.from('aufmasse').select('*')
          .eq('archiviert', false)
          .order('aufmass_datum', { ascending: false }),
        supabase.from('leistungskatalog').select('*')
          .eq('aktiv', true)
          .order('bezeichnung', { ascending: true }),
      ]);
      if (aRes.error) throw aRes.error;
      setAufmasse((aRes.data as AufmassRow[]) ?? []);
      setKatalog((kRes.data as KatalogRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Aufmaße konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  const ladePositionen = useCallback(async (aufmassId: string) => {
    const { data } = await supabase.from('aufmass_positionen').select('*')
      .eq('aufmass_id', aufmassId).order('erstellt_am', { ascending: true });
    setPositionen((data as PositionRow[]) ?? []);
  }, []);

  function neu() {
    setForm(LEER); setPositionen([]); setGespeichertHinweis(false);
    setLeiSuche(''); setLeiOffen(false); setMengeFehler({});
    setModalAuf(true);
  }
  async function bearbeiten(a: AufmassRow) {
    setForm({
      id: a.id, titel: a.titel ?? '', nummer: a.nummer ?? '', kunde_name: a.kunde_name ?? '',
      projekt: a.projekt ?? '', ort: a.ort ?? '', status: a.status ?? 'entwurf',
      aufmass_datum: a.aufmass_datum ?? LEER.aufmass_datum, bearbeiter: a.bearbeiter ?? '', notiz: a.notiz ?? '',
    });
    setGespeichertHinweis(false); setLeiSuche(''); setLeiOffen(false); setMengeFehler({});
    setModalAuf(true);
    await ladePositionen(a.id);
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  const aktAufmass = form.id ? aufmasse.find((x) => x.id === form.id) ?? null : null;
  const gesperrt = istGesperrt(form.status);

  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neues Aufmaß anlegen?\n\n• ${form.titel}` : `Änderungen an "${form.titel}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid, titel: form.titel.trim(), nummer: form.nummer.trim() || null,
        kunde_name: form.kunde_name.trim() || null, projekt: form.projekt.trim() || null,
        ort: form.ort.trim() || null, status: form.status, aufmass_datum: form.aufmass_datum,
        bearbeiter: form.bearbeiter.trim() || null, notiz: form.notiz.trim() || null,
      };
      if (istNeu) {
        const { data, error } = await supabase.from('aufmasse').insert(payload).select('id').single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: (data as { id: string }).id }));
      } else {
        const { error } = await supabase.from('aufmasse').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setGespeichertHinweis(true); setTimeout(() => setGespeichertHinweis(false), 2500);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  async function archivieren(a: AufmassRow) {
    if (!window.confirm(`Aufmaß "${a.titel}" archivieren?`)) return;
    try {
      const { error } = await supabase.from('aufmasse').update({ archiviert: true }).eq('id', a.id);
      if (error) throw error;
      setModalAuf(false); await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Positionen -------------------------------------------------------
  const leiTreffer = useMemo(() => {
    const q = leiSuche.trim().toLowerCase();
    const basis = q
      ? katalog.filter((k) => (k.bezeichnung || '').toLowerCase().includes(q) || (k.kategorie || '').toLowerCase().includes(q))
      : katalog;
    return basis.slice(0, 8);
  }, [leiSuche, katalog]);

  async function positionEinfuegen(pos: PositionBasis) {
    if (!uid || !form.id) { setFehler('Bitte zuerst das Aufmaß speichern (Anlegen), dann Positionen erfassen.'); return; }
    if (gesperrt) return;
    try {
      const { error } = await supabase.from('aufmass_positionen').insert({
        owner_user_id: uid, aufmass_id: form.id,
        position_nr: positionen.length + 1,
        bezeichnung: pos.bezeichnung ?? '',
        menge: pos.menge ?? 0,
        einheit: pos.einheit ?? 'm²',
        einzelpreis_netto: pos.einzelpreis_netto ?? null,
        festpreis_netto: pos.festpreis_netto ?? null,
        mwst_satz: pos.mwst_satz ?? 19,
        rechenweg: pos.rechenweg ?? null,
        leistung_id: pos.leistung_id ?? null,
      });
      if (error) throw error;
      await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Position konnte nicht hinzugefügt werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  function leerePosition() {
    void positionEinfuegen({ bezeichnung: '', menge: 0, einheit: 'm²', mwst_satz: 19 });
  }
  function katalogUebernehmen(k: KatalogRow) {
    void positionEinfuegen(katalogNachAufmassPosition(k));
    setLeiSuche(''); setLeiOffen(false);
  }

  async function positionAendern(id: string, patch: Partial<PositionRow>) {
    setPositionen((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const { error } = await supabase.from('aufmass_positionen').update(patch).eq('id', id).select('id');
      if (error) setFehler('Position speichern fehlgeschlagen: ' + error.message);
    } catch { /* still */ }
  }

  /** Menge aus einer Formel-Eingabe. Fehler werden gezeigt, nicht verschluckt. */
  function mengeSetzen(p: PositionRow, eingabe: string) {
    const r = rechneMenge(eingabe);
    if (r.fehler || r.menge == null) {
      setMengeFehler((m) => ({ ...m, [p.id]: r.fehler ?? 'Ungültige Eingabe.' }));
      return;
    }
    setMengeFehler((m) => { const n = { ...m }; delete n[p.id]; return n; });
    void positionAendern(p.id, { menge: r.menge, rechenweg: r.rechenweg });
  }

  function pauschaleUmschalten(p: PositionRow) {
    if (gesperrt) return;
    if (istPauschal(p)) void positionAendern(p.id, { festpreis_netto: null });
    else void positionAendern(p.id, { festpreis_netto: p.einzelpreis_netto ?? 0 });
  }

  async function positionEntfernen(p: PositionRow) {
    if (gesperrt) return;
    if (!window.confirm(`Position "${p.bezeichnung || 'ohne Bezeichnung'}" entfernen?`)) return;
    try {
      const { error } = await supabase.from('aufmass_positionen').delete().eq('id', p.id);
      if (error) throw error;
      if (form.id) await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Rechnung aus Aufmaß ---------------------------------------------
  async function rechnungErstellen() {
    if (!form.id || rechnungBusy) return;
    if (positionen.length === 0) { setFehler('Das Aufmaß hat keine Positionen.'); return; }
    if (summe.betragUnvollstaendig) {
      setFehler(`Kein Preis für: ${summe.ohnePreis.join(' · ')}. Bitte zuerst ergänzen.`);
      return;
    }
    if (!window.confirm(`Aus diesem Aufmaß eine Rechnung erstellen?\n\n${eur(summe.brutto)} brutto · ${positionen.length} Positionen.\n\nDas Aufmaß wird auf „Abgerechnet" gesetzt und gesperrt.`)) return;

    setRechnungBusy(true); setFehler(null);
    try {
      const res = await fetch('/api/rechnung-aus-aufmass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aufmassId: form.id }),
      });
      const daten = await res.json();
      if (!res.ok) { setFehler(daten?.error || 'Rechnung konnte nicht erstellt werden.'); setRechnungBusy(false); return; }
      const hinweis = daten.bereitsVorhanden
        ? 'Zu diesem Aufmaß existiert bereits eine Rechnung. Jetzt öffnen?'
        : 'Rechnung wurde erstellt. Jetzt öffnen?';
      if (window.confirm(hinweis)) router.push(`/dashboard/rechnungen/${daten.rechnungId}`);
      else { await laden_(); if (form.id) await ladePositionen(form.id); setForm((f) => ({ ...f, status: 'abgerechnet' })); }
    } catch (e: unknown) {
      setFehler('Rechnung erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setRechnungBusy(false); }
  }

  // --- Kennzahlen -------------------------------------------------------
  const entwuerfe = aufmasse.filter((a) => a.status === 'entwurf').length;
  const fertige = aufmasse.filter((a) => a.status === 'fertig' || a.status === 'abgerechnet').length;
  const summe = aufmassSumme(positionen);

  const kiKontext = aufmasse.length === 0 ? '' :
    `${aufmasse.length} Aufmaße, davon ${entwuerfe} in Entwurf. Aktuell geöffnet: "${form.titel || '—'}" mit ${positionen.length} Positionen.`;

  function pdfErzeugen() {
    if (!form.id) return;
    aufmassPdf(
      {
        nummer: form.nummer, titel: form.titel, status: form.status,
        kunde_name: form.kunde_name, projekt: form.projekt, ort: form.ort,
        aufmass_datum: form.aufmass_datum, bearbeiter: form.bearbeiter, notiz: form.notiz,
      },
      positionen.map((p, i) => ({
        position_nr: p.position_nr ?? i + 1, bezeichnung: p.bezeichnung, menge: p.menge,
        einheit: p.einheit, einzelpreis_netto: p.einzelpreis_netto,
        festpreis_netto: p.festpreis_netto, mwst_satz: p.mwst_satz, rechenweg: p.rechenweg,
      })),
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Aufmaß</h1>
          <p style={styles.sub}>Mengen vor Ort erfassen — Flächen, Längen, Volumen, Stück, Hektar, Festmeter. Rechnen Sie direkt im Mengenfeld: <code style={styles.code}>8,20 × 5,77</code> oder <code style={styles.code}>4,2 × 2,6 − 0,9 × 2,1</code>.</p>
        </div>
        <button onClick={neu} style={styles.primaerBtn}>+ Neues Aufmaß</button>
      </div>

      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Aufmaße" value={String(aufmasse.length)} accent={C.cyan} />
          <SummeKarte label="Entwürfe" value={String(entwuerfe)} accent={entwuerfe > 0 ? C.warn : C.green} />
          <SummeKarte label="Fertig/Abgerechnet" value={String(fertige)} accent={C.green} />
        </div>
      )}

      {!laden && kiKontext && (
        <KiAuge modul="Aufmaß" kontext={kiKontext} aktionHref="/dashboard/aufmass" aktionText="Zu den Aufmaßen" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Liste */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Aufmaße</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : aufmasse.length === 0 ? (
          <div style={styles.hint}>Noch keine Aufmaße. Leg oben rechts das erste an.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aufmasse.map((a) => {
              const sd = statusDef(a.status);
              return (
                <button key={a.id} onClick={() => bearbeiten(a)} style={styles.listItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: sd.farbe, display: 'inline-block', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.nummer ? `${a.nummer} · ` : ''}{a.titel}
                      </div>
                      <div style={{ fontSize: 12, color: C.textDim }}>
                        {[a.kunde_name, a.projekt, datumHuebsch(a.aufmass_datum)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {a.rechnung_id && <span style={styles.rechnungBadge}>🧾 fakturiert</span>}
                    <span style={{ fontSize: 12, color: sd.farbe }}>{sd.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Modal ------------------------------------------------------ */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ ...styles.modalTitel, margin: 0 }}>{form.id ? 'Aufmaß bearbeiten' : 'Neues Aufmaß'}</h2>
              {gespeichertHinweis && <span style={{ color: C.green, fontSize: 13 }}>✓ gespeichert</span>}
            </div>

            {fehler && <div style={{ ...styles.err, marginBottom: 16 }}>{fehler}</div>}

            {gesperrt && (
              <div style={styles.sperrBox}>
                🔒 <strong>Abgerechnet.</strong> Die Positionen sind schreibgeschützt. Für Änderungen die Rechnung stornieren und ein neues Aufmaß anlegen.
              </div>
            )}

            <div style={styles.formGrid}>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Pflasterarbeiten Hof Müller / Durchforstung Abt. 7" />
              </Feld>
              <Feld label="Kunde">
                <input style={styles.input} value={form.kunde_name} onChange={(e) => setF('kunde_name', e.target.value)} />
              </Feld>
              <Feld label="Projekt / Objekt">
                <input style={styles.input} value={form.projekt} onChange={(e) => setF('projekt', e.target.value)} />
              </Feld>
              <Feld label="Ort / Adresse">
                <input style={styles.input} value={form.ort} onChange={(e) => setF('ort', e.target.value)} />
              </Feld>
              <Feld label="Aufmaß-Nr.">
                <input style={styles.input} value={form.nummer} onChange={(e) => setF('nummer', e.target.value)} />
              </Feld>
              <Feld label="Datum">
                <input type="date" style={styles.input} value={form.aufmass_datum} onChange={(e) => setF('aufmass_datum', e.target.value)} />
              </Feld>
              <Feld label="Status">
                <select style={styles.input} value={form.status} onChange={(e) => setF('status', e.target.value)} disabled={gesperrt}>
                  {STATUS_LISTE.map((s) => <option key={s.wert} value={s.wert}>{s.label}</option>)}
                </select>
              </Feld>
              <Feld label="Bearbeiter">
                <input style={styles.input} value={form.bearbeiter} onChange={(e) => setF('bearbeiter', e.target.value)} placeholder="wer hat aufgemessen" />
              </Feld>
              <Feld label="Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} />
              </Feld>
            </div>

            {!form.id ? (
              <div style={styles.infoBox}>Kopfdaten unten mit „Anlegen" speichern — danach kannst du Positionen erfassen.</div>
            ) : (
              <div style={styles.sektion}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={styles.sektionTitel}>📐 Positionen</span>
                </div>

                {!gesperrt && (
                  <>
                    <div style={{ position: 'relative' }}>
                      <input style={styles.input} value={leiSuche}
                        onFocus={() => setLeiOffen(true)}
                        onChange={(e) => { setLeiSuche(e.target.value); setLeiOffen(true); }}
                        placeholder="▾ Leistung aus dem Katalog suchen & übernehmen …" />
                      {leiOffen && (
                        <div style={styles.dropdown}>
                          {leiTreffer.length === 0 ? (
                            <div style={{ padding: '10px 12px', color: C.textDim, fontSize: 13 }}>
                              Keine passende Leistung. Katalog unter „Leistungskatalog" pflegen.
                            </div>
                          ) : leiTreffer.map((k) => (
                            <button key={k.id} onClick={() => katalogUebernehmen(k)} style={styles.dropdownItem}>
                              <span style={{ fontWeight: 600 }}>{k.bezeichnung}</span>
                              <span style={{ color: C.textDim, fontSize: 12 }}>
                                {' · '}{k.kategorie || 'ohne Kat.'}{' · '}{preisText(k)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={leerePosition} style={styles.miniBtn}>+ Freie Position</button>
                      {leiOffen && <button onClick={() => setLeiOffen(false)} style={{ ...styles.miniBtnGhost, marginLeft: 'auto' }}>Liste schließen</button>}
                    </div>
                  </>
                )}

                {positionen.length === 0 ? (
                  <div style={{ color: C.textDim, fontSize: 13, marginTop: 12 }}>Noch keine Positionen.</div>
                ) : (
                  <div style={{ overflowX: 'auto', marginTop: 12 }}>
                    <table style={styles.posTable}>
                      <thead>
                        <tr>
                          <th style={styles.posTh}>#</th>
                          <th style={styles.posTh}>Bezeichnung</th>
                          <th style={{ ...styles.posTh, width: 130 }}>Menge / Rechnung</th>
                          <th style={{ ...styles.posTh, width: 80 }}>Einheit</th>
                          <th style={{ ...styles.posTh, width: 110, textAlign: 'right' }}>Preis</th>
                          <th style={{ ...styles.posTh, width: 64, textAlign: 'right' }}>MwSt %</th>
                          <th style={{ ...styles.posTh, width: 100, textAlign: 'right' }}>Betrag</th>
                          <th style={{ ...styles.posTh, width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {positionen.map((p, i) => {
                          const betrag = positionsBetrag(p);
                          const pauschal = istPauschal(p);
                          const mFehler = mengeFehler[p.id];
                          return (
                            <tr key={p.id}>
                              <td style={{ ...styles.posTd, color: C.textDim }}>{i + 1}</td>
                              <td style={styles.posTd}>
                                <input style={styles.posInput} disabled={gesperrt} defaultValue={p.bezeichnung ?? ''}
                                  onBlur={(e) => positionAendern(p.id, { bezeichnung: e.target.value })}
                                  placeholder="z. B. Pflaster verlegen" />
                                {p.leistung_id && <span style={styles.katalogBadge}>Katalog</span>}
                              </td>
                              <td style={styles.posTd}>
                                <input
                                  style={{ ...styles.posInput, textAlign: 'right', borderColor: mFehler ? C.danger : undefined }}
                                  disabled={gesperrt}
                                  defaultValue={p.rechenweg || String(p.menge ?? 0)}
                                  placeholder="8,20 × 5,77"
                                  onBlur={(e) => mengeSetzen(p, e.target.value)}
                                />
                                {mFehler
                                  ? <div style={styles.zellFehler}>{mFehler}</div>
                                  : <div style={styles.zellHinweis}>{mengeText(p.menge)}{p.rechenweg ? '' : ' '}</div>}
                              </td>
                              <td style={styles.posTd}>
                                <input style={styles.posInput} disabled={gesperrt} list="argonaut-aufmass-einheiten"
                                  defaultValue={p.einheit ?? 'm²'}
                                  onBlur={(e) => positionAendern(p.id, { einheit: e.target.value.trim() || 'm²' })} />
                                <datalist id="argonaut-aufmass-einheiten">
                                  {EINHEITEN.map((u) => <option key={u} value={u} />)}
                                </datalist>
                              </td>
                              <td style={styles.posTd}>
                                <input
                                  style={{ ...styles.posInput, textAlign: 'right' }}
                                  disabled={gesperrt}
                                  defaultValue={pauschal
                                    ? (p.festpreis_netto != null ? String(p.festpreis_netto) : '')
                                    : (p.einzelpreis_netto != null ? String(p.einzelpreis_netto) : '')}
                                  placeholder="—"
                                  onBlur={(e) => positionAendern(p.id, pauschal
                                    ? { festpreis_netto: num(e.target.value) }
                                    : { einzelpreis_netto: num(e.target.value) })}
                                />
                                <button
                                  onClick={() => pauschaleUmschalten(p)}
                                  disabled={gesperrt}
                                  style={{ ...styles.preisSchalter, color: pauschal ? C.gold : C.textDim }}
                                  title={pauschal ? 'Zurück zu Preis je Einheit' : 'Als Pauschale rechnen'}
                                >
                                  {pauschal ? 'pauschal' : `€ / ${(p.einheit || 'Einheit').trim()}`}
                                </button>
                              </td>
                              <td style={styles.posTd}>
                                <input style={{ ...styles.posInput, textAlign: 'right' }} disabled={gesperrt}
                                  defaultValue={String(p.mwst_satz ?? 19)}
                                  onBlur={(e) => positionAendern(p.id, { mwst_satz: num(e.target.value) ?? 19 })} />
                              </td>
                              <td style={{ ...styles.posTd, textAlign: 'right', color: C.gold, fontWeight: 600 }}>
                                {betrag != null ? eur(betrag) : '—'}
                              </td>
                              <td style={{ ...styles.posTd, textAlign: 'center' }}>
                                {!gesperrt && <button onClick={() => positionEntfernen(p)} style={styles.xBtn} title="Entfernen">✕</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Live-Summe */}
                {positionen.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 10 }}>
                      {summe.mengenJeEinheit.map((m) => mengeText(m.menge, m.einheit)).join('  ·  ')}
                    </div>

                    {summe.betragUnvollstaendig && (
                      <div style={styles.warnBox}>
                        ⚠ Kein Preis für: <strong>{summe.ohnePreis.join(' · ')}</strong>.
                        Diese Positionen sind in der Summe <strong>nicht</strong> enthalten.
                      </div>
                    )}

                    {summe.gruppen.length > 0 && (
                      <div style={styles.summenBlock}>
                        <SummeZeile label="Zwischensumme (netto)" wert={eur(summe.netto)} />
                        {summe.gruppen.length === 1 ? (
                          <SummeZeile
                            label={`zzgl. ${satzText(summe.gruppen[0].satz)} % USt auf ${eur(summe.gruppen[0].netto)}`}
                            wert={eur(summe.gruppen[0].steuer)}
                          />
                        ) : (
                          <>
                            <div style={{ ...styles.sektionTitel, fontSize: 10.5, margin: '8px 0 4px', color: C.textDim }}>
                              Umsatzsteuer nach Steuersätzen
                            </div>
                            {summe.gruppen.map((g) => (
                              <SummeZeile key={g.satz} klein
                                label={`${satzText(g.satz)} % auf ${eur(g.netto)}`} wert={eur(g.steuer)} />
                            ))}
                            <SummeZeile label="Umsatzsteuer gesamt" wert={eur(summe.steuer)} />
                          </>
                        )}
                        <SummeZeile label="Gesamt (brutto)" wert={eur(summe.brutto)} stark />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={styles.modalAktionen}>
              {form.id && (
                <button onClick={() => { const a = aufmasse.find((x) => x.id === form.id); if (a) archivieren(a); }} disabled={speichert}
                  style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>Archivieren</button>
              )}
              {form.id && (
                <button onClick={pdfErzeugen} disabled={speichert} style={styles.ghostBtn}>🖨 Aufmaßblatt PDF</button>
              )}
              {form.id && (
                <button onClick={rechnungErstellen}
                  disabled={speichert || rechnungBusy || positionen.length === 0 || summe.betragUnvollstaendig}
                  title={summe.betragUnvollstaendig ? 'Erst alle Preise ergänzen' : ''}
                  style={{
                    ...styles.rechnungBtn,
                    opacity: (speichert || rechnungBusy || positionen.length === 0 || summe.betragUnvollstaendig) ? 0.5 : 1,
                    cursor: (positionen.length === 0 || summe.betragUnvollstaendig) ? 'not-allowed' : 'pointer',
                  }}>
                  {rechnungBusy ? 'Erstellt …' : (aktAufmass?.rechnung_id ? '🧾 Rechnung öffnen' : '🧾 Rechnung erstellen')}
                </button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>{form.id ? 'Schließen' : 'Abbrechen'}</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Kopfdaten speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (
    <div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}>
      <label style={styles.lbl}>{label}</label>
      {children}
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
function SummeZeile({ label, wert, stark, klein }: { label: string; wert: string; stark?: boolean; klein?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: klein ? '3px 0' : '5px 0',
      fontSize: klein ? 12.5 : 13.5,
      borderTop: stark ? `2px solid ${C.gold}` : undefined,
      marginTop: stark ? 6 : undefined,
      paddingTop: stark ? 8 : undefined,
      fontWeight: stark ? 700 : 400,
    }}>
      <span style={{ color: stark ? C.text : C.textDim }}>{label}</span>
      <span style={{ color: stark ? C.gold : C.text, fontSize: stark ? 16 : undefined }}>{wert}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 720, lineHeight: 1.6 },
  code: { background: 'rgba(0,229,255,0.1)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 5, padding: '1px 6px', fontSize: 13, color: C.cyan },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  rechnungBtn: { background: 'rgba(201,168,76,0.14)', color: C.gold, border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text },
  rechnungBadge: { fontSize: 10.5, color: C.gold, border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 5, padding: '2px 6px' },
  katalogBadge: { marginLeft: 6, fontSize: 9.5, color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 5, padding: '1px 5px' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text },
  warnBox: { padding: '10px 13px', background: 'rgba(224,162,76,0.12)', border: `1px solid rgba(224,162,76,0.4)`, borderRadius: 10, fontSize: 12.5, color: C.text, marginBottom: 10, lineHeight: 1.5 },
  sperrBox: { padding: '11px 14px', background: 'rgba(201,168,76,0.12)', border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 10, fontSize: 13, color: C.text, marginBottom: 16, lineHeight: 1.5 },

  sektion: { marginTop: 18, padding: 16, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  sektionTitel: { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  summenBlock: { marginLeft: 'auto', maxWidth: 380, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' },

  dropdown: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 6, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' },
  dropdownItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(143,163,190,0.08)`, color: C.text, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },

  posTable: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  posTh: { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  posTd: { padding: '5px 8px', fontSize: 13, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  posInput: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' },
  preisSchalter: { display: 'block', width: '100%', textAlign: 'right', background: 'transparent', border: 'none', padding: '2px 2px 0', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 },
  zellHinweis: { fontSize: 10, color: C.textDim, textAlign: 'right', padding: '2px 2px 0' },
  zellFehler: { fontSize: 10, color: C.danger, textAlign: 'right', padding: '2px 2px 0', lineHeight: 1.3 },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },

  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 900, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' },
};
