'use client';
import { useCallback, useEffect, useState } from 'react';
import { ALLE_MODULE } from '../../../lib/rechte';
import { KERN_MODULE, BRANCHEN_PAKETE, paketModule } from '../../../lib/pakete';

// ============================================================================
// ARGONAUT OS · app/admin/tenants/page.tsx  (P50 · Modul-Freischalter)
//
// OPERATOR-Sicht: alle Kunden-Tenants + pro Kunde ein aufklappbarer Bereich,
// in dem der Operator jedes Modul AN/AUS schaltet — aus SEINEM Admin-Login.
// Der Kunde muss nie eingeloggt sein.
//
// Liegt unter /admin -> automatisch hinter dem serverseitigen Admin-Schloss
// (app/admin/layout.tsx, role='admin', force-dynamic). Kein eigener Schutz
// noetig. Daten kommen aus /api/admin/tenants (adminGuard). Schalten laeuft
// ueber /api/admin/tenant-module (adminGuard + Upsert auf Unique-Index).
//
// GATE-MECHANIK (lib/tenantModule.ts, gebuchteModulKeys) — wichtig fuers
// Verstaendnis der Schalter:
//   - Solange bei einem Kunden KEIN Modul aktiv ist -> fail-open: er sieht ALLES.
//   - Ab dem ERSTEN aktiven Modul -> strikte Whitelist: er sieht NUR die
//     aktivierten Module.
//   - Alles wieder ausschalten -> zurueck zu fail-open (sieht wieder alles).
// Anschalten baut also die Freigabe-Liste auf, es "versteckt" nicht einzeln.
// Die gelbe Warnung im Panel weist aktiv darauf hin.
//
// Tron-Look passend zum Command-Center.
// ============================================================================

const CYAN = '#00e5ff';
const GOLD = '#C9A84C';
const GRUEN = '#3ddc84';

type Tenant = {
  id: string;
  email: string;
  firma: string;
  plan: string;
  status: string;
  onboarding: boolean;
  moduleGebucht: number;
  moduleAktiv: number;
  aktiveModule: string[];
  failOpen: boolean;
};

