'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrency } from '@/lib/useCurrency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  full_name: string
  preferred_city: string
  budget: number
  preferred_type: string
  active_role: string
}

interface Listing {
  id: string
  title: string
  price: number
  city: string
  property_type: string
  bedrooms: number
  bathrooms: number
  images: string[]
  created_at: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SeekerDashboard() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { fmtMoney } = useCurrency()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [recommended, setRecommended] = useState<Listing[]>([])
  const [recentListings, setRecentListings] = useState<Listing[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'recommended' | 'recent'>('recommended')

  useEffect(() => {
    async function load() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) { router.push('/login'); return }

        const { data: prof, error: profError } = await supabase
          .from('profiles')
          .select('full_name, preferred_city, budget, preferred_type, active_role')
          .eq('id', user.id)
          .single()

        if (profError) throw profError
        if (!prof || prof.active_role !== 'seeker') { router.push('/login'); return }
        setProfile(prof)

        // Recommended: filter by seeker's preferences
        let recQuery = supabase
          .from('listings')
          .select('id, title, rent_amount as price, city, property_type, bedrooms, bathrooms, photos as images, created_at')
          .eq('status', 'active')
        if (prof.preferred_city) recQuery = recQuery.ilike('city', `%${prof.preferred_city}%`)
        if (prof.budget)         recQuery = recQuery.lte('price', prof.budget)
        if (prof.preferred_type) recQuery = recQuery.eq('property_type', prof.preferred_type)
        const { data: recData, error: recError } = await recQuery.limit(6)
        if (recError) throw recError
        setRecommended((recData as unknown as Listing[]) || [])

        // Recent: newest listings overall
        const { data: recentData, error: recentError } = await supabase
          .from('listings')
          .select('id, title, rent_amount as price, city, property_type, bedrooms, bathrooms, photos as images, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(6)
        if (recentError) throw recentError
        setRecentListings((recentData as unknown as Listing[]) || [])

        // Saved listing IDs
        const { data: savedData, error: savedError } = await supabase
          .from('saved_listings')
          .select('listing_id')
          .eq('user_id', user.id)
        if (savedError) throw savedError
        setSavedIds((savedData || []).map((s: any) => s.listing_id))

      } catch (err: any) {
        console.error('Dashboard load error:', err)
        setError(err?.message || 'Something went wrong loading your dashboard.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function toggleSave(listingId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (savedIds.includes(listingId)) {
      await supabase.from('saved_listings').delete()
        .eq('user_id', user.id).eq('listing_id', listingId)
      setSavedIds(prev => prev.filter(id => id !== listingId))
    } else {
      await supabase.from('saved_listings').insert({ user_id: user.id, listing_id: listingId })
      setSavedIds(prev => [...prev, listingId])
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    router.push(q ? `/seeker/listings?q=${encodeURIComponent(q)}` : '/seeker/listings')
  }

  // ─── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F4F6FA' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // ─── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F4F6FA', gap: 16 }}>
        <span style={{ fontSize: 40 }}>⚠️</span>
        <p style={{ fontFamily: 'sans-serif', fontSize: 16, color: '#EF4444', maxWidth: 400, textAlign: 'center' }}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 14, fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    )
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayListings = activeTab === 'recommended' ? recommended : recentListings
  const newToday = recentListings.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length

  return (
    <div style={S.root}>
      <GlobalStyles />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside style={S.sidebar}>
        <div style={{ marginBottom: 34, paddingLeft: 4 }}>
          <span style={S.logoText}>Rentura</span>
          <span style={S.logoSub}>Seeker Portal</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <NavLink href="/seeker"          active label="Dashboard"       icon="home"     />
          <NavLink href="/seeker/listings"        label="Browse Listings" icon="search"   />
          <NavLink href="/seeker/saved"           label="Saved"           icon="heart"    badge={savedIds.length} />
          <NavLink href="/seeker/messages"        label="Messages"        icon="message"  />
          <NavLink href="/seeker/settings"        label="Settings"        icon="settings" />
        </nav>

        <div style={S.sidebarFooter}>
          <div style={S.avatar}>{profile?.full_name?.[0] ?? 'S'}</div>
          <div>
            <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 1 }}>
              {profile?.full_name ?? 'Seeker'}
            </p>
            <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 11, color: '#475569' }}>Seeker</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main style={S.main}>

        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 30 }}>
          <h1 style={S.pageTitle}>{greeting}, {firstName} 👋</h1>
          <p style={S.pageSubtitle}>
            {profile?.preferred_city ? `Searching in ${profile.preferred_city}` : 'Find your perfect home'}
            {profile?.budget ? ` · Budget up to ${fmtMoney(profile.budget)}/mo` : ''}
          </p>
        </div>

        {/* Search bar */}
        <div className="fade-up" style={{ animationDelay: '0.07s', marginBottom: 32 }}>
          <form onSubmit={handleSearch} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 610 }}>
            <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', pointerEvents: 'none' }}>
              <ISearch size={17} />
            </div>
            <input
              className="s-input"
              type="text"
              placeholder="Search city, neighborhood, or property type…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="s-btn">Search</button>
          </form>
        </div>

        {/* Stats row */}
        <div className="fade-up" style={{ animationDelay: '0.13s', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 36 }}>
          <StatCard emoji="❤️" value={savedIds.length} label="Saved properties" />
          <StatCard emoji="✨" value={recommended.length} label="Recommendations" />
          <StatCard emoji="🆕" value={newToday} label="New today" />
          <StatCard emoji="💰" value={profile?.budget ? `${fmtMoney(profile.budget)}/mo` : '—'} label="Your budget" />
        </div>

        {/* Listings section */}
        <div className="fade-up" style={{ animationDelay: '0.19s' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4 }}>
              <button className={`tab${activeTab === 'recommended' ? ' active' : ''}`} onClick={() => setActiveTab('recommended')}>
                ✨ Recommended for you
              </button>
              <button className={`tab${activeTab === 'recent' ? ' active' : ''}`} onClick={() => setActiveTab('recent')}>
                🆕 Recently added
              </button>
            </div>
            <a href="/seeker/listings" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, fontWeight: 600, color: '#2563EB', textDecoration: 'none' }}>
              View all listings →
            </a>
          </div>

          {/* Grid or empty */}
          {displayListings.length === 0 ? (
            <div style={S.empty}>
              <span style={{ fontSize: 40, display: 'block', marginBottom: 14 }}>🏠</span>
              <p style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>No listings found</p>
              <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, color: '#64748B', marginBottom: 22 }}>
                {activeTab === 'recommended'
                  ? 'Update your preferences in Settings to get better matches.'
                  : 'Check back soon — new listings appear here first.'}
              </p>
              <a href="/seeker/listings" style={S.emptyBtn}>Browse all listings</a>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
              {displayListings.map((listing, i) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={savedIds.includes(listing.id)}
                  onSave={() => toggleSave(listing.id)}
                  fmtMoney={fmtMoney}
                  delay={i * 0.05}
                  onClick={() => router.push(`/seeker/listings/${listing.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function NavLink({ href, label, icon, active, badge }: {
  href: string; label: string; icon: string; active?: boolean; badge?: number
}) {
  return (
    <a href={href} className={`nav-link${active ? ' active' : ''}`}>
      <span style={{ display: 'flex', flexShrink: 0, width: 17 }}>
        {icon === 'home'     && <IHome />}
        {icon === 'search'   && <ISearch />}
        {icon === 'heart'    && <IHeart />}
        {icon === 'message'  && <IMessage />}
        {icon === 'settings' && <ISettings />}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {!!badge && badge > 0 && (
        <span style={{ background: '#2563EB', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
          {badge}
        </span>
      )}
    </a>
  )
}

function StatCard({ emoji, value, label }: { emoji: string; value: string | number; label: string }) {
  return (
    <div style={S.statCard}>
      <span style={{ fontSize: 22, marginBottom: 10, display: 'block' }}>{emoji}</span>
      <span style={S.statValue}>{value}</span>
      <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 13, color: '#64748B' }}>{label}</span>
    </div>
  )
}

function ListingCard({ listing, isSaved, onSave, fmtMoney, delay, onClick }: {
  listing: Listing; isSaved: boolean; onSave: () => void
  fmtMoney: (n: number) => string; delay: number; onClick: () => void
}) {
  const img = listing.images?.[0]
  return (
    <div className="listing-card" style={{ animationDelay: `${delay}s` }}>
      <div
        style={{ position: 'relative', height: 184, background: '#F1F5F9', overflow: 'hidden', cursor: 'pointer' }}
        onClick={onClick}
      >
        {img
          ? <img src={img} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 38 }}>🏠</div>
        }
        <span style={{ position: 'absolute', top: 10, left: 10, background: '#fff', borderRadius: 7, padding: '3px 9px', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 11, fontWeight: 700, color: '#0F172A', boxShadow: '0 1px 6px rgba(0,0,0,0.12)' }}>
          {listing.property_type || 'Apartment'}
        </span>
        <button
          className="save-btn"
          style={{ position: 'absolute', top: 9, right: 9 }}
          onClick={e => { e.stopPropagation(); onSave() }}
          aria-label={isSaved ? 'Unsave' : 'Save listing'}
        >
          <IHeart filled={isSaved} size={15} color={isSaved ? '#EF4444' : '#64748B'} />
        </button>
      </div>
      <div style={{ padding: '14px 16px 16px', cursor: 'pointer' }} onClick={onClick}>
        <p style={{ fontFamily: 'Fraunces,serif', fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {listing.title}
        </p>
        <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 12, color: '#64748B', marginBottom: 10 }}>
          📍 {listing.city}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 16, fontWeight: 700, color: '#2563EB' }}>
            {fmtMoney(listing.price)}<span style={{ fontSize: 11, fontWeight: 400, color: '#94A3B8' }}>/mo</span>
          </span>
          <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 12, color: '#64748B' }}>
            {listing.bedrooms}bd · {listing.bathrooms}ba
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Global styles ────────────────────────────────────────────────────────────

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      @keyframes spin   { to { transform: rotate(360deg) } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
      .fade-up { animation: fadeUp 0.42s ease both; }

      .nav-link {
        display: flex; align-items: center; gap: 10px; padding: 9px 12px;
        border-radius: 10px; color: #94A3B8;
        font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 500;
        text-decoration: none; transition: background 0.15s, color 0.15s;
      }
      .nav-link:hover  { background: rgba(255,255,255,0.07); color: #CBD5E1; }
      .nav-link.active { background: rgba(37,99,235,0.22); color: #fff; }

      .s-input {
        flex: 1; padding: 13px 16px 13px 44px; border: 1.5px solid #E2E8F0;
        border-radius: 12px; font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 15px; color: #1E293B; background: #fff; outline: none;
        transition: border-color 0.2s;
      }
      .s-input:focus { border-color: #2563EB; }
      .s-btn {
        background: #2563EB; color: #fff; border: none; border-radius: 10px;
        padding: 0 22px; height: 46px; font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
        transition: background 0.15s;
      }
      .s-btn:hover { background: #1D4ED8; }

      .tab {
        padding: 8px 15px; border-radius: 8px; border: none; cursor: pointer;
        font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 600;
        color: #64748B; background: none; transition: background 0.15s, color 0.15s;
      }
      .tab:hover  { background: #E9EEF5; color: #0F172A; }
      .tab.active { background: #EFF6FF; color: #2563EB; }

      .listing-card {
        background: #fff; border-radius: 16px; border: 1px solid #E2E8F0;
        overflow: hidden; animation: fadeUp 0.38s ease both;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .listing-card:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(37,99,235,0.10); }

      .save-btn {
        background: #fff; border: none; border-radius: 8px; padding: 6px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 6px rgba(0,0,0,0.13); transition: transform 0.15s;
      }
      .save-btn:hover { transform: scale(1.18); }
    `}</style>
  )
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', background: '#F4F6FA',
    display: 'flex', fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  sidebar: {
    width: 240, background: '#0F172A', flexShrink: 0,
    display: 'flex', flexDirection: 'column', padding: '28px 14px',
    position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 10,
  },
  logoText: {
    display: 'block', fontFamily: 'Fraunces, serif',
    fontSize: 22, fontWeight: 700, color: '#fff',
  } as React.CSSProperties,
  logoSub: {
    display: 'block', fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 10, fontWeight: 600, color: '#475569',
    letterSpacing: '0.09em', textTransform: 'uppercase', marginTop: 3,
  } as React.CSSProperties,
  sidebarFooter: {
    display: 'flex', alignItems: 'center', gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16,
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%', background: '#2563EB',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14,
    fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  main: { marginLeft: 240, flex: 1, padding: '40px 44px' },
  pageTitle: {
    fontFamily: 'Fraunces, serif', fontSize: 30,
    fontWeight: 700, color: '#0F172A', marginBottom: 5,
  },
  pageSubtitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 15, color: '#64748B',
  },
  statCard: {
    background: '#fff', borderRadius: 14, padding: '20px 20px 18px',
    border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column',
  },
  statValue: {
    fontFamily: 'Fraunces, serif', fontSize: 22,
    fontWeight: 700, color: '#0F172A', marginBottom: 3,
  },
  empty: {
    textAlign: 'center', padding: '64px 0', background: '#fff',
    borderRadius: 16, border: '1.5px dashed #CBD5E1',
  },
  emptyBtn: {
    display: 'inline-block', background: '#2563EB', color: '#fff',
    padding: '10px 24px', borderRadius: 10, textDecoration: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 600,
  },
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const

function IHome() { return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> }
function ISearch({ size = 17 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" {...sw}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> }
function IHeart({ filled = false, size = 17, color }: { filled?: boolean; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? (color || '#EF4444') : 'none'} stroke={color || 'currentColor'} strokeWidth="2"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
}
function IMessage() { return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> }
function ISettings() { return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg> }
