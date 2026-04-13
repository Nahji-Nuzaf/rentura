import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const roleFromUrl = searchParams.get('role')

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { cookieStore.set(name, value, options) },
        remove(name: string, options: any) { cookieStore.set(name, '', options) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const user = data.user

  // PRIORITY: 1. URL param (set by modal), 2. Google OAuth metadata
  const resolvedRole = roleFromUrl || user.user_metadata?.role || null

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, active_role')
    .eq('id', user.id)
    .single()

  if (!existing) {
    // Brand-new user — no profile yet
    if (!resolvedRole) {
      // No role info at all — send to onboarding to pick one
      return NextResponse.redirect(`${origin}/onboarding`)
    }

    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.avatar_url || null,
      active_role: resolvedRole,
      roles: [resolvedRole],
    })

    // Redirect to the role-specific dashboard
    return NextResponse.redirect(`${origin}/${resolvedRole}`)
  }

  // Returning user — use their stored role (or fall back to resolved if somehow missing)
  const finalRole = existing.active_role || resolvedRole

  if (!finalRole) {
    // Edge case: profile exists but has no role — send to onboarding
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // Redirect to the role-specific dashboard
  return NextResponse.redirect(`${origin}/${finalRole}`)
}
