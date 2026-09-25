'use client';

// ============================================================
// ARGONAUT OS · DSGVO-Center
// Zwei Pflicht-Bausteine an einem Ort:
//   1) Verzeichnis von Verarbeitungstaetigkeiten (Art. 30 DSGVO)
//   2) Betroffenenanfragen (DSAR) mit automatischer 1-Monats-Frist + Ampel
// Selbst-tragende Seite. SQL: supabase-sql/compliance-dsgvo.sql
// Pfad: app/dashboard/dsgvo/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import DsgvoWerkzeuge from './_Werkzeuge';
import {
  vorschlaegeNachBuchung,
  verzeichnisKopf,
  kopfLuecken,
  hatDsb,
  verzeichnisDruckdaten,
  type VerzeichnisKopf,
  type VerfahrenVorschlag,
} from '@/lib/verarbeitungsverzeichnis';
import { verzeichnisPdf } from '@/lib/verzeichnisPdf';
import { gebuchteModulKeys, type TenantModulRow } from '@/lib/tenantModule';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const ART_ANFRAGE: Record<string, string> = {
  auskunft: 'Auskunft (Art. 15)',
  loeschung: 'Löschung (Art. 17)',
  berichtigung: 'Berichtigung (Art. 16)',
  einschraenkung: 'Einschränkung (Art. 18)',
  widerspruch: 'Widerspruch (Art. 21)',
  datenuebertragung: 'Datenübertragbarkeit (Art. 20)',
};

type Verfahren = {
  id: string; name: string; zweck: string | null; rechtsgrundlage: string | null;
  kategorien_betroffene: string | null; kategorien_daten: string | null; empfaenger: string | null;
  drittland: string | null; loeschfrist: string | null; tom: string | null; notiz: string | null;
};
type Anfrage = {
  id: string; betroffener_name: string | null; betroffener_email: string | null; art: string;
  eingegangen_am: string; frist: string | null; status: string; erledigt_am: string | null; notiz: string | null;
};

