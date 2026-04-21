'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

type MRequest = {
  id: string
  title: string
  description: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved'
  created_at: string
  resolved_at: string | null
  property_id: string
  unit_id: string | null
  tenant_id: string | null
  property_name: string
  unit_number: string
  tenant_name: string
}

type PropertyOption = { id: string; name: string }
type UnitOption = { id: string; unit_number: string; property_id: string }

const PC = {
  urgent: { label: 'Urgent', bg: '#FEE2E2', color: '#DC2626' },
  high: { label: 'High', bg: '#FEF3C7', color: '#D97706' },
  medium: { label: 'Medium', bg: '#FEF9C3', color: '#CA8A04' },
  low: { label: 'Low', bg: '#DCFCE7', color: '#16A34A' },
}
const SC = {
  open: { label: 'Open', bg: '#FEE2E2', color: '#DC2626' },
  in_progress: { label: 'In Progress', bg: '#EFF6FF', color: '#2563EB' },
  resolved: { label: 'Resolved', bg: '#DCFCE7', color: '#16A34A' },
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3600000), day = Math.floor(h / 24)
  if (day > 0) return `${day}d ago`
  if (h > 0) return `${h}h ago`
  return 'Just now'
}

export default function MaintenancePage() {
  const router = useRouter()
  
const { isPro, plan } = usePro()
  const [userId, setUserId] = useState('')
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [requests, setRequests] = useState<MRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MRequest | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [priFilter, setPriFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  // Add form state
  const [addOpen, setAddOpen] = useState(false)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [allUnits, setAllUnits] = useState<UnitOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium' as MRequest['priority'],
    property_id: '', unit_id: '', note: '',
  })

  async function load(uid: string) {
    setLoading(true)
    try {
      const sb = createClient()

      const { data: props } = await sb.from('properties').select('id,name').eq('landlord_id', uid)
      const propIds = (props || []).map((p: any) => p.id)
      const propNameMap: Record<string, string> = {}
        ; (props || []).forEach((p: any) => { propNameMap[p.id] = p.name })
      setProperties(props || [])

      if (!propIds.length) { setLoading(false); return }

      // flat units
      const { data: units } = await sb.from('units').select('id,unit_number,property_id').in('property_id', propIds)
      const unitMap: Record<string, any> = {}
        ; (units || []).forEach((u: any) => { unitMap[u.id] = u })
      setAllUnits(units || [])

      // flat maintenance requests
      const { data: reqs, error } = await sb
        .from('maintenance_requests')
        .select('id,title,description,priority,status,created_at,resolved_at,property_id,unit_id,tenant_id')
        .in('property_id', propIds)
        .order('created_at', { ascending: false })
      if (error) throw error

      // flat tenant → profile names
      const tenantIds = [...new Set((reqs || []).map((r: any) => r.tenant_id).filter(Boolean))]
      const tenantNameMap: Record<string, string> = {}
      if (tenantIds.length) {
        const { data: tArr } = await sb.from('tenants').select('id,profile_id').in('id', tenantIds)
        const pids = [...new Set((tArr || []).map((t: any) => t.profile_id).filter(Boolean))]
        if (pids.length) {
          const { data: pArr } = await sb.from('profiles').select('id,full_name').in('id', pids)
          const pidMap: Record<string, string> = {}
            ; (pArr || []).forEach((p: any) => { pidMap[p.id] = p.full_name })
            ; (tArr || []).forEach((t: any) => { tenantNameMap[t.id] = pidMap[t.profile_id] || 'Unknown' })
        }
      }

      setRequests((reqs || []).map((r: any) => ({
        id: r.id, title: r.title, description: r.description || '',
        priority: r.priority || 'medium', status: r.status || 'open',
        created_at: r.created_at, resolved_at: r.resolved_at,
        property_id: r.property_id, unit_id: r.unit_id, tenant_id: r.tenant_id,
        property_name: propNameMap[r.property_id] || '—',
        unit_number: unitMap[r.unit_id]?.unit_number || '—',
        tenant_name: r.tenant_id ? (tenantNameMap[r.tenant_id] || 'Unknown') : 'Landlord',
      })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    ; (async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setUserId(user.id)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))
      await load(user.id)
    })()
  }, [router])

  const filtered = requests.filter(r => {
    const sok = filter === 'all' || r.status === filter
    const pok = priFilter === 'all' || r.priority === priFilter
    return sok && pok
  })

  const counts = {
    all: requests.length,
    open: requests.filter(r => r.status === 'open').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    resolved: requests.filter(r => r.status === 'resolved').length,
  }

  async function updateStatus(id: string, status: MRequest['status']) {
    setUpdating(id)
    try {
      const sb = createClient()
      const upd: any = { status }
      if (status === 'resolved') upd.resolved_at = new Date().toISOString()
      const { error } = await sb.from('maintenance_requests').update(upd).eq('id', id)
      if (error) throw error
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...upd } : r))
      setSelected(prev => prev?.id === id ? { ...prev, ...upd } : prev)
    } catch (e) { console.error(e) }
    finally { setUpdating(null) }
  }

  const unitsForProp = allUnits.filter(u => u.property_id === form.property_id)

  async function handleAdd() {
    if (!form.title.trim() || !form.property_id) return
    setSubmitting(true)
    try {
      const sb = createClient()

      // Look up tenant for the selected unit (tenant_id is NOT NULL in DB)
      let resolvedTenantId: string | null = null
      let resolvedTenantName = 'Landlord'
      if (form.unit_id) {
        const { data: tRow } = await sb
          .from('tenants')
          .select('id, profile_id')
          .eq('unit_id', form.unit_id)
          .eq('status', 'active')
          .limit(1)
          .single()
        if (tRow) {
          resolvedTenantId = tRow.id
          // get name
          const { data: prof } = await sb
            .from('profiles').select('full_name').eq('id', tRow.profile_id).single()
          resolvedTenantName = prof?.full_name || 'Unknown'
        }
      }

      // If no unit selected or no tenant found, pick any active tenant in the property
      if (!resolvedTenantId) {
        const { data: tRow } = await sb
          .from('tenants')
          .select('id, profile_id')
          .eq('property_id', form.property_id)
          .eq('status', 'active')
          .limit(1)
          .single()
        if (tRow) {
          resolvedTenantId = tRow.id
          const { data: prof } = await sb
            .from('profiles').select('full_name').eq('id', tRow.profile_id).single()
          resolvedTenantName = prof?.full_name || 'Unknown'
        }
      }

      if (!resolvedTenantId) {
        alert('No active tenant found for this property. Please assign a tenant to the unit first.')
        setSubmitting(false)
        return
      }

      const row: any = {
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        status: 'open',
        property_id: form.property_id,
        unit_id: form.unit_id || null,
        tenant_id: resolvedTenantId,
      }
      const { data, error } = await sb.from('maintenance_requests').insert(row).select().single()
      if (error) throw error

      const propName = properties.find(p => p.id === form.property_id)?.name || '—'
      const unitNum = allUnits.find(u => u.id === form.unit_id)?.unit_number || '—'
      const newReq: MRequest = {
        ...row, id: data.id, created_at: data.created_at, resolved_at: null,
        property_name: propName, unit_number: unitNum,
        tenant_name: resolvedTenantName,
      }
      setRequests(prev => [newReq, ...prev])
      setAddOpen(false)
      setForm({ title: '', description: '', priority: 'medium', property_id: '', unit_id: '', note: '' })
    } catch (e: any) {
      console.error(e)
      alert('Failed to create: ' + (e?.message || 'Unknown error'))
    } finally { setSubmitting(false) }
  }

  function openDetail(r: MRequest) { setSelected(r); setSheetOpen(true) }

  function renderDetail(r: MRequest) {
    const pc = PC[r.priority], sc = SC[r.status]
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', lineHeight: 1.4, marginBottom: 10 }}>{r.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: pc.bg, color: pc.color }}>● {pc.label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94A3B8', marginBottom: 5 }}>Description</div>
            <div style={{ fontSize: 13.5, color: '#0F172A', fontWeight: 500, lineHeight: 1.6 }}>{r.description || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[{ l: 'Property', v: r.property_name }, { l: 'Unit', v: r.unit_number }, { l: 'Reported by', v: r.tenant_name }, { l: 'Submitted', v: timeAgo(r.created_at) }].map(({ l, v }) => (
              <div key={l}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94A3B8', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, color: '#0F172A', fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          {r.resolved_at && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94A3B8', marginBottom: 4 }}>Resolved</div>
              <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{timeAgo(r.resolved_at)}</div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r.status === 'resolved' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: '#F0FDF4', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#16A34A' }}>✅ Resolved</div>
          ) : (
            <>
              {r.status === 'open' && (
                <button disabled={updating === r.id}
                  onClick={() => updateStatus(r.id, 'in_progress')}
                  style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#EFF6FF', color: '#2563EB', border: '1.5px solid #BFDBFE', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  {updating === r.id ? 'Updating…' : '🔵 Mark as In Progress'}
                </button>
              )}
              <button disabled={updating === r.id}
                onClick={() => updateStatus(r.id, 'resolved')}
                style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#16A34A,#15803D)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 2px 8px rgba(22,163,74,.25)' }}>
                {updating === r.id ? 'Updating…' : '✅ Mark as Resolved'}
              </button>
            </>
          )}
          <a href="/landlord/messages" style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' }}>💬 Message Tenant</a>
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

        /* SIDEBAR */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}
        .sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon {
            width: 38px;
            height: 38px;
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.05); /* Very subtle white */
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,.16),rgba(99,102,241,.2));border:1px solid rgba(59,130,246,.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.28);transition:all .18s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
        .btn-primary:hover{transform:translateY(-1px)}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}

        /* STAT STRIP */
        .stat-strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sstat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 12px;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden}
        .sstat-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .sstat-num{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1}
        .sstat-lbl{font-size:11px;color:#94A3B8;font-weight:500;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        /* FILTER BAR */
        .filter-bar{display:flex;align-items:center;gap:10px;margin-bottom:18px;width:100%;overflow-x:auto;scrollbar-width:none}
        .filter-bar::-webkit-scrollbar{display:none}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;white-space:nowrap;flex-shrink:0}
        .ftab{padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .ftab:hover{background:#F1F5F9;color:#0F172A}
        .ftab.active{background:#2563EB;color:#fff}
        .fc{font-size:10px;font-weight:700;background:rgba(255,255,255,.25);border-radius:99px;padding:1px 6px}
        .ftab:not(.active) .fc{background:#F1F5F9;color:#64748B}
        .priority-select{padding:7px 12px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#475569;background:#fff;outline:none;cursor:pointer;flex-shrink:0;white-space:nowrap}

        /* MAIN LAYOUT */
        .mlayout{display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;width:100%}

        /* REQUEST LIST */
        .req-list{display:flex;flex-direction:column;gap:12px;min-width:0}
        .req-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:16px;cursor:pointer;transition:all .18s;box-shadow:0 1px 4px rgba(15,23,42,.04);min-width:0;overflow:hidden}
        .req-card:hover{box-shadow:0 4px 16px rgba(15,23,42,.08);transform:translateY(-1px);border-color:#CBD5E1}
        .req-card.sel{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.12);background:#FAFBFF}
        .req-card.urg{border-left:4px solid #DC2626}
        .req-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
        .req-title{font-size:14px;font-weight:700;color:#0F172A;line-height:1.4;flex:1;min-width:0}
        .req-badges{display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap}
        .badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 9px;white-space:nowrap}
        .req-meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px}
        .req-meta-item{font-size:11.5px;color:#64748B;white-space:nowrap}
        .req-desc{font-size:13px;color:#475569;line-height:1.55;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .req-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
        .req-time{font-size:12px;color:#94A3B8}
        .req-actions{display:flex;gap:6px}
        .act-btn{padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .act-btn:hover:not(:disabled){border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .act-btn:disabled{opacity:.5;cursor:not-allowed}
        .act-btn.green{border-color:#BBF7D0;background:#F0FDF4;color:#16A34A}
        .act-btn.green:hover:not(:disabled){background:#DCFCE7}

        /* DETAIL PANEL */
        .detail-panel{background:#fff;border:1px solid #E2E8F0;border-radius:18px;box-shadow:0 1px 4px rgba(15,23,42,.04);position:sticky;top:74px;overflow:hidden;max-height:calc(100vh - 98px);overflow-y:auto}
        .detail-panel::-webkit-scrollbar{width:0}
        .no-sel{padding:60px 20px;text-align:center;color:#94A3B8}
        .no-sel-ico{font-size:40px;margin-bottom:12px}
        .no-sel-txt{font-size:14px;line-height:1.6}

        /* SKELETON / EMPTY */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .skel-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
        .empty-state{text-align:center;padding:60px 20px;background:#fff;border:1.5px solid #E2E8F0;border-radius:16px}
        .e-ico{font-size:44px;margin-bottom:12px}
        .e-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
        .e-sub{font-size:13.5px;color:#94A3B8}

        /* ADD MODAL */
        .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-bg.open{display:flex}
        .modal{background:#fff;border-radius:20px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(15,23,42,.2);max-height:90vh;overflow-y:auto;display:flex;flex-direction:column}
        .modal::-webkit-scrollbar{width:0}
        .modal-head{padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A}
        .modal-close-btn{background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;padding:4px;line-height:1}
        .modal-body{padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .form-group{display:flex;flex-direction:column;gap:6px}
        .form-label{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px}
        .form-input{padding:9px 12px;border-radius:9px;border:1.5px solid #E2E8F0;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border-color .15s;width:100%}
        .form-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .form-textarea{padding:9px 12px;border-radius:9px;border:1.5px solid #E2E8F0;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;resize:vertical;min-height:90px;width:100%}
        .form-textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .priority-pills{display:flex;gap:6px;flex-wrap:wrap}
        .ppill{padding:6px 14px;border-radius:99px;font-size:12.5px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
        .ppill.sel{border-color:currentColor;opacity:1}
        .ppill:not(.sel){opacity:.55}
        .modal-footer{padding:0 24px 24px;display:flex;gap:10px;flex-shrink:0}
        .btn-cancel{flex:1;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-submit{flex:2;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 8px rgba(37,99,235,.25)}
        .btn-submit:disabled{opacity:.6;cursor:not-allowed}

        /* MOBILE SHEET */
        .sheet-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:400}
        .sheet{display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:22px 22px 0 0;z-index:401;max-height:92vh;overflow-y:auto;transform:translateY(100%);transition:transform .3s ease}
        .sheet::-webkit-scrollbar{width:0}
        .sheet-handle{width:36px;height:4px;border-radius:99px;background:#E2E8F0;margin:10px auto 4px}

        /* RESPONSIVE */
        @media(min-width:1100px){
          .stat-strip{grid-template-columns:repeat(4,1fr)}
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
          .stat-strip{grid-template-columns:repeat(2,1fr)}
          .mlayout{grid-template-columns:1fr}
          .detail-panel{display:none}
          .sheet{display:block}
          .sheet-bg.open{display:block}
          .sheet.open{transform:translateY(0)}
          .form-row{grid-template-columns:1fr}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
          .stat-strip{gap:8px}
          .sstat{padding:12px 10px;gap:8px}
          .sstat-ico{width:30px;height:30px;font-size:15px}
          .sstat-num{font-size:18px}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Add Request Modal */}
      <div className={`modal-bg${addOpen ? ' open' : ''}`} onClick={() => setAddOpen(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">🔧 New Request</div>
            <button className="modal-close-btn" onClick={() => setAddOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="e.g. Broken pipe in kitchen"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Property *</label>
                <select className="form-input" value={form.property_id}
                  onChange={e => setForm(f => ({ ...f, property_id: e.target.value, unit_id: '' }))}>
                  <option value="">Select property</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-input" value={form.unit_id}
                  onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}
                  disabled={!form.property_id}>
                  <option value="">Select unit</option>
                  {unitsForProp.map(u => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <div className="priority-pills">
                {(['urgent', 'high', 'medium', 'low'] as const).map(p => (
                  <button key={p} className={`ppill${form.priority === p ? ' sel' : ''}`}
                    style={{ background: PC[p].bg, color: PC[p].color }}
                    onClick={() => setForm(f => ({ ...f, priority: p }))}>
                    {PC[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" placeholder="Describe the issue in detail…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-submit" disabled={submitting || !form.title.trim() || !form.property_id}
              onClick={handleAdd}>
              {submitting ? '⏳ Creating…' : '✓ Create Request'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile detail sheet */}
      <div className={`sheet-bg${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} />
      <div className={`sheet${sheetOpen && selected ? ' open' : ''}`}>
        <div className="sheet-handle" />
        {selected && renderDetail(selected)}
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
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a>
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item active"><span className="sb-ico">🔧</span>Maintenance{counts.open > 0 && <span className="sb-badge">{counts.open}</span>}</a>
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
              <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
            </div>
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">FREE</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Maintenance</b></div>
            </div>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>🔧 New Request</button>
          </div>

          <div className="content">
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 400, color: '#0F172A', letterSpacing: '-.5px', marginBottom: 3 }}>Maintenance</div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>Track and manage repair requests across all your properties</div>
            </div>

            <div className="stat-strip">
              {[
                { ico: '🔧', bg: '#F1F5F9', num: counts.all, lbl: 'Total Requests' },
                { ico: '🚨', bg: '#FEE2E2', num: counts.open, lbl: 'Open' },
                { ico: '⚙️', bg: '#EFF6FF', num: counts.in_progress, lbl: 'In Progress' },
                { ico: '✅', bg: '#DCFCE7', num: counts.resolved, lbl: 'Resolved' },
              ].map(s => (
                <div key={s.lbl} className="sstat">
                  <div className="sstat-ico" style={{ background: s.bg }}>{s.ico}</div>
                  <div>
                    <div className="sstat-num">{s.num}</div>
                    <div className="sstat-lbl">{s.lbl}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="filter-bar">
              <div className="filter-tabs">
                {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
                  <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                    {{ all: 'All', open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' }[f]}
                    <span className="fc">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <select className="priority-select" value={priFilter}
                onChange={e => setPriFilter(e.target.value as typeof priFilter)}>
                <option value="all">All Priorities</option>
                <option value="urgent">🔴 Urgent</option>
                <option value="high">🟡 High</option>
                <option value="medium">🟨 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>

            <div className="mlayout">
              <div className="req-list">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="skel-card">
                      <div className="skeleton" style={{ height: 16, width: '70%' }} />
                      <div className="skeleton" style={{ height: 12, width: '40%' }} />
                      <div className="skeleton" style={{ height: 36 }} />
                      <div className="skeleton" style={{ height: 12, width: '30%' }} />
                    </div>
                  ))
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-ico">{counts.all === 0 ? '🎉' : '🔍'}</div>
                    <div className="e-title">{counts.all === 0 ? 'No maintenance requests' : 'No requests match filters'}</div>
                    <div className="e-sub">{counts.all === 0 ? 'Click "New Request" to log an issue' : 'Try changing your filters'}</div>
                  </div>
                ) : filtered.map(req => {
                  const pc = PC[req.priority], sc = SC[req.status]
                  return (
                    <div key={req.id}
                      className={`req-card${selected?.id === req.id ? ' sel' : ''}${req.priority === 'urgent' ? ' urg' : ''}`}
                      onClick={() => openDetail(req)}>
                      <div className="req-top">
                        <div className="req-title">{req.title}</div>
                        <div className="req-badges">
                          <span className="badge" style={{ background: pc.bg, color: pc.color }}>● {pc.label}</span>
                          <span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                        </div>
                      </div>
                      <div className="req-meta">
                        <span className="req-meta-item">🏠 {req.property_name}</span>
                        <span className="req-meta-item">🚪 {req.unit_number}</span>
                        <span className="req-meta-item">👤 {req.tenant_name}</span>
                      </div>
                      {req.description && <div className="req-desc">{req.description}</div>}
                      <div className="req-footer">
                        <span className="req-time">🕐 {timeAgo(req.created_at)}</span>
                        <div className="req-actions" onClick={e => e.stopPropagation()}>
                          {req.status === 'open' && (
                            <button className="act-btn" disabled={updating === req.id}
                              onClick={() => updateStatus(req.id, 'in_progress')}>
                              {updating === req.id ? '…' : 'Start'}
                            </button>
                          )}
                          {req.status !== 'resolved' && (
                            <button className="act-btn green" disabled={updating === req.id}
                              onClick={() => updateStatus(req.id, 'resolved')}>
                              {updating === req.id ? '…' : '✓ Resolve'}
                            </button>
                          )}
                          {req.status === 'resolved' && (
                            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>✓ Done</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="detail-panel">
                {!selected
                  ? <div className="no-sel"><div className="no-sel-ico">🔧</div><div className="no-sel-txt">Select a request<br />to view full details</div></div>
                  : renderDetail(selected)
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
