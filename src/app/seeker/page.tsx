'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Public Marketplace Page  /app/page.tsx  (or /app/marketplace/page.tsx)
//
// PUBLIC — No login required to browse. Auth gated only on Save / Contact.
//
// Dependencies (already in project):
//   @/lib/supabase  · @/lib/useCurrency
//   next/image · next/navigation
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

// ── Types ─────────────────────────────────────────────────────────────────────
type Listing = {
  id: string
  title: string
  description: string
  landlord_id: string
  landlord_name: string
  landlord_initials: string
  bedrooms: number
  bathrooms: number
  rent_amount: number
  currency: string
  available_from: string
  photos: string[]
  tags: string[]
  city: string
  property_type: string
  area_sqft: number | null
  saved: boolean
}

type CityCard = { city: string; count: number; photo: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

const CITY_PHOTOS: Record<string, string> = {
  'Colombo': 'https://images.unsplash.com/photo-1586096899244-9b947c4e36e7?w=400&q=80',
  'Kandy': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
  'Galle': 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=400&q=80',
  'Negombo': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80',
  'default': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isAvailableSoon(s: string) {
  if (!s) return false
  const diff = new Date(s).getTime() - Date.now()
  return diff >= 0 && diff < 14 * 86400000
}

const PROPERTY_TYPES = ['All', 'House', 'Apartment', 'Studio', 'Villa', 'Room', 'Office']
const BEDROOM_OPTIONS = ['Any', '1', '2', '3', '4', '5+']
const QUICK_TAGS = ['Furnished', 'Pet Friendly', 'Parking', 'Air Conditioned', 'Pool', 'Gym', 'Solar Panel']

const CATEGORY_ICONS: Record<string, string> = {
  All: '🏘️', House: '🏡', Apartment: '🏢', Studio: '🛋️',
  Villa: '🏰', Room: '🚪', Office: '🏗️',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const router = useRouter()
  const { fmtMoney } = useCurrency()

  // Auth (optional — page is public)
  const [userId, setUserId] = useState<string | null>(null)
  const [userInitials, setUserInitials] = useState('')
  const [fullName, setFullName] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [featuredListings, setFeaturedListings] = useState<Listing[]>([])
  const [recentListings, setRecentListings] = useState<Listing[]>([])
  const [availableListings, setAvailableListings] = useState<Listing[]>([])
  const [cityCards, setCityCards] = useState<CityCard[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Detail modal
  const [detail, setDetail] = useState<Listing | null>(null)
  const [detailPhoto, setDetailPhoto] = useState(0)

  // Auth gate modal
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [authGateAction, setAuthGateAction] = useState<'save' | 'contact'>('save')

  // Navbar
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [bedrooms, setBedrooms] = useState('Any')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedCity, setSelectedCity] = useState('')

  // View
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [cities, setCities] = useState<string[]>([])

  // Stats
  const [stats, setStats] = useState({ total: 0, cities: 0, avgRent: 0, landlords: 0 })

  // ── Navbar scroll effect ───────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Auth check (optional) ─────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          const name = user.user_metadata?.full_name || 'User'
          setFullName(name)
          setUserInitials(initials(name))
          setUserId(user.id)

          // Load saved listings
          const { data: savedRows } = await sb
            .from('saved_listings')
            .select('listing_id')
            .eq('seeker_id', user.id)
          setSavedIds(new Set((savedRows || []).map((s: any) => s.listing_id)))
        }
      } catch { /* not logged in — that's fine */ }
      finally { setAuthChecked(true) }
    })()
  }, [])

  // ── Load Listings ─────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const sb = createClient()
        const { data: rows } = await sb
          .from('listings')
          .select('id,title,description,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,photos,tags,city,property_type,area_sqft')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(60)

        const landlordIds = [...new Set((rows || []).map((r: any) => r.landlord_id).filter(Boolean))]
        const profileMap: Record<string, string> = {}
        if (landlordIds.length > 0) {
          const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', landlordIds)
          ;(pArr || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Landlord' })
        }

        const mapped: Listing[] = (rows || []).map((r: any) => {
          const lName = profileMap[r.landlord_id] || 'Landlord'
          return {
            id: r.id, title: r.title || 'Untitled',
            description: r.description || '',
            landlord_id: r.landlord_id || '',
            landlord_name: lName,
            landlord_initials: initials(lName),
            bedrooms: r.bedrooms || 0, bathrooms: r.bathrooms || 1,
            rent_amount: r.rent_amount || 0, currency: r.currency || 'USD',
            available_from: r.available_from || '',
            photos: r.photos || [], tags: r.tags || [],
            city: r.city || '', property_type: r.property_type || 'House',
            area_sqft: r.area_sqft || null,
            saved: false,
          }
        })

        setAllListings(mapped)

        // Derived sections
        setFeaturedListings(mapped.filter(l => l.photos.length > 0).slice(0, 4))
        setRecentListings(mapped.slice(0, 8))
        setAvailableListings(mapped.filter(l => l.available_from && isAvailableSoon(l.available_from)).slice(0, 4))

        // City cards
        const cityMap: Record<string, number> = {}
        mapped.forEach(l => { if (l.city) cityMap[l.city] = (cityMap[l.city] || 0) + 1 })
        const cCards: CityCard[] = Object.entries(cityMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([city, count]) => ({ city, count, photo: CITY_PHOTOS[city] || CITY_PHOTOS.default }))
        setCityCards(cCards)
        setCities(Object.keys(cityMap))

        // Stats
        const uniqueLandlords = new Set(mapped.map(l => l.landlord_id)).size
        const avgRent = mapped.length > 0
          ? Math.round(mapped.reduce((s, l) => s + l.rent_amount, 0) / mapped.length)
          : 0
        setStats({ total: mapped.length, cities: Object.keys(cityMap).length, avgRent, landlords: uniqueLandlords })

        setListings(mapped)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [])

  // ── Filtered listings ─────────────────────────────────────────────────────
  const filteredListings = useCallback(() => {
    let result = allListings
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
      )
    }
    if (selectedType !== 'All') result = result.filter(l => l.property_type === selectedType)
    if (selectedCity) result = result.filter(l => l.city === selectedCity)
    if (priceMin) result = result.filter(l => l.rent_amount >= parseFloat(priceMin))
    if (priceMax) result = result.filter(l => l.rent_amount <= parseFloat(priceMax))
    if (bedrooms !== 'Any') {
      if (bedrooms === '5+') result = result.filter(l => l.bedrooms >= 5)
      else result = result.filter(l => l.bedrooms === parseInt(bedrooms))
    }
    if (selectedTags.length > 0) result = result.filter(l => selectedTags.every(t => l.tags.includes(t)))
    return result
  }, [allListings, searchQuery, selectedType, selectedCity, priceMin, priceMax, bedrooms, selectedTags])

  const [browsedListings, setBrowsedListings] = useState<Listing[]>([])
  const [isFiltering, setIsFiltering] = useState(false)
  useEffect(() => {
    setBrowsedListings(filteredListings())
  }, [filteredListings])

  // ── Save / Unsave ─────────────────────────────────────────────────────────
  async function toggleSave(listingId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!userId) { setAuthGateAction('save'); setAuthGateOpen(true); return }
    if (savingId) return
    setSavingId(listingId)
    try {
      const sb = createClient()
      const already = savedIds.has(listingId)
      if (already) {
        await sb.from('saved_listings').delete().eq('seeker_id', userId).eq('listing_id', listingId)
        setSavedIds(prev => { const s = new Set(prev); s.delete(listingId); return s })
      } else {
        await sb.from('saved_listings').insert({ seeker_id: userId, listing_id: listingId })
        setSavedIds(prev => new Set([...prev, listingId]))
      }
    } catch (e) { console.error(e) }
    finally { setSavingId(null) }
  }

  // ── Contact ───────────────────────────────────────────────────────────────
  function contactLandlord(landlordId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!userId) { setAuthGateAction('contact'); setAuthGateOpen(true); return }
    router.push(`/seeker/messages?to=${landlordId}`)
  }

  const hasActiveFilters = selectedType !== 'All' || selectedCity || priceMin || priceMax || bedrooms !== 'Any' || selectedTags.length > 0

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,400&display=swap');

        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{font-family:'Plus Jakarta Sans',sans-serif;background:#F7F8FC;color:#0F172A;-webkit-font-smoothing:antialiased}

        /* ── SCROLLBAR ── */
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:99px}

        /* ══════════════════════════════════════════════════════════════
           NAVBAR
        ══════════════════════════════════════════════════════════════ */
        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease}
        .nav.scrolled{background:rgba(255,255,255,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav.transparent{background:transparent}
        .nav-inner{max-width:1280px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:16px}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0}
        .nav-logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(37,99,235,.35)}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;letter-spacing:-.3px}
        .nav.transparent .nav-logo-name{color:#fff}
        .nav-search-bar{flex:1;max-width:460px;position:relative;display:flex;align-items:center}
        .nav-search-ico{position:absolute;left:13px;font-size:14px;color:#94A3B8;pointer-events:none;z-index:1}
        .nav-search-input{width:100%;padding:10px 13px 10px 37px;border-radius:12px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#0F172A;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:all .2s}
        .nav-search-input::placeholder{color:#94A3B8}
        .nav-search-input:focus{border-color:#3B82F6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .nav.transparent .nav-search-bar{display:none}
        .nav-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav.transparent .nav-link{color:rgba(255,255,255,.8)}
        .nav.transparent .nav-link:hover{color:#fff;background:rgba(255,255,255,.12)}
        .nav-list-btn{font-size:13px;font-weight:700;color:#2563EB;padding:8px 14px;border-radius:10px;border:1.5px solid #BFDBFE;background:#EFF6FF;text-decoration:none;transition:all .15s;white-space:nowrap}
        .nav-list-btn:hover{background:#DBEAFE;border-color:#93C5FD}
        .nav.transparent .nav-list-btn{color:#fff;border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.12)}
        .nav.transparent .nav-list-btn:hover{background:rgba(255,255,255,.22)}
        .nav-signin-btn{font-size:13px;font-weight:700;color:#fff;padding:8px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;transition:all .15s;white-space:nowrap;box-shadow:0 2px 10px rgba(37,99,235,.3)}
        .nav-signin-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,.4)}
        .nav-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0;border:2px solid rgba(255,255,255,.5)}
        .nav-hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569;flex-shrink:0}
        .nav.transparent .nav-hamburger{color:#fff}
        .mobile-search-btn{display:none;background:none;border:none;font-size:18px;cursor:pointer;padding:6px;color:#475569;flex-shrink:0}
        .nav.transparent .mobile-search-btn{color:#fff}

        /* ── MOBILE MENU ── */
        .mobile-menu{display:none;position:fixed;inset:0;z-index:490;flex-direction:column}
        .mobile-menu.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:280px;background:#fff;display:flex;flex-direction:column;padding:24px 20px;gap:4px;box-shadow:-8px 0 32px rgba(0,0,0,.12)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;margin-bottom:12px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:12px 14px;border-radius:10px;text-decoration:none;display:block;transition:all .15s}
        .mm-link:hover{background:#F1F5F9;color:#0F172A}
        .mm-divider{height:1px;background:#F1F5F9;margin:8px 0}
        .mm-cta{font-size:14px;font-weight:700;color:#fff;padding:13px 20px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;text-align:center;margin-top:8px;display:block}

        /* ══════════════════════════════════════════════════════════════
           HERO
        ══════════════════════════════════════════════════════════════ */
        .hero{position:relative;height:580px;display:flex;align-items:center;justify-content:center;overflow:hidden}
        .hero-bg{position:absolute;inset:0;background:linear-gradient(135deg,#0F172A 0%,#1e3a5f 45%,#0F172A 100%)}
        .hero-bg-pattern{position:absolute;inset:0;background-image:radial-gradient(circle at 20% 80%,rgba(99,102,241,.25) 0%,transparent 50%),radial-gradient(circle at 80% 20%,rgba(37,99,235,.2) 0%,transparent 50%),radial-gradient(circle at 50% 50%,rgba(16,185,129,.08) 0%,transparent 60%);pointer-events:none}
        .hero-bg-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:60px 60px;pointer-events:none}
        .hero-floating{position:absolute;pointer-events:none}
        .hero-float-1{top:18%;right:12%;width:260px;height:160px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;backdrop-filter:blur(8px);animation:float1 6s ease-in-out infinite}
        .hero-float-2{bottom:22%;left:8%;width:180px;height:120px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.18);border-radius:16px;animation:float2 8s ease-in-out infinite}
        @keyframes float1{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-12px) rotate(1deg)}}
        @keyframes float2{0%,100%{transform:translateY(0) rotate(1deg)}50%{transform:translateY(-8px) rotate(-1deg)}}
        .hero-content{position:relative;z-index:2;text-align:center;max-width:700px;padding:0 24px}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:99px;padding:6px 14px;font-size:12px;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.5px;text-transform:uppercase;margin-bottom:20px;backdrop-filter:blur(4px)}
        .hero-title{font-family:'Fraunces',serif;font-size:52px;font-weight:300;color:#F8FAFC;line-height:1.1;letter-spacing:-1.5px;margin-bottom:14px}
        .hero-title em{font-style:italic;color:#93C5FD}
        .hero-title strong{font-weight:700;color:#fff}
        .hero-sub{font-size:16px;color:rgba(255,255,255,.55);margin-bottom:32px;line-height:1.6;max-width:500px;margin-left:auto;margin-right:auto}
        .hero-search{background:rgba(255,255,255,.97);border-radius:18px;padding:10px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 40px rgba(0,0,0,.25);max-width:620px;margin:0 auto 24px;flex-wrap:wrap}
        .hs-input-wrap{flex:1;min-width:160px;position:relative;display:flex;align-items:center}
        .hs-ico{position:absolute;left:10px;font-size:14px;pointer-events:none;color:#94A3B8}
        .hs-input{width:100%;padding:10px 10px 10px 32px;border:none;outline:none;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:transparent}
        .hs-input::placeholder{color:#94A3B8}
        .hs-divider{width:1px;height:28px;background:#E2E8F0;flex-shrink:0}
        .hs-select{padding:10px 12px;border:none;outline:none;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#374151;background:transparent;cursor:pointer;min-width:100px}
        .hs-btn{padding:11px 22px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 14px rgba(37,99,235,.4);transition:all .18s;white-space:nowrap;flex-shrink:0}
        .hs-btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(37,99,235,.5)}
        .hero-hints{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
        .hero-hint{font-size:12px;color:rgba(255,255,255,.4);font-weight:500}
        .hero-hint-tag{font-size:12px;color:rgba(255,255,255,.6);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:99px;padding:3px 10px;cursor:pointer;transition:all .15s;font-weight:500}
        .hero-hint-tag:hover{background:rgba(255,255,255,.14);color:rgba(255,255,255,.85)}
        .hero-stats{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.06);border-top:1px solid rgba(255,255,255,.07);backdrop-filter:blur(8px)}
        .hero-stats-inner{max-width:1280px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:0}
        .hstat{display:flex;align-items:center;gap:10px;padding:0 32px}
        .hstat:not(:last-child){border-right:1px solid rgba(255,255,255,.1)}
        .hstat-num{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#F1F5F9}
        .hstat-lbl{font-size:12px;color:rgba(255,255,255,.45);font-weight:500}

        /* ══════════════════════════════════════════════════════════════
           CATEGORY PILLS
        ══════════════════════════════════════════════════════════════ */
        .categories{background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:68px;z-index:100;box-shadow:0 2px 8px rgba(15,23,42,.04)}
        .cat-inner{max-width:1280px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;height:58px}
        .cat-inner::-webkit-scrollbar{display:none}
        .cat-pill{display:flex;align-items:center;gap:6px;padding:7px 16px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0}
        .cat-pill:hover{background:#F8FAFC;border-color:#CBD5E1}
        .cat-pill.active{background:#0F172A;border-color:#0F172A;color:#fff}
        .cat-pill .cat-ico{font-size:15px}
        .cat-divider{width:1px;height:20px;background:#E2E8F0;flex-shrink:0;margin:0 4px}
        .cat-filter-btn{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0}
        .cat-filter-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .cat-filter-btn.active{border-color:#0F172A;background:#0F172A;color:#fff}
        .filter-dot{width:7px;height:7px;border-radius:50%;background:#EF4444}

        /* ── FILTER PANEL ── */
        .filter-panel{background:#fff;border-bottom:1px solid #E2E8F0;box-shadow:0 4px 16px rgba(15,23,42,.07)}
        .fp-inner{max-width:1280px;margin:0 auto;padding:18px 24px}
        .fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:14px}
        .fp-field{display:flex;flex-direction:column;gap:5px}
        .fp-label{font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px}
        .fp-input,.fp-select{padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .fp-input:focus,.fp-select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .fp-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #F1F5F9;padding-top:14px}
        .fp-clear{padding:8px 16px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .fp-apply{padding:8px 20px;border-radius:10px;border:none;background:#0F172A;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── TAG PILLS ROW ── */
        .tag-pills-row{max-width:1280px;margin:0 auto;padding:14px 24px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
        .tag-pill-lbl{font-size:12px;font-weight:700;color:#94A3B8;white-space:nowrap}
        .tag-pill{padding:5px 13px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
        .tag-pill:hover{border-color:#CBD5E1;background:#F8FAFC}
        .tag-pill.active{background:#F0FDF4;border-color:#86EFAC;color:#16A34A}

        /* ══════════════════════════════════════════════════════════════
           PAGE WRAPPER
        ══════════════════════════════════════════════════════════════ */
        .page{max-width:1280px;margin:0 auto;padding:0 24px}

        /* ══════════════════════════════════════════════════════════════
           SECTIONS
        ══════════════════════════════════════════════════════════════ */
        .section{padding:48px 0 0}
        .section-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;gap:12px}
        .section-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;letter-spacing:-.5px}
        .section-title em{font-style:italic;color:#2563EB}
        .section-sub{font-size:13.5px;color:#94A3B8;margin-top:3px}
        .section-link{font-size:13px;font-weight:700;color:#2563EB;text-decoration:none;white-space:nowrap;display:flex;align-items:center;gap:4px}
        .section-link:hover{text-decoration:underline}

        /* ══════════════════════════════════════════════════════════════
           FEATURED STRIP (horizontal scroll)
        ══════════════════════════════════════════════════════════════ */
        .featured-strip{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;-webkit-overflow-scrolling:touch}
        .featured-strip::-webkit-scrollbar{display:none}

        .fcard{min-width:300px;max-width:300px;background:#fff;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s;flex-shrink:0;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .fcard:hover{box-shadow:0 10px 32px rgba(15,23,42,.12);transform:translateY(-3px)}
        .fcard-img{height:200px;position:relative;overflow:hidden;background:#F1F5F9}
        .fcard-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
        .fcard:hover .fcard-img img{transform:scale(1.04)}
        .fcard-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:52px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .fcard-save{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1);transition:transform .15s}
        .fcard-save:hover{transform:scale(1.12)}
        .fcard-badge{position:absolute;top:10px;left:10px;font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:rgba(16,185,129,.9);color:#fff;backdrop-filter:blur(4px)}
        .fcard-body{padding:14px 16px}
        .fcard-type{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .fcard-title{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fcard-loc{font-size:12px;color:#94A3B8;margin-bottom:10px;display:flex;align-items:center;gap:3px}
        .fcard-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A}
        .fcard-price span{font-size:12px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .fcard-facts{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
        .fcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:3px 7px}

        /* ══════════════════════════════════════════════════════════════
           CITY CARDS
        ══════════════════════════════════════════════════════════════ */
        .city-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .city-card{position:relative;height:160px;border-radius:18px;overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s}
        .city-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(15,23,42,.18)}
        .city-card-img{width:100%;height:100%;object-fit:cover;display:block}
        .city-card-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(15,23,42,.75) 0%,rgba(15,23,42,.1) 60%)}
        .city-card-body{position:absolute;bottom:14px;left:14px;right:14px}
        .city-card-name{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#fff;margin-bottom:2px}
        .city-card-count{font-size:12px;color:rgba(255,255,255,.7);font-weight:500}

        /* ══════════════════════════════════════════════════════════════
           LISTING GRID (main browse)
        ══════════════════════════════════════════════════════════════ */
        .browse-toolbar{display:flex;align-items:center;justify-content:space-between;padding:24px 0 16px;gap:10px;flex-wrap:wrap}
        .browse-tabs{display:flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:3px}
        .btab{padding:6px 14px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .btab:hover{background:#F1F5F9}
        .btab.active{background:#0F172A;color:#fff}
        .browse-right{display:flex;align-items:center;gap:8px}
        .browse-count{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap}
        .view-btns{display:flex;gap:3px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;padding:3px}
        .vbtn{width:30px;height:30px;border:none;background:none;border-radius:7px;cursor:pointer;color:#94A3B8;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .vbtn.active{background:#F1F5F9;color:#0F172A}

        .listing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding-bottom:64px}
        .listing-grid.two{grid-template-columns:repeat(2,1fr)}
        .listing-grid.list-view{grid-template-columns:1fr}

        /* ── LISTING CARD ── */
        .lcard{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;cursor:pointer;transition:box-shadow .18s,transform .18s;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .lcard:hover{box-shadow:0 8px 28px rgba(15,23,42,.1);transform:translateY(-2px)}
        .lcard.list-view{display:flex;flex-direction:row}
        .lcard-banner{position:relative;height:170px;background:#F1F5F9;overflow:hidden;flex-shrink:0}
        .lcard.list-view .lcard-banner{width:230px;height:auto;min-height:155px}
        .lcard-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
        .lcard:hover .lcard-img{transform:scale(1.04)}
        .lcard-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lcard-save{position:absolute;top:9px;right:9px;width:30px;height:30px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1);transition:transform .15s}
        .lcard-save:hover{transform:scale(1.12)}
        .lcard-avail{position:absolute;bottom:9px;right:9px;font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;background:rgba(16,185,129,.9);color:#fff}
        .lcard-photo-ct{position:absolute;bottom:9px;left:9px;background:rgba(15,23,42,.55);color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 7px}
        .lcard-body{padding:13px 15px;flex:1;display:flex;flex-direction:column;min-width:0}
        .lcard-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .lcard-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard.list-view .lcard-title{white-space:normal}
        .lcard-loc{font-size:12px;color:#94A3B8;margin-bottom:8px;display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:7px}
        .lcard-price span{font-size:11.5px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .lcard-facts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
        .lcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:2px 7px}
        .lcard-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
        .lcard-tag{font-size:10px;color:#7C3AED;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.16);border-radius:99px;padding:2px 7px;font-weight:600}
        .lcard-desc{font-size:12px;color:#64748B;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;margin-bottom:8px}
        .lcard-footer{padding:10px 14px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:6px}
        .lcard-ll{display:flex;align-items:center;gap:7px;min-width:0}
        .lcard-ll-av{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;flex-shrink:0}
        .lcard-ll-name{font-size:11.5px;color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
        .lcard-contact{padding:5px 12px;border-radius:8px;border:none;background:#0F172A;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap;flex-shrink:0}
        .lcard-contact:hover{background:#1E293B}

        /* ── SKELETON ── */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}

        /* ── EMPTY ── */
        .empty-state{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;grid-column:1/-1}
        .es-ico{font-size:52px;margin-bottom:14px}
        .es-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .es-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px;line-height:1.6}
        .es-btn{padding:9px 22px;border-radius:10px;border:none;background:#0F172A;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ══════════════════════════════════════════════════════════════
           TRUST BANNER
        ══════════════════════════════════════════════════════════════ */
        .trust-banner{background:#0F172A;border-radius:24px;padding:48px;margin:48px 0;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;overflow:hidden;position:relative}
        .trust-banner::before{content:'';position:absolute;top:-40px;right:-40px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.18) 0%,transparent 70%);pointer-events:none}
        .tb-title{font-family:'Fraunces',serif;font-size:32px;font-weight:300;color:#F8FAFC;letter-spacing:-.5px;margin-bottom:12px;line-height:1.2}
        .tb-title em{font-style:italic;color:#93C5FD}
        .tb-sub{font-size:14.5px;color:rgba(255,255,255,.5);line-height:1.7;margin-bottom:24px}
        .tb-btns{display:flex;gap:10px;flex-wrap:wrap}
        .tb-btn-primary{padding:12px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;box-shadow:0 2px 14px rgba(37,99,235,.4);transition:all .18s}
        .tb-btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(37,99,235,.5)}
        .tb-btn-secondary{padding:12px 24px;border-radius:12px;border:1.5px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:rgba(255,255,255,.8);font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;transition:all .18s}
        .tb-btn-secondary:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28)}
        .tb-right{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .tb-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px}
        .tb-card-ico{font-size:24px;margin-bottom:10px}
        .tb-card-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .tb-card-desc{font-size:12px;color:rgba(255,255,255,.4);line-height:1.5}

        /* ══════════════════════════════════════════════════════════════
           FOOTER
        ══════════════════════════════════════════════════════════════ */
        .footer{background:#fff;border-top:1px solid #E2E8F0;padding:48px 0 24px}
        .footer-inner{max-width:1280px;margin:0 auto;padding:0 24px}
        .footer-top{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px}
        .footer-brand{}
        .footer-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px}
        .footer-logo-icon{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .footer-logo-name{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A}
        .footer-tagline{font-size:13px;color:#94A3B8;line-height:1.6;max-width:220px}
        .footer-col-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;margin-bottom:14px}
        .footer-link{display:block;font-size:13.5px;color:#64748B;text-decoration:none;margin-bottom:9px;transition:color .15s}
        .footer-link:hover{color:#0F172A}
        .footer-bottom{border-top:1px solid #F1F5F9;padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .footer-copy{font-size:13px;color:#94A3B8}
        .footer-legal{display:flex;gap:16px}
        .footer-legal a{font-size:13px;color:#94A3B8;text-decoration:none}
        .footer-legal a:hover{color:#374151}

        /* ══════════════════════════════════════════════════════════════
           DETAIL MODAL
        ══════════════════════════════════════════════════════════════ */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
        .modal-bg.open{display:flex}
        .modal{background:#fff;border-radius:24px;width:100%;max-width:740px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.25);display:flex;flex-direction:column}
        .modal::-webkit-scrollbar{width:4px}.modal::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}
        .modal-gallery{position:relative;height:290px;background:#0F172A;overflow:hidden;flex-shrink:0;border-radius:24px 24px 0 0}
        .mg-img{width:100%;height:100%;object-fit:cover}
        .mg-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:72px;opacity:.2}
        .mg-nav{position:absolute;top:50%;transform:translateY(-50%);width:100%;display:flex;justify-content:space-between;padding:0 12px;pointer-events:none}
        .mg-btn{width:36px;height:36px;border-radius:99px;background:rgba(255,255,255,.88);border:none;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;box-shadow:0 2px 10px rgba(0,0,0,.15);transition:all .15s}
        .mg-btn:hover{background:#fff;transform:scale(1.06)}
        .mg-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:5px}
        .mg-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.4);cursor:pointer;transition:all .2s}
        .mg-dot.active{background:#fff;width:18px;border-radius:99px}
        .modal-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:99px;background:rgba(15,23,42,.65);border:none;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .modal-heart{position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:99px;background:rgba(255,255,255,.88);border:none;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .modal-body{padding:26px 30px;flex:1}
        .modal-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;gap:12px}
        .modal-title-col{flex:1;min-width:0}
        .modal-ptype{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:4px}
        .modal-title{font-family:'Fraunces',serif;font-size:24px;font-weight:400;color:#0F172A;line-height:1.25;margin-bottom:5px}
        .modal-city{font-size:13.5px;color:#64748B;display:flex;align-items:center;gap:5px}
        .modal-price-col{text-align:right;flex-shrink:0}
        .modal-price{font-family:'Fraunces',serif;font-size:28px;font-weight:700;color:#0F172A}
        .modal-price span{font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .modal-avail{font-size:12px;color:#16A34A;font-weight:600;margin-top:3px}
        .modal-facts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
        .modal-fact{display:flex;align-items:center;gap:6px;padding:8px 13px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#374151;font-weight:500}
        .modal-fact strong{color:#0F172A;font-weight:700}
        .modal-section{margin-bottom:20px}
        .modal-sec-lbl{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:8px}
        .modal-desc{font-size:14.5px;color:#374151;line-height:1.75}
        .modal-tags{display:flex;flex-wrap:wrap;gap:7px}
        .modal-tag{font-size:12.5px;color:#7C3AED;background:rgba(124,58,237,.07);border:1.5px solid rgba(124,58,237,.16);border-radius:99px;padding:4px 13px;font-weight:600}
        .modal-footer{padding:16px 30px;border-top:1px solid #F1F5F9;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .modal-ll{display:flex;align-items:center;gap:11px;flex:1;min-width:0}
        .modal-ll-av{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0}
        .modal-ll-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .modal-ll-lbl{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .modal-contact-btn{padding:12px 26px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3);white-space:nowrap;flex-shrink:0;transition:all .18s}
        .modal-contact-btn:hover{transform:translateY(-1px)}
        .modal-save-btn{padding:12px 16px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0;transition:all .15s;display:flex;align-items:center;gap:6px}
        .modal-save-btn:hover{border-color:#FECDD3;background:#FFF1F2}
        .modal-save-btn.saved{border-color:#FECDD3;background:#FFF1F2;color:#E11D48}

        /* ══════════════════════════════════════════════════════════════
           AUTH GATE MODAL
        ══════════════════════════════════════════════════════════════ */
        .auth-gate-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)}
        .auth-gate-bg.open{display:flex}
        .auth-gate{background:#fff;border-radius:24px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.2)}
        .ag-header{background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:32px 30px 24px;text-align:center;position:relative}
        .ag-ico{font-size:40px;margin-bottom:12px}
        .ag-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#F8FAFC;margin-bottom:6px}
        .ag-sub{font-size:13.5px;color:rgba(255,255,255,.5);line-height:1.6}
        .ag-body{padding:24px 28px}
        .ag-btn{width:100%;padding:13px 20px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
        .ag-btn-primary{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;box-shadow:0 2px 14px rgba(37,99,235,.35)}
        .ag-btn-primary:hover{transform:translateY(-1px)}
        .ag-btn-outline{background:#fff;color:#374151;border:1.5px solid #E2E8F0}
        .ag-btn-outline:hover{background:#F8FAFC}
        .ag-divider{text-align:center;font-size:12px;color:#94A3B8;margin:4px 0 12px;position:relative}
        .ag-divider::before,.ag-divider::after{content:'';position:absolute;top:50%;width:40%;height:1px;background:#E2E8F0}
        .ag-divider::before{left:0}.ag-divider::after{right:0}
        .ag-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:99px;background:rgba(255,255,255,.12);border:none;color:rgba(255,255,255,.7);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}

        /* ══════════════════════════════════════════════════════════════
           RESPONSIVE
        ══════════════════════════════════════════════════════════════ */
        @media(max-width:1100px){.listing-grid{grid-template-columns:repeat(3,1fr)}.city-grid{grid-template-columns:repeat(2,1fr)}.footer-top{grid-template-columns:1fr 1fr}}
        @media(max-width:900px){.listing-grid{grid-template-columns:repeat(2,1fr)}.trust-banner{grid-template-columns:1fr;padding:32px}.tb-right{display:none}.nav-search-bar{display:none}.mobile-search-btn{display:block}}
        @media(max-width:768px){
          .nav-link,.nav-list-btn{display:none}
          .nav-hamburger{display:block}
          .hstat{padding:0 16px}
          .hstat-num{font-size:18px}
          .hero-title{font-size:38px}
          .hero{height:520px}
          .city-grid{grid-template-columns:repeat(2,1fr)}
          .listing-grid{grid-template-columns:repeat(2,1fr)}
          .lcard.list-view{flex-direction:column}
          .lcard.list-view .lcard-banner{width:100%;min-height:170px}
          .modal{border-radius:20px 20px 0 0;position:fixed;bottom:0;left:0;right:0;max-height:95vh;margin:0;max-width:100%}
          .modal-gallery{border-radius:20px 20px 0 0}
          .modal-body{padding:20px 20px}
          .modal-footer{padding:14px 20px}
          .footer-top{grid-template-columns:1fr 1fr;gap:24px}
          .page{padding:0 16px}
          .cat-inner{padding:0 16px}
          .hero-search{padding:8px}
          .hs-divider{display:none}
          .hs-select{min-width:80px;font-size:12px}
        }
        @media(max-width:520px){
          .listing-grid{grid-template-columns:1fr}
          .city-grid{grid-template-columns:repeat(2,1fr)}
          .hero-title{font-size:30px}
          .hero{height:auto;padding:100px 0 0}
          .hero-content{padding-top:24px}
          .hero-stats{position:relative}
          .hero-stats-inner{flex-wrap:wrap;gap:0}
          .hstat{padding:10px 16px}
          .hs-btn{padding:10px 16px;font-size:13px}
          .footer-top{grid-template-columns:1fr}
          .trust-banner{padding:24px 20px}
          .tb-btns{flex-direction:column}
          .tb-btn-primary,.tb-btn-secondary{text-align:center}
        }
      `}</style>

      {/* ══ DETAIL MODAL ══ */}
      <div className={`modal-bg${detail ? ' open' : ''}`} onClick={() => setDetail(null)}>
        {detail && (
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-gallery">
              {detail.photos.length > 0
                ? <img className="mg-img" src={detail.photos[detailPhoto]} alt={detail.title} />
                : <div className="mg-placeholder">🏠</div>
              }
              {detail.photos.length > 1 && (
                <>
                  <div className="mg-nav">
                    <button className="mg-btn" onClick={() => setDetailPhoto(p => (p - 1 + detail.photos.length) % detail.photos.length)}>‹</button>
                    <button className="mg-btn" onClick={() => setDetailPhoto(p => (p + 1) % detail.photos.length)}>›</button>
                  </div>
                  <div className="mg-dots">
                    {detail.photos.map((_, i) => <div key={i} className={`mg-dot${i === detailPhoto ? ' active' : ''}`} onClick={() => setDetailPhoto(i)} />)}
                  </div>
                </>
              )}
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
              <button className="modal-heart" onClick={e => toggleSave(detail.id, e)}>
                {savedIds.has(detail.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-header">
                <div className="modal-title-col">
                  <div className="modal-ptype">{detail.property_type}</div>
                  <div className="modal-title">{detail.title}</div>
                  <div className="modal-city">📍 {detail.city || 'Location not specified'}</div>
                </div>
                <div className="modal-price-col">
                  <div className="modal-price">{fmtMoney(detail.rent_amount)}<span>/mo</span></div>
                  {detail.available_from && (
                    <div className="modal-avail">
                      {isAvailableSoon(detail.available_from) ? '🟢 Available soon' : `📅 From ${fmtDate(detail.available_from)}`}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-facts">
                {detail.bedrooms > 0 && <div className="modal-fact">🛏 <strong>{detail.bedrooms}</strong> Beds</div>}
                <div className="modal-fact">🚿 <strong>{detail.bathrooms}</strong> Baths</div>
                {detail.area_sqft && <div className="modal-fact">📐 <strong>{detail.area_sqft.toLocaleString()}</strong> sqft</div>}
                <div className="modal-fact">🏘️ <strong>{detail.property_type}</strong></div>
              </div>
              {detail.description && (
                <div className="modal-section">
                  <div className="modal-sec-lbl">About this property</div>
                  <div className="modal-desc">{detail.description}</div>
                </div>
              )}
              {detail.tags?.length > 0 && (
                <div className="modal-section">
                  <div className="modal-sec-lbl">Features & Amenities</div>
                  <div className="modal-tags">
                    {detail.tags.map(tag => <span key={tag} className="modal-tag">{tag}</span>)}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div className="modal-ll">
                <div className="modal-ll-av" style={{ background: AVATAR_GRADIENTS[detail.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length] }}>
                  {detail.landlord_initials}
                </div>
                <div>
                  <div className="modal-ll-name">{detail.landlord_name}</div>
                  <div className="modal-ll-lbl">Property Owner</div>
                </div>
              </div>
              <button className={`modal-save-btn${savedIds.has(detail.id) ? ' saved' : ''}`} onClick={e => toggleSave(detail.id, e)}>
                {savedIds.has(detail.id) ? '❤️ Saved' : '🤍 Save'}
              </button>
              <button className="modal-contact-btn" onClick={e => contactLandlord(detail.landlord_id, e)}>
                💬 Contact Landlord
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ AUTH GATE MODAL ══ */}
      <div className={`auth-gate-bg${authGateOpen ? ' open' : ''}`} onClick={() => setAuthGateOpen(false)}>
        <div className="auth-gate" onClick={e => e.stopPropagation()}>
          <div className="ag-header">
            <button className="ag-close" onClick={() => setAuthGateOpen(false)}>✕</button>
            <div className="ag-ico">{authGateAction === 'save' ? '❤️' : '💬'}</div>
            <div className="ag-title">
              {authGateAction === 'save' ? 'Save this listing' : 'Contact this landlord'}
            </div>
            <div className="ag-sub">
              {authGateAction === 'save'
                ? 'Create a free account to save listings and find your perfect home.'
                : 'Create a free account to message landlords and arrange viewings.'}
            </div>
          </div>
          <div className="ag-body">
            <a href="/signup" className="ag-btn ag-btn-primary">
              ✨ Create free account
            </a>
            <div className="ag-divider">or</div>
            <a href="/login" className="ag-btn ag-btn-outline">
              Sign in to your account
            </a>
          </div>
        </div>
      </div>

      {/* ══ MOBILE MENU ══ */}
      <div className={`mobile-menu${mobileMenuOpen ? ' open' : ''}`}>
        <div className="mm-bg" onClick={() => setMobileMenuOpen(false)} />
        <div className="mm-panel">
          <button className="mm-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
          <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
          <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
          <div className="mm-divider" />
          <a href="/login" className="mm-link">Sign In</a>
          <a href="/landlord" className="mm-link">List Your Property</a>
          <a href="/signup" className="mm-cta">Get Started Free →</a>
        </div>
      </div>

      {/* ══ NAVBAR ══ */}
      <nav className={`nav${scrolled ? ' scrolled' : ' transparent'}`}>
        <div className="nav-inner">
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">
              <Image src="/icon.png" alt="Rentura" width={22} height={22} />
            </div>
            <span className="nav-logo-name">Rentura</span>
          </a>

          <div className="nav-search-bar">
            <span className="nav-search-ico">🔍</span>
            <input
              className="nav-search-input"
              placeholder="Search city, area, or property type…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
            />
          </div>

          <div className="nav-actions">
            <button className="mobile-search-btn" onClick={() => setMobileSearchOpen(v => !v)}>🔍</button>
            <a href="/seeker/map" className="nav-link">Map</a>
            <a href="/landlord" className="nav-list-btn">List Your Property</a>
            {userId ? (
              <a href="/seeker" className="nav-avatar">{userInitials}</a>
            ) : (
              <a href="/login" className="nav-signin-btn">Sign In</a>
            )}
            <button className="nav-hamburger" onClick={() => setMobileMenuOpen(true)}>☰</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-bg-pattern" />
        <div className="hero-bg-grid" />
        <div className="hero-floating hero-float-1" />
        <div className="hero-floating hero-float-2" />

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span>🏡</span> {stats.total > 0 ? `${stats.total} verified listings` : 'Verified listings'}
          </div>
          <h1 className="hero-title">
            Find your <em>perfect</em><br />
            <strong>home, faster.</strong>
          </h1>
          <p className="hero-sub">
            Browse verified rentals from trusted landlords — no signup required.
          </p>

          <div className="hero-search">
            <div className="hs-input-wrap">
              <span className="hs-ico">🔍</span>
              <input
                className="hs-input"
                placeholder="City, neighbourhood, or property name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
              />
            </div>
            <div className="hs-divider" />
            <select className="hs-select" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
              {BEDROOM_OPTIONS.map(b => <option key={b} value={b}>{b === 'Any' ? 'Any beds' : `${b} bed${b === '1' ? '' : 's'}`}</option>)}
            </select>
            <div className="hs-divider" />
            <select className="hs-select" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'Any type' : t}</option>)}
            </select>
            <button className="hs-btn" onClick={() => document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })}>
              Search →
            </button>
          </div>

          <div className="hero-hints">
            <span className="hero-hint">Popular:</span>
            {['Furnished', 'Pet Friendly', 'Near City', 'Parking'].map(tag => (
              <button
                key={tag}
                className="hero-hint-tag"
                onClick={() => {
                  setSelectedTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag])
                  document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >{tag}</button>
            ))}
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-stats-inner">
            <div className="hstat">
              <div>
                <div className="hstat-num">{loading ? '…' : stats.total}</div>
                <div className="hstat-lbl">Active listings</div>
              </div>
            </div>
            <div className="hstat">
              <div>
                <div className="hstat-num">{loading ? '…' : stats.cities}</div>
                <div className="hstat-lbl">Cities covered</div>
              </div>
            </div>
            <div className="hstat">
              <div>
                <div className="hstat-num">{loading ? '…' : fmtMoney(stats.avgRent)}</div>
                <div className="hstat-lbl">Avg rent/month</div>
              </div>
            </div>
            <div className="hstat">
              <div>
                <div className="hstat-num">{loading ? '…' : stats.landlords}</div>
                <div className="hstat-lbl">Verified landlords</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CATEGORY BAR ══ */}
      <div className="categories">
        <div className="cat-inner">
          {PROPERTY_TYPES.map(type => (
            <button
              key={type}
              className={`cat-pill${selectedType === type ? ' active' : ''}`}
              onClick={() => {
                setSelectedType(type)
                document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <span className="cat-ico">{CATEGORY_ICONS[type]}</span>
              {type}
            </button>
          ))}
          <div className="cat-divider" />
          <button
            className={`cat-filter-btn${hasActiveFilters ? ' active' : ''}`}
            onClick={() => setFilterOpen(v => !v)}
          >
            ⚡ Filters
            {hasActiveFilters && <span className="filter-dot" />}
          </button>
        </div>

        {filterOpen && (
          <div className="filter-panel">
            <div className="fp-inner">
              <div className="fp-grid">
                <div className="fp-field">
                  <label className="fp-label">City</label>
                  <select className="fp-select" value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
                    <option value="">All Cities</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fp-field">
                  <label className="fp-label">Min Price</label>
                  <input className="fp-input" type="number" placeholder="0" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                </div>
                <div className="fp-field">
                  <label className="fp-label">Max Price</label>
                  <input className="fp-input" type="number" placeholder="Any" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
                </div>
                <div className="fp-field">
                  <label className="fp-label">Bedrooms</label>
                  <select className="fp-select" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
                    {BEDROOM_OPTIONS.map(b => <option key={b} value={b}>{b === 'Any' ? 'Any' : `${b} bed${b === '1' ? '' : 's'}`}</option>)}
                  </select>
                </div>
              </div>
              <div className="fp-actions">
                <button className="fp-clear" onClick={() => { setSelectedCity(''); setPriceMin(''); setPriceMax(''); setBedrooms('Any'); setSelectedTags([]); setSelectedType('All') }}>Clear All</button>
                <button className="fp-apply" onClick={() => setFilterOpen(false)}>Apply</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ TAG QUICK FILTERS ══ */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div className="tag-pills-row">
          <span className="tag-pill-lbl">Amenities:</span>
          {QUICK_TAGS.map(tag => (
            <button
              key={tag}
              className={`tag-pill${selectedTags.includes(tag) ? ' active' : ''}`}
              onClick={() => setSelectedTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag])}
            >{tag}</button>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          MAIN PAGE CONTENT
      ══════════════════════════════════════════════════════════ */}

      {/* ── FEATURED LISTINGS (horizontal scroll) ── */}
      {!loading && featuredListings.length > 0 && !hasActiveFilters && !searchQuery && (
        <div className="page">
          <div className="section">
            <div className="section-header">
              <div>
                <div className="section-title">✨ <em>Featured</em> Listings</div>
                <div className="section-sub">Hand-picked properties with great photos</div>
              </div>
              <a href="#browse-section" className="section-link" onClick={e => { e.preventDefault(); document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' }) }}>
                View all →
              </a>
            </div>
            <div className="featured-strip">
              {featuredListings.map(l => (
                <div key={l.id} className="fcard" onClick={() => { setDetail(l); setDetailPhoto(0) }}>
                  <div className="fcard-img">
                    <img src={l.photos[0]} alt={l.title} loading="lazy" />
                    <button className="fcard-save" onClick={e => toggleSave(l.id, e)}>
                      {savedIds.has(l.id) ? '❤️' : '🤍'}
                    </button>
                    {isAvailableSoon(l.available_from) && <div className="fcard-badge">Available soon</div>}
                  </div>
                  <div className="fcard-body">
                    <div className="fcard-type">{l.property_type}</div>
                    <div className="fcard-title">{l.title}</div>
                    <div className="fcard-loc">📍 {l.city || 'Unknown'}</div>
                    <div className="fcard-price">{fmtMoney(l.rent_amount)}<span> /mo</span></div>
                    <div className="fcard-facts">
                      {l.bedrooms > 0 && <span className="fcard-fact">🛏 {l.bedrooms}</span>}
                      <span className="fcard-fact">🚿 {l.bathrooms}</span>
                      {l.area_sqft && <span className="fcard-fact">📐 {l.area_sqft.toLocaleString()} sqft</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BROWSE BY CITY ── */}
      {!loading && cityCards.length > 0 && !hasActiveFilters && !searchQuery && (
        <div className="page">
          <div className="section">
            <div className="section-header">
              <div>
                <div className="section-title">Browse by <em>city</em></div>
                <div className="section-sub">Find rentals in your preferred location</div>
              </div>
            </div>
            <div className="city-grid">
              {cityCards.map(c => (
                <div
                  key={c.city}
                  className="city-card"
                  onClick={() => {
                    setSelectedCity(c.city)
                    document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                >
                  <img className="city-card-img" src={c.photo} alt={c.city} loading="lazy" />
                  <div className="city-card-overlay" />
                  <div className="city-card-body">
                    <div className="city-card-name">{c.city}</div>
                    <div className="city-card-count">{c.count} listing{c.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── AVAILABLE SOON ── */}
      {!loading && availableListings.length > 0 && !hasActiveFilters && !searchQuery && (
        <div className="page">
          <div className="section">
            <div className="section-header">
              <div>
                <div className="section-title">🟢 Available <em>soon</em></div>
                <div className="section-sub">Move-in ready within 2 weeks</div>
              </div>
            </div>
            <div className="featured-strip">
              {availableListings.map(l => (
                <div key={l.id} className="fcard" onClick={() => { setDetail(l); setDetailPhoto(0) }}>
                  <div className="fcard-img">
                    {l.photos.length > 0
                      ? <img src={l.photos[0]} alt={l.title} loading="lazy" />
                      : <div className="fcard-placeholder">🏠</div>
                    }
                    <button className="fcard-save" onClick={e => toggleSave(l.id, e)}>{savedIds.has(l.id) ? '❤️' : '🤍'}</button>
                    <div className="fcard-badge">Available soon</div>
                  </div>
                  <div className="fcard-body">
                    <div className="fcard-type">{l.property_type}</div>
                    <div className="fcard-title">{l.title}</div>
                    <div className="fcard-loc">📍 {l.city || 'Unknown'}</div>
                    <div className="fcard-price">{fmtMoney(l.rent_amount)}<span> /mo</span></div>
                    <div className="fcard-facts">
                      {l.bedrooms > 0 && <span className="fcard-fact">🛏 {l.bedrooms}</span>}
                      <span className="fcard-fact">🚿 {l.bathrooms}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TRUST BANNER ── */}
      {!hasActiveFilters && !searchQuery && (
        <div className="page">
          <div className="trust-banner">
            <div>
              <div className="tb-title">
                Ready to find your<br /><em>next home?</em>
              </div>
              <p className="tb-sub">
                Join thousands of seekers who found their perfect rental on Rentura.
                Free to browse, free to sign up.
              </p>
              <div className="tb-btns">
                <a href="/signup" className="tb-btn-primary">Create free account →</a>
                <a href="/landlord" className="tb-btn-secondary">List your property</a>
              </div>
            </div>
            <div className="tb-right">
              {[
                { ico: '✅', title: 'Verified landlords', desc: 'Every landlord is reviewed before listing.' },
                { ico: '💬', title: 'Direct messaging', desc: 'Talk directly with property owners.' },
                { ico: '❤️', title: 'Save favourites', desc: 'Shortlist properties across devices.' },
                { ico: '🔔', title: 'Instant alerts', desc: 'Get notified when new listings match.' },
              ].map(c => (
                <div key={c.title} className="tb-card">
                  <div className="tb-card-ico">{c.ico}</div>
                  <div className="tb-card-title">{c.title}</div>
                  <div className="tb-card-desc">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ BROWSE ALL ══ */}
      <div className="page" id="browse-section">
        <div className="browse-toolbar">
          <div>
            <div className="section-title" style={{ marginBottom: 3 }}>
              {hasActiveFilters || searchQuery
                ? <><em>Results</em> for your search</>
                : <>All <em>listings</em></>
              }
            </div>
          </div>
          <div className="browse-right">
            <span className="browse-count">{browsedListings.length} propert{browsedListings.length !== 1 ? 'ies' : 'y'}</span>
            <div className="view-btns">
              <button className={`vbtn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} title="Grid">⊞</button>
              <button className={`vbtn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} title="List">☰</button>
            </div>
          </div>
        </div>

        <div className={`listing-grid${view === 'list' ? ' list-view' : ''}`}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="lcard" style={{ cursor: 'default' }}>
                <div className="skeleton" style={{ height: 170 }} />
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton" style={{ height: 10, width: '40%' }} />
                  <div className="skeleton" style={{ height: 14, width: '80%' }} />
                  <div className="skeleton" style={{ height: 10, width: '50%' }} />
                  <div className="skeleton" style={{ height: 20, width: '40%' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div className="skeleton" style={{ height: 20, width: 58, borderRadius: 6 }} />
                    <div className="skeleton" style={{ height: 20, width: 58, borderRadius: 6 }} />
                  </div>
                </div>
                <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 7 }} />
                    <div className="skeleton" style={{ height: 10, width: 70 }} />
                  </div>
                  <div className="skeleton" style={{ height: 28, width: 74, borderRadius: 8 }} />
                </div>
              </div>
            ))
          ) : browsedListings.length === 0 ? (
            <div className="empty-state">
              <div className="es-ico">🏘️</div>
              <div className="es-title">No listings found</div>
              <div className="es-sub">Try adjusting your search or clearing some filters to see more properties.</div>
              <button className="es-btn" onClick={() => { setSearchQuery(''); setSelectedType('All'); setSelectedCity(''); setPriceMin(''); setPriceMax(''); setBedrooms('Any'); setSelectedTags([]) }}>Clear all filters</button>
            </div>
          ) : browsedListings.map(l => (
            <div
              key={l.id}
              className={`lcard${view === 'list' ? ' list-view' : ''}`}
              onClick={() => { setDetail(l); setDetailPhoto(0) }}
            >
              <div className="lcard-banner">
                {l.photos.length > 0
                  ? <img className="lcard-img" src={l.photos[0]} alt={l.title} loading="lazy" />
                  : <div className="lcard-placeholder">🏠</div>
                }
                {l.photos.length > 1 && <div className="lcard-photo-ct">📷 {l.photos.length}</div>}
                <button className="lcard-save" onClick={e => toggleSave(l.id, e)}>
                  {savedIds.has(l.id) ? '❤️' : '🤍'}
                </button>
                {l.available_from && isAvailableSoon(l.available_from) && <div className="lcard-avail">Available soon</div>}
              </div>
              <div className="lcard-body">
                <div className="lcard-type">{l.property_type}</div>
                <div className="lcard-title">{l.title}</div>
                <div className="lcard-loc">📍 {l.city || 'Location not specified'}</div>
                <div className="lcard-price">{fmtMoney(l.rent_amount)}<span> /mo</span></div>
                <div className="lcard-facts">
                  {l.bedrooms > 0 && <span className="lcard-fact">🛏 {l.bedrooms} bed</span>}
                  <span className="lcard-fact">🚿 {l.bathrooms} bath</span>
                  {l.area_sqft && <span className="lcard-fact">📐 {l.area_sqft.toLocaleString()} sqft</span>}
                  {l.available_from && <span className="lcard-fact">📅 {fmtDate(l.available_from)}</span>}
                </div>
                {l.tags.length > 0 && (
                  <div className="lcard-tags">
                    {l.tags.slice(0, 3).map(t => <span key={t} className="lcard-tag">{t}</span>)}
                    {l.tags.length > 3 && <span className="lcard-tag">+{l.tags.length - 3}</span>}
                  </div>
                )}
                {view === 'list' && l.description && <div className="lcard-desc">{l.description}</div>}
              </div>
              <div className="lcard-footer">
                <div className="lcard-ll">
                  <div className="lcard-ll-av" style={{ background: AVATAR_GRADIENTS[l.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length] }}>
                    {l.landlord_initials}
                  </div>
                  <span className="lcard-ll-name">{l.landlord_name}</span>
                </div>
                <button className="lcard-contact" onClick={e => contactLandlord(l.landlord_id, e)}>
                  💬 Contact
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-logo">
                <div className="footer-logo-icon">
                  <Image src="/icon.png" alt="Rentura" width={18} height={18} />
                </div>
                <span className="footer-logo-name">Rentura</span>
              </div>
              <p className="footer-tagline">The smarter way to find your next rental home.</p>
            </div>
            <div>
              <div className="footer-col-title">Explore</div>
              <a href="/seeker" className="footer-link">Browse Listings</a>
              <a href="/seeker/map" className="footer-link">Map View</a>
              <a href="/landlord" className="footer-link">List Your Property</a>
            </div>
            <div>
              <div className="footer-col-title">Account</div>
              <a href="/login" className="footer-link">Sign In</a>
              <a href="/signup" className="footer-link">Create Account</a>
              <a href="/seeker/settings" className="footer-link">Settings</a>
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              <a href="/about" className="footer-link">About</a>
              <a href="/contact" className="footer-link">Contact</a>
              <a href="/privacy" className="footer-link">Privacy Policy</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} Rentura. All rights reserved.</span>
            <div className="footer-legal">
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
              <a href="/cookies">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
