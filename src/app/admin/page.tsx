'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Stats = {
  totalUsers: number; totalProperties: number; proUsers: number
  totalListings: number; openMaintenance: number; mrr: string
  freeUsers: number; conversionRate: number; arr: string
}
type User = {
  id: string; full_name: string; email: string; active_role: string
  roles: string[]; phone: string; created_at: string
  subscription: { plan: string; status: string } | null
}
type Property = {
  id: string; name: string; city: string; country: string; type: string
  status: string; total_units: number; created_at: string; landlord_id: string
  profiles: { full_name: string; email: string }
}
type Subscription = {
  profile_id: string; plan: string; status: string
  stripe_customer_id: string; stripe_subscription_id: string; created_at: string
  profiles: { full_name: string; email: string }
}
type Listing = {
  id: string; title: string; status: string; rent_amount: number; created_at: string
  profiles: { full_name: string; email: string }
  properties: { name: string; city: string }
}
type MaintenanceReq = {
  id: string; title: string; status: string; priority: string; created_at: string
  properties: { name: string }
}
type Tab = 'overview' | 'users' | 'properties' | 'subscriptions' | 'listings' | 'maintenance'

function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtAgo(s: string) {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'Today'; if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`; return fmtDate(s)
}
function initials(name: string) {
  return (name || 'NN').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const PLAN_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  pro:      { bg: 'rgba(251,191,36,.12)', color: '#FCD34D', border: 'rgba(251,191,36,.25)' },
  business: { bg: 'rgba(167,139,250,.12)', color: '#A78BFA', border: 'rgba(167,139,250,.25)' },
  free:     { bg: 'rgba(100,116,139,.1)',  color: '#64748B', border: 'rgba(100,116,139,.2)' },
}
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:      { bg: 'rgba(52,211,153,.1)',  color: '#34D399', border: 'rgba(52,211,153,.2)' },
  inactive:    { bg: 'rgba(248,113,113,.1)', color: '#F87171', border: 'rgba(248,113,113,.2)' },
  past_due:    { bg: 'rgba(251,191,36,.1)',  color: '#FCD34D', border: 'rgba(251,191,36,.2)' },
  open:        { bg: 'rgba(248,113,113,.1)', color: '#F87171', border: 'rgba(248,113,113,.2)' },
  in_progress: { bg: 'rgba(251,191,36,.1)',  color: '#FCD34D', border: 'rgba(251,191,36,.2)' },
  resolved:    { bg: 'rgba(52,211,153,.1)',  color: '#34D399', border: 'rgba(52,211,153,.2)' },
  listed:      { bg: 'rgba(96,165,250,.1)',  color: '#60A5FA', border: 'rgba(96,165,250,.2)' },
  draft:       { bg: 'rgba(100,116,139,.1)', color: '#64748B', border: 'rgba(100,116,139,.2)' },
  taken:       { bg: 'rgba(52,211,153,.1)',  color: '#34D399', border: 'rgba(52,211,153,.2)' },
  pending:     { bg: 'rgba(251,191,36,.1)',  color: '#FCD34D', border: 'rgba(251,191,36,.2)' },
  landlord:    { bg: 'rgba(96,165,250,.1)',  color: '#60A5FA', border: 'rgba(96,165,250,.2)' },
  tenant:      { bg: 'rgba(52,211,153,.1)',  color: '#34D399', border: 'rgba(52,211,153,.2)' },
  seeker:      { bg: 'rgba(251,191,36,.1)',  color: '#FCD34D', border: 'rgba(251,191,36,.2)' },
}
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#F87171', high: '#FCD34D', medium: '#60A5FA', low: '#34D399'
}

function Chip({ text, type }: { text: string; type?: string }) {
  const key = (type || text).toLowerCase()
  const s = STATUS_COLORS[key] || PLAN_COLORS[key] || { bg: 'rgba(100,116,139,.1)', color: '#64748B', border: 'rgba(100,116,139,.2)' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap', textTransform: 'capitalize', fontFamily: "'DM Mono', monospace", letterSpacing: '0.3px' }}>
      {text}
    </span>
  )
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const colors = ['#DC2626','#7C3AED','#2563EB','#059669','#D97706','#DB2777']
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.35, fontWeight: 700, fontFamily: "'Syne', sans-serif", flexShrink: 0 }}>
      {initials(name)}
    </div>
  )
}

function MiniBar({ value, max, color = '#DC2626' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }}/>
      </div>
      <span style={{ fontSize: 11, color: '#475569', fontFamily: "'DM Mono',monospace", width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab]                   = useState<Tab>('overview')
  const [stats, setStats]               = useState<Stats | null>(null)
  const [users, setUsers]               = useState<User[]>([])
  const [properties, setProperties]     = useState<Property[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [listings, setListings]         = useState<Listing[]>([])
  const [maintenance, setMaintenance]   = useState<MaintenanceReq[]>([])
  const [loading, setLoading]           = useState(false)
  const [search, setSearch]             = useState('')
  const [toast, setToast]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [editUser, setEditUser]         = useState<User | null>(null)
  const [editSub, setEditSub]           = useState<Subscription | null>(null)
  const [editListing, setEditListing]   = useState<Listing | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ resource: string; id: string; label: string } | null>(null)
  const [saving, setSaving]             = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [statsLoaded, setStatsLoaded]   = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function api(method: string, body?: any) {
    const url = method === 'GET' ? `/api/admin/data?${new URLSearchParams(body)}` : '/api/admin/data'
    const res = await fetch(url, {
      method,
      headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    })
    return res.json()
  }

  async function loadStats() {
    const d = await api('GET', { resource: 'stats' })
    const proUsers = d.proUsers || 0
    const totalUsers = d.totalUsers || 0
    setStats({
      ...d,
      freeUsers: totalUsers - proUsers,
      conversionRate: totalUsers > 0 ? Math.round((proUsers / totalUsers) * 100) : 0,
      arr: (parseFloat(d.mrr || '0') * 12).toFixed(0),
    })
    setStatsLoaded(true)
  }

  async function loadTab(t: Tab) {
    if (t === 'overview') { await loadStats(); return }
    setLoading(true)
    const resourceMap: Record<string, string> = {
      users: 'users', properties: 'properties', subscriptions: 'subscriptions',
      listings: 'listings', maintenance: 'maintenance'
    }
    const d = await api('GET', { resource: resourceMap[t] })
    const setters: Record<string, any> = {
      users: setUsers, properties: setProperties, subscriptions: setSubscriptions,
      listings: setListings, maintenance: setMaintenance
    }
    if (setters[t]) setters[t](d.data || [])
    setLoading(false)
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadTab(tab); setSearch('') }, [tab])

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleDelete() {
    if (!confirmDelete) return
    setSaving(true)
    const d = await api('DELETE', { resource: confirmDelete.resource, id: confirmDelete.id })
    setSaving(false); setConfirmDelete(null)
    if (d.success) { showToast('Deleted successfully'); loadTab(tab) }
    else showToast(d.error || 'Delete failed', 'error')
  }

  async function handleSaveUser() {
    if (!editUser) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'user', id: editUser.id, data: { full_name: editUser.full_name, phone: editUser.phone, active_role: editUser.active_role } })
    setSaving(false)
    if (d.success) { showToast('User updated ✓'); setEditUser(null); loadTab('users') }
    else showToast(d.error || 'Failed', 'error')
  }

  async function handleSaveSub() {
    if (!editSub) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'subscription', id: editSub.profile_id, data: { plan: editSub.plan, status: editSub.status } })
    setSaving(false)
    if (d.success) { showToast('Subscription updated ✓'); setEditSub(null); loadTab('subscriptions') }
    else showToast(d.error || 'Failed', 'error')
  }

  async function handleSaveListing() {
    if (!editListing) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'listing', id: editListing.id, data: { status: editListing.status } })
    setSaving(false)
    if (d.success) { showToast('Listing updated ✓'); setEditListing(null); loadTab('listings') }
    else showToast(d.error || 'Failed', 'error')
  }

  async function quickUpdate(resource: string, id: string, data: any) {
    const d = await api('PATCH', { resource, id, data })
    if (d.success) { showToast('Updated ✓'); loadTab(tab) }
    else showToast(d.error || 'Failed', 'error')
  }

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  const TABS = [
    { id: 'overview' as Tab,      label: 'Overview',      icon: '⊹',  desc: 'Platform stats' },
    { id: 'users' as Tab,         label: 'Users',         icon: '◎',  desc: `${users.length} total` },
    { id: 'properties' as Tab,    label: 'Properties',    icon: '⬡',  desc: `${properties.length} total` },
    { id: 'subscriptions' as Tab, label: 'Subscriptions', icon: '◈',  desc: 'Plans & billing' },
    { id: 'listings' as Tab,      label: 'Listings',      icon: '⬕',  desc: `${listings.length} total` },
    { id: 'maintenance' as Tab,   label: 'Maintenance',   icon: '⚙',  desc: 'All requests' },
  ]

  const q = search.toLowerCase()
  const fUsers    = users.filter(u => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.active_role?.includes(q))
  const fProps    = properties.filter(p => p.name?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.profiles?.full_name?.toLowerCase().includes(q))
  const fSubs     = subscriptions.filter(s => s.profiles?.full_name?.toLowerCase().includes(q) || s.profiles?.email?.toLowerCase().includes(q) || s.plan?.includes(q))
  const fListings = listings.filter(l => l.title?.toLowerCase().includes(q) || l.profiles?.full_name?.toLowerCase().includes(q))
  const fMaint    = maintenance.filter(m => m.title?.toLowerCase().includes(q) || m.properties?.name?.toLowerCase().includes(q) || m.priority?.includes(q))

  const currentData = { users: fUsers, properties: fProps, subscriptions: fSubs, listings: fListings, maintenance: fMaint }
  const currentCount = tab === 'overview' ? 0 : (currentData[tab as keyof typeof currentData] as any[])?.length || 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'DM Sans',sans-serif;background:#060912;color:#CBD5E1;overflow-x:hidden}

        /* ── LAYOUT ── */
        .shell{display:flex;min-height:100vh;position:relative}

        /* Background effect */
        .bg-grid{
          position:fixed;inset:0;z-index:0;
          background-image:linear-gradient(rgba(220,38,38,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(220,38,38,0.025) 1px,transparent 1px);
          background-size:80px 80px;
          pointer-events:none;
        }
        .bg-glow{
          position:fixed;top:-200px;right:-200px;width:600px;height:600px;
          background:radial-gradient(circle,rgba(220,38,38,0.06) 0%,transparent 65%);
          pointer-events:none;z-index:0;
          animation:slowFloat 12s ease-in-out infinite;
        }
        @keyframes slowFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,20px)}}

        /* ── SIDEBAR ── */
        .sidebar{
          width:240px;flex-shrink:0;background:rgba(15,23,42,0.95);
          border-right:1px solid rgba(255,255,255,0.04);
          display:flex;flex-direction:column;
          position:fixed;top:0;left:0;height:100vh;z-index:100;
          backdrop-filter:blur(20px);
          transition:width 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .sidebar.collapsed{width:64px}

        .sb-logo{
          padding:20px 18px;
          border-bottom:1px solid rgba(255,255,255,0.04);
          display:flex;align-items:center;gap:12px;
          overflow:hidden;white-space:nowrap;
        }
        .sb-logo-mark{
          width:34px;height:34px;border-radius:9px;flex-shrink:0;
          background:linear-gradient(135deg,#DC2626,#7F1D1D);
          display:flex;align-items:center;justify-content:center;
          font-size:15px;box-shadow:0 4px 12px rgba(220,38,38,0.3);
        }
        .sb-logo-text{
          font-family:'Syne',sans-serif;font-size:16px;font-weight:800;
          color:#F8FAFC;letter-spacing:-0.3px;
        }
        .sb-logo-badge{
          font-family:'DM Mono',monospace;font-size:8px;color:#DC2626;
          letter-spacing:2px;font-weight:500;display:block;margin-top:1px;
        }

        .sb-toggle{
          position:absolute;top:22px;right:-12px;
          width:24px;height:24px;border-radius:50%;
          background:#1E293B;border:1px solid rgba(255,255,255,0.08);
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;font-size:10px;color:#64748B;
          transition:all 0.2s;z-index:101;
        }
        .sb-toggle:hover{background:#DC2626;color:#fff;border-color:#DC2626}

        .sb-nav{flex:1;padding:12px 8px;overflow-y:auto;overflow-x:hidden}
        .sb-nav::-webkit-scrollbar{width:0}

        .sb-section{
          font-family:'DM Mono',monospace;font-size:9px;color:#1E3A5F;
          letter-spacing:2px;text-transform:uppercase;font-weight:500;
          padding:14px 10px 6px;white-space:nowrap;overflow:hidden;
        }

        .sb-item{
          display:flex;align-items:center;gap:10px;
          padding:9px 10px;border-radius:10px;
          color:#334155;font-size:13px;font-weight:500;
          cursor:pointer;transition:all 0.15s;
          margin-bottom:1px;border:none;background:none;
          font-family:'DM Sans',sans-serif;text-align:left;width:100%;
          white-space:nowrap;overflow:hidden;position:relative;
        }
        .sb-item:hover{background:rgba(255,255,255,0.04);color:#94A3B8}
        .sb-item.active{
          background:rgba(220,38,38,0.08);color:#FCA5A5;
          border:1px solid rgba(220,38,38,0.15);
        }
        .sb-item.active::before{
          content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);
          width:3px;height:60%;background:#DC2626;border-radius:0 3px 3px 0;
        }
        .sb-icon{
          font-size:14px;width:20px;text-align:center;flex-shrink:0;
          font-style:normal;
        }
        .sb-item-info{flex:1;min-width:0}
        .sb-item-label{font-weight:600;font-size:13px}
        .sb-item-desc{font-size:10.5px;color:#334155;margin-top:1px;font-family:'DM Mono',monospace}
        .sb-item.active .sb-item-desc{color:rgba(252,165,165,0.5)}

        .sb-footer{padding:12px 8px;border-top:1px solid rgba(255,255,255,0.04)}
        .sb-user-card{
          display:flex;align-items:center;gap:10px;padding:10px;
          background:rgba(255,255,255,0.03);border-radius:10px;
          border:1px solid rgba(255,255,255,0.04);margin-bottom:8px;
          overflow:hidden;white-space:nowrap;
        }
        .sb-user-av{
          width:30px;height:30px;border-radius:8px;flex-shrink:0;
          background:linear-gradient(135deg,#DC2626,#7F1D1D);
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:700;color:#fff;font-family:'Syne',sans-serif;
        }
        .sb-user-name{font-size:12px;font-weight:600;color:#94A3B8}
        .sb-user-role{font-size:10px;color:#DC2626;font-family:'DM Mono',monospace;letter-spacing:.5px}
        .sb-logout{
          width:100%;padding:8px;border-radius:9px;
          border:1px solid rgba(220,38,38,0.2);
          background:rgba(220,38,38,0.06);color:#FCA5A5;
          font-size:12px;font-weight:600;cursor:pointer;
          font-family:'DM Sans',sans-serif;
          display:flex;align-items:center;justify-content:center;gap:6px;
          transition:all 0.15s;
        }
        .sb-logout:hover{background:rgba(220,38,38,0.12);border-color:rgba(220,38,38,0.35)}

        /* ── MAIN ── */
        .main{margin-left:240px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;position:relative;z-index:1}

        /* ── TOPBAR ── */
        .topbar{
          height:60px;
          background:rgba(6,9,18,0.8);backdrop-filter:blur(20px);
          border-bottom:1px solid rgba(255,255,255,0.04);
          display:flex;align-items:center;justify-content:space-between;
          padding:0 28px;position:sticky;top:0;z-index:50;gap:20px;
        }
        .topbar-left{display:flex;align-items:center;gap:14px;min-width:0}
        .topbar-breadcrumb{
          display:flex;align-items:center;gap:6px;
          font-family:'DM Mono',monospace;font-size:11.5px;color:#1E3A5F;
        }
        .topbar-breadcrumb-current{color:#CBD5E1;font-weight:500}

        .search-wrap{
          display:flex;align-items:center;gap:8px;flex:1;max-width:360px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
          border-radius:10px;padding:0 12px;
          transition:all 0.2s;
        }
        .search-wrap:focus-within{border-color:rgba(220,38,38,0.3);background:rgba(220,38,38,0.03)}
        .search-ico{font-size:13px;color:#334155;flex-shrink:0}
        .search-wrap input{
          background:none;border:none;outline:none;
          color:#CBD5E1;font-size:13px;font-family:'DM Sans',sans-serif;
          width:100%;padding:9px 0;
        }
        .search-wrap input::placeholder{color:#1E3A5F}
        .search-hint{
          font-family:'DM Mono',monospace;font-size:10px;
          color:#1E293B;background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);border-radius:4px;
          padding:2px 6px;flex-shrink:0;
        }

        .topbar-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
        .tb-stat{
          display:flex;align-items:center;gap:6px;
          background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.15);
          border-radius:99px;padding:5px 12px;
        }
        .tb-stat-dot{width:6px;height:6px;border-radius:50%;background:#34D399;animation:pulse 2s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .tb-stat-text{font-family:'DM Mono',monospace;font-size:11px;color:#34D399;font-weight:500}
        .tb-btn{
          padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);
          background:rgba(255,255,255,0.03);color:#64748B;
          font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;
          transition:all 0.15s;display:flex;align-items:center;gap:5px;
        }
        .tb-btn:hover{background:rgba(255,255,255,0.06);color:#94A3B8}

        /* ── CONTENT ── */
        .content{padding:28px;flex:1;overflow-x:hidden}

        /* ── STATS GRID ── */
        .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px}
        .stat-card{
          background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.05);
          border-radius:16px;padding:20px;
          position:relative;overflow:hidden;
          transition:transform 0.2s,border-color 0.2s;
          animation:statIn 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes statIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .stat-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.09)}
        .stat-card::after{
          content:'';position:absolute;inset:0;
          background:linear-gradient(135deg,rgba(255,255,255,0.02),transparent);
          pointer-events:none;
        }
        .stat-accent{
          position:absolute;top:0;right:0;width:80px;height:80px;
          border-radius:0 16px 0 80px;
          opacity:0.06;
        }
        .stat-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
        .stat-icon-wrap{
          width:38px;height:38px;border-radius:10px;
          display:flex;align-items:center;justify-content:center;font-size:17px;
        }
        .stat-tag{
          font-family:'DM Mono',monospace;font-size:10px;font-weight:500;
          border-radius:99px;padding:3px 9px;letter-spacing:0.3px;
        }
        .stat-val{
          font-family:'Syne',sans-serif;font-size:32px;font-weight:800;
          color:#F1F5F9;line-height:1;margin-bottom:4px;letter-spacing:-1px;
        }
        .stat-label{font-size:12.5px;color:#334155;font-weight:500;margin-bottom:10px}
        .stat-bar-wrap{height:3px;background:rgba(255,255,255,0.04);border-radius:99px;overflow:hidden}
        .stat-bar{height:100%;border-radius:99px;transition:width 0.8s cubic-bezier(0.16,1,0.3,1)}

        /* ── TABLE PANEL ── */
        .panel{
          background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.05);
          border-radius:18px;overflow:hidden;
          animation:panelIn 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes panelIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        .panel-header{
          padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.04);
          display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
        }
        .panel-title{
          font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#F1F5F9;
          display:flex;align-items:center;gap:8px;
        }
        .panel-count{
          font-family:'DM Mono',monospace;font-size:11px;color:#64748B;
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);
          border-radius:99px;padding:3px 10px;
        }

        .table-scroll{overflow-x:auto}
        table{width:100%;border-collapse:collapse;min-width:700px}
        thead tr{border-bottom:1px solid rgba(255,255,255,0.04)}
        th{
          padding:11px 18px;text-align:left;
          font-family:'DM Mono',monospace;font-size:10px;font-weight:500;
          color:#1E3A5F;letter-spacing:1.5px;text-transform:uppercase;
          white-space:nowrap;background:rgba(255,255,255,0.01);
        }
        td{padding:14px 18px;font-size:13px;color:#94A3B8;border-bottom:1px solid rgba(255,255,255,0.03);vertical-align:middle}
        tbody tr:last-child td{border-bottom:none}
        tbody tr{transition:background 0.12s}
        tbody tr:hover{background:rgba(255,255,255,0.02)}
        .cell-primary{font-weight:600;color:#E2E8F0;font-size:13.5px}
        .cell-secondary{font-size:11.5px;color:#334155;margin-top:2px;font-family:'DM Mono',monospace}

        /* Inline select */
        .inline-sel{
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
          border-radius:8px;color:#CBD5E1;font-size:12px;
          font-family:'DM Sans',sans-serif;padding:5px 10px;cursor:pointer;outline:none;
          transition:border-color 0.15s;
        }
        .inline-sel:hover{border-color:rgba(255,255,255,0.14)}
        .inline-sel:focus{border-color:rgba(220,38,38,0.4)}
        .inline-sel option{background:#0F172A}

        /* Action buttons */
        .acts{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
        .act{
          padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;
          cursor:pointer;border:none;font-family:'DM Sans',sans-serif;
          transition:all 0.15s;display:inline-flex;align-items:center;gap:4px;
          white-space:nowrap;
        }
        .act-edit{background:rgba(96,165,250,.1);color:#60A5FA;border:1px solid rgba(96,165,250,.15)}
        .act-edit:hover{background:rgba(96,165,250,.18)}
        .act-del{background:rgba(248,113,113,.08);color:#F87171;border:1px solid rgba(248,113,113,.15)}
        .act-del:hover{background:rgba(248,113,113,.16)}
        .act-success{background:rgba(52,211,153,.08);color:#34D399;border:1px solid rgba(52,211,153,.15)}
        .act-success:hover{background:rgba(52,211,153,.16)}

        /* Empty */
        .empty{text-align:center;padding:70px 20px}
        .empty-ico{font-size:40px;margin-bottom:14px;opacity:0.3}
        .empty-text{font-size:14px;color:#334155}

        /* Loading */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skel{
          background:linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.03) 75%);
          background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px;
        }
        .loading-rows{padding:14px 18px;display:flex;flex-direction:column;gap:14px}

        /* ── MODAL ── */
        .modal-bg{
          display:none;position:fixed;inset:0;
          background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);
          z-index:500;align-items:center;justify-content:center;padding:20px;
        }
        .modal-bg.open{display:flex}
        .modal{
          background:#0D1526;border:1px solid rgba(255,255,255,0.08);
          border-radius:22px;padding:0;width:100%;max-width:500px;
          box-shadow:0 40px 80px rgba(0,0,0,0.6);
          animation:modalIn 0.25s cubic-bezier(0.16,1,0.3,1);
          overflow:hidden;
        }
        @keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .modal-head{
          padding:22px 26px 18px;
          border-bottom:1px solid rgba(255,255,255,0.06);
          display:flex;align-items:center;justify-content:space-between;
        }
        .modal-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#F1F5F9}
        .modal-close{
          background:rgba(255,255,255,0.06);border:none;
          border-radius:8px;width:30px;height:30px;
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;color:#64748B;font-size:14px;transition:all 0.15s;
        }
        .modal-close:hover{background:rgba(255,255,255,0.1);color:#F1F5F9}
        .modal-body{padding:22px 26px}
        .modal-field{margin-bottom:16px}
        .modal-label{
          display:block;font-family:'DM Mono',monospace;font-size:10px;
          font-weight:500;color:#334155;letter-spacing:2px;
          text-transform:uppercase;margin-bottom:7px;
        }
        .modal-input,.modal-select{
          width:100%;padding:11px 14px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.08);border-radius:10px;
          color:#E2E8F0;font-size:13.5px;
          font-family:'DM Sans',sans-serif;outline:none;transition:all 0.2s;
        }
        .modal-input:focus,.modal-select:focus{
          border-color:rgba(220,38,38,0.4);
          box-shadow:0 0 0 3px rgba(220,38,38,0.08);
          background:rgba(220,38,38,0.03);
        }
        .modal-select option{background:#0D1526}
        .modal-info{
          background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);
          border-radius:10px;padding:10px 14px;margin-top:14px;
          font-size:12px;color:#FCD34D;line-height:1.5;display:flex;gap:8px;
        }
        .modal-footer{
          padding:16px 26px 22px;
          display:flex;gap:10px;justify-content:flex-end;
        }
        .modal-cancel{
          padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);
          background:transparent;color:#64748B;font-size:13px;font-weight:600;
          cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;
        }
        .modal-cancel:hover{background:rgba(255,255,255,0.04);color:#94A3B8}
        .modal-save{
          padding:10px 22px;border-radius:10px;border:none;
          background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;
          font-size:13px;font-weight:700;cursor:pointer;
          font-family:'DM Sans',sans-serif;transition:all 0.15s;
          box-shadow:0 4px 12px rgba(37,99,235,0.3);
        }
        .modal-save:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(37,99,235,0.4)}
        .modal-save:disabled{opacity:0.6;cursor:not-allowed;transform:none}
        .modal-save.danger{background:linear-gradient(135deg,#DC2626,#991B1B);box-shadow:0 4px 12px rgba(220,38,38,0.3)}
        .modal-save.danger:hover{box-shadow:0 6px 16px rgba(220,38,38,0.4)}

        /* ── OVERVIEW ── */
        .ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
        .ov-panel{background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.05);border-radius:16px;overflow:hidden}
        .ov-panel-head{
          padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.04);
          display:flex;align-items:center;justify-content:space-between;
        }
        .ov-panel-title{font-family:'Syne',sans-serif;font-size:13.5px;font-weight:700;color:#CBD5E1}
        .ov-row{
          display:flex;align-items:center;justify-content:space-between;
          padding:13px 20px;border-bottom:1px solid rgba(255,255,255,0.03);
          transition:background 0.12s;
        }
        .ov-row:last-child{border-bottom:none}
        .ov-row:hover{background:rgba(255,255,255,0.02)}
        .ov-label{font-size:13px;color:#64748B;font-weight:500}
        .ov-value{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#F1F5F9}
        .ov-status{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
        .ov-dot{width:7px;height:7px;border-radius:50%}

        /* Revenue bar chart */
        .rev-chart{padding:16px 20px 18px}
        .rev-bars{display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:8px}
        .rev-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:0}
        .rev-bar{width:100%;border-radius:4px 4px 0 0;transition:height 0.6s cubic-bezier(0.16,1,0.3,1);min-height:3px}
        .rev-bar-label{font-size:9px;color:#334155;font-family:'DM Mono',monospace;margin-top:5px}

        /* ── TOAST ── */
        .toast{
          position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
          padding:12px 22px;border-radius:12px;font-size:13.5px;font-weight:600;color:#fff;
          z-index:9999;box-shadow:0 12px 32px rgba(0,0,0,0.4);
          animation:toastIn 0.25s cubic-bezier(0.16,1,0.3,1);white-space:nowrap;
          font-family:'DM Sans',sans-serif;backdrop-filter:blur(10px);
        }
        .toast.success{background:rgba(22,163,74,0.9);border:1px solid rgba(52,211,153,0.3)}
        .toast.error{background:rgba(220,38,38,0.9);border:1px solid rgba(248,113,113,0.3)}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        @media(max-width:1200px){.stats-grid{grid-template-columns:repeat(2,1fr)}.ov-grid{grid-template-columns:1fr}}
        @media(max-width:900px){.stats-grid{grid-template-columns:1fr}}
        @media(max-width:768px){.sidebar{display:none}.main{margin-left:0}.content{padding:16px}}
      `}</style>

      {/* BG */}
      <div className="bg-grid"/><div className="bg-glow"/>

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.type==='success'?'✓ ':'⚠ '}{toast.msg}</div>}

      {/* ── CONFIRM DELETE MODAL ── */}
      <div className={`modal-bg${confirmDelete?' open':''}`} onClick={()=>setConfirmDelete(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">⚠️ Confirm Deletion</div>
            <button className="modal-close" onClick={()=>setConfirmDelete(null)}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{fontSize:14,color:'#94A3B8',lineHeight:1.7,marginBottom:16}}>
              You are about to permanently delete:<br/>
              <strong style={{color:'#F1F5F9',fontFamily:"'Syne',sans-serif"}}>{confirmDelete?.label}</strong>
            </p>
            <div style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:10,padding:'12px 14px',fontSize:12.5,color:'#FCA5A5',lineHeight:1.5}}>
              🔴 This action is <strong>permanent and irreversible.</strong> All related data will be destroyed.
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={()=>setConfirmDelete(null)}>Cancel</button>
            <button className="modal-save danger" onClick={handleDelete} disabled={saving}>{saving?'Deleting...':'🗑️ Delete Permanently'}</button>
          </div>
        </div>
      </div>

      {/* ── EDIT USER MODAL ── */}
      <div className={`modal-bg${editUser?' open':''}`} onClick={()=>setEditUser(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">Edit User</div>
            <button className="modal-close" onClick={()=>setEditUser(null)}>✕</button>
          </div>
          <div className="modal-body">
            {editUser && (
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:12,marginBottom:20,border:'1px solid rgba(255,255,255,0.06)'}}>
                <Avatar name={editUser.full_name} size={40}/>
                <div>
                  <div style={{fontWeight:600,color:'#E2E8F0',fontSize:14}}>{editUser.full_name||'No name'}</div>
                  <div style={{fontSize:12,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{editUser.email}</div>
                </div>
              </div>
            )}
            {editUser && <>
              <div className="modal-field">
                <label className="modal-label">Full Name</label>
                <input className="modal-input" value={editUser.full_name||''} onChange={e=>setEditUser(u=>u?({...u,full_name:e.target.value}):u)} placeholder="Full name"/>
              </div>
              <div className="modal-field">
                <label className="modal-label">Phone Number</label>
                <input className="modal-input" value={editUser.phone||''} onChange={e=>setEditUser(u=>u?({...u,phone:e.target.value}):u)} placeholder="+xx xxx xxxx"/>
              </div>
              <div className="modal-field">
                <label className="modal-label">Active Role</label>
                <select className="modal-select" value={editUser.active_role||'landlord'} onChange={e=>setEditUser(u=>u?({...u,active_role:e.target.value}):u)}>
                  <option value="landlord">🏠 Landlord</option>
                  <option value="tenant">🔑 Tenant</option>
                  <option value="seeker">🔍 Seeker</option>
                </select>
              </div>
            </>}
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={()=>setEditUser(null)}>Cancel</button>
            <button className="modal-save" onClick={handleSaveUser} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
          </div>
        </div>
      </div>

      {/* ── EDIT SUBSCRIPTION MODAL ── */}
      <div className={`modal-bg${editSub?' open':''}`} onClick={()=>setEditSub(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">Edit Subscription</div>
            <button className="modal-close" onClick={()=>setEditSub(null)}>✕</button>
          </div>
          <div className="modal-body">
            {editSub && <>
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:12,marginBottom:20,border:'1px solid rgba(255,255,255,0.06)'}}>
                <Avatar name={editSub.profiles?.full_name} size={40}/>
                <div>
                  <div style={{fontWeight:600,color:'#E2E8F0',fontSize:14}}>{editSub.profiles?.full_name||'—'}</div>
                  <div style={{fontSize:12,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{editSub.profiles?.email}</div>
                </div>
                <div style={{marginLeft:'auto'}}><Chip text={editSub.plan} type={editSub.plan}/></div>
              </div>
              <div className="modal-field">
                <label className="modal-label">Plan</label>
                <select className="modal-select" value={editSub.plan||'free'} onChange={e=>setEditSub(s=>s?({...s,plan:e.target.value}):s)}>
                  <option value="free">Free</option>
                  <option value="pro">⭐ Pro — $9.99/mo</option>
                  <option value="business">💎 Business — $24.99/mo</option>
                </select>
              </div>
              <div className="modal-field">
                <label className="modal-label">Status</label>
                <select className="modal-select" value={editSub.status||'active'} onChange={e=>setEditSub(s=>s?({...s,status:e.target.value}):s)}>
                  <option value="active">✓ Active</option>
                  <option value="inactive">✗ Inactive</option>
                  <option value="past_due">⚠ Past Due</option>
                </select>
              </div>
              <div className="modal-info">
                <span>⚠️</span>
                <span>This updates the database directly. Stripe subscription is <strong>not</strong> modified. Use Stripe dashboard for billing changes.</span>
              </div>
            </>}
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={()=>setEditSub(null)}>Cancel</button>
            <button className="modal-save" onClick={handleSaveSub} disabled={saving}>{saving?'Saving...':'Update Plan'}</button>
          </div>
        </div>
      </div>

      {/* ── EDIT LISTING MODAL ── */}
      <div className={`modal-bg${editListing?' open':''}`} onClick={()=>setEditListing(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">Moderate Listing</div>
            <button className="modal-close" onClick={()=>setEditListing(null)}>✕</button>
          </div>
          <div className="modal-body">
            {editListing && <>
              <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:12,marginBottom:20,border:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{fontWeight:600,color:'#E2E8F0',fontSize:14,marginBottom:4}}>{editListing.title}</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:12,color:'#475569'}}>{editListing.profiles?.full_name}</span>
                  <span style={{fontSize:11,color:'#334155'}}>·</span>
                  <span style={{fontSize:12,color:'#34D399',fontFamily:"'DM Mono',monospace"}}>${editListing.rent_amount}/mo</span>
                </div>
              </div>
              <div className="modal-field">
                <label className="modal-label">Listing Status</label>
                <select className="modal-select" value={editListing.status} onChange={e=>setEditListing(l=>l?({...l,status:e.target.value}):l)}>
                  <option value="active">✓ Active — Visible to seekers</option>
                  <option value="draft">✎ Draft — Hidden from seekers</option>
                  <option value="pending">⏳ Pending — Under review</option>
                  <option value="taken">🔑 Taken — Property rented</option>
                </select>
              </div>
            </>}
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={()=>setEditListing(null)}>Cancel</button>
            <button className="modal-save" onClick={handleSaveListing} disabled={saving}>{saving?'Saving...':'Update Listing'}</button>
          </div>
        </div>
      </div>

      <div className="shell">
        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${sidebarCollapsed?' collapsed':''}`}>
          <button className="sb-toggle" onClick={()=>setSidebarCollapsed(v=>!v)}>
            {sidebarCollapsed?'›':'‹'}
          </button>
          <div className="sb-logo">
            <div className="sb-logo-mark">🛡</div>
            {!sidebarCollapsed && (
              <div>
                <div className="sb-logo-text">Rentura</div>
                <span className="sb-logo-badge">ADMIN CONSOLE</span>
              </div>
            )}
          </div>
          <nav className="sb-nav">
            {!sidebarCollapsed && <div className="sb-section">// Navigation</div>}
            {TABS.map((t,i)=>(
              <button key={t.id}
                className={`sb-item${tab===t.id?' active':''}`}
                onClick={()=>setTab(t.id)}
                style={{animationDelay:`${i*0.05}s`}}
                title={sidebarCollapsed?t.label:undefined}>
                <span className="sb-icon">{t.icon}</span>
                {!sidebarCollapsed && (
                  <div className="sb-item-info">
                    <div className="sb-item-label">{t.label}</div>
                    <div className="sb-item-desc">{t.desc}</div>
                  </div>
                )}
              </button>
            ))}
          </nav>
          <div className="sb-footer">
            {!sidebarCollapsed && (
              <div className="sb-user-card">
                <div className="sb-user-av">A</div>
                <div>
                  <div className="sb-user-name">Administrator</div>
                  <div className="sb-user-role">SUPER ADMIN</div>
                </div>
              </div>
            )}
            <button className="sb-logout" onClick={handleLogout} title="Sign out">
              {sidebarCollapsed?'🚪':<><span>🚪</span>Sign Out</>}
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div className="main" style={{marginLeft: sidebarCollapsed?'64px':'240px', transition:'margin 0.3s cubic-bezier(0.16,1,0.3,1)'}}>
          {/* TOPBAR */}
          <div className="topbar">
            <div className="topbar-left">
              <div className="topbar-breadcrumb">
                <span>admin</span><span>/</span>
                <span className="topbar-breadcrumb-current">{tab}</span>
              </div>
              {tab !== 'overview' && (
                <div className="search-wrap">
                  <span className="search-ico">⌕</span>
                  <input
                    ref={searchRef}
                    placeholder={`Search ${tab}...`}
                    value={search}
                    onChange={e=>setSearch(e.target.value)}
                  />
                  {!search && <span className="search-hint">/</span>}
                  {search && <span onClick={()=>setSearch('')} style={{color:'#334155',cursor:'pointer',fontSize:12,flexShrink:0}}>✕</span>}
                </div>
              )}
            </div>
            <div className="topbar-right">
              {stats && (
                <div className="tb-stat">
                  <div className="tb-stat-dot"/>
                  <span className="tb-stat-text">MRR ${stats.mrr}</span>
                </div>
              )}
              <button className="tb-btn" onClick={()=>loadTab(tab)}>↻ Refresh</button>
              {tab!=='overview'&&<span className="panel-count" style={{fontSize:11}}>{currentCount} records</span>}
            </div>
          </div>

          {/* CONTENT */}
          <div className="content">

            {/* ══ OVERVIEW ══ */}
            {tab==='overview'&&(
              <>
                {/* Stats */}
                <div className="stats-grid">
                  {[
                    { ico:'👥', label:'Total Users',     val: stats?.totalUsers??'—',       tag:'All time',   tagColor:{bg:'rgba(96,165,250,.1)',color:'#60A5FA',border:'rgba(96,165,250,.2)'},  bar:100, barColor:'#60A5FA',   accent:'#60A5FA', delay:'0s' },
                    { ico:'⭐', label:'Pro Subscribers', val: stats?.proUsers??'—',         tag:'Paying',     tagColor:{bg:'rgba(251,191,36,.1)',color:'#FCD34D',border:'rgba(251,191,36,.2)'}, bar: stats&&stats.totalUsers>0?Math.round((stats.proUsers/stats.totalUsers)*100):0, barColor:'#FCD34D', accent:'#FCD34D', delay:'0.05s' },
                    { ico:'💰', label:'Monthly Revenue', val:`$${stats?.mrr??'0'}`,        tag:'MRR',        tagColor:{bg:'rgba(52,211,153,.1)',color:'#34D399',border:'rgba(52,211,153,.2)'},  bar:60, barColor:'#34D399',   accent:'#34D399', delay:'0.1s' },
                    { ico:'📈', label:'Annual Revenue',  val:`$${stats?.arr??'0'}`,        tag:'ARR',        tagColor:{bg:'rgba(167,139,250,.1)',color:'#A78BFA',border:'rgba(167,139,250,.2)'},bar:45, barColor:'#A78BFA',   accent:'#A78BFA', delay:'0.12s' },
                    { ico:'🏠', label:'Properties',      val: stats?.totalProperties??'—', tag:'All landlords',tagColor:{bg:'rgba(249,168,212,.1)',color:'#F9A8D4',border:'rgba(249,168,212,.2)'},bar:70,barColor:'#F9A8D4',accent:'#F9A8D4', delay:'0.15s' },
                    { ico:'🔧', label:'Open Requests',   val: stats?.openMaintenance??'—', tag:'Need fix',   tagColor:{bg:'rgba(248,113,113,.1)',color:'#F87171',border:'rgba(248,113,113,.2)'}, bar: stats&&(stats.openMaintenance??0)>0?Math.min(100,((stats.openMaintenance??0)/10)*100):5, barColor:'#F87171', accent:'#F87171', delay:'0.18s' },
                  ].map(s=>(
                    <div key={s.label} className="stat-card" style={{animationDelay:s.delay}}>
                      <div className="stat-accent" style={{background:s.accent}}/>
                      <div className="stat-top">
                        <div className="stat-icon-wrap" style={{background:`${s.accent}15`}}>
                          <span style={{fontSize:17}}>{s.ico}</span>
                        </div>
                        <span className="stat-tag" style={{background:(s.tagColor as any).bg,color:(s.tagColor as any).color,border:`1px solid ${(s.tagColor as any).border}`}}>{s.tag}</span>
                      </div>
                      <div className="stat-val">{statsLoaded?s.val:'—'}</div>
                      <div className="stat-label">{s.label}</div>
                      <div className="stat-bar-wrap">
                        <div className="stat-bar" style={{width:`${statsLoaded?s.bar:0}%`,background:s.barColor}}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overview panels */}
                <div className="ov-grid">
                  {/* Revenue metrics */}
                  <div className="ov-panel">
                    <div className="ov-panel-head">
                      <span className="ov-panel-title">💹 Revenue Metrics</span>
                      <Chip text="Live" type="active"/>
                    </div>
                    {[
                      { label:'Monthly Recurring Revenue', value:`$${stats?.mrr??'0'}` },
                      { label:'Annual Recurring Revenue',  value:`$${stats?.arr??'0'}` },
                      { label:'Pro Subscribers',           value:`${stats?.proUsers??0} users` },
                      { label:'Free Users',                value:`${stats?.freeUsers??0} users` },
                      { label:'Conversion Rate',           value:`${stats?.conversionRate??0}%` },
                      { label:'Revenue per User',          value: stats&&(stats.totalUsers??0)>0?`$${(parseFloat(stats.mrr??'0')/(stats.totalUsers??1)).toFixed(2)}`:'$0' },
                    ].map(r=>(
                      <div key={r.label} className="ov-row">
                        <span className="ov-label">{r.label}</span>
                        <span className="ov-value">{statsLoaded?r.value:'—'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Platform health */}
                  <div className="ov-panel">
                    <div className="ov-panel-head">
                      <span className="ov-panel-title">🔬 Platform Health</span>
                      <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#334155'}}>All systems</span>
                    </div>
                    {[
                      { label:'Database (Supabase)',     status:'Operational',     color:'#34D399' },
                      { label:'Authentication',          status:'Operational',     color:'#34D399' },
                      { label:'File Storage',            status:'Operational',     color:'#34D399' },
                      { label:'AI Writing (Groq)',       status:'Operational',     color:'#34D399' },
                      { label:'Payments (Stripe)',       status:'Sandbox Mode',    color:'#FCD34D' },
                      { label:'Email Notifications',     status:'Not configured',  color:'#475569' },
                    ].map(s=>(
                      <div key={s.label} className="ov-row">
                        <span className="ov-label">{s.label}</span>
                        <span className="ov-status">
                          <span className="ov-dot" style={{background:s.color}}/>
                          <span style={{color:s.color,fontSize:12,fontWeight:600}}>{s.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Platform totals */}
                  <div className="ov-panel">
                    <div className="ov-panel-head">
                      <span className="ov-panel-title">📊 Platform Totals</span>
                    </div>
                    {[
                      { label:'Total Users',       value:`${stats?.totalUsers??0}`,       color:'#60A5FA',  pct:100 },
                      { label:'Pro Subscribers',   value:`${stats?.proUsers??0}`,         color:'#FCD34D',  pct: stats&&stats.totalUsers>0?Math.round((stats.proUsers/stats.totalUsers)*100):0 },
                      { label:'Total Properties',  value:`${stats?.totalProperties??0}`,  color:'#F9A8D4',  pct:70  },
                      { label:'Active Listings',   value:`${stats?.totalListings??0}`,    color:'#A78BFA',  pct:50  },
                      { label:'Open Maintenance',  value:`${stats?.openMaintenance??0}`,  color:'#F87171',  pct:30  },
                    ].map(r=>(
                      <div key={r.label} className="ov-row" style={{display:'block',padding:'12px 20px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:7}}>
                          <span className="ov-label">{r.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:'#F1F5F9',fontFamily:"'Syne',sans-serif"}}>{statsLoaded?r.value:'—'}</span>
                        </div>
                        <MiniBar value={r.pct} max={100} color={r.color}/>
                      </div>
                    ))}
                  </div>

                  {/* Quick actions */}
                  <div className="ov-panel">
                    <div className="ov-panel-head">
                      <span className="ov-panel-title">⚡ Quick Actions</span>
                    </div>
                    <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      {[
                        {label:'View All Users',       ico:'👥', action:()=>setTab('users'),         color:'#60A5FA'},
                        {label:'Manage Plans',         ico:'💳', action:()=>setTab('subscriptions'), color:'#FCD34D'},
                        {label:'All Properties',       ico:'🏠', action:()=>setTab('properties'),    color:'#F9A8D4'},
                        {label:'Moderate Listings',    ico:'📋', action:()=>setTab('listings'),      color:'#A78BFA'},
                        {label:'Fix Maintenance',      ico:'🔧', action:()=>setTab('maintenance'),   color:'#F87171'},
                        {label:'Refresh Stats',        ico:'↻',  action:()=>loadStats(),             color:'#34D399'},
                      ].map(q=>(
                        <button key={q.label} onClick={q.action}
                          style={{
                            padding:'12px',borderRadius:12,
                            border:`1px solid ${q.color}20`,
                            background:`${q.color}08`,
                            color:q.color,fontSize:12.5,fontWeight:600,
                            cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
                            display:'flex',flexDirection:'column',alignItems:'flex-start',gap:5,
                            transition:'all 0.15s',textAlign:'left',
                          }}
                          onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background=`${q.color}14`}}
                          onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background=`${q.color}08`}}>
                          <span style={{fontSize:18}}>{q.ico}</span>
                          <span>{q.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══ USERS ══ */}
            {tab==='users'&&(
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">◎ All Users <span className="panel-count">{fUsers.length}</span></div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <Chip text={`${users.filter(u=>u.subscription?.plan==='pro').length} Pro`} type="pro"/>
                    <Chip text={`${users.filter(u=>u.active_role==='landlord').length} Landlords`} type="landlord"/>
                    <Chip text={`${users.filter(u=>u.active_role==='tenant').length} Tenants`} type="tenant"/>
                  </div>
                </div>
                {loading?(
                  <div className="loading-rows">{[1,2,3,4,5].map(i=><div key={i} className="skel" style={{height:52}}/>)}</div>
                ):fUsers.length===0?(<div className="empty"><div className="empty-ico">◎</div><div className="empty-text">No users found</div></div>):(
                  <div className="table-scroll">
                    <table>
                      <thead><tr>
                        <th>User</th><th>Role</th><th>Plan</th><th>Phone</th><th>Joined</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {fUsers.map(u=>(
                          <tr key={u.id}>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <Avatar name={u.full_name}/>
                                <div>
                                  <div className="cell-primary">{u.full_name||'No name'}</div>
                                  <div className="cell-secondary">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td><Chip text={u.active_role||'landlord'} type={u.active_role}/></td>
                            <td><Chip text={u.subscription?.plan||'free'} type={u.subscription?.plan||'free'}/></td>
                            <td><span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:'#475569'}}>{u.phone||'—'}</span></td>
                            <td><span style={{fontSize:12,color:'#334155'}}>{fmtAgo(u.created_at)}</span></td>
                            <td>
                              <div className="acts">
                                <button className="act act-edit" onClick={()=>setEditUser(u)}>✏ Edit</button>
                                <button className="act act-success" onClick={()=>setEditSub(subscriptions.find(s=>s.profile_id===u.id)||{profile_id:u.id,plan:'free',status:'active',stripe_customer_id:'',stripe_subscription_id:'',created_at:'',profiles:{full_name:u.full_name,email:u.email}})}>💳 Plan</button>
                                <button className="act act-del" onClick={()=>setConfirmDelete({resource:'user',id:u.id,label:u.full_name||u.email})}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ PROPERTIES ══ */}
            {tab==='properties'&&(
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">⬡ All Properties <span className="panel-count">{fProps.length}</span></div>
                  <div style={{display:'flex',gap:8}}>
                    <Chip text={`${properties.filter(p=>p.status==='active').length} Active`} type="active"/>
                    <Chip text={`${properties.filter(p=>p.status==='listed').length} Listed`} type="listed"/>
                  </div>
                </div>
                {loading?(<div className="loading-rows">{[1,2,3,4].map(i=><div key={i} className="skel" style={{height:52}}/>)}</div>)
                :fProps.length===0?(<div className="empty"><div className="empty-ico">⬡</div><div className="empty-text">No properties found</div></div>):(
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Property</th><th>Landlord</th><th>Type</th><th>Units</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
                      <tbody>
                        {fProps.map(p=>(
                          <tr key={p.id}>
                            <td>
                              <div className="cell-primary">{p.name}</div>
                              <div className="cell-secondary">📍 {p.city}, {p.country}</div>
                            </td>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <Avatar name={p.profiles?.full_name} size={28}/>
                                <div>
                                  <div style={{fontSize:12.5,fontWeight:600,color:'#CBD5E1'}}>{p.profiles?.full_name||'—'}</div>
                                  <div className="cell-secondary">{p.profiles?.email}</div>
                                </div>
                              </div>
                            </td>
                            <td><span style={{textTransform:'capitalize',fontSize:12.5,color:'#64748B'}}>{p.type}</span></td>
                            <td><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#F1F5F9'}}>{p.total_units}</span></td>
                            <td>
                              <select className="inline-sel" value={p.status} onChange={e=>quickUpdate('property',p.id,{status:e.target.value})}>
                                <option value="active">Active</option>
                                <option value="listed">Listed</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                            <td><span style={{fontSize:12,color:'#334155'}}>{fmtAgo(p.created_at)}</span></td>
                            <td>
                              <button className="act act-del" onClick={()=>setConfirmDelete({resource:'property',id:p.id,label:p.name})}>🗑 Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ SUBSCRIPTIONS ══ */}
            {tab==='subscriptions'&&(
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">◈ Subscriptions <span className="panel-count">{fSubs.length}</span></div>
                  <div style={{display:'flex',gap:8}}>
                    <Chip text={`${subscriptions.filter(s=>s.plan==='pro').length} Pro`} type="pro"/>
                    <Chip text={`${subscriptions.filter(s=>s.plan==='business').length} Business`} type="business"/>
                  </div>
                </div>
                {loading?(<div className="loading-rows">{[1,2,3].map(i=><div key={i} className="skel" style={{height:52}}/>)}</div>)
                :fSubs.length===0?(<div className="empty"><div className="empty-ico">◈</div><div className="empty-text">No subscriptions</div></div>):(
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Stripe ID</th><th>Since</th><th>Actions</th></tr></thead>
                      <tbody>
                        {fSubs.map(s=>(
                          <tr key={s.profile_id}>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <Avatar name={s.profiles?.full_name} size={32}/>
                                <div>
                                  <div className="cell-primary">{s.profiles?.full_name||'—'}</div>
                                  <div className="cell-secondary">{s.profiles?.email}</div>
                                </div>
                              </div>
                            </td>
                            <td><Chip text={s.plan||'free'} type={s.plan||'free'}/></td>
                            <td><Chip text={s.status||'inactive'} type={s.status||'inactive'}/></td>
                            <td><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:'#334155'}}>{s.stripe_customer_id?s.stripe_customer_id.slice(0,20)+'…':'—'}</span></td>
                            <td><span style={{fontSize:12,color:'#334155'}}>{s.created_at?fmtAgo(s.created_at):'—'}</span></td>
                            <td>
                              <button className="act act-edit" onClick={()=>setEditSub(s)}>✏ Edit Plan</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ LISTINGS ══ */}
            {tab==='listings'&&(
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">⬕ Listings <span className="panel-count">{fListings.length}</span></div>
                  <div style={{display:'flex',gap:8}}>
                    <Chip text={`${listings.filter(l=>l.status==='active').length} Active`} type="active"/>
                    <Chip text={`${listings.filter(l=>l.status==='draft').length} Draft`} type="draft"/>
                  </div>
                </div>
                {loading?(<div className="loading-rows">{[1,2,3,4].map(i=><div key={i} className="skel" style={{height:52}}/>)}</div>)
                :fListings.length===0?(<div className="empty"><div className="empty-ico">⬕</div><div className="empty-text">No listings found</div></div>):(
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Listing</th><th>Landlord</th><th>Property</th><th>Rent</th><th>Status</th><th>Posted</th><th>Actions</th></tr></thead>
                      <tbody>
                        {fListings.map(l=>(
                          <tr key={l.id}>
                            <td>
                              <div className="cell-primary" style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.title}</div>
                            </td>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <Avatar name={l.profiles?.full_name} size={28}/>
                                <span style={{fontSize:12.5,fontWeight:600,color:'#CBD5E1'}}>{l.profiles?.full_name||'—'}</span>
                              </div>
                            </td>
                            <td><span style={{fontSize:12,color:'#475569'}}>{l.properties?.name||'—'} · {l.properties?.city}</span></td>
                            <td><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#34D399',fontSize:13}}>${l.rent_amount}/mo</span></td>
                            <td><Chip text={l.status} type={l.status}/></td>
                            <td><span style={{fontSize:12,color:'#334155'}}>{fmtAgo(l.created_at)}</span></td>
                            <td>
                              <div className="acts">
                                <button className="act act-edit" onClick={()=>setEditListing(l)}>✏ Moderate</button>
                                <button className="act act-del" onClick={()=>setConfirmDelete({resource:'listing',id:l.id,label:l.title})}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ MAINTENANCE ══ */}
            {tab==='maintenance'&&(
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">⚙ Maintenance <span className="panel-count">{fMaint.length}</span></div>
                  <div style={{display:'flex',gap:8}}>
                    <Chip text={`${maintenance.filter(m=>m.status==='open').length} Open`} type="open"/>
                    <Chip text={`${maintenance.filter(m=>m.status==='in_progress').length} In Progress`} type="in_progress"/>
                    <Chip text={`${maintenance.filter(m=>m.status==='resolved').length} Resolved`} type="resolved"/>
                  </div>
                </div>
                {loading?(<div className="loading-rows">{[1,2,3,4,5].map(i=><div key={i} className="skel" style={{height:52}}/>)}</div>)
                :fMaint.length===0?(<div className="empty"><div className="empty-ico">⚙</div><div className="empty-text">No requests found</div></div>):(
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Title</th><th>Property</th><th>Priority</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
                      <tbody>
                        {fMaint.map(m=>(
                          <tr key={m.id}>
                            <td><div className="cell-primary">{m.title}</div></td>
                            <td><span style={{fontSize:12.5,color:'#64748B'}}>{m.properties?.name||'—'}</span></td>
                            <td>
                              <span style={{
                                fontSize:11,fontWeight:700,
                                color:PRIORITY_COLORS[m.priority]||'#64748B',
                                background:`${PRIORITY_COLORS[m.priority]||'#64748B'}14`,
                                border:`1px solid ${PRIORITY_COLORS[m.priority]||'#64748B'}25`,
                                borderRadius:99,padding:'3px 10px',
                                textTransform:'capitalize',
                                fontFamily:"'DM Mono',monospace",letterSpacing:'0.3px',
                              }}>● {m.priority}</span>
                            </td>
                            <td>
                              <select className="inline-sel" value={m.status} onChange={e=>quickUpdate('maintenance',m.id,{status:e.target.value})}>
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            </td>
                            <td><span style={{fontSize:12,color:'#334155'}}>{fmtAgo(m.created_at)}</span></td>
                            <td>
                              <button className="act act-del" onClick={()=>setConfirmDelete({resource:'maintenance',id:m.id,label:m.title})}>🗑 Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
