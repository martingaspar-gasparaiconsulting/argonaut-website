'use client';
import { useEffect, useState } from 'react';

// ============================================================================
// ARGONAUT OS · app/admin/tenants/page.tsx  (P50 -> Command-Center-Bereich)
//
// OPERATOR-Sicht: alle Kunden-Tenants + gebuchte Module.
// Liegt unter /admin -> automatisch hinter dem serverseitigen Admin-Schloss
// (app/admin/layout.tsx, role='admin', force-dynamic). Kein eigener Schutz
// noetig. Daten kommen aus /api/admin/tenants (dort sitzt der adminGuard).
// Tron-Look passend zum Command-Center.
// ============================================================================

const CYAN = '#00e5ff';
const GOLD = '#C9A84C';

type Tenant = {
  id: string;
  email: string;
  firma: string;
  plan: string;
  status: string;
  onboarding: boolean;
  moduleGebucht: number;
  moduleAktiv: number;
  failOpen: boolean;
};

export default function AdminTenants() {
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/tenants', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!aktiv) return;
        if (!res.ok || !json.ok) {
          setFehler(json.error || 'Fehler beim Laden.');
        } else {
          setTenants((json.tenants as Tenant[]) || []);
        }
      } catch {
        if (aktiv) setFehler('Netzwerkfehler.');
      } finally {
        if (aktiv) setLadend(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const mono = "'Share Tech Mono', 'DM Mono', ui-monospace, monospace";

  const badge = (text: string, farbe: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: farbe,
    background: `${farbe}18`,
    border: `1px solid ${farbe}55`,
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
  });

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: `${CYAN}aa`,
    borderBottom: `1px solid ${CYAN}33`,
    whiteSpace: 'nowrap',
    fontFamily: mono,
  };
  const td: React.CSSProperties = {
    padding: '14px 16px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.9)',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    verticalAlign: 'middle',
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% -10%, #0d1f33 0%, #050810 60%)',
        color: '#fff',
        fontFamily: 'DM Sans, sans-serif',
        padding: '32px 28px',
      }}
    >
      {/* Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: `${CYAN}aa`, fontFamily: mono }}>
            ARGONAUT · OPERATOR
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 0', letterSpacing: '0.05em', color: CYAN, fontFamily: mono }}>
            TENANTS &amp; MODULE
          </h1>
        </div>
        <a
          href="/admin/command-center"
          style={{
            fontFamily: mono,
            fontSize: 12,
            letterSpacing: '0.1em',
            color: GOLD,
            border: `1px solid ${GOLD}66`,
            borderRadius: 6,
            padding: '8px 16px',
            textDecoration: 'none',
            background: `${GOLD}12`,
          }}
        >
          ‹ COMMAND CENTER
        </a>
      </div>

      {ladend && (
        <div style={{ fontFamily: mono, color: `${CYAN}cc` }}>‣ Lade Tenant-Matrix …</div>
      )}

      {!ladend && fehler && (
        <div style={{ border: '1px solid rgba(255,90,90,0.5)', background: 'rgba(255,90,90,0.08)', borderRadius: 10, padding: 20, fontFamily: mono, color: '#ff8a8a' }}>
          FEHLER: {fehler}
        </div>
      )}

      {!ladend && !fehler && (
        <div
          style={{
            border: `1px solid ${CYAN}33`,
            borderRadius: 12,
            background: 'rgba(5,12,22,0.6)',
            boxShadow: `0 0 40px ${CYAN}12`,
            overflow: 'hidden',
          }}
        >
          {/* Zähler-Leiste */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '18px 20px', borderBottom: `1px solid ${CYAN}22` }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: CYAN, fontFamily: mono, lineHeight: 1 }}>
              {String(tenants.length).padStart(2, '0')}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, letterSpacing: '0.1em', fontFamily: mono }}>
              {tenants.length === 1 ? 'AKTIVER TENANT' : 'AKTIVE TENANTS'}
            </span>
          </div>

          {tenants.length === 0 ? (
            <div style={{ padding: 24, color: 'rgba(255,255,255,0.55)', fontFamily: mono }}>
              ‣ Noch keine Tenants erfasst.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={th}>Firma</th>
                    <th style={th}>E-Mail</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Status</th>
                    <th style={th}>Onboarding</th>
                    <th style={th}>Module</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td style={{ ...td, fontWeight: 700, color: GOLD }}>{t.firma}</td>
                      <td style={{ ...td, color: 'rgba(255,255,255,0.65)', fontFamily: mono, fontSize: 13 }}>{t.email}</td>
                      <td style={td}><span style={badge(t.plan, GOLD)}>{t.plan}</span></td>
                      <td style={td}>
                        <span style={badge(t.status, t.status === 'active' ? '#3ddc84' : 'rgba(255,255,255,0.6)')}>{t.status}</span>
                      </td>
                      <td style={td}>
                        {t.onboarding
                          ? <span style={badge('fertig', CYAN)}>fertig</span>
                          : <span style={badge('offen', 'rgba(255,255,255,0.55)')}>offen</span>}
                      </td>
                      <td style={td}>
                        {t.failOpen ? (
                          <span style={badge('alle · fail-open', GOLD)} title="Keine tenant_module-Zeile — der Kunde sieht alle Module.">
                            alle · fail-open
                          </span>
                        ) : (
                          <span style={{ fontFamily: mono, fontSize: 13 }}>
                            <span style={{ color: CYAN, fontWeight: 700 }}>{t.moduleAktiv}</span>
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}> aktiv / {t.moduleGebucht} gebucht</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
