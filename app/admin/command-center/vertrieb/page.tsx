import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Dreizack from '@/components/Dreizack';

// ============================================================================
// ARGONAUT OS · Command Center · app/admin/command-center/vertrieb/page.tsx
// Block D1 — Vertrieb & Pipeline: Martins eigene Sicht auf die Website-Leads
// (Tabelle 'website_anfragen'). KPIs + Lead-Liste mit Kontakt + „nächster
// Schritt" (aus Aktualität). Nur Martin (Betreiber). Link ins volle Pipeline-
// Modul (/dashboard/pipeline) und in die Anfragen-Liste bleibt erhalten.
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)',
};

type Lead = Record<string, unknown>;

function feld(a: Lead, ...keys: string[]): string {
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}
function datumWert(a: Lead): number {
  const s = feld(a, 'created_at', 'eingegangen_am', 'erstellt_am');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function datumDe(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function VertriebPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  const db = createAdminClient();
  let leads: Lead[] = [];
  try {
    const { data } = await db.from('website_anfragen').select('*').order('created_at', { ascending: false }).limit(300);
    leads = (data as Lead[]) || [];
  } catch { /* still */ }

  const jetzt = Date.now();
  const tag = 86400000;
  const monatStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const neu7 = leads.filter((a) => jetzt - datumWert(a) <= 7 * tag && datumWert(a) > 0).length;
  const diesenMonat = leads.filter((a) => datumWert(a) >= monatStart).length;
  const mitTermin = leads.filter((a) => feld(a, 'wunschtermin') !== '').length;

  const kpis = [
    { label: 'Leads gesamt', wert: String(leads.length), akzent: C.gold, sub: 'alle Website-Anfragen' },
    { label: 'Neu (7 Tage)', wert: String(neu7), akzent: C.cyan, sub: 'frisch reingekommen' },
    { label: 'Diesen Monat', wert: String(diesenMonat), akzent: C.green, sub: 'Anfragen im Monat' },
    { label: 'Mit Wunschtermin', wert: String(mitTermin), akzent: C.gold, sub: 'wollen einen Termin' },
  ];

  function schritt(ms: number, hatTermin: boolean): { text: string; farbe: string } {
    if (hatTermin) return { text: 'Termin bestätigen', farbe: C.green };
    const alter = jetzt - ms;
    if (ms === 0) return { text: 'sichten', farbe: C.dim };
    if (alter <= 2 * tag) return { text: 'jetzt kontaktieren', farbe: C.cyan };
    if (alter <= 14 * tag) return { text: 'nachfassen', farbe: C.gold };
    return { text: 'reaktivieren', farbe: C.dim };
  }

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <Dreizack />
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Vertrieb &amp; Pipeline
          </h1>
          <Link href="/admin/command-center" style={{ marginLeft: 'auto', color: C.dim, textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Zurück zum Command Center
          </Link>
        </div>
        <p style={{ color: C.dim, margin: '0 0 1.5rem', fontSize: '0.92rem' }}>
          Deine eingehenden Website-Leads mit dem nächsten sinnvollen Schritt — von „jetzt kontaktieren" bis „nachfassen".
        </p>

        {/* Kennzahlen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.1rem 1.2rem' }}>
              <div style={{ color: C.dim, fontSize: '0.82rem', marginBottom: '0.4rem' }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.3rem, 2.4vw, 1.7rem)', fontWeight: 700, color: k.akzent }}>{k.wert}</div>
              <div style={{ color: C.dim, fontSize: '0.75rem', marginTop: '0.3rem' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Sprung ins volle Modul */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <Link href="/dashboard/pipeline" style={{ color: C.navy, background: C.gold, borderRadius: 8, padding: '0.45rem 0.9rem', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
            Volles Pipeline-Modul →
          </Link>
          <Link href="/admin/anfragen" style={{ color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.45rem 0.9rem', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
            Anfragen-Tabelle →
          </Link>
        </div>

        {/* Lead-Liste */}
        <h2 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>
          Leads ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '2rem', textAlign: 'center', color: C.dim }}>
            Noch keine Website-Anfragen. Sobald über das Kontakt-/Demo-Formular etwas reinkommt, erscheint es hier.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {leads.map((a, i) => {
              const ms = datumWert(a);
              const email = feld(a, 'email');
              const tel = feld(a, 'telefon', 'phone');
              const firma = feld(a, 'unternehmen', 'firma');
              const branche = feld(a, 'branche');
              const nachricht = feld(a, 'nachricht', 'message');
              const s = schritt(ms, feld(a, 'wunschtermin') !== '');
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'start', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{feld(a, 'name') || 'Ohne Namen'}</span>
                      {firma && <span style={{ color: C.dim, fontSize: '0.85rem' }}>· {firma}</span>}
                      {branche && <span style={{ fontSize: '0.72rem', color: C.gold, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>{branche}</span>}
                    </div>
                    <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.2rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                      <span>{datumDe(ms)}</span>
                      {email && <a href={`mailto:${email}`} style={{ color: C.cyan, textDecoration: 'none' }}>{email}</a>}
                      {tel && <a href={`tel:${tel}`} style={{ color: C.cyan, textDecoration: 'none' }}>{tel}</a>}
                      {feld(a, 'wunschtermin') && <span>Wunsch: {feld(a, 'wunschtermin')}</span>}
                    </div>
                    {nachricht && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', marginTop: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nachricht}</div>}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.farbe, border: `1px solid ${s.farbe}`, borderRadius: 999, padding: '0.2rem 0.6rem' }}>{s.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
