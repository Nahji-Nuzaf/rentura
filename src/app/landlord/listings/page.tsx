'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

type Listing = {
  id: string
  title: string
  description: string
  property_id: string
  unit_id: string
  property: string
  unit: string
  bedrooms: number
  bathrooms: number
  rent_amount: number
  currency: string
  available_from: string
  status: 'active' | 'pending' | 'taken' | 'draft'
  photos: string[]
  created_at: string
}

type PropertyOption = { id: string; name: string; city?: string; type?: string }
type UnitOption = { id: string; unit_number: string; monthly_rent: number }

const STATUS_CFG: Record<string, { label: string, bg: string, color: string }> = {
  active: { label: 'Active', bg: '#DCFCE7', color: '#16A34A' },
  draft: { label: 'Draft', bg: '#F1F5F9', color: '#64748B' },
  pending: { label: 'Pending', bg: '#FEF3C7', color: '#D97706' },
  taken: { label: 'Taken', bg: '#EFF6FF', color: '#2563EB' },
}

function fmtDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ListingsPage() {
  const router = useRouter()

  const { isPro, plan } = usePro()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [userId, setUserId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'taken' | 'draft'>('all')
  const [drawer, setDrawer] = useState<'add' | 'edit' | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [editing, setEditing] = useState<Listing | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])
  const [propMap, setPropMap] = useState<Record<string, string>>({})
  const [unitMap, setUnitMap] = useState<Record<string, string>>({})
  const [shareId, setShareId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  // Photo state
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  // AI writer state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiSuccess, setAiSuccess] = useState(false)

  const [form, setForm] = useState({
    title: '', description: '', property_id: '', unit_id: '',
    bedrooms: '1', bathrooms: '1', rent_amount: '', available_from: '',
    status: 'draft' as Listing['status'],
  })

  // ── LOAD ─────────────────────────────────────────────────
  async function loadAll(uid: string) {
    setLoading(true)
    try {
      const sb = createClient()
      const { data: props } = await sb.from('properties').select('id,name,city,type').eq('landlord_id', uid)
      setProperties(props || [])
      const pm: Record<string, string> = {}
        ; (props || []).forEach((p: any) => { pm[p.id] = p.name })
      setPropMap(pm)
      const propIds = (props || []).map((p: any) => p.id)
      if (!propIds.length) { setListings([]); setLoading(false); return }

      const { data: unitsData } = await sb
        .from('units').select('id,unit_number,property_id,monthly_rent').in('property_id', propIds)
      const um: Record<string, string> = {}
        ; (unitsData || []).forEach((u: any) => { um[u.id] = u.unit_number })
      setUnitMap(um)

      const { data, error } = await sb
        .from('listings')
        .select('id,title,description,property_id,unit_id,bedrooms,bathrooms,rent_amount,currency,available_from,status,photos,created_at')
        .eq('landlord_id', uid)
        .order('created_at', { ascending: false })
      if (error) throw error

      setListings((data || []).map((row: any) => ({
        id: row.id, title: row.title || 'Untitled', description: row.description || '',
        property_id: row.property_id || '', unit_id: row.unit_id || '',
        property: pm[row.property_id] || '—', unit: um[row.unit_id] || '—',
        bedrooms: row.bedrooms || 0, bathrooms: row.bathrooms || 1,
        rent_amount: row.rent_amount || 0, currency: row.currency || 'USD',
        available_from: row.available_from || '', status: row.status || 'draft',
        photos: row.photos || [], created_at: row.created_at || '',
      })))
    } catch (e: any) { console.error(e?.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    ; (async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name); setUserId(user.id)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))
      await loadAll(user.id)
    })()
  }, [router])

  async function loadUnitsForProperty(propId: string) {
    if (!propId) { setUnits([]); return }
    const sb = createClient()
    const { data } = await sb.from('units').select('id,unit_number,monthly_rent').eq('property_id', propId)
    setUnits(data || [])
  }

  // ── AI LISTING WRITER ─────────────────────────────────────
  async function handleAiWrite() {
    if (!form.property_id) { setAiError('Select a property first.'); return }
    setAiLoading(true); setAiError(''); setAiSuccess(false)

    const prop = properties.find(p => p.id === form.property_id)
    const unit = units.find(u => u.id === form.unit_id)
    const propName = prop?.name || 'Property'
    const propCity = prop?.city || ''
    const propType = prop?.type || 'residential'
    const unitNum = unit?.unit_number || ''
    const beds = form.bedrooms || '1'
    const baths = form.bathrooms || '1'
    const rent = form.rent_amount || '0'
    const avail = form.available_from
      ? new Date(form.available_from).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'immediately'

    const prompt = `You are a professional real estate copywriter. Write a compelling rental listing for the following property.

Property details:
- Property name: ${propName}
- City/Location: ${propCity || 'Sri Lanka'}
- Property type: ${propType}
- Unit: ${unitNum || 'N/A'}
- Bedrooms: ${beds}
- Bathrooms: ${baths}
- Monthly rent: $${rent}
- Available from: ${avail}

Write ONLY a JSON object (no markdown, no backticks) with exactly two keys:
- "title": A compelling listing title (max 60 characters). Make it specific and attractive.
- "description": A professional 3-4 sentence description highlighting the key features, lifestyle, and value. Make it warm and inviting but factual.

The tone should be professional yet approachable. Focus on the lifestyle and convenience.`

    try {
      const response = await fetch('/api/ai/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      if (data.error) { setAiError(data.error); return }

      const raw = (data.text || '')
        .trim()
        .replace(/```json|```/g, '')
        .trim()

      if (!raw) { setAiError('Empty response. Check your API key.'); return }

      const parsed = JSON.parse(raw)
      if (parsed.title && parsed.description) {
        setForm(f => ({ ...f, title: parsed.title, description: parsed.description }))
        setAiSuccess(true)
        setTimeout(() => setAiSuccess(false), 3000)
      } else {
        setAiError('AI response was incomplete. Try again.')
      }
    } catch (err: any) {
      setAiError('Failed to generate. Please try again.')
      console.error('AI write error:', err)
    } finally {
      setAiLoading(false)
    }
  }

  // ── PHOTO HANDLING ────────────────────────────────────────
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const combined = [...photoFiles, ...files].slice(0, 8)
    setPhotoFiles(combined)
    setPhotoPreviews(combined.map(f => URL.createObjectURL(f)))
    e.target.value = ''
  }

  function removeNewPhoto(idx: number) {
    const nf = photoFiles.filter((_, i) => i !== idx)
    setPhotoFiles(nf)
    setPhotoPreviews(nf.map(f => URL.createObjectURL(f)))
  }

  function removeExistingPhoto(url: string) {
    setExistingPhotos(prev => prev.filter(u => u !== url))
  }

  async function uploadPhotos(): Promise<string[]> {
    if (!photoFiles.length) return []
    const sb = createClient()
    const urls: string[] = []
    for (const file of photoFiles) {
      const ext = file.name.split('.').pop()
      const path = `${userId}/listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await sb.storage.from('documents').upload(path, file)
      if (error) { console.error('Photo upload error:', error); continue }
      const { data } = sb.storage.from('documents').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  // ── SAVE ─────────────────────────────────────────────────
  async function handleSave() {
    if (!form.title || !form.property_id) { alert('Please fill in title and property.'); return }
    const totalPhotos = existingPhotos.length + photoFiles.length
    if (totalPhotos < 4) { alert('Please add at least 4 photos to your listing.'); return }
    setSaving(true); setUploadingPhotos(true)
    try {
      const sb = createClient()
      const newUrls = await uploadPhotos()
      setUploadingPhotos(false)
      const allPhotos = [...existingPhotos, ...newUrls]
      const payload: any = {
        landlord_id: userId,
        property_id: form.property_id || null,
        unit_id: form.unit_id || null,
        title: form.title,
        description: form.description,
        bedrooms: parseInt(form.bedrooms) || 0,
        bathrooms: parseInt(form.bathrooms) || 1,
        rent_amount: parseFloat(form.rent_amount) || 0,
        currency: 'USD',
        available_from: form.available_from || null,
        status: form.status,
        photos: allPhotos,
      }
      if (drawer === 'add') {
        const { error } = await sb.from('listings').insert(payload)
        if (error) throw error
      } else if (editing) {
        const { error } = await sb.from('listings').update(payload).eq('id', editing.id)
        if (error) throw error
      }
      await loadAll(userId)
      setDrawer(null); setPhotoFiles([]); setPhotoPreviews([]); setExistingPhotos([])
    } catch (e: any) { alert('Error: ' + (e?.message || 'Failed to save')) }
    finally { setSaving(false); setUploadingPhotos(false) }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      const sb = createClient()
      await sb.from('listings').delete().eq('id', deleteId)
      setListings(prev => prev.filter(l => l.id !== deleteId))
    } catch (e: any) { console.error(e?.message) }
    finally { setDeleteId(null) }
  }

  async function toggleStatus(id: string, status: Listing['status']) {
    const sb = createClient()
    await sb.from('listings').update({ status }).eq('id', id)
    setListings(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  function openAdd() {
    const activeCount = listings.filter(l => l.status === 'active').length
    if (!isPro && activeCount >= 2) { setShowUpgradeModal(true); return }
    setForm({
      title: '', description: '', property_id: properties[0]?.id || '', unit_id: '',
      bedrooms: '1', bathrooms: '1', rent_amount: '', available_from: '', status: 'draft'
    })
    if (properties[0]?.id) loadUnitsForProperty(properties[0].id)
    setPhotoFiles([]); setPhotoPreviews([]); setExistingPhotos([])
    setAiError(''); setAiSuccess(false)
    setEditing(null); setDrawer('add')
  }

  function openEdit(l: Listing) {
    setForm({
      title: l.title, description: l.description, property_id: l.property_id,
      unit_id: l.unit_id, bedrooms: String(l.bedrooms), bathrooms: String(l.bathrooms),
      rent_amount: String(l.rent_amount), available_from: l.available_from, status: l.status
    })
    loadUnitsForProperty(l.property_id)
    setPhotoFiles([]); setPhotoPreviews([]); setExistingPhotos(l.photos || [])
    setAiError(''); setAiSuccess(false)
    setEditing(l); setDrawer('edit')
  }

  function getShareUrl(id: string) {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/listings/${id}`
  }

  async function copyShareUrl(id: string) {
    try {
      await navigator.clipboard.writeText(getShareUrl(id))
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch { }
  }

  const filtered = listings.filter(l => filter === 'all' || l.status === filter)
  const counts: Record<string, number> = {
    all: listings.length,
    active: listings.filter(l => l.status === 'active').length,
    draft: listings.filter(l => l.status === 'draft').length,
    pending: listings.filter(l => l.status === 'pending').length,
    taken: listings.filter(l => l.status === 'taken').length,
  }
  const totalPhotosInForm = existingPhotos.length + photoFiles.length

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;width:100%;position:relative;overflow-x:hidden}

        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
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

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap}.breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.28);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0;transition:all .18s}
        .btn-primary:hover{transform:translateY(-1px)}
        .btn-primary:disabled{opacity:.6;cursor:not-allowed}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0}

        .stat-strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sstat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 4px rgba(15,23,42,.04);min-width:0}
        .sstat-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .sstat-num{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1}
        .sstat-lbl{font-size:11px;color:#94A3B8;font-weight:500;margin-top:2px}

        .filter-row-wrap{overflow-x:auto;scrollbar-width:none;margin-bottom:18px;width:100%}
        .filter-row-wrap::-webkit-scrollbar{display:none}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:4px;white-space:nowrap}
        .ftab{padding:7px 14px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .ftab:hover{background:#F1F5F9}
        .ftab.active{background:#2563EB;color:#fff}
        .fc{font-size:10px;font-weight:700;border-radius:99px;padding:1px 6px;background:#F1F5F9;color:#64748B}
        .ftab.active .fc{background:rgba(255,255,255,.2);color:#fff}

        .listing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%}
        .listing-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);display:flex;flex-direction:column;transition:box-shadow .18s,transform .18s}
        .listing-card:hover{box-shadow:0 6px 24px rgba(15,23,42,.10);transform:translateY(-2px)}
        .lc-banner{height:160px;position:relative;background:#F1F5F9;overflow:hidden}
        .lc-banner-img{width:100%;height:100%;object-fit:cover;display:block}
        .lc-banner-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#E2E8F0,#CBD5E1)}
        .lc-photo-count{position:absolute;bottom:10px;left:10px;background:rgba(15,23,42,.6);color:#fff;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px;backdrop-filter:blur(4px)}
        .lc-status{position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px}
        .lc-body{padding:14px 16px;flex:1}
        .lc-title{font-size:14.5px;font-weight:700;color:#0F172A;margin-bottom:4px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lc-sub{font-size:12px;color:#94A3B8;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lc-price{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .lc-facts{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
        .lc-fact{font-size:11px;color:#475569;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:3px 7px;font-weight:500}
        .lc-desc{font-size:12px;color:#64748B;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .lc-footer{padding:10px 14px;border-top:1px solid #F1F5F9;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
        .lf-btn{padding:5px 10px;border-radius:8px;font-size:11.5px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .lf-btn:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .lf-btn-green{border-color:#BBF7D0;background:#F0FDF4;color:#16A34A}
        .lf-btn-green:hover{background:#DCFCE7!important;border-color:#86EFAC!important;color:#15803D!important}
        .lf-btn-red{border-color:#FECACA;background:#FEF2F2;color:#DC2626;margin-left:auto}
        .lf-btn-red:hover{background:#FEE2E2!important}
        .lf-btn-share{border-color:#BFDBFE;background:#EFF6FF;color:#2563EB}
        .lf-btn-share:hover{background:#DBEAFE!important;border-color:#93C5FD!important}

        /* AI WRITER BUTTON */
        .ai-btn{width:100%;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;box-shadow:0 2px 12px rgba(124,58,237,.3);transition:all .18s;position:relative;overflow:hidden}
        .ai-btn:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(124,58,237,.4)}
        .ai-btn:disabled{opacity:.7;cursor:not-allowed;transform:none}
        .ai-btn-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);animation:aiShimmer 1.4s infinite}
        @keyframes aiShimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        .ai-success{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px 13px;font-size:13px;color:#16A34A;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:12px}
        .ai-error{background:#FEE2E2;border:1px solid #FECACA;border-radius:10px;padding:10px 13px;font-size:13px;color:#DC2626;font-weight:600;margin-bottom:12px}
        .ai-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:middle}

        /* SHARE MODAL */
        .share-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;align-items:center;justify-content:center;padding:16px}
        .share-modal-bg.open{display:flex}
        .share-modal{background:#fff;border-radius:20px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(15,23,42,.2)}
        .share-title{font-family:'Fraunces',serif;font-size:20px;font-weight:400;color:#0F172A;margin-bottom:6px}
        .share-sub{font-size:13px;color:#94A3B8;margin-bottom:20px}
        .share-url-box{display:flex;gap:8px;margin-bottom:18px}
        .share-url-input{flex:1;padding:10px 13px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:12.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#475569;background:#F8FAFC;outline:none}
        .share-copy-btn{padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0}
        .share-copy-btn.copied{background:linear-gradient(135deg,#16A34A,#15803D)}
        .share-socials{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
        .share-soc-btn{padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}
        .share-soc-btn:hover{background:#F1F5F9}
        .share-close-btn{width:100%;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .empty-state{text-align:center;padding:80px 20px;background:#fff;border:1px solid #E2E8F0;border-radius:16px}
        .e-ico{font-size:48px;margin-bottom:14px}
        .e-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .e-sub{font-size:13.5px;color:#94A3B8;margin-bottom:22px}

        .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300}.drawer-overlay.open{display:block}
        .drawer{position:fixed;top:0;right:0;bottom:0;width:500px;background:#fff;z-index:301;box-shadow:-8px 0 40px rgba(15,23,42,.14);transform:translateX(100%);transition:transform .28s ease;display:flex;flex-direction:column}
        .drawer.open{transform:translateX(0)}
        .dr-head{padding:20px 24px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .dr-title{font-family:'Fraunces',serif;font-size:20px;font-weight:400;color:#0F172A}
        .dr-close{background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;padding:4px;line-height:1}
        .dr-body{flex:1;overflow-y:auto;padding:20px 24px}
        .dr-body::-webkit-scrollbar{width:4px}.dr-body::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}
        .dr-footer{padding:14px 24px;border-top:1px solid #E2E8F0;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0}
        .field{margin-bottom:14px}
        .field label{display:block;font-size:11.5px;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px}
        .field input,.field select,.field textarea{width:100%;padding:10px 13px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border .15s}
        .field input:focus,.field select:focus,.field textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .field textarea{resize:vertical;min-height:90px;line-height:1.6}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .dr-cancel{padding:9px 20px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .dr-save{padding:9px 22px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .dr-save:disabled{opacity:.6;cursor:not-allowed}

        .photo-section-label{font-size:11.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
        .photo-req{font-size:11px;color:#94A3B8;font-weight:500;text-transform:none;letter-spacing:0}
        .photo-req.ok{color:#16A34A;font-weight:600}
        .photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
        .photo-thumb{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#F1F5F9}
        .photo-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .photo-thumb-del{position:absolute;top:4px;right:4px;background:rgba(15,23,42,.7);border:none;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:10px}
        .photo-upload-zone{border:2px dashed #E2E8F0;border-radius:10px;padding:16px;text-align:center;cursor:pointer;transition:all .15s;font-size:12.5px;color:#94A3B8;line-height:1.6}
        .photo-upload-zone:hover{border-color:#3B82F6;background:#F0F9FF;color:#2563EB}
        .photo-warn{font-size:12px;color:#DC2626;font-weight:600;margin-top:8px;padding:8px 12px;background:#FEE2E2;border-radius:8px}

        .del-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;align-items:center;justify-content:center}.del-overlay.open{display:flex}
        .del-box{background:#fff;border-radius:18px;padding:32px;max-width:380px;width:90%;text-align:center}
        .del-ico{font-size:40px;margin-bottom:12px}
        .del-title{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .del-sub{font-size:13.5px;color:#64748B;margin-bottom:22px}
        .del-actions{display:flex;gap:10px;justify-content:center}
        .del-cancel{padding:9px 22px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-confirm{padding:9px 22px;border-radius:10px;border:none;background:#DC2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        .umodal-overlay{display:flex;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;align-items:center;justify-content:center;padding:16px}
        .umodal{background:#fff;border-radius:22px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(15,23,42,.2)}
        .umodal-icon{font-size:44px;margin-bottom:12px}
        .umodal-title{font-family:'Fraunces',serif;font-size:24px;font-weight:400;color:#0F172A;margin-bottom:8px}
        .umodal-sub{font-size:13.5px;color:#64748B;line-height:1.6;margin-bottom:16px}
        .umodal-limit{font-size:12.5px;font-weight:700;color:#D97706;background:#FEF3C7;border-radius:9px;padding:8px 14px;margin-bottom:18px}
        .umodal-features{text-align:left;margin-bottom:22px;display:flex;flex-direction:column;gap:8px}
        .umodal-feat{font-size:13.5px;color:#374151;display:flex;align-items:center;gap:8px}
        .umodal-btn-pro{width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:8px}
        .umodal-btn-cancel{width:100%;padding:10px;border-radius:12px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        @media(min-width:1100px){.stat-strip{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:1099px) and (min-width:769px){.listing-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px}.stat-strip{grid-template-columns:repeat(2,1fr)}
          .listing-grid{grid-template-columns:1fr}.drawer{width:100%;border-radius:0}
          .field-row{grid-template-columns:1fr}.share-socials{grid-template-columns:1fr}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}.content{padding:12px 12px}.photo-grid{grid-template-columns:repeat(3,1fr)}
        }
      `}</style>

      {/* Share Modal */}
      <div className={`share-modal-bg${shareId ? ' open' : ''}`} onClick={() => setShareId(null)}>
        <div className="share-modal" onClick={e => e.stopPropagation()}>
          <div className="share-title">🔗 Share Listing</div>
          <div className="share-sub">Share this listing with potential tenants</div>
          <div className="share-url-box">
            <input className="share-url-input" readOnly value={shareId ? getShareUrl(shareId) : ''} />
            <button className={`share-copy-btn${shareCopied ? ' copied' : ''}`} onClick={() => shareId && copyShareUrl(shareId)}>
              {shareCopied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <div className="share-socials">
            <button className="share-soc-btn" onClick={() => { if (shareId) window.open(`https://wa.me/?text=${encodeURIComponent('Check out this rental listing: ' + getShareUrl(shareId))}`) }}>💬 WhatsApp</button>
            <button className="share-soc-btn" onClick={() => { if (shareId) window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl(shareId))}`) }}>📘 Facebook</button>
            <button className="share-soc-btn" onClick={() => { if (shareId) window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('🏠 Rental available!')}&url=${encodeURIComponent(getShareUrl(shareId))}`) }}>🐦 Twitter / X</button>
            <button className="share-soc-btn" onClick={() => { if (shareId) window.open(`mailto:?subject=Rental Listing&body=${encodeURIComponent('Check out this rental listing: ' + getShareUrl(shareId))}`) }}>📧 Email</button>
          </div>
          <button className="share-close-btn" onClick={() => setShareId(null)}>Close</button>
        </div>
      </div>

      {/* Drawer */}
      <div className={`drawer-overlay${drawer ? ' open' : ''}`} onClick={() => setDrawer(null)} />
      <div className={`drawer${drawer ? ' open' : ''}`}>
        <div className="dr-head">
          <span className="dr-title">
            {drawer === 'add' ? 'New Listing' : 'Edit Listing'}
            <span className="ai-badge">✨ AI</span>
          </span>
          <button className="dr-close" onClick={() => setDrawer(null)}>✕</button>
        </div>
        <div className="dr-body">

          {/* ── AI WRITER ── */}
          <div style={{ background: 'linear-gradient(135deg,rgba(124,58,237,.06),rgba(37,99,235,.06))', border: '1.5px solid rgba(124,58,237,.15)', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4C1D95', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✨ AI Listing Writer
              <span style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED', background: 'rgba(124,58,237,.1)', padding: '1px 7px', borderRadius: 99 }}>Beta</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
              Fill in property, bedrooms, bathrooms & rent — then let AI generate a professional title and description instantly.
            </div>
            <button
              className="ai-btn"
              disabled={aiLoading || !form.property_id}
              onClick={handleAiWrite}>
              {aiLoading && <span className="ai-btn-shimmer" />}
              {aiLoading ? '✨ Writing your listing...' : '✨ Generate with AI'}
            </button>
            {aiSuccess && (
              <div className="ai-success">✓ Title and description generated! Review and edit below.</div>
            )}
            {aiError && (
              <div className="ai-error">⚠️ {aiError}</div>
            )}
          </div>

          {/* Photos */}
          <div style={{ marginBottom: 16 }}>
            <div className="photo-section-label">
              <span>Photos</span>
              <span className={`photo-req${totalPhotosInForm >= 4 ? ' ok' : ''}`}>
                {totalPhotosInForm}/4 min {totalPhotosInForm >= 4 ? '✓' : ''}
              </span>
            </div>
            {totalPhotosInForm > 0 && (
              <div className="photo-grid">
                {existingPhotos.map((url, i) => (
                  <div key={`ex-${i}`} className="photo-thumb">
                    <img src={url} alt="" />
                    <button className="photo-thumb-del" onClick={() => removeExistingPhoto(url)}>✕</button>
                  </div>
                ))}
                {photoPreviews.map((url, i) => (
                  <div key={`nw-${i}`} className="photo-thumb">
                    <img src={url} alt="" />
                    <button className="photo-thumb-del" onClick={() => removeNewPhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {totalPhotosInForm < 8 && (
              <div className="photo-upload-zone" onClick={() => photoInputRef.current?.click()}>
                📷 {totalPhotosInForm === 0 ? 'Click to add photos (min 4 required)' : 'Add more photos'}
                <div style={{ fontSize: 11, marginTop: 3, color: '#94A3B8' }}>{8 - totalPhotosInForm} slot{8 - totalPhotosInForm !== 1 ? 's' : ''} remaining · JPG, PNG</div>
              </div>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />
            {totalPhotosInForm > 0 && totalPhotosInForm < 4 && (
              <div className="photo-warn">⚠️ Add {4 - totalPhotosInForm} more photo{4 - totalPhotosInForm !== 1 ? 's' : ''} to publish</div>
            )}
          </div>

          <div className="field">
            <label>Property *</label>
            <select value={form.property_id} onChange={e => {
              setForm(f => ({ ...f, property_id: e.target.value, unit_id: '' }))
              loadUnitsForProperty(e.target.value)
            }}>
              <option value="">Select property</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unit</label>
            <select value={form.unit_id} onChange={e => {
              const u = units.find(u => u.id === e.target.value)
              setForm(f => ({ ...f, unit_id: e.target.value, rent_amount: u ? String(u.monthly_rent) : f.rent_amount }))
            }}>
              <option value="">Select unit (optional)</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.unit_number} — ${u.monthly_rent}/mo</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Bedrooms</label>
              <input type="number" min="0" value={form.bedrooms} onChange={e => setForm(f => ({ ...f, bedrooms: e.target.value }))} />
            </div>
            <div className="field">
              <label>Bathrooms</label>
              <input type="number" min="1" value={form.bathrooms} onChange={e => setForm(f => ({ ...f, bathrooms: e.target.value }))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Rent / Month ($)</label>
              <input type="number" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} placeholder="0" />
            </div>
            <div className="field">
              <label>Available From</label>
              <input type="date" value={form.available_from} onChange={e => setForm(f => ({ ...f, available_from: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Listing['status'] }))}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="taken">Taken</option>
            </select>
          </div>

          {/* Title + Description AFTER AI can fill them */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              Content
              {aiSuccess && <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,.1)', padding: '1px 7px', borderRadius: 99 }}>✨ AI Generated</span>}
            </div>
            <div className="field">
              <label>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Bright 2BR in Colombo 03" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the property — or use AI to generate above..." style={{ minHeight: 110 }} />
            </div>
          </div>

        </div>
        <div className="dr-footer">
          <button className="dr-cancel" onClick={() => setDrawer(null)}>Cancel</button>
          <button className="dr-save" disabled={saving} onClick={handleSave}>
            {uploadingPhotos ? '⬆ Uploading…' : saving ? 'Saving…' : drawer === 'add' ? 'Create Listing' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      <div className={`del-overlay${deleteId ? ' open' : ''}`}>
        <div className="del-box">
          <div className="del-ico">🗑️</div>
          <div className="del-title">Delete Listing?</div>
          <div className="del-sub">This will permanently remove the listing.</div>
          <div className="del-actions">
            <button className="del-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="del-confirm" onClick={handleDelete}>Delete</button>
          </div>
        </div>
      </div>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

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
            <a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance</a>
            <a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item active"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-upgrade">
              <div className="sb-up-title">⭐ Upgrade to Pro</div>
              <div className="sb-up-sub">Unlimited listings & AI features.</div>
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Listings</b></div>
            </div>
            <button className="btn-primary" onClick={openAdd}>+ New Listing</button>
          </div>

          <div className="content">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 400, color: '#0F172A', letterSpacing: '-.5px', marginBottom: 3 }}>
                Listings
                <span className="ai-badge">✨ AI</span>
              </div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>{counts.all} listing{counts.all !== 1 ? 's' : ''} · {counts.active} active · AI-powered descriptions available</div>
            </div>

            <div className="stat-strip">
              {[{ ico: '📋', bg: '#EFF6FF', n: counts.all, l: 'Total' },
              { ico: '✅', bg: '#DCFCE7', n: counts.active, l: 'Active' },
              { ico: '📝', bg: '#FEF3C7', n: counts.draft, l: 'Drafts' },
              { ico: '🔑', bg: '#F0FDF4', n: counts.taken, l: 'Taken' }].map(s => (
                <div key={s.l} className="sstat">
                  <div className="sstat-ico" style={{ background: s.bg }}>{s.ico}</div>
                  <div><div className="sstat-num">{s.n}</div><div className="sstat-lbl">{s.l}</div></div>
                </div>
              ))}
            </div>

            <div className="filter-row-wrap">
              <div className="filter-tabs">
                {(['all', 'active', 'draft', 'pending', 'taken'] as const).map(f => (
                  <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}<span className="fc">{counts[f]}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="listing-grid">
                {[1, 2, 3].map(i => (
                  <div key={i} className="listing-card">
                    <div className="skeleton" style={{ height: 160 }} />
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="skeleton" style={{ height: 14, width: '80%' }} />
                      <div className="skeleton" style={{ height: 11, width: '55%' }} />
                      <div className="skeleton" style={{ height: 20, width: '40%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="e-ico">📋</div>
                <div className="e-title">{filter === 'all' ? 'No listings yet' : `No ${filter} listings`}</div>
                <div className="e-sub">Create your first listing — use AI to write the perfect description.</div>
                {filter === 'all' && <button className="btn-primary" style={{ margin: '0 auto' }} onClick={openAdd}>+ New Listing</button>}
              </div>
            ) : (
              <div className="listing-grid">
                {filtered.map((l) => {
                  const sc = STATUS_CFG[l.status] || STATUS_CFG.draft
                  const hasPhotos = l.photos && l.photos.length > 0
                  return (
                    <div key={l.id} className="listing-card">
                      <div className="lc-banner">
                        {hasPhotos
                          ? <img className="lc-banner-img" src={l.photos[0]} alt={l.title} />
                          : <div className="lc-banner-placeholder">🏠</div>
                        }
                        {hasPhotos && l.photos.length > 1 && (
                          <div className="lc-photo-count">📷 {l.photos.length} photos</div>
                        )}
                        <span className="lc-status" style={{ background: sc.bg, color: sc.color }}>● {sc.label}</span>
                      </div>
                      <div className="lc-body">
                        <div className="lc-title">{l.title}</div>
                        <div className="lc-sub">📍 {l.property}{l.unit !== '—' ? ` · ${l.unit}` : ''}</div>
                        <div className="lc-price">${l.rent_amount.toLocaleString()}<span style={{ fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: 500, color: '#94A3B8' }}>/mo</span></div>
                        <div className="lc-facts">
                          {l.bedrooms > 0 && <span className="lc-fact">🛏 {l.bedrooms} bed</span>}
                          <span className="lc-fact">🚿 {l.bathrooms} bath</span>
                          {l.available_from && <span className="lc-fact">📅 {fmtDate(l.available_from)}</span>}
                        </div>
                        {l.description && <div className="lc-desc">{l.description}</div>}
                      </div>
                      <div className="lc-footer">
                        <button className="lf-btn" onClick={() => openEdit(l)}>✏️ Edit</button>
                        {l.status === 'draft' && <button className="lf-btn lf-btn-green" onClick={() => toggleStatus(l.id, 'active')}>▶ Publish</button>}
                        {l.status === 'active' && <button className="lf-btn" onClick={() => toggleStatus(l.id, 'pending')}>⏸ Pause</button>}
                        {l.status === 'pending' && <button className="lf-btn lf-btn-green" onClick={() => toggleStatus(l.id, 'active')}>▶ Resume</button>}
                        {l.status === 'taken' && <button className="lf-btn lf-btn-green" onClick={() => toggleStatus(l.id, 'active')}>▶ Re-list</button>}
                        <button className="lf-btn lf-btn-share" onClick={() => { setShareId(l.id); setShareCopied(false) }}>🔗 Share</button>
                        <button className="lf-btn lf-btn-red" onClick={() => setDeleteId(l.id)}>🗑️</button>
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
            <div className="umodal-icon">📋</div>
            <div className="umodal-title">Unlock More Listings</div>
            <div className="umodal-sub">You've reached the Free plan limit of 2 active listings. Upgrade to Pro for unlimited.</div>
            <div className="umodal-limit">⚠️ Free plan: 2 active listings max</div>
            <div className="umodal-features">
              {['Unlimited active listings', 'AI listing writer (unlimited use)', 'Featured listing placement', 'Advanced analytics & reports'].map(f => (
                <div key={f} className="umodal-feat"><span style={{ color: '#16A34A' }}>✓</span>{f}</div>
              ))}
            </div>
            <button className="umodal-btn-pro" onClick={() => { setShowUpgradeModal(false); window.location.href = '/landlord/upgrade' }}>⭐ Upgrade to Pro →</button>
            <button className="umodal-btn-cancel" onClick={() => setShowUpgradeModal(false)}>Maybe later</button>
          </div>
        </div>
      )}
    </>
  )
}
