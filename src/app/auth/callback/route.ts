import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Utility to map roles to their respective dashboard paths
 */
function roleToPath(role: string): string {
  if (role === 'tenant') return '/tenant'
  if (role === 'seeker') return '/seeker'
  if (role === 'landlord') return '/landlord'
  return '/login?error=no_role_found' // Catch the "shitty" bug here
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const roleFromUrl = searchParams.get('role') // Passed from signup OAuth redirect
  console.log('Callback Debug:', { code: !!code, roleFromUrl });
  // 1. If no code from Google, redirect to login
  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  /**
   * 2. We create a "base" response object.
   * This object will catch the cookies set by Supabase during the code exchange.
   */
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
          // Writing cookies to our base response object
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          // Removing cookies from our base response object
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // 3. Exchange the auth code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user) {
    console.error('Auth exchange failed:', error?.message)
    return NextResponse.redirect(`${origin}/login?error=invalid_session`)
  }

  const user = data.user

  // // 4. Check if profile exists in the database
  // const { data: profile } = await supabase
  //   .from('profiles')
  //   .select('active_role, roles')
  //   .eq('id', user.id)
  //   .maybeSingle()

  // 4. Check if profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active_role')
    .eq('id', user.id)
    .single(); // Using .single() to be precise

  // let finalRole = 'landlord'
  let finalRole: string;

  // if (!profile) {
  //   // NEW USER logic — Create the profile using the role from the URL param
  //   finalRole = roleFromUrl || 'landlord'

  //   const { error: upsertError } = await supabase.from('profiles').upsert({
  //     id: user.id,
  //     email: user.email,
  //     full_name: user.user_metadata?.full_name || '',
  //     active_role: finalRole,
  //     roles: [finalRole],
  //   }, { onConflict: 'id' })

  //   if (upsertError) console.error('Profile creation failed:', upsertError.message)
  // } else {
  //   // EXISTING USER logic — Use the role already saved in your DB
  //   finalRole = profile.active_role || 'landlord'
  // }

  // /**
  //  * 5. FINAL REDIRECT & COOKIE SYNC
  //  * Next.js requires us to return a response that actually contains the cookies.
  //  * We create the final redirect and copy all cookies from our 'base' response.
  //  */
  // const targetPath = roleToPath(finalRole)
  // const finalResponse = NextResponse.redirect(`${origin}${targetPath}`)

  if (profileError || !profile) {
    // NEW USER - This is where the "Tenant" selection MUST be captured
    finalRole = roleFromUrl || 'landlord'; 
    
    // Create profile immediately
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      active_role: finalRole,
      roles: [finalRole],
    });
  } else {
    // EXISTING USER - Always use what's in the DB
    finalRole = profile.active_role;
  }

  // 5. Final Redirect
  const targetPath = roleToPath(finalRole);
  const finalResponse = NextResponse.redirect(new URL(targetPath, request.url));

  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie.name, cookie.value)
  })

  return finalResponse
}