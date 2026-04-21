import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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
    return NextResponse.json({ isPro: false, plan: 'free' })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('profile_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  const isPro = sub && (sub.plan === 'pro' || sub.plan === 'business')
  return NextResponse.json({
    isPro: !!isPro,
    plan: sub?.plan || 'free',
    userId: user.id
  })
}
