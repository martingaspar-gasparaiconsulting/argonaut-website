import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Dreizack from '@/components/Dreizack';
import LogoutButton from '../LogoutButton';
import { BESTELLSTRECKE_LIVE } from '@/lib/flags';
import BestellstreckeFreischalten from './BestellstreckeFreischalten';
import CtaModusSchalter from './CtaModusSchalter';

// ============================================================================
// ARGONAUT OS · app/admin/command-center/page.tsx — Betreiber-Cockpit
// Nur für Martin (zusätzlich zum Admin-Rollen-Schloss hart auf ANALYSE_BETREIBER_ID).
// Block A: Umschalter [Geschäftlich · Privat] + volles Kachel-Raster + echte
// Kennzahlen. Weitere Bereiche (Belege/EÜR, Verträge/Kosten, E-Mail, Banking …)
// füllen wir Block für Block. Sauberer Marken-Look (Navy/Gold, Syne+DM Sans, clamp).
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

type Kpi = { label: string; wert: string; sub: string; akzent: string };
type Sektion = { titel: string; sub: string; href?: string; bald?: boolean };

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  const sp = await searchParams;
  const ansicht: 'geschaeftlich' | 'privat' = sp?.ansicht === 'privat' ? 'privat' : 'geschaeftlich';

  // ── Kennzahlen (echte Daten, defensiv) ──────────────────────────────────
  const now = new Date();
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const vor7Tagen = new Date(now.getTime() - 7 * 86400000).toISOString();

  const { data: rawCustomers } = await supabase.from('customers').select('paket, status');
  const customers = (rawCustomers as Array<{ paket?: string; status?: string }>) || [];
  const aktiveKunden = customers.filter((c) => c.status === 'active' || c.status === 'aktiv').length;
  const mrr = customers
    .filter((c) => (c.status === 'active' || c.status === 'aktiv') && c.paket && c.paket in MRR_BY_PLAN)
    .reduce((s, c) => s + MRR_BY_PLAN[c.paket as string], 0);

  const db = admin();
  let besucher7 = 0, anfragenMonat = 0, kiKostenUsd = 0;
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

  // CTA-Modus (Control-Room-Umschalter): 'termin' (Standard) oder 'bestellen'.
  let ctaModus: 'termin' | 'bestellen' = 'termin';
  try {
    const { data: f } = await db.from('betreiber_flags').select('wert').eq('schluessel', 'cta_modus').maybeSingle();
    if ((f as { wert?: string } | null)?.wert === 'bestellen') ctaModus = 'bestellen';
  } catch { /* still */ }

  const kpisGesch: Kpi[] = [
    { label: 'MRR / Monat', wert: eur(mrr), sub: 'wiederkehrend, aktive Kunden', akzent: C.gold },
    { label: 'Aktive Kunden', wert: String(aktiveKunden), sub: `${customers.length} gesamt`, akzent: C.cyan },
    { label: 'Letzte SEPA-Zahlung', wert: '—', sub: 'Einzug · folgt (Block C)', akzent: C.dim },
    { label: 'Website-Besucher', wert: String(besucher7), sub: 'letzte 7 Tage · argonaut-os.com', akzent: C.cyan },
    { label: 'Anfragen / Termine', wert: String(anfragenMonat), sub: 'diesen Monat', akzent: C.green },
    { label: 'KI-Kosten', wert: `≈ ${kiKostenEur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, sub: 'diesen Monat · Anthropic-Token', akzent: C.gold },
  ];
  const kpisPrivat: Kpi[] = [
    { label: 'Offene private Rechnungen', wert: '—', sub: 'folgt mit Beleg-Erfassung', akzent: C.dim },
    { label: 'Lebenshaltung / Monat', wert: '—', sub: 'folgt · du pflegst es selbst', akzent: C.dim },
    { label: 'Verfügbar', wert: '—', sub: 'Entnahme diesen Monat', akzent: C.dim },
  ];

  const sektionenGesch: Sektion[] = [
    { titel: 'Website-Analyse', sub: 'Besucher · Klicks · Kanäle · Termine', href: '/dashboard/analyse' },
    { titel: 'Kunden & Module', sub: 'Tenants, Onboarding, Freischaltung', href: '/admin/tenants' },
    { titel: 'Website-Anfragen', sub: 'Eingehende Anfragen & Leads', href: '/admin/anfragen' },
    { titel: 'Rechnungen & SEPA-Einzug', sub: 'Abo-Lastschrift & Zahlungen', href: '/admin/abo-einzug' },
    { titel: 'KI-Verbrauch & Kosten', sub: 'Marge- & Ressourcen-Kontrolle', href: '/admin/verbrauch' },
    { titel: 'Branchen', sub: 'Branchen-Katalog & Module', href: '/admin/branchen' },
    { titel: 'Branchen-Dossiers', sub: 'PDFs vorab erzeugen · Interessenten', href: '/admin/dossiers' },
    { titel: 'Inhalts-Werkstatt', sub: 'Handbuch-Kapitel erzeugen · lesen · freigeben', href: '/admin/inhalte' },
    { titel: 'Belege & EÜR', sub: 'Beleg-Foto → KI sortiert & bucht', href: '/admin/command-center/belege' },
    { titel: 'Verträge & laufende Kosten', sub: 'System-Verträge, Anthropic, Break-even', href: '/admin/command-center/vertraege' },
    { titel: 'Marketing', sub: 'Kampagnen, Newsletter, Reichweite', href: '/dashboard/marketing' },
    { titel: 'Vertrieb & Pipeline', sub: 'Deals & nächste Schritte', href: '/admin/command-center/vertrieb' },
    { titel: 'E-Mail', sub: 'Schreiben & Verlauf', href: '/dashboard/korrespondenz' },
    { titel: 'Banking', sub: 'Konten & Bewegungen', href: '/dashboard/banking' },
    { titel: 'Systeme / Infrastruktur', sub: 'Vercel, Supabase, DATEV, Google', href: '/admin/command-center/systeme' },
    { titel: 'Schnittstellen-Zentrale', sub: 'Alle APIs · Plattform + Kunden-Dienste', href: '/admin/command-center/schnittstellen' },
    { titel: 'Imperium', sub: 'Zukunftsperspektive', bald: true },
  ];
  const sektionenPrivat: Sektion[] = [
    { titel: 'Belege & EÜR — privat', sub: 'Beleg-Foto → KI erkennt „privat"', bald: true },
    { titel: 'Offene private Rechnungen', sub: 'Bezeichnung, Betrag, fällig, bezahlt', bald: true },
    { titel: 'Lebenshaltung & Entnahme', sub: 'Dein persönlicher Überblick', bald: true },
  ];

  const kpis = ansicht === 'privat' ? kpisPrivat : kpisGesch;
  const sektionen = ansicht === 'privat' ? sektionenPrivat : sektionenGesch;

  const tab = (key: 'geschaeftlich' | 'privat', label: string) => {
    const aktiv = ansicht === key;
    return (
      <Link href={key === 'privat' ? '?ansicht=privat' : '/admin/command-center'} style={{
        padding: '9px 18px', borderRadius: 999, fontSize: 'clamp(13px,1.1vw,15px)', fontWeight: 700, textDecoration: 'none',
        color: aktiv ? C.navy : C.text, background: aktiv ? C.gold : 'transparent', border: `1px solid ${aktiv ? C.gold : C.border}`,
      }}>{label}</Link>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
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
        {!BESTELLSTRECKE_LIVE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 12, padding: '12px 16px', marginBottom: 'clamp(16px,2vw,22px)' }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <span style={{ fontSize: 'clamp(12px,1vw,14px)', color: C.text }}>
              <b>Bestellstrecke steht bereit — aber noch nicht scharf.</b>{' '}
              <span style={{ color: C.dim }}>Freischalten, wenn du bereit bist (Ziel: erste Kunden / schuldenfrei). Checkliste weiter unten.</span>
            </span>
          </div>
        )}
        <div style={{ marginBottom: 'clamp(16px,2vw,22px)' }}>
          <p style={{ fontSize: 'clamp(11px,1vw,13px)', color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px', fontWeight: 600 }}>Sofort-Überblick</p>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 900, fontSize: 'clamp(28px,4vw,48px)', margin: 0 }}>Command Center</h1>
        </div>

        {/* Umschalter Geschäftlich · Privat */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 'clamp(20px,3vw,30px)' }}>
          {tab('geschaeftlich', 'Geschäftlich')}
          {tab('privat', 'Privat')}
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

        {/* Control-Room-Umschalter: öffentliche Knöpfe Termin ↔ Bestellen */}
        <CtaModusSchalter initial={ctaModus} />

        {/* Bestellstrecke — Freischalt-Kachel (nur solange dunkel) */}
        {!BESTELLSTRECKE_LIVE && <BestellstreckeFreischalten />}

        {/* Bereiche */}
        <p style={{ fontSize: 'clamp(11px,1vw,13px)', color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 16px', fontWeight: 600 }}>
          {ansicht === 'privat' ? 'Privat — nur für dich' : 'Bereiche'}
        </p>
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
          Dein Cockpit · nur für dich sichtbar. „BALD" heißt: Struktur steht, Inhalt füllen wir Block für Block.
        </p>
      </main>
    </div>
  );
}
