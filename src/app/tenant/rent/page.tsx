'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────
type Profile = {
  id: string
  full_name: string
  email: string
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
}

type RentPayment = {
  id: string
  tenant_id: string
  unit_id: string
  amount: number
  due_date: string
  paid_date?: string
  status: string
  payment_method?: string
  note?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
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

function fmtMonth(s: string) {
  return new Date(s).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function isOverdue(p: RentPayment) {
  return p.status === 'pending' && new Date(p.due_date) < new Date()
}

function getDisplayStatus(p: RentPayment): 'paid' | 'overdue' | 'pending' {
  if (p.status === 'paid') return 'paid'
  if (isOverdue(p)) return 'overdue'
  return 'pending'
}

function daysUntilDue(dueDay: number) {
  const now = new Date()
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due.getTime() < now.getTime()) due = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return Math.ceil((due.getTime() - now.getTime()) / 86400000)
}

function getCurrentMonthPayment(payments: RentPayment[]) {
  const now = new Date()
  return payments.find(p => {
    const d = new Date(p.due_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }) || null
}

const STATUS_COLORS = {
  paid:    { bg: '#DCFCE7', color: '#16A34A', dot: '#16A34A' },
  overdue: { bg: '#FEE2E2', color: '#DC2626', dot: '#DC2626' },
  pending: { bg: '#FEF9C3', color: '#CA8A04', dot: '#CA8A04' },
}

export default function TenantRentPage() {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────────
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [tenantRow, setTenantRow]   = useState<TenantRow | null>(null)
  const [unit, setUnit]             = useState<Unit | null>(null)
  const [property, setProperty]     = useState<Property | null>(null)
  const [payments, setPayments]     = useState<RentPayment[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeRole, setActiveRole] = useState('tenant')

  // UI
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)
  const [filter, setFilter]                   = useState<'all' | 'paid' | 'pending' | 'overdue'>('all')
  const [showPayModal, setShowPayModal]       = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptPayment, setReceiptPayment]   = useState<RentPayment | null>(null)
  const [unreadCount, setUnreadCount]         = useState(0)

  // ── Load ───────────────────────────────────────────────────────────────
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

        const [{ data: unitData }, { data: propData }, { data: payData }, { data: msgData }] = await Promise.all([
          sb.from('units').select('*').eq('id', tRow.unit_id).single(),
          sb.from('properties').select('id,name').eq('id', tRow.property_id).single(),
          sb.from('rent_payments').select('*').eq('tenant_id', tRow.id).order('due_date', { ascending: false }),
          sb.from('messages').select('id,read').eq('receiver_id', user.id).eq('read', false),
        ])

        if (unitData) setUnit(unitData)
        if (propData) setProperty(propData)
        setPayments(payData || [])
        setUnreadCount((msgData || []).length)

      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [router])

  // ── Role switch ────────────────────────────────────────────────────────
  async function handleRoleSwitch(role: string) {
    if (!profile) return
    setActiveRole(role)
    setRolePopoverOpen(false)
    const sb = createClient()
    await sb.from('profiles').update({ active_role: role }).eq('id', profile.id).select()
    if (role === 'landlord') window.location.href = '/landlord'
    else if (role === 'seeker') window.location.href = '/seeker'
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const daysLeft     = unit ? daysUntilDue(unit.rent_due_day) : null
  const currentPay   = getCurrentMonthPayment(payments)
  const currentDs    = currentPay ? getDisplayStatus(currentPay) : 'pending'

  const totalPaid    = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const onTimeCount  = payments.filter(p => p.status === 'paid').length
  const overdueCount = payments.filter(p => isOverdue(p)).length

  const filtered = payments.filter(p => {
    if (filter === 'all') return true
    return getDisplayStatus(p) === filter
  })

  function openReceipt(p: RentPayment) {
    setReceiptPayment(p)
    setShowReceiptModal(true)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading payments...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;max-width:100vw}
        .shell{display:flex;min-height:100vh;position:relative}

        .sidebar{width:260px;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:200;transition:transform .25s ease}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
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
        .sb-uinfo{flex:1;min-width:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-uemail{font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-role-badge{display:inline-block;font-size:9.5px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:4px;padding:1px 6px;margin-top:2px}
        .sb-switch-ico{color:#64748B;flex-shrink:0}
        .role-popover{position:absolute;bottom:100%;left:12px;right:12px;background:#1E293B;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;margin-bottom:6px;box-shadow:0 20px 40px rgba(0,0,0,.4);z-index:300}
        .rp-title{font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 8px}
        .rp-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;color:#CBD5E1;font-size:13px;font-weight:500;transition:background .15s}
        .rp-item:hover{background:rgba(255,255,255,.06)}
        .rp-check{width:16px;height:16px;margin-left:auto;color:#2563EB}
        .rp-divider{height:1px;background:rgba(255,255,255,.06);margin:4px 0}

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:56px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}
        .breadcrumb b{color:#0F172A}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px}
        .notif-btn{width:34px;height:34px;border-radius:9px;background:#F1F5F9;border:none;cursor:pointer;font-size:15px;position:relative;display:flex;align-items:center;justify-content:center}
        .notif-dot{width:8px;height:8px;background:#DC2626;border-radius:50%;position:absolute;top:5px;right:5px;border:1.5px solid #fff}
        .content{padding:28px;flex:1}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}
        .sb-overlay.open{display:block}

        /* ── Hero ── */
        .rent-hero{background:linear-gradient(135deg,#0F172A 0%,#1E293B 55%,#1a3354 100%);border-radius:20px;padding:28px 32px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;position:relative;overflow:hidden}
        .rent-hero::before{content:'';position:absolute;top:-60px;right:-60px;width:240px;height:240px;background:radial-gradient(circle,rgba(99,102,241,.2),transparent 65%);pointer-events:none}
        .rh-label{font-size:12px;color:#64748B;margin-bottom:4px}
        .rh-amount{font-family:'Fraunces',serif;font-size:42px;font-weight:700;color:#fff;line-height:1;margin-bottom:6px}
        .rh-meta{font-size:13px;color:#64748B}
        .rh-right{text-align:right;flex-shrink:0}
        .rh-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:6px 14px;border-radius:99px;margin-bottom:14px}
        .pay-btn-big{padding:13px 28px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 16px rgba(37,99,235,.35);transition:opacity .15s}
        .pay-btn-big:hover{opacity:.9}
        .pay-btn-big.paid{background:linear-gradient(135deg,#16A34A,#15803D);box-shadow:0 4px 16px rgba(22,163,74,.3)}

        /* ── Stats ── */
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}
        .stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .stat-val{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:4px}
        .stat-label{font-size:11px;color:#94A3B8;font-weight:500}
        .stat-sub{font-size:12px;font-weight:600;margin-top:5px}

        /* ── Payment list ── */
        .list-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px}
        .ftab{padding:7px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .ftab.active{background:#2563EB;color:#fff}
        .ftab:hover:not(.active){background:#F1F5F9;color:#0F172A}

        .payment-list{display:flex;flex-direction:column;gap:10px}
        .payment-row{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 4px rgba(15,23,42,.04);transition:all .18s}
        .payment-row:hover{border-color:#BFDBFE;box-shadow:0 4px 16px rgba(37,99,235,.08);transform:translateY(-1px)}
        .pr-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
        .pr-info{flex:1;min-width:0}
        .pr-month{font-size:14px;font-weight:700;color:#0F172A}
        .pr-dates{display:flex;gap:14px;flex-wrap:wrap;margin-top:3px}
        .pr-date{font-size:12px;color:#94A3B8}
        .pr-date strong{color:#475569}
        .pr-method{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .pr-right{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
        .pr-amount{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A}
        .badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px}
        .pr-action{padding:7px 14px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;transition:all .15s}
        .btn-pay{border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;box-shadow:0 2px 8px rgba(37,99,235,.25)}
        .btn-pay:hover{opacity:.9}
        .btn-receipt{border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569}
        .btn-receipt:hover{border-color:#BFDBFE;color:#2563EB}

        .empty-state{text-align:center;padding:60px 24px;color:#94A3B8}
        .empty-icon{font-size:40px;margin-bottom:12px}
        .empty-text{font-size:14px;font-weight:600;color:#475569}

        /* ── Modals ── */
        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:22px;padding:32px 28px;width:100%;max-width:400px;box-shadow:0 24px 60px rgba(15,23,42,.2);text-align:center}
        .modal-icon{font-size:44px;margin-bottom:14px}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .modal-sub{font-size:14px;color:#64748B;line-height:1.65;margin-bottom:24px}
        .modal-close{width:100%;padding:12px;border-radius:12px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* Receipt modal */
        .receipt{background:#fff;border-radius:22px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 24px 60px rgba(15,23,42,.2)}
        .receipt-header{text-align:center;padding-bottom:20px;border-bottom:1px solid #E2E8F0;margin-bottom:20px}
        .receipt-icon{font-size:36px;margin-bottom:8px}
        .receipt-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .receipt-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;background:#DCFCE7;color:#16A34A}
        .receipt-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F1F5F9}
        .receipt-row:last-of-type{border-bottom:none}
        .receipt-key{font-size:12px;color:#94A3B8;font-weight:500}
        .receipt-val{font-size:13px;font-weight:700;color:#0F172A}
        .receipt-amount{font-family:'Fraunces',serif;font-size:32px;font-weight:700;color:#16A34A;text-align:center;margin:16px 0}

        @media(min-width:1100px){.stats{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:16px}
          .rent-hero{padding:20px}
          .rh-right{width:100%}
          .stats{grid-template-columns:repeat(2,1fr)}
          .payment-row{flex-wrap:wrap}
          .pr-right{align-items:flex-start;width:100%;flex-direction:row;justify-content:space-between}
        }
        @media(max-width:480px){
          .rh-amount{font-size:32px}
          .stats{grid-template-columns:1fr 1fr}
        }
      `}</style>

      {/* Sidebar overlay */}
      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Coming Soon Modal */}
      <div className={`modal-overlay${showPayModal ? ' open' : ''}`} onClick={() => setShowPayModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-icon">💳</div>
          <div className="modal-title">Online Payments Coming Soon</div>
          <div className="modal-sub">
            We're building Stripe-powered rent payments right now. In the meantime, please pay via your agreed method with your landlord.
          </div>
          <button className="modal-close" onClick={() => setShowPayModal(false)}>Got it</button>
        </div>
      </div>

      {/* Receipt Modal */}
      <div className={`modal-overlay${showReceiptModal ? ' open' : ''}`} onClick={() => setShowReceiptModal(false)}>
        {receiptPayment && (
          <div className="receipt" onClick={e => e.stopPropagation()}>
            <div className="receipt-header">
              <div className="receipt-icon">🧾</div>
              <div className="receipt-title">Payment Receipt</div>
              <div style={{ marginTop: 6 }}>
                <span className="receipt-status">✓ Paid</span>
              </div>
            </div>
            <div className="receipt-amount">{fmtCurrency(receiptPayment.amount, unit?.currency)}</div>
            <div className="receipt-row">
              <span className="receipt-key">Period</span>
              <span className="receipt-val">{fmtMonth(receiptPayment.due_date)}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Due Date</span>
              <span className="receipt-val">{fmtDate(receiptPayment.due_date)}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Paid On</span>
              <span className="receipt-val">{fmtDate(receiptPayment.paid_date)}</span>
            </div>
            {receiptPayment.payment_method && (
              <div className="receipt-row">
                <span className="receipt-key">Method</span>
                <span className="receipt-val">{receiptPayment.payment_method}</span>
              </div>
            )}
            <div className="receipt-row">
              <span className="receipt-key">Property</span>
              <span className="receipt-val">{property?.name || '—'}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Unit</span>
              <span className="receipt-val">Unit {unit?.unit_number || '—'}</span>
            </div>
            {receiptPayment.note && (
              <div className="receipt-row">
                <span className="receipt-key">Note</span>
                <span className="receipt-val" style={{ fontStyle: 'italic', color: '#64748B' }}>{receiptPayment.note}</span>
              </div>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button className="modal-close" onClick={() => setShowReceiptModal(false)}>Close</button>
            </div>
          </div>
        )}
      </div>

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">🏘️</div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item active"><span className="sb-ico">💰</span> Rent & Payments</a>
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

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Rent & Payments</b></div>
            </div>
            <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
              🔔
              {unreadCount > 0 && <div className="notif-dot" />}
            </button>
          </div>

          <div className="content">

            {/* Hero */}
            <div className="rent-hero">
              <div>
                <div className="rh-label">
                  {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                  {property && ` · ${property.name}`}
                  {unit && ` · Unit ${unit.unit_number}`}
                </div>
                <div className="rh-amount">{unit ? fmtCurrency(unit.monthly_rent, unit.currency) : '—'}</div>
                <div className="rh-meta">Due on the {unit?.rent_due_day || '—'}{unit?.rent_due_day === 1 ? 'st' : unit?.rent_due_day === 2 ? 'nd' : unit?.rent_due_day === 3 ? 'rd' : 'th'} of each month</div>
              </div>
              <div className="rh-right">
                <div>
                  <div className="rh-pill" style={{
                    background: currentDs === 'paid' ? 'rgba(16,185,129,.15)' : currentDs === 'overdue' ? 'rgba(220,38,38,.15)' : 'rgba(251,191,36,.15)',
                    color: currentDs === 'paid' ? '#34D399' : currentDs === 'overdue' ? '#FCA5A5' : '#FCD34D',
                    border: `1px solid ${currentDs === 'paid' ? 'rgba(16,185,129,.25)' : currentDs === 'overdue' ? 'rgba(220,38,38,.25)' : 'rgba(251,191,36,.25)'}`,
                  }}>
                    {currentDs === 'paid' ? '✓ Paid this month' : currentDs === 'overdue' ? '⚠️ Overdue' : daysLeft !== null ? `⏳ Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : '⏳ Pending'}
                  </div>
                </div>
                <button
                  className={`pay-btn-big${currentDs === 'paid' ? ' paid' : ''}`}
                  onClick={() => currentDs !== 'paid' && setShowPayModal(true)}
                >
                  {currentDs === 'paid' ? '✓ Paid This Month' : '💳 Pay Rent Now'}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="stats">
              <div className="stat-card">
                <div className="stat-val">{fmtCurrency(totalPaid, unit?.currency)}</div>
                <div className="stat-label">Total Paid (All Time)</div>
                <div className="stat-sub" style={{ color: '#16A34A' }}>{onTimeCount} payment{onTimeCount !== 1 ? 's' : ''}</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: '#16A34A' }}>{onTimeCount}</div>
                <div className="stat-label">On-time Payments</div>
                <div className="stat-sub" style={{ color: '#64748B' }}>
                  {payments.length > 0 ? `${Math.round((onTimeCount / payments.length) * 100)}% rate` : '—'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: overdueCount > 0 ? '#DC2626' : '#0F172A' }}>{overdueCount}</div>
                <div className="stat-label">Overdue Payments</div>
                <div className="stat-sub" style={{ color: overdueCount > 0 ? '#DC2626' : '#16A34A' }}>
                  {overdueCount > 0 ? 'Action needed' : 'All clear ✓'}
                </div>
              </div>
            </div>

            {/* Payment list */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(15,23,42,.04)' }}>
              <div className="list-header">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#94A3B8' }}>
                  Payment History · {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                </div>
                <div className="filter-tabs">
                  {(['all', 'paid', 'pending', 'overdue'] as const).map(f => (
                    <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">💳</div>
                  <div className="empty-text">No {filter !== 'all' ? filter : ''} payments found</div>
                </div>
              ) : (
                <div className="payment-list">
                  {filtered.map(p => {
                    const ds = getDisplayStatus(p)
                    const sc = STATUS_COLORS[ds]
                    const icon = ds === 'paid' ? '✅' : ds === 'overdue' ? '⚠️' : '⏳'
                    return (
                      <div key={p.id} className="payment-row">
                        <div className="pr-icon" style={{ background: sc.bg }}>{icon}</div>
                        <div className="pr-info">
                          <div className="pr-month">{fmtMonth(p.due_date)}</div>
                          <div className="pr-dates">
                            <span className="pr-date"><strong>Due:</strong> {fmtDate(p.due_date)}</span>
                            {p.paid_date && <span className="pr-date"><strong>Paid:</strong> {fmtDate(p.paid_date)}</span>}
                          </div>
                          {p.payment_method && <div className="pr-method">via {p.payment_method}</div>}
                          {p.note && <div className="pr-method" style={{ fontStyle: 'italic' }}>"{p.note}"</div>}
                        </div>
                        <div className="pr-right">
                          <div className="pr-amount">{fmtCurrency(p.amount, unit?.currency)}</div>
                          <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                            {ds.charAt(0).toUpperCase() + ds.slice(1)}
                          </span>
                          {ds === 'paid'
                            ? <button className="pr-action btn-receipt" onClick={() => openReceipt(p)}>🧾 Receipt</button>
                            : <button className="pr-action btn-pay" onClick={() => setShowPayModal(true)}>💳 Pay Now</button>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
