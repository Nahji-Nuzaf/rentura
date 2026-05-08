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
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // ── Admin guard (unchanged) ──
  if (pathname.startsWith('/admin')) {
    const adminCookie = request.cookies.get('admin_auth')?.value
    const adminSecret = process.env.ADMIN_SECRET || 'rentura-admin-2024'
    if (pathname !== '/admin/login' && adminCookie !== adminSecret) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  const protectedPrefixes = ['/landlord', '/tenant', '/onboarding']
  const seekerProtectedPrefixes = ['/seeker/messages', '/seeker/profile', '/seeker/saved']
  const isProtected =
    protectedPrefixes.some(p => pathname.startsWith(p)) ||
    seekerProtectedPrefixes.some(p => pathname.startsWith(p))
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  const isDashboard =
    pathname.startsWith('/landlord') ||
    pathname.startsWith('/tenant') ||
    pathname.startsWith('/seeker')

  // ── Not logged in → send to login ──
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // Fetch profile once for all logged-in checks
    const { data: profile } = await supabase
      .from('profiles')
      .select('active_role, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.active_role || 'landlord'
    const onboardingDone = profile?.onboarding_completed ?? false

    // ── NEW: Block dashboard access until onboarding is done ──
    if (isDashboard && !onboardingDone) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }

    // ── Already logged in → redirect away from auth pages ──
    if (isAuthPage) {
      if (!onboardingDone) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
      const url = request.nextUrl.clone()
      if (role === 'tenant') url.pathname = '/tenant'
      else if (role === 'seeker') url.pathname = '/seeker'
      else url.pathname = '/landlord'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}