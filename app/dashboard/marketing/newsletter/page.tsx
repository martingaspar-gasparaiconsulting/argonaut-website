'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { emailNormalisieren, istEmailGueltig, zaehleAbonnenten } from '@/lib/newsletter';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';
import { quoten, messHinweis } from '@/lib/mailMessung';
import { DOI_QUELLEN, aboBestaetigtAm } from '@/lib/werbeErlaubnis';
import { doiNachgeholtAm, doiNachholenErlaubt, angabeAmEintrag, DOI_GRUND_TEXT, DOI_MAX_MAILS, datumDe, heuteIsoBerlin } from '@/lib/doiNachholen';

const MODUL = 'newsletter_abonnenten';

// ============================================================
// ARGONAUT OS · MARKETING · Newsletter (Punkt 29a + 29b)
// Abonnenten-Liste + Versand über Resend + Versand-Historie.
// Öffentliche Abmeldung: /api/newsletter/abmelden?token=…
// Paket 199 (D1): Von Hand eingetragene Adressen bekommen per Knopf eine
// Bestätigungs-Mail — nur mit Quelle + Datum der Einwilligung
// (/api/newsletter/doi-nachholen). „Reaktivieren" ist entfallen: wer sich
// abgemeldet hat, meldet sich nur selbst wieder an (Anmeldeseite).
// ============================================================

const C = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Abonnent = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  quelle: string | null;
  angemeldet_am: string;
  abgemeldet_am: string | null;
  bestaetigt_am?: string | null;
  einwilligung_quelle?: string | null;
  einwilligung_am?: string | null;
  doi_gesendet_am?: string | null;
  doi_anzahl?: number | null;
};

/** Paket 199: Wie steht es um die Bestätigung dieser Adresse? */
function bestaetigungsStand(a: Abonnent): 'bestaetigt' | 'eigene_strecke' | 'von_hand' | 'abgemeldet' {
  if (a.status === 'abgemeldet' || a.abgemeldet_am) return 'abgemeldet';
  if (aboBestaetigtAm(a) !== null || doiNachgeholtAm(a) !== null) return 'bestaetigt';
  if (DOI_QUELLEN.includes(String(a.quelle ?? '').trim().toLowerCase())) return 'eigene_strecke';
  return 'von_hand';
}

type Versand = {
  id: string;
  betreff: string;
  empfaenger_anzahl: number;
  erfolg_anzahl: number;
  fehler_anzahl: number;
  gesendet_am: string;
  geoeffnet_anzahl: number | null;
  geklickt_anzahl: number | null;
};

