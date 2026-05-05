'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useCurrency } from '@/lib/useCurrency'

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = {
  id: string
  full_name: string
  email: string
  phone: string
  avatar_url: string | null
  bio: string
  preferred_cities: string[]
  preferred_property_types: string[]
  min_budget: number | null
  max_budget: number | null
  min_bedrooms: number | null
  preferred_tags: string[]
  move_in_date: string
  created_at: string
}

type SavedListing = {
  id: string
  listing_id: string
  title: string
  city: string
  rent_amount: number
  currency: string
  property_type: string
  bedrooms: number
  bathrooms: number
  photos: string[]
  saved_at: string
}

type InquiryThread = {
  id: string
  landlord_name: string
  landlord_initials: string
  listing_title: string
  last_message: string
  last_message_at: string
  unread: number
}

type ViewingRequest = {
  id: string
  listing_title: string
  city: string
  scheduled_at: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
}

type AlertPreference = {
  id: string
  label: string
  city: string
  property_type: string
  max_budget: number
  bedrooms: number
  active: boolean
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PROPERTY_TYPES = ['House', 'Apartment', 'Studio', 'Villa', 'Room', 'Office']
const SRI_LANKA_CITIES = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Jaffna', 'Matara', 'Ratnapura', 'Anuradhapura', 'Trincomalee', 'Batticaloa']
const QUICK_TAGS = ['Furnished', 'Pet Friendly', 'Parking', 'Air Conditioned', 'Pool', 'Gym', 'Solar Panel', 'Garden', 'Balcony', 'CCTV']
const BEDROOM_OPTIONS = [1, 2, 3, 4, 5]
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
function timeAgo(s: string) {
  const d = Date.now() - new Date(s).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

// ─── Mock data for demo / before Supabase is wired ───────────────────────────
const MOCK_SAVED: SavedListing[] = [
  { id: '1', listing_id: 'l1', title: 'Modern 2BR in Colombo 3', city: 'Colombo', rent_amount: 120000, currency: 'LKR', property_type: 'Apartment', bedrooms: 2, bathrooms: 1, photos: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80'], saved_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '2', listing_id: 'l2', title: 'Cozy Studio Near Galle Face', city: 'Colombo', rent_amount: 65000, currency: 'LKR', property_type: 'Studio', bedrooms: 0, bathrooms: 1, photos: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=80'], saved_at: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: '3', listing_id: 'l3', title: 'Luxury Villa with Pool – Kandy', city: 'Kandy', rent_amount: 380000, currency: 'LKR', property_type: 'Villa', bedrooms: 4, bathrooms: 3, photos: ['https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=400&q=80'], saved_at: new Date(Date.now() - 86400000 * 10).toISOString() },
]
const MOCK_INQUIRIES: InquiryThread[] = [
  { id: 't1', landlord_name: 'Ruwan Perera', landlord_initials: 'RP', listing_title: 'Modern 2BR in Colombo 3', last_message: 'Yes, the unit is still available. Would you like to schedule a viewing?', last_message_at: new Date(Date.now() - 7200000).toISOString(), unread: 2 },
  { id: 't2', landlord_name: 'Chamari Silva', landlord_initials: 'CS', listing_title: 'Cozy Studio Near Galle Face', last_message: 'The rent is negotiable for long-term tenants.', last_message_at: new Date(Date.now() - 86400000).toISOString(), unread: 0 },
]
const MOCK_VIEWINGS: ViewingRequest[] = [
  { id: 'v1', listing_title: 'Modern 2BR in Colombo 3', city: 'Colombo', scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(), status: 'confirmed' },
  { id: 'v2', listing_title: 'Luxury Villa with Pool – Kandy', city: 'Kandy', scheduled_at: new Date(Date.now() + 86400000 * 7).toISOString(), status: 'pending' },
]
const MOCK_ALERTS: AlertPreference[] = [
  { id: 'a1', label: 'Colombo Apartments', city: 'Colombo', property_type: 'Apartment', max_budget: 150000, bedrooms: 2, active: true, created_at: new Date(Date.now() - 86400000 * 14).toISOString() },
  { id: 'a2', label: 'Kandy Houses', city: 'Kandy', property_type: 'House', max_budget: 300000, bedrooms: 3, active: false, created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function SeekerProfile() {
  const router = useRouter()
  const { fmtMoney } = useCurrency()
  const fileRef = useRef<HTMLInputElement>(null)

  // Auth & data
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Partial<Profile>>({
    full_name: 'Ashan Jayawardena',
    email: 'ashan@example.com',
    phone: '+94 77 123 4567',
    bio: 'Looking for a comfortable 2-bedroom apartment in Colombo or Kandy. Prefer furnished, pet-friendly spaces with good natural light.',
    preferred_cities: ['Colombo', 'Kandy'],
    preferred_property_types: ['Apartment', 'House'],
    min_budget: 60000,
    max_budget: 200000,
    min_bedrooms: 2,
    preferred_tags: ['Furnished', 'Pet Friendly', 'Parking'],
    move_in_date: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
    created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
  })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  // Feature data
  const [savedListings, setSavedListings] = useState<SavedListing[]>(MOCK_SAVED)
  const [inquiries, setInquiries] = useState<InquiryThread[]>(MOCK_INQUIRIES)
  const [viewings, setViewings] = useState<ViewingRequest[]>(MOCK_VIEWINGS)
  const [alerts, setAlerts] = useState<AlertPreference[]>(MOCK_ALERTS)

  // UI
  const [activeTab, setActiveTab] = useState<'overview' | 'saved' | 'messages' | 'viewings' | 'alerts' | 'settings'>('overview')
  const [editMode, setEditMode] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Draft edits
  const [draft, setDraft] = useState<Partial<Profile>>({})

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Load real profile from Supabase
  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }
        setUserId(user.id)
        const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (p) setProfile(p)
        const { data: saves } = await sb
          .from('saved_listings')
          .select('id, listing_id, saved_at, listings(title, city, rent_amount, currency, property_type, bedrooms, bathrooms, photos)')
          .eq('seeker_id', user.id)
          .order('saved_at', { ascending: false })
        if (saves) {
          setSavedListings(saves.map((s: any) => ({
            id: s.id, listing_id: s.listing_id, saved_at: s.saved_at,
            title: s.listings?.title || 'Untitled', city: s.listings?.city || '',
            rent_amount: s.listings?.rent_amount || 0, currency: s.listings?.currency || 'LKR',
            property_type: s.listings?.property_type || 'House',
            bedrooms: s.listings?.bedrooms || 0, bathrooms: s.listings?.bathrooms || 1,
            photos: s.listings?.photos || [],
          })))
        }
      } catch { /* use mock data */ }
    })()
  }, [router])

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  async function saveProfile() {
    setLoading(true)
    try {
      if (userId) {
        const sb = createClient()
        await sb.from('profiles').update({ ...draft }).eq('id', userId)
      }
      setProfile(prev => ({ ...prev, ...draft }))
      setEditMode(false)
      showToast('Profile updated successfully ✓')
    } catch {
      showToast('Failed to save. Please try again.')
    }
    setLoading(false)
  }

  async function removeSaved(id: string) {
    setSavedListings(prev => prev.filter(s => s.id !== id))
    if (userId) {
      const sb = createClient()
      await sb.from('saved_listings').delete().eq('id', id)
    }
    showToast('Removed from saved listings')
  }

  async function toggleAlert(id: string) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
    showToast('Alert preference updated')
  }

  function startEdit() {
    setDraft({ ...profile })
    setEditMode(true)
    setActiveTab('settings')
  }

  const memberSince = profile.created_at ? fmtDate(profile.created_at) : 'Recently joined'
  const avatarGrad = AVATAR_GRADIENTS[(profile.full_name?.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length]
  const completionScore = [
    profile.full_name, profile.phone, profile.bio,
    (profile.preferred_cities?.length || 0) > 0,
    (profile.preferred_tags?.length || 0) > 0,
    profile.max_budget,
    profile.move_in_date,
    avatarUrl
  ].filter(Boolean).length
  const completionPct = Math.round((completionScore / 8) * 100)

  const statusColor = {
    pending: '#F59E0B', confirmed: '#10B981', completed: '#94A3B8', cancelled: '#EF4444'
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

        /* ── NAV (identical to homepage) ── */
        .nav{position:fixed;top:0;left:0;right:0;z-index:500;transition:all .3s ease}
        .nav.scrolled{background:rgba(255,255,255,.97);backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08),0 4px 24px rgba(15,23,42,.06)}
        .nav.top{background:rgba(255,255,255,.97);backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(15,23,42,.08)}
        .nav-inner{max-width:1320px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:16px}
        .nav-logo{display:flex;align-items:center;gap:12px;text-decoration:none}
        .nav-logo-icon{width:38px;height:38px;border-radius:11px;background:#F1F5F9;border:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center}
        .nav-logo-name{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-.3px}
        .nav-spacer{flex:1}
        .nav-actions{display:flex;align-items:center;gap:8px}
        .nav-link{font-size:13.5px;font-weight:600;color:#475569;padding:8px 12px;border-radius:10px;text-decoration:none;transition:all .15s;white-space:nowrap}
        .nav-link:hover{color:#0F172A;background:#F1F5F9}
        .nav-avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;flex-shrink:0;border:2px solid rgba(255,255,255,.4);background:linear-gradient(135deg,#2563EB,#6366F1)}
        .nav-avatar-ring{outline:3px solid #2563EB;outline-offset:2px}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;padding:4px;color:#475569}

        /* ── MOBILE MENU ── */
        .mm-overlay{display:none;position:fixed;inset:0;z-index:1000}
        .mm-overlay.open{display:flex}
        .mm-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px)}
        .mm-panel{position:absolute;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;padding:24px 20px;display:flex;flex-direction:column;gap:4px;box-shadow:-8px 0 40px rgba(0,0,0,.12)}
        .mm-close{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;margin-bottom:8px}
        .mm-link{font-size:15px;font-weight:600;color:#374151;padding:11px 14px;border-radius:10px;text-decoration:none;display:block;transition:background .15s}
        .mm-link:hover{background:#F1F5F9}
        .mm-div{height:1px;background:#F1F5F9;margin:8px 0}

        /* ── PROFILE HERO BANNER ── */
        .profile-banner{background:linear-gradient(145deg,#0B1629 0%,#162344 45%,#0B1629 100%);position:relative;overflow:hidden;padding:88px 0 0}
        .banner-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.25;pointer-events:none}
        .banner-orb-1{width:400px;height:400px;background:#2563EB;top:-100px;left:-80px}
        .banner-orb-2{width:300px;height:300px;background:#6366F1;bottom:-60px;right:-40px}
        .banner-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:56px 56px;pointer-events:none}
        .banner-inner{max-width:1320px;margin:0 auto;padding:36px 24px 0;position:relative;z-index:2}
        .banner-top{display:flex;align-items:flex-start;gap:24px;margin-bottom:0}
        .avatar-wrap{position:relative;flex-shrink:0}
        .avatar-img{width:96px;height:96px;border-radius:22px;border:3px solid rgba(255,255,255,.2);object-fit:cover}
        .avatar-placeholder{width:96px;height:96px;border-radius:22px;border:3px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:700;flex-shrink:0}
        .avatar-edit{position:absolute;bottom:-6px;right:-6px;width:28px;height:28px;border-radius:8px;background:#2563EB;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;transition:background .15s}
        .avatar-edit:hover{background:#1D4ED8}
        .banner-info{flex:1;min-width:0}
        .banner-name{font-family:'Fraunces',serif;font-size:clamp(22px,4vw,32px);font-weight:700;color:#F8FAFC;margin-bottom:4px;letter-spacing:-.3px}
        .banner-role{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:rgba(255,255,255,.45);margin-bottom:8px}
        .banner-bio{font-size:13.5px;color:rgba(255,255,255,.55);line-height:1.6;max-width:540px;margin-bottom:12px}
        .banner-meta{display:flex;flex-wrap:wrap;gap:12px}
        .bmeta{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.45);font-weight:500}
        .banner-actions{display:flex;gap:8px;flex-shrink:0}
        .btn-edit{padding:9px 20px;border-radius:12px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap;display:flex;align-items:center;gap:6px}
        .btn-edit:hover{background:rgba(255,255,255,.14)}
        .btn-primary{padding:9px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.4);transition:all .15s;white-space:nowrap}
        .btn-primary:hover{transform:translateY(-1px)}

        /* ── COMPLETION BAR ── */
        .completion-bar{background:rgba(255,255,255,.05);border-top:1px solid rgba(255,255,255,.08);margin-top:24px}
        .cb-inner{max-width:1320px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
        .cb-label{font-size:12px;font-weight:700;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
        .cb-track{flex:1;min-width:100px;height:5px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}
        .cb-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#2563EB,#10B981);transition:width .6s ease}
        .cb-pct{font-size:12px;font-weight:700;color:#10B981;white-space:nowrap}
        .cb-tip{font-size:11.5px;color:rgba(255,255,255,.35)}

        /* ── TAB BAR ── */
        .tab-bar{background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:68px;z-index:100;box-shadow:0 2px 10px rgba(15,23,42,.05)}
        .tab-inner{max-width:1320px;margin:0 auto;padding:0 24px;display:flex;gap:0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;height:52px;align-items:center}
        .tab-inner::-webkit-scrollbar{display:none}
        .tab{font-size:13px;font-weight:600;color:#94A3B8;padding:0 16px;height:100%;display:flex;align-items:center;gap:6px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap;position:relative}
        .tab:hover{color:#475569}
        .tab.active{color:#0F172A;border-bottom-color:#0F172A}
        .tab-badge{background:#EF4444;color:#fff;font-size:9px;font-weight:700;border-radius:99px;padding:1px 5px;min-width:16px;text-align:center}

        /* ── PAGE ── */
        .page{max-width:1320px;margin:0 auto;padding:32px 24px 64px}
        .page-grid{display:grid;grid-template-columns:300px 1fr;gap:24px;align-items:start}

        /* ── SIDEBAR CARDS ── */
        .side-card{background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .side-title{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:14px}
        .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .stat-item{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:12px;text-align:center}
        .stat-num{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1}
        .stat-lbl{font-size:11px;color:#94A3B8;margin-top:3px}
        .pref-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#374151;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;padding:4px 10px;margin:3px}
        .pref-chip.city{color:#2563EB;background:#EFF6FF;border-color:#BFDBFE}
        .pref-chip.tag{color:#7C3AED;background:rgba(124,58,237,.07);border-color:rgba(124,58,237,.16)}
        .budget-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F8FAFC}
        .budget-row:last-child{border-bottom:none}
        .budget-lbl{font-size:12px;color:#94A3B8}
        .budget-val{font-family:'Fraunces',serif;font-size:14px;font-weight:700;color:#0F172A}
        .share-btn{width:100%;padding:10px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:7px}
        .share-btn:hover{background:#F8FAFC;border-color:#CBD5E1}

        /* ── MAIN CONTENT ── */
        .main-card{background:#fff;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .card-hd{padding:20px 22px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between}
        .card-title{font-family:'Fraunces',serif;font-size:18px;font-weight:400;color:#0F172A;letter-spacing:-.3px}
        .card-title em{font-style:italic;color:#2563EB}
        .card-action{font-size:12.5px;font-weight:700;color:#2563EB;background:none;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:4px}
        .card-action:hover{text-decoration:underline}

        /* ── SAVED LISTINGS ── */
        .saved-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:18px}
        .scard{border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .2s}
        .scard:hover{box-shadow:0 8px 24px rgba(15,23,42,.10);transform:translateY(-2px)}
        .scard-img{height:155px;position:relative;background:#F1F5F9;overflow:hidden}
        .scard-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
        .scard:hover .scard-img img{transform:scale(1.04)}
        .scard-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .scard-rm{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:99px;background:rgba(255,255,255,.92);border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        .scard-rm:hover{background:#fff}
        .scard-body{padding:12px 14px}
        .scard-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:2px}
        .scard-title{font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .scard-loc{font-size:12px;color:#94A3B8;margin-bottom:7px}
        .scard-price{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A}
        .scard-price span{font-size:11px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:400;color:#94A3B8}
        .scard-facts{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
        .scard-fact{font-size:10.5px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:2px 6px}
        .scard-saved-at{font-size:10.5px;color:#CBD5E1;margin-top:7px}

        /* ── MESSAGES ── */
        .msg-list{padding:0}
        .msg-item{display:flex;gap:14px;padding:16px 22px;border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background .12s}
        .msg-item:hover{background:#F8FAFC}
        .msg-item:last-child{border-bottom:none}
        .msg-av{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;background:linear-gradient(135deg,#0EA5E9,#6366F1)}
        .msg-body{flex:1;min-width:0}
        .msg-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px}
        .msg-sender{font-size:13.5px;font-weight:700;color:#0F172A}
        .msg-time{font-size:11px;color:#94A3B8;flex-shrink:0}
        .msg-listing{font-size:11.5px;color:#2563EB;margin-bottom:4px}
        .msg-preview{font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5}
        .msg-unread{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:99px;background:#2563EB;color:#fff;font-size:9.5px;font-weight:700;margin-left:6px;flex-shrink:0}

        /* ── VIEWINGS ── */
        .viewing-list{padding:18px;display:flex;flex-direction:column;gap:10px}
        .vcard{border:1px solid #E2E8F0;border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;background:#F8FAFC}
        .v-date-box{background:#0F172A;border-radius:12px;padding:10px 14px;text-align:center;flex-shrink:0}
        .v-month{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.5)}
        .v-day{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:#fff;line-height:1}
        .v-time{font-size:10px;color:rgba(255,255,255,.45)}
        .v-info{flex:1;min-width:0}
        .v-title{font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:3px}
        .v-loc{font-size:12px;color:#94A3B8}
        .v-status{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:99px}
        .v-status.pending{background:#FEF3C7;color:#D97706}
        .v-status.confirmed{background:#D1FAE5;color:#059669}
        .v-status.completed{background:#F1F5F9;color:#64748B}
        .v-status.cancelled{background:#FEE2E2;color:#DC2626}

        /* ── ALERTS ── */
        .alert-list{padding:18px;display:flex;flex-direction:column;gap:10px}
        .acard{border:1px solid #E2E8F0;border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;background:#fff;transition:box-shadow .15s}
        .acard:hover{box-shadow:0 4px 16px rgba(15,23,42,.07)}
        .acard-icon{width:44px;height:44px;border-radius:12px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
        .acard-info{flex:1;min-width:0}
        .acard-label{font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:3px}
        .acard-meta{font-size:12px;color:#94A3B8}
        .toggle{position:relative;width:40px;height:22px;flex-shrink:0}
        .toggle input{opacity:0;width:0;height:0;position:absolute}
        .toggle-track{position:absolute;inset:0;border-radius:99px;background:#E2E8F0;cursor:pointer;transition:background .2s}
        .toggle input:checked+.toggle-track{background:#2563EB}
        .toggle-thumb{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .2s}
        .toggle input:checked~.toggle-thumb{transform:translateX(18px)}
        .add-alert-btn{display:flex;align-items:center;gap:7px;padding:12px 16px;border:1.5px dashed #CBD5E1;border-radius:14px;background:none;width:100%;font-size:13px;font-weight:600;color:#94A3B8;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .add-alert-btn:hover{border-color:#2563EB;color:#2563EB;background:#EFF6FF}

        /* ── SETTINGS FORM ── */
        .form-wrap{padding:22px}
        .form-section{margin-bottom:28px}
        .form-sec-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #F1F5F9}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .form-field{display:flex;flex-direction:column;gap:5px}
        .form-field.full{grid-column:1/-1}
        .form-label{font-size:11.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px}
        .form-input,.form-select,.form-textarea{padding:10px 13px;border:1.5px solid #E2E8F0;border-radius:12px;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s,box-shadow .15s;background:#fff}
        .form-textarea{resize:vertical;min-height:90px;line-height:1.6}
        .form-input:focus,.form-select:focus,.form-textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .multi-select{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1.5px solid #E2E8F0;border-radius:12px;min-height:44px;cursor:pointer;transition:border .15s}
        .multi-select:focus-within{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .ms-chip{font-size:12px;font-weight:600;padding:4px 10px;border-radius:8px;border:1.5px solid #E2E8F0;color:#475569;cursor:pointer;transition:all .15s;background:#F8FAFC;white-space:nowrap}
        .ms-chip:hover{border-color:#CBD5E1}
        .ms-chip.sel{background:#0F172A;border-color:#0F172A;color:#fff}
        .ms-chip.sel.city{background:#2563EB;border-color:#2563EB;color:#fff}
        .ms-chip.sel.tag{background:#7C3AED;border-color:#7C3AED;color:#fff}
        .form-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid #F1F5F9}
        .btn-cancel{padding:10px 20px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-save{padding:10px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 12px rgba(37,99,235,.3)}
        .btn-save:disabled{opacity:.5;cursor:not-allowed}
        .danger-zone{background:#FEF2F2;border:1px solid #FECACA;border-radius:14px;padding:18px}
        .dz-title{font-size:13px;font-weight:700;color:#DC2626;margin-bottom:6px}
        .dz-desc{font-size:12.5px;color:#B91C1C;margin-bottom:14px;line-height:1.5}
        .btn-danger{padding:9px 18px;border-radius:10px;border:1.5px solid #FECACA;background:#fff;color:#DC2626;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .btn-danger:hover{background:#FEE2E2}

        /* ── OVERVIEW ── */
        .activity-item{display:flex;align-items:flex-start;gap:12px;padding:13px 0;border-bottom:1px solid #F8FAFC}
        .activity-item:last-child{border-bottom:none}
        .act-dot{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
        .act-body{flex:1;min-width:0}
        .act-text{font-size:13px;color:#374151;line-height:1.5}
        .act-time{font-size:11px;color:#CBD5E1;margin-top:2px}
        .quick-btn{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #E2E8F0;border-radius:14px;background:#fff;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;text-decoration:none;width:100%;margin-bottom:8px}
        .quick-btn:hover{border-color:#CBD5E1;background:#F8FAFC;transform:translateX(2px)}
        .quick-btn-ico{font-size:18px;flex-shrink:0}
        .quick-btn-label{font-size:13px;font-weight:600;color:#0F172A}
        .quick-btn-sub{font-size:11.5px;color:#94A3B8}
        .quick-btn-arr{margin-left:auto;color:#CBD5E1;font-size:14px}

        /* ── TOAST ── */
        .toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);background:#0F172A;color:#fff;font-size:13.5px;font-weight:600;padding:12px 24px;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.2);z-index:9999;transition:transform .3s,opacity .3s;opacity:0;pointer-events:none;white-space:nowrap}
        .toast.show{transform:translateX(-50%) translateY(0);opacity:1}

        /* ── MODAL ── */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:800;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .modal-bg.open{display:flex}
        .modal{background:#fff;border-radius:20px;padding:28px;max-width:380px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,.2)}
        .modal-ico{font-size:36px;margin-bottom:12px}
        .modal-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .modal-desc{font-size:13.5px;color:#64748B;line-height:1.6;margin-bottom:20px}
        .modal-actions{display:flex;gap:10px;justify-content:flex-end}

        /* ── RESPONSIVE ── */
        @media(max-width:1024px){.page-grid{grid-template-columns:1fr}}
        @media(max-width:768px){
          .hamburger{display:block}
          .nav-link{display:none}
          .banner-top{flex-direction:column;gap:16px}
          .banner-actions{flex-direction:row}
          .page{padding:20px 14px 48px}
          .form-grid{grid-template-columns:1fr}
          .saved-grid{grid-template-columns:1fr 1fr}
          .banner-inner{padding:24px 14px 0}
          .tab-inner{padding:0 14px}
        }
        @media(max-width:520px){
          .saved-grid{grid-template-columns:1fr}
          .banner-actions{flex-wrap:wrap}
          .stat-grid{grid-template-columns:1fr 1fr}
        }
      `}</style>

      {/* ── TOAST ── */}
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>

      {/* ── DELETE MODAL ── */}
      <div className={`modal-bg${showDeleteModal ? ' open' : ''}`} onClick={() => setShowDeleteModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-ico">⚠️</div>
          <div className="modal-title">Delete Account?</div>
          <div className="modal-desc">This will permanently delete your profile, saved listings, and all messages. This action cannot be undone.</div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
            <button className="btn-danger" onClick={() => { setShowDeleteModal(false); showToast('Account deletion requested') }}>Delete Account</button>
          </div>
        </div>
      </div>

      {/* ── MOBILE MENU ── */}
      <div className={`mm-overlay${mobileMenuOpen ? ' open' : ''}`}>
        <div className="mm-bg" onClick={() => setMobileMenuOpen(false)} />
        <div className="mm-panel">
          <button className="mm-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
          <a href="/seeker" className="mm-link">🔍 Browse Homes</a>
          <a href="/seeker/listings" className="mm-link">📋 All Listings</a>
          <a href="/seeker/map" className="mm-link">🗺️ Map View</a>
          <div className="mm-div" />
          <a href="/seeker/messages" className="mm-link">💬 Messages</a>
          <a href="/seeker/profile" className="mm-link" style={{ color: '#2563EB' }}>👤 My Profile</a>
          <div className="mm-div" />
          <button className="mm-link" style={{ textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#EF4444', padding: '11px 14px', borderRadius: 10, fontSize: 15 }} onClick={() => { /* signOut */ router.push('/') }}>🚪 Sign Out</button>
        </div>
      </div>

      {/* ── NAVBAR ── */}
      <nav className={`nav${scrolled ? ' scrolled' : ' top'}`}>
        <div className="nav-inner">
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">
              {/* Replace with: <Image src="/icon.png" alt="Rentura" width={24} height={24} /> */}
              <span style={{ fontSize: 16 }}>🏡</span>
            </div>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.3px' }}>Rentura</span>
          </a>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <a href="/seeker" className="nav-link">Home</a>
            <a href="/seeker/listings" className="nav-link">Listings</a>
            <a href="/seeker/map" className="nav-link">Map</a>
            {/* ── PROFILE ICON (active state) ── */}
            <a href="/seeker/profile" className="nav-avatar nav-avatar-ring" title="My Profile">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'cover' }} />
                : initials(profile.full_name || 'U')
              }
            </a>
            <button className="hamburger" onClick={() => setMobileMenuOpen(true)}>☰</button>
          </div>
        </div>
      </nav>

      {/* ── PROFILE BANNER ── */}
      <div className="profile-banner">
        <div className="banner-orb banner-orb-1" />
        <div className="banner-orb banner-orb-2" />
        <div className="banner-grid" />
        <div className="banner-inner">
          <div className="banner-top">
            {/* Avatar */}
            <div className="avatar-wrap">
              {avatarUrl
                ? <img className="avatar-img" src={avatarUrl} alt="avatar" />
                : <div className="avatar-placeholder" style={{ background: avatarGrad }}>
                    {initials(profile.full_name || 'U')}
                  </div>
              }
              <div className="avatar-edit" onClick={() => fileRef.current?.click()} title="Change photo">📷</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0]
                if (!file || !userId) return
                const url = URL.createObjectURL(file)
                setAvatarUrl(url)
                showToast('Photo updated ✓')
              }} />
            </div>

            {/* Info */}
            <div className="banner-info">
              <div className="banner-name">{profile.full_name || 'Your Name'}</div>
              <div className="banner-role">🔍 Property Seeker · Member since {memberSince}</div>
              {profile.bio && <div className="banner-bio">{profile.bio}</div>}
              <div className="banner-meta">
                {profile.email && <span className="bmeta">✉️ {profile.email}</span>}
                {profile.phone && <span className="bmeta">📞 {profile.phone}</span>}
                {(profile.preferred_cities?.length || 0) > 0 && <span className="bmeta">📍 {profile.preferred_cities!.slice(0, 2).join(', ')}</span>}
                {profile.move_in_date && <span className="bmeta">📅 Move-in {fmtDate(profile.move_in_date)}</span>}
              </div>
            </div>

            {/* Actions */}
            <div className="banner-actions">
              <button className="btn-edit" onClick={startEdit}>✏️ Edit Profile</button>
              <button className="btn-primary" onClick={() => router.push('/seeker')}>🔍 Browse Listings</button>
            </div>
          </div>
        </div>

        {/* Completion Bar */}
        <div className="completion-bar">
          <div className="cb-inner">
            <span className="cb-label">Profile completeness</span>
            <div className="cb-track"><div className="cb-fill" style={{ width: `${completionPct}%` }} /></div>
            <span className="cb-pct">{completionPct}%</span>
            {completionPct < 100 && <span className="cb-tip">Add {completionPct < 50 ? 'bio & preferences' : 'a profile photo'} to complete</span>}
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div className="tab-bar">
        <div className="tab-inner">
          {([
            { id: 'overview', label: 'Overview', icon: '🏠' },
            { id: 'saved', label: 'Saved', icon: '❤️', count: savedListings.length },
            { id: 'messages', label: 'Messages', icon: '💬', count: inquiries.reduce((s, i) => s + i.unread, 0) },
            { id: 'viewings', label: 'Viewings', icon: '📅', count: viewings.filter(v => v.status === 'pending').length },
            { id: 'alerts', label: 'Alerts', icon: '🔔', count: alerts.filter(a => a.active).length },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
          ] as { id: typeof activeTab; label: string; icon: string; count?: number }[]).map(t => (
            <button
              key={t.id}
              className={`tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => { setActiveTab(t.id); setEditMode(false) }}
            >
              {t.icon} {t.label}
              {(t.count || 0) > 0 && <span className="tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── PAGE BODY ── */}
      <div className="page">
        <div className="page-grid">

          {/* ── SIDEBAR ── */}
          <div>
            {/* Stats */}
            <div className="side-card">
              <div className="side-title">Your Activity</div>
              <div className="stat-grid">
                <div className="stat-item"><div className="stat-num">{savedListings.length}</div><div className="stat-lbl">Saved</div></div>
                <div className="stat-item"><div className="stat-num">{inquiries.length}</div><div className="stat-lbl">Inquiries</div></div>
                <div className="stat-item"><div className="stat-num">{viewings.length}</div><div className="stat-lbl">Viewings</div></div>
                <div className="stat-item"><div className="stat-num">{alerts.filter(a => a.active).length}</div><div className="stat-lbl">Active Alerts</div></div>
              </div>
            </div>

            {/* Budget */}
            {(profile.min_budget || profile.max_budget) && (
              <div className="side-card">
                <div className="side-title">Budget Range</div>
                {profile.min_budget && <div className="budget-row"><span className="budget-lbl">Minimum</span><span className="budget-val">LKR {profile.min_budget.toLocaleString()}</span></div>}
                {profile.max_budget && <div className="budget-row"><span className="budget-lbl">Maximum</span><span className="budget-val">LKR {profile.max_budget.toLocaleString()}</span></div>}
                {profile.min_bedrooms && <div className="budget-row"><span className="budget-lbl">Min. bedrooms</span><span className="budget-val">{profile.min_bedrooms} bed{profile.min_bedrooms !== 1 ? 's' : ''}</span></div>}
              </div>
            )}

            {/* Preferred Cities */}
            {(profile.preferred_cities?.length || 0) > 0 && (
              <div className="side-card">
                <div className="side-title">Preferred Cities</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {profile.preferred_cities!.map(c => <span key={c} className="pref-chip city">📍 {c}</span>)}
                </div>
              </div>
            )}

            {/* Preferred Tags */}
            {(profile.preferred_tags?.length || 0) > 0 && (
              <div className="side-card">
                <div className="side-title">Must-have Amenities</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {profile.preferred_tags!.map(t => <span key={t} className="pref-chip tag">✓ {t}</span>)}
                </div>
              </div>
            )}

            {/* Property types */}
            {(profile.preferred_property_types?.length || 0) > 0 && (
              <div className="side-card">
                <div className="side-title">Property Types</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {profile.preferred_property_types!.map(t => <span key={t} className="pref-chip">🏠 {t}</span>)}
                </div>
              </div>
            )}

            {/* Share */}
            <div className="side-card">
              <button className="share-btn" onClick={() => { navigator.clipboard.writeText(window.location.href); showToast('Profile link copied!') }}>🔗 Share your profile</button>
            </div>
          </div>

          {/* ── MAIN CONTENT ── */}
          <div>

            {/* ══ OVERVIEW TAB ══ */}
            {activeTab === 'overview' && (
              <>
                {/* Quick Actions */}
                <div className="main-card" style={{ marginBottom: 16 }}>
                  <div className="card-hd">
                    <div className="card-title">Quick <em>actions</em></div>
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    <button className="quick-btn" onClick={() => router.push('/seeker')}>
                      <span className="quick-btn-ico">🔍</span>
                      <div><div className="quick-btn-label">Browse Listings</div><div className="quick-btn-sub">Discover new properties</div></div>
                      <span className="quick-btn-arr">›</span>
                    </button>
                    <button className="quick-btn" onClick={() => setActiveTab('saved')}>
                      <span className="quick-btn-ico">❤️</span>
                      <div><div className="quick-btn-label">Saved Listings</div><div className="quick-btn-sub">{savedListings.length} saved propert{savedListings.length !== 1 ? 'ies' : 'y'}</div></div>
                      <span className="quick-btn-arr">›</span>
                    </button>
                    <button className="quick-btn" onClick={() => setActiveTab('messages')}>
                      <span className="quick-btn-ico">💬</span>
                      <div><div className="quick-btn-label">Messages</div><div className="quick-btn-sub">{inquiries.reduce((s, i) => s + i.unread, 0)} unread</div></div>
                      <span className="quick-btn-arr">›</span>
                    </button>
                    <button className="quick-btn" onClick={() => setActiveTab('alerts')}>
                      <span className="quick-btn-ico">🔔</span>
                      <div><div className="quick-btn-label">Listing Alerts</div><div className="quick-btn-sub">{alerts.filter(a => a.active).length} active alert{alerts.filter(a => a.active).length !== 1 ? 's' : ''}</div></div>
                      <span className="quick-btn-arr">›</span>
                    </button>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="main-card">
                  <div className="card-hd">
                    <div className="card-title">Recent <em>activity</em></div>
                  </div>
                  <div style={{ padding: '6px 22px 16px' }}>
                    {[
                      { ico: '❤️', bg: '#FFF1F2', text: `You saved "${savedListings[0]?.title || 'Modern 2BR'}"`, time: savedListings[0]?.saved_at || new Date().toISOString() },
                      { ico: '💬', bg: '#EFF6FF', text: `New message from ${inquiries[0]?.landlord_name || 'Ruwan Perera'}`, time: inquiries[0]?.last_message_at || new Date().toISOString() },
                      { ico: '📅', bg: '#F0FDF4', text: `Viewing scheduled for "${viewings[0]?.listing_title || 'Colombo apartment'}"`, time: viewings[0]?.scheduled_at || new Date().toISOString() },
                      { ico: '🔔', bg: '#FEF3C7', text: `Alert "${alerts[0]?.label || 'Colombo Apartments'}" created`, time: alerts[0]?.created_at || new Date().toISOString() },
                    ].map((a, i) => (
                      <div key={i} className="activity-item">
                        <div className="act-dot" style={{ background: a.bg }}>{a.ico}</div>
                        <div className="act-body">
                          <div className="act-text">{a.text}</div>
                          <div className="act-time">{timeAgo(a.time)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ SAVED TAB ══ */}
            {activeTab === 'saved' && (
              <div className="main-card">
                <div className="card-hd">
                  <div className="card-title"><em>Saved</em> listings</div>
                  <button className="card-action" onClick={() => router.push('/seeker')}>+ Browse more →</button>
                </div>
                {savedListings.length === 0
                  ? <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>❤️</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>No saved listings yet</div>
                      <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 18 }}>Browse listings and tap the heart to save your favourites.</div>
                      <button className="btn-primary" onClick={() => router.push('/seeker')}>Browse listings →</button>
                    </div>
                  : <div className="saved-grid">
                      {savedListings.map(l => (
                        <div key={l.id} className="scard" onClick={() => router.push(`/seeker/listings/${l.listing_id}`)}>
                          <div className="scard-img">
                            {l.photos[0] ? <img src={l.photos[0]} alt={l.title} loading="lazy" /> : <div className="scard-ph">🏠</div>}
                            <button className="scard-rm" onClick={e => { e.stopPropagation(); removeSaved(l.id) }} title="Remove">✕</button>
                          </div>
                          <div className="scard-body">
                            <div className="scard-type">{l.property_type}</div>
                            <div className="scard-title">{l.title}</div>
                            <div className="scard-loc">📍 {l.city}</div>
                            <div className="scard-price">LKR {l.rent_amount.toLocaleString()}<span> /mo</span></div>
                            <div className="scard-facts">
                              {l.bedrooms > 0 && <span className="scard-fact">🛏 {l.bedrooms}</span>}
                              <span className="scard-fact">🚿 {l.bathrooms}</span>
                            </div>
                            <div className="scard-saved-at">Saved {timeAgo(l.saved_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* ══ MESSAGES TAB ══ */}
            {activeTab === 'messages' && (
              <div className="main-card">
                <div className="card-hd">
                  <div className="card-title"><em>Messages</em></div>
                  <button className="card-action" onClick={() => router.push('/seeker/messages')}>Open full inbox →</button>
                </div>
                {inquiries.length === 0
                  ? <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>No messages yet</div>
                      <div style={{ fontSize: 13, color: '#94A3B8' }}>Contact a landlord from any listing page to start a conversation.</div>
                    </div>
                  : <div className="msg-list">
                      {inquiries.map(t => (
                        <div key={t.id} className="msg-item" onClick={() => router.push(`/seeker/messages?thread=${t.id}`)}>
                          <div className="msg-av">{t.landlord_initials}</div>
                          <div className="msg-body">
                            <div className="msg-top">
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span className="msg-sender">{t.landlord_name}</span>
                                {t.unread > 0 && <span className="msg-unread">{t.unread}</span>}
                              </div>
                              <span className="msg-time">{timeAgo(t.last_message_at)}</span>
                            </div>
                            <div className="msg-listing">re: {t.listing_title}</div>
                            <div className="msg-preview">{t.last_message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* ══ VIEWINGS TAB ══ */}
            {activeTab === 'viewings' && (
              <div className="main-card">
                <div className="card-hd">
                  <div className="card-title">Viewing <em>schedule</em></div>
                </div>
                {viewings.length === 0
                  ? <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>No viewings scheduled</div>
                      <div style={{ fontSize: 13, color: '#94A3B8' }}>Request a viewing from any listing you're interested in.</div>
                    </div>
                  : <div className="viewing-list">
                      {viewings.map(v => {
                        const d = new Date(v.scheduled_at)
                        return (
                          <div key={v.id} className="vcard">
                            <div className="v-date-box">
                              <div className="v-month">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                              <div className="v-day">{d.getDate()}</div>
                              <div className="v-time">{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div className="v-info">
                              <div className="v-title">{v.listing_title}</div>
                              <div className="v-loc">📍 {v.city}</div>
                            </div>
                            <span className={`v-status ${v.status}`}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</span>
                          </div>
                        )
                      })}
                    </div>
                }
              </div>
            )}

            {/* ══ ALERTS TAB ══ */}
            {activeTab === 'alerts' && (
              <div className="main-card">
                <div className="card-hd">
                  <div className="card-title">Listing <em>alerts</em></div>
                </div>
                <div className="alert-list">
                  {alerts.map(a => (
                    <div key={a.id} className="acard">
                      <div className="acard-icon">🔔</div>
                      <div className="acard-info">
                        <div className="acard-label">{a.label}</div>
                        <div className="acard-meta">{a.city} · {a.property_type} · Up to LKR {a.max_budget.toLocaleString()} · {a.bedrooms} bed{a.bedrooms !== 1 ? 's' : ''}</div>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" checked={a.active} onChange={() => toggleAlert(a.id)} />
                        <div className="toggle-track" />
                        <div className="toggle-thumb" />
                      </label>
                    </div>
                  ))}
                  <button className="add-alert-btn" onClick={() => showToast('Alert creation coming soon!')}>
                    ＋ Create new alert
                  </button>
                </div>
              </div>
            )}

            {/* ══ SETTINGS TAB ══ */}
            {activeTab === 'settings' && (
              <div className="main-card">
                <div className="card-hd">
                  <div className="card-title">Account <em>settings</em></div>
                  {!editMode && <button className="card-action" onClick={startEdit}>✏️ Edit</button>}
                </div>
                <div className="form-wrap">

                  {/* Personal Info */}
                  <div className="form-section">
                    <div className="form-sec-title">Personal Information</div>
                    <div className="form-grid">
                      <div className="form-field">
                        <label className="form-label">Full Name</label>
                        <input className="form-input" value={editMode ? (draft.full_name || '') : (profile.full_name || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Phone Number</label>
                        <input className="form-input" value={editMode ? (draft.phone || '') : (profile.phone || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Email Address</label>
                        <input className="form-input" type="email" value={editMode ? (draft.email || '') : (profile.email || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Target Move-in Date</label>
                        <input className="form-input" type="date" value={editMode ? (draft.move_in_date || '') : (profile.move_in_date || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, move_in_date: e.target.value }))} />
                      </div>
                      <div className="form-field full">
                        <label className="form-label">Bio / What you're looking for</label>
                        <textarea className="form-textarea" value={editMode ? (draft.bio || '') : (profile.bio || '')} disabled={!editMode}
                          placeholder="Tell landlords a bit about yourself and what you need…"
                          onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {/* Search Preferences */}
                  <div className="form-section">
                    <div className="form-sec-title">Search Preferences</div>
                    <div className="form-grid">
                      <div className="form-field">
                        <label className="form-label">Min Budget (LKR/mo)</label>
                        <input className="form-input" type="number" min="0" value={editMode ? (draft.min_budget || '') : (profile.min_budget || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, min_budget: parseFloat(e.target.value) || null }))} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Max Budget (LKR/mo)</label>
                        <input className="form-input" type="number" min="0" value={editMode ? (draft.max_budget || '') : (profile.max_budget || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, max_budget: parseFloat(e.target.value) || null }))} />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Min. Bedrooms</label>
                        <select className="form-select" value={editMode ? (draft.min_bedrooms || '') : (profile.min_bedrooms || '')} disabled={!editMode}
                          onChange={e => setDraft(d => ({ ...d, min_bedrooms: parseInt(e.target.value) || null }))}>
                          <option value="">Any</option>
                          {BEDROOM_OPTIONS.map(b => <option key={b} value={b}>{b} bed{b !== 1 ? 's' : ''}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Preferred Cities */}
                    <div className="form-field" style={{ marginTop: 14 }}>
                      <label className="form-label">Preferred Cities</label>
                      <div className="multi-select">
                        {SRI_LANKA_CITIES.map(c => {
                          const arr = (editMode ? draft.preferred_cities : profile.preferred_cities) || []
                          const sel = arr.includes(c)
                          return (
                            <span key={c} className={`ms-chip${sel ? ' sel city' : ''}`}
                              onClick={() => {
                                if (!editMode) return
                                setDraft(d => ({
                                  ...d,
                                  preferred_cities: sel ? (d.preferred_cities || []).filter(x => x !== c) : [...(d.preferred_cities || []), c]
                                }))
                              }}
                            >{c}</span>
                          )
                        })}
                      </div>
                    </div>

                    {/* Property Types */}
                    <div className="form-field" style={{ marginTop: 14 }}>
                      <label className="form-label">Property Types</label>
                      <div className="multi-select">
                        {PROPERTY_TYPES.map(t => {
                          const arr = (editMode ? draft.preferred_property_types : profile.preferred_property_types) || []
                          const sel = arr.includes(t)
                          return (
                            <span key={t} className={`ms-chip${sel ? ' sel' : ''}`}
                              onClick={() => {
                                if (!editMode) return
                                setDraft(d => ({
                                  ...d,
                                  preferred_property_types: sel ? (d.preferred_property_types || []).filter(x => x !== t) : [...(d.preferred_property_types || []), t]
                                }))
                              }}
                            >{t}</span>
                          )
                        })}
                      </div>
                    </div>

                    {/* Preferred Amenity Tags */}
                    <div className="form-field" style={{ marginTop: 14 }}>
                      <label className="form-label">Must-have Amenities</label>
                      <div className="multi-select">
                        {QUICK_TAGS.map(tag => {
                          const arr = (editMode ? draft.preferred_tags : profile.preferred_tags) || []
                          const sel = arr.includes(tag)
                          return (
                            <span key={tag} className={`ms-chip${sel ? ' sel tag' : ''}`}
                              onClick={() => {
                                if (!editMode) return
                                setDraft(d => ({
                                  ...d,
                                  preferred_tags: sel ? (d.preferred_tags || []).filter(x => x !== tag) : [...(d.preferred_tags || []), tag]
                                }))
                              }}
                            >{tag}</span>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="form-section">
                    <div className="form-sec-title">Danger Zone</div>
                    <div className="danger-zone">
                      <div className="dz-title">Delete Account</div>
                      <div className="dz-desc">Permanently delete your account and all associated data. This action cannot be undone and all your saved listings, messages, and preferences will be lost.</div>
                      <button className="btn-danger" onClick={() => setShowDeleteModal(true)}>Delete my account</button>
                    </div>
                  </div>
                </div>

                {editMode && (
                  <div className="form-actions">
                    <button className="btn-cancel" onClick={() => { setEditMode(false); setDraft({}) }}>Cancel</button>
                    <button className="btn-save" disabled={loading} onClick={saveProfile}>{loading ? 'Saving…' : '✓ Save Changes'}</button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0F172A', borderTop: '1px solid #1E293B', padding: '28px 0' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: '#fff' }}>Rentura</span>
          <span style={{ fontSize: 13, color: '#475569' }}>© {new Date().getFullYear()} Rentura. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {['Privacy', 'Terms', 'Contact'].map(l => (
              <a key={l} href={`/${l.toLowerCase()}`} style={{ fontSize: 13, color: '#475569', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  )
}
