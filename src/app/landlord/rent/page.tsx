'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

type RentRecord = {
  id: string
  tenant: string
  initials: string
  property: string
  unit: string
  unit_id: string
  tenant_id: string
  amount: number
  due_date: string
  paid_date?: string
  status: 'paid' | 'overdue' | 'pending'
  color: string
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const NOW = new Date()

const STATUS_CFG = {
  paid:    { label: 'Paid',    bg: '#DCFCE7', color: '#16A34A' },
  overdue: { label: 'Overdue', bg: '#FEE2E2', color: '#DC2626' },
  pending: { label: 'Pending', bg: '#FEF3C7', color: '#D97706' },
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

function exportCSV(filename: string, headers: string[], rows: (string|number)[][]) {
  const esc = (v: string|number) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${filename}-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function RentTrackerPage() {
  const router = useRouter()
const { isPro, plan } = usePro()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName]         = useState('User')
  const [userId, setUserId]             = useState('')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [records, setRecords]           = useState<RentRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [generating, setGenerating]     = useState(false)
  const [updating, setUpdating]         = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[NOW.getMonth()])
  const [selectedYear] = useState(NOW.getFullYear())
  const [filter, setFilter]             = useState<'all'|'paid'|'overdue'|'pending'>('all')
  const [toast, setToast]               = useState<{msg:string;type:'success'|'error'}|null>(null)
  // const [isPro, setIsPro]               = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  function showToast(msg: string, type: 'success'|'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function monthRange(month: string, year: number) {
    const mi = MONTHS.indexOf(month)
    const lastDay = new Date(year, mi+1, 0).getDate()
    return {
      from: `${year}-${String(mi+1).padStart(2,'0')}-01`,
      to:   `${year}-${String(mi+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    }
  }

  async function loadRecords(uid: string, month: string, year: number) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { from, to } = monthRange(month, year)
      const { data: props } = await supabase.from('properties').select('id,name').eq('landlord_id', uid)
      const propIds = (props||[]).map((p:any)=>p.id)
      if (!propIds.length) { setRecords([]); return }

      const { data: unitsArr } = await supabase.from('units').select('id,unit_number,property_id').in('property_id', propIds)
      const unitIds = (unitsArr||[]).map((u:any)=>u.id)
      if (!unitIds.length) { setRecords([]); return }

      const { data: payments, error } = await supabase
        .from('rent_payments')
        .select('id,amount,due_date,paid_date,status,unit_id,tenant_id')
        .in('unit_id', unitIds).gte('due_date', from).lte('due_date', to)
        .order('due_date', { ascending: true })
      if (error) throw error

      const tenantIds = [...new Set((payments||[]).map((p:any)=>p.tenant_id).filter(Boolean))]
      const profileMap: Record<string,string> = {}
      if (tenantIds.length) {
        const { data: tArr } = await supabase.from('tenants').select('id,profile_id').in('id', tenantIds)
        const profileIds = [...new Set((tArr||[]).map((t:any)=>t.profile_id).filter(Boolean))]
        if (profileIds.length) {
          const { data: pArr } = await supabase.from('profiles').select('id,full_name').in('id', profileIds)
          const pidMap: Record<string,string> = {}
          ;(pArr||[]).forEach((p:any) => { pidMap[p.id] = p.full_name })
          ;(tArr||[]).forEach((t:any) => { profileMap[t.id] = pidMap[t.profile_id]||'Unknown' })
        }
      }

      const unitMap: Record<string,any> = {}
      ;(unitsArr||[]).forEach((u:any) => { unitMap[u.id] = u })
      const propMap: Record<string,string> = {}
      ;(props||[]).forEach((p:any) => { propMap[p.id] = p.name })

      const shaped: RentRecord[] = (payments||[]).map((row:any, i:number) => {
        const tName = profileMap[row.tenant_id]||'Unknown'
        const unit  = unitMap[row.unit_id]||{}
        return {
          id: row.id, tenant: tName,
          initials: tName.split(' ').map((n:string)=>n[0]).join('').toUpperCase().slice(0,2),
          property: propMap[unit.property_id]||'—', unit: unit.unit_number||'—',
          unit_id: row.unit_id, tenant_id: row.tenant_id,
          amount: row.amount||0, due_date: row.due_date||'',
          paid_date: row.paid_date||undefined,
          status: row.status||'pending',
          color: AVATAR_COLORS[i%AVATAR_COLORS.length],
        }
      })
      setRecords(shaped)
    } catch (err:any) {
      showToast('Failed to load records', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name||'User'
      setFullName(name); setUserId(user.id)
      setUserInitials(name.split(' ').map((n:string)=>n[0]).join('').toUpperCase().slice(0,2))

      // Check pro status
      const { data: sub } = await supabase.from('subscriptions').select('plan,status')
        .eq('profile_id', user.id).eq('status','active').single()
      // if (sub && (sub.plan==='pro'||sub.plan==='business')) setIsPro(true)

      await loadRecords(user.id, MONTHS[NOW.getMonth()], NOW.getFullYear())
    }
    init()
  }, [router])

  useEffect(() => {
    if (userId) loadRecords(userId, selectedMonth, selectedYear)
  }, [selectedMonth])

  async function generatePayments() {
    setGenerating(true)
    try {
      const supabase = createClient()
      const mi = MONTHS.indexOf(selectedMonth)
      const { data: props } = await supabase.from('properties').select('id').eq('landlord_id', userId)
      const propIds = (props||[]).map((p:any)=>p.id)
      if (!propIds.length) { showToast('No properties found.','error'); return }

      const { data: occupiedUnits } = await supabase
        .from('units').select('id,monthly_rent,rent_due_day,currency')
        .in('property_id', propIds).eq('status','occupied')
      if (!occupiedUnits?.length) { showToast('No occupied units found.','error'); return }

      const occupiedUnitIds = occupiedUnits.map((u:any)=>u.id)
      const { data: tenantRows } = await supabase.from('tenants').select('id,unit_id').in('unit_id', occupiedUnitIds)
      if (!tenantRows?.length) { showToast('No tenants found.','error'); return }

      const unitTenantMap: Record<string,string> = {}
      ;(tenantRows||[]).forEach((t:any) => { unitTenantMap[t.unit_id] = t.id })

      const { from, to } = monthRange(selectedMonth, selectedYear)
      const { data: existing } = await supabase.from('rent_payments').select('unit_id')
        .in('unit_id', occupiedUnitIds).gte('due_date',from).lte('due_date',to)
      const existingUnitIds = new Set((existing||[]).map((e:any)=>e.unit_id))

      const unitRentMap: Record<string,any> = {}
      ;(occupiedUnits||[]).forEach((u:any) => { unitRentMap[u.id] = u })

      const toInsert = occupiedUnitIds
        .filter(uid => !existingUnitIds.has(uid) && unitTenantMap[uid])
        .map(uid => ({
          unit_id: uid, tenant_id: unitTenantMap[uid],
          amount: unitRentMap[uid]?.monthly_rent||0,
          due_date: `${selectedYear}-${String(mi+1).padStart(2,'0')}-${String(unitRentMap[uid]?.rent_due_day||1).padStart(2,'0')}`,
          status: 'pending',
        }))

      if (!toInsert.length) {
        showToast(`Payments for ${selectedMonth} ${selectedYear} already exist!`, 'success')
        await loadRecords(userId, selectedMonth, selectedYear); return
      }
      const { error } = await supabase.from('rent_payments').insert(toInsert)
      if (error) throw error
      await loadRecords(userId, selectedMonth, selectedYear)
      showToast(`✅ Generated ${toInsert.length} payment record${toInsert.length>1?'s':''} for ${selectedMonth}!`, 'success')
    } catch (err:any) {
      showToast('Error: '+(err?.message||'Unknown'), 'error')
    } finally { setGenerating(false) }
  }

  async function markPaid(id: string) {
    setUpdating(id)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('rent_payments')
        .update({ status:'paid', paid_date:today }).eq('id',id).select()
      if (error) { showToast('Failed: '+error.message,'error'); return }
      setRecords(prev => prev.map(r => r.id===id ? {...r,status:'paid' as const,paid_date:today}:r))
      showToast('Payment marked as paid ✓','success')
    } catch (err:any) { showToast('Error: '+err?.message,'error') }
    finally { setUpdating(null) }
  }

  function handleExportCSV() {
    if (!isPro) { setShowUpgradeModal(true); return }
    exportCSV(
      `rent-tracker-${selectedMonth}-${selectedYear}`,
      ['Tenant','Property','Unit','Amount ($)','Due Date','Paid Date','Status'],
      records.map(r => [
        r.tenant, r.property, r.unit, r.amount,
        r.due_date, r.paid_date||'—', derivedStatus(r)
      ])
    )
    showToast('CSV exported!','success')
  }

  const today = new Date().toISOString().split('T')[0]
  function derivedStatus(r: RentRecord): 'paid'|'overdue'|'pending' {
    if (r.status==='paid') return 'paid'
    if (r.due_date && r.due_date<today) return 'overdue'
    return 'pending'
  }

  const filtered = records.filter(r => filter==='all'||derivedStatus(r)===filter)
  const totalCollected = records.filter(r=>r.status==='paid').reduce((s,r)=>s+r.amount,0)
  const totalOverdue   = records.filter(r=>derivedStatus(r)==='overdue').reduce((s,r)=>s+r.amount,0)
  const totalPending   = records.filter(r=>derivedStatus(r)==='pending').reduce((s,r)=>s+r.amount,0)
  const totalExpected  = records.reduce((s,r)=>s+r.amount,0)
  const collectionRate = totalExpected>0 ? Math.round((totalCollected/totalExpected)*100):0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:hidden;width:100%}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,0.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,0.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,0.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,0.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.25);border-radius:5px;padding:1px 6px;margin-top:2px}
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .tb-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,0.28);transition:all .18s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
        .btn-primary:hover:not(:disabled){transform:translateY(-1px)}
        .btn-primary:disabled{opacity:0.6;cursor:not-allowed}
        .btn-export{padding:8px 14px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0;transition:all .15s}
        .btn-export:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .btn-export-locked{padding:8px 14px;border-radius:10px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}
        .page-title{font-family:'Fraunces',serif;font-size:28px;font-weight:400;color:#0F172A;letter-spacing:-0.5px;margin-bottom:4px}
        .page-sub{font-size:13.5px;color:#94A3B8;margin-bottom:24px}
        .summary{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sum-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 14px;box-shadow:0 1px 4px rgba(15,23,42,0.04);min-width:0;overflow:hidden}
        .sum-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .sum-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px}
        .sum-tag{font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px}
        .sum-val{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sum-lbl{font-size:12px;color:#94A3B8;font-weight:500}
        .coll-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:18px 20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .coll-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .coll-title{font-size:14px;font-weight:700;color:#0F172A}
        .coll-pct{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#2563EB}
        .coll-bar{height:8px;background:#F1F5F9;border-radius:99px;overflow:hidden;margin-bottom:10px}
        .coll-fill{height:100%;background:linear-gradient(90deg,#2563EB,#6366F1);border-radius:99px;transition:width .5s ease}
        .coll-legend{display:flex;gap:18px;flex-wrap:wrap}
        .cl-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748B;font-weight:500}
        .cl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .month-bar{display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;scrollbar-width:none;-webkit-overflow-scrolling:touch;width:100%}
        .month-bar::-webkit-scrollbar{display:none}
        .m-btn{padding:7px 14px;border-radius:99px;font-size:12.5px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#fff;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap;flex-shrink:0}
        .m-btn:hover{border-color:#3B82F6;color:#2563EB}
        .m-btn.active{background:#2563EB;color:#fff;border-color:#2563EB}
        .toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;width:100%;flex-wrap:wrap}
        .filter-row{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;white-space:nowrap;flex-shrink:0}
        .ftab{padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0}
        .ftab:hover{background:#F1F5F9;color:#0F172A}
        .ftab.active{background:#2563EB;color:#fff}
        .fc{font-size:10px;font-weight:700;background:rgba(255,255,255,0.2);border-radius:99px;padding:1px 5px}
        .ftab:not(.active) .fc{background:#F1F5F9;color:#64748B}
        .rent-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;box-shadow:0 1px 4px rgba(15,23,42,0.04);overflow:hidden}
        .rent-mobile-cards{display:none;flex-direction:column;gap:0}
        .rmc{padding:14px 16px;border-bottom:1px solid #F8FAFC;display:flex;align-items:center;gap:12px}
        .rmc:last-child{border-bottom:none}
        .rmc-info{flex:1;min-width:0}
        .rmc-name{font-size:13.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rmc-sub{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .rmc-right{text-align:right;flex-shrink:0}
        .rmc-amt{font-size:14px;font-weight:700;color:#0F172A}
        .rmc-actions{display:flex;gap:5px;margin-top:5px;justify-content:flex-end}
        .rent-head{padding:16px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between}
        .rent-title{font-size:14px;font-weight:700;color:#0F172A}
        .rtable{width:100%;border-collapse:collapse}
        .rtable th{padding:10px 16px;text-align:left;font-size:11.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #F1F5F9;white-space:nowrap;background:#FAFBFF}
        .rtable td{padding:13px 16px;border-bottom:1px solid #F8FAFC;font-size:13.5px;color:#0F172A;vertical-align:middle}
        .rtable tr:last-child td{border-bottom:none}
        .rtable tbody tr:hover{background:#FAFBFF}
        .t-av{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .t-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .t-prop{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .amt{font-size:14px;font-weight:700;color:#0F172A}
        .date-txt{font-size:13px;color:#475569}
        .badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;border-radius:99px;padding:4px 10px;white-space:nowrap}
        .act-btn{padding:6px 13px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .act-btn:hover:not(:disabled){border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .act-btn:disabled{opacity:0.5;cursor:not-allowed}
        .act-btn-green{border-color:#BBF7D0;background:#F0FDF4;color:#16A34A}
        .act-btn-green:hover:not(:disabled){background:#DCFCE7!important;border-color:#86EFAC!important;color:#15803D!important}
        .empty-state{text-align:center;padding:60px 20px}
        .e-ico{font-size:44px;margin-bottom:12px}
        .e-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
        .e-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;font-size:13.5px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.2);white-space:nowrap;animation:slideUp .25s ease}
        .toast.success{background:linear-gradient(135deg,#16A34A,#15803D)}
        .toast.error{background:linear-gradient(135deg,#DC2626,#B91C1C)}
        @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .info-banner{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#1D4ED8;display:flex;align-items:center;gap:8px}
        .umodal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px}
        .umodal{background:#fff;border-radius:22px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(15,23,42,0.2)}
        .umodal-icon{font-size:40px;margin-bottom:14px}
        .umodal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .umodal-sub{font-size:14px;color:#64748B;line-height:1.6;margin-bottom:20px}
        .umodal-btn-pro{width:100%;padding:13px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:10px}
        .umodal-btn-cancel{background:none;border:none;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        @media(min-width:1100px){.summary{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px}.summary{grid-template-columns:repeat(2,1fr)}
          .rtable{display:none}.rent-mobile-cards{display:flex}.btn-export{display:none}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}.content{padding:12px 12px}.sum-val{font-size:18px}
          .sum-card{padding:12px 10px}.summary{gap:8px}.page-title{font-size:22px}
        }
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {showUpgradeModal && (
        <div className="umodal-overlay" onClick={()=>setShowUpgradeModal(false)}>
          <div className="umodal" onClick={e=>e.stopPropagation()}>
            <div className="umodal-icon">📥</div>
            <div className="umodal-title">Pro Feature</div>
            <div className="umodal-sub">CSV export is available on the Pro plan. Upgrade to export your rent records.</div>
            <button className="umodal-btn-pro" onClick={()=>{setShowUpgradeModal(false);window.location.href='/landlord/upgrade'}}>⭐ Upgrade to Pro →</button>
            <button className="umodal-btn-cancel" onClick={()=>setShowUpgradeModal(false)}>Maybe later</button>
          </div>
        </div>
      )}

      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={()=>setSidebarOpen(false)}/>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={24} height={24}/>
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item active"><span className="sb-ico">💰</span>Rent Tracker</a>
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
              <div className="sb-up-sub">Unlimited properties, CSV exports & priority support.</div>
              <button className="sb-up-btn" onClick={()=>window.location.href='/landlord/upgrade'}>See Plans →</button>
            </div>
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-uplan">{isPro?'PRO':'FREE'}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Rent Tracker</b></div>
            </div>
            <div className="tb-right">
              {isPro
                ? <button className="btn-export" onClick={handleExportCSV}>📥 Export CSV</button>
                : <button className="btn-export-locked" onClick={()=>setShowUpgradeModal(true)}>🔒 Export CSV</button>
              }
              <button className="btn-primary" disabled={generating} onClick={generatePayments}>
                {generating?'⏳ Generating…':`⚡ Generate ${selectedMonth} Payments`}
              </button>
            </div>
          </div>

          <div className="content">
            <div className="page-title">Rent Tracker</div>
            <div className="page-sub">{selectedMonth} {selectedYear} — {records.length} payment{records.length!==1?'s':''}</div>

            {records.length>0&&(
              <div className="info-banner">
                💡 Payments auto-generated when lease dates are set. Use <strong>Generate {selectedMonth} Payments</strong> to add missing records.
              </div>
            )}

            <div className="summary">
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{background:'#F0FDF4'}}>💰</div><span className="sum-tag" style={{background:'#DCFCE7',color:'#16A34A'}}>{collectionRate}%</span></div>
                <div className="sum-val">${totalCollected.toLocaleString()}</div>
                <div className="sum-lbl">Collected</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{background:'#FEE2E2'}}>⚠️</div><span className="sum-tag" style={{background:'#FEE2E2',color:'#DC2626'}}>{records.filter(r=>derivedStatus(r)==='overdue').length} overdue</span></div>
                <div className="sum-val">${totalOverdue.toLocaleString()}</div>
                <div className="sum-lbl">Overdue</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{background:'#FEF3C7'}}>⏳</div><span className="sum-tag" style={{background:'#FEF3C7',color:'#D97706'}}>{records.filter(r=>derivedStatus(r)==='pending').length} pending</span></div>
                <div className="sum-val">${totalPending.toLocaleString()}</div>
                <div className="sum-lbl">Pending</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{background:'#EFF6FF'}}>📊</div><span className="sum-tag" style={{background:'#EFF6FF',color:'#2563EB'}}>{records.length} total</span></div>
                <div className="sum-val">${totalExpected.toLocaleString()}</div>
                <div className="sum-lbl">Expected</div>
              </div>
            </div>

            <div className="coll-card">
              <div className="coll-head">
                <span className="coll-title">Collection Rate — {selectedMonth} {selectedYear}</span>
                <span className="coll-pct">{collectionRate}%</span>
              </div>
              <div className="coll-bar"><div className="coll-fill" style={{width:`${collectionRate}%`}}/></div>
              <div className="coll-legend">
                <span className="cl-item"><span className="cl-dot" style={{background:'#2563EB'}}/>Collected ${totalCollected.toLocaleString()}</span>
                <span className="cl-item"><span className="cl-dot" style={{background:'#DC2626'}}/>Overdue ${totalOverdue.toLocaleString()}</span>
                <span className="cl-item"><span className="cl-dot" style={{background:'#D97706'}}/>Pending ${totalPending.toLocaleString()}</span>
              </div>
            </div>

            <div className="month-bar">
              {MONTHS.map(m=>(
                <button key={m} className={`m-btn${selectedMonth===m?' active':''}`} onClick={()=>setSelectedMonth(m)}>{m}</button>
              ))}
            </div>

            <div className="toolbar">
              <div className="filter-row">
                {(['all','paid','overdue','pending'] as const).map(f=>(
                  <button key={f} className={`ftab${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
                    {f.charAt(0).toUpperCase()+f.slice(1)}
                    <span className="fc">{f==='all'?records.length:records.filter(r=>derivedStatus(r)===f).length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rent-card">
              <div className="rent-head">
                <div className="rent-title">Payment Records — {selectedMonth} {selectedYear}</div>
                <div style={{fontSize:12,color:'#94A3B8'}}>{filtered.length} record{filtered.length!==1?'s':''}</div>
              </div>

              {loading?(
                <table className="rtable">
                  <thead><tr><th>Tenant</th><th>Amount</th><th>Due Date</th><th>Paid Date</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{[1,2,3].map(i=>(
                    <tr key={i}>
                      <td><div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div className="skeleton" style={{width:36,height:36,borderRadius:10,flexShrink:0}}/>
                        <div><div className="skeleton" style={{height:12,width:120,marginBottom:5}}/><div className="skeleton" style={{height:10,width:80}}/></div>
                      </div></td>
                      <td><div className="skeleton" style={{height:12,width:50}}/></td>
                      <td><div className="skeleton" style={{height:12,width:70}}/></td>
                      <td><div className="skeleton" style={{height:12,width:70}}/></td>
                      <td><div className="skeleton" style={{height:22,width:65,borderRadius:99}}/></td>
                      <td><div className="skeleton" style={{height:30,width:90,borderRadius:8}}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              ):filtered.length===0?(
                <div className="empty-state">
                  <div className="e-ico">💰</div>
                  <div className="e-title">No payments for {selectedMonth} {selectedYear}</div>
                  <div className="e-sub">{records.length===0?'Payments are auto-generated when you set lease dates. You can also generate manually.':'No records match the current filter.'}</div>
                  {records.length===0&&(
                    <button className="btn-primary" style={{margin:'0 auto'}} disabled={generating} onClick={generatePayments}>
                      {generating?'⏳ Generating…':`⚡ Generate ${selectedMonth} Payments`}
                    </button>
                  )}
                </div>
              ):(
                <div style={{overflowX:'auto'}}>
                  <table className="rtable">
                    <thead><tr><th>Tenant</th><th>Amount</th><th>Due Date</th><th>Paid Date</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filtered.map(r=>{
                        const ds=derivedStatus(r)
                        const sc=STATUS_CFG[ds]||STATUS_CFG.pending
                        const isBusy=updating===r.id
                        return(
                          <tr key={r.id}>
                            <td><div style={{display:'flex',alignItems:'center',gap:10}}>
                              <div className="t-av" style={{background:r.color}}>{r.initials}</div>
                              <div><div className="t-name">{r.tenant}</div><div className="t-prop">{r.property} · {r.unit}</div></div>
                            </div></td>
                            <td><span className="amt">${r.amount.toLocaleString()}</span></td>
                            <td><span className="date-txt">{r.due_date}</span></td>
                            <td><span className="date-txt">{r.paid_date||'—'}</span></td>
                            <td><span className="badge" style={{background:sc.bg,color:sc.color}}>● {sc.label}</span></td>
                            <td>{r.status==='paid'
                              ?<span style={{fontSize:12,color:'#16A34A',fontWeight:600}}>✓ Received</span>
                              :<button className="act-btn act-btn-green" disabled={isBusy} onClick={()=>markPaid(r.id)}>{isBusy?'…':'✓ Mark Paid'}</button>
                            }</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading&&filtered.length>0&&(
                <div className="rent-mobile-cards">
                  {filtered.map(r=>{
                    const ds=derivedStatus(r)
                    const sc=STATUS_CFG[ds]||STATUS_CFG.pending
                    const isBusy=updating===r.id
                    return(
                      <div key={r.id} className="rmc">
                        <div className="t-av" style={{background:r.color}}>{r.initials}</div>
                        <div className="rmc-info">
                          <div className="rmc-name">{r.tenant}</div>
                          <div className="rmc-sub">{r.property} · {r.unit} · Due {r.due_date}</div>
                          <div style={{marginTop:4,display:'flex',alignItems:'center',gap:8}}>
                            <span className="badge" style={{background:sc.bg,color:sc.color}}>● {sc.label}</span>
                            {r.paid_date&&<span style={{fontSize:11,color:'#94A3B8'}}>Paid {r.paid_date}</span>}
                          </div>
                        </div>
                        <div className="rmc-right">
                          <div className="rmc-amt">${r.amount.toLocaleString()}</div>
                          <div className="rmc-actions">
                            {r.status!=='paid'
                              ?<button className="act-btn act-btn-green" disabled={isBusy} onClick={()=>markPaid(r.id)} style={{padding:'5px 10px',fontSize:11.5}}>{isBusy?'…':'✓ Paid'}</button>
                              :<span style={{fontSize:11.5,color:'#16A34A',fontWeight:600}}>✓ Received</span>
                            }
                          </div>
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
