import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export async function POST(request: Request) {
  try {
    const { sessionId, userId, plan } = await request.json()

    console.log('=== ACTIVATE SUBSCRIPTION ===')
    console.log('sessionId:', sessionId ? 'present' : 'MISSING')
    console.log('userId:', userId ? 'present' : 'MISSING')
    console.log('plan:', plan)
    console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'present' : 'MISSING')
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'MISSING')
    console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'MISSING')

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
    }

    // Init clients inside function so env vars are always fresh
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Verify with Stripe
    let session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId)
    } catch (stripeErr: any) {
      console.error('Stripe session retrieve error:', stripeErr.message)
      return NextResponse.json({ error: 'Invalid Stripe session: ' + stripeErr.message }, { status: 400 })
    }

    console.log('Stripe session status:', session.status)
    console.log('Stripe payment_status:', session.payment_status)
    console.log('Session metadata:', session.metadata)

    // Accept both paid and complete statuses
    const isComplete = session.status === 'complete' || session.payment_status === 'paid'
    if (!isComplete) {
      return NextResponse.json({
        error: `Payment not completed. Status: ${session.status}, payment: ${session.payment_status}`
      }, { status: 400 })
    }

    // Verify session belongs to this user
    const sessionUserId = session.metadata?.supabase_user_id
    if (sessionUserId && sessionUserId !== userId) {
      console.error(`User mismatch: session=${sessionUserId}, request=${userId}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedPlan = session.metadata?.plan || plan || 'pro'
    const customerId   = session.customer as string
    const subId        = session.subscription as string

    console.log('Upserting subscription:', { userId, resolvedPlan, customerId, subId })

    const { error: upsertError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        profile_id:             userId,
        role:                   'landlord',
        plan:                   resolvedPlan,
        status:                 'active',
        stripe_customer_id:     customerId,
        stripe_subscription_id: subId,
      }, { onConflict: 'profile_id' })

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError)
      return NextResponse.json({ error: 'DB error: ' + upsertError.message }, { status: 500 })
    }

    console.log(`✅ SUCCESS: user=${userId}, plan=${resolvedPlan}`)
    return NextResponse.json({ success: true, plan: resolvedPlan })

  } catch (err: any) {
    console.error('Activate route error:', err)
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}