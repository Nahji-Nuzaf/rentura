import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})

// Service role to write subscription immediately on checkout
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { priceId, plan } = await request.json()

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID is required' }, { status: 400 })
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const tempRes = new NextResponse()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieHeader.split(';')
              .find(c => c.trim().startsWith(`${name}=`))
              ?.split('=').slice(1).join('=').trim()
          },
          set(name: string, value: string, options: any) {
            tempRes.cookies.set(name, value, options)
          },
          remove(name: string, options: any) {
            tempRes.cookies.set(name, '', { ...options, maxAge: 0 })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles').select('full_name, email').eq('id', user.id).single()

    // Get or create Stripe customer
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions').select('stripe_customer_id')
      .eq('profile_id', user.id).maybeSingle()

    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email!,
        name: profile?.full_name || '',
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
    }

    const origin = new URL(request.url).origin

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/landlord/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}&user_id=${user.id}&plan=${plan || 'pro'}`,
      cancel_url: `${origin}/landlord/upgrade?cancelled=true`,
      metadata: {
        supabase_user_id: user.id,
        plan: plan || 'pro',
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan: plan || 'pro',
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
