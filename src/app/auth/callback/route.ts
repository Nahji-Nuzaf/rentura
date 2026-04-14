import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

function roleToPath(role: string): string {
  if (role === 'tenant') return '/tenant'
  if (role === 'seeker') return '/seeker'
  return '/landlord'
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader
    .split(';')
    .find(c => c.trim().startsWith(`${name}=`))
  return match ? match.split('=').slice(1).join('=').trim() : null
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/login`)
  }

  // Read role from cookie (set before Google OAuth redirect)
  const cookieHeader = request.headers.get('cookie')
  const roleFromCookie = getCookieValue(cookieHeader, 'pending_role')

  console.log('=== AUTH CALLBACK ===')
  console.log('role from cookie:', roleFromCookie)

  const tempResponse = new NextResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return getCookieValue(cookieHeader, name) ?? undefined
        },
        set(name: string, value: string, options: any) {
          tempResponse.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          tempResponse.cookies.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user) {
    console.error('Session exchange error:', error?.message)
    return NextResponse.redirect(`${requestUrl.origin}/login`)
  }

  const user = data.user
  console.log('User:', user.email)

  // Check existing profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .maybeSingle()

  console.log('Existing profile:', profile)
  console.log('Role from cookie:', roleFromCookie)

  let redirectTo: string

  if (roleFromCookie) {
    // ── SIGNUP flow: role cookie present — update/create profile with new role ──
    console.log('SIGNUP FLOW - setting role:', roleFromCookie)
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: roleFromCookie,
      roles: [roleFromCookie],
    }, { onConflict: 'id' })
    redirectTo = `${requestUrl.origin}/onboarding`
  } else if (!profile) {
    // ── No profile, no cookie — new user, default to landlord ──
    console.log('NEW USER no cookie - defaulting to landlord')
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: 'landlord',
      roles: ['landlord'],
    }, { onConflict: 'id' })
    redirectTo = `${requestUrl.origin}/onboarding`
  } else {
    // ── LOGIN flow: existing profile, no cookie — go to dashboard ──
    const role = profile.active_role || 'landlord'
    console.log('LOGIN FLOW - going to dashboard:', role)
    redirectTo = `${requestUrl.origin}${roleToPath(role)}`
  }

  console.log('Redirecting to:', redirectTo)

  const finalResponse = NextResponse.redirect(redirectTo)

  // Copy session cookies
  tempResponse.cookies.getAll().forEach(cookie => {
    finalResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  // Clear the pending_role cookie
  finalResponse.cookies.set('pending_role', '', { maxAge: 0, path: '/' })

  return finalResponse
}