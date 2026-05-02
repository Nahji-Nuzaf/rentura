'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read: boolean
  created_at: string
  from: 'me' | 'them'
}

type Conversation = {
  tenantId: string
  name: string
  initials: string
  color: string
  property: string
  unit: string
  lastMsg: string
  lastTime: string
  unread: number
  messages: Message[]
}

const COLORS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F87171)',
  'linear-gradient(135deg,#0EA5E9,#38BDF8)',
  'linear-gradient(135deg,#10B981,#34D399)',
  'linear-gradient(135deg,#F59E0B,#FCD34D)',
  'linear-gradient(135deg,#EC4899,#F9A8D4)',
]

const AI_TEMPLATES = [
  { label: '💰 Rent Reminder', prompt: (name: string) => `Write a professional and friendly rent reminder message to a tenant named ${name}. Keep it under 3 sentences. Don't use placeholders like [amount] - just say their rent is due.` },
  { label: '🔧 Maintenance Update', prompt: (name: string) => `Write a short professional update message to tenant ${name} letting them know their maintenance request has been received and is being looked into. Keep it friendly and under 3 sentences.` },
  { label: '📋 Lease Renewal', prompt: (name: string) => `Write a friendly message to tenant ${name} about upcoming lease renewal. Mention you'd like to discuss renewal terms and ask them to get in touch. Keep it under 3 sentences.` },
  { label: '👋 Welcome', prompt: (name: string) => `Write a warm welcome message to a new tenant named ${name}. Introduce yourself as their landlord and let them know you're available if they need anything. Keep it under 3 sentences.` },
  { label: '⚠️ Late Payment', prompt: (name: string) => `Write a polite but firm message to tenant ${name} about a late rent payment. Ask them to get in touch to discuss. Keep it professional and under 3 sentences.` },
  { label: '🏠 Property Notice', prompt: (name: string) => `Write a professional notice message to tenant ${name} informing them of an upcoming property inspection or visit. Ask them to confirm availability. Keep it under 3 sentences.` },
]

