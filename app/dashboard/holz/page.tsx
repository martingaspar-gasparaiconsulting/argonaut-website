'use client';

// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · A2-3 · Brennholz-Sortiment
// Verkaufbare Varianten pflegen: Holzart × Scheitlänge × Trocknungsgrad.
// Live-Prüfung (1. BImSchV, Restfeuchte-Plausibilität), Dubletten-Schutz vor
// dem DB-Index, Umrechnungs-Vorschau. Bestätigung vor jedem Schreiben.
// Kein Löschen — nur Deaktivieren (Belege bleiben lesbar, GoBD).
// Pfad: app/dashboard/holz/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  HOLZARTEN, SCHEITLAENGEN, holzartName, umrechnungsHinweis, formatZahl,
  type HolzartSchluessel,
} from '../_components/holzLogik';
import {
  TROCKNUNGSGRADE, BRENNFERTIG_GRENZE_PROZENT,
  pruefeSortiment, findeVariante, sortiereSortimente, anzeigeName,
  sortimentBezeichnung, trocknungsgradName, restfeuchteBereichText,
  istBrennfertig, neuerSortimentEntwurf,
  type Sortiment, type SortimentEntwurf, type Trocknungsgrad,
} from '../_components/sortimentLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Form = {
  id: string | null;
  holzart: HolzartSchluessel;
  scheitlaenge_cm: string;
  trocknungsgrad: Trocknungsgrad;
  restfeuchte_prozent: string;
  bezeichnung: string;
  notiz: string;
  aktiv: boolean;
};

function leerForm(): Form {
  const e = neuerSortimentEntwurf();
  return {
    id: null,
    holzart: e.holzart,
    scheitlaenge_cm: String(e.scheitlaenge_cm),
    trocknungsgrad: e.trocknungsgrad,
    restfeuchte_prozent: '',
    bezeichnung: '',
    notiz: '',
    aktiv: true,
  };
}

function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}

