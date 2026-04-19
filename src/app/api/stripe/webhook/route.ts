import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
})

// Service role client — bypasses RLS so webhook can write freely
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const body = await request.text()
    const sig = request.headers.get('stripe-signature') || ''
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

    let event: Stripe.Event

    // ── Signature verification ──
    // In production (Vercel): real whsec_ from Stripe dashboard webhook
    // In local dev: set STRIPE_WEBHOOK_SECRET=whsec_placeholder to skip
    if (webhookSecret && webhookSecret !== 'whsec_placeholder') {
        try {
            event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
        } catch (err: any) {
            console.error('❌ Webhook signature error:', err.message)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
        }
    } else {
        // Local dev — skip signature verification
        try {
            event = JSON.parse(body) as Stripe.Event
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
        }
    }

    console.log('✅ Stripe webhook received:', event.type)

    switch (event.type) {

        // ── Payment successful → activate subscription ──
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.metadata?.supabase_user_id
            const plan = session.metadata?.plan || 'pro'
            const subId = session.subscription as string
            const custId = session.customer as string

            if (!userId) {
                console.error('❌ No supabase_user_id in session metadata')
                break
            }

            const { error } = await supabase.from('subscriptions').upsert({
                profile_id: userId,
                role: 'landlord',
                plan: plan,
                status: 'active',
                stripe_customer_id: custId,
                stripe_subscription_id: subId,
            }, { onConflict: 'profile_id' })

            if (error) console.error('❌ Supabase upsert error:', error.message)
            else console.log(`✅ Subscription activated — user: ${userId}, plan: ${plan}`)
            break
        }

        // ── Subscription updated (e.g. plan change, renewal) ──
        case 'customer.subscription.updated': {
            const sub = event.data.object as Stripe.Subscription
            const userId = sub.metadata?.supabase_user_id

            if (!userId) break

            const status = sub.status === 'active' ? 'active' : 'inactive'

            await supabase.from('subscriptions').upsert({
                profile_id: userId,
                status: status,
                stripe_subscription_id: sub.id,
            }, { onConflict: 'profile_id' })

            console.log(`🔄 Subscription updated — user: ${userId}, status: ${status}`)
            break
        }

        // ── Subscription cancelled ──
        case 'customer.subscription.deleted': {
            const sub = event.data.object as Stripe.Subscription
            const userId = sub.metadata?.supabase_user_id

            if (!userId) break

            await supabase.from('subscriptions')
                .update({ status: 'inactive', plan: 'free' })
                .eq('profile_id', userId)

            console.log(`❌ Subscription cancelled — user: ${userId}`)
            break
        }

        // ── Payment failed ──
        case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice
            const customerId = invoice.customer as string

            const { data: sub } = await supabase
                .from('subscriptions')
                .select('profile_id')
                .eq('stripe_customer_id', customerId)
                .maybeSingle()

            if (sub?.profile_id) {
                await supabase.from('subscriptions')
                    .update({ status: 'past_due' })
                    .eq('profile_id', sub.profile_id)
                console.log(`⚠️ Payment failed — customer: ${customerId}`)
            }
            break
        }

        default:
            console.log(`ℹ️ Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
}
