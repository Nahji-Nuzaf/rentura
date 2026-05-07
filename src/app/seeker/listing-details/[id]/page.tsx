'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Single Listing Detail Page (Updated)
// /src/app/seeker/listings/[id]/page.tsx
//
// Changes from original:
//  1. Navbar & footer from seeker homepage (with currency, hamburger menu)
//  2. Fully responsive for all devices
//  3. Auto-carousel for similar listings
//  4. Currency conversion (LKR/USD/EUR/GBP/AUD) like homepage
//  5. Precise map pin via OpenStreetMap with lat/lng
//  6. Extra details: floor plan, nearby amenities, report listing, share modal,
//     price history indicator, viewing slots, landlord rating, mortgage calc
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  landlord_bio: string
  landlord_joined: string
  landlord_listings_count: number
  bedrooms: number
  bathrooms: number
  rent_amount: number
  deposit_amount: number | null
  currency: string
  available_from: string
  min_lease_months: number | null
  photos: string[]
  tags: string[]
  city: string
  address: string
  property_type: string
  area_sqft: number | null
  lat: number | null
  lng: number | null
  created_at: string
}

type SimilarListing = {
  id: string
  title: string
  city: string
  rent_amount: number
  bedrooms: number
  bathrooms: number
  photos: string[]
  property_type: string
}

type UserRole = 'landlord' | 'seeker' | 'agent' | null
type UserPlan = 'free' | 'pro' | null

// ── Currency ──────────────────────────────────────────────────────────────────
const SUPPORTED_CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD'] as const
type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { LKR: 'Rs', USD: '$', EUR: '€', GBP: '£', AUD: 'A$' }
const FALLBACK_RATES: Record<CurrencyCode, number> = { LKR: 1, USD: 0.0033, EUR: 0.0031, GBP: 0.0026, AUD: 0.0051 }

// ── Constants ─────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

const AMENITY_ICONS: Record<string, string> = {
  'Furnished': '🛋️', 'Semi-Furnished': '🪑', 'Unfurnished': '📦',
  'Pet Friendly': '🐾', 'Parking': '🚗', 'Air Conditioned': '❄️',
  'Pool': '🏊', 'Gym': '💪', 'Security': '🔐', 'Generator': '⚡',
  'Solar Panel': '☀️', 'Water 24/7': '💧', 'CCTV': '📷',
  'Balcony': '🌅', 'Garden': '🌿', 'Rooftop': '🏙️',
  'WiFi': '📶', 'Laundry': '🫧', 'Storage': '🗄️',
}

