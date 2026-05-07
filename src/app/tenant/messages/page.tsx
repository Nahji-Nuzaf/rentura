'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

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
  const inputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Threads & messages
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [threadsLoading, setThreadsLoading] = useState(true)

  // Compose
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Keep a ref to the active thread partner ID so the realtime handler can read it
  const activeThreadPartnerIdRef = useRef<string | null>(null)
  const profileRef = useRef<Profile | null>(null)

  useEffect(() => {
    activeThreadPartnerIdRef.current = activeThread?.partnerId ?? null
  }, [activeThread?.partnerId])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  // ── Load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let realtimeChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) {
          setProfile(prof)
          profileRef.current = prof
        }

        await loadThreads(user.id)

        // ── Real-time subscription ──────────────────────────────────────
        realtimeChannel = sb
          .channel(`messages-user-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `receiver_id=eq.${user.id}`,
            },
            async (payload) => {
              const newMsg = payload.new as Message
              const currentProfile = profileRef.current
              if (!currentProfile) return

              const senderId = newMsg.sender_id

              setThreads(prev => {
                const existingThread = prev.find(t => t.partnerId === senderId)
                const isActive = activeThreadPartnerIdRef.current === senderId

                if (existingThread) {
                  const updatedThread = {
                    ...existingThread,
                    messages: [...existingThread.messages, newMsg],
                    lastMessage: newMsg.content,
                    lastMessageTime: newMsg.created_at,
                    unreadCount: isActive ? 0 : existingThread.unreadCount + 1,
                  }
                  const filtered = prev.filter(t => t.partnerId !== senderId)
                  return [updatedThread, ...filtered]
                } else {
                  loadThreads(currentProfile.id)
                  return prev
                }
              })

              if (activeThreadPartnerIdRef.current === senderId) {
                setActiveThread(prev => prev ? {
                  ...prev,
                  messages: [...prev.messages, newMsg],
                  lastMessage: newMsg.content,
                  lastMessageTime: newMsg.created_at,
                } : prev)

                const sbInner = createClient()
                await sbInner.from('messages')
                  .update({ read: true })
                  .eq('id', newMsg.id)
              }
            }
          )
          .subscribe()

      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()

    return () => {
      if (realtimeChannel) {
        const sb = createClient()
        sb.removeChannel(realtimeChannel)
      }
    }
  }, [router])

  const loadThreads = useCallback(async (userId: string) => {
    setThreadsLoading(true)
    try {
      const sb = createClient()

      const [{ data: sent }, { data: received }] = await Promise.all([
        sb.from('messages').select('*').eq('sender_id', userId).order('created_at', { ascending: true }),
        sb.from('messages').select('*').eq('receiver_id', userId).order('created_at', { ascending: true }),
      ])

      const allMessages: Message[] = [...(sent || []), ...(received || [])]
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      const partnerIds = [...new Set(allMessages.map(m =>
        m.sender_id === userId ? m.receiver_id : m.sender_id
      ))]

      if (!partnerIds.length) { setThreads([]); setThreadsLoading(false); return }

      const { data: partners } = await sb.from('profiles').select('id,full_name,email,avatar_url').in('id', partnerIds)
      const partnerMap: Record<string, { full_name: string; email: string; avatar_url?: string }> = {}
      ;(partners || []).forEach((p: any) => { partnerMap[p.id] = p })

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

      setActiveThread(prev => {
        if (!prev && sortedThreads.length > 0) {
          markThreadRead(sortedThreads[0].partnerId, userId)
          return sortedThreads[0]
        }
        if (prev) {
          const refreshed = sortedThreads.find(t => t.partnerId === prev.partnerId)
          return refreshed ?? prev
        }
        return prev
      })
    } catch (e) {
      console.error(e)
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  async function markThreadRead(partnerId: string, userId: string) {
    const sb = createClient()
    await sb.from('messages')
      .update({ read: true })
      .eq('sender_id', partnerId)
      .eq('receiver_id', userId)
      .eq('read', false)
      .select()

    setThreads(prev => prev.map(t =>
      t.partnerId === partnerId ? { ...t, unreadCount: 0 } : t
    ))
  }

  async function selectThread(thread: Thread) {
    setActiveThread(thread)
    setShowMobileChat(true)
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

      const replace = (msgs: Message[]) => msgs.map(m => m.id === optimistic.id ? data : m)
      setActiveThread(prev => prev ? { ...prev, messages: replace(prev.messages) } : prev)
      setThreads(prev => prev.map(t => t.partnerId === activeThread.partnerId
        ? { ...t, messages: replace(t.messages) }
        : t
      ))
    } catch (e) {
      console.error(e)
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread?.messages.length])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow:hidden}
        .shell{display:flex;height:100vh;height:100dvh;overflow:hidden;position:relative}

        /* ── Sidebar ── */
        .sidebar{width:260px;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:200;transition:transform .25s ease}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-count{margin-left:auto;background:#DC2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-user{display:flex;align-items:center;gap:10px;padding:14px 18px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-uemail{font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:199;backdrop-filter:blur(2px)}
        .sb-overlay.open{display:block}

        /* ── Main ── */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden}
        .topbar{height:58px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 20px;flex-shrink:0;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}
        .breadcrumb b{color:#0F172A}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;line-height:1;flex-shrink:0}
        .notif-btn{width:34px;height:34px;border-radius:9px;background:#F1F5F9;border:none;cursor:pointer;font-size:15px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .notif-dot{width:8px;height:8px;background:#DC2626;border-radius:50%;position:absolute;top:5px;right:5px;border:1.5px solid #fff}

        /* ── Msg layout — mirrors landlord grid ── */
        .msg-layout{display:grid;grid-template-columns:300px 1fr;flex:1;overflow:hidden;min-height:0}

        /* ── Thread / convo list ── */
        .convo-list{border-right:1px solid #E2E8F0;background:#fff;display:flex;flex-direction:column;overflow:hidden}
        .cl-head{padding:14px 16px;border-bottom:1px solid #E2E8F0;flex-shrink:0}
        .cl-title{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}
        .unread-badge{background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 7px}
        .cl-search{width:100%;padding:8px 12px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border-color .15s;background:#F8FAFC;color:#0F172A}
        .cl-search:focus{border-color:#2563EB;background:#fff}
        .cl-items{flex:1;overflow-y:auto}
        .cl-items::-webkit-scrollbar{width:0}

        .convo-item{display:flex;align-items:flex-start;gap:11px;padding:13px 16px;cursor:pointer;border-bottom:1px solid #F8FAFC;transition:background .12s;position:relative}
        .convo-item:hover{background:#F8FAFC}
        .convo-item.active{background:#EFF6FF;border-left:3px solid #2563EB}
        .ci-av{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden}
        .ci-av img{width:100%;height:100%;object-fit:cover}
        .ci-body{flex:1;min-width:0}
        .ci-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
        .ci-name{font-size:13.5px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ci-time{font-size:11px;color:#94A3B8;flex-shrink:0;margin-left:4px}
        .ci-preview{font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
        .ci-preview.unread{color:#0F172A;font-weight:600}
        .ci-unread{background:#2563EB;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 6px;flex-shrink:0;margin-left:6px}
        .thread-empty{text-align:center;padding:48px 16px;color:#94A3B8;font-size:13px}

        /* ── Chat area ── */
        .chat-area{display:flex;flex-direction:column;overflow:hidden;min-height:0;background:#F4F6FA;position:relative}
        .chat-head{padding:14px 20px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .mobile-back{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;margin-right:2px;padding:4px;flex-shrink:0;line-height:1}
        .ch-av{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden}
        .ch-av img{width:100%;height:100%;object-fit:cover}
        .ch-name{font-size:14px;font-weight:700;color:#0F172A}
        .ch-sub{font-size:12px;color:#94A3B8;margin-top:1px}
        .ch-actions{margin-left:auto;display:flex;gap:8px}
        .ch-action-btn{width:34px;height:34px;border-radius:9px;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#475569;transition:all .15s}
        .ch-action-btn:hover{border-color:#BFDBFE;background:#EFF6FF}

        /* Messages area */
        .chat-messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}
        .chat-messages::-webkit-scrollbar{width:4px}
        .chat-messages::-webkit-scrollbar-track{background:transparent}
        .chat-messages::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}

        .date-header{text-align:center;margin:6px 0 10px;position:relative}
        .date-header::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:#E2E8F0}
        .date-header span{position:relative;background:#F4F6FA;padding:0 12px;font-size:11.5px;color:#94A3B8;font-weight:600}

        .bubble-wrap{display:flex;flex-direction:column}
        .bubble-wrap.me{align-items:flex-end}
        .bubble-wrap.them{align-items:flex-start}
        .bubble{max-width:85%;padding:11px 15px;border-radius:14px;font-size:13.5px;line-height:1.5;word-break:break-word}
        .bubble.me{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;border-bottom-right-radius:4px;box-shadow:0 2px 8px rgba(37,99,235,.2)}
        .bubble.them{background:#fff;color:#0F172A;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(15,23,42,.08)}
        .bubble-time{font-size:11px;color:#94A3B8;margin-top:3px;padding:0 2px;display:flex;align-items:center;gap:4px}
        .bubble-time.me{justify-content:flex-end}

        /* Empty states */
        .empty-chat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94A3B8;gap:10px;background:#fff}

        /* ── Input area ── */
        .chat-input-area{flex-shrink:0;background:#fff;border-top:1px solid #E2E8F0}
        .chat-input-row{padding:12px 16px;display:flex;gap:10px;align-items:center}
        .chat-input{flex:1;padding:10px 14px;border-radius:12px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border-color .15s;background:#F8FAFC;color:#0F172A}
        .chat-input:focus{border-color:#2563EB;background:#fff}
        .send-btn{width:40px;height:40px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(37,99,235,.25);transition:all .15s}
        .send-btn:hover:not(:disabled){transform:scale(1.05)}
        .send-btn:disabled{opacity:.4;cursor:not-allowed}

        /* Skeleton */
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        /* ── Responsive ── */
        @media(max-width:1024px){
          .msg-layout{grid-template-columns:260px 1fr}
        }

        @media(max-width:768px){
          /* Sidebar: slide off-screen */
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important}
          .hamburger{display:block}
          .topbar{padding:0 14px}
          .breadcrumb{font-size:12px}

          /* Stack the grid */
          .msg-layout{display:block;position:relative;height:100%;overflow:hidden}

          /* Thread list: full screen, slides left when chat opens */
          .convo-list{
            width:100%;
            height:100%;
            position:absolute;
            inset:0;
            display:flex;
            flex-direction:column;
            transition:transform .3s cubic-bezier(.4,0,.2,1);
            z-index:1;
          }
          .convo-list.hidden{
            transform:translateX(-100%);
            pointer-events:none;
          }

          /* Chat area: slides in from right */
          .chat-area{
            position:absolute;
            inset:0;
            z-index:2;
            display:flex;
            flex-direction:column;
            transform:translateX(100%);
            transition:transform .3s cubic-bezier(.4,0,.2,1);
          }
          .chat-area.visible{
            transform:translateX(0);
          }

          /* Show back button */
          .mobile-back{display:flex;align-items:center;justify-content:center}

          /* Wider bubbles on mobile */
          .bubble{max-width:90%}

          /* Comfortable tap targets */
          .convo-item{min-height:68px}
          .ci-av{width:46px;height:46px}
          .chat-messages{padding:12px 14px}
        }

        @media(max-width:480px){
          .ci-time{display:none}
          .chat-head{padding:12px 14px}
        }

        /* Safe area for notch devices */
        @supports(padding-bottom:env(safe-area-inset-bottom)){
          .chat-input-row{padding-bottom:calc(12px + env(safe-area-inset-bottom))}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={24} height={24} />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent &amp; Payments</a>
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
            <div className="sb-user">
              <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                <div className="sb-uemail">{profile?.email || ''}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          {/* Topbar */}
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Messages</b></div>
            </div>
            <button className="notif-btn" aria-label="Notifications">
              🔔{totalUnread > 0 && <div className="notif-dot" />}
            </button>
          </div>

          {/* ── Msg layout ── */}
          <div className="msg-layout">

            {/* Thread list */}
            <div className={`convo-list${showMobileChat ? ' hidden' : ''}`}>
              <div className="cl-head">
                <div className="cl-title">
                  Conversations
                  {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}
                </div>
                <input
                  className="cl-search"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="cl-items">
                {threadsLoading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} style={{ padding: '13px 16px', display: 'flex', gap: 11, borderBottom: '1px solid #F8FAFC' }}>
                      <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 7 }} />
                        <div className="skeleton" style={{ height: 10, width: '90%' }} />
                      </div>
                    </div>
                  ))
                ) : filteredThreads.length === 0 ? (
                  <div className="thread-empty">
                    {searchQuery ? `No results for "${searchQuery}"` : 'No conversations yet.\nYour landlord will message you here.'}
                  </div>
                ) : (
                  filteredThreads.map(thread => (
                    <div
                      key={thread.partnerId}
                      className={`convo-item${activeThread?.partnerId === thread.partnerId ? ' active' : ''}`}
                      onClick={() => selectThread(thread)}
                    >
                      <div className="ci-av">
                        {thread.partnerAvatar
                          ? <img src={thread.partnerAvatar} alt={thread.partnerName} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : initials(thread.partnerName)
                        }
                      </div>
                      <div className="ci-body">
                        <div className="ci-top">
                          <span className="ci-name">{thread.partnerName}</span>
                          <span className="ci-time">{fmtTime(thread.lastMessageTime)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span className={`ci-preview${thread.unreadCount > 0 ? ' unread' : ''}`}>
                            {thread.lastMessage}
                          </span>
                          {thread.unreadCount > 0 && (
                            <span className="ci-unread">{thread.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat area */}
            <div className={`chat-area${showMobileChat ? ' visible' : ''}`}>
              {!activeThread ? (
                <div className="empty-chat">
                  <div style={{ fontSize: 40 }}>💬</div>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>Your Messages</div>
                  <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 1.6 }}>
                    {threads.length === 0
                      ? "You don't have any messages yet.\nYour landlord will be able to message you here."
                      : 'Select a conversation to start reading.'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="chat-head">
                    <button className="mobile-back" onClick={() => setShowMobileChat(false)} aria-label="Back">←</button>
                    <div className="ch-av">
                      {activeThread.partnerAvatar
                        ? <img src={activeThread.partnerAvatar} alt={activeThread.partnerName} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : initials(activeThread.partnerName)
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ch-name">{activeThread.partnerName}</div>
                      <div className="ch-sub">{activeThread.partnerEmail}</div>
                    </div>
                    <div className="ch-actions">
                      <a href={`mailto:${activeThread.partnerEmail}`} className="ch-action-btn" title="Send email">✉️</a>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="chat-messages">
                    {grouped.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 13 }}>
                        No messages yet. Say hello! 👋
                      </div>
                    ) : (
                      grouped.map((group, gi) => (
                        <div key={gi}>
                          <div className="date-header">
                            <span>{fmtDateHeader(group.date)}</span>
                          </div>
                          {group.messages.map((msg) => {
                            const isMine = msg.sender_id === profile?.id
                            return (
                              <div key={msg.id} className={`bubble-wrap ${isMine ? 'me' : 'them'}`}>
                                <div className={`bubble ${isMine ? 'me' : 'them'}`}>
                                  {msg.content}
                                </div>
                                <div className={`bubble-time${isMine ? ' me' : ''}`}>
                                  {fmtMsgTime(msg.created_at)}
                                  {isMine && (
                                    <span style={{ fontSize: 10, opacity: 0.7 }}>
                                      {msg.id.startsWith('opt-') ? '○' : '✓'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Input area */}
                  <div className="chat-input-area">
                    <div className="chat-input-row">
                      <input
                        ref={inputRef}
                        className="chat-input"
                        placeholder={`Message ${activeThread.partnerName}...`}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                      />
                      <button
                        className="send-btn"
                        disabled={!draft.trim() || sending}
                        onClick={handleSend}
                        aria-label="Send message"
                      >
                        ➤
                      </button>
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
