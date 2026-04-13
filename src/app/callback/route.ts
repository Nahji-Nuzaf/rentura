import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const role = searchParams.get('role') // passed by Google OAuth redirect
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }
  const cookieStore = await cookies() // ← await required in Next.js 15
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Parameters<typeof cookieStore.set>[2]) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: Parameters<typeof cookieStore.set>[2]) {
          cookieStore.set(name, '', options)
        },
      },
    }
  )
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }
  const user = data.user
  // Determine the role:
  // 1. From OAuth query param (Google signup)
  // 2. From user_metadata set during email signup
  // 3. Default to 'landlord'
  const resolvedRole = role || user.user_metadata?.role || 'landlord'
  // Check if profile already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, active_role')
    .eq('id', user.id)
    .single()
  if (!existing) {
    // New user (Google OAuth path) — create profile
    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.avatar_url || null,
      active_role: resolvedRole,
      roles: [resolvedRole],
    })
    // New user always goes to onboarding
    return NextResponse.redirect(`${origin}/onboarding`)
  }
  // Existing user — update role if it came in via OAuth param
  if (role && existing.active_role !== role) {
    await supabase.from('profiles').update({
      active_role: role,
      roles: [role],
    }).eq('id', user.id).select()
  }
  // Existing user — route to their dashboard
  const activeRole = existing.active_role || resolvedRole
  const destination =
    activeRole === 'landlord' ? '/landlord' :
    activeRole === 'tenant'   ? '/tenant'   :
    activeRole === 'seeker'   ? '/seeker'   : '/onboarding'

  return NextResponse.redirect(`${origin}${destination}`)
}