'use client';

// ============================================================
// ARGONAUT OS · Öffentliche Bestellstrecke — Gerüst (DUNKEL)
// I1a: Schritt 1 Paket + Schritt 2 Sitze + Live-Preis.
// I1b: Schritt 3 Laufzeit (12/24/36, Live-Rabatt) + Schritt 4 §14-Bestätigung.
// Weiter (I1c/I1d): Firmendaten, SEPA, AGB, verbindliche Bestellung.
// Solange flags.BESTELLSTRECKE_LIVE === false: nicht verlinkt, Bestellung aus.
// Pfad: app/buchen/page.tsx
// ============================================================

import { useState, CSSProperties } from 'react';
import {
  STUFEN, SITZ, sitzPreis, angebotssumme, euro, laufzeitOptionen,
  type StufeKey, type SitzTyp, type Sitzbelegung, type LaufzeitMonate,
} from '../../lib/tarif';
import { BESTELLSTRECKE_LIVE } from '../../lib/flags';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const SITZ_TYPEN: SitzTyp[] = ['voll', 'standard', 'self_service'];
const SCHRITTE = ['Paket', 'Nutzer', 'Laufzeit', 'Für Unternehmen', 'Überblick'];

export default function BuchenPage() {
  const [schritt, setSchritt] = useState(1);
  const [stufeKey, setStufeKey] = useState<StufeKey | null>(null);
  const [sitze, setSitze] = useState<Required<Sitzbelegung>>({ voll: 0, standard: 0, self_service: 0 });
  const [laufzeit, setLaufzeit] = useState<LaufzeitMonate>(12);
  const [istUnternehmer, setIstUnternehmer] = useState(false);

  const stufe = stufeKey ? STUFEN.find((s) => s.key === stufeKey) ?? null : null;
  const summe = stufeKey ? angebotssumme(stufeKey, sitze, laufzeit) : null;

  function setSitz(typ: SitzTyp, wert: string) {
    const n = Math.max(0, Math.floor(Number(wert) || 0));
    setSitze((s) => ({ ...s, [typ]: n }));
  }

  const kannWeiter = schritt === 1 ? !!stufeKey : schritt === 4 ? istUnternehmer : true;

  return (
    <div style={styles.wrap}>
      {!BESTELLSTRECKE_LIVE && (
        <div style={styles.vorschau}>
          🔒 <b>Vorschau</b> — diese Bestellstrecke ist noch nicht öffentlich. Sie wird zum Start scharfgeschaltet.
        </div>
      )}

      <div style={styles.page}>
        <h1 style={styles.h1}>ARGONAUT OS buchen</h1>
        <p style={styles.sub}>In wenigen Schritten zum passenden Paket — der Preis rechnet sich live mit.</p>

        {/* Fortschritt */}
        <div style={styles.stepbar}>
          {SCHRITTE.map((s, i) => {
            const nr = i + 1;
            const aktiv = nr === schritt;
            const fertig = nr < schritt;
            return (
              <div key={s} style={styles.stepItem}>
                <span style={{ ...styles.stepNr, ...(aktiv ? styles.stepNrAktiv : fertig ? styles.stepNrFertig : {}) }}>
                  {fertig ? '✓' : nr}
                </span>
                <span style={{ color: aktiv ? C.text : C.textDim, fontWeight: aktiv ? 700 : 500 }}>{s}</span>
                {i < SCHRITTE.length - 1 && <span style={styles.stepLinie} />}
              </div>
            );
          })}
        </div>

        <div style={styles.grid}>
          {/* Hauptbereich */}
          <div style={{ minWidth: 0 }}>
            {schritt === 1 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>1 · Wählen Sie Ihr Paket</div>
                <div style={styles.stufenGrid}>
                  {STUFEN.map((s) => {
                    const gewaehlt = s.key === stufeKey;
                    return (
                      <button key={s.key} onClick={() => setStufeKey(s.key)}
                        style={{ ...styles.stufe, ...(gewaehlt ? styles.stufeAktiv : {}) }}>
                        <div style={styles.stufeName}>{s.name}</div>
                        <div style={styles.stufePers}>{s.personen} Personen</div>
                        <div style={styles.stufePreis}>{s.abPreis ? 'ab ' : ''}{euro(s.grundgebuehr)}<span style={styles.proMonat}>/Monat</span></div>
                        <div style={styles.stufeOnb}>+ {euro(s.onboarding)} Einrichtung</div>
                        {s.hinweis && <div style={styles.stufeHinweis}>{s.hinweis}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {schritt === 2 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>2 · Nutzer / Sitze</div>
                {stufe?.allIn ? (
                  <p style={styles.dim}>
                    <b>{stufe.name}</b> ist All-in: 1 Voll-Nutzer und die KI sind bereits enthalten —
                    hier müssen Sie nichts einstellen.
                  </p>
                ) : (
                  <div style={styles.sitzListe}>
                    {SITZ_TYPEN.map((typ) => (
                      <div key={typ} style={styles.sitzZeile}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{SITZ[typ].name}</div>
                          <div style={{ fontSize: 13, color: C.textDim }}>{SITZ[typ].wer}</div>
                        </div>
                        <div style={styles.sitzPreisTag}>{stufeKey ? euro(sitzPreis(typ, stufeKey)) : '—'}/Monat</div>
                        <input type="number" min={0} value={sitze[typ] || ''} placeholder="0"
                          onChange={(e) => setSitz(typ, e.target.value)} style={styles.sitzInput} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {schritt === 3 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>3 · Laufzeit</div>
                <p style={styles.dim}>Mindestlaufzeit 12 Monate. Längere Laufzeiten sparen bei den monatlichen Gebühren (nicht bei der Einrichtung).</p>
                <div style={styles.laufGrid}>
                  {laufzeitOptionen().map((o) => {
                    const gewaehlt = o.monate === laufzeit;
                    return (
                      <button key={o.monate} onClick={() => setLaufzeit(o.monate)}
                        style={{ ...styles.lauf, ...(gewaehlt ? styles.laufAktiv : {}) }}>
                        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 20 }}>{o.monate} Monate</div>
                        <div style={{ fontSize: 13, color: o.prozent ? C.green : C.textDim, fontWeight: 700, marginTop: 4 }}>
                          {o.prozent ? `−${o.prozent} % Rabatt` : 'kein Rabatt'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {schritt === 4 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>4 · Nutzung als Unternehmen</div>
                <p style={styles.dim}>
                  ARGONAUT OS wird ausschließlich an Unternehmer im Sinne des § 14 BGB verkauft — nicht an Verbraucher.
                  Bitte bestätigen Sie, dass Sie im Rahmen Ihrer gewerblichen oder selbständigen Tätigkeit buchen.
                </p>
                <label style={styles.check}>
                  <input type="checkbox" checked={istUnternehmer} onChange={(e) => setIstUnternehmer(e.target.checked)} />
                  <span>Ich buche als <b>Unternehmer (§ 14 BGB)</b> — gewerblich oder selbständig, nicht als Privatperson.</span>
                </label>
              </div>
            )}

            {schritt === 5 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>5 · Überblick</div>
                <p style={styles.dim}>
                  Das ist Ihre unverbindliche Zusammenstellung. Die weiteren Schritte
                  (Firmendaten, SEPA-Mandat, AGB) folgen in Kürze.
                </p>
                <button style={styles.bestellBtn} disabled title="Wird in Kürze freigeschaltet">
                  Verbindlich bestellen — bald verfügbar
                </button>
              </div>
            )}

            {/* Navigation */}
            <div style={styles.nav}>
              {schritt > 1 && <button style={styles.btnGhost} onClick={() => setSchritt((s) => s - 1)}>‹ Zurück</button>}
              <span style={{ flex: 1 }} />
              {schritt < SCHRITTE.length && (
                <button style={{ ...styles.btnGold, opacity: kannWeiter ? 1 : 0.45 }} disabled={!kannWeiter}
                  onClick={() => setSchritt((s) => s + 1)}>Weiter ›</button>
              )}
            </div>
          </div>

          {/* Preis-Seitenleiste */}
          <aside style={styles.seite}>
            <div style={styles.seiteTitel}>Ihr Preis</div>
            {!summe ? (
              <p style={styles.dim}>Wählen Sie zuerst ein Paket.</p>
            ) : (
              <>
                <div style={styles.preisZeile}><span>Monatlich (netto)</span><b>{euro(summe.monatlich.netto)}</b></div>
                {summe.monatlich.rabattProzent > 0 && (
                  <div style={{ ...styles.preisZeile, color: C.green }}>
                    <span>Laufzeit-Rabatt −{summe.monatlich.rabattProzent} %</span><span>−{euro(summe.monatlich.rabattBetrag)}</span>
                  </div>
                )}
                <div style={styles.preisZeile}><span>zzgl. 19 % MwSt</span><span>{euro(summe.monatlich.mwst)}</span></div>
                <div style={{ ...styles.preisZeile, ...styles.preisGross }}><span>Monatlich (brutto)</span><b>{euro(summe.monatlich.brutto)}</b></div>
                <div style={styles.trenner} />
                <div style={styles.preisZeile}><span>Laufzeit</span><b>{laufzeit} Monate</b></div>
                <div style={styles.preisZeile}><span>Einmalige Einrichtung</span><b>{euro(summe.einrichtungNetto)}</b></div>
                <div style={styles.preisZeile}><span>Erster Monat gesamt (brutto)</span><b style={{ color: C.gold }}>{euro(summe.ersterMonatBrutto)}</b></div>
                {summe.ersparnisGesamt > 0 && (
                  <div style={styles.sparen}>Ersparnis über {laufzeit} Monate: <b>{euro(summe.ersparnisGesamt)}</b></div>
                )}
                <div style={styles.seiteFuss}>Alle Preise netto zzgl. USt. Einrichtung wird nie rabattiert.</div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  vorschau: { background: 'rgba(224,162,76,0.14)', borderBottom: '1px solid rgba(224,162,76,0.5)', color: '#E0A24C', textAlign: 'center', padding: '10px 16px', fontSize: 14 },
  page: { maxWidth: 1000, margin: '0 auto', padding: '32px clamp(16px,3vw,40px) 80px' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(26px,3vw,38px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 16, margin: '8px 0 0' },

  stepbar: { display: 'flex', alignItems: 'center', gap: 4, margin: '24px 0 20px', flexWrap: 'wrap' },
  stepItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  stepNr: { width: 26, height: 26, borderRadius: 999, background: C.navy2, border: `1px solid ${C.border}`, color: C.textDim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 },
  stepNrAktiv: { background: C.gold, color: C.navy, border: `1px solid ${C.gold}` },
  stepNrFertig: { background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}66` },
  stepLinie: { width: 'clamp(10px,2.5vw,32px)', height: 1, background: C.border, margin: '0 4px' },

  grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 18, marginBottom: 14 },

  stufenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  stufe: { textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, cursor: 'pointer', color: C.text },
  stufeAktiv: { border: `2px solid ${C.gold}`, background: 'rgba(201,168,76,0.08)' },
  stufeName: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18 },
  stufePers: { color: C.textDim, fontSize: 13, marginBottom: 8 },
  stufePreis: { fontSize: 20, fontWeight: 800 },
  proMonat: { fontSize: 12, color: C.textDim, fontWeight: 500 },
  stufeOnb: { fontSize: 12, color: C.textDim, marginTop: 2 },
  stufeHinweis: { fontSize: 11.5, color: C.gold, marginTop: 8, lineHeight: 1.4 },

  sitzListe: { display: 'flex', flexDirection: 'column', gap: 10 },
  sitzZeile: { display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, flexWrap: 'wrap' },
  sitzPreisTag: { fontSize: 13, color: C.textDim, whiteSpace: 'nowrap' },
  sitzInput: { width: 74, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 10px', fontSize: 15, fontFamily: 'inherit', textAlign: 'center' },

  laufGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  lauf: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 14px', cursor: 'pointer', color: C.text, textAlign: 'center' },
  laufAktiv: { border: `2px solid ${C.gold}`, background: 'rgba(201,168,76,0.08)' },

  check: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.5, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, cursor: 'pointer' },

  nav: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  bestellBtn: { marginTop: 14, background: C.navy, color: C.textDim, border: `1px dashed ${C.border}`, borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'not-allowed' },

  seite: { background: C.navy2, border: `1px solid ${C.gold}44`, borderRadius: 16, padding: 18, position: 'sticky', top: 20 },
  seiteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18, marginBottom: 12 },
  preisZeile: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, padding: '5px 0', color: C.text },
  preisGross: { fontSize: 16 },
  trenner: { height: 1, background: C.border, margin: '8px 0' },
  sparen: { marginTop: 10, background: `${C.green}14`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  seiteFuss: { fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.5 },

  dim: { color: C.textDim, fontSize: 14, lineHeight: 1.6 },
};
