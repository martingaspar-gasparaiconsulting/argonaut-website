import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { istNurChefPfad, mitarbeiterDarf, pfadPasst } from './lib/rechte'
import { gebuchteModulKeys, pfadGebucht, type TenantModulRow } from './lib/tenantModule'

// ============================================================================
// ARGONAUT OS · proxy.ts — Zugriffsschutz fuer /dashboard + Custom-Domains
//
// HIESS BIS NEXT.JS 15: middleware.ts
//
// Next.js 16 hat die Datei-Konvention umbenannt. `proxy.ts` gehoert in den
// Projektstamm ODER in src/ — aber auf DIESELBE EBENE wie `app` bzw. `pages`.
// Hier liegt `app/` im Stamm, also gehoert `proxy.ts` in den Stamm.
//
// Regeln der Konvention:
//   - Der Export muss `proxy` heissen (benannt oder default). NICHT `middleware`.
//   - Nur EINE Proxy-Datei pro Projekt.
//   - Proxy laeuft auf der Node.js-Laufzeit. Edge ist nicht konfigurierbar.
//     `createServerClient` aus @supabase/ssr vertraegt das.
//
// W7 (Website-Bauer): Der Proxy erkennt jetzt zuerst den HOST. Kommt der Aufruf
// ueber eine FREMDE Domain (die Domain eines Kunden, nicht unsere eigene), wird
// die Anfrage auf /p-domain/<host> umgeschrieben — dort wird die veroeffentlichte
// Kundenseite ausgeliefert. Nur auf UNSERER eigenen Domain greift der bestehende
// Dashboard-Schutz. Assets (_next), /api und favicon passieren immer.
// ============================================================================

// Eigene App-Hosts (Dashboard + Marketing). Alles andere gilt als Kundendomain.
// Selbst-konfigurierend: Vercel liefert die Produktions- und Deployment-Domain
// automatisch (VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL). Zusaetzlich
// NEXT_PUBLIC_SITE_URL, sinnvolle Defaults und die frei erweiterbare Liste
// NEXT_PUBLIC_APP_HOSTS. *.vercel.app + localhost gelten IMMER als eigen.
function hostAus(v?: string): string {
  if (!v) return ''
  try { return new URL(v.startsWith('http') ? v : `https://${v}`).host.toLowerCase() } catch { return v.toLowerCase().split('/')[0] }
}
const EIGENE_HOSTS = [
  'argonaut-os.com', 'www.argonaut-os.com',
  ...(process.env.NEXT_PUBLIC_APP_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()),
  hostAus(process.env.NEXT_PUBLIC_SITE_URL),
  hostAus(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  hostAus(process.env.VERCEL_URL),
].filter(Boolean)

function istEigeneDomain(host: string): boolean {
  const h = (host || '').toLowerCase().split(':')[0]
  if (!h) return true
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app')) return true
  return EIGENE_HOSTS.includes(h)
}

// App-Pfade, die NIE auf eine Kundenseite umgeschrieben werden (harter
// Aussperr-Schutz — selbst bei falsch erkanntem Host bleibt das Dashboard offen).
const RESERVIERT = ['/dashboard', '/auth']

// Der Export MUSS `proxy` heissen. Hiess bis Next.js 15 `middleware`.
export async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase()
  const pfad = req.nextUrl.pathname

  // Interne/technische Pfade nie umschreiben.
  if (pfad.startsWith('/p-domain') || pfad.startsWith('/api') || pfad.startsWith('/_next') || pfad === '/favicon.ico') {
    return NextResponse.next()
  }

  // --- Custom-Domain eines Kunden -----------------------------------------
  // Fremder Host -> die veroeffentlichte Seite dieses Kunden ausliefern.
  // Reservierte App-Pfade (/dashboard, /auth) werden NIE umgeschrieben.
  const reserviert = RESERVIERT.some((pre) => pfad === pre || pfad.startsWith(pre + '/'))
  if (host && !istEigeneDomain(host) && !reserviert) {
    const url = req.nextUrl.clone()
    url.pathname = `/p-domain/${encodeURIComponent(host.split(':')[0])}`
    return NextResponse.rewrite(url)
  }

  // --- Ab hier: unsere eigene Domain. Nur /dashboard wird geschuetzt. ------
  if (!pfad.startsWith('/dashboard')) return NextResponse.next()

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

  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  // --- P49 · BETREIBER-BUCHUNGS-GATE (aeusserste Ebene) -------------------
  {
    const { data: tmRows } = await supabase
      .from('tenant_module')
      .select('modul_key, aktiv')
    const gebucht = gebuchteModulKeys((tmRows as TenantModulRow[] | null) ?? null)
    if (!pfadGebucht(req.nextUrl.pathname, gebucht)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  // --- Rollen-Weiche -------------------------------------------------------
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
      const darfVerteilen = mitarbeiter.darf_verteilen === true

      if (istNurChefPfad(p)) {
        const istVerteilTuer = pfadPasst(p, '/dashboard/rechte') && darfVerteilen
        if (!istVerteilTuer) {
          return NextResponse.redirect(new URL('/dashboard/mein-bereich', req.url))
        }
        return res
      }

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

  return res
}

export const config = {
  matcher: [
    // Alles ausser statischen Assets / Bild-Optimierung / favicon / api.
    // Noetig, damit der Proxy auch auf '/' laeuft und Custom-Domains erkennt.
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ]
}
