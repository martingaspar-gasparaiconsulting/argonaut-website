import UpgradePopup from '@/components/UpgradePopup'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import OverusePopup from '@/components/OverusePopup'
import KpiKachel from './KpiKachel'

// ============================================================
// ARGONAUT OS · DASHBOARD-UEBERSICHT = LIVE-COMMAND-CENTER
// Header/Nav/PULS liegen im Layout. Diese Seite zeigt echte
// Live-Zahlen als klickbare Kacheln (Sprung ins jeweilige Modul).
// Alle Abfragen laufen unter RLS -> nur eigene Daten.
// ============================================================

type Plan = 'starter' | 'professional' | 'business' | 'enterprise'
type Status = 'active' | 'inactive' | 'trial'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', professional: 'Professional', business: 'Business', enterprise: 'Enterprise',
  solo: 'SOLO Beta', start: 'START', pro: 'PRO', bus: 'BUSINESS', ent: 'ENTERPRISE',
  basis: 'BASIS', unbekannt: 'Unbekannt',
}
const PLAN_COLORS: Record<string, string> = {
  starter: '#6b7280', professional: '#C9A84C', business: '#4f94e8', enterprise: '#a855f7',
  solo: '#C9A84C', start: '#C9A84C', pro: '#4f94e8', bus: '#4f94e8', ent: '#a855f7',
  basis: '#6b7280', unbekannt: '#6b7280',
}
const KI_CALL_LIMITS: Record<string, number> = {
  solo: 5000, start: 15000, pro: 35000, bus: 75000, ent: 150000,
  starter: 15000, professional: 35000, business: 75000, enterprise: 150000,
}
const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  active:   { label: 'Aktiv',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  inactive: { label: 'Inaktiv',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  trial:    { label: 'Testphase', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
}

// Status-Werte, die als "abgeschlossen/nicht mehr offen" gelten (kleingeschrieben)
const LEAD_ERLEDIGT = ['gewonnen', 'verloren', 'abgelehnt', 'kunde', 'archiviert', 'closed']
const CHANCE_ERLEDIGT = ['gewonnen', 'verloren', 'closed', 'abgeschlossen']
const AUFTRAG_ERLEDIGT = ['abgeschlossen', 'storniert', 'erledigt', 'abgerechnet']
const PROJEKT_ERLEDIGT = ['abgeschlossen', 'archiviert', 'fertig', 'closed']

function geld(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
  } catch { return `${Math.round(v)} €` }
}
function datumKurz(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) } catch { return '—' }
}
function heuteISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  // Profil / Paket / Verbrauch
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, plan, status, automations_count, onboarding_completed, onboarding_data')
    .eq('id', user.id)
    .single()

  const { data: customerData } = await supabase
    .from('customers')
    .select('paket, status')
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: usageData } = await supabase
    .from('usage_tracking')
    .select('ki_calls_used, ki_calls_limit')
    .eq('user_id', user.id)
    .order('periode_start', { ascending: false })
    .limit(1)
    .single()

  // Live-Daten aus allen Modulen (parallel, defensiv)
  const [leadsR, chancenR, auftraegeR, rechnungenR, projekteR, abwR, zeitR, mitarbeiterR] = await Promise.all([
    supabase.from('leads').select('id, status'),
    supabase.from('verkaufschancen').select('id, phase, wert'),
    supabase.from('auftraege').select('id, status'),
    supabase.from('rechnungen').select('id, zahlungsstatus, faelligkeitsdatum, brutto_summe, bezahlter_betrag'),
    supabase.from('projekte').select('id, status, archiviert'),
    supabase.from('hr_abwesenheiten').select('id, mitarbeiter_id, typ, von, bis, status'),
    supabase.from('hr_zeiterfassung').select('id, mitarbeiter_id, datum, kommen_um, gehen_um'),
    supabase.from('mitarbeiter').select('id, vorname, nachname'),
  ])

  const leads = leadsR.data || []
  const chancen = chancenR.data || []
  const auftraege = auftraegeR.data || []
  const rechnungen = rechnungenR.data || []
  const projekte = projekteR.data || []
  const abwesenheiten = abwR.data || []
  const zeiten = zeitR.data || []
  const mitarbeiter = mitarbeiterR.data || []

  const heute = heuteISO()
  const low = (s: string | null | undefined) => (s || '').toLowerCase()

  // Namens-Map fuer Mitarbeiter
  const maName: Record<string, string> = {}
  for (const m of mitarbeiter as any[]) {
    maName[m.id] = [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter'
  }

  // --- KENNZAHLEN ---
  const leadsOffen = leads.filter((l: any) => !LEAD_ERLEDIGT.includes(low(l.status))).length

  const chancenAktiv = chancen.filter((c: any) => !CHANCE_ERLEDIGT.includes(low(c.phase)))
  const chancenSumme = chancenAktiv.reduce((s: number, c: any) => s + (Number(c.wert) || 0), 0)

  const auftraegeOffen = auftraege.filter((a: any) => !AUFTRAG_ERLEDIGT.includes(low(a.status))).length

  const rechnOffenListe = rechnungen.filter((r: any) => ['offen', 'teilbezahlt'].includes(low(r.zahlungsstatus)))
  const rechnOffenSumme = rechnOffenListe.reduce((s: number, r: any) => s + ((Number(r.brutto_summe) || 0) - (Number(r.bezahlter_betrag) || 0)), 0)
  const rechnUeberfaellig = rechnOffenListe.filter((r: any) => r.faelligkeitsdatum && String(r.faelligkeitsdatum).slice(0, 10) < heute)

  const projekteLaufend = projekte.filter((p: any) => !p.archiviert && !PROJEKT_ERLEDIGT.includes(low(p.status))).length

  // Krankmeldungen: Typ enthaelt "krank", Zeitraum umschliesst heute
  const kranke = abwesenheiten.filter((a: any) => {
    const istKrank = low(a.typ).includes('krank')
    const von = a.von ? String(a.von).slice(0, 10) : null
    const bis = a.bis ? String(a.bis).slice(0, 10) : von
    const aktiv = von && bis && von <= heute && heute <= bis
    const nichtAbgelehnt = !['abgelehnt', 'storniert'].includes(low(a.status))
    return istKrank && aktiv && nichtAbgelehnt
  })
  const krankeDetails = kranke.slice(0, 4).map((a: any) => {
    const name = maName[a.mitarbeiter_id] || 'Mitarbeiter'
    const bis = a.bis ? `bis ${datumKurz(a.bis)}` : ''
    return `${name} ${bis}`.trim()
  })

  // Eingestempelt heute (kommen gesetzt, noch nicht gegangen)
  const eingestempelt = zeiten.filter((z: any) =>
    z.datum && String(z.datum).slice(0, 10) === heute && z.kommen_um && !z.gehen_um
  ).length

  // Ableitungen fuer Kopf / Popups
  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Nutzer'
  const rawPaket = customerData?.paket?.toLowerCase() || profile?.plan || 'starter'
  const plan = (rawPaket as Plan)
  const status = ((profile?.status as Status) || 'active')
  const planLabel = PLAN_LABELS[plan] ?? plan
  const planColor = PLAN_COLORS[plan] ?? '#6b7280'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active

  const kiLimit = usageData?.ki_calls_limit ?? KI_CALL_LIMITS[rawPaket] ?? 15000
  const kiUsed = usageData?.ki_calls_used ?? 0
  const kiPct = Math.min(Math.round((kiUsed / kiLimit) * 100), 100)
  const automationsCount = profile?.automations_count ?? 0

  const onboardingCompleted = profile?.onboarding_completed ?? false
  const onboardingData = profile?.onboarding_data ? (typeof profile.onboarding_data === 'string' ? JSON.parse(profile.onboarding_data) : profile.onboarding_data) : null
  const hasApiKeys = onboardingData?.toolEntries?.some((e: { apiKey?: string }) => e.apiKey && e.apiKey.length > 0) ?? false
  const setupFertig = onboardingCompleted && hasApiKeys

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <>
      <UpgradePopup />
      <OverusePopup kiUsed={kiUsed} kiLimit={kiLimit} currentPaket={rawPaket} userEmail={user.email || ''} />
      <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

        {/* Begruessung */}
        <section style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Mitgliederbereich</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Willkommen zurück, {displayName}</h1>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: planColor, background: `${planColor}22`, border: `1px solid ${planColor}55` }}>{planLabel}</span>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}55`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusCfg.color, display: 'inline-block', flexShrink: 0 }} />
              {statusCfg.label}
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0 }}>Ihr Live-Überblick — was in Ihrem Betrieb gerade passiert. Klicken Sie eine Kachel für Details.</p>
        </section>

        {/* Setup-Streifen — nur solange Einrichtung nicht abgeschlossen */}
        {!setupFertig && (
          <section style={{ marginBottom: '28px' }}>
            <a href="/dashboard/start" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)',
                border: '1px solid rgba(201,168,76,0.4)', borderRadius: '14px', padding: '16px 22px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px' }}>⚡</span>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 800, color: '#C9A84C' }}>Einrichtung abschließen</p>
                    <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>Onboarding & Zugangsdaten vervollständigen — dann ist Ihr System startklar.</p>
                  </div>
                </div>
                <div style={{ padding: '8px 20px', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.4)', color: '#C9A84C', borderRadius: '8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>Zur Einrichtung →</div>
              </div>
            </a>
          </section>
        )}

        {/* LIVE-COCKPIT: KPI-Kacheln */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '18px' }}>
            <h2 style={{ fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Live-Cockpit</h2>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Echtzeit-Kennzahlen</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>

            <KpiKachel href="/dashboard/leads" icon="🎯" label="Offene Leads" wert={leadsOffen} sub={`${leads.length} gesamt`} akzent="#00e5ff" />

            <KpiKachel href="/dashboard/crm/pipeline" icon="💼" label="Aktive Verkaufschancen" wert={chancenAktiv.length} sub={chancenSumme > 0 ? `Pipeline: ${geld(chancenSumme)}` : undefined} akzent="#A98CE0" />

            <KpiKachel href="/dashboard/auftraege" icon="📋" label="Offene Aufträge" wert={auftraegeOffen} sub={`${auftraege.length} gesamt`} akzent="#C9A84C" />

            <KpiKachel href="/dashboard/rechnungen" icon="🧾" label="Offene Rechnungen" wert={rechnOffenListe.length} sub={rechnOffenSumme > 0 ? `${geld(rechnOffenSumme)} offen` : 'nichts offen'} akzent="#4CAF7D" />

            <KpiKachel href="/dashboard/rechnungen" icon="⚠️" label="Überfällige Rechnungen" wert={rechnUeberfaellig.length} sub={rechnUeberfaellig.length > 0 ? 'bitte anmahnen' : 'alles im Plan'} akzent="#E0A24C" alarm={rechnUeberfaellig.length > 0} />

            <KpiKachel href="/dashboard/projekte" icon="📁" label="Laufende Projekte" wert={projekteLaufend} sub={`${projekte.length} gesamt`} akzent="#4f94e8" />

            <KpiKachel href="/dashboard/personal" icon="🤒" label="Krankmeldungen" wert={kranke.length} sub={kranke.length === 0 ? 'alle an Bord' : 'aktuell krank'} details={krankeDetails} akzent="#4CAF7D" alarm={kranke.length > 0} />

            <KpiKachel href="/dashboard/zeiterfassung" icon="🕐" label="Jetzt eingestempelt" wert={eingestempelt} sub={eingestempelt === 1 ? 'Person im Dienst' : 'Personen im Dienst'} akzent="#00e5ff" />

            <KpiKachel href="/dashboard/automatisierungen" icon="⚙️" label="Aktive Automatisierungen" wert={automationsCount} sub="Bibliothek öffnen" akzent="#C9A84C" />

            <KpiKachel href="/dashboard/start" icon="⚡" label="KI-Calls diesen Monat" wert={`${kiPct}%`} sub={`${kiUsed.toLocaleString('de-DE')} / ${kiLimit.toLocaleString('de-DE')}`} akzent="#C9A84C" alarm={kiPct >= 100} />

          </div>
        </section>

        {/* Automatisierungs-Banner (CTA) */}
        <section>
          <a href="/dashboard/automatisierungen" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '14px', padding: '20px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '28px' }}>⚡</span>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>Automatisierungs-Bibliothek</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>128 Workflows in 15 Clustern — sehen Sie wie viele Stunden Sie sparen.</p>
                </div>
              </div>
              <div style={{ padding: '8px 20px', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C', borderRadius: '8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>Bibliothek öffnen →</div>
            </div>
          </a>
        </section>

      </main>
    </>
  )
}
