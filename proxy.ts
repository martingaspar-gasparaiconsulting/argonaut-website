import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { istNurChefPfad, mitarbeiterDarf, pfadPasst } from './lib/rechte'

// ============================================================================
// ARGONAUT OS · proxy.ts — Zugriffsschutz fuer /dashboard
//
// HIESS BIS NEXT.JS 15: middleware.ts
//
// Next.js 16 hat die Datei-Konvention umbenannt. `proxy.ts` gehoert in den
// Projektstamm ODER in src/ — aber auf DIESELBE EBENE wie `app` bzw. `pages`.
// Hier liegt `app/` im Stamm, also gehoert `proxy.ts` in den Stamm.
//
// Warum das wichtig ist: `src/middleware.ts` lag zwar in src/, aber es gibt
// kein src/app. Next hat die Datei nie gefunden. Der Zugriffsschutz — die
// Chef-Sperre, die Rollen-Weiche, die Rechtepruefung — lief nicht.
// Der Chef merkte nichts, weil er ohnehin ueber den customers-Zweig laeuft.
//
// Weitere Regeln der Konvention:
//   - Der Export muss `proxy` heissen (benannt oder default). NICHT `middleware`.
//   - Nur EINE Proxy-Datei pro Projekt.
//   - Proxy laeuft auf der Node.js-Laufzeit. Edge ist nicht konfigurierbar.
//     `createServerClient` aus @supabase/ssr vertraegt das.
//
// Die Regeln selbst stehen in lib/rechte.ts — dieselbe Datei, aus der auch
// DashboardNav.tsx liest. Ein Knopf, den das Menue zeigt, den die Sperre aber
// blockiert, ist damit strukturell unmoeglich.
// ============================================================================

// Der Export MUSS `proxy` heissen. Hiess bis Next.js 15 `middleware`.
export async function proxy(req: NextRequest) {
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
        .select('id, darf_verteilen')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (mitarbeiter) {
        const p = req.nextUrl.pathname

        // Verteil-Vollmacht dieses Mitarbeiters. Setzt NUR der Eigentuemer.
        const darfVerteilen = mitarbeiter.darf_verteilen === true

        // HARTE SPERRE: Chef-only Module IMMER blockieren — mit EINER Ausnahme:
        // Ein Administrator MIT Verteil-Vollmacht darf die Verteil-UI
        // (/dashboard/rechte) erreichen. Genau er soll die Rechte verteilen
        // (Reiser-Prinzip: bei 200/500/2000 Mitarbeitern macht das nicht der Chef
        // persoenlich, sondern eine Person unter ihm). Die Seite selbst filtert
        // dort auf seine verteilbaren Module und wirft reine Mitarbeiter erneut
        // zurueck — doppelt gesichert. Die Ausnahme greift NUR fuer den exakten
        // Rechte-Pfad; jeder andere nurChef-Pfad bleibt fuer alle hart dicht.
        //
        // Die Vollmacht-Vergabe selbst (darf_verteilen setzen) hat hier KEINEN
        // Schalter -> bleibt strukturell Eigentuemer-only. Die eiserne Grenze.
        if (istNurChefPfad(p)) {
          const istVerteilTuer = pfadPasst(p, '/dashboard/rechte') && darfVerteilen
          if (!istVerteilTuer) {
            return NextResponse.redirect(new URL('/dashboard/mein-bereich', req.url))
          }
          // Administrator auf der Verteil-UI: durchlassen. Den Rest regelt die Seite.
          return res
        }

        // MITARBEITER: Basis-Bereiche + die vom Chef freigeschalteten Module
        const { data: recht } = await supabase
          .from('mitarbeiter_rechte')
          .select('module')
          .eq('mitarbeiter_id', mitarbeiter.id)
          .maybeSingle()

        const module: string[] = (recht?.module as string[]) || []

        if (!mitarbeiterDarf(p, module)) {
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
