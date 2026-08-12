import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import DashboardNav from './DashboardNav'
import DashboardChat from './DashboardChat'
import Glocke from './Glocke'
import SwRegister from './_components/SwRegister'
import { demoStatus, demoRestText } from '@/lib/demo'
import DemoReadonlyGuard from './_components/DemoReadonlyGuard'
import PraesentationsModus from './_components/PraesentationsModus'
import UnterschriftLoader from './_components/UnterschriftLoader'
import FilialUmschalter from './_components/FilialUmschalter'
import { AnsichtUmschalter } from './_components/Ansicht'

// ============================================================
// ARGONAUT OS · ZENTRALES DASHBOARD-LAYOUT
// Header (Logo + Konto + Glocke + Abmelden) + Navigation + PULS-Chat
// erscheinen ab hier auf ALLEN /dashboard-Unterseiten.
//
// P47 (14.07.26): Benachrichtigungs-Glocke rechts neben der E-Mail ergänzt.
//
// Q6c (15.07.26): Header spürbar groesser + Wortmarke "ARGONAUT OS".
//   Statt der E-Mail steht jetzt der NAME des Nutzers — gleiche Quelle und
//   gleiche Reihenfolge wie im Live-Cockpit (app/dashboard/page.tsx):
//     1. mitarbeiter.vorname + nachname  (eingeladener Mitarbeiter)
//     2. profiles.full_name              (Chef/Inhaber)
//     3. Teil vor dem @ der E-Mail       (Notnagel)
//   Die E-Mail bleibt als Tooltip (title) erhalten — nichts geht verloren.
//   Alle Groessen als clamp(min, vw, max): waechst am Desktop mit, bleibt am
//   Handy lesbar, ohne Media-Query (Inline-Styles koennen keine).
//
// ERLEDIGT (03.08.26): Der Spartaner-Helm ist raus. Im Kopf steht jetzt der
//   echte ARGONAUT-Dreizack — aus dem Original-Logo vektorisiert und inline
//   eingebettet, damit er in jeder Groesse scharf bleibt und nie nachladen muss.
// ============================================================

