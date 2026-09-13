import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Churn-Lock Check
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user?.email) {
        // Churn-Lock: Die Sperrliste wird NICHT hier gefiltert, sondern von der
        // Datenbank-Regel churned_eigene_email_lesen:
        //   for select to authenticated
        //   using (lower(email) = lower(auth.jwt() ->> 'email'))
        // Die Regel vergleicht ohne Ruecksicht auf Gross-/Kleinschreibung. Ein
        // eigener .eq('email', ...) waere strenger als die Regel und wuerde bei
        // "Max@Firma.de" gegen "max@firma.de" daneben greifen.
        // WER DIESE REGEL AENDERT ODER ENTFERNT, HEBELT DIE SPERRE AUS.
        const { data: churned, error: churnFehler } = await supabase
          .from('churned_customers')
          .select('id')
          .limit(1)

        if (churnFehler) {
          // Nicht verschlucken - sonst faellt die Sperre lautlos aus.
          console.error('[churn-lock] Pruefung fehlgeschlagen:', churnFehler.message)
        }

        // .limit(1) statt .single(): .single() wirft bei null UND bei mehr als
        // einer Zeile - ein Doppeleintrag haette die Sperre still ausgehebelt.
        if (churned && churned.length > 0) {
          return NextResponse.redirect(`${origin}/auth/login?error=churn_locked`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback_error`)
}