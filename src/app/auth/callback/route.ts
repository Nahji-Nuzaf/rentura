import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

function roleToPath(role: string): string {
  if (role === 'tenant') return '/tenant'
  if (role === 'seeker') return '/seeker'
  return '/landlord'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code        = searchParams.get('code')
  const roleFromUrl = searchParams.get('role') // only present on signup

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const response = NextResponse.redirect(`${origin}/landlord`) // placeholder

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return response.cookies.get(name)?.value },
        set(name: string, value: string, options: any) { response.cookies.set(name, value, options) },
        remove(name: string, options: any) { response.cookies.set(name, '', options) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const user = data.user

  // Check if profile exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .maybeSingle()

  // ── NEW USER (Google signup) — no profile yet ──
  if (!profile) {
    const role = roleFromUrl || 'landlord'
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: role,
      roles: [role],
    }, { onConflict: 'id' })
    // New users always go to onboarding
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // ── EXISTING USER (Google login) — has profile ──
  const role = profile.active_role

  // Profile exists but no role set — send to onboarding to complete setup
  if (!role) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // Has role — send to their dashboard
  return NextResponse.redirect(`${origin}${roleToPath(role)}`)
}