// Zentrale Layout-Breite: waechst auf grossen Bildschirmen mit (1200 -> 1600).
const SHELL_MAX = '1600px'
const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user || userError) redirect('/auth/login')

  // Anzeige-Name holen — beide Quellen parallel, damit kein Wasserfall entsteht.
  // maybeSingle() wirft nicht, wenn nichts da ist -> Fehler koennen den Header
  // nie kaputt machen (Notnagel greift dann).
  const [profilRes, mitarbeiterRes] = await Promise.all([
    supabase.from('profiles').select('full_name, firma_name, demo, demo_ablauf').eq('id', user.id).maybeSingle(),
    supabase.from('mitarbeiter').select('vorname, nachname').eq('auth_user_id', user.id).maybeSingle(),
  ])

  const maName = [mitarbeiterRes.data?.vorname, mitarbeiterRes.data?.nachname]
    .filter(Boolean)
    .join(' ')
    .trim()

  const anzeigeName =
    maName || profilRes.data?.full_name || user.email?.split('@')[0] || 'Nutzer'

  // Firmenname des Inhabers für den Header ("ARGONAUT OS für <Firma>").
  const firmaName = ((profilRes.data as { firma_name?: string | null } | null)?.firma_name || '').trim()

  // Demo-Konto-Status (Punkt 26): steuert das Banner. profilRes kann demo-Felder
  // erst nach dem SQL-Rollout liefern — vorher ist demo schlicht false.
  const demoInfo = demoStatus(
    (profilRes.data as { demo?: boolean } | null)?.demo,
    (profilRes.data as { demo_ablauf?: string | null } | null)?.demo_ablauf,
    new Date().toISOString(),
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', position: 'relative', top: 0, zIndex: 100 }}>
        {/* Zeile 1: Logo links, Name + Glocke + Abmelden rechts */}
        <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `0 ${SHELL_PAD}`, minHeight: 'clamp(76px, 6vw, 96px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)', flexShrink: 0, textDecoration: 'none', color: 'inherit' }}>
            {/* Der Dreizack — direkt aus dem Original-Logo vektorisiert. Inline statt
                Bilddatei: skaliert verlustfrei, laedt nicht nach, kann nie fehlen. */}
            <svg
              viewBox="0 0 1.0097 1"
              role="img"
              aria-label="ARGONAUT"
              style={{ height: 'clamp(40px, 3.4vw, 56px)', width: 'auto', flexShrink: 0, display: 'block' }}
            >
              <path d="M0.264 0.002C0.263 0.003 0.263 0.006 0.262 0.009 0.26 0.017 0.254 0.024 0.24 0.034 0.232 0.039 0.224 0.047 0.221 0.05 0.218 0.054 0.21 0.06 0.203 0.065 0.196 0.069 0.187 0.076 0.185 0.08 0.182 0.083 0.175 0.089 0.17 0.093 0.165 0.096 0.156 0.103 0.152 0.107 0.147 0.112 0.138 0.119 0.133 0.123 0.11 0.144 0.12 0.162 0.155 0.163 0.177 0.165 0.186 0.169 0.191 0.181 0.197 0.198 0.185 0.243 0.168 0.265 0.163 0.272 0.156 0.282 0.152 0.288 0.149 0.293 0.134 0.309 0.118 0.325 0.076 0.367 0.066 0.379 0.058 0.398 0.055 0.405 0.049 0.416 0.045 0.423 0.036 0.437 0.034 0.442 0.029 0.466 0.02 0.504 0.011 0.526 0 0.531 -0.006 0.534 -0.006 0.613 0 0.616 0.011 0.62 0.024 0.644 0.031 0.674 0.036 0.697 0.038 0.701 0.047 0.713 0.051 0.718 0.057 0.728 0.061 0.736 0.065 0.743 0.071 0.753 0.075 0.758 0.079 0.762 0.087 0.772 0.094 0.781 0.106 0.798 0.113 0.804 0.13 0.815 0.135 0.819 0.144 0.825 0.148 0.829 0.157 0.837 0.164 0.84 0.177 0.846 0.182 0.848 0.189 0.852 0.194 0.855 0.214 0.869 0.222 0.871 0.267 0.876 0.346 0.884 0.348 0.885 0.342 0.919 0.339 0.936 0.34 0.951 0.344 0.96 0.347 0.966 0.352 0.971 0.366 0.981 0.373 0.986 0.377 0.992 0.379 1 0.381 1.006 0.643 1.004 0.644 0.998 0.646 0.99 0.652 0.984 0.662 0.977 0.685 0.962 0.691 0.938 0.68 0.909 0.671 0.887 0.676 0.885 0.747 0.877 0.797 0.871 0.839 0.855 0.869 0.83 0.875 0.825 0.885 0.818 0.891 0.814 0.904 0.806 0.929 0.78 0.937 0.767 0.941 0.762 0.947 0.754 0.952 0.749 0.961 0.739 0.962 0.736 0.969 0.719 0.972 0.712 0.978 0.701 0.982 0.695 0.992 0.68 0.995 0.671 1 0.643 1.002 0.63 1.007 0.607 1.01 0.592 1.018 0.552 1.018 0.537 1.01 0.512 1.007 0.502 1.002 0.483 1 0.47 0.994 0.438 0.992 0.432 0.982 0.418 0.978 0.411 0.971 0.399 0.968 0.393 0.962 0.377 0.955 0.368 0.932 0.345 0.909 0.322 0.883 0.292 0.872 0.278 0.867 0.272 0.86 0.263 0.856 0.258 0.844 0.244 0.84 0.227 0.839 0.196 0.839 0.171 0.845 0.165 0.871 0.165 0.907 0.165 0.916 0.141 0.889 0.12 0.885 0.116 0.878 0.11 0.875 0.107 0.872 0.103 0.865 0.097 0.86 0.094 0.855 0.091 0.847 0.084 0.843 0.079 0.838 0.074 0.828 0.066 0.821 0.062 0.814 0.057 0.806 0.051 0.803 0.047 0.799 0.043 0.789 0.037 0.781 0.032 0.764 0.022 0.759 0.017 0.756 0.007 0.753 -0.003 0.722 -0.004 0.722 0.006 0.722 0.01 0.721 0.02 0.719 0.029 0.717 0.044 0.717 0.057 0.718 0.121 0.719 0.215 0.72 0.225 0.736 0.26 0.739 0.267 0.744 0.278 0.746 0.286 0.752 0.304 0.755 0.31 0.766 0.324 0.771 0.33 0.778 0.34 0.782 0.347 0.786 0.354 0.794 0.364 0.799 0.368 0.804 0.373 0.81 0.38 0.814 0.385 0.817 0.389 0.825 0.398 0.831 0.404 0.859 0.432 0.87 0.445 0.877 0.462 0.881 0.47 0.885 0.48 0.888 0.483 0.908 0.516 0.913 0.566 0.899 0.61 0.885 0.654 0.874 0.678 0.862 0.69 0.856 0.696 0.848 0.705 0.844 0.71 0.839 0.716 0.832 0.721 0.826 0.725 0.82 0.728 0.812 0.733 0.809 0.736 0.795 0.749 0.784 0.754 0.752 0.761 0.742 0.763 0.727 0.767 0.719 0.769 0.68 0.782 0.663 0.78 0.627 0.755 0.599 0.738 0.578 0.708 0.569 0.676 0.563 0.655 0.562 0.205 0.567 0.188 0.572 0.175 0.578 0.17 0.591 0.168 0.626 0.162 0.631 0.138 0.605 0.106 0.601 0.101 0.594 0.091 0.591 0.084 0.587 0.078 0.581 0.07 0.577 0.066 0.573 0.062 0.566 0.054 0.562 0.048 0.558 0.042 0.552 0.033 0.548 0.028 0.54 0.018 0.535 0.01 0.535 0.004 0.535 -0.005 0.48 -0.002 0.479 0.007 0.477 0.02 0.465 0.041 0.451 0.057 0.447 0.061 0.44 0.07 0.437 0.076 0.433 0.082 0.426 0.092 0.42 0.097 0.411 0.107 0.399 0.126 0.397 0.137 0.394 0.149 0.406 0.16 0.43 0.169 0.46 0.179 0.46 0.179 0.459 0.292 0.458 0.404 0.458 0.493 0.459 0.585 0.459 0.668 0.46 0.665 0.446 0.697 0.433 0.725 0.419 0.741 0.394 0.758 0.358 0.782 0.348 0.783 0.301 0.768 0.288 0.764 0.27 0.758 0.261 0.756 0.239 0.751 0.229 0.746 0.218 0.736 0.213 0.731 0.205 0.725 0.2 0.723 0.184 0.713 0.156 0.683 0.148 0.666 0.144 0.658 0.138 0.646 0.135 0.641 0.125 0.622 0.121 0.597 0.121 0.555 0.121 0.509 0.124 0.496 0.138 0.476 0.141 0.472 0.147 0.463 0.15 0.456 0.157 0.443 0.17 0.426 0.194 0.403 0.201 0.395 0.21 0.386 0.213 0.382 0.216 0.378 0.223 0.37 0.228 0.364 0.234 0.358 0.242 0.347 0.246 0.34 0.251 0.332 0.258 0.322 0.262 0.317 0.272 0.306 0.275 0.299 0.28 0.28 0.282 0.273 0.287 0.259 0.292 0.25 0.308 0.217 0.309 0.208 0.309 0.117 0.309 -0.004 0.31 0 0.285 0 0.27 0 0.264 0 0.264 0.002Z" fill="#C9A84C" />
            </svg>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '10px', rowGap: '2px', lineHeight: 1.1 }}>
              <span style={{ fontSize: 'clamp(20px, 2vw, 32px)', fontWeight: 900, letterSpacing: '0.14em', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
                ARGONAUT OS
              </span>
              {firmaName
                ? <span style={{ fontSize: 'clamp(13px, 1.1vw, 19px)', color: '#C9A84C', fontWeight: 600, letterSpacing: '0.01em' }}>für {firmaName}</span>
                : <span style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', color: '#C9A84C', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Dashboard</span>}
            </div>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)', flexShrink: 0 }}>
            <span
              title={user.email ?? undefined}
              style={{
                fontSize: 'clamp(15px, 1.25vw, 21px)',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.88)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 'clamp(120px, 22vw, 320px)',
              }}
            >
              {anzeigeName}
            </span>
            <AnsichtUmschalter />
            <FilialUmschalter />
            <Glocke />
            <LogoutButton />
          </div>
        </div>

        {/* Zeile 2: Navigation ueber volle Breite */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.08)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `12px ${SHELL_PAD}` }}>
            <DashboardNav />
          </div>
        </div>
      </header>

      {/* Demo-Modus-Banner (Punkt 26): Countdown bzw. Read-only-Hinweis */}
      {demoInfo.istDemo && (
        <div
          style={{
            background: demoInfo.abgelaufen ? 'rgba(224,102,102,0.14)' : 'rgba(201,168,76,0.14)',
            borderBottom: `1px solid ${demoInfo.abgelaufen ? 'rgba(224,102,102,0.5)' : 'rgba(201,168,76,0.5)'}`,
          }}
        >
          <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `10px ${SHELL_PAD}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: 'clamp(13px, 1vw, 15px)' }}>
            <span style={{ fontWeight: 800, color: demoInfo.abgelaufen ? '#E0A24C' : '#C9A84C', whiteSpace: 'nowrap' }}>
              {demoInfo.abgelaufen ? '🔒 Demo abgelaufen' : `🧪 ${demoRestText(demoInfo)}`}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>
              {demoInfo.abgelaufen
                ? 'Du kannst alles ansehen, aber nichts mehr ändern. Sichere dir deinen ARGONAUT mit einem Termin.'
                : 'Du testest ARGONAUT im Demo-Modus — danach bleibt alles sichtbar, zum Weiterarbeiten vereinbare einen Termin.'}
            </span>
            <span style={{ flex: 1 }} />
            <a
              href="mailto:info@argonaut-os.com?subject=Termin%20ARGONAUT%20OS"
              style={{ color: '#00e5ff', fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(0,229,255,0.4)', borderRadius: '8px', padding: '6px 12px', whiteSpace: 'nowrap' }}
            >
              Termin vereinbaren ›
            </a>
          </div>
        </div>
      )}

      {/*
        DIE SEITENSCHALE (04.08.2026)

        Vorher stand hier nur `{children}` — ohne jeden Rahmen. Kopfzeile, Menü
        und Banner sassen alle in maxWidth 1600 px, der Seiteninhalt darunter
        bekam gar nichts. Jede der rund 130 Modulseiten legte ihre Breite selbst
        fest, und zwar voellig unterschiedlich:

          Etiketten & LMIV      1400 px, KEIN Innenabstand -> Text klebt am Rand
          Landwirtschaft/Forst  1020 px, 4 px Innenabstand
          Rechnungen, CRM       1200 px, 32 px
          Schlagkartei           860 px, 28 px

        Deshalb wirkte der Inhalt mal randlos, mal schmal und nie buendig mit
        der Kopfzeile. Es waren nicht einzelne kaputte Seiten — es fehlte die
        gemeinsame Schale.

        Diese Schale setzt jetzt drei Dinge fuer ALLE Seiten auf einmal:
          · dieselbe Hoechstbreite wie die Kopfzeile (buendig)
          · denselben seitlichen Abstand (nie wieder Text am Rand)
          · einen ruhigen Abstand nach oben und unten

        Seiten, die eine eigene, kleinere Breite setzen, bleiben davon
        unberuehrt und stehen weiterhin mittig — nur eben innerhalb eines
        Rahmens statt frei im Raum. Die Feinarbeit an den Einzelseiten kann
        danach Stueck fuer Stueck folgen, ohne dass hier noch etwas passieren
        muss.
      */}
      <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(16px, 1.6vw, 28px) ${SHELL_PAD} 64px` }}>
        {children}
      </main>

      {/* PULS · KI-Assistent — zentral, schwebt auf allen Seiten unten rechts */}
      <DashboardChat />

      {/* Präsentations-Modus — Auto-Loop (Abdunkeln + Gold), Start-Knopf unten links */}
      <PraesentationsModus />

      {/* Service-Worker für Offline-Grundfähigkeit (rendert nichts) */}
      <SwRegister />

      {/* Read-only-Sperre fuer abgelaufene Demo-Konten (Punkt 26b) */}
      <DemoReadonlyGuard readonly={demoInfo.abgelaufen} />

      {/* Q2d: Lädt die gespeicherte Unterschrift einmal in den Cache (rendert nichts) */}
      <UnterschriftLoader />
    </div>
  )
}
