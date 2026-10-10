'use client';

// ============================================================
// ARGONAUT OS · Paket 305 · FM1 — Karte „🌐 Fahrzeugmappe (online)" (nur Chef)
// Ersetzt die Karte „Online-Ankaufformular" aus Paket 264: gleicher Schalter,
// gleiche Kennung, gleicher Link — dahinter liegt jetzt die Fahrzeugmappe
// mit Fotos, Videos und Unterlagen.
// Drei Wege auf die Webseite des Händlers:
//  1. ARGONAUT-Webseite (Website-Bauer): Menüpunkt „Fahrzeug verkaufen" kommt
//     automatisch, sobald eingeschaltet (auf der eigenen Domain unter
//     /fahrzeug-verkaufen).
//  2. Fremde Webseite: fertiger Knopf zum Einfügen (reiner Link, kein Skript).
//  3. Schaufenster/Flyer: QR-Code als Bild zum Herunterladen.
// ============================================================

import { useEffect, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { DOMAIN_PFAD, knopfHtml } from '@/lib/fahrzeugMappe';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);
const C = { navy: '#0A1628', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D' };

export default function MappeEinstellung({ betrieb, aktiv, kennung, busy, onSetzen }: {
  betrieb: string; aktiv: boolean; kennung: string | null; busy: boolean; onSetzen: (aktiv: boolean) => void;
}) {
  const [domain, setDomain] = useState<string | null>(null);
  const [farbe, setFarbe] = useState('#0A1628');
  const [qr, setQr] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const basis = typeof window !== 'undefined' ? window.location.origin : 'https://argonaut-os.com';
  const argonautLink = kennung ? `${basis}/ankauf/${kennung}` : '';
  const domainLink = domain ? `https://${domain}${DOMAIN_PFAD}` : '';
  const hauptLink = domainLink || argonautLink;
  const knopf = hauptLink ? knopfHtml(hauptLink, farbe) : null;

  useEffect(() => {
    void (async () => {
      const [w, ci] = await Promise.all([
        supabase.from('web_seiten').select('domain, status').eq('owner_user_id', betrieb).eq('status', 'live').limit(20),
        supabase.from('web_ci').select('farbe_akzent').eq('owner_user_id', betrieb).maybeSingle(),
      ]);
      const ds = [...new Set((((w.data as unknown) as { domain: string | null }[]) ?? [])
        .map((z) => String(z.domain ?? '').trim().toLowerCase().replace(/^www\./, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
      setDomain(ds.length === 1 ? ds[0] : null);
      const f = String((ci.data as { farbe_akzent?: string | null } | null)?.farbe_akzent ?? '');
      if (/^#[0-9a-fA-F]{6}$/.test(f)) setFarbe(f);
    })();
  }, [betrieb]);

  useEffect(() => {
    if (!aktiv || !hauptLink) { setQr(null); return; }
    let aus = false;
    void import('qrcode').then((QR) => QR.toDataURL(hauptLink, { margin: 2, width: 720 })).then((u) => { if (!aus) setQr(u); }).catch(() => undefined);
    return () => { aus = true; };
  }, [aktiv, hauptLink]);

  function kopieren(was: string, text: string) {
    void navigator.clipboard?.writeText(text).then(() => { setKopiert(was); setTimeout(() => setKopiert(null), 1800); });
  }

  return (
    <div style={s.karte}>
      <h3 style={s.h3}>🌐 Fahrzeugmappe (online)</h3>
      <div style={s.dim}>
        Wer sein Fahrzeug verkaufen oder in Zahlung geben will, schickt Ihnen über einen eigenen Link eine komplette Mappe:
        Fahrzeugschein, 8 Pflichtfotos, Schäden, Kaltstart-Video, TÜV-Bericht, Serviceheft, Rechnungen und Preisvorstellung — direkt mit der Handy-Kamera.
        Jede Mappe landet hier als Ankauf „In Bewertung" mit der Karte „Fahrzeugmappe"; Sie bekommen eine Glocke und eine E-Mail, der Verkäufer eine Eingangsbestätigung.
        Die Mappe geht nur an Sie, an niemanden sonst.
      </div>
      <div style={{ ...s.reihe, margin: '12px 0' }}>
        <span style={{ ...s.pill, color: aktiv ? C.ok : C.dim }}>{aktiv ? 'eingeschaltet' : 'ausgeschaltet'}</span>
        {aktiv
          ? <button style={s.btn} disabled={busy} onClick={() => onSetzen(false)}>Ausschalten</button>
          : <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onSetzen(true)}>Einschalten</button>}
      </div>

      {aktiv && kennung && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={s.lab}>Link zu Ihrer Fahrzeugmappe</div>
            {domainLink && (
              <div style={s.reihe}>
                <input style={{ ...s.inp, flex: '1 1 320px' }} readOnly value={domainLink} aria-label="Link auf Ihrer Domain" onFocus={(e) => e.currentTarget.select()} />
                <button style={s.btn} onClick={() => kopieren('domain', domainLink)}>{kopiert === 'domain' ? '✓ Kopiert' : '📋 Kopieren'}</button>
                <a href={domainLink} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>Ansehen ↗</a>
              </div>
            )}
            <div style={{ ...s.reihe, marginTop: domainLink ? 6 : 0 }}>
              <input style={{ ...s.inp, flex: '1 1 320px' }} readOnly value={argonautLink} aria-label="Link zur Fahrzeugmappe" onFocus={(e) => e.currentTarget.select()} />
              <button style={s.btn} onClick={() => kopieren('link', argonautLink)}>{kopiert === 'link' ? '✓ Kopiert' : '📋 Kopieren'}</button>
              {!domainLink && <a href={argonautLink} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>Ansehen ↗</a>}
            </div>
            <div style={{ ...s.dim, marginTop: 6 }}>
              {domainLink
                ? 'Ihre ARGONAUT-Webseite zeigt im Menü automatisch „Fahrzeug verkaufen". Beide Links führen zur selben Mappe.'
                : 'Mit der ARGONAUT-Webseite erscheint im Menü automatisch „Fahrzeug verkaufen"; mit eigener Domain dann unter ihre-domain.de/fahrzeug-verkaufen.'}
            </div>
          </div>

          {knopf && (
            <div>
              <div style={s.lab}>Knopf für eine andere Webseite (WordPress, Jimdo, Wix …)</div>
              <div style={s.reihe}>
                <textarea style={{ ...s.inp, flex: '1 1 420px', minHeight: 76, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} readOnly value={knopf} aria-label="HTML für den Knopf" onFocus={(e) => e.currentTarget.select()} />
                <button style={s.btn} onClick={() => kopieren('knopf', knopf)}>{kopiert === 'knopf' ? '✓ Kopiert' : '📋 HTML kopieren'}</button>
              </div>
              <div style={{ ...s.dim, marginTop: 6 }}>In einen HTML-Block Ihrer Webseite einfügen. Es ist ein einfacher Link ohne Skript; die Mappe öffnet sich in einem neuen Fenster, damit Kamera und Hochladen sicher funktionieren.</div>
            </div>
          )}

          {qr && (
            <div style={{ ...s.reihe, alignItems: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR-Code zur Fahrzeugmappe" width={120} height={120} style={{ borderRadius: 8, background: '#fff' }} />
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={s.dim}>Für Schaufenster, Flyer und Visitenkarten: Kunden scannen und starten direkt am Handy.</div>
                <a href={qr} download="fahrzeugmappe-qr-code.png" style={{ ...s.btn, textDecoration: 'none', width: 'fit-content' }}>⬇ QR-Code herunterladen</a>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ ...s.dim, marginTop: 10 }}>Ausschalten macht alle Links sofort ungültig (auch angefangene Mappen); beim Wiedereinschalten gilt derselbe Link.</div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 },
  h3: { margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: C.text },
  dim: { color: C.dim, fontSize: 13, lineHeight: 1.5 },
  lab: { color: C.dim, fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 700 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '9px 11px', fontSize: 14, minWidth: 0 },
  btn: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 14 },
};
