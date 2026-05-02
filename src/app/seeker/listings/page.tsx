'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrency } from '@/lib/useCurrency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  id: string
  title: string
  price: number
  city: string
  property_type: string
  bedrooms: number
  bathrooms: number
  area_sqft: number
  images: string[]
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = ['All', 'Apartment', 'House', 'Studio', 'Condo', 'Townhouse', 'Villa']
const BED_OPTIONS    = ['Any', '1', '2', '3', '4', '5+']
const SORT_OPTIONS   = [
  { label: 'Newest first',       value: 'created_at:desc' },
  { label: 'Price: low to high', value: 'price:asc'       },
  { label: 'Price: high to low', value: 'price:desc'      },
  { label: 'Most bedrooms',      value: 'bedrooms:desc'   },
]
const PAGE_SIZE = 12

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrowseListings() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { fmtMoney } = useCurrency()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userId,     setUserId]     = useState<string | null>(null)
  const [listings,   setListings]   = useState<Listing[]>([])
  const [savedIds,   setSavedIds]   = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading,    setLoading]    = useState(true)

  // Filters
  const [search,       setSearch]       = useState(searchParams.get('q') || '')
  const [propertyType, setPropertyType] = useState('All')
  const [minPrice,     setMinPrice]     = useState('')
  const [maxPrice,     setMaxPrice]     = useState('')
  const [minBeds,      setMinBeds]      = useState('Any')
  const [city,         setCity]         = useState('')
  const [sortBy,       setSortBy]       = useState('created_at:desc')
  const [page,         setPage]         = useState(0)

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function auth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: saved } = await supabase
        .from('saved_listings').select('listing_id').eq('user_id', user.id)
      setSavedIds((saved || []).map((s: any) => s.listing_id))
    }
    auth()
  }, [])

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    setLoading(true)
    const [col, dir] = sortBy.split(':')

    let q = supabase
      .from('listings')
      .select(
        'id, title, price, city, property_type, bedrooms, bathrooms, area_sqft, images, created_at',
        { count: 'exact' }
      )
      .eq('status', 'active')
      .order(col, { ascending: dir === 'asc' })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (search)               q = q.or(`title.ilike.%${search}%,city.ilike.%${search}%`)
    if (propertyType !== 'All') q = q.eq('property_type', propertyType)
    if (minPrice)             q = q.gte('price', Number(minPrice))
    if (maxPrice)             q = q.lte('price', Number(maxPrice))
    if (minBeds !== 'Any')    q = q.gte('bedrooms', Number(minBeds === '5+' ? 5 : minBeds))
    if (city)                 q = q.ilike('city', `%${city}%`)

    const { data, count } = await q
    setListings(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }, [search, propertyType, minPrice, maxPrice, minBeds, city, sortBy, page])

  useEffect(() => { fetchListings() }, [fetchListings])

  // ─── Save / unsave ─────────────────────────────────────────────────────────
  async function toggleSave(listingId: string) {
    if (!userId) return
    if (savedIds.includes(listingId)) {
      await supabase.from('saved_listings').delete()
        .eq('user_id', userId).eq('listing_id', listingId)
      setSavedIds(prev => prev.filter(id => id !== listingId))
    } else {
      await supabase.from('saved_listings').insert({ user_id: userId, listing_id: listingId })
      setSavedIds(prev => [...prev, listingId])
    }
  }

  function resetFilters() {
    setSearch(''); setPropertyType('All'); setMinPrice('')
    setMaxPrice(''); setMinBeds('Any'); setCity(''); setPage(0)
  }

  const totalPages    = Math.ceil(totalCount / PAGE_SIZE)
  const activeFilters = [propertyType !== 'All', minPrice, maxPrice, minBeds !== 'Any', city].filter(Boolean).length

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <GlobalStyles />

      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={{ marginBottom: 34, paddingLeft: 4 }}>
          <span style={S.logoText}>Rentura</span>
          <span style={S.logoSub}>Seeker Portal</span>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <NavLink href="/seeker"          icon="home"     label="Dashboard"       />
          <NavLink href="/seeker/listings" icon="search"   label="Browse Listings" active />
          <NavLink href="/seeker/saved"    icon="heart"    label="Saved"           badge={savedIds.length} />
          <NavLink href="/seeker/messages" icon="message"  label="Messages"        />
          <NavLink href="/seeker/settings" icon="settings" label="Settings"        />
        </nav>
      </aside>

      {/* Main */}
      <main style={S.main}>

        {/* Header */}
        <div style={S.headerRow}>
          <div>
            <h1 style={S.pageTitle}>Browse Listings</h1>
            <p style={S.pageSubtitle}>
              {loading
                ? 'Searching…'
                : `${totalCount.toLocaleString()} active listing${totalCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(0) }}
            style={S.sortSelect}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Filter panel */}
        <div style={S.filterPanel}>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <span style={S.searchIcon}><ISearch size={16} /></span>
            <input
              className="f-input"
              style={{ paddingLeft: 38 }}
              placeholder="Search by title, city, or neighborhood…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
          </div>

          {/* Type chips */}
          <div style={{ marginBottom: 18 }}>
            <span style={S.filterLabel}>Property type</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PROPERTY_TYPES.map(t => (
                <button
                  key={t}
                  className={`chip${propertyType === t ? ' active' : ''}`}
                  onClick={() => { setPropertyType(t); setPage(0) }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Filter inputs */}
          <div style={S.filterGrid}>
            <div>
              <span style={S.filterLabel}>Min price</span>
              <input className="f-input" type="number" placeholder="e.g. 500"
                value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(0) }} />
            </div>
            <div>
              <span style={S.filterLabel}>Max price</span>
              <input className="f-input" type="number" placeholder="e.g. 3000"
                value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(0) }} />
            </div>
            <div>
              <span style={S.filterLabel}>Min bedrooms</span>
              <select className="f-input" value={minBeds}
                onChange={e => { setMinBeds(e.target.value); setPage(0) }}>
                {BED_OPTIONS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <span style={S.filterLabel}>City</span>
              <input className="f-input" placeholder="e.g. New York"
                value={city} onChange={e => { setCity(e.target.value); setPage(0) }} />
            </div>
          </div>

          {/* Active filter badge + clear */}
          {activeFilters > 0 && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 13, color: '#64748B' }}>
                {activeFilters} filter{activeFilters !== 1 ? 's' : ''} active
              </span>
              <button onClick={resetFilters} style={S.clearBtn}>Clear all</button>
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={S.loadingWrap}>
            <div style={S.spinner} />
            <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, color: '#64748B', marginTop: 14 }}>
              Loading listings…
            </p>
          </div>
        ) : listings.length === 0 ? (
          <div style={S.empty}>
            <span style={{ fontSize: 42, display: 'block', marginBottom: 14 }}>🔍</span>
            <p style={S.emptyTitle}>No listings match your filters</p>
            <p style={S.emptyBody}>Try adjusting your search, or clear all filters.</p>
            <button onClick={resetFilters} style={S.emptyBtn}>Clear filters</button>
          </div>
        ) : (
          <>
            <div style={S.grid}>
              {listings.map((l, i) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isSaved={savedIds.includes(l.id)}
                  onSave={() => toggleSave(l.id)}
                  fmtMoney={fmtMoney}
                  delay={i * 0.04}
                  onClick={() => router.push(`/seeker/listings/${l.id}`)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={S.pagination}>
                <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                  ← Prev
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {buildPageRange(page, totalPages).map((p, i) =>
                    p === '…' ? (
                      <span key={`e${i}`} style={S.ellipsis}>…</span>
                    ) : (
                      <button
                        key={p}
                        className={`page-btn num${page === p ? ' active' : ''}`}
                        onClick={() => setPage(p as number)}
                      >
                        {(p as number) + 1}
                      </button>
                    )
                  )}
                </div>
                <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function NavLink({ href, icon, label, active, badge }: {
  href: string; icon: string; label: string; active?: boolean; badge?: number
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
      {!!badge && badge > 0 && <span style={S.badge}>{badge}</span>}
    </a>
  )
}

function ListingCard({ listing, isSaved, onSave, fmtMoney, delay, onClick }: {
  listing: Listing; isSaved: boolean; onSave: () => void
  fmtMoney: (n: number) => string; delay: number; onClick: () => void
}) {
  const img = listing.images?.[0]
  return (
    <div className="listing-card" style={{ animationDelay: `${delay}s` }}>
      <div style={S.cardImg} onClick={onClick}>
        {img
          ? <img src={img} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={S.cardImgFallback}>🏠</div>
        }
        <span style={S.typeBadge}>{listing.property_type || 'Apartment'}</span>
        <button
          className="save-btn"
          style={{ position: 'absolute', top: 9, right: 9 }}
          onClick={e => { e.stopPropagation(); onSave() }}
          aria-label={isSaved ? 'Unsave' : 'Save'}
        >
          <IHeart filled={isSaved} size={15} color={isSaved ? '#EF4444' : '#64748B'} />
        </button>
      </div>
      <div style={S.cardBody} onClick={onClick}>
        <p style={S.cardTitle}>{listing.title}</p>
        <p style={S.cardCity}>📍 {listing.city}</p>
        <div style={S.cardFooter}>
          <span style={S.cardPrice}>
            {fmtMoney(listing.price)}<span style={S.cardPriceSuffix}>/mo</span>
          </span>
          <span style={S.cardMeta}>
            {listing.bedrooms}bd · {listing.bathrooms}ba
            {listing.area_sqft ? ` · ${listing.area_sqft.toLocaleString()} sqft` : ''}
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
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      @keyframes spin   { to { transform: rotate(360deg) } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

      .nav-link {
        display: flex; align-items: center; gap: 10px; padding: 9px 12px;
        border-radius: 10px; color: #94A3B8;
        font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 500;
        text-decoration: none; transition: background 0.15s, color 0.15s;
      }
      .nav-link:hover  { background: rgba(255,255,255,0.07); color: #CBD5E1; }
      .nav-link.active { background: rgba(37,99,235,0.22); color: #fff; }

      .f-input {
        width: 100%; padding: 9px 12px; border: 1.5px solid #E2E8F0; border-radius: 9px;
        font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px;
        color: #1E293B; background: #fff; outline: none; transition: border-color 0.2s;
      }
      .f-input:focus { border-color: #2563EB; }

      .chip {
        padding: 6px 14px; border-radius: 20px; border: 1.5px solid #E2E8F0;
        background: #fff; color: #64748B; font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
      }
      .chip:hover  { border-color: #CBD5E1; color: #0F172A; }
      .chip.active { background: #EFF6FF; border-color: #2563EB; color: #2563EB; font-weight: 600; }

      .listing-card {
        background: #fff; border-radius: 16px; border: 1px solid #E2E8F0;
        overflow: hidden; cursor: pointer; animation: fadeUp 0.36s ease both;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .listing-card:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(37,99,235,0.10); }

      .save-btn {
        background: #fff; border: none; border-radius: 8px; padding: 6px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 6px rgba(0,0,0,0.13); transition: transform 0.15s;
      }
      .save-btn:hover { transform: scale(1.18); }

      .page-btn {
        padding: 8px 14px; border-radius: 8px; border: 1.5px solid #E2E8F0;
        background: #fff; font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 13px; font-weight: 600; color: #64748B;
        cursor: pointer; transition: all 0.15s; white-space: nowrap;
      }
      .page-btn:hover:not(:disabled) { border-color: #2563EB; color: #2563EB; }
      .page-btn:disabled { opacity: 0.38; cursor: not-allowed; }
      .page-btn.num    { min-width: 36px; padding: 8px 4px; text-align: center; }
      .page-btn.active { background: #2563EB; border-color: #2563EB; color: #fff; }
    `}</style>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root:    { minHeight: '100vh', background: '#F4F6FA', display: 'flex', fontFamily: "'Plus Jakarta Sans',sans-serif" },
  sidebar: { width: 240, background: '#0F172A', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '28px 14px', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 10 },
  logoText: { display: 'block', fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: '#fff' } as React.CSSProperties,
  logoSub:  { display: 'block', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 10, fontWeight: 600, color: '#475569', letterSpacing: '0.09em', textTransform: 'uppercase', marginTop: 3 } as React.CSSProperties,
  badge:    { background: '#2563EB', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' },
  main:     { marginLeft: 240, flex: 1, padding: '40px 44px' },

  headerRow:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  pageTitle:   { fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 700, color: '#0F172A', marginBottom: 4 },
  pageSubtitle:{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, color: '#64748B' },
  sortSelect:  { padding: '9px 14px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 13, color: '#0F172A', outline: 'none', background: '#fff', cursor: 'pointer' },

  filterPanel: { background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '22px 24px', marginBottom: 28 },
  searchIcon:  { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', pointerEvents: 'none' },
  filterLabel: { display: 'block', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 } as React.CSSProperties,
  filterGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 },
  clearBtn:    { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 13, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },

  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0' },
  spinner:     { width: 36, height: 36, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  empty:     { textAlign: 'center', padding: '72px 0', background: '#fff', borderRadius: 16, border: '1.5px dashed #CBD5E1' },
  emptyTitle:{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600, color: '#0F172A', marginBottom: 8 },
  emptyBody: { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, color: '#64748B', marginBottom: 22 },
  emptyBtn:  { background: '#2563EB', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14, fontWeight: 600 },

  grid:       { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 32 },
  cardImg:    { position: 'relative', height: 184, background: '#F1F5F9', overflow: 'hidden', cursor: 'pointer' },
  cardImgFallback: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 38 },
  typeBadge:  { position: 'absolute', top: 10, left: 10, background: '#fff', borderRadius: 7, padding: '3px 9px', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 11, fontWeight: 700, color: '#0F172A', boxShadow: '0 1px 6px rgba(0,0,0,0.12)' },
  cardBody:   { padding: '14px 16px 16px', cursor: 'pointer' },
  cardTitle:  { fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardCity:   { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 12, color: '#64748B', marginBottom: 10 },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice:  { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 16, fontWeight: 700, color: '#2563EB' },
  cardPriceSuffix: { fontSize: 11, fontWeight: 400, color: '#94A3B8' },
  cardMeta:   { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 11, color: '#94A3B8' },

  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ellipsis:   { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const pages: (number | '…')[] = [0]
  if (current > 2)         pages.push('…')
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) pages.push(i)
  if (current < total - 3) pages.push('…')
  pages.push(total - 1)
  return pages
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const

function IHome()    { return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg> }
function ISearch({ size = 17 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" {...sw}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> }
function IHeart({ filled = false, size = 17, color }: { filled?: boolean; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? (color || '#EF4444') : 'none'} stroke={color || 'currentColor'} strokeWidth="2"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
}
function IMessage() { return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> }
function ISettings(){ return <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg> }
