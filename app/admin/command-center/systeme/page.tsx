import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Dreizack from '@/components/Dreizack';

// ============================================================================
// ARGONAUT OS · Command Center · app/admin/command-center/systeme/page.tsx
// „Systeme / Infrastruktur" — Live-Status auf einen Blick: Datenbank-Ping +
// Konfigurations-Check der wichtigsten Dienste (KI, Mail, PDF, Zugänge).
// Nur Martin (Betreiber). Prüft NUR Vorhandensein von Zugängen (nie Werte).
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)', rot: '#e0a066',
};

export default async function SystemePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  // Datenbank-Ping: eine leichte Abfrage. Läuft sie ohne Fehler, steht die DB.
  let dbOk = false;
  try {
    const db = createAdminClient();
    const { error } = await db.from('customers').select('*', { count: 'exact', head: true });
    dbOk = !error;
  } catch { dbOk = false; }

  const da = (v: string | undefined | null) => !!(v && String(v).trim());

  type Check = { label: string; ok: boolean; detail: string };
  const checks: Check[] = [
    { label: 'Datenbank (Supabase)', ok: dbOk, detail: dbOk ? 'Verbindung steht, Abfragen laufen.' : 'Keine Antwort von der Datenbank — bitte prüfen.' },
    { label: 'Supabase-Zugang', ok: da(process.env.NEXT_PUBLIC_SUPABASE_URL) && da(process.env.SUPABASE_SERVICE_ROLE_KEY), detail: 'URL + Service-Role-Schlüssel hinterlegt.' },
    { label: 'KI (Anthropic)', ok: da(process.env.ANTHROPIC_API_KEY), detail: 'API-Schlüssel für alle KI-Funktionen hinterlegt.' },
    { label: 'Mail-Versand (Resend)', ok: da(process.env.RESEND_API_KEY), detail: 'Versand von Anfrage-, Bestell- und Bestätigungs-Mails.' },
    { label: 'PDF-Motor (Gotenberg)', ok: da(process.env.GOTENBERG_URL), detail: 'Erzeugt Rechnungen, Angebote und Dossiers als PDF.' },
    { label: 'Betreiber-Sperre', ok: da(process.env.ANALYSE_BETREIBER_ID), detail: 'Command Center ist hart auf deine User-ID gesperrt.' },
  ];

  const alleOk = checks.every((c) => c.ok);
  const anzahlOk = checks.filter((c) => c.ok).length;

  const links = [
    { name: 'Vercel', sub: 'Deployments & Logs', href: 'https://vercel.com/dashboard' },
    { name: 'Supabase', sub: 'Datenbank & Storage', href: 'https://supabase.com/dashboard' },
    { name: 'Resend', sub: 'Mail-Zustellung', href: 'https://resend.com/overview' },
    { name: 'Anthropic', sub: 'KI-Konsole & Kosten', href: 'https://console.anthropic.com' },
  ];

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <Dreizack />
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Systeme &amp; Infrastruktur
          </h1>
          <Link href="/admin/command-center" style={{ marginLeft: 'auto', color: C.dim, textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Zurück zum Command Center
          </Link>
        </div>

        {/* Gesamt-Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: alleOk ? 'rgba(76,175,125,0.10)' : 'rgba(224,160,102,0.10)', border: `1px solid ${alleOk ? 'rgba(76,175,125,0.4)' : 'rgba(224,160,102,0.4)'}`, borderRadius: 14, padding: '1rem 1.2rem', margin: '1rem 0 2rem' }}>
          <span style={{ fontSize: 24 }}>{alleOk ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem', color: alleOk ? C.green : C.rot }}>
              {alleOk ? 'Alle Systeme laufen' : 'Ein Dienst braucht Aufmerksamkeit'}
            </div>
            <div style={{ color: C.dim, fontSize: '0.85rem', marginTop: 2 }}>{anzahlOk} von {checks.length} Prüfpunkten grün.</div>
          </div>
        </div>

        {/* Prüfpunkte */}
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2.5rem' }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1.1rem' }}>
              <span style={{ fontSize: 20 }}>{c.ok ? '✅' : '⚠️'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.label}</div>
                <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.15rem' }}>{c.detail}</div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.ok ? C.green : C.rot, border: `1px solid ${c.ok ? C.green : C.rot}`, borderRadius: 999, padding: '0.2rem 0.7rem', whiteSpace: 'nowrap' }}>
                {c.ok ? 'OK' : 'PRÜFEN'}
              </span>
            </div>
          ))}
        </div>

        {/* Schnell-Links zu den Konsolen */}
        <h2 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>
          Konsolen & Dashboards
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {links.map((l) => (
            <a key={l.name} href={l.href} target="_blank" rel="noreferrer" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem 1.1rem', textDecoration: 'none', color: C.text }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700 }}>{l.name}</span>
                <span style={{ color: C.gold }}>↗</span>
              </div>
              <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.3rem' }}>{l.sub}</div>
            </a>
          ))}
        </div>

        <p style={{ color: C.dim, fontSize: '0.78rem', marginTop: '2rem' }}>
          Hinweis: Geprüft wird nur, ob ein Zugang hinterlegt ist — nie der Schlüssel selbst. „PRÜFEN" heißt: der Dienst ist gerade nicht erreichbar oder nicht konfiguriert.
        </p>
      </div>
    </main>
  );
}
