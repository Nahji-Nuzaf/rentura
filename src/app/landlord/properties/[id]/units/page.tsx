'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Unit = {
  id: string
  unit_number: string
  monthly_rent: number
  currency: string
  rent_due_day: number
  status: 'occupied' | 'vacant' | 'maintenance'
  lease_start: string | null
  lease_end: string | null
  created_at: string
  tenant_name?: string
  tenant_email?: string
  tenant_id?: string
}

type Property = {
  id: string
  name: string
  city: string
  type: string
}

const UNIT_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  occupied:     { label: 'Occupied',    bg: '#DCFCE7', color: '#16A34A' },
  vacant:       { label: 'Vacant',      bg: '#FEF3C7', color: '#D97706' },
  maintenance: { label: 'Maintenance', bg: '#FEE2E2', color: '#DC2626' },
}

const BEDROOM_PRESETS = [
  { label: 'Studio', icon: '🛋️', rent: 300  },
  { label: '1 Bed',  icon: '🛏️', rent: 450  },
  { label: '2 Bed',  icon: '🛏️🛏️', rent: 600 },
  { label: '3 Bed',  icon: '🏠', rent: 800  },
  { label: '4 Bed',  icon: '🏡', rent: 1000 },
  { label: 'Luxury', icon: '💎', rent: 1500 },
]

