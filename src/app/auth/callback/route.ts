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
  const roleFromUrl = searchParams.get('role') // passed from signup OAuth redirect

  if (!code) {
    // return NextResponse.redirect(`${origin}/login`)
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
    
  }

  const response = NextResponse.redirect(`${origin}/landlord`) // placeholder, overwritten below

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return response.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          response.cookies.set(name, '', options)
        },
      },
    }
  )

  // Exchange code for session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/login?error=invalid_session`)
  }

  const user = data.user

  // Check if profile exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role, roles')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    // NEW USER — use role from URL param (selected in signup modal)
    const role = roleFromUrl || 'landlord'

    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: role,
      roles: [role],
    }, { onConflict: 'id' })

    return NextResponse.redirect(`${origin}${roleToPath(role)}`)
  }

  // EXISTING USER — use their saved role, ignore URL param
  const role = profile.active_role || 'landlord'
  return NextResponse.redirect(`${origin}${roleToPath(role)}`)
}
