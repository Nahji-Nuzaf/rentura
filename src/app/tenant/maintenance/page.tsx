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

type MaintenanceRequest = {
  id: string
  tenant_id: string
  property_id: string
  unit_id: string
  title: string
  description: string
  photo_urls?: string[]
  priority: 'low' | 'medium' | 'high'
  status: 'open' | 'in_progress' | 'resolved'
  created_at: string
  resolved_at?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
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
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(s)
}

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: '#DC2626', bg: '#FEE2E2', dot: '#DC2626' },
  medium: { label: 'Medium', color: '#D97706', bg: '#FEF9C3', dot: '#D97706' },
  low:    { label: 'Low',    color: '#16A34A', bg: '#DCFCE7', dot: '#16A34A' },
}

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#DC2626', bg: '#FEE2E2', step: 0 },
  in_progress: { label: 'In Progress', color: '#D97706', bg: '#FEF9C3', step: 1 },
  resolved:    { label: 'Resolved',    color: '#16A34A', bg: '#DCFCE7', step: 2 },
}

export default function TenantMaintenancePage() {
  const router = useRouter()

  const [profile, setProfile]       = useState<Profile | null>(null)
  const [tenantRow, setTenantRow]   = useState<TenantRow | null>(null)
  const [requests, setRequests]     = useState<MaintenanceRequest[]>([])
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeRole, setActiveRole] = useState('tenant')
  const [unreadCount, setUnreadCount] = useState(0)

  // UI state
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)
  const [filter, setFilter]                   = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [showForm, setShowForm]               = useState(false)
  const [detailRequest, setDetailRequest]     = useState<MaintenanceRequest | null>(null)

  // Form state
  const [formTitle, setFormTitle]       = useState('')
  const [formDesc, setFormDesc]         = useState('')
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [formError, setFormError]       = useState('')
  const [formSuccess, setFormSuccess]   = useState(false)

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

        const [{ data: reqData }, { data: msgData }] = await Promise.all([
          sb.from('maintenance_requests')
            .select('*')
            .eq('tenant_id', tRow.id)
            .order('created_at', { ascending: false }),
          sb.from('messages').select('id').eq('receiver_id', user.id).eq('read', false),
        ])

        setRequests(reqData || [])
        setUnreadCount((msgData || []).length)
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

  async function handleSubmit() {
    if (!formTitle.trim()) { setFormError('Please enter a title.'); return }
    if (!formDesc.trim()) { setFormError('Please describe the issue.'); return }
    if (!tenantRow) return

    setFormError('')
    setSubmitting(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('maintenance_requests').insert({
        tenant_id: tenantRow.id,
        property_id: tenantRow.property_id,
        unit_id: tenantRow.unit_id,
        title: formTitle.trim(),
        description: formDesc.trim(),
        priority: formPriority,
        status: 'open',
      }).select().single()

      if (error) throw error

      setRequests(prev => [data, ...prev])
      setFormTitle('')
      setFormDesc('')
      setFormPriority('medium')
      setFormSuccess(true)
      setTimeout(() => { setFormSuccess(false); setShowForm(false) }, 1800)
    } catch (e: any) {
      setFormError(e.message || 'Failed to submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  // Derived
  const total      = requests.length
  const openCount  = requests.filter(r => r.status === 'open').length
  const inProgCount = requests.filter(r => r.status === 'in_progress').length
  const resolvedCount = requests.filter(r => r.status === 'resolved').length

  const filtered = requests.filter(r => filter === 'all' || r.status === filter)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading maintenance...
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

        /* ── Page header ── */
        .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px}
        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A}
        .page-sub{font-size:13px;color:#94A3B8;margin-top:2px}
        .btn-primary{padding:11px 20px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:7px;box-shadow:0 4px 12px rgba(37,99,235,.28);transition:opacity .15s}
        .btn-primary:hover{opacity:.9}

        /* ── Stats ── */
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
        .stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .stat-val{font-family:'Fraunces',serif;font-size:28px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:4px}
        .stat-label{font-size:11px;color:#94A3B8;font-weight:500}

        /* ── Filter ── */
        .list-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px}
        .ftab{padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .ftab.active{background:#2563EB;color:#fff}
        .ftab:hover:not(.active){background:#F1F5F9;color:#0F172A}

        /* ── Request card ── */
        .req-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 1px 4px rgba(15,23,42,.04);cursor:pointer;transition:all .18s}
        .req-card:hover{border-color:#BFDBFE;box-shadow:0 6px 20px rgba(37,99,235,.09);transform:translateY(-1px)}
        .req-top{display:flex;align-items:flex-start;gap:14px;margin-bottom:14px}
        .req-priority-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:4px}
        .req-title{font-size:15px;font-weight:700;color:#0F172A;flex:1}
        .req-badges{display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0}
        .badge{display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;white-space:nowrap}
        .req-desc{font-size:13px;color:#64748B;line-height:1.6;margin-bottom:14px;padding-left:26px}
        .req-desc.clamped{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

        /* Progress steps */
        .steps{display:flex;align-items:center;gap:0;padding-left:26px}
        .step{display:flex;align-items:center;gap:6px}
        .step-circle{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;border:2px solid}
        .step-label{font-size:11.5px;font-weight:600;white-space:nowrap}
        .step-line{flex:1;height:2px;min-width:24px;max-width:48px}
        .req-footer{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid #F1F5F9}
        .req-time{font-size:12px;color:#94A3B8}

        /* ── New request form ── */
        .form-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .form-overlay.open{display:flex}
        .form-modal{background:#fff;border-radius:22px;padding:28px;width:100%;max-width:500px;box-shadow:0 24px 60px rgba(15,23,42,.2);max-height:90vh;overflow-y:auto}
        .form-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .form-sub{font-size:13px;color:#94A3B8;margin-bottom:20px}
        .form-label{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:block}
        .form-input{width:100%;padding:11px 14px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .form-input:focus{border-color:#2563EB}
        .form-textarea{min-height:100px;resize:vertical}
        .form-group{margin-bottom:16px}
        .priority-selector{display:flex;gap:8px}
        .priority-opt{flex:1;padding:10px 8px;border-radius:10px;border:2px solid #E2E8F0;cursor:pointer;text-align:center;font-size:12.5px;font-weight:700;transition:all .15s;background:#fff}
        .priority-opt.selected-low{border-color:#16A34A;background:#DCFCE7;color:#16A34A}
        .priority-opt.selected-medium{border-color:#D97706;background:#FEF9C3;color:#D97706}
        .priority-opt.selected-high{border-color:#DC2626;background:#FEE2E2;color:#DC2626}
        .form-actions{display:flex;gap:10px;margin-top:20px}
        .btn-cancel{flex:1;padding:12px;border-radius:11px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-submit{flex:2;padding:12px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 12px rgba(37,99,235,.28)}
        .btn-submit:disabled{opacity:.6;cursor:not-allowed}
        .form-error{background:#FEE2E2;color:#DC2626;font-size:13px;font-weight:600;padding:10px 14px;border-radius:9px;margin-bottom:14px}
        .form-success{background:#DCFCE7;color:#16A34A;font-size:13px;font-weight:700;padding:14px;border-radius:11px;text-align:center;margin-bottom:14px}

        /* ── Detail drawer ── */
        .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:400}
        .drawer-overlay.open{display:block}
        .drawer{position:fixed;top:0;right:0;width:460px;max-width:100vw;height:100vh;background:#fff;z-index:401;box-shadow:-8px 0 40px rgba(15,23,42,.15);transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
        .drawer.open{transform:translateX(0)}
        .drawer-header{padding:20px 22px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .drawer-close{width:32px;height:32px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#64748B}
        .drawer-body{flex:1;overflow-y:auto;padding:20px 22px}
        .drawer-body::-webkit-scrollbar{width:0}
        .d-section{margin-bottom:20px}
        .d-section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:10px}
        .d-row{display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #F8FAFC}
        .d-key{font-size:12px;color:#94A3B8;font-weight:500}
        .d-val{font-size:13px;font-weight:700;color:#0F172A;text-align:right;max-width:200px}

        .empty-state{text-align:center;padding:60px 24px}
        .empty-icon{font-size:44px;margin-bottom:12px}
        .empty-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
        .empty-sub{font-size:13px;color:#94A3B8}

        @media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:16px}
          .stats{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:480px){
          .stats{grid-template-columns:1fr 1fr}
          .steps{flex-wrap:wrap;gap:8px}
          .step-line{display:none}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* New Request Form Modal */}
      <div className={`form-overlay${showForm ? ' open' : ''}`} onClick={() => setShowForm(false)}>
        <div className="form-modal" onClick={e => e.stopPropagation()}>
          <div className="form-title">New Maintenance Request</div>
          <div className="form-sub">Describe the issue and we'll notify your landlord immediately.</div>

          {formSuccess && <div className="form-success">✅ Request submitted successfully!</div>}
          {formError && <div className="form-error">⚠️ {formError}</div>}

          {!formSuccess && (
            <>
              <div className="form-group">
                <label className="form-label">Issue Title *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Leaking faucet in bathroom"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Describe the problem in detail — when it started, how severe it is, and any other relevant info..."
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <div className="priority-selector">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <div
                      key={p}
                      className={`priority-opt${formPriority === p ? ` selected-${p}` : ''}`}
                      onClick={() => setFormPriority(p)}
                    >
                      {p === 'low' ? '🟢' : p === 'medium' ? '🟡' : '🔴'} {p.charAt(0).toUpperCase() + p.slice(1)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button className="btn-cancel" onClick={() => { setShowForm(false); setFormError('') }}>Cancel</button>
                <button className="btn-submit" disabled={submitting} onClick={handleSubmit}>
                  {submitting ? 'Submitting...' : '📨 Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <div className={`drawer-overlay${detailRequest ? ' open' : ''}`} onClick={() => setDetailRequest(null)} />
      <div className={`drawer${detailRequest ? ' open' : ''}`}>
        {detailRequest && (() => {
          const pc = PRIORITY_CONFIG[detailRequest.priority] || PRIORITY_CONFIG.medium
          const sc = STATUS_CONFIG[detailRequest.status] || STATUS_CONFIG.open
          return (
            <>
              <div className="drawer-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    <span className="badge" style={{ background: pc.bg, color: pc.color }}>{pc.label} Priority</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{detailRequest.title}</div>
                </div>
                <button className="drawer-close" onClick={() => setDetailRequest(null)}>✕</button>
              </div>
              <div className="drawer-body">
                {/* Progress steps */}
                <div className="d-section">
                  <div className="d-section-title">Progress</div>
                  <div className="steps">
                    {(['open', 'in_progress', 'resolved'] as const).map((s, i) => {
                      const cfg = STATUS_CONFIG[s]
                      const currentStep = sc.step
                      const done = currentStep >= i
                      const active = currentStep === i
                      return (
                        <div key={s} className="step">
                          <div className="step-circle" style={{
                            background: done ? cfg.bg : '#F1F5F9',
                            borderColor: done ? cfg.color : '#E2E8F0',
                            color: done ? cfg.color : '#94A3B8',
                          }}>
                            {done ? (s === 'resolved' ? '✓' : active ? '●' : '✓') : '○'}
                          </div>
                          <div className="step-label" style={{ color: done ? cfg.color : '#94A3B8' }}>{cfg.label}</div>
                          {i < 2 && (
                            <div className="step-line" style={{ background: currentStep > i ? '#2563EB' : '#E2E8F0' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Description */}
                <div className="d-section">
                  <div className="d-section-title">Description</div>
                  <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12 }}>
                    {detailRequest.description}
                  </div>
                </div>

                {/* Details */}
                <div className="d-section">
                  <div className="d-section-title">Details</div>
                  <div className="d-row">
                    <span className="d-key">Submitted</span>
                    <span className="d-val">{fmtDate(detailRequest.created_at)}</span>
                  </div>
                  <div className="d-row">
                    <span className="d-key">Priority</span>
                    <span className="d-val" style={{ color: pc.color }}>{pc.label}</span>
                  </div>
                  <div className="d-row">
                    <span className="d-key">Status</span>
                    <span className="d-val" style={{ color: sc.color }}>{sc.label}</span>
                  </div>
                  {detailRequest.resolved_at && (
                    <div className="d-row">
                      <span className="d-key">Resolved</span>
                      <span className="d-val">{fmtDate(detailRequest.resolved_at)}</span>
                    </div>
                  )}
                </div>

                {/* Photos */}
                {detailRequest.photo_urls && detailRequest.photo_urls.length > 0 && (
                  <div className="d-section">
                    <div className="d-section-title">Photos</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detailRequest.photo_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Photo ${i + 1}`} style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', border: '1px solid #E2E8F0' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <a href="/tenant/messages" style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 11, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontSize: 14, fontWeight: 700, textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>
                  💬 Message Landlord About This
                </a>
              </div>
            </>
          )
        })()}
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
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item active"><span className="sb-ico">🔧</span> Maintenance</a>
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Maintenance</b></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
                🔔{unreadCount > 0 && <div className="notif-dot" />}
              </button>
            </div>
          </div>

          <div className="content">
            {/* Page header */}
            <div className="page-header">
              <div>
                <div className="page-title">Maintenance</div>
                <div className="page-sub">{total} total request{total !== 1 ? 's' : ''} · {openCount} open</div>
              </div>
              <button className="btn-primary" onClick={() => { setFormError(''); setShowForm(true) }}>
                + New Request
              </button>
            </div>

            {/* Stats */}
            <div className="stats">
              <div className="stat-card">
                <div className="stat-val">{total}</div>
                <div className="stat-label">Total Requests</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: openCount > 0 ? '#DC2626' : '#0F172A' }}>{openCount}</div>
                <div className="stat-label" style={{ color: openCount > 0 ? '#DC2626' : '#94A3B8' }}>Open</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: inProgCount > 0 ? '#D97706' : '#0F172A' }}>{inProgCount}</div>
                <div className="stat-label" style={{ color: inProgCount > 0 ? '#D97706' : '#94A3B8' }}>In Progress</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{ color: '#16A34A' }}>{resolvedCount}</div>
                <div className="stat-label" style={{ color: '#16A34A' }}>Resolved</div>
              </div>
            </div>

            {/* List */}
            <div>
              <div className="list-header">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#94A3B8' }}>
                  {filtered.length} request{filtered.length !== 1 ? 's' : ''}
                </div>
                <div className="filter-tabs">
                  {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
                    <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                      {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {!tenantRow ? (
                <div className="empty-state">
                  <div className="empty-icon">🏠</div>
                  <div className="empty-title">No active tenancy</div>
                  <div className="empty-sub">Link your account to a property to submit maintenance requests.</div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔧</div>
                  <div className="empty-title">No {filter !== 'all' ? filter.replace('_', ' ') : ''} requests</div>
                  <div className="empty-sub">
                    {filter === 'all' ? "Everything looks good! Submit a request if something needs attention." : `No ${filter.replace('_', ' ')} requests found.`}
                  </div>
                </div>
              ) : (
                filtered.map(req => {
                  const pc = PRIORITY_CONFIG[req.priority] || PRIORITY_CONFIG.medium
                  const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.open
                  return (
                    <div key={req.id} className="req-card" onClick={() => setDetailRequest(req)}>
                      <div className="req-top">
                        <div className="req-priority-dot" style={{ background: pc.dot }} />
                        <div className="req-title">{req.title}</div>
                        <div className="req-badges">
                          <span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                          <span className="badge" style={{ background: pc.bg, color: pc.color }}>{pc.label}</span>
                        </div>
                      </div>
                      {req.description && (
                        <div className="req-desc clamped">{req.description}</div>
                      )}
                      {/* Steps */}
                      <div className="steps">
                        {(['open', 'in_progress', 'resolved'] as const).map((s, i) => {
                          const cfg = STATUS_CONFIG[s]
                          const done = sc.step >= i
                          return (
                            <div key={s} className="step">
                              <div className="step-circle" style={{
                                width: 20, height: 20,
                                background: done ? cfg.bg : '#F1F5F9',
                                borderColor: done ? cfg.color : '#E2E8F0',
                                color: done ? cfg.color : '#94A3B8',
                                fontSize: 10,
                              }}>
                                {done ? '✓' : '○'}
                              </div>
                              <div className="step-label" style={{ color: done ? cfg.color : '#94A3B8', fontSize: 11 }}>{cfg.label}</div>
                              {i < 2 && <div className="step-line" style={{ background: sc.step > i ? '#2563EB' : '#E2E8F0' }} />}
                            </div>
                          )
                        })}
                      </div>
                      <div className="req-footer">
                        <span className="req-time">Submitted {fmtTimeAgo(req.created_at)}</span>
                        <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>View details →</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
