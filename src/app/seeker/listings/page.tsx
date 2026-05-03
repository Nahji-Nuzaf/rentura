'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Seeker Listings Page  (/app/seeker/listings/page.tsx)
//
// A full listings browse page with advanced filters, map-split view toggle,
// infinite scroll pagination, and a rich filter sidebar.
// Shares the same design system as seeker/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

// ── Types ─────────────────────────────────────────────────────────────────────
type Listing = {
  id: string
  title: string
  description: string
  property_id: string
  landlord_id: string
  landlord_name: string
  landlord_initials: string
  bedrooms: number
  bathrooms: number
  rent_amount: number
  currency: string
  available_from: string
  status: string
  photos: string[]
  tags: string[]
  city: string
  property_type: string
  area_sqft: number | null
  saved: boolean
}

type Filters = {
  query: string
  city: string
  min_price: string
  max_price: string
  bedrooms: string
  property_type: string
  tags: string[]
  sort: 'newest' | 'price_asc' | 'price_desc'
  available_before: string
  min_area: string
  max_area: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

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
const ALL_TAGS = ['Air Conditioned', 'Parking', 'Furnished', 'Pet Friendly', 'Pool', 'Gym', 'Solar Panel', 'Garden', 'Security', 'Internet', 'Laundry', 'Balcony']
const PAGE_SIZE = 12

// ── Component ──────────────────────────────────────────────────────────────────
export default function SeekerListings() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { fmtMoney } = useCurrency()

  // Auth
  const [userId, setUserId] = useState('')
  const [userInitials, setUserInitials] = useState('ME')
  const [fullName, setFullName] = useState('Seeker')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [cities, setCities] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)

  // Filters & view
  const [filters, setFilters] = useState<Filters>({
    query: searchParams.get('q') || '',
    city: searchParams.get('city') || '',
    min_price: '', max_price: '',
    bedrooms: 'Any', property_type: 'All',
    tags: [], sort: 'newest',
    available_before: '', min_area: '', max_area: '',
  })
  const [filterPanelOpen, setFilterPanelOpen] = useState(true)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [activeTag, setActiveTag] = useState<string>('')

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── Load Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'Seeker'
      setFullName(name); setUserInitials(initials(name)); setUserId(user.id)

      const { data: savedRows } = await sb.from('saved_listings').select('listing_id').eq('seeker_id', user.id)
      setSavedIds(new Set((savedRows || []).map((s: any) => s.listing_id)))

      const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('read', false)
      setUnreadMessages(count || 0)
    })()
  }, [router])

  // ── Build query ───────────────────────────────────────────────────────────────
  const buildQuery = useCallback((sb: any, from: number) => {
    let q = sb.from('listings')
      .select('id,title,description,property_id,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,status,photos,tags,city,property_type,area_sqft', { count: 'exact' })
      .eq('status', 'active')
      .range(from, from + PAGE_SIZE - 1)

    if (filters.city) q = q.ilike('city', `%${filters.city}%`)
    if (filters.min_price) q = q.gte('rent_amount', parseFloat(filters.min_price))
    if (filters.max_price) q = q.lte('rent_amount', parseFloat(filters.max_price))
    if (filters.bedrooms !== 'Any') {
      if (filters.bedrooms === '5+') q = q.gte('bedrooms', 5)
      else q = q.eq('bedrooms', parseInt(filters.bedrooms))
    }
    if (filters.property_type !== 'All') q = q.ilike('property_type', filters.property_type)
    if (filters.available_before) q = q.lte('available_from', filters.available_before)
    if (filters.min_area) q = q.gte('area_sqft', parseFloat(filters.min_area))
    if (filters.max_area) q = q.lte('area_sqft', parseFloat(filters.max_area))

    if (filters.sort === 'price_asc') q = q.order('rent_amount', { ascending: true })
    else if (filters.sort === 'price_desc') q = q.order('rent_amount', { ascending: false })
    else q = q.order('created_at', { ascending: false })

    return q
  }, [filters])

  // ── Load listings ─────────────────────────────────────────────────────────────
  const loadListings = useCallback(async (uid: string, reset = true) => {
    if (reset) { setLoading(true); setPage(0) }
    else setLoadingMore(true)

    const from = reset ? 0 : page * PAGE_SIZE
    try {
      const sb = createClient()
      const { data: rows, count } = await buildQuery(sb, from)

      // Landlord names
      const landlordIds = [...new Set((rows || []).map((r: any) => r.landlord_id).filter(Boolean))]
      const profileMap: Record<string, string> = {}
      if (landlordIds.length > 0) {
        const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', landlordIds)
        ;(pArr || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Landlord' })
      }

      if (reset) {
        const { data: cityRows } = await sb.from('listings').select('city').eq('status', 'active')
        setCities([...new Set((cityRows || []).map((r: any) => r.city).filter(Boolean))] as string[])
      }

      let mapped: Listing[] = (rows || []).map((r: any) => {
        const lName = profileMap[r.landlord_id] || 'Landlord'
        return {
          id: r.id, title: r.title || 'Untitled', description: r.description || '',
          property_id: r.property_id || '', landlord_id: r.landlord_id || '',
          landlord_name: lName, landlord_initials: initials(lName),
          bedrooms: r.bedrooms || 0, bathrooms: r.bathrooms || 1,
          rent_amount: r.rent_amount || 0, currency: r.currency || 'USD',
          available_from: r.available_from || '', status: r.status || 'active',
          photos: r.photos || [], tags: r.tags || [],
          city: r.city || '', property_type: r.property_type || 'House',
          area_sqft: r.area_sqft || null, saved: savedIds.has(r.id),
        }
      })

      // Client-side text + tag filter
      if (filters.query) {
        const q = filters.query.toLowerCase()
        mapped = mapped.filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.city.toLowerCase().includes(q))
      }
      if (filters.tags.length > 0) {
        mapped = mapped.filter(l => filters.tags.every(t => l.tags.includes(t)))
      }

      setTotalCount(count || 0)
      setHasMore((from + PAGE_SIZE) < (count || 0))
      if (reset) setListings(mapped)
      else setListings(prev => [...prev, ...mapped])
      if (!reset) setPage(p => p + 1)
    } catch (e) { console.error(e) }
    finally { setLoading(false); setLoadingMore(false) }
  }, [filters, buildQuery, savedIds, page])

  useEffect(() => { if (userId) loadListings(userId, true) }, [userId, filters])

  // ── Infinite scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingMore && !loading && userId) {
        loadListings(userId, false)
      }
    }, { threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, loading, userId, loadListings])

  // ── Save/Unsave ───────────────────────────────────────────────────────────────
  async function toggleSave(listingId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!userId || savingId) return
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
      setListings(prev => prev.map(l => l.id === listingId ? { ...l, saved: !already } : l))
    } catch (e) { console.error(e) }
    finally { setSavingId(null) }
  }

  const activeFiltersCount = [
    filters.city, filters.min_price, filters.max_price,
    filters.bedrooms !== 'Any' ? '1' : '',
    filters.property_type !== 'All' ? '1' : '',
    filters.available_before, filters.min_area, filters.max_area,
    ...filters.tags,
  ].filter(Boolean).length

  const clearFilters = () => setFilters({
    query: '', city: '', min_price: '', max_price: '',
    bedrooms: 'Any', property_type: 'All', tags: [],
    sort: filters.sort, available_before: '', min_area: '', max_area: '',
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,700;1,9..144,300&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;width:100%;max-width:100vw}

        /* ── SHELL ── */
        .sk-shell{display:flex;min-height:100vh;width:100%}

        /* ── SIDEBAR ── */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-user{padding:14px 18px;display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-urole{display:inline-block;font-size:10px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* ── MAIN ── */
        .sk-main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:fixed;top:0;left:260px;right:0;z-index:150;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap}.breadcrumb b{color:#0F172A;font-weight:700}
        .tb-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .tb-btn{position:relative;width:36px;height:36px;border-radius:10px;background:#F8FAFC;border:1.5px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;text-decoration:none;transition:all .15s;flex-shrink:0}
        .tb-btn:hover{background:#EFF6FF;border-color:#BFDBFE}
        .tb-dot{position:absolute;top:4px;right:4px;width:8px;height:8px;background:#EF4444;border-radius:50%;border:1.5px solid #fff}

        /* ── LAYOUT ── */
        .listings-layout{display:flex;gap:0;padding-top:58px;min-height:100vh}

        /* ── FILTER SIDEBAR ── */
        .filter-sidebar{width:280px;flex-shrink:0;background:#fff;border-right:1px solid #E2E8F0;padding:20px 18px;overflow-y:auto;height:calc(100vh - 58px);position:sticky;top:58px;transition:width .25s ease,opacity .25s ease}
        .filter-sidebar.collapsed{width:0;padding:0;overflow:hidden;opacity:0;border:none}
        .fs-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .fs-title{font-size:14px;font-weight:800;color:#0F172A;display:flex;align-items:center;gap:7px}
        .fs-count{background:#2563EB;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .fs-clear{font-size:11.5px;color:#2563EB;font-weight:600;cursor:pointer;background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;padding:4px 8px;border-radius:6px;transition:all .15s}
        .fs-clear:hover{background:#EFF6FF}
        .fs-group{margin-bottom:20px}
        .fs-group-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:9px;display:flex;align-items:center;justify-content:space-between}
        .fs-input,.fs-select{width:100%;padding:8px 11px;border:1.5px solid #E2E8F0;border-radius:9px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .fs-input:focus,.fs-select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .fs-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .fs-range-label{font-size:11px;color:#94A3B8;margin-bottom:4px}
        .bed-btns{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
        .bed-btn{padding:7px 4px;border:1.5px solid #E2E8F0;border-radius:8px;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;transition:all .15s}
        .bed-btn:hover{border-color:#BFDBFE;color:#2563EB;background:#EFF6FF}
        .bed-btn.active{border-color:#2563EB;background:#EFF6FF;color:#2563EB;font-weight:700}
        .type-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .type-btn{padding:7px 6px;border:1.5px solid #E2E8F0;border-radius:8px;background:#fff;color:#475569;font-size:11.5px;font-weight:600;cursor:pointer;text-align:center;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .type-btn:hover{border-color:#BFDBFE;color:#2563EB;background:#EFF6FF}
        .type-btn.active{border-color:#2563EB;background:#EFF6FF;color:#2563EB;font-weight:700}
        .tag-checks{display:flex;flex-direction:column;gap:6px}
        .tag-check{display:flex;align-items:center;gap:9px;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .15s}
        .tag-check:hover{background:#F8FAFC}
        .tag-check input{width:14px;height:14px;accent-color:#2563EB;cursor:pointer;flex-shrink:0}
        .tag-check-label{font-size:12.5px;color:#374151;font-weight:500}
        .fs-divider{border:none;border-top:1px solid #F1F5F9;margin:16px 0}
        .apply-btn{width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:all .18s;margin-top:4px}
        .apply-btn:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(37,99,235,.4)}

        /* ── LISTINGS PANEL ── */
        .listings-panel{flex:1;padding:20px;min-width:0}
        .lp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap}
        .lp-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .filter-toggle{display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .filter-toggle:hover{background:#F8FAFC;border-color:#CBD5E1}
        .filter-toggle.active{border-color:#3B82F6;background:#EFF6FF;color:#2563EB}
        .results-label{font-size:13px;color:#64748B;font-weight:500}
        .lp-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .sort-select{padding:7px 11px;border:1.5px solid #E2E8F0;border-radius:9px;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#374151;outline:none;background:#fff;cursor:pointer}
        .view-btns{display:flex;gap:3px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:9px;padding:3px}
        .view-btn{width:30px;height:30px;border:none;background:none;border-radius:6px;cursor:pointer;color:#94A3B8;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .view-btn.active{background:#fff;color:#2563EB;box-shadow:0 1px 3px rgba(15,23,42,.08)}

        /* ── SEARCH BAR ── */
        .lp-search{position:relative;margin-bottom:16px}
        .lp-search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:15px;color:#94A3B8;pointer-events:none}
        .lp-search-input{width:100%;padding:11px 13px 11px 38px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#0F172A;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:all .18s;box-shadow:0 1px 3px rgba(15,23,42,.04)}
        .lp-search-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .lp-search-input::placeholder{color:#94A3B8}

        /* ── TAG QUICK PILLS ── */
        .quick-pills{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
        .quick-pill{padding:5px 12px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#64748B;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif}
        .quick-pill:hover{background:#EFF6FF;border-color:#BFDBFE;color:#2563EB}
        .quick-pill.active{background:#EFF6FF;border-color:#3B82F6;color:#2563EB}

        /* ── LISTING GRID ── */
        .listing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:100%}
        .listing-grid.cols-2{grid-template-columns:repeat(2,1fr)}
        .listing-grid.list-view{grid-template-columns:1fr}

        /* ── LISTING CARD ── */
        .lcard{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:box-shadow .18s,transform .18s;text-decoration:none;color:inherit}
        .lcard:hover{box-shadow:0 8px 28px rgba(15,23,42,.11);transform:translateY(-2px)}
        .lcard.list-view{flex-direction:row;border-radius:14px}
        .lcard-banner{height:175px;position:relative;background:#F1F5F9;overflow:hidden;flex-shrink:0}
        .lcard.list-view .lcard-banner{width:220px;height:auto;min-height:155px}
        .lcard-img{width:100%;height:100%;object-fit:cover;transition:transform .3s ease}
        .lcard:hover .lcard-img{transform:scale(1.04)}
        .lcard-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lcard-save{position:absolute;top:9px;right:9px;width:32px;height:32px;border-radius:99px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;transition:transform .18s;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        .lcard-save:hover{transform:scale(1.12)}
        .lcard-badge{position:absolute;top:9px;left:9px;font-size:10px;font-weight:700;border-radius:99px;padding:3px 9px;background:rgba(15,23,42,.7);color:#fff;backdrop-filter:blur(4px)}
        .lcard-avail{position:absolute;bottom:9px;right:9px;font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;background:rgba(16,185,129,.9);color:#fff;backdrop-filter:blur(4px)}
        .lcard-photo-ct{position:absolute;bottom:9px;left:9px;background:rgba(15,23,42,.55);color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;backdrop-filter:blur(4px)}
        .lcard-body{padding:13px 15px;flex:1;display:flex;flex-direction:column;min-width:0}
        .lcard-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .lcard-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard.list-view .lcard-title{white-space:normal}
        .lcard-loc{font-size:11.5px;color:#94A3B8;margin-bottom:9px;display:flex;align-items:center;gap:4px}
        .lcard-price{font-family:'Fraunces',serif;font-size:21px;font-weight:700;color:#0F172A;margin-bottom:7px}
        .lcard-price span{font-size:11.5px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .lcard-facts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
        .lcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:3px 7px;font-weight:500}
        .lcard-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:0}
        .lcard-tag{font-size:10px;color:#7C3AED;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.15);border-radius:99px;padding:2px 8px;font-weight:600}
        .lcard-desc{font-size:12px;color:#64748B;line-height:1.5;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .lcard-footer{padding:10px 13px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-shrink:0}
        .lcard-landlord{display:flex;align-items:center;gap:7px;min-width:0}
        .lcard-ll-av{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;flex-shrink:0}
        .lcard-ll-name{font-size:11.5px;color:#64748B;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
        .lcard-view-btn{padding:6px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 8px rgba(37,99,235,.25);transition:all .15s;white-space:nowrap;flex-shrink:0}
        .lcard-view-btn:hover{transform:translateY(-1px)}

        /* ── SKELETON ── */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        /* ── EMPTY ── */
        .empty-state{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;grid-column:1/-1}
        .es-ico{font-size:52px;margin-bottom:14px}
        .es-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .es-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px;line-height:1.6}
        .es-btn{padding:9px 22px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── LOAD MORE SENTINEL ── */
        .load-sentinel{height:60px;display:flex;align-items:center;justify-content:center;grid-column:1/-1;color:#94A3B8;font-size:13px}

        /* ── RESPONSIVE ── */
        @media(max-width:1100px){.listing-grid:not(.list-view){grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sk-main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{left:0!important}
          .filter-sidebar{position:fixed;left:0;top:58px;bottom:0;z-index:100;box-shadow:4px 0 24px rgba(15,23,42,.1)}
          .filter-sidebar.collapsed{transform:translateX(-100%);opacity:1;width:280px;overflow-y:auto}
          .listing-grid:not(.list-view){grid-template-columns:repeat(2,1fr)}
          .lcard.list-view{flex-direction:column}
          .lcard.list-view .lcard-banner{width:100%;min-height:175px}
        }
        @media(max-width:480px){
          .listing-grid:not(.list-view){grid-template-columns:1fr}
          .listings-panel{padding:12px}
        }
      `}</style>

      {/* Sidebar overlay */}
      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="sk-shell">
        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura" width={24} height={24} />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">Discover</span>
            <a href="/seeker" className="sb-item"><span className="sb-ico">🔍</span>Browse Homes</a>
            <a href="/seeker/listings" className="sb-item active"><span className="sb-ico">🏘️</span>All Listings</a>
            <a href="/seeker/saved" className="sb-item">
              <span className="sb-ico">❤️</span>Saved Listings
              {savedIds.size > 0 && <span className="sb-badge">{savedIds.size}</span>}
            </a>
            <a href="/seeker/map" className="sb-item"><span className="sb-ico">🗺️</span>Map View</a>
            <span className="sb-section">My Account</span>
            <a href="/seeker/messages" className="sb-item">
              <span className="sb-ico">💬</span>Messages
              {unreadMessages > 0 && <span className="sb-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
            </a>
            <a href="/seeker/applications" className="sb-item"><span className="sb-ico">📝</span>Applications</a>
            <a href="/seeker/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-urole">Seeker</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div className="sk-main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">
                <a href="/seeker" style={{ color: '#94A3B8', textDecoration: 'none' }}>Rentura</a>
                &nbsp;/&nbsp; <b>All Listings</b>
              </div>
            </div>
            <div className="tb-right">
              <a href="/seeker/messages" className="tb-btn">
                💬{unreadMessages > 0 && <span className="tb-dot" />}
              </a>
              <a href="/seeker/saved" className="tb-btn" title="Saved">
                {savedIds.size > 0 ? '❤️' : '🤍'}
              </a>
            </div>
          </div>

          <div className="listings-layout">
            {/* ── FILTER SIDEBAR ── */}
            <div className={`filter-sidebar${filterPanelOpen ? '' : ' collapsed'}`}>
              <div className="fs-header">
                <div className="fs-title">
                  Filters
                  {activeFiltersCount > 0 && <span className="fs-count">{activeFiltersCount}</span>}
                </div>
                {activeFiltersCount > 0 && (
                  <button className="fs-clear" onClick={clearFilters}>Clear all</button>
                )}
              </div>

              {/* City */}
              <div className="fs-group">
                <div className="fs-group-title">City</div>
                <select className="fs-select" value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}>
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <hr className="fs-divider" />

              {/* Price Range */}
              <div className="fs-group">
                <div className="fs-group-title">Price Range /mo</div>
                <div className="fs-row">
                  <div>
                    <div className="fs-range-label">Min</div>
                    <input className="fs-input" type="number" placeholder="0" value={filters.min_price} onChange={e => setFilters(f => ({ ...f, min_price: e.target.value }))} />
                  </div>
                  <div>
                    <div className="fs-range-label">Max</div>
                    <input className="fs-input" type="number" placeholder="Any" value={filters.max_price} onChange={e => setFilters(f => ({ ...f, max_price: e.target.value }))} />
                  </div>
                </div>
              </div>

              <hr className="fs-divider" />

              {/* Bedrooms */}
              <div className="fs-group">
                <div className="fs-group-title">Bedrooms</div>
                <div className="bed-btns">
                  {BEDROOM_OPTIONS.map(b => (
                    <button key={b} className={`bed-btn${filters.bedrooms === b ? ' active' : ''}`}
                      onClick={() => setFilters(f => ({ ...f, bedrooms: b }))}>
                      {b === 'Any' ? 'Any' : b === '5+' ? '5+' : `${b}bd`}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="fs-divider" />

              {/* Property Type */}
              <div className="fs-group">
                <div className="fs-group-title">Property Type</div>
                <div className="type-grid">
                  {PROPERTY_TYPES.map(t => (
                    <button key={t} className={`type-btn${filters.property_type === t ? ' active' : ''}`}
                      onClick={() => setFilters(f => ({ ...f, property_type: t }))}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="fs-divider" />

              {/* Area */}
              <div className="fs-group">
                <div className="fs-group-title">Area (sqft)</div>
                <div className="fs-row">
                  <div>
                    <div className="fs-range-label">Min</div>
                    <input className="fs-input" type="number" placeholder="0" value={filters.min_area} onChange={e => setFilters(f => ({ ...f, min_area: e.target.value }))} />
                  </div>
                  <div>
                    <div className="fs-range-label">Max</div>
                    <input className="fs-input" type="number" placeholder="Any" value={filters.max_area} onChange={e => setFilters(f => ({ ...f, max_area: e.target.value }))} />
                  </div>
                </div>
              </div>

              <hr className="fs-divider" />

              {/* Available Before */}
              <div className="fs-group">
                <div className="fs-group-title">Available Before</div>
                <input className="fs-input" type="date" value={filters.available_before} onChange={e => setFilters(f => ({ ...f, available_before: e.target.value }))} />
              </div>

              <hr className="fs-divider" />

              {/* Amenities */}
              <div className="fs-group">
                <div className="fs-group-title">Amenities</div>
                <div className="tag-checks">
                  {ALL_TAGS.map(tag => (
                    <label key={tag} className="tag-check">
                      <input type="checkbox" checked={filters.tags.includes(tag)}
                        onChange={() => setFilters(f => ({
                          ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
                        }))} />
                      <span className="tag-check-label">{tag}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="apply-btn" onClick={() => userId && loadListings(userId, true)}>
                Apply Filters
              </button>
            </div>

            {/* ── LISTINGS PANEL ── */}
            <div className="listings-panel">
              {/* Search */}
              <div className="lp-search">
                <span className="lp-search-icon">🔍</span>
                <input
                  className="lp-search-input"
                  placeholder="Search listings by title, city, or description…"
                  value={filters.query}
                  onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && userId && loadListings(userId, true)}
                />
              </div>

              {/* Quick tag pills */}
              <div className="quick-pills">
                {['Furnished', 'Parking', 'Pet Friendly', 'Pool', 'Gym', 'Air Conditioned'].map(tag => (
                  <button key={tag} className={`quick-pill${filters.tags.includes(tag) ? ' active' : ''}`}
                    onClick={() => setFilters(f => ({
                      ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
                    }))}>
                    {tag}
                  </button>
                ))}
              </div>

              {/* Toolbar */}
              <div className="lp-header">
                <div className="lp-left">
                  <button className={`filter-toggle${filterPanelOpen ? ' active' : ''}`} onClick={() => setFilterPanelOpen(o => !o)}>
                    ⚡ Filters
                    {activeFiltersCount > 0 && (
                      <span style={{ background: '#2563EB', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 10, fontWeight: 800 }}>
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>
                  <span className="results-label">
                    {loading ? 'Loading…' : `${totalCount.toLocaleString()} listing${totalCount !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="lp-right">
                  <select className="sort-select" value={filters.sort}
                    onChange={e => setFilters(f => ({ ...f, sort: e.target.value as Filters['sort'] }))}>
                    <option value="newest">Newest first</option>
                    <option value="price_asc">Price: Low → High</option>
                    <option value="price_desc">Price: High → Low</option>
                  </select>
                  <div className="view-btns">
                    <button className={`view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} title="Grid">⊞</button>
                    <button className={`view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} title="List">☰</button>
                  </div>
                </div>
              </div>

              {/* Grid */}
              <div className={`listing-grid${view === 'list' ? ' list-view' : ''}`}>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="lcard" style={{ cursor: 'default' }}>
                      <div className="skeleton" style={{ height: 175 }} />
                      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="skeleton" style={{ height: 10, width: '50%' }} />
                        <div className="skeleton" style={{ height: 14, width: '80%' }} />
                        <div className="skeleton" style={{ height: 10, width: '55%' }} />
                        <div className="skeleton" style={{ height: 20, width: '45%' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div className="skeleton" style={{ height: 22, width: 60, borderRadius: 6 }} />
                          <div className="skeleton" style={{ height: 22, width: 60, borderRadius: 6 }} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : listings.length === 0 ? (
                  <div className="empty-state">
                    <div className="es-ico">🏘️</div>
                    <div className="es-title">No listings found</div>
                    <div className="es-sub">Try adjusting your filters or search terms to find more properties.</div>
                    <button className="es-btn" onClick={clearFilters}>Clear Filters</button>
                  </div>
                ) : (
                  listings.map(l => (
                    <a
                      key={l.id}
                      className={`lcard${view === 'list' ? ' list-view' : ''}`}
                      href={`/seeker/listing-details/${l.id}`}
                    >
                      <div className="lcard-banner">
                        {l.photos.length > 0
                          ? <img className="lcard-img" src={l.photos[0]} alt={l.title} loading="lazy" />
                          : <div className="lcard-placeholder">🏠</div>}
                        <span className="lcard-badge">{l.property_type}</span>
                        <button className={`lcard-save`} onClick={e => toggleSave(l.id, e)} title="Save">
                          {savedIds.has(l.id) ? '❤️' : '🤍'}
                        </button>
                        {l.photos.length > 1 && <div className="lcard-photo-ct">📷 {l.photos.length}</div>}
                        {isAvailableSoon(l.available_from) && <div className="lcard-avail">Available soon</div>}
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
                        {view === 'list' && l.description && (
                          <div className="lcard-desc">{l.description}</div>
                        )}
                      </div>
                      <div className="lcard-footer">
                        <div className="lcard-landlord">
                          <div className="lcard-ll-av" style={{ background: AVATAR_GRADIENTS[l.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length] }}>
                            {l.landlord_initials}
                          </div>
                          <span className="lcard-ll-name">{l.landlord_name}</span>
                        </div>
                        <span className="lcard-view-btn">View →</span>
                      </div>
                    </a>
                  ))
                )}

                {/* Infinite scroll sentinel */}
                {!loading && listings.length > 0 && (
                  <div ref={sentinelRef} className="load-sentinel">
                    {loadingMore ? '⏳ Loading more…' : hasMore ? '' : `✓ All ${totalCount} listings loaded`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
