import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function roleToPath(role: string): string {
  if (role === 'tenant') return '/tenant'
  if (role === 'seeker') return '/seeker'
  if (role === 'landlord') return '/landlord'
  return '/seeker' // Default fallback
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const roleFromUrl = searchParams.get('role') 

  // 1. Exit if no code
  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // 2. Create base response to capture cookies
  let response = NextResponse.redirect(`${origin}/onboarding`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // 3. Exchange code for session
  const { data, error: authError } = await supabase.auth.exchangeCodeForSession(code)

  if (authError || !data?.user) {
    return NextResponse.redirect(`${origin}/login?error=invalid_session`)
  }

  const user = data.user

  // 4. Check for existing profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .maybeSingle() // Use maybeSingle to avoid thrown errors if not found

  let finalRole: string

  if (!profile) {
    // NEW USER: Use the role from URL, or default to seeker if URL was empty
    finalRole = roleFromUrl || 'seeker'
    
    // CRITICAL: Await the database creation completely
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: finalRole,
      roles: [finalRole],
    }, { onConflict: 'id' })

    if (upsertError) {
      console.error('Profile Creation Error:', upsertError.message)
    }
  } else {
    // EXISTING USER: Keep their saved role
    finalRole = profile.active_role
  }

  // 5. Final Redirect Construction
  const targetPath = roleToPath(finalRole)
  const finalResponse = NextResponse.redirect(new URL(targetPath, origin))

  // 6. Sync cookies from the exchange to the final response
  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie.name, cookie.value)
  })

  return finalResponse
}