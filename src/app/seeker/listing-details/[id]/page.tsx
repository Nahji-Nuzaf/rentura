'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Single Listing Detail Page
// /src/app/seeker/listings/[id]/page.tsx
//
// Sections:
//  1. Hero image gallery (full-width mosaic + lightbox)
//  2. Sticky action sidebar: price, CTA buttons, save
//  3. Property facts strip
//  4. Full description
//  5. Amenities grid
//  6. Availability calendar banner
//  7. Landlord profile card
//  8. Location map embed (OpenStreetMap)
//  9. Similar listings strip
//
// Actions:
//  • Contact landlord (chat)
//  • Request viewing (form modal)
//  • Apply (plan-gated)
//  • Save property
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from 'react'
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

  // Data
  const [listing, setListing] = useState<Listing | null>(null)
  const [similar, setSimilar] = useState<SimilarListing[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Gallery
  const [activePhoto, setActivePhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(0)

  // Modals
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [authGateAction, setAuthGateAction] = useState<'save' | 'contact' | 'viewing' | 'apply'>('save')
  const [viewingModalOpen, setViewingModalOpen] = useState(false)
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [viewingForm, setViewingForm] = useState({ name: '', email: '', phone: '', date: '', time: '', message: '' })
  const [viewingSubmitted, setViewingSubmitted] = useState(false)
  const [applyForm, setApplyForm] = useState({ name: '', email: '', phone: '', employment: '', income: '', message: '' })
  const [applySubmitted, setApplySubmitted] = useState(false)

  // Sticky action bar
  const [scrolled, setScrolled] = useState(false)
  const [showStickyBar, setShowStickyBar] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = () => {
      setScrolled(window.scrollY > 60)
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom || 0
      setShowStickyBar(heroBottom < 80)
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Auth
  useEffect(() => {
    ;(async () => {
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
      } catch { /* guest */ }
      finally { setAuthChecked(true) }
    })()
  }, [listingId])

  // Load listing
  useEffect(() => {
    if (!listingId) return
    ;(async () => {
      setLoading(true)
      try {
        const sb = createClient()
        const { data: row, error } = await sb
          .from('listings')
          .select('id,title,description,landlord_id,bedrooms,bathrooms,rent_amount,deposit_amount,currency,available_from,min_lease_months,photos,tags,city,address,property_type,area_sqft,lat,lng,created_at')
          .eq('id', listingId)
          .single()

        if (error || !row) { setNotFound(true); setLoading(false); return }

        // Landlord profile
        const { data: profile } = await sb
          .from('profiles')
          .select('full_name,bio,created_at')
          .eq('id', row.landlord_id)
          .single()

        // Count landlord's other listings
        const { count } = await sb
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('landlord_id', row.landlord_id)
          .eq('status', 'active')

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

        // Similar listings
        const { data: simRows } = await sb
          .from('listings')
          .select('id,title,city,rent_amount,bedrooms,bathrooms,photos,property_type')
          .eq('status', 'active')
          .eq('city', row.city)
          .neq('id', listingId)
          .limit(6)
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
    // In production: insert into viewing_requests table
    setViewingSubmitted(true)
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault()
    // In production: insert into applications table
    setApplySubmitted(true)
  }

  const gradIdx = listing ? listing.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length : 0

  // ── Not found ──
  if (!loading && notFound) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,700;1,9..144,300;1,9..144,400&display=swap');
          *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Plus Jakarta Sans',sans-serif;background:#F7F8FC;display:flex;align-items:center;justify-content:center;min-height:100vh}
          .nf{text-align:center;padding:48px 24px}.nf-ico{font-size:64px;margin-bottom:20px}.nf-title{font-family:'Fraunces',serif;font-size:28px;font-weight:400;color:#0F172A;margin-bottom:10px}.nf-sub{font-size:14px;color:#94A3B8;margin-bottom:24px}.nf-btn{padding:11px 28px;border-radius:12px;background:#0F172A;color:#fff;font-size:14px;font-weight:700;cursor:pointer;border:none;font-family:inherit;text-decoration:none;display:inline-block}
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

        /* ══ NAVBAR ════════════════════════════════════════════════════════ */
        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav-inner{max-width:1320px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:14px}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0}
        .nav-logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:21px;font-weight:700;color:#0F172A;letter-spacing:-.3px}
        .nav-breadcrumb{display:flex;align-items:center;gap:6px;font-size:13px;color:#94A3B8}
        .nav-breadcrumb a{color:#94A3B8;text-decoration:none;transition:color .15s}
        .nav-breadcrumb a:hover{color:#0F172A}
        .nav-bc-sep{color:#CBD5E1}
        .nav-bc-current{color:#0F172A;font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .nav-spacer{flex:1}
        .nav-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav-list-btn{font-size:13px;font-weight:700;padding:8px 16px;border-radius:10px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;text-decoration:none;transition:all .15s;white-space:nowrap;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .nav-list-btn:hover{background:#DBEAFE}
        .nav-signin{font-size:13px;font-weight:700;color:#fff;padding:8px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);text-decoration:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:all .15s}
        .nav-signin:hover{transform:translateY(-1px)}
        .nav-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569}

        /* ══ STICKY BOTTOM BAR (mobile) ════════════════════════════════════ */
        .sticky-bar{position:fixed;bottom:0;left:0;right:0;z-index:490;background:rgba(255,255,255,.97);backdrop-filter:blur(12px);border-top:1px solid #E2E8F0;padding:12px 16px;display:none;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 -4px 20px rgba(15,23,42,.08);transform:translateY(100%);transition:transform .3s ease}
        .sticky-bar.show{transform:translateY(0)}
        .sb-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;line-height:1}
        .sb-price-lbl{font-size:11px;color:#94A3B8;font-weight:400;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-actions{display:flex;gap:8px;flex:1;justify-content:flex-end}
        .sb-contact{padding:10px 18px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3)}
        .sb-save{padding:10px 14px;border-radius:11px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:14px;cursor:pointer}
        .sb-save.saved{border-color:#FECDD3;background:#FFF1F2}

        /* ══ PAGE WRAPPER ══════════════════════════════════════════════════ */
        .page{max-width:1320px;margin:0 auto;padding:84px 24px 80px}

        /* ══ BACK + SHARE ROW ══════════════════════════════════════════════ */
        .top-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px}
        .back-btn{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#475569;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;padding:7px 12px;border-radius:10px;transition:all .15s;text-decoration:none}
        .back-btn:hover{background:#F1F5F9;color:#0F172A}
        .share-row{display:flex;align-items:center;gap:7px}
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
        .gallery-more-txt{font-size:20px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3)}
        /* Single photo fallback */
        .gallery.single{grid-template-columns:1fr;grid-template-rows:420px}
        .gallery.single .gallery-main{grid-row:1/2;grid-column:1/2}

        /* ══ MAIN LAYOUT ═══════════════════════════════════════════════════ */
        .content-layout{display:grid;grid-template-columns:1fr 368px;gap:32px;align-items:flex-start}

        /* ══ LEFT COLUMN ════════════════════════════════════════════════════ */
        .left-col{min-width:0}

        /* Header */
        .prop-header{margin-bottom:24px}
        .prop-type-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
        .prop-type-pill{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8}
        .prop-listed{font-size:11.5px;color:#94A3B8;font-weight:500}
        .prop-title{font-family:'Fraunces',serif;font-size:clamp(24px,4vw,36px);font-weight:400;color:#0F172A;line-height:1.15;letter-spacing:-.5px;margin-bottom:10px}
        .prop-title em{font-style:italic;color:#2563EB}
        .prop-location{display:flex;align-items:center;gap:6px;font-size:14.5px;color:#475569;margin-bottom:0}
        .prop-location a{color:#2563EB;text-decoration:none;font-weight:600}
        .prop-location a:hover{text-decoration:underline}

        /* Facts strip */
        .facts-strip{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;margin-bottom:28px}
        .fact-item{display:flex;align-items:center;gap:9px;padding:10px 16px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;flex-shrink:0}
        .fact-ico{font-size:20px;flex-shrink:0}
        .fact-val{font-size:15px;font-weight:700;color:#0F172A;line-height:1}
        .fact-lbl{font-size:10.5px;color:#94A3B8;font-weight:500;text-transform:uppercase;letter-spacing:.4px;margin-top:1px}

        /* Description */
        .section{margin-bottom:32px}
        .sec-title{font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:#0F172A;margin-bottom:14px;letter-spacing:-.2px;display:flex;align-items:center;gap:8px}
        .sec-title-ico{font-size:18px}
        .prop-desc{font-size:14.5px;color:#374151;line-height:1.85;white-space:pre-wrap}
        .read-more-btn{display:inline-flex;align-items:center;gap:5px;font-size:13.5px;font-weight:700;color:#2563EB;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-top:10px;padding:0;transition:opacity .15s}
        .read-more-btn:hover{opacity:.75}

        /* Amenities */
        .amenity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:9px}
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
        .avail-detail-item{display:flex;align-items:center;gap:5px}
        .avail-cta{padding:11px 22px;border-radius:12px;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;border:1.5px solid rgba(255,255,255,.2);transition:all .15s;white-space:nowrap}
        .avail-cta:hover{background:rgba(255,255,255,.2)}

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
        .ll-contact-btn{width:100%;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 14px rgba(37,99,235,.3);transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px}
        .ll-contact-btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(37,99,235,.4)}

        /* Map */
        .map-wrap{border-radius:20px;overflow:hidden;height:320px;border:1px solid #E2E8F0;background:#F1F5F9;position:relative}
        .map-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .map-ph-ico{font-size:48px;opacity:.4}
        .map-ph-txt{font-size:13px;color:#64748B;font-weight:500}
        .map-embed{width:100%;height:100%;border:none}
        .map-pin-overlay{position:absolute;bottom:14px;left:14px;background:rgba(255,255,255,.95);border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;color:#0F172A;display:flex;align-items:center;gap:7px;box-shadow:0 4px 16px rgba(15,23,42,.12);backdrop-filter:blur(4px)}

        /* Similar listings */
        .similar-strip{display:flex;gap:14px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}
        .similar-strip::-webkit-scrollbar{display:none}
        .scard{min-width:230px;max-width:230px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s;text-decoration:none;display:block;flex-shrink:0}
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

        /* ══ RIGHT SIDEBAR ══════════════════════════════════════════════════ */
        .right-sidebar{position:sticky;top:84px;display:flex;flex-direction:column;gap:14px}

        /* Price card */
        .price-card{background:#fff;border:1px solid #E2E8F0;border-radius:22px;padding:24px;box-shadow:0 4px 24px rgba(15,23,42,.07)}
        .pc-price-row{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
        .pc-price{font-family:'Fraunces',serif;font-size:36px;font-weight:700;color:#0F172A;line-height:1}
        .pc-price-unit{font-size:14px;color:#94A3B8;font-weight:400}
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

        /* ══ LIGHTBOX ═══════════════════════════════════════════════════════ */
        .lb-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:900;align-items:center;justify-content:center;flex-direction:column;gap:0;backdrop-filter:blur(8px)}
        .lb-bg.open{display:flex}
        .lb-close{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:99px;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;transition:background .15s}
        .lb-close:hover{background:rgba(255,255,255,.2)}
        .lb-counter{position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:600;color:rgba(255,255,255,.6)}
        .lb-img-wrap{flex:1;display:flex;align-items:center;justify-content:center;width:100%;padding:60px 70px}
        .lb-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
        .lb-nav{position:absolute;top:50%;transform:translateY(-50%);display:flex;justify-content:space-between;width:100%;padding:0 16px;pointer-events:none}
        .lb-btn{width:48px;height:48px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;transition:all .15s;color:#fff}
        .lb-btn:hover{background:rgba(255,255,255,.22)}
        .lb-thumbs{display:flex;gap:8px;padding:0 20px 20px;overflow-x:auto;max-width:100%;scrollbar-width:none;justify-content:center}
        .lb-thumbs::-webkit-scrollbar{display:none}
        .lb-thumb{width:60px;height:44px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .15s;flex-shrink:0}
        .lb-thumb.active{border-color:#fff}
        .lb-thumb img{width:100%;height:100%;object-fit:cover}

        /* ══ MODALS (Viewing / Apply) ════════════════════════════════════════ */
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

        /* ══ AUTH GATE ═══════════════════════════════════════════════════════ */
        .ag-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:800;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
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

        /* ══ LIST PROPERTY MODAL ════════════════════════════════════════════ */
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

        /* ══ MOBILE MENU ════════════════════════════════════════════════════ */
        .mm-overlay{display:none;position:fixed;inset:0;z-index:1000}
        .mm-overlay.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px)}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;padding:24px 20px;display:flex;flex-direction:column;gap:4px;box-shadow:-8px 0 40px rgba(0,0,0,.12)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;margin-bottom:8px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:11px 14px;border-radius:10px;text-decoration:none;display:block;transition:background .15s}
        .mm-link:hover{background:#F1F5F9}
        .mm-div{height:1px;background:#F1F5F9;margin:8px 0}
        .mm-cta{font-size:14px;font-weight:700;color:#fff;padding:13px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);text-align:center;text-decoration:none;display:block;margin-top:8px}

        /* ══ SKELETON ════════════════════════════════════════════════════════ */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skel{background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}

        /* ══ RESPONSIVE ═════════════════════════════════════════════════════ */
        @media(max-width:1080px){
          .content-layout{grid-template-columns:1fr;gap:24px}
          .right-sidebar{position:static;order:-1}
          .price-card{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start}
          .pc-actions{grid-column:1/-1}
          .sticky-bar{display:flex}
          .sticky-bar.show{transform:translateY(0)}
        }
        @media(max-width:768px){
          .hamburger{display:block}
          .nav-link,.nav-list-btn{display:none}
          .nav-breadcrumb{display:none}
          .page{padding:76px 14px 100px}
          .gallery{grid-template-columns:1fr;grid-template-rows:260px;grid-template-rows:260px}
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
          .top-row{flex-wrap:wrap;gap:10px}
          .share-row{flex-wrap:wrap}
          .ll-stats{grid-template-columns:repeat(3,1fr)}
          .lb-img-wrap{padding:60px 50px}
          .lb-btn{width:40px;height:40px;font-size:18px}
        }
        @media(max-width:480px){
          .gallery{grid-template-rows:220px}
          .gallery.single{grid-template-rows:220px}
          .content-layout{gap:18px}
          .fact-item{padding:7px 10px}
          .fact-ico{font-size:16px}
          .fact-val{font-size:13px}
          .lb-img-wrap{padding:60px 20px}
          .lb-thumbs{padding:0 16px 16px}
          .lb-thumb{width:48px;height:36px}
          .similar-strip .scard{min-width:200px;max-width:200px}
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
                    <div className="form-field">
                      <label className="form-label">Your name</label>
                      <input className="form-input" required placeholder="Full name" value={viewingForm.name} onChange={e => setViewingForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" required placeholder="you@email.com" value={viewingForm.email} onChange={e => setViewingForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Phone</label>
                      <input className="form-input" placeholder="+94 77 …" value={viewingForm.phone} onChange={e => setViewingForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Preferred date</label>
                      <input className="form-input" type="date" required value={viewingForm.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setViewingForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Preferred time</label>
                      <select className="form-select" value={viewingForm.time} onChange={e => setViewingForm(f => ({ ...f, time: e.target.value }))}>
                        <option value="">Any time</option>
                        <option>Morning (9am – 12pm)</option>
                        <option>Afternoon (12pm – 4pm)</option>
                        <option>Evening (4pm – 7pm)</option>
                      </select>
                    </div>
                    <div className="form-field form-full">
                      <label className="form-label">Message (optional)</label>
                      <textarea className="form-textarea" placeholder="Any questions or special requests for the landlord…" value={viewingForm.message} onChange={e => setViewingForm(f => ({ ...f, message: e.target.value }))} />
                    </div>
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
                    <div className="form-field">
                      <label className="form-label">Full name</label>
                      <input className="form-input" required placeholder="Your legal name" value={applyForm.name} onChange={e => setApplyForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" required placeholder="you@email.com" value={applyForm.email} onChange={e => setApplyForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Phone</label>
                      <input className="form-input" placeholder="+94 77 …" value={applyForm.phone} onChange={e => setApplyForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Employment status</label>
                      <select className="form-select" value={applyForm.employment} onChange={e => setApplyForm(f => ({ ...f, employment: e.target.value }))}>
                        <option value="">Select…</option>
                        <option>Employed full-time</option>
                        <option>Self-employed</option>
                        <option>Student</option>
                        <option>Retired</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="form-field form-full">
                      <label className="form-label">Monthly income (approx.)</label>
                      <input className="form-input" placeholder="e.g. LKR 150,000" value={applyForm.income} onChange={e => setApplyForm(f => ({ ...f, income: e.target.value }))} />
                    </div>
                    <div className="form-field form-full">
                      <label className="form-label">Cover message</label>
                      <textarea className="form-textarea" required placeholder="Introduce yourself and explain why you're a great tenant…" value={applyForm.message} onChange={e => setApplyForm(f => ({ ...f, message: e.target.value }))} />
                    </div>
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

      {/* ══ AUTH GATE ══════════════════════════════════════════════════════════ */}
      <div className={`ag-bg${authGateOpen ? ' open' : ''}`} onClick={() => setAuthGateOpen(false)}>
        <div className="ag-box" onClick={e => e.stopPropagation()}>
          <div className="ag-hd">
            <button className="ag-close" onClick={() => setAuthGateOpen(false)}>✕</button>
            <div className="ag-ico">
              {authGateAction === 'save' ? '❤️' : authGateAction === 'contact' ? '💬' : authGateAction === 'viewing' ? '🗓️' : '📋'}
            </div>
            <div className="ag-title">
              {authGateAction === 'save' ? 'Save this listing' : authGateAction === 'contact' ? 'Contact landlord' : authGateAction === 'viewing' ? 'Request a viewing' : 'Apply for this property'}
            </div>
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
            <a href="/onboarding?role=landlord" className="lm-option">
              <div className="lm-opt-ico">🏠</div>
              <div className="lm-opt-title">List as Landlord</div>
              <div className="lm-opt-desc">You own and rent directly to tenants.</div>
            </a>
            <a href="/onboarding?role=agent" className="lm-option">
              <div className="lm-opt-ico">🤝</div>
              <div className="lm-opt-title">List as Agent</div>
              <div className="lm-opt-desc">You represent a landlord or manage properties.</div>
            </a>
          </div>
          <button className="lm-cancel" onClick={() => setListModalOpen(false)}>Cancel</button>
        </div>
      </div>

      {/* ══ MOBILE MENU ════════════════════════════════════════════════════════ */}
      <div className={`mm-overlay${mobileMenuOpen ? ' open' : ''}`}>
        <div className="mm-bg" onClick={() => setMobileMenuOpen(false)} />
        <div className="mm-panel">
          <button className="mm-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
          <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
          <a href="/seeker/listings" className="mm-link">📋 All Listings</a>
          <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
          <div className="mm-div" />
          <button className="mm-link" style={{ all: 'unset', display: 'block', fontSize: 15, fontWeight: 600, color: '#374151', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }} onClick={(e) => { setMobileMenuOpen(false); handleListProperty(e as any) }}>
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
            <span style={{ color: '#CBD5E1' }}>/</span>
            <a href="/seeker">Browse</a>
            <span style={{ color: '#CBD5E1' }}>/</span>
            <a href="/seeker/listings">Listings</a>
            <span style={{ color: '#CBD5E1' }}>/</span>
            <span className="nav-bc-current">{loading ? '…' : (listing?.title || 'Property')}</span>
          </div>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <a href="/seeker/listings" className="nav-link">← All Listings</a>
            <button className="nav-list-btn" onClick={handleListProperty}>List Property</button>
            {userId
              ? <a href="/seeker" className="nav-avatar">{userInitials}</a>
              : <a href="/login" className="nav-signin">Sign In</a>
            }
            <button className="hamburger" onClick={() => setMobileMenuOpen(true)}>☰</button>
          </div>
        </div>
      </nav>

      {/* ══ STICKY MOBILE ACTION BAR ══════════════════════════════════════════ */}
      <div className={`sticky-bar${showStickyBar ? ' show' : ''}`}>
        {listing && (
          <>
            <div>
              <div className="sb-price">{fmtMoney(listing.rent_amount)}</div>
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
          <a href="/seeker/listings" className="back-btn">← Back to listings</a>
          <div className="share-row">
            <button className="share-btn" onClick={() => navigator.share?.({ title: listing?.title, url: window.location.href }).catch(() => {})}>
              🔗 Share
            </button>
            <button
              className={`save-top-btn${isSaved ? ' saved' : ''}`}
              onClick={toggleSave}
              disabled={savingId}
            >
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
              <div className="gallery-sub" style={{ position: 'relative' }}>
                <img src={listing.photos[1]} alt="" loading="lazy" />
                <div className="gallery-overlay" />
              </div>
            )}
            {listing.photos.length >= 3 && (
              <div className="gallery-sub" style={{ position: 'relative' }}>
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
              // Skeleton
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="skel" style={{ height: 14, width: '25%' }} />
                <div className="skel" style={{ height: 36, width: '85%' }} />
                <div className="skel" style={{ height: 36, width: '65%' }} />
                <div className="skel" style={{ height: 14, width: '40%', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  {[1,2,3,4].map(i => <div key={i} className="skel" style={{ height: 56, width: 110, borderRadius: 14 }} />)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {[1,2,3,4,5].map(i => <div key={i} className="skel" style={{ height: 14, width: `${80 + Math.random() * 15}%` }} />)}
                </div>
              </div>
            ) : listing ? (
              <>
                {/* ── Property header ── */}
                <div className="prop-header">
                  <div className="prop-type-row">
                    <span className="prop-type-pill">{listing.property_type}</span>
                    <span style={{ color: '#CBD5E1' }}>·</span>
                    <span className="prop-listed">Listed {daysSinceListed(listing.created_at)}</span>
                  </div>
                  <div className="prop-title">{listing.title}</div>
                  <div className="prop-location">
                    📍 {listing.address || listing.city}
                    {listing.city && listing.address && listing.address !== listing.city && (
                      <>, <a href={`/seeker/listings?city=${encodeURIComponent(listing.city)}`}>{listing.city}</a></>
                    )}
                  </div>
                </div>

                {/* ── Facts strip ── */}
                <div className="facts-strip">
                  {listing.bedrooms > 0 && (
                    <div className="fact-item">
                      <span className="fact-ico">🛏</span>
                      <div>
                        <div className="fact-val">{listing.bedrooms}</div>
                        <div className="fact-lbl">Bedroom{listing.bedrooms !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  )}
                  <div className="fact-item">
                    <span className="fact-ico">🚿</span>
                    <div>
                      <div className="fact-val">{listing.bathrooms}</div>
                      <div className="fact-lbl">Bathroom{listing.bathrooms !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  {listing.area_sqft && (
                    <div className="fact-item">
                      <span className="fact-ico">📐</span>
                      <div>
                        <div className="fact-val">{listing.area_sqft.toLocaleString()}</div>
                        <div className="fact-lbl">Sq. feet</div>
                      </div>
                    </div>
                  )}
                  {listing.min_lease_months && (
                    <div className="fact-item">
                      <span className="fact-ico">📋</span>
                      <div>
                        <div className="fact-val">{listing.min_lease_months}mo</div>
                        <div className="fact-lbl">Min. lease</div>
                      </div>
                    </div>
                  )}
                  {listing.deposit_amount && (
                    <div className="fact-item">
                      <span className="fact-ico">🔑</span>
                      <div>
                        <div className="fact-val">{fmtMoney(listing.deposit_amount)}</div>
                        <div className="fact-lbl">Deposit</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Description ── */}
                {listing.description && (
                  <DescriptionSection desc={listing.description} />
                )}

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
                        {listing.available_from
                          ? isAvailableNow(listing.available_from) ? 'Move in today' : `From ${fmtDate(listing.available_from)}`
                          : 'Date to be confirmed'
                        }
                      </div>
                      <div className="avail-details">
                        {listing.min_lease_months && (
                          <span className="avail-detail-item">📋 {listing.min_lease_months}-month minimum lease</span>
                        )}
                        {listing.deposit_amount && (
                          <span className="avail-detail-item">🔑 {fmtMoney(listing.deposit_amount)} deposit</span>
                        )}
                      </div>
                    </div>
                    <button className="avail-cta" onClick={handleViewing}>📅 Request viewing</button>
                  </div>
                </div>

                {/* ── Landlord profile ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">👤</span> Meet the Landlord</div>
                  <div className="landlord-card">
                    <div className="ll-top">
                      <div className="ll-avatar" style={{ background: AVATAR_GRADIENTS[gradIdx] }}>
                        {listing.landlord_initials}
                      </div>
                      <div className="ll-info">
                        <div className="ll-name">{listing.landlord_name}</div>
                        <div className="ll-role">Property Owner</div>
                        <div className="ll-badges">
                          <span className="ll-badge ll-badge-green">✓ Verified</span>
                          <span className="ll-badge ll-badge-blue">🏡 Landlord</span>
                          {listing.landlord_joined && (
                            <span className="ll-badge" style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                              Joined {new Date(listing.landlord_joined).getFullYear()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ll-stats">
                      <div className="ll-stat">
                        <div className="ll-stat-val">{listing.landlord_listings_count}</div>
                        <div className="ll-stat-lbl">Active listings</div>
                      </div>
                      <div className="ll-stat">
                        <div className="ll-stat-val">24h</div>
                        <div className="ll-stat-lbl">Avg response</div>
                      </div>
                      <div className="ll-stat">
                        <div className="ll-stat-val">✓</div>
                        <div className="ll-stat-lbl">ID verified</div>
                      </div>
                    </div>
                    <div className="ll-bio">{listing.landlord_bio}</div>
                    <button className="ll-contact-btn" onClick={handleContact}>
                      💬 Message {listing.landlord_name.split(' ')[0]}
                    </button>
                  </div>
                </div>

                {/* ── Location map ── */}
                <div className="section">
                  <div className="sec-title"><span className="sec-title-ico">🗺️</span> Location</div>
                  <div className="map-wrap">
                    {listing.lat && listing.lng ? (
                      <>
                        <iframe
                          className="map-embed"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${listing.lng - 0.01}%2C${listing.lat - 0.01}%2C${listing.lng + 0.01}%2C${listing.lat + 0.01}&layer=mapnik&marker=${listing.lat}%2C${listing.lng}`}
                          title="Property location"
                        />
                        <div className="map-pin-overlay">
                          📍 {listing.address || listing.city}
                        </div>
                      </>
                    ) : (
                      // Fallback: embed city-level OSM or show placeholder
                      listing.city ? (
                        <>
                          <iframe
                            className="map-embed"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=79.8%2C6.8%2C80.1%2C7.0&layer=mapnik`}
                            title="General location"
                          />
                          <div className="map-pin-overlay">
                            📍 {listing.city} — exact address shared on contact
                          </div>
                        </>
                      ) : (
                        <div className="map-placeholder">
                          <div className="map-ph-ico">🗺️</div>
                          <div className="map-ph-txt">Location map coming soon</div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* ── Similar listings ── */}
                {similar.length > 0 && (
                  <div className="section">
                    <div className="sec-title"><span className="sec-title-ico">🏘️</span> Similar in {listing.city}</div>
                    <div className="similar-strip">
                      {similar.map(s => (
                        <a key={s.id} href={`/seeker/listings/${s.id}`} className="scard">
                          <div className="scard-img">
                            {s.photos.length > 0
                              ? <img src={s.photos[0]} alt={s.title} loading="lazy" />
                              : <div className="scard-ph">{TYPE_ICONS[s.property_type] || '🏠'}</div>
                            }
                          </div>
                          <div className="scard-body">
                            <div className="scard-type">{s.property_type}</div>
                            <div className="scard-title">{s.title}</div>
                            <div className="scard-price">{fmtMoney(s.rent_amount)}<span style={{ fontSize: 11, fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 400, color: '#94A3B8' }}>/mo</span></div>
                            <div className="scard-facts">
                              {s.bedrooms > 0 && <span className="scard-fact">🛏 {s.bedrooms}</span>}
                              <span className="scard-fact">🚿 {s.bathrooms}</span>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <div className="right-sidebar">
            {loading ? (
              <div className="price-card">
                <div className="skel" style={{ height: 44, width: '60%', marginBottom: 10 }} />
                <div className="skel" style={{ height: 16, width: '40%', marginBottom: 16 }} />
                <div className="skel" style={{ height: 48, width: '100%', borderRadius: 13, marginBottom: 8 }} />
                <div className="skel" style={{ height: 48, width: '100%', borderRadius: 13, marginBottom: 8 }} />
                <div className="skel" style={{ height: 48, width: '100%', borderRadius: 13 }} />
              </div>
            ) : listing ? (
              <>
                {/* Price card */}
                <div className="price-card">
                  <div>
                    <div className="pc-price-row">
                      <div className="pc-price">{fmtMoney(listing.rent_amount)}</div>
                      <div className="pc-price-unit">/ month</div>
                    </div>
                    {listing.deposit_amount && (
                      <div className="pc-deposit">🔑 {fmtMoney(listing.deposit_amount)} security deposit</div>
                    )}
                    <div className={`pc-avail-badge ${isAvailableNow(listing.available_from) ? 'green' : isAvailableSoon(listing.available_from) ? 'blue' : 'amber'}`}>
                      {isAvailableNow(listing.available_from) ? '🟢 Available now' : isAvailableSoon(listing.available_from) ? '⚡ Available soon' : `📅 From ${fmtDateShort(listing.available_from)}`}
                    </div>
                  </div>

                  <div className="pc-actions">
                    <button className="pc-btn-primary" onClick={handleContact}>
                      💬 Contact Landlord
                    </button>
                    <button className="pc-btn-secondary" onClick={handleViewing}>
                      🗓️ Request a Viewing
                    </button>
                    <button className={`pc-btn-save${isSaved ? ' saved' : ''}`} onClick={toggleSave} disabled={savingId}>
                      {isSaved ? '❤️ Saved to favourites' : '🤍 Save to favourites'}
                    </button>

                    <div className="pc-divider" />

                    {/* Apply section */}
                    <div className="pc-apply-section">
                      <div className="pc-apply-title">📋 Ready to apply?</div>
                      <div className="pc-apply-sub">
                        {userPlan === 'pro'
                          ? 'Submit a full rental application directly to the landlord.'
                          : 'Upgrade to Pro to submit unlimited applications and stand out.'}
                      </div>
                      <button
                        className={`pc-apply-btn${userId && userPlan !== 'pro' ? ' locked' : ''}`}
                        onClick={handleApply}
                        title={userPlan !== 'pro' && userId ? 'Upgrade to Pro to apply' : ''}
                      >
                        {userPlan === 'pro' ? '📋 Apply Now' : userId ? '🔒 Upgrade to Apply' : '📋 Apply Now'}
                      </button>
                      {userId && userPlan !== 'pro' && (
                        <div className="pc-plan-note">
                          <a href="/pricing">Upgrade to Pro</a> — unlimited applications
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Property details mini card */}
                <div className="info-card">
                  <div className="ic-title">Property Details</div>
                  <div className="ic-row">
                    <span className="ic-lbl">Type</span>
                    <span className="ic-val">{listing.property_type}</span>
                  </div>
                  {listing.bedrooms > 0 && (
                    <div className="ic-row">
                      <span className="ic-lbl">Bedrooms</span>
                      <span className="ic-val">{listing.bedrooms}</span>
                    </div>
                  )}
                  <div className="ic-row">
                    <span className="ic-lbl">Bathrooms</span>
                    <span className="ic-val">{listing.bathrooms}</span>
                  </div>
                  {listing.area_sqft && (
                    <div className="ic-row">
                      <span className="ic-lbl">Area</span>
                      <span className="ic-val">{listing.area_sqft.toLocaleString()} sqft</span>
                    </div>
                  )}
                  {listing.min_lease_months && (
                    <div className="ic-row">
                      <span className="ic-lbl">Min. lease</span>
                      <span className="ic-val">{listing.min_lease_months} months</span>
                    </div>
                  )}
                  <div className="ic-row">
                    <span className="ic-lbl">City</span>
                    <span className="ic-val">{listing.city}</span>
                  </div>
                  <div className="ic-row">
                    <span className="ic-lbl">Listed</span>
                    <span className="ic-val">{daysSinceListed(listing.created_at)}</span>
                  </div>
                  <div className="ic-row">
                    <span className="ic-lbl">Ref #</span>
                    <span className="ic-val" style={{ fontSize: 11, color: '#94A3B8' }}>{listing.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </>
  )
}

// ── Description with read more ─────────────────────────────────────────────────
function DescriptionSection({ desc }: { desc: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = desc.length > 400
  const shown = expanded ? desc : desc.slice(0, 400)

  return (
    <div className="section">
      <div className="sec-title"><span className="sec-title-ico">📝</span> About this property</div>
      <div className="prop-desc">
        {shown}{isLong && !expanded && '…'}
      </div>
      {isLong && (
        <button className="read-more-btn" onClick={() => setExpanded(v => !v)}>
          {expanded ? '↑ Show less' : '↓ Read more'}
        </button>
      )}
    </div>
  )
}
