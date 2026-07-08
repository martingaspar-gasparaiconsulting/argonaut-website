'use client';

// ============================================================
// ARGONAUT OS · Block 1.2b · GoBD-Verfahrensdokumentation · Eingabe-Maske
// Laedt Firmendaten aus profiles (Vorbelegung), setzt ARGONAUT-Standardtexte,
// Chef ergaenzt seine Specifics, speichert als Entwurf in gobd_verfahrensdoku.
// Pfad: app/dashboard/gobd/page.tsx
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type Firmenkopf = {
  firmenname: string; rechtsform: string; strasse: string; plz: string; ort: string;
  geschaeftsfuehrer: string; registergericht: string; hrb: string; ust_id: string;
  steuernummer: string; branche: string; telefon: string; email: string; website: string;
  bank: string; iban: string; bic: string;
};
type Doku = {
  firmenkopf: Firmenkopf;
  verantwortung: { buchfuehrung: string; steuerberater: string; datev_nr: string; aufbewahrungsort: string };
  systeme: string;
  abschnitte: { beleg_erfassung: string; buchung_ablauf: string; datensicherung: string; zugriffsrechte: string; aufbewahrung: string };
};

function leererKopf(): Firmenkopf {
  return { firmenname: '', rechtsform: '', strasse: '', plz: '', ort: '', geschaeftsfuehrer: '', registergericht: '', hrb: '', ust_id: '', steuernummer: '', branche: '', telefon: '', email: '', website: '', bank: '', iban: '', bic: '' };
}
function standardAbschnitte(): Doku['abschnitte'] {
  return {
    beleg_erfassung: 'Eingehende und ausgehende Belege (Rechnungen, Angebote, Aufträge) werden digital in ARGONAUT OS erfasst bzw. erzeugt und revisionssicher im Dokumenten-Archiv abgelegt. Papierbelege werden zeitnah digitalisiert und dem jeweiligen Geschäftsvorfall zugeordnet.',
    buchung_ablauf: 'Ausgangsrechnungen werden in ARGONAUT OS erstellt und fortlaufend nummeriert; Zahlungs- und Mahnstatus werden im System geführt. Steuerrelevante Daten werden regelmäßig an die Buchhaltung bzw. den Steuerberater übergeben.',
    datensicherung: 'Die Daten werden in einer Cloud-Datenbank (Rechenzentrum innerhalb der EU) gehalten und dort automatisiert regelmäßig gesichert. Ein Wiederherstellungsverfahren ist vorhanden.',
    zugriffsrechte: 'Der Zugriff erfolgt personenbezogen über individuelle Benutzerkonten. Über das Rechte-Modul werden Berechtigungen rollenbasiert vergeben (Berechtigungskonzept). Änderungen an sensiblen Daten werden protokolliert (Änderungs-/Audit-Log).',
    aufbewahrung: 'Steuerrelevante Unterlagen werden gemäß den gesetzlichen Fristen aufbewahrt (Buchungsbelege i. d. R. 8–10 Jahre, Handels- und Geschäftsbriefe 6 Jahre, Arbeitszeitnachweise 2 Jahre) — die genauen Fristen sind mit dem Steuerberater abzustimmen. Die Unveränderbarkeit der Aufzeichnungen wird durch das System sichergestellt.',
  };
}