function fmtDatum(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDatumZeit(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NewsletterAbonnenten() {
  const [liste, setListe] = useState<Abonnent[]>([]);
  const [versandListe, setVersandListe] = useState<Versand[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [speichern, setSpeichern] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [fDoi, setFDoi] = useState(false);
  const [fQuelle, setFQuelle] = useState('');
  const [fDatum, setFDatum] = useState('');

  // Paket 199: Bestätigungs-Mail für einen Eintrag der Liste
  const [doiOffen, setDoiOffen] = useState<string | null>(null);
  const [doiQuelle, setDoiQuelle] = useState('');
  const [doiDatum, setDoiDatum] = useState('');
  const [doiBusy, setDoiBusy] = useState(false);
  const [doiMeldung, setDoiMeldung] = useState<{ id: string; art: 'ok' | 'fehler'; text: string } | null>(null);

  const [betreff, setBetreff] = useState('');
  const [inhalt, setInhalt] = useState('');
  const [sende, setSende] = useState(false);
  const [sendeMeldung, setSendeMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  // Öffentliches Anmeldeformular (Double-Opt-In)
  const [oSlug, setOSlug] = useState('');
  const [oAktiv, setOAktiv] = useState(false);
  const [oTitel, setOTitel] = useState('');
  const [oText, setOText] = useState('');
  const [oBusy, setOBusy] = useState(false);
  const [oMeldung, setOMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);
  const [oKopiert, setOKopiert] = useState(false);
  const [oSequenzId, setOSequenzId] = useState('');
  const [oSequenzen, setOSequenzen] = useState<{ id: string; name: string; status: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/optin-einstellungen');
        const j = await res.json();
        if (res.ok && j?.ok) {
          setOSlug(j.optin_slug || '');
          setOAktiv(!!j.optin_aktiv);
          setOTitel(j.optin_titel || '');
          setOText(j.optin_text || '');
          setOSequenzId(j.optin_sequenz_id || '');
        }
      } catch {
        /* optionale Sektion */
      }
      const { data: seqD } = await supabase
        .from('autoresponder_sequenz')
        .select('id, name, status')
        .order('created_at', { ascending: false });
      setOSequenzen((seqD ?? []) as { id: string; name: string; status: string }[]);
    })();
  }, []);

  const optinUrl = oSlug ? `https://argonaut-os.com/anmelden/${oSlug}` : '';

  async function optinSpeichern() {
    setOMeldung(null);
    setOBusy(true);
    try {
      const res = await fetch('/api/marketing/optin-einstellungen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ optin_slug: oSlug, optin_aktiv: oAktiv, optin_titel: oTitel, optin_text: oText, optin_sequenz_id: oSequenzId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        setOMeldung({ art: 'fehler', text: j?.error || 'Speichern fehlgeschlagen.' });
      } else {
        setOSlug(j.optin_slug || '');
        setOAktiv(!!j.optin_aktiv);
        setOSequenzId(j.optin_sequenz_id || '');
        setOMeldung({ art: 'ok', text: '✓ Gespeichert.' });
      }
    } catch {
      setOMeldung({ art: 'fehler', text: 'Speichern fehlgeschlagen.' });
    } finally {
      setOBusy(false);
    }
  }

  async function optinKopieren() {
    if (!optinUrl) return;
    try {
      await navigator.clipboard.writeText(optinUrl);
      setOKopiert(true);
      setTimeout(() => setOKopiert(false), 2000);
    } catch {
      /* Clipboard evtl. blockiert */
    }
  }

  async function laden() {
    setLoading(true);
    setFehler(null);
    const { data, error } = await supabase
      .from('newsletter_abonnenten')
      .select('*')
      .order('angemeldet_am', { ascending: false });
    if (error) {
      setFehler(error.message);
      setListe([]);
    } else {
      const rows = (data ?? []) as Abonnent[];
      setListe(rows);
      const { data: auth } = await supabase.auth.getUser();
      setUid(auth?.user?.id ?? null);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, rows.map((r) => r.id)));
    }
    const { data: vData } = await supabase
      .from('newsletter_versand')
      .select('id, betreff, empfaenger_anzahl, erfolg_anzahl, fehler_anzahl, gesendet_am, geoeffnet_anzahl, geklickt_anzahl')
      .order('gesendet_am', { ascending: false })
      .limit(10);
    setVersandListe((vData ?? []) as Versand[]);
    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kpi = useMemo(() => zaehleAbonnenten(liste), [liste]);

  async function doiSenden(id: string, quelle: string, datum: string): Promise<{ ok: boolean; text: string }> {
    try {
      const res = await fetch('/api/newsletter/doi-nachholen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, einwilligung_quelle: quelle, einwilligung_am: datum }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return { ok: false, text: j?.error || 'Senden fehlgeschlagen.' };
      return { ok: true, text: j.hinweis || 'Bestätigungs-Mail gesendet.' };
    } catch {
      return { ok: false, text: 'Senden fehlgeschlagen.' };
    }
  }

  function doiOeffnen(a: Abonnent) {
    setDoiMeldung(null);
    setDoiOffen(doiOffen === a.id ? null : a.id);
    setDoiQuelle(a.einwilligung_quelle ?? '');
    setDoiDatum((a.einwilligung_am ?? '').slice(0, 10));
  }

  async function doiAusListe(a: Abonnent) {
    setDoiBusy(true);
    const r = await doiSenden(a.id, doiQuelle, doiDatum);
    setDoiBusy(false);
    setDoiMeldung({ id: a.id, art: r.ok ? 'ok' : 'fehler', text: r.text });
    if (r.ok) { setDoiOffen(null); laden(); }
  }

  async function hinzufuegen() {
    setHinweis(null);
    const email = emailNormalisieren(fEmail);
    if (!istEmailGueltig(email)) {
      setHinweis('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (fDoi && (fQuelle.trim().length < 5 || !fDatum)) {
      setHinweis('Für die Bestätigungs-Mail bitte angeben, wo und wann die Person eingewilligt hat.');
      return;
    }
    setSpeichern(true);
    const { data: neu, error } = await supabase.from('newsletter_abonnenten').insert({
      email,
      name: fName.trim() || null,
      quelle: 'manuell',
    }).select('id').single();
    setSpeichern(false);
    if (error || !neu) {
      if ((error as { code?: string })?.code === '23505') {
        setHinweis('Diese E-Mail steht bereits in Ihrer Liste.');
      } else {
        setHinweis('Fehler beim Speichern: ' + (error?.message ?? ''));
      }
      return;
    }
    try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
    if (fDoi) {
      const r = await doiSenden((neu as { id: string }).id, fQuelle, fDatum);
      setHinweis(r.ok ? '✓ Eingetragen. ' + r.text : 'Eingetragen, aber: ' + r.text);
    }
    setFEmail('');
    setFName('');
    setNmExtra({});
    setFDoi(false);
    setFQuelle('');
    setFDatum('');
    laden();
  }

  // Paket 205 (S1): Abmelden läuft über den Server und trägt die Adresse in die
  // Sperrliste ALLER Kanäle ein (vorher nur Newsletter-Status).
  async function statusSetzen(a: Abonnent, neu: 'abgemeldet') {
    if (neu !== 'abgemeldet') return;
    if (!confirm(`„${a.email}" abmelden?\n\nDie Adresse kommt in die Sperrliste und bekommt aus keinem Kanal mehr Werbung (Newsletter, Serien, Abläufe). Das lässt sich hier nicht rückgängig machen — die Person kann sich nur selbst neu anmelden.`)) return;
    try {
      const res = await fetch('/api/newsletter/abmelden-hand', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { alert('Fehler: ' + (d?.error || 'Abmelden fehlgeschlagen.')); return; }
      if (d.sperrliste === false) alert(d.hinweis);
    } catch {
      alert('Fehler: Verbindung fehlgeschlagen.');
      return;
    }
    laden();
  }

  async function loeschen(a: Abonnent) {
    if (!confirm(`„${a.email}" wirklich aus der Liste löschen?`)) return;
    const { error } = await supabase.from('newsletter_abonnenten').delete().eq('id', a.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  async function senden() {
    setSendeMeldung(null);
    if (!betreff.trim() || !inhalt.trim()) {
      setSendeMeldung({ art: 'fehler', text: 'Bitte Betreff und Inhalt ausfüllen.' });
      return;
    }
    if (kpi.aktiv === 0) {
      setSendeMeldung({ art: 'fehler', text: 'Es gibt keine aktiven Abonnenten.' });
      return;
    }
    if (!confirm(`Newsletter jetzt an ${kpi.aktiv} aktive Abonnent${kpi.aktiv === 1 ? '' : 'en'} senden?`)) return;

    setSende(true);
    try {
      const res = await fetch('/api/newsletter-versand', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ betreff: betreff.trim(), inhalt: inhalt.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setSendeMeldung({ art: 'fehler', text: j?.error || 'Versand fehlgeschlagen.' });
      } else {
        const nachsatz = j.fehler > 0 ? ` (${j.fehler} nicht zustellbar)` : '';
        const ohne = j.hinweis ? ` ${j.hinweis}` : '';
        setSendeMeldung({ art: 'ok', text: `✓ An ${j.gesendet} Abonnenten gesendet${nachsatz}.${ohne}` });
        setBetreff('');
        setInhalt('');
        laden();
      }
    } catch (e: unknown) {
      setSendeMeldung({ art: 'fehler', text: e instanceof Error ? e.message : 'Versand fehlgeschlagen.' });
    } finally {
      setSende(false);
    }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              ✉️ Newsletter
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Empfänger-Liste pflegen und Newsletter versenden.
            </p>
          </div>
          <a
            href="/dashboard/marketing"
            style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}
          >
            ‹ Zurück zum Marketing
          </a>
        </div>

        {/* KPI-Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, margin: '20px 0 24px' }}>
          {[
            { label: 'Abonnenten gesamt', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Aktiv', wert: kpi.aktiv, farbe: C.green },
            { label: 'Unbestätigt', wert: kpi.unbestaetigt, farbe: C.warn },
            { label: 'Abgemeldet', wert: kpi.abgemeldet, farbe: C.textDim },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>
                {kp.wert}
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                {kp.label}
              </div>
            </div>
          ))}
        </div>

        {/* Öffentliches Anmeldeformular (Double-Opt-In) */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: `1px solid ${C.cyan}`, marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.cyan, fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 8 }}>
            🔗 Öffentliches Anmeldeformular (Double-Opt-In)
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.55 }}>
            Teilen Sie einen Link, über den sich Interessenten selbst eintragen. Jeder bekommt zuerst eine
            Bestätigungsmail und landet <strong style={{ color: '#fff' }}>erst nach dem Klick</strong> aktiv in Ihrer Liste — rechtssicher (DSGVO/§7 UWG).
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={oAktiv} onChange={(e) => setOAktiv(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.cyan }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(14px, 1.19vw, 19px)' }}>Anmeldeformular aktiv (öffentlich erreichbar)</span>
          </label>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Link-Name</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 17px)', padding: '10px 4px 10px 0' }}>argonaut-os.com/anmelden/</span>
              <input value={oSlug} onChange={(e) => setOSlug(e.target.value)} placeholder="ihre-firma" style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }} />
            </div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(12px, 1vw, 15px)' }}>Nur Kleinbuchstaben, Zahlen und Bindestriche.</p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Überschrift auf der Seite</label>
            <input value={oTitel} onChange={(e) => setOTitel(e.target.value)} placeholder="z. B. Unser Newsletter" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Kurzer Einleitungstext</label>
            <textarea value={oText} onChange={(e) => setOText(e.target.value)} rows={3} placeholder="z. B. Aktionen, Neuigkeiten und Tipps — direkt in Ihr Postfach." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nach Bestätigung automatisch starten (optional)</label>
            <select value={oSequenzId} onChange={(e) => setOSequenzId(e.target.value)} style={inputStyle}>
              <option value="">— keine Sequenz —</option>
              {oSequenzen.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status !== 'aktiv' ? ' (nicht aktiv)' : ''}
                </option>
              ))}
            </select>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(12px, 1vw, 15px)' }}>
              Bestätigte Kontakte treten dann automatisch in diese Autoresponder-Sequenz ein (Willkommensserie). Die Sequenz muss auf „Aktiv“ stehen.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button
              onClick={optinSpeichern}
              disabled={oBusy}
              style={{ background: C.cyan, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(14px, 1.19vw, 19px)', cursor: oBusy ? 'wait' : 'pointer', opacity: oBusy ? 0.7 : 1 }}
            >
              {oBusy ? 'Speichere…' : 'Speichern'}
            </button>
            {oMeldung && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: oMeldung.art === 'ok' ? C.green : C.danger }}>
                {oMeldung.text}
              </span>
            )}
          </div>

          {oAktiv && optinUrl && (
            <div style={{ marginTop: 18, background: C.navy, borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.cyan, fontSize: 'clamp(13px, 1.13vw, 18px)', wordBreak: 'break-all', flex: 1 }}>{optinUrl}</span>
              <button onClick={optinKopieren} style={btnStyle(C.cyan)}>{oKopiert ? '✓ Kopiert' : 'Kopieren'}</button>
              <a href={optinUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle(C.textDim), textDecoration: 'none' }}>Vorschau</a>
            </div>
          )}
        </div>

        {/* Newsletter schreiben & senden */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: `1px solid ${C.gold}`, marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>
            Newsletter schreiben & senden
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Betreff</label>
            <input value={betreff} onChange={(e) => setBetreff(e.target.value)} placeholder="z. B. Unsere Herbst-Aktion für Sie" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Inhalt</label>
            <textarea value={inhalt} onChange={(e) => setInhalt(e.target.value)} rows={8} placeholder={'Guten Tag,\n\nhier kommt Ihre Nachricht …\n\nHerzliche Grüße'} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button
              onClick={senden}
              disabled={sende}
              style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 26px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: sende ? 'wait' : 'pointer', opacity: sende ? 0.7 : 1 }}
            >
              {sende ? 'Sende…' : `📨 An ${kpi.aktiv} aktive senden`}
            </button>
            {sendeMeldung && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: sendeMeldung.art === 'ok' ? C.green : C.danger }}>
                {sendeMeldung.text}
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '14px 0 0', fontSize: 'clamp(12px, 1vw, 16px)' }}>
            Jede Mail enthält automatisch einen Abmelde-Link (§7 UWG). Versand nur an Empfänger mit Einwilligung.
          </p>
        </div>

        {/* Abonnent hinzufügen */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 24px)', marginBottom: 14 }}>
            Abonnent hinzufügen
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 14px', fontSize: 'clamp(12px, 1vw, 16px)', lineHeight: 1.5 }}>
            Von Hand eingetragene Adressen erhalten den Newsletter erst, wenn am Kontakt eine Einwilligung hinterlegt ist,
            sich die Person über Ihre Anmeldeseite angemeldet hat oder Ihre Bestätigungs-Mail angeklickt hat.
            Die Bestätigungs-Mail dürfen Sie nur schicken, wenn die Person Ihnen ihre Adresse selbst für Informationen gegeben hat —
            dafür tragen Sie ein, wo und wann.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 240px' }}>
              <label style={labelStyle}>E-Mail *</label>
              <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="kunde@beispiel.example.com" style={inputStyle} />
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label style={labelStyle}>Name (optional)</label>
              <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="z. B. Maria Muster" style={inputStyle} />
            </div>
            <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={inputStyle} labStyle={labelStyle} />
            <button
              onClick={hinzufuegen}
              disabled={speichern}
              style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1, height: 44 }}
            >
              {speichern ? 'Speichere…' : '+ Hinzufügen'}
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: '14px 0 0' }}>
            <input type="checkbox" checked={fDoi} onChange={(e) => setFDoi(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.cyan }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>Gleich eine Bestätigungs-Mail senden</span>
          </label>
          {fDoi && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
              <div style={{ flex: '3 1 260px' }}>
                <label style={labelStyle}>Wo hat die Person eingewilligt? *</label>
                <input value={fQuelle} onChange={(e) => setFQuelle(e.target.value)} maxLength={160} placeholder="z. B. Visitenkarte Messe Stuttgart" style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Wann? *</label>
                <input type="date" value={fDatum} max={heuteIsoBerlin()} onChange={(e) => setFDatum(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}
          {hinweis && (
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: hinweis.startsWith('✓') ? C.green : C.warn, margin: '12px 0 0', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              {hinweis}
            </p>
          )}
        </div>

        {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden} />}

        {/* Abonnenten-Liste */}
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Abonnenten…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>
            Fehler beim Laden: {fehler}
          </div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)' }}>
              Noch keine Abonnenten. Fügen Sie oben Ihren ersten Empfänger hinzu.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {liste.map((a) => {
              const stand = bestaetigungsStand(a);
              const abgemeldet = stand === 'abgemeldet';
              const unbest = a.status === 'unbestaetigt';
              const vonHand = stand === 'von_hand' && !unbest;
              const badgeFarbe = abgemeldet ? C.textDim : unbest || vonHand ? C.warn : C.green;
              const badgeText = abgemeldet ? 'Abgemeldet' : unbest ? 'Unbestätigt' : vonHand ? 'Von Hand · ohne Bestätigung' : 'Aktiv';
              const doiGrund = stand === 'von_hand' ? doiNachholenErlaubt(a, true) : null;
              const angabeFest = angabeAmEintrag(a);
              return (
                <div key={a.id} style={{ background: C.navy2, borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.31vw, 21px)' }}>
                        {a.email}
                      </span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: badgeFarbe, border: `1px solid ${badgeFarbe}`, borderRadius: 12, padding: '2px 10px' }}>
                        {badgeText}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: C.textDim, marginTop: 4 }}>
                      {a.name && <span>{a.name}</span>}
                      <span>Quelle: {a.quelle ?? '—'}</span>
                      <span>Seit: {fmtDatum(a.angemeldet_am)}</span>
                      {a.einwilligung_quelle && <span>Einwilligung: {a.einwilligung_quelle}{a.einwilligung_am ? ` (${datumDe(a.einwilligung_am)})` : ''}</span>}
                      {a.doi_gesendet_am && stand !== 'bestaetigt' && <span>Bestätigung angefragt: {fmtDatum(a.doi_gesendet_am)} ({a.doi_anzahl ?? 1}/{DOI_MAX_MAILS})</span>}
                    </div>
                    {doiOffen === a.id && (
                      <div style={{ marginTop: 10, background: C.navy, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.cyan}` }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div style={{ flex: '3 1 220px' }}>
                            <label style={labelStyle}>Wo hat die Person eingewilligt? *</label>
                            <input value={doiQuelle} disabled={angabeFest} onChange={(e) => setDoiQuelle(e.target.value)} maxLength={160} placeholder="z. B. Häkchen Auftragsformular" style={inputStyle} />
                          </div>
                          <div style={{ flex: '1 1 150px' }}>
                            <label style={labelStyle}>Wann? *</label>
                            <input type="date" value={doiDatum} disabled={angabeFest} max={heuteIsoBerlin()} onChange={(e) => setDoiDatum(e.target.value)} style={inputStyle} />
                          </div>
                          <button onClick={() => doiAusListe(a)} disabled={doiBusy} style={{ ...btnStyle(C.cyan), height: 44 }}>
                            {doiBusy ? 'Sende…' : 'Bestätigungs-Mail senden'}
                          </button>
                        </div>
                        <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', fontSize: 'clamp(12px, 1vw, 15px)', lineHeight: 1.5 }}>
                          Die Mail enthält nur die Bitte um Bestätigung, keine Werbung. Höchstens {DOI_MAX_MAILS} Mails je Adresse, mindestens 7 Tage Abstand.
                          {angabeFest ? ' Quelle und Datum sind als Nachweis gespeichert und lassen sich nicht mehr ändern.' : ' Quelle und Datum werden als Nachweis gespeichert.'}
                        </p>
                      </div>
                    )}
                    {doiMeldung?.id === a.id && (
                      <p style={{ fontFamily: 'DM Sans, sans-serif', color: doiMeldung.art === 'ok' ? C.green : C.danger, margin: '8px 0 0', fontSize: 'clamp(13px, 1.13vw, 17px)' }}>{doiMeldung.text}</p>
                    )}
                    <EigeneFelderAnzeige felder={felder} werte={werteMap[a.id]} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    {stand === 'von_hand' && (
                      <button
                        onClick={() => doiOeffnen(a)}
                        disabled={doiGrund !== 'ok'}
                        title={doiGrund && doiGrund !== 'ok' ? DOI_GRUND_TEXT[doiGrund] : 'Bestätigungs-Mail (Double-Opt-in) senden'}
                        style={{ ...btnStyle(C.cyan), opacity: doiGrund === 'ok' ? 1 : 0.45, cursor: doiGrund === 'ok' ? 'pointer' : 'not-allowed' }}
                      >
                        ✉️ Bestätigung anfragen
                      </button>
                    )}
                    {!abgemeldet && (
                      <button onClick={() => statusSetzen(a, 'abgemeldet')} style={btnStyle(C.warn)}>Abmelden</button>
                    )}
                    <button onClick={() => loeschen(a)} style={btnStyle(C.textDim)}>Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Versand-Historie */}
        {versandListe.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 24px)', marginBottom: 14 }}>
              Letzte Versände
            </div>
            {/* Die Einordnung gehört neben die Zahl, nicht ins Kleingedruckte:
                Ohne sie zieht jemand aus „8 % geöffnet" den falschen Schluss. */}
            <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 15px)', lineHeight: 1.55, marginBottom: 14, maxWidth: '72ch' }}>
              {messHinweis(versandListe[0])} Gezählt werden nur Summen — <b style={{ color: '#fff' }}>wer</b> geöffnet
              hat, wird bewusst nicht gespeichert.
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {versandListe.map((v) => (
                <div key={v.id} style={{ background: C.navy2, borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(14px, 1.19vw, 19px)', fontWeight: 600 }}>
                    {v.betreff}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: C.textDim }}>
                    <span style={{ color: C.green }}>{v.erfolg_anzahl} gesendet</span>
                    {v.fehler_anzahl > 0 && <span style={{ color: C.danger }}>{v.fehler_anzahl} Fehler</span>}
                    {(() => {
                      const q = quoten(v);
                      return (
                        <>
                          <span title="Öffnungen, nicht Öffner — siehe Hinweis unten">
                            {q.oeffnung == null ? '— geöffnet' : `${q.oeffnung} % geöffnet`}
                          </span>
                          <span style={{ color: q.klick != null && q.klick > 0 ? C.green : undefined }}
                                title="Klicks sind belastbar: Da hat wirklich jemand gedrückt.">
                            {q.klick == null ? '— geklickt' : `${q.klick} % geklickt`}
                          </span>
                        </>
                      );
                    })()}
                    <span>{fmtDatumZeit(v.gesendet_am)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  color: '#8FA3BE',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  boxSizing: 'border-box',
};

function btnStyle(farbe: string): React.CSSProperties {
  return {
    background: 'transparent',
    color: farbe,
    border: `1px solid ${farbe}`,
    borderRadius: 8,
    padding: '7px 13px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    cursor: 'pointer',
  };
}
