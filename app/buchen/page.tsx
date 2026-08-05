'use client';

// ============================================================
// ARGONAUT OS · Öffentliche Bestellstrecke (DUNKEL bis Schalter an)
// I1a Paket+Sitze · I1b Laufzeit+§14 · I1c Firmendaten
// I1d SEPA-Mandat + AGB/AVV + verbindliche Bestellung (→ /api/bestellung).
// Solange flags.BESTELLSTRECKE_LIVE === false: nicht verlinkt, Absenden aus
// (Knopf deaktiviert; die API lehnt zusätzlich serverseitig ab).
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
const SCHRITTE = ['Paket', 'Nutzer', 'Laufzeit', 'Für Unternehmen', 'Firmendaten', 'SEPA', 'AGB & AVV', 'Abschluss'];

// IBAN-Prüfung (Modulo-97) — nur für die UX-Anzeige. Die verbindliche Prüfung
// macht die Server-Route mit lib/sepa.ibanGueltig.
function ibanClientOk(raw: string): boolean {
  const iban = (raw || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const re = iban.slice(4) + iban.slice(0, 4);
  const num = re.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (let i = 0; i < num.length; i += 7) rem = Number(String(rem) + num.substr(i, 7)) % 97;
  return rem === 1;
}
function maskIbanAnzeige(raw: string): string {
  const c = (raw || '').replace(/\s+/g, '').toUpperCase();
  if (c.length < 8) return c || '—';
  return `${c.slice(0, 4)} …… ${c.slice(-4)}`;
}

export default function BuchenPage() {
  const [schritt, setSchritt] = useState(1);
  const [stufeKey, setStufeKey] = useState<StufeKey | null>(null);
  const [sitze, setSitze] = useState<Required<Sitzbelegung>>({ voll: 0, standard: 0, self_service: 0 });
  const [laufzeit, setLaufzeit] = useState<LaufzeitMonate>(12);
  const [istUnternehmer, setIstUnternehmer] = useState(false);
  const [firma, setFirma] = useState({ firma: '', strasse: '', plz: '', ort: '', ustId: '', ansprechpartner: '', email: '', telefon: '' });
  const [kontoinhaber, setKontoinhaber] = useState('');
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [mandatOk, setMandatOk] = useState(false);
  const [agbOk, setAgbOk] = useState(false);
  const [avvOk, setAvvOk] = useState(false);
  const [sende, setSende] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; text: string } | null>(null);

  const stufe = stufeKey ? STUFEN.find((s) => s.key === stufeKey) ?? null : null;
  const summe = stufeKey ? angebotssumme(stufeKey, sitze, laufzeit) : null;
  const ibanOk = ibanClientOk(iban);

  function setSitz(typ: SitzTyp, wert: string) {
    const n = Math.max(0, Math.floor(Number(wert) || 0));
    setSitze((s) => ({ ...s, [typ]: n }));
  }
  function setFirmaFeld(k: keyof typeof firma, v: string) {
    setFirma((f) => ({ ...f, [k]: v }));
  }

  const firmaOk = !!(firma.firma.trim() && firma.strasse.trim() && firma.plz.trim() && firma.ort.trim() && firma.ansprechpartner.trim() && firma.email.trim());
  const sepaOk = !!(kontoinhaber.trim() && ibanOk && mandatOk);
  const agbAllesOk = agbOk && avvOk;
  const abschlussOk = !!stufeKey && istUnternehmer && firmaOk && sepaOk && agbAllesOk;

  const kannWeiter =
    schritt === 1 ? !!stufeKey :
    schritt === 4 ? istUnternehmer :
    schritt === 5 ? firmaOk :
    schritt === 6 ? sepaOk :
    schritt === 7 ? agbAllesOk : true;

  async function bestellen() {
    setSende(true); setErgebnis(null);
    try {
      const res = await fetch('/api/bestellung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stufe: stufeKey, sitze, laufzeit, istUnternehmer, firma, kontoinhaber, iban, bic, mandatOk, agbOk, avvOk }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) setErgebnis({ ok: false, text: j.error || 'Es ist ein Fehler aufgetreten.' });
      else setErgebnis({ ok: true, text: 'Vielen Dank! Ihre Bestellung ist eingegangen — wir melden uns umgehend.' });
    } catch {
      setErgebnis({ ok: false, text: 'Netzwerkfehler. Bitte später erneut versuchen.' });
    }
    setSende(false);
  }

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
                          {o.prozent ? `−${o.prozent} % Rabatt` : 'kein Rabatt'}
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
                <div style={styles.cardTitel}>5 · Firmendaten</div>
                <p style={styles.dim}>Für Auftragsbestätigung und Rechnung. Felder mit * sind Pflicht.</p>
                <div style={styles.formGrid}>
                  <div style={{ gridColumn: '1 / -1' }}><Feld label="Firma *" value={firma.firma} onChange={(v) => setFirmaFeld('firma', v)} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><Feld label="Straße & Nr. *" value={firma.strasse} onChange={(v) => setFirmaFeld('strasse', v)} /></div>
                  <Feld label="PLZ *" value={firma.plz} onChange={(v) => setFirmaFeld('plz', v)} />
                  <Feld label="Ort *" value={firma.ort} onChange={(v) => setFirmaFeld('ort', v)} />
                  <Feld label="USt-IdNr. (optional)" value={firma.ustId} onChange={(v) => setFirmaFeld('ustId', v)} />
                  <Feld label="Ansprechpartner *" value={firma.ansprechpartner} onChange={(v) => setFirmaFeld('ansprechpartner', v)} />
                  <Feld label="E-Mail *" value={firma.email} onChange={(v) => setFirmaFeld('email', v)} />
                  <Feld label="Telefon (optional)" value={firma.telefon} onChange={(v) => setFirmaFeld('telefon', v)} />
                </div>
              </div>
            )}

            {schritt === 6 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>6 · SEPA-Lastschriftmandat</div>
                <p style={styles.dim}>Für den späteren Einzug der monatlichen Gebühren. Es wird jetzt <b>nichts abgebucht</b>.</p>
                <div style={styles.formGrid}>
                  <div style={{ gridColumn: '1 / -1' }}><Feld label="Kontoinhaber *" value={kontoinhaber} onChange={setKontoinhaber} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><Feld label="IBAN *" value={iban} onChange={setIban} /></div>
                  <Feld label="BIC (optional)" value={bic} onChange={setBic} />
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: iban.trim() === '' ? C.textDim : ibanOk ? C.green : C.danger }}>
                  {iban.trim() === '' ? 'IBAN eingeben' : ibanOk ? '✓ IBAN gültig' : '✗ IBAN unvollständig oder ungültig'}
                </div>
                <label style={{ ...styles.check, marginTop: 12 }}>
                  <input type="checkbox" checked={mandatOk} onChange={(e) => setMandatOk(e.target.checked)} />
                  <span>Ich ermächtige ARGONAUT OS, Zahlungen von meinem Konto per SEPA-Lastschrift einzuziehen (Mandat). Es erfolgt <b>keine sofortige Abbuchung</b>.</span>
                </label>
              </div>
            )}

            {schritt === 7 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>7 · AGB &amp; Auftragsverarbeitung</div>
                <label style={styles.check}>
                  <input type="checkbox" checked={agbOk} onChange={(e) => setAgbOk(e.target.checked)} />
                  <span>Ich akzeptiere die <a href="/agb" target="_blank" rel="noreferrer" style={styles.link}>AGB</a>.</span>
                </label>
                <label style={{ ...styles.check, marginTop: 10 }}>
                  <input type="checkbox" checked={avvOk} onChange={(e) => setAvvOk(e.target.checked)} />
                  <span>Ich stimme dem <a href="/agb" target="_blank" rel="noreferrer" style={styles.link}>Auftragsverarbeitungsvertrag (AVV)</a> zu.</span>
                </label>
              </div>
            )}

            {schritt === 8 && (
              <div style={styles.card}>
                <div style={styles.cardTitel}>8 · Abschluss</div>
                <div style={styles.ueberblick}>
                  <div><span style={styles.ubLabel}>Paket</span> <b>{stufe?.name}</b> · {laufzeit} Monate</div>
                  <div><span style={styles.ubLabel}>Firma</span> {firma.firma}, {firma.plz} {firma.ort}</div>
                  <div><span style={styles.ubLabel}>Ansprechpartner</span> {firma.ansprechpartner} · {firma.email}</div>
                  <div><span style={styles.ubLabel}>SEPA</span> {kontoinhaber} · {maskIbanAnzeige(iban)}</div>
                  {summe && <div><span style={styles.ubLabel}>Erster Monat</span> <b style={{ color: C.gold }}>{euro(summe.ersterMonatBrutto)}</b> brutto</div>}
                </div>

                {ergebnis && <div style={ergebnis.ok ? styles.ok : styles.err}>{ergebnis.text}</div>}

                {BESTELLSTRECKE_LIVE ? (
                  <button
                    style={{ ...styles.btnGold, marginTop: 14, opacity: abschlussOk && !sende ? 1 : 0.5 }}
                    disabled={!abschlussOk || sende}
                    onClick={bestellen}>
                    {sende ? 'Wird gesendet …' : 'Zahlungspflichtig bestellen'}
                  </button>
                ) : (
                  <>
                    <button style={styles.bestellBtn} disabled title="Wird zum Start freigeschaltet">
                      Verbindlich bestellen — bald verfügbar
                    </button>
                    <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
                      Die Bestellstrecke ist noch nicht scharfgeschaltet. Alle Eingaben sind hier bereits vollständig testbar.
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={styles.nav}>
              {schritt > 1 && <button style={styles.btnGhost} onClick={() => setSchritt((s) => s - 1)}>‹ Zurück</button>}
              <span style={{ flex: 1 }} />
              {schritt < SCHRITTE.length && (
                <button style={{ ...styles.btnGold, opacity: kannWeiter ? 1 : 0.45 }} disabled={!kannWeiter}
                  onClick={() => setSchritt((s) => s + 1)}>Weiter ›</button>
              )}
            </div>
          </div>

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

function Feld({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <input style={styles.feldInput} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  vorschau: { background: 'rgba(224,162,76,0.14)', borderBottom: '1px solid rgba(224,162,76,0.5)', color: '#E0A24C', textAlign: 'center', padding: '10px 16px', fontSize: 14 },
  page: { maxWidth: 1000, margin: '0 auto', padding: '32px clamp(16px,3vw,40px) 80px' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(26px,3vw,38px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 16, margin: '8px 0 0' },

  stepbar: { display: 'flex', alignItems: 'center', gap: 4, margin: '24px 0 20px', flexWrap: 'wrap' },
  stepItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
  stepNr: { width: 26, height: 26, borderRadius: 999, background: C.navy2, border: `1px solid ${C.border}`, color: C.textDim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 },
  stepNrAktiv: { background: C.gold, color: C.navy, border: `1px solid ${C.gold}` },
  stepNrFertig: { background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}66` },
  stepLinie: { width: 'clamp(8px,1.8vw,24px)', height: 1, background: C.border, margin: '0 2px' },

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
  link: { color: C.cyan, textDecoration: 'underline' },

  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  feld: { display: 'flex', flexDirection: 'column', gap: 5 },
  feldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600 },
  feldInput: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  ueberblick: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: C.text, lineHeight: 1.5 },
  ubLabel: { display: 'inline-block', minWidth: 130, color: C.textDim, fontSize: 13 },

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
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
