import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

// Webhooks must not be cached
export const dynamic = 'force-dynamic'

// ─── Price → plan mapping ──────────────────────────────────────────────────

const PRICE_TO_PLAN: Record<number, string> = {
  300000: 'starter',
  400000: 'professional',
  700000: 'business',
  900000: 'enterprise',
}

// ─── Service-role Supabase client (bypasses RLS) ──────────────────────────

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Fehlende Stripe-Signatur' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[webhook] Signaturprüfung fehlgeschlagen:', message)
    return NextResponse.json({ error: `Webhook-Fehler: ${message}` }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {

      // ── checkout.session.completed ────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId  = session.metadata?.supabase_user_id
        if (!userId) break

        await supabase
          .from('profiles')
          .update({ status: 'active' })
          .eq('id', userId)
        break
      }

      // ── customer.subscription.updated ─────────────────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId       = subscription.metadata?.supabase_user_id
        if (!userId) break

        const item       = subscription.items.data[0]
        const unitAmount = item?.price?.unit_amount ?? 0
        const plan       = PRICE_TO_PLAN[unitAmount]

        // v22 API: current_period_end removed; use billing_cycle_anchor + 30 days
        const anchor      = subscription.billing_cycle_anchor
        const nextBilling = anchor
          ? new Date((anchor + 30 * 24 * 60 * 60) * 1000).toISOString()
          : null

        const isActive = ['active', 'trialing'].includes(subscription.status)

        await supabase
          .from('profiles')
          .update({
            ...(plan && { plan }),
            status: isActive ? 'active' : 'inactive',
            ...(nextBilling && { next_billing: nextBilling }),
          })
          .eq('id', userId)
        break
      }

      // ── customer.subscription.deleted ─────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId       = subscription.metadata?.supabase_user_id
        if (!userId) break

        await supabase
          .from('profiles')
          .update({ status: 'inactive' })
          .eq('id', userId)
        break
      }

      default:
        // Unhandled event type – log and ignore
        console.log(`[webhook] Unbehandeltes Event: ${event.type}`)
    }
  } catch (err) {
    console.error('[webhook] Fehler beim Verarbeiten:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
