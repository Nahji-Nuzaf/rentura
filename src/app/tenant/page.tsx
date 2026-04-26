'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

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
  landlord_id: string
}

type RentPayment = {
  id: string
  tenant_id: string
  amount: number
  due_date: string
  paid_date?: string
  status: string
}

type MaintenanceRequest = {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
}

type Message = {
  id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
  sender_name?: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTimeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function daysUntilDue(dueDay: number) {
  const now = new Date()
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due.getTime() < now.getTime()) {
    due = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  }
  return Math.ceil((due.getTime() - now.getTime()) / 86400000)
}

function leaseProgress(start?: string, end?: string) {
  if (!start || !end) return { pct: 0, dLeft: null }
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const n = Date.now()
  const pct = Math.min(100, Math.max(0, Math.round(((n - s) / (e - s)) * 100)))
  const dLeft = Math.ceil((e - n) / 86400000)
  return { pct, dLeft }
}

function isOverdue(p: RentPayment) {
  return p.status === 'pending' && new Date(p.due_date) < new Date()
}

function getCurrentMonthPayment(payments: RentPayment[]) {
  const now = new Date()
  return payments.find(p => {
    const d = new Date(p.due_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }) || null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#DC2626', medium: '#D97706', low: '#16A34A'
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  open: { bg: '#FEE2E2', color: '#DC2626' },
  in_progress: { bg: '#FEF9C3', color: '#CA8A04' },
  resolved: { bg: '#DCFCE7', color: '#16A34A' },
}

export default function TenantDashboard() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tenantRow, setTenantRow] = useState<TenantRow | null>(null)
  const [unit, setUnit] = useState<Unit | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [landlord, setLandlord] = useState<Profile | null>(null)
  const [payments, setPayments] = useState<RentPayment[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)
  const [activeRole, setActiveRole] = useState('tenant')
  const [showPayModal, setShowPayModal] = useState(false)

  // ── Link new property modal ──
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkCode, setLinkCode] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkSuccess, setLinkSuccess] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  async function loadDashboard(userId: string) {
    const sb = createClient()

    const { data: tRow } = await sb
      .from('tenants')
      .select('*')
      .eq('profile_id', userId)
      .eq('invite_accepted', true)
      .single()

    if (!tRow) { setLoading(false); return }
    setTenantRow(tRow)

    const { data: unitData } = await sb.from('units').select('*').eq('id', tRow.unit_id).single()
    if (unitData) setUnit(unitData)

    const { data: propData } = await sb.from('properties').select('id,name,address,landlord_id').eq('id', tRow.property_id).single()
    if (propData) setProperty(propData)

    if (propData?.landlord_id) {
      const { data: llData } = await sb.from('profiles').select('id,full_name,email,avatar_url').eq('id', propData.landlord_id).single()
      if (llData) setLandlord(llData)
    }

    const { data: payData } = await sb.from('rent_payments')
      .select('*').eq('tenant_id', tRow.id)
      .order('due_date', { ascending: false }).limit(6)
    setPayments(payData || [])

    const { data: maintData } = await sb.from('maintenance_requests')
      .select('id,title,status,priority,created_at')
      .eq('tenant_id', tRow.id)
      .order('created_at', { ascending: false }).limit(5)
    setMaintenance(maintData || [])

    const { data: msgData } = await sb.from('messages')
      .select('*').eq('receiver_id', userId)
      .order('created_at', { ascending: false }).limit(5)

    const senderIds = [...new Set((msgData || []).map((m: any) => m.sender_id))]
    const senderMap: Record<string, string> = {}
    if (senderIds.length) {
      const { data: senders } = await sb.from('profiles').select('id,full_name').in('id', senderIds as string[])
        ; (senders || []).forEach((s: any) => { senderMap[s.id] = s.full_name })
    }
    setMessages((msgData || []).map((m: any) => ({ ...m, sender_name: senderMap[m.sender_id] || 'Unknown' })))
  }

  useEffect(() => {
    ; (async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) { setProfile(prof); setActiveRole(prof.active_role || 'tenant') }

        await loadDashboard(user.id)
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

  // ── Link new property with invite code ──
  async function handleLinkProperty() {
    if (!linkCode.trim()) { setLinkError('Please enter an invite code.'); return }
    if (!profile) return
    setLinkLoading(true); setLinkError(''); setLinkSuccess('')

    const sb = createClient()

    const { data: tenantRow, error: invErr } = await sb
      .from('tenants')
      .select('id, unit_id, property_id, invite_accepted')
      .eq('invite_token', linkCode.trim().toUpperCase())
      .single()

    if (invErr || !tenantRow) {
      setLinkError('Invalid invite code. Please check with your landlord.')
      setLinkLoading(false); return
    }

    if (tenantRow.invite_accepted) {
      setLinkError('This invite code has already been used.')
      setLinkLoading(false); return
    }

    const { error: updateErr } = await sb.from('tenants').update({
      profile_id: profile.id,
      invite_accepted: true,
      status: 'active',
    }).eq('id', tenantRow.id)

    if (updateErr) {
      setLinkError('Failed to link property. Please try again.')
      setLinkLoading(false); return
    }

    await sb.from('units').update({ status: 'occupied' }).eq('id', tenantRow.unit_id)

    setLinkSuccess('✅ Property linked successfully! Reloading...')
    setTimeout(() => {
      setShowLinkModal(false)
      setLinkCode('')
      setLinkSuccess('')
      window.location.reload()
    }, 1500)

    setLinkLoading(false)
  }

  const daysLeft = unit ? daysUntilDue(unit.rent_due_day) : null
  const { pct, dLeft: leaseDaysLeft } = leaseProgress(unit?.lease_start, unit?.lease_end)
  const currentPay = getCurrentMonthPayment(payments)
  const unreadCount = messages.filter(m => !m.read).length
  const openMaint = maintenance.filter(m => m.status !== 'resolved').length
  const currentPayStatus = currentPay
    ? (isOverdue(currentPay) ? 'overdue' : currentPay.status)
    : 'none'

  const payStatusStyle = ({
    paid: { label: '✓ Paid', bg: '#DCFCE7', color: '#16A34A' },
    pending: { label: '⏳ Pending', bg: '#FEF9C3', color: '#CA8A04' },
    overdue: { label: '⚠️ Overdue', bg: '#FEE2E2', color: '#DC2626' },
    none: { label: '—', bg: '#F1F5F9', color: '#64748B' },
  } as any)[currentPayStatus] ?? { label: '—', bg: '#F1F5F9', color: '#64748B' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading your dashboard...
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
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-role-wrap{position:relative;padding:12px}
        .sb-user{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .15s}
        .sb-user:hover{background:rgba(255,255,255,.06)}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uinfo{flex:1;min-width:0}
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

        /* ── HERO ── */
        .hero{background:linear-gradient(135deg,#0F172A 0%,#1E293B 55%,#1a3354 100%);border-radius:20px;padding:24px 28px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;position:relative;overflow:hidden;flex-wrap:wrap;gap:20px}
        .hero::before{content:'';position:absolute;top:-60px;right:-60px;width:260px;height:260px;background:radial-gradient(circle,rgba(99,102,241,.2),transparent 65%);pointer-events:none}
        .hero::after{content:'';position:absolute;bottom:-40px;left:30%;width:180px;height:180px;background:radial-gradient(circle,rgba(59,130,246,.12),transparent 65%);pointer-events:none}
        .hero-greeting{font-size:13px;color:#64748B;margin-bottom:4px}
        .hero-name{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#fff;margin-bottom:10px}
        .hero-chips{display:flex;gap:8px;flex-wrap:wrap}
        .hero-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#CBD5E1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:5px 11px}
        .hero-right{text-align:right;flex-shrink:0}
        .hero-rent-label{font-size:12px;color:#64748B;margin-bottom:4px}
        .hero-rent{font-family:'Fraunces',serif;font-size:32px;font-weight:700;color:#fff;line-height:1}
        .hero-rent-sub{font-size:12px;color:#64748B;margin-top:4px}
        .hero-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;margin-top:8px}

        /* ── QUICK ACTIONS ── */
        .quick-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
        .qa-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .18s;box-shadow:0 1px 4px rgba(15,23,42,.04);text-decoration:none;display:block}
        .qa-card:hover{border-color:#BFDBFE;box-shadow:0 6px 20px rgba(37,99,235,.1);transform:translateY(-2px)}
        .qa-icon{font-size:22px;margin-bottom:6px}
        .qa-label{font-size:12px;font-weight:700;color:#475569}

        /* ── STATS ── */
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
        .stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .stat-icon{font-size:18px;margin-bottom:7px}
        .stat-val{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:3px}
        .stat-label{font-size:11px;color:#94A3B8;font-weight:500}
        .stat-sub{font-size:11.5px;font-weight:600;margin-top:5px}

        /* ── BOTTOM GRID ── */
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8}
        .card-action{font-size:12.5px;font-weight:600;color:#2563EB;cursor:pointer;text-decoration:none;background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif}
        .rent-amount{font-family:'Fraunces',serif;font-size:34px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .rent-meta{font-size:13px;color:#64748B;margin-bottom:16px}
        .pay-btn{width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 14px rgba(37,99,235,.3);transition:opacity .15s}
        .pay-btn:hover{opacity:.9}
        .pay-btn.paid{background:linear-gradient(135deg,#16A34A,#15803D);box-shadow:0 4px 14px rgba(22,163,74,.25)}
        .lease-dates{display:flex;justify-content:space-between;font-size:12px;color:#64748B;margin-bottom:7px}
        .lease-bar-bg{height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin-bottom:6px}
        .lease-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#2563EB,#6366F1)}
        .lease-pct-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px}
        .lease-status{padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#16A34A}
        .tl{display:flex;flex-direction:column;gap:7px}
        .tl-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:11px}
        .tl-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
        .tl-month{font-size:13px;font-weight:600;color:#0F172A;flex:1}
        .tl-amount{font-size:13px;font-weight:700;color:#0F172A;margin-right:8px}
        .tl-badge{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px}
        .maint-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:11px;margin-bottom:7px}
        .maint-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .maint-title{font-size:13px;font-weight:600;color:#0F172A;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .maint-badge{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap}
        .msg-row{display:flex;gap:10px;padding:11px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:7px}
        .msg-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .msg-from{font-size:13px;font-weight:700;color:#0F172A}
        .msg-text{font-size:12px;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .msg-time{font-size:11px;color:#94A3B8;margin-top:2px}
        .msg-unread{width:8px;height:8px;background:#2563EB;border-radius:50%;flex-shrink:0;margin-top:4px}
        .no-tenant{text-align:center;padding:80px 24px;color:#94A3B8}
        .no-tenant-icon{font-size:48px;margin-bottom:16px}
        .no-tenant-title{font-family:'Fraunces',serif;font-size:22px;color:#475569;margin-bottom:8px}
        .no-tenant-sub{font-size:14px;line-height:1.6}

        /* ── MODALS ── */
        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:22px;padding:32px 28px;width:100%;max-width:400px;box-shadow:0 24px 60px rgba(15,23,42,.2)}
        .modal-icon{font-size:44px;margin-bottom:14px;text-align:center}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:6px;text-align:center}
        .modal-sub{font-size:13.5px;color:#64748B;line-height:1.65;margin-bottom:20px;text-align:center}
        .modal-inp{width:100%;padding:13px 16px;border-radius:12px;border:1.5px solid #E2E8F0;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#F8FAFC;outline:none;text-transform:uppercase;letter-spacing:3px;font-weight:700;text-align:center;transition:border .15s;margin-bottom:10px}
        .modal-inp:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.1);background:#fff}
        .modal-btn{width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:10px;box-shadow:0 4px 14px rgba(37,99,235,.3)}
        .modal-btn:disabled{opacity:.6;cursor:not-allowed}
        .modal-cancel{width:100%;padding:11px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .modal-error{background:#FEE2E2;border:1px solid #FECACA;border-radius:10px;padding:10px 14px;font-size:13px;color:#DC2626;font-weight:600;margin-bottom:12px;text-align:center}
        .modal-success{background:#DCFCE7;border:1px solid #BBF7D0;border-radius:10px;padding:10px 14px;font-size:13px;color:#16A34A;font-weight:600;margin-bottom:12px;text-align:center}

        /* ── LINK BANNER ── */
        .link-banner{background:linear-gradient(135deg,rgba(37,99,235,.06),rgba(99,102,241,.06));border:1px solid rgba(37,99,235,.15);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .link-btn{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0}

        /* ════════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
           ════════════════════════════════════════════ */

        /* ── LARGE DESKTOP (1280px+) ── already handled by base styles above ── */

        /* ── TABLET LANDSCAPE + SMALL DESKTOP (1024px – 1279px) ── */
        @media(max-width:1279px){
          .stats{grid-template-columns:repeat(2,1fr)}
        }

        /* ── TABLET PORTRAIT (768px – 1023px) ── */
        @media(max-width:1023px){
          /* Sidebar becomes an off-canvas drawer */
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:18px 16px}

          /* Hero stays 2-col but tightens */
          .hero{padding:20px 22px;gap:16px}
          .hero-name{font-size:22px}
          .hero-rent{font-size:26px}

          /* Quick actions: 4 cols on tablet */
          .quick-actions{grid-template-columns:repeat(4,1fr);gap:8px}

          /* Stats: 2x2 on tablet */
          .stats{grid-template-columns:repeat(2,1fr)}

          /* Bottom grid stays 2-col on tablet landscape */
          .grid2{grid-template-columns:1fr 1fr;gap:12px}
        }

        /* ── TABLET PORTRAIT NARROW (600px – 767px) ── */
        @media(max-width:767px){
          .content{padding:14px 14px}
          .hero{padding:18px 18px;flex-direction:column;align-items:flex-start;gap:14px}
          .hero-right{text-align:left;width:100%}
          .hero-rent{font-size:28px}

          /* Quick actions: 2x2 */
          .quick-actions{grid-template-columns:repeat(2,1fr);gap:8px}

          /* Stats: 2x2 */
          .stats{grid-template-columns:repeat(2,1fr);gap:8px}

          /* Bottom grid: single column */
          .grid2{grid-template-columns:1fr;gap:12px}

          /* Link banner stacks */
          .link-banner{flex-direction:column;align-items:flex-start}
          .link-btn{width:100%;text-align:center}
        }

        /* ── MOBILE (up to 599px) ── */
        @media(max-width:599px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
          .hero{padding:16px 16px;border-radius:16px}
          .hero-name{font-size:20px}
          .hero-rent{font-size:26px}
          .hero-chip{font-size:11px;padding:4px 9px}

          /* Quick actions: 2x2 */
          .quick-actions{grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}
          .qa-card{padding:14px 10px}
          .qa-icon{font-size:20px;margin-bottom:4px}

          /* Stats: 2x2, compact */
          .stats{grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}
          .stat-card{padding:13px 12px}
          .stat-val{font-size:20px}

          /* Cards compact */
          .card{padding:14px}
          .rent-amount{font-size:28px}
          .modal{padding:24px 20px}
          .modal-title{font-size:19px}
        }

        /* ── VERY SMALL MOBILE (up to 380px) ── */
        @media(max-width:380px){
          .hero-name{font-size:18px}
          .hero-rent{font-size:22px}
          .qa-label{font-size:11px}
          .stat-val{font-size:18px}
          .content{padding:10px 10px}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Pay Modal */}
      <div className={`modal-overlay${showPayModal ? ' open' : ''}`} onClick={() => setShowPayModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-icon">💳</div>
          <div className="modal-title">Online Payments Coming Soon</div>
          <div className="modal-sub">We're building Stripe-powered rent payments. In the meantime, please pay via your agreed method with your landlord.</div>
          <button className="modal-cancel" onClick={() => setShowPayModal(false)}>Got it</button>
        </div>
      </div>

      {/* Link New Property Modal */}
      <div className={`modal-overlay${showLinkModal ? ' open' : ''}`} onClick={() => { setShowLinkModal(false); setLinkCode(''); setLinkError(''); setLinkSuccess('') }}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-icon">🔑</div>
          <div className="modal-title">Link New Property</div>
          <div className="modal-sub">Enter the invite code your new landlord sent you to link your account to the new unit.</div>

          {linkError && <div className="modal-error">⚠️ {linkError}</div>}
          {linkSuccess && <div className="modal-success">{linkSuccess}</div>}

          <input
            className="modal-inp"
            placeholder="XXXXXX"
            value={linkCode}
            onChange={e => { setLinkCode(e.target.value.toUpperCase()); setLinkError('') }}
            maxLength={10}
          />

          <button className="modal-btn" disabled={linkLoading || !!linkSuccess} onClick={handleLinkProperty}>
            {linkLoading ? 'Verifying...' : 'Link Property →'}
          </button>
          <button className="modal-cancel" onClick={() => { setShowLinkModal(false); setLinkCode(''); setLinkError(''); setLinkSuccess('') }}>
            Cancel
          </button>
        </div>
      </div>

      <div className="shell">
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
            <a href="/tenant" className="sb-item active"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item"><span className="sb-ico">🔧</span> Maintenance</a>
            <a href="/tenant/documents" className="sb-item"><span className="sb-ico">📁</span> Documents</a>
            <a href="/tenant/messages" className="sb-item">
              <span className="sb-ico">💬</span> Messages
              {unreadCount > 0 && <span className="sb-count">{unreadCount}</span>}
            </a>
            <span className="sb-section">Account</span>
            <a href="/tenant/settings" className="sb-item"><span className="sb-ico">⚙️</span> Settings</a>
          </nav>
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

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Dashboard</b></div>
            </div>
            <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
              🔔
              {unreadCount > 0 && <div className="notif-dot" />}
            </button>
          </div>

          <div className="content">
            {!tenantRow ? (
              // ── No tenancy: show invite code entry ──
              <div className="no-tenant">
                <div className="no-tenant-icon">🏠</div>
                <div className="no-tenant-title">No Active Tenancy Found</div>
                <div className="no-tenant-sub">
                  You don't have an active tenancy linked to your account.<br />
                  Enter the invite code your landlord sent you.
                </div>
                <button
                  onClick={() => setShowLinkModal(true)}
                  style={{ marginTop: 24, padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 4px 14px rgba(37,99,235,.3)' }}>
                  🔑 Enter Invite Code
                </button>
              </div>
            ) : (
              <>
                {/* Link New Property Banner */}
                <div className="link-banner">
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E40AF', marginBottom: 3 }}>🔑 Moving to a new property?</div>
                    <div style={{ fontSize: 12.5, color: '#64748B' }}>Got a new invite code from a landlord? Link your account to the new unit.</div>
                  </div>
                  <button className="link-btn" onClick={() => setShowLinkModal(true)}>
                    Link New Property
                  </button>
                </div>

                {/* Hero */}
                <div className="hero">
                  <div>
                    <div className="hero-greeting">{greeting()},</div>
                    <div className="hero-name">{profile?.full_name || 'Tenant'} 👋</div>
                    <div className="hero-chips">
                      {property && <span className="hero-chip">🏠 {property.name}</span>}
                      {unit && <span className="hero-chip">🚪 {unit.unit_number}</span>}
                      {landlord && <span className="hero-chip">👤 {landlord.full_name}</span>}
                    </div>
                  </div>
                  <div className="hero-right">
                    <div className="hero-rent-label">Monthly Rent</div>
                    <div className="hero-rent">{unit ? fmtCurrency(unit.monthly_rent, unit.currency) : '—'}</div>
                    <div className="hero-rent-sub">Due on the {unit?.rent_due_day || '—'}th each month</div>
                    {daysLeft !== null && (
                      <div className="hero-pill" style={{
                        background: daysLeft <= 3 ? 'rgba(220,38,38,.15)' : 'rgba(251,191,36,.15)',
                        color: daysLeft <= 3 ? '#FCA5A5' : '#FCD34D',
                        border: `1px solid ${daysLeft <= 3 ? 'rgba(220,38,38,.25)' : 'rgba(251,191,36,.25)'}`
                      }}>
                        {daysLeft <= 0 ? '⚠️ Rent overdue' : `⏳ Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="quick-actions">
                  <div className="qa-card" onClick={() => setShowPayModal(true)}>
                    <div className="qa-icon">💳</div>
                    <div className="qa-label">Pay Rent</div>
                  </div>
                  <a href="/tenant/maintenance" className="qa-card">
                    <div className="qa-icon">🔧</div>
                    <div className="qa-label">Request Repair</div>
                  </a>
                  <a href="/tenant/messages" className="qa-card">
                    <div className="qa-icon">💬</div>
                    <div className="qa-label">Message Landlord</div>
                  </a>
                  <a href="/tenant/documents" className="qa-card">
                    <div className="qa-icon">📄</div>
                    <div className="qa-label">View Documents</div>
                  </a>
                </div>

                {/* Stats */}
                <div className="stats">
                  <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-val" style={{ color: daysLeft !== null && daysLeft <= 3 ? '#DC2626' : daysLeft !== null && daysLeft <= 7 ? '#D97706' : '#0F172A' }}>
                      {daysLeft !== null ? `${daysLeft}d` : '—'}
                    </div>
                    <div className="stat-label">Until Rent Due</div>
                    <div className="stat-sub" style={{ color: '#64748B' }}>Day {unit?.rent_due_day} of month</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💳</div>
                    <div className="stat-val" style={{ color: payStatusStyle.color }}>{payStatusStyle.label}</div>
                    <div className="stat-label">This Month</div>
                    <div className="stat-sub" style={{ color: '#64748B' }}>{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📋</div>
                    <div className="stat-val">{pct}%</div>
                    <div className="stat-label">Lease Complete</div>
                    <div className="stat-sub" style={{ color: '#2563EB' }}>
                      {leaseDaysLeft !== null ? `${leaseDaysLeft}d remaining` : 'No lease dates'}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🔧</div>
                    <div className="stat-val" style={{ color: openMaint > 0 ? '#D97706' : '#16A34A' }}>{openMaint}</div>
                    <div className="stat-label">Open Requests</div>
                    <div className="stat-sub" style={{ color: '#64748B' }}>{maintenance.length} total</div>
                  </div>
                </div>

                {/* Bottom grid */}
                <div className="grid2">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Current Month Rent</div>
                        <a href="/tenant/rent" className="card-action">View All →</a>
                      </div>
                      <div className="rent-amount">{unit ? fmtCurrency(unit.monthly_rent, unit.currency) : '—'}</div>
                      <div className="rent-meta">
                        Due day {unit?.rent_due_day} · {daysLeft !== null && daysLeft > 0 ? `${daysLeft} days away` : daysLeft === 0 ? 'Due today' : 'Overdue'}
                      </div>
                      <button className={`pay-btn${currentPayStatus === 'paid' ? ' paid' : ''}`}
                        onClick={() => currentPayStatus !== 'paid' && setShowPayModal(true)}>
                        {currentPayStatus === 'paid' ? '✓ Paid This Month' : '💳 Pay Rent Now'}
                      </button>
                    </div>

                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Lease Progress</div>
                        <a href="/tenant/lease" className="card-action">View Lease →</a>
                      </div>
                      {unit?.lease_start && unit?.lease_end ? (
                        <>
                          <div className="lease-dates">
                            <span>{fmtDate(unit.lease_start)}</span>
                            <span>{fmtDate(unit.lease_end)}</span>
                          </div>
                          <div className="lease-bar-bg">
                            <div className="lease-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="lease-pct-row">
                            <span style={{ color: '#64748B' }}>{pct}% elapsed</span>
                            <span style={{ color: '#2563EB', fontWeight: 700 }}>
                              {leaseDaysLeft !== null && leaseDaysLeft > 0 ? `${leaseDaysLeft} days left` : 'Expired'}
                            </span>
                          </div>
                          <div className="lease-status">✅ Lease is active and in good standing</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', padding: '12px 0' }}>No lease dates set yet — contact your landlord</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Recent Payments</div>
                        <a href="/tenant/rent" className="card-action">View All →</a>
                      </div>
                      {payments.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>No payment records yet</div>
                      ) : (
                        <div className="tl">
                          {payments.slice(0, 3).map(p => {
                            const ds = p.status === 'paid' ? 'paid' : isOverdue(p) ? 'overdue' : 'pending'
                            const colors = { paid: { bg: '#DCFCE7', color: '#16A34A' }, overdue: { bg: '#FEE2E2', color: '#DC2626' }, pending: { bg: '#FEF9C3', color: '#CA8A04' } }[ds]
                            const month = new Date(p.due_date).toLocaleString('en-US', { month: 'short', year: 'numeric' })
                            return (
                              <div key={p.id} className="tl-row">
                                <div className="tl-dot" style={{ background: colors.bg, color: colors.color }}>
                                  {ds === 'paid' ? '✓' : ds === 'overdue' ? '!' : '○'}
                                </div>
                                <div className="tl-month">{month}</div>
                                <div className="tl-amount">{fmtCurrency(p.amount, unit?.currency)}</div>
                                <span className="tl-badge" style={{ background: colors.bg, color: colors.color }}>
                                  {ds.charAt(0).toUpperCase() + ds.slice(1)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Maintenance</div>
                        <a href="/tenant/maintenance" className="card-action">+ New Request</a>
                      </div>
                      {maintenance.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>No requests yet</div>
                      ) : maintenance.slice(0, 3).map(m => {
                        const ss = STATUS_STYLE[m.status] || STATUS_STYLE.open
                        return (
                          <div key={m.id} className="maint-row">
                            <div className="maint-dot" style={{ background: PRIORITY_COLOR[m.priority] || '#94A3B8' }} />
                            <div className="maint-title">{m.title}</div>
                            <span className="maint-badge" style={{ background: ss.bg, color: ss.color }}>
                              {m.status === 'in_progress' ? 'In Progress' : m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">
                          Messages
                          {unreadCount > 0 && <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, marginLeft: 6 }}>{unreadCount}</span>}
                        </div>
                        <a href="/tenant/messages" className="card-action">View All →</a>
                      </div>
                      {messages.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>No messages yet</div>
                      ) : messages.slice(0, 2).map(msg => (
                        <div key={msg.id} className="msg-row">
                          <div className="msg-av">{initials(msg.sender_name || 'U')}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="msg-from">{msg.sender_name}</div>
                            <div className="msg-text">
                              {msg.content.length > 60
                                ? `${msg.content.substring(0, 60)}...`
                                : msg.content}
                            </div>
                            <div className="msg-time">{fmtTimeAgo(msg.created_at)}</div>
                          </div>
                          {!msg.read && <div className="msg-unread" />}
                        </div>
                      ))}
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
