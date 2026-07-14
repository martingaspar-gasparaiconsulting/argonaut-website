'use client';
import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · app/dashboard/betreiber/page.tsx  (P50)
//
// OPERATOR-COCKPIT — deine Vogelperspektive ueber alle Kunden-Tenants.
// Holt die Daten ausschliesslich ueber /api/betreiber/uebersicht (dort sitzt
// das Operator-Gate + der Service-Role-Read). Diese Seite selbst kennt keine
// Geheimnisse: bei fehlendem Zugriff kommt sauber "kein Zugriff" zurueck.
//
// Kein Nav-Eintrag (bewusst) — Aufruf ueber die Direkt-URL /dashboard/betreiber.
// ============================================================

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const CYAN = '#00e5ff';

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

export default function BetreiberUebersicht() {
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [keinZugriff, setKeinZugriff] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const res = await fetch('/api/betreiber/uebersicht', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!aktiv) return;
        if (res.status === 403) {
          setKeinZugriff(true);
        } else if (!res.ok || !json.ok) {
          setFehler(json.fehler || 'Fehler beim Laden.');
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

  const karte: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: '14px',
    padding: '22px',
  };

  const badge = (text: string, farbe: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    color: farbe,
    background: `${farbe}1f`,
    border: `1px solid ${farbe}55`,
    whiteSpace: 'nowrap',
  });

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'rgba(201,168,76,0.7)',
    borderBottom: '1px solid rgba(201,168,76,0.2)',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.88)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ minHeight: '100%', color: '#fff' }}>
      {/* Kopf */}
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>
          🛰 Betreiber-Übersicht
        </h1>
        <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
          Alle Kunden-Tenants auf einen Blick — Plan, Status und gebuchte Module.
        </p>
      </div>

      {ladend && (
        <div style={{ ...karte, color: 'rgba(255,255,255,0.7)' }}>Lade Übersicht …</div>
      )}

      {!ladend && keinZugriff && (
        <div style={{ ...karte, borderColor: 'rgba(255,90,90,0.4)' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
            🔒 Kein Zugriff
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
            Diese Seite ist dem Betreiber vorbehalten. Dein Konto steht nicht auf
            der Operator-Liste.
          </div>
        </div>
      )}

      {!ladend && fehler && !keinZugriff && (
        <div style={{ ...karte, borderColor: 'rgba(255,90,90,0.4)' }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>Fehler</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{fehler}</div>
        </div>
      )}

      {!ladend && !fehler && !keinZugriff && (
        <div style={karte}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontSize: '32px', fontWeight: 800, color: GOLD }}>
              {tenants.length}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
              {tenants.length === 1 ? 'Tenant' : 'Tenants'}
            </span>
          </div>

          {tenants.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
              Noch keine Tenants vorhanden.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
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
                      <td style={{ ...td, fontWeight: 700 }}>{t.firma}</td>
                      <td style={{ ...td, color: 'rgba(255,255,255,0.7)' }}>{t.email}</td>
                      <td style={td}>
                        <span style={badge(t.plan, GOLD)}>{t.plan}</span>
                      </td>
                      <td style={td}>
                        <span
                          style={badge(
                            t.status,
                            t.status === 'active' ? '#3ddc84' : 'rgba(255,255,255,0.6)',
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td style={td}>
                        {t.onboarding ? (
                          <span style={badge('fertig', CYAN)}>fertig</span>
                        ) : (
                          <span style={badge('offen', 'rgba(255,255,255,0.55)')}>offen</span>
                        )}
                      </td>
                      <td style={td}>
                        {t.failOpen ? (
                          <span
                            style={badge('alle · fail-open', GOLD)}
                            title="Keine tenant_module-Zeile — der Kunde sieht alle Module."
                          >
                            alle · fail-open
                          </span>
                        ) : (
                          <span style={{ fontSize: '13px' }}>
                            <span style={{ color: CYAN, fontWeight: 700 }}>{t.moduleAktiv}</span>
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                              {' '}aktiv / {t.moduleGebucht} gebucht
                            </span>
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
    </div>
  );
}
