'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Öffentliche Webinar-Seite   (Paket 5 · Punkt 3.13)
//
// /w/<schlüssel> — die Seite, die der Interessent sieht. Trägt die Marke des
// BETRIEBS, nicht die von ARGONAUT: Name, Farbe, Impressum und Datenschutz
// kommen aus seinem Profil.
//
// Der Schlüssel ist zufällig, kein sprechender Name (lib/webinar.ts →
// neuerSchluessel). Damit kann sich kein Betrieb den Namen eines anderen
// wegschnappen.
//
// ▄▄▄ HIER STEHT KEIN ZUGANGSLINK ▄▄▄
// Die Route /api/oeffentlich/webinar gibt zugang_url gar nicht erst heraus.
// Der Link kommt per Erinnerungsmail, 24 Stunden und 1 Stunde vorher.
//
// Kein Supabase im Browser: alles läuft über /api/oeffentlich/webinar.
// ============================================================================

type Impressum = {
  firma_name: string; rechtsform: string; strasse: string; plz: string; ort: string;
  telefon: string; email: string; website: string; geschaeftsfuehrer: string;
  ust_id: string; registergericht: string; hrb: string; steuernummer: string;
};

type Termin = {
  id: string;
  beginnt_am: string | null;
  termin_text: string;
  dauer_text: string;
  frei: number | null;
  ausgebucht: boolean;
  anmeldbar: boolean;
  grund: string | null;
};

type Daten = {
  titel: string; beschreibung: string; referent: string;
  betrieb: string; akzent: string; termine: Termin[]; impressum: Impressum;
};

