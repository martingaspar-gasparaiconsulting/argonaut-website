import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Dreizack from '@/components/Dreizack';
import LogoutButton from '../LogoutButton';

// ============================================================================
// ARGONAUT OS · app/admin/command-center/page.tsx — NEU (Grundgerüst + KPIs)
// Betreiber-Control-Room, komplett neu im sauberen Marken-Look (Navy/Gold,
// Syne + DM Sans, clamp) — der alte Sci-Fi-iframe-Mockup ist ersetzt.
// NUR FÜR MARTIN: zusätzlich zum Admin-Rollen-Schloss (app/admin/layout.tsx)
// hart auf die Betreiber-User-ID gesperrt (ANALYSE_BETREIBER_ID).
// Schritt 1: Kennzahlen-Leiste (echte Daten) + Sektionskacheln. Weitere
// Sektionen füllen wir Schritt für Schritt.
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
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}
function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
}

export default async function CommandCenter() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  // Nur der Betreiber sieht das Command Center (zusätzlich zum Rollen-Schloss).
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  // ── Kennzahlen (echte Daten, defensiv) ──────────────────────────────────
  const now = new Date();
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const vor7Tagen = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Kunden + MRR (Nutzer-Client, RLS erlaubt Admin)
  const { data: rawCustomers } = await supabase.from('customers').select('paket, status');
  const customers = (rawCustomers as Array<{ paket?: string; status?: string }>) || [];
  const aktiveKunden = customers.filter((c) => c.status === 'active' || c.status === 'aktiv').length;
  const mrr = customers
    .filter((c) => (c.status === 'active' || c.status === 'aktiv') && c.paket && c.paket in MRR_BY_PLAN)
    .reduce((s, c) => s + MRR_BY_PLAN[c.paket as string], 0);

  // Website + KI (Service-Role — direkter RPC ist aus dem Browser gesperrt)
  const db = admin();
  let besucher7 = 0;
  let anfragenMonat = 0;
  let kiKostenUsd = 0;
  try {
    const { data: ov } = await db.rpc('web_stats_uebersicht', { seit: vor7Tagen, p_seite: 'argonaut-os' });
    besucher7 = ((ov as Array<{ besucher?: number }>) || [])[0]?.besucher || 0;
  } catch { /* still */ }
  try {
    const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', monatStart);
    anfragenMonat = count || 0;
  } catch { /* still */ }
  try {
    const { data: ki } = await db.from('ki_nutzung').select('kosten_usd').gte('created_at', monatStart);
    kiKostenUsd = ((ki as Array<{ kosten_usd?: number }>) || []).reduce((s, r) => s + (Number(r.kosten_usd) || 0), 0);
  } catch { /* still */ }
  const kiKostenEur = kiKostenUsd * 0.92;

  const kpis: { label: string; wert: string; sub: string; akzent: string }[] = [
    { label: 'MRR / Monat', wert: eur(mrr), sub: 'wiederkehrend, aktive Kunden', akzent: C.gold },
    { label: 'Aktive Kunden', wert: String(aktiveKunden), sub: `${customers.length} gesamt`, akzent: C.cyan },
    { label: 'Letzte SEPA-Zahlung', wert: '—', sub: 'Einzug · folgt', akzent: C.dim },
    { label: 'Website-Besucher', wert: String(besucher7), sub: 'letzte 7 Tage · argonaut-os.com', akzent: C.cyan },
    { label: 'Anfragen / Termine', wert: String(anfragenMonat), sub: 'diesen Monat', akzent: C.green },
    { label: 'KI-Kosten', wert: `≈ ${kiKostenEur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, sub: 'diesen Monat', akzent: C.gold },
  ];

  const sektionen: { titel: string; sub: string; href?: string; bald?: boolean }[] = [
    { titel: 'Website-Analyse', sub: 'Besucher · Klicks · Kanäle · Termine', href: '/dashboard/analyse' },
    { titel: 'Kunden & Module', sub: 'Tenants, Onboarding, Freischaltung', href: '/admin/tenants' },
    { titel: 'Website-Anfragen', sub: 'Eingehende Anfragen & Leads', href: '/admin/anfragen' },
    { titel: 'KI-Verbrauch & Kosten', sub: 'Marge- & Ressourcen-Kontrolle', href: '/admin/verbrauch' },
    { titel: 'Abo-Einzug', sub: 'SEPA-Lastschrift & Zahlungen', href: '/admin/abo-einzug' },
    { titel: 'Branchen', sub: 'Branchen-Katalog & Module', href: '/admin/branchen' },
    { titel: 'Pipeline', sub: 'Deals & nächste Schritte', bald: true },
    { titel: 'Systeme / Infrastruktur', sub: 'Vercel, Supabase, DATEV, Google', bald: true },
    { titel: 'KI-Telefon', sub: 'Anrufe, Dauer, Ergebnisse', bald: true },
    { titel: 'Imperium', sub: 'Zukunftsperspektive', bald: true },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      {/* Kopf */}
      <header style={{ borderBottom: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.97)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 clamp(16px,3vw,32px)', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Dreizack hoehe={38} />
            <div style={{ lineHeight: 1.05 }}>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 900, letterSpacing: '0.14em', fontSize: 'clamp(15px,1.4vw,19px)' }}>ARGONAUT</div>
              <div style={{ fontSize: 'clamp(10px,0.9vw,12px)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3 }}>
                <span style={{ color: C.dim }}>Betreiber</span><span style={{ color: C.gold }}> · Command Center</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ padding: '3px 10px', background: 'rgba(201,168,76,0.12)', border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 999, fontSize: 10, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Nur du</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,3vw,32px) 80px' }}>
        <div style={{ marginBottom: 'clamp(20px,3vw,34px)' }}>
          <p style={{ fontSize: 'clamp(11px,1vw,13px)', color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px', fontWeight: 600 }}>Sofort-Überblick</p>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 900, fontSize: 'clamp(28px,4vw,48px)', margin: 0 }}>Command Center</h1>
        </div>

        {/* Kennzahlen-Leiste */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(clamp(180px,20vw,240px),1fr))', gap: 'clamp(12px,1.4vw,18px)', marginBottom: 'clamp(28px,4vw,48px)' }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(16px,1.6vw,22px)' }}>
              <div style={{ width: 38, height: 3, borderRadius: 3, background: k.akzent, marginBottom: 14 }} />
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 900, fontSize: 'clamp(24px,2.6vw,38px)', color: k.akzent === C.gold ? C.gold : k.akzent === C.dim ? C.text : k.akzent }}>{k.wert}</div>
              <div style={{ fontSize: 'clamp(13px,1.1vw,16px)', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>{k.label}</div>
              <div style={{ fontSize: 'clamp(11px,0.95vw,13px)', color: C.dim, marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </section>

        {/* Sektionen */}
        <p style={{ fontSize: 'clamp(11px,1vw,13px)', color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 16px', fontWeight: 600 }}>Bereiche</p>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(clamp(240px,26vw,320px),1fr))', gap: 'clamp(12px,1.4vw,18px)' }}>
          {sektionen.map((s) => {
            const inhalt = (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(18px,1.8vw,24px)', height: '100%', opacity: s.bald ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(16px,1.5vw,21px)' }}>{s.titel}</span>
                  {s.bald
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 9px', letterSpacing: '0.08em' }}>BALD</span>
                    : <span style={{ color: C.gold, fontSize: 20, lineHeight: 1 }}>→</span>}
                </div>
                <div style={{ fontSize: 'clamp(12px,1vw,14px)', color: C.dim, marginTop: 8 }}>{s.sub}</div>
              </div>
            );
            return s.href
              ? <Link key={s.titel} href={s.href} style={{ textDecoration: 'none', color: 'inherit' }}>{inhalt}</Link>
              : <div key={s.titel}>{inhalt}</div>;
          })}
        </section>

        <p style={{ marginTop: 'clamp(28px,4vw,44px)', color: C.dim, fontSize: 'clamp(11px,0.95vw,13px)', lineHeight: 1.6 }}>
          Neues Grundgerüst · nur für dich sichtbar. Die einzelnen Bereiche füllen wir Schritt für Schritt mit Live-Inhalten.
        </p>
      </main>
    </div>
  );
}
