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
  const roleFromUrl = searchParams.get('role')

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // Start with a temporary response to collect cookies
  const tempResponse = new NextResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // Read from request cookies
          return request.headers.get('cookie')
            ?.split(';')
            .find(c => c.trim().startsWith(`${name}=`))
            ?.split('=').slice(1).join('=')
            .trim()
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
    console.error('Auth callback error:', error?.message)
    return NextResponse.redirect(`${origin}/login`)
  }

  const user = data.user

  // Check profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .maybeSingle()

  let redirectTo: string

  if (!profile) {
    // NEW USER — create profile with selected role, send to onboarding
    const role = roleFromUrl || 'landlord'
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: role,
      roles: [role],
    }, { onConflict: 'id' })
    redirectTo = `${origin}/onboarding`
  } else {
    // EXISTING USER — send to their dashboard
    const role = profile.active_role
    redirectTo = role ? `${origin}${roleToPath(role)}` : `${origin}/onboarding`
  }

  // Build final redirect response and copy all cookies from tempResponse
  const finalResponse = NextResponse.redirect(redirectTo)
  tempResponse.cookies.getAll().forEach(cookie => {
    finalResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  return finalResponse
}
