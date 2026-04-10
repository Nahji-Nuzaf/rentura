'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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

function fmtTime(ts: string) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString([], { month:'short', day:'numeric' })
}

export default function MessagesPage() {
  const router = useRouter()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [userId, setUserId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [convos, setConvos] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false) // NEW: For mobile view toggle
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  const active = convos.find(c => c.tenantId === activeId) || null
  const filteredConvos = search ? convos.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : convos
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0)

  async function loadConversations(uid: string) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id, name').eq('landlord_id', uid)
      const propIds = (props || []).map((p: any) => p.id)
      if (propIds.length === 0) { setConvos([]); setLoading(false); return }

      const propNameMap: Record<string, string> = {}
      ;(props || []).forEach((p: any) => { propNameMap[p.id] = p.name })

      const { data: tenants } = await supabase.from('tenants').select('id, profile_id, unit_id, property_id').in('property_id', propIds).eq('status', 'active')
      if (!tenants || tenants.length === 0) { setConvos([]); setLoading(false); return }

      const unitIds = [...new Set(tenants.map((t: any) => t.unit_id).filter(Boolean))]
      const { data: unitsData } = await supabase.from('units').select('id, unit_number').in('id', unitIds)
      const unitMap: Record<string, string> = {}
      ;(unitsData || []).forEach((u: any) => { unitMap[u.id] = u.unit_number })

      const profileIds = [...new Set(tenants.map((t: any) => t.profile_id).filter(Boolean))]
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', profileIds)
      const profileMap: Record<string, string> = {}
      ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name })

      const { data: messages } = await supabase.from('messages').select('id, sender_id, receiver_id, content, read, created_at').or(`sender_id.eq.${uid},receiver_id.eq.${uid}`).order('created_at', { ascending: true })

      const shaped: Conversation[] = tenants.map((t: any, i: number) => {
        const pid = t.profile_id
        const name = profileMap[pid] || 'Unknown'
        const msgs = (messages || [])
          .filter((m: any) => (m.sender_id === pid && m.receiver_id === uid) || (m.sender_id === uid && m.receiver_id === pid))
          .map((m: any) => ({
            id: m.id,
            sender_id: m.sender_id,
            receiver_id: m.receiver_id,
            content: m.content,
            read: m.read,
            created_at: m.created_at,
            from: m.sender_id === uid ? 'me' : 'them',
          })) as Message[]

        const last = msgs[msgs.length - 1]
        const unread = msgs.filter(m => m.from === 'them' && !m.read).length

        return {
          tenantId: pid,
          name,
          initials: name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          color: COLORS[i % COLORS.length],
          property: propNameMap[t.property_id] || '—',
          unit: unitMap[t.unit_id] || '—',
          lastMsg: last?.content || 'No messages yet',
          lastTime: last ? fmtTime(last.created_at) : '',
          unread,
          messages: msgs,
        }
      })

      shaped.sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.created_at || ''
        const bLast = b.messages[b.messages.length - 1]?.created_at || ''
        return bLast.localeCompare(aLast)
      })

      setConvos(shaped)
      // Auto-select first only on desktop
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
      setFullName(name)
      setUserId(user.id)
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
    setShowMobileChat(true) // Switch to chat view on mobile
    const supabase = createClient()
    await supabase.from('messages').update({ read: true }).eq('sender_id', tid).eq('receiver_id', userId).eq('read', false)
    setConvos(prev => prev.map(c => c.tenantId === tid ? { ...c, unread: 0, messages: c.messages.map(m => ({...m, read: true})) } : c))
  }

  async function sendMessage() {
    if (!input.trim() || !activeId || sending) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('messages').insert({ sender_id: userId, receiver_id: activeId, content: input.trim(), read: false }).select('id, sender_id, receiver_id, content, read, created_at').single()
      if (error) throw error

      const newMsg: Message = { ...data, from: 'me' }
      setConvos(prev => prev.map(c =>
        c.tenantId === activeId
          ? { ...c, messages: [...c.messages, newMsg], lastMsg: input.trim(), lastTime: 'Now' }
          : c
      ))
      setInput('')
    } catch (err: any) {
      alert('Failed to send: ' + err?.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif}
        body{background:#F4F6FA}
        .shell{display:flex;height:100vh;height:100dvh;overflow:hidden}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,0.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,0.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,0.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px;min-width:18px;text-align:center}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.25);border-radius:5px;padding:1px 6px;margin-top:2px}
        
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;position:relative}
        .topbar{height:58px;display:flex;align-items:center;gap:12px;padding:0 28px;background:#fff;border-bottom:1px solid #E2E8F0;flex-shrink:0}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        
        .msg-layout{display:grid;grid-template-columns:320px 1fr;flex:1;overflow:hidden;min-height:0}
        .convo-list{border-right:1px solid #E2E8F0;background:#fff;display:flex;flex-direction:column;overflow:hidden}
        .cl-head{padding:16px;border-bottom:1px solid #E2E8F0;flex-shrink:0}
        .cl-title{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}
        .unread-badge{background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 7px}
        .cl-search{width:100%;padding:8px 12px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none}
        .cl-search:focus{border-color:#3B82F6}
        .cl-items{flex:1;overflow-y:auto}.cl-items::-webkit-scrollbar{width:0}
        .convo-item{display:flex;align-items:flex-start;gap:11px;padding:13px 16px;cursor:pointer;border-bottom:1px solid #F8FAFC;transition:background .12s}
        .convo-item:hover{background:#F8FAFC}
        .convo-item.active{background:#EFF6FF;border-left:3px solid #3B82F6}
        .ci-av{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .ci-body{flex:1;min-width:0}
        .ci-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
        .ci-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .ci-time{font-size:11px;color:#94A3B8}
        .ci-preview{font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
        .ci-unread{background:#3B82F6;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 6px;flex-shrink:0;margin-left:6px}
        .ci-prop{font-size:11px;color:#94A3B8;margin-top:3px}
        
        .chat-area{display:flex;flex-direction:column;overflow:hidden;min-height:0;background:#F4F6FA}
        .chat-head{padding:14px 20px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .mobile-back{display:none;background:none;border:none;font-size:18px;cursor:pointer;color:#475569;margin-right:4px}
        .ch-av{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .ch-name{font-size:14px;font-weight:700;color:#0F172A}
        .ch-sub{font-size:12px;color:#94A3B8}
        .chat-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:10px}
        .chat-messages::-webkit-scrollbar{width:0}
        .bubble-wrap{display:flex;flex-direction:column}
        .bubble-wrap.me{align-items:flex-end}
        .bubble-wrap.them{align-items:flex-start}
        .bubble{max-width:85%;padding:11px 15px;border-radius:14px;font-size:13.5px;line-height:1.5}
        .bubble.me{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;border-bottom-right-radius:4px}
        .bubble.them{background:#fff;color:#0F172A;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(15,23,42,0.08)}
        .bubble-time{font-size:11px;color:#94A3B8;margin-top:3px;padding:0 2px}
        .chat-input-row{padding:14px 16px;background:#fff;border-top:1px solid #E2E8F0;display:flex;gap:10px;align-items:center;flex-shrink:0}
        .chat-input{flex:1;padding:10px 16px;border-radius:12px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border-color .15s}
        .chat-input:focus{border-color:#3B82F6}
        .send-btn{width:42px;height:42px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s}
        
        .empty-chat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;gap:10px;background:#fff}
        
        /* RESPONSIVE BREAKPOINTS */
        @media(max-width:1024px){
          .msg-layout{grid-template-columns:280px 1fr}
        }

        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)!important}
          .main{margin-left:0}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .msg-layout{display:block; position:relative}
          
          /* Switch between list and chat */
          .convo-list{
            display: ${showMobileChat ? 'none' : 'flex'};
            width: 100%;
            height: 100%;
          }
          .chat-area{
            display: ${showMobileChat ? 'flex' : 'none'};
            position: absolute;
            inset: 0;
            z-index: 10;
          }
          .mobile-back{display:block}
          .bubble{max-width:90%}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo"><div className="sb-logo-icon">🏘️</div><span className="sb-logo-name">Rentura</span></div>
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
            <a href="/landlord/messages" className="sb-item active">
              <span className="sb-ico">💬</span>Messages
              {totalUnread > 0 && <span className="sb-badge">{totalUnread}</span>}
            </a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">FREE</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Messages</b></div>
          </div>

          <div className="msg-layout">
            <div className="convo-list">
              <div className="cl-head">
                <div className="cl-title">
                  Conversations
                  {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}
                </div>
                <input className="cl-search" placeholder="Search tenants..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="cl-items">
                {loading ? (
                  [1,2,3].map(i => (
                    <div key={i} style={{padding:'13px 16px',display:'flex',gap:11,borderBottom:'1px solid #F8FAFC'}}>
                      <div className="skeleton" style={{width:40,height:40,borderRadius:12,flexShrink:0}} />
                      <div style={{flex:1}}><div className="skeleton" style={{height:12,width:'70%',marginBottom:7}} /><div className="skeleton" style={{height:10,width:'90%'}} /></div>
                    </div>
                  ))
                ) : convos.length === 0 ? (
                  <div style={{padding:24,textAlign:'center',color:'#94A3B8',fontSize:13}}>No tenants found</div>
                ) : filteredConvos.map(c => (
                  <div key={c.tenantId} className={`convo-item${activeId === c.tenantId ? ' active' : ''}`} onClick={() => openConvo(c.tenantId)}>
                    <div className="ci-av" style={{background:c.color}}>{c.initials}</div>
                    <div className="ci-body">
                      <div className="ci-top">
                        <span className="ci-name">{c.name}</span>
                        <span className="ci-time">{c.lastTime}</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span className="ci-preview">{c.lastMsg}</span>
                        {c.unread > 0 && <span className="ci-unread">{c.unread}</span>}
                      </div>
                      <div className="ci-prop">{c.property} · {c.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chat-area">
              {!active ? (
                <div className="empty-chat">
                  <div style={{fontSize:40}}>💬</div>
                  <div style={{fontWeight:700,color:'#0F172A'}}>Select a conversation</div>
                  <div style={{fontSize:13,color:'#94A3B8'}}>Choose a tenant to start messaging</div>
                </div>
              ) : (
                <>
                  <div className="chat-head">
                    {/* BACK BUTTON FOR MOBILE */}
                    <button className="mobile-back" onClick={() => setShowMobileChat(false)}>←</button>
                    <div className="ch-av" style={{background:active.color}}>{active.initials}</div>
                    <div style={{flex:1}}>
                      <div className="ch-name">{active.name}</div>
                      <div className="ch-sub">{active.property} · {active.unit}</div>
                    </div>
                  </div>
                  <div className="chat-messages">
                    {active.messages.length === 0 ? (
                      <div style={{textAlign:'center',color:'#94A3B8',marginTop:40,fontSize:13}}>No messages yet. Say hello! 👋</div>
                    ) : active.messages.map(m => (
                      <div key={m.id} className={`bubble-wrap ${m.from}`}>
                        <div className={`bubble ${m.from}`}>{m.content}</div>
                        <span className="bubble-time">{fmtTime(m.created_at)}</span>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  <div className="chat-input-row">
                    <input
                      className="chat-input"
                      placeholder="Type a message..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    />
                    <button className="send-btn" disabled={sending || !input.trim()} onClick={sendMessage}>➤</button>
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