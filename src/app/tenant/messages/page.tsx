'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────
type Profile = {
  id: string
  full_name: string
  email: string
  avatar_url?: string
  active_role?: string
}

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  property_id?: string
  content: string
  read: boolean
  created_at: string
}

type Thread = {
  partnerId: string
  partnerName: string
  partnerEmail: string
  partnerAvatar?: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  messages: Message[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtTime(s: string) {
  const d = new Date(s)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMsgTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDateHeader(s: string) {
  const d = new Date(s)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function groupByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = []
  let lastDate = ''
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString()
    if (d !== lastDate) { groups.push({ date: msg.created_at, messages: [] }); lastDate = d }
    groups[groups.length - 1].messages.push(msg)
  }
  return groups
}

export default function TenantMessagesPage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const [profile, setProfile]       = useState<Profile | null>(null)
  const [loading, setLoading]       = useState(true)
  const [activeRole, setActiveRole] = useState('tenant')

  // Threads & messages
  const [threads, setThreads]             = useState<Thread[]>([])
  const [activeThread, setActiveThread]   = useState<Thread | null>(null)
  const [threadsLoading, setThreadsLoading] = useState(true)

  // Compose
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)

  // UI
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)
  const [mobileShowChat, setMobileShowChat]   = useState(false)
  const [searchQuery, setSearchQuery]         = useState('')

  // ── Load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) { setProfile(prof); setActiveRole(prof.active_role || 'tenant') }

        await loadThreads(user.id, prof)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [router])

  const loadThreads = useCallback(async (userId: string, prof: Profile | null) => {
    setThreadsLoading(true)
    try {
      const sb = createClient()

      // Fetch all messages involving this user
      const [{ data: sent }, { data: received }] = await Promise.all([
        sb.from('messages').select('*').eq('sender_id', userId).order('created_at', { ascending: true }),
        sb.from('messages').select('*').eq('receiver_id', userId).order('created_at', { ascending: true }),
      ])

      const allMessages: Message[] = [...(sent || []), ...(received || [])]
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      // Find unique partner IDs
      const partnerIds = [...new Set(allMessages.map(m =>
        m.sender_id === userId ? m.receiver_id : m.sender_id
      ))]

      if (!partnerIds.length) { setThreads([]); setThreadsLoading(false); return }

      // Fetch partner profiles
      const { data: partners } = await sb.from('profiles').select('id,full_name,email,avatar_url').in('id', partnerIds)
      const partnerMap: Record<string, { full_name: string; email: string; avatar_url?: string }> = {}
      ;(partners || []).forEach((p: any) => { partnerMap[p.id] = p })

      // Build threads
      const threadMap: Record<string, Thread> = {}
      for (const msg of allMessages) {
        const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
        if (!threadMap[partnerId]) {
          const partner = partnerMap[partnerId] || { full_name: 'Unknown', email: '' }
          threadMap[partnerId] = {
            partnerId,
            partnerName: partner.full_name,
            partnerEmail: partner.email,
            partnerAvatar: partner.avatar_url,
            lastMessage: msg.content,
            lastMessageTime: msg.created_at,
            unreadCount: 0,
            messages: [],
          }
        }
        threadMap[partnerId].messages.push(msg)
        threadMap[partnerId].lastMessage = msg.content
        threadMap[partnerId].lastMessageTime = msg.created_at
        if (msg.receiver_id === userId && !msg.read) {
          threadMap[partnerId].unreadCount++
        }
      }

      const sortedThreads = Object.values(threadMap).sort(
        (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      )

      setThreads(sortedThreads)

      // Auto-select first thread
      if (sortedThreads.length > 0 && !activeThread) {
        setActiveThread(sortedThreads[0])
        // Mark as read
        await markThreadRead(sortedThreads[0].partnerId, userId)
      }
    } catch (e) { console.error(e) }
    finally { setThreadsLoading(false) }
  }, [])

  async function markThreadRead(partnerId: string, userId: string) {
    const sb = createClient()
    await sb.from('messages')
      .update({ read: true })
      .eq('sender_id', partnerId)
      .eq('receiver_id', userId)
      .eq('read', false)
      .select()

    // Update local state
    setThreads(prev => prev.map(t =>
      t.partnerId === partnerId ? { ...t, unreadCount: 0 } : t
    ))
  }

  async function selectThread(thread: Thread) {
    setActiveThread(thread)
    setMobileShowChat(true)
    if (!profile) return
    await markThreadRead(thread.partnerId, profile.id)
  }

  async function handleSend() {
    if (!draft.trim() || !activeThread || !profile || sending) return
    const content = draft.trim()
    setDraft('')
    setSending(true)

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      sender_id: profile.id,
      receiver_id: activeThread.partnerId,
      content,
      read: false,
      created_at: new Date().toISOString(),
    }

    // Optimistic update
    setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, optimistic], lastMessage: content, lastMessageTime: optimistic.created_at } : prev)
    setThreads(prev => prev.map(t => t.partnerId === activeThread.partnerId
      ? { ...t, messages: [...t.messages, optimistic], lastMessage: content, lastMessageTime: optimistic.created_at }
      : t
    ))

    try {
      const sb = createClient()
      const { data, error } = await sb.from('messages').insert({
        sender_id: profile.id,
        receiver_id: activeThread.partnerId,
        content,
        read: false,
      }).select().single()

      if (error) throw error

      // Replace optimistic with real
      const replace = (msgs: Message[]) => msgs.map(m => m.id === optimistic.id ? data : m)
      setActiveThread(prev => prev ? { ...prev, messages: replace(prev.messages) } : prev)
      setThreads(prev => prev.map(t => t.partnerId === activeThread.partnerId
        ? { ...t, messages: replace(t.messages) }
        : t
      ))
    } catch (e) {
      console.error(e)
      // Revert optimistic
      const revert = (msgs: Message[]) => msgs.filter(m => m.id !== optimistic.id)
      setActiveThread(prev => prev ? { ...prev, messages: revert(prev.messages) } : prev)
      setThreads(prev => prev.map(t => t.partnerId === activeThread.partnerId
        ? { ...t, messages: revert(t.messages) }
        : t
      ))
      setDraft(content)
    } finally {
      setSending(false)
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread?.messages.length])

  // Handle Enter key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleRoleSwitch(role: string) {
    if (!profile) return
    setActiveRole(role)
    setRolePopoverOpen(false)
    const sb = createClient()
    await sb.from('profiles').update({ active_role: role }).eq('id', profile.id).select()
    if (role === 'landlord') window.location.href = '/landlord'
    else if (role === 'seeker') window.location.href = '/seeker'
  }

  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0)
  const filteredThreads = threads.filter(t =>
    !searchQuery || t.partnerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const grouped = activeThread ? groupByDate(activeThread.messages) : []

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading messages...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;max-width:100vw}
        .shell{display:flex;min-height:100vh;position:relative}

        .sidebar{width:260px;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:200;transition:transform .25s ease}
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
        .sb-count{margin-left:auto;background:#DC2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-role-wrap{position:relative;padding:12px}
        .sb-user{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .15s}
        .sb-user:hover{background:rgba(255,255,255,.06)}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uinfo{flex:1;min-width:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-uemail{font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-role-badge{display:inline-block;font-size:9.5px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:4px;padding:1px 6px;margin-top:2px}
        .sb-switch-ico{color:#64748B;flex-shrink:0}
        .role-popover{position:absolute;bottom:100%;left:12px;right:12px;background:#1E293B;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;margin-bottom:6px;box-shadow:0 20px 40px rgba(0,0,0,.4);z-index:300}
        .rp-title{font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 8px}
        .rp-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;color:#CBD5E1;font-size:13px;font-weight:500;transition:background .15s}
        .rp-item:hover{background:rgba(255,255,255,.06)}
        .rp-check{width:16px;height:16px;margin-left:auto;color:#2563EB}
        .rp-divider{height:1px;background:rgba(255,255,255,.06);margin:4px 0}

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:56px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}
        .breadcrumb b{color:#0F172A}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px}
        .notif-btn{width:34px;height:34px;border-radius:9px;background:#F1F5F9;border:none;cursor:pointer;font-size:15px;position:relative;display:flex;align-items:center;justify-content:center}
        .notif-dot{width:8px;height:8px;background:#DC2626;border-radius:50%;position:absolute;top:5px;right:5px;border:1.5px solid #fff}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}
        .sb-overlay.open{display:block}

        /* ── Chat layout ── */
        .chat-shell{display:flex;flex:1;height:calc(100vh - 56px);overflow:hidden;padding:16px;gap:14px}

        /* ── Thread list ── */
        .thread-panel{width:300px;flex-shrink:0;background:#fff;border:1px solid #E2E8F0;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .tp-header{padding:16px}
        .tp-title{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A;margin-bottom:10px;display:flex;align-items:center;gap:8px}
        .tp-search{width:100%;padding:8px 12px 8px 34px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;background:#F8FAFC;transition:border .15s}
        .tp-search:focus{border-color:#2563EB;background:#fff}
        .tp-search-wrap{position:relative}
        .tp-search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;pointer-events:none}
        .thread-list{flex:1;overflow-y:auto}
        .thread-list::-webkit-scrollbar{width:0}
        .thread-item{display:flex;align-items:center;gap:11px;padding:13px 16px;cursor:pointer;transition:background .12s;border-bottom:1px solid #F8FAFC;position:relative}
        .thread-item:hover{background:#F8FAFC}
        .thread-item.active{background:#EFF6FF}
        .thread-item.active::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#2563EB,#6366F1);border-radius:0 4px 4px 0}
        .th-av{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden}
        .th-av img{width:100%;height:100%;object-fit:cover}
        .th-info{flex:1;min-width:0}
        .th-name{font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .th-preview{font-size:12px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .th-preview.unread{color:#475569;font-weight:600}
        .th-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
        .th-time{font-size:11px;color:#94A3B8}
        .th-badge{width:18px;height:18px;background:#2563EB;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9.5px;font-weight:700}
        .thread-empty{text-align:center;padding:48px 16px;color:#94A3B8;font-size:13px}

        /* ── Chat panel ── */
        .chat-panel{flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.04);min-width:0}
        .chat-header{padding:14px 20px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:12px;background:#fff;flex-shrink:0}
        .ch-back{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:0 6px 0 0;flex-shrink:0}
        .ch-av{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden}
        .ch-av img{width:100%;height:100%;object-fit:cover}
        .ch-name{font-size:15px;font-weight:700;color:#0F172A}
        .ch-status{font-size:12px;color:#94A3B8;margin-top:1px}
        .ch-actions{margin-left:auto;display:flex;gap:8px}
        .ch-action-btn{width:34px;height:34px;border-radius:9px;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#475569;transition:all .15s}
        .ch-action-btn:hover{border-color:#BFDBFE;background:#EFF6FF}

        /* Messages area */
        .messages-area{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:2px}
        .messages-area::-webkit-scrollbar{width:4px}
        .messages-area::-webkit-scrollbar-track{background:transparent}
        .messages-area::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}

        .date-header{text-align:center;margin:14px 0 10px;position:relative}
        .date-header::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:#F1F5F9}
        .date-header span{position:relative;background:#fff;padding:0 12px;font-size:11.5px;color:#94A3B8;font-weight:600}

        .bubble-row{display:flex;align-items:flex-end;gap:8px;margin-bottom:6px}
        .bubble-row.mine{flex-direction:row-reverse}
        .bubble-av{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden}
        .bubble-av img{width:100%;height:100%;object-fit:cover}
        .bubble{max-width:72%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.55;word-break:break-word;position:relative}
        .bubble.theirs{background:#F1F5F9;color:#0F172A;border-bottom-left-radius:4px}
        .bubble.mine{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;border-bottom-right-radius:4px;box-shadow:0 2px 8px rgba(37,99,235,.2)}
        .bubble-time{font-size:10.5px;margin-top:4px;opacity:.65}
        .bubble-time.mine{text-align:right}
        .bubble.mine .bubble-time{color:rgba(255,255,255,.8)}
        .bubble.theirs .bubble-time{color:#94A3B8}

        /* Sending indicator */
        .sending-dots{display:inline-flex;gap:3px;padding:10px 14px;background:#F1F5F9;border-radius:16px;border-bottom-left-radius:4px}
        .sending-dots span{width:6px;height:6px;background:#94A3B8;border-radius:50%;animation:bounce .9s ease infinite}
        .sending-dots span:nth-child(2){animation-delay:.15s}
        .sending-dots span:nth-child(3){animation-delay:.3s}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}

        /* Empty chat */
        .chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;text-align:center;padding:40px}
        .ce-icon{font-size:48px;margin-bottom:14px}
        .ce-title{font-family:'Fraunces',serif;font-size:20px;color:#475569;margin-bottom:6px}
        .ce-sub{font-size:13px;line-height:1.6}

        /* Input bar */
        .input-bar{padding:14px 16px;border-top:1px solid #E2E8F0;display:flex;align-items:flex-end;gap:10px;background:#fff;flex-shrink:0}
        .input-textarea{flex:1;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:12px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;resize:none;line-height:1.5;max-height:120px;transition:border .15s;background:#F8FAFC}
        .input-textarea:focus{border-color:#2563EB;background:#fff}
        .send-btn{width:42px;height:42px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(37,99,235,.3);transition:opacity .15s}
        .send-btn:hover{opacity:.9}
        .send-btn:disabled{opacity:.4;cursor:not-allowed}

        /* No selection state */
        .no-selection{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;text-align:center;padding:40px}

        @media(max-width:900px){
          .thread-panel{width:260px}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .chat-shell{padding:10px;gap:0}
          .thread-panel{width:100%;border-radius:12px;position:absolute;top:10px;left:10px;right:10px;bottom:10px;z-index:10;transition:transform .25s}
          .thread-panel.hidden-mobile{transform:translateX(-110%)}
          .chat-panel{border-radius:12px}
          .ch-back{display:flex}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">🏘️</div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item"><span className="sb-ico">🔧</span> Maintenance</a>
            <a href="/tenant/documents" className="sb-item"><span className="sb-ico">📁</span> Documents</a>
            <a href="/tenant/messages" className="sb-item active">
              <span className="sb-ico">💬</span> Messages
              {totalUnread > 0 && <span className="sb-count">{totalUnread}</span>}
            </a>
            <span className="sb-section">Account</span>
            <a href="/tenant/settings" className="sb-item"><span className="sb-ico">⚙️</span> Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-role-wrap">
              {rolePopoverOpen && (
                <div className="role-popover">
                  <div className="rp-title">Switch Role</div>
                  {['landlord', 'tenant', 'seeker'].map(role => (
                    <div key={role} className="rp-item" onClick={() => handleRoleSwitch(role)}>
                      <span style={{ fontSize: 16 }}>{role === 'landlord' ? '🏠' : role === 'tenant' ? '🔑' : '🔍'}</span>
                      <span style={{ textTransform: 'capitalize' }}>{role}</span>
                      {activeRole === role && (
                        <svg className="rp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>
                  ))}
                  <div className="rp-divider" />
                  <div className="rp-item" onClick={async () => { await createClient().auth.signOut(); window.location.href = '/login' }}>
                    <span style={{ fontSize: 16 }}>🚪</span> Sign out
                  </div>
                </div>
              )}
              <div className="sb-user" onClick={() => setRolePopoverOpen(v => !v)}>
                <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
                <div className="sb-uinfo">
                  <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                  <div className="sb-uemail">{profile?.email || ''}</div>
                  <div className="sb-role-badge">tenant</div>
                </div>
                <svg className="sb-switch-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 15 12 20 17 15" /><polyline points="7 9 12 4 17 9" /></svg>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Messages</b></div>
            </div>
            <button className="notif-btn">
              🔔{totalUnread > 0 && <div className="notif-dot" />}
            </button>
          </div>

          {/* ── Chat shell ── */}
          <div className="chat-shell">

            {/* Thread list */}
            <div className={`thread-panel${mobileShowChat ? ' hidden-mobile' : ''}`}>
              <div className="tp-header">
                <div className="tp-title">
                  Messages
                  {totalUnread > 0 && (
                    <span style={{ background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                      {totalUnread}
                    </span>
                  )}
                </div>
                <div className="tp-search-wrap">
                  <span className="tp-search-icon">🔍</span>
                  <input
                    className="tp-search"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="thread-list">
                {threadsLoading ? (
                  <div className="thread-empty">Loading...</div>
                ) : filteredThreads.length === 0 ? (
                  <div className="thread-empty">
                    {searchQuery ? `No results for "${searchQuery}"` : 'No conversations yet'}
                  </div>
                ) : (
                  filteredThreads.map(thread => (
                    <div
                      key={thread.partnerId}
                      className={`thread-item${activeThread?.partnerId === thread.partnerId ? ' active' : ''}`}
                      onClick={() => selectThread(thread)}
                    >
                      <div className="th-av">
                        {thread.partnerAvatar
                          ? <img src={thread.partnerAvatar} alt={thread.partnerName} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : initials(thread.partnerName)
                        }
                      </div>
                      <div className="th-info">
                        <div className="th-name">{thread.partnerName}</div>
                        <div className={`th-preview${thread.unreadCount > 0 ? ' unread' : ''}`}>
                          {thread.lastMessage}
                        </div>
                      </div>
                      <div className="th-meta">
                        <div className="th-time">{fmtTime(thread.lastMessageTime)}</div>
                        {thread.unreadCount > 0 && (
                          <div className="th-badge">{thread.unreadCount}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat panel */}
            <div className="chat-panel">
              {!activeThread ? (
                <div className="no-selection">
                  <div style={{ fontSize: 48, marginBottom: 14 }}>💬</div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, color: '#475569', marginBottom: 6 }}>Your Messages</div>
                  <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                    {threads.length === 0
                      ? "You don't have any messages yet. Your landlord will be able to message you here."
                      : 'Select a conversation to start reading.'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="chat-header">
                    <button className="ch-back" onClick={() => setMobileShowChat(false)}>←</button>
                    <div className="ch-av">
                      {activeThread.partnerAvatar
                        ? <img src={activeThread.partnerAvatar} alt={activeThread.partnerName} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : initials(activeThread.partnerName)
                      }
                    </div>
                    <div>
                      <div className="ch-name">{activeThread.partnerName}</div>
                      <div className="ch-status">{activeThread.partnerEmail}</div>
                    </div>
                    <div className="ch-actions">
                      <a href={`mailto:${activeThread.partnerEmail}`} className="ch-action-btn" title="Send email">✉️</a>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="messages-area">
                    {grouped.length === 0 ? (
                      <div className="chat-empty">
                        <div className="ce-icon">💬</div>
                        <div className="ce-title">No messages yet</div>
                        <div className="ce-sub">Send a message to start the conversation.</div>
                      </div>
                    ) : (
                      grouped.map((group, gi) => (
                        <div key={gi}>
                          <div className="date-header">
                            <span>{fmtDateHeader(group.date)}</span>
                          </div>
                          {group.messages.map((msg, mi) => {
                            const isMine = msg.sender_id === profile?.id
                            const showAv = !isMine && (mi === group.messages.length - 1 || group.messages[mi + 1]?.sender_id !== msg.sender_id)
                            return (
                              <div key={msg.id} className={`bubble-row${isMine ? ' mine' : ''}`}>
                                {!isMine && (
                                  <div className="bubble-av" style={{ background: 'linear-gradient(135deg,#2563EB,#6366F1)', visibility: showAv ? 'visible' : 'hidden' }}>
                                    {activeThread.partnerAvatar
                                      ? <img src={activeThread.partnerAvatar} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                      : initials(activeThread.partnerName)
                                    }
                                  </div>
                                )}
                                <div>
                                  <div className={`bubble${isMine ? ' mine' : ' theirs'}`}>
                                    {msg.content}
                                    <div className={`bubble-time${isMine ? ' mine' : ''}`}>
                                      {fmtMsgTime(msg.created_at)}
                                      {isMine && <span style={{ marginLeft: 4 }}>{msg.id.startsWith('opt-') ? '○' : '✓'}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Input bar */}
                  <div className="input-bar">
                    <textarea
                      ref={inputRef}
                      className="input-textarea"
                      placeholder={`Message ${activeThread.partnerName}...`}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                    />
                    <button className="send-btn" disabled={!draft.trim() || sending} onClick={handleSend}>
                      ➤
                    </button>
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
