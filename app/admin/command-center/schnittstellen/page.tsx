import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import Dreizack from '@/components/Dreizack';
import { KONNEKTOR_KATALOG, KATEGORIEN, bereicheNachKategorie } from '@/lib/konnektoren';

// ============================================================================
// ARGONAUT OS · Command Center · app/admin/command-center/schnittstellen/page.tsx
// „Schnittstellen-Zentrale" (Betreiber-Blick): Plattform-Dienste (ENV-Status,
// die DU zentral setzt) + Überblick über alle Kunden-Dienste aus dem Konnektor-
// Katalog (die jeder Kunde selbst unter 🔌 Schnittstellen verbindet).
// Nur Martin. Prüft NUR Vorhandensein von Zugängen (nie Werte).
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)', rot: '#e0a066',
};

const modusText: Record<string, string> = {
  inline: 'Kunde befüllt direkt', verweis: 'eigenes Modul (wird hereingezogen)', geplant: 'vorgesehen',
};
const modusFarbe: Record<string, string> = { inline: C.green, verweis: C.cyan, geplant: C.dim };

export default async function AdminSchnittstellen() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  const da = (v: string | undefined | null) => !!(v && String(v).trim());

  type Dienst = { label: string; ok: boolean; detail: string; konsole?: string };
  const plattform: Dienst[] = [
    { label: 'KI (Anthropic)', ok: da(process.env.ANTHROPIC_API_KEY), detail: 'Schlüssel für alle KI-Funktionen.', konsole: 'https://console.anthropic.com' },
    { label: 'Mail-Versand (Resend)', ok: da(process.env.RESEND_API_KEY), detail: 'Anfrage-, Bestell- und Bestätigungs-Mails.', konsole: 'https://resend.com/overview' },
    { label: 'PDF-Motor (Gotenberg)', ok: da(process.env.GOTENBERG_URL), detail: 'Rechnungen, Angebote, Dossiers als PDF.' },
    { label: 'Datenbank (Supabase)', ok: da(process.env.NEXT_PUBLIC_SUPABASE_URL) && da(process.env.SUPABASE_SERVICE_ROLE_KEY), detail: 'URL + Service-Role-Schlüssel.', konsole: 'https://supabase.com/dashboard' },
    { label: 'Verschlüsselung (APP_ENC_KEY)', ok: da(process.env.APP_ENC_KEY), detail: 'Nötig, damit Kunden-Zugangsdaten verschlüsselt gespeichert werden.' },
  ];
  const anzahlOk = plattform.filter((d) => d.ok).length;
  const alleOk = anzahlOk === plattform.length;

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <Dreizack />
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Schnittstellen-Zentrale
          </h1>
          <Link href="/admin/command-center" style={{ marginLeft: 'auto', color: C.dim, textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Zurück zum Command Center
          </Link>
        </div>
        <p style={{ color: C.dim, fontSize: '0.9rem', margin: '0 0 1.5rem', maxWidth: 720 }}>
          Zwei Ebenen: <b style={{ color: C.text }}>Plattform-Dienste</b> setzt du zentral (Umgebungsvariablen).
          <b style={{ color: C.text }}> Kunden-Dienste</b> verbindet jeder Betrieb selbst unter 🔌 Schnittstellen.
        </p>

        {/* Plattform-Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: alleOk ? 'rgba(76,175,125,0.10)' : 'rgba(224,160,102,0.10)', border: `1px solid ${alleOk ? 'rgba(76,175,125,0.4)' : 'rgba(224,160,102,0.4)'}`, borderRadius: 14, padding: '1rem 1.2rem', margin: '0 0 1.2rem' }}>
          <span style={{ fontSize: 24 }}>{alleOk ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem', color: alleOk ? C.green : C.rot }}>
              Plattform-Dienste · {anzahlOk} von {plattform.length} gesetzt
            </div>
            <div style={{ color: C.dim, fontSize: '0.85rem', marginTop: 2 }}>Zentral über Umgebungsvariablen (Vercel) gepflegt.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.7rem', marginBottom: '2.5rem' }}>
          {plattform.map((d) => (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.8rem 1.1rem' }}>
              <span style={{ fontSize: 20 }}>{d.ok ? '✅' : '⚠️'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{d.label}</div>
                <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.15rem' }}>{d.detail}</div>
              </div>
              {d.konsole
                ? <a href={d.konsole} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', fontWeight: 700, color: C.gold, textDecoration: 'none', whiteSpace: 'nowrap' }}>Konsole ↗</a>
                : <span style={{ fontSize: '0.75rem', fontWeight: 700, color: d.ok ? C.green : C.rot, border: `1px solid ${d.ok ? C.green : C.rot}`, borderRadius: 999, padding: '0.2rem 0.7rem', whiteSpace: 'nowrap' }}>{d.ok ? 'OK' : 'FEHLT'}</span>}
            </div>
          ))}
        </div>

        {/* Kunden-Dienste (Katalog) */}
        <h2 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.4rem' }}>
          Kunden-Dienste · Katalog
        </h2>
        <p style={{ color: C.dim, fontSize: '0.82rem', margin: '0 0 1.2rem' }}>
          {KONNEKTOR_KATALOG.length} Anbindungen in {KATEGORIEN.length} Kategorien. Jeder Kunde verbindet, was er nutzt — im Demo-Modus läuft alles auch ohne.
        </p>
        {KATEGORIEN.map((kat) => (
          <div key={kat.id} style={{ marginBottom: '1.4rem' }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '0.95rem', color: C.gold, margin: '0 0 0.6rem' }}>{kat.icon} {kat.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.7rem' }}>
              {bereicheNachKategorie(kat.id).map((b) => (
                <div key={b.typ} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{b.icon} {b.name}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: modusFarbe[b.einrichten.modus], border: `1px solid ${modusFarbe[b.einrichten.modus]}`, borderRadius: 999, padding: '0.1rem 0.55rem', whiteSpace: 'nowrap' }}>
                      {modusText[b.einrichten.modus]}
                    </span>
                  </div>
                  <div style={{ color: C.dim, fontSize: '0.76rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                    {b.anbieter.length > 0 ? `Anbieter: ${b.anbieter.map((x) => x.name.replace(/\s*\(.*\)/, '')).join(', ')}` : 'Anbieter folgt.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Link href="/dashboard/schnittstellen" style={{ display: 'inline-block', marginTop: '0.8rem', color: C.cyan, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 700 }}>
          → Kunden-Schnittstellen-Seite ansehen
        </Link>

        <p style={{ color: C.dim, fontSize: '0.78rem', marginTop: '2rem', lineHeight: 1.6 }}>
          Hinweis: Geprüft wird nur, ob ein Plattform-Zugang hinterlegt ist — nie der Schlüssel selbst. Die „eigenes Modul"-Dienste
          werden Schritt für Schritt direkt in die Kunden-Zentrale hereingezogen.
        </p>
      </div>
    </main>
  );
}
