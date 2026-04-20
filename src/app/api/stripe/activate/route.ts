import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { sessionId, userId, plan } = await request.json()

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the session with Stripe to make sure it's real
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    // Verify the session belongs to this user
    if (session.metadata?.supabase_user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedPlan = session.metadata?.plan || plan || 'pro'
    const customerId   = session.customer as string
    const subId        = session.subscription as string

    // Upsert subscription record
    const { error } = await supabaseAdmin.from('subscriptions').upsert({
      profile_id:             userId,
      role:                   'landlord',
      plan:                   resolvedPlan,
      status:                 'active',
      stripe_customer_id:     customerId,
      stripe_subscription_id: subId,
    }, { onConflict: 'profile_id' })

    if (error) {
      console.error('Supabase upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ Subscription activated: user=${userId}, plan=${resolvedPlan}`)
    return NextResponse.json({ success: true, plan: resolvedPlan })
  } catch (err: any) {
    console.error('Activate subscription error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
