'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

type Property = {
  id: string
  name: string
  address: string
  city: string
  country: string
  total_units: number
  status: 'active' | 'listed' | 'inactive'
  type: string
  created_at: string
  occupied_count: number
  avg_rent: number
  photos: string[]
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; banner: string }> = {
  active: { label: 'Active', bg: '#DCFCE7', color: '#16A34A', banner: 'linear-gradient(135deg,#EFF6FF,#EEF2FF)' },
  listed: { label: 'Listed', bg: '#FEF3C7', color: '#D97706', banner: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)' },
  inactive: { label: 'Inactive', bg: '#F1F5F9', color: '#64748B', banner: 'linear-gradient(135deg,#F8FAFC,#F1F5F9)' },
}

const TYPE_ICON: Record<string, string> = {
  apartment: '🏢', house: '🏠', commercial: '🏪', land: '🌿',
}

const FREE_PLAN_LIMIT = 3

export default function PropertiesPage() {
  const router = useRouter()
  // ── FIX: Only destructure isPro — plan is unused
  const { isPro } = usePro()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState('')
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'listed' | 'inactive'>('all')

  const [drawer, setDrawer] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Property | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', address: '', city: '', country: 'Sri Lanka',
    type: 'apartment', status: 'active',
    total_units: '', default_rent: '',
  })

  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        setUserId(user.id)

        const name = user.user_metadata?.full_name || 'User'
        setFullName(name)
        setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

        const { data: props, error } = await supabase
          .from('properties')
          .select('id,name,address,city,country,total_units,status,type,created_at,photos')
          .eq('landlord_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error

        const propIds = (props || []).map((p: any) => p.id)
        let unitMap: Record<string, { occupied: number; avg_rent: number }> = {}
        if (propIds.length > 0) {
          const { data: units } = await supabase
            .from('units')
            .select('id,property_id,status,monthly_rent')
            .in('property_id', propIds)
            ; (units || []).forEach((u: any) => {
              if (!unitMap[u.property_id]) unitMap[u.property_id] = { occupied: 0, avg_rent: 0 }
              if (u.status === 'occupied') unitMap[u.property_id].occupied++
            })
          const rentTotals: Record<string, number[]> = {}
            ; (units || []).forEach((u: any) => {
              if (!rentTotals[u.property_id]) rentTotals[u.property_id] = []
              if (u.monthly_rent) rentTotals[u.property_id].push(u.monthly_rent)
            })
          Object.keys(rentTotals).forEach(pid => {
            const rents = rentTotals[pid]
            unitMap[pid].avg_rent = rents.length > 0
              ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0
          })
        }

        const shaped: Property[] = (props || []).map((p: any) => ({
          id: p.id, name: p.name, address: p.address || '',
          city: p.city, country: p.country,
          total_units: p.total_units,
          status: p.status,
          type: p.type?.toLowerCase() || 'apartment',
          created_at: p.created_at,
          photos: Array.isArray(p.photos) ? p.photos : [],
          occupied_count: unitMap[p.id]?.occupied || 0,
          avg_rent: unitMap[p.id]?.avg_rent || 0,
        }))
        setProperties(shaped)
      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  const filtered = filter === 'all' ? properties : properties.filter(p => p.status === filter)
  const counts = {
    all: properties.length,
    active: properties.filter(p => p.status === 'active').length,
    listed: properties.filter(p => p.status === 'listed').length,
    inactive: properties.filter(p => p.status === 'inactive').length,
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const remaining = 3 - photoPreviews.length
    const toAdd = files.slice(0, remaining)
    if (toAdd.length === 0) return
    setPhotoFiles(prev => [...prev, ...toAdd])
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setPhotoPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function removePhoto(idx: number) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadPhotos(propertyId: string): Promise<string[]> {
    if (photoFiles.length === 0) return []
    const supabase = createClient()
    const urls: string[] = []
    for (const file of photoFiles) {
      const ext = file.name.split('.').pop()
      const path = `properties/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
        urls.push(publicUrl)
      }
    }
    return urls
  }

  function openAdd() {
    // ── FIX: Pro users bypass the property limit entirely
    if (!isPro && properties.length >= FREE_PLAN_LIMIT) { setShowUpgradeModal(true); return }
    setForm({ name: '', address: '', city: '', country: 'Sri Lanka', type: 'apartment', status: 'active', total_units: '', default_rent: '' })
    setEditing(null)
    setSaveError(null)
    setPhotoFiles([])
    setPhotoPreviews([])
    setDrawer('add')
  }

  function openEdit(p: Property) {
    setForm({
      name: p.name, address: p.address, city: p.city, country: p.country,
      type: p.type, status: p.status,
      total_units: String(p.total_units),
      default_rent: '',
    })
    setEditing(p)
    setSaveError(null)
    setPhotoFiles([])
    setPhotoPreviews(p.photos || [])
    setDrawer('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('Property name is required.'); return }
    if (!form.city.trim()) { setSaveError('City is required.'); return }
    if (drawer === 'add' && (!form.total_units || parseInt(form.total_units) < 1)) {
      setSaveError('Total units must be at least 1.'); return
    }
    setSaving(true); setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      if (drawer === 'add') {
        const { data: newProp, error: propErr } = await supabase
          .from('properties').insert({
            name: form.name.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            country: form.country.trim(),
            type: form.type,
            status: form.status,
            total_units: parseInt(form.total_units) || 1,
            landlord_id: user.id,
          }).select().single()
        if (propErr) throw new Error(propErr.message)

        setUploadingPhotos(true)
        const photoUrls = await uploadPhotos(newProp.id)
        setUploadingPhotos(false)
        if (photoUrls.length > 0) {
          await supabase.from('properties').update({ photos: photoUrls }).eq('id', newProp.id)
        }

        const count = parseInt(form.total_units) || 1
        const rent = parseFloat(form.default_rent) || 0
        await supabase.from('units').insert(
          Array.from({ length: count }, (_, i) => ({
            property_id: newProp.id,
            unit_number: `Unit ${i + 1}`,
            monthly_rent: rent,
            currency: 'USD',
            status: 'vacant',
          }))
        )

        setProperties(prev => [{
          ...newProp,
          type: newProp.type.toLowerCase(),
          photos: photoUrls,
          occupied_count: 0,
          avg_rent: rent,
        }, ...prev])

      } else if (drawer === 'edit' && editing) {
        setUploadingPhotos(true)
        const newUrls = await uploadPhotos(editing.id)
        setUploadingPhotos(false)
        const keptUrls = photoPreviews.filter(p => p.startsWith('http'))
        const allPhotos = [...keptUrls, ...newUrls].slice(0, 3)

        const payload = {
          name: form.name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          type: form.type,
          status: form.status,
          total_units: parseInt(form.total_units) || 1,
          photos: allPhotos,
        }
        const { error: updErr } = await supabase.from('properties').update(payload).eq('id', editing.id)
        if (updErr) throw new Error(updErr.message)

        setProperties(prev => prev.map(p =>
          p.id === editing.id
            ? {
              ...p, ...payload, type: payload.type.toLowerCase(), photos: allPhotos,
              status: payload.status as 'active' | 'listed' | 'inactive'
            }
            : p
        ))
      }
      setDrawer(null)
    } catch (err: any) {
      setSaveError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
      setUploadingPhotos(false)
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      const supabase = createClient()
      await supabase.from('units').delete().eq('property_id', deleteConfirm)
      const { error } = await supabase.from('properties').delete().eq('id', deleteConfirm)
      if (error) throw error
      setProperties(prev => prev.filter(p => p.id !== deleteConfirm))
      setDeleteConfirm(null)
    } catch (err) { console.error('Delete error:', err) }
    finally { setDeleting(false) }
  }

  const savingLabel = uploadingPhotos ? 'Uploading photos…' : saving ? 'Saving…' : drawer === 'add' ? '+ Add Property' : 'Save Changes'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif}
        body{background:#F4F6FA}
        .shell{display:flex;min-height:100vh}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,0.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon {
            width: 38px;
            height: 38px;
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
        }
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
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .tb-left{display:flex;align-items:center;gap:12px}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:9px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,0.28);transition:all .18s;white-space:nowrap}
        .btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,0.38)}
        .content{padding:26px 28px;flex:1}
        .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px}
        .page-title{font-family:'Fraunces',serif;font-size:28px;font-weight:400;color:#0F172A;letter-spacing:-0.5px}
        .page-sub{font-size:13px;color:#94A3B8;margin-top:2px}
        .plan-bar{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .plan-bar-left{display:flex;align-items:center;gap:12px}
        .plan-bar-label{font-size:13px;font-weight:600;color:#475569}
        .plan-bar-track{width:140px;height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden}
        .plan-bar-fill{height:100%;border-radius:99px;transition:width .4s}
        .plan-bar-count{font-size:12.5px;font-weight:700}
        .plan-bar-upgrade{padding:6px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .stat-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
        .sstat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;box-shadow:0 1px 4px rgba(15,23,42,0.04);display:flex;align-items:center;gap:14px}
        .sstat-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
        .sstat-num{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A;line-height:1}
        .sstat-lbl{font-size:12px;color:#94A3B8;font-weight:500;margin-top:2px}
        .filter-row{margin-bottom:20px;overflow-x:auto;-webkit-overflow-scrolling:touch}
        .filter-tabs{display:flex;gap:6px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;width:fit-content;min-width:100%}
        .ftab{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap}
        .ftab:hover{background:#F1F5F9;color:#0F172A}.ftab.active{background:#2563EB;color:#fff}
        .ftab .fc{font-size:10px;font-weight:700;background:rgba(255,255,255,0.25);border-radius:99px;padding:1px 6px}
        .ftab:not(.active) .fc{background:#F1F5F9;color:#64748B}
        .prop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:18px}
        .prop-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,0.04);transition:all .2s;display:flex;flex-direction:column}
        .prop-card:hover{box-shadow:0 8px 28px rgba(15,23,42,0.1);transform:translateY(-2px)}
        .prop-banner{height:150px;position:relative;flex-shrink:0;overflow:hidden}
        .prop-banner-img{width:100%;height:100%;object-fit:cover;display:block}
        .prop-banner-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px}
        .prop-banner-photos{position:absolute;bottom:8px;left:10px;display:flex;gap:4px}
        .prop-thumb{width:36px;height:36px;border-radius:7px;object-fit:cover;border:2px solid rgba(255,255,255,0.8);box-shadow:0 1px 4px rgba(0,0,0,0.15)}
        .prop-status-pill{position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px;backdrop-filter:blur(8px)}
        .prop-body{padding:16px 18px;flex:1}
        .prop-name{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:3px}
        .prop-loc{font-size:12.5px;color:#94A3B8;margin-bottom:12px;display:flex;align-items:center;gap:4px}
        .avg-rent{font-size:12px;color:#2563EB;font-weight:600;padding:3px 10px;background:#EFF6FF;border-radius:99px;display:inline-block;margin-bottom:12px}
        .prop-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
        .ps{background:#F8FAFC;border-radius:10px;padding:10px;text-align:center}
        .ps-val{font-size:15px;font-weight:700;color:#0F172A}
        .ps-lbl{font-size:10.5px;color:#94A3B8;font-weight:500;margin-top:2px}
        .occ-row{margin-bottom:4px}
        .occ-top{display:flex;justify-content:space-between;margin-bottom:5px}
        .occ-lbl{font-size:12px;color:#64748B;font-weight:600}
        .occ-pct{font-size:12px;color:#2563EB;font-weight:700}
        .occ-bar{height:6px;background:#E2E8F0;border-radius:99px;overflow:hidden}
        .occ-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3B82F6,#6366F1);transition:width .4s ease}
        .prop-footer{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #F1F5F9}
        .pf-btn{flex:1;padding:8px 4px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:4px}
        .pf-btn:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .pf-btn-danger:hover{border-color:#FCA5A5!important;color:#DC2626!important;background:#FEF2F2!important}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:12px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .skel-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden}
        .skel-banner{height:150px;border-radius:0}
        .skel-body{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
        .skel-line{height:13px}.skel-line.w80{width:80%}.skel-line.w50{width:50%}.skel-line.w100{height:50px;width:100%}
        .empty-state{text-align:center;padding:70px 20px}
        .empty-ico{font-size:52px;margin-bottom:14px}
        .empty-title{font-size:18px;font-weight:700;color:#475569;margin-bottom:6px}
        .empty-sub{font-size:14px;color:#94A3B8;margin-bottom:24px}
        .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:300}
        .drawer-overlay.open{display:block}
        .drawer{position:fixed;top:0;right:0;bottom:0;width:460px;background:#fff;z-index:301;box-shadow:-8px 0 32px rgba(15,23,42,0.12);transform:translateX(100%);transition:transform .28s ease;display:flex;flex-direction:column}
        .drawer.open{transform:translateX(0)}
        .drawer-head{padding:20px 24px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .drawer-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A}
        .drawer-close{background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;padding:4px 8px;border-radius:6px}
        .drawer-close:hover{background:#F1F5F9;color:#0F172A}
        .drawer-body{flex:1;padding:22px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:15px}
        .drawer-body::-webkit-scrollbar{width:0}
        .drawer-footer{padding:16px 24px;border-top:1px solid #E2E8F0;flex-shrink:0}
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12.5px;font-weight:700;color:#374151;letter-spacing:0.2px}
        .field input,.field select{padding:10px 14px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;transition:border-color .15s;outline:none;width:100%}
        .field input:focus,.field select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
        .field input:disabled{background:#F8FAFC;color:#94A3B8}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .hint{font-size:12px;color:#64748B;line-height:1.55;background:#F8FAFC;border-radius:9px;padding:10px 13px;border-left:3px solid #3B82F6}
        .err-box{padding:10px 14px;background:#FEE2E2;color:#DC2626;border-radius:10px;font-size:13px;font-weight:600}
        .btn-row{display:flex;gap:10px}
        .btn-cancel{flex:1;padding:11px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-save{flex:2;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,0.25)}
        .btn-save:disabled{opacity:0.65;cursor:not-allowed}
        .photo-section-label{font-size:12.5px;font-weight:700;color:#374151;letter-spacing:0.2px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
        .photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
        .photo-slot{aspect-ratio:1;border-radius:11px;overflow:hidden;position:relative;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .15s}
        .photo-slot:hover{border-color:#3B82F6}
        .photo-slot img{width:100%;height:100%;object-fit:cover;display:block}
        .photo-slot-add{flex-direction:column;gap:6px;font-size:11.5px;font-weight:600;color:#94A3B8}
        .photo-slot-add span{font-size:22px}
        .photo-remove{position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;line-height:1}
        .photo-hint{font-size:11.5px;color:#94A3B8}
        .del-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;align-items:center;justify-content:center;padding:20px}
        .del-overlay.open{display:flex}
        .del-box{background:#fff;border-radius:20px;padding:30px;width:100%;max-width:360px;box-shadow:0 24px 64px rgba(15,23,42,0.2);text-align:center}
        .del-ico{font-size:40px;margin-bottom:14px}
        .del-title{font-size:18px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .del-sub{font-size:13.5px;color:#64748B;line-height:1.6;margin-bottom:24px}
        .del-actions{display:flex;gap:10px}
        .del-cancel{flex:1;padding:11px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-confirm{flex:1;padding:11px;border-radius:10px;border:none;background:#DC2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-confirm:hover:not(:disabled){background:#B91C1C}
        .del-confirm:disabled{opacity:0.6;cursor:not-allowed}
        .umodal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px}
        .umodal{background:#fff;border-radius:22px;padding:36px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(15,23,42,0.2);animation:popIn .2s ease}
        @keyframes popIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
        .umodal-icon{font-size:40px;margin-bottom:14px}
        .umodal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:8px;letter-spacing:-0.4px}
        .umodal-sub{font-size:14px;color:#64748B;line-height:1.6;margin-bottom:18px}
        .umodal-limit{display:inline-flex;align-items:center;gap:8px;background:#FEF3C7;color:#D97706;font-size:13px;font-weight:700;padding:8px 16px;border-radius:10px;margin-bottom:18px}
        .umodal-features{text-align:left;background:#F8FAFC;border-radius:12px;padding:14px 18px;margin-bottom:22px}
        .umodal-feat{display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;padding:4px 0;font-weight:500}
        .umodal-btn-pro{width:100%;padding:13px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 3px 12px rgba(37,99,235,0.35);margin-bottom:10px}
        .umodal-btn-cancel{background:none;border:none;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;padding:4px}
        @media(max-width:1024px){.stat-strip{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0}.hamburger{display:block}
          .content{padding:16px 14px}.topbar{padding:0 14px}
          .drawer{width:100%;top:auto;height:90vh;border-radius:20px 20px 0 0;transform:translateY(100%)}
          .drawer.open{transform:translateY(0)}
          .prop-grid{grid-template-columns:1fr}.field-row{grid-template-columns:1fr}
          .plan-bar-track{width:80px}
        }
        @media(max-width:480px){
          .stat-strip{grid-template-columns:repeat(2,1fr)}.sstat{padding:12px 14px;gap:10px}.sstat-num{font-size:22px}
          .filter-tabs{gap:3px}.ftab{padding:6px 10px;font-size:12px}.page-title{font-size:22px}
          .plan-bar{flex-direction:column;align-items:flex-start}
        }
      `}</style>

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className={`drawer-overlay${drawer ? ' open' : ''}`} onClick={() => setDrawer(null)} />

      {/* DELETE MODAL */}
      <div className={`del-overlay${deleteConfirm ? ' open' : ''}`}>
        <div className="del-box">
          <div className="del-ico">🗑️</div>
          <div className="del-title">Delete Property?</div>
          <div className="del-sub">This will permanently delete the property and all its units. This cannot be undone.</div>
          <div className="del-actions">
            <button className="del-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="del-confirm" disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
          </div>
        </div>
      </div>

      {/* ADD / EDIT DRAWER */}
      <div className={`drawer${drawer ? ' open' : ''}`}>
        <div className="drawer-head">
          <span className="drawer-title">{drawer === 'add' ? 'Add Property' : 'Edit Property'}</span>
          <button className="drawer-close" onClick={() => setDrawer(null)}>✕</button>
        </div>
        <div className="drawer-body">

          {/* Photos */}
          <div>
            <div className="photo-section-label">
              <span>Photos <span style={{ color: '#94A3B8', fontWeight: 400 }}>(up to 3)</span></span>
              <span className="photo-hint">{photoPreviews.length}/3 added</span>
            </div>
            <div className="photo-grid">
              {photoPreviews.map((src, i) => (
                <div key={i} className="photo-slot">
                  <img src={src} alt={`Photo ${i + 1}`} />
                  <button className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                </div>
              ))}
              {photoPreviews.length < 3 && (
                <div className="photo-slot photo-slot-add" onClick={() => fileInputRef.current?.click()}>
                  <span>📷</span>Add Photo
                </div>
              )}
            </div>
            <div className="photo-hint">JPG or PNG · Max 5MB each</div>
          </div>

          <div className="field">
            <label>Property Name *</label>
            <input placeholder="e.g. Rush Towers, Sunset Villas" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>City *</label>
              <input placeholder="e.g. Colombo 05" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="field">
              <label>Country</label>
              <input placeholder="e.g. Sri Lanka" value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
            </div>
          </div>

          <div className="field">
            <label>Street Address <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
            <input placeholder="e.g. 42 Galle Road" value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Property Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="apartment">Apartment Building</option>
                <option value="house">House / Villa</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="listed">Listed (For Rent)</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Total Units {drawer === 'edit' && <span style={{ color: '#94A3B8', fontWeight: 400 }}>(locked)</span>}</label>
              <input type="number" min="1" placeholder="e.g. 20" value={form.total_units}
                onChange={e => setForm(f => ({ ...f, total_units: e.target.value }))}
                disabled={drawer === 'edit'} />
            </div>
            {drawer === 'add' && (
              <div className="field">
                <label>Default Rent (USD)</label>
                <input type="number" min="0" placeholder="e.g. 500" value={form.default_rent}
                  onChange={e => setForm(f => ({ ...f, default_rent: e.target.value }))} />
              </div>
            )}
          </div>

          <div className="hint">
            {drawer === 'add'
              ? '💡 Units will be created automatically. Use Manage Units to set individual rents per unit.'
              : '💡 To update rents, go to Manage Units → Edit each unit individually.'}
          </div>

          {saveError && <div className="err-box">⚠️ {saveError}</div>}
        </div>

        <div className="drawer-footer">
          <div className="btn-row">
            <button className="btn-cancel" onClick={() => setDrawer(null)}>Cancel</button>
            <button className="btn-save" disabled={saving || uploadingPhotos} onClick={handleSave}>{savingLabel}</button>
          </div>
        </div>
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
            {/* ── FIX: Hide upgrade nudge for Pro users — they're already subscribed */}
            {!isPro && (
              <div className="sb-upgrade">
                <div className="sb-up-title">⭐ Upgrade to Pro</div>
                <div className="sb-up-sub">Unlimited properties, reports & priority support.</div>
                <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
              </div>
            )}
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              {/* ── FIX: Show real plan label from usePro() */}
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">{isPro ? 'PRO' : 'FREE'}</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Properties</b></div>
            </div>
            <button className="btn-primary" onClick={openAdd}>+ Add Property</button>
          </div>

          <div className="content">
            <div className="page-header">
              <div>
                <div className="page-title">Properties</div>
                <div className="page-sub">{counts.all} total · {counts.active} active · {counts.listed} listed · {counts.inactive} inactive</div>
              </div>
            </div>

            {/* ── FIX: Plan bar only shown for free users; Pro users see an "unlimited" badge instead */}
            {!isPro ? (
              <div className="plan-bar">
                <div className="plan-bar-left">
                  <div className="plan-bar-label">Free plan · Properties used</div>
                  <div className="plan-bar-track">
                    <div className="plan-bar-fill" style={{ width: `${Math.min((counts.all / FREE_PLAN_LIMIT) * 100, 100)}%`, background: counts.all >= FREE_PLAN_LIMIT ? '#EF4444' : 'linear-gradient(90deg,#3B82F6,#6366F1)' }} />
                  </div>
                  <div className="plan-bar-count" style={{ color: counts.all >= FREE_PLAN_LIMIT ? '#DC2626' : '#0F172A' }}>{counts.all} / {FREE_PLAN_LIMIT}</div>
                </div>
                <button className="plan-bar-upgrade" onClick={() => window.location.href = '/landlord/upgrade'}>⭐ Upgrade for unlimited</button>
              </div>
            ) : (
              <div className="plan-bar">
                <div className="plan-bar-left">
                  <div className="plan-bar-label">⭐ Pro plan · Unlimited properties</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16A34A', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, padding: '4px 12px' }}>
                  ✓ No limits
                </div>
              </div>
            )}

            <div className="stat-strip">
              <div className="sstat"><div className="sstat-ico" style={{ background: '#EFF6FF' }}>🏘️</div><div><div className="sstat-num">{counts.all}</div><div className="sstat-lbl">Total</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{ background: '#DCFCE7' }}>✅</div><div><div className="sstat-num">{counts.active}</div><div className="sstat-lbl">Active</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{ background: '#FEF3C7' }}>📋</div><div><div className="sstat-num">{counts.listed}</div><div className="sstat-lbl">Listed</div></div></div>
              <div className="sstat"><div className="sstat-ico" style={{ background: '#F1F5F9' }}>🔑</div><div><div className="sstat-num">{counts.inactive}</div><div className="sstat-lbl">Inactive</div></div></div>
            </div>

            <div className="filter-row">
              <div className="filter-tabs">
                {(['all', 'active', 'listed', 'inactive'] as const).map(f => (
                  <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                    {{ all: 'All', active: 'Active', listed: 'Listed', inactive: 'Inactive' }[f]}
                    <span className="fc">{counts[f]}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="prop-grid">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skel-card">
                    <div className="skeleton skel-banner" />
                    <div className="skel-body">
                      <div className="skeleton skel-line w80" />
                      <div className="skeleton skel-line w50" />
                      <div className="skeleton skel-line w100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-ico">🏘️</div>
                <div className="empty-title">{filter === 'all' ? 'No properties yet' : `No ${filter} properties`}</div>
                <div className="empty-sub">{filter === 'all' ? 'Add your first property to get started.' : 'Try a different filter.'}</div>
                {filter === 'all' && <button className="btn-primary" style={{ margin: '0 auto' }} onClick={openAdd}>+ Add Property</button>}
              </div>
            ) : (
              <div className="prop-grid">
                {filtered.map(p => {
                  const sc = STATUS_CFG[p.status] || STATUS_CFG.inactive
                  const pct = p.total_units > 0 ? Math.round((p.occupied_count / p.total_units) * 100) : 0
                  const vacant = p.total_units - p.occupied_count
                  const addr = [p.address, p.city, p.country].filter(Boolean).join(', ')
                  const mainPhoto = p.photos?.[0]
                  return (
                    <div key={p.id} className="prop-card">
                      <div className="prop-banner" style={{ background: sc.banner }}>
                        {mainPhoto
                          ? <img className="prop-banner-img" src={mainPhoto} alt={p.name} />
                          : <div className="prop-banner-icon">{TYPE_ICON[p.type] || '🏠'}</div>
                        }
                        {p.photos?.length > 1 && (
                          <div className="prop-banner-photos">
                            {p.photos.slice(1).map((ph, i) => (
                              <img key={i} className="prop-thumb" src={ph} alt={`Photo ${i + 2}`} />
                            ))}
                          </div>
                        )}
                        <span className="prop-status-pill" style={{ background: sc.bg, color: sc.color }}>● {sc.label}</span>
                      </div>
                      <div className="prop-body">
                        <div className="prop-name">{p.name}</div>
                        <div className="prop-loc">📍 {addr || '—'}</div>
                        {p.avg_rent > 0 && <div className="avg-rent">Avg ${p.avg_rent.toLocaleString()}/mo</div>}
                        <div className="prop-stats">
                          <div className="ps"><div className="ps-val">{p.total_units}</div><div className="ps-lbl">Total Units</div></div>
                          <div className="ps"><div className="ps-val" style={{ color: '#16A34A' }}>{p.occupied_count}</div><div className="ps-lbl">Occupied</div></div>
                          <div className="ps"><div className="ps-val" style={{ color: vacant > 0 ? '#D97706' : '#94A3B8' }}>{vacant}</div><div className="ps-lbl">Vacant</div></div>
                        </div>
                        <div className="occ-row">
                          <div className="occ-top"><span className="occ-lbl">Occupancy</span><span className="occ-pct">{pct}%</span></div>
                          <div className="occ-bar"><div className="occ-fill" style={{ width: `${pct}%` }} /></div>
                        </div>
                      </div>
                      <div className="prop-footer">
                        <button className="pf-btn" onClick={() => openEdit(p)}>✏️ Edit</button>
                        <a href={`/landlord/properties/${p.id}/units`} className="pf-btn">🏗️ Units</a>
                        <button className="pf-btn pf-btn-danger" onClick={() => setDeleteConfirm(p.id)}>🗑️</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <div className="umodal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="umodal" onClick={e => e.stopPropagation()}>
            <div className="umodal-icon">🏘️</div>
            <div className="umodal-title">Unlock More Properties</div>
            <div className="umodal-sub">You've reached the Free plan limit. Upgrade to Pro to manage unlimited properties.</div>
            <div className="umodal-limit">⚠️ Free plan: {FREE_PLAN_LIMIT} properties max</div>
            <div className="umodal-features">
              <div className="umodal-feat"><span style={{ color: '#16A34A' }}>✓</span> Unlimited properties</div>
              <div className="umodal-feat"><span style={{ color: '#16A34A' }}>✓</span> Unlimited units</div>
              <div className="umodal-feat"><span style={{ color: '#16A34A' }}>✓</span> Advanced reports & analytics</div>
              <div className="umodal-feat"><span style={{ color: '#16A34A' }}>✓</span> CSV & PDF exports</div>
            </div>
            <button className="umodal-btn-pro" onClick={() => { setShowUpgradeModal(false); window.location.href = '/landlord/upgrade' }}>⭐ Upgrade to Pro →</button>
            <button className="umodal-btn-cancel" onClick={() => setShowUpgradeModal(false)}>Maybe later</button>
          </div>
        </div>
      )}
    </>
  )
}
