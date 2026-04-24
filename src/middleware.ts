import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {



  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Use getUser() instead of getSession() for better security
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Admin protection
  if (pathname.startsWith('/admin')) {
    const adminCookie = request.cookies.get('admin_auth')?.value
    const adminSecret = process.env.ADMIN_SECRET || 'rentura-admin-2024'
    if (pathname !== '/admin/login' && adminCookie !== adminSecret) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // 1. Define protected and auth routes
  const protectedPrefixes = ['/landlord', '/tenant', '/seeker', '/onboarding']
  const isProtected = protectedPrefixes.some(p => pathname.startsWith(p))
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  // 2. If user is NOT logged in and trying to access protected routes
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 3. If user IS logged in and trying to access login/signup
  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('active_role')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.active_role || 'landlord'

    // Redirect to their specific dashboard
    const url = request.nextUrl.clone()
    if (role === 'tenant') url.pathname = '/tenant'
    else if (role === 'seeker') url.pathname = '/seeker'
    else url.pathname = '/landlord'

    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/callback (important: exclude your callback route!)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}