export default function AdminTenants() {
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  // Welche einzelnen Schalter gerade speichern? Key = `${tenantId}::${modulKey}`.
  const [speichernd, setSpeichernd] = useState<Set<string>>(new Set());
  const [schaltFehler, setSchaltFehler] = useState<string | null>(null);
  // Welcher Tenant bekommt gerade ein ganzes Paket geschaltet? (= tenant.id)
  const [paketLaeuft, setPaketLaeuft] = useState<string | null>(null);

  const mono = "'Share Tech Mono', 'DM Mono', ui-monospace, monospace";

  // --- Neuer Kunde: einladen & (optional) Branche freischalten (Baustein 2) ---
  const [einlEmail, setEinlEmail] = useState('');
  const [einlFirma, setEinlFirma] = useState('');
  const [einlBranche, setEinlBranche] = useState('');
  const [einlLaeuft, setEinlLaeuft] = useState(false);
  const [einlMeldung, setEinlMeldung] = useState<string | null>(null);
  const [einlFehler, setEinlFehler] = useState<string | null>(null);
  const feldInput: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: `1px solid ${CYAN}33`, borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' };
  const feldLabel: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${CYAN}aa` };

  // --- Laden (mit optionalem Spinner) ---------------------------------------
  const laden = useCallback(async (zeigeSpinner = true) => {
    if (zeigeSpinner) setLadend(true);
    try {
      const res = await fetch('/api/admin/tenants', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setFehler(json.error || 'Fehler beim Laden.');
      } else {
        setFehler(null);
        setTenants((json.tenants as Tenant[]) || []);
      }
    } catch {
      setFehler('Netzwerkfehler.');
    } finally {
      if (zeigeSpinner) setLadend(false);
    }
  }, []);

  useEffect(() => {
    laden(true);
  }, [laden]);

  // --- Ein Modul fuer einen Tenant an/aus schalten --------------------------
  const schalten = useCallback(
    async (tenant: Tenant, modulKey: string, neuerWert: boolean) => {
      const spKey = `${tenant.id}::${modulKey}`;
      setSchaltFehler(null);
      setSpeichernd((s) => new Set(s).add(spKey));
      try {
        const res = await fetch('/api/admin/tenant-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerUserId: tenant.id,
            modulKey,
            aktiv: neuerWert,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          setSchaltFehler(json.error || 'Schalten fehlgeschlagen.');
        } else {
          // Frisch nachladen (still, ohne Voll-Spinner) -> Zaehler + Badges syncen.
          await laden(false);
        }
      } catch {
        setSchaltFehler('Netzwerkfehler beim Schalten.');
      } finally {
        setSpeichernd((s) => {
          const n = new Set(s);
          n.delete(spKey);
          return n;
        });
      }
    },
    [laden],
  );

  // --- Ein ganzes PAKET (mehrere Module) auf einmal AN schalten --------------
  // Reihenfolge: erst alle Module per API scharfschalten, dann EINMAL nachladen.
  // Nutzt denselben Endpunkt wie der Einzelschalter (aktiv: true je Modul).
  const paketAnwenden = useCallback(
    async (tenant: Tenant, modulKeys: string[]) => {
      setSchaltFehler(null);
      setPaketLaeuft(tenant.id);
      try {
        for (const modulKey of modulKeys) {
          const res = await fetch('/api/admin/tenant-module', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerUserId: tenant.id, modulKey, aktiv: true }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.ok) {
            setSchaltFehler(json.error || `Paket-Schalten fehlgeschlagen bei „${modulKey}".`);
            break;
          }
        }
        await laden(false);
      } catch {
        setSchaltFehler('Netzwerkfehler beim Paket-Schalten.');
      } finally {
        setPaketLaeuft(null);
      }
    },
    [laden],
  );

  // --- Kunde einladen (POST /api/admin/kunde-einladen) ----------------------
  const einladen = useCallback(async () => {
    setEinlFehler(null);
    setEinlMeldung(null);
    if (!einlEmail.trim()) { setEinlFehler('Bitte eine E-Mail angeben.'); return; }
    setEinlLaeuft(true);
    try {
      const res = await fetch('/api/admin/kunde-einladen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: einlEmail.trim(), firma: einlFirma.trim(), branchKey: einlBranche }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setEinlFehler(json.error || 'Einladung fehlgeschlagen.');
      } else {
        const bran = json.branche ? ` · Branche „${json.branche}" (${json.freigeschaltet} Module)` : '';
        const mailHinweis = json.mailVersandt
          ? 'Einladungs-Mail verschickt.'
          : `Kunde angelegt, aber Mail-Fehler: ${json.mailFehler || 'unbekannt'}`;
        setEinlMeldung(`✓ ${einlEmail.trim()} eingeladen${bran}. ${mailHinweis}`);
        setEinlEmail(''); setEinlFirma(''); setEinlBranche('');
        await laden(false);
      }
    } catch {
      setEinlFehler('Netzwerkfehler bei der Einladung.');
    } finally {
      setEinlLaeuft(false);
    }
  }, [einlEmail, einlFirma, einlBranche, laden]);

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

      {/* ---- Neuer Kunde: einladen & Branche freischalten (Baustein 2) ---- */}
      <section style={{ border: `1px solid ${GOLD}44`, background: `${GOLD}0c`, borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.14em', color: `${GOLD}dd`, textTransform: 'uppercase', marginBottom: 12 }}>
          ＋ Neuer Kunde — einladen &amp; freischalten
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 230px' }}>
            <label style={feldLabel}>E-Mail *</label>
            <input style={feldInput} type="email" value={einlEmail} onChange={(e) => setEinlEmail(e.target.value)} placeholder="kunde@firma.de" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 190px' }}>
            <label style={feldLabel}>Firma</label>
            <input style={feldInput} value={einlFirma} onChange={(e) => setEinlFirma(e.target.value)} placeholder="Musterbetrieb GmbH" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 210px' }}>
            <label style={feldLabel}>Branche (optional)</label>
            <select style={feldInput} value={einlBranche} onChange={(e) => setEinlBranche(e.target.value)}>
              <option value="">— ohne (Kern später) —</option>
              {BRANCHEN_PAKETE.map((b) => <option key={b.key} value={b.key}>{b.icon} {b.name}</option>)}
            </select>
          </div>
          <button
            onClick={einladen}
            disabled={einlLaeuft}
            style={{
              border: `1px solid ${GRUEN}88`, background: `${GRUEN}18`, color: '#eafff2',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 800,
              padding: '11px 20px', borderRadius: 8,
              cursor: einlLaeuft ? 'wait' : 'pointer', opacity: einlLaeuft ? 0.55 : 1,
            }}
          >
            {einlLaeuft ? '‣ lädt …' : 'Einladen & freischalten'}
          </button>
        </div>
        {einlMeldung && <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, color: GRUEN, lineHeight: 1.5 }}>{einlMeldung}</div>}
        {einlFehler && <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, color: '#ff8a8a' }}>⚠ {einlFehler}</div>}
        <div style={{ marginTop: 12, fontFamily: mono, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>
          ‣ Der Kunde bekommt sofort eine ARGONAUT-Mail und setzt sein Passwort selbst. Branche wählen = Kern + Branchenmodule direkt scharf. Feinheiten danach unten je Kunde.
        </div>
      </section>

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

          {schaltFehler && (
            <div style={{ padding: '12px 20px', background: 'rgba(255,90,90,0.08)', borderBottom: '1px solid rgba(255,90,90,0.3)', fontFamily: mono, color: '#ff8a8a', fontSize: 13 }}>
              ⚠ {schaltFehler}
            </div>
          )}

          {tenants.length === 0 ? (
            <div style={{ padding: 24, color: 'rgba(255,255,255,0.55)', fontFamily: mono }}>
              ‣ Noch keine Tenants erfasst.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={th}></th>
                    <th style={th}>Firma</th>
                    <th style={th}>E-Mail</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Status</th>
                    <th style={th}>Onboarding</th>
                    <th style={th}>Module</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => {
                    const istOffen = offen === t.id;
                    return (
                      <>
                        <tr
                          key={t.id}
                          onClick={() => setOffen(istOffen ? null : t.id)}
                          style={{ cursor: 'pointer', background: istOffen ? `${CYAN}0c` : 'transparent' }}
                        >
                          <td style={{ ...td, width: 40, textAlign: 'center', color: CYAN, fontFamily: mono }}>
                            {istOffen ? '▾' : '▸'}
                          </td>
                          <td style={{ ...td, fontWeight: 700, color: GOLD }}>{t.firma}</td>
                          <td style={{ ...td, color: 'rgba(255,255,255,0.65)', fontFamily: mono, fontSize: 13 }}>{t.email}</td>
                          <td style={td}><span style={badge(t.plan, GOLD)}>{t.plan}</span></td>
                          <td style={td}>
                            <span style={badge(t.status, t.status === 'active' ? GRUEN : 'rgba(255,255,255,0.6)')}>{t.status}</span>
                          </td>
                          <td style={td}>
                            {t.onboarding
                              ? <span style={badge('fertig', CYAN)}>fertig</span>
                              : <span style={badge('offen', 'rgba(255,255,255,0.55)')}>offen</span>}
                          </td>
                          <td style={td}>
                            {t.failOpen ? (
                              <span style={badge('alle · fail-open', GOLD)} title="Kein Modul aktiv geschaltet — der Kunde sieht alle Module.">
                                alle · fail-open
                              </span>
                            ) : (
                              <span style={{ fontFamily: mono, fontSize: 13 }}>
                                <span style={{ color: CYAN, fontWeight: 700 }}>{t.moduleAktiv}</span>
                                <span style={{ color: 'rgba(255,255,255,0.5)' }}> aktiv</span>
                              </span>
                            )}
                          </td>
                        </tr>

                        {istOffen && (
                          <tr key={`${t.id}-panel`}>
                            <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <ModulPanel
                                tenant={t}
                                mono={mono}
                                speichernd={speichernd}
                                onSchalten={schalten}
                                onPaket={paketAnwenden}
                                paketLaeuft={paketLaeuft === t.id}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 18, fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 760, lineHeight: 1.6 }}>
        ‣ Solange bei einem Kunden <b style={{ color: 'rgba(255,255,255,0.7)' }}>kein</b> Modul aktiv ist, sieht er <b style={{ color: GOLD }}>alle</b> Module (fail-open).
        Ab dem <b style={{ color: GRUEN }}>ersten</b> aktivierten Modul sieht er <b style={{ color: CYAN }}>nur noch</b> die aktivierten.
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Aufklapp-Panel: Modul-Raster mit An/Aus-Schaltern + fail-open-Warnung.
// ---------------------------------------------------------------------------
function ModulPanel({
  tenant,
  mono,
  speichernd,
  onSchalten,
  onPaket,
  paketLaeuft,
}: {
  tenant: Tenant;
  mono: string;
  speichernd: Set<string>;
  onSchalten: (tenant: Tenant, modulKey: string, neuerWert: boolean) => void;
  onPaket: (tenant: Tenant, modulKeys: string[]) => void;
  paketLaeuft: boolean;
}) {
  const aktivSet = new Set(tenant.aktiveModule);
  const anzahlAktiv = aktivSet.size;
  const failOpen = anzahlAktiv === 0;

  return (
    <div style={{ padding: '20px 24px 26px', background: 'rgba(5,12,22,0.5)' }}>
      {/* Panel-Kopf */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.14em', color: `${CYAN}aa`, textTransform: 'uppercase' }}>
          Module für {tenant.firma}
        </div>
        <div style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          <span style={{ color: CYAN, fontWeight: 700 }}>{anzahlAktiv}</span> von {ALLE_MODULE.length} aktiv
        </div>
      </div>

      {/* fail-open-Warnung */}
      {failOpen && (
        <div
          style={{
            border: `1px solid ${GOLD}66`,
            background: `${GOLD}12`,
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 16,
            fontFamily: mono,
            fontSize: 12.5,
            color: '#f0d488',
            lineHeight: 1.55,
          }}
        >
          ⚠ Dieser Kunde sieht aktuell <b>ALLE</b> Module (nichts scharfgeschaltet).
          Sobald du das <b>erste</b> Modul aktivierst, sieht er <b>nur noch</b> die aktivierten.
        </div>
      )}

      {/* ---- PAKET-LEISTE: ein Klick = Kern + Branche scharfschalten ---- */}
      <div
        style={{
          border: `1px solid ${GOLD}44`,
          background: `${GOLD}0c`,
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.14em', color: `${GOLD}dd`, textTransform: 'uppercase' }}>
            ⚡ Pakete — 1 Klick
          </div>
          {paketLaeuft && <span style={{ fontFamily: mono, fontSize: 12, color: CYAN }}>‣ schalte Paket …</span>}
        </div>

        {/* Kern-Knopf */}
        <button
          onClick={() => onPaket(tenant, KERN_MODULE)}
          disabled={paketLaeuft}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 8, marginBottom: 12,
            border: `1px solid ${GRUEN}88`, background: `${GRUEN}18`, color: '#eafff2',
            fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 800,
            cursor: paketLaeuft ? 'wait' : 'pointer', opacity: paketLaeuft ? 0.55 : 1,
          }}
        >
          🧩 Kern setzen <span style={{ fontFamily: mono, fontSize: 11, opacity: 0.8 }}>(12 Bausteine)</span>
        </button>

        {/* Branchen-Pakete (Kern + Branche) */}
        <div style={{ fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '4px 0 8px', letterSpacing: '0.1em' }}>
          BRANCHE (= KERN + BRANCHEN-MODULE):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {BRANCHEN_PAKETE.map((b) => (
            <button
              key={b.key}
              onClick={() => onPaket(tenant, paketModule(b.key))}
              disabled={paketLaeuft}
              title={`Kern + ${b.module.length} Branchenmodule`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 13px', borderRadius: 999,
                border: `1px solid ${CYAN}55`, background: `${CYAN}10`, color: 'rgba(255,255,255,0.92)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700,
                cursor: paketLaeuft ? 'wait' : 'pointer', opacity: paketLaeuft ? 0.55 : 1,
              }}
            >
              <span>{b.icon}</span>{b.name}
            </button>
          ))}
        </div>

        <div style={{ fontFamily: mono, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 12, lineHeight: 1.55 }}>
          ‣ Paket wählen → Kern + Branche werden scharfgeschaltet. Extras danach unten
          einzeln zuklicken (z. B. KFZ + „Kasse" + „Lager-Scanner"). Paket-Klicks
          schalten nur AN — Ausschalten läuft weiter über die Einzel-Schalter.
        </div>
      </div>

      {/* Modul-Raster (Einzel-Schalter / à la carte) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 8,
        }}
      >
        {ALLE_MODULE.map((m) => {
          const an = aktivSet.has(m.key);
          const spKey = `${tenant.id}::${m.key}`;
          const laeuft = speichernd.has(spKey);
          return (
            <button
              key={m.key}
              onClick={() => onSchalten(tenant, m.key, !an)}
              disabled={laeuft}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${an ? `${CYAN}88` : 'rgba(255,255,255,0.12)'}`,
                background: an ? `${CYAN}18` : 'rgba(255,255,255,0.03)',
                color: an ? '#fff' : 'rgba(255,255,255,0.7)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13.5,
                fontWeight: an ? 700 : 500,
                cursor: laeuft ? 'wait' : 'pointer',
                opacity: laeuft ? 0.55 : 1,
                textAlign: 'left',
                transition: 'all 0.12s',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.label}
              </span>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '2px 7px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  color: an ? '#052' : 'rgba(255,255,255,0.5)',
                  background: an ? GRUEN : 'rgba(255,255,255,0.08)',
                }}
              >
                {laeuft ? '…' : an ? 'AN' : 'AUS'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
