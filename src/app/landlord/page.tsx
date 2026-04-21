'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image';

import { usePro } from '@/components/ProProvider'
const { isPro, plan } = usePro()

type Stats = {
  totalProperties: number
  totalUnits: number
  occupiedUnits: number
  totalTenants: number
  monthlyRevenue: number
  openMaintenance: number
  paidThisMonth: number
  overdueCount: number
}

type PropertyRow = {
  id: string
  name: string
  city: string
  country: string
  total_units: number
  status: string
  occupied: number
  avg_rent: number
}

type RentRow = {
  tenant_name: string
  unit_number: string
  property_name: string
  amount: number
  status: string
  initials: string
}

type MaintRow = {
  id: string
  title: string
  property_name: string
  unit_number: string
  priority: string
  status: string
  created_at: string
}

type LeaseRow = {
  tenant_name: string
  initials: string
  property: string
  unit: string
  lease_end: string
  days_left: number
  color: string
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(str: string) {
  const diff = Date.now() - new Date(str).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'Just now'
}

export default function LandlordDashboard() {
  const router = useRouter()
  const [firstName, setFirstName]     = useState('there')
  const [initials, setInitials]       = useState('NN')
  const [fullName, setFullName]       = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [stats, setStats]             = useState<Stats>({
    totalProperties: 0, totalUnits: 0, occupiedUnits: 0,
    totalTenants: 0, monthlyRevenue: 0, openMaintenance: 0,
    paidThisMonth: 0, overdueCount: 0,
  })
  const [properties, setProperties]   = useState<PropertyRow[]>([])
  const [rentRows, setRentRows]       = useState<RentRow[]>([])
  const [maintRows, setMaintRows]     = useState<MaintRow[]>([])
  const [leaseRows, setLeaseRows]     = useState<LeaseRow[]>([])
  const [lastMonthRevenue, setLastMonthRevenue] = useState(0)
  const [lastMonthTenants, setLastMonthTenants] = useState(0)

  const currentMonth = new Date().toLocaleString('default', { month: 'long' })

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const name = user.user_metadata?.full_name || 'User'
        setFullName(name)
        setFirstName(name.split(' ')[0])
        setInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

        // ── 1. Properties + units ──────────────────────────
        const { data: props } = await supabase
          .from('properties')
          .select('id, name, city, country, total_units, status, units(id, status, monthly_rent)')
          .eq('landlord_id', user.id)
          .order('created_at', { ascending: false })

        const propIds = (props || []).map((p: any) => p.id)
        let totalUnits = 0, occupiedUnits = 0, monthlyRevenue = 0

        const propRows: PropertyRow[] = (props || []).map((p: any) => {
          const units    = p.units || []
          const occupied = units.filter((u: any) => u.status === 'occupied').length
          const rents    = units.filter((u: any) => u.status === 'occupied').map((u: any) => u.monthly_rent || 0)
          const revenue  = rents.reduce((a: number, b: number) => a + b, 0)
          const allRents = units.map((u: any) => u.monthly_rent || 0).filter(Boolean)
          const avgRent  = allRents.length > 0 ? Math.round(allRents.reduce((a: number, b: number) => a + b, 0) / allRents.length) : 0
          totalUnits    += p.total_units
          occupiedUnits += occupied
          monthlyRevenue += revenue
          return {
            id: p.id, name: p.name, city: p.city, country: p.country,
            total_units: p.total_units, status: p.status,
            occupied, avg_rent: avgRent,
          }
        })
        setProperties(propRows)

        // ── 2. Tenants ─────────────────────────────────────
        let totalTenants = 0
        if (propIds.length > 0) {
          const { count } = await supabase
            .from('tenants')
            .select('id', { count: 'exact', head: true })
            .in('property_id', propIds)
            .eq('status', 'active')
          totalTenants = count || 0
        }

        // ── 3. Rent payments this month ────────────────────
        const now   = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

        let paidThisMonth = 0, overdueCount = 0
        const rentRowsData: RentRow[] = []

        if (propIds.length > 0) {
          const allUnitIds = (props || []).flatMap((p: any) => (p.units || []).map((u: any) => u.id))

          // Build unit lookup from already-fetched props
          const unitInfoMap: Record<string, {unit_number: string, property_name: string}> = {}
          ;(props || []).forEach((p: any) => {
            ;(p.units || []).forEach((u: any) => {
              unitInfoMap[u.id] = { unit_number: u.unit_number || '—', property_name: p.name || '—' }
            })
          })

          // Fetch payments flat
          const { data: payments } = await supabase
            .from('rent_payments')
            .select('id, amount, status, unit_id, tenant_id, due_date')
            .in('unit_id', allUnitIds)
            .gte('due_date', start)
            .lte('due_date', end)
            .order('status', { ascending: true })
            .limit(5)

          // Get tenant names flat
          const payTenantIds = [...new Set((payments || []).map((p: any) => p.tenant_id).filter(Boolean))]
          const payProfileMap: Record<string, string> = {}
          if (payTenantIds.length > 0) {
            const { data: tArr } = await supabase
              .from('tenants').select('id, profile_id').in('id', payTenantIds)
            const pIds = [...new Set((tArr || []).map((t: any) => t.profile_id).filter(Boolean))]
            if (pIds.length > 0) {
              const { data: pArr } = await supabase
                .from('profiles').select('id, full_name').in('id', pIds)
              const pidMap: Record<string, string> = {}
              ;(pArr || []).forEach((p: any) => { pidMap[p.id] = p.full_name })
              ;(tArr || []).forEach((t: any) => { payProfileMap[t.id] = pidMap[t.profile_id] || 'Unknown' })
            }
          }

          ;(payments || []).forEach((pay: any) => {
            if (pay.status === 'paid') paidThisMonth++
            if (pay.status === 'overdue') overdueCount++
            const tName = payProfileMap[pay.tenant_id] || 'Unknown'
            const uInfo = unitInfoMap[pay.unit_id] || { unit_number: '—', property_name: '—' }
            rentRowsData.push({
              tenant_name:   tName,
              unit_number:   uInfo.unit_number,
              property_name: uInfo.property_name,
              amount:        pay.amount || 0,
              status:        pay.status || 'pending',
              initials:      tName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
            })
          })
        }
        setRentRows(rentRowsData)

        // ── 4. Maintenance ─────────────────────────────────
        let openMaintenance = 0
        if (propIds.length > 0) {
          const { data: maint } = await supabase
            .from('maintenance_requests')
            .select('id, title, priority, status, created_at, property_id, unit_id')
            .in('property_id', propIds)
            .neq('status', 'resolved')
            .order('created_at', { ascending: false })
            .limit(3)

          openMaintenance = (maint || []).length

          // Build prop name map from already-fetched props
          const propNameMap: Record<string, string> = {}
          ;(props || []).forEach((p: any) => { propNameMap[p.id] = p.name })

          // Fetch unit numbers for maintenance
          const maintUnitIds = [...new Set((maint || []).map((m: any) => m.unit_id).filter(Boolean))]
          const maintUnitMap: Record<string, string> = {}
          if (maintUnitIds.length > 0) {
            const { data: uArr } = await supabase
              .from('units').select('id, unit_number').in('id', maintUnitIds)
            ;(uArr || []).forEach((u: any) => { maintUnitMap[u.id] = u.unit_number })
          }

          setMaintRows((maint || []).map((m: any) => ({
            id:            m.id,
            title:         m.title,
            property_name: propNameMap[m.property_id] || '—',
            unit_number:   maintUnitMap[m.unit_id] || '—',
            priority:      m.priority || 'medium',
            status:        m.status || 'open',
            created_at:    m.created_at,
          })))
        }

        // ── 5. Lease expirations (next 60 days) ──────────────
        if (propIds.length > 0) {
          const today    = new Date().toISOString().split('T')[0]
          const in60days = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
          const { data: expiringUnits } = await supabase
            .from('units')
            .select('id, unit_number, lease_end, property_id')
            .in('property_id', propIds)
            .gte('lease_end', today)
            .lte('lease_end', in60days)
            .order('lease_end', { ascending: true })

          if (expiringUnits && expiringUnits.length > 0) {
            const expUnitIds = expiringUnits.map((u: any) => u.id)
            const { data: expTenants } = await supabase
              .from('tenants').select('id, profile_id, unit_id').in('unit_id', expUnitIds).eq('status', 'active')
            const expProfileIds = [...new Set((expTenants || []).map((t: any) => t.profile_id).filter(Boolean))]
            const expProfileMap: Record<string, string> = {}
            if (expProfileIds.length > 0) {
              const { data: pArr } = await supabase
                .from('profiles').select('id, full_name').in('id', expProfileIds)
              ;(pArr || []).forEach((p: any) => { expProfileMap[p.id] = p.full_name })
            }
            const tenantByUnit: Record<string, string> = {}
            ;(expTenants || []).forEach((t: any) => { tenantByUnit[t.unit_id] = expProfileMap[t.profile_id] || 'Unknown' })
            const propNameMap2: Record<string, string> = {}
            ;(props || []).forEach((p: any) => { propNameMap2[p.id] = p.name })
            const leaseColors = ['linear-gradient(135deg,#6366F1,#8B5CF6)','linear-gradient(135deg,#EF4444,#F87171)','linear-gradient(135deg,#0EA5E9,#38BDF8)','linear-gradient(135deg,#10B981,#34D399)']
            setLeaseRows(expiringUnits.map((u: any, i: number) => {
              const name = tenantByUnit[u.id] || 'Vacant'
              const daysLeft = Math.ceil((new Date(u.lease_end).getTime() - Date.now()) / 86400000)
              return { tenant_name: name, initials: name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2), property: propNameMap2[u.property_id] || '—', unit: u.unit_number, lease_end: u.lease_end, days_left: daysLeft, color: leaseColors[i % leaseColors.length] }
            }))
          }
        }

        // ── 6. Last month revenue for trend ───────────────────
        if (propIds.length > 0) {
          const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
          const lmEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()
          const allUnitIds2 = (props || []).flatMap((p: any) => (p.units || []).map((u: any) => u.id))
          const { data: lmPayments } = await supabase
            .from('rent_payments').select('amount').in('unit_id', allUnitIds2)
            .gte('due_date', lmStart).lte('due_date', lmEnd).eq('status', 'paid')
          const lmRev = (lmPayments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)
          setLastMonthRevenue(lmRev)
          const { count: lmTenants } = await supabase
            .from('tenants').select('id', { count: 'exact', head: true }).in('property_id', propIds).eq('status', 'active')
          setLastMonthTenants(lmTenants || 0)
        }

        setStats({
          totalProperties: propRows.length,
          totalUnits,
          occupiedUnits,
          totalTenants,
          monthlyRevenue,
          openMaintenance,
          paidThisMonth,
          overdueCount,
        })
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const occupancyRate = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100) : 0

  function trend(current: number, previous: number) {
    if (previous === 0) return null
    const pct = Math.round(((current - previous) / previous) * 100)
    return { pct, up: pct >= 0 }
  }
  const revTrend     = trend(stats.monthlyRevenue, lastMonthRevenue)
  const tenantTrend  = trend(stats.totalTenants, lastMonthTenants)

  const RENT_STATUS: Record<string, { label: string; color: string }> = {
    paid:    { label: 'Paid',    color: '#16A34A' },
    pending: { label: 'Due',     color: '#D97706' },
    overdue: { label: 'Overdue', color: '#DC2626' },
    late:    { label: 'Late',    color: '#DC2626' },
  }

  const PRIORITY_CFG: Record<string, { color: string; bg: string }> = {
    urgent: { color: '#DC2626', bg: '#FEE2E2' },
    high:   { color: '#D97706', bg: '#FEF3C7' },
    medium: { color: '#CA8A04', bg: '#FEF9C3' },
    low:    { color: '#16A34A', bg: '#DCFCE7' },
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
        .sidebar { width:260px; flex-shrink:0; background:#0F172A; display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:200; box-shadow:4px 0 24px rgba(15,23,42,0.1); transition:transform .25s ease; }
        .sb-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:199; }
        .sb-overlay.open { display:block; }
        .sidebar.open { transform:translateX(0) !important; }
        .sb-logo { display:flex; align-items:center; gap:12px; padding:22px 20px 18px; border-bottom:1px solid rgba(255,255,255,0.07); }
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
        .sb-logo-name { font-family:'Fraunces',serif; font-size:19px; font-weight:700; color:#F8FAFC; }
        .sb-nav { flex:1; padding:14px 12px; overflow-y:auto; }
        .sb-nav::-webkit-scrollbar { width:0; }
        .sb-section { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#4B6587; padding:16px 10px 7px; display:block; }
        .sb-item { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:10px; color:#94A3B8; font-size:13.5px; font-weight:500; cursor:pointer; transition:all .15s; margin-bottom:2px; text-decoration:none; }
        .sb-item:hover { background:rgba(255,255,255,0.07); color:#CBD5E1; }
        .sb-item.active { background:rgba(59,130,246,0.16); color:#93C5FD; font-weight:700; border:1px solid rgba(59,130,246,0.22); }
        .sb-ico { font-size:16px; width:20px; text-align:center; flex-shrink:0; }
        .sb-badge { margin-left:auto; background:#EF4444; color:#fff; font-size:10px; font-weight:700; border-radius:99px; padding:1px 7px; }
        .sb-footer { border-top:1px solid rgba(255,255,255,0.07); }
        .sb-upgrade { margin:12px; padding:16px; border-radius:14px; background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2)); border:1px solid rgba(59,130,246,0.22); }
        .sb-up-title { font-size:13.5px; font-weight:700; color:#F1F5F9; margin-bottom:4px; }
        .sb-up-sub { font-size:12px; color:#64748B; line-height:1.55; margin-bottom:12px; }
        .sb-up-btn { width:100%; padding:9px; border-radius:99px; border:none; background:linear-gradient(135deg,#3B82F6,#6366F1); color:#fff; font-size:12.5px; font-weight:700; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
        .sb-user { padding:14px 18px; border-top:1px solid rgba(255,255,255,0.07); display:flex; align-items:center; gap:11px; }
        .sb-av { width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,#3B82F6,#6366F1); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700; flex-shrink:0; }
        .sb-uname { font-size:13px; font-weight:700; color:#E2E8F0; }
        .sb-uplan { display:inline-block; font-size:10px; font-weight:700; color:#60A5FA; background:rgba(59,130,246,0.14); border:1px solid rgba(59,130,246,0.25); border-radius:5px; padding:1px 6px; margin-top:2px; }

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger { display:none; background:none; border:none; font-size:20px; cursor:pointer; color:#475569; padding:4px; }
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
        .breadcrumb b { color:#0F172A; font-weight:700; }
        .btn-primary { padding:7px 16px; border-radius:9px; border:none; background:linear-gradient(135deg,#2563EB,#6366F1); color:#fff; font-size:13px; font-weight:700; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; box-shadow:0 2px 10px rgba(37,99,235,0.3); transition:all .18s; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
        .btn-primary:hover { transform:translateY(-1px); }
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}

        /* GREETING */
        .greeting { margin-bottom:24px; }
        .greeting h1 { font-family:'Fraunces',serif; font-size:30px; font-weight:400; color:#0F172A; letter-spacing:-0.6px; margin-bottom:3px; }
        .greeting p { font-size:14px; color:#94A3B8; }

        /* STATS GRID */
        .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;width:100%}
        .stat{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:14px 16px;box-shadow:0 1px 4px rgba(15,23,42,0.04);transition:box-shadow .2s,transform .2s;min-width:0;overflow:hidden}
        .stat:hover { box-shadow:0 6px 24px rgba(15,23,42,0.08); transform:translateY(-1px); }
        .stat-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .stat-ico { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:19px; }
        .stat-num{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A;letter-spacing:-1px;line-height:1;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .stat-lbl { font-size:13px; color:#94A3B8; font-weight:500; }
        .stat-sub { font-size:11.5px; color:#94A3B8; margin-top:3px; }
        .tag { font-size:11px; font-weight:700; border-radius:99px; padding:3px 10px; }
        .tg  { background:#DCFCE7; color:#16A34A; }
        .tr  { background:#FEE2E2; color:#DC2626; }
        .tgr { background:#F1F5F9; color:#94A3B8; }
        .ty  { background:#FEF3C7; color:#D97706; }

        /* GRID LAYOUT */
        .mgrid{display:grid;grid-template-columns:1fr;gap:16px;width:100%}
        .col-l { display:flex; flex-direction:column; gap:16px; }
        .col-r { display:flex; flex-direction:column; gap:16px; }

        /* CARD */
        .card { background:#fff; border:1px solid #E2E8F0; border-radius:18px; padding:20px; box-shadow:0 1px 4px rgba(15,23,42,0.04); }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .card-title { font-size:15px; font-weight:700; color:#0F172A; }
        .card-link { font-size:13px; color:#2563EB; font-weight:600; text-decoration:none; }
        .card-link:hover { text-decoration:underline; }

        /* PROPERTIES TABLE */
        .ptable { width:100%; border-collapse:collapse; }
        .ptable th { padding:10px 12px; text-align:left; font-size:11.5px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #F1F5F9; white-space:nowrap; }
        .ptable td { padding:12px; border-bottom:1px solid #F8FAFC; font-size:13.5px; color:#0F172A; vertical-align:middle; }
        .ptable tr:last-child td { border-bottom:none; }
        .ptable tbody tr:hover { background:#FAFBFF; }
        .p-name { font-weight:700; color:#0F172A; font-size:13.5px; }
        .p-loc { font-size:11.5px; color:#94A3B8; margin-top:2px; }
        .occ { display:flex; align-items:center; gap:8px; }
        .occ-bar { width:70px; height:5px; background:#E2E8F0; border-radius:99px; overflow:hidden; flex-shrink:0; }
        .occ-fill { height:100%; background:linear-gradient(90deg,#3B82F6,#6366F1); border-radius:99px; transition:width .4s; }
        .occ-lbl { font-size:12px; color:#64748B; white-space:nowrap; }
        .pill { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; border-radius:99px; padding:3px 10px; }
        .pg { background:#DCFCE7; color:#16A34A; }
        .pa { background:#FEF3C7; color:#D97706; }
        .pi { background:#F1F5F9; color:#64748B; }
        .pdot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
        .p-rent { font-size:13px; font-weight:700; color:#0F172A; }

        /* RENT ROWS */
        .rrow { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #F8FAFC; }
        .rrow:last-child { border-bottom:none; }
        .rav { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700; flex-shrink:0; }
        .rname { font-size:13px; font-weight:700; color:#0F172A; }
        .runit { font-size:11.5px; color:#94A3B8; margin-top:1px; }
        .rright { margin-left:auto; text-align:right; }
        .ramt { font-size:13.5px; font-weight:700; color:#0F172A; }
        .rstatus { font-size:11.5px; font-weight:600; margin-top:2px; }

        /* MAINTENANCE ROWS */
        .mrow { display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-bottom:1px solid #F8FAFC; }
        .mrow:last-child { border-bottom:none; }
        .m-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:5px; }
        .m-body { flex:1; min-width:0; }
        .m-title { font-size:13.5px; font-weight:600; color:#0F172A; line-height:1.4; margin-bottom:3px; }
        .m-sub { font-size:12px; color:#94A3B8; }
        .m-meta { text-align:right; flex-shrink:0; }
        .m-tag { font-size:11px; font-weight:700; border-radius:99px; padding:2px 8px; margin-bottom:4px; display:inline-block; }
        .m-time { font-size:11px; color:#94A3B8; }
        .mred   { background:#FEE2E2; color:#DC2626; }
        .mamber { background:#FEF3C7; color:#D97706; }
        .myell  { background:#FEF9C3; color:#CA8A04; }
        .mgreen { background:#DCFCE7; color:#16A34A; }

        /* QUICK ACTIONS */
        .qa { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .qa-item { display:flex; align-items:center; gap:10px; padding:12px; border-radius:12px; border:1.5px solid #F1F5F9; background:#FAFBFF; text-decoration:none; transition:all .15s; cursor:pointer; }
        .qa-item:hover { border-color:#BFDBFE; background:#EFF6FF; transform:translateY(-1px); }
        .qa-ico { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }
        .qa-lbl { font-size:13px; font-weight:600; color:#0F172A; }

        /* UPGRADE CARD */
        .up-card { border-radius:18px; background:linear-gradient(135deg,#1E3A5F,#1E3A8A); overflow:hidden; }
        .up-inner { padding:22px; }
        .up-title { font-size:15px; font-weight:700; color:#F1F5F9; margin-bottom:6px; }
        .up-sub { font-size:12.5px; color:#93C5FD; line-height:1.6; margin-bottom:16px; }
        .up-btn { width:100%; padding:10px; border-radius:10px; border:none; background:linear-gradient(135deg,#3B82F6,#6366F1); color:#fff; font-size:13px; font-weight:700; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; box-shadow:0 2px 10px rgba(59,130,246,0.4); }

        /* SKELETON */
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton { border-radius:8px; background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; }

        /* EMPTY */
        .empty { text-align:center; padding:24px; font-size:13px; color:#94A3B8; }
        .empty a { color:#2563EB; font-weight:600; text-decoration:none; }

        /* LEASE EXPIRY */
        .lease-row{display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid #F8FAFC}
        .lease-row:last-child{border-bottom:none}
        .lr-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0}
        .lr-name{font-size:13px;font-weight:700;color:#0F172A}
        .lr-sub{font-size:11.5px;color:#94A3B8;margin-top:1px}
        .lr-days{margin-left:auto;text-align:right;flex-shrink:0}
        .lr-days-num{font-size:13px;font-weight:700}
        .lr-days-lbl{font-size:10.5px;color:#94A3B8;margin-top:1px}

        /* BLURRED ANALYTICS */
        .analytics-wrap{position:relative;border-radius:12px;overflow:hidden}
        .analytics-blur{filter:blur(4px);pointer-events:none;user-select:none}
        .analytics-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,0.5);backdrop-filter:blur(2px)}
        .ao-badge{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11.5px;font-weight:700;padding:4px 12px;border-radius:99px}
        .ao-title{font-size:14px;font-weight:700;color:#0F172A}
        .ao-sub{font-size:12px;color:#64748B;text-align:center;max-width:200px;line-height:1.4}
        .ao-btn{padding:8px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-top:4px}
        .chart-bar-wrap{display:flex;align-items:flex-end;gap:6px;height:80px;padding:8px 0}
        .chart-bar{flex:1;border-radius:4px 4px 0 0;min-width:0}
        .chart-labels{display:flex;gap:6px;margin-top:6px}
        .chart-label{flex:1;text-align:center;font-size:10px;color:#94A3B8}

        /* RESPONSIVE */
        @media(min-width:1100px){
          .stats{grid-template-columns:repeat(4,1fr)}
          .mgrid{grid-template-columns:1fr 340px}
        }
        @media(min-width:769px) and (max-width:1099px){
          .stats{grid-template-columns:repeat(2,1fr)}
          .mgrid{grid-template-columns:1fr}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .main{margin-left:0!important;width:100!important}
          .hamburger{display:block}
          .topbar{padding:0 14px}
          .content{padding:14px 14px}
          .stats{grid-template-columns:repeat(2,1fr)}
          .mgrid{grid-template-columns:1fr}
          .greeting h1{font-size:22px}
          .ptable th:nth-child(3),.ptable td:nth-child(3),
          .ptable th:nth-child(4),.ptable td:nth-child(4){display:none}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
          .stat{padding:12px 12px}
          .stat-num{font-size:22px}
          .stat-lbl{font-size:11.5px}
          .stats{gap:8px}
          .greeting h1{font-size:20px}
          .greeting p{font-size:12px}
          .card{padding:16px}
          .mgrid{gap:12px}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        {/* SIDEBAR */}
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
            {/* <div className="sb-logo-icon">
              <img src="/icon.png" alt="Rentura Logo" style={{ width: '24px', height: '24px' }} />
            </div> */}
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item active"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a>
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance
              {stats.openMaintenance > 0 && <span className="sb-badge">{stats.openMaintenance}</span>}
            </a>
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
              <div className="sb-av">{initials}</div>
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Dashboard</b></div>
            </div>
            <a href="/landlord/properties" className="btn-primary">+ Add Property</a>
          </div>

          <div className="content">
            {/* Greeting */}
            <div className="greeting">
              <h1>{getGreeting()}, {firstName} 👋</h1>
              <p>Here's what's happening across your properties today.</p>
            </div>

            {/* Stats */}
            <div className="stats">
              <div className="stat">
                <div className="stat-top">
                  <div className="stat-ico" style={{background:'#EFF6FF'}}>🏘️</div>
                  <span className="tag tg">{stats.totalProperties} props</span>
                </div>
                {loading ? <div className="skeleton" style={{height:32,width:60,marginBottom:8}} /> : (
                  <div className="stat-num">${stats.monthlyRevenue.toLocaleString()}</div>
                )}
                <div className="stat-lbl">Monthly Revenue</div>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                  <span className="stat-sub">{stats.occupiedUnits} occupied units</span>
                  {revTrend && <span style={{fontSize:11.5,fontWeight:700,color:revTrend.up?'#16A34A':'#DC2626'}}>{revTrend.up?'↑':'↓'}{Math.abs(revTrend.pct)}% vs last month</span>}
                </div>
              </div>

              <div className="stat">
                <div className="stat-top">
                  <div className="stat-ico" style={{background:'#DCFCE7'}}>📊</div>
                  <span className={`tag ${occupancyRate >= 80 ? 'tg' : occupancyRate >= 50 ? 'ty' : 'tr'}`}>{occupancyRate}%</span>
                </div>
                {loading ? <div className="skeleton" style={{height:32,width:60,marginBottom:8}} /> : (
                  <div className="stat-num">{stats.occupiedUnits}<span style={{fontSize:18,color:'#94A3B8'}}>/{stats.totalUnits}</span></div>
                )}
                <div className="stat-lbl">Occupancy</div>
                <div className="stat-sub">{stats.totalUnits - stats.occupiedUnits} vacant units</div>
              </div>

              <div className="stat">
                <div className="stat-top">
                  <div className="stat-ico" style={{background:'#FEF3C7'}}>👥</div>
                  <span className="tag tg">Active</span>
                </div>
                {loading ? <div className="skeleton" style={{height:32,width:60,marginBottom:8}} /> : (
                  <div className="stat-num">{stats.totalTenants}</div>
                )}
                <div className="stat-lbl">Total Tenants</div>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                  <span className="stat-sub">{stats.paidThisMonth} paid this month</span>
                  {tenantTrend && tenantTrend.pct !== 0 && <span style={{fontSize:11.5,fontWeight:700,color:tenantTrend.up?'#16A34A':'#DC2626'}}>{tenantTrend.up?'↑':'↓'}{Math.abs(tenantTrend.pct)}%</span>}
                </div>
              </div>

              <div className="stat">
                <div className="stat-top">
                  <div className="stat-ico" style={{background:'#FEE2E2'}}>🔧</div>
                  <span className={`tag ${stats.openMaintenance > 0 ? 'tr' : 'tg'}`}>
                    {stats.openMaintenance > 0 ? `${stats.openMaintenance} open` : 'All clear'}
                  </span>
                </div>
                {loading ? <div className="skeleton" style={{height:32,width:60,marginBottom:8}} /> : (
                  <div className="stat-num">{stats.openMaintenance}</div>
                )}
                <div className="stat-lbl">Maintenance</div>
                <div className="stat-sub">{stats.overdueCount > 0 ? `${stats.overdueCount} overdue payments` : 'No overdue payments'}</div>
              </div>
            </div>

            {/* Main grid */}
            <div className="mgrid">
              <div className="col-l">

                {/* Properties table */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Properties</span>
                    <a href="/landlord/properties" className="card-link">View all →</a>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table className="ptable">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Units</th>
                          <th>Occupancy</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          [1,2].map(i => (
                            <tr key={i}>
                              <td><div className="skeleton" style={{height:13,width:120,marginBottom:4}} /><div className="skeleton" style={{height:10,width:80}} /></td>
                              <td><div className="skeleton" style={{height:13,width:30}} /></td>
                              <td><div className="skeleton" style={{height:8,width:100}} /></td>
                              <td><div className="skeleton" style={{height:20,width:60,borderRadius:99}} /></td>
                            </tr>
                          ))
                        ) : properties.length === 0 ? (
                          <tr><td colSpan={4}>
                            <div className="empty">No properties yet. <a href="/landlord/properties">Add your first →</a></div>
                          </td></tr>
                        ) : properties.map(p => {
                          const pct = p.total_units > 0 ? Math.round((p.occupied / p.total_units) * 100) : 0
                          const pillClass = p.status === 'active' ? 'pg' : p.status === 'listed' ? 'pa' : 'pi'
                          const statusLabel = p.status === 'active' ? 'Active' : p.status === 'listed' ? 'Listed' : 'Inactive'
                          return (
                            <tr key={p.id}>
                              <td>
                                <div className="p-name">{p.name}</div>
                                <div className="p-loc">{p.city}, {p.country}</div>
                              </td>
                              <td><span style={{fontWeight:700}}>{p.total_units}</span></td>
                              <td>
                                <div className="occ">
                                  <div className="occ-bar">
                                    <div className="occ-fill" style={{width:`${pct}%`}} />
                                  </div>
                                  <span className="occ-lbl">{p.occupied}/{p.total_units}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`pill ${pillClass}`}>
                                  <span className="pdot" />{statusLabel}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Maintenance */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Open Maintenance Requests</span>
                    <a href="/landlord/maintenance" className="card-link">View all →</a>
                  </div>
                  {loading ? (
                    [1,2].map(i => (
                      <div key={i} className="mrow">
                        <div className="skeleton" style={{width:8,height:8,borderRadius:'50%',marginTop:5,flexShrink:0}} />
                        <div style={{flex:1}}><div className="skeleton" style={{height:13,width:'70%',marginBottom:6}} /><div className="skeleton" style={{height:10,width:'50%'}} /></div>
                        <div className="skeleton" style={{height:20,width:50,borderRadius:99}} />
                      </div>
                    ))
                  ) : maintRows.length === 0 ? (
                    <div className="empty">🎉 No open maintenance requests!</div>
                  ) : maintRows.map(m => {
                    const pc = PRIORITY_CFG[m.priority] || PRIORITY_CFG.medium
                    const tagClass = m.priority === 'urgent' ? 'mred' : m.priority === 'high' ? 'mamber' : m.priority === 'medium' ? 'myell' : 'mgreen'
                    return (
                      <div key={m.id} className="mrow">
                        <div className="m-dot" style={{background:pc.color}} />
                        <div className="m-body">
                          <div className="m-title">{m.title}</div>
                          <div className="m-sub">{m.property_name} · {m.unit_number}</div>
                        </div>
                        <div className="m-meta">
                          <div className={`m-tag ${tagClass}`}>● {m.priority.charAt(0).toUpperCase() + m.priority.slice(1)}</div>
                          <div className="m-time">{timeAgo(m.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Lease Expirations */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">⏳ Lease Expirations</span>
                    <a href="/landlord/tenants" className="card-link">View tenants →</a>
                  </div>
                  {loading ? (
                    [1,2].map(i => (
                      <div key={i} className="lease-row">
                        <div className="skeleton" style={{width:34,height:34,borderRadius:9,flexShrink:0}} />
                        <div style={{flex:1}}><div className="skeleton" style={{height:12,width:'60%',marginBottom:5}} /><div className="skeleton" style={{height:10,width:'40%'}} /></div>
                        <div className="skeleton" style={{height:12,width:40}} />
                      </div>
                    ))
                  ) : leaseRows.length === 0 ? (
                    <div className="empty">🎉 No leases expiring in the next 60 days!</div>
                  ) : leaseRows.map((l, i) => {
                    const urgent = l.days_left <= 30
                    return (
                      <div key={i} className="lease-row">
                        <div className="lr-av" style={{background: l.color}}>{l.initials}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="lr-name">{l.tenant_name}</div>
                          <div className="lr-sub">{l.property} · {l.unit}</div>
                        </div>
                        <div className="lr-days">
                          <div className="lr-days-num" style={{color: urgent ? '#DC2626' : '#D97706'}}>{l.days_left}d</div>
                          <div className="lr-days-lbl">{l.lease_end}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>

              <div className="col-r">

                {/* Rent Status */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Rent — {currentMonth}</span>
                    <a href="/landlord/rent" className="card-link">Tracker →</a>
                  </div>
                  {loading ? (
                    [1,2,3].map(i => (
                      <div key={i} className="rrow">
                        <div className="skeleton" style={{width:36,height:36,borderRadius:10,flexShrink:0}} />
                        <div style={{flex:1}}><div className="skeleton" style={{height:13,width:'70%',marginBottom:6}} /><div className="skeleton" style={{height:10,width:'50%'}} /></div>
                        <div><div className="skeleton" style={{height:13,width:40,marginBottom:4}} /><div className="skeleton" style={{height:10,width:30}} /></div>
                      </div>
                    ))
                  ) : rentRows.length === 0 ? (
                    <div className="empty">No rent payments this month yet.<br/><a href="/landlord/rent">Go to Rent Tracker →</a></div>
                  ) : rentRows.map((r, i) => {
                    const rs = RENT_STATUS[r.status] || { label: r.status, color: '#94A3B8' }
                    return (
                      <div key={i} className="rrow">
                        <div className="rav" style={{background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}}>
                          {r.initials}
                        </div>
                        <div>
                          <div className="rname">{r.tenant_name}</div>
                          <div className="runit">{r.property_name} · {r.unit_number}</div>
                        </div>
                        <div className="rright">
                          <div className="ramt">${r.amount.toLocaleString()}</div>
                          <div className="rstatus" style={{color: rs.color}}>● {rs.label}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Blurred Analytics — Pro Teaser */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:18,padding:20,boxShadow:'0 1px 4px rgba(15,23,42,0.04)',position:'relative',overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#0F172A'}}>Year-over-Year Growth</span>
                    <span style={{fontSize:10.5,fontWeight:800,background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',padding:'2px 8px',borderRadius:99}}>PRO</span>
                  </div>
                  {/* Blurred chart underneath */}
                  <div style={{filter:'blur(5px)',pointerEvents:'none',userSelect:'none',opacity:0.6}}>
                    <div style={{display:'flex',alignItems:'flex-end',gap:5,height:90,marginBottom:6}}>
                      {[35,50,42,58,54,68,62,78,72,85,79,92].map((h,i) => (
                        <div key={i} style={{flex:1,height:`${h}%`,borderRadius:'4px 4px 0 0',background: i>=9 ? 'linear-gradient(180deg,#3B82F6,#6366F1)' : '#CBD5E1'}} />
                      ))}
                    </div>
                    <div style={{display:'flex',gap:5}}>
                      {['J','F','M','A','M','J','J','A','S','O','N','D'].map((m,i) => (
                        <span key={i} style={{flex:1,textAlign:'center',fontSize:9,color:'#94A3B8'}}>{m}</span>
                      ))}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:10,padding:'8px 10px',background:'#F8FAFC',borderRadius:8}}>
                      <span style={{fontSize:11.5,color:'#64748B',fontWeight:500}}>Revenue growth</span>
                      <span style={{fontSize:11.5,color:'#16A34A',fontWeight:700}}>↑ +24% YoY</span>
                    </div>
                  </div>
                  {/* Overlay */}
                  <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,background:'rgba(255,255,255,0.82)',backdropFilter:'blur(3px)'}}>
                    <div style={{fontSize:22}}>📊</div>
                    <span style={{fontSize:11,fontWeight:800,background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',padding:'3px 12px',borderRadius:99,letterSpacing:0.5}}>⭐ PRO FEATURE</span>
                    <div style={{fontSize:14,fontWeight:700,color:'#0F172A',marginTop:2}}>Advanced Analytics</div>
                    <div style={{fontSize:12,color:'#64748B',textAlign:'center',maxWidth:190,lineHeight:1.5}}>Year-over-year trends, forecasts & portfolio insights</div>
                    <button style={{marginTop:6,padding:'9px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:'0 2px 10px rgba(37,99,235,0.3)'}}>Unlock with Pro →</button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Quick Actions</span>
                  </div>
                  <div className="qa">
                    <a href="/landlord/tenants"    className="qa-item"><div className="qa-ico" style={{background:'#EEF2FF'}}>👥</div><span className="qa-lbl">Invite Tenant</span></a>
                    <a href="/landlord/rent"       className="qa-item"><div className="qa-ico" style={{background:'#EFF6FF'}}>💰</div><span className="qa-lbl">Rent Tracker</span></a>
                    <a href="/landlord/documents"  className="qa-item"><div className="qa-ico" style={{background:'#FFFBEB'}}>📁</div><span className="qa-lbl">Upload Doc</span></a>
                    <a href="/landlord/listings"   className="qa-item"><div className="qa-ico" style={{background:'#F0FDF4'}}>📋</div><span className="qa-lbl">Post Listing</span></a>
                    <a href="/landlord/maintenance" className="qa-item"><div className="qa-ico" style={{background:'#FFF1F2'}}>🔧</div><span className="qa-lbl">Maintenance</span></a>
                    <a href="/landlord/properties" className="qa-item"><div className="qa-ico" style={{background:'#F5F3FF'}}>🏘️</div><span className="qa-lbl">Properties</span></a>
                  </div>
                </div>

                {/* Upgrade */}
                <div className="up-card">
                  <div className="up-inner">
                    <div className="up-title">⭐ Upgrade to Pro</div>
                    <div className="up-sub">Unlock unlimited properties, advanced analytics & priority support.</div>
                    <button className="up-btn">See Plans →</button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}