export default function HolzSortimentPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Sortiment[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(leerForm());
  const [speichert, setSpeichert] = useState(false);
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);

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
      const { data, error } = await supabase.from('holz_sortiment').select('*')
        .eq('owner_user_id', uid);
      if (error) throw error;
      setListe(sortiereSortimente((data as Sortiment[]) ?? []));
    } catch (e: unknown) {
      setFehler('Sortiment konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  function neu() { setForm(leerForm()); setGespeichertHinweis(false); setFehler(null); setModalAuf(true); }

  function bearbeiten(s: Sortiment) {
    setForm({
      id: s.id,
      holzart: s.holzart,
      scheitlaenge_cm: String(s.scheitlaenge_cm),
      trocknungsgrad: s.trocknungsgrad,
      restfeuchte_prozent: s.restfeuchte_prozent != null ? String(s.restfeuchte_prozent) : '',
      bezeichnung: s.bezeichnung ?? '',
      notiz: s.notiz ?? '',
      aktiv: s.aktiv,
    });
    setGespeichertHinweis(false); setFehler(null); setModalAuf(true);
  }

  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  // --- Live-Prüfung ----------------------------------------------------
  const entwurf: SortimentEntwurf = useMemo(() => ({
    holzart: form.holzart,
    scheitlaenge_cm: num(form.scheitlaenge_cm) ?? 0,
    trocknungsgrad: form.trocknungsgrad,
    restfeuchte_prozent: num(form.restfeuchte_prozent),
    bezeichnung: form.bezeichnung.trim() || null,
    notiz: form.notiz.trim() || null,
    aktiv: form.aktiv,
  }), [form]);

  const pruefung = useMemo(() => pruefeSortiment(entwurf), [entwurf]);
  const dublette = useMemo(
    () => findeVariante(liste, entwurf, form.id ?? undefined),
    [liste, entwurf, form.id],
  );
  const kannSpeichern = pruefung.ok && !dublette && !speichert;

  const rf = num(form.restfeuchte_prozent);
  const laenge = num(form.scheitlaenge_cm);

  // Umrechnungs-Vorschau: was bedeutet 1 SRM dieser Variante?
  const vorschau = useMemo(() => {
    if (!laenge || laenge <= 0) return null;
    try {
      return umrechnungsHinweis('srm', 'fm', { holzart: form.holzart, scheitlaenge: laenge });
    } catch { return null; }
  }, [form.holzart, laenge]);

  // --- Schreiben -------------------------------------------------------
  async function speichern() {
    if (!uid || !kannSpeichern) return;
    const name = sortimentBezeichnung(entwurf.holzart, entwurf.scheitlaenge_cm, entwurf.trocknungsgrad);
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neue Variante anlegen?\n\n• ${name}` : `Änderungen an "${name}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        holzart: entwurf.holzart,
        scheitlaenge_cm: entwurf.scheitlaenge_cm,
        trocknungsgrad: entwurf.trocknungsgrad,
        restfeuchte_prozent: entwurf.restfeuchte_prozent ?? null,
        bezeichnung: entwurf.bezeichnung,
        notiz: entwurf.notiz,
        aktiv: form.aktiv,
      };
      if (istNeu) {
        const { error } = await supabase.from('holz_sortiment').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('holz_sortiment').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setGespeichertHinweis(true); setTimeout(() => setGespeichertHinweis(false), 2500);
      await laden_();
      if (istNeu) setModalAuf(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      setFehler(
        msg.includes('holz_sortiment_variante_uidx') || msg.includes('duplicate key')
          ? 'Diese Kombination aus Holzart, Scheitlänge und Trocknungsgrad gibt es bereits.'
          : 'Speichern fehlgeschlagen: ' + msg,
      );
    } finally { setSpeichert(false); }
  }

  async function aktivUmschalten(s: Sortiment) {
    const zielAktiv = !s.aktiv;
    const name = anzeigeName(s);
    const frage = zielAktiv
      ? `„${name}" wieder in den Verkauf nehmen?`
      : `„${name}" aus dem Verkauf nehmen?\n\nDie Variante bleibt erhalten — bestehende Belege ändern sich nicht.`;
    if (!window.confirm(frage)) return;
    try {
      const { error } = await supabase.from('holz_sortiment').update({ aktiv: zielAktiv }).eq('id', s.id);
      if (error) throw error;
      setModalAuf(false);
      await laden_();
    } catch (e: unknown) {
      setFehler('Umschalten fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Kennzahlen ------------------------------------------------------
  const aktive = liste.filter((s) => s.aktiv).length;
  const nichtBrennfertig = liste.filter(
    (s) => s.aktiv && s.restfeuchte_prozent != null && !istBrennfertig(s.restfeuchte_prozent),
  ).length;

  const kiKontext = liste.length === 0 ? '' :
    `${liste.length} Brennholz-Varianten, davon ${aktive} im Verkauf. ` +
    `${nichtBrennfertig} aktive Variante(n) liegen über ${BRENNFERTIG_GRENZE_PROZENT} % Restfeuchte. ` +
    `Holzarten: ${[...new Set(liste.map((s) => holzartName(s.holzart)))].join(', ')}.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Brennholz</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Sortiment</h1>
          <p style={styles.sub}>
            Jede verkaufbare Variante einmal anlegen: Holzart, Scheitlänge, Trocknungsgrad.
            Preisliste, Auftrag und Lieferschein greifen später genau hierauf zu.
          </p>
        </div>
        <button onClick={neu} style={styles.primaerBtn}>+ Neue Variante</button>
      </div>

      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Varianten" value={String(liste.length)} accent={C.cyan} />
          <SummeKarte label="Im Verkauf" value={String(aktive)} accent={C.green} />
          <SummeKarte
            label={`Über ${BRENNFERTIG_GRENZE_PROZENT} % Feuchte`}
            value={String(nichtBrennfertig)}
            accent={nichtBrennfertig > 0 ? C.warn : C.green}
          />
        </div>
      )}

      {!laden && kiKontext && (
        <KiAuge modul="Brennholz-Sortiment" kontext={kiKontext} aktionHref="/dashboard/holz" aktionText="Zum Sortiment" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Liste */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Varianten</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : liste.length === 0 ? (
          <div style={styles.hint}>
            Noch keine Varianten. Fang mit deinem Standardartikel an — z. B. Buche, 33 cm, lufttrocken.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {liste.map((s) => {
              const feucht = s.restfeuchte_prozent;
              const warnung = feucht != null && !istBrennfertig(feucht);
              const punkt = !s.aktiv ? C.textDim : warnung ? C.warn : C.green;
              const unterzeile = [
                trocknungsgradName(s.trocknungsgrad),
                feucht != null ? `${formatZahl(feucht, 1)} % Restfeuchte` : null,
                s.notiz,
              ].filter(Boolean).join(' · ');
              return (
                <button key={s.id} onClick={() => bearbeiten(s)} style={{ ...styles.listItem, opacity: s.aktiv ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: punkt, display: 'inline-block', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {anzeigeName(s)}
                      </div>
                      <div style={{ fontSize: 12, color: C.textDim }}>{unterzeile || '—'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: s.aktiv ? C.green : C.textDim, flexShrink: 0 }}>
                    {warnung && s.aktiv ? '⚠ zu feucht' : s.aktiv ? 'im Verkauf' : 'inaktiv'}
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
              <h2 style={{ ...styles.modalTitel, margin: 0 }}>{form.id ? 'Variante bearbeiten' : 'Neue Variante'}</h2>
              {gespeichertHinweis && <span style={{ color: C.green, fontSize: 13 }}>✓ gespeichert</span>}
            </div>

            <div style={styles.formGrid}>
              <Feld label="Holzart *">
                <select style={styles.input} value={form.holzart}
                  onChange={(e) => setF('holzart', e.target.value as HolzartSchluessel)}>
                  {HOLZARTEN.map((h) => (
                    <option key={h.schluessel} value={h.schluessel}>
                      {h.name} ({h.gruppe === 'hart' ? 'Hartholz' : 'Weichholz'})
                    </option>
                  ))}
                </select>
              </Feld>

              <Feld label="Trocknungsgrad *">
                <select style={styles.input} value={form.trocknungsgrad}
                  onChange={(e) => setF('trocknungsgrad', e.target.value as Trocknungsgrad)}>
                  {TROCKNUNGSGRADE.map((t) => (
                    <option key={t.schluessel} value={t.schluessel}>
                      {t.name} ({restfeuchteBereichText(t.schluessel)})
                    </option>
                  ))}
                </select>
              </Feld>

              <Feld label="Scheitlänge in cm *" voll>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input style={{ ...styles.input, width: 120 }} inputMode="numeric"
                    value={form.scheitlaenge_cm} onChange={(e) => setF('scheitlaenge_cm', e.target.value)} />
                  {SCHEITLAENGEN.map((l) => (
                    <button key={l} onClick={() => setF('scheitlaenge_cm', String(l))}
                      style={{ ...styles.miniBtn, ...(laenge === l ? styles.miniBtnAktiv : {}) }}>
                      {l} cm
                    </button>
                  ))}
                </div>
              </Feld>

              <Feld label="Restfeuchte in % (optional)">
                <input style={styles.input} inputMode="decimal" placeholder="z. B. 18"
                  value={form.restfeuchte_prozent} onChange={(e) => setF('restfeuchte_prozent', e.target.value)} />
                {rf != null && (
                  <div style={{ marginTop: 6, fontSize: 12, color: istBrennfertig(rf) ? C.green : C.warn }}>
                    {istBrennfertig(rf)
                      ? `✓ brennfertig (max. ${BRENNFERTIG_GRENZE_PROZENT} % nach 1. BImSchV)`
                      : `⚠ über ${BRENNFERTIG_GRENZE_PROZENT} % — nicht als ofenfertig anbieten`}
                  </div>
                )}
              </Feld>

              <Feld label="Im Verkauf">
                <label style={styles.checkZeile}>
                  <input type="checkbox" checked={form.aktiv} onChange={(e) => setF('aktiv', e.target.checked)} />
                  <span style={{ fontSize: 14 }}>{form.aktiv ? 'Wird angeboten' : 'Nicht im Verkauf'}</span>
                </label>
              </Feld>

              <Feld label="Eigene Bezeichnung (optional)" voll>
                <input style={styles.input} value={form.bezeichnung}
                  onChange={(e) => setF('bezeichnung', e.target.value)}
                  placeholder={sortimentBezeichnung(entwurf.holzart, entwurf.scheitlaenge_cm || 0, entwurf.trocknungsgrad)} />
              </Feld>

              <Feld label="Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }}
                  value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} />
              </Feld>
            </div>

            {/* Umrechnungs-Vorschau */}
            {vorschau && (
              <div style={styles.infoBox}>
                <strong>Mengenumrechnung dieser Variante</strong><br />
                {vorschau}
              </div>
            )}

            {/* Dublette */}
            {dublette && (
              <div style={styles.err}>
                Diese Kombination gibt es bereits: „{anzeigeName(dublette)}".
                Ändere Holzart, Länge oder Trocknungsgrad — oder bearbeite die vorhandene Variante.
              </div>
            )}

            {/* Blockierende Fehler */}
            {pruefung.fehler.length > 0 && (
              <div style={styles.err}>
                {pruefung.fehler.map((f, i) => <div key={i}>{f}</div>)}
              </div>
            )}

            {/* Hinweise */}
            {pruefung.hinweise.length > 0 && (
              <div style={styles.warnBox}>
                {pruefung.hinweise.map((h, i) => <div key={i} style={{ marginBottom: i < pruefung.hinweise.length - 1 ? 6 : 0 }}>⚠ {h}</div>)}
              </div>
            )}

            <div style={styles.modalAktionen}>
              {form.id && (
                <button
                  onClick={() => { const s = liste.find((x) => x.id === form.id); if (s) aktivUmschalten(s); }}
                  disabled={speichert}
                  style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>
                  {form.aktiv ? 'Aus dem Verkauf nehmen' : 'Wieder verkaufen'}
                </button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>
                {form.id ? 'Schließen' : 'Abbrechen'}
              </button>
              <button onClick={speichern} disabled={!kannSpeichern}
                style={{ ...styles.primaerBtn, opacity: kannSpeichern ? 1 : 0.45, cursor: kannSpeichern ? 'pointer' : 'not-allowed' }}>
                {speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}
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

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 680, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnAktiv: { background: 'rgba(0,229,255,0.28)', borderColor: C.cyan, color: '#E8EDF4' },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, marginTop: 16 },
  warnBox: { color: C.warn, fontSize: 13.5, background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, padding: '12px 14px', marginTop: 12, lineHeight: 1.5 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text, lineHeight: 1.6 },

  checkZeile: { display: 'flex', alignItems: 'center', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' },

  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 760, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, alignItems: 'center' },
};
