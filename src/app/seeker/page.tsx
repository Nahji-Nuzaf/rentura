'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Seeker Marketplace Page
// Drop-in Next.js page: /app/seeker/page.tsx  (or pages/seeker.tsx)
//
// Dependencies (already in project):
//   @/lib/supabase  · @/lib/useCurrency  · @/components/ProProvider
//   next/image · next/navigation
//
// Supabase tables used:
//   listings  (id, title, description, property_id, unit_id, landlord_id,
//              bedrooms, bathrooms, rent_amount, currency, available_from,
//              status, photos text[], tags text[], city, property_type, area_sqft)
//   saved_listings  (id, seeker_id, listing_id, created_at)
//   profiles  (id, full_name)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

// ── Types ────────────────────────────────────────────────────────────────────
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Component ────────────────────────────────────────────────────────────────
export default function SeekerMarketplace() {
  const router = useRouter()
  const { fmtMoney } = useCurrency()

  // Auth
  const [userId, setUserId] = useState('')
  const [userInitials, setUserInitials] = useState('ME')
  const [fullName, setFullName] = useState('Seeker')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Detail modal
  const [detail, setDetail] = useState<Listing | null>(null)
  const [detailPhoto, setDetailPhoto] = useState(0)

  // Filters
  const [filters, setFilters] = useState<Filters>({
    query: '', city: '', min_price: '', max_price: '',
    bedrooms: 'Any', property_type: 'All', tags: [], sort: 'newest',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [cities, setCities] = useState<string[]>([])

  // View
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [activeTab, setActiveTab] = useState<'browse' | 'saved'>('browse')

  // Popular tags for quick filter
  const POPULAR_TAGS = ['Air Conditioned', 'Parking', 'Furnished', 'Pet Friendly', 'Pool', 'Gym', 'Solar Panel']

  // ── Load Auth ──────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'Seeker'
      setFullName(name)
      setUserInitials(initials(name))
      setUserId(user.id)
    })()
  }, [router])

  // ── Load Listings ──────────────────────────────────────────────────────────
  const loadListings = useCallback(async (uid: string) => {
    setLoading(true)
    try {
      const sb = createClient()

      // Fetch active listings
      let query = sb
        .from('listings')
        .select('id,title,description,property_id,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,status,photos,tags,city,property_type,area_sqft')
        .eq('status', 'active')

      // Apply filters
      if (filters.city && filters.city !== '') query = query.ilike('city', `%${filters.city}%`)
      if (filters.min_price) query = query.gte('rent_amount', parseFloat(filters.min_price))
      if (filters.max_price) query = query.lte('rent_amount', parseFloat(filters.max_price))
      if (filters.bedrooms !== 'Any') {
        const b = parseInt(filters.bedrooms)
        if (filters.bedrooms === '5+') query = query.gte('bedrooms', 5)
        else query = query.eq('bedrooms', b)
      }
      if (filters.property_type !== 'All') query = query.ilike('property_type', filters.property_type)

      // Sort
      if (filters.sort === 'price_asc') query = query.order('rent_amount', { ascending: true })
      else if (filters.sort === 'price_desc') query = query.order('rent_amount', { ascending: false })
      else query = query.order('created_at', { ascending: false })

      const { data: rows } = await query.limit(48)

      // Fetch landlord names
      const landlordIds = [...new Set((rows || []).map((r: any) => r.landlord_id).filter(Boolean))]
      const profileMap: Record<string, string> = {}
      if (landlordIds.length > 0) {
        const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', landlordIds)
        ;(pArr || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Landlord' })
      }

      // Fetch saved listings for this user
      const { data: savedRows } = await sb
        .from('saved_listings')
        .select('listing_id')
        .eq('seeker_id', uid)
      const savedSet = new Set((savedRows || []).map((s: any) => s.listing_id))
      setSavedIds(savedSet)

      // Unique cities for filter dropdown
      const uniqueCities = [...new Set((rows || []).map((r: any) => r.city).filter(Boolean))] as string[]
      setCities(uniqueCities)

      let mapped: Listing[] = (rows || []).map((r: any, i: number) => {
        const lName = profileMap[r.landlord_id] || 'Landlord'
        return {
          id: r.id, title: r.title || 'Untitled',
          description: r.description || '',
          property_id: r.property_id || '',
          landlord_id: r.landlord_id || '',
          landlord_name: lName,
          landlord_initials: initials(lName),
          bedrooms: r.bedrooms || 0, bathrooms: r.bathrooms || 1,
          rent_amount: r.rent_amount || 0, currency: r.currency || 'USD',
          available_from: r.available_from || '', status: r.status || 'active',
          photos: r.photos || [], tags: r.tags || [],
          city: r.city || '', property_type: r.property_type || 'House',
          area_sqft: r.area_sqft || null,
          saved: savedSet.has(r.id),
        }
      })

      // Client-side text search + tag filter
      if (filters.query) {
        const q = filters.query.toLowerCase()
        mapped = mapped.filter(l =>
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q)
        )
      }
      if (filters.tags.length > 0) {
        mapped = mapped.filter(l =>
          filters.tags.every(t => l.tags.includes(t))
        )
      }

      setListings(mapped)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => {
    if (userId) loadListings(userId)
  }, [userId, loadListings])

  // ── Messages unread ────────────────────────────────────────────────────────
  useEffect(() => {
    let channel: any = null
    const init = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const fetch = async () => {
        const { count } = await sb.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id).eq('read', false)
        setUnreadMessages(count || 0)
      }
      await fetch()
      channel = sb.channel('seeker-unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, fetch)
        .subscribe()
    }
    init()
    return () => { if (channel) createClient().removeChannel(channel) }
  }, [])

  // ── Save / Unsave ──────────────────────────────────────────────────────────
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

  // ── Contact Landlord ───────────────────────────────────────────────────────
  function contactLandlord(landlordId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    router.push(`/seeker/messages?to=${landlordId}`)
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const displayedListings = activeTab === 'saved'
    ? listings.filter(l => savedIds.has(l.id))
    : listings

  const stats = {
    total: listings.length,
    saved: savedIds.size,
    cities: cities.length,
    avgRent: listings.length > 0
      ? Math.round(listings.reduce((s, l) => s + l.rent_amount, 0) / listings.length)
      : 0,
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
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
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-urole{display:inline-block;font-size:10px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* ── MAIN ── */
        .sk-main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;width:calc(100% - 260px)}

        /* ── TOPBAR ── */
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:fixed;top:0;left:260px;right:0;z-index:150;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap}.breadcrumb b{color:#0F172A;font-weight:700}
        .tb-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .tb-msg-btn{position:relative;width:36px;height:36px;border-radius:10px;background:#F8FAFC;border:1.5px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;text-decoration:none;transition:all .15s;flex-shrink:0}
        .tb-msg-btn:hover{background:#EFF6FF;border-color:#BFDBFE}
        .tb-msg-dot{position:absolute;top:4px;right:4px;width:8px;height:8px;background:#EF4444;border-radius:50%;border:1.5px solid #fff}

        /* ── CONTENT ── */
        .sk-content{padding:22px 20px;padding-top:80px;flex:1;width:100%;min-width:0}

        /* ── HERO SEARCH ── */
        .hero{background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%);border-radius:22px;padding:36px 32px;margin-bottom:22px;position:relative;overflow:hidden}
        .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 50%,rgba(59,130,246,.18) 0%,transparent 65%);pointer-events:none}
        .hero::after{content:'🏡';position:absolute;right:32px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.08;pointer-events:none}
        .hero-title{font-family:'Fraunces',serif;font-size:30px;font-weight:400;color:#F8FAFC;margin-bottom:6px;letter-spacing:-.5px;position:relative;z-index:1}
        .hero-title em{font-style:italic;color:#93C5FD}
        .hero-sub{font-size:13.5px;color:#94A3B8;margin-bottom:22px;position:relative;z-index:1}
        .search-bar{display:flex;gap:8px;position:relative;z-index:1;flex-wrap:wrap}
        .search-input-wrap{flex:1;min-width:200px;position:relative;display:flex;align-items:center}
        .search-icon{position:absolute;left:13px;font-size:15px;color:#64748B;pointer-events:none}
        .search-input{width:100%;padding:11px 13px 11px 38px;border-radius:12px;border:1.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.09);color:#F1F5F9;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:all .18s;backdrop-filter:blur(8px)}
        .search-input::placeholder{color:#64748B}
        .search-input:focus{border-color:rgba(59,130,246,.6);background:rgba(255,255,255,.13);box-shadow:0 0 0 3px rgba(59,130,246,.15)}
        .search-btn{padding:11px 22px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.4);transition:all .18s;white-space:nowrap;flex-shrink:0}
        .search-btn:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(37,99,235,.5)}
        .filter-toggle-btn{padding:11px 16px;border-radius:12px;border:1.5px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#CBD5E1;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;backdrop-filter:blur(8px);flex-shrink:0;display:flex;align-items:center;gap:6px}
        .filter-toggle-btn:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.25)}
        .filter-toggle-btn.active-filters{border-color:rgba(59,130,246,.5);color:#93C5FD;background:rgba(59,130,246,.12)}
        .hero-stats{display:flex;gap:20px;margin-top:18px;position:relative;z-index:1;flex-wrap:wrap}
        .hstat{display:flex;align-items:center;gap:7px}
        .hstat-num{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#F1F5F9}
        .hstat-lbl{font-size:12px;color:#64748B}

        /* ── FILTER PANEL ── */
        .filter-panel{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 20px;margin-bottom:18px;box-shadow:0 2px 12px rgba(15,23,42,.06)}
        .fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:14px}
        .fp-field{display:flex;flex-direction:column;gap:5px}
        .fp-label{font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px}
        .fp-input,.fp-select{padding:8px 11px;border:1.5px solid #E2E8F0;border-radius:9px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .fp-input:focus,.fp-select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .fp-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #F1F5F9;padding-top:14px}
        .fp-clear{padding:7px 16px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .fp-apply{padding:7px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── TAG QUICK FILTERS ── */
        .tag-pills{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px;align-items:center}
        .tag-pill-lbl{font-size:12px;font-weight:700;color:#64748B;margin-right:2px;white-space:nowrap}
        .tag-pill{padding:5px 13px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif}
        .tag-pill:hover{background:#EFF6FF;border-color:#BFDBFE;color:#2563EB}
        .tag-pill.active{background:#EFF6FF;border-color:#3B82F6;color:#2563EB}

        /* ── TOOLBAR ── */
        .toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap}
        .tabs{display:flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:3px}
        .tab{padding:6px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .tab:hover{background:#F1F5F9}
        .tab.active{background:#2563EB;color:#fff}
        .tab .tc{font-size:10px;font-weight:700;border-radius:99px;padding:1px 6px;background:#F1F5F9;color:#64748B}
        .tab.active .tc{background:rgba(255,255,255,.2);color:#fff}
        .toolbar-right{display:flex;align-items:center;gap:8px}
        .sort-select{padding:7px 11px;border:1.5px solid #E2E8F0;border-radius:9px;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#374151;outline:none;background:#fff;cursor:pointer}
        .view-btns{display:flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;padding:3px}
        .view-btn{width:30px;height:30px;border:none;background:none;border-radius:6px;cursor:pointer;color:#94A3B8;font-size:15px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .view-btn.active{background:#EFF6FF;color:#2563EB}
        .results-lbl{font-size:13px;color:#64748B;font-weight:500;white-space:nowrap}

        /* ── LISTING GRID ── */
        .listing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%}
        .listing-grid.list-view{grid-template-columns:1fr}

        /* ── LISTING CARD ── */
        .lcard{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;flex-direction:column;cursor:pointer;transition:box-shadow .18s,transform .18s}
        .lcard:hover{box-shadow:0 8px 28px rgba(15,23,42,.11);transform:translateY(-2px)}
        .lcard.list-view{flex-direction:row}

        /* Card banner */
        .lcard-banner{height:180px;position:relative;background:#F1F5F9;overflow:hidden;flex-shrink:0}
        .lcard.list-view .lcard-banner{width:220px;height:auto;min-height:160px}
        .lcard-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
        .lcard:hover .lcard-img{transform:scale(1.03)}
        .lcard-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lcard-status{position:absolute;top:10px;left:10px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px}
        .lcard-photo-ct{position:absolute;bottom:10px;left:10px;background:rgba(15,23,42,.6);color:#fff;font-size:10.5px;font-weight:700;border-radius:99px;padding:2px 8px;backdrop-filter:blur(4px)}
        .lcard-save{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:99px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .18s;box-shadow:0 2px 8px rgba(0,0,0,.12)}
        .lcard-save:hover{transform:scale(1.12)}
        .lcard-save.saved{background:#FFF1F2}
        .lcard-avail{position:absolute;bottom:10px;right:10px;font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;background:rgba(16,185,129,.9);color:#fff;backdrop-filter:blur(4px)}

        /* Card body */
        .lcard-body{padding:14px 16px;flex:1;display:flex;flex-direction:column}
        .lcard-type{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:4px}
        .lcard-title{font-size:14.5px;font-weight:700;color:#0F172A;margin-bottom:3px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard-loc{font-size:12px;color:#94A3B8;margin-bottom:10px;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lcard-price{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:8px;line-height:1}
        .lcard-price span{font-size:12px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .lcard-facts{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}
        .lcard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:3px 8px;font-weight:500}
        .lcard-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:9px}
        .lcard-tag{font-size:10.5px;color:#7C3AED;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.16);border-radius:99px;padding:2px 8px;font-weight:600}
        .lcard-desc{font-size:12px;color:#64748B;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}
        .lcard-footer{padding:10px 14px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;gap:8px}
        .lcard-landlord{display:flex;align-items:center;gap:8px}
        .lcard-ll-av{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;flex-shrink:0}
        .lcard-ll-name{font-size:12px;color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px}
        .lcard-contact{padding:6px 14px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 8px rgba(37,99,235,.28);transition:all .15s;white-space:nowrap}
        .lcard-contact:hover{transform:translateY(-1px)}

        /* List view card overrides */
        .lcard.list-view .lcard-body{padding:16px 18px}
        .lcard.list-view .lcard-title{white-space:normal}
        .lcard.list-view .lcard-desc{-webkit-line-clamp:3}

        /* ── SKELETON ── */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        /* ── EMPTY ── */
        .empty-state{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;grid-column:1/-1}
        .es-ico{font-size:52px;margin-bottom:14px}
        .es-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .es-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px;line-height:1.6}
        .es-btn{padding:9px 22px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── DETAIL MODAL ── */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
        .modal-bg.open{display:flex}
        .modal{background:#fff;border-radius:24px;width:100%;max-width:720px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(15,23,42,.22);display:flex;flex-direction:column}
        .modal::-webkit-scrollbar{width:4px}.modal::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}
        .modal-gallery{position:relative;height:280px;background:#0F172A;overflow:hidden;flex-shrink:0;border-radius:24px 24px 0 0}
        .modal-gallery-img{width:100%;height:100%;object-fit:cover}
        .modal-gallery-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:72px;opacity:.2}
        .modal-gallery-nav{position:absolute;top:50%;transform:translateY(-50%);width:100%;display:flex;justify-content:space-between;padding:0 12px;pointer-events:none}
        .mgn-btn{width:36px;height:36px;border-radius:99px;background:rgba(255,255,255,.85);border:none;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;backdrop-filter:blur(4px);transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.15)}
        .mgn-btn:hover{background:#fff;transform:scale(1.06)}
        .modal-photo-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:5px}
        .mpd{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.45);transition:all .2s;cursor:pointer}
        .mpd.active{background:#fff;width:18px;border-radius:99px}
        .modal-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:99px;background:rgba(15,23,42,.65);border:none;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .modal-save-btn{position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:99px;background:rgba(255,255,255,.85);border:none;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .modal-body{padding:24px 28px;flex:1}
        .modal-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px}
        .modal-title-wrap{flex:1;min-width:0}
        .modal-type{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:4px}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;line-height:1.3;margin-bottom:4px}
        .modal-loc{font-size:13px;color:#64748B;display:flex;align-items:center;gap:5px}
        .modal-price-wrap{text-align:right;flex-shrink:0}
        .modal-price{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A}
        .modal-price span{font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .modal-avail{font-size:11.5px;color:#16A34A;font-weight:600;margin-top:3px}
        .modal-facts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
        .modal-fact{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:12.5px;color:#374151;font-weight:500}
        .modal-fact strong{color:#0F172A;font-weight:700}
        .modal-section{margin-bottom:18px}
        .modal-sec-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:8px}
        .modal-desc{font-size:14px;color:#374151;line-height:1.7}
        .modal-tags{display:flex;flex-wrap:wrap;gap:6px}
        .modal-tag{font-size:12px;color:#7C3AED;background:rgba(124,58,237,.07);border:1.5px solid rgba(124,58,237,.16);border-radius:99px;padding:4px 12px;font-weight:600}
        .modal-footer{padding:16px 28px;border-top:1px solid #F1F5F9;display:flex;gap:10px;align-items:center}
        .modal-ll{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
        .modal-ll-av{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0}
        .modal-ll-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .modal-ll-lbl{font-size:11.5px;color:#94A3B8;margin-top:1px}
        .modal-contact-btn{padding:11px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3);white-space:nowrap;flex-shrink:0;transition:all .18s}
        .modal-contact-btn:hover{transform:translateY(-1px)}
        .modal-save-toggle{padding:11px 16px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0;transition:all .15s;display:flex;align-items:center;gap:6px}
        .modal-save-toggle:hover{border-color:#FECDD3;background:#FFF1F2}
        .modal-save-toggle.saved{border-color:#FECDD3;background:#FFF1F2;color:#E11D48}

        /* ── RESPONSIVE ── */
        @media(min-width:1200px){.listing-grid:not(.list-view){grid-template-columns:repeat(3,1fr)}}
        @media(min-width:769px) and (max-width:1199px){.listing-grid:not(.list-view){grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sk-main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{left:0!important}
          .sk-content{padding:12px 14px;padding-top:76px}
          .hero{padding:22px 18px;border-radius:16px}
          .hero-title{font-size:22px}
          .hero::after{display:none}
          .listing-grid:not(.list-view){grid-template-columns:repeat(2,1fr)}
          .lcard.list-view{flex-direction:column}
          .lcard.list-view .lcard-banner{width:100%;min-height:180px}
          .modal{border-radius:16px 16px 0 0;position:fixed;bottom:0;left:0;right:0;max-height:92vh;margin:0;width:100%;max-width:100%}
          .modal-gallery{border-radius:16px 16px 0 0;height:220px}
          .modal-body{padding:18px 18px}
          .modal-footer{padding:14px 18px;flex-wrap:wrap}
          .fp-grid{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:480px){
          .listing-grid:not(.list-view){grid-template-columns:1fr}
          .hero{padding:18px 14px}
          .hero-title{font-size:19px}
          .search-bar{gap:6px}
          .search-btn{width:100%}
          .filter-toggle-btn{flex:1}
          .hero-stats{gap:12px}
          .fp-grid{grid-template-columns:1fr 1fr}
          .toolbar{flex-direction:column;align-items:stretch}
          .toolbar-right{justify-content:space-between}
        }
      `}</style>

      {/* ── Detail Modal ── */}
      <div className={`modal-bg${detail ? ' open' : ''}`} onClick={() => setDetail(null)}>
        {detail && (
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-gallery">
              {detail.photos.length > 0
                ? <img className="modal-gallery-img" src={detail.photos[detailPhoto]} alt={detail.title} />
                : <div className="modal-gallery-placeholder">🏠</div>
              }
              {detail.photos.length > 1 && (
                <>
                  <div className="modal-gallery-nav">
                    <button className="mgn-btn" onClick={() => setDetailPhoto(p => (p - 1 + detail.photos.length) % detail.photos.length)}>‹</button>
                    <button className="mgn-btn" onClick={() => setDetailPhoto(p => (p + 1) % detail.photos.length)}>›</button>
                  </div>
                  <div className="modal-photo-dots">
                    {detail.photos.map((_, i) => (
                      <div key={i} className={`mpd${i === detailPhoto ? ' active' : ''}`} onClick={() => setDetailPhoto(i)} />
                    ))}
                  </div>
                </>
              )}
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
              <button
                className="modal-save-btn"
                onClick={e => toggleSave(detail.id, e)}
              >{savedIds.has(detail.id) ? '❤️' : '🤍'}</button>
            </div>
            <div className="modal-body">
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <div className="modal-type">{detail.property_type}</div>
                  <div className="modal-title">{detail.title}</div>
                  <div className="modal-loc">📍 {detail.city || 'Location not specified'}</div>
                </div>
                <div className="modal-price-wrap">
                  <div className="modal-price">{fmtMoney(detail.rent_amount)}<span>/mo</span></div>
                  {detail.available_from && (
                    <div className="modal-avail">
                      {isAvailableSoon(detail.available_from) ? '🟢 Available soon' : `📅 From ${fmtDate(detail.available_from)}`}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-facts">
                {detail.bedrooms > 0 && <div className="modal-fact">🛏 <strong>{detail.bedrooms}</strong> Bedrooms</div>}
                <div className="modal-fact">🚿 <strong>{detail.bathrooms}</strong> Bathrooms</div>
                {detail.area_sqft && <div className="modal-fact">📐 <strong>{detail.area_sqft.toLocaleString()}</strong> sqft</div>}
                <div className="modal-fact">🏘️ <strong>{detail.property_type}</strong></div>
              </div>

              {detail.description && (
                <div className="modal-section">
                  <div className="modal-sec-title">About this property</div>
                  <div className="modal-desc">{detail.description}</div>
                </div>
              )}

              {detail.tags && detail.tags.length > 0 && (
                <div className="modal-section">
                  <div className="modal-sec-title">Features & Amenities</div>
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
              <button
                className={`modal-save-toggle${savedIds.has(detail.id) ? ' saved' : ''}`}
                onClick={e => toggleSave(detail.id, e)}
              >
                {savedIds.has(detail.id) ? '❤️ Saved' : '🤍 Save'}
              </button>
              <button
                className="modal-contact-btn"
                onClick={e => contactLandlord(detail.landlord_id, e)}
              >
                💬 Contact
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar overlay ── */}
      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="sk-shell">
        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={24} height={24} />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">Discover</span>
            <a href="/seeker" className="sb-item active"><span className="sb-ico">🔍</span>Browse Homes</a>
            <a href="/seeker/saved" className="sb-item">
              <span className="sb-ico">❤️</span>Saved Listings
              {savedIds.size > 0 && <span className="sb-badge">{savedIds.size}</span>}
            </a>
            <a href="/seeker/map" className="sb-item"><span className="sb-ico">🗺️</span>Map View</a>
            <span className="sb-section">My Account</span>
            <a href="/seeker/messages" className="sb-item" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span className="sb-ico">💬</span>Messages
              </span>
              {unreadMessages > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 99, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Browse Homes</b></div>
            </div>
            <div className="tb-right">
              <a href="/seeker/messages" className="tb-msg-btn">
                💬{unreadMessages > 0 && <span className="tb-msg-dot" />}
              </a>
              <a href="/seeker/saved" className="tb-msg-btn" title="Saved">
                {savedIds.size > 0 ? '❤️' : '🤍'}
              </a>
            </div>
          </div>

          <div className="sk-content">
            {/* ── HERO ── */}
            <div className="hero">
              <div className="hero-title">Find your <em>perfect</em> home</div>
              <div className="hero-sub">Browse verified listings from trusted landlords across the country</div>
              <div className="search-bar">
                <div className="search-input-wrap">
                  <span className="search-icon">🔍</span>
                  <input
                    className="search-input"
                    placeholder="Search by title, city, or description…"
                    value={filters.query}
                    onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && userId && loadListings(userId)}
                  />
                </div>
                <button
                  className={`filter-toggle-btn${(filters.city || filters.min_price || filters.max_price || filters.bedrooms !== 'Any' || filters.property_type !== 'All') ? ' active-filters' : ''}`}
                  onClick={() => setShowFilters(f => !f)}
                >
                  ⚡ Filters
                  {(filters.city || filters.min_price || filters.max_price || filters.bedrooms !== 'Any' || filters.property_type !== 'All') && (
                    <span style={{ background: '#2563EB', color: '#fff', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 800 }}>ON</span>
                  )}
                </button>
                <button className="search-btn" onClick={() => userId && loadListings(userId)}>Search</button>
              </div>
              <div className="hero-stats">
                <div className="hstat"><span className="hstat-num">{stats.total}</span><span className="hstat-lbl">listings</span></div>
                <div style={{ color: 'rgba(255,255,255,.15)', fontSize: 20 }}>·</div>
                <div className="hstat"><span className="hstat-num">{stats.cities}</span><span className="hstat-lbl">cities</span></div>
                <div style={{ color: 'rgba(255,255,255,.15)', fontSize: 20 }}>·</div>
                <div className="hstat"><span className="hstat-num">{fmtMoney(stats.avgRent)}</span><span className="hstat-lbl">avg/mo</span></div>
                <div style={{ color: 'rgba(255,255,255,.15)', fontSize: 20 }}>·</div>
                <div className="hstat"><span className="hstat-num">{savedIds.size}</span><span className="hstat-lbl">saved</span></div>
              </div>
            </div>

            {/* ── FILTER PANEL ── */}
            {showFilters && (
              <div className="filter-panel">
                <div className="fp-grid">
                  <div className="fp-field">
                    <label className="fp-label">City</label>
                    <select className="fp-select" value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}>
                      <option value="">All Cities</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="fp-field">
                    <label className="fp-label">Min Price</label>
                    <input className="fp-input" type="number" placeholder="0" value={filters.min_price} onChange={e => setFilters(f => ({ ...f, min_price: e.target.value }))} />
                  </div>
                  <div className="fp-field">
                    <label className="fp-label">Max Price</label>
                    <input className="fp-input" type="number" placeholder="Any" value={filters.max_price} onChange={e => setFilters(f => ({ ...f, max_price: e.target.value }))} />
                  </div>
                  <div className="fp-field">
                    <label className="fp-label">Bedrooms</label>
                    <select className="fp-select" value={filters.bedrooms} onChange={e => setFilters(f => ({ ...f, bedrooms: e.target.value }))}>
                      {BEDROOM_OPTIONS.map(b => <option key={b} value={b}>{b === 'Any' ? 'Any' : `${b} bed${b === '1' ? '' : 's'}`}</option>)}
                    </select>
                  </div>
                  <div className="fp-field">
                    <label className="fp-label">Type</label>
                    <select className="fp-select" value={filters.property_type} onChange={e => setFilters(f => ({ ...f, property_type: e.target.value }))}>
                      {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="fp-actions">
                  <button className="fp-clear" onClick={() => {
                    setFilters({ query: '', city: '', min_price: '', max_price: '', bedrooms: 'Any', property_type: 'All', tags: [], sort: 'newest' })
                  }}>Clear All</button>
                  <button className="fp-apply" onClick={() => { setShowFilters(false); userId && loadListings(userId) }}>Apply Filters</button>
                </div>
              </div>
            )}

            {/* ── TAG QUICK FILTERS ── */}
            <div className="tag-pills">
              <span className="tag-pill-lbl">Quick:</span>
              {POPULAR_TAGS.map(tag => (
                <button
                  key={tag}
                  className={`tag-pill${filters.tags.includes(tag) ? ' active' : ''}`}
                  onClick={() => {
                    setFilters(f => ({
                      ...f,
                      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
                    }))
                  }}
                >{tag}</button>
              ))}
              {filters.tags.length > 0 && (
                <button className="tag-pill" style={{ color: '#DC2626', borderColor: '#FECACA' }} onClick={() => setFilters(f => ({ ...f, tags: [] }))}>✕ Clear</button>
              )}
            </div>

            {/* ── TOOLBAR ── */}
            <div className="toolbar">
              <div className="tabs">
                <button className={`tab${activeTab === 'browse' ? ' active' : ''}`} onClick={() => setActiveTab('browse')}>
                  🏘️ Browse <span className="tc">{listings.length}</span>
                </button>
                <button className={`tab${activeTab === 'saved' ? ' active' : ''}`} onClick={() => setActiveTab('saved')}>
                  ❤️ Saved <span className="tc">{savedIds.size}</span>
                </button>
              </div>
              <div className="toolbar-right">
                <span className="results-lbl">{displayedListings.length} result{displayedListings.length !== 1 ? 's' : ''}</span>
                <select
                  className="sort-select"
                  value={filters.sort}
                  onChange={e => setFilters(f => ({ ...f, sort: e.target.value as Filters['sort'] }))}
                >
                  <option value="newest">Newest first</option>
                  <option value="price_asc">Price: Low → High</option>
                  <option value="price_desc">Price: High → Low</option>
                </select>
                <div className="view-btns">
                  <button className={`view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} title="Grid view">⊞</button>
                  <button className={`view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} title="List view">☰</button>
                </div>
              </div>
            </div>

            {/* ── LISTINGS GRID ── */}
            <div className={`listing-grid${view === 'list' ? ' list-view' : ''}`}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="lcard" style={{ cursor: 'default' }}>
                    <div className="skeleton" style={{ height: 180 }} />
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="skeleton" style={{ height: 11, width: '50%' }} />
                      <div className="skeleton" style={{ height: 14, width: '85%' }} />
                      <div className="skeleton" style={{ height: 11, width: '55%' }} />
                      <div className="skeleton" style={{ height: 22, width: '45%' }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div className="skeleton" style={{ height: 22, width: 65, borderRadius: 6 }} />
                        <div className="skeleton" style={{ height: 22, width: 65, borderRadius: 6 }} />
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
                        <div className="skeleton" style={{ height: 11, width: 80 }} />
                      </div>
                      <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 9 }} />
                    </div>
                  </div>
                ))
              ) : displayedListings.length === 0 ? (
                <div className="empty-state">
                  <div className="es-ico">{activeTab === 'saved' ? '🤍' : '🏘️'}</div>
                  <div className="es-title">{activeTab === 'saved' ? 'No saved listings yet' : 'No listings found'}</div>
                  <div className="es-sub">
                    {activeTab === 'saved'
                      ? 'Browse listings and tap the heart icon to save homes you love.'
                      : 'Try adjusting your search or filters to find more properties.'
                    }
                  </div>
                  {activeTab === 'saved'
                    ? <button className="es-btn" onClick={() => setActiveTab('browse')}>Browse Listings →</button>
                    : <button className="es-btn" onClick={() => { setFilters({ query: '', city: '', min_price: '', max_price: '', bedrooms: 'Any', property_type: 'All', tags: [], sort: 'newest' }) }}>Clear Filters</button>
                  }
                </div>
              ) : displayedListings.map((l, i) => (
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
                    {l.photos.length > 1 && (
                      <div className="lcard-photo-ct">📷 {l.photos.length}</div>
                    )}
                    <button
                      className={`lcard-save${savedIds.has(l.id) ? ' saved' : ''}`}
                      onClick={e => toggleSave(l.id, e)}
                      title={savedIds.has(l.id) ? 'Remove from saved' : 'Save listing'}
                    >
                      {savedIds.has(l.id) ? '❤️' : '🤍'}
                    </button>
                    {l.available_from && isAvailableSoon(l.available_from) && (
                      <div className="lcard-avail">Available soon</div>
                    )}
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
                    {l.description && view === 'list' && (
                      <div className="lcard-desc">{l.description}</div>
                    )}
                  </div>
                  <div className="lcard-footer">
                    <div className="lcard-landlord">
                      <div
                        className="lcard-ll-av"
                        style={{ background: AVATAR_GRADIENTS[l.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length] }}
                      >{l.landlord_initials}</div>
                      <span className="lcard-ll-name">{l.landlord_name}</span>
                    </div>
                    <button
                      className="lcard-contact"
                      onClick={e => contactLandlord(l.landlord_id, e)}
                    >💬 Contact</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
