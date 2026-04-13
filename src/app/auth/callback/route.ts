import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const role = searchParams.get('role') // 1. Check URL param directly

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
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
  
  // 2. Check user_metadata as backup (Supabase saves queryParams here)
  // 3. NO DEFAULT FALLBACK to 'landlord' here
  const resolvedRole = role || user.user_metadata?.role

  // Check if profile already exists in the database
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, active_role')
    .eq('id', user.id)
    .single()

  if (!existing) {
    // NEW USER: If no role found in URL or Metadata, we cannot create profile yet
    if (!resolvedRole) {
      return NextResponse.redirect(`${origin}/onboarding/select-role`)
    }

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

  // EXISTING USER: If they clicked a different card than their current role
  if (role && existing.active_role !== role) {
    await supabase.from('profiles').update({
      active_role: role,
      roles: [role], // Or use array_append if you want to keep both
    }).eq('id', user.id)
  }

  // FINAL ROUTING: Determine where to send the user based on verified database role
  const finalRole = existing.active_role || resolvedRole

  if (!finalRole) {
    return NextResponse.redirect(`${origin}/onboarding/select-role`)
  }

  const destinations: Record<string, string> = {
    landlord: '/landlord',
    tenant: '/tenant',
    seeker: '/seeker',
  }

  const destination = destinations[finalRole] || '/onboarding'
  return NextResponse.redirect(`${origin}${destination}`)
}