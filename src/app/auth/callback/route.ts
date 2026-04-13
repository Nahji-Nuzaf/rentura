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
  // PRIORITY: 1. URL Param, 2. Google Metadata, 3. Hard check later
  const resolvedRole = roleFromUrl || user.user_metadata?.role

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, active_role')
    .eq('id', user.id)
    .single()

  if (!existing) {
    // If no role found at all, we MUST NOT default to landlord
    if (!resolvedRole) return NextResponse.redirect(`${origin}/onboarding`)

    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.avatar_url || null,
      active_role: resolvedRole,
      roles: [resolvedRole],
    })
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // If they are logging in and we have a new role intent, update it
  const finalRole = existing.active_role || resolvedRole

  if (!finalRole) return NextResponse.redirect(`${origin}/onboarding`)

  return NextResponse.redirect(`${origin}/${finalRole}`)
}