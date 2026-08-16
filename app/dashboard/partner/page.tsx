'use client';

// ============================================================================
// ARGONAUT OS · Vertrieb · Partner & Multiplikatoren
//
// ABGRENZUNG ZU /dashboard/provisionen
// Dort geht es um die INNERBETRIEBLICHE Verkaufsprovision aus gewonnenen
// Deals — eigene Leute, Empfaenger als Freitext. Hier geht es um EXTERNE
// Partner: Empfehlungsgeber, Multiplikatoren, Vertriebspartner. Mit eigenen
// Stammdaten, eigenen Konditionen und einem Gegengeschaeft, das jemand im
// Blick behalten muss.
//
// DER PUNKT, DEN SONST NIEMAND NACHHAELT
// Ein Multiplikator bekommt einen kostenlosen Zugang und verspricht dafuer
// Vertrag, Logo-Freigabe und ein Zitat. Der Zugang wird sofort eingerichtet —
// die Gegenleistung kommt "naechste Woche" und danach fragt nie wieder jemand.
// Die Ampel oben zaehlt genau diese Faelle.
//
// Logik: lib/multiplikator.ts (0 Abhaengigkeiten, node-getestet).
// Tabellen: provision_partner, provision_zuordnung
// Pfad: app/dashboard/partner/page.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { NurVoll } from '../_components/Ansicht';
import {
  ART_LABEL, ART_ERKLAERUNG, MODELL_LABEL, STATUS_LABEL,
  proPartner, pruefePartner, gegengeschaeftStand, erwartetGeld,
  modellVon, artVon, statusVon, euro, prozent, ibanKurz,
  type Partner, type Zuordnung, type PartnerZeile,
} from '@/lib/multiplikator';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type PartnerZeileDb = Partner & { id: string; erstellt_am?: string | null; notiz?: string | null; telefon?: string | null };

const LEER = {
  name: '', firma: '', email: '', telefon: '',
  art: 'empfehlung', modell: 'einmalig', satz_prozent: '10', laufzeit_monate: '',
  ust_pflichtig: true, iban: '', kontoinhaber: '', notiz: '',
};

