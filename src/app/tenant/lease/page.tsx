'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { useCurrency } from '@/lib/useCurrency'

// ── Types ──────────────────────────────────────────────────────────────────
type Profile = {
  id: string
  full_name: string
  email: string
  phone?: string
  avatar_url?: string
  active_role?: string
}

type TenantRow = {
  id: string
  profile_id: string
  unit_id: string
  property_id: string
  status: string
  created_at: string
}

type Unit = {
  id: string
  unit_number: string
  monthly_rent: number
  currency: string
  rent_due_day: number
  lease_start?: string
  lease_end?: string
}

type Property = {
  id: string
  name: string
  address: string
  city: string
  country: string
  type: string
}

type LandlordProfile = {
  id: string
  full_name: string
  email: string
  phone?: string
  avatar_url?: string
}

type Document = {
  id: string
  name: string
  type: string
  file_url: string
  file_size?: number
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtFileSize(bytes?: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function leaseProgress(start?: string, end?: string) {
  if (!start || !end) return { pct: 0, dLeft: null, totalDays: 0, elapsed: 0 }
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const n = Date.now()
  const pct = Math.min(100, Math.max(0, Math.round(((n - s) / (e - s)) * 100)))
  const dLeft = Math.ceil((e - n) / 86400000)
  const totalDays = Math.round((e - s) / 86400000)
  const elapsed = Math.round((n - s) / 86400000)
  return { pct, dLeft, totalDays, elapsed }
}

function leaseStatusInfo(dLeft: number | null, pct: number) {
  if (dLeft === null) return { label: 'No dates set', color: '#64748B', bg: '#F1F5F9', icon: '—' }
  if (dLeft < 0) return { label: 'Lease Expired', color: '#DC2626', bg: '#FEE2E2', icon: '⚠️' }
  if (dLeft <= 30) return { label: `Expiring in ${dLeft} days`, color: '#DC2626', bg: '#FEE2E2', icon: '⚠️' }
  if (dLeft <= 60) return { label: `Expiring in ${dLeft} days`, color: '#D97706', bg: '#FEF9C3', icon: '⏳' }
  return { label: 'Active & in good standing', color: '#16A34A', bg: '#DCFCE7', icon: '✅' }
}

export default function TenantLeasePage() {
  const router = useRouter()

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [tenantRow, setTenantRow]     = useState<TenantRow | null>(null)
  const [unit, setUnit]               = useState<Unit | null>(null)
  const [property, setProperty]       = useState<Property | null>(null)
  const [landlord, setLandlord]       = useState<LandlordProfile | null>(null)
  const [documents, setDocuments]     = useState<Document[]>([])
  const [loading, setLoading]         = useState(true)
  const [activeRole, setActiveRole]   = useState('tenant')
  const [unreadCount, setUnreadCount] = useState(0)

  // UI
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)

  const { fmtMoney } = useCurrency()

  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) { setProfile(prof); setActiveRole(prof.active_role || 'tenant') }

        const { data: tRow } = await sb.from('tenants').select('*').eq('profile_id', user.id).eq('status', 'active').single()
        if (!tRow) { setLoading(false); return }
        setTenantRow(tRow)

        const [{ data: unitData }, { data: propData }, { data: msgData }] = await Promise.all([
          sb.from('units').select('*').eq('id', tRow.unit_id).single(),
          sb.from('properties').select('*').eq('id', tRow.property_id).single(),
          sb.from('messages').select('id').eq('receiver_id', user.id).eq('read', false),
        ])

        if (unitData) setUnit(unitData)
        if (propData) setProperty(propData)
        setUnreadCount((msgData || []).length)

        if (propData?.landlord_id) {
          const { data: ll } = await sb.from('profiles').select('id,full_name,email,phone,avatar_url').eq('id', propData.landlord_id).single()
          if (ll) setLandlord(ll)
        }

        const { data: docs } = await sb.from('documents')
          .select('id,name,type,file_url,file_size,created_at')
          .eq('tenant_id', tRow.id)
          .order('created_at', { ascending: false })
        setDocuments(docs || [])

      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [router])

  async function handleRoleSwitch(role: string) {
    if (!profile) return
    setActiveRole(role)
    setRolePopoverOpen(false)
    const sb = createClient()
    await sb.from('profiles').update({ active_role: role }).eq('id', profile.id).select()
    if (role === 'landlord') window.location.href = '/landlord'
    else if (role === 'seeker') window.location.href = '/seeker'
  }

  const { pct, dLeft, totalDays, elapsed } = leaseProgress(unit?.lease_start, unit?.lease_end)
  const leaseStatus = leaseStatusInfo(dLeft, pct)
  const barColor = dLeft !== null && dLeft <= 30 ? '#DC2626' : dLeft !== null && dLeft <= 60 ? '#D97706' : '#2563EB'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading lease...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;max-width:100vw}
        .shell{display:flex;min-height:100vh;position:relative}

        /* ── SIDEBAR ── */
        .sidebar{width:260px;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:200;transition:transform .25s ease}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-count{margin-left:auto;background:#DC2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px}
        .sb-footer{border-top:2px solid rgba(255,255,255,0.07)}
        .sb-role-wrap{position:relative;padding:12px}
        .sb-user{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .15s}
        .sb-user:hover{background:rgba(255,255,255,.06)}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-uemail{font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-role-badge{display:inline-block;font-size:9.5px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:4px;padding:1px 6px;margin-top:2px}
        .role-popover{position:absolute;bottom:100%;left:12px;right:12px;background:#1E293B;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;margin-bottom:6px;box-shadow:0 20px 40px rgba(0,0,0,.4);z-index:300}
        .rp-title{font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 8px}
        .rp-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;color:#CBD5E1;font-size:13px;font-weight:500;transition:background .15s}
        .rp-item:hover{background:rgba(255,255,255,.06)}
        .rp-divider{height:1px;background:rgba(255,255,255,.06);margin:4px 0}

        /* ── MAIN AREA ── */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 20px;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .tb-left{display:flex;align-items:center;gap:8px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px}
        .notif-btn{width:34px;height:34px;border-radius:9px;background:#F1F5F9;border:none;cursor:pointer;font-size:15px;position:relative;display:flex;align-items:center;justify-content:center}
        .notif-dot{width:8px;height:8px;background:#DC2626;border-radius:50%;position:absolute;top:5px;right:5px;border:1.5px solid #fff}
        .content{padding:22px 20px;flex:1}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}

        /* ── Hero ── */
        .lease-hero{background:linear-gradient(135deg,#0F172A 0%,#1E293B 55%,#1a3354 100%);border-radius:20px;padding:28px 32px;margin-bottom:20px;position:relative;overflow:hidden}
        .lease-hero::before{content:'';position:absolute;top:-60px;right:-60px;width:260px;height:260px;background:radial-gradient(circle,rgba(59,130,246,.18),transparent 65%);pointer-events:none}
        .lease-hero::after{content:'';position:absolute;bottom:-40px;left:20%;width:200px;height:200px;background:radial-gradient(circle,rgba(99,102,241,.12),transparent 65%);pointer-events:none}
        .lh-eyebrow{font-size:12px;color:#64748B;margin-bottom:4px;font-weight:500}
        .lh-prop{font-family:'Fraunces',serif;font-size:28px;font-weight:700;color:#fff;margin-bottom:4px}
        .lh-unit{font-size:14px;color:#94A3B8;margin-bottom:24px}
        .lh-progress-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .lh-progress-label{font-size:12px;color:#64748B}
        .lh-progress-pct{font-size:13px;font-weight:700;color:#fff}
        .lh-bar-bg{height:10px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden;margin-bottom:16px}
        .lh-bar-fill{height:100%;border-radius:99px;transition:width .5s ease}
        .lh-dates{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:18px}
        .lh-date-item{text-align:center}
        .lh-date-label{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
        .lh-date-val{font-size:14px;font-weight:700;color:#fff}
        .lh-status-pill{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;padding:7px 16px;border-radius:99px}

        /* ── Detail cards ── */
        .detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
        .detail-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .dc-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:6px}
        .dc-val{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .dc-sub{font-size:11.5px;color:#64748B}

        /* ── Two col layout ── */
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8}
        .card-action{font-size:12.5px;font-weight:600;color:#2563EB;cursor:pointer;text-decoration:none;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif}

        /* Landlord card */
        .landlord-card{display:flex;align-items:center;gap:14px;padding:16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:12px}
        .ll-av{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0}
        .ll-name{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .ll-role{font-size:11px;color:#94A3B8;font-weight:500;margin-bottom:6px}
        .ll-contact{display:flex;gap:8px;flex-wrap:wrap}
        .ll-contact-btn{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:5px 12px;border-radius:8px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;cursor:pointer;text-decoration:none;transition:all .15s}
        .ll-contact-btn:hover{border-color:#BFDBFE;color:#2563EB}

        /* Property info */
        .prop-info-row{display:flex;align-items:flex-start;gap:10px;padding:11px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:11px;margin-bottom:8px}
        .pi-icon{font-size:16px;flex-shrink:0;margin-top:1px}
        .pi-label{font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
        .pi-val{font-size:13px;font-weight:600;color:#0F172A}

        /* Key terms */
        .term-row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #F1F5F9}
        .term-row:last-child{border-bottom:none;padding-bottom:0}
        .term-icon{font-size:18px;flex-shrink:0;margin-top:1px}
        .term-title{font-size:13px;font-weight:700;color:#0F172A;margin-bottom:3px}
        .term-text{font-size:12.5px;color:#64748B;line-height:1.6}

        /* Documents */
        .doc-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:11px;margin-bottom:8px;cursor:pointer;transition:all .15s}
        .doc-row:hover{border-color:#BFDBFE;background:#EFF6FF}
        .doc-icon{width:38px;height:38px;border-radius:10px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .doc-name{font-size:13px;font-weight:600;color:#0F172A;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .doc-size{font-size:11px;color:#94A3B8;margin-top:2px}
        .doc-dl{width:30px;height:30px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;transition:all .15s}
        .doc-dl:hover{border-color:#BFDBFE;background:#EFF6FF}

        /* No lease */
        .no-lease{text-align:center;padding:80px 24px;color:#94A3B8}
        .no-lease-icon{font-size:48px;margin-bottom:16px}
        .no-lease-title{font-family:'Fraunces',serif;font-size:22px;color:#475569;margin-bottom:8px}
        .no-lease-sub{font-size:14px;line-height:1.6}

        /* ════════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
           ════════════════════════════════════════════ */

        /* ── TABLET LANDSCAPE + SMALL DESKTOP (1024px – 1279px) ── */
        @media(max-width:1279px){
          .detail-grid{grid-template-columns:repeat(3,1fr)}
        }

        /* ── TABLET PORTRAIT (768px – 1023px) ── */
        @media(max-width:1023px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:18px 16px}
          .lease-hero{padding:20px 22px}
          .lh-prop{font-size:22px}
          .detail-grid{grid-template-columns:repeat(3,1fr)}
          .grid2{grid-template-columns:1fr 1fr;gap:12px}
        }

        /* ── TABLET PORTRAIT NARROW (600px – 767px) ── */
        @media(max-width:767px){
          .content{padding:14px 14px}
          .lease-hero{padding:18px 18px;border-radius:16px}
          .lh-prop{font-size:20px}
          .lh-unit{font-size:13px;margin-bottom:16px}
          .lh-dates{grid-template-columns:1fr 1fr;gap:10px}
          .detail-grid{grid-template-columns:repeat(2,1fr);gap:8px}
          .grid2{grid-template-columns:1fr;gap:12px}
        }

        /* ── MOBILE (up to 599px) ── */
        @media(max-width:599px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
          .lease-hero{padding:16px 16px}
          .lh-prop{font-size:18px}
          .lh-progress-pct{font-size:11px}
          .lh-dates{grid-template-columns:1fr 1fr;gap:8px}
          .lh-date-val{font-size:12px}
          .detail-grid{grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
          .detail-card{padding:13px 12px}
          .dc-val{font-size:14px}
          .card{padding:14px}
          .landlord-card{flex-wrap:wrap}
        }

        /* ── VERY SMALL MOBILE (up to 380px) ── */
        @media(max-width:380px){
          .lh-prop{font-size:16px}
          .lh-dates{grid-template-columns:1fr}
          .lh-date-item{text-align:left}
          .detail-grid{grid-template-columns:1fr}
          .content{padding:10px 10px}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        {/* ── Sidebar (identical to dashboard) ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image
                src="/icon.png"
                alt="Rentura Logo"
                width={24}
                height={24}
              />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item active"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item"><span className="sb-ico">🔧</span> Maintenance</a>
            <a href="/tenant/documents" className="sb-item"><span className="sb-ico">📁</span> Documents</a>
            <a href="/tenant/messages" className="sb-item">
              <span className="sb-ico">💬</span> Messages
              {unreadCount > 0 && <span className="sb-count">{unreadCount}</span>}
            </a>
            <span className="sb-section">Account</span>
            <a href="/tenant/settings" className="sb-item"><span className="sb-ico">⚙️</span> Settings</a>
          </nav>
          {/* <div className="sb-footer">
            <div className="sb-role-wrap">
              {rolePopoverOpen && (
                <div className="role-popover">
                  <div className="rp-title">Switch Role</div>
                  <div className="rp-item" onClick={() => handleRoleSwitch('tenant')}>
                    <span>🏠</span> Tenant
                    {activeRole === 'tenant' && <span style={{ marginLeft: 'auto', color: '#2563EB', fontWeight: 700, fontSize: 12 }}>✓</span>}
                  </div>
                  <div className="rp-divider" />
                  <div className="rp-item" onClick={() => handleRoleSwitch('landlord')}>
                    <span>🏢</span> Landlord
                    {activeRole === 'landlord' && <span style={{ marginLeft: 'auto', color: '#2563EB', fontWeight: 700, fontSize: 12 }}>✓</span>}
                  </div>
                  <div className="rp-divider" />
                  <div className="rp-item" onClick={() => handleRoleSwitch('seeker')}>
                    <span>🔍</span> Property Seeker
                    {activeRole === 'seeker' && <span style={{ marginLeft: 'auto', color: '#2563EB', fontWeight: 700, fontSize: 12 }}>✓</span>}
                  </div>
                </div>
              )}
              <div className="sb-user" onClick={() => setRolePopoverOpen(v => !v)}>
                <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                  <div className="sb-uemail">{profile?.email || ''}</div>
                  <span className="sb-role-badge">Tenant</span>
                </div>
                <span style={{ color: '#64748B', fontSize: 12, flexShrink: 0 }}>⇅</span>
              </div>
            </div>
          </div> */}
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
              <div>
                <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                <div className="sb-uemail">{profile?.email || ''}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>My Lease</b></div>
            </div>
            <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
              🔔
              {unreadCount > 0 && <div className="notif-dot" />}
            </button>
          </div>

          <div className="content">
            {!tenantRow ? (
              <div className="no-lease">
                <div className="no-lease-icon">📋</div>
                <div className="no-lease-title">No Active Lease Found</div>
                <div className="no-lease-sub">You don't have an active tenancy linked to your account.<br />Contact your landlord to get set up.</div>
              </div>
            ) : (
              <>
                {/* Hero */}
                <div className="lease-hero">
                  <div className="lh-eyebrow">Current Lease</div>
                  <div className="lh-prop">{property?.name || 'Your Property'}</div>
                  <div className="lh-unit">
                    Unit {unit?.unit_number || '—'}
                    {property?.address && ` · ${property.address}`}
                    {property?.city && `, ${property.city}`}
                  </div>

                  <div className="lh-progress-row">
                    <span className="lh-progress-label">Lease progress</span>
                    <span className="lh-progress-pct">{pct}% complete · {elapsed} of {totalDays} days</span>
                  </div>
                  <div className="lh-bar-bg">
                    <div className="lh-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${barColor},${barColor === '#2563EB' ? '#6366F1' : barColor})` }} />
                  </div>

                  <div className="lh-dates">
                    <div className="lh-date-item">
                      <div className="lh-date-label">Start Date</div>
                      <div className="lh-date-val">{fmtDate(unit?.lease_start)}</div>
                    </div>
                    <div className="lh-date-item" style={{ textAlign: 'center' }}>
                      <div className="lh-date-label">End Date</div>
                      <div className="lh-date-val">{fmtDate(unit?.lease_end)}</div>
                    </div>
                    <div className="lh-date-item" style={{ textAlign: 'right' }}>
                      <div className="lh-date-label">Monthly Rent</div>
                      <div className="lh-date-val">{unit ? fmtMoney(unit.monthly_rent) : '—'}</div>
                    </div>
                  </div>

                  <div className="lh-status-pill" style={{ background: `${leaseStatus.bg}22`, color: leaseStatus.color, border: `1px solid ${leaseStatus.color}44` }}>
                    {leaseStatus.icon} &nbsp;{leaseStatus.label}
                    {dLeft !== null && dLeft > 0 && ` · ${dLeft} days remaining`}
                  </div>
                </div>

                {/* Detail cards */}
                <div className="detail-grid">
                  <div className="detail-card">
                    <div className="dc-label">Monthly Rent</div>
                    <div className="dc-val" style={{ color: '#2563EB' }}>{unit ? fmtMoney(unit.monthly_rent) : '—'}</div>
                    <div className="dc-sub">Due on the {unit?.rent_due_day || '—'}{unit?.rent_due_day === 1 ? 'st' : unit?.rent_due_day === 2 ? 'nd' : unit?.rent_due_day === 3 ? 'rd' : 'th'}</div>
                  </div>
                  <div className="detail-card">
                    <div className="dc-label">Lease Start</div>
                    <div className="dc-val">{fmtDate(unit?.lease_start)}</div>
                    <div className="dc-sub">Move-in date</div>
                  </div>
                  <div className="detail-card">
                    <div className="dc-label">Lease End</div>
                    <div className="dc-val" style={{ color: dLeft !== null && dLeft <= 60 ? '#D97706' : '#0F172A' }}>{fmtDate(unit?.lease_end)}</div>
                    <div className="dc-sub">{dLeft !== null && dLeft > 0 ? `${dLeft} days remaining` : dLeft === 0 ? 'Ends today' : 'Expired'}</div>
                  </div>
                  <div className="detail-card">
                    <div className="dc-label">Unit</div>
                    <div className="dc-val">Unit {unit?.unit_number || '—'}</div>
                    <div className="dc-sub">{property?.name || '—'}</div>
                  </div>
                  <div className="detail-card">
                    <div className="dc-label">Tenant Since</div>
                    <div className="dc-val">{fmtDate(tenantRow.created_at)}</div>
                    <div className="dc-sub">{elapsed > 0 ? `${elapsed} days ago` : 'Recently'}</div>
                  </div>
                  <div className="detail-card">
                    <div className="dc-label">Status</div>
                    <div className="dc-val" style={{ color: leaseStatus.color }}>{leaseStatus.icon} {tenantRow.status.charAt(0).toUpperCase() + tenantRow.status.slice(1)}</div>
                    <div className="dc-sub">Tenancy status</div>
                  </div>
                </div>

                {/* Grid */}
                <div className="grid2">
                  {/* Left col */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Landlord */}
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Your Landlord</div>
                        <a href="/tenant/messages" className="card-action">Message →</a>
                      </div>
                      {landlord ? (
                        <div className="landlord-card">
                          <div className="ll-av">{initials(landlord.full_name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="ll-name">{landlord.full_name}</div>
                            <div className="ll-role">Property Landlord</div>
                            <div className="ll-contact">
                              <a href={`mailto:${landlord.email}`} className="ll-contact-btn">✉️ Email</a>
                              {landlord.phone && <a href={`tel:${landlord.phone}`} className="ll-contact-btn">📞 Call</a>}
                              <a href="/tenant/messages" className="ll-contact-btn">💬 Message</a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>Landlord info unavailable</div>
                      )}
                    </div>

                    {/* Property info */}
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Property Details</div>
                      </div>
                      {property ? (
                        <>
                          <div className="prop-info-row">
                            <div className="pi-icon">🏠</div>
                            <div>
                              <div className="pi-label">Property Name</div>
                              <div className="pi-val">{property.name}</div>
                            </div>
                          </div>
                          <div className="prop-info-row">
                            <div className="pi-icon">📍</div>
                            <div>
                              <div className="pi-label">Address</div>
                              <div className="pi-val">{property.address}{property.city ? `, ${property.city}` : ''}{property.country ? `, ${property.country}` : ''}</div>
                            </div>
                          </div>
                          <div className="prop-info-row">
                            <div className="pi-icon">🏢</div>
                            <div>
                              <div className="pi-label">Property Type</div>
                              <div className="pi-val" style={{ textTransform: 'capitalize' }}>{property.type || '—'}</div>
                            </div>
                          </div>
                          <div className="prop-info-row">
                            <div className="pi-icon">🚪</div>
                            <div>
                              <div className="pi-label">Your Unit</div>
                              <div className="pi-val">Unit {unit?.unit_number || '—'}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>Property info unavailable</div>
                      )}
                    </div>
                  </div>

                  {/* Right col */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Key terms */}
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Key Lease Terms</div>
                      </div>
                      <div>
                        <div className="term-row">
                          <div className="term-icon">💰</div>
                          <div>
                            <div className="term-title">Rent Payment</div>
                            <div className="term-text">
                              Monthly rent of {unit ? fmtMoney(unit.monthly_rent) : '—'} is due on the {unit?.rent_due_day || '—'}{unit?.rent_due_day === 1 ? 'st' : unit?.rent_due_day === 2 ? 'nd' : unit?.rent_due_day === 3 ? 'rd' : 'th'} of each month. Late payments may incur additional charges as per your agreement.
                            </div>
                          </div>
                        </div>
                        <div className="term-row">
                          <div className="term-icon">📅</div>
                          <div>
                            <div className="term-title">Lease Duration</div>
                            <div className="term-text">
                              Your lease runs from {fmtDate(unit?.lease_start)} to {fmtDate(unit?.lease_end)}
                              {totalDays > 0 ? ` — a total of ${totalDays} days.` : '.'}
                              {dLeft !== null && dLeft > 0 && ` ${dLeft} days remain.`}
                            </div>
                          </div>
                        </div>
                        <div className="term-row">
                          <div className="term-icon">🔧</div>
                          <div>
                            <div className="term-title">Maintenance</div>
                            <div className="term-text">
                              Submit all maintenance requests through the app. Your landlord will be notified immediately and will respond as soon as possible.
                            </div>
                          </div>
                        </div>
                        <div className="term-row">
                          <div className="term-icon">🚪</div>
                          <div>
                            <div className="term-title">End of Tenancy</div>
                            <div className="term-text">
                              Please contact your landlord well in advance of the lease end date {fmtDate(unit?.lease_end)} to discuss renewal or vacating arrangements.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Lease documents */}
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Lease Documents</div>
                        <a href="/tenant/documents" className="card-action">View All →</a>
                      </div>
                      {documents.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>
                          No documents shared yet
                        </div>
                      ) : (
                        documents.slice(0, 4).map(doc => (
                          <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <div className="doc-row">
                              <div className="doc-icon">📄</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="doc-name">{doc.name}</div>
                                <div className="doc-size">{fmtDate(doc.created_at)} · {fmtFileSize(doc.file_size)}</div>
                              </div>
                              <div className="doc-dl">⬇️</div>
                            </div>
                          </a>
                        ))
                      )}
                    </div>

                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
