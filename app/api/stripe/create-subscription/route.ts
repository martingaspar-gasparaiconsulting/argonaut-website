import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase-server'

// ─── Plan config ──────────────────────────────────────────────────────────────

type Plan = 'starter' | 'professional' | 'business' | 'enterprise'

const PLAN_PRICES: Record<Plan, number> = {
  starter:      300000,  // 3 000 EUR in cents
  professional: 400000,  // 4 000 EUR in cents
  business:     700000,  // 7 000 EUR in cents
  enterprise:   900000,  // 9 000 EUR in cents
}

const PLAN_NAMES: Record<Plan, string> = {
  starter:      'ARGONAUT Starter',
  professional: 'ARGONAUT Professional',
  business:     'ARGONAUT Business',
  enterprise:   'ARGONAUT Enterprise',
}

// ─── POST /api/stripe/create-subscription ─────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user || userError) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: { iban: string; accountHolderName: string; plan: Plan }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const { iban, accountHolderName, plan } = body

  if (!iban || !accountHolderName || !plan) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  const priceInCents = PLAN_PRICES[plan]
  if (!priceInCents) {
    return NextResponse.json({ error: 'Ungültiger Plan' }, { status: 400 })
  }

  // ── 3. Fetch Supabase profile for email ───────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const customerEmail = (profile?.email as string | null) || user.email!
  const customerName  = accountHolderName || (profile?.full_name as string | null) || customerEmail

  try {
    // ── 4. Create Stripe customer ─────────────────────────────────────────
    const customer = await stripe.customers.create({
      email: customerEmail,
      name:  customerName,
      metadata: { supabase_user_id: user.id, plan },
    })

    // ── 5. Create SEPA payment method ──────────────────────────────────────
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'sepa_debit',
      sepa_debit: { iban },
      billing_details: {
        name:  customerName,
        email: customerEmail,
      },
    })

    // ── 6. Attach payment method to customer ───────────────────────────────
    await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id })

    // ── 7. Set as default payment method ───────────────────────────────────
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    })

    // ── 8. Create Stripe product + subscription ────────────────────────────
    // v22 API: price_data requires an existing product ID (no inline product_data)
    const product = await stripe.products.create({ name: PLAN_NAMES[plan] })

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          currency:    'eur',
          product:     product.id,
          unit_amount: priceInCents,
          recurring:   { interval: 'month' },
        },
      }],
      default_payment_method: paymentMethod.id,
      payment_settings: {
        payment_method_types:          ['sepa_debit'],
        save_default_payment_method:   'on_subscription',
      },
      metadata: { supabase_user_id: user.id, plan },
    })

    // ── 9. Update Supabase profile ─────────────────────────────────────────
    // v22 API: current_period_end removed; derive next billing from billing_cycle_anchor
    const anchor      = subscription.billing_cycle_anchor          // Unix seconds
    const nextBilling = new Date((anchor + 30 * 24 * 60 * 60) * 1000).toISOString()

    await supabase
      .from('profiles')
      .update({ plan, status: 'active', next_billing: nextBilling })
      .eq('id', user.id)

    return NextResponse.json({
      success:        true,
      subscriptionId: subscription.id,
      status:         subscription.status,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[create-subscription]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