function heuteISO() { return new Date().toISOString().slice(0, 10); }
function dtag(iso: string | null | undefined) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export default function PartnerSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [partner, setPartner] = useState<PartnerZeileDb[]>([]);
  const [zuordnungen, setZuordnungen] = useState<Zuordnung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [neu, setNeu] = useState({ ...LEER });
  const [formOffen, setFormOffen] = useState(false);
  const [pruefFehler, setPruefFehler] = useState<string[]>([]);
  const [offenerPartner, setOffenerPartner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const holen = useCallback(async () => {
    setLaden(true); setFehler(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    setUid(u.user.id);
    try {
      const [{ data: p, error: pe }, { data: zz }] = await Promise.all([
        supabase.from('provision_partner').select('*').order('name'),
        supabase.from('provision_zuordnung').select('id,partner_id,kunde_name,basis_netto,satz_prozent,betrag,periode,status,faellig_am,ausgezahlt_am'),
      ]);
      if (pe) throw pe;
      setPartner((p as PartnerZeileDb[]) ?? []);
      setZuordnungen((zz as Zuordnung[]) ?? []);
    } catch {
      setFehler('Die Partner konnten nicht geladen werden. Ist das SQL für Thema 8 eingespielt?');
    }
    setLaden(false);
  }, []);

  useEffect(() => { holen(); }, [holen]);

  const zeilen: PartnerZeile[] = useMemo(
    () => proPartner(partner, zuordnungen), [partner, zuordnungen]);

  const kpi = useMemo(() => {
    const aktive = partner.filter((p) => statusVon(p) === 'aktiv').length;
    const offen = zeilen.reduce((a, z) => a + z.auszahlbar, 0);
    const schulden = zeilen.filter((z) => z.gegen.schuldet).length;
    return { aktive, offen, schulden };
  }, [partner, zeilen]);

  // ---- Anlegen ------------------------------------------------------------
  const anlegen = async () => {
    if (!uid) return;
    const entwurf: Partner = {
      name: neu.name, email: neu.email, art: neu.art, modell: neu.modell,
      satz_prozent: neu.satz_prozent, laufzeit_monate: neu.laufzeit_monate,
      iban: neu.iban,
    };
    const f = pruefePartner(entwurf);
    setPruefFehler(f);
    if (f.length > 0) return;

    setBusy(true);
    const { error } = await supabase.from('provision_partner').insert({
      owner_user_id: uid,
      name: neu.name.trim(),
      firma: neu.firma.trim() || null,
      email: neu.email.trim() || null,
      telefon: neu.telefon.trim() || null,
      art: neu.art,
      modell: neu.modell,
      satz_prozent: neu.modell === 'gegengeschaeft' ? 0 : Number(String(neu.satz_prozent).replace(',', '.')) || 0,
      laufzeit_monate: neu.modell === 'wiederkehrend' ? Math.floor(Number(neu.laufzeit_monate) || 0) : null,
      ust_pflichtig: neu.ust_pflichtig,
      iban: neu.iban.replace(/\s/g, '') || null,
      kontoinhaber: neu.kontoinhaber.trim() || null,
      notiz: neu.notiz.trim() || null,
      status: 'aktiv',
    });
    setBusy(false);
    if (error) { setFehler(error.message); return; }
    setNeu({ ...LEER });
    setFormOffen(false);
    setMeldung('Partner angelegt.');
    holen();
  };

  const feldSetzen = async (id: string, feld: string, wert: unknown) => {
    setPartner((alt) => alt.map((p) => (p.id === id ? { ...p, [feld]: wert } as PartnerZeileDb : p)));
    const { error } = await supabase.from('provision_partner').update({ [feld]: wert }).eq('id', id);
    if (error) { setFehler(error.message); holen(); }
  };

  const entfernen = async (id: string, name: string) => {
    const eigene = zuordnungen.filter((z) => z.partner_id === id);
    if (eigene.length > 0) {
      setFehler(`${name} hat ${eigene.length} zugeordnete Provisionen. Setzen Sie den Partner auf „Beendet“, statt ihn zu löschen — sonst verschwinden die Abrechnungen mit.`);
      return;
    }
    const { error } = await supabase.from('provision_partner').delete().eq('id', id);
    if (error) { setFehler(error.message); return; }
    holen();
  };

  const gegengeschaeftPartner = zeilen.filter((z) => z.gegen.schuldet);

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🤝 Partner & Multiplikatoren</h1>
      <p style={s.sub}>
        Wer empfiehlt Sie weiter — und was bekommt er dafür? Hier stehen Ihre externen Partner mit
        ihren Konditionen. Manche arbeiten gegen Provision, andere gegen Gegenleistung: ein Zugang
        gegen Vertrag, Logo-Freigabe und ein Zitat. Die zweite Sorte wird erfahrungsgemäß vergessen,
        sobald der Zugang eingerichtet ist. Deshalb steht sie hier oben.
      </p>

      {fehler && <div style={s.err}>{fehler}<button style={s.x} onClick={() => setFehler(null)}>✕</button></div>}
      {meldung && <div style={s.ok}>{meldung}<button style={s.x} onClick={() => setMeldung(null)}>✕</button></div>}

      <div style={s.kpis}>
        <div style={s.kpi}><div style={s.kpiZahl}>{kpi.aktive}</div><div style={s.kpiText}>aktive Partner</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiZahl, color: C.gold }}>{euro(kpi.offen)}</div><div style={s.kpiText}>offene Provisionen</div></div>
        <div style={{ ...s.kpi, borderColor: kpi.schulden > 0 ? C.warn : C.border }}>
          <div style={{ ...s.kpiZahl, color: kpi.schulden > 0 ? C.warn : C.green }}>{kpi.schulden}</div>
          <div style={s.kpiText}>Gegenleistung offen</div>
        </div>
      </div>

      {/* ---------- Gegengeschäft-Mahnung ---------- */}
      {gegengeschaeftPartner.length > 0 && (
        <section style={{ ...s.card, borderColor: C.warn }}>
          <h2 style={{ ...s.h2, color: C.warn }}>⚠️ Zugang läuft, Gegenleistung fehlt</h2>
          <p style={s.hint}>
            Diese Partner nutzen bereits einen Zugang, haben aber noch nicht geliefert, was vereinbart war.
          </p>
          {gegengeschaeftPartner.map((z) => (
            <div key={z.partner.id} style={s.zeile}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{z.partner.name}</b>
                {z.partner.firma && <span style={{ color: C.textDim }}> · {z.partner.firma}</span>}
                <br />
                <span style={{ color: C.warn, fontSize: 13 }}>
                  Seit {dtag(z.partner.zugang_gewaehrt_am)} · offen: {z.gegen.offen.join(', ')}
                </span>
              </span>
              <span style={s.pille}>{z.gegen.erfuellt}/{z.gegen.gesamt}</span>
            </div>
          ))}
        </section>
      )}

      {/* ---------- Neuen Partner anlegen ---------- */}
      <section style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...s.h2, margin: 0, flex: 1 }}>Neuer Partner</h2>
          <button style={s.btnGold} onClick={() => { setFormOffen(!formOffen); setPruefFehler([]); }}>
            {formOffen ? 'Zuklappen' : '+ Partner anlegen'}
          </button>
        </div>

        {formOffen && (
          <div style={{ marginTop: 14 }}>
            <div style={s.gitter}>
              <Feld label="Name *">
                <input style={s.in} value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder="Vor- und Nachname" />
              </Feld>
              <Feld label="Firma">
                <input style={s.in} value={neu.firma} onChange={(e) => setNeu({ ...neu, firma: e.target.value })} />
              </Feld>
              <Feld label="E-Mail">
                <input style={s.in} value={neu.email} onChange={(e) => setNeu({ ...neu, email: e.target.value })} />
              </Feld>
              <NurVoll>
                <Feld label="Telefon">
                  <input style={s.in} value={neu.telefon} onChange={(e) => setNeu({ ...neu, telefon: e.target.value })} />
                </Feld>
              </NurVoll>
            </div>

            <div style={{ ...s.gitter, marginTop: 10 }}>
              <Feld label="Art der Zusammenarbeit">
                <select style={s.in} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>
                  {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Feld>
              <Feld label="Vergütungsmodell">
                <select style={s.in} value={neu.modell} onChange={(e) => setNeu({ ...neu, modell: e.target.value })}>
                  {Object.entries(MODELL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Feld>
              {neu.modell !== 'gegengeschaeft' && (
                <Feld label="Provisionssatz in %">
                  <input style={s.in} value={neu.satz_prozent} onChange={(e) => setNeu({ ...neu, satz_prozent: e.target.value })} inputMode="decimal" />
                </Feld>
              )}
              {neu.modell === 'wiederkehrend' && (
                <Feld label="Laufzeit in Monaten">
                  <input style={s.in} value={neu.laufzeit_monate} onChange={(e) => setNeu({ ...neu, laufzeit_monate: e.target.value })} inputMode="numeric" placeholder="z. B. 12" />
                </Feld>
              )}
            </div>

            <p style={s.hint}>{ART_ERKLAERUNG[artVon({ art: neu.art })]}</p>
            <p style={s.hint}>
              Satz, Laufzeit und Modell legen Sie hier fest — und können sie später jederzeit über
              „Details“ wieder ändern. Bei der Laufzeit sind 1 bis 240 Monate möglich; die Obergrenze
              ist nur eine Sicherung gegen Vertipper.
            </p>

            {neu.modell !== 'gegengeschaeft' && (
              <div style={{ ...s.gitter, marginTop: 10 }}>
                <Feld label="Umsatzsteuer">
                  <select
                    style={s.in}
                    value={neu.ust_pflichtig ? 'ja' : 'nein'}
                    onChange={(e) => setNeu({ ...neu, ust_pflichtig: e.target.value === 'ja' })}
                  >
                    <option value="ja">Regelbesteuert — 19 % werden ausgewiesen</option>
                    <option value="nein">Kleinunternehmer nach § 19 — keine Umsatzsteuer</option>
                  </select>
                </Feld>
                <Feld label="IBAN">
                  <input style={s.in} value={neu.iban} onChange={(e) => setNeu({ ...neu, iban: e.target.value })} placeholder="DE.." />
                </Feld>
                <Feld label="Kontoinhaber">
                  <input style={s.in} value={neu.kontoinhaber} onChange={(e) => setNeu({ ...neu, kontoinhaber: e.target.value })} />
                </Feld>
              </div>
            )}

            <NurVoll>
              <Feld label="Notiz">
                <textarea style={{ ...s.in, width: '100%', minHeight: 60 }} value={neu.notiz} onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} />
              </Feld>
            </NurVoll>

            {pruefFehler.length > 0 && (
              <ul style={s.fehlerListe}>{pruefFehler.map((f, i) => <li key={i}>{f}</li>)}</ul>
            )}

            <button style={{ ...s.btnGold, marginTop: 12 }} onClick={anlegen} disabled={busy}>
              {busy ? 'Speichert …' : 'Partner speichern'}
            </button>
          </div>
        )}
      </section>

      {/* ---------- Liste ---------- */}
      {laden ? <p style={s.dim}>Lädt …</p> : zeilen.length === 0 ? (
        <section style={s.card}>
          <p style={s.dim}>
            Noch keine Partner eingetragen. Typisch für den Anfang: der Steuerberater, der Sie weiterempfiehlt,
            ein zufriedener Kunde mit gutem Netzwerk, oder die Innung, die Ihre Software in ihrem Rundschreiben nennt.
          </p>
        </section>
      ) : (
        <section style={s.card}>
          <h2 style={s.h2}>Ihre Partner</h2>
          {zeilen.map((z) => {
            const p = z.partner as PartnerZeileDb;
            const offen = offenerPartner === p.id;
            const modell = modellVon(p);
            const gegen = gegengeschaeftStand(p);
            const st = statusVon(p);
            return (
              <div key={p.id} style={{ ...s.block, opacity: st === 'beendet' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <b style={{ fontSize: 15 }}>{p.name}</b>
                    {p.firma && <span style={{ color: C.textDim }}> · {p.firma}</span>}
                    <br />
                    <span style={{ color: C.textDim, fontSize: 13 }}>
                      {ART_LABEL[artVon(p)]} · {MODELL_LABEL[modell]}
                      {erwartetGeld(p) && <> · {prozent(p.satz_prozent)}</>}
                      {modell === 'wiederkehrend' && p.laufzeit_monate ? <> · {p.laufzeit_monate} Monate</> : null}
                    </span>
                  </span>

                  {erwartetGeld(p) ? (
                    <span style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: z.auszahlbar > 0 ? C.gold : C.textDim }}>{euro(z.auszahlbar)}</div>
                      <div style={{ color: C.textDim, fontSize: 12 }}>auszahlbar</div>
                    </span>
                  ) : (
                    <span style={{ ...s.pille, color: gegen.vollstaendig ? C.green : C.warn, borderColor: gegen.vollstaendig ? C.green : C.warn }}>
                      Gegengeschäft {gegen.erfuellt}/{gegen.gesamt}
                    </span>
                  )}

                  <select
                    style={{ ...s.in, padding: '5px 8px', fontSize: 13 }}
                    value={st}
                    onChange={(e) => feldSetzen(p.id, 'status', e.target.value)}
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>

                  <button style={s.btnMini} onClick={() => setOffenerPartner(offen ? null : p.id)}>
                    {offen ? 'Zuklappen' : 'Details'}
                  </button>
                </div>

                {offen && (
                  <div style={s.details}>
                    <div style={s.gitter}>
                      <Feld label="Firma">
                        <input style={s.in} defaultValue={p.firma ?? ''} onBlur={(e) => feldSetzen(p.id, 'firma', e.target.value.trim() || null)} />
                      </Feld>
                      <Feld label="E-Mail">
                        <input style={s.in} defaultValue={p.email ?? ''} onBlur={(e) => feldSetzen(p.id, 'email', e.target.value.trim() || null)} />
                      </Feld>
                      <NurVoll>
                        <Feld label="Telefon">
                          <input style={s.in} defaultValue={p.telefon ?? ''} onBlur={(e) => feldSetzen(p.id, 'telefon', e.target.value.trim() || null)} />
                        </Feld>
                      </NurVoll>

                      {/* Art und Modell lassen sich jederzeit umstellen — eine
                          Zusammenarbeit veraendert sich, das Stammdatenblatt
                          muss das mitmachen. */}
                      <Feld label="Art der Zusammenarbeit">
                        <select style={s.in} value={artVon(p)} onChange={(e) => feldSetzen(p.id, 'art', e.target.value)}>
                          {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </Feld>
                      <Feld label="Vergütungsmodell">
                        <select style={s.in} value={modell} onChange={(e) => feldSetzen(p.id, 'modell', e.target.value)}>
                          {Object.entries(MODELL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </Feld>
                      {modell === 'wiederkehrend' && (
                        <Feld label="Laufzeit in Monaten">
                          <input style={s.in} defaultValue={p.laufzeit_monate != null ? String(p.laufzeit_monate) : ''} inputMode="numeric"
                            placeholder="z. B. 12"
                            onBlur={(e) => {
                              const n = Math.floor(Number(e.target.value) || 0);
                              feldSetzen(p.id, 'laufzeit_monate', n > 0 ? Math.min(n, 240) : null);
                            }} />
                        </Feld>
                      )}
                      {erwartetGeld(p) && (
                        <>
                          <Feld label="Provisionssatz in %">
                            <input style={s.in} defaultValue={String(p.satz_prozent ?? '')} inputMode="decimal"
                              onBlur={(e) => feldSetzen(p.id, 'satz_prozent', Number(e.target.value.replace(',', '.')) || 0)} />
                          </Feld>
                          <Feld label="IBAN">
                            <input style={s.in} defaultValue={p.iban ?? ''} placeholder={ibanKurz(p.iban)}
                              onBlur={(e) => feldSetzen(p.id, 'iban', e.target.value.replace(/\s/g, '') || null)} />
                          </Feld>
                          <Feld label="Umsatzsteuer">
                            <select style={s.in} value={p.ust_pflichtig === false ? 'nein' : 'ja'}
                              onChange={(e) => feldSetzen(p.id, 'ust_pflichtig', e.target.value === 'ja')}>
                              <option value="ja">Regelbesteuert — 19 %</option>
                              <option value="nein">Kleinunternehmer § 19</option>
                            </select>
                          </Feld>
                        </>
                      )}
                    </div>

                    {/* ---- Gegengeschäft ---- */}
                    <div style={s.gegenBlock}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Gegengeschäft</div>
                      <p style={s.hint}>
                        Was hat dieser Partner für seinen Zugang geliefert? Solange hier etwas fehlt,
                        erscheint er oben in der Mahnliste.
                      </p>
                      <div style={{ ...s.gitter, marginTop: 8 }}>
                        <Feld label="Zugang gewährt am">
                          <input style={s.in} type="date" defaultValue={(p.zugang_gewaehrt_am ?? '').slice(0, 10)}
                            onChange={(e) => feldSetzen(p.id, 'zugang_gewaehrt_am', e.target.value || null)} />
                        </Feld>
                        <Feld label="Vertrag unterschrieben am">
                          <input style={s.in} type="date" defaultValue={(p.gegen_vertrag_am ?? '').slice(0, 10)}
                            onChange={(e) => feldSetzen(p.id, 'gegen_vertrag_am', e.target.value || null)} />
                        </Feld>
                        <Feld label="Logo-Freigabe">
                          <label style={s.haken}>
                            <input type="checkbox" checked={Boolean(p.gegen_logo)}
                              onChange={(e) => feldSetzen(p.id, 'gegen_logo', e.target.checked)} />
                            <span>Logo darf verwendet werden</span>
                          </label>
                        </Feld>
                      </div>
                      <Feld label="Referenz-Zitat">
                        <textarea style={{ ...s.in, width: '100%', minHeight: 60 }} defaultValue={p.gegen_zitat ?? ''}
                          onBlur={(e) => feldSetzen(p.id, 'gegen_zitat', e.target.value.trim() || null)}
                          placeholder="Ein Satz, den Sie auf Ihrer Webseite zeigen dürfen." />
                      </Feld>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: C.textDim, fontSize: 13, flex: 1 }}>
                        Angelegt {dtag(p.erstellt_am)} · {z.summen.anzahl} Provisionen · gesamt {euro(z.summen.gesamt)}
                      </span>
                      <button style={s.btnMiniRot} onClick={() => entfernen(p.id, String(p.name ?? ''))}>Löschen</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', color: C.textDim, fontSize: 12.5, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 700, margin: '0 0 10px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.55, margin: '8px 0 0', maxWidth: 840 },
  kpis: { display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 160 },
  kpiZahl: { fontSize: 24, fontWeight: 800 },
  kpiText: { color: C.textDim, fontSize: 13, marginTop: 2 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16 },
  gitter: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0 12px' },
  in: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.text, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnMini: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '5px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  btnMiniRot: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 },
  block: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 },
  details: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` },
  gegenBlock: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginTop: 10 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '9px 0' },
  pille: { border: '1px solid', borderColor: C.warn, color: C.warn, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  fehlerListe: { color: C.danger, fontSize: 14, margin: '10px 0 0', paddingLeft: 20 },
  hint: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10, alignItems: 'flex-start' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10, alignItems: 'flex-start' },
  x: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0 },
};
