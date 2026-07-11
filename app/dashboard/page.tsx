import UpgradePopup from '@/components/UpgradePopup'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import OverusePopup from '@/components/OverusePopup'
import KpiKachel from './KpiKachel'
import ChefCockpit from './ChefCockpit'

// ============================================================
// ARGONAUT OS · DASHBOARD-UEBERSICHT = LIVE-COMMAND-CENTER
// KPI-Kacheln (Live-Zahlen, klickbar) + Live-Feed "Letzte 24h"
// (chronologischer Ereignis-Stream quer durch alle Module).
// Alle Abfragen laufen unter RLS -> nur eigene Daten.
//
// E1.8 — ROLLEN-WEICHE ganz oben:
//   Ein Mitarbeiter sah bisher das Chef-Cockpit — mit Finanz-Kacheln,
//   überfälligen Rechnungen, Gewinn, 24h-Feed. Die Zahlen waren zwar leer
//   (RLS greift, kein Leck), aber die STRUKTUR gehört einem Angestellten
//   nicht vor Augen, und begrüßt wurde er mit seiner Login-Adresse statt
//   mit seinem Namen.
//   Jetzt: mitarbeiter-Datensatz vorhanden -> schlanke Mitarbeiter-Übersicht
//   (Name, Schnellzugriffe, kein Finanz-Cockpit). Kein Datensatz = Chef ->
//   ALLES unverändert. Dieselbe Weiche wie proxy.ts, DashboardNav, Einstellungen.
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
function ts(v: string | null | undefined): number {
  return v ? new Date(v).getTime() : 0
}
function vorZeit(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const std = Math.floor(min / 60)
  if (std < 24) return `vor ${std} Std`
  return 'gestern'
}
function kurz(s: string | null | undefined, n = 60): string {
  const t = (s || '').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

type FeedEvent = { zeit: number; icon: string; farbe: string; text: string; href: string }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  // --- ROLLEN-WEICHE (E1.8) ---------------------------------------------
  // Kein customers-Zugriff nötig: allein die Existenz eines mitarbeiter-
  // Datensatzes mit auth_user_id = Login entscheidet. Kein Datensatz = Chef.
  const { data: mitarbeiterMe } = await supabase
    .from('mitarbeiter')
    .select('id, vorname, nachname')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (mitarbeiterMe) {
    return <MitarbeiterUebersicht ma={mitarbeiterMe as MitarbeiterZeile} />
  }
  // ---------------------------------------------------------------------
  // Ab hier: CHEF. Alles unverändert.

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

  // Live-Daten aus allen Modulen (parallel, defensiv) — inkl. Feld fuer den Feed
  const [leadsR, chancenR, auftraegeR, rechnungenR, projekteR, abwR, zeitR, mitarbeiterR, kontakteR, aktivR, zahlungenR, ausgabenR] = await Promise.all([
    supabase.from('leads').select('id, status, name, created_at'),
    supabase.from('verkaufschancen').select('id, phase, wert, titel, created_at'),
    supabase.from('auftraege').select('id, status, auftragsnummer, created_at'),
    supabase.from('rechnungen').select('id, zahlungsstatus, faelligkeitsdatum, netto_summe, mwst_summe, brutto_summe, bezahlter_betrag, rechnungsnummer, created_at, bezahlt_am'),
    supabase.from('projekte').select('id, status, archiviert, name, erstellt_am'),
    supabase.from('hr_abwesenheiten').select('id, mitarbeiter_id, typ, von, bis, status, created_at'),
    supabase.from('hr_zeiterfassung').select('id, mitarbeiter_id, datum, kommen_um, gehen_um, created_at'),
    supabase.from('mitarbeiter').select('id, vorname, nachname'),
    supabase.from('kontakte').select('id, vorname, nachname, created_at'),
    supabase.from('kontakt_aktivitaeten').select('id, kontakt_id, typ, inhalt, created_at'),
    supabase.from('zahlungen').select('betrag, zahlungsdatum, rechnung_id'),
    supabase.from('ausgaben').select('betrag_brutto, mwst_satz, ausgabedatum'),
  ])

  const leads = leadsR.data || []
  const chancen = chancenR.data || []
  const auftraege = auftraegeR.data || []
  const rechnungen = rechnungenR.data || []
  const projekte = projekteR.data || []
  const abwesenheiten = abwR.data || []
  const zeiten = zeitR.data || []
  const mitarbeiter = mitarbeiterR.data || []
  const kontakte = kontakteR.data || []
  const aktivitaeten = aktivR.data || []
  const zahlungen = zahlungenR.data || []
  const ausgaben = ausgabenR.data || []

  const heute = heuteISO()
  const low = (s: string | null | undefined) => (s || '').toLowerCase()

  const maName: Record<string, string> = {}
  for (const m of mitarbeiter as any[]) {
    maName[m.id] = [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter'
  }
  const kName: Record<string, string> = {}
  for (const k of kontakte as any[]) {
    kName[k.id] = [k.vorname, k.nachname].filter(Boolean).join(' ') || 'Kontakt'
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
  const eingestempelt = zeiten.filter((z: any) =>
    z.datum && String(z.datum).slice(0, 10) === heute && z.kommen_um && !z.gehen_um
  ).length

  // --- FINANZEN (Block C/D): Einnahmen/Ausgaben/Gewinn netto, laufendes Jahr ---
  const jahrNow = new Date().getFullYear()
  const jahrVon = (d: string | null | undefined) => Number((d || '').slice(0, 4))
  const rMap: Record<string, any> = {}
  for (const r of rechnungen as any[]) rMap[r.id] = r
  let einnahmenNetto = 0
  for (const z of zahlungen as any[]) {
    if (jahrVon(z.zahlungsdatum) !== jahrNow) continue
    const betrag = Number(z.betrag) || 0
    const r = z.rechnung_id ? rMap[z.rechnung_id] : null
    const brutto = r ? (Number(r.brutto_summe) || 0) : 0
    einnahmenNetto += r && brutto > 0 ? betrag * (Number(r.netto_summe) / brutto) : betrag
  }
  let ausgabenNetto = 0
  for (const a of ausgaben as any[]) {
    if (jahrVon(a.ausgabedatum) !== jahrNow) continue
    const brutto = Number(a.betrag_brutto) || 0
    const satz = Number(a.mwst_satz) || 0
    ausgabenNetto += brutto / (1 + satz / 100)
  }
  const gewinn = Math.round(einnahmenNetto - ausgabenNetto)

  // Offene Genehmigungen (Urlaub/Abwesenheit, die auf Freigabe warten)
  const offeneGenehmigungen = abwesenheiten.filter((a: any) => ['beantragt', 'offen'].includes(low(a.status))).length

  // --- HEUTE IM BLICK (Chef-Radar): nur was Aufmerksamkeit braucht ---
  type Radar = { icon: string; text: string; href: string; farbe: string }
  const radar: Radar[] = []
  if (rechnUeberfaellig.length > 0) radar.push({ icon: '⚠️', text: `${rechnUeberfaellig.length} überfällige Rechnung${rechnUeberfaellig.length > 1 ? 'en' : ''}`, href: '/dashboard/mahnwesen', farbe: '#E06666' })
  if (offeneGenehmigungen > 0) radar.push({ icon: '🌴', text: `${offeneGenehmigungen} offene Genehmigung${offeneGenehmigungen > 1 ? 'en' : ''}`, href: '/dashboard/personal', farbe: '#C9A84C' })
  if (kranke.length > 0) radar.push({ icon: '🤒', text: `${kranke.length} krank gemeldet`, href: '/dashboard/personal', farbe: '#E0A24C' })
  if (rechnOffenSumme > 0) radar.push({ icon: '💶', text: `${geld(rechnOffenSumme)} offen`, href: '/dashboard/rechnungen', farbe: '#4CAF7D' })

  // --- LIVE-FEED: Ereignisse der letzten 24h ---
  const H24 = 24 * 60 * 60 * 1000
  const grenze = Date.now() - H24
  const ev: FeedEvent[] = []

  for (const l of leads as any[]) if (ts(l.created_at) > grenze) ev.push({ zeit: ts(l.created_at), icon: '🎯', farbe: '#00e5ff', text: `Neuer Lead: ${l.name || 'Anfrage'}`, href: '/dashboard/leads' })
  for (const c of chancen as any[]) if (ts(c.created_at) > grenze) ev.push({ zeit: ts(c.created_at), icon: '💼', farbe: '#A98CE0', text: `Neue Verkaufschance: ${c.titel || '—'}`, href: '/dashboard/crm/pipeline' })
  for (const a of auftraege as any[]) if (ts(a.created_at) > grenze) ev.push({ zeit: ts(a.created_at), icon: '📋', farbe: '#C9A84C', text: `Neuer Auftrag ${a.auftragsnummer || ''}`.trim(), href: '/dashboard/auftraege' })
  for (const r of rechnungen as any[]) {
    if (ts(r.created_at) > grenze) ev.push({ zeit: ts(r.created_at), icon: '🧾', farbe: '#4CAF7D', text: `Rechnung ${r.rechnungsnummer || ''} erstellt`.trim(), href: '/dashboard/rechnungen' })
    if (ts(r.bezahlt_am) > grenze) ev.push({ zeit: ts(r.bezahlt_am), icon: '✅', farbe: '#4CAF7D', text: `Rechnung ${r.rechnungsnummer || ''} bezahlt`.trim(), href: '/dashboard/rechnungen' })
  }
  for (const p of projekte as any[]) if (ts(p.erstellt_am) > grenze) ev.push({ zeit: ts(p.erstellt_am), icon: '📁', farbe: '#4f94e8', text: `Neues Projekt: ${p.name || '—'}`, href: '/dashboard/projekte' })
  for (const a of abwesenheiten as any[]) if (ts(a.created_at) > grenze) {
    const istKrank = low(a.typ).includes('krank')
    ev.push({ zeit: ts(a.created_at), icon: istKrank ? '🤒' : '🌴', farbe: istKrank ? '#E06666' : '#C9A84C', text: `${maName[a.mitarbeiter_id] || 'Mitarbeiter'}: ${a.typ || 'Abwesenheit'}`, href: '/dashboard/personal' })
  }
  for (const z of zeiten as any[]) if (ts(z.created_at) > grenze && z.kommen_um) ev.push({ zeit: ts(z.created_at), icon: '🕐', farbe: '#00e5ff', text: `${maName[z.mitarbeiter_id] || 'Mitarbeiter'} hat gestempelt`, href: '/dashboard/zeiterfassung' })
  for (const k of kontakte as any[]) if (ts(k.created_at) > grenze) ev.push({ zeit: ts(k.created_at), icon: '👤', farbe: '#A98CE0', text: `Neuer Kontakt: ${kName[k.id]}`, href: '/dashboard/crm' })
  for (const akt of aktivitaeten as any[]) if (ts(akt.created_at) > grenze) ev.push({ zeit: ts(akt.created_at), icon: '💬', farbe: '#C9A84C', text: `${kName[akt.kontakt_id] || 'Kontakt'}: ${kurz(akt.inhalt) || akt.typ || 'Aktivität'}`, href: akt.kontakt_id ? `/dashboard/crm/${akt.kontakt_id}` : '/dashboard/crm' })

  const feed = ev.sort((a, b) => b.zeit - a.zeit).slice(0, 25)

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

        {/* ETAPPE 1: Sprechendes Chef-Cockpit */}
        <ChefCockpit
          chefName={displayName}
          jahr={jahrNow}
          einnahmen={Math.round(einnahmenNetto)}
          gewinn={gewinn}
          rechnungenOffen={rechnOffenListe.length}
          rechnungenOffenSumme={Math.round(rechnOffenSumme)}
          rechnungenUeberfaellig={rechnUeberfaellig.length}
          leadsOffen={leadsOffen}
          chancenAktiv={chancenAktiv.length}
          chancenSumme={Math.round(chancenSumme)}
          auftraegeOffen={auftraegeOffen}
          projekteLaufend={projekteLaufend}
          kranke={kranke.length}
          krankeDetails={krankeDetails}
          offeneGenehmigungen={offeneGenehmigungen}
          eingestempelt={eingestempelt}
          feedCount={feed.length}
        />

        {/* HEUTE IM BLICK: Chef-Radar */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Heute im Blick</h2>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Was Aufmerksamkeit braucht</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {radar.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.4)', borderRadius: '12px', padding: '12px 18px', fontSize: '14px', fontWeight: 600, color: '#4CAF7D' }}>
                <span>✅</span><span>Alles im grünen Bereich – nichts Dringendes.</span>
              </div>
            ) : radar.map((r, i) => (
              <a key={i} href={r.href} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: `${r.farbe}1e`, border: `1px solid ${r.farbe}55`, borderRadius: '12px', padding: '12px 18px', fontSize: '14px', fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
                <span>{r.icon}</span><span>{r.text}</span>
              </a>
            ))}
          </div>
        </section>

        {/* LIVE-COCKPIT: KPI-Kacheln nach Bereichen gruppiert */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '18px' }}>
            <h2 style={{ fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Live-Cockpit</h2>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Echtzeit-Kennzahlen</span>
          </div>

          {/* 💶 Finanzen */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: '12px', opacity: 0.85 }}>💶 Finanzen</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
              <KpiKachel href="/dashboard/finanzen" icon="📈" label={`Einnahmen ${jahrNow}`} wert={geld(einnahmenNetto)} sub="netto, laufendes Jahr" akzent="#4CAF7D" />
              <KpiKachel href="/dashboard/finanzen/euer" icon="💰" label={`Gewinn ${jahrNow}`} wert={geld(gewinn)} sub="Einnahmen − Ausgaben" akzent="#C9A84C" alarm={gewinn < 0} />
              <KpiKachel href="/dashboard/rechnungen" icon="🧾" label="Offene Rechnungen" wert={rechnOffenListe.length} sub={rechnOffenSumme > 0 ? `${geld(rechnOffenSumme)} offen` : 'nichts offen'} akzent="#4f94e8" />
              <KpiKachel href="/dashboard/mahnwesen" icon="⚠️" label="Überfällige Rechnungen" wert={rechnUeberfaellig.length} sub={rechnUeberfaellig.length > 0 ? 'bitte anmahnen' : 'alles im Plan'} akzent="#E0A24C" alarm={rechnUeberfaellig.length > 0} />
            </div>
          </div>

          {/* 🤝 Vertrieb */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: '12px', opacity: 0.85 }}>🤝 Vertrieb</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
              <KpiKachel href="/dashboard/leads" icon="🎯" label="Offene Leads" wert={leadsOffen} sub={`${leads.length} gesamt`} akzent="#00e5ff" />
              <KpiKachel href="/dashboard/crm/pipeline" icon="💼" label="Aktive Verkaufschancen" wert={chancenAktiv.length} sub={chancenSumme > 0 ? `Pipeline: ${geld(chancenSumme)}` : undefined} akzent="#A98CE0" />
              <KpiKachel href="/dashboard/auftraege" icon="📋" label="Offene Aufträge" wert={auftraegeOffen} sub={`${auftraege.length} gesamt`} akzent="#C9A84C" />
            </div>
          </div>

          {/* 🏭 Betrieb */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: '12px', opacity: 0.85 }}>🏭 Betrieb</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
              <KpiKachel href="/dashboard/projekte" icon="📁" label="Laufende Projekte" wert={projekteLaufend} sub={`${projekte.length} gesamt`} akzent="#4f94e8" />
              <KpiKachel href="/dashboard/automatisierungen" icon="⚙️" label="Aktive Automatisierungen" wert={automationsCount} sub="Bibliothek öffnen" akzent="#C9A84C" />
              <KpiKachel href="/dashboard/start" icon="⚡" label="KI-Calls diesen Monat" wert={`${kiPct}%`} sub={`${kiUsed.toLocaleString('de-DE')} / ${kiLimit.toLocaleString('de-DE')}`} akzent="#C9A84C" alarm={kiPct >= 100} />
            </div>
          </div>

          {/* 👥 Personal */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: '12px', opacity: 0.85 }}>👥 Personal</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
              <KpiKachel href="/dashboard/personal" icon="🤒" label="Krankmeldungen" wert={kranke.length} sub={kranke.length === 0 ? 'alle an Bord' : 'aktuell krank'} details={krankeDetails} akzent="#4CAF7D" alarm={kranke.length > 0} />
              <KpiKachel href="/dashboard/personal" icon="🌴" label="Offene Genehmigungen" wert={offeneGenehmigungen} sub={offeneGenehmigungen > 0 ? 'warten auf Freigabe' : 'nichts offen'} akzent="#A98CE0" alarm={offeneGenehmigungen > 0} />
              <KpiKachel href="/dashboard/zeiterfassung" icon="🕐" label="Jetzt eingestempelt" wert={eingestempelt} sub={eingestempelt === 1 ? 'Person im Dienst' : 'Personen im Dienst'} akzent="#00e5ff" />
            </div>
          </div>
        </section>

        {/* LIVE-FEED: Letzte 24 Stunden */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '18px' }}>
            <h2 style={{ fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Letzte 24 Stunden</h2>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{feed.length > 0 ? `${feed.length} Ereignisse` : 'Aktivitäts-Stream'}</span>
          </div>

          {feed.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🌙</div>
              <p style={{ margin: 0, fontSize: '15px', color: 'rgba(255,255,255,0.6)' }}>In den letzten 24 Stunden war es ruhig.</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>Neue Leads, Aufträge, Rechnungen und Team-Aktivitäten erscheinen hier automatisch.</p>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', overflow: 'hidden' }}>
              {feed.map((e, i) => (
                <a key={i} href={e.href} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '13px 20px', textDecoration: 'none',
                  borderBottom: i < feed.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{
                    width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                    background: `${e.farbe}1e`, border: `1px solid ${e.farbe}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                  }}>{e.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '14px', color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.text}</span>
                  <span style={{ flexShrink: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{vorZeit(e.zeit)}</span>
                </a>
              ))}
            </div>
          )}
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

// ============================================================
// MITARBEITER-ÜBERSICHT (E1.8)
// Schlanke Startseite für Angestellte: Begrüßung mit echtem Namen,
// Schnellzugriffe auf ihren Bereich. KEIN Finanz-Cockpit, keine
// Betriebskennzahlen, kein 24h-Feed. Die Daten holt sich der
// Mitarbeiter über „Mein Bereich" — hier nur die Wege dorthin.
// ============================================================

type MitarbeiterZeile = { id: string; vorname: string | null; nachname: string | null }

function MitarbeiterUebersicht({ ma }: { ma: MitarbeiterZeile }) {
  const name = [ma.vorname, ma.nachname].filter(Boolean).join(' ').trim() || 'willkommen'

  const kacheln: { icon: string; titel: string; text: string; href: string; farbe: string }[] = [
    { icon: '🙋', titel: 'Mein Bereich', text: 'Urlaub, Schichten, Dokumente, Arbeitszeit', href: '/dashboard/mein-bereich', farbe: '#00e5ff' },
    { icon: '⏱', titel: 'Zeiterfassung', text: 'Kommen, Pause, Gehen stempeln', href: '/dashboard/zeiterfassung', farbe: '#4CAF7D' },
    { icon: '🗓', titel: 'Schichtplan', text: 'Wer arbeitet wann', href: '/dashboard/schichtplan', farbe: '#C9A84C' },
    { icon: '🗨️', titel: 'Team-Chat', text: 'Mit dem Team schreiben', href: '/dashboard/team-chat', farbe: '#A98CE0' },
  ]

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>
      <section style={{ marginBottom: '36px' }}>
        <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Mitgliederbereich</p>
        <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: '0 0 12px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
          Willkommen, {name}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0 }}>
          Schön, dass Sie da sind. Hier geht es direkt zu Ihrem Bereich.
        </p>
      </section>

      <section style={{ marginBottom: '36px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {kacheln.map((k) => (
            <a key={k.href} href={k.href} style={{
              display: 'block', textDecoration: 'none',
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${k.farbe}44`,
              borderRadius: '16px', padding: '22px 24px',
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px', marginBottom: '14px',
                background: `${k.farbe}1e`, border: `1px solid ${k.farbe}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
              }}>{k.icon}</div>
              <p style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: '#FFFFFF' }}>{k.titel}</p>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{k.text}</p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <a href="/dashboard/mein-bereich" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0.03) 100%)',
            border: '1px solid rgba(0,229,255,0.3)', borderRadius: '14px', padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '28px' }}>🙋</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>Zu meinem Bereich</p>
                <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Resturlaub, Schichten und Ihre Arbeitszeit auf einen Blick.</p>
              </div>
            </div>
            <div style={{ padding: '8px 20px', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', borderRadius: '8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>Öffnen →</div>
          </div>
        </a>
      </section>
    </main>
  )
}