function fmtTime(ts: string) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  const router = useRouter()
  const { isPro, plan } = usePro()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [userId, setUserId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [convos, setConvos] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  const planLabel = isPro ? plan.toUpperCase() : 'FREE'
  const planColor = isPro
    ? { color: '#FCD34D', bg: 'rgba(251,191,36,.14)', border: 'rgba(251,191,36,.3)' }
    : { color: '#60A5FA', bg: 'rgba(59,130,246,.14)', border: 'rgba(59,130,246,.25)' }


  // AI template state
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const active = convos.find(c => c.tenantId === activeId) || null
  const filteredConvos = search
    ? convos.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : convos
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0)

  async function loadConversations(uid: string) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id,name').eq('landlord_id', uid)
      const propIds = (props || []).map((p: any) => p.id)
      if (!propIds.length) { setConvos([]); setLoading(false); return }

      const propNameMap: Record<string, string> = {}
        ; (props || []).forEach((p: any) => { propNameMap[p.id] = p.name })

      const { data: tenants } = await supabase
        .from('tenants').select('id,profile_id,unit_id,property_id')
        .in('property_id', propIds)

      if (!tenants || !tenants.length) { setConvos([]); setLoading(false); return }

      const unitIds = [...new Set(tenants.map((t: any) => t.unit_id).filter(Boolean))]
      const { data: unitsData } = await supabase.from('units').select('id,unit_number').in('id', unitIds)
      const unitMap: Record<string, string> = {}
        ; (unitsData || []).forEach((u: any) => { unitMap[u.id] = u.unit_number })

      const profileIds = [...new Set(tenants.map((t: any) => t.profile_id).filter(Boolean))]
      const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', profileIds)
      const profileMap: Record<string, string> = {}
        ; (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name })

      const { data: messages } = await supabase
        .from('messages').select('id,sender_id,receiver_id,content,read,created_at')
        .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
        .order('created_at', { ascending: true })

      const shaped: Conversation[] = tenants.map((t: any, i: number) => {
        const pid = t.profile_id
        const name = profileMap[pid] || 'Unknown'
        const msgs = (messages || [])
          .filter((m: any) => (m.sender_id === pid && m.receiver_id === uid) || (m.sender_id === uid && m.receiver_id === pid))
          .map((m: any) => ({
            id: m.id, sender_id: m.sender_id, receiver_id: m.receiver_id,
            content: m.content, read: m.read, created_at: m.created_at,
            from: m.sender_id === uid ? 'me' : 'them',
          })) as Message[]

        const last = msgs[msgs.length - 1]
        const unread = msgs.filter(m => m.from === 'them' && !m.read).length
        return {
          tenantId: pid, name,
          initials: name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          color: COLORS[i % COLORS.length],
          property: propNameMap[t.property_id] || '—',
          unit: unitMap[t.unit_id] || '—',
          lastMsg: last?.content || 'No messages yet',
          lastTime: last ? fmtTime(last.created_at) : '',
          unread, messages: msgs,
        }
      })

      shaped.sort((a, b) => {
        const aL = a.messages[a.messages.length - 1]?.created_at || ''
        const bL = b.messages[b.messages.length - 1]?.created_at || ''
        return bL.localeCompare(aL)
      })

      setConvos(shaped)
      if (window.innerWidth > 768 && !activeId && shaped.length > 0) setActiveId(shaped[0].tenantId)
    } catch (err: any) {
      console.error('Load error:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name); setUserId(user.id)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))
      await loadConversations(user.id)
    }
    init()
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeId, active?.messages.length, showMobileChat])

  async function openConvo(tid: string) {
    setActiveId(tid)
    setShowMobileChat(true)
    setShowAiPanel(false)
    const supabase = createClient()
    await supabase.from('messages').update({ read: true }).eq('sender_id', tid).eq('receiver_id', userId).eq('read', false)
    setConvos(prev => prev.map(c =>
      c.tenantId === tid ? { ...c, unread: 0, messages: c.messages.map(m => ({ ...m, read: true })) } : c
    ))
  }

  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    let channel: any = null
    const initMessages = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const fetchUnread = async () => {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('read', false)
        setUnreadMessages(count || 0)
      }
      await fetchUnread()
      channel = supabase
        .channel('sidebar-unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, fetchUnread)
        .subscribe()
    }
    initMessages()
    return () => { if (channel) createClient().removeChannel(channel) }
  }, [])

  async function sendMessage() {
    if (!input.trim() || !activeId || sending) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('messages')
        .insert({ sender_id: userId, receiver_id: activeId, content: input.trim(), read: false })
        .select('id,sender_id,receiver_id,content,read,created_at').single()
      if (error) throw error
      const newMsg: Message = { ...data, from: 'me' }
      setConvos(prev => prev.map(c =>
        c.tenantId === activeId
          ? { ...c, messages: [...c.messages, newMsg], lastMsg: input.trim(), lastTime: 'Now' }
          : c
      ))
      setInput('')
    } catch (err: any) {
      console.error('Send error:', err?.message)
    } finally {
      setSending(false)
    }
  }

  // ── AI TEMPLATE GENERATOR ─────────────────────────────────
  async function generateTemplate(templateIndex: number) {
    if (!active) return
    setAiLoading(true); setAiError('')
    const tmpl = AI_TEMPLATES[templateIndex]
    const prompt = tmpl.prompt(active.name)

    try {
      const response = await fetch('/api/ai/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await response.json()
      if (data.error) { setAiError(data.error); return }

      const text = (data.text || '').trim()
      if (!text) { setAiError('Empty response. Try again.'); return }

      setInput(text)
      setShowAiPanel(false)
    } catch (err: any) {
      setAiError('Failed to generate. Try again.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow:hidden}
        .shell{display:flex;height:100vh;height:100dvh;overflow:hidden}

        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
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

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden}
        .topbar{height:58px;display:flex;align-items:center;gap:10px;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;flex-shrink:0}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}

        .msg-layout{display:grid;grid-template-columns:300px 1fr;flex:1;overflow:hidden;min-height:0}

        /* CONVO LIST */
        .convo-list{border-right:1px solid #E2E8F0;background:#fff;display:flex;flex-direction:column;overflow:hidden}
        .cl-head{padding:14px 16px;border-bottom:1px solid #E2E8F0;flex-shrink:0}
        .cl-title{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}
        .unread-badge{background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 7px}
        .cl-search{width:100%;padding:8px 12px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border-color .15s}
        .cl-search:focus{border-color:#3B82F6}
        .cl-items{flex:1;overflow-y:auto}.cl-items::-webkit-scrollbar{width:0}
        .convo-item{display:flex;align-items:flex-start;gap:11px;padding:13px 16px;cursor:pointer;border-bottom:1px solid #F8FAFC;transition:background .12s}
        .convo-item:hover{background:#F8FAFC}
        .convo-item.active{background:#EFF6FF;border-left:3px solid #3B82F6}
        .ci-av{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .ci-body{flex:1;min-width:0}
        .ci-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
        .ci-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .ci-time{font-size:11px;color:#94A3B8;flex-shrink:0;margin-left:4px}
        .ci-preview{font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
        .ci-unread{background:#3B82F6;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 6px;flex-shrink:0;margin-left:6px}
        .ci-prop{font-size:11px;color:#94A3B8;margin-top:3px}

        /* CHAT AREA */
        .chat-area{display:flex;flex-direction:column;overflow:hidden;min-height:0;background:#F4F6FA;position:relative}
        .chat-head{padding:14px 20px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .mobile-back{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;margin-right:2px;padding:4px}
        .ch-av{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .ch-name{font-size:14px;font-weight:700;color:#0F172A}
        .ch-sub{font-size:12px;color:#94A3B8}
        .chat-messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}
        .chat-messages::-webkit-scrollbar{width:0}
        .bubble-wrap{display:flex;flex-direction:column}
        .bubble-wrap.me{align-items:flex-end}
        .bubble-wrap.them{align-items:flex-start}
        .bubble{max-width:85%;padding:11px 15px;border-radius:14px;font-size:13.5px;line-height:1.5}
        .bubble.me{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;border-bottom-right-radius:4px}
        .bubble.them{background:#fff;color:#0F172A;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(15,23,42,.08)}
        .bubble-time{font-size:11px;color:#94A3B8;margin-top:3px;padding:0 2px}

        /* AI TEMPLATE PANEL */
        .ai-panel{background:#fff;border-top:1px solid #E2E8F0;padding:14px 16px;flex-shrink:0;animation:slideUp .2s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .ai-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .ai-panel-title{font-size:13px;font-weight:700;color:#4C1D95;display:flex;align-items:center;gap:6px}
        .ai-panel-close{background:none;border:none;cursor:pointer;color:#94A3B8;font-size:16px;padding:2px;line-height:1}
        .ai-templates{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .ai-tmpl-btn{padding:9px 10px;border-radius:10px;border:1.5px solid rgba(124,58,237,.2);background:linear-gradient(135deg,rgba(124,58,237,.05),rgba(37,99,235,.05));color:#4C1D95;font-size:12px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-align:left;transition:all .15s;line-height:1.3}
        .ai-tmpl-btn:hover{background:linear-gradient(135deg,rgba(124,58,237,.12),rgba(37,99,235,.1));border-color:rgba(124,58,237,.4);transform:translateY(-1px)}
        .ai-tmpl-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .ai-error-msg{font-size:12px;color:#DC2626;margin-top:8px;padding:6px 10px;background:#FEE2E2;border-radius:8px}
        .ai-loading-msg{font-size:12px;color:#7C3AED;margin-top:8px;display:flex;align-items:center;gap:6px}

        /* INPUT ROW */
        .chat-input-area{flex-shrink:0;background:#fff;border-top:1px solid #E2E8F0}
        .chat-input-row{padding:12px 16px;display:flex;gap:10px;align-items:center}
        .ai-trigger-btn{width:36px;height:36px;border-radius:10px;border:1.5px solid rgba(124,58,237,.25);background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(37,99,235,.08));color:#7C3AED;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
        .ai-trigger-btn:hover{background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(37,99,235,.15));border-color:rgba(124,58,237,.5)}
        .ai-trigger-btn.active{background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;border-color:transparent}
        .chat-input{flex:1;padding:10px 14px;border-radius:12px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border-color .15s;resize:none;max-height:100px;line-height:1.5}
        .chat-input:focus{border-color:#3B82F6}
        .send-btn{width:40px;height:40px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
        .send-btn:hover:not(:disabled){transform:scale(1.05)}
        .send-btn:disabled{opacity:.5;cursor:not-allowed}

        .empty-chat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;gap:10px;background:#fff}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        @media(max-width:1024px){.msg-layout{grid-template-columns:260px 1fr}.ai-templates{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important}.hamburger{display:block}
          .topbar{padding:0 14px}
          .msg-layout{display:block;position:relative;height:100%;overflow:hidden}
          .convo-list{width:100%;height:100%;position:absolute;inset:0;display:flex;flex-direction:column}
          .convo-list.hidden{display:none}
          .chat-area{position:absolute;inset:0;z-index:10;display:none;flex-direction:column}
          .chat-area.visible{display:flex}
          .mobile-back{display:block}
          .bubble{max-width:90%}
          .ai-templates{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:480px){
          .ai-templates{grid-template-columns:1fr}
          .chat-messages{padding:12px 14px}
        }
      `}</style>

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
            <a href="/landlord/messages" className="sb-item active" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span className="sb-ico">💬</span>Messages
              </span>
              {unreadMessages > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 99,
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px', flexShrink: 0, lineHeight: 1,
                }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
            <a href="/landlord/upgrade" className="sb-item"><span className="sb-ico">⭐</span>Upgrade</a>
          </nav>
          <div className="sb-footer">
            {/* ── Pro users don't need the upgrade nudge */}
            {!isPro && (
              <div className="sb-upgrade">
                <div className="sb-up-title">⭐ Upgrade to Pro</div>
                <div className="sb-up-sub">Unlimited listings & AI features.</div>
                <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
              </div>
            )}
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-uplan" style={{ color: planColor.color, background: planColor.bg, border: `1px solid ${planColor.border}` }}>
                  {planLabel}
                </span>
              </div>
            </div>
            {/* <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              ── FIX: show real plan from usePro()
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">{isPro ? 'PRO' : 'FREE'}</span></div>
            </div> */}
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Messages</b></div>
          </div>

          <div className="msg-layout">
            {/* CONVO LIST */}
            <div className={`convo-list${showMobileChat ? ' hidden' : ''}`}>
              <div className="cl-head">
                <div className="cl-title">
                  Conversations
                  {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}
                </div>
                <input className="cl-search" placeholder="Search tenants..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="cl-items">
                {loading ? [1, 2, 3].map(i => (
                  <div key={i} style={{ padding: '13px 16px', display: 'flex', gap: 11, borderBottom: '1px solid #F8FAFC' }}>
                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}><div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 7 }} /><div className="skeleton" style={{ height: 10, width: '90%' }} /></div>
                  </div>
                )) : convos.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No tenants found</div>
                ) : filteredConvos.map(c => (
                  <div key={c.tenantId} className={`convo-item${activeId === c.tenantId ? ' active' : ''}`} onClick={() => openConvo(c.tenantId)}>
                    <div className="ci-av" style={{ background: c.color }}>{c.initials}</div>
                    <div className="ci-body">
                      <div className="ci-top">
                        <span className="ci-name">{c.name}</span>
                        <span className="ci-time">{c.lastTime}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="ci-preview">{c.lastMsg}</span>
                        {c.unread > 0 && <span className="ci-unread">{c.unread}</span>}
                      </div>
                      <div className="ci-prop">{c.property} · {c.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CHAT AREA */}
            <div className={`chat-area${showMobileChat ? ' visible' : ''}`}>
              {!active ? (
                <div className="empty-chat">
                  <div style={{ fontSize: 40 }}>💬</div>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>Select a conversation</div>
                  <div style={{ fontSize: 13, color: '#94A3B8' }}>Choose a tenant to start messaging</div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="chat-head">
                    <button className="mobile-back" onClick={() => setShowMobileChat(false)}>←</button>
                    <div className="ch-av" style={{ background: active.color }}>{active.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div className="ch-name">{active.name}</div>
                      <div className="ch-sub">{active.property} · {active.unit}</div>
                    </div>
                    {/* AI badge in header */}
                    <div style={{ fontSize: 11, fontWeight: 700, background: 'linear-gradient(135deg,#7C3AED,#2563EB)', color: '#fff', padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                      ✨ AI
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="chat-messages">
                    {active.messages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 13 }}>No messages yet. Say hello! 👋</div>
                    ) : active.messages.map(m => (
                      <div key={m.id} className={`bubble-wrap ${m.from}`}>
                        <div className={`bubble ${m.from}`}>{m.content}</div>
                        <span className="bubble-time">{fmtTime(m.created_at)}</span>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>

                  {/* AI Template Panel */}
                  {showAiPanel && (
                    <div className="ai-panel">
                      <div className="ai-panel-head">
                        <div className="ai-panel-title">
                          ✨ AI Message Templates
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED', background: 'rgba(124,58,237,.1)', padding: '1px 7px', borderRadius: 99 }}>Beta</span>
                        </div>
                        <button className="ai-panel-close" onClick={() => { setShowAiPanel(false); setAiError('') }}>✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                        Click a template to generate a message for <strong>{active.name}</strong>
                      </div>
                      <div className="ai-templates">
                        {AI_TEMPLATES.map((t, i) => (
                          <button key={i} className="ai-tmpl-btn" disabled={aiLoading} onClick={() => generateTemplate(i)}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {aiLoading && <div className="ai-loading-msg"><span>⏳</span> Generating message...</div>}
                      {aiError && <div className="ai-error-msg">⚠️ {aiError}</div>}
                    </div>
                  )}

                  {/* Input row */}
                  <div className="chat-input-area">
                    <div className="chat-input-row">
                      <button
                        className={`ai-trigger-btn${showAiPanel ? ' active' : ''}`}
                        onClick={() => { setShowAiPanel(v => !v); setAiError('') }}
                        title="AI Message Templates">
                        ✨
                      </button>
                      <input
                        className="chat-input"
                        placeholder="Type a message... or use ✨ AI templates"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      />
                      <button className="send-btn" disabled={sending || !input.trim()} onClick={sendMessage}>➤</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
