'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Full Listings Page  /src/app/seeker/listings/page.tsx
// Updated: homepage navbar + footer, currency conversion, hidden scrollbar,
//          pagination (20/page), full responsiveness
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  created_at: string
}

type UserRole = 'landlord' | 'seeker' | 'agent' | null
type ViewMode = 'grid' | 'list' | 'compact'
type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'area_desc' | 'beds_desc'

// ── Currency types (from homepage) ────────────────────────────────────────────
const SUPPORTED_CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD'] as const
type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  LKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
}

const FALLBACK_RATES: Record<CurrencyCode, number> = {
  LKR: 1,
  USD: 0.0033,
  EUR: 0.0031,
  GBP: 0.0026,
  AUD: 0.0051,
}

// ── Constants ─────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

const PROPERTY_TYPES = ['House', 'Apartment', 'Studio', 'Villa', 'Room', 'Office']
const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5+']
const BATHROOM_OPTIONS = ['1', '2', '3', '4+']
const AMENITY_TAGS = [
  'Furnished', 'Semi-Furnished', 'Unfurnished',
  'Pet Friendly', 'Parking', 'Air Conditioned',
  'Pool', 'Gym', 'Security', 'Generator',
  'Solar Panel', 'Water 24/7', 'CCTV',
  'Balcony', 'Garden', 'Rooftop',
]
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'price_asc', label: 'Price: Low → High' },
  { key: 'price_desc', label: 'Price: High → Low' },
  { key: 'area_desc', label: 'Largest area' },
  { key: 'beds_desc', label: 'Most bedrooms' },
]
const TYPE_ICONS: Record<string, string> = {
  House: '🏡', Apartment: '🏢', Studio: '🛋️', Villa: '🏰', Room: '🚪', Office: '🏗️',
}
const PAGE_SIZE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────
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
function isNew(s: string) {
  if (!s) return false
  return Date.now() - new Date(s).getTime() < 7 * 86400000
}
function sortListings(listings: Listing[], sort: SortKey): Listing[] {
  const arr = [...listings]
  switch (sort) {
    case 'price_asc': return arr.sort((a, b) => a.rent_amount - b.rent_amount)
    case 'price_desc': return arr.sort((a, b) => b.rent_amount - a.rent_amount)
    case 'area_desc': return arr.sort((a, b) => (b.area_sqft || 0) - (a.area_sqft || 0))
    case 'beds_desc': return arr.sort((a, b) => b.bedrooms - a.bedrooms)
    default: return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}

// ── Filter Sidebar Content ────────────────────────────────────────────────────
function FilterContent({
  search, setSearch,
  selectedTypes, toggleType,
  cities, selectedCity, setSelectedCity,
  priceMin, setPriceMin, priceMax, setPriceMax,
  bedsMin, setBedsMin,
  bathsMin, setBathsMin,
  areaMin, setAreaMin, areaMax, setAreaMax,
  availableOnly, setAvailableOnly,
  newOnly, setNewOnly,
  hasPhotos, setHasPhotos,
  selectedTags, toggleTag,
  activeFilterCount, clearAll,
  setPage,
  isMobile = false,
}: {
  search: string; setSearch: (v: string) => void;
  selectedTypes: string[]; toggleType: (t: string) => void;
  cities: string[]; selectedCity: string; setSelectedCity: (v: string) => void;
  priceMin: string; setPriceMin: (v: string) => void;
  priceMax: string; setPriceMax: (v: string) => void;
  bedsMin: string; setBedsMin: (v: string) => void;
  bathsMin: string; setBathsMin: (v: string) => void;
  areaMin: string; setAreaMin: (v: string) => void;
  areaMax: string; setAreaMax: (v: string) => void;
  availableOnly: boolean; setAvailableOnly: (v: boolean) => void;
  newOnly: boolean; setNewOnly: (v: boolean) => void;
  hasPhotos: boolean; setHasPhotos: (v: boolean) => void;
  selectedTags: string[]; toggleTag: (t: string) => void;
  activeFilterCount: number; clearAll: () => void;
  setPage: (v: number) => void;
  isMobile?: boolean;
}) {
  return (
    <div className="filter-content">
      {!isMobile && (
        <div className="sb-hd">
          <div className="sb-title">Filters</div>
          {activeFilterCount > 0 && (
            <button className="sb-clear-all" onClick={clearAll}>Clear all ({activeFilterCount})</button>
          )}
        </div>
      )}

      <div className="sb-section">
        <div className="sb-sec-label">Keyword</div>
        <div className="sb-search-wrap">
          <span className="sb-s-ico">🔍</span>
          <input
            className="sb-s-input"
            placeholder="Title, city, keyword…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          {search && <button className="sb-s-clear" onClick={() => { setSearch(''); setPage(1) }}>✕</button>}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Property type</div>
        <div className="sb-type-grid">
          {PROPERTY_TYPES.map(type => (
            <button
              key={type}
              className={`sb-type-btn${selectedTypes.includes(type) ? ' active' : ''}`}
              onClick={() => toggleType(type)}
            >
              <span>{TYPE_ICONS[type]}</span>
              <span>{type}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">City</div>
        <select className="sb-select" value={selectedCity} onChange={e => { setSelectedCity(e.target.value); setPage(1) }}>
          <option value="">All cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Monthly rent (LKR)</div>
        <div className="sb-range-row">
          <input className="sb-input" type="number" placeholder="Min" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(1) }} />
          <span className="sb-range-sep">–</span>
          <input className="sb-input" type="number" placeholder="Max" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(1) }} />
        </div>
        <div className="sb-quick-prices">
          {[['Under 50k', '', '50000'], ['50k–100k', '50000', '100000'], ['100k–200k', '100000', '200000'], ['200k+', '200000', '']].map(([label, min, max]) => (
            <button
              key={label}
              className={`sb-quick-price${priceMin === min && priceMax === max ? ' active' : ''}`}
              onClick={() => { setPriceMin(min); setPriceMax(max); setPage(1) }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Minimum bedrooms</div>
        <div className="sb-option-row">
          <button className={`sb-opt-btn${bedsMin === '' ? ' active' : ''}`} onClick={() => { setBedsMin(''); setPage(1) }}>Any</button>
          {BEDROOM_OPTIONS.map(b => (
            <button key={b} className={`sb-opt-btn${bedsMin === b ? ' active' : ''}`} onClick={() => { setBedsMin(b); setPage(1) }}>{b}</button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Minimum bathrooms</div>
        <div className="sb-option-row">
          <button className={`sb-opt-btn${bathsMin === '' ? ' active' : ''}`} onClick={() => { setBathsMin(''); setPage(1) }}>Any</button>
          {BATHROOM_OPTIONS.map(b => (
            <button key={b} className={`sb-opt-btn${bathsMin === b ? ' active' : ''}`} onClick={() => { setBathsMin(b); setPage(1) }}>{b}</button>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Area (sqft)</div>
        <div className="sb-range-row">
          <input className="sb-input" type="number" placeholder="Min" value={areaMin} onChange={e => { setAreaMin(e.target.value); setPage(1) }} />
          <span className="sb-range-sep">–</span>
          <input className="sb-input" type="number" placeholder="Max" value={areaMax} onChange={e => { setAreaMax(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Quick filters</div>
        <div className="sb-toggles">
          {[
            { label: '🟢 Available soon', val: availableOnly, set: (v: boolean) => { setAvailableOnly(v); setPage(1) } },
            { label: '🆕 New this week', val: newOnly, set: (v: boolean) => { setNewOnly(v); setPage(1) } },
            { label: '📷 Has photos', val: hasPhotos, set: (v: boolean) => { setHasPhotos(v); setPage(1) } },
          ].map(({ label, val, set }) => (
            <label key={label} className="sb-toggle">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
              <span className="sb-toggle-track"><span className="sb-toggle-thumb" /></span>
              <span className="sb-toggle-label">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sb-section">
        <div className="sb-sec-label">Amenities & features</div>
        <div className="sb-amenity-grid">
          {AMENITY_TAGS.map(tag => (
            <button
              key={tag}
              className={`sb-amenity${selectedTags.includes(tag) ? ' active' : ''}`}
              onClick={() => toggleTag(tag)}
            >{tag}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ListingsPage() {
  const router = useRouter()
  const { fmtMoney } = useCurrency()

  // Auth
  const [userId, setUserId] = useState<string | null>(null)
  const [userInitials, setUserInitials] = useState('')
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)

  // Data
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // UI
  const [scrolled, setScrolled] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false)

  // Auth gate
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [authGateAction, setAuthGateAction] = useState<'save' | 'contact'>('save')

  // View + sort
  const [view, setView] = useState<ViewMode>('grid')
  const [sort, setSort] = useState<SortKey>('newest')
  const [page, setPage] = useState(1)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedCity, setSelectedCity] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [bedsMin, setBedsMin] = useState('')
  const [bathsMin, setBathsMin] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableOnly, setAvailableOnly] = useState(false)
  const [newOnly, setNewOnly] = useState(false)
  const [hasPhotos, setHasPhotos] = useState(false)

  // Currency (from homepage)
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('LKR')
  const [exchangeRates, setExchangeRates] = useState<Record<CurrencyCode, number>>(FALLBACK_RATES)
  const [currencyDropOpen, setCurrencyDropOpen] = useState(false)
  const currencyRef = useRef<HTMLDivElement>(null)

  // ── Currency helpers ──────────────────────────────────────────────────────
  function convertAndFormat(amountLKR: number): string {
    const rate = exchangeRates[displayCurrency] ?? 1
    const converted = amountLKR * rate
    const sym = CURRENCY_SYMBOLS[displayCurrency]
    if (displayCurrency === 'LKR') {
      return `${sym} ${Math.round(converted).toLocaleString()}`
    }
    return `${sym}${converted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  // Fetch exchange rates
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/LKR')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) {
          setExchangeRates({
            LKR: 1,
            USD: data.rates.USD ?? FALLBACK_RATES.USD,
            EUR: data.rates.EUR ?? FALLBACK_RATES.EUR,
            GBP: data.rates.GBP ?? FALLBACK_RATES.GBP,
            AUD: data.rates.AUD ?? FALLBACK_RATES.AUD,
          })
        }
      })
      .catch(() => { /* use fallback */ })
  }, [])

  // Close currency dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setCurrencyDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Mobile menu helpers
  function openMobileMenu() {
    setMobileMenuOpen(true)
    requestAnimationFrame(() => setMobileMenuVisible(true))
  }
  function closeMobileMenu() {
    setMobileMenuVisible(false)
    setTimeout(() => setMobileMenuOpen(false), 300)
  }
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  // Auth
  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserInitials(initials(user.user_metadata?.full_name || 'U'))
          const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
          setUserRole((profile?.role as UserRole) || 'seeker')
          const { data: savedRows } = await sb.from('saved_listings').select('listing_id').eq('seeker_id', user.id)
          setSavedIds(new Set((savedRows || []).map((s: any) => s.listing_id)))
        }
      } catch { /* guest */ }
      finally { setAuthChecked(true) }
    })()
  }, [])

  // Load listings
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const sb = createClient()
        const { data: rows } = await sb
          .from('listings')
          .select('id,title,description,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,photos,tags,city,property_type,area_sqft,created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(300)

        const landlordIds = [...new Set((rows || []).map((r: any) => r.landlord_id).filter(Boolean))]
        const profileMap: Record<string, string> = {}
        if (landlordIds.length > 0) {
          const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', landlordIds)
          ;(pArr || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Landlord' })
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
            created_at: r.created_at || new Date().toISOString(),
          }
        })

        setAllListings(mapped)
        setCities([...new Set(mapped.map(l => l.city).filter(Boolean))].sort())
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [])

  // Filtered + sorted listings
  const filtered = useCallback(() => {
    let result = allListings
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.property_type.toLowerCase().includes(q)
      )
    }
    if (selectedTypes.length > 0) result = result.filter(l => selectedTypes.includes(l.property_type))
    if (selectedCity) result = result.filter(l => l.city === selectedCity)
    if (priceMin) result = result.filter(l => l.rent_amount >= parseFloat(priceMin))
    if (priceMax) result = result.filter(l => l.rent_amount <= parseFloat(priceMax))
    if (bedsMin) {
      const n = bedsMin === '5+' ? 5 : parseInt(bedsMin)
      result = result.filter(l => bedsMin === '5+' ? l.bedrooms >= 5 : l.bedrooms >= n)
    }
    if (bathsMin) {
      const n = bathsMin === '4+' ? 4 : parseInt(bathsMin)
      result = result.filter(l => bathsMin === '4+' ? l.bathrooms >= 4 : l.bathrooms >= n)
    }
    if (areaMin) result = result.filter(l => l.area_sqft !== null && l.area_sqft >= parseFloat(areaMin))
    if (areaMax) result = result.filter(l => l.area_sqft !== null && l.area_sqft <= parseFloat(areaMax))
    if (selectedTags.length > 0) result = result.filter(l => selectedTags.every(t => l.tags.includes(t)))
    if (availableOnly) result = result.filter(l => isAvailableSoon(l.available_from))
    if (newOnly) result = result.filter(l => isNew(l.created_at))
    if (hasPhotos) result = result.filter(l => l.photos.length > 0)
    return sortListings(result, sort)
  }, [allListings, search, selectedTypes, selectedCity, priceMin, priceMax, bedsMin, bathsMin, areaMin, areaMax, selectedTags, availableOnly, newOnly, hasPhotos, sort])

  const results = filtered()
  const totalPages = Math.ceil(results.length / PAGE_SIZE)
  const paginated = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const activeFilterCount = [
    selectedTypes.length > 0,
    !!selectedCity,
    !!priceMin || !!priceMax,
    !!bedsMin,
    !!bathsMin,
    !!areaMin || !!areaMax,
    selectedTags.length > 0,
    availableOnly,
    newOnly,
    hasPhotos,
  ].filter(Boolean).length

  function clearAll() {
    setSearch(''); setSelectedTypes([]); setSelectedCity(''); setPriceMin(''); setPriceMax('')
    setBedsMin(''); setBathsMin(''); setAreaMin(''); setAreaMax(''); setSelectedTags([])
    setAvailableOnly(false); setNewOnly(false); setHasPhotos(false); setPage(1)
  }

  function toggleTag(tag: string) {
    setSelectedTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag])
    setPage(1)
  }
  function toggleType(type: string) {
    setSelectedTypes(ts => ts.includes(type) ? ts.filter(t => t !== type) : [...ts, type])
    setPage(1)
  }

  // Reset to page 1 when filters/sort change
  useEffect(() => { setPage(1) }, [search, selectedTypes, selectedCity, priceMin, priceMax, bedsMin, bathsMin, areaMin, areaMax, selectedTags, availableOnly, newOnly, hasPhotos, sort])

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

  function contactLandlord(landlordId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!userId) { setAuthGateAction('contact'); setAuthGateOpen(true); return }
    router.push(`/seeker/messages?to=${landlordId}`)
  }

  function handleListProperty(e: React.MouseEvent) {
    e.preventDefault()
    if (!authChecked) return
    if (!userId) { router.push('/signup'); return }
    if (userRole === 'landlord' || userRole === 'agent') { router.push('/landlord/listings'); return }
    setListModalOpen(true)
  }

  function handleCardClick(listingId: string) {
    router.push(`/seeker/listing-details/${listingId}`)
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handlePageChange(p: number) {
    setPage(p)
    scrollToTop()
  }

  // Active chips
  type Chip = { label: string; onRemove: () => void }
  const activeChips: Chip[] = [
    ...(search ? [{ label: `"${search}"`, onRemove: () => { setSearch(''); setPage(1) } }] : []),
    ...(selectedTypes.map(t => ({ label: t, onRemove: () => { toggleType(t) } }))),
    ...(selectedCity ? [{ label: `📍 ${selectedCity}`, onRemove: () => { setSelectedCity(''); setPage(1) } }] : []),
    ...((priceMin || priceMax) ? [{ label: `LKR ${priceMin || '0'} – ${priceMax || '∞'}`, onRemove: () => { setPriceMin(''); setPriceMax(''); setPage(1) } }] : []),
    ...(bedsMin ? [{ label: `${bedsMin}+ beds`, onRemove: () => { setBedsMin(''); setPage(1) } }] : []),
    ...(bathsMin ? [{ label: `${bathsMin}+ baths`, onRemove: () => { setBathsMin(''); setPage(1) } }] : []),
    ...((areaMin || areaMax) ? [{ label: `${areaMin || '0'} – ${areaMax || '∞'} sqft`, onRemove: () => { setAreaMin(''); setAreaMax(''); setPage(1) } }] : []),
    ...(selectedTags.map(t => ({ label: t, onRemove: () => toggleTag(t) }))),
    ...(availableOnly ? [{ label: '🟢 Available soon', onRemove: () => { setAvailableOnly(false); setPage(1) } }] : []),
    ...(newOnly ? [{ label: '🆕 New listings', onRemove: () => { setNewOnly(false); setPage(1) } }] : []),
    ...(hasPhotos ? [{ label: '📷 Has photos', onRemove: () => { setHasPhotos(false); setPage(1) } }] : []),
  ]

  const filterProps = {
    search, setSearch,
    selectedTypes, toggleType,
    cities, selectedCity, setSelectedCity,
    priceMin, setPriceMin, priceMax, setPriceMax,
    bedsMin, setBedsMin, bathsMin, setBathsMin,
    areaMin, setAreaMin, areaMax, setAreaMax,
    availableOnly, setAvailableOnly,
    newOnly, setNewOnly,
    hasPhotos, setHasPhotos,
    selectedTags, toggleTag,
    activeFilterCount, clearAll,
    setPage,
  }

  // Pagination helper
  function renderPaginationButtons() {
    const buttons: React.ReactNode[] = []
    for (let i = 1; i <= totalPages; i++) {
      const show = i === 1 || i === totalPages || Math.abs(i - page) <= 1
      if (!show) {
        if (i === 2 || i === totalPages - 1) {
          buttons.push(<span key={`ellipsis-${i}`} className="pg-ellipsis">…</span>)
        }
        continue
      }
      buttons.push(
        <button
          key={i}
          className={`pg-btn${page === i ? ' active' : ''}`}
          onClick={() => handlePageChange(i)}
        >{i}</button>
      )
    }
    return buttons
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

        /* ═══ NAVBAR (from homepage) ══════════════════════════════════════════ */
        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav-inner{max-width:1440px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:14px}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0}
        .nav-logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:21px;font-weight:700;color:#0F172A;letter-spacing:-.3px}
        .nav-breadcrumb{display:flex;align-items:center;gap:6px;font-size:13px;color:#94A3B8;margin-left:4px}
        .nav-breadcrumb a{color:#94A3B8;text-decoration:none;transition:color .15s}
        .nav-breadcrumb a:hover{color:#0F172A}
        .nav-bc-sep{color:#CBD5E1}
        .nav-bc-current{color:#0F172A;font-weight:600}
        .nav-search-wrap{flex:1;max-width:380px;position:relative;display:flex;align-items:center}
        .nav-s-ico{position:absolute;left:12px;font-size:14px;color:#94A3B8;pointer-events:none}
        .nav-s-input{width:100%;padding:9px 12px 9px 36px;border-radius:12px;border:1.5px solid #E2E8F0;background:#F8FAFC;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:all .2s}
        .nav-s-input::placeholder{color:#94A3B8}
        .nav-s-input:focus{border-color:#3B82F6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .nav-spacer{flex:1}
        .nav-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav-link.active{color:#2563EB;background:#EFF6FF}
        .nav-list-btn{font-size:13px;font-weight:700;padding:8px 16px;border-radius:10px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;text-decoration:none;transition:all .15s;white-space:nowrap;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-list-btn:hover{background:#DBEAFE;border-color:#93C5FD}
        .nav-signin{font-size:13px;font-weight:700;color:#fff;padding:8px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:all .15s;white-space:nowrap}
        .nav-signin:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,.4)}
        .nav-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0;border:2px solid rgba(255,255,255,.4)}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569;flex-shrink:0}

        /* Currency dropdown (from homepage) */
        .nav-currency{position:relative;flex-shrink:0}
        .nav-currency-btn{display:flex;align-items:center;gap:5px;padding:7px 11px;border-radius:10px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#374151;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .nav-currency-btn:hover{border-color:#CBD5E1;background:#F1F5F9}
        .nav-currency-drop{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1.5px solid #E2E8F0;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.12);overflow:hidden;min-width:120px;z-index:600}
        .nav-currency-item{display:block;width:100%;padding:9px 16px;font-size:13px;font-weight:600;color:#374151;background:none;border:none;text-align:left;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .12s}
        .nav-currency-item:hover{background:#F1F5F9}
        .nav-currency-item.active{color:#2563EB;background:#EFF6FF}

        /* ═══ PAGE LAYOUT ═════════════════════════════════════════════════════ */
        .page-layout{display:flex;max-width:1440px;margin:0 auto;padding:88px 24px 48px;gap:0;min-height:100vh;align-items:flex-start}

        /* ═══ DESKTOP SIDEBAR ══════════════════════════════════════════════════
             scrollbar hidden but still scrollable                              */
        .desktop-sidebar{
          width:292px;
          flex-shrink:0;
          background:#fff;
          border:1px solid #E2E8F0;
          border-radius:20px;
          overflow:hidden;
          position:sticky;
          top:84px;
          max-height:calc(100vh - 104px);
          overflow-y:auto;
          margin-right:24px;
          box-shadow:0 2px 12px rgba(15,23,42,.05);
          /* Hide scrollbar cross-browser */
          scrollbar-width:none;
          -ms-overflow-style:none;
        }
        .desktop-sidebar::-webkit-scrollbar{display:none}

        /* ═══ FILTER CONTENT (shared) ═════════════════════════════════════════ */
        .filter-content{}
        .sb-hd{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 0;margin-bottom:4px}
        .sb-title{font-family:'Fraunces',serif;font-size:18px;font-weight:600;color:#0F172A}
        .sb-clear-all{font-size:12px;font-weight:700;color:#EF4444;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;padding:4px 0}
        .sb-clear-all:hover{text-decoration:underline}
        .sb-section{padding:14px 18px;border-bottom:1px solid #F1F5F9}
        .sb-section:last-child{border-bottom:none}
        .sb-sec-label{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:10px}
        .sb-search-wrap{position:relative;display:flex;align-items:center}
        .sb-s-ico{position:absolute;left:10px;font-size:13px;color:#94A3B8;pointer-events:none}
        .sb-s-input{width:100%;padding:9px 32px 9px 32px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:all .2s;background:#F8FAFC}
        .sb-s-input::placeholder{color:#94A3B8}
        .sb-s-input:focus{border-color:#3B82F6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .sb-s-clear{position:absolute;right:10px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:12px;padding:2px}
        .sb-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .sb-type-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border:1.5px solid #E2E8F0;border-radius:10px;background:#fff;cursor:pointer;font-size:11.5px;font-weight:600;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;line-height:1}
        .sb-type-btn span:first-child{font-size:18px}
        .sb-type-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .sb-type-btn.active{border-color:#2563EB;background:#EFF6FF;color:#2563EB}
        .sb-select{width:100%;padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff;cursor:pointer}
        .sb-select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .sb-range-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .sb-range-sep{color:#CBD5E1;font-weight:600;flex-shrink:0}
        .sb-input{flex:1;padding:9px 10px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff;min-width:0}
        .sb-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .sb-quick-prices{display:flex;gap:5px;flex-wrap:wrap}
        .sb-quick-price{font-size:11px;font-weight:600;padding:4px 10px;border:1.5px solid #E2E8F0;border-radius:99px;background:#fff;color:#475569;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .sb-quick-price:hover{border-color:#CBD5E1;background:#F8FAFC}
        .sb-quick-price.active{border-color:#2563EB;background:#EFF6FF;color:#2563EB}
        .sb-option-row{display:flex;gap:5px;flex-wrap:wrap}
        .sb-opt-btn{font-size:12px;font-weight:700;padding:6px 12px;border:1.5px solid #E2E8F0;border-radius:9px;background:#fff;color:#475569;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;flex-shrink:0}
        .sb-opt-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .sb-opt-btn.active{border-color:#0F172A;background:#0F172A;color:#fff}
        .sb-toggles{display:flex;flex-direction:column;gap:10px}
        .sb-toggle{display:flex;align-items:center;gap:10px;cursor:pointer}
        .sb-toggle input{display:none}
        .sb-toggle-track{width:36px;height:20px;border-radius:99px;background:#E2E8F0;position:relative;transition:background .2s;flex-shrink:0}
        .sb-toggle input:checked + .sb-toggle-track{background:#2563EB}
        .sb-toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.18)}
        .sb-toggle input:checked + .sb-toggle-track .sb-toggle-thumb{transform:translateX(16px)}
        .sb-toggle-label{font-size:13px;color:#374151;font-weight:500;user-select:none}
        .sb-amenity-grid{display:flex;flex-wrap:wrap;gap:6px}
        .sb-amenity{font-size:11.5px;font-weight:600;padding:5px 11px;border:1.5px solid #E2E8F0;border-radius:99px;background:#fff;color:#475569;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .sb-amenity:hover{border-color:#CBD5E1;background:#F8FAFC}
        .sb-amenity.active{border-color:#7C3AED;background:rgba(124,58,237,.07);color:#7C3AED}

        /* ═══ MAIN CONTENT ════════════════════════════════════════════════════ */
        .main{flex:1;min-width:0}

        /* Page header */
        .listings-header{margin-bottom:16px}
        .lh-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
        .lh-title{font-family:'Fraunces',serif;font-size:clamp(22px,3vw,30px);font-weight:400;color:#0F172A;letter-spacing:-.4px}
        .lh-title em{font-style:italic;color:#2563EB}
        .lh-sub{font-size:13px;color:#94A3B8;margin-top:3px}

        /* Active chips */
        .chips-bar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px;min-height:0}
        .chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#374151;background:#fff;border:1.5px solid #E2E8F0;border-radius:99px;padding:4px 10px 4px 13px;transition:all .15s}
        .chip-x{font-size:13px;color:#94A3B8;cursor:pointer;line-height:1;padding:1px;border-radius:50%;background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;transition:color .15s}
        .chip-x:hover{color:#EF4444}
        .chip-clear-all{font-size:12px;font-weight:700;color:#EF4444;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;padding:4px 8px;border-radius:99px;transition:background .15s}
        .chip-clear-all:hover{background:#FEF2F2}

        /* Toolbar */
        .toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:16px;flex-wrap:wrap}
        .tb-left{display:flex;align-items:center;gap:10px}
        .tb-count{font-size:13.5px;font-weight:700;color:#0F172A}
        .tb-count span{color:#94A3B8;font-weight:400}
        .tb-filter-btn{display:none;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .tb-filter-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .tb-filter-btn.has-filters{border-color:#0F172A;background:#0F172A;color:#fff}
        .filter-badge{background:#EF4444;color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}
        .tb-right{display:flex;align-items:center;gap:8px}
        .tb-sort-wrap{display:flex;align-items:center;gap:6px}
        .tb-sort-lbl{font-size:12px;color:#94A3B8;white-space:nowrap}
        .tb-sort{padding:7px 10px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;background:#fff;cursor:pointer;transition:border .15s}
        .tb-sort:focus{border-color:#3B82F6}
        .view-btns{display:flex;gap:2px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:3px}
        .vbtn{width:30px;height:30px;border:none;background:none;border-radius:8px;cursor:pointer;color:#94A3B8;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:15px}
        .vbtn.active{background:#fff;color:#0F172A;box-shadow:0 1px 4px rgba(15,23,42,.08)}

        /* ═══ LISTING CARDS — GRID ════════════════════════════════════════════ */
        .listing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .listing-grid.view-list{grid-template-columns:1fr}
        .listing-grid.view-compact{grid-template-columns:repeat(4,1fr);gap:12px}

        /* Grid card */
        .lcard{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;flex-direction:column}
        .lcard:hover{box-shadow:0 10px 32px rgba(15,23,42,.12);transform:translateY(-3px)}
        .lcard-banner{position:relative;overflow:hidden;background:#F1F5F9;flex-shrink:0}
        .lcard-banner.h-normal{height:195px}
        .lcard-banner.h-compact{height:150px}
        .lcard-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s}
        .lcard:hover .lcard-img{transform:scale(1.05)}
        .lcard-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lcard-save{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .15s;z-index:2}
        .lcard-save:hover{transform:scale(1.12)}
        .lcard-badges{position:absolute;top:10px;left:10px;display:flex;flex-direction:column;gap:4px;z-index:2}
        .badge{font-size:10px;font-weight:700;border-radius:99px;padding:3px 9px;display:inline-block;line-height:1.4}
        .badge-green{background:rgba(16,185,129,.9);color:#fff}
        .badge-blue{background:rgba(37,99,235,.9);color:#fff}
        .badge-amber{background:rgba(245,158,11,.9);color:#fff}
        .badge-dark{background:rgba(15,23,42,.75);color:#fff}
        .lcard-photo-ct{position:absolute;bottom:10px;right:10px;background:rgba(15,23,42,.6);color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:3px 8px;backdrop-filter:blur(4px)}
        .lcard-body{padding:14px 15px;flex:1;display:flex;flex-direction:column}
        .lcard-type-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .lcard-type{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8}
        .lcard-city-pill{font-size:10px;font-weight:600;color:#2563EB;background:#EFF6FF;border-radius:99px;padding:2px 8px}
        .lcard-title{font-size:14.5px;font-weight:700;color:#0F172A;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
        .lcard-price-row{display:flex;align-items:baseline;gap:5px;margin-bottom:9px}
        .lcard-price{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1}
        .lcard-price-unit{font-size:11.5px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .lcard-facts{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
        .lcard-fact{font-size:11.5px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:3px 8px;display:flex;align-items:center;gap:3px}
        .lcard-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:0;flex:1;align-content:flex-start}
        .lcard-tag{font-size:10.5px;color:#7C3AED;background:rgba(124,58,237,.07);border:1.5px solid rgba(124,58,237,.14);border-radius:99px;padding:2px 8px;font-weight:600}
        .lcard-avail{font-size:11px;color:#16A34A;font-weight:600;margin-top:auto;padding-top:6px}
        .lcard-footer{padding:10px 15px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-shrink:0}
        .lcard-ll{display:flex;align-items:center;gap:7px;min-width:0;flex:1}
        .lcard-ll-av{width:27px;height:27px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9.5px;font-weight:700;flex-shrink:0}
        .lcard-ll-name{font-size:11.5px;color:#475569;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard-contact{padding:6px 13px;border-radius:9px;border:none;background:#0F172A;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s;white-space:nowrap;flex-shrink:0}
        .lcard-contact:hover{background:#1E293B}

        /* ═══ LIST VIEW CARD ══════════════════════════════════════════════════ */
        .lcard.view-list{flex-direction:row;border-radius:16px;max-height:none}
        .lcard.view-list .lcard-banner{width:260px;min-height:0;height:auto}
        .lcard.view-list .lcard-banner.h-normal{height:auto;min-height:170px}
        .lcard.view-list .lcard-body{padding:18px 20px}
        .lcard.view-list .lcard-title{white-space:normal;font-size:16px}
        .lcard.view-list .lcard-price{font-size:24px}
        .lcard-desc{font-size:12.5px;color:#64748B;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px}
        .lcard.view-list .lcard-footer{border-top:none;padding:0 20px 16px;margin-top:auto}

        /* ═══ COMPACT VIEW CARD ═══════════════════════════════════════════════ */
        .lcard.view-compact .lcard-body{padding:11px 12px}
        .lcard.view-compact .lcard-title{font-size:13px}
        .lcard.view-compact .lcard-price{font-size:17px}
        .lcard.view-compact .lcard-footer{padding:8px 12px}

        /* ═══ SKELETON ════════════════════════════════════════════════════════ */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skel{background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}

        /* ═══ EMPTY STATE ═════════════════════════════════════════════════════ */
        .empty-state{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;grid-column:1/-1}
        .es-ico{font-size:60px;margin-bottom:16px}
        .es-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#475569;margin-bottom:8px}
        .es-sub{font-size:14px;color:#94A3B8;margin-bottom:24px;line-height:1.65;max-width:340px;margin-left:auto;margin-right:auto}
        .es-btn{padding:11px 26px;border-radius:12px;border:none;background:#0F172A;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ═══ PAGINATION ══════════════════════════════════════════════════════ */
        .pagination{display:flex;align-items:center;justify-content:center;gap:6px;padding:28px 0 12px;flex-wrap:wrap}
        .pg-btn{min-width:36px;height:36px;padding:0 10px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center}
        .pg-btn:hover:not([disabled]){border-color:#CBD5E1;background:#F8FAFC}
        .pg-btn.active{background:#0F172A;border-color:#0F172A;color:#fff}
        .pg-btn:disabled{opacity:.4;cursor:not-allowed}
        .pg-ellipsis{padding:0 6px;color:#94A3B8;font-size:13px;font-weight:600}
        .pg-info{text-align:center;font-size:12px;color:#94A3B8;margin-top:8px;font-weight:500}

        /* ═══ AUTH GATE ════════════════════════════════════════════════════════ */
        .ag-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        .ag-bg.open{display:flex}
        .ag-box{background:#fff;border-radius:24px;width:100%;max-width:380px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.2)}
        .ag-hd{background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:32px 28px 24px;text-align:center;position:relative}
        .ag-ico{font-size:40px;margin-bottom:12px}
        .ag-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#F8FAFC;margin-bottom:6px}
        .ag-sub{font-size:13px;color:rgba(255,255,255,.48);line-height:1.6}
        .ag-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:99px;background:rgba(255,255,255,.1);border:none;color:rgba(255,255,255,.6);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .ag-body{padding:24px 26px}
        .ag-btn{width:100%;padding:13px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
        .ag-btn-p{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;box-shadow:0 2px 14px rgba(37,99,235,.35)}
        .ag-btn-o{background:#fff;color:#374151;border:1.5px solid #E2E8F0}
        .ag-or{text-align:center;font-size:12px;color:#94A3B8;margin:4px 0 12px}

        /* ═══ LIST PROPERTY MODAL ═════════════════════════════════════════════ */
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

        /* ═══ MOBILE FILTER DRAWER ════════════════════════════════════════════ */
        .mf-overlay{
          visibility:hidden;
          opacity:0;
          position:fixed;
          inset:0;
          z-index:800;
          display:flex;
          flex-direction:column;
          justify-content:flex-end;
          transition:opacity .25s ease, visibility .25s ease;
        }
        .mf-overlay.open{
          visibility:visible;
          opacity:1;
        }
        .mf-bg{position:absolute;inset:0;background:rgba(0,0,0,.52);backdrop-filter:blur(4px)}
        .mf-panel{
          position:relative;
          background:#fff;
          border-radius:24px 24px 0 0;
          max-height:88vh;
          overflow-y:auto;
          z-index:1;
          transform:translateY(100%);
          transition:transform .3s cubic-bezier(.32,.72,0,1);
          /* Hide scrollbar in drawer too */
          scrollbar-width:none;
          -ms-overflow-style:none;
        }
        .mf-panel::-webkit-scrollbar{display:none}
        .mf-overlay.open .mf-panel{
          transform:translateY(0);
        }
        .mf-hd{
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:20px 20px 14px;
          position:sticky;
          top:0;
          background:#fff;
          z-index:2;
          border-bottom:1px solid #F1F5F9;
        }
        .mf-title{font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:#0F172A}
        .mf-close{background:none;border:none;font-size:20px;cursor:pointer;color:#64748B;padding:4px;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center}
        .mf-close:hover{background:#F1F5F9}
        .mf-footer{
          position:sticky;
          bottom:0;
          background:#fff;
          padding:14px 20px 28px;
          border-top:1px solid #F1F5F9;
          display:flex;
          gap:10px;
        }
        .mf-apply{flex:1;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3)}
        .mf-clear{padding:13px 20px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#EF4444;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ═══ MOBILE MENU ═════════════════════════════════════════════════════ */
        .mm-overlay{display:none;position:fixed;inset:0;z-index:1000}
        .mm-overlay.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease}
        .mm-overlay.visible .mm-bg{opacity:1}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;padding:24px 20px;display:flex;flex-direction:column;gap:4px;box-shadow:-8px 0 40px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .32s cubic-bezier(.32,.72,0,1)}
        .mm-overlay.visible .mm-panel{transform:translateX(0)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;margin-bottom:8px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:11px 14px;border-radius:10px;text-decoration:none;display:block;transition:background .15s}
        .mm-link:hover{background:#F1F5F9}
        .mm-link.active{background:#EFF6FF;color:#2563EB}
        .mm-div{height:1px;background:#F1F5F9;margin:8px 0}
        .mm-cta{font-size:14px;font-weight:700;color:#fff;padding:13px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);text-align:center;text-decoration:none;display:block;margin-top:8px}
        .mm-currency-row{display:flex;align-items:center;gap:8px;padding:10px 14px;flex-wrap:wrap}
        .mm-currency-lbl{font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px}
        .mm-currency-pill{padding:5px 12px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
        .mm-currency-pill.active{background:#EFF6FF;border-color:#93C5FD;color:#2563EB}

        /* ═══ FOOTER (from homepage) ══════════════════════════════════════════ */
        .footer{background:#0F172A;border-top:1px solid #E2E8F0;padding:48px 0 24px;margin-top:48px}
        .footer-inner{max-width:1440px;margin:0 auto;padding:0 24px}
        .footer-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:36px;margin-bottom:36px}
        .footer-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px}
        .footer-logo-icon{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .footer-logo-name{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#fff}
        .footer-tagline{font-size:13px;color:#94A3B8;line-height:1.65;max-width:210px}
        .footer-col-title{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#F8FAFC;margin-bottom:14px}
        .footer-link{display:block;font-size:13.5px;color:#94A3B8;text-decoration:none;margin-bottom:9px;transition:color .15s}
        .footer-link:hover{color:#F8FAFC}
        .footer-bottom{border-top:1px solid rgba(255,255,255,.1);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .footer-copy{font-size:13px;color:#94A3B8}
        .footer-legal{display:flex;gap:16px}
        .footer-legal a{font-size:13px;color:#94A3B8;text-decoration:none}
        .footer-legal a:hover{color:#F8FAFC}

        /* ═══ RESPONSIVE ══════════════════════════════════════════════════════ */
        @media(max-width:1200px){
          .listing-grid{grid-template-columns:repeat(2,1fr)}
          .listing-grid.view-compact{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:960px){
          .desktop-sidebar{display:none}
          .tb-filter-btn{display:flex}
          .listing-grid{grid-template-columns:repeat(2,1fr)}
          .listing-grid.view-compact{grid-template-columns:repeat(2,1fr)}
          .nav-breadcrumb{display:none}
          .page-layout{padding:80px 16px 48px}
          .footer-top{grid-template-columns:1fr 1fr;gap:24px}
        }
        @media(max-width:768px){
          .hamburger{display:block}
          .nav-link,.nav-list-btn,.nav-currency{display:none}
          .nav-search-wrap{flex:1}
          .page-layout{padding:76px 12px 48px}
          .listing-grid.view-list .lcard{flex-direction:column}
          .listing-grid.view-list .lcard .lcard-banner{width:100%;min-height:180px}
          .toolbar{gap:8px}
          .tb-sort-lbl{display:none}
          .lm-options{grid-template-columns:1fr}
          .footer-top{grid-template-columns:1fr 1fr;gap:20px}
        }
        @media(max-width:520px){
          .listing-grid,.listing-grid.view-compact{grid-template-columns:1fr}
          .listing-grid.view-list .lcard{flex-direction:column}
          .listing-grid.view-list .lcard .lcard-banner{width:100%;min-height:170px}
          .nav-search-wrap{display:none}
          .toolbar{flex-direction:column;align-items:flex-start;gap:10px}
          .tb-right{width:100%;justify-content:space-between}
          .footer-top{grid-template-columns:1fr}
          .footer-bottom{justify-content:center}
          .pagination{gap:4px}
          .pg-btn{min-width:32px;height:32px;font-size:12px}
        }
      `}</style>

      {/* ═══ AUTH GATE ═════════════════════════════════════════════════════════ */}
      <div className={`ag-bg${authGateOpen ? ' open' : ''}`} onClick={() => setAuthGateOpen(false)}>
        <div className="ag-box" onClick={e => e.stopPropagation()}>
          <div className="ag-hd">
            <button className="ag-close" onClick={() => setAuthGateOpen(false)}>✕</button>
            <div className="ag-ico">{authGateAction === 'save' ? '❤️' : '💬'}</div>
            <div className="ag-title">{authGateAction === 'save' ? 'Save this listing' : 'Contact landlord'}</div>
            <div className="ag-sub">
              {authGateAction === 'save'
                ? 'Create a free account to save and compare listings.'
                : 'Sign up to message landlords and arrange viewings.'}
            </div>
          </div>
          <div className="ag-body">
            <a href="/signup" className="ag-btn ag-btn-p">✨ Create free account</a>
            <div className="ag-or">or</div>
            <a href="/login" className="ag-btn ag-btn-o">Sign in to existing account</a>
          </div>
        </div>
      </div>

      {/* ═══ LIST PROPERTY MODAL ═══════════════════════════════════════════════ */}
      <div className={`list-modal-bg${listModalOpen ? ' open' : ''}`} onClick={() => setListModalOpen(false)}>
        <div className="list-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-drag" />
          <div className="lm-title">How would you like to list?</div>
          <div className="lm-sub">Your account is set up as a seeker. Choose how you'd like to get started.</div>
          <div className="lm-options">
            <a href="/onboarding?role=landlord" className="lm-option">
              <div className="lm-opt-ico">🏠</div>
              <div className="lm-opt-title">List as Landlord</div>
              <div className="lm-opt-desc">You own the property and rent it directly to tenants.</div>
            </a>
            <a href="/onboarding?role=agent" className="lm-option">
              <div className="lm-opt-ico">🤝</div>
              <div className="lm-opt-title">List as Agent</div>
              <div className="lm-opt-desc">You represent a landlord or manage multiple properties.</div>
            </a>
          </div>
          <button className="lm-cancel" onClick={() => setListModalOpen(false)}>Cancel</button>
        </div>
      </div>

      {/* ═══ MOBILE FILTER DRAWER ══════════════════════════════════════════════ */}
      <div className={`mf-overlay${mobileFilterOpen ? ' open' : ''}`}>
        <div className="mf-bg" onClick={() => setMobileFilterOpen(false)} />
        <div className="mf-panel">
          <div className="mf-hd">
            <div className="mf-title">
              Filters{activeFilterCount > 0 && (
                <span style={{ fontSize: 13, color: '#94A3B8', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 400, marginLeft: 6 }}>
                  ({activeFilterCount} active)
                </span>
              )}
            </div>
            <button className="mf-close" onClick={() => setMobileFilterOpen(false)}>✕</button>
          </div>
          <FilterContent {...filterProps} isMobile />
          <div className="mf-footer">
            <button className="mf-clear" onClick={() => { clearAll() }}>Clear all</button>
            <button className="mf-apply" onClick={() => setMobileFilterOpen(false)}>
              Show {results.length} result{results.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MOBILE MENU ════════════════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className={`mm-overlay open${mobileMenuVisible ? ' visible' : ''}`}>
          <div className="mm-bg" onClick={closeMobileMenu} />
          <div className="mm-panel">
            <button className="mm-close" onClick={closeMobileMenu}>✕</button>
            <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
            <a href="/seeker/listings" className="mm-link active">📋 All Listings</a>
            <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
            <div className="mm-div" />
            <button
              className="mm-link"
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'inherit', fontWeight: 600, color: '#374151', padding: '11px 14px', borderRadius: 10, fontSize: 15 }}
              onClick={(e) => { closeMobileMenu(); handleListProperty(e as any) }}
            >🏡 List Your Property</button>
            <div className="mm-div" />
            <div className="mm-currency-row">
              <span className="mm-currency-lbl">Currency:</span>
              {SUPPORTED_CURRENCIES.map(c => (
                <button
                  key={c}
                  className={`mm-currency-pill${displayCurrency === c ? ' active' : ''}`}
                  onClick={() => setDisplayCurrency(c)}
                >{c}</button>
              ))}
            </div>
            <div className="mm-div" />
            {userId
              ? <a href="/seeker/messages" className="mm-link">💬 Messages</a>
              : <a href="/login" className="mm-link">Sign In</a>
            }
            {!userId && <a href="/signup" className="mm-cta">Get Started Free →</a>}
          </div>
        </div>
      )}

      {/* ═══ NAVBAR (matches homepage) ═════════════════════════════════════════ */}
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">
              <Image src="/icon.png" alt="Rentura" width={22} height={22} />
            </div>
            <span className="nav-logo-name">Rentura</span>
          </a>

          <div className="nav-breadcrumb">
            <span className="nav-bc-sep">/</span>
            <a href="/seeker">Browse</a>
            <span className="nav-bc-sep">/</span>
            <span className="nav-bc-current">All Listings</span>
          </div>

          <div className="nav-search-wrap">
            <span className="nav-s-ico">🔍</span>
            <input
              className="nav-s-input"
              placeholder="Search listings…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          <div className="nav-spacer" />

          <div className="nav-actions">
            <a href="/seeker" className="nav-link">Home</a>
            <a href="/seeker/listings" className="nav-link active">Listings</a>
            <a href="/seeker/map" className="nav-link">Map</a>
            <button className="nav-list-btn" onClick={handleListProperty}>List Property</button>

            {/* Currency dropdown — same as homepage */}
            <div className="nav-currency" ref={currencyRef}>
              <button
                className="nav-currency-btn"
                onClick={() => setCurrencyDropOpen(v => !v)}
              >
                {CURRENCY_SYMBOLS[displayCurrency]} {displayCurrency} ▾
              </button>
              {currencyDropOpen && (
                <div className="nav-currency-drop">
                  {SUPPORTED_CURRENCIES.map(c => (
                    <button
                      key={c}
                      className={`nav-currency-item${displayCurrency === c ? ' active' : ''}`}
                      onClick={() => { setDisplayCurrency(c); setCurrencyDropOpen(false) }}
                    >
                      {CURRENCY_SYMBOLS[c]} {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {userId
              ? <a href="/seeker" className="nav-avatar">{userInitials}</a>
              : <a href="/login" className="nav-signin">Sign In</a>
            }
            <button className="hamburger" onClick={openMobileMenu}>☰</button>
          </div>
        </div>
      </nav>

      {/* ═══ PAGE LAYOUT ═══════════════════════════════════════════════════════ */}
      <div className="page-layout">

        {/* Desktop Sidebar */}
        <aside className="desktop-sidebar">
          <FilterContent {...filterProps} />
        </aside>

        {/* Main content */}
        <main className="main">
          {/* Page header */}
          <div className="listings-header">
            <div className="lh-top">
              <div>
                <div className="lh-title">All <em>Listings</em></div>
                <div className="lh-sub">
                  {loading ? 'Loading properties…' : `${allListings.length.toLocaleString()} properties across ${cities.length} cities`}
                </div>
              </div>
            </div>

            {/* Active filter chips */}
            {activeChips.length > 0 && (
              <div className="chips-bar">
                {activeChips.map((chip, i) => (
                  <div key={i} className="chip">
                    {chip.label}
                    <button className="chip-x" onClick={chip.onRemove}>✕</button>
                  </div>
                ))}
                <button className="chip-clear-all" onClick={clearAll}>Clear all</button>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <div className="tb-left">
              <button
                className={`tb-filter-btn${activeFilterCount > 0 ? ' has-filters' : ''}`}
                onClick={() => setMobileFilterOpen(true)}
              >
                ⚡ Filters
                {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
              </button>
              <div className="tb-count">
                {loading ? 'Loading…' : <>{results.length.toLocaleString()} <span>propert{results.length !== 1 ? 'ies' : 'y'}</span></>}
              </div>
            </div>

            <div className="tb-right">
              <div className="tb-sort-wrap">
                <span className="tb-sort-lbl">Sort by</span>
                <select className="tb-sort" value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}>
                  {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
              <div className="view-btns">
                <button className={`vbtn${view === 'grid' ? ' active' : ''}`} title="Grid" onClick={() => setView('grid')}>⊞</button>
                <button className={`vbtn${view === 'list' ? ' active' : ''}`} title="List" onClick={() => setView('list')}>☰</button>
                <button className={`vbtn${view === 'compact' ? ' active' : ''}`} title="Compact" onClick={() => setView('compact')}>⊟</button>
              </div>
            </div>
          </div>

          {/* Listings */}
          <div className={`listing-grid view-${view}`}>
            {loading
              ? Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`lcard${view === 'list' ? ' view-list' : view === 'compact' ? ' view-compact' : ''}`} style={{ cursor: 'default', pointerEvents: 'none' }}>
                  <div className={`lcard-banner h-${view === 'compact' ? 'compact' : 'normal'}`}>
                    <div className="skel" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
                  </div>
                  <div className="lcard-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div className="skel" style={{ height: 9, width: '30%' }} />
                      <div className="skel" style={{ height: 9, width: '20%', borderRadius: 99 }} />
                    </div>
                    <div className="skel" style={{ height: 15, width: '85%', marginBottom: 8 }} />
                    <div className="skel" style={{ height: 22, width: '50%', marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div className="skel" style={{ height: 24, width: 70, borderRadius: 7 }} />
                      <div className="skel" style={{ height: 24, width: 70, borderRadius: 7 }} />
                      <div className="skel" style={{ height: 24, width: 70, borderRadius: 7 }} />
                    </div>
                  </div>
                  <div className="lcard-footer">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div className="skel" style={{ width: 27, height: 27, borderRadius: 8 }} />
                      <div className="skel" style={{ height: 11, width: 80 }} />
                    </div>
                    <div className="skel" style={{ height: 30, width: 80, borderRadius: 9 }} />
                  </div>
                </div>
              ))
              : paginated.length === 0
                ? (
                  <div className="empty-state">
                    <div className="es-ico">🏘️</div>
                    <div className="es-title">No properties found</div>
                    <div className="es-sub">Try adjusting or clearing some of your filters to discover more listings.</div>
                    <button className="es-btn" onClick={clearAll}>Clear all filters</button>
                  </div>
                )
                : paginated.map(l => {
                  const gradIdx = l.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length
                  const isListView = view === 'list'
                  const isCompact = view === 'compact'
                  return (
                    <div
                      key={l.id}
                      className={`lcard${isListView ? ' view-list' : isCompact ? ' view-compact' : ''}`}
                      onClick={() => handleCardClick(l.id)}
                    >
                      <div className={`lcard-banner ${isCompact ? 'h-compact' : 'h-normal'}`}>
                        {l.photos.length > 0
                          ? <img className="lcard-img" src={l.photos[0]} alt={l.title} loading="lazy" />
                          : <div className="lcard-ph">{TYPE_ICONS[l.property_type] || '🏠'}</div>
                        }
                        <div className="lcard-badges">
                          {isNew(l.created_at) && <span className="badge badge-blue">New</span>}
                          {isAvailableSoon(l.available_from) && <span className="badge badge-green">Soon</span>}
                          {savedIds.has(l.id) && <span className="badge badge-amber">Saved</span>}
                        </div>
                        <button className="lcard-save" onClick={e => toggleSave(l.id, e)}>
                          {savedIds.has(l.id) ? '❤️' : '🤍'}
                        </button>
                        {l.photos.length > 1 && (
                          <div className="lcard-photo-ct">📷 {l.photos.length}</div>
                        )}
                      </div>

                      <div className="lcard-body">
                        <div className="lcard-type-row">
                          <span className="lcard-type">{l.property_type}</span>
                          {l.city && <span className="lcard-city-pill">{l.city}</span>}
                        </div>
                        <div className="lcard-title">{l.title}</div>
                        <div className="lcard-price-row">
                          <span className="lcard-price">{convertAndFormat(l.rent_amount)}</span>
                          <span className="lcard-price-unit">/mo</span>
                        </div>
                        <div className="lcard-facts">
                          {l.bedrooms > 0 && <span className="lcard-fact">🛏 {l.bedrooms} bed</span>}
                          <span className="lcard-fact">🚿 {l.bathrooms} bath</span>
                          {l.area_sqft && <span className="lcard-fact">📐 {l.area_sqft.toLocaleString()} sqft</span>}
                          {!isCompact && l.available_from && <span className="lcard-fact">📅 {fmtDate(l.available_from)}</span>}
                        </div>
                        {!isCompact && l.tags.length > 0 && (
                          <div className="lcard-tags">
                            {l.tags.slice(0, isListView ? 5 : 3).map(t => <span key={t} className="lcard-tag">{t}</span>)}
                            {l.tags.length > (isListView ? 5 : 3) && <span className="lcard-tag">+{l.tags.length - (isListView ? 5 : 3)}</span>}
                          </div>
                        )}
                        {isListView && l.description && (
                          <div className="lcard-desc">{l.description}</div>
                        )}
                        {isAvailableSoon(l.available_from) && !isCompact && (
                          <div className="lcard-avail">🟢 Available soon</div>
                        )}
                      </div>

                      <div className="lcard-footer">
                        <div className="lcard-ll">
                          <div className="lcard-ll-av" style={{ background: AVATAR_GRADIENTS[gradIdx] }}>
                            {l.landlord_initials}
                          </div>
                          <span className="lcard-ll-name">{l.landlord_name}</span>
                        </div>
                        <button className="lcard-contact" onClick={e => contactLandlord(l.landlord_id, e)}>
                          💬 Contact
                        </button>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <>
              <div className="pagination">
                <button
                  className="pg-btn"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                >← Prev</button>

                {renderPaginationButtons()}

                <button
                  className="pg-btn"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >Next →</button>
              </div>
              <div className="pg-info">
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, results.length)} of {results.length} properties
              </div>
            </>
          )}

          {!loading && totalPages <= 1 && results.length > 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0 12px', fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>
              ✓ Showing all {results.length} propert{results.length !== 1 ? 'ies' : 'y'}
            </div>
          )}
        </main>
      </div>

      {/* ═══ FOOTER (matches homepage) ═════════════════════════════════════════ */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-logo">
                <div className="footer-logo-icon">
                  <Image src="/icon.png" alt="Rentura" width={20} height={20} />
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
