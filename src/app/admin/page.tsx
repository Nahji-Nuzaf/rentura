'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────
type Stats = {
  totalUsers: number; totalProperties: number; proUsers: number
  totalListings: number; openMaintenance: number; mrr: string
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
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  return fmtDate(s)
}

const PLAN_STYLE: Record<string, { bg: string; color: string }> = {
  pro:      { bg: 'rgba(251,191,36,.15)', color: '#D97706' },
  business: { bg: 'rgba(99,102,241,.15)', color: '#6366F1' },
  free:     { bg: '#F1F5F9',             color: '#64748B' },
}
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:      { bg: '#DCFCE7', color: '#16A34A' },
  inactive:    { bg: '#FEE2E2', color: '#DC2626' },
  past_due:    { bg: '#FEF3C7', color: '#D97706' },
  open:        { bg: '#FEE2E2', color: '#DC2626' },
  in_progress: { bg: '#FEF3C7', color: '#D97706' },
  resolved:    { bg: '#DCFCE7', color: '#16A34A' },
  listed:      { bg: '#EFF6FF', color: '#2563EB' },
  draft:       { bg: '#F1F5F9', color: '#64748B' },
  taken:       { bg: '#DCFCE7', color: '#16A34A' },
  pending:     { bg: '#FEF3C7', color: '#D97706' },
}
const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#DC2626', high: '#D97706', medium: '#CA8A04', low: '#16A34A'
}

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab]               = useState<Tab>('overview')
  const [stats, setStats]           = useState<Stats | null>(null)
  const [users, setUsers]           = useState<User[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [listings, setListings]     = useState<Listing[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceReq[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Edit modals
  const [editUser, setEditUser]       = useState<User | null>(null)
  const [editSub, setEditSub]         = useState<Subscription | null>(null)
  const [editListing, setEditListing] = useState<Listing | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ resource: string; id: string; label: string } | null>(null)
  const [saving, setSaving]           = useState(false)

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
    setStats(d)
  }

  async function loadTab(t: Tab) {
    if (t === 'overview') { await loadStats(); setLoading(false); return }
    setLoading(true)
    const d = await api('GET', { resource: t === 'subscriptions' ? 'subscriptions' : t })
    if (t === 'users')         setUsers(d.data || [])
    if (t === 'properties')    setProperties(d.data || [])
    if (t === 'subscriptions') setSubscriptions(d.data || [])
    if (t === 'listings')      setListings(d.data || [])
    if (t === 'maintenance')   setMaintenance(d.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadStats()
    setLoading(false)
  }, [])

  useEffect(() => {
    loadTab(tab)
  }, [tab])

  async function handleDelete() {
    if (!confirmDelete) return
    setSaving(true)
    const d = await api('DELETE', { resource: confirmDelete.resource, id: confirmDelete.id })
    setSaving(false)
    setConfirmDelete(null)
    if (d.success) { showToast('Deleted successfully'); loadTab(tab) }
    else showToast(d.error || 'Delete failed', 'error')
  }

  async function handleSaveUser() {
    if (!editUser) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'user', id: editUser.id, data: {
      full_name: editUser.full_name, phone: editUser.phone, active_role: editUser.active_role
    }})
    setSaving(false)
    if (d.success) { showToast('User updated'); setEditUser(null); loadTab('users') }
    else showToast(d.error || 'Update failed', 'error')
  }

  async function handleSaveSub() {
    if (!editSub) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'subscription', id: editSub.profile_id, data: {
      plan: editSub.plan, status: editSub.status
    }})
    setSaving(false)
    if (d.success) { showToast('Subscription updated'); setEditSub(null); loadTab('subscriptions') }
    else showToast(d.error || 'Update failed', 'error')
  }

  async function handleSaveListing() {
    if (!editListing) return
    setSaving(true)
    const d = await api('PATCH', { resource: 'listing', id: editListing.id, data: { status: editListing.status }})
    setSaving(false)
    if (d.success) { showToast('Listing updated'); setEditListing(null); loadTab('listings') }
    else showToast(d.error || 'Update failed', 'error')
  }

  async function handleMaintenanceStatus(id: string, status: string) {
    const d = await api('PATCH', { resource: 'maintenance', id, data: { status } })
    if (d.success) { showToast('Status updated'); loadTab('maintenance') }
    else showToast(d.error || 'Failed', 'error')
  }

  async function handlePropertyStatus(id: string, status: string) {
    const d = await api('PATCH', { resource: 'property', id, data: { status } })
    if (d.success) { showToast('Property updated'); loadTab('properties') }
    else showToast(d.error || 'Failed', 'error')
  }

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  const TABS: { id: Tab; label: string; ico: string }[] = [
    { id: 'overview',      label: 'Overview',      ico: '⊞' },
    { id: 'users',         label: 'Users',         ico: '👥' },
    { id: 'properties',    label: 'Properties',    ico: '🏠' },
    { id: 'subscriptions', label: 'Subscriptions', ico: '💳' },
    { id: 'listings',      label: 'Listings',      ico: '📋' },
    { id: 'maintenance',   label: 'Maintenance',   ico: '🔧' },
  ]

  function Badge({ text, style }: { text: string; style?: { bg: string; color: string } }) {
    const s = style || { bg: '#F1F5F9', color: '#64748B' }
    return (
      <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>
        {text}
      </span>
    )
  }

  const filterText = search.toLowerCase()
  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(filterText) || u.email?.toLowerCase().includes(filterText)
  )
  const filteredProps = properties.filter(p =>
    p.name?.toLowerCase().includes(filterText) || p.city?.toLowerCase().includes(filterText) ||
    p.profiles?.full_name?.toLowerCase().includes(filterText)
  )
  const filteredSubs = subscriptions.filter(s =>
    s.profiles?.full_name?.toLowerCase().includes(filterText) || s.profiles?.email?.toLowerCase().includes(filterText)
  )
  const filteredListings = listings.filter(l =>
    l.title?.toLowerCase().includes(filterText) || l.profiles?.full_name?.toLowerCase().includes(filterText)
  )
  const filteredMaint = maintenance.filter(m =>
    m.title?.toLowerCase().includes(filterText) || m.properties?.name?.toLowerCase().includes(filterText)
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#0B1120;color:#E2E8F0;overflow-x:hidden}
        .shell{display:flex;min-height:100vh}
        /* SIDEBAR */
        .sidebar{width:240px;flex-shrink:0;background:#0F172A;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:100}
        .sb-logo{padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:10px}
        .sb-logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#DC2626,#991B1B);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .sb-logo-text{font-family:'Fraunces',serif;font-size:17px;font-weight:700;color:#F8FAFC}
        .sb-logo-sub{font-size:10px;color:#DC2626;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
        .sb-nav{flex:1;padding:14px 10px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
        .sb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;color:#64748B;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;width:100%;text-align:left}
        .sb-item:hover{background:rgba(255,255,255,.05);color:#CBD5E1}
        .sb-item.active{background:rgba(220,38,38,.12);color:#FCA5A5;font-weight:700;border:1px solid rgba(220,38,38,.2)}
        .sb-ico{font-size:15px;width:18px;text-align:center;flex-shrink:0}
        .sb-footer{padding:14px;border-top:1px solid rgba(255,255,255,.06)}
        .sb-logout{width:100%;padding:9px;border-radius:9px;border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.08);color:#FCA5A5;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px}
        .sb-logout:hover{background:rgba(220,38,38,.16)}
        /* MAIN */
        .main{margin-left:240px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0}
        .topbar{height:56px;background:#0F172A;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;padding:0 24px;position:sticky;top:0;z-index:50}
        .topbar-title{font-size:14px;font-weight:700;color:#F1F5F9}
        .topbar-sub{font-size:11.5px;color:#475569;margin-top:1px}
        .search-box{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:7px 12px;flex:1;max-width:320px}
        .search-box input{background:none;border:none;outline:none;color:#CBD5E1;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;width:100%}
        .search-box input::placeholder{color:#475569}
        .content{padding:24px;flex:1;overflow-x:hidden}
        /* STATS */
        .stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:24px}
        .stat-card{background:#1E293B;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px}
        .stat-ico{font-size:20px;margin-bottom:8px}
        .stat-val{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:#F1F5F9;line-height:1;margin-bottom:3px}
        .stat-lbl{font-size:11px;color:#475569;font-weight:500}
        .stat-sub{font-size:11px;color:#34D399;font-weight:600;margin-top:4px}
        /* TABLE */
        .table-wrap{background:#1E293B;border:1px solid rgba(255,255,255,.06);border-radius:16px;overflow:hidden}
        .table-head{padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06)}
        .table-title{font-size:14px;font-weight:700;color:#F1F5F9}
        .table-count{font-size:12px;color:#475569;background:rgba(255,255,255,.06);border-radius:99px;padding:2px 10px}
        table{width:100%;border-collapse:collapse}
        th{padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}
        td{padding:12px 16px;font-size:13px;color:#CBD5E1;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
        tr:last-child td{border-bottom:none}
        tbody tr:hover{background:rgba(255,255,255,.02)}
        .cell-main{font-weight:600;color:#E2E8F0;margin-bottom:2px}
        .cell-sub{font-size:11.5px;color:#475569}
        /* ACTIONS */
        .act-btn{padding:4px 10px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;border:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .act-edit{background:rgba(37,99,235,.15);color:#93C5FD}
        .act-edit:hover{background:rgba(37,99,235,.25)}
        .act-del{background:rgba(220,38,38,.12);color:#FCA5A5}
        .act-del:hover{background:rgba(220,38,38,.22)}
        .act-green{background:rgba(16,185,129,.12);color:#34D399}
        .act-green:hover{background:rgba(16,185,129,.22)}
        .act-row{display:flex;gap:5px;flex-wrap:wrap}
        /* SELECT */
        .inline-select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:#CBD5E1;font-size:12px;font-family:'Plus Jakarta Sans',sans-serif;padding:4px 8px;cursor:pointer;outline:none}
        .inline-select option{background:#1E293B}
        /* MODAL */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;align-items:center;justify-content:center;padding:20px}
        .modal-bg.open{display:flex}
        .modal{background:#1E293B;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px;width:100%;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
        .modal-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#F1F5F9;margin-bottom:18px;display:flex;align-items:center;gap:8px}
        .modal-field{margin-bottom:14px}
        .modal-field label{display:block;font-size:11.5px;font-weight:700;color:#94A3B8;margin-bottom:5px;text-transform:uppercase;letter-spacing:.3px}
        .modal-field input,.modal-field select{width:100%;padding:9px 13px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#E2E8F0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border .15s}
        .modal-field input:focus,.modal-field select:focus{border-color:#DC2626;box-shadow:0 0 0 2px rgba(220,38,38,.15)}
        .modal-field select option{background:#1E293B}
        .modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
        .modal-cancel{padding:9px 18px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .modal-save{padding:9px 20px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .modal-save.danger{background:linear-gradient(135deg,#DC2626,#991B1B)}
        .modal-save:disabled{opacity:.6;cursor:not-allowed}
        /* EMPTY */
        .empty{text-align:center;padding:60px 20px;color:#475569;font-size:13px}
        /* TOAST */
        .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:11px 20px;border-radius:11px;font-size:13.5px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:toastIn .2s ease;white-space:nowrap}
        .toast.success{background:linear-gradient(135deg,#16A34A,#15803D)}
        .toast.error{background:linear-gradient(135deg,#DC2626,#B91C1C)}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        /* SKELETON */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:6px}
        /* OVERVIEW SECTION */
        .section-title{font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.7px;margin-bottom:12px}
        .overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .ov-card{background:#1E293B;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:18px}
        .ov-card-title{font-size:13px;font-weight:700;color:#94A3B8;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
        .ov-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
        .ov-row:last-child{border-bottom:none}
        .ov-name{font-size:13px;font-weight:600;color:#CBD5E1}
        .ov-sub{font-size:11px;color:#475569;margin-top:1px}
        @media(max-width:1200px){.stats-grid{grid-template-columns:repeat(3,1fr)}.overview-grid{grid-template-columns:1fr}}
        @media(max-width:900px){.stats-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){.sidebar{display:none}.main{margin-left:0}}
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.type==='success'?'✓':'⚠'} {toast.msg}</div>}

      {/* ── CONFIRM DELETE MODAL ── */}
      <div className={`modal-bg${confirmDelete?' open':''}`} onClick={()=>setConfirmDelete(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">🗑️ Confirm Delete</div>
          <p style={{fontSize:13.5,color:'#94A3B8',lineHeight:1.6,marginBottom:20}}>
            Are you sure you want to delete <strong style={{color:'#F1F5F9'}}>{confirmDelete?.label}</strong>?<br/>
            This action is <strong style={{color:'#FCA5A5'}}>permanent and cannot be undone.</strong>
          </p>
          <div className="modal-actions">
            <button className="modal-cancel" onClick={()=>setConfirmDelete(null)}>Cancel</button>
            <button className="modal-save danger" onClick={handleDelete} disabled={saving}>{saving?'Deleting...':'Yes, Delete'}</button>
          </div>
        </div>
      </div>

      {/* ── EDIT USER MODAL ── */}
      <div className={`modal-bg${editUser?' open':''}`} onClick={()=>setEditUser(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">✏️ Edit User</div>
          {editUser && <>
            <div className="modal-field"><label>Full Name</label>
              <input value={editUser.full_name||''} onChange={e=>setEditUser(u=>u?({...u,full_name:e.target.value}):u)}/>
            </div>
            <div className="modal-field"><label>Phone</label>
              <input value={editUser.phone||''} onChange={e=>setEditUser(u=>u?({...u,phone:e.target.value}):u)}/>
            </div>
            <div className="modal-field"><label>Active Role</label>
              <select value={editUser.active_role||'landlord'} onChange={e=>setEditUser(u=>u?({...u,active_role:e.target.value}):u)}>
                <option value="landlord">Landlord</option>
                <option value="tenant">Tenant</option>
                <option value="seeker">Seeker</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={()=>setEditUser(null)}>Cancel</button>
              <button className="modal-save" onClick={handleSaveUser} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
            </div>
          </>}
        </div>
      </div>

      {/* ── EDIT SUBSCRIPTION MODAL ── */}
      <div className={`modal-bg${editSub?' open':''}`} onClick={()=>setEditSub(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">💳 Edit Subscription</div>
          {editSub && <>
            <div style={{background:'rgba(255,255,255,.04)',borderRadius:10,padding:'10px 14px',marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#F1F5F9'}}>{editSub.profiles?.full_name}</div>
              <div style={{fontSize:12,color:'#475569'}}>{editSub.profiles?.email}</div>
            </div>
            <div className="modal-field"><label>Plan</label>
              <select value={editSub.plan||'free'} onChange={e=>setEditSub(s=>s?({...s,plan:e.target.value}):s)}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="modal-field"><label>Status</label>
              <select value={editSub.status||'active'} onChange={e=>setEditSub(s=>s?({...s,status:e.target.value}):s)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="past_due">Past Due</option>
              </select>
            </div>
            <div style={{fontSize:12,color:'#F59E0B',background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',borderRadius:8,padding:'8px 12px',marginBottom:14}}>
              ⚠️ Changing plan here updates the DB directly. Stripe subscription is NOT modified.
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={()=>setEditSub(null)}>Cancel</button>
              <button className="modal-save" onClick={handleSaveSub} disabled={saving}>{saving?'Saving...':'Update Plan'}</button>
            </div>
          </>}
        </div>
      </div>

      {/* ── EDIT LISTING MODAL ── */}
      <div className={`modal-bg${editListing?' open':''}`} onClick={()=>setEditListing(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-title">📋 Moderate Listing</div>
          {editListing && <>
            <div style={{background:'rgba(255,255,255,.04)',borderRadius:10,padding:'10px 14px',marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#F1F5F9'}}>{editListing.title}</div>
              <div style={{fontSize:12,color:'#475569'}}>{editListing.profiles?.full_name} · ${editListing.rent_amount}/mo</div>
            </div>
            <div className="modal-field"><label>Status</label>
              <select value={editListing.status} onChange={e=>setEditListing(l=>l?({...l,status:e.target.value}):l)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="taken">Taken</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={()=>setEditListing(null)}>Cancel</button>
              <button className="modal-save" onClick={handleSaveListing} disabled={saving}>{saving?'Saving...':'Update Listing'}</button>
            </div>
          </>}
        </div>
      </div>

      <div className="shell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-logo-icon">🛡️</div>
            <div>
              <div className="sb-logo-text">Rentura</div>
              <div className="sb-logo-sub">Admin Panel</div>
            </div>
          </div>
          <nav className="sb-nav">
            {TABS.map(t=>(
              <button key={t.id} className={`sb-item${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
                <span className="sb-ico">{t.ico}</span>{t.label}
              </button>
            ))}
          </nav>
          <div className="sb-footer">
            <div style={{fontSize:11,color:'#334155',marginBottom:10,textAlign:'center'}}>
              Logged in as Admin<br/>
              <span style={{color:'#DC2626',fontWeight:700}}>RESTRICTED ACCESS</span>
            </div>
            <button className="sb-logout" onClick={handleLogout}>🚪 Sign Out</button>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div>
              <div className="topbar-title">
                {TABS.find(t=>t.id===tab)?.ico} {TABS.find(t=>t.id===tab)?.label}
              </div>
              <div className="topbar-sub">Rentura Admin · All data</div>
            </div>
            {tab !== 'overview' && (
              <div className="search-box">
                <span style={{color:'#475569',fontSize:14}}>🔍</span>
                <input placeholder={`Search ${tab}...`} value={search} onChange={e=>setSearch(e.target.value)}/>
                {search && <span onClick={()=>setSearch('')} style={{color:'#475569',cursor:'pointer',fontSize:12}}>✕</span>}
              </div>
            )}
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {stats && (
                <div style={{fontSize:12,color:'#34D399',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.2)',borderRadius:99,padding:'4px 12px',fontWeight:700}}>
                  MRR: ${stats.mrr}
                </div>
              )}
              <button onClick={()=>loadTab(tab)} style={{padding:'6px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,.1)',background:'transparent',color:'#64748B',fontSize:12,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif'}}>↻ Refresh</button>
            </div>
          </div>

          <div className="content">

            {/* ══ OVERVIEW ══ */}
            {tab==='overview' && (
              <>
                <div className="section-title">Platform Stats</div>
                <div className="stats-grid" style={{marginBottom:24}}>
                  {[
                    { ico:'👥', val: stats?.totalUsers ?? '—', lbl:'Total Users',       sub:'All registered accounts', color:'#60A5FA' },
                    { ico:'🏠', val: stats?.totalProperties ?? '—', lbl:'Properties',   sub:'Across all landlords',    color:'#34D399' },
                    { ico:'⭐', val: stats?.proUsers ?? '—', lbl:'Pro Users',            sub:'Active paid plans',       color:'#FCD34D' },
                    { ico:'💰', val: `$${stats?.mrr ?? '0'}`, lbl:'Monthly Revenue',    sub:'From active subs',        color:'#A78BFA' },
                    { ico:'📋', val: stats?.totalListings ?? '—', lbl:'Active Listings', sub:'On the platform',        color:'#F9A8D4' },
                    { ico:'🔧', val: stats?.openMaintenance ?? '—', lbl:'Open Requests', sub:'Need attention',         color:'#FCA5A5' },
                  ].map(s=>(
                    <div key={s.lbl} className="stat-card">
                      <div className="stat-ico">{s.ico}</div>
                      <div className="stat-val" style={{color:s.color}}>{s.val}</div>
                      <div className="stat-lbl">{s.lbl}</div>
                      <div className="stat-sub">{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="section-title">Quick Actions</div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:24}}>
                  {[
                    {label:'👥 Manage Users',    action:()=>setTab('users')},
                    {label:'💳 Subscriptions',   action:()=>setTab('subscriptions')},
                    {label:'🏠 Properties',      action:()=>setTab('properties')},
                    {label:'📋 Listings',        action:()=>setTab('listings')},
                    {label:'🔧 Maintenance',     action:()=>setTab('maintenance')},
                  ].map(q=>(
                    <button key={q.label} onClick={q.action} style={{padding:'9px 16px',borderRadius:10,border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',color:'#CBD5E1',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif',transition:'all .15s'}}
                      onMouseOver={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')}
                      onMouseOut={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}>
                      {q.label}
                    </button>
                  ))}
                </div>

                <div className="section-title">System Status</div>
                <div className="overview-grid">
                  <div className="ov-card">
                    <div className="ov-card-title">
                      <span>Platform Health</span>
                      <span style={{fontSize:11,color:'#34D399',background:'rgba(16,185,129,.1)',padding:'2px 8px',borderRadius:99}}>● All systems operational</span>
                    </div>
                    {[
                      {label:'Database',         status:'Operational', color:'#34D399'},
                      {label:'Authentication',   status:'Operational', color:'#34D399'},
                      {label:'File Storage',     status:'Operational', color:'#34D399'},
                      {label:'Stripe Payments',  status:'Sandbox Mode', color:'#FCD34D'},
                      {label:'AI (Groq)',         status:'Operational', color:'#34D399'},
                      {label:'Email Alerts',     status:'Not configured', color:'#64748B'},
                    ].map(s=>(
                      <div key={s.label} className="ov-row">
                        <span className="ov-name">{s.label}</span>
                        <span style={{fontSize:12,fontWeight:700,color:s.color}}>● {s.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ov-card">
                    <div className="ov-card-title">Revenue Breakdown</div>
                    {[
                      {label:'Pro subscriptions',     val:`${stats?.proUsers ?? 0} users`},
                      {label:'MRR (Pro @ $9.99)',     val:`$${stats?.mrr ?? '0'}`},
                      {label:'ARR (projected)',        val:`$${((parseFloat(stats?.mrr||'0'))*12).toFixed(2)}`},
                      {label:'Free users',            val:`${Math.max(0,(stats?.totalUsers??0)-(stats?.proUsers??0))}`},
                      {label:'Conversion rate',       val: stats ? `${stats.totalUsers > 0 ? Math.round((stats.proUsers/stats.totalUsers)*100) : 0}%` : '—'},
                    ].map(r=>(
                      <div key={r.label} className="ov-row">
                        <span className="ov-name">{r.label}</span>
                        <span style={{fontSize:13,fontWeight:700,color:'#F1F5F9'}}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ USERS ══ */}
            {tab==='users' && (
              <div className="table-wrap">
                <div className="table-head">
                  <span className="table-title">👥 All Users</span>
                  <span className="table-count">{filteredUsers.length} users</span>
                </div>
                {loading ? <div style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:14,width:200,margin:'0 auto'}}/></div> :
                filteredUsers.length === 0 ? <div className="empty">No users found</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead><tr>
                        <th>User</th><th>Role</th><th>Plan</th><th>Phone</th><th>Joined</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredUsers.map(u=>(
                          <tr key={u.id}>
                            <td>
                              <div className="cell-main">{u.full_name || 'No name'}</div>
                              <div className="cell-sub">{u.email}</div>
                            </td>
                            <td>
                              <Badge text={u.active_role || 'landlord'} style={{
                                bg: u.active_role==='tenant'?'rgba(16,185,129,.12)':u.active_role==='seeker'?'rgba(251,191,36,.12)':'rgba(59,130,246,.12)',
                                color: u.active_role==='tenant'?'#34D399':u.active_role==='seeker'?'#FCD34D':'#60A5FA'
                              }}/>
                            </td>
                            <td>
                              <Badge
                                text={u.subscription?.plan || 'free'}
                                style={PLAN_STYLE[u.subscription?.plan||'free']}
                              />
                            </td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{u.phone || '—'}</span></td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{fmtAgo(u.created_at)}</span></td>
                            <td>
                              <div className="act-row">
                                <button className="act-btn act-edit" onClick={()=>setEditUser(u)}>✏️ Edit</button>
                                <button className="act-btn act-del" onClick={()=>setConfirmDelete({resource:'user',id:u.id,label:u.full_name||u.email})}>🗑 Delete</button>
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
            {tab==='properties' && (
              <div className="table-wrap">
                <div className="table-head">
                  <span className="table-title">🏠 All Properties</span>
                  <span className="table-count">{filteredProps.length} properties</span>
                </div>
                {loading ? <div style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:14,width:200,margin:'0 auto'}}/></div> :
                filteredProps.length === 0 ? <div className="empty">No properties found</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead><tr>
                        <th>Property</th><th>Landlord</th><th>Type</th><th>Units</th><th>Status</th><th>Created</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredProps.map(p=>(
                          <tr key={p.id}>
                            <td>
                              <div className="cell-main">{p.name}</div>
                              <div className="cell-sub">📍 {p.city}, {p.country}</div>
                            </td>
                            <td>
                              <div className="cell-main" style={{fontSize:12.5}}>{p.profiles?.full_name||'—'}</div>
                              <div className="cell-sub">{p.profiles?.email}</div>
                            </td>
                            <td><span style={{color:'#94A3B8',fontSize:12,textTransform:'capitalize'}}>{p.type}</span></td>
                            <td><span style={{fontWeight:700,color:'#F1F5F9'}}>{p.total_units}</span></td>
                            <td>
                              <select className="inline-select" value={p.status} onChange={e=>handlePropertyStatus(p.id, e.target.value)}>
                                <option value="active">Active</option>
                                <option value="listed">Listed</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{fmtAgo(p.created_at)}</span></td>
                            <td>
                              <button className="act-btn act-del" onClick={()=>setConfirmDelete({resource:'property',id:p.id,label:p.name})}>🗑 Delete</button>
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
            {tab==='subscriptions' && (
              <div className="table-wrap">
                <div className="table-head">
                  <span className="table-title">💳 Subscriptions</span>
                  <span className="table-count">{filteredSubs.length} records</span>
                </div>
                {loading ? <div style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:14,width:200,margin:'0 auto'}}/></div> :
                filteredSubs.length === 0 ? <div className="empty">No subscriptions found</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead><tr>
                        <th>User</th><th>Plan</th><th>Status</th><th>Stripe Customer</th><th>Created</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredSubs.map(s=>(
                          <tr key={s.profile_id}>
                            <td>
                              <div className="cell-main">{s.profiles?.full_name||'—'}</div>
                              <div className="cell-sub">{s.profiles?.email}</div>
                            </td>
                            <td><Badge text={s.plan||'free'} style={PLAN_STYLE[s.plan||'free']}/></td>
                            <td><Badge text={s.status||'inactive'} style={STATUS_STYLE[s.status||'inactive']}/></td>
                            <td><span style={{fontFamily:'monospace',fontSize:11,color:'#475569'}}>{s.stripe_customer_id ? s.stripe_customer_id.slice(0,18)+'...' : '—'}</span></td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{fmtAgo(s.created_at)}</span></td>
                            <td>
                              <button className="act-btn act-edit" onClick={()=>setEditSub(s)}>✏️ Edit Plan</button>
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
            {tab==='listings' && (
              <div className="table-wrap">
                <div className="table-head">
                  <span className="table-title">📋 All Listings</span>
                  <span className="table-count">{filteredListings.length} listings</span>
                </div>
                {loading ? <div style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:14,width:200,margin:'0 auto'}}/></div> :
                filteredListings.length === 0 ? <div className="empty">No listings found</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead><tr>
                        <th>Title</th><th>Landlord</th><th>Property</th><th>Rent</th><th>Status</th><th>Created</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredListings.map(l=>(
                          <tr key={l.id}>
                            <td>
                              <div className="cell-main" style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.title}</div>
                            </td>
                            <td>
                              <div className="cell-main" style={{fontSize:12.5}}>{l.profiles?.full_name||'—'}</div>
                              <div className="cell-sub">{l.profiles?.email}</div>
                            </td>
                            <td><span style={{color:'#94A3B8',fontSize:12}}>{l.properties?.name||'—'} · {l.properties?.city}</span></td>
                            <td><span style={{fontWeight:700,color:'#F1F5F9'}}>${l.rent_amount}/mo</span></td>
                            <td><Badge text={l.status} style={STATUS_STYLE[l.status]||STATUS_STYLE.draft}/></td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{fmtAgo(l.created_at)}</span></td>
                            <td>
                              <div className="act-row">
                                <button className="act-btn act-edit" onClick={()=>setEditListing(l)}>✏️ Moderate</button>
                                <button className="act-btn act-del" onClick={()=>setConfirmDelete({resource:'listing',id:l.id,label:l.title})}>🗑 Delete</button>
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
            {tab==='maintenance' && (
              <div className="table-wrap">
                <div className="table-head">
                  <span className="table-title">🔧 Maintenance Requests</span>
                  <span className="table-count">{filteredMaint.length} requests</span>
                </div>
                {loading ? <div style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:14,width:200,margin:'0 auto'}}/></div> :
                filteredMaint.length === 0 ? <div className="empty">No maintenance requests found</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table>
                      <thead><tr>
                        <th>Title</th><th>Property</th><th>Priority</th><th>Status</th><th>Submitted</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredMaint.map(m=>(
                          <tr key={m.id}>
                            <td><div className="cell-main">{m.title}</div></td>
                            <td><span style={{color:'#94A3B8',fontSize:12}}>{m.properties?.name||'—'}</span></td>
                            <td>
                              <span style={{fontSize:11,fontWeight:700,color:PRIORITY_COLOR[m.priority]||'#94A3B8',background:'rgba(255,255,255,.05)',borderRadius:99,padding:'2px 9px',textTransform:'capitalize'}}>
                                ● {m.priority}
                              </span>
                            </td>
                            <td>
                              <select className="inline-select" value={m.status} onChange={e=>handleMaintenanceStatus(m.id, e.target.value)}>
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            </td>
                            <td><span style={{color:'#64748B',fontSize:12}}>{fmtAgo(m.created_at)}</span></td>
                            <td>
                              <button className="act-btn act-del" onClick={()=>setConfirmDelete({resource:'maintenance',id:m.id,label:m.title})}>🗑 Delete</button>
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