export default function UnitsPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params?.id as string

  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName]         = useState('User')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [property, setProperty]         = useState<Property | null>(null)
  const [units, setUnits]               = useState<Unit[]>([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState<'all'|'occupied'|'vacant'|'maintenance'>('all')
  const [search, setSearch]             = useState('')

  const [editUnit, setEditUnit]   = useState<Unit | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState({
    unit_number: '', monthly_rent: '', rent_due_day: '1',
    status: 'vacant', lease_start: '', lease_end: '',
  })

  const [bulkMode, setBulkMode]     = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [bulkRent, setBulkRent]     = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // ── LOAD ─────────────────────────────────────────────────
  async function loadUnits(supabase: any, userId: string) {
    const { data: prop } = await supabase
      .from('properties').select('id,name,city,type').eq('id', propertyId).single()
    setProperty(prop)

    const { data: unitsData, error } = await supabase
      .from('units')
      .select('id,unit_number,monthly_rent,currency,rent_due_day,status,lease_start,lease_end,created_at')
      .eq('property_id', propertyId)
      .order('unit_number', { ascending: true })
    if (error) throw error

    const unitIds = (unitsData || []).map((u: any) => u.id)
    let tenantMap: Record<string, { name: string; email: string; tenant_id: string }> = {}

    if (unitIds.length > 0) {
      // FIX: Fetch email from tenants table and remove accepted-only filter
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id,unit_id,profile_id,email,invite_accepted')
        .in('unit_id', unitIds)

      const profileIds = (tenantsData || []).map((t: any) => t.profile_id).filter(Boolean)

      let profileMap: Record<string, any> = {}
      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles').select('id,full_name,email').in('id', profileIds)
        ;(profilesData || []).forEach((p: any) => { profileMap[p.id] = p })
      }

      // FIX: Fallback to invitation email if profile name isn't available
      ;(tenantsData || []).forEach((t: any) => {
        if (t.unit_id) {
          const profile = t.profile_id ? profileMap[t.profile_id] : null
          tenantMap[t.unit_id] = {
            name:      profile?.full_name || t.email || 'Invited Tenant',
            email:     profile?.email || t.email || '',
            tenant_id: t.id,
          }
        }
      })

      const unitIdsToFix = (tenantsData || [])
        .filter((t: any) => t.invite_accepted && t.profile_id)
        .map((t: any) => t.unit_id)
        .filter((uid: string) => {
          const u = (unitsData || []).find((u: any) => u.id === uid)
          return u && u.status !== 'occupied'
        })

      if (unitIdsToFix.length > 0) {
        await supabase.from('units').update({ status: 'occupied' }).in('id', unitIdsToFix)
        unitIdsToFix.forEach((uid: string) => {
          const u = unitsData?.find((u: any) => u.id === uid)
          if (u) u.status = 'occupied'
        })
      }
    }

    const shaped: Unit[] = (unitsData || []).map((u: any) => ({
      id:           u.id,
      unit_number:  u.unit_number,
      monthly_rent: u.monthly_rent || 0,
      currency:     u.currency || 'USD',
      rent_due_day: u.rent_due_day || 1,
      status:       tenantMap[u.id] ? 'occupied' : (u.status || 'vacant'),
      lease_start:  u.lease_start,
      lease_end:    u.lease_end,
      created_at:   u.created_at,
      tenant_name:  tenantMap[u.id]?.name,
      tenant_email: tenantMap[u.id]?.email,
      tenant_id:    tenantMap[u.id]?.tenant_id,
    }))
    setUnits(shaped)
  }

  useEffect(() => {
    if (!propertyId) return
    const init = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const name = user.user_metadata?.full_name || 'User'
        setFullName(name)
        setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

        await loadUnits(supabase, user.id)

        // FIX: Watch for ALL events (*), so new tenants show up immediately
        const channel = supabase
          .channel(`units-${propertyId}`)
          .on('postgres_changes', {
            event: '*', 
            schema: 'public',
            table: 'tenants',
            filter: `property_id=eq.${propertyId}`,
          }, async () => {
            await loadUnits(supabase, user.id)
          })
          .subscribe()

        return () => { supabase.removeChannel(channel) }
      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [propertyId, router])

  const filtered = units.filter(u => {
    const statusOk = filter === 'all' || u.status === filter
    const searchOk = search === '' ||
      u.unit_number.toLowerCase().includes(search.toLowerCase()) ||
      (u.tenant_name || '').toLowerCase().includes(search.toLowerCase())
    return statusOk && searchOk
  })

  const counts = {
    all:         units.length,
    occupied:    units.filter(u => u.status === 'occupied').length,
    vacant:      units.filter(u => u.status === 'vacant').length,
    maintenance: units.filter(u => u.status === 'maintenance').length,
  }

  const totalRevenue = units.filter(u => u.status === 'occupied').reduce((s, u) => s + u.monthly_rent, 0)

  // ── EDIT ─────────────────────────────────────────────────
  function openEdit(u: Unit) {
    setEditUnit(u)
    setEditForm({
      unit_number:  u.unit_number,
      monthly_rent: String(u.monthly_rent || ''),
      rent_due_day: String(u.rent_due_day || 1),
      status:       u.status,
      lease_start:  u.lease_start || '',
      lease_end:    u.lease_end || '',
    })
    setSaveError(null)
  }

  async function handleSaveUnit() {
    if (!editUnit) return
    if (!editForm.unit_number.trim()) { setSaveError('Unit number is required.'); return }
    const rent = parseFloat(editForm.monthly_rent)
    if (isNaN(rent) || rent < 0) { setSaveError('Please enter a valid rent.'); return }
    const dueDay = parseInt(editForm.rent_due_day)
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 28) { setSaveError('Rent due day must be 1–28.'); return }

    setSaving(true); setSaveError(null)
    try {
      const supabase = createClient()
      const payload: any = {
        unit_number:  editForm.unit_number.trim(),
        monthly_rent: rent,
        rent_due_day: dueDay,
        status: editUnit.tenant_id ? editUnit.status : editForm.status,
      }
      if (editForm.lease_start) payload.lease_start = editForm.lease_start
      if (editForm.lease_end)   payload.lease_end   = editForm.lease_end

      const { error } = await supabase.from('units').update(payload).eq('id', editUnit.id)
      if (error) throw new Error(error.message)

      setUnits(prev => prev.map(u => u.id === editUnit.id ? { ...u, ...payload } : u))
      setEditUnit(null)
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  // ── BULK ─────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(u => u.id)))
  }

  async function applyBulk() {
    if (selected.size === 0 || (!bulkRent && !bulkStatus)) return
    setBulkSaving(true)
    try {
      const supabase = createClient()
      const ids = Array.from(selected)
      const update: any = {}
      if (bulkRent) update.monthly_rent = parseFloat(bulkRent)
      if (bulkStatus) {
        const safeIds = ids.filter(id => {
          const u = units.find(u => u.id === id)
          return u && !u.tenant_id
        })
        if (safeIds.length > 0) {
          await supabase.from('units').update({ status: bulkStatus }).in('id', safeIds)
        }
        if (bulkRent && ids.length > 0) {
          await supabase.from('units').update({ monthly_rent: parseFloat(bulkRent) }).in('id', ids)
        }
        setUnits(prev => prev.map(u => {
          if (!ids.includes(u.id)) return u
          const updated: any = { ...u }
          if (bulkRent) updated.monthly_rent = parseFloat(bulkRent)
          if (bulkStatus && !u.tenant_id) updated.status = bulkStatus
          return updated
        }))
      } else {
        await supabase.from('units').update(update).in('id', ids)
        setUnits(prev => prev.map(u => ids.includes(u.id) ? { ...u, ...update } : u))
      }
      setSelected(new Set()); setBulkRent(''); setBulkStatus(''); setBulkMode(false)
    } catch (err) { console.error(err) }
    finally { setBulkSaving(false) }
  }

  const isOccupied = (u: Unit) => !!u.tenant_id || u.status === 'occupied'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        body{background:#F4F6FA;font-family:'Plus Jakarta Sans',sans-serif;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;position:relative;overflow-x:hidden;width:100%}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .main{margin-left:260px;flex:1;min-height:100vh;display:flex;flex-direction:column;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
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
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0;line-height:1}
        .breadcrumb{font-size:12.5px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
        .breadcrumb a{color:#94A3B8;text-decoration:none}.breadcrumb a:hover{color:#2563EB}
        .breadcrumb b{color:#0F172A;font-weight:700}
        .tb-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
        .btn-outline{padding:7px 14px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:5px}
        .btn-outline:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}
        .page-header{margin-bottom:20px}
        .prop-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:99px;font-size:12px;font-weight:600;color:#2563EB;margin-bottom:10px}
        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;letter-spacing:-.5px}
        .page-sub{font-size:13px;color:#94A3B8;margin-top:3px}
        .stat-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sstat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 12px;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;align-items:center;gap:10px;min-width:0}
        .sstat-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .sstat-num{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;line-height:1}
        .sstat-lbl{font-size:11px;color:#94A3B8;font-weight:500;margin-top:2px}
        .toolbar{display:flex;flex-direction:column;gap:10px;margin-bottom:16px;width:100%}
        .filter-row-wrap{width:100%;overflow-x:auto;scrollbar-width:none}
        .filter-row-wrap::-webkit-scrollbar{display:none}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;white-space:nowrap}
        .ftab{padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
        .ftab:hover{background:#F1F5F9;color:#0F172A}.ftab.active{background:#2563EB;color:#fff}
        .ftab .fc{font-size:10px;font-weight:700;background:rgba(255,255,255,.25);border-radius:99px;padding:1px 6px}
        .ftab:not(.active) .fc{background:#F1F5F9;color:#64748B}
        .search-wrap{width:100%;position:relative}
        .search-ico{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none}
        .search-input{width:100%;padding:9px 12px 9px 36px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;background:#fff}
        .search-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .bulk-bar{background:linear-gradient(135deg,#1E3A5F,#1E3A8A);border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%}
        .bulk-info{color:#93C5FD;font-size:13px;font-weight:600;flex:1;min-width:80px}
        .bulk-field{display:flex;align-items:center;gap:8px}
        .bulk-label{color:#94A3B8;font-size:12px;font-weight:600;white-space:nowrap}
        .bulk-input{padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#F1F5F9;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;width:90px}
        .bulk-select{padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#F1F5F9;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none}
        .bulk-select option{background:#1E3A5F;color:#F1F5F9}
        .bulk-apply{padding:7px 16px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .bulk-apply:disabled{opacity:.5;cursor:not-allowed}
        .bulk-cancel{padding:7px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .units-table-wrap{background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .units-table{width:100%;border-collapse:collapse;table-layout:fixed}
        .units-table thead tr{background:#F8FAFC;border-bottom:1px solid #E2E8F0}
        .units-table th{padding:12px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap}
        .units-table td{padding:13px 14px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;vertical-align:middle;overflow:hidden;text-overflow:ellipsis}
        .units-table tr:last-child td{border-bottom:none}
        .units-table tbody tr:hover{background:#FAFBFF}
        .units-table tbody tr.selected-row{background:#EFF6FF}
        .units-table tbody tr.occupied-row{background:#F0FDF4}
        .unit-num{font-weight:700;color:#0F172A;font-size:14px}
        .unit-tenant{display:flex;flex-direction:column}
        .tenant-name{font-weight:600;color:#0F172A;font-size:13px}
        .tenant-email{font-size:11.5px;color:#94A3B8;margin-top:1px}
        .no-tenant{font-size:13px;color:#94A3B8;font-style:italic}
        .rent-cell{font-weight:700;color:#0F172A}
        .rent-sub{font-size:11px;color:#94A3B8;font-weight:400}
        .badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 9px;white-space:nowrap}
        .edit-btn{padding:6px 14px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:12px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .edit-btn:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .check-col{width:40px}
        input[type="checkbox"]{width:16px;height:16px;cursor:pointer;accent-color:#2563EB}
        .lease-bar{height:4px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin-top:3px;width:100%}
        .lease-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3B82F6,#6366F1)}
        .lease-dates{font-size:11px;color:#94A3B8}
        .locked-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#16A34A;background:#DCFCE7;border:1px solid #BBF7D0;border-radius:8px;padding:3px 8px}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;height:14px}
        .empty-state{text-align:center;padding:60px 20px;color:#94A3B8}
        .empty-ico{font-size:44px;margin-bottom:12px}
        .empty-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
        .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:300}
        .drawer-overlay.open{display:block}
        .drawer{position:fixed;top:0;right:0;bottom:0;width:440px;background:#fff;z-index:301;box-shadow:-8px 0 32px rgba(15,23,42,.12);transform:translateX(100%);transition:transform .28s ease;display:flex;flex-direction:column}
        .drawer.open{transform:translateX(0)}
        .drawer-head{padding:20px 24px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .drawer-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A}
        .drawer-sub{font-size:13px;color:#94A3B8;margin-top:2px}
        .drawer-close{background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;padding:4px 8px;border-radius:6px}
        .drawer-close:hover{background:#F1F5F9}
        .drawer-body{flex:1;padding:24px;overflow-y:auto;display:flex;flex-direction:column;gap:16px}
        .drawer-body::-webkit-scrollbar{width:0}
        .drawer-footer{padding:16px 24px;border-top:1px solid #E2E8F0;flex-shrink:0}
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12.5px;font-weight:700;color:#374151;letter-spacing:.2px}
        .field input,.field select{padding:10px 14px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border-color .15s;width:100%}
        .field input:focus,.field select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .field input:disabled,.field select:disabled{background:#F8FAFC;color:#94A3B8;cursor:not-allowed}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .divider{height:1px;background:#F1F5F9}
        .section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8}
        .err-box{padding:10px 14px;background:#FEE2E2;color:#DC2626;border-radius:10px;font-size:13px;font-weight:600}
        .info-box{padding:10px 14px;background:#EFF6FF;color:#2563EB;border-radius:10px;font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px}
        .btn-row{display:flex;gap:10px}
        .btn-cancel{flex:1;padding:11px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-save{flex:2;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.25)}
        .btn-save:disabled{opacity:.65;cursor:not-allowed}
        .preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .preset-btn{padding:10px 6px;border-radius:10px;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;transition:all .15s;display:flex;flex-direction:column;align-items:center}
        .preset-btn:hover{border-color:#3B82F6;background:#EFF6FF}
        .preset-btn:disabled{opacity:.4;cursor:not-allowed}
        .unit-cards{display:none;flex-direction:column;gap:10px;width:100%}
        .unit-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .unit-card.occupied-card{border-color:#BBF7D0;background:#F0FDF4}
        .uc-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
        .uc-num{font-size:15px;font-weight:700;color:#0F172A}
        .uc-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px;flex-shrink:0}
        .uc-body{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-bottom:12px}
        .uc-field{display:flex;flex-direction:column;gap:2px;min-width:0}
        .uc-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8}
        .uc-val{font-size:14px;font-weight:700;color:#0F172A}
        .uc-sub{font-size:11px;color:#94A3B8;margin-top:1px}
        .uc-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #F1F5F9}
        .uc-tenant{display:flex;flex-direction:column;min-width:0;flex:1}
        .uc-tname{font-size:13px;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .uc-temail{font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .uc-no-tenant{font-size:13px;color:#94A3B8;font-style:italic;flex:1}
        @media(max-width:1024px){.stat-strip{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px}
          .drawer{width:100%!important;right:0!important;left:0!important;top:auto!important;bottom:0!important;height:91vh;border-radius:20px 20px 0 0;transform:translateY(100%)!important;transition:transform .3s ease}
          .drawer.open{transform:translateY(0)!important}
          .drawer-head{padding:20px 20px 16px;position:relative}
          .drawer-head::before{content:'';position:absolute;top:8px;left:50%;transform:translateX(-50%);width:36px;height:4px;border-radius:99px;background:#E2E8F0}
          .field-row{grid-template-columns:1fr!important}
          .units-table-wrap{display:none!important}.unit-cards{display:flex!important}
          .bulk-bar{flex-direction:column;align-items:stretch}.bulk-field{width:100%}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}.content{padding:12px 12px}.page-title{font-size:22px}
          .sstat{padding:12px 10px;gap:8px}.sstat-ico{width:30px;height:30px;font-size:15px}.sstat-num{font-size:18px}
          .tb-label{display:none}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={()=>setSidebarOpen(false)}/>
      <div className={`drawer-overlay${editUnit?' open':''}`} onClick={()=>setEditUnit(null)}/>

      {/* Edit Drawer */}
      <div className={`drawer${editUnit?' open':''}`}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">Edit Unit</div>
            {editUnit && <div className="drawer-sub">{property?.name} · {editUnit.unit_number}</div>}
          </div>
          <button className="drawer-close" onClick={()=>setEditUnit(null)}>✕</button>
        </div>
        <div className="drawer-body">

          {/* Occupied notice */}
          {editUnit && isOccupied(editUnit) && (
            <div className="info-box">
              🔒 This unit has an active tenant. Status is locked and cannot be changed.
            </div>
          )}

          <div className="field">
            <label>Unit Number / Name *</label>
            <input placeholder="e.g. Unit 5A" value={editForm.unit_number}
              onChange={e=>setEditForm(f=>({...f,unit_number:e.target.value}))}/>
          </div>

          <div className="divider"/>
          <div className="section-label">Rent & Payment</div>

          <div className="field-row">
            <div className="field">
              <label>Monthly Rent (USD)</label>
              <input type="number" min="0" placeholder="e.g. 500" value={editForm.monthly_rent}
                onChange={e=>setEditForm(f=>({...f,monthly_rent:e.target.value}))}/>
            </div>
            <div className="field">
              <label>Rent Due Day (1–28)</label>
              <input type="number" min="1" max="28" placeholder="e.g. 1" value={editForm.rent_due_day}
                onChange={e=>setEditForm(f=>({...f,rent_due_day:e.target.value}))}/>
            </div>
          </div>

          <div style={{fontSize:'12px',color:'#94A3B8'}}>💡 Quick rent presets:</div>
          <div className="preset-grid">
            {BEDROOM_PRESETS.map(p=>(
              <button key={p.label} className="preset-btn"
                disabled={!!(editUnit && isOccupied(editUnit))}
                onClick={()=>{
                  if (editUnit && isOccupied(editUnit)) return
                  const base = editForm.unit_number.replace(/\s*\(.*\)$/,'')
                  setEditForm(f=>({...f,unit_number:`${base} (${p.label})`,monthly_rent:String(p.rent)}))
                }}>
                <span style={{fontSize:18}}>{p.icon}</span>
                <span style={{fontSize:11.5,fontWeight:600,color:'#475569'}}>{p.label}</span>
                <span style={{fontSize:10,color:'#94A3B8',marginTop:2}}>${p.rent}/mo</span>
              </button>
            ))}
          </div>

          <div className="divider"/>
          <div className="section-label">Status & Lease</div>

          <div className="field">
            <label>Unit Status {editUnit && isOccupied(editUnit) && <span style={{color:'#16A34A',fontWeight:400}}>(locked — tenant active)</span>}</label>
            {editUnit && isOccupied(editUnit) ? (
              <div className="locked-badge">🔒 Occupied — tenant is active</div>
            ) : (
              <select value={editForm.status} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}>
                <option value="vacant">Vacant (available)</option>
                <option value="occupied">Occupied (has tenant)</option>
                <option value="maintenance">Maintenance (unavailable)</option>
              </select>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Lease Start</label>
              <input type="date" value={editForm.lease_start}
                onChange={e=>setEditForm(f=>({...f,lease_start:e.target.value}))}/>
            </div>
            <div className="field">
              <label>Lease End</label>
              <input type="date" value={editForm.lease_end}
                onChange={e=>setEditForm(f=>({...f,lease_end:e.target.value}))}/>
            </div>
          </div>

          {saveError && <div className="err-box">⚠️ {saveError}</div>}
        </div>
        <div className="drawer-footer">
          <div className="btn-row">
            <button className="btn-cancel" onClick={()=>setEditUnit(null)}>Cancel</button>
            <button className="btn-save" disabled={saving} onClick={handleSaveUnit}>
              {saving?'Saving…':'Save Unit'}
            </button>
          </div>
        </div>
      </div>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo"><div className="sb-logo-icon">🏘️</div><span className="sb-logo-name">Rentura</span></div>
          <nav className="sb-nav">
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item active"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
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
              <button className="sb-up-btn" onClick={()=>window.location.href='/landlord/upgrade'}>See Plans →</button>
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
              <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">
                <a href="/landlord/properties">Properties</a>
                <span style={{margin:'0 4px',color:'#CBD5E1'}}>/</span>
                <span>{property?.name||'…'}</span>
                <span style={{margin:'0 4px',color:'#CBD5E1'}}>/</span>
                <b>Units</b>
              </div>
            </div>
            <div className="tb-actions">
              {!bulkMode
                ? <button className="btn-outline" onClick={()=>{setBulkMode(true);setSelected(new Set())}}>✏️ <span className="tb-label">Bulk Edit</span></button>
                : <button className="btn-outline" onClick={()=>{setBulkMode(false);setSelected(new Set())}}>✕ <span className="tb-label">Cancel</span></button>
              }
              <a href="/landlord/properties" className="btn-outline">← <span className="tb-label">Back</span></a>
            </div>
          </div>

          <div className="content">
            <div className="page-header">
              {property && <div className="prop-badge">🏢 {property.name} · {property.city}</div>}
              <div className="page-title">Manage Units</div>
              <div className="page-sub">Set individual rents, statuses, and lease dates for each unit</div>
            </div>

            <div className="stat-strip">
              <div className="sstat"><div className="sstat-ico" style={{background:'#EFF6FF'}}>🏗️</div><div><div className="sstat-num">{counts.all}</div><div className="sstat-lbl">Total Units</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{background:'#DCFCE7'}}>✅</div><div><div className="sstat-num">{counts.occupied}</div><div className="sstat-lbl">Occupied</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{background:'#FEF3C7'}}>🔑</div><div><div className="sstat-num">{counts.vacant}</div><div className="sstat-lbl">Vacant</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{background:'#DCFCE7'}}>💰</div><div><div className="sstat-num">${totalRevenue.toLocaleString()}</div><div className="sstat-lbl">Monthly Revenue</div></div></div>
            </div>

            <div className="toolbar">
              <div className="filter-row-wrap">
                <div className="filter-tabs">
                  {(['all','occupied','vacant','maintenance'] as const).map(f=>(
                    <button key={f} className={`ftab${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
                      {{all:'All',occupied:'Occupied',vacant:'Vacant',maintenance:'Maintenance'}[f]}
                      <span className="fc">{counts[f]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="search-wrap">
                <span className="search-ico">🔍</span>
                <input className="search-input" placeholder="Search unit or tenant…" value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
            </div>

            {bulkMode && selected.size > 0 && (
              <div className="bulk-bar">
                <div className="bulk-info">{selected.size} unit{selected.size>1?'s':''} selected</div>
                <div className="bulk-field">
                  <span className="bulk-label">Rent $</span>
                  <input className="bulk-input" type="number" placeholder="e.g. 600" value={bulkRent} onChange={e=>setBulkRent(e.target.value)}/>
                </div>
                <div className="bulk-field">
                  <span className="bulk-label">Status</span>
                  <select className="bulk-select" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
                    <option value="">— keep —</option>
                    <option value="vacant">Vacant</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <button className="bulk-apply" disabled={bulkSaving||(!bulkRent&&!bulkStatus)} onClick={applyBulk}>{bulkSaving?'Applying…':'Apply'}</button>
                <button className="bulk-cancel" onClick={()=>setSelected(new Set())}>Clear</button>
              </div>
            )}

            {loading ? (
              <div className="units-table-wrap">
                <table className="units-table">
                  <thead><tr><th>Unit</th><th>Tenant</th><th>Rent</th><th>Status</th><th>Lease</th><th></th></tr></thead>
                  <tbody>{[1,2,3,4,5].map(i=>(
                    <tr key={i}>
                      <td><div className="skeleton" style={{width:60}}/></td>
                      <td><div className="skeleton" style={{width:120}}/></td>
                      <td><div className="skeleton" style={{width:70}}/></td>
                      <td><div className="skeleton" style={{width:80,height:24,borderRadius:99}}/></td>
                      <td><div className="skeleton" style={{width:100}}/></td>
                      <td><div className="skeleton" style={{width:60,height:30,borderRadius:8}}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-ico">🏗️</div><div className="empty-title">No units found</div></div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="units-table-wrap">
                  <table className="units-table">
                    <thead>
                      <tr>
                        {bulkMode && <th className="check-col"><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleSelectAll}/></th>}
                        <th>Unit</th><th>Tenant</th><th>Monthly Rent</th><th>Status</th><th>Lease</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u=>{
                        const sc = UNIT_STATUS[u.status]||UNIT_STATUS.vacant
                        let leasePct = 0
                        if (u.lease_start && u.lease_end) {
                          const s=new Date(u.lease_start).getTime(),e=new Date(u.lease_end).getTime(),n=Date.now()
                          leasePct=Math.min(100,Math.max(0,Math.round(((n-s)/(e-s))*100)))
                        }
                        const rowClass = selected.has(u.id)?'selected-row':isOccupied(u)?'occupied-row':''
                        return (
                          <tr key={u.id} className={rowClass}>
                            {bulkMode && <td className="check-col"><input type="checkbox" checked={selected.has(u.id)} onChange={()=>toggleSelect(u.id)}/></td>}
                            <td><span className="unit-num">{u.unit_number}</span></td>
                            <td>
                              {u.tenant_name ? (
                                <div className="unit-tenant">
                                  <span className="tenant-name">👤 {u.tenant_name}</span>
                                  <span className="tenant-email">{u.tenant_email}</span>
                                </div>
                              ) : <span className="no-tenant">No tenant</span>}
                            </td>
                            <td>
                              <div className="rent-cell">${u.monthly_rent.toLocaleString()}</div>
                              <div className="rent-sub">due day {u.rent_due_day}</div>
                            </td>
                            <td><span className="badge" style={{background:sc.bg,color:sc.color}}>● {sc.label}</span></td>
                            <td>
                              {u.lease_start && u.lease_end ? (
                                <div>
                                  <div className="lease-dates">
                                    {new Date(u.lease_start).toLocaleDateString('en-US',{month:'short',year:'numeric'})} → {new Date(u.lease_end).toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                                  </div>
                                  <div className="lease-bar"><div className="lease-fill" style={{width:`${leasePct}%`}}/></div>
                                </div>
                              ) : <span style={{fontSize:12,color:'#94A3B8'}}>—</span>}
                            </td>
                            <td><button className="edit-btn" onClick={()=>openEdit(u)}>Edit</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="unit-cards">
                  {filtered.map(u=>{
                    const sc=UNIT_STATUS[u.status]||UNIT_STATUS.vacant
                    let leasePct=0
                    if(u.lease_start&&u.lease_end){
                      const s=new Date(u.lease_start).getTime(),e=new Date(u.lease_end).getTime(),n=Date.now()
                      leasePct=Math.min(100,Math.max(0,Math.round(((n-s)/(e-s))*100)))
                    }
                    return (
                      <div key={u.id} className={`unit-card${isOccupied(u)?' occupied-card':''}`}>
                        <div className="uc-top">
                          <span className="uc-num">{u.unit_number}</span>
                          <span className="uc-badge" style={{background:sc.bg,color:sc.color}}>● {sc.label}</span>
                        </div>
                        <div className="uc-body">
                          <div className="uc-field">
                            <div className="uc-label">Monthly Rent</div>
                            <div className="uc-val">${u.monthly_rent.toLocaleString()}</div>
                            <div className="uc-sub">due on day {u.rent_due_day}</div>
                          </div>
                          <div className="uc-field">
                            <div className="uc-label">Lease</div>
                            {u.lease_start&&u.lease_end ? (
                              <>
                                <div className="uc-sub" style={{marginTop:2}}>{new Date(u.lease_start).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
                                <div className="uc-sub">→ {new Date(u.lease_end).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
                                <div style={{height:4,background:'#E2E8F0',borderRadius:99,overflow:'hidden',marginTop:5}}>
                                  <div style={{height:'100%',width:`${leasePct}%`,background:'#3B82F6',borderRadius:99}}/>
                                </div>
                              </>
                            ) : <div className="uc-sub" style={{marginTop:2}}>No lease set</div>}
                          </div>
                        </div>
                        <div className="uc-footer">
                          {u.tenant_name ? (
                            <div className="uc-tenant">
                              <div className="uc-tname">👤 {u.tenant_name}</div>
                              {u.tenant_email&&<div className="uc-temail">{u.tenant_email}</div>}
                            </div>
                          ) : <span className="uc-no-tenant">No tenant assigned</span>}
                          <button className="edit-btn" onClick={()=>openEdit(u)}>Edit</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}