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
  invite_accepted: boolean
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
  if (!leaseEnd || leaseEnd === '—') return 'active'
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
  if (!name || name === '—') return '??'
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

  // Lease Setup Modal States
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupTenant, setSetupTenant] = useState<Tenant | null>(null)
  const [lStart, setLStart] = useState('')
  const [lEnd, setLEnd] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  // Invite flow — property/unit picker
  const [inviteProps, setInviteProps]   = useState<{id:string;name:string}[]>([])
  const [inviteUnits, setInviteUnits]   = useState<{id:string;unit_number:string;monthly_rent:number;currency:string;status:string}[]>([])
  const [invitePropId, setInvitePropId] = useState('')
  const [inviteUnitId, setInviteUnitId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError]   = useState('')

  // Rent history drawer
  const [historyOpen, setHistoryOpen]       = useState(false)
  const [historyTenant, setHistoryTenant]   = useState<Tenant | null>(null)
  const [rentHistory, setRentHistory]       = useState<RentPayment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
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
          .select('id,profile_id,property_id,unit_id,status,invite_token,invite_accepted,created_at')
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

        const mappedTenants: Tenant[] = (raw || []).map((row: any) => {
          const p = profMap[row.profile_id] || {}
          const u = unitMap[row.unit_id] || {}
          return {
            id: row.id, profile_id: row.profile_id,
            property_id: row.property_id, unit_id: row.unit_id,
            full_name:   p.full_name   || 'Pending Invite',
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
            invite_accepted: row.invite_accepted,
            status:      row.status || deriveStatus(u.lease_end || null),
            invite_token: row.invite_token,
            created_at:  row.created_at,
          }
        })

        setTenants(mappedTenants)

        // Detect accepted invite without lease dates
        const needsSetup = mappedTenants.find(t => t.invite_accepted && (t.lease_start === '—' || !t.lease_start))
        if (needsSetup) {
          setSetupTenant(needsSetup)
          setSetupOpen(true)
        }

      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [router])

  async function handleSaveLease() {
    if (!setupTenant || !lStart || !lEnd) return
    setSetupLoading(true)
    const sb = createClient()
    const { error } = await sb.from('units').update({ lease_start: lStart, lease_end: lEnd }).eq('id', setupTenant.unit_id)
    if (!error) {
      setTenants(prev => prev.map(t => t.id === setupTenant.id ? { ...t, lease_start: lStart, lease_end: lEnd } : t))
      setSetupOpen(false); setSetupTenant(null)
    }
    setSetupLoading(false)
  }

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

  async function openInvite() {
    setInviteStep(1); setInviteError(''); setInviteCode(''); setCopied(false); setInvitePropId(''); setInviteUnitId(''); setInviteUnits([])
    if (selected && selected.unit_id) {
      const token = generateToken(); const sb = createClient()
      await sb.from('tenants').update({ invite_token: token }).eq('id', selected.id).select()
      setTenants(prev => prev.map(t => t.id === selected.id ? { ...t, invite_token: token } : t))
      setInviteCode(token); setInviteStep(2); setInviteOpen(true); return
    }
    const sb = createClient(); const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { data: props } = await sb.from('properties').select('id,name').eq('landlord_id', user.id).eq('status','active')
    setInviteProps(props || [])
    if (props && props.length === 1) { setInvitePropId(props[0].id); await loadInviteUnits(props[0].id) }
    setInviteOpen(true)
  }

  async function loadInviteUnits(propId: string) {
    setInviteUnitId(''); setInviteUnits([])
    if (!propId) return
    const sb = createClient()
    const { data } = await sb.from('units').select('id,unit_number,monthly_rent,currency,status').eq('property_id', propId).eq('status', 'vacant').order('unit_number')
    setInviteUnits(data || [])
  }

  async function handleCreateInvite() {
    if (!invitePropId || !inviteUnitId) { setInviteError('Please select a property and unit.'); return }
    setInviteLoading(true); setInviteError('')
    const sb = createClient(); const token = generateToken()
    const { data, error } = await sb.from('tenants').insert({ property_id: invitePropId, unit_id: inviteUnitId, invite_token: token, invite_accepted: false, status: 'active' }).select().single()
    if (error || !data) { setInviteError('Failed to create invite.'); setInviteLoading(false); return }
    setInviteCode(token); setInviteLoading(false); setInviteStep(2)
  }

  function copyCode() { navigator.clipboard.writeText(inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  async function handleDelete(id: string) {
    try {
      const sb = createClient(); await sb.from('tenants').delete().eq('id', id)
      setTenants(prev => prev.filter(t => t.id !== id))
      if (selected?.id === id) { setSelected(null); setSheetOpen(false) }
    } catch (e) { console.error(e) } finally { setDelConfirm(null) }
  }

  function selectTenant(t: Tenant) { setSelected(t); setSheetOpen(true) }

  async function openHistory(t: Tenant, e: React.MouseEvent) {
    e.stopPropagation(); setHistoryTenant(t); setHistoryOpen(true); setRentHistory([]); setHistoryLoading(true)
    try {
      const sb = createClient(); const { data } = await sb.from('rent_payments').select('*').eq('tenant_id', t.id).order('due_date', { ascending: false })
      setRentHistory(data || [])
    } catch (err) { console.error(err) } finally { setHistoryLoading(false) }
  }

  function closeHistory() { setHistoryOpen(false); setHistoryTenant(null); setRentHistory([]) }

  const hStats = historyTenant ? historyStats(rentHistory, historyTenant.currency) : null

  function renderDetail(t: Tenant, inSheet = false) {
    const sc = SC[t.status]; const idx = tenants.findIndex(x => x.id === t.id); const bg = AV[Math.max(0, idx) % AV.length]
    const hasLease = t.lease_start && t.lease_end && t.lease_start !== '—' && t.lease_end !== '—'
    const ls = hasLease ? new Date(t.lease_start).getTime() : 0; const le = hasLease ? new Date(t.lease_end).getTime() : 0
    const now = Date.now(); const total = hasLease ? le - ls : 0; const pct = total > 0 ? Math.min(100, Math.max(0, Math.round(((now - ls) / total) * 100))) : 0
    const dLeft = hasLease ? Math.ceil((le - now) / 86400000) : null
    const lc = dLeft !== null && dLeft < 30 ? '#DC2626' : dLeft !== null && dLeft < 60 ? '#D97706' : '#3B82F6'

    return (
      <div style={{display:'flex',flexDirection:'column',height:inSheet?'auto':'100%'}}>
        <div style={{padding:'20px 20px 16px',borderBottom:'1px solid #E2E8F0',textAlign:'center'}}>
          {t.avatar_url ? <img src={t.avatar_url} alt={t.full_name} style={{width:64,height:64,borderRadius:18,objectFit:'cover',margin:'0 auto 10px',display:'block'}} /> : <div style={{width:64,height:64,borderRadius:18,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:700,color:'#fff',margin:'0 auto 10px'}}>{initials(t.full_name)}</div>}
          <div style={{fontSize:16,fontWeight:700,color:'#0F172A',marginBottom:3}}>{t.full_name}</div>
          <div style={{fontSize:12.5,color:'#94A3B8',marginBottom:6}}>{t.email}</div>
          {t.phone && t.phone !== '—' && <div style={{fontSize:12,color:'#64748B',marginBottom:6}}>📞 {t.phone}</div>}
          <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,fontWeight:700,borderRadius:99,padding:'3px 9px',background:sc.bg,color:sc.color}}>● {sc.label}</span>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:6}}>Tenant since {fmtDate(t.created_at)}</div>
        </div>
        <div style={{padding:'16px 18px',flex:1}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
            {[{ label:'Property', val: t.property },{ label:'Unit', val: t.unit },{ label:'Monthly Rent', val: `$${t.rent_amount.toLocaleString()}`, blue: true },{ label:'Due Day', val: `Day ${t.rent_due_day}` }].map(({ label, val, blue }) => (
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
                  <div style={{height:6,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${lc},${lc})`,borderRadius:99}} /></div>
                </div>
              </>
            ) : <div style={{fontSize:13,color:'#94A3B8',fontStyle:'italic'}}>No lease dates set</div>}
          </div>
          <div><div style={{fontSize:10.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',color:'#94A3B8',marginBottom:6}}>Contact</div><div style={{fontSize:13,color:'#0F172A',fontWeight:500}}>{t.email}</div>{t.phone && t.phone !== '—' && <div style={{fontSize:13,color:'#0F172A',fontWeight:500,marginTop:3}}>{t.phone}</div>}</div>
        </div>
        <div style={{padding:'12px 18px',borderTop:'1px solid #E2E8F0',display:'flex',flexDirection:'column',gap:8}}>
          <button onClick={(e) => openHistory(t, e)} style={{width:'100%',padding:'10px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:'0 2px 8px rgba(37,99,235,.25)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>🕐 View Rent History</button>
          <a href={`/landlord/messages?tenant=${t.profile_id}`} style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>💬 Send Message</a>
          <a href={`/landlord/documents?tenant=${t.profile_id}`} style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>📄 View Lease</a>
          <button onClick={openInvite} style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #E2E8F0',background:'#F8FAFC',color:'#475569',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🔑 New Invite Code</button>
          <button onClick={() => setDelConfirm(t.id)} style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px solid #FCA5A5',background:'#FEF2F2',color:'#DC2626',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🗑️ Remove Tenant</button>
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
        .filter-row-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
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
        .detail-panel{background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);position:sticky;top:76px;max-height:calc(100vh - 100px);overflow-y:auto}
        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:20px;padding:28px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(15,23,42,.2)}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A;margin-bottom:6px}
        .modal-sub{font-size:13.5px;color:#94A3B8;margin-bottom:22px;line-height:1.6}
        .copy-btn{width:100%;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:10px}
        .modal-close{width:100%;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-hist-card{padding:4px 10px;border-radius:7px;border:1.5px solid #BFDBFE;background:#EFF6FF;color:#2563EB;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;transition:all .15s}
        .hist-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:600;opacity:0;pointer-events:none;transition:opacity .25s}
        .hist-backdrop.open{opacity:1;pointer-events:all}
        .hist-drawer{position:fixed;top:0;right:0;height:100vh;width:460px;max-width:100vw;background:#fff;z-index:601;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.14)}
        .hist-drawer.open{transform:translateX(0)}
        .hd-header{padding:22px 22px 18px;border-bottom:1px solid #E2E8F0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0}
        .hd-body{flex:1;overflow-y:auto;padding:18px 22px}
        @media(max-width:768px){ .sidebar{transform:translateX(-100%)} .main{margin-left:0!important;width:100%!important} .hamburger{display:block} .mlayout{grid-template-columns:1fr} .detail-panel{display:none} .hist-drawer{width:100vw} }
      `}</style>

      {/* OVERLAYS */}
      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={() => setSidebarOpen(false)} />

      {/* ── LEASE SETUP MODAL (Image 2 Fix) ── */}
      <div className={`modal-overlay${setupOpen?' open':''}`}>
        <div className="modal" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
          <div className="modal-title">Complete Lease Setup 📝</div>
          <div className="modal-sub"><strong>{setupTenant?.full_name}</strong> has linked their account! Set the lease dates for <strong>{setupTenant?.property} - {setupTenant?.unit}</strong> to activate their profile.</div>
          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',marginBottom:6}}>Lease Start Date</label>
            <input type="date" className="search-input" style={{paddingLeft:14}} value={lStart} onChange={e => setLStart(e.target.value)} />
          </div>
          <div style={{marginBottom:22}}>
            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',marginBottom:6}}>Lease End Date</label>
            <input type="date" className="search-input" style={{paddingLeft:14}} value={lEnd} onChange={e => setLEnd(e.target.value)} />
          </div>
          <button className="copy-btn" onClick={handleSaveLease} disabled={setupLoading}>{setupLoading ? 'Saving...' : 'Activate Tenant →'}</button>
        </div>
      </div>

      {/* INVITE MODAL */}
      <div className={`modal-overlay${inviteOpen?' open':''}`} onClick={() => setInviteOpen(false)}>
        <div className="modal" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>
          {inviteStep === 1 ? (
            <>
              <div className="modal-title">Invite a Tenant 👥</div>
              <div className="modal-sub">Select the property and vacant unit you want to assign.</div>
              <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',marginBottom:6}}>Property</label><select style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:14,background:'#F8FAFC'}} value={invitePropId} onChange={async e => { setInvitePropId(e.target.value); await loadInviteUnits(e.target.value) }}><option value=''>— Select property —</option>{inviteProps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:700,color:'#64748B',textTransform:'uppercase',marginBottom:6}}>Vacant Unit</label><select style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid #E2E8F0',fontSize:14,background:'#F8FAFC'}} value={inviteUnitId} onChange={e => setInviteUnitId(e.target.value)} disabled={!invitePropId || inviteUnits.length === 0}><option value=''>— Select unit —</option>{inviteUnits.map(u => (<option key={u.id} value={u.id}>{u.unit_number} — {u.currency} {u.monthly_rent}/mo</option>))}</select></div>
              <button className="copy-btn" onClick={handleCreateInvite} disabled={inviteLoading}>{inviteLoading ? 'Generating...' : 'Generate Invite Code →'}</button>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>Cancel</button>
            </>
          ) : (
            <>
              <div className="modal-title">Invite Code Ready! 🎉</div>
              <div style={{background:'#F8FAFC',border:'2px dashed #BFDBFE',borderRadius:14,padding:18,textAlign:'center',marginBottom:16}}><div style={{fontSize:28,fontWeight:800,color:'#2563EB',letterSpacing:6}}>{inviteCode}</div></div>
              <button className={`copy-btn${copied?' ok':''}`} onClick={copyCode}>{copied ? '✓ Copied!' : '📋 Copy Code'}</button>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>Done</button>
            </>
          )}
        </div>
      </div>

      {/* DELETE CONFIRM */}
      <div className={`modal-overlay${delConfirm?' open':''}`}><div className="del-box"><div className="del-ico">🗑️</div><div className="del-title">Remove Tenant?</div><div className="del-row"><button className="del-cancel" onClick={() => setDelConfirm(null)}>Cancel</button><button className="del-ok" onClick={() => delConfirm && handleDelete(delConfirm)}>Remove</button></div></div></div>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo"><div className="sb-logo-icon">🏘️</div><span className="sb-logo-name">Rentura</span></div>
          <nav className="sb-nav"><span className="sb-section">Overview</span><a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a><a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a><a href="/landlord/tenants" className="sb-item active"><span className="sb-ico">👥</span>Tenants</a><span className="sb-section">Finances</span><a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a><a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a><span className="sb-section">Management</span><a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance</a><a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a><a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a><a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a><span className="sb-section">Account</span><a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a></nav>
          <div className="sb-footer"><div className="sb-user"><div className="sb-av">{userInitials}</div><div><div className="sb-uname">{fullName}</div><span className="sb-uplan">FREE</span></div></div></div>
        </aside>

        <div className="main">
          <div className="topbar"><div className="tb-left"><button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button><div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Tenants</b></div></div><button className="btn-primary" onClick={openInvite}>👥 Invite Tenant</button></div>
          <div className="content">
            <div style={{marginBottom:20}}><div className="page-title">Tenants</div><div className="page-sub">{counts.all} total · {counts.active} active · {counts.late} late · {counts.expiring} expiring</div></div>
            <div className="stat-strip">
              {[{ ico:'👥', bg:'#EFF6FF', num: counts.all, lbl:'Total Tenants' },{ ico:'✅', bg:'#DCFCE7', num: counts.active, lbl:'Active' },{ ico:'⚠️', bg:'#FEE2E2', num: counts.late, lbl:'Late Payment' },{ ico:'⏳', bg:'#FEF3C7', num: counts.expiring, lbl:'Lease Expiring' }].map(s => (<div key={s.lbl} className="sstat"><div className="sstat-ico" style={{background:s.bg}}>{s.ico}</div><div><div className="sstat-num">{s.num}</div><div className="sstat-lbl">{s.lbl}</div></div></div>))}
            </div>
            <div className="toolbar"><div className="search-wrap"><span className="search-ico">🔍</span><input className="search-input" placeholder="Search by name, property, unit..." value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-row-wrap"><div className="filter-tabs">{(['all','active','late','expiring','ended'] as const).map(f => (<button key={f} className={`ftab${filter===f?' active':''}`} onClick={() => setFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)} <span className="fc">{counts[f]}</span></button>))}</div></div></div>
            <div className="mlayout">
              <div className="tenant-list">
                {loading ? <div className="skel-card"><div className="skeleton skel-av" /><div className="skel-lines"><div className="skeleton skel-line skel-m" /></div></div> : filtered.length === 0 ? <div className="empty-state">No tenants found.</div> : filtered.map((t) => (
                  <div key={t.id} className={`tenant-card${selected?.id===t.id?' sel':''}`} onClick={() => selectTenant(t)}>
                    <div style={{width:44,height:44,borderRadius:13,background:AV[tenants.indexOf(t)%AV.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff'}}>{initials(t.full_name)}</div>
                    <div className="t-info"><div className="t-name">{t.full_name}</div><div className="t-meta"><span className="t-meta-item">🏠 {t.property}</span><span className="t-meta-item">🚪 {t.unit}</span></div></div>
                    <div className="t-right"><div className="t-rent">${t.rent_amount}/mo</div><span className="badge" style={{background:SC[t.status].bg,color:SC[t.status].color}}>{SC[t.status].label}</span><button className="btn-hist-card" onClick={(e) => openHistory(t, e)}>🕐 History</button></div>
                  </div>
                ))}
              </div>
              <div className="detail-panel">{!selected ? <div className="no-sel"><div className="no-sel-ico">👤</div><div className="no-sel-txt">Select a tenant to<br/>view their details</div></div> : renderDetail(selected, false)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Utility function for history stats (needed for the history drawer)
function historyStats(payments: RentPayment[], currency: string) {
  const paid = payments.filter(p => p.status === 'paid'); const overdue = payments.filter(p => isOverdue(p)); const pending = payments.filter(p => p.status === 'pending' && !isOverdue(p))
  const totalPaid = paid.reduce((s, p) => s + p.amount, 0); const totalPending = [...pending, ...overdue].reduce((s, p) => s + p.amount, 0)
  const onTimeRate = payments.length > 0 ? Math.round((paid.length / payments.length) * 100) : 0
  return { paid: paid.length, overdue: overdue.length, pending: pending.length, totalPaid, totalPending, onTimeRate, currency }
}