function sichereFarbe(f: string | null | undefined): string {
  const s = (f || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '#C9A84C';
}

export default function WebinarSeite() {
  const params = useParams();
  const suche = useSearchParams();
  const key = String((params?.key as string) || '').trim();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [d, setD] = useState<Daten | null>(null);

  const [terminId, setTerminId] = useState('');
  const [name, setName] = useState('');
  const [firma, setFirma] = useState('');
  const [email, setEmail] = useState('');
  const [einwilligung, setEinwilligung] = useState(false);
  const [senden, setSenden] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<'bestaetigung' | 'bereits' | 'abgemeldet' | null>(null);

  const [zeigeImpressum, setZeigeImpressum] = useState(false);
  const [zeigeDatenschutz, setZeigeDatenschutz] = useState(false);

  // Rückmeldungen aus den öffentlichen Routen (?bestaetigt=1 usw.)
  const bestaetigt = suche?.get('bestaetigt') === '1';
  const abgemeldetLink = suche?.get('abgemeldet') === '1';
  const verfallen = suche?.get('verfallen') === '1';
  const ausgebuchtLink = suche?.get('ausgebucht') === '1';
  const abgesagt = suche?.get('abgesagt') === '1';
  const vorbei = suche?.get('vorbei') === '1';
  const linkFehler = suche?.get('fehler') === '1';

  useEffect(() => {
    if (!key) return;
    (async () => {
      setLaden(true); setFehler(null);
      try {
        const res = await fetch(`/api/oeffentlich/webinar?key=${encodeURIComponent(key)}`);
        const j = await res.json();
        if (!res.ok || !j?.ok) setFehler(j?.error || 'Diese Seite ist nicht verfügbar.');
        else {
          const daten = j as Daten;
          setD(daten);
          // Den ersten buchbaren Termin vorauswählen — ein leeres Formular,
          // bei dem man erst etwas anklicken muss, kostet Anmeldungen.
          const erster = (daten.termine || []).find((t) => t.anmeldbar);
          if (erster) setTerminId(erster.id);
        }
      } catch {
        setFehler('Diese Seite ist gerade nicht erreichbar.');
      } finally { setLaden(false); }
    })();
  }, [key]);

  async function absenden() {
    setFormFehler(null);
    if (!terminId) { setFormFehler('Bitte wählen Sie einen Termin.'); return; }
    if (!email.trim()) { setFormFehler('Bitte geben Sie Ihre E-Mail-Adresse an.'); return; }
    if (!einwilligung) {
      setFormFehler('Bitte bestätigen Sie die Einwilligung — ohne sie dürfen wir Ihnen nicht schreiben.'); return;
    }
    setSenden(true);
    try {
      const res = await fetch('/api/oeffentlich/webinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, termin_id: terminId, email: email.trim(), name: name.trim(), firma: firma.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setFormFehler(j?.error || 'Die Anmeldung hat nicht geklappt.'); return; }
      if (j.status === 'bereits') setFertig('bereits');
      else if (j.status === 'abgemeldet') setFertig('abgemeldet');
      else setFertig('bestaetigung');
    } catch {
      setFormFehler('Die Anmeldung hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
    } finally { setSenden(false); }
  }

  if (laden) {
    return <div style={S.seite}><div style={S.karte}><p style={{ color: '#6b7684' }}>Wird geladen …</p></div></div>;
  }
  if (fehler || !d) {
    return (
      <div style={S.seite}>
        <div style={S.karte}>
          <h1 style={{ ...S.h1, fontSize: 24 }}>Nicht verfügbar</h1>
          <p style={{ color: '#6b7684', margin: 0 }}>{fehler || 'Diese Seite ist nicht verfügbar.'}</p>
        </div>
      </div>
    );
  }

  const akzent = sichereFarbe(d.akzent);
  const imp = d.impressum;
  const anschrift = [imp.strasse, [imp.plz, imp.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const offeneTermine = (d.termine || []);
  const gibtBuchbare = offeneTermine.some((t) => t.anmeldbar);

  return (
    <div style={S.seite}>
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 16px' }}>

        {/* -------- Rückmeldungen aus den Mail-Links -------- */}
        {bestaetigt && <div style={{ ...S.banner, background: '#eaf7f0', border: '1px solid #4CAF7D', color: '#1f5f42' }}>
          Ihre Anmeldung ist bestätigt. Den Zugangslink schicken wir Ihnen einen Tag vor dem Termin und noch einmal eine Stunde vorher.
        </div>}
        {abgemeldetLink && <div style={{ ...S.banner, background: '#f4f5f7', border: '1px solid #d6dae1', color: '#3d4757' }}>
          Sie sind abgemeldet. Sie erhalten keine weiteren E-Mails zu diesem Webinar.
        </div>}
        {verfallen && <div style={{ ...S.banner, background: '#fdf6e3', border: '1px solid #E0A24C', color: '#7a5a1f' }}>
          Dieser Bestätigungslink ist abgelaufen. Melden Sie sich einfach noch einmal an.
        </div>}
        {ausgebuchtLink && <div style={{ ...S.banner, background: '#fdf6e3', border: '1px solid #E0A24C', color: '#7a5a1f' }}>
          Schade — dieser Termin ist inzwischen ausgebucht. Falls es weitere Termine gibt, finden Sie sie unten.
        </div>}
        {abgesagt && <div style={{ ...S.banner, background: '#fdf6e3', border: '1px solid #E0A24C', color: '#7a5a1f' }}>
          Dieser Termin wurde abgesagt. Falls ein Ersatztermin angeboten wird, steht er unten.
        </div>}
        {vorbei && <div style={{ ...S.banner, background: '#f4f5f7', border: '1px solid #d6dae1', color: '#3d4757' }}>
          Dieser Termin hat bereits stattgefunden.
        </div>}
        {linkFehler && <div style={{ ...S.banner, background: '#fdecec', border: '1px solid #E06666', color: '#8a2f2f' }}>
          Mit diesem Link stimmt etwas nicht. Melden Sie sich gern noch einmal an.
        </div>}

        <div style={S.karte}>
          <div style={{ ...S.eyebrow, color: akzent }}>Webinar · {d.betrieb}</div>
          <h1 style={S.h1}>{d.titel}</h1>
          {d.referent && <p style={{ color: '#6b7684', margin: '6px 0 0', fontSize: 15 }}>mit {d.referent}</p>}
          {d.beschreibung && (
            <p style={{ color: '#3d4757', fontSize: 16, lineHeight: 1.65, margin: '16px 0 0', whiteSpace: 'pre-wrap' }}>
              {d.beschreibung}
            </p>
          )}
        </div>

        <div style={{ ...S.karte, marginTop: 16 }}>
          {fertig === 'bestaetigung' && (
            <>
              <h2 style={S.h2}>Fast geschafft</h2>
              <p style={{ color: '#3d4757', lineHeight: 1.65, margin: '10px 0 0' }}>
                Wir haben Ihnen eine E-Mail geschickt. Bitte klicken Sie darin auf „Anmeldung bestätigen" —
                erst dann ist Ihr Platz reserviert. So ist sichergestellt, dass niemand eine fremde Adresse einträgt.
              </p>
            </>
          )}
          {fertig === 'bereits' && (
            <>
              <h2 style={S.h2}>Sie sind schon angemeldet</h2>
              <p style={{ color: '#3d4757', lineHeight: 1.65, margin: '10px 0 0' }}>
                Für diesen Termin liegt Ihre Anmeldung bereits vor. Die Erinnerung mit dem Zugangslink kommt rechtzeitig.
              </p>
            </>
          )}
          {fertig === 'abgemeldet' && (
            <>
              <h2 style={S.h2}>Sie haben sich abgemeldet</h2>
              <p style={{ color: '#3d4757', lineHeight: 1.65, margin: '10px 0 0' }}>
                Sie hatten sich von diesem Webinar abgemeldet. Deshalb tragen wir Sie nicht erneut ein.
                Wenn Sie doch teilnehmen möchten, schreiben Sie uns einfach kurz.
              </p>
            </>
          )}

          {fertig === null && (
            <>
              <h2 style={S.h2}>Termin wählen</h2>

              {offeneTermine.length === 0 && (
                <p style={{ color: '#6b7684', margin: '10px 0 0' }}>
                  Zurzeit steht kein Termin fest. Schauen Sie gern später noch einmal vorbei.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0 18px' }}>
                {offeneTermine.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      border: `1px solid ${terminId === t.id ? akzent : '#e5e7eb'}`,
                      background: terminId === t.id ? 'rgba(0,0,0,0.02)' : '#fff',
                      borderRadius: 12, padding: '13px 15px',
                      cursor: t.anmeldbar ? 'pointer' : 'not-allowed',
                      opacity: t.anmeldbar ? 1 : 0.55,
                    }}
                  >
                    <input
                      type="radio" name="termin" value={t.id}
                      checked={terminId === t.id} disabled={!t.anmeldbar}
                      onChange={() => setTerminId(t.id)}
                      style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 700, color: '#1a2332', fontSize: 15.5 }}>
                        {t.termin_text || 'Termin folgt'}
                      </span>
                      <span style={{ display: 'block', color: '#6b7684', fontSize: 13.5, marginTop: 3 }}>
                        {t.dauer_text}
                        {t.dauer_text && t.frei !== null ? ' · ' : ''}
                        {t.frei !== null && (t.ausgebucht ? 'ausgebucht' : `noch ${t.frei} ${t.frei === 1 ? 'Platz' : 'Plätze'} frei`)}
                        {!t.anmeldbar && t.grund && t.frei === null ? t.grund : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {gibtBuchbare && (
                <>
                  <input style={S.feld} value={name} onChange={(e) => setName(e.target.value)}
                         placeholder="Ihr Name (optional)" autoComplete="name" />
                  <input style={S.feld} value={firma} onChange={(e) => setFirma(e.target.value)}
                         placeholder="Ihr Unternehmen (optional)" autoComplete="organization" />
                  <input style={S.feld} value={email} onChange={(e) => setEmail(e.target.value)}
                         placeholder="Ihre E-Mail-Adresse" type="email" autoComplete="email" inputMode="email" />

                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.55, color: '#3d4757', margin: '4px 0 18px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={einwilligung}
                           onChange={(e) => setEinwilligung(e.target.checked)}
                           style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }} />
                    <span>
                      Ja, melden Sie mich an. {d.betrieb} darf mir die Zugangsdaten, Erinnerungen und im Anschluss
                      die Unterlagen zu diesem Webinar senden. Ich kann mich jederzeit mit einem Klick am Ende
                      jeder E-Mail abmelden.
                    </span>
                  </label>

                  {formFehler && (
                    <div style={{ ...S.banner, background: '#fdecec', border: '1px solid #E06666', color: '#8a2f2f' }}>
                      {formFehler}
                    </div>
                  )}

                  <button style={{ ...S.knopf, background: akzent, opacity: senden ? 0.6 : 1, cursor: senden ? 'wait' : 'pointer' }}
                          onClick={() => void absenden()} disabled={senden}>
                    {senden ? 'Wird gesendet …' : 'Kostenlos anmelden'}
                  </button>

                  <p style={S.hinweis}>
                    Sie erhalten zuerst eine E-Mail zur Bestätigung. Den Zugangslink schicken wir Ihnen einen Tag
                    vor dem Termin und noch einmal eine Stunde vorher — Sie müssen sich also nichts notieren.
                  </p>
                </>
              )}

              {!gibtBuchbare && offeneTermine.length > 0 && (
                <p style={{ color: '#6b7684', margin: '4px 0 0' }}>
                  Für die aufgeführten Termine ist zurzeit keine Anmeldung möglich.
                </p>
              )}
            </>
          )}
        </div>

        {/* -------- Rechts-Fuß: Pflicht auf jeder öffentlichen Seite -------- */}
        <div style={S.fuss}>
          <button onClick={() => { setZeigeImpressum((v) => !v); setZeigeDatenschutz(false); }}
                  style={S.fussKnopf}>Impressum</button>
          ·
          <button onClick={() => { setZeigeDatenschutz((v) => !v); setZeigeImpressum(false); }}
                  style={S.fussKnopf}>Datenschutz</button>

          {zeigeImpressum && (
            <div style={S.fussKasten}>
              <b style={{ color: '#1a2332' }}>Angaben gemäß § 5 DDG</b><br />
              {imp.firma_name}{imp.rechtsform ? ` ${imp.rechtsform}` : ''}<br />
              {anschrift && <>{anschrift}<br /></>}
              {imp.telefon && <>Telefon: {imp.telefon}<br /></>}
              {imp.email && <>E-Mail: {imp.email}<br /></>}
              {imp.website && <>Web: {imp.website}<br /></>}
              {imp.geschaeftsfuehrer && <>Vertreten durch: {imp.geschaeftsfuehrer}<br /></>}
              {imp.registergericht && <>Registergericht: {imp.registergericht}<br /></>}
              {imp.hrb && <>Registernummer: {imp.hrb}<br /></>}
              {imp.ust_id && <>USt-IdNr.: {imp.ust_id}<br /></>}
              {imp.steuernummer && <>Steuernummer: {imp.steuernummer}</>}
            </div>
          )}

          {zeigeDatenschutz && (
            <div style={S.fussKasten}>
              <b style={{ color: '#1a2332' }}>Datenschutz</b>
              <p style={{ margin: '10px 0' }}>
                Verantwortlich ist {imp.firma_name || 'der oben genannte Anbieter'}{anschrift ? `, ${anschrift}` : ''}.
              </p>
              <p style={{ margin: '10px 0' }}>
                Wir verarbeiten Ihre E-Mail-Adresse und, falls angegeben, Ihren Namen und Ihr Unternehmen
                ausschließlich, um Ihre Anmeldung zu diesem Webinar zu verwalten, Ihnen die Zugangsdaten und
                Erinnerungen zu senden und Ihnen im Anschluss die Unterlagen bereitzustellen.
                Rechtsgrundlage ist Ihre Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.
              </p>
              <p style={{ margin: '10px 0' }}>
                Um Missbrauch auszuschließen, bestätigen Sie Ihre Anmeldung per E-Mail (Double-Opt-in).
                Sie können Ihre Einwilligung jederzeit mit dem Abmeldelink am Ende jeder E-Mail widerrufen —
                die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt davon unberührt.
              </p>
              <p style={{ margin: '10px 0' }}>
                Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde.
                Wenden Sie sich dafür an {imp.email || 'die oben genannte Adresse'}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: '#f7f8fa', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '40px 0 64px' },
  karte: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '28px 26px', maxWidth: 660, margin: '0 auto' },
  eyebrow: { fontSize: 12.5, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 },
  h1: { fontSize: 'clamp(25px, 4vw, 34px)', fontWeight: 800, color: '#1a2332', margin: 0, lineHeight: 1.2 },
  h2: { fontSize: 'clamp(18px, 2.4vw, 22px)', fontWeight: 800, color: '#1a2332', margin: 0 },
  feld: { width: '100%', background: '#fff', color: '#1a2332', border: '1px solid #d6dae1', borderRadius: 10, padding: '12px 14px', fontSize: 15.5, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 },
  knopf: { width: '100%', color: '#fff', border: 'none', borderRadius: 11, padding: '14px 20px', fontSize: 16, fontWeight: 800, fontFamily: 'inherit' },
  hinweis: { color: '#6b7684', fontSize: 13, lineHeight: 1.55, margin: '12px 0 0' },
  banner: { borderRadius: 11, padding: '13px 15px', margin: '0 0 14px', fontSize: 14, lineHeight: 1.55 },
  fuss: { textAlign: 'center', margin: '22px auto 0', maxWidth: 660 },
  fussKnopf: { background: 'none', border: 'none', color: '#6b7684', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: '0 8px', fontFamily: 'inherit' },
  fussKasten: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginTop: 16, textAlign: 'left', fontSize: 13.5, lineHeight: 1.7, color: '#3d4757' },
};
