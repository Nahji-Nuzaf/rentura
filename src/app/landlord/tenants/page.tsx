'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Tenant = {
  id: string
  profile_id: string
  full_name: string
  email: string
  phone: string
  avatar_url: string | null
  property: string
  property_id: string
  unit: string
  unit_id: string
  rent_amount: number
  currency: string
  rent_due_day: number
  lease_start: string
  lease_end: string
  status: 'active' | 'late' | 'expiring' | 'ended'
  invite_token?: string
  created_at: string
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

function deriveStatus(leaseEnd: string | null): Tenant['status'] {
  if (!leaseEnd) return 'active'
  const d = Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / 86400000)
  if (d < 0) return 'ended'
  if (d < 60) return 'expiring'
  return 'active'
}

const SC = {
  active:   { label: 'Active',   bg: '#DCFCE7', color: '#16A34A' },
  late:     { label: 'Late',     bg: '#FEE2E2', color: '#DC2626' },
  expiring: { label: 'Expiring', bg: '#FEF3C7', color: '#D97706' },
  ended:    { label: 'Ended',    bg: '#F1F5F9', color: '#64748B' },
}

const AV = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s: string) {
  if (!s || s === '—') return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function isOverdue(p: RentPayment): boolean {
  return p.status === 'pending' && new Date(p.due_date) < new Date()
}

function getDisplayStatus(p: RentPayment): 'paid' | 'overdue' | 'pending' {
  if (p.status === 'paid') return 'paid'
  if (isOverdue(p)) return 'overdue'
  return 'pending'
}

function generateToken() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function TenantsPage() {
  const router = useRouter()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName]         = useState('User')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [tenants, setTenants]           = useState<Tenant[]>([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState<'all'|'active'|'late'|'expiring'|'ended'>('all')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<Tenant | null>(null)
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [inviteOpen, setInviteOpen]     = useState(false)
  const [inviteStep, setInviteStep]     = useState<1|2>(1)
  const [inviteCode, setInviteCode]     = useState('')
  const [copied, setCopied]             = useState(false)
  const [delConfirm, setDelConfirm]     = useState<string | null>(null)

  // Invite flow — property/unit picker
  const [inviteProps, setInviteProps]   = useState<{id:string;name:string}[]>([])
  const [inviteUnits, setInviteUnits]   = useState<{id:string;unit_number:string;monthly_rent:number;currency:string;status:string}[]>([])
  const [invitePropId, setInvitePropId] = useState('')
  const [inviteUnitId, setInviteUnitId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError]   = useState('')

  // ── Rent history drawer ────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen]       = useState(false)
  const [historyTenant, setHistoryTenant]   = useState<Tenant | null>(null)
  const [rentHistory, setRentHistory]       = useState<RentPayment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }
        const name = user.user_metadata?.full_name || 'User'
        setFullName(name)
        setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

        const { data: props } = await sb.from('properties').select('id,name').eq('landlord_id', user.id)
        const propIds = (props || []).map((p: any) => p.id)
        const propMap: Record<string, string> = {}
        ;(props || []).forEach((p: any) => { propMap[p.id] = p.name })
        if (!propIds.length) { setLoading(false); return }

        const { data: raw } = await sb.from('tenants')
          .select('id,profile_id,property_id,unit_id,status,invite_token,created_at')
          .in('property_id', propIds).order('created_at', { ascending: false })

        const pids = [...new Set((raw || []).map((t: any) => t.profile_id).filter(Boolean))]
        const profMap: Record<string, any> = {}
        if (pids.length) {
          const { data: pa } = await sb.from('profiles').select('id,full_name,email,phone,avatar_url').in('id', pids)
          ;(pa || []).forEach((p: any) => { profMap[p.id] = p })
        }

        const uids = [...new Set((raw || []).map((t: any) => t.unit_id).filter(Boolean))]
        const unitMap: Record<string, any> = {}
        if (uids.length) {
          const { data: ua } = await sb.from('units')
            .select('id,unit_number,monthly_rent,currency,rent_due_day,lease_start,lease_end').in('id', uids)
          ;(ua || []).forEach((u: any) => { unitMap[u.id] = u })
        }

        setTenants((raw || []).map((row: any) => {
          const p = profMap[row.profile_id] || {}
          const u = unitMap[row.unit_id] || {}
          return {
            id: row.id, profile_id: row.profile_id,
            property_id: row.property_id, unit_id: row.unit_id,
            full_name:   p.full_name   || 'Unknown',
            email:       p.email       || '—',
            phone:       p.phone       || '—',
            avatar_url:  p.avatar_url  || null,
            property:    propMap[row.property_id] || '—',
            unit:        u.unit_number  || '—',
            rent_amount: u.monthly_rent || 0,
            currency:    u.currency     || 'USD',
            rent_due_day: u.rent_due_day || 1,
            lease_start: u.lease_start  || '—',
            lease_end:   u.lease_end    || '—',
            status:      row.status || deriveStatus(u.lease_end || null),
            invite_token: row.invite_token,
            created_at:  row.created_at,
          }
        }))
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [router])

  const filtered = tenants.filter(t => {
    const sm = filter === 'all' || t.status === filter
    const qm = !search || [t.full_name, t.property, t.unit, t.email]
      .some(v => v.toLowerCase().includes(search.toLowerCase()))
    return sm && qm
  })

  const counts = {
    all: tenants.length,
    active:   tenants.filter(t => t.status === 'active').length,
    late:     tenants.filter(t => t.status === 'late').length,
    expiring: tenants.filter(t => t.status === 'expiring').length,
    ended:    tenants.filter(t => t.status === 'ended').length,
  }

  // ── Open invite modal — load properties first ─────────────────────────────
  async function openInvite() {
    setInviteStep(1)
    setInviteError('')
    setInviteCode('')
    setCopied(false)
    setInvitePropId('')
    setInviteUnitId('')
    setInviteUnits([])

    // If called from detail panel with a tenant already selected that has a unit,
    // just regenerate their token (existing tenant re-invite path)
    if (selected && selected.unit_id) {
      const token = generateToken()
      const sb = createClient()
      await sb.from('tenants').update({ invite_token: token }).eq('id', selected.id).select()
      setTenants(prev => prev.map(t => t.id === selected.id ? { ...t, invite_token: token } : t))
      setInviteCode(token)
      setInviteStep(2)
      setInviteOpen(true)
      return
    }

    // New invite — load landlord properties
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { data: props } = await sb.from('properties').select('id,name').eq('landlord_id', user.id).eq('status','active')
    setInviteProps(props || [])
    if (props && props.length === 1) {
      setInvitePropId(props[0].id)
      await loadInviteUnits(props[0].id)
    }
    setInviteOpen(true)
  }

  async function loadInviteUnits(propId: string) {
    setInviteUnitId('')
    setInviteUnits([])
    if (!propId) return
    const sb = createClient()
    const { data } = await sb
      .from('units')
      .select('id,unit_number,monthly_rent,currency,status')
      .eq('property_id', propId)
      .eq('status', 'vacant')
      .order('unit_number')
    setInviteUnits(data || [])
  }

  async function handleCreateInvite() {
    if (!invitePropId) { setInviteError('Please select a property.'); return }
    if (!inviteUnitId) { setInviteError('Please select a vacant unit.'); return }
    setInviteLoading(true)
    setInviteError('')
    const sb = createClient()
    const token = generateToken()

    // Insert new tenant row with the invite token — profile_id will be filled when tenant signs up
    const { data, error } = await sb.from('tenants').insert({
      property_id: invitePropId,
      unit_id: inviteUnitId,
      invite_token: token,
      invite_accepted: false,
      status: 'active',
    }).select().single()

    if (error || !data) {
      setInviteError('Failed to create invite. Please try again.')
      setInviteLoading(false)
      return
    }

    setInviteCode(token)
    setInviteLoading(false)
    setInviteStep(2)
  }

  function copyCode() {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete(id: string) {
    try {
      const sb = createClient()
      await sb.from('tenants').delete().eq('id', id)
      setTenants(prev => prev.filter(t => t.id !== id))
      if (selected?.id === id) { setSelected(null); setSheetOpen(false) }
    } catch (e) { console.error(e) }
    finally { setDelConfirm(null) }
  }

  function selectTenant(t: Tenant) {
    setSelected(t)
    setSheetOpen(true)
  }

  // ── Open rent history drawer ───────────────────────────────────────────────
  async function openHistory(t: Tenant, e: React.MouseEvent) {
    e.stopPropagation()
    setHistoryTenant(t)
    setHistoryOpen(true)
    setRentHistory([])
    setHistoryLoading(true)
    try {
      const sb = createClient()
      const { data } = await sb
        .from('rent_payments')
        .select('*')
        .eq('tenant_id', t.id)
        .order('due_date', { ascending: false })
      setRentHistory(data || [])
    } catch (err) { console.error(err) }
    finally { setHistoryLoading(false) }
  }

  function closeHistory() {
    setHistoryOpen(false)
    setHistoryTenant(null)
    setRentHistory([])
  }

  // ── Drawer summary stats ───────────────────────────────────────────────────
  function historyStats(payments: RentPayment[], currency: string) {
    const paid    = payments.filter(p => p.status === 'paid')
    const overdue = payments.filter(p => isOverdue(p))
    const pending = payments.filter(p => p.status === 'pending' && !isOverdue(p))
    const totalPaid    = paid.reduce((s, p) => s + p.amount, 0)
    const totalPending = [...pending, ...overdue].reduce((s, p) => s + p.amount, 0)
    const onTimeRate   = payments.length > 0 ? Math.round((paid.length / payments.length) * 100) : 0
    return { paid: paid.length, overdue: overdue.length, pending: pending.length, totalPaid, totalPending, onTimeRate, currency }
  }

  const hStats = historyTenant ? historyStats(rentHistory, historyTenant.currency) : null

  // ── Detail panel ──────────────────────────────────────────────────────────
  function renderDetail(t: Tenant, inSheet = false) {
    const sc = SC[t.status]
    const idx = tenants.findIndex(x => x.id === t.id)
    const bg  = AV[Math.max(0, idx) % AV.length]
    const hasLease = t.lease_start && t.lease_end && t.lease_start !== '—' && t.lease_end !== '—'
    const ls = hasLease ? new Date(t.lease_start).getTime() : 0
    const le = hasLease ? new Date(t.lease_end).getTime()   : 0
    const now = Date.now()
    const total = hasLease ? le - ls : 0
    const pct   = total > 0 ? Math.min(100, Math.max(0, Math.round(((now - ls) / total) * 100))) : 0
    const dLeft = hasLease ? Math.ceil((le - now) / 86400000) : null
    const lc = dLeft !== null && dLeft < 30 ? '#DC2626' : dLeft !== null && dLeft < 60 ? '#D97706' : '#3B82F6'

    return (
      <div style={{display:'flex',flexDirection:'column',height:inSheet?'auto':'100%'}}>
        <div style={{padding:'20px 20px 16px',borderBottom:'1px solid #E2E8F0',textAlign:'center'}}>
          {t.avatar_url
            ? <img src={t.avatar_url} alt={t.full_name} style={{width:64,height:64,borderRadius:18,objectFit:'cover',margin:'0 auto 10px',display:'block'}} />
            : <div style={{width:64,height:64,borderRadius:18,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:700,color:'#fff',margin:'0 auto 10px'}}>{initials(t.full_name)}</div>
          }
          <div style={{fontSize:16,fontWeight:700,color:'#0F172A',marginBottom:3}}>{t.full_name}</div>
          <div style={{fontSize:12.5,color:'#94A3B8',marginBottom:6}}>{t.email}</div>
          {t.phone && t.phone !== '—' && <div style={{fontSize:12,color:'#64748B',marginBottom:6}}>📞 {t.phone}</div>}
          <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,fontWeight:700,borderRadius:99,padding:'3px 9px',background:sc.bg,color:sc.color}}>● {sc.label}</span>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:6}}>Tenant since {fmtDate(t.created_at)}</div>
        </div>

        <div style={{padding:'16px 18px',flex:1}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
            {[
              { label:'Property',     val: t.property },
              { label:'Unit',         val: t.unit },
              { label:'Monthly Rent', val: `$${t.rent_amount.toLocaleString()}`, blue: true },
              { label:'Due Day',      val: `Day ${t.rent_due_day}` },
            ].map(({ label, val, blue }) => (
              <div key={label} style={{background:'#F8FAFC',borderRadius:10,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'#94A3B8',marginBottom:4}}>{label}</div>
                <div style={{fontSize:13,fontWeight:700,color: blue ? '#2563EB' : '#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:10.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',color:'#94A3B8',marginBottom:6}}>Lease Period</div>
            {hasLease ? (
              <>
                <div style={{fontSize:13,color:'#0F172A',fontWeight:500}}>{fmtDate(t.lease_start)} → {fmtDate(t.lease_end)}</div>
                <div style={{marginTop:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:11,color:'#94A3B8'}}>{pct}% elapsed</span>
                    <span style={{fontSize:11,fontWeight:600,color:lc}}>{dLeft !== null ? (dLeft > 0 ? `${dLeft}d left` : 'Ended') : ''}</span>
                  </div>
                  <div style={{height:6,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${lc},${lc})`,borderRadius:99}} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{fontSize:13,color:'#94A3B8',fontStyle:'italic'}}>No lease dates set</div>
            )}
          </div>

          <div>
            <div style={{fontSize:10.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',color:'#94A3B8',marginBottom:6}}>Contact</div>
            <div style={{fontSize:13,color:'#0F172A',fontWeight:500}}>{t.email}</div>
            {t.phone && t.phone !== '—' && <div style={{fontSize:13,color:'#0F172A',fontWeight:500,marginTop:3}}>{t.phone}</div>}
          </div>
        </div>

        <div style={{padding:'12px 18px',borderTop:'1px solid #E2E8F0',display:'flex',flexDirection:'column',gap:8}}>
          {/* ── NEW: Rent History button at top of actions ── */}
          <button
            onClick={(e) => openHistory(t, e)}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:'0 2px 8px rgba(37,99,235,.25)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            🕐 View Rent History
          </button>
          <a href={`/landlord/messages?tenant=${t.profile_id}`}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            💬 Send Message
          </a>
          <a href={`/landlord/documents?tenant=${t.profile_id}`}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            📄 View Lease
          </a>
          <button onClick={openInvite}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            🔑 New Invite Code
          </button>
          <button onClick={() => setDelConfirm(t.id)}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #FCA5A5',background:'#FEF2F2',color:'#DC2626',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            🗑️ Remove Tenant
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:hidden;width:100%}

        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}
        .sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
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
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,.16),rgba(99,102,241,.2));border:1px solid rgba(59,130,246,.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(37,99,235,.28);transition:all .18s;white-space:nowrap;flex-shrink:0}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}

        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;letter-spacing:-.5px}
        .page-sub{font-size:13px;color:#94A3B8;margin-top:2px}

        .stat-strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sstat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 12px;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden}
        .sstat-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .sstat-num{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1}
        .sstat-lbl{font-size:11px;color:#94A3B8;font-weight:500;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        .toolbar{display:flex;flex-direction:column;gap:10px;margin-bottom:16px;width:100%}
        .search-wrap{width:100%;position:relative}
        .search-ico{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none}
        .search-input{width:100%;padding:9px 14px 9px 36px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none}
        .search-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .filter-row-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .filter-row-wrap::-webkit-scrollbar{display:none}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;white-space:nowrap}
        .ftab{padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .ftab:hover{background:#F1F5F9;color:#0F172A}
        .ftab.active{background:#2563EB;color:#fff}
        .fc{font-size:10px;font-weight:700;background:rgba(255,255,255,.25);border-radius:99px;padding:1px 6px}
        .ftab:not(.active) .fc{background:#F1F5F9;color:#64748B}

        .mlayout{display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;width:100%}

        .tenant-list{display:flex;flex-direction:column;gap:10px;min-width:0}
        .tenant-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .18s;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden}
        .tenant-card:hover{border-color:#BFDBFE;box-shadow:0 4px 16px rgba(37,99,235,.08);transform:translateY(-1px)}
        .tenant-card.sel{border-color:#3B82F6;box-shadow:0 4px 16px rgba(37,99,235,.12);background:#FAFBFF}
        .t-info{flex:1;min-width:0}
        .t-name{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .t-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .t-meta-item{font-size:11.5px;color:#64748B;white-space:nowrap}
        .t-right{text-align:right;flex-shrink:0;margin-left:8px;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
        .t-rent{font-size:14px;font-weight:700;color:#0F172A;white-space:nowrap}
        .badge{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 9px}
        .btn-hist-card{padding:4px 10px;border-radius:7px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;transition:all .15s}
        .btn-hist-card:hover{background:#DBEAFE;border-color:#93C5FD}

        .detail-panel{background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);position:sticky;top:76px;max-height:calc(100vh - 100px);overflow-y:auto}
        .detail-panel::-webkit-scrollbar{width:0}
        .no-sel{text-align:center;padding:48px 20px;color:#94A3B8}
        .no-sel-ico{font-size:36px;margin-bottom:10px}
        .no-sel-txt{font-size:13px;line-height:1.6}

        .empty-state{text-align:center;padding:60px 20px;color:#94A3B8}
        .e-ico{font-size:40px;margin-bottom:12px}
        .e-title{font-size:15px;font-weight:700;color:#475569}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:10px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .skel-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px}
        .skel-av{width:44px;height:44px;border-radius:13px;flex-shrink:0}
        .skel-lines{flex:1;display:flex;flex-direction:column;gap:8px}
        .skel-line{height:13px}
        .skel-s{width:50%}.skel-m{width:75%}

        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:20px;padding:28px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(15,23,42,.2)}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:6px}
        .modal-sub{font-size:13.5px;color:#94A3B8;margin-bottom:22px;line-height:1.6}
        .code-box{background:#F8FAFC;border:2px dashed #BFDBFE;border-radius:14px;padding:18px;text-align:center;margin-bottom:16px}
        .code-val{font-size:28px;font-weight:800;color:#2563EB;letter-spacing:6px}
        .code-hint{font-size:12px;color:#94A3B8;margin-top:6px}
        .copy-btn{width:100%;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:10px}
        .copy-btn.ok{background:linear-gradient(135deg,#16A34A,#15803D)}
        .modal-close{width:100%;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-box{background:#fff;border-radius:18px;padding:28px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(15,23,42,.2);text-align:center}
        .del-ico{font-size:36px;margin-bottom:12px}
        .del-title{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .del-sub{font-size:13.5px;color:#64748B;line-height:1.6;margin-bottom:22px}
        .del-row{display:flex;gap:10px}
        .del-cancel{flex:1;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-ok{flex:1;padding:10px;border-radius:10px;border:none;background:#DC2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        .sheet-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:400}
        .sheet{display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:22px 22px 0 0;z-index:401;max-height:92vh;overflow-y:auto;transform:translateY(100%);transition:transform .3s ease}
        .sheet::-webkit-scrollbar{width:0}
        .sheet-handle{width:36px;height:4px;border-radius:99px;background:#E2E8F0;margin:10px auto 4px}
        @media(max-width:768px){
          .sheet{display:block}
          .sheet-bg.open{display:block}
          .sheet.open{transform:translateY(0)}
        }

        /* ─── RENT HISTORY DRAWER ─── */
        .hist-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:600;opacity:0;pointer-events:none;transition:opacity .25s}
        .hist-backdrop.open{opacity:1;pointer-events:all}
        .hist-drawer{position:fixed;top:0;right:0;height:100vh;width:460px;max-width:100vw;background:#fff;z-index:601;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.14)}
        .hist-drawer.open{transform:translateX(0)}
        .hd-header{padding:22px 22px 18px;border-bottom:1px solid #E2E8F0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0}
        .hd-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A}
        .hd-sub{font-size:12.5px;color:#64748B;margin-top:3px}
        .hd-close{width:34px;height:34px;border-radius:50%;background:#F1F5F9;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:#475569;transition:background .15s;flex-shrink:0}
        .hd-close:hover{background:#E2E8F0}
        .hd-body{flex:1;overflow-y:auto;padding:18px 22px}
        .hd-body::-webkit-scrollbar{width:0}
        .hd-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:22px}
        .hd-stat{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:12px;text-align:center}
        .hd-stat-val{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A;line-height:1.1}
        .hd-stat-lbl{font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.05em;margin-top:3px}
        .hd-stat-sub{font-size:11px;color:#94A3B8;margin-top:2px}
        .hd-stat.s-green .hd-stat-val{color:#16A34A}
        .hd-stat.s-red   .hd-stat-val{color:#DC2626}
        .hd-stat.s-blue  .hd-stat-val{color:#2563EB}
        .tl-section-lbl{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px}
        .tl{display:flex;flex-direction:column;gap:0}
        .tl-row{display:flex;gap:12px;padding-bottom:16px;position:relative}
        .tl-row:not(:last-child)::before{content:'';position:absolute;left:13px;top:28px;bottom:0;width:2px;background:#E2E8F0}
        .tl-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;z-index:1}
        .tl-dot.d-paid{background:#DCFCE7;color:#16A34A}
        .tl-dot.d-overdue{background:#FEE2E2;color:#DC2626}
        .tl-dot.d-pending{background:#FEF9C3;color:#CA8A04}
        .tl-card{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px}
        .tl-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
        .tl-amount{font-size:15px;font-weight:700;color:#0F172A}
        .tl-badge{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px}
        .tb-paid{background:#DCFCE7;color:#16A34A}
        .tb-overdue{background:#FEE2E2;color:#DC2626}
        .tb-pending{background:#FEF9C3;color:#CA8A04}
        .tl-dates{display:flex;gap:14px;flex-wrap:wrap;margin-top:7px}
        .tl-date{font-size:11.5px;color:#64748B}
        .tl-date strong{color:#475569;font-weight:600}
        .tl-method{font-size:11px;color:#94A3B8;margin-top:4px}
        .tl-note{font-size:11.5px;color:#64748B;font-style:italic;margin-top:6px;padding-top:6px;border-top:1px solid #E2E8F0}
        .hd-empty{text-align:center;padding:48px 16px;color:#94A3B8}
        .hd-spinner{text-align:center;padding:48px;color:#94A3B8;font-size:13px}

        @media(min-width:1100px){
          .stat-strip{grid-template-columns:repeat(4,1fr)}
          .mlayout{grid-template-columns:1fr 320px}
        }
        @media(max-width:1099px) and (min-width:769px){
          .mlayout{grid-template-columns:1fr 280px}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 14px}
          .content{padding:14px 14px}
          .mlayout{grid-template-columns:1fr}
          .detail-panel{display:none}
          .hd-stats{grid-template-columns:repeat(2,1fr)}
          .hist-drawer{width:100vw}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
          .page-title{font-size:22px}
          .sstat{padding:12px 10px;gap:8px}
          .sstat-ico{width:30px;height:30px;font-size:15px}
          .sstat-num{font-size:18px}
          .stat-strip{gap:8px}
        }
      `}</style>

      {/* Overlays */}
      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={() => setSidebarOpen(false)} />

      {/* Invite Modal — 2 step */}
      <div className={`modal-overlay${inviteOpen?' open':''}`} onClick={() => setInviteOpen(false)}>
        <div className="modal" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>

          {/* ── STEP 1: Pick property + unit ── */}
          {inviteStep === 1 && (
            <>
              <div className="modal-title">Invite a Tenant 👥</div>
              <div className="modal-sub">Select the property and vacant unit you want to assign. We&apos;ll generate a unique invite code to send to your tenant.</div>

              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Property</label>
                <select
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",color:'#0F172A',background:'#F8FAFC',outline:'none'}}
                  value={invitePropId}
                  onChange={async e => { setInvitePropId(e.target.value); await loadInviteUnits(e.target.value) }}
                >
                  <option value=''>— Select property —</option>
                  {inviteProps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>
                  Vacant Unit
                  {invitePropId && <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal',color:'#94A3B8',marginLeft:6}}>{inviteUnits.length} available</span>}
                </label>
                <select
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",color:'#0F172A',background:'#F8FAFC',outline:'none'}}
                  value={inviteUnitId}
                  onChange={e => setInviteUnitId(e.target.value)}
                  disabled={!invitePropId || inviteUnits.length === 0}
                >
                  <option value=''>— Select unit —</option>
                  {inviteUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number} — {u.currency} {u.monthly_rent.toLocaleString()}/mo
                    </option>
                  ))}
                </select>
                {invitePropId && inviteUnits.length === 0 && (
                  <div style={{fontSize:12,color:'#F59E0B',marginTop:5}}>⚠️ No vacant units in this property</div>
                )}
              </div>

              {inviteError && (
                <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:10,padding:'10px 12px',color:'#DC2626',fontSize:13,marginBottom:14}}>
                  {inviteError}
                </div>
              )}

              <button className="copy-btn" onClick={handleCreateInvite} disabled={inviteLoading} style={{marginBottom:10}}>
                {inviteLoading ? 'Generating...' : 'Generate Invite Code →'}
              </button>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>Cancel</button>
            </>
          )}

          {/* ── STEP 2: Show the code ── */}
          {inviteStep === 2 && (
            <>
              <div className="modal-title">Invite Code Ready! 🎉</div>
              <div className="modal-sub">Share this code with your tenant. They&apos;ll enter it on the onboarding page after signing up to get linked to their unit automatically.</div>
              <div className="code-box">
                <div className="code-val">{inviteCode}</div>
                <div className="code-hint">Send this to your tenant via WhatsApp, SMS, or email</div>
              </div>

              <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:12,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#166534',lineHeight:1.6}}>
                <strong>How it works:</strong> Your tenant signs up at rentura.app → selects <em>Tenant</em> → enters this code → they&apos;re instantly linked to their unit.
              </div>

              <button className={`copy-btn${copied?' ok':''}`} onClick={copyCode} style={{marginBottom:10}}>
                {copied ? '✓ Copied to clipboard!' : '📋 Copy Code'}
              </button>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>Done</button>
            </>
          )}

        </div>
      </div>

      {/* Delete Confirm */}
      <div className={`modal-overlay${delConfirm?' open':''}`}>
        <div className="del-box">
          <div className="del-ico">🗑️</div>
          <div className="del-title">Remove Tenant?</div>
          <div className="del-sub">This will remove the tenant from your records. Their account won&apos;t be deleted.</div>
          <div className="del-row">
            <button className="del-cancel" onClick={() => setDelConfirm(null)}>Cancel</button>
            <button className="del-ok" onClick={() => delConfirm && handleDelete(delConfirm)}>Remove</button>
          </div>
        </div>
      </div>

      {/* Mobile Sheet */}
      <div className={`sheet-bg${sheetOpen?' open':''}`} onClick={() => setSheetOpen(false)} />
      <div className={`sheet${sheetOpen&&selected?' open':''}`}>
        <div className="sheet-handle" />
        {selected && renderDetail(selected, true)}
      </div>

      {/* ─── Rent History Drawer ─── */}
      <div className={`hist-backdrop${historyOpen?' open':''}`} onClick={closeHistory} />
      <div className={`hist-drawer${historyOpen?' open':''}`}>
        {historyTenant && (
          <>
            <div className="hd-header">
              <div>
                <div className="hd-title">Rent History</div>
                <div className="hd-sub">{historyTenant.full_name} · Unit {historyTenant.unit} · {historyTenant.property}</div>
              </div>
              <button className="hd-close" onClick={closeHistory}>✕</button>
            </div>
            <div className="hd-body">
              {historyLoading ? (
                <div className="hd-spinner">Loading history...</div>
              ) : rentHistory.length === 0 ? (
                <div className="hd-empty">
                  <div style={{fontSize:36,marginBottom:10}}>📋</div>
                  <div style={{fontSize:13}}>No payment records yet</div>
                </div>
              ) : (
                <>
                  {hStats && (
                    <div className="hd-stats">
                      <div className="hd-stat s-green">
                        <div className="hd-stat-val">{fmtCurrency(hStats.totalPaid, hStats.currency)}</div>
                        <div className="hd-stat-lbl">Total Paid</div>
                        <div className="hd-stat-sub">{hStats.paid} payment{hStats.paid !== 1 ? 's' : ''}</div>
                      </div>
                      <div className={`hd-stat${hStats.overdue > 0 ? ' s-red' : ''}`}>
                        <div className="hd-stat-val">{fmtCurrency(hStats.totalPending, hStats.currency)}</div>
                        <div className="hd-stat-lbl">Outstanding</div>
                        <div className="hd-stat-sub">{hStats.overdue > 0 ? `${hStats.overdue} overdue` : `${hStats.pending} pending`}</div>
                      </div>
                      <div className={`hd-stat${hStats.onTimeRate >= 80 ? ' s-green' : hStats.onTimeRate < 50 ? ' s-red' : ' s-blue'}`}>
                        <div className="hd-stat-val">{hStats.onTimeRate}%</div>
                        <div className="hd-stat-lbl">On-time</div>
                        <div className="hd-stat-sub">{hStats.paid} of {rentHistory.length}</div>
                      </div>
                    </div>
                  )}
                  <div className="tl-section-lbl">Payment Timeline</div>
                  <div className="tl">
                    {rentHistory.map(payment => {
                      const ds = getDisplayStatus(payment)
                      const dotIcon = ds === 'paid' ? '✓' : ds === 'overdue' ? '!' : '○'
                      return (
                        <div key={payment.id} className="tl-row">
                          <div className={`tl-dot d-${ds}`}>{dotIcon}</div>
                          <div className="tl-card">
                            <div className="tl-card-top">
                              <div className="tl-amount">{fmtCurrency(payment.amount, historyTenant.currency)}</div>
                              <span className={`tl-badge tb-${ds}`}>
                                {ds.charAt(0).toUpperCase() + ds.slice(1)}
                              </span>
                            </div>
                            <div className="tl-dates">
                              <div className="tl-date"><strong>Due:</strong> {fmtDate(payment.due_date)}</div>
                              {payment.paid_date && <div className="tl-date"><strong>Paid:</strong> {fmtDate(payment.paid_date)}</div>}
                            </div>
                            {payment.payment_method && <div className="tl-method">via {payment.payment_method}</div>}
                            {payment.note && <div className="tl-note">"{payment.note}"</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="shell">
        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">🏘️</div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item active"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a>
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance</a>
            <a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-upgrade">
              <div className="sb-up-title">⭐ Upgrade to Pro</div>
              <div className="sb-up-sub">Unlimited properties, reports & priority support.</div>
              <button className="sb-up-btn">See Plans →</button>
            </div>
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-uplan">FREE</span>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Tenants</b></div>
            </div>
            <button className="btn-primary" onClick={openInvite}>👥 Invite Tenant</button>
          </div>

          <div className="content">
            <div style={{marginBottom:20}}>
              <div className="page-title">Tenants</div>
              <div className="page-sub">{counts.all} total · {counts.active} active · {counts.late} late · {counts.expiring} expiring</div>
            </div>

            <div className="stat-strip">
              {[
                { ico:'👥', bg:'#EFF6FF', num: counts.all,      lbl:'Total Tenants' },
                { ico:'✅', bg:'#DCFCE7', num: counts.active,   lbl:'Active' },
                { ico:'⚠️', bg:'#FEE2E2', num: counts.late,     lbl:'Late Payment' },
                { ico:'⏳', bg:'#FEF3C7', num: counts.expiring, lbl:'Lease Expiring' },
              ].map(s => (
                <div key={s.lbl} className="sstat">
                  <div className="sstat-ico" style={{background:s.bg}}>{s.ico}</div>
                  <div>
                    <div className="sstat-num">{s.num}</div>
                    <div className="sstat-lbl">{s.lbl}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="toolbar">
              <div className="search-wrap">
                <span className="search-ico">🔍</span>
                <input className="search-input" placeholder="Search by name, property, unit..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="filter-row-wrap">
                <div className="filter-tabs">
                  {(['all','active','late','expiring','ended'] as const).map(f => (
                    <button key={f} className={`ftab${filter===f?' active':''}`} onClick={() => setFilter(f)}>
                      {f.charAt(0).toUpperCase()+f.slice(1)}
                      <span className="fc">{counts[f]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mlayout">
              <div className="tenant-list">
                {loading ? (
                  [1,2,3,4].map(i => (
                    <div key={i} className="skel-card">
                      <div className="skeleton skel-av" />
                      <div className="skel-lines">
                        <div className="skeleton skel-line skel-m" />
                        <div className="skeleton skel-line skel-s" />
                      </div>
                    </div>
                  ))
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-ico">👥</div>
                    <div className="e-title">{search || filter !== 'all' ? 'No tenants match your search' : 'No tenants yet — invite your first!'}</div>
                  </div>
                ) : filtered.map((t) => {
                  const sc  = SC[t.status]
                  const idx = tenants.findIndex(x => x.id === t.id)
                  const bg  = AV[Math.max(0, idx) % AV.length]
                  return (
                    <div key={t.id}
                      className={`tenant-card${selected?.id===t.id?' sel':''}`}
                      onClick={() => selectTenant(t)}>
                      {t.avatar_url
                        ? <img src={t.avatar_url} alt={t.full_name} style={{width:44,height:44,borderRadius:13,objectFit:'cover',flexShrink:0}} />
                        : <div style={{width:44,height:44,borderRadius:13,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>{initials(t.full_name)}</div>
                      }
                      <div className="t-info">
                        <div className="t-name">{t.full_name}</div>
                        <div className="t-meta">
                          <span className="t-meta-item">🏠 {t.property}</span>
                          <span className="t-meta-item">🚪 {t.unit}</span>
                          {t.phone && t.phone !== '—' && <span className="t-meta-item">📞 {t.phone}</span>}
                        </div>
                      </div>
                      <div className="t-right">
                        <div className="t-rent">${t.rent_amount}/mo</div>
                        <span className="badge" style={{background:sc.bg,color:sc.color}}>{sc.label}</span>
                        {/* History button visible on all screen sizes */}
                        <button className="btn-hist-card" onClick={(e) => openHistory(t, e)}>
                          🕐 History
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="detail-panel">
                {!selected
                  ? <div className="no-sel"><div className="no-sel-ico">👤</div><div className="no-sel-txt">Select a tenant to<br/>view their details</div></div>
                  : renderDetail(selected, false)
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