export default function GobdPage() {
  const [uid, setUid] = useState<string>('');
  const [doku, setDoku] = useState<Doku>({
    firmenkopf: leererKopf(),
    verantwortung: { buchfuehrung: '', steuerberater: '', datev_nr: '', aufbewahrungsort: '' },
    systeme: 'ARGONAUT OS (Angebote, Aufträge, Rechnungen, Belegarchiv, Zeiterfassung, Dokumente)',
    abschnitte: standardAbschnitte(),
  });
  const [entwurfId, setEntwurfId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData?.user?.id;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);

      const basis: Doku = {
        firmenkopf: leererKopf(),
        verantwortung: { buchfuehrung: '', steuerberater: '', datev_nr: '', aufbewahrungsort: '' },
        systeme: 'ARGONAUT OS (Angebote, Aufträge, Rechnungen, Belegarchiv, Zeiterfassung, Dokumente)',
        abschnitte: standardAbschnitte(),
      };

      // bestehenden Entwurf laden?
      const { data: vorhanden } = await supabase.from('gobd_verfahrensdoku')
        .select('id,inhalt').eq('owner_user_id', id).eq('status', 'entwurf')
        .order('aktualisiert_am', { ascending: false }).limit(1).maybeSingle();

      let d: Doku = basis;
      if (vorhanden?.inhalt && Object.keys(vorhanden.inhalt).length > 0) {
        const i = vorhanden.inhalt as Partial<Doku>;
        d = {
          firmenkopf: { ...basis.firmenkopf, ...(i.firmenkopf || {}) },
          verantwortung: { ...basis.verantwortung, ...(i.verantwortung || {}) },
          systeme: i.systeme ?? basis.systeme,
          abschnitte: { ...basis.abschnitte, ...(i.abschnitte || {}) },
        };
        setEntwurfId(vorhanden.id);
      } else {
        // Firmenkopf aus profiles vorbelegen
        const { data: p } = await supabase.from('profiles')
          .select('firma_name,company_name,firma_rechtsform,firma_strasse,firma_plz,firma_ort,firma_geschaeftsfuehrer,firma_registergericht,firma_hrb,firma_ust_id,firma_steuernummer,industry,firma_telefon,firma_email,firma_website,firma_bank,firma_iban,firma_bic')
          .eq('id', id).maybeSingle();
        if (p) {
          d = { ...basis, firmenkopf: {
            firmenname: p.firma_name || p.company_name || '',
            rechtsform: p.firma_rechtsform || '',
            strasse: p.firma_strasse || '', plz: p.firma_plz || '', ort: p.firma_ort || '',
            geschaeftsfuehrer: p.firma_geschaeftsfuehrer || '',
            registergericht: p.firma_registergericht || '', hrb: p.firma_hrb || '',
            ust_id: p.firma_ust_id || '', steuernummer: p.firma_steuernummer || '',
            branche: p.industry || '',
            telefon: p.firma_telefon || '', email: p.firma_email || '', website: p.firma_website || '',
            bank: p.firma_bank || '', iban: p.firma_iban || '', bic: p.firma_bic || '',
          } };
        }
      }

      // Smart-Defaults für leere Felder (spart Tipparbeit, erfindet KEINE Fakten)
      const ver = { ...d.verantwortung };
      if (!ver.buchfuehrung && d.firmenkopf.geschaeftsfuehrer) ver.buchfuehrung = d.firmenkopf.geschaeftsfuehrer;
      if (!ver.aufbewahrungsort) ver.aufbewahrungsort = 'Digital in ARGONAUT OS (Cloud, EU-Rechenzentrum); Papierunterlagen am Unternehmenssitz.';
      d = { ...d, verantwortung: ver };

      setDoku(d);
      setLaden(false);
    })();
  }, []);

  function setKopf<K extends keyof Firmenkopf>(k: K, v: string) {
    setDoku((d) => ({ ...d, firmenkopf: { ...d.firmenkopf, [k]: v } }));
  }
  function setVer<K extends keyof Doku['verantwortung']>(k: K, v: string) {
    setDoku((d) => ({ ...d, verantwortung: { ...d.verantwortung, [k]: v } }));
  }
  function setAbschnitt<K extends keyof Doku['abschnitte']>(k: K, v: string) {
    setDoku((d) => ({ ...d, abschnitte: { ...d.abschnitte, [k]: v } }));
  }

  async function speichern() {
    if (!uid) return;
    setSpeichert(true); setMeldung(null); setFehler(null);
    try {
      if (entwurfId) {
        const { error } = await supabase.from('gobd_verfahrensdoku')
          .update({ inhalt: doku, aktualisiert_am: new Date().toISOString() })
          .eq('id', entwurfId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('gobd_verfahrensdoku')
          .insert({ owner_user_id: uid, status: 'entwurf', inhalt: doku })
          .select('id').single();
        if (error) throw error;
        setEntwurfId(data.id);
      }
      setMeldung('Entwurf gespeichert.');
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  if (laden) return <div style={styles.page}><div style={styles.hint}>Lädt …</div></div>;

  const k = doku.firmenkopf;

  return (
    <div style={styles.page}>
      <style>{`input::placeholder, textarea::placeholder { color: rgba(143,163,190,0.5); }`}</style>
      <div style={styles.eyebrow}>ARGONAUT OS · Compliance</div>
      <h1 style={styles.h1}>GoBD-Verfahrensdokumentation</h1>
      <p style={styles.sub}>Beschreibt, wie dein Betrieb Belege, Buchführung, Datensicherung und Zugriffsrechte handhabt — das Pflicht-Dokument für die Betriebsprüfung. Firmendaten sind vorbelegt; ergänze deine Specifics und speichere.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* 1. Firmenkopf */}
      <Bereich titel="1. Allgemeine Angaben (Firmenkopf)">
        <Grid>
          <Feld label="Firmenname" value={k.firmenname} onChange={(v) => setKopf('firmenname', v)} />
          <Feld label="Rechtsform" value={k.rechtsform} onChange={(v) => setKopf('rechtsform', v)} />
          <Feld label="Straße & Nr." value={k.strasse} onChange={(v) => setKopf('strasse', v)} />
          <Feld label="PLZ" value={k.plz} onChange={(v) => setKopf('plz', v)} />
          <Feld label="Ort" value={k.ort} onChange={(v) => setKopf('ort', v)} />
          <Feld label="Branche" value={k.branche} onChange={(v) => setKopf('branche', v)} placeholder="z. B. Medien, Handwerk, Handel" />
          <Feld label="Geschäftsführer/in" value={k.geschaeftsfuehrer} onChange={(v) => setKopf('geschaeftsfuehrer', v)} />
          <Feld label="Registergericht" value={k.registergericht} onChange={(v) => setKopf('registergericht', v)} />
          <Feld label="HRB-Nr." value={k.hrb} onChange={(v) => setKopf('hrb', v)} />
          <Feld label="USt-IdNr." value={k.ust_id} onChange={(v) => setKopf('ust_id', v)} />
          <Feld label="Steuernummer" value={k.steuernummer} onChange={(v) => setKopf('steuernummer', v)} />
          <Feld label="Bank" value={k.bank} onChange={(v) => setKopf('bank', v)} />
          <Feld label="IBAN" value={k.iban} onChange={(v) => setKopf('iban', v)} />
          <Feld label="BIC" value={k.bic} onChange={(v) => setKopf('bic', v)} />
        </Grid>
      </Bereich>

      {/* 2. Verantwortung & Berater */}
      <Bereich titel="2. Verantwortung & Steuerberater">
        <Grid>
          <Feld label="Verantwortlich für die Buchführung" value={doku.verantwortung.buchfuehrung} onChange={(v) => setVer('buchfuehrung', v)} />
          <Feld label="Steuerberater / Kanzlei" value={doku.verantwortung.steuerberater} onChange={(v) => setVer('steuerberater', v)} placeholder="Name & Ort der Kanzlei" />
          <Feld label="DATEV-Beraternummer (optional)" value={doku.verantwortung.datev_nr} onChange={(v) => setVer('datev_nr', v)} placeholder="falls vorhanden" />
          <Feld label="Aufbewahrungsort der Unterlagen" value={doku.verantwortung.aufbewahrungsort} onChange={(v) => setVer('aufbewahrungsort', v)} />
        </Grid>
      </Bereich>

      {/* 3. Eingesetzte Systeme */}
      <Bereich titel="3. Eingesetzte Systeme (DV-System)">
        <Textarea value={doku.systeme} onChange={(v) => setDoku((d) => ({ ...d, systeme: v }))}
          hint="Welche Software wird genutzt? (ARGONAUT OS ist vorbelegt — ergänze z. B. DATEV, Online-Banking, Kassensystem.)" />
      </Bereich>

      {/* 4. Abläufe (vorbelegt mit ARGONAUT-Standardtexten) */}
      <Bereich titel="4. Abläufe & internes Kontrollsystem">
        <Feldblock label="Belegerfassung & Archivierung" value={doku.abschnitte.beleg_erfassung} onChange={(v) => setAbschnitt('beleg_erfassung', v)} />
        <Feldblock label="Rechnungsstellung & Buchung" value={doku.abschnitte.buchung_ablauf} onChange={(v) => setAbschnitt('buchung_ablauf', v)} />
        <Feldblock label="Zugriffsrechte & Kontrolle (IKS)" value={doku.abschnitte.zugriffsrechte} onChange={(v) => setAbschnitt('zugriffsrechte', v)} />
        <Feldblock label="Datensicherung" value={doku.abschnitte.datensicherung} onChange={(v) => setAbschnitt('datensicherung', v)} />
        <Feldblock label="Aufbewahrung & Fristen" value={doku.abschnitte.aufbewahrung} onChange={(v) => setAbschnitt('aufbewahrung', v)} />
      </Bereich>

      {/* Speichern */}
      <div style={styles.saveBar}>
        <button onClick={speichern} disabled={speichert} style={{ ...styles.saveBtn, opacity: speichert ? 0.6 : 1 }}>
          {speichert ? 'Speichert …' : '💾 Entwurf speichern'}
        </button>
        {meldung && <span style={{ color: C.green, fontSize: 14 }}>✓ {meldung}</span>}
      </div>
      <div style={styles.footHint}>Im nächsten Schritt wird aus diesem Entwurf die fertige, versionierte PDF-Dokumentation erstellt.</div>
    </div>
  );
}

// --- kleine UI-Helfer ---
function Bereich({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{titel}</h2>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>{children}</div>;
}
function Feld({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={styles.lbl}>{label}</label>
      <input style={styles.input} value={value} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function Textarea({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <textarea style={styles.area} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      {hint && <div style={styles.fieldHint}>{hint}</div>}
    </div>
  );
}
function Feldblock({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={styles.lbl}>{label}</label>
      <textarea style={styles.area} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 80px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 720, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px' },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5 },
  input: { width: '100%', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' },
  area: { width: '100%', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' },
  fieldHint: { fontSize: 12, color: C.textDim, marginTop: 5 },
  saveBar: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 },
  saveBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  footHint: { color: C.textDim, fontSize: 13, marginTop: 12 },
  hint: { color: C.textDim, fontSize: 14, padding: '20px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
};
