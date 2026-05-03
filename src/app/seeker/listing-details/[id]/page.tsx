'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Rentura — Seeker Listing Details Page
// Route: /app/seeker/listing-details/[id]/page.tsx
//
// Full detail view: photo gallery, all facts, description, amenities,
// landlord card, contact CTA, similar listings, and application flow.
// Same design system as seeker/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

// ── Types ─────────────────────────────────────────────────────────────────────
type Listing = {
  id: string
  title: string
  description: string
  property_id: string
  unit_id: string
  landlord_id: string
  landlord_name: string
  landlord_initials: string
  landlord_email: string
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

type SimilarListing = {
  id: string
  title: string
  city: string
  rent_amount: number
  bedrooms: number
  bathrooms: number
  photos: string[]
  property_type: string
  area_sqft: number | null
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
  return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function isAvailableSoon(s: string) {
  if (!s) return false
  const diff = new Date(s).getTime() - Date.now()
  return diff >= 0 && diff < 14 * 86400000
}

const TAG_ICONS: Record<string, string> = {
  'Air Conditioned': '❄️', 'Parking': '🚗', 'Furnished': '🛋️',
  'Pet Friendly': '🐾', 'Pool': '🏊', 'Gym': '🏋️', 'Solar Panel': '☀️',
  'Garden': '🌿', 'Security': '🔒', 'Internet': '📶', 'Laundry': '🫧', 'Balcony': '🏠',
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ListingDetails() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { fmtMoney } = useCurrency()

  // Auth / user state
  const [userId, setUserId] = useState('')
  const [userInitials, setUserInitials] = useState('ME')
  const [fullName, setFullName] = useState('Seeker')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Listing data
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Gallery
  const [activePhoto, setActivePhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)

  // Similar listings
  const [similar, setSimilar] = useState<SimilarListing[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)

  // Application modal
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyMsg, setApplyMsg] = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

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

  // ── Load Listing ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !userId) return
    ;(async () => {
      setLoading(true)
      const sb = createClient()
      const { data: row, error } = await sb
        .from('listings')
        .select('id,title,description,property_id,unit_id,landlord_id,bedrooms,bathrooms,rent_amount,currency,available_from,status,photos,tags,city,property_type,area_sqft')
        .eq('id', id)
        .single()

      if (error || !row) { setNotFound(true); setLoading(false); return }

      // Landlord
      let lName = 'Landlord'; let lEmail = ''
      if (row.landlord_id) {
        const { data: p } = await sb.from('profiles').select('full_name,email').eq('id', row.landlord_id).single()
        if (p) { lName = p.full_name || 'Landlord'; lEmail = p.email || '' }
      }

      setListing({
        id: row.id, title: row.title || 'Untitled', description: row.description || '',
        property_id: row.property_id || '', unit_id: row.unit_id || '',
        landlord_id: row.landlord_id || '', landlord_name: lName,
        landlord_initials: initials(lName), landlord_email: lEmail,
        bedrooms: row.bedrooms || 0, bathrooms: row.bathrooms || 1,
        rent_amount: row.rent_amount || 0, currency: row.currency || 'USD',
        available_from: row.available_from || '', status: row.status || 'active',
        photos: row.photos || [], tags: row.tags || [],
        city: row.city || '', property_type: row.property_type || 'House',
        area_sqft: row.area_sqft || null, saved: savedIds.has(row.id),
      })

      // Load similar
      setSimilarLoading(true)
      const { data: simRows } = await sb
        .from('listings')
        .select('id,title,city,rent_amount,bedrooms,bathrooms,photos,property_type,area_sqft')
        .eq('status', 'active')
        .eq('property_type', row.property_type)
        .neq('id', id)
        .limit(4)
      setSimilar(simRows || [])
      setSimilarLoading(false)

      setLoading(false)
    })()
  }, [id, userId])

  // ── Save / Unsave ─────────────────────────────────────────────────────────────
  async function toggleSave(e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!userId || !listing || savingId) return
    setSavingId(listing.id)
    try {
      const sb = createClient()
      const already = savedIds.has(listing.id)
      if (already) {
        await sb.from('saved_listings').delete().eq('seeker_id', userId).eq('listing_id', listing.id)
        setSavedIds(prev => { const s = new Set(prev); s.delete(listing.id); return s })
      } else {
        await sb.from('saved_listings').insert({ seeker_id: userId, listing_id: listing.id })
        setSavedIds(prev => new Set([...prev, listing.id]))
      }
    } catch (e) { console.error(e) }
    finally { setSavingId(null) }
  }

  // ── Contact landlord ──────────────────────────────────────────────────────────
  function contactLandlord() {
    if (listing) router.push(`/seeker/messages?to=${listing.landlord_id}`)
  }

  // ── Apply ─────────────────────────────────────────────────────────────────────
  async function submitApplication() {
    if (!listing || !userId || applying) return
    setApplying(true)
    try {
      const sb = createClient()
      await sb.from('applications').insert({
        listing_id: listing.id, seeker_id: userId,
        landlord_id: listing.landlord_id, message: applyMsg,
        status: 'pending',
      })
      setApplied(true)
      setTimeout(() => setApplyOpen(false), 2000)
    } catch (e) { console.error(e) }
    finally { setApplying(false) }
  }

  // ── Keyboard nav ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (!listing) return
      if (e.key === 'ArrowRight') setLightboxIdx(i => (i + 1) % listing.photos.length)
      if (e.key === 'ArrowLeft') setLightboxIdx(i => (i - 1 + listing.photos.length) % listing.photos.length)
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, listing])

  const isSaved = listing ? savedIds.has(listing.id) : false

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
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .breadcrumb a{color:#94A3B8;text-decoration:none}.breadcrumb b{color:#0F172A;font-weight:700}
        .tb-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .tb-btn{position:relative;width:36px;height:36px;border-radius:10px;background:#F8FAFC;border:1.5px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;text-decoration:none;transition:all .15s;flex-shrink:0}
        .tb-btn:hover{background:#EFF6FF;border-color:#BFDBFE}
        .tb-dot{position:absolute;top:4px;right:4px;width:8px;height:8px;background:#EF4444;border-radius:50%;border:1.5px solid #fff}

        /* ── CONTENT ── */
        .ld-content{padding:78px 24px 40px;max-width:1100px;margin:0 auto;width:100%}

        /* ── BACK + BREADCRUMB ── */
        .ld-back{display:inline-flex;align-items:center;gap:7px;color:#64748B;font-size:13px;font-weight:600;cursor:pointer;background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:18px;padding:7px 13px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;transition:all .15s}
        .ld-back:hover{background:#F8FAFC;border-color:#CBD5E1}

        /* ── GALLERY ── */
        .gallery-wrap{border-radius:20px;overflow:hidden;margin-bottom:28px;display:grid;grid-template-columns:1fr 320px;grid-template-rows:280px 140px;gap:6px;height:430px}
        .gallery-main{grid-row:1/3;position:relative;overflow:hidden;cursor:pointer;background:#E2E8F0}
        .gallery-main img{width:100%;height:100%;object-fit:cover;transition:transform .3s ease}
        .gallery-main:hover img{transform:scale(1.03)}
        .gallery-thumb{position:relative;overflow:hidden;cursor:pointer;background:#E2E8F0}
        .gallery-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .25s ease}
        .gallery-thumb:hover img{transform:scale(1.05)}
        .gallery-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:60px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .gallery-count-btn{position:absolute;bottom:14px;right:14px;background:rgba(15,23,42,.75);color:#fff;font-size:12px;font-weight:700;border-radius:99px;padding:5px 14px;cursor:pointer;border:none;font-family:'Plus Jakarta Sans',sans-serif;backdrop-filter:blur(4px);transition:background .15s}
        .gallery-count-btn:hover{background:rgba(15,23,42,.9)}
        .gallery-thumb-overlay{position:absolute;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;pointer-events:none}
        .gallery-save{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,.14);transition:transform .18s;backdrop-filter:blur(4px)}
        .gallery-save:hover{transform:scale(1.12)}

        /* ── LIGHTBOX ── */
        .lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:500;align-items:center;justify-content:center;flex-direction:column}
        .lightbox.open{display:flex}
        .lightbox img{max-width:88vw;max-height:80vh;border-radius:12px;object-fit:contain;box-shadow:0 24px 64px rgba(0,0,0,.4)}
        .lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:100%;display:flex;justify-content:space-between;padding:0 20px;pointer-events:none}
        .lb-btn{width:44px;height:44px;border-radius:99px;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;backdrop-filter:blur(4px);transition:all .15s}
        .lb-btn:hover{background:rgba(255,255,255,.22)}
        .lb-close{position:absolute;top:20px;right:20px;width:40px;height:40px;border-radius:99px;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .lb-counter{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.6);font-size:12.5px;font-weight:600}
        .lb-dots{display:flex;gap:5px;margin-top:16px}
        .lb-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.3);cursor:pointer;transition:all .2s}
        .lb-dot.active{background:#fff;width:16px;border-radius:99px}

        /* ── BODY GRID ── */
        .ld-body{display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start}

        /* ── MAIN COLUMN ── */
        .ld-main{}

        /* ── HEADER ── */
        .ld-header{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .ld-type-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .ld-type{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8}
        .ld-status-badge{font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:#DCFCE7;color:#16A34A}
        .ld-avail-badge{font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:#FEF9C3;color:#B45309}
        .ld-title{font-family:'Fraunces',serif;font-size:28px;font-weight:400;color:#0F172A;letter-spacing:-.5px;line-height:1.2;margin-bottom:6px}
        .ld-loc{font-size:13.5px;color:#64748B;display:flex;align-items:center;gap:5px;margin-bottom:18px}
        .ld-price-row{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .ld-price{font-family:'Fraunces',serif;font-size:34px;font-weight:700;color:#0F172A;line-height:1}
        .ld-price span{font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .ld-avail-date{font-size:12.5px;color:#64748B;font-weight:500;margin-top:4px}
        .ld-avail-date.soon{color:#16A34A;font-weight:700}

        /* ── KEY FACTS ── */
        .ld-facts{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:20px 24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .ld-facts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
        .ld-fact{display:flex;flex-direction:column;align-items:center;padding:14px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;text-align:center;transition:border .15s}
        .ld-fact:hover{border-color:#BFDBFE}
        .ld-fact-ico{font-size:20px;margin-bottom:6px}
        .ld-fact-val{font-size:15px;font-weight:800;color:#0F172A;margin-bottom:2px}
        .ld-fact-lbl{font-size:11px;color:#94A3B8;font-weight:500}

        /* ── SECTION ── */
        .ld-section{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:22px 24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .ld-sec-title{font-size:13px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
        .ld-sec-line{flex:1;height:1px;background:#F1F5F9}
        .ld-desc{font-size:14.5px;color:#374151;line-height:1.8}
        .ld-desc p{margin-bottom:10px}.ld-desc p:last-child{margin-bottom:0}
        .ld-read-more{display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:13px;color:#2563EB;font-weight:600;cursor:pointer;background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;padding:0}

        /* ── AMENITIES ── */
        .amenities-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
        .amenity{display:flex;align-items:center;gap:9px;padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:12.5px;font-weight:600;color:#374151;transition:all .15s}
        .amenity:hover{background:#EFF6FF;border-color:#BFDBFE;color:#2563EB}
        .amenity-ico{font-size:16px;flex-shrink:0}

        /* ── SIDEBAR ── */
        .ld-sidebar{display:flex;flex-direction:column;gap:14px;position:sticky;top:78px}

        /* ── CONTACT CARD ── */
        .contact-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:22px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .cc-price{font-family:'Fraunces',serif;font-size:30px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .cc-price span{font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .cc-avail{font-size:12px;color:#64748B;margin-bottom:18px}
        .cc-avail.soon{color:#16A34A;font-weight:600}
        .cc-btns{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
        .cc-apply-btn{width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 14px rgba(37,99,235,.32);transition:all .18s}
        .cc-apply-btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(37,99,235,.42)}
        .cc-apply-btn:disabled{opacity:.65;cursor:default;transform:none}
        .cc-contact-btn{width:100%;padding:11px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .cc-contact-btn:hover{background:#F8FAFC;border-color:#CBD5E1}
        .cc-save-btn{width:100%;padding:11px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#374151;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .cc-save-btn:hover{border-color:#FECDD3;background:#FFF1F2}
        .cc-save-btn.saved{border-color:#FECDD3;background:#FFF1F2;color:#E11D48}
        .cc-divider{border:none;border-top:1px solid #F1F5F9;margin:14px 0}
        .cc-landlord{display:flex;align-items:center;gap:12px}
        .cc-ll-av{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0}
        .cc-ll-name{font-size:14px;font-weight:700;color:#0F172A}
        .cc-ll-lbl{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .cc-share{display:flex;gap:8px;margin-top:14px}
        .cc-share-btn{flex:1;padding:8px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;transition:all .15s}
        .cc-share-btn:hover{background:#F8FAFC;border-color:#CBD5E1}

        /* ── FACTS SIDEBAR CARD ── */
        .info-card{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px}
        .info-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F1F5F9;font-size:13px}
        .info-row:last-child{border-bottom:none}
        .info-lbl{color:#64748B;font-weight:500}
        .info-val{color:#0F172A;font-weight:700}

        /* ── APPLY MODAL ── */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;align-items:center;justify-content:center;padding:20px}
        .modal-bg.open{display:flex}
        .apply-modal{background:#fff;border-radius:20px;width:100%;max-width:480px;padding:28px;box-shadow:0 24px 64px rgba(15,23,42,.2)}
        .am-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:6px}
        .am-sub{font-size:13.5px;color:#64748B;margin-bottom:20px;line-height:1.6}
        .am-label{font-size:11.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:block}
        .am-textarea{width:100%;padding:11px 13px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;resize:vertical;min-height:110px;transition:border .15s;line-height:1.6}
        .am-textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .am-footer{display:flex;gap:10px;margin-top:18px}
        .am-cancel{flex:1;padding:11px;border-radius:11px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .am-cancel:hover{background:#F8FAFC}
        .am-submit{flex:2;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3);transition:all .18s}
        .am-submit:hover{transform:translateY(-1px)}
        .am-submit:disabled{opacity:.65;cursor:default;transform:none}
        .am-success{text-align:center;padding:20px 0}
        .am-success-ico{font-size:44px;margin-bottom:10px}
        .am-success-title{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .am-success-sub{font-size:13.5px;color:#64748B}

        /* ── SIMILAR ── */
        .similar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:16px}
        .sim-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;cursor:pointer;transition:box-shadow .18s,transform .18s;text-decoration:none;color:inherit}
        .sim-card:hover{box-shadow:0 6px 22px rgba(15,23,42,.1);transform:translateY(-2px)}
        .sim-img{height:130px;background:#F1F5F9;overflow:hidden;position:relative}
        .sim-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
        .sim-card:hover .sim-img img{transform:scale(1.05)}
        .sim-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .sim-body{padding:12px 14px}
        .sim-type{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:3px}
        .sim-title{font-size:13px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sim-loc{font-size:11px;color:#94A3B8;margin-bottom:7px;display:flex;align-items:center;gap:3px}
        .sim-price{font-family:'Fraunces',serif;font-size:16px;font-weight:700;color:#0F172A}
        .sim-price span{font-size:11px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:500;color:#94A3B8}
        .sim-facts{display:flex;gap:5px;margin-top:6px}
        .sim-fact{font-size:10.5px;color:#64748B;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:5px;padding:2px 6px}

        /* ── NOT FOUND ── */
        .not-found{text-align:center;padding:100px 20px}
        .nf-ico{font-size:56px;margin-bottom:14px}
        .nf-title{font-size:20px;font-weight:700;color:#374151;margin-bottom:8px}
        .nf-sub{font-size:14px;color:#94A3B8;margin-bottom:22px}
        .nf-btn{padding:10px 24px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── LOADING ── */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:10px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        /* ── RESPONSIVE ── */
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sk-main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{left:0!important}
          .ld-content{padding:70px 14px 40px}
          .gallery-wrap{grid-template-columns:1fr;grid-template-rows:260px;height:260px}
          .gallery-main{grid-row:auto}
          .gallery-thumb{display:none}
          .ld-body{grid-template-columns:1fr}
          .ld-sidebar{position:static}
          .similar-grid{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:480px){
          .ld-title{font-size:22px}
          .ld-price{font-size:26px}
          .cc-price{font-size:24px}
          .similar-grid{grid-template-columns:1fr}
          .gallery-wrap{height:220px}
        }
      `}</style>

      {/* ── LIGHTBOX ── */}
      {listing && listing.photos.length > 0 && (
        <div className={`lightbox${lightboxOpen ? ' open' : ''}`} onClick={() => setLightboxOpen(false)}>
          <button className="lb-close" onClick={() => setLightboxOpen(false)}>✕</button>
          <img src={listing.photos[lightboxIdx]} alt={listing.title} onClick={e => e.stopPropagation()} />
          {listing.photos.length > 1 && (
            <div className="lb-nav" onClick={e => e.stopPropagation()}>
              <button className="lb-btn" onClick={() => setLightboxIdx(i => (i - 1 + listing.photos.length) % listing.photos.length)}>‹</button>
              <button className="lb-btn" onClick={() => setLightboxIdx(i => (i + 1) % listing.photos.length)}>›</button>
            </div>
          )}
          <div className="lb-dots" onClick={e => e.stopPropagation()}>
            {listing.photos.map((_, i) => (
              <div key={i} className={`lb-dot${i === lightboxIdx ? ' active' : ''}`} onClick={() => setLightboxIdx(i)} />
            ))}
          </div>
          <div className="lb-counter">{lightboxIdx + 1} / {listing.photos.length}</div>
        </div>
      )}

      {/* ── APPLY MODAL ── */}
      <div className={`modal-bg${applyOpen ? ' open' : ''}`} onClick={() => !applied && setApplyOpen(false)}>
        <div className="apply-modal" onClick={e => e.stopPropagation()}>
          {applied ? (
            <div className="am-success">
              <div className="am-success-ico">🎉</div>
              <div className="am-success-title">Application sent!</div>
              <div className="am-success-sub">The landlord will review your request and get back to you via messages.</div>
            </div>
          ) : (
            <>
              <div className="am-title">Apply for this home</div>
              <div className="am-sub">
                Send a message to <strong>{listing?.landlord_name}</strong> introducing yourself and explaining why this home is a great fit.
              </div>
              <label className="am-label">Your message</label>
              <textarea
                className="am-textarea"
                placeholder="Hi, I'm interested in renting this property. I'm a professional working nearby and can provide references…"
                value={applyMsg}
                onChange={e => setApplyMsg(e.target.value)}
              />
              <div className="am-footer">
                <button className="am-cancel" onClick={() => setApplyOpen(false)}>Cancel</button>
                <button className="am-submit" onClick={submitApplication} disabled={applying || !applyMsg.trim()}>
                  {applying ? 'Sending…' : '📩 Send Application'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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
                <a href="/seeker">Rentura</a>&nbsp;/&nbsp;
                <a href="/seeker/listings">Listings</a>&nbsp;/&nbsp;
                <b>{loading ? '…' : (listing?.title || 'Not found')}</b>
              </div>
            </div>
            <div className="tb-right">
              <a href="/seeker/messages" className="tb-btn">
                💬{unreadMessages > 0 && <span className="tb-dot" />}
              </a>
              <a href="/seeker/saved" className="tb-btn">{savedIds.size > 0 ? '❤️' : '🤍'}</a>
            </div>
          </div>

          <div className="ld-content">
            <button className="ld-back" onClick={() => router.back()}>← Back to listings</button>

            {loading ? (
              <>
                <div className="skeleton" style={{ height: 430, borderRadius: 20, marginBottom: 28 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />
                    <div className="skeleton" style={{ height: 140, borderRadius: 18 }} />
                    <div className="skeleton" style={{ height: 200, borderRadius: 18 }} />
                  </div>
                  <div className="skeleton" style={{ height: 400, borderRadius: 18 }} />
                </div>
              </>
            ) : notFound ? (
              <div className="not-found">
                <div className="nf-ico">🏚️</div>
                <div className="nf-title">Listing not found</div>
                <div className="nf-sub">This listing may have been removed or is no longer available.</div>
                <button className="nf-btn" onClick={() => router.push('/seeker/listings')}>Browse All Listings</button>
              </div>
            ) : listing ? (
              <>
                {/* ── GALLERY ── */}
                <div className="gallery-wrap">
                  <div className="gallery-main" onClick={() => { setLightboxIdx(0); setLightboxOpen(true) }}>
                    {listing.photos.length > 0
                      ? <img src={listing.photos[0]} alt={listing.title} />
                      : <div className="gallery-placeholder">🏠</div>}
                    <button className="gallery-save" onClick={e => { e.stopPropagation(); toggleSave() }}>
                      {isSaved ? '❤️' : '🤍'}
                    </button>
                    {listing.photos.length > 1 && (
                      <button className="gallery-count-btn" onClick={e => { e.stopPropagation(); setLightboxIdx(0); setLightboxOpen(true) }}>
                        📷 {listing.photos.length} photos
                      </button>
                    )}
                  </div>
                  {listing.photos[1] && (
                    <div className="gallery-thumb" onClick={() => { setLightboxIdx(1); setLightboxOpen(true) }}>
                      <img src={listing.photos[1]} alt="Photo 2" />
                    </div>
                  )}
                  {listing.photos[2] ? (
                    <div className="gallery-thumb" onClick={() => { setLightboxIdx(2); setLightboxOpen(true) }}>
                      <img src={listing.photos[2]} alt="Photo 3" />
                      {listing.photos.length > 3 && (
                        <div className="gallery-thumb-overlay">+{listing.photos.length - 3} more</div>
                      )}
                    </div>
                  ) : (
                    <div className="gallery-thumb" style={{ background: 'linear-gradient(135deg,#E2E8F0,#CBD5E1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                      🏘️
                    </div>
                  )}
                </div>

                {/* ── BODY ── */}
                <div className="ld-body">
                  {/* Left column */}
                  <div className="ld-main">
                    {/* Header */}
                    <div className="ld-header">
                      <div className="ld-type-row">
                        <span className="ld-type">{listing.property_type}</span>
                        <span className="ld-status-badge">Active</span>
                        {isAvailableSoon(listing.available_from) && (
                          <span className="ld-avail-badge">Available soon</span>
                        )}
                      </div>
                      <div className="ld-title">{listing.title}</div>
                      <div className="ld-loc">📍 {listing.city || 'Location not specified'}</div>
                      <div className="ld-price-row">
                        <div>
                          <div className="ld-price">{fmtMoney(listing.rent_amount)}<span> / month</span></div>
                          {listing.available_from && (
                            <div className={`ld-avail-date${isAvailableSoon(listing.available_from) ? ' soon' : ''}`}>
                              {isAvailableSoon(listing.available_from)
                                ? '🟢 Available soon — act fast!'
                                : `📅 Available from ${fmtDate(listing.available_from)}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Key Facts */}
                    <div className="ld-facts">
                      <div className="ld-facts-grid">
                        {listing.bedrooms > 0 && (
                          <div className="ld-fact">
                            <div className="ld-fact-ico">🛏</div>
                            <div className="ld-fact-val">{listing.bedrooms}</div>
                            <div className="ld-fact-lbl">Bedrooms</div>
                          </div>
                        )}
                        <div className="ld-fact">
                          <div className="ld-fact-ico">🚿</div>
                          <div className="ld-fact-val">{listing.bathrooms}</div>
                          <div className="ld-fact-lbl">Bathrooms</div>
                        </div>
                        {listing.area_sqft && (
                          <div className="ld-fact">
                            <div className="ld-fact-ico">📐</div>
                            <div className="ld-fact-val">{listing.area_sqft.toLocaleString()}</div>
                            <div className="ld-fact-lbl">Sq. Ft.</div>
                          </div>
                        )}
                        <div className="ld-fact">
                          <div className="ld-fact-ico">🏘️</div>
                          <div className="ld-fact-val" style={{ fontSize: 12 }}>{listing.property_type}</div>
                          <div className="ld-fact-lbl">Type</div>
                        </div>
                        {listing.area_sqft && listing.bedrooms > 0 && (
                          <div className="ld-fact">
                            <div className="ld-fact-ico">📊</div>
                            <div className="ld-fact-val">{Math.round(listing.area_sqft / listing.bedrooms).toLocaleString()}</div>
                            <div className="ld-fact-lbl">sqft / bed</div>
                          </div>
                        )}
                        <div className="ld-fact">
                          <div className="ld-fact-ico">💰</div>
                          <div className="ld-fact-val" style={{ fontSize: 12 }}>{listing.currency}</div>
                          <div className="ld-fact-lbl">Currency</div>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {listing.description && (
                      <div className="ld-section">
                        <div className="ld-sec-title">About this property <div className="ld-sec-line" /></div>
                        <div className="ld-desc">
                          {listing.description.split('\n').map((p, i) => <p key={i}>{p}</p>)}
                        </div>
                      </div>
                    )}

                    {/* Amenities */}
                    {listing.tags.length > 0 && (
                      <div className="ld-section">
                        <div className="ld-sec-title">Features & Amenities <div className="ld-sec-line" /></div>
                        <div className="amenities-grid">
                          {listing.tags.map(tag => (
                            <div key={tag} className="amenity">
                              <span className="amenity-ico">{TAG_ICONS[tag] || '✓'}</span>
                              {tag}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Similar Listings */}
                    <div className="ld-section">
                      <div className="ld-sec-title">Similar properties <div className="ld-sec-line" /></div>
                      {similarLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 14 }} />)}
                        </div>
                      ) : similar.length > 0 ? (
                        <div className="similar-grid">
                          {similar.map(s => (
                            <a key={s.id} className="sim-card" href={`/seeker/listing-details/${s.id}`}>
                              <div className="sim-img">
                                {s.photos.length > 0
                                  ? <img src={s.photos[0]} alt={s.title} loading="lazy" />
                                  : <div className="sim-placeholder">🏠</div>}
                              </div>
                              <div className="sim-body">
                                <div className="sim-type">{s.property_type}</div>
                                <div className="sim-title">{s.title}</div>
                                <div className="sim-loc">📍 {s.city}</div>
                                <div className="sim-price">{fmtMoney(s.rent_amount)}<span> /mo</span></div>
                                <div className="sim-facts">
                                  {s.bedrooms > 0 && <span className="sim-fact">🛏 {s.bedrooms}</span>}
                                  <span className="sim-fact">🚿 {s.bathrooms}</span>
                                  {s.area_sqft && <span className="sim-fact">📐 {s.area_sqft.toLocaleString()}</span>}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: '#94A3B8', fontSize: 13.5 }}>No similar listings found right now.</p>
                      )}
                    </div>
                  </div>

                  {/* ── RIGHT SIDEBAR ── */}
                  <div className="ld-sidebar">
                    {/* Contact / Apply Card */}
                    <div className="contact-card">
                      <div className="cc-price">{fmtMoney(listing.rent_amount)}<span> /mo</span></div>
                      <div className={`cc-avail${isAvailableSoon(listing.available_from) ? ' soon' : ''}`}>
                        {listing.available_from
                          ? isAvailableSoon(listing.available_from)
                            ? '🟢 Available soon'
                            : `📅 From ${fmtDate(listing.available_from)}`
                          : 'Contact for availability'}
                      </div>
                      <div className="cc-btns">
                        <button className="cc-apply-btn" onClick={() => setApplyOpen(true)}>
                          📩 Apply Now
                        </button>
                        <button className="cc-contact-btn" onClick={contactLandlord}>
                          💬 Message Landlord
                        </button>
                        <button className={`cc-save-btn${isSaved ? ' saved' : ''}`} onClick={() => toggleSave()}>
                          {isSaved ? '❤️ Saved' : '🤍 Save Listing'}
                        </button>
                      </div>
                      <hr className="cc-divider" />
                      <div className="cc-landlord">
                        <div className="cc-ll-av" style={{ background: AVATAR_GRADIENTS[listing.landlord_id.charCodeAt(0) % AVATAR_GRADIENTS.length] }}>
                          {listing.landlord_initials}
                        </div>
                        <div>
                          <div className="cc-ll-name">{listing.landlord_name}</div>
                          <div className="cc-ll-lbl">Property Owner</div>
                        </div>
                      </div>
                      <div className="cc-share">
                        <button className="cc-share-btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
                          🔗 Copy Link
                        </button>
                        <button className="cc-share-btn">
                          ↗ Share
                        </button>
                      </div>
                    </div>

                    {/* Quick Info */}
                    <div className="info-card">
                      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94A3B8', marginBottom: 10 }}>
                        Listing Details
                      </div>
                      <div className="info-row">
                        <span className="info-lbl">Property type</span>
                        <span className="info-val">{listing.property_type}</span>
                      </div>
                      {listing.bedrooms > 0 && (
                        <div className="info-row">
                          <span className="info-lbl">Bedrooms</span>
                          <span className="info-val">{listing.bedrooms}</span>
                        </div>
                      )}
                      <div className="info-row">
                        <span className="info-lbl">Bathrooms</span>
                        <span className="info-val">{listing.bathrooms}</span>
                      </div>
                      {listing.area_sqft && (
                        <div className="info-row">
                          <span className="info-lbl">Area</span>
                          <span className="info-val">{listing.area_sqft.toLocaleString()} sqft</span>
                        </div>
                      )}
                      <div className="info-row">
                        <span className="info-lbl">City</span>
                        <span className="info-val">{listing.city || '—'}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-lbl">Status</span>
                        <span className="info-val" style={{ color: '#16A34A' }}>Active</span>
                      </div>
                      {listing.available_from && (
                        <div className="info-row">
                          <span className="info-lbl">Available</span>
                          <span className="info-val">{fmtDate(listing.available_from)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