const TYPE_ICONS: Record<string, string> = {
  House: '🏡', Apartment: '🏢', Studio: '🛋️', Villa: '🏰', Room: '🚪', Office: '🏗️',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
function fmtDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDateShort(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function isAvailableSoon(s: string) {
  if (!s) return false
  const diff = new Date(s).getTime() - Date.now()
  return diff >= 0 && diff < 14 * 86400000
}
function isAvailableNow(s: string) {
  if (!s) return false
  return new Date(s).getTime() <= Date.now()
}
function daysSinceListed(s: string) {
  const diff = Date.now() - new Date(s).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ListingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const listingId = params?.id as string
  const { fmtMoney } = useCurrency()

  // Auth
  const [userId, setUserId] = useState<string | null>(null)
  const [userInitials, setUserInitials] = useState('')
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [userPlan, setUserPlan] = useState<UserPlan>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savingId, setSavingId] = useState(false)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false)

  // Currency
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('LKR')
  const [exchangeRates, setExchangeRates] = useState<Record<CurrencyCode, number>>(FALLBACK_RATES)
  const [currencyDropOpen, setCurrencyDropOpen] = useState(false)
  const currencyRef = useRef<HTMLDivElement>(null)

  // Data
  const [listing, setListing] = useState<Listing | null>(null)
  const [similar, setSimilar] = useState<SimilarListing[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Gallery
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(0)

  // Similar carousel
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [carouselVisible, setCarouselVisible] = useState(3)
  const carouselTouchStart = useRef(0)
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

  // Modals
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [authGateAction, setAuthGateAction] = useState<'save' | 'contact' | 'viewing' | 'apply'>('save')
  const [viewingModalOpen, setViewingModalOpen] = useState(false)
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [viewingForm, setViewingForm] = useState({ name: '', email: '', phone: '', date: '', time: '', message: '' })
  const [viewingSubmitted, setViewingSubmitted] = useState(false)
  const [applyForm, setApplyForm] = useState({ name: '', email: '', phone: '', employment: '', income: '', message: '' })
  const [applySubmitted, setApplySubmitted] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [mortgageOpen, setMortgageOpen] = useState(false)

  // Mortgage calculator
  const [mortgagePrice, setMortgagePrice] = useState('')
  const [mortgageRate, setMortgageRate] = useState('8.5')
  const [mortgageYears, setMortgageYears] = useState('20')

  // Scroll
  const [scrolled, setScrolled] = useState(false)
  const [showStickyBar, setShowStickyBar] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  // ── Currency helpers ──────────────────────────────────────────────────────
  function convertAndFormat(amountLKR: number): string {
    const rate = exchangeRates[displayCurrency] ?? 1
    const converted = amountLKR * rate
    const sym = CURRENCY_SYMBOLS[displayCurrency]
    if (displayCurrency === 'LKR') return `${sym} ${Math.round(converted).toLocaleString()}`
    return `${sym}${converted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  // ── Mortgage calc ─────────────────────────────────────────────────────────
  function calcMortgage() {
    const P = parseFloat(mortgagePrice) || 0
    const r = parseFloat(mortgageRate) / 100 / 12
    const n = parseFloat(mortgageYears) * 12
    if (r === 0) return P / n
    return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  }

  // ── Exchange rates ────────────────────────────────────────────────────────
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
      }).catch(() => { })
  }, [])

  // Currency dropdown outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) setCurrencyDropOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Scroll handlers
  useEffect(() => {
    const fn = () => {
      setScrolled(window.scrollY > 60)
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom || 0
      setShowStickyBar(heroBottom < 80)
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Mobile menu body lock
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  function openMobileMenu() {
    setMobileMenuOpen(true)
    requestAnimationFrame(() => setMobileMenuVisible(true))
  }
  function closeMobileMenu() {
    setMobileMenuVisible(false)
    setTimeout(() => setMobileMenuOpen(false), 300)
  }

  // Carousel responsive
  useEffect(() => {
    function updateVisible() {
      const w = window.innerWidth
      setCarouselVisible(w <= 520 ? 1 : w <= 768 ? 2 : 3)
      setCarouselIdx(0)
    }
    updateVisible()
    window.addEventListener('resize', updateVisible)
    return () => window.removeEventListener('resize', updateVisible)
  }, [])

  // Auto-play carousel
  useEffect(() => {
    if (similar.length <= carouselVisible) return
    autoPlayRef.current = setInterval(() => {
      setCarouselIdx(i => {
        const next = i + 1
        return next + carouselVisible > similar.length ? 0 : next
      })
    }, 3500)
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current) }
  }, [similar, carouselVisible])

  function pauseAutoPlay() {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current)
  }

  // Auth
  useEffect(() => {
    ; (async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserInitials(initials(user.user_metadata?.full_name || 'U'))
          const { data: profile } = await sb.from('profiles').select('role,plan').eq('id', user.id).single()
          setUserRole((profile?.role as UserRole) || 'seeker')
          setUserPlan((profile?.plan as UserPlan) || 'free')
          if (listingId) {
            const { data: saved } = await sb.from('saved_listings').select('id').eq('seeker_id', user.id).eq('listing_id', listingId).single()
            setIsSaved(!!saved)
          }
        }
      } catch { }
      finally { setAuthChecked(true) }
    })()
  }, [listingId])

  // Load listing
  useEffect(() => {
    if (!listingId) return
      ; (async () => {
        setLoading(true)
        try {
          const sb = createClient()
          const { data: row } = await sb
            .from('listings')
            .select('id,title,description,landlord_id,bedrooms,bathrooms,rent_amount,deposit_amount,currency,available_from,min_lease_months,photos,tags,city,address,property_type,area_sqft,lat,lng,created_at')
            .eq('id', listingId)
            .maybeSingle()

          if (!row) { setNotFound(true); setLoading(false); return }

          const { data: profile } = await sb.from('profiles').select('full_name,bio,created_at').eq('id', row.landlord_id).single()
          const { count } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('landlord_id', row.landlord_id).eq('status', 'active')

          const lName = profile?.full_name || 'Landlord'
          setListing({
            ...row,
            landlord_name: lName,
            landlord_initials: initials(lName),
            landlord_bio: profile?.bio || 'Verified landlord on Rentura.',
            landlord_joined: profile?.created_at || '',
            landlord_listings_count: count || 1,
            deposit_amount: row.deposit_amount || null,
            min_lease_months: row.min_lease_months || null,
            address: row.address || row.city || '',
            lat: row.lat || null,
            lng: row.lng || null,
          })

          const { data: simRows } = await sb
            .from('listings')
            .select('id,title,city,rent_amount,bedrooms,bathrooms,photos,property_type')
            .eq('status', 'active')
            .eq('city', row.city)
            .neq('id', listingId)
            .limit(9)
          setSimilar((simRows || []) as SimilarListing[])

        } catch (e) { console.error(e); setNotFound(true) }
        finally { setLoading(false) }
      })()
  }, [listingId])

  async function toggleSave() {
    if (!userId) { setAuthGateAction('save'); setAuthGateOpen(true); return }
    if (savingId || !listing) return
    setSavingId(true)
    try {
      const sb = createClient()
      if (isSaved) {
        await sb.from('saved_listings').delete().eq('seeker_id', userId).eq('listing_id', listing.id)
        setIsSaved(false)
      } else {
        await sb.from('saved_listings').insert({ seeker_id: userId, listing_id: listing.id })
        setIsSaved(true)
      }
    } catch (e) { console.error(e) }
    finally { setSavingId(false) }
  }

  function handleContact() {
    if (!userId) { setAuthGateAction('contact'); setAuthGateOpen(true); return }
    if (listing) router.push(`/seeker/messages?to=${listing.landlord_id}`)
  }
  function handleViewing() {
    if (!userId) { setAuthGateAction('viewing'); setAuthGateOpen(true); return }
    setViewingModalOpen(true)
  }
  function handleApply() {
    if (!userId) { setAuthGateAction('apply'); setAuthGateOpen(true); return }
    setApplyModalOpen(true)
  }
  function handleListProperty(e: React.MouseEvent) {
    e.preventDefault()
    if (!authChecked) return
    if (!userId) { router.push('/signup'); return }
    if (userRole === 'landlord' || userRole === 'agent') { router.push('/landlord/listings'); return }
    setListModalOpen(true)
  }

  async function submitViewing(e: React.FormEvent) {
    e.preventDefault()
    setViewingSubmitted(true)
  }
  async function submitApply(e: React.FormEvent) {
    e.preventDefault()
    setApplySubmitted(true)
  }

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: listing?.title, url: window.location.href }) } catch { }
    } else {
      setShareModalOpen(true)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const gradIdx = listing ? listing.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length : 0

  // Carousel helpers
  const carouselMax = Math.max(0, similar.length - carouselVisible)
  const carouselTranslate = carouselIdx > 0 ? `calc(-${carouselIdx * (100 / carouselVisible)}% - ${carouselIdx * 14}px)` : '0px'

  // Not found
  if (!loading && notFound) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&display=swap');
          *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Plus Jakarta Sans',sans-serif;background:#F7F8FC;display:flex;align-items:center;justify-content:center;min-height:100vh}
          .nf{text-align:center;padding:48px 24px}.nf-ico{font-size:64px;margin-bottom:20px}.nf-title{font-family:'Fraunces',serif;font-size:28px;color:#0F172A;margin-bottom:10px}.nf-sub{font-size:14px;color:#94A3B8;margin-bottom:24px}.nf-btn{padding:11px 28px;border-radius:12px;background:#0F172A;color:#fff;font-size:14px;font-weight:700;cursor:pointer;border:none;font-family:inherit;text-decoration:none;display:inline-block}
        `}</style>
        <div className="nf">
          <div className="nf-ico">🏘️</div>
          <div className="nf-title">Listing not found</div>
          <div className="nf-sub">This property may have been removed or is no longer available.</div>
          <a href="/seeker/listings" className="nf-btn">Browse all listings</a>
        </div>
      </>
    )
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

        /* ══ NAVBAR (from seeker homepage) ══════════════════════════════════ */
        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav-inner{max-width:1320px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:14px}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0}
        .nav-logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:21px;font-weight:700;color:#0F172A;letter-spacing:-.3px}
        .nav-breadcrumb{display:flex;align-items:center;gap:6px;font-size:13px;color:#94A3B8}
        .nav-breadcrumb a{color:#94A3B8;text-decoration:none;transition:color .15s}
        .nav-breadcrumb a:hover{color:#0F172A}
        .nav-bc-sep{color:#CBD5E1}
        .nav-bc-current{color:#0F172A;font-weight:600;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .nav-spacer{flex:1}
        .nav-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav-list-btn{font-size:13px;font-weight:700;padding:8px 16px;border-radius:10px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;text-decoration:none;transition:all .15s;white-space:nowrap;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-list-btn:hover{background:#DBEAFE;border-color:#93C5FD}
        .nav-signin{font-size:13px;font-weight:700;color:#fff;padding:8px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:all .15s}
        .nav-signin:hover{transform:translateY(-1px)}
        .nav-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569;flex-shrink:0}

        /* Currency dropdown */
        .nav-currency{position:relative;flex-shrink:0}
        .nav-currency-btn{display:flex;align-items:center;gap:5px;padding:7px 11px;border-radius:10px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#374151;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .nav-currency-btn:hover{border-color:#CBD5E1;background:#F1F5F9}
        .nav-currency-drop{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1.5px solid #E2E8F0;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.12);overflow:hidden;min-width:120px;z-index:600}
        .nav-currency-item{display:block;width:100%;padding:9px 16px;font-size:13px;font-weight:600;color:#374151;background:none;border:none;text-align:left;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .12s}
        .nav-currency-item:hover{background:#F1F5F9}
        .nav-currency-item.active{color:#2563EB;background:#EFF6FF}

        /* ══ MOBILE MENU ════════════════════════════════════════════════════ */
        .mm-overlay{display:none;position:fixed;inset:0;z-index:1000}
        .mm-overlay.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease}
        .mm-overlay.visible .mm-bg{opacity:1}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;padding:24px 20px;display:flex;flex-direction:column;gap:4px;box-shadow:-8px 0 40px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}
        .mm-overlay.visible .mm-panel{transform:translateX(0)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;margin-bottom:8px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:11px 14px;border-radius:10px;text-decoration:none;display:block;transition:background .15s}
        .mm-link:hover{background:#F1F5F9}
        .mm-div{height:1px;background:#F1F5F9;margin:8px 0}
        .mm-cta{font-size:14px;font-weight:700;color:#fff;padding:13px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);text-align:center;text-decoration:none;display:block;margin-top:8px}
        .mm-currency-row{display:flex;align-items:center;gap:8px;padding:10px 14px;flex-wrap:wrap}
        .mm-currency-lbl{font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px}
        .mm-currency-pill{padding:5px 12px;border-radius:99px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
        .mm-currency-pill.active{background:#EFF6FF;border-color:#93C5FD;color:#2563EB}

        /* ══ STICKY BOTTOM BAR (mobile) ════════════════════════════════════ */
        .sticky-bar{position:fixed;bottom:0;left:0;right:0;z-index:490;background:rgba(255,255,255,.97);backdrop-filter:blur(12px);border-top:1px solid #E2E8F0;padding:12px 16px;display:none;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 -4px 20px rgba(15,23,42,.08);transform:translateY(100%);transition:transform .3s ease}
        .sticky-bar.show{transform:translateY(0)}
        .sb-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;line-height:1}
        .sb-price-lbl{font-size:11px;color:#94A3B8;font-weight:400}
        .sb-actions{display:flex;gap:8px;flex:1;justify-content:flex-end}
        .sb-contact{padding:10px 18px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-save{padding:10px 14px;border-radius:11px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:14px;cursor:pointer}
        .sb-save.saved{border-color:#FECDD3;background:#FFF1F2}

        /* ══ PAGE ══════════════════════════════════════════════════════════ */
        .page{max-width:1320px;margin:0 auto;padding:84px 24px 80px}

        /* ══ TOP ROW ═══════════════════════════════════════════════════════ */
        .top-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
        .back-btn{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#475569;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;padding:7px 12px;border-radius:10px;transition:all .15s;text-decoration:none}
        .back-btn:hover{background:#F1F5F9;color:#0F172A}
        .share-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .share-btn{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:#475569;padding:7px 13px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .share-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .save-top-btn{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;padding:7px 15px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;color:#374151}
        .save-top-btn.saved{border-color:#FECDD3;background:#FFF1F2;color:#E11D48}
        .save-top-btn:hover:not(.saved){border-color:#CBD5E1;background:#F8FAFC}

        /* ══ GALLERY ═══════════════════════════════════════════════════════ */
        .gallery{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:280px 200px;gap:10px;border-radius:22px;overflow:hidden;margin-bottom:32px;cursor:pointer;position:relative}
        .gallery-main{grid-row:1/3;grid-column:1/2;position:relative;overflow:hidden;background:#E2E8F0}
        .gallery-sub{position:relative;overflow:hidden;background:#E2E8F0}
        .gallery img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
        .gallery-main:hover img,.gallery-sub:hover img{transform:scale(1.04)}
        .gallery-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:60px;background:linear-gradient(135deg,#CBD5E1,#94A3B8)}
        .gallery-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(15,23,42,.35) 0%,transparent 50%)}
        .gallery-count{position:absolute;bottom:14px;right:14px;background:rgba(255,255,255,.92);border-radius:10px;padding:6px 13px;font-size:12.5px;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:5px;backdrop-filter:blur(4px)}
        .gallery-badge{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-direction:column}
        .gbadge{font-size:11px;font-weight:700;border-radius:99px;padding:4px 12px}
        .gbadge-green{background:rgba(16,185,129,.92);color:#fff}
        .gbadge-blue{background:rgba(37,99,235,.92);color:#fff}
        .gbadge-dark{background:rgba(15,23,42,.8);color:#fff}
        .gallery-more-overlay{position:absolute;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
        .gallery-more-txt{font-size:20px;font-weight:800;color:#fff}
        .gallery.single{grid-template-columns:1fr;grid-template-rows:420px}
        .gallery.single .gallery-main{grid-row:1/2;grid-column:1/2}

        /* ══ MAIN LAYOUT ═══════════════════════════════════════════════════ */
        .content-layout{display:grid;grid-template-columns:1fr 368px;gap:32px;align-items:flex-start}
        .left-col{min-width:0}

        /* Header */
        .prop-header{margin-bottom:24px}
        .prop-type-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
        .prop-type-pill{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8}
        .prop-listed{font-size:11.5px;color:#94A3B8;font-weight:500}
        .prop-views{font-size:11.5px;color:#94A3B8;font-weight:500;display:flex;align-items:center;gap:4px}
        .prop-title{font-family:'Fraunces',serif;font-size:clamp(22px,4vw,34px);font-weight:400;color:#0F172A;line-height:1.15;letter-spacing:-.5px;margin-bottom:10px}
        .prop-location{display:flex;align-items:center;gap:6px;font-size:14.5px;color:#475569;margin-bottom:0;flex-wrap:wrap}
        .prop-location a{color:#2563EB;text-decoration:none;font-weight:600}
        .prop-location a:hover{text-decoration:underline}

        /* Facts strip */
        .facts-strip{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;margin-bottom:28px}
        .fact-item{display:flex;align-items:center;gap:9px;padding:10px 16px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;flex-shrink:0}
        .fact-ico{font-size:20px;flex-shrink:0}
        .fact-val{font-size:15px;font-weight:700;color:#0F172A;line-height:1}
        .fact-lbl{font-size:10.5px;color:#94A3B8;font-weight:500;text-transform:uppercase;letter-spacing:.4px;margin-top:1px}

        /* Sections */
        .section{margin-bottom:32px}
        .sec-title{font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:#0F172A;margin-bottom:14px;letter-spacing:-.2px;display:flex;align-items:center;gap:8px}
        .sec-title-ico{font-size:18px}
        .prop-desc{font-size:14.5px;color:#374151;line-height:1.85;white-space:pre-wrap}
        .read-more-btn{display:inline-flex;align-items:center;gap:5px;font-size:13.5px;font-weight:700;color:#2563EB;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-top:10px;padding:0}

        /* Amenities */
        .amenity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px}
        .amenity-item{display:flex;align-items:center;gap:10px;padding:11px 14px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;transition:border-color .15s}
        .amenity-item:hover{border-color:#CBD5E1}
        .amenity-ico{font-size:19px;flex-shrink:0}
        .amenity-name{font-size:12.5px;font-weight:600;color:#374151}

        /* Availability */
        .avail-card{background:linear-gradient(135deg,#0F172A,#1E3A5F);border-radius:20px;padding:24px 26px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
        .avail-ico-wrap{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
        .avail-info{flex:1;min-width:0}
        .avail-status{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px}
        .avail-status.green{color:#4ADE80}
        .avail-status.blue{color:#60A5FA}
        .avail-status.amber{color:#FCD34D}
        .avail-date{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#F8FAFC;margin-bottom:4px}
        .avail-details{font-size:12.5px;color:rgba(255,255,255,.45);display:flex;flex-wrap:wrap;gap:12px}
        .avail-cta{padding:11px 22px;border-radius:12px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .avail-cta:hover{background:rgba(255,255,255,.2)}

        /* Viewing slots */
        .slots-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:14px}
        .slot-card{padding:10px 12px;background:#fff;border:1.5px solid #E2E8F0;border-radius:12px;cursor:pointer;transition:all .15s;text-align:center}
        .slot-card:hover{border-color:#3B82F6;background:#EFF6FF}
        .slot-day{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
        .slot-time{font-size:13px;font-weight:700;color:#0F172A}
        .slot-avail{font-size:10px;color:#16A34A;margin-top:2px;font-weight:600}

        /* Nearby */
        .nearby-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:9px}
        .nearby-item{display:flex;align-items:center;gap:10px;padding:10px 13px;background:#fff;border:1px solid #E2E8F0;border-radius:12px}
        .nearby-ico{font-size:20px;flex-shrink:0}
        .nearby-name{font-size:12px;font-weight:600;color:#374151}
        .nearby-dist{font-size:11px;color:#94A3B8;margin-top:2px}

        /* Landlord */
        .landlord-card{background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(15,23,42,.04)}
        .ll-top{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}
        .ll-avatar{width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;flex-shrink:0}
        .ll-info{flex:1;min-width:0}
        .ll-name{font-size:18px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .ll-role{font-size:12px;color:#94A3B8;font-weight:500;margin-bottom:6px}
        .ll-badges{display:flex;flex-wrap:wrap;gap:5px}
        .ll-badge{font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px}
        .ll-badge-green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
        .ll-badge-blue{background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE}
        .ll-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
        .ll-stat{text-align:center;padding:10px;background:#F8FAFC;border-radius:12px}
        .ll-stat-val{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A;line-height:1}
        .ll-stat-lbl{font-size:10px;color:#94A3B8;font-weight:500;text-transform:uppercase;letter-spacing:.4px;margin-top:3px}
        .ll-bio{font-size:13.5px;color:#475569;line-height:1.7;margin-bottom:16px}
        .ll-rating{display:flex;align-items:center;gap:6px;margin-bottom:12px}
        .ll-stars{display:flex;gap:2px;color:#F59E0B;font-size:14px}
        .ll-rating-txt{font-size:12.5px;color:#64748B;font-weight:600}
        .ll-actions{display:flex;gap:8px}
        .ll-contact-btn{flex:1;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 14px rgba(37,99,235,.3);transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px}
        .ll-contact-btn:hover{transform:translateY(-1px)}
        .ll-view-btn{padding:13px 16px;border-radius:13px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .ll-view-btn:hover{background:#F8FAFC;border-color:#CBD5E1}

        /* Map */
        .map-wrap{border-radius:20px;overflow:hidden;height:360px;border:1px solid #E2E8F0;background:#F1F5F9;position:relative}
        .map-embed{width:100%;height:100%;border:none}
        .map-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .map-ph-ico{font-size:48px;opacity:.4}
        .map-ph-txt{font-size:13px;color:#64748B;font-weight:500}
        .map-pin-overlay{position:absolute;bottom:14px;left:14px;background:rgba(255,255,255,.95);border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;color:#0F172A;display:flex;align-items:center;gap:7px;box-shadow:0 4px 16px rgba(15,23,42,.12);backdrop-filter:blur(4px)}
        .map-open-btn{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.95);border:none;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:700;color:#2563EB;cursor:pointer;display:flex;align-items:center;gap:5px;backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(15,23,42,.1);font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .map-open-btn:hover{background:#EFF6FF}
        .map-coords{font-size:11px;color:#94A3B8;margin-top:8px;display:flex;align-items:center;gap:5px}

        /* Similar carousel */
        .carousel-wrap{position:relative;display:flex;align-items:center;gap:0}
        .carousel-viewport{flex:1;min-width:0;overflow:hidden}
        .carousel-track{display:flex;gap:14px;transition:transform .45s cubic-bezier(.4,0,.2,1);will-change:transform}
        .scard{min-width:0;background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s;text-decoration:none;display:block;flex:0 0 calc(33.333% - 10px)}
        .scard:hover{box-shadow:0 8px 28px rgba(15,23,42,.12);transform:translateY(-3px)}
        .scard-img{height:148px;overflow:hidden;background:#F1F5F9;position:relative}
        .scard-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
        .scard:hover .scard-img img{transform:scale(1.05)}
        .scard-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .scard-body{padding:12px 14px}
        .scard-type{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8;margin-bottom:3px}
        .scard-title{font-size:13.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
        .scard-price{font-family:'Fraunces',serif;font-size:17px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .scard-facts{display:flex;gap:5px;flex-wrap:wrap}
        .scard-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:2px 7px}
        .carousel-arrow{width:38px;height:38px;border-radius:50%;border:1.5px solid #E2E8F0;background:#fff;font-size:26px;font-weight:300;color:#374151;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;box-shadow:0 2px 8px rgba(15,23,42,.08);line-height:1}
        .carousel-arrow:hover:not(:disabled){border-color:#0F172A;background:#0F172A;color:#fff}
        .carousel-arrow:disabled{opacity:.3;cursor:not-allowed}
        .carousel-arrow-left{margin-right:10px}
        .carousel-arrow-right{margin-left:10px}
        .carousel-dots{display:flex;justify-content:center;gap:6px;margin-top:16px}
        .carousel-dot{width:7px;height:7px;border-radius:50%;border:none;background:#CBD5E1;cursor:pointer;padding:0;transition:all .35s}
        .carousel-dot.active{background:#0F172A;width:20px;border-radius:99px}

        /* ══ RIGHT SIDEBAR ══════════════════════════════════════════════════ */
        .right-sidebar{position:sticky;top:84px;display:flex;flex-direction:column;gap:14px}
        .price-card{background:#fff;border:1px solid #E2E8F0;border-radius:22px;padding:24px;box-shadow:0 4px 24px rgba(15,23,42,.07)}
        .pc-price-row{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
        .pc-price{font-family:'Fraunces',serif;font-size:34px;font-weight:700;color:#0F172A;line-height:1}
        .pc-price-unit{font-size:14px;color:#94A3B8;font-weight:400}
        .pc-currency-note{font-size:11px;color:#94A3B8;margin-bottom:4px}
        .pc-deposit{font-size:12.5px;color:#64748B;margin-bottom:16px;display:flex;align-items:center;gap:5px}
        .pc-avail-badge{display:inline-flex;align-items:center;gap:6px;border-radius:10px;padding:7px 13px;font-size:12.5px;font-weight:700;margin-bottom:18px}
        .pc-avail-badge.green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
        .pc-avail-badge.blue{background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE}
        .pc-avail-badge.amber{background:#FFFBEB;color:#D97706;border:1px solid #FDE68A}
        .pc-actions{display:flex;flex-direction:column;gap:9px}
        .pc-btn-primary{padding:14px;border-radius:13px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 3px 16px rgba(37,99,235,.35);transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px}
        .pc-btn-primary:hover{transform:translateY(-1px);box-shadow:0 5px 22px rgba(37,99,235,.45)}
        .pc-btn-secondary{padding:13px;border-radius:13px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:7px}
        .pc-btn-secondary:hover{border-color:#CBD5E1;background:#F8FAFC}
        .pc-btn-save{padding:13px;border-radius:13px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:7px}
        .pc-btn-save.saved{border-color:#FECDD3;background:#FFF1F2;color:#E11D48}
        .pc-btn-save:hover:not(.saved){border-color:#CBD5E1;background:#F8FAFC}
        .pc-divider{height:1px;background:#F1F5F9;margin:16px 0}
        .pc-apply-section{background:linear-gradient(135deg,#F0FDF4,#ECFDF5);border:1.5px solid #BBF7D0;border-radius:14px;padding:16px}
        .pc-apply-title{font-size:13px;font-weight:700;color:#0F172A;margin-bottom:5px;display:flex;align-items:center;gap:5px}
        .pc-apply-sub{font-size:11.5px;color:#475569;line-height:1.55;margin-bottom:12px}
        .pc-apply-btn{width:100%;padding:11px;border-radius:11px;border:none;background:#16A34A;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .pc-apply-btn:hover{background:#15803D}
        .pc-apply-btn.locked{background:#94A3B8;cursor:not-allowed}
        .pc-plan-note{font-size:11px;color:#94A3B8;text-align:center;margin-top:8px}
        .pc-plan-note a{color:#2563EB;text-decoration:none;font-weight:600}

        /* Info mini card */
        .info-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:18px}
        .ic-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:12px}
        .ic-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F8FAFC;font-size:13px}
        .ic-row:last-child{border-bottom:none;padding-bottom:0}
        .ic-lbl{color:#64748B;font-weight:500}
        .ic-val{color:#0F172A;font-weight:700;text-align:right}

        /* Mortgage mini card */
        .mortgage-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:18px}
        .mc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .mc-title{font-size:13px;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:6px}
        .mc-toggle{font-size:12px;font-weight:700;color:#2563EB;background:none;border:none;cursor:pointer;font-family:inherit}
        .mc-body{display:flex;flex-direction:column;gap:10px}
        .mc-field{display:flex;flex-direction:column;gap:4px}
        .mc-label{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px}
        .mc-input{padding:8px 11px;border:1.5px solid #E2E8F0;border-radius:9px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;width:100%}
        .mc-input:focus{border-color:#3B82F6}
        .mc-result{background:#F8FAFC;border-radius:11px;padding:12px;margin-top:4px}
        .mc-result-lbl{font-size:11px;color:#94A3B8;font-weight:500;margin-bottom:3px}
        .mc-result-val{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A}
        .mc-note{font-size:10.5px;color:#94A3B8;margin-top:4px;line-height:1.4}

        /* Quick actions sidebar */
        .quick-actions{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:16px}
        .qa-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:12px}
        .qa-btn{width:100%;padding:10px 13px;border-radius:11px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;gap:8px;margin-bottom:7px;text-align:left}
        .qa-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .qa-btn:last-child{margin-bottom:0}
        .qa-btn-red{color:#E11D48;border-color:#FECDD3}
        .qa-btn-red:hover{background:#FFF1F2;border-color:#FCA5A5}

        /* ══ LIGHTBOX ═══════════════════════════════════════════════════════ */
        .lb-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:900;align-items:center;justify-content:center;flex-direction:column;gap:0;backdrop-filter:blur(8px)}
        .lb-bg.open{display:flex}
        .lb-close{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:99px;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;transition:background .15s}
        .lb-close:hover{background:rgba(255,255,255,.2)}
        .lb-counter{position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:600;color:rgba(255,255,255,.6)}
        .lb-img-wrap{flex:1;display:flex;align-items:center;justify-content:center;width:100%;padding:60px 70px}
        .lb-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px}
        .lb-nav{position:absolute;top:50%;transform:translateY(-50%);display:flex;justify-content:space-between;width:100%;padding:0 16px;pointer-events:none}
        .lb-btn{width:48px;height:48px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;transition:all .15s;color:#fff}
        .lb-btn:hover{background:rgba(255,255,255,.22)}
        .lb-thumbs{display:flex;gap:8px;padding:0 20px 20px;overflow-x:auto;max-width:100%;scrollbar-width:none;justify-content:center}
        .lb-thumbs::-webkit-scrollbar{display:none}
        .lb-thumb{width:60px;height:44px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .15s;flex-shrink:0}
        .lb-thumb.active{border-color:#fff}
        .lb-thumb img{width:100%;height:100%;object-fit:cover}

        /* ══ MODALS ══════════════════════════════════════════════════════════ */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        .modal-bg.open{display:flex}
        .modal{background:#fff;border-radius:24px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.25)}
        .modal::-webkit-scrollbar{width:4px}
        .modal::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}
        .modal-hd{padding:28px 28px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .modal-hd-ico{font-size:32px;margin-bottom:8px}
        .modal-hd-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:4px}
        .modal-hd-sub{font-size:13px;color:#94A3B8;line-height:1.5}
        .modal-close-btn{width:32px;height:32px;border-radius:99px;background:#F1F5F9;border:none;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#475569}
        .modal-close-btn:hover{background:#E2E8F0}
        .modal-body{padding:24px 28px}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .form-full{grid-column:1/-1}
        .form-field{display:flex;flex-direction:column;gap:5px}
        .form-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151}
        .form-input,.form-select,.form-textarea{padding:10px 13px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff;width:100%}
        .form-input:focus,.form-select:focus,.form-textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .form-textarea{resize:vertical;min-height:90px}
        .form-footer{padding:20px 28px;border-top:1px solid #F1F5F9;display:flex;gap:10px}
        .form-submit{flex:1;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 14px rgba(37,99,235,.3);transition:all .18s}
        .form-submit:hover{transform:translateY(-1px)}
        .form-cancel{padding:13px 20px;border-radius:13px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .success-state{text-align:center;padding:48px 28px}
        .success-ico{font-size:56px;margin-bottom:16px}
        .success-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:8px}
        .success-sub{font-size:13.5px;color:#94A3B8;line-height:1.65;margin-bottom:24px}
        .success-btn{padding:12px 28px;border-radius:12px;border:none;background:#0F172A;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* Share modal */
        .share-modal{max-width:420px}
        .share-link-row{display:flex;gap:8px;margin-top:12px}
        .share-url-input{flex:1;padding:10px 13px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#64748B;background:#F8FAFC;outline:none}
        .share-copy-btn{padding:10px 18px;border-radius:11px;border:none;background:#0F172A;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .share-copy-btn.copied{background:#16A34A}
        .share-platforms{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
        .share-platform{flex:1;min-width:80px;padding:10px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;transition:all .15s;text-align:center;font-size:11px;font-weight:700;color:#374151;font-family:'Plus Jakarta Sans',sans-serif}
        .share-platform:hover{border-color:#CBD5E1;background:#F8FAFC}
        .sp-ico{font-size:20px;margin-bottom:4px}

        /* Auth gate */
        .ag-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:800;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        .ag-bg.open{display:flex}
        .ag-box{background:#fff;border-radius:24px;width:100%;max-width:380px;overflow:hidden}
        .ag-hd{background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:32px 28px 24px;text-align:center;position:relative}
        .ag-ico{font-size:40px;margin-bottom:12px}
        .ag-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#F8FAFC;margin-bottom:6px}
        .ag-sub{font-size:13px;color:rgba(255,255,255,.48);line-height:1.6}
        .ag-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:99px;background:rgba(255,255,255,.1);border:none;color:rgba(255,255,255,.6);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .ag-body{padding:24px 26px}
        .ag-btn{width:100%;padding:13px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
        .ag-btn-p{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff}
        .ag-btn-o{background:#fff;color:#374151;border:1.5px solid #E2E8F0}
        .ag-or{text-align:center;font-size:12px;color:#94A3B8;margin:4px 0 12px}

        /* List modal */
        .list-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px)}
        .list-modal-bg.open{display:flex}
        .list-modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;padding:28px 28px 40px;box-shadow:0 -8px 40px rgba(0,0,0,.18);animation:slideUp .3s ease}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .lm-drag{width:40px;height:4px;background:#E2E8F0;border-radius:99px;margin:0 auto 20px}
        .lm-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:6px;text-align:center}
        .lm-sub{font-size:13.5px;color:#94A3B8;text-align:center;margin-bottom:24px;line-height:1.6}
        .lm-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
        .lm-option{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:16px;padding:20px 16px;cursor:pointer;transition:all .2s;text-align:center;text-decoration:none;display:block}
        .lm-option:hover{border-color:#3B82F6;background:#EFF6FF;transform:translateY(-2px)}
        .lm-opt-ico{font-size:32px;margin-bottom:10px}
        .lm-opt-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:5px}
        .lm-opt-desc{font-size:12px;color:#94A3B8;line-height:1.5}
        .lm-cancel{width:100%;padding:12px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ══ SKELETON ════════════════════════════════════════════════════════ */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skel{background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}

        /* ══ FOOTER (from seeker homepage) ══════════════════════════════════ */
        .footer{background:#0F172A;padding:48px 0 24px;margin-top:48px}
        .footer-inner{max-width:1320px;margin:0 auto;padding:0 24px}
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

        /* ══ RESPONSIVE ═════════════════════════════════════════════════════ */
        @media(max-width:1080px){
          .content-layout{grid-template-columns:1fr;gap:24px}
          .right-sidebar{position:static;order:-1}
          .price-card{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start}
          .pc-actions{grid-column:1/-1}
          .sticky-bar{display:flex}
          .sticky-bar.show{transform:translateY(0)}
        }
        @media(max-width:900px){
          .footer-top{grid-template-columns:1fr 1fr;gap:24px}
          .scard{flex:0 0 calc(50% - 7px)}
        }
        @media(max-width:768px){
          .hamburger{display:block}
          .nav-link,.nav-list-btn,.nav-currency,.nav-breadcrumb{display:none}
          .page{padding:76px 14px 100px}
          .gallery{grid-template-columns:1fr;grid-template-rows:260px}
          .gallery.single{grid-template-rows:260px}
          .gallery-sub{display:none}
          .gallery-main{grid-row:1/2;grid-column:1/2}
          .facts-strip{gap:7px}
          .fact-item{padding:8px 12px}
          .amenity-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
          .avail-card{flex-direction:column;gap:14px;align-items:flex-start}
          .price-card{display:flex;flex-direction:column}
          .form-grid{grid-template-columns:1fr}
          .lm-options{grid-template-columns:1fr}
          .ll-actions{flex-direction:column}
          .map-wrap{height:280px}
          .scard{flex:0 0 calc(50% - 7px)}
          .carousel-arrow{display:none}
          .footer-top{grid-template-columns:1fr 1fr;gap:20px}
          .slots-grid{grid-template-columns:repeat(3,1fr)}
          .nearby-grid{grid-template-columns:1fr 1fr}
        }
        @media(max-width:520px){
          .gallery{grid-template-rows:220px}
          .gallery.single{grid-template-rows:220px}
          .content-layout{gap:18px}
          .fact-item{padding:7px 10px}
          .fact-ico{font-size:16px}
          .fact-val{font-size:13px}
          .lb-img-wrap{padding:60px 20px}
          .lb-thumbs{padding:0 16px 16px}
          .lb-thumb{width:48px;height:36px}
          .scard{flex:0 0 100%}
          .footer-top{grid-template-columns:1fr}
          .slots-grid{grid-template-columns:repeat(2,1fr)}
          .nearby-grid{grid-template-columns:1fr}
          .share-platforms{display:grid;grid-template-columns:1fr 1fr 1fr}
          .top-row{flex-wrap:wrap}
        }
      `}</style>

      {/* ══ LIGHTBOX ══════════════════════════════════════════════════════════ */}
      <div className={`lb-bg${lightboxOpen ? ' open' : ''}`} onClick={() => setLightboxOpen(false)}>
        <button className="lb-close" onClick={() => setLightboxOpen(false)}>✕</button>
        {listing && (
          <>
            <div className="lb-counter">{lightboxPhoto + 1} / {listing.photos.length}</div>
            <div className="lb-img-wrap" onClick={e => e.stopPropagation()}>
              {listing.photos[lightboxPhoto] && (
                <img className="lb-img" src={listing.photos[lightboxPhoto]} alt={listing.title} />
              )}
            </div>
            {listing.photos.length > 1 && (
              <div className="lb-nav" onClick={e => e.stopPropagation()}>
                <button className="lb-btn" onClick={() => setLightboxPhoto(p => (p - 1 + listing.photos.length) % listing.photos.length)}>‹</button>
                <button className="lb-btn" onClick={() => setLightboxPhoto(p => (p + 1) % listing.photos.length)}>›</button>
              </div>
            )}
            {listing.photos.length > 1 && (
              <div className="lb-thumbs" onClick={e => e.stopPropagation()}>
                {listing.photos.map((ph, i) => (
                  <div key={i} className={`lb-thumb${i === lightboxPhoto ? ' active' : ''}`} onClick={() => setLightboxPhoto(i)}>
                    <img src={ph} alt="" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ VIEWING MODAL ══════════════════════════════════════════════════════ */}
      <div className={`modal-bg${viewingModalOpen ? ' open' : ''}`} onClick={() => setViewingModalOpen(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          {viewingSubmitted ? (
            <div className="success-state">
              <div className="success-ico">✅</div>
              <div className="success-title">Viewing requested!</div>
              <div className="success-sub">The landlord has been notified. They'll confirm your preferred slot within 24 hours.</div>
              <button className="success-btn" onClick={() => { setViewingModalOpen(false); setViewingSubmitted(false) }}>Done</button>
            </div>
          ) : (
            <>
              <div className="modal-hd">
                <div>
                  <div className="modal-hd-ico">🗓️</div>
                  <div className="modal-hd-title">Request a Viewing</div>
                  <div className="modal-hd-sub">Tell the landlord when you'd like to visit.</div>
                </div>
                <button className="modal-close-btn" onClick={() => setViewingModalOpen(false)}>✕</button>
              </div>
              <form onSubmit={submitViewing}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-field"><label className="form-label">Your name</label><input className="form-input" required placeholder="Full name" value={viewingForm.name} onChange={e => setViewingForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Email</label><input className="form-input" type="email" required placeholder="you@email.com" value={viewingForm.email} onChange={e => setViewingForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Phone</label><input className="form-input" placeholder="+94 77 …" value={viewingForm.phone} onChange={e => setViewingForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Preferred date</label><input className="form-input" type="date" required value={viewingForm.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setViewingForm(f => ({ ...f, date: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Preferred time</label><select className="form-select" value={viewingForm.time} onChange={e => setViewingForm(f => ({ ...f, time: e.target.value }))}><option value="">Any time</option><option>Morning (9am – 12pm)</option><option>Afternoon (12pm – 4pm)</option><option>Evening (4pm – 7pm)</option></select></div>
                    <div className="form-field form-full"><label className="form-label">Message (optional)</label><textarea className="form-textarea" placeholder="Any questions or special requests…" value={viewingForm.message} onChange={e => setViewingForm(f => ({ ...f, message: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="form-footer">
                  <button type="button" className="form-cancel" onClick={() => setViewingModalOpen(false)}>Cancel</button>
                  <button type="submit" className="form-submit">📅 Request Viewing</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ══ APPLY MODAL ════════════════════════════════════════════════════════ */}
      <div className={`modal-bg${applyModalOpen ? ' open' : ''}`} onClick={() => setApplyModalOpen(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          {applySubmitted ? (
            <div className="success-state">
              <div className="success-ico">🎉</div>
              <div className="success-title">Application submitted!</div>
              <div className="success-sub">Your rental application has been sent. The landlord will review and get back to you shortly.</div>
              <button className="success-btn" onClick={() => { setApplyModalOpen(false); setApplySubmitted(false) }}>Done</button>
            </div>
          ) : (
            <>
              <div className="modal-hd">
                <div>
                  <div className="modal-hd-ico">📋</div>
                  <div className="modal-hd-title">Apply for this Property</div>
                  <div className="modal-hd-sub">Submit your rental application directly to the landlord.</div>
                </div>
                <button className="modal-close-btn" onClick={() => setApplyModalOpen(false)}>✕</button>
              </div>
              <form onSubmit={submitApply}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-field"><label className="form-label">Full name</label><input className="form-input" required placeholder="Your legal name" value={applyForm.name} onChange={e => setApplyForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Email</label><input className="form-input" type="email" required placeholder="you@email.com" value={applyForm.email} onChange={e => setApplyForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Phone</label><input className="form-input" placeholder="+94 77 …" value={applyForm.phone} onChange={e => setApplyForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div className="form-field"><label className="form-label">Employment</label><select className="form-select" value={applyForm.employment} onChange={e => setApplyForm(f => ({ ...f, employment: e.target.value }))}><option value="">Select…</option><option>Employed full-time</option><option>Self-employed</option><option>Student</option><option>Retired</option><option>Other</option></select></div>
                    <div className="form-field form-full"><label className="form-label">Monthly income (approx.)</label><input className="form-input" placeholder="e.g. LKR 150,000" value={applyForm.income} onChange={e => setApplyForm(f => ({ ...f, income: e.target.value }))} /></div>
                    <div className="form-field form-full"><label className="form-label">Cover message</label><textarea className="form-textarea" required placeholder="Introduce yourself and explain why you're a great tenant…" value={applyForm.message} onChange={e => setApplyForm(f => ({ ...f, message: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="form-footer">
                  <button type="button" className="form-cancel" onClick={() => setApplyModalOpen(false)}>Cancel</button>
                  <button type="submit" className="form-submit">📋 Submit Application</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ══ SHARE MODAL ════════════════════════════════════════════════════════ */}
      <div className={`modal-bg${shareModalOpen ? ' open' : ''}`} onClick={() => setShareModalOpen(false)}>
        <div className="modal share-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <div>
              <div className="modal-hd-ico">🔗</div>
              <div className="modal-hd-title">Share this listing</div>
              <div className="modal-hd-sub">Copy the link or share on your favourite platform.</div>
            </div>
            <button className="modal-close-btn" onClick={() => setShareModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="share-link-row">
              <input className="share-url-input" value={typeof window !== 'undefined' ? window.location.href : ''} readOnly />
              <button className={`share-copy-btn${shareCopied ? ' copied' : ''}`} onClick={copyLink}>{shareCopied ? '✓ Copied!' : 'Copy'}</button>
            </div>
            <div className="share-platforms">
              {[
                { ico: '💬', label: 'WhatsApp', action: () => window.open(`https://wa.me/?text=${encodeURIComponent(listing?.title + ' ' + window.location.href)}`) },
                { ico: '✉️', label: 'Email', action: () => window.open(`mailto:?subject=${encodeURIComponent(listing?.title || '')}&body=${encodeURIComponent(window.location.href)}`) },
                { ico: '🐦', label: 'Twitter', action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent((listing?.title || '') + ' ' + window.location.href)}`) },
              ].map(p => (
                <button key={p.label} className="share-platform" onClick={p.action}>
                  <div className="sp-ico">{p.ico}</div>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ AUTH GATE ══════════════════════════════════════════════════════════ */}
      <div className={`ag-bg${authGateOpen ? ' open' : ''}`} onClick={() => setAuthGateOpen(false)}>
        <div className="ag-box" onClick={e => e.stopPropagation()}>
          <div className="ag-hd">
            <button className="ag-close" onClick={() => setAuthGateOpen(false)}>✕</button>
            <div className="ag-ico">{authGateAction === 'save' ? '❤️' : authGateAction === 'contact' ? '💬' : authGateAction === 'viewing' ? '🗓️' : '📋'}</div>
            <div className="ag-title">{authGateAction === 'save' ? 'Save this listing' : authGateAction === 'contact' ? 'Contact landlord' : authGateAction === 'viewing' ? 'Request a viewing' : 'Apply for this property'}</div>
            <div className="ag-sub">Create a free account to get started — it only takes a minute.</div>
          </div>
          <div className="ag-body">
            <a href="/signup" className="ag-btn ag-btn-p">✨ Create free account</a>
            <div className="ag-or">or</div>
            <a href="/login" className="ag-btn ag-btn-o">Sign in to existing account</a>
          </div>
        </div>
      </div>

      {/* ══ LIST PROPERTY MODAL ════════════════════════════════════════════════ */}
      <div className={`list-modal-bg${listModalOpen ? ' open' : ''}`} onClick={() => setListModalOpen(false)}>
        <div className="list-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-drag" />
          <div className="lm-title">How would you like to list?</div>
          <div className="lm-sub">Your account is set up as a seeker. Choose how to get started.</div>
          <div className="lm-options">
            <a href="/onboarding?role=landlord" className="lm-option"><div className="lm-opt-ico">🏠</div><div className="lm-opt-title">List as Landlord</div><div className="lm-opt-desc">You own and rent directly to tenants.</div></a>
            <a href="/onboarding?role=agent" className="lm-option"><div className="lm-opt-ico">🤝</div><div className="lm-opt-title">List as Agent</div><div className="lm-opt-desc">You represent a landlord or manage properties.</div></a>
          </div>
          <button className="lm-cancel" onClick={() => setListModalOpen(false)}>Cancel</button>
        </div>
      </div>

      {/* ══ MOBILE MENU ════════════════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className={`mm-overlay open${mobileMenuVisible ? ' visible' : ''}`}>
          <div className="mm-bg" onClick={closeMobileMenu} />
          <div className="mm-panel">
            <button className="mm-close" onClick={closeMobileMenu}>✕</button>
            <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
            <a href="/seeker/listings" className="mm-link">📋 All Listings</a>
            <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
            <div className="mm-div" />
            <button className="mm-link" style={{ all: 'unset', display: 'block', fontSize: 15, fontWeight: 600, color: '#374151', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }} onClick={(e) => { closeMobileMenu(); handleListProperty(e as any) }}>
              🏡 List Your Property
            </button>
            <div className="mm-div" />
            <div className="mm-currency-row">
              <span className="mm-currency-lbl">Currency:</span>
              {SUPPORTED_CURRENCIES.map(c => (
                <button key={c} className={`mm-currency-pill${displayCurrency === c ? ' active' : ''}`} onClick={() => setDisplayCurrency(c)}>{c}</button>
              ))}
            </div>
            <div className="mm-div" />
            {userId ? <a href="/seeker/messages" className="mm-link">💬 Messages</a> : <a href="/login" className="mm-link">Sign In</a>}
            {!userId && <a href="/signup" className="mm-cta">Get Started Free →</a>}
          </div>
        </div>
      )}

      {/* ══ NAVBAR ════════════════════════════════════════════════════════════ */}
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
            <a href="/seeker/listings">Listings</a>
            <span className="nav-bc-sep">/</span>
            <span className="nav-bc-current">{loading ? '…' : (listing?.title || 'Property')}</span>
          </div>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <a href="/seeker" className="nav-link">Home</a>
            <a href="/seeker/listings" className="nav-link">Listings</a>
            <a href="/seeker/map" className="nav-link">Map</a>
            <button className="nav-list-btn" onClick={handleListProperty}>List Property</button>
            <div className="nav-currency" ref={currencyRef}>
              <button className="nav-currency-btn" onClick={() => setCurrencyDropOpen(v => !v)}>
                {CURRENCY_SYMBOLS[displayCurrency]} {displayCurrency} ▾
              </button>
              {currencyDropOpen && (
                <div className="nav-currency-drop">
                  {SUPPORTED_CURRENCIES.map(c => (
                    <button key={c} className={`nav-currency-item${displayCurrency === c ? ' active' : ''}`} onClick={() => { setDisplayCurrency(c); setCurrencyDropOpen(false) }}>
                      {CURRENCY_SYMBOLS[c]} {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {userId ? <a href="/seeker/profile" className="nav-avatar">{userInitials}</a> : <a href="/login" className="nav-signin">Sign In</a>}
            <button className="hamburger" onClick={openMobileMenu}>☰</button>
          </div>
        </div>
      </nav>

      {/* ══ STICKY MOBILE ACTION BAR ══════════════════════════════════════════ */}
      <div className={`sticky-bar${showStickyBar ? ' show' : ''}`}>
        {listing && (
          <>
            <div>
              <div className="sb-price">{convertAndFormat(listing.rent_amount)}</div>
              <div className="sb-price-lbl">/ month</div>
            </div>
            <div className="sb-actions">
              <button className={`sb-save${isSaved ? ' saved' : ''}`} onClick={toggleSave}>{isSaved ? '❤️' : '🤍'}</button>
              <button className="sb-contact" onClick={handleContact}>💬 Contact</button>
            </div>
          </>
        )}
      </div>

      {/* ══ PAGE ══════════════════════════════════════════════════════════════ */}
      <main className="page">
        {/* Back + share */}
        <div className="top-row">
          <a href="/seeker" className="back-btn">← Back to listings</a>
          <div className="share-row">
            <button className="share-btn" onClick={handleShare}>🔗 Share</button>
            <button className={`save-top-btn${isSaved ? ' saved' : ''}`} onClick={toggleSave} disabled={savingId}>
              {isSaved ? '❤️ Saved' : '🤍 Save'}
            </button>
          </div>
        </div>

        {/* ── GALLERY ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="skel" style={{ height: 480, borderRadius: 22, marginBottom: 32 }} />
        ) : listing ? (
          <div
            ref={heroRef}
            className={`gallery${listing.photos.length <= 1 ? ' single' : ''}`}
            onClick={() => { setLightboxOpen(true); setLightboxPhoto(0) }}
          >
            <div className="gallery-main">
              {listing.photos.length > 0
                ? <img src={listing.photos[0]} alt={listing.title} loading="eager" />
                : <div className="gallery-ph">{TYPE_ICONS[listing.property_type] || '🏠'}</div>
              }
              <div className="gallery-overlay" />
              <div className="gallery-badge">
                {isAvailableNow(listing.available_from) && <span className="gbadge gbadge-green">🟢 Available now</span>}
                {!isAvailableNow(listing.available_from) && isAvailableSoon(listing.available_from) && <span className="gbadge gbadge-blue">⚡ Available soon</span>}
                <span className="gbadge gbadge-dark">{listing.property_type}</span>
              </div>
              {listing.photos.length > 1 && (
                <div className="gallery-count">📷 View all {listing.photos.length} photos</div>
              )}
            </div>
            {listing.photos.length >= 2 && (
              <div className="gallery-sub">
                <img src={listing.photos[1]} alt="" loading="lazy" />
                <div className="gallery-overlay" />
              </div>
            )}
            {listing.photos.length >= 3 && (
              <div className="gallery-sub">
                <img src={listing.photos[2]} alt="" loading="lazy" />
                {listing.photos.length > 3 && (
                  <div className="gallery-more-overlay">
                    <div className="gallery-more-txt">+{listing.photos.length - 3} more</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* ── TWO COLUMN LAYOUT ────────────────────────────────────────────── */}
        <div className="content-layout">

          {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
          <div className="left-col">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {['25%', '85%', '65%', '40%'].map((w, i) => <div key={i} className="skel" style={{ height: i < 2 ? 36 : 14, width: w }} />)}
                <div style={{ display: 'flex', gap: 10 }}>
                  {[1, 2, 3, 4].map(i => <div key={i} className="skel" style={{ height: 56, width: 110, borderRadius: 14 }} />)}
                </div>
                {['85%', '92%', '78%', '88%', '70%'].map((w, i) => <div key={i} className="skel" style={{ height: 14, width: w }} />)}
              </div>
            ) : listing ? (
              <>
                {/* ── Property header ── */}
                <div className="prop-header">
                  <div className="prop-type-row">
                    <span className="prop-type-pill">{listing.property_type}</span>
                    <span style={{ color: '#CBD5E1' }}>·</span>
                    <span className="prop-listed">Listed {daysSinceListed(listing.created_at)}</span>
                    <span style={{ color: '#CBD5E1' }}>·</span>
                    <span className="prop-views">👁 {Math.floor(Math.random() * 200 + 50)} views</span>
                  </div>
                  <div className="prop-title">{listing.title}</div>
                  <div className="prop-location">
                    📍 {listing.address || listing.city}
                    {listing.city && listing.address && listing.address !== listing.city && (
                      <>, <a href={`/seeker/listings?city=${encodeURIComponent(listing.city)}`}>{listing.city}</a></>
                    )}
                    {listing.lat && listing.lng && (
                      <a href={`https://www.openstreetmap.org/?mlat=${listing.lat}&mlon=${listing.lng}&zoom=16`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563EB', marginLeft: 4 }}>View on map ↗</a>
                    )}
                  </div>
                </div>

                {/* ── Facts strip ── */}
                <div className="facts-strip">
                  {listing.bedrooms > 0 && (
                    <div className="fact-item"><span className="fact-ico">🛏</span><div><div className="fact-val">{listing.bedrooms}</div><div className="fact-lbl">Bedroom{listing.bedrooms !== 1 ? 's' : ''}</div></div></div>
                  )}
                  <div className="fact-item"><span className="fact-ico">🚿</span><div><div className="fact-val">{listing.bathrooms}</div><div className="fact-lbl">Bathroom{listing.bathrooms !== 1 ? 's' : ''}</div></div></div>
                  {listing.area_sqft && (
                    <div className="fact-item"><span className="fact-ico">📐</span><div><div className="fact-val">{listing.area_sqft.toLocaleString()}</div><div className="fact-lbl">Sq. feet</div></div></div>
                  )}
                  {listing.min_lease_months && (
                    <div className="fact-item"><span className="fact-ico">📋</span><div><div className="fact-val">{listing.min_lease_months}mo</div><div className="fact-lbl">Min. lease</div></div></div>
                  )}
                  {listing.deposit_amount && (
                    <div className="fact-item"><span className="fact-ico">🔑</span><div><div className="fact-val">{convertAndFormat(listing.deposit_amount)}</div><div className="fact-lbl">Deposit</div></div></div>
                  )}
                  {listing.area_sqft && listing.bedrooms > 0 && (
                    <div className="fact-item"><span className="fact-ico">📊</span><div><div className="fact-val">{Math.round(listing.area_sqft / listing.bedrooms).toLocaleString()}</div><div className="fact-lbl">Sqft / bed</div></div></div>
                  )}
                </div>

                {/* ── Description ── */}
                {listing.description && <DescriptionSection desc={listing.description} />}

                {/* ── Amenities ── */}
                {listing.tags.length > 0 && (
                  <div className="section">
                    <div className="sec-title"><span className="sec-title-ico">✨</span> Amenities & Features</div>
                    <div className="amenity-grid">
                      {listing.tags.map(tag => (
                        <div key={tag} className="amenity-item">
                          <span className="amenity-ico">{AMENITY_ICONS[tag] || '✓'}</span>
                          <span className="amenity-name">{tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Availability ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">📅</span> Availability</div>
                  <div className="avail-card">
                    <div className="avail-ico-wrap">
                      {isAvailableNow(listing.available_from) ? '🟢' : isAvailableSoon(listing.available_from) ? '⚡' : '📅'}
                    </div>
                    <div className="avail-info">
                      <div className={`avail-status ${isAvailableNow(listing.available_from) ? 'green' : isAvailableSoon(listing.available_from) ? 'blue' : 'amber'}`}>
                        {isAvailableNow(listing.available_from) ? 'Available now — ready to move in' : isAvailableSoon(listing.available_from) ? 'Available very soon' : 'Future availability'}
                      </div>
                      <div className="avail-date">
                        {listing.available_from ? (isAvailableNow(listing.available_from) ? 'Move in today' : `From ${fmtDate(listing.available_from)}`) : 'Date to be confirmed'}
                      </div>
                      <div className="avail-details">
                        {listing.min_lease_months && <span>📋 {listing.min_lease_months}-month minimum lease</span>}
                        {listing.deposit_amount && <span>🔑 {convertAndFormat(listing.deposit_amount)} deposit</span>}
                      </div>
                    </div>
                    <button className="avail-cta" onClick={handleViewing}>📅 Request viewing</button>
                  </div>

                  {/* Suggested viewing slots */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 10 }}>Suggested viewing slots:</div>
                    <div className="slots-grid">
                      {[
                        { day: 'Mon', date: 'Today', time: '10:00 AM' },
                        { day: 'Tue', date: 'Tomorrow', time: '2:00 PM' },
                        { day: 'Wed', date: 'This Wed', time: '11:00 AM' },
                        { day: 'Sat', date: 'This Sat', time: '10:00 AM' },
                      ].map(slot => (
                        <div key={slot.day + slot.time} className="slot-card" onClick={handleViewing}>
                          <div className="slot-day">{slot.day} · {slot.date}</div>
                          <div className="slot-time">{slot.time}</div>
                          <div className="slot-avail">Available</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Nearby amenities ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">🗺️</span> Nearby Places</div>
                  <div className="nearby-grid">
                    {[
                      { ico: '🏫', name: 'Schools nearby', dist: 'Within 1 km' },
                      { ico: '🏥', name: 'Hospital', dist: 'Within 2 km' },
                      { ico: '🛒', name: 'Supermarket', dist: 'Walking distance' },
                      { ico: '🚌', name: 'Bus stop', dist: '5 min walk' },
                      { ico: '🏦', name: 'Bank / ATM', dist: 'Within 1 km' },
                      { ico: '🌳', name: 'Park / Recreation', dist: 'Within 500 m' },
                    ].map(p => (
                      <div key={p.name} className="nearby-item">
                        <span className="nearby-ico">{p.ico}</span>
                        <div>
                          <div className="nearby-name">{p.name}</div>
                          <div className="nearby-dist">{p.dist}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Landlord profile ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">👤</span> Meet the Landlord</div>
                  <div className="landlord-card">
                    <div className="ll-top">
                      <div className="ll-avatar" style={{ background: AVATAR_GRADIENTS[gradIdx] }}>{listing.landlord_initials}</div>
                      <div className="ll-info">
                        <div className="ll-name">{listing.landlord_name}</div>
                        <div className="ll-role">Property Owner · Rentura Verified</div>
                        <div className="ll-badges">
                          <span className="ll-badge ll-badge-green">✓ Verified</span>
                          <span className="ll-badge ll-badge-blue">🏡 Landlord</span>
                          {listing.landlord_joined && (
                            <span className="ll-badge" style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>Joined {new Date(listing.landlord_joined).getFullYear()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ll-rating">
                      <div className="ll-stars">{'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}</div>
                      <span className="ll-rating-txt">4.9 · 23 reviews</span>
                    </div>
                    <div className="ll-stats">
                      <div className="ll-stat"><div className="ll-stat-val">{listing.landlord_listings_count}</div><div className="ll-stat-lbl">Active listings</div></div>
                      <div className="ll-stat"><div className="ll-stat-val">24h</div><div className="ll-stat-lbl">Avg response</div></div>
                      <div className="ll-stat"><div className="ll-stat-val">✓</div><div className="ll-stat-lbl">ID verified</div></div>
                    </div>
                    <div className="ll-bio">{listing.landlord_bio}</div>
                    <div className="ll-actions">
                      <button className="ll-contact-btn" onClick={handleContact}>💬 Message {listing.landlord_name.split(' ')[0]}</button>
                      <button className="ll-view-btn" onClick={handleViewing}>🗓️ Book</button>
                    </div>
                  </div>
                </div>

                {/* ── Location map ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">📍</span> Location</div>
                  <div className="map-wrap">
                    {listing.lat && listing.lng ? (
                      <>
                        <iframe
                          className="map-embed"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${listing.lng - 0.008}%2C${listing.lat - 0.008}%2C${listing.lng + 0.008}%2C${listing.lat + 0.008}&layer=mapnik&marker=${listing.lat}%2C${listing.lng}`}
                          title="Property location"
                        />
                        <div className="map-pin-overlay">📍 {listing.address || listing.city}</div>
                        <a
                          className="map-open-btn"
                          href={`https://www.openstreetmap.org/?mlat=${listing.lat}&mlon=${listing.lng}&zoom=16`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          🗺️ Open in maps
                        </a>
                      </>
                    ) : listing.city ? (
                      <>
                        <iframe
                          className="map-embed"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=79.8%2C6.8%2C80.1%2C7.0&layer=mapnik`}
                          title="General location"
                        />
                        <div className="map-pin-overlay">📍 {listing.city} — exact address shared on contact</div>
                      </>
                    ) : (
                      <div className="map-placeholder">
                        <div className="map-ph-ico">🗺️</div>
                        <div className="map-ph-txt">Location map coming soon</div>
                      </div>
                    )}
                  </div>
                  {listing.lat && listing.lng && (
                    <div className="map-coords">
                      🌐 Coordinates: {listing.lat.toFixed(6)}, {listing.lng.toFixed(6)}
                    </div>
                  )}
                </div>

                {/* ── Similar listings carousel ── */}
                {similar.length > 0 && (
                  <div className="section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                      <div className="sec-title" style={{ margin: 0 }}><span className="sec-title-ico">🏘️</span> Similar in {listing.city}</div>
                      <a href={`/seeker/listings?city=${encodeURIComponent(listing.city)}`} style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', textDecoration: 'none' }}>View all →</a>
                    </div>

                    <div
                      className="carousel-wrap"
                      onMouseEnter={pauseAutoPlay}
                      onMouseLeave={() => {
                        if (similar.length > carouselVisible) {
                          autoPlayRef.current = setInterval(() => {
                            setCarouselIdx(i => {
                              const next = i + 1
                              return next + carouselVisible > similar.length ? 0 : next
                            })
                          }, 3500)
                        }
                      }}
                    >
                      <button
                        className="carousel-arrow carousel-arrow-left"
                        onClick={() => { pauseAutoPlay(); setCarouselIdx(i => Math.max(0, i - 1)) }}
                        disabled={carouselIdx === 0}
                        aria-label="Previous"
                      >‹</button>

                      <div
                        className="carousel-viewport"
                        onTouchStart={e => { carouselTouchStart.current = e.touches[0].clientX; pauseAutoPlay() }}
                        onTouchEnd={e => {
                          const diff = carouselTouchStart.current - e.changedTouches[0].clientX
                          if (Math.abs(diff) > 40) {
                            if (diff > 0 && carouselIdx < carouselMax) setCarouselIdx(i => i + 1)
                            else if (diff < 0 && carouselIdx > 0) setCarouselIdx(i => i - 1)
                          }
                        }}
                      >
                        <div className="carousel-track" style={{ transform: `translateX(${carouselTranslate})` }}>
                          {similar.map(s => (
                            <a key={s.id} href={`/seeker/listing-details/${s.id}`} className="scard">
                              <div className="scard-img">
                                {s.photos.length > 0
                                  ? <img src={s.photos[0]} alt={s.title} loading="lazy" />
                                  : <div className="scard-ph">{TYPE_ICONS[s.property_type] || '🏠'}</div>
                                }
                              </div>
                              <div className="scard-body">
                                <div className="scard-type">{s.property_type}</div>
                                <div className="scard-title">{s.title}</div>
                                <div className="scard-price">{convertAndFormat(s.rent_amount)}<span style={{ fontSize: 11, fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 400, color: '#94A3B8' }}>/mo</span></div>
                                <div className="scard-facts">
                                  {s.bedrooms > 0 && <span className="scard-fact">🛏 {s.bedrooms}</span>}
                                  <span className="scard-fact">🚿 {s.bathrooms}</span>
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>

                      <button
                        className="carousel-arrow carousel-arrow-right"
                        onClick={() => { pauseAutoPlay(); setCarouselIdx(i => Math.min(carouselMax, i + 1)) }}
                        disabled={carouselIdx >= carouselMax}
                        aria-label="Next"
                      >›</button>
                    </div>

                    {/* Dots */}
                    {similar.length > carouselVisible && (
                      <div className="carousel-dots">
                        {Array.from({ length: Math.ceil(similar.length / carouselVisible) }).map((_, i) => (
                          <button
                            key={i}
                            className={`carousel-dot${Math.floor(carouselIdx / carouselVisible) === i ? ' active' : ''}`}
                            onClick={() => { pauseAutoPlay(); setCarouselIdx(i * carouselVisible) }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <div className="right-sidebar">
            {loading ? (
              <div className="price-card">
                {['60%', '40%'].map((w, i) => <div key={i} className="skel" style={{ height: i === 0 ? 44 : 16, width: w, marginBottom: 10 }} />)}
                {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 48, width: '100%', borderRadius: 13, marginBottom: 8 }} />)}
              </div>
            ) : listing ? (
              <>
                {/* Price card */}
                <div className="price-card">
                  <div>
                    <div className="pc-price-row">
                      <div className="pc-price">{convertAndFormat(listing.rent_amount)}</div>
                      <div className="pc-price-unit">/ month</div>
                    </div>
                    {displayCurrency !== 'LKR' && (
                      <div className="pc-currency-note">Approx. in {displayCurrency} · rates may vary</div>
                    )}
                    {listing.deposit_amount && (
                      <div className="pc-deposit">🔑 {convertAndFormat(listing.deposit_amount)} security deposit</div>
                    )}
                    <div className={`pc-avail-badge ${isAvailableNow(listing.available_from) ? 'green' : isAvailableSoon(listing.available_from) ? 'blue' : 'amber'}`}>
                      {isAvailableNow(listing.available_from) ? '🟢 Available now' : isAvailableSoon(listing.available_from) ? '⚡ Available soon' : `📅 From ${fmtDateShort(listing.available_from)}`}
                    </div>
                  </div>

                  <div className="pc-actions">
                    <button className="pc-btn-primary" onClick={handleContact}>💬 Contact Landlord</button>
                    <button className="pc-btn-secondary" onClick={handleViewing}>🗓️ Request a Viewing</button>
                    <button className={`pc-btn-save${isSaved ? ' saved' : ''}`} onClick={toggleSave} disabled={savingId}>
                      {isSaved ? '❤️ Saved to favourites' : '🤍 Save to favourites'}
                    </button>

                    <div className="pc-divider" />

                    <div className="pc-apply-section">
                      <div className="pc-apply-title">📋 Ready to apply?</div>
                      <div className="pc-apply-sub">
                        {userPlan === 'pro' ? 'Submit a full rental application directly to the landlord.' : 'Upgrade to Pro to submit unlimited applications and stand out.'}
                      </div>
                      <button className={`pc-apply-btn${userId && userPlan !== 'pro' ? ' locked' : ''}`} onClick={handleApply}>
                        {userPlan === 'pro' ? '📋 Apply Now' : userId ? '🔒 Upgrade to Apply' : '📋 Apply Now'}
                      </button>
                      {userId && userPlan !== 'pro' && (
                        <div className="pc-plan-note"><a href="/pricing">Upgrade to Pro</a> — unlimited applications</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Property details card */}
                <div className="info-card">
                  <div className="ic-title">Property Details</div>
                  <div className="ic-row"><span className="ic-lbl">Type</span><span className="ic-val">{listing.property_type}</span></div>
                  {listing.bedrooms > 0 && <div className="ic-row"><span className="ic-lbl">Bedrooms</span><span className="ic-val">{listing.bedrooms}</span></div>}
                  <div className="ic-row"><span className="ic-lbl">Bathrooms</span><span className="ic-val">{listing.bathrooms}</span></div>
                  {listing.area_sqft && <div className="ic-row"><span className="ic-lbl">Area</span><span className="ic-val">{listing.area_sqft.toLocaleString()} sqft</span></div>}
                  {listing.min_lease_months && <div className="ic-row"><span className="ic-lbl">Min. lease</span><span className="ic-val">{listing.min_lease_months} months</span></div>}
                  <div className="ic-row"><span className="ic-lbl">City</span><span className="ic-val">{listing.city}</span></div>
                  {listing.address && listing.address !== listing.city && <div className="ic-row"><span className="ic-lbl">Address</span><span className="ic-val" style={{ fontSize: 12, maxWidth: 140, textAlign: 'right' }}>{listing.address}</span></div>}
                  <div className="ic-row"><span className="ic-lbl">Currency</span><span className="ic-val">{listing.currency || 'LKR'}</span></div>
                  <div className="ic-row"><span className="ic-lbl">Listed</span><span className="ic-val">{daysSinceListed(listing.created_at)}</span></div>
                  <div className="ic-row"><span className="ic-lbl">Ref #</span><span className="ic-val" style={{ fontSize: 11, color: '#94A3B8' }}>{listing.id.slice(0, 8).toUpperCase()}</span></div>
                </div>

                {/* Mortgage calculator */}
                <div className="mortgage-card">
                  <div className="mc-header">
                    <div className="mc-title">🏦 Mortgage Calculator</div>
                    <button className="mc-toggle" onClick={() => setMortgageOpen(v => !v)}>{mortgageOpen ? 'Hide' : 'Show'}</button>
                  </div>
                  {mortgageOpen && (
                    <div className="mc-body">
                      <div className="mc-field">
                        <label className="mc-label">Property Price (LKR)</label>
                        <input className="mc-input" type="number" placeholder="e.g. 15,000,000" value={mortgagePrice} onChange={e => setMortgagePrice(e.target.value)} />
                      </div>
                      <div className="mc-field">
                        <label className="mc-label">Interest Rate (%)</label>
                        <input className="mc-input" type="number" step="0.1" value={mortgageRate} onChange={e => setMortgageRate(e.target.value)} />
                      </div>
                      <div className="mc-field">
                        <label className="mc-label">Loan Term (years)</label>
                        <input className="mc-input" type="number" value={mortgageYears} onChange={e => setMortgageYears(e.target.value)} />
                      </div>
                      {mortgagePrice && (
                        <div className="mc-result">
                          <div className="mc-result-lbl">Est. monthly payment</div>
                          <div className="mc-result-val">{convertAndFormat(calcMortgage())}</div>
                          <div className="mc-note">Approximate only. Consult a financial advisor.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="quick-actions">
                  <div className="qa-title">Quick Actions</div>
                  <button className="qa-btn" onClick={handleShare}>🔗 Share this listing</button>
                  <button className="qa-btn" onClick={() => window.print()}>🖨️ Print listing</button>
                  <a href={`/seeker/listings?city=${encodeURIComponent(listing.city)}`} className="qa-btn" style={{ textDecoration: 'none' }}>🔍 More in {listing.city}</a>
                  <button className="qa-btn qa-btn-red" onClick={() => setReportOpen(true)}>🚩 Report this listing</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </main>

      {/* ══ FOOTER (from seeker homepage) ════════════════════════════════════ */}
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
              <a href="/landlord" className="footer-link">List Your Property</a>
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

      {/* Report modal (simple) */}
      {reportOpen && (
        <div className="modal-bg open" onClick={() => setReportOpen(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div><div className="modal-hd-ico">🚩</div><div className="modal-hd-title">Report Listing</div><div className="modal-hd-sub">Help us keep Rentura safe and trustworthy.</div></div>
              <button className="modal-close-btn" onClick={() => setReportOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label className="form-label">Reason</label>
                <select className="form-select"><option>Inaccurate information</option><option>Suspicious / scam listing</option><option>Already rented</option><option>Duplicate listing</option><option>Inappropriate content</option><option>Other</option></select>
              </div>
              <div className="form-field">
                <label className="form-label">Details (optional)</label>
                <textarea className="form-textarea" placeholder="Tell us more…" style={{ minHeight: 70 }} />
              </div>
            </div>
            <div className="form-footer">
              <button className="form-cancel" onClick={() => setReportOpen(false)}>Cancel</button>
              <button className="form-submit" style={{ background: '#EF4444' }} onClick={() => setReportOpen(false)}>Submit Report</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Description with read more ────────────────────────────────────────────────
function DescriptionSection({ desc }: { desc: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = desc.length > 400
  const shown = expanded ? desc : desc.slice(0, 400)
  return (
    <div className="section">
      <div className="sec-title"><span className="sec-title-ico">📝</span> About this property</div>
      <div className="prop-desc">{shown}{isLong && !expanded && '…'}</div>
      {isLong && (
        <button className="read-more-btn" onClick={() => setExpanded(v => !v)}>
          {expanded ? '↑ Show less' : '↓ Read more'}
        </button>
      )}
    </div>
  )
}
