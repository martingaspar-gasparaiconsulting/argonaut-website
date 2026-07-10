import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pfade, die ein eingeladener Mitarbeiter (Self-Service) IMMER erreichen darf.
// Additiv erweiterbar — neue Mitarbeiter-Seiten hier eintragen.
const MITARBEITER_ERLAUBT = ['/dashboard/mein-bereich', '/dashboard/zeiterfassung', '/dashboard/einstellungen']

// Module, die AUSSCHLIESSLICH der Chef sehen darf — NIE ein Mitarbeiter,
// egal was in seinen Rechten steht. Schuetzt auch vor versehentlicher
// Freigabe (z.B. ueber die Vorlage "Alle" auf der Rechte-Seite).
// Entspricht der Rechte-Matrix (Block 1.3, zentral verankert).
const NUR_CHEF = [
  '/dashboard/personal',    // HR-Cockpit (Gehaelter, SV-Nr, IBAN, Bewerber ...)
  '/dashboard/rechnungen',
  '/dashboard/mahnwesen',
  '/dashboard/finanzen',
  '/dashboard/analytics',
  '/dashboard/vertraege',   // Geschaeftsvertraege — bei Bedarf diese Zeile entfernen
]

// Modul-Schlüssel (aus /dashboard/rechte) -> Pfad. Identisch mit der Navigation.
// Ein Mitarbeiter erreicht zusätzlich die Module, die der Chef freigeschaltet hat.
//
// E1.7 — Die sieben fehlenden Schluessel sind ergaenzt: werkstatt,
// leistungskatalog, fahrzeugakte, aufmass, wartung, objektzeiten, buchungen.
// Vorher standen sie in der Navigation, aber nicht hier: der Mitarbeiter sah
// den Knopf, wurde beim Klick auf /dashboard/mein-bereich zurueckgeworfen —
// ohne Fehlermeldung. Beim Chef fiel es nicht auf, weil der ueber den
// customers-Zweig laeuft.
//
// SICHERHEIT: Jeder Eintrag ist OPT-IN. Der Mitarbeiter erreicht den Pfad nur,
// wenn der Chef ihm das Recht in /dashboard/rechte ausdruecklich gegeben hat.
// Die harte NUR_CHEF-Sperre oben greift vorher und bleibt unberuehrt.
//
// leistungskatalog enthaelt Stundensaetze und Pauschalen. Das ist Absicht:
// ohne Katalog kann ein Monteur keine Position in einen Werkstatt-Auftrag
// uebernehmen. Wer den Katalog nicht zeigen will, vergibt das Recht nicht.
//
// Unterseiten sind automatisch abgedeckt: die Pruefung unten nutzt
// `p.startsWith(pf + '/')`. Das Recht `holz` oeffnet also auch
// /dashboard/holz/preisauskunft, /holz/import, /holz/auftraege, /holz/pakete.
// Das Recht `crm` oeffnet /dashboard/crm/dubletten, /crm/import, /crm/verorten.
const MODUL_PFAD: Record<string, string> = {
  agenten: '/dashboard/agenten',
  academy: '/dashboard/academy',
  leads: '/dashboard/leads',
  chat: '/dashboard/chat',
  'team-chat': '/dashboard/team-chat',
  dokumente: '/dashboard/documents',
  korrespondenz: '/dashboard/korrespondenz',
  personal: '/dashboard/personal',
  schichtplan: '/dashboard/schichtplan',
  projekte: '/dashboard/projekte',
  marketing: '/dashboard/marketing',
  crm: '/dashboard/crm',
  auftraege: '/dashboard/auftraege',
  rechnungen: '/dashboard/rechnungen',
  mahnwesen: '/dashboard/mahnwesen',
  finanzen: '/dashboard/finanzen',
  erp: '/dashboard/erp',
  vertraege: '/dashboard/vertraege',
  service: '/dashboard/service',
  holz: '/dashboard/holz',
  analytics: '/dashboard/analytics',
  automatisierungen: '/dashboard/automatisierungen',

  // E1.7 — ergaenzt, standen bereits in DashboardNav.tsx
  werkstatt: '/dashboard/werkstatt',
  leistungskatalog: '/dashboard/leistungskatalog',
  fahrzeugakte: '/dashboard/fahrzeugakte',
  aufmass: '/dashboard/aufmass',
  wartung: '/dashboard/wartung',
  objektzeiten: '/dashboard/objektzeiten',
  buchungen: '/dashboard/buchungen',
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: any) { res.cookies.set({ name, value, ...options }) },
        remove(name: string, options: any) { res.cookies.set({ name, value: '', ...options }) },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    // --- Rollen-Weiche -------------------------------------------------------
    // Kunde (Chef) = hat eine customers-Zeile. Mitarbeiter (Self-Service) =
    // kein Kunde, aber ein mitarbeiter-Datensatz mit auth_user_id = Login.
    const { data: customer } = await supabase
      .from('customers')
      .select('status')
      .eq('email', session.user.email)
      .single()

    if (customer) {
      // CHEF: bestehendes Verhalten unveraendert
      if (customer.status === 'gesperrt') {
        return NextResponse.redirect(new URL('/dashboard/upgrade', req.url))
      }
    } else {
      // KEIN Kunde -> pruefen, ob es ein eingeladener Mitarbeiter ist
      const { data: mitarbeiter } = await supabase
        .from('mitarbeiter')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (mitarbeiter) {
        const p = req.nextUrl.pathname

        // HARTE SPERRE (Block 1.3): Chef-only Module IMMER blockieren —
        // unabhaengig von den vergebenen Rechten. Greift vor der Whitelist.
        const istNurChef = NUR_CHEF.some((pf) => p === pf || p.startsWith(pf + '/'))
        if (istNurChef) {
          return NextResponse.redirect(new URL('/dashboard/mein-bereich', req.url))
        }

        // MITARBEITER: Basis-Bereiche + die vom Chef freigeschalteten Module
        const { data: recht } = await supabase
          .from('mitarbeiter_rechte')
          .select('module')
          .eq('mitarbeiter_id', mitarbeiter.id)
          .maybeSingle()

        const module: string[] = (recht?.module as string[]) || []
        const erlaubtePfade = [
          ...MITARBEITER_ERLAUBT,
          ...module.map((k) => MODUL_PFAD[k]).filter(Boolean),
        ]

        const erlaubt = erlaubtePfade.some((pf) => p === pf || p.startsWith(pf + '/'))

        if (!erlaubt) {
          return NextResponse.redirect(new URL('/dashboard/mein-bereich', req.url))
        }
      }
      // weder Kunde noch Mitarbeiter: unveraendert durchlassen
    }
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*']
}