function dtag(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function heuteISO() { return new Date().toISOString().slice(0, 10); }
function plusEinMonat(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function tageBis(iso: string | null): number | null {
  if (!iso) return null;
  const a = new Date(iso + 'T00:00:00').getTime();
  const b = new Date(heuteISO() + 'T00:00:00').getTime();
  return Math.round((a - b) / 86400000);
}

export default function DsgvoPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [besitzer, setBesitzer] = useState<string | null>(null);
  const [verfahren, setVerfahren] = useState<Verfahren[]>([]);
  const [anfragen, setAnfragen] = useState<Anfrage[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [vf, setVf] = useState({ name: '', zweck: '', rechtsgrundlage: '', kategorien_betroffene: '', kategorien_daten: '', empfaenger: '', drittland: '', loeschfrist: '', tom: '' });

  // Punkt 43: Kopf nach Art. 30 Abs. 1 lit. a + Vorschlaege + Ausdruck
  const [kopf, setKopf] = useState<VerzeichnisKopf | null>(null);
  const [dsb, setDsb] = useState({ name: '', kontakt: '' });
  const [dsbBusy, setDsbBusy] = useState(false);
  const [vorschlaege, setVorschlaege] = useState<VerfahrenVorschlag[]>([]);
  const [uebernimmt, setUebernimmt] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [af, setAf] = useState({ betroffener_name: '', betroffener_email: '', art: 'auskunft', eingegangen_am: heuteISO(), notiz: '' });

  const laden_ = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    const { data: chef } = await supabase.rpc('mein_chef_id');
    // B1: owner_user_id ist der Betrieb (beim Mitarbeiter der Chef), nicht die angemeldete Person.
    setBesitzer(typeof chef === 'string' && chef ? chef : u.user.id);
    setUid(u.user.id);
    try {
      const [{ data: v }, { data: a }] = await Promise.all([
        supabase.from('dsgvo_verfahren').select('*').order('name'),
        supabase.from('dsgvo_anfragen').select('*').order('frist'),
      ]);
      setVerfahren((v as Verfahren[]) || []);
      setAnfragen((a as Anfrage[]) || []);
    } catch { setFehler('Daten konnten nicht geladen werden. Ist das SQL eingespielt?'); }

    // Punkt 43: Kopf aus dem Betriebsprofil. Scheitert das, bleibt der Rest
    // der Seite nutzbar — ein fehlender Kopf ist kein Grund, alles zu sperren.
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, dsb_name, dsb_kontakt')
        .eq('id', u.user.id)
        .maybeSingle();
      const k = verzeichnisKopf(p || {});
      setKopf(k);
      setDsb({ name: k.dsbName, kontakt: k.dsbKontakt });
    } catch { setKopf(verzeichnisKopf({})); }

    // Punkt 43: Vorschlaege aus den gebuchten Modulen. Kommt nichts zurueck,
    // gilt fail-open wie im Menue — dann werden ALLE Vorschlaege angeboten.
    try {
      const { data: tm } = await supabase.from('tenant_module').select('modul_key, aktiv');
      setVorschlaege(vorschlaegeNachBuchung(gebuchteModulKeys((tm as TenantModulRow[]) || null)));
    } catch { setVorschlaege(vorschlaegeNachBuchung(null)); }

    setLaden(false);
  }, []);

  useEffect(() => { laden_(); }, [laden_]);

  const verfahrenAnlegen = async () => {
    if (!uid || !vf.name.trim()) return;
    const { error } = await supabase.from('dsgvo_verfahren').insert({
      owner_user_id: besitzer ?? uid, name: vf.name.trim(), zweck: vf.zweck.trim() || null, rechtsgrundlage: vf.rechtsgrundlage.trim() || null,
      kategorien_betroffene: vf.kategorien_betroffene.trim() || null, kategorien_daten: vf.kategorien_daten.trim() || null,
      empfaenger: vf.empfaenger.trim() || null, drittland: vf.drittland.trim() || null, loeschfrist: vf.loeschfrist.trim() || null, tom: vf.tom.trim() || null,
    });
    if (error) { setFehler(error.message); return; }
    setVf({ name: '', zweck: '', rechtsgrundlage: '', kategorien_betroffene: '', kategorien_daten: '', empfaenger: '', drittland: '', loeschfrist: '', tom: '' });
    laden_();
  };
  const verfahrenLoeschen = async (id: string) => { await supabase.from('dsgvo_verfahren').delete().eq('id', id); laden_(); };

  // --- Punkt 43: Datenschutzbeauftragten speichern -------------------------
  const dsbSpeichern = async () => {
    if (!uid) return;
    setDsbBusy(true); setFehler(null); setOk(null);
    const { error } = await supabase.from('profiles').update({
      dsb_name: dsb.name.trim() || null,
      dsb_kontakt: dsb.kontakt.trim() || null,
    }).eq('id', uid);
    setDsbBusy(false);
    if (error) { setFehler('Konnte nicht gespeichert werden: ' + error.message); return; }
    setOk('Gespeichert.'); setTimeout(() => setOk(null), 2500);
    laden_();
  };

  // --- Punkt 43: Vorschlaege uebernehmen -----------------------------------
  // Uebernommen wird nur, was NOCH NICHT dasteht — ein zweiter Klick darf das
  // Verzeichnis nicht verdoppeln.
  const offeneVorschlaege = vorschlaege.filter(
    (v) => !verfahren.some((x) => (x.name || '').trim().toLowerCase() === v.name.trim().toLowerCase()),
  );

  const vorschlaegeUebernehmen = async () => {
    if (!uid || offeneVorschlaege.length === 0) return;
    setUebernimmt(true); setFehler(null); setOk(null);
    const { error } = await supabase.from('dsgvo_verfahren').insert(
      offeneVorschlaege.map((v) => ({
        owner_user_id: besitzer ?? uid,
        name: v.name,
        zweck: v.zweck,
        rechtsgrundlage: v.rechtsgrundlage,
        kategorien_betroffene: v.kategorien_betroffene,
        kategorien_daten: v.kategorien_daten,
        empfaenger: v.empfaenger,
        drittland: v.drittland,
        loeschfrist: v.loeschfrist,
        tom: v.tom,
      })),
    );
    setUebernimmt(false);
    if (error) { setFehler('Konnte nicht uebernommen werden: ' + error.message); return; }
    setOk(`${offeneVorschlaege.length} Vorschlag/Vorschlaege uebernommen — bitte durchsehen und an Ihren Betrieb anpassen.`);
    laden_();
  };

  // --- Punkt 43: Ausdruck nach Art. 30 Abs. 4 ------------------------------
  const verzeichnisDrucken = () => {
    const k = kopf || verzeichnisKopf({});
    verzeichnisPdf(verzeichnisDruckdaten(k, verfahren, heuteISO()));
  };

  const anfrageAnlegen = async () => {
    if (!uid || !af.betroffener_name.trim()) return;
    const { error } = await supabase.from('dsgvo_anfragen').insert({
      owner_user_id: besitzer ?? uid, betroffener_name: af.betroffener_name.trim(), betroffener_email: af.betroffener_email.trim() || null,
      art: af.art, eingegangen_am: af.eingegangen_am, frist: plusEinMonat(af.eingegangen_am), status: 'offen', notiz: af.notiz.trim() || null,
    });
    if (error) { setFehler(error.message); return; }
    setAf({ betroffener_name: '', betroffener_email: '', art: 'auskunft', eingegangen_am: heuteISO(), notiz: '' });
    laden_();
  };
  const anfrageErledigt = async (id: string) => { await supabase.from('dsgvo_anfragen').update({ status: 'erledigt', erledigt_am: heuteISO() }).eq('id', id); laden_(); };
  const anfrageLoeschen = async (id: string) => { await supabase.from('dsgvo_anfragen').delete().eq('id', id); laden_(); };

  const offeneAnfragen = anfragen.filter((a) => a.status !== 'erledigt' && a.status !== 'abgelehnt');
  const ueberfaellig = offeneAnfragen.filter((a) => (tageBis(a.frist) ?? 99) < 0).length;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🛡️ DSGVO-Center</h1>
      <p style={styles.sub}>Zwei Pflichten der DSGVO an einem Ort: das Verzeichnis Ihrer Verarbeitungstätigkeiten (Art. 30) und der Eingang von Betroffenenanfragen. Jede Anfrage bekommt automatisch die gesetzliche Frist von einem Monat — die Ampel warnt, bevor sie reißt.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={styles.kpiZahl}>{verfahren.length}</div><div style={styles.kpiText}>Verarbeitungstätigkeiten</div></div>
        <div style={styles.kpi}><div style={styles.kpiZahl}>{offeneAnfragen.length}</div><div style={styles.kpiText}>offene Anfragen</div></div>
        <div style={{ ...styles.kpi, borderColor: ueberfaellig ? C.danger : C.border }}><div style={{ ...styles.kpiZahl, color: ueberfaellig ? C.danger : C.green }}>{ueberfaellig}</div><div style={styles.kpiText}>Frist überschritten</div></div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <>
          {/* ---- Betroffenenanfragen ---- */}
          <section style={styles.card}>
            <h2 style={styles.h2}>📨 Betroffenenanfragen (DSAR)</h2>
            <div style={styles.formRow}>
              <input style={styles.in} placeholder="Name der betroffenen Person" value={af.betroffener_name} onChange={(e) => setAf({ ...af, betroffener_name: e.target.value })} />
              <input style={styles.in} placeholder="E-Mail (optional)" value={af.betroffener_email} onChange={(e) => setAf({ ...af, betroffener_email: e.target.value })} />
              <select style={styles.in} value={af.art} onChange={(e) => setAf({ ...af, art: e.target.value })}>
                {Object.entries(ART_ANFRAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input style={styles.in} type="date" value={af.eingegangen_am} onChange={(e) => setAf({ ...af, eingegangen_am: e.target.value })} />
              <button style={styles.btnGold} onClick={anfrageAnlegen}>+ Eintragen</button>
            </div>
            <p style={styles.hint}>Frist wird automatisch auf {dtag(plusEinMonat(af.eingegangen_am))} gesetzt (1 Monat ab Eingang, Art. 12 Abs. 3 DSGVO).</p>

            {offeneAnfragen.length === 0 ? <p style={styles.dim}>Keine offenen Anfragen.</p> : (
              <div style={{ marginTop: 12 }}>
                {offeneAnfragen.map((a) => {
                  const t = tageBis(a.frist);
                  const rot = (t ?? 99) < 0, gelb = !rot && (t ?? 99) <= 7;
                  const farbe = rot ? C.danger : gelb ? C.warn : C.green;
                  const ampeltext = rot ? `${Math.abs(t as number)} T überfällig` : t === 0 ? 'heute fällig' : `in ${t} T`;
                  return (
                    <div key={a.id} style={styles.zeile}>
                      <span style={{ ...styles.dot, background: farbe, boxShadow: `0 0 8px ${farbe}66` }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700 }}>{a.betroffener_name || '—'}</span>
                        <span style={{ color: C.textDim }}> · {ART_ANFRAGE[a.art] || a.art}</span>
                        {a.betroffener_email && <span style={{ color: C.textDim }}> · {a.betroffener_email}</span>}
                        <br /><span style={{ color: C.textDim, fontSize: 13 }}>Eingang {dtag(a.eingegangen_am)} · Frist {dtag(a.frist)}</span>
                      </span>
                      <span style={{ color: farbe, fontWeight: 700, fontSize: 13, minWidth: 96, textAlign: 'right' }}>{ampeltext}</span>
                      <button style={styles.btnMini} onClick={() => anfrageErledigt(a.id)}>Erledigt</button>
                      <button style={styles.btnMiniRot} onClick={() => anfrageLoeschen(a.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Auskunft und Loeschung durchfuehren (Art. 15 / Art. 17) ---- */}
          <DsgvoWerkzeuge />

          {/* ---- Verzeichnis von Verarbeitungstaetigkeiten ---- */}
          <section style={styles.card}>
            <h2 style={styles.h2}>📋 Verzeichnis der Verarbeitungstätigkeiten (Art. 30)</h2>

            {/* Punkt 43: Der Kopf nach Art. 30 Abs. 1 lit. a */}
            <div style={styles.kopfBox}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Verantwortlicher (Art. 30 Abs. 1 lit. a)</div>
              {kopf && (
                <div style={styles.vGrid}>
                  <span><b style={styles.lab}>Name:</b> {kopf.verantwortlicher || <span style={{ color: C.warn }}>— fehlt —</span>}</span>
                  <span><b style={styles.lab}>Anschrift:</b> {kopf.anschrift || <span style={{ color: C.warn }}>— fehlt —</span>}</span>
                  <span><b style={styles.lab}>Telefon:</b> {kopf.telefon || '—'}</span>
                  <span><b style={styles.lab}>E-Mail:</b> {kopf.email || '—'}</span>
                </div>
              )}
              {kopf && kopfLuecken(kopf).length > 0 && (
                <p style={{ ...styles.hint, color: C.warn }}>
                  Für den Ausdruck fehlen noch: {kopfLuecken(kopf).join(', ')}. Diese Angaben kommen aus
                  Ihrem Betriebsprofil unter Einstellungen — dort ergänzen, dann sind sie überall richtig.
                </p>
              )}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Datenschutzbeauftragter</div>
                <p style={{ ...styles.hint, margin: '0 0 8px' }}>
                  Nicht jeder Betrieb braucht einen. In der Regel ist er ab 20 Personen Pflicht, die
                  ständig personenbezogene Daten verarbeiten (§ 38 BDSG) — und bei bestimmten
                  Tätigkeiten auch darunter. Ist einer benannt, gehört er in den Kopf des Verzeichnisses.
                </p>
                <div style={styles.formRow}>
                  <input style={styles.in} placeholder="Name (leer lassen, wenn keiner benannt ist)" value={dsb.name} onChange={(e) => setDsb({ ...dsb, name: e.target.value })} />
                  <input style={styles.in} placeholder="Kontakt (E-Mail oder Telefon)" value={dsb.kontakt} onChange={(e) => setDsb({ ...dsb, kontakt: e.target.value })} />
                  <button style={styles.btnGold} disabled={dsbBusy} onClick={dsbSpeichern}>{dsbBusy ? 'Speichert …' : 'Speichern'}</button>
                </div>
                {kopf && !hatDsb(kopf) && (
                  <p style={styles.hint}>Zurzeit ist kein Datenschutzbeauftragter benannt — im Ausdruck steht das so.</p>
                )}
              </div>
            </div>

            {/* Punkt 43: Vorschlaege und Ausdruck */}
            <div style={styles.formRow}>
              <button
                style={{ ...styles.btnGold, opacity: offeneVorschlaege.length === 0 || uebernimmt ? 0.55 : 1 }}
                disabled={offeneVorschlaege.length === 0 || uebernimmt}
                onClick={vorschlaegeUebernehmen}
              >
                {uebernimmt ? 'Übernimmt …' : `✦ ${offeneVorschlaege.length} Vorschlag/Vorschläge übernehmen`}
              </button>
              <button style={styles.btnGhost} onClick={verzeichnisDrucken}>⭳ Verzeichnis als PDF (Stand heute)</button>
            </div>
            <p style={styles.hint}>
              Die Vorschläge richten sich nach den Bereichen, die Sie nutzen — Lohnabrechnung etwa nur
              mit dem Personal-Modul. Sie sind ein <b>Entwurf</b>: Bitte jeden übernommenen Eintrag
              durchsehen und an Ihren Betrieb anpassen. Den Ausdruck verlangt die Aufsichtsbehörde auf
              Anfrage (Art. 30 Abs. 4); er trägt das heutige Datum als Stand.
            </p>

            <div style={styles.formGrid}>
              <input style={styles.in} placeholder="Bezeichnung *(z. B. Lohnabrechnung)" value={vf.name} onChange={(e) => setVf({ ...vf, name: e.target.value })} />
              <input style={styles.in} placeholder="Zweck" value={vf.zweck} onChange={(e) => setVf({ ...vf, zweck: e.target.value })} />
              <input style={styles.in} placeholder="Rechtsgrundlage (z. B. Art. 6 I b)" value={vf.rechtsgrundlage} onChange={(e) => setVf({ ...vf, rechtsgrundlage: e.target.value })} />
              <input style={styles.in} placeholder="Betroffene (Kunden, Mitarbeiter …)" value={vf.kategorien_betroffene} onChange={(e) => setVf({ ...vf, kategorien_betroffene: e.target.value })} />
              <input style={styles.in} placeholder="Datenarten (Name, Bankdaten …)" value={vf.kategorien_daten} onChange={(e) => setVf({ ...vf, kategorien_daten: e.target.value })} />
              <input style={styles.in} placeholder="Empfänger (Steuerberater, Hoster …)" value={vf.empfaenger} onChange={(e) => setVf({ ...vf, empfaenger: e.target.value })} />
              <input style={styles.in} placeholder="Drittland (falls außerhalb EU)" value={vf.drittland} onChange={(e) => setVf({ ...vf, drittland: e.target.value })} />
              <input style={styles.in} placeholder="Löschfrist (z. B. 10 Jahre)" value={vf.loeschfrist} onChange={(e) => setVf({ ...vf, loeschfrist: e.target.value })} />
              <input style={styles.in} placeholder="Techn.-org. Maßnahmen (TOM)" value={vf.tom} onChange={(e) => setVf({ ...vf, tom: e.target.value })} />
            </div>
            <button style={{ ...styles.btnGold, marginTop: 10 }} onClick={verfahrenAnlegen}>+ Verarbeitungstätigkeit hinzufügen</button>

            {verfahren.length === 0 ? <p style={styles.dim}>Noch keine Einträge. Typisch für einen Mittelständler: Kundenverwaltung, Lohnabrechnung, Bewerbermanagement, Website/Kontaktformular.</p> : (
              <div style={{ marginTop: 12 }}>
                {verfahren.map((v) => (
                  <div key={v.id} style={styles.vBlock}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, flex: 1 }}>{v.name}</span>
                      <button style={styles.btnMiniRot} onClick={() => verfahrenLoeschen(v.id)}>✕</button>
                    </div>
                    <div style={styles.vGrid}>
                      {v.zweck && <span><b style={styles.lab}>Zweck:</b> {v.zweck}</span>}
                      {v.rechtsgrundlage && <span><b style={styles.lab}>Rechtsgrundlage:</b> {v.rechtsgrundlage}</span>}
                      {v.kategorien_betroffene && <span><b style={styles.lab}>Betroffene:</b> {v.kategorien_betroffene}</span>}
                      {v.kategorien_daten && <span><b style={styles.lab}>Daten:</b> {v.kategorien_daten}</span>}
                      {v.empfaenger && <span><b style={styles.lab}>Empfänger:</b> {v.empfaenger}</span>}
                      {v.drittland && <span><b style={styles.lab}>Drittland:</b> {v.drittland}</span>}
                      {v.loeschfrist && <span><b style={styles.lab}>Löschfrist:</b> {v.loeschfrist}</span>}
                      {v.tom && <span><b style={styles.lab}>TOM:</b> {v.tom}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 700, margin: '0 0 12px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 820 },
  kpis: { display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 150 },
  kpiZahl: { fontSize: 26, fontWeight: 800 },
  kpiText: { color: C.textDim, fontSize: 13, marginTop: 2 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16 },
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 },
  in: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.text, fontFamily: 'inherit', fontSize: 14, minWidth: 120 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnMini: { background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '5px 10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  btnMiniRot: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  hint: { color: C.textDim, fontSize: 13, margin: '8px 0 0' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  vBlock: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 },
  vGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '4px 16px', marginTop: 8, fontSize: 14, color: C.text },
  lab: { color: C.textDim, fontWeight: 600 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  kopfBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14, fontSize: 14 },
  btnGhost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
