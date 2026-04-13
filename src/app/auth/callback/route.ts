import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  // const cookieStore = cookies()

  const code = searchParams.get('code')
  const roleFromUrl = searchParams.get('role')

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const response = NextResponse.redirect(`${origin}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return response.cookies.get(name)?.value
        },
        set(name: string, value: string, options) {
          response.cookies.set(name, value, options)
        },
        remove(name: string, options) {
          response.cookies.set(name, '', options)
        },
      },
    }
  )

  // 🔑 Exchange code for session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const user = data.user

  // 🔍 Check profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // 🆕 NEW USER
  if (!profile) {
    const role = roleFromUrl || 'tenant'

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || '',
        active_role: role,
        roles: [role],
      },
      { onConflict: 'id' }
    )

    return NextResponse.redirect(`${origin}/dashboard/${role}`)
  }

  // 🔁 EXISTING USER
  return NextResponse.redirect(
    `${origin}/dashboard/${profile.active_role}`
  )
}