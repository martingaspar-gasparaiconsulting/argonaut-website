'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Öffentliche Freebie-Seite   (D3)
//
// /f/<schlüssel> — die Seite, die der Interessent sieht. Trägt die Marke des
// BETRIEBS, nicht die von ARGONAUT: Name, Farbe, Impressum und Datenschutz
// kommen aus seinem Profil.
//
// Der Schlüssel ist zufällig, kein sprechender Name. Damit kann sich kein
// Betrieb den Namen eines anderen wegschnappen — das Problem, das bei den
// Landingpages noch offen ist.
//
// Kein Supabase im Browser: alles läuft über /api/oeffentlich/freebie.
// ============================================================================

type Impressum = {
  firma_name: string; rechtsform: string; strasse: string; plz: string; ort: string;
  telefon: string; email: string; website: string; geschaeftsfuehrer: string;
  ust_id: string; registergericht: string; hrb: string; steuernummer: string;
};

type Daten = {
  titel: string; untertitel: string | null; beschreibung: string | null;
  nutzen: string[]; betrieb: string; akzent: string; impressum: Impressum;
};

function sichereFarbe(f: string | null | undefined): string {
  const s = (f || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '#C9A84C';
}

export default function FreebieSeite() {
  const params = useParams();
  const suche = useSearchParams();
  const key = String((params?.key as string) || '').trim();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [d, setD] = useState<Daten | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [einwilligung, setEinwilligung] = useState(false);
  const [senden, setSenden] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<'bestaetigung' | 'bereits' | 'abgemeldet' | null>(null);

  const [zeigeImpressum, setZeigeImpressum] = useState(false);
  const [zeigeDatenschutz, setZeigeDatenschutz] = useState(false);

  // Rückmeldungen aus den öffentlichen Routen (?bestaetigt=1 usw.)
  const bestaetigt = suche?.get('bestaetigt') === '1';
  const abgemeldet = suche?.get('abgemeldet') === '1';
  const verfallen = suche?.get('verfallen') === '1';
  const linkFehler = suche?.get('fehler') === '1';

  useEffect(() => {
    if (!key) return;
    (async () => {
      setLaden(true); setFehler(null);
      try {
        const res = await fetch(`/api/oeffentlich/freebie?key=${encodeURIComponent(key)}`);
        const j = await res.json();
        if (!res.ok || !j?.ok) setFehler(j?.error || 'Diese Seite ist nicht verfügbar.');
        else setD(j as Daten);
      } catch {
        setFehler('Verbindung fehlgeschlagen. Bitte versuchen Sie es später erneut.');
      } finally { setLaden(false); }
    })();
  }, [key]);

  async function absenden() {
    setFormFehler(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormFehler('Bitte geben Sie eine gültige E-Mail-Adresse ein.'); return;
    }
    if (!einwilligung) {
      setFormFehler('Bitte bestätigen Sie die Einwilligung — ohne sie dürfen wir Ihnen nicht schreiben.'); return;
    }
    setSenden(true);
    try {
      const res = await fetch('/api/oeffentlich/freebie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, email: email.trim(), name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setFormFehler(j?.error || 'Die Anforderung ist fehlgeschlagen.'); return; }
      if (j.status === 'bereits') setFertig('bereits');
      else if (j.status === 'abgemeldet') setFertig('abgemeldet');
      else setFertig('bestaetigung');
    } catch {
      setFormFehler('Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally { setSenden(false); }
  }

  const akzent = sichereFarbe(d?.akzent);

  const S: Record<string, CSSProperties> = {
    seite: { minHeight: '100dvh', background: '#f4f5f7', color: '#1a2332', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
    hero: { background: '#0A1628', color: '#fff', padding: '72px 20px 80px', textAlign: 'center' },
    huelle: { maxWidth: 760, margin: '0 auto', padding: '0 20px' },
    karte: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '28px 26px', marginTop: -44, boxShadow: '0 8px 30px rgba(10,22,40,0.08)' },
    feld: { width: '100%', padding: '13px 14px', borderRadius: 10, border: '1px solid #d7dbe2', fontSize: 15.5, marginBottom: 12, boxSizing: 'border-box' },
    knopf: { width: '100%', padding: '15px 18px', borderRadius: 10, border: 'none', background: akzent, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
    hinweis: { fontSize: 12.5, color: '#6b7684', lineHeight: 1.55, marginTop: 14 },
    fuss: { textAlign: 'center', padding: '34px 20px 60px', color: '#6b7684', fontSize: 13 },
    banner: { borderRadius: 12, padding: '14px 16px', margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.5 },
  };

  if (laden) {
    return <div style={S.seite}><div style={{ ...S.huelle, padding: '80px 20px', textAlign: 'center', color: '#6b7684' }}>Wird geladen …</div></div>;
  }
  if (fehler || !d) {
    return (
      <div style={S.seite}>
        <div style={{ ...S.huelle, padding: '90px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 10px' }}>Nicht verfügbar</h1>
          <p style={{ color: '#6b7684' }}>{fehler}</p>
        </div>
      </div>
    );
  }

  const imp = d.impressum;
  const anschrift = [imp.strasse, [imp.plz, imp.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <div style={S.seite}>
      <div style={{ ...S.hero, borderBottom: `4px solid ${akzent}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ color: akzent, fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14 }}>
            {d.betrieb}
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', lineHeight: 1.15, margin: '0 0 12px', fontWeight: 800 }}>{d.titel}</h1>
          {d.untertitel && <p style={{ fontSize: 17, color: '#c8d3e2', margin: 0, lineHeight: 1.5 }}>{d.untertitel}</p>}
        </div>
      </div>

      <div style={S.huelle}>
        <div style={S.karte}>
          {bestaetigt && (
            <div style={{ ...S.banner, background: '#e8f6ef', border: '1px solid #4CAF7D', color: '#1c5c40' }}>
              <b>Bestätigt.</b> Wir haben Ihnen die Datei per E-Mail geschickt — schauen Sie bitte auch im Spam-Ordner nach.
            </div>
          )}
          {abgemeldet && (
            <div style={{ ...S.banner, background: '#f1f3f6', border: '1px solid #d7dbe2', color: '#3d4757' }}>
              <b>Abgemeldet.</b> Sie erhalten von uns keine weiteren E-Mails zu diesem Thema.
            </div>
          )}
          {verfallen && (
            <div style={{ ...S.banner, background: '#fdf3e6', border: '1px solid #E0A24C', color: '#7a5316' }}>
              Der Bestätigungslink ist abgelaufen. Fordern Sie die Unterlage einfach noch einmal an.
            </div>
          )}
          {linkFehler && (
            <div style={{ ...S.banner, background: '#fdecec', border: '1px solid #E06666', color: '#8a2f2f' }}>
              Dieser Link ist ungültig. Fordern Sie die Unterlage bitte noch einmal an.
            </div>
          )}

          {d.beschreibung && (
            <p style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 18px', whiteSpace: 'pre-line' }}>{d.beschreibung}</p>
          )}

          {d.nutzen.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
              {d.nutzen.map((n, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 15.5, lineHeight: 1.5 }}>
                  <span style={{ color: akzent, fontWeight: 800 }}>✓</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}

          {fertig ? (
            <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>
                {fertig === 'bestaetigung' ? '✉️' : fertig === 'bereits' ? '✅' : '🔕'}
              </div>
              <h2 style={{ fontSize: 21, fontWeight: 800, margin: '0 0 8px' }}>
                {fertig === 'bestaetigung' ? 'Fast geschafft'
                  : fertig === 'bereits' ? 'Sie sind bereits angemeldet'
                  : 'Sie haben sich abgemeldet'}
              </h2>
              <p style={{ color: '#6b7684', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                {fertig === 'bestaetigung'
                  ? 'Wir haben Ihnen eine E-Mail geschickt. Bitte öffnen Sie sie und klicken Sie auf „Anforderung bestätigen" — erst danach dürfen wir Ihnen die Unterlage senden.'
                  : fertig === 'bereits'
                  ? `Ihre Adresse ist bei ${d.betrieb} schon bestätigt. Sie haben die Unterlage bereits erhalten.`
                  : 'Ihre Abmeldung gilt weiterhin. Wenn Sie die Unterlage doch möchten, schreiben Sie uns bitte kurz.'}
              </p>
            </div>
          ) : (
            <>
              <input
                style={S.feld} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ihr Name (freiwillig)" autoComplete="name"
              />
              <input
                style={S.feld} value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Ihre E-Mail-Adresse" type="email" autoComplete="email" inputMode="email"
              />

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.55, color: '#3d4757', margin: '4px 0 18px', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={einwilligung}
                  onChange={(e) => setEinwilligung(e.target.checked)}
                  style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }}
                />
                <span>
                  Ja, senden Sie mir die Unterlage zu. {d.betrieb} darf mir dazu und zu verwandten Themen
                  E-Mails schreiben. Ich kann mich jederzeit mit einem Klick am Ende jeder E-Mail abmelden.
                </span>
              </label>

              {formFehler && (
                <div style={{ ...S.banner, background: '#fdecec', border: '1px solid #E06666', color: '#8a2f2f' }}>
                  {formFehler}
                </div>
              )}

              <button style={{ ...S.knopf, opacity: senden ? 0.6 : 1, cursor: senden ? 'wait' : 'pointer' }}
                      onClick={() => void absenden()} disabled={senden}>
                {senden ? 'Wird gesendet …' : 'Jetzt kostenlos anfordern'}
              </button>

              <p style={S.hinweis}>
                Sie erhalten zuerst eine E-Mail zur Bestätigung. Erst danach schicken wir Ihnen die Unterlage —
                so ist sichergestellt, dass niemand eine fremde Adresse einträgt.
              </p>
            </>
          )}
        </div>

        {/* -------- Rechts-Fuß: Pflicht auf jeder öffentlichen Seite -------- */}
        <div style={S.fuss}>
          <button onClick={() => { setZeigeImpressum((v) => !v); setZeigeDatenschutz(false); }}
                  style={{ background: 'none', border: 'none', color: '#6b7684', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: '0 8px' }}>
            Impressum
          </button>
          ·
          <button onClick={() => { setZeigeDatenschutz((v) => !v); setZeigeImpressum(false); }}
                  style={{ background: 'none', border: 'none', color: '#6b7684', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: '0 8px' }}>
            Datenschutz
          </button>

          {zeigeImpressum && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginTop: 16, textAlign: 'left', fontSize: 13.5, lineHeight: 1.7, color: '#3d4757' }}>
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
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginTop: 16, textAlign: 'left', fontSize: 13.5, lineHeight: 1.7, color: '#3d4757' }}>
              <b style={{ color: '#1a2332' }}>Datenschutz</b>
              <p style={{ margin: '10px 0' }}>
                Verantwortlich ist {imp.firma_name || 'der oben genannte Anbieter'}{anschrift ? `, ${anschrift}` : ''}.
              </p>
              <p style={{ margin: '10px 0' }}>
                Wir verarbeiten Ihre E-Mail-Adresse und, falls angegeben, Ihren Namen ausschließlich, um Ihnen die
                angeforderte Unterlage zu senden und Ihnen anschließend einige wenige E-Mails zum selben Thema zu
                schreiben. Rechtsgrundlage ist Ihre Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.
              </p>
              <p style={{ margin: '10px 0' }}>
                Um Missbrauch auszuschließen, bestätigen Sie Ihre Anforderung per E-Mail (Double-Opt-in).
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
