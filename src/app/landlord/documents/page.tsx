'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

type Doc = {
  id: string
  name: string
  type: 'lease' | 'inspection' | 'insurance' | 'invoice' | 'notice' | 'contract' | 'other'
  file_url: string | null
  file_size: number | null
  shared_with: string[] | null
  created_at: string
  property_name: string
  tenant_name: string
}

const TYPE_CFG = {
  lease: { label: 'Lease', ico: '📄', bg: '#EFF6FF', color: '#2563EB' },
  invoice: { label: 'Invoice', ico: '🧾', bg: '#F0FDF4', color: '#16A34A' },
  notice: { label: 'Notice', ico: '📢', bg: '#FEF3C7', color: '#D97706' },
  contract: { label: 'Contract', ico: '📋', bg: '#F5F3FF', color: '#7C3AED' },
  inspection: { label: 'Inspection', ico: '🔍', bg: '#FFF7ED', color: '#EA580C' },
  insurance: { label: 'Insurance', ico: '🛡️', bg: '#F0FDF4', color: '#15803D' },
  other: { label: 'Other', ico: '📁', bg: '#F1F5F9', color: '#64748B' },
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DocumentsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [userId, setUserId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Doc['type']>('all')
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [properties, setProperties] = useState<{ id: string, name: string }[]>([])
  const [tenants, setTenants] = useState<{ id: string, name: string }[]>([])
  const [isPro, setIsPro] = useState(false)
  const FREE_DOC_LIMIT = 5
  const [form, setForm] = useState({
    name: '', type: 'lease' as Doc['type'],
    property_id: '', tenant_id: '',
  })

  // ── LOAD ──────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const name = user.user_metadata?.full_name || 'User'
        setFullName(name)
        setUserId(user.id)
        setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

        // Check subscription plan
        const { data: sub } = await supabase
          .from('subscriptions').select('plan,status').eq('profile_id', user.id).single()
        setIsPro(sub?.plan === 'pro' && sub?.status === 'active')

        // Load properties for upload form
        const { data: props } = await supabase
          .from('properties').select('id, name').eq('landlord_id', user.id)
        setProperties(props || [])

        const propIds = (props || []).map((p: any) => p.id)

        // Load tenants for upload form (flat - no nested joins)
        if (propIds.length > 0) {
          const { data: tns } = await supabase
            .from('tenants').select('id, profile_id').in('property_id', propIds).eq('status', 'active')
          const tpids = [...new Set((tns || []).map((t: any) => t.profile_id).filter(Boolean))]
          if (tpids.length) {
            const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', tpids)
            const profMap: Record<string, string> = {}
              ; (profs || []).forEach((p: any) => { profMap[p.id] = p.full_name })
            setTenants((tns || []).map((t: any) => ({ id: t.id, name: profMap[t.profile_id] || 'Unknown' })))
          }
        }

        // Load documents
        if (propIds.length === 0) { setLoading(false); return }

        const { data: rawDocs, error } = await supabase
          .from('documents')
          .select('id,name,type,file_url,file_size,shared_with,created_at,property_id,tenant_id')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error

        // flat prop name lookup
        const propNameMap: Record<string, string> = {}
          ; (props || []).forEach((p: any) => { propNameMap[p.id] = p.name })

        // flat tenant→profile name lookup for docs
        const docTenantIds = [...new Set((rawDocs || []).map((d: any) => d.tenant_id).filter(Boolean))]
        const docTenantNameMap: Record<string, string> = {}
        if (docTenantIds.length) {
          const { data: dtArr } = await supabase.from('tenants').select('id,profile_id').in('id', docTenantIds)
          const dpids = [...new Set((dtArr || []).map((t: any) => t.profile_id).filter(Boolean))]
          if (dpids.length) {
            const { data: dpArr } = await supabase.from('profiles').select('id,full_name').in('id', dpids)
            const dpMap: Record<string, string> = {}
              ; (dpArr || []).forEach((p: any) => { dpMap[p.id] = p.full_name })
              ; (dtArr || []).forEach((t: any) => { docTenantNameMap[t.id] = dpMap[t.profile_id] || 'Unknown' })
          }
        }

        const shaped: Doc[] = (rawDocs || []).map((d: any) => ({
          id: d.id, name: d.name, type: d.type || 'other',
          file_url: d.file_url, file_size: d.file_size,
          shared_with: d.shared_with, created_at: d.created_at,
          property_name: propNameMap[d.property_id] || '—',
          tenant_name: docTenantNameMap[d.tenant_id] || '—',
        }))
        setDocs(shaped)
      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const filtered = docs.filter(d => {
    const typeOk = filter === 'all' || d.type === filter
    const searchOk = search === '' ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.property_name.toLowerCase().includes(search.toLowerCase()) ||
      d.tenant_name.toLowerCase().includes(search.toLowerCase())
    return typeOk && searchOk
  })

  const counts: Record<string, number> = { all: docs.length }
  docs.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1 })

  // ── UPLOAD ────────────────────────────────────────────────
  async function handleUpload() {
    if (!isPro && docs.length >= FREE_DOC_LIMIT) {
      setUploadErr(`Free plan is limited to ${FREE_DOC_LIMIT} documents. Upgrade to Pro for unlimited storage.`)
      return
    }
    if (!form.name.trim()) { setUploadErr('Document name is required.'); return }
    setUploading(true)
    setUploadErr(null)
    try {
      const supabase = createClient()
      let file_url: string | null = null
      let file_size: number | null = null

      // Upload file to Supabase Storage if one is selected
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop()
        const path = `${userId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(path, selectedFile)
        if (uploadError) throw new Error(uploadError.message)
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        file_url = urlData.publicUrl
        file_size = selectedFile.size
      }

      const payload: any = {
        owner_id: userId,
        name: form.name.trim(),
        type: form.type,
        file_url: file_url || '',
        file_size,
        shared_with: [],
      }
      if (form.property_id) payload.property_id = form.property_id
      if (form.tenant_id) payload.tenant_id = form.tenant_id

      const { data: newDoc, error: dbErr } = await supabase
        .from('documents').insert(payload).select().single()
      if (dbErr) throw new Error(dbErr.message)

      const propName = properties.find(p => p.id === form.property_id)?.name || '—'
      const tenName = tenants.find(t => t.id === form.tenant_id)?.name || '—'

      setDocs(prev => [{
        ...newDoc,
        property_name: propName,
        tenant_name: tenName,
      }, ...prev])

      setUploadOpen(false)
      setSelectedFile(null)
      setForm({ name: '', type: 'lease', property_id: '', tenant_id: '' })
    } catch (err: any) {
      setUploadErr(err?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── TOGGLE SHARED ─────────────────────────────────────────
  // shared_with is uuid[] — store tenant profile IDs or empty array
  // When sharing, we store all active tenant profile_ids for this document's property
  async function toggleShared(id: string, current: string[] | null) {
    try {
      const supabase = createClient()
      const isShared = current && current.length > 0
      let newVal: string[] = []

      if (!isShared) {
        // Find the doc to get its property_id
        const doc = docs.find(d => d.id === id)
        // Get all active tenant profile_ids for this property
        const { data: tArr } = await supabase
          .from('tenants')
          .select('profile_id')
          .eq('property_id', doc ? (await supabase.from('documents').select('property_id').eq('id', id).single()).data?.property_id : '')
          .eq('status', 'active')
        newVal = (tArr || []).map((t: any) => t.profile_id).filter(Boolean)
        // If no tenants found, still mark as shared using a sentinel: store userId (owner)
        // as a signal that sharing is enabled — it's a valid UUID
        if (newVal.length === 0) newVal = [userId]
      }

      const { error } = await supabase
        .from('documents')
        .update({ shared_with: newVal })
        .eq('id', id)
        .select()
      if (error) {
        console.error('Share error:', error)
        alert('Failed to update share status: ' + (error.message || error.code))
        return
      }
      setDocs(prev => prev.map(d => d.id === id ? { ...d, shared_with: newVal } : d))
    } catch (err: any) {
      console.error('Toggle shared error:', err)
      alert('Error: ' + (err?.message || 'Unknown'))
    }
  }

  // ── DELETE ────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const supabase = createClient()
      const doc = docs.find(d => d.id === deleteId)
      // Delete from storage if has file
      if (doc?.file_url) {
        const path = doc.file_url.split('/documents/')[1]
        if (path) await supabase.storage.from('documents').remove([path])
      }
      await supabase.from('documents').delete().eq('id', deleteId)
      setDocs(prev => prev.filter(d => d.id !== deleteId))
      setDeleteId(null)
    } catch (err) {
      console.error('Delete error:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;max-width:100vw;box-sizing:border-box}
        .shell{display:flex;min-height:100vh;width:100%;position:relative}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,0.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
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
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.breadcrumb b{color:#0F172A;font-weight:700}
        .btn-primary{padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,0.28);transition:all .18s;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:5px}
        .btn-primary:hover{transform:translateY(-1px)}
        .btn-primary:disabled{opacity:.6;cursor:not-allowed}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}
        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;letter-spacing:-0.5px;margin-bottom:4px}
        .page-sub{font-size:13px;color:#94A3B8;margin-bottom:20px}
        .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;width:100%}
        .search-wrap{position:relative;flex:1;min-width:160px}
        .search-ico{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px}
        .search-input{width:100%;padding:9px 12px 9px 36px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;background:#fff}
        .search-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.08)}
        .type-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;white-space:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
        .type-tabs::-webkit-scrollbar{display:none}
        .ttab{padding:6px 12px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .ttab:hover{background:#F1F5F9;color:#0F172A}
        .ttab.active{background:#2563EB;color:#fff}
        .ttab .tc{font-size:10px;font-weight:700;background:rgba(255,255,255,0.25);border-radius:99px;padding:1px 5px}
        .ttab:not(.active) .tc{background:#F1F5F9;color:#64748B}
        /* DOC LIST — horizontal row design */
        .doc-list{display:flex;flex-direction:column;gap:0;background:#fff;border:1px solid #E2E8F0;border-radius:16px;box-shadow:0 1px 4px rgba(15,23,42,0.04);overflow:hidden;width:100%}
        .doc-list-head{display:grid;grid-template-columns:1fr 110px 110px 130px 90px;gap:0;padding:10px 18px;border-bottom:1px solid #F1F5F9;background:#FAFBFF}
        .dlh{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px}
        .doc-row{display:grid;grid-template-columns:1fr 110px 110px 130px 90px;gap:0;padding:14px 18px;border-bottom:1px solid #F8FAFC;align-items:center;transition:background .12s}
        .doc-row:last-child{border-bottom:none}
        .doc-row:hover{background:#FAFBFF}
        .dr-main{display:flex;align-items:center;gap:12px;min-width:0}
        .dr-ico{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .dr-name{font-size:13.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
        .dr-sub{font-size:11.5px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .dr-tag{display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;border-radius:99px;padding:3px 10px;white-space:nowrap}
        .dr-info{font-size:12px;color:#64748B;white-space:nowrap}
        .dr-date{font-size:12px;color:#64748B;white-space:nowrap}
        .dr-actions{display:flex;gap:6px;justify-content:flex-end}
        .df-btn{padding:5px 11px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
        .df-btn:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .df-btn-red{border-color:transparent;background:transparent;color:#94A3B8;padding:5px 8px}
        .df-btn-red:hover{border-color:#FCA5A5!important;color:#DC2626!important;background:#FEF2F2!important}
        /* Mobile card fallback */
        .doc-mobile-cards{display:none;flex-direction:column;gap:10px}
        .dmc{background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;padding:14px 16px;box-shadow:0 1px 4px rgba(15,23,42,0.04);display:flex;align-items:center;gap:12px}
        .dmc-info{flex:1;min-width:0}
        .dmc-name{font-size:13.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
        .dmc-sub{font-size:11.5px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
        .dmc-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dmc-size{font-size:11px;color:#94A3B8}
        .dmc-actions{display:flex;gap:6px;flex-shrink:0;flex-direction:column;align-items:flex-end}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .skel-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:12px}
        .empty-state{text-align:center;padding:80px 20px}
        .e-ico{font-size:48px;margin-bottom:14px}
        .e-title{font-size:17px;font-weight:700;color:#475569;margin-bottom:6px}
        .e-sub{font-size:13.5px;color:#94A3B8;margin-bottom:20px}
        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:400;align-items:center;justify-content:center}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:20px;padding:28px;width:460px;box-shadow:0 24px 64px rgba(15,23,42,0.18);display:flex;flex-direction:column;gap:16px;max-height:90vh;overflow-y:auto}
        .modal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:400;color:#0F172A}
        .upload-zone{border:2px dashed #E2E8F0;border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:all .15s;font-size:13.5px;color:#94A3B8;line-height:1.6}
        .upload-zone:hover{border-color:#3B82F6;background:#F0F9FF;color:#2563EB}
        .upload-zone.has-file{border-color:#16A34A;background:#F0FDF4;color:#16A34A}
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12.5px;font-weight:700;color:#374151}
        .field input,.field select{padding:10px 14px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border-color .15s}
        .field input:focus,.field select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .err-box{padding:10px 14px;background:#FEE2E2;color:#DC2626;border-radius:10px;font-size:13px;font-weight:600}
        .modal-actions{display:flex;gap:10px}
        .btn-cancel{flex:1;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-save{flex:2;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .btn-save:disabled{opacity:0.6;cursor:not-allowed}
        .del-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;align-items:center;justify-content:center}
        .del-overlay.open{display:flex}
        .del-box{background:#fff;border-radius:20px;padding:28px;width:340px;box-shadow:0 24px 64px rgba(15,23,42,0.2);text-align:center}
        .del-ico{font-size:36px;margin-bottom:12px}
        .del-title{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .del-sub{font-size:13px;color:#64748B;line-height:1.6;margin-bottom:22px}
        .del-actions{display:flex;gap:10px}
        .del-cancel{flex:1;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-confirm{flex:1;padding:10px;border-radius:10px;border:none;background:#DC2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .del-confirm:disabled{opacity:0.6;cursor:not-allowed}
        .limit-banner{background:linear-gradient(135deg,#FEF3C7,#FDE68A);border:1.5px solid #F59E0B;border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .limit-banner-text{font-size:13px;font-weight:600;color:#92400E;flex:1}
        .limit-banner-btn{padding:7px 16px;border-radius:8px;background:#D97706;color:#fff;border:none;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap;flex-shrink:0}
        @media(max-width:900px){
          .doc-list-head{display:none}
          .doc-row{grid-template-columns:1fr auto;gap:8px}
          .doc-row .dr-info,.doc-row .dr-date{display:none}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 14px}
          .content{padding:14px 14px}
          .toolbar{flex-direction:column;align-items:stretch;gap:8px}
          .search-wrap{min-width:unset;width:100%}
          .type-tabs{width:100%;overflow-x:auto}
          .doc-list{display:none}
          .doc-mobile-cards{display:flex}
          .modal{width:95vw;padding:20px}
          .field-row{grid-template-columns:1fr}
          .del-box{width:90vw}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}
          .content{padding:12px 12px}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Upload Modal */}
      <div className={`modal-overlay${uploadOpen ? ' open' : ''}`}>
        <div className="modal">
          <div className="modal-title">Upload Document 📁</div>

          <div
            className={`upload-zone${selectedFile ? ' has-file' : ''}`}
            onClick={() => fileRef.current?.click()}>
            {selectedFile
              ? `✅ ${selectedFile.name} (${fmtSize(selectedFile.size)})`
              : '📎 Click to select a file\nPDF, DOCX, PNG — max 10MB'}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }}
            accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) {
                setSelectedFile(f)
                if (!form.name) setForm(prev => ({ ...prev, name: f.name.replace(/\.[^/.]+$/, '') }))
              }
            }} />

          <div className="field">
            <label>Document Name *</label>
            <input placeholder="e.g. Lease Agreement — John"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Document Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Doc['type'] }))}>
                <option value="lease">Lease</option>
                <option value="invoice">Invoice</option>
                <option value="notice">Notice</option>
                <option value="contract">Contract</option>
                <option value="inspection">Inspection</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Property</label>
              <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">— None —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Tenant <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
            <select value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
              <option value="">— None —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {uploadErr && <div className="err-box">⚠️ {uploadErr}</div>}

          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => { setUploadOpen(false); setSelectedFile(null); setUploadErr(null) }}>Cancel</button>
            <button className="btn-save" disabled={uploading} onClick={handleUpload}>
              {uploading ? 'Uploading…' : '+ Upload Document'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      <div className={`del-overlay${deleteId ? ' open' : ''}`}>
        <div className="del-box">
          <div className="del-ico">🗑️</div>
          <div className="del-title">Delete Document?</div>
          <div className="del-sub">This will permanently delete the file. This cannot be undone.</div>
          <div className="del-actions">
            <button className="del-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="del-confirm" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting…' : 'Yes, Delete'}
            </button>
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
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a>
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance</a>
            <a href="/landlord/documents" className="sb-item active"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-upgrade">
              <div className="sb-up-title">⭐ Upgrade to Pro</div>
              <div className="sb-up-sub">Unlimited storage & e-signature support.</div>
              <button className="sb-up-btn">See Plans →</button>
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Documents</b></div>
            </div>
            <button className="btn-primary"
              disabled={!isPro && docs.length >= FREE_DOC_LIMIT}
              onClick={() => {
                if (!isPro && docs.length >= FREE_DOC_LIMIT) return
                setUploadOpen(true); setUploadErr(null)
              }}>
              {!isPro && docs.length >= FREE_DOC_LIMIT ? '🔒 Limit Reached' : '+ Upload'}
            </button>
          </div>

          <div className="content">
            <div className="page-title">Documents</div>
            <div className="page-sub">{docs.length} file{docs.length !== 1 ? 's' : ''} — leases, invoices, notices & contracts</div>

            {!isPro && docs.length >= FREE_DOC_LIMIT && (
              <div className="limit-banner">
                <div className="limit-banner-text">
                  📁 You've used {docs.length}/{FREE_DOC_LIMIT} documents on the Free plan. Upgrade to Pro for unlimited storage.
                </div>
                <a href="/landlord/upgrade" className="limit-banner-btn">Upgrade →</a>
              </div>
            )}
            {!isPro && docs.length < FREE_DOC_LIMIT && docs.length > 0 && (
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, textAlign: 'right' }}>
                📁 {docs.length}/{FREE_DOC_LIMIT} documents used on Free plan
              </div>
            )}

            <div className="toolbar">
              <div className="search-wrap">
                <span className="search-ico">🔍</span>
                <input className="search-input" placeholder="Search documents…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="type-tabs">
                {(['all', 'lease', 'invoice', 'notice', 'contract', 'other'] as const).map(t => (
                  <button key={t} className={`ttab${filter === t ? ' active' : ''}`} onClick={() => setFilter(t)}>
                    {t === 'all' ? 'All' : TYPE_CFG[t as Doc['type']]?.label}
                    <span className="tc">{counts[t] || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="doc-list">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid #F8FAFC' }}>
                    <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div className="skeleton" style={{ height: 13, width: '55%' }} />
                      <div className="skeleton" style={{ height: 10, width: '35%' }} />
                    </div>
                    <div className="skeleton" style={{ height: 22, width: 60, borderRadius: 99 }} />
                    <div className="skeleton" style={{ height: 10, width: 50 }} />
                    <div className="skeleton" style={{ height: 10, width: 80 }} />
                    <div className="skeleton" style={{ height: 30, width: 100, borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="e-ico">📁</div>
                <div className="e-title">{docs.length === 0 ? 'No documents yet' : 'No documents match'}</div>
                <div className="e-sub">{docs.length === 0 ? 'Upload leases, contracts and notices to keep everything in one place.' : 'Try a different filter or search.'}</div>
                {docs.length === 0 && (
                  <button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => setUploadOpen(true)}>+ Upload Document</button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table list */}
                <div className="doc-list">
                  <div className="doc-list-head">
                    <div className="dlh">Document</div>
                    <div className="dlh">Type</div>
                    <div className="dlh">Size</div>
                    <div className="dlh">Uploaded</div>
                    <div className="dlh" style={{ textAlign: 'right' }}>Actions</div>
                  </div>
                  {filtered.map(d => {
                    const tc = TYPE_CFG[d.type] || TYPE_CFG.other
                    return (
                      <div key={d.id} className="doc-row">
                        <div className="dr-main">
                          <div className="dr-ico" style={{ background: tc.bg }}>{tc.ico}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="dr-name">{d.name}</div>
                            <div className="dr-sub">
                              {[d.tenant_name !== '—' ? d.tenant_name : null, d.property_name !== '—' ? d.property_name : null].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </div>
                        </div>
                        <div><span className="dr-tag" style={{ background: tc.bg, color: tc.color }}>{tc.label}</span></div>
                        <div className="dr-info">{fmtSize(d.file_size)}</div>
                        <div className="dr-date">{fmtDate(d.created_at)}</div>
                        <div className="dr-actions">
                          {d.file_url
                            ? <a href={d.file_url} target="_blank" rel="noreferrer" className="df-btn">⬇ Download</a>
                            : <button className="df-btn" style={{ opacity: 0.4, cursor: 'not-allowed' }}>⬇</button>
                          }
                          <button className="df-btn df-btn-red" onClick={() => setDeleteId(d.id)}>🗑️</button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Mobile card list */}
                <div className="doc-mobile-cards">
                  {filtered.map(d => {
                    const tc = TYPE_CFG[d.type] || TYPE_CFG.other
                    return (
                      <div key={d.id} className="dmc">
                        <div className="dr-ico" style={{ background: tc.bg, width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{tc.ico}</div>
                        <div className="dmc-info">
                          <div className="dmc-name">{d.name}</div>
                          <div className="dmc-sub">
                            {[d.tenant_name !== '—' ? d.tenant_name : null, d.property_name !== '—' ? d.property_name : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                          <div className="dmc-footer">
                            <span className="dr-tag" style={{ background: tc.bg, color: tc.color, fontSize: 11, padding: '2px 8px' }}>{tc.label}</span>
                            <span className="dmc-size">{fmtSize(d.file_size)} · {fmtDate(d.created_at)}</span>
                          </div>
                        </div>
                        <div className="dmc-actions">
                          {d.file_url
                            ? <a href={d.file_url} target="_blank" rel="noreferrer" className="df-btn" style={{ padding: '6px 10px', fontSize: 11.5 }}>⬇</a>
                            : <button className="df-btn" style={{ opacity: 0.4, cursor: 'not-allowed', padding: '6px 10px' }}>⬇</button>
                          }
                          <button className="df-btn df-btn-red" style={{ padding: '6px 8px' }} onClick={() => setDeleteId(d.id)}>🗑️</button>
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
