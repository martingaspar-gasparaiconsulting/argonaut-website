import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Dreizack from '@/components/Dreizack';

// ============================================================================
// ARGONAUT OS · Command Center · app/admin/command-center/vertraege/page.tsx
// Block C2 — Verträge & laufende Kosten. Liste der wiederkehrenden Ausgaben
// (Tabelle 'vertraege') + echte KI-Kosten des Monats (aus 'ki_nutzung') +
// Break-even (MRR gegen monatliche Gesamtkosten). Nur Martin (Betreiber).
// Read-only; Hinzufügen/Bearbeiten folgt in C3. USt-befreit → netto = brutto.
// Voll-EÜR-Verschmelzung (Verträge in den Belege-EÜR) ist spätere Verfeinerung.
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)',
};

const MRR_BY_PLAN: Record<string, number> = { SOLO: 1799, START: 3000, PRO: 4000, BUS: 6000, ENT: 9000, BASIS: 1500, STARTER: 1799 };

function eur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v);
}
function datumDe(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Vertrag = {
  id: string;
  anbieter: string | null;
  bezeichnung: string | null;
  kategorie: string | null;
  art: string | null;
  betrag: number | null;
  intervall: string | null;
  absetzbar_prozent: number | null;
  start_datum: string | null;
  ende_datum: string | null;
  aktiv: boolean | null;
  notiz: string | null;
};

function proMonat(v: Vertrag): number {
  const b = Number(v.betrag);
  if (!Number.isFinite(b)) return 0;
  return v.intervall === 'jahr' ? b / 12 : b;
}

export default async function VertraegePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  const sp = await searchParams;
  const ansicht: 'geschaeftlich' | 'privat' = sp?.ansicht === 'privat' ? 'privat' : 'geschaeftlich';

  const db = createAdminClient();

  // ── Verträge dieser Ansicht ─────────────────────────────────────────────
  const { data: rows } = await db
    .from('vertraege')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('art', ansicht)
    .order('aktiv', { ascending: false })
    .order('anbieter', { ascending: true });
  const vertraege = (rows as Vertrag[]) || [];
  const aktive = vertraege.filter((v) => v.aktiv !== false);
  const fixMonat = aktive.reduce((s, v) => s + proMonat(v), 0);
  const fixAbsetzbar = aktive.reduce((s, v) => s + proMonat(v) * (Number(v.absetzbar_prozent) || 0) / 100, 0);

  // ── Geschäftlich: KI-Kosten (Monat) + MRR + Break-even ──────────────────
  let kiMonatEur = 0, mrr = 0;
  if (ansicht === 'geschaeftlich') {
    const now = new Date();
    const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    try {
      const { data: ki } = await db.from('ki_nutzung').select('kosten_usd').gte('created_at', monatStart);
      const usd = ((ki as Array<{ kosten_usd?: number }>) || []).reduce((s, r) => s + (Number(r.kosten_usd) || 0), 0);
      kiMonatEur = usd * 0.92;
    } catch { /* still */ }
    try {
      const { data: rawCustomers } = await supabase.from('customers').select('paket, status');
      const customers = (rawCustomers as Array<{ paket?: string; status?: string }>) || [];
      mrr = customers
        .filter((c) => (c.status === 'active' || c.status === 'aktiv') && c.paket && c.paket in MRR_BY_PLAN)
        .reduce((s, c) => s + MRR_BY_PLAN[c.paket as string], 0);
    } catch { /* still */ }
  }
  const gesamtMonat = fixMonat + kiMonatEur;
  const deckung = mrr - gesamtMonat;

  const linkMit = (a: 'geschaeftlich' | 'privat') => `/admin/command-center/vertraege?ansicht=${a}`;

  const kpis: Array<{ label: string; wert: string; akzent: string; sub?: string }> =
    ansicht === 'geschaeftlich'
      ? [
          { label: 'Fixkosten / Monat', wert: eur(fixMonat), akzent: C.cyan, sub: `${aktive.length} aktive Verträge` },
          { label: 'KI-Kosten / Monat', wert: eur(kiMonatEur), akzent: C.gold, sub: 'Anthropic-Token, laufend' },
          { label: 'Kosten gesamt / Monat', wert: eur(gesamtMonat), akzent: C.text, sub: 'Fixkosten + KI' },
          { label: 'MRR / Monat', wert: eur(mrr), akzent: C.green, sub: 'wiederkehrender Umsatz' },
          { label: 'Deckungsbeitrag / Monat', wert: eur(deckung), akzent: deckung >= 0 ? C.gold : '#e06666', sub: deckung >= 0 ? 'über Break-even' : 'unter Break-even' },
        ]
      : [
          { label: 'Fixkosten / Monat (privat)', wert: eur(fixMonat), akzent: C.cyan, sub: `${aktive.length} aktive Verträge` },
          { label: 'Verträge gesamt', wert: String(vertraege.length), akzent: C.gold, sub: `${vertraege.length - aktive.length} inaktiv` },
        ];

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <Dreizack />
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Verträge &amp; laufende Kosten
          </h1>
          <Link href="/admin/command-center" style={{ marginLeft: 'auto', color: C.dim, textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Zurück zum Command Center
          </Link>
        </div>
        <p style={{ color: C.dim, margin: '0 0 1.5rem', fontSize: '0.92rem' }}>
          Deine wiederkehrenden Kosten auf einen Blick — inklusive der echten KI-Kosten und dem Abstand zum Break-even.
        </p>

        {/* Umschalter Geschäftlich/Privat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {(['geschaeftlich', 'privat'] as const).map((a) => (
              <Link key={a} href={linkMit(a)} style={{
                padding: '0.5rem 1.1rem', fontSize: '0.9rem', textDecoration: 'none',
                color: ansicht === a ? C.navy : C.text, background: ansicht === a ? C.gold : 'transparent',
                fontWeight: ansicht === a ? 700 : 500,
              }}>
                {a === 'geschaeftlich' ? 'Geschäftlich' : 'Privat'}
              </Link>
            ))}
          </div>
        </div>

        {/* Kennzahlen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.1rem 1.2rem' }}>
              <div style={{ color: C.dim, fontSize: '0.82rem', marginBottom: '0.4rem' }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.3rem, 2.4vw, 1.7rem)', fontWeight: 700, color: k.akzent }}>{k.wert}</div>
              {k.sub && <div style={{ color: C.dim, fontSize: '0.75rem', marginTop: '0.3rem' }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {ansicht === 'geschaeftlich' && (
          <p style={{ color: C.dim, fontSize: '0.8rem', margin: '-1rem 0 2rem' }}>
            Davon steuerlich absetzbar: {eur(fixAbsetzbar)} / Monat (Fixkosten). Break-even = Umsatz deckt die laufenden Kosten.
          </p>
        )}

        {/* Verträge-Liste */}
        <h2 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>
          Verträge ({vertraege.length})
        </h2>
        {vertraege.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '2rem', textAlign: 'center', color: C.dim }}>
            Noch keine Verträge erfasst. Das Hinzufügen kommt im nächsten Schritt — dann trägst du Vercel, Supabase, Domain &amp; Co. ein.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {vertraege.map((v) => {
              const inaktiv = v.aktiv === false;
              return (
                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1rem', opacity: inaktiv ? 0.55 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{v.anbieter || 'Ohne Anbieter'}</span>
                      {v.bezeichnung && <span style={{ color: C.dim, fontSize: '0.85rem' }}>· {v.bezeichnung}</span>}
                      {v.kategorie && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>{v.kategorie}</span>}
                      {inaktiv && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>inaktiv</span>}
                    </div>
                    <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      {v.intervall === 'jahr' ? 'jährlich' : 'monatlich'} · {Number(v.absetzbar_prozent) || 0}% absetzbar
                      {v.start_datum ? ` · ab ${datumDe(v.start_datum)}` : ''}
                      {v.ende_datum ? ` · bis ${datumDe(v.ende_datum)}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem' }}>
                      {eur(proMonat(v))}<span style={{ color: C.dim, fontSize: '0.75rem', fontWeight: 400 }}> / Mon.</span>
                    </div>
                    {v.intervall === 'jahr' && Number.isFinite(Number(v.betrag)) && (
                      <div style={{ color: C.dim, fontSize: '0.72rem', marginTop: '0.2rem' }}>{eur(Number(v.betrag))} / Jahr</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color: C.dim, fontSize: '0.78rem', marginTop: '2rem' }}>
          Hinweis: Beträge und steuerliche Zuordnung sind deine Angaben; Grenzfälle klärt der Steuerberater.
        </p>
      </div>
    </main>
  );
}
