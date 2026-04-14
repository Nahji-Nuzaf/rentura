import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

function roleToPath(role: string): string {
  if (role === 'tenant') return '/tenant'
  if (role === 'seeker') return '/seeker'
  return '/landlord'
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code        = requestUrl.searchParams.get('code')
  const roleFromUrl = requestUrl.searchParams.get('role')

  console.log('=== AUTH CALLBACK ===')
  console.log('Full URL:', request.url)
  console.log('code:', code ? 'present' : 'missing')
  console.log('role from URL:', roleFromUrl)

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/login`)
  }

  const tempResponse = new NextResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
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
    console.error('Session exchange error:', error?.message)
    return NextResponse.redirect(`${requestUrl.origin}/login`)
  }

  const user = data.user
  console.log('User ID:', user.id)
  console.log('User email:', user.email)

  // Check profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .maybeSingle()

  console.log('Existing profile:', profile)

  let redirectTo: string

  if (!profile) {
    const role = roleFromUrl || 'landlord'
    console.log('NEW USER - creating profile with role:', role)

    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: role,
      roles: [role],
    }, { onConflict: 'id' })

    redirectTo = `${requestUrl.origin}/onboarding`
  } else {
    const role = profile.active_role
    console.log('EXISTING USER - profile role:', role)
    redirectTo = role ? `${requestUrl.origin}${roleToPath(role)}` : `${requestUrl.origin}/onboarding`
  }

  console.log('Redirecting to:', redirectTo)

  const finalResponse = NextResponse.redirect(redirectTo)
  tempResponse.cookies.getAll().forEach(cookie => {
    finalResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  return finalResponse
}