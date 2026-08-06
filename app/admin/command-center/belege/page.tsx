import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Dreizack from '@/components/Dreizack';

// ============================================================================
// ARGONAUT OS · Command Center · app/admin/command-center/belege/page.tsx
// Block B3a — Belege ANSEHEN. Belege-Liste (privater Bucket 'belege' via
// signierter Vorschau-URL) + EÜR-Überblick fürs gewählte Jahr. Read-only.
// Nur Martin (Betreiber-Sperre). Umschalter [Geschäftlich · Privat] wie im CC.
// Upload (B3b) und Bestätigen/Korrigieren (B3c) kommen als eigene Pushes.
// EÜR wird hier direkt aus den Zeilen gerechnet (USt-befreit: netto = brutto);
// AfA-Jahresverteilung ist eine spätere Verfeinerung.
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)',
};

function eur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v);
}
function datumDe(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Beleg = {
  id: string;
  art: string | null;
  richtung: string | null;
  datum: string | null;
  haendler: string | null;
  beschreibung: string | null;
  kategorie: string | null;
  betrag_brutto: number | null;
  betrag_netto: number | null;
  absetzbar_prozent: number | null;
  abschreibung: string | null;
  afa_jahre: number | null;
  bild_pfad: string | null;
  bestaetigt: boolean | null;
  created_at: string | null;
};

export default async function BelegePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; jahr?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  const sp = await searchParams;
  const ansicht: 'geschaeftlich' | 'privat' = sp?.ansicht === 'privat' ? 'privat' : 'geschaeftlich';
  const jahr = /^\d{4}$/.test(sp?.jahr || '') ? (sp!.jahr as string) : String(new Date().getFullYear());

  const db = createAdminClient();

  // ── Belege dieser Ansicht laden ─────────────────────────────────────────
  const { data: rows } = await db
    .from('belege')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('art', ansicht)
    .order('datum', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  const belege = (rows as Beleg[]) || [];

  // ── Signierte Vorschau-URLs für die Bilder (privater Bucket) ─────────────
  const pfade = belege.map((b) => b.bild_pfad).filter((p): p is string => !!p);
  const urlFuer: Record<string, string> = {};
  if (pfade.length) {
    const { data: signed } = await db.storage.from('belege').createSignedUrls(pfade, 3600);
    (signed || []).forEach((s) => { if (s.path && s.signedUrl) urlFuer[s.path] = s.signedUrl; });
  }

  // ── EÜR-Überblick fürs gewählte Jahr (aus den Zeilen) ───────────────────
  const imJahr = belege.filter((b) => (b.datum || b.created_at || '').slice(0, 4) === jahr);
  const zahl = (v: number | null) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let einnahmen = 0, ausgabenGesamt = 0, ausgabenAbsetzbar = 0, offen = 0;
  for (const b of imJahr) {
    const netto = zahl(b.betrag_netto) || zahl(b.betrag_brutto);
    const brutto = zahl(b.betrag_brutto) || netto;
    if (!b.bestaetigt) offen++;
    if (b.richtung === 'einnahme') {
      einnahmen += brutto;
    } else {
      ausgabenGesamt += brutto;
      ausgabenAbsetzbar += netto * (zahl(b.absetzbar_prozent) / 100);
    }
  }
  const ergebnis = einnahmen - ausgabenAbsetzbar;

  const jahrNum = Number(jahr);
  const linkMit = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ansicht, jahr, ...over });
    return `/admin/command-center/belege?${p.toString()}`;
  };

  const kpis: Array<{ label: string; wert: string; akzent: string }> = [
    { label: `Einnahmen ${jahr}`, wert: eur(einnahmen), akzent: C.green },
    { label: `Absetzbare Ausgaben ${jahr}`, wert: eur(ausgabenAbsetzbar), akzent: C.cyan },
    { label: `Ergebnis ${jahr} (EÜR)`, wert: eur(ergebnis), akzent: ergebnis >= 0 ? C.gold : '#e06666' },
    { label: 'Belege / offen', wert: `${imJahr.length} / ${offen}`, akzent: C.gold },
  ];

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <Dreizack />
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Belege &amp; EÜR
          </h1>
          <Link href="/admin/command-center" style={{ marginLeft: 'auto', color: C.dim, textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Zurück zum Command Center
          </Link>
        </div>
        <p style={{ color: C.dim, margin: '0 0 1.5rem', fontSize: '0.92rem' }}>
          Deine Belege im Überblick. KI-Vorschläge sind unbestätigt, bis du sie freigibst — Bestätigen und Hochladen folgen im nächsten Schritt.
        </p>

        {/* Umschalter Geschäftlich/Privat + Jahr */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {(['geschaeftlich', 'privat'] as const).map((a) => (
              <Link
                key={a}
                href={linkMit({ ansicht: a })}
                style={{
                  padding: '0.5rem 1.1rem', fontSize: '0.9rem', textDecoration: 'none',
                  color: ansicht === a ? C.navy : C.text,
                  background: ansicht === a ? C.gold : 'transparent',
                  fontWeight: ansicht === a ? 700 : 500,
                }}
              >
                {a === 'geschaeftlich' ? 'Geschäftlich' : 'Privat'}
              </Link>
            ))}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <Link href={linkMit({ jahr: String(jahrNum - 1) })} style={{ color: C.dim, textDecoration: 'none', fontSize: '1.1rem', padding: '0 0.4rem' }}>‹</Link>
            <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, minWidth: 56, textAlign: 'center' }}>{jahr}</span>
            <Link href={linkMit({ jahr: String(jahrNum + 1) })} style={{ color: C.dim, textDecoration: 'none', fontSize: '1.1rem', padding: '0 0.4rem' }}>›</Link>
          </div>
        </div>

        {/* EÜR-Kennzahlen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.1rem 1.2rem' }}>
              <div style={{ color: C.dim, fontSize: '0.82rem', marginBottom: '0.4rem' }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.3rem, 2.4vw, 1.7rem)', fontWeight: 700, color: k.akzent }}>{k.wert}</div>
            </div>
          ))}
        </div>

        {/* Belege-Liste */}
        <h2 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>
          Belege ({belege.length})
        </h2>
        {belege.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '2rem', textAlign: 'center', color: C.dim }}>
            Noch keine Belege in dieser Ansicht. Sobald der Upload steht, erscheinen sie hier mit KI-Vorschlag.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {belege.map((b) => {
              const bild = b.bild_pfad ? urlFuer[b.bild_pfad] : undefined;
              const betrag = Number.isFinite(Number(b.betrag_brutto)) ? eur(Number(b.betrag_brutto)) : '—';
              const istEinnahme = b.richtung === 'einnahme';
              return (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1rem' }}>
                  {/* Vorschau */}
                  <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {bild
                      ? <img src={bild} alt="Beleg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: C.dim, fontSize: '1.4rem' }}>🧾</span>}
                  </div>
                  {/* Mitte */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{b.haendler || 'Ohne Händler'}</span>
                      {b.kategorie && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>{b.kategorie}</span>}
                      {!b.bestaetigt && <span style={{ fontSize: '0.72rem', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>KI-Vorschlag</span>}
                    </div>
                    <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      {datumDe(b.datum)} · {istEinnahme ? 'Einnahme' : 'Ausgabe'}
                      {!istEinnahme && ` · ${Number(b.absetzbar_prozent) || 0}% absetzbar`}
                      {b.abschreibung === 'afa' && b.afa_jahre ? ` · AfA ${b.afa_jahre} J.` : b.abschreibung === 'afa' ? ' · AfA' : ''}
                    </div>
                  </div>
                  {/* Rechts */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem', color: istEinnahme ? C.green : C.text }}>
                      {istEinnahme ? '+' : '−'}{betrag.replace('-', '')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: b.bestaetigt ? C.green : C.dim, marginTop: '0.2rem' }}>
                      {b.bestaetigt ? '✓ bestätigt' : 'offen'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color: C.dim, fontSize: '0.78rem', marginTop: '2rem' }}>
          Hinweis: Vorschläge der KI sind keine Steuerberatung. Zahlen prüfst du und bestätigst sie selbst; Grenzfälle klärt der Steuerberater.
        </p>
      </div>
    </main>
  );
}
