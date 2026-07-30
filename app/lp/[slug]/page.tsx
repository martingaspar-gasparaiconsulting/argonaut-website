'use client';

// ============================================================
// ARGONAUT OS · Öffentliche Landingpage (ohne Login) · LP Paket 1
// /lp/<slug> — branchengebrandeter Marken-Hero + Nutzen + Double-Opt-In
// + Rechts-Fuß (Impressum + generierte Datenschutzerklärung aus Firmendaten).
// Liest & schreibt nur über /api/oeffentlich/lp. Kein Supabase im Client.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

type Impressum = {
  firma_name: string; rechtsform: string; strasse: string; plz: string; ort: string;
  telefon: string; email: string; website: string; geschaeftsfuehrer: string;
  ust_id: string; registergericht: string; hrb: string; steuernummer: string;
};

type LpDaten = {
  titel: string; untertitel: string | null; nutzen: string[]; cta_text: string | null;
  typ: string; betrieb: string; akzent: string | null; impressum: Impressum;
};

function sichereFarbe(f: string | null | undefined): string {
  const s = (f || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '#C9A84C';
}

export default function LandingpageSeite() {
  const params = useParams();
  const slug = String((params?.slug as string) || '').toLowerCase();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [d, setD] = useState<LpDaten | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [einwilligung, setEinwilligung] = useState(false);
  const [senden, setSenden] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<'bestaetigung' | 'bereits' | null>(null);

  const [zeigeImpressum, setZeigeImpressum] = useState(false);
  const [zeigeDatenschutz, setZeigeDatenschutz] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLaden(true); setFehler(null);
      try {
        const res = await fetch(`/api/oeffentlich/lp?slug=${encodeURIComponent(slug)}`);
        const j = await res.json();
        if (!res.ok) setFehler(j?.error || 'Seite nicht verfügbar.');
        else setD(j as LpDaten);
      } catch {
        setFehler('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
      } finally { setLaden(false); }
    })();
  }, [slug]);

  async function absenden() {
    setFormFehler(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFormFehler('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    if (!einwilligung) { setFormFehler('Bitte bestätige die Einwilligung, damit wir dir schreiben dürfen.'); return; }
    setSenden(true);
    try {
      const res = await fetch('/api/oeffentlich/lp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: email.trim(), name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) setFormFehler(j?.error || 'Anmeldung fehlgeschlagen.');
      else setFertig(j.status === 'bereits' ? 'bereits' : 'bestaetigung');
    } catch {
      setFormFehler('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setSenden(false); }
  }

  const akzent = sichereFarbe(d?.akzent);

  const S: Record<string, CSSProperties> = {
    page: { minHeight: '100dvh', background: '#f4f5f7', color: '#1a2332', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
    hero: { background: `linear-gradient(135deg, ${akzent} 0%, #0A1628 130%)`, color: '#fff', padding: '64px 20px 72px', textAlign: 'center' },
    firma: { fontSize: 14, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.92 },
    h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, margin: '14px auto 10px', maxWidth: 720, lineHeight: 1.1 },
    unter: { fontSize: 'clamp(16px, 1.8vw, 21px)', maxWidth: 620, margin: '0 auto', opacity: 0.95, lineHeight: 1.5 },
    wrap: { maxWidth: 640, margin: '-40px auto 0', padding: '0 16px 56px' },
    card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, boxShadow: '0 12px 40px rgba(10,22,40,0.12)' },
    nutzenLi: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 'clamp(15px, 1.4vw, 18px)', lineHeight: 1.5 },
    lbl: { display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 5, fontWeight: 600 },
    input: { width: '100%', boxSizing: 'border-box', background: '#fff', color: '#1a2332', border: '1px solid #d1d5db', borderRadius: 10, padding: '12px 13px', fontSize: 16, fontFamily: 'inherit', marginBottom: 14 },
    primaer: { width: '100%', background: akzent, color: '#fff', border: 'none', borderRadius: 10, padding: '15px 22px', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
    consent: { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 16px', color: '#4b5563', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' },
    err: { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 13px', margin: '0 0 14px', fontSize: 15 },
    footer: { borderTop: '1px solid #e5e7eb', padding: '24px 16px 48px', textAlign: 'center', color: '#6b7280', fontSize: 13, maxWidth: 640, margin: '0 auto' },
    footerLink: { color: '#4b5563', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', padding: 0 },
    rechtsBox: { textAlign: 'left', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, margin: '14px auto 0', maxWidth: 640, fontSize: 13.5, lineHeight: 1.6, color: '#374151' },
  };

  if (laden) return <main style={S.page}><div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Wird geladen …</div></main>;
  if (fehler || !d) {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Nicht verfügbar</h1>
          <p style={{ color: '#6b7280' }}>{fehler || 'Diese Seite ist nicht verfügbar.'}</p>
        </div>
      </main>
    );
  }

  const imp = d.impressum;
  const anschrift = [imp.strasse, `${imp.plz} ${imp.ort}`.trim()].filter(Boolean);

  return (
    <main style={S.page}>
      <div style={S.hero}>
        <div style={S.firma}>{d.betrieb}</div>
        <h1 style={S.h1}>{d.titel}</h1>
        {d.untertitel && <p style={S.unter}>{d.untertitel}</p>}
      </div>

      <div style={S.wrap}>
        <div style={S.card}>
          {fertig ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{fertig === 'bereits' ? '👍' : '📩'}</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>{fertig === 'bereits' ? 'Du bist schon dabei' : 'Fast geschafft!'}</h2>
              <p style={{ color: '#6b7280', fontSize: 16, lineHeight: 1.55, margin: 0 }}>
                {fertig === 'bereits'
                  ? `Deine Adresse ist bereits bei ${d.betrieb} bestätigt.`
                  : `Wir haben dir eine E-Mail geschickt. Bitte öffne sie und klicke auf „Anmeldung bestätigen“ — erst danach bist du dabei.`}
              </p>
            </div>
          ) : (
            <>
              {d.nutzen.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  {d.nutzen.map((n, i) => (
                    <div key={i} style={S.nutzenLi}>
                      <span style={{ color: akzent, fontWeight: 900, flex: '0 0 auto' }}>✓</span>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}

              {formFehler && <div style={S.err}>{formFehler}</div>}

              <label style={S.lbl}>Name (optional)</label>
              <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ihr Name" />
              <label style={S.lbl}>E-Mail *</label>
              <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ihre@email.de" />

              <label style={S.consent}>
                <input type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: akzent }} />
                <span>Ja, ich möchte E-Mails von {d.betrieb} erhalten. Ich kann mich jederzeit über den Abmelde-Link in jeder E-Mail wieder abmelden.</span>
              </label>

              <button style={{ ...S.primaer, opacity: senden ? 0.6 : 1 }} onClick={absenden} disabled={senden}>
                {senden ? 'Wird gesendet …' : (d.cta_text || 'Jetzt anmelden')}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={S.footer}>
        <div style={{ marginBottom: 8 }}>© {d.betrieb}</div>
        <button style={S.footerLink} onClick={() => { setZeigeImpressum((x) => !x); setZeigeDatenschutz(false); }}>Impressum</button>
        <span style={{ margin: '0 8px' }}>·</span>
        <button style={S.footerLink} onClick={() => { setZeigeDatenschutz((x) => !x); setZeigeImpressum(false); }}>Datenschutz</button>

        {zeigeImpressum && (
          <div style={S.rechtsBox}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Impressum</div>
            <div>{imp.firma_name}{imp.rechtsform ? ` (${imp.rechtsform})` : ''}</div>
            {anschrift.map((z, i) => <div key={i}>{z}</div>)}
            {imp.geschaeftsfuehrer && <div style={{ marginTop: 8 }}>Vertreten durch: {imp.geschaeftsfuehrer}</div>}
            {(imp.telefon || imp.email) && (
              <div style={{ marginTop: 8 }}>
                {imp.telefon && <div>Telefon: {imp.telefon}</div>}
                {imp.email && <div>E-Mail: {imp.email}</div>}
              </div>
            )}
            {(imp.registergericht || imp.hrb) && <div style={{ marginTop: 8 }}>Registergericht: {imp.registergericht} {imp.hrb}</div>}
            {imp.ust_id && <div style={{ marginTop: 8 }}>USt-IdNr.: {imp.ust_id}</div>}
            {!imp.ust_id && imp.steuernummer && <div style={{ marginTop: 8 }}>Steuernummer: {imp.steuernummer}</div>}
          </div>
        )}

        {zeigeDatenschutz && (
          <div style={S.rechtsBox}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Datenschutzerklärung</div>
            <p style={{ marginTop: 0 }}><b>Verantwortlich</b> im Sinne der DSGVO ist {imp.firma_name}{anschrift.length ? `, ${anschrift.join(', ')}` : ''}{imp.email ? `, ${imp.email}` : ''}.</p>
            <p><b>Welche Daten wir erheben:</b> Wenn Sie sich über das Formular eintragen, verarbeiten wir Ihren Namen (sofern angegeben) und Ihre E-Mail-Adresse, um Ihnen die gewünschten E-Mails zu senden.</p>
            <p><b>Rechtsgrundlage</b> ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie im Double-Opt-In-Verfahren per Bestätigungs-E-Mail erteilen. Sie können sie jederzeit über den Abmelde-Link in jeder E-Mail widerrufen.</p>
            <p><b>Auftragsverarbeiter:</b> Der technische Betrieb erfolgt über ARGONAUT OS (Plattform) sowie die Dienstleister Supabase (Hosting/Datenbank, EU) und Resend (E-Mail-Versand) — jeweils auf Basis von Auftragsverarbeitungsverträgen.</p>
            <p><b>Speicherdauer:</b> Ihre Daten werden gespeichert, bis Sie sich abmelden bzw. die Einwilligung widerrufen.</p>
            <p style={{ marginBottom: 0 }}><b>Ihre Rechte:</b> Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Wenden Sie sich dazu an {imp.email || 'die oben genannte Adresse'}.</p>
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>Bereitgestellt über ARGONAUT OS · Double-Opt-In</div>
      </div>
    </main>
  );
}
