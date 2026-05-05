'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

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
type UserRole = 'landlord' | 'seeker' | 'agent' | null

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

const CITY_PHOTOS: Record<string, string> = {
  'Colombo': 'https://images.unsplash.com/photo-1586096899244-9b947c4e36e7?w=600&q=80',
  'Kandy': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
  'Galle': 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=600&q=80',
  'Negombo': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80',
  'Jaffna': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80',
  'default': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',
}

const PROPERTY_TYPES = ['All', 'House', 'Apartment', 'Studio', 'Villa', 'Room', 'Office']
const BEDROOM_OPTIONS = ['Any', '1', '2', '3', '4', '5+']
const QUICK_TAGS = ['Furnished', 'Pet Friendly', 'Parking', 'Air Conditioned', 'Pool', 'Gym', 'Solar Panel']
const CATEGORY_ICONS: Record<string, string> = {
  All: '🏘️', House: '🏡', Apartment: '🏢', Studio: '🛋️', Villa: '🏰', Room: '🚪', Office: '🏗️',
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

export default function SeekerMarketplace() {
  const router = useRouter()
  const { fmtMoney } = useCurrency()
  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()

  // Auth
  const [userId, setUserId] = useState<string | null>(null)
  const [userInitials, setUserInitials] = useState('')
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [userInterests, setUserInterests] = useState<{ tags: string[]; cities: string[] }>({ tags: [], cities: [] })

  // Data
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [featuredListings, setFeaturedListings] = useState<Listing[]>([])
  const [availableListings, setAvailableListings] = useState<Listing[]>([])
  const [cityCards, setCityCards] = useState<CityCard[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Stats
  const [stats, setStats] = useState({ total: 0, cities: 0, minRent: 0, landlords: 0 })

  // UI state
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [listModalOpen, setListModalOpen] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [bedrooms, setBedrooms] = useState('Any')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [browsedListings, setBrowsedListings] = useState<Listing[]>([])

  // Scroll
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Auth
  useEffect(() => {
    ; (async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserInitials(initials(user.user_metadata?.full_name || 'U'))
          const { data: profile } = await sb
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single()
          setUserRole((profile?.role as UserRole) || 'seeker')

          const { data: savedRows } = await sb
            .from('saved_listings')
            .select('listing_id, listings(tags, city)')
            .eq('seeker_id', user.id)
          const savedSet = new Set((savedRows || []).map((s: any) => s.listing_id))
          setSavedIds(savedSet)

          const tagCounts: Record<string, number> = {}
          const cityCounts: Record<string, number> = {}
            ; (savedRows || []).forEach((s: any) => {
              const l = s.listings
              if (!l) return
                ; (l.tags || []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
              if (l.city) cityCounts[l.city] = (cityCounts[l.city] || 0) + 1
            })
          const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0])
          const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0])
          setUserInterests({ tags: topTags, cities: topCities })
        }
      } catch { /* guest */ }
      finally { setAuthChecked(true) }
    })()
  }, [])

  // Load Listings
  useEffect(() => {
    ; (async () => {
      setLoading(true)
      try {
        const sb = createClient()
        const { data: rows } = await sb
          .from('listings')
          .select('id,title,description,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,photos,tags,city,property_type,area_sqft')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(80)

        const landlordIds = [...new Set((rows || []).map((r: any) => r.landlord_id).filter(Boolean))]
        const profileMap: Record<string, string> = {}
        if (landlordIds.length > 0) {
          const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', landlordIds)
            ; (pArr || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Landlord' })
        }

        const mapped: Listing[] = (rows || []).map((r: any) => {
          const lName = profileMap[r.landlord_id] || 'Landlord'
          return {
            id: r.id, title: r.title || 'Untitled', description: r.description || '',
            landlord_id: r.landlord_id || '', landlord_name: lName, landlord_initials: initials(lName),
            bedrooms: r.bedrooms || 0, bathrooms: r.bathrooms || 1,
            rent_amount: r.rent_amount || 0, currency: r.currency || 'LKR',
            available_from: r.available_from || '',
            photos: r.photos || [], tags: r.tags || [],
            city: r.city || '', property_type: r.property_type || 'House',
            area_sqft: r.area_sqft || null, saved: false,
          }
        })

        setAllListings(mapped)

        const cityMap: Record<string, number> = {}
        mapped.forEach(l => { if (l.city) cityMap[l.city] = (cityMap[l.city] || 0) + 1 })
        setCities(Object.keys(cityMap))
        setCityCards(
          Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([city, count]) => ({ city, count, photo: CITY_PHOTOS[city] || CITY_PHOTOS.default }))
        )

        const rents = mapped.map(l => l.rent_amount).filter(Boolean)
        setStats({
          total: mapped.length,
          cities: Object.keys(cityMap).length,
          minRent: rents.length > 0 ? Math.min(...rents) : 0,
          landlords: new Set(mapped.map(l => l.landlord_id)).size,
        })

        setAvailableListings(mapped.filter(l => isAvailableSoon(l.available_from)).slice(0, 6))
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [])

  // Featured listings
  useEffect(() => {
    if (allListings.length === 0) return
    if (userId && (userInterests.tags.length > 0 || userInterests.cities.length > 0)) {
      const scored = allListings
        .filter(l => l.photos.length > 0)
        .map(l => {
          let score = 0
          userInterests.tags.forEach(t => { if (l.tags.includes(t)) score += 2 })
          userInterests.cities.forEach(c => { if (l.city === c) score += 3 })
          return { ...l, score }
        })
        .sort((a, b) => b.score - a.score)
      setFeaturedListings(scored.slice(0, 6))
    } else {
      const withPhotos = allListings.filter(l => l.photos.length > 0).slice(0, 6)
      const withoutPhotos = allListings.filter(l => l.photos.length === 0).slice(0, Math.max(0, 6 - withPhotos.length))
      setFeaturedListings([...withPhotos, ...withoutPhotos])
    }
  }, [allListings, userId, userInterests])

  // Filtered listings
  const getFiltered = useCallback(() => {
    let result = allListings
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
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

  useEffect(() => { setBrowsedListings(getFiltered()) }, [getFiltered])

  // Save / Unsave
  async function toggleSave(listingId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!userId) { router.push('/login'); return }
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

  // Contact
  function contactLandlord(landlordId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!userId) { router.push('/login'); return }
    router.push(`/seeker/messages?to=${landlordId}`)
  }

  // Navigate to listing detail
  function goToListing(listingId: string) {
    router.push(`/seeker/listing-details/${listingId}`)
  }

  // List Your Property
  function handleListProperty(e: React.MouseEvent) {
    e.preventDefault()
    if (!authChecked) return
    if (!userId) { router.push('/signup'); return }
    if (userRole === 'landlord' || userRole === 'agent') { router.push('/landlord/listings'); return }
    setListModalOpen(true)
  }

  const hasActiveFilters = selectedType !== 'All' || selectedCity || priceMin || priceMax || bedrooms !== 'Any' || selectedTags.length > 0
  const showSections = !hasActiveFilters && !searchQuery

  function scrollToBrowse() {
    document.getElementById('browse-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,400&display=swap');

        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{font-family:'Plus Jakarta Sans',sans-serif;background:#F7F8FC;color:#0F172A;-webkit-font-smoothing:antialiased;overflow-x:hidden}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:99px}

        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease}
        .nav.scrolled{background:rgba(255,255,255,.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav-inner{max-width:1320px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:16px}
        .nav-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;text-decoration:none}
        .nav-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-.3px;transition:color .2s;text-decoration:none}
        .nav.transparent .nav-logo-name{color:#fff}
        .nav-search-wrap{flex:1;max-width:420px;display:none;position:relative;align-items:center}
        .nav.scrolled .nav-search-wrap{display:flex}
        .nav-s-ico{position:absolute;left:12px;font-size:14px;color:#94A3B8;pointer-events:none}
        .nav-s-input{width:100%;padding:9px 12px 9px 36px;border-radius:12px;border:1.5px solid #E2E8F0;background:#F8FAFC;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:all .2s}
        .nav-s-input::placeholder{color:#94A3B8}
        .nav-s-input:focus{border-color:#3B82F6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .nav-spacer{flex:1}
        .nav-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav.transparent .nav-link{color:rgba(255,255,255,.8)}
        .nav.transparent .nav-link:hover{color:#fff;background:rgba(255,255,255,.1)}
        .nav-list-btn{font-size:13px;font-weight:700;padding:8px 16px;border-radius:10px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;text-decoration:none;transition:all .15s;white-space:nowrap;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-list-btn:hover{background:#DBEAFE;border-color:#93C5FD}
        .nav.transparent .nav-list-btn{color:rgba(255,255,255,.9);border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.1)}
        .nav.transparent .nav-list-btn:hover{background:rgba(255,255,255,.18)}
        .nav-signin{font-size:13px;font-weight:700;color:#fff;padding:8px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:all .15s;white-space:nowrap}
        .nav-signin:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,.4)}
        .nav-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0;border:2px solid rgba(255,255,255,.4)}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569;flex-shrink:0}
        .nav.transparent .hamburger{color:#fff}

        .mm-overlay{display:none;position:fixed;inset:0;z-index:1000}
        .mm-overlay.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px)}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;padding:24px 20px;display:flex;flex-direction:column;gap:4px;box-shadow:-8px 0 40px rgba(0,0,0,.12)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;margin-bottom:8px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:11px 14px;border-radius:10px;text-decoration:none;display:block;transition:background .15s}
        .mm-link:hover{background:#F1F5F9}
        .mm-div{height:1px;background:#F1F5F9;margin:8px 0}
        .mm-cta{font-size:14px;font-weight:700;color:#fff;padding:13px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);text-align:center;text-decoration:none;display:block;margin-top:8px}

        .hero{position:relative;min-height:600px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;padding:90px 24px 0}
        .hero-bg{position:absolute;inset:0;background:linear-gradient(145deg,#0B1629 0%,#162344 45%,#0B1629 100%)}
        .hero-orbs{position:absolute;inset:0;pointer-events:none;overflow:hidden}
        .hero-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.35}
        .hero-orb-1{width:500px;height:500px;background:#2563EB;top:-100px;left:-100px}
        .hero-orb-2{width:400px;height:400px;background:#6366F1;bottom:-80px;right:-60px}
        .hero-orb-3{width:300px;height:300px;background:#0EA5E9;top:40%;left:55%}
        .hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:56px 56px;pointer-events:none}
        .hero-content{position:relative;z-index:2;text-align:center;max-width:800px;width:100%}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:99px;padding:6px 16px;font-size:12px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.5px;text-transform:uppercase;margin-bottom:22px;backdrop-filter:blur(4px)}
        .hero-title{font-family:'Fraunces',serif;font-size:clamp(36px,6vw,60px);font-weight:300;color:#F8FAFC;line-height:1.1;letter-spacing:-1.5px;margin-bottom:14px}
        .hero-title em{font-style:italic;color:#93C5FD}
        .hero-title strong{font-weight:700;color:#fff}
        .hero-sub{font-size:clamp(14px,2vw,16px);color:rgba(255,255,255,.5);margin-bottom:36px;line-height:1.65;max-width:520px;margin-left:auto;margin-right:auto}
        .hero-search{background:rgba(255,255,255,.97);border-radius:20px;padding:10px 10px 10px 14px;display:flex;align-items:center;gap:0;box-shadow:0 12px 48px rgba(0,0,0,.3);max-width:780px;width:100%;margin:0 auto 26px}
        .hs-input-wrap{flex:1;min-width:0;position:relative;display:flex;align-items:center}
        .hs-ico{position:absolute;left:0;font-size:15px;color:#94A3B8;pointer-events:none}
        .hs-input{width:100%;padding:10px 10px 10px 26px;border:none;outline:none;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:transparent}
        .hs-input::placeholder{color:#94A3B8}
        .hs-sep{width:1px;height:30px;background:#E2E8F0;margin:0 8px;flex-shrink:0}
        .hs-select{padding:9px 10px;border:none;outline:none;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#374151;background:transparent;cursor:pointer;white-space:nowrap;flex-shrink:0;max-width:120px}
        .hs-btn{padding:11px 26px;border-radius:14px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 16px rgba(37,99,235,.45);transition:all .18s;white-space:nowrap;flex-shrink:0;margin-left:8px}
        .hs-btn:hover{transform:translateY(-1px);box-shadow:0 4px 22px rgba(37,99,235,.55)}
        .hero-hints{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:0}
        .hero-hint{font-size:12px;color:rgba(255,255,255,.38);font-weight:500}
        .hero-hint-tag{font-size:12px;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.14);border-radius:99px;padding:4px 12px;cursor:pointer;transition:all .15s;font-weight:600;background:none;font-family:'Plus Jakarta Sans',sans-serif}
        .hero-hint-tag:hover{background:rgba(255,255,255,.14);color:#fff}
        .hero-stats{position:relative;z-index:2;width:100%;background:rgba(255,255,255,.05);border-top:1px solid rgba(255,255,255,.08);margin-top:36px;margin-bottom:15px;border-radius:12px}
        .hero-stats-inner{max-width:1320px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0}
        .hstat{display:flex;align-items:center;gap:10px;padding:6px 28px}
        .hstat+.hstat{border-left:1px solid rgba(255,255,255,.1)}
        .hstat-num{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:#F1F5F9;line-height:1}
        .hstat-lbl{font-size:12px;color:rgba(255,255,255,.42);font-weight:500;line-height:1.3;margin-top:2px}

        .cat-bar{background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:68px;z-index:100;box-shadow:0 2px 10px rgba(15,23,42,.05)}
        .cat-inner{max-width:1320px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;height:56px}
        .cat-inner::-webkit-scrollbar{display:none}
        .cat-pill{display:flex;align-items:center;gap:6px;padding:6px 16px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0}
        .cat-pill:hover{border-color:#CBD5E1;background:#F8FAFC}
        .cat-pill.active{background:#0F172A;border-color:#0F172A;color:#fff}
        .cat-sep{width:1px;height:20px;background:#E2E8F0;flex-shrink:0;margin:0 4px}
        .cat-filter-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0}
        .cat-filter-btn.active{border-color:#0F172A;background:#0F172A;color:#fff}
        .flt-dot{width:7px;height:7px;border-radius:50%;background:#EF4444;flex-shrink:0}
        .filter-panel{background:#fff;border-bottom:1px solid #E2E8F0;box-shadow:0 6px 20px rgba(15,23,42,.07)}
        .fp-inner{max-width:1320px;margin:0 auto;padding:18px 24px}
        .fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:14px}
        .fp-field{display:flex;flex-direction:column;gap:5px}
        .fp-label{font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px}
        .fp-input,.fp-select{padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .fp-input:focus,.fp-select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .fp-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #F1F5F9;padding-top:14px}
        .fp-clear{padding:8px 16px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .fp-apply{padding:8px 20px;border-radius:10px;border:none;background:#0F172A;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        .tag-row{background:#fff;border-bottom:1px solid #F1F5F9}
        .tag-row-inner{max-width:1320px;margin:0 auto;padding:12px 24px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}
        .tr-lbl{font-size:12px;font-weight:700;color:#94A3B8;white-space:nowrap}
        .tag-pill{padding:5px 13px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
        .tag-pill:hover{border-color:#CBD5E1;background:#F8FAFC}
        .tag-pill.active{background:#F0FDF4;border-color:#86EFAC;color:#16A34A}

        .page{max-width:1320px;margin:0 auto;padding:0 24px}
        .section{padding:48px 0 0}
        .sec-hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
        .sec-title{font-family:'Fraunces',serif;font-size:clamp(20px,3vw,26px);font-weight:400;color:#0F172A;letter-spacing:-.4px}
        .sec-title em{font-style:italic;color:#2563EB}
        .sec-sub{font-size:13px;color:#94A3B8;margin-top:3px}
        .sec-link{font-size:13px;font-weight:700;color:#2563EB;text-decoration:none;white-space:nowrap;display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sec-link:hover{text-decoration:underline}

        .feat-strip{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none;padding-bottom:6px;-webkit-overflow-scrolling:touch}
        .feat-strip::-webkit-scrollbar{display:none}
        .feat-label{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:#94A3B8;margin-bottom:14px;text-transform:uppercase;letter-spacing:.5px}
        .feat-label.personalised{color:#7C3AED}
        .fcard{min-width:290px;max-width:290px;background:#fff;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s;flex-shrink:0;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .fcard:hover{box-shadow:0 10px 32px rgba(15,23,42,.12);transform:translateY(-3px)}
        .fcard-img{height:195px;position:relative;overflow:hidden;background:#F1F5F9}
        .fcard-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
        .fcard:hover .fcard-img img{transform:scale(1.04)}
        .fcard-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:52px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .fcard-save{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1);transition:transform .15s;z-index:2}
        .fcard-save:hover{transform:scale(1.12)}
        .fcard-badge{position:absolute;top:10px;left:10px;font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:rgba(16,185,129,.9);color:#fff}
        .fcard-body{padding:14px 16px}
        .fcard-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .fcard-title{font-size:14.5px;font-weight:700;color:#0F172A;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fcard-loc{font-size:12px;color:#94A3B8;margin-bottom:9px;display:flex;align-items:center;gap:3px}
        .fcard-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A}
        .fcard-price span{font-size:11.5px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .fcard-facts{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
        .fcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:2px 7px}

        .city-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .city-card{position:relative;height:155px;border-radius:18px;overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s}
        .city-card:hover{transform:translateY(-3px);box-shadow:0 14px 36px rgba(15,23,42,.18)}
        .city-card img{width:100%;height:100%;object-fit:cover;display:block}
        .city-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(15,23,42,.78) 0%,rgba(15,23,42,.08) 60%)}
        .city-body{position:absolute;bottom:14px;left:14px;right:14px}
        .city-name{font-family:'Fraunces',serif;font-size:17px;font-weight:700;color:#fff;margin-bottom:2px}
        .city-count{font-size:11.5px;color:rgba(255,255,255,.65);font-weight:500}

        .trust{background:#0F172A;border-radius:24px;padding:48px 52px;margin:48px 0;display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center;overflow:hidden;position:relative}
        .trust::before{content:'';position:absolute;top:-60px;right:-40px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.16) 0%,transparent 70%);pointer-events:none}
        .trust-title{font-family:'Fraunces',serif;font-size:clamp(22px,3vw,32px);font-weight:300;color:#F8FAFC;letter-spacing:-.5px;margin-bottom:12px;line-height:1.25}
        .trust-title em{font-style:italic;color:#93C5FD}
        .trust-sub{font-size:14px;color:rgba(255,255,255,.47);line-height:1.75;margin-bottom:26px}
        .trust-btns{display:flex;gap:10px;flex-wrap:wrap}
        .trust-btn-p{padding:12px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;box-shadow:0 2px 14px rgba(37,99,235,.4);transition:all .18s}
        .trust-btn-p:hover{transform:translateY(-1px)}
        .trust-btn-s{padding:12px 24px;border-radius:12px;border:1.5px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:rgba(255,255,255,.78);font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;transition:all .18s}
        .trust-btn-s:hover{background:rgba(255,255,255,.12)}
        .trust-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .trust-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px}
        .tc-ico{font-size:22px;margin-bottom:9px}
        .tc-title{font-size:13px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .tc-desc{font-size:12px;color:rgba(255,255,255,.4);line-height:1.5}

        .browse-toolbar{display:flex;align-items:center;justify-content:space-between;padding:24px 0 16px;gap:10px;flex-wrap:wrap}
        .browse-count{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap}
        .view-btns{display:flex;gap:3px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;padding:3px}
        .vbtn{width:30px;height:30px;border:none;background:none;border-radius:7px;cursor:pointer;color:#94A3B8;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .vbtn.active{background:#F1F5F9;color:#0F172A}
        .browse-right{display:flex;align-items:center;gap:8px}

        .listing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding-bottom:64px}
        .listing-grid.list-v{grid-template-columns:1fr}
        .lcard{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;cursor:pointer;transition:box-shadow .18s,transform .18s;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .lcard:hover{box-shadow:0 8px 28px rgba(15,23,42,.10);transform:translateY(-2px)}
        .lcard.list-v{display:flex;flex-direction:row}
        .lcard-banner{position:relative;height:168px;background:#F1F5F9;overflow:hidden;flex-shrink:0}
        .lcard.list-v .lcard-banner{width:230px;height:auto;min-height:155px}
        .lcard-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
        .lcard:hover .lcard-img{transform:scale(1.04)}
        .lcard-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lcard-save{position:absolute;top:9px;right:9px;width:30px;height:30px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1);transition:transform .15s;z-index:2}
        .lcard-save:hover{transform:scale(1.12)}
        .lcard-avail{position:absolute;bottom:9px;right:9px;font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;background:rgba(16,185,129,.9);color:#fff}
        .lcard-photo-ct{position:absolute;bottom:9px;left:9px;background:rgba(15,23,42,.55);color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 7px}
        .lcard-body{padding:13px 15px;flex:1;display:flex;flex-direction:column;min-width:0}
        .lcard-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .lcard-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard.list-v .lcard-title{white-space:normal}
        .lcard-loc{font-size:12px;color:#94A3B8;margin-bottom:8px;display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:7px}
        .lcard-price span{font-size:11.5px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .lcard-facts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
        .lcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:2px 7px}
        .lcard-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
        .lcard-tag{font-size:10px;color:#7C3AED;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.16);border-radius:99px;padding:2px 7px;font-weight:600}
        .lcard-desc{font-size:12px;color:#64748B;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;margin-bottom:8px}
        .lcard-footer{padding:10px 14px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:6px}
        .lcard-ll{display:flex;align-items:center;gap:7px;min-width:0}
        .lcard-ll-av{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;flex-shrink:0}
        .lcard-ll-name{font-size:11.5px;color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
        .lcard-contact{padding:5px 12px;border-radius:8px;border:none;background:#0F172A;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s;white-space:nowrap;flex-shrink:0}
        .lcard-contact:hover{background:#1E293B}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skel{background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}
        .empty{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;grid-column:1/-1}
        .empty-ico{font-size:52px;margin-bottom:14px}
        .empty-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .empty-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px;line-height:1.6}
        .empty-btn{padding:9px 22px;border-radius:10px;border:none;background:#0F172A;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        .list-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px)}
        .list-modal-bg.open{display:flex}
        .list-modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;padding:28px 28px 40px;box-shadow:0 -8px 40px rgba(0,0,0,.18);animation:slideUp .3s ease}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .lm-drag{width:40px;height:4px;background:#E2E8F0;border-radius:99px;margin:0 auto 20px}
        .lm-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:6px;text-align:center}
        .lm-sub{font-size:13.5px;color:#94A3B8;text-align:center;margin-bottom:24px;line-height:1.6}
        .lm-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
        .lm-option{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:16px;padding:20px 16px;cursor:pointer;transition:all .2s;text-align:center;text-decoration:none;display:block}
        .lm-option:hover{border-color:#3B82F6;background:#EFF6FF;transform:translateY(-2px);box-shadow:0 6px 20px rgba(37,99,235,.12)}
        .lm-opt-ico{font-size:32px;margin-bottom:10px}
        .lm-opt-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:5px}
        .lm-opt-desc{font-size:12px;color:#94A3B8;line-height:1.5}
        .lm-cancel{width:100%;padding:12px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s}
        .lm-cancel:hover{background:#F8FAFC}

        .footer{background:#0F172A;border-top:1px solid #E2E8F0;padding:48px 0 24px}
        .footer-inner{max-width:1320px;margin:0 auto;padding:0 24px}
        .footer-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:36px;margin-bottom:36px}
        .footer-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px}
        .footer-logo-icon{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .footer-logo-name{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#FFF}
        .footer-tagline{font-size:13px;color:#94A3B8;line-height:1.65;max-width:210px}
        .footer-col-title{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#F8FAFC;margin-bottom:14px}
        .footer-link{display:block;font-size:13.5px;color:#94A3B8;text-decoration:none;margin-bottom:9px;transition:color .15s}
        .footer-link:hover{color:#F8FAFC}
        .footer-bottom{border-top:1px solid #94A3B8;padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .footer-copy{font-size:13px;color:#94A3B8}
        .footer-legal{display:flex;gap:16px}
        .footer-legal a{font-size:13px;color:#94A3B8;text-decoration:none}
        .footer-legal a:hover{color:#374151}

        @media(max-width:1200px){
          .listing-grid{grid-template-columns:repeat(3,1fr)}
          .city-grid{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:960px){
          .listing-grid{grid-template-columns:repeat(2,1fr)}
          .city-grid{grid-template-columns:repeat(2,1fr)}
          .trust{grid-template-columns:1fr;padding:36px}
          .trust-cards{display:none}
          .footer-top{grid-template-columns:1fr 1fr;gap:24px}
        }
        @media(max-width:768px){
          .hamburger{display:block}
          .nav-link,.nav-list-btn{display:none}
          .nav-search-wrap{display:none!important}
          .hero{padding:80px 16px 0;min-height:auto}
          .hero-title{font-size:clamp(42px,8vw,44px)}
          .hero-search{flex-wrap:wrap;padding:8px;border-radius:16px;gap:6px}
          .hs-sep{display:none}
          .hs-select{max-width:100px;font-size:12.5px}
          .hs-btn{width:96%;padding:12px}
          .hstat{padding:8px 16px}
          .hero-stats-inner{justify-content:flex-start}
          .city-grid{grid-template-columns:repeat(2,1fr)}
          .listing-grid{grid-template-columns:repeat(2,1fr)}
          .lcard.list-v{flex-direction:column}
          .lcard.list-v .lcard-banner{width:100%;min-height:160px}
          .fp-grid{grid-template-columns:1fr 1fr}
          .page{padding:0 14px}
          .cat-inner{padding:0 14px}
          .tag-row-inner{padding:10px 14px}
          .lm-options{grid-template-columns:1fr 1fr}
        }
        @media(max-width:520px){
          .listing-grid{grid-template-columns:1fr}
          .city-grid{grid-template-columns:repeat(2,1fr)}
          .city-card{height:130px}
          .feat-strip{gap:12px}
          .fcard{min-width:260px;max-width:260px}
          .footer-top{grid-template-columns:1fr}
          .trust{padding:24px 20px;border-radius:18px}
          .trust-btns{flex-direction:column}
          .trust-btn-p,.trust-btn-s{text-align:center}
          .hstat-num{font-size:18px}
          .lm-options{grid-template-columns:1fr}
          .hero-hints{display:none}
          .hero-eyebrow{font-size:10.5px;padding:5px 12px}
          .fp-grid{grid-template-columns:1fr}
          .nav-inner{padding:0 14px}
          .hero-stats-inner{padding:10px 12px}
          .hero-search{max-width:100%}
          .footer-bottom{justify-content:center}
        }
      `}</style>

      {/* ══ LIST PROPERTY MODAL ══ */}
      <div className={`list-modal-bg${listModalOpen ? ' open' : ''}`} onClick={() => setListModalOpen(false)}>
        <div className="list-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-drag" />
          <div className="lm-title">How would you like to list?</div>
          <div className="lm-sub">
            Your account is set up as a seeker. Choose how you'd like to get started with listing.
          </div>
          <div className="lm-options">
            <a href="/onboarding?role=landlord" className="lm-option">
              <div className="lm-opt-ico">🏠</div>
              <div className="lm-opt-title">List as Landlord</div>
              <div className="lm-opt-desc">You own the property and want to rent it directly to tenants.</div>
            </a>
            <a href="/onboarding?role=agent" className="lm-option">
              <div className="lm-opt-ico">🤝</div>
              <div className="lm-opt-title">List as Agent / Broker</div>
              <div className="lm-opt-desc">You represent a landlord or manage multiple properties professionally.</div>
            </a>
          </div>
          <button className="lm-cancel" onClick={() => setListModalOpen(false)}>Cancel</button>
        </div>
      </div>

      {/* ══ MOBILE MENU ══ */}
      <div className={`mm-overlay${mobileMenuOpen ? ' open' : ''}`}>
        <div className="mm-bg" onClick={() => setMobileMenuOpen(false)} />
        <div className="mm-panel">
          <button className="mm-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
          <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
          <a href="/seeker/listings" className="mm-link">📋 All Listings</a>
          <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
          <div className="mm-div" />
          <button
            className="mm-link"
            style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'inherit', fontWeight: 600, color: '#374151', padding: '11px 14px', borderRadius: 10, fontSize: 15 }}
            onClick={(e) => { setMobileMenuOpen(false); handleListProperty(e as any) }}
          >
            🏡 List Your Property
          </button>
          <div className="mm-div" />
          {userId
            ? <a href="/seeker/messages" className="mm-link">💬 Messages</a>
            : <a href="/login" className="mm-link">Sign In</a>
          }
          {!userId && <a href="/signup" className="mm-cta">Get Started Free →</a>}
        </div>
      </div>

      {/* ══ NAVBAR ══ */}
      <nav className={`nav${scrolled ? ' scrolled' : ' transparent'}`}>
        <div className="nav-inner">
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">
              <Image src="/icon.png" alt="Rentura" width={24} height={24} />
            </div>
            <span className="nav-logo-name">Rentura</span>
          </a>
          <div className="nav-search-wrap">
            <span className="nav-s-ico">🔍</span>
            <input
              className="nav-s-input"
              placeholder="Search city, area or property…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && scrollToBrowse()}
            />
          </div>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <a href="/seeker" className="nav-link">Home</a>
            <a href="/seeker/listings" className="nav-link">Listings</a>
            <a href="/seeker/map" className="nav-link">Map</a>
            <button className="nav-list-btn" onClick={handleListProperty}>List Your Property</button>
            {userId
              ? <a href="/seeker/profile" className="nav-avatar">{userInitials}</a>
              : <a href="/login" className="nav-signin">Sign In</a>
            }
            <button className="hamburger" onClick={() => setMobileMenuOpen(true)}>☰</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-orbs">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            🏡 {loading ? '…' : `${stats.total} verified listing${stats.total !== 1 ? 's' : ''}`}
          </div>
          <h1 className="hero-title">
            Find your <em>perfect</em><br />
            <strong>home, faster.</strong>
          </h1>
          <p className="hero-sub">
            Browse verified rentals from trusted landlords, no signup required.
          </p>
          <div className="hero-search">
            <div className="hs-input-wrap">
              <span className="hs-ico">🔍</span>
              <input
                className="hs-input"
                placeholder="City, neighbourhood, or property name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && scrollToBrowse()}
              />
            </div>
            <div className="hs-sep" />
            <select className="hs-select" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
              {BEDROOM_OPTIONS.map(b => <option key={b} value={b}>{b === 'Any' ? 'Any beds' : `${b} bed${b === '1' ? '' : 's'}`}</option>)}
            </select>
            <div className="hs-sep" />
            <select className="hs-select" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'Any type' : t}</option>)}
            </select>
            <button className="hs-btn" onClick={scrollToBrowse}>Search →</button>
          </div>
          <div className="hero-hints">
            <span className="hero-hint">Popular:</span>
            {['Furnished', 'Pet Friendly', 'Near City', 'Parking'].map(tag => (
              <button
                key={tag}
                className="hero-hint-tag"
                onClick={() => {
                  setSelectedTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag])
                  scrollToBrowse()
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
                <div className="hstat-num">{loading ? '…' : stats.landlords}</div>
                <div className="hstat-lbl">Verified landlords</div>
              </div>
            </div>
            <div className="hstat">
              <div>
                <div className="hstat-num">{loading ? '…' : (stats.minRent > 0 ? fmtMoney(stats.minRent) : '—')}</div>
                <div className="hstat-lbl">Starting from / mo</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CATEGORY BAR ══ */}
      <div className="cat-bar">
        <div className="cat-inner">
          <button
            className={`cat-filter-btn${hasActiveFilters ? ' active' : ''}`}
            onClick={() => setFilterOpen(v => !v)}
          >
            ⚡ Filters {hasActiveFilters && <span className="flt-dot" />}
          </button>
          <div className="cat-sep" />
          {PROPERTY_TYPES.map(type => (
            <button
              key={type}
              className={`cat-pill${selectedType === type ? ' active' : ''}`}
              onClick={() => { setSelectedType(type); scrollToBrowse() }}
            >
              {CATEGORY_ICONS[type]} {type}
            </button>
          ))}
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
                  <input className="fp-input" type="number" placeholder="0" min="0" value={priceMin} onKeyDown={blockInvalidChar} onChange={e => setPriceMin(e.target.value)} />
                </div>
                <div className="fp-field">
                  <label className="fp-label">Max Price</label>
                  <input className="fp-input" type="number" placeholder="Any" min="0" value={priceMax} onKeyDown={blockInvalidChar} onChange={e => setPriceMax(e.target.value)} />
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
      <div className="tag-row">
        <div className="tag-row-inner">
          <span className="tr-lbl">Amenities:</span>
          {QUICK_TAGS.map(tag => (
            <button
              key={tag}
              className={`tag-pill${selectedTags.includes(tag) ? ' active' : ''}`}
              onClick={() => setSelectedTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag])}
            >{tag}</button>
          ))}
        </div>
      </div>

      {/* ══ FEATURED ══ */}
      {!loading && featuredListings.length > 0 && showSections && (
        <div className="page">
          <div className="section">
            <div className="sec-hd">
              <div>
                {userId && userInterests.tags.length > 0
                  ? <div className="feat-label personalised">✨ Recommended for you</div>
                  : <div className="feat-label">🆕 Recently listed</div>
                }
                <div className="sec-title">
                  {userId && userInterests.tags.length > 0 ? <>Based on your <em>interests</em></> : <><em>Featured</em> listings</>}
                </div>
                <div className="sec-sub">
                  {userId && userInterests.tags.length > 0
                    ? `Matched to: ${userInterests.tags.slice(0, 2).join(', ')}${userInterests.cities.length > 0 ? `, ${userInterests.cities[0]}` : ''}`
                    : 'Properties with verified details'
                  }
                </div>
              </div>
              <button className="sec-link" onClick={scrollToBrowse}>View all →</button>
            </div>
            <div className="feat-strip">
              {featuredListings.map(l => (
                <div key={l.id} className="fcard" onClick={() => goToListing(l.id)}>
                  <div className="fcard-img">
                    {l.photos.length > 0
                      ? <img src={l.photos[0]} alt={l.title} loading="lazy" />
                      : <div className="fcard-ph">🏠</div>
                    }
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

      {/* ══ BROWSE BY CITY ══ */}
      {!loading && cityCards.length > 0 && showSections && (
        <div className="page">
          <div className="section">
            <div className="sec-hd">
              <div>
                <div className="sec-title">Browse by <em>city</em></div>
                <div className="sec-sub">Find rentals in your preferred location</div>
              </div>
            </div>
            <div className="city-grid">
              {cityCards.map(c => (
                <div key={c.city} className="city-card" onClick={() => { setSelectedCity(c.city); scrollToBrowse() }}>
                  <img src={c.photo} alt={c.city} loading="lazy" />
                  <div className="city-overlay" />
                  <div className="city-body">
                    <div className="city-name">{c.city}</div>
                    <div className="city-count">{c.count} listing{c.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ AVAILABLE SOON ══ */}
      {!loading && availableListings.length > 0 && showSections && (
        <div className="page">
          <div className="section">
            <div className="sec-hd">
              <div>
                <div className="sec-title">🟢 Available <em>soon</em></div>
                <div className="sec-sub">Move-in ready within 2 weeks</div>
              </div>
            </div>
            <div className="feat-strip">
              {availableListings.map(l => (
                <div key={l.id} className="fcard" onClick={() => goToListing(l.id)}>
                  <div className="fcard-img">
                    {l.photos.length > 0
                      ? <img src={l.photos[0]} alt={l.title} loading="lazy" />
                      : <div className="fcard-ph">🏠</div>
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

      {/* ══ TRUST BANNER ══ */}
      {showSections && (
        <div className="page">
          <div className="trust">
            <div>
              <div className="trust-title">Ready to find your<br /><em>next home?</em></div>
              <p className="trust-sub">Join thousands of seekers who found their perfect rental on Rentura. Free to browse, free to sign up.</p>
              <div className="trust-btns">
                <a href="/signup" className="trust-btn-p">Create free account →</a>
                <button className="trust-btn-s" onClick={handleListProperty}>List your property</button>
              </div>
            </div>
            <div className="trust-cards">
              {[
                { ico: '✅', title: 'Verified landlords', desc: 'Every landlord is reviewed before listing.' },
                { ico: '💬', title: 'Direct messaging', desc: 'Talk directly with property owners.' },
                { ico: '❤️', title: 'Save favourites', desc: 'Shortlist properties across devices.' },
                { ico: '🔔', title: 'Instant alerts', desc: 'Get notified when new listings match.' },
              ].map(c => (
                <div key={c.title} className="trust-card">
                  <div className="tc-ico">{c.ico}</div>
                  <div className="tc-title">{c.title}</div>
                  <div className="tc-desc">{c.desc}</div>
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
            <div className="sec-title" style={{ marginBottom: 3 }}>
              {hasActiveFilters || searchQuery ? <><em>Results</em> for your search</> : <>All <em>listings</em></>}
            </div>
          </div>
          <div className="browse-right">
            <span className="browse-count">
              {browsedListings.length} propert{browsedListings.length !== 1 ? 'ies' : 'y'}
            </span>
            <div className="view-btns">
              <button className={`vbtn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>⊞</button>
              <button className={`vbtn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>☰</button>
            </div>
          </div>
        </div>

        <div className={`listing-grid${view === 'list' ? ' list-v' : ''}`}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="lcard" style={{ cursor: 'default' }}>
                <div className="skel" style={{ height: 168 }} />
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skel" style={{ height: 10, width: '38%' }} />
                  <div className="skel" style={{ height: 14, width: '82%' }} />
                  <div className="skel" style={{ height: 10, width: '50%' }} />
                  <div className="skel" style={{ height: 20, width: '42%' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div className="skel" style={{ height: 20, width: 56, borderRadius: 6 }} />
                    <div className="skel" style={{ height: 20, width: 56, borderRadius: 6 }} />
                  </div>
                </div>
                <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <div className="skel" style={{ width: 26, height: 26, borderRadius: 7 }} />
                    <div className="skel" style={{ height: 10, width: 72 }} />
                  </div>
                  <div className="skel" style={{ height: 28, width: 72, borderRadius: 8 }} />
                </div>
              </div>
            ))
          ) : browsedListings.length === 0 ? (
            <div className="empty">
              <div className="empty-ico">🏘️</div>
              <div className="empty-title">No listings found</div>
              <div className="empty-sub">Try adjusting your search or clearing some filters to see more properties.</div>
              <button className="empty-btn" onClick={() => { setSearchQuery(''); setSelectedType('All'); setSelectedCity(''); setPriceMin(''); setPriceMax(''); setBedrooms('Any'); setSelectedTags([]) }}>Clear all filters</button>
            </div>
          ) : browsedListings.map(l => (
            <div
              key={l.id}
              className={`lcard${view === 'list' ? ' list-v' : ''}`}
              onClick={() => goToListing(l.id)}
            >
              <div className="lcard-banner">
                {l.photos.length > 0
                  ? <img className="lcard-img" src={l.photos[0]} alt={l.title} loading="lazy" />
                  : <div className="lcard-ph">🏠</div>
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
            <div>
              <div className="footer-logo">
                <div className="nav-logo-icon">
                  <Image src="/icon.png" alt="Rentura" width={24} height={24} />
                </div>
                <span className="footer-logo-name">Rentura</span>
              </div>
              <p className="footer-tagline">The smarter way to find and list rental homes in Sri Lanka.</p>
            </div>
            <div>
              <div className="footer-col-title">Explore</div>
              <a href="/seeker" className="footer-link">Browse Listings</a>
              <a href="/seeker/listings" className="footer-link">All Properties</a>
              <a href="/seeker/map" className="footer-link">Map View</a>
            </div>
            <div>
              <div className="footer-col-title">Landlords</div>
              <a href="/landlord" onClick={handleListProperty} className="footer-link">List Your Property</a>
              <a href="/landlord" className="footer-link">Landlord Dashboard</a>
              <a href="/onboarding" className="footer-link">Get Started</a>
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              <a href="/about" className="footer-link">About</a>
              <a href="/contact" className="footer-link">Contact</a>
              <a href="/privacy" className="footer-link">Privacy Policy</a>
              <a href="/terms" className="footer-link">Terms</a>
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
