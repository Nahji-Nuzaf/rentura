'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

const FREE_FEATURES = [
  { text: '3 properties', included: true },
  { text: 'Up to 10 units', included: true },
  { text: 'Rent tracker', included: true },
  { text: 'Maintenance requests', included: true },
  { text: 'Basic documents', included: true },
  { text: '2 active listings', included: true },
  { text: 'Tenant messaging', included: true },
  { text: 'Advanced reports', included: false },
  { text: 'CSV / PDF exports', included: false },
  { text: 'Unlimited properties', included: false },
  { text: 'Year-over-year analytics', included: false },
  { text: 'Priority support', included: false },
]

const PRO_FEATURES = [
  { text: 'Unlimited properties' },
  { text: 'Unlimited units' },
  { text: 'Rent tracker + auto-reminders' },
  { text: 'Maintenance requests' },
  { text: 'Unlimited documents' },
  { text: 'Unlimited listings' },
  { text: 'Tenant messaging' },
  { text: 'Advanced reports & analytics' },
  { text: 'CSV & PDF exports' },
  { text: 'Year-over-year trends' },
  { text: 'Property comparison' },
  { text: 'Priority support' },
]

const BUSINESS_FEATURES = [
  'Everything in Pro',
  'Team member access',
  'API access',
  'White-label branding',
  'Dedicated account manager',
  'Custom integrations',
]

const FAQS = [
  { q: 'Can I cancel anytime?', a: "Yes — cancel anytime from your settings. You keep Pro access until the end of your billing period." },
  { q: 'What happens to my data if I downgrade?', a: "Your data stays safe. If you have more than 3 properties you'll need to archive extras, but nothing is deleted." },
  { q: 'Is there a free trial?', a: 'The Free plan is free forever. Pro features are available immediately after upgrading — no trial needed.' },
  { q: 'How does billing work?', a: 'Billed monthly or annually. Annual billing saves you 2 months (effectively 17% off).' },
  { q: 'Can I upgrade mid-month?', a: "Yes — you'll be charged a prorated amount for the rest of the current billing cycle." },
]

export default function UpgradePage() {
  const router = useRouter()
  const [initials, setInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [userId, setUserId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [openMaint, setOpenMaint] = useState(0)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const monthlyPrice = 9.99
  const annualPrice = parseFloat((monthlyPrice * 10 / 12).toFixed(2))

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      setUserId(user.id)
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

      // Check current plan
      const { data: sub } = await supabase
        .from('subscriptions').select('plan,status')
        .eq('profile_id', user.id).eq('status', 'active').maybeSingle()
      if (sub?.plan) setCurrentPlan(sub.plan)

      // Open maintenance count
      const { data: props } = await supabase.from('properties').select('id').eq('landlord_id', user.id)
      const propIds = (props || []).map((p: any) => p.id)
      if (propIds.length > 0) {
        const { count } = await supabase.from('maintenance_requests')
          .select('id', { count: 'exact', head: true }).in('property_id', propIds).neq('status', 'resolved')
        setOpenMaint(count || 0)
      }

      // ── Handle Stripe success redirect ──
      const params = new URLSearchParams(window.location.search)
      const sessionId = params.get('session_id')
      const successParam = params.get('success')
      const planParam = params.get('plan') || 'pro'

      if (successParam === 'true' && sessionId) {
        setActivating(true)
        showToast('⏳ Verifying payment...', 'success')

        try {
          // Call our activate API to verify payment with Stripe and update DB
          const res = await fetch('/api/stripe/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              userId: user.id,
              plan: planParam,
            }),
          })
          const data = await res.json()

          if (data.success) {
            setCurrentPlan(data.plan)
            showToast(`🎉 You're now on ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}! All Pro features are unlocked.`, 'success')
          } else {
            showToast('Payment verified but activation failed. Please contact support.', 'error')
          }
        } catch {
          showToast('Could not activate plan. Please contact support.', 'error')
        } finally {
          setActivating(false)
          window.history.replaceState({}, '', '/landlord/upgrade')
        }
      } else if (successParam === 'true') {
        // Fallback: no session_id, just re-fetch plan
        setTimeout(async () => {
          const { data: newSub } = await supabase.from('subscriptions')
            .select('plan,status').eq('profile_id', user.id).eq('status', 'active').maybeSingle()
          if (newSub?.plan) {
            setCurrentPlan(newSub.plan)
            showToast('🎉 Plan upgraded successfully!', 'success')
          }
        }, 2000)
        window.history.replaceState({}, '', '/landlord/upgrade')
      } else if (params.get('cancelled') === 'true') {
        showToast('Payment cancelled — no charge was made.', 'error')
        window.history.replaceState({}, '', '/landlord/upgrade')
      }
    }
    load()
  }, [router])

  async function handleUpgrade(plan: 'pro' | 'business') {
    if (currentPlan === plan) { showToast('You are already on this plan.', 'error'); return }

    const priceId = plan === 'pro'
      ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
      : process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID

    if (!priceId) {
      showToast('Plan price not configured. Add NEXT_PUBLIC_STRIPE_PRO_PRICE_ID to .env.local', 'error')
      return
    }

    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, plan }),
      })
      const data = await res.json()
      if (data.error) { showToast('Error: ' + data.error, 'error'); setLoadingPlan(null); return }
      if (data.url) window.location.href = data.url
    } catch {
      showToast('Something went wrong. Please try again.', 'error')
      setLoadingPlan(null)
    }
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

  const isPro = currentPlan === 'pro' || currentPlan === 'business'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;600;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:hidden;width:100%}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center}
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
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.25);border-radius:5px;padding:1px 6px;margin-top:2px;text-transform:uppercase}
        .sb-uplan.pro{color:#FCD34D;background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.3)}
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;gap:10px;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:22px 20px 60px;flex:1;width:100%;min-width:0;overflow-x:hidden}

        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:13px 24px;border-radius:13px;font-size:14px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.2);white-space:nowrap;animation:toastIn .25s ease;max-width:90vw;text-align:center}
        .toast.success{background:linear-gradient(135deg,#16A34A,#15803D)}
        .toast.error{background:linear-gradient(135deg,#DC2626,#B91C1C)}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        .activating-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:800;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
        .activating-box{background:#fff;border-radius:20px;padding:32px 40px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.3)}
        .activating-icon{font-size:48px;margin-bottom:12px;animation:spin 1.5s linear infinite;display:inline-block}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .activating-title{font-family:'Fraunces',serif;font-size:22px;color:#0F172A;margin-bottom:6px}
        .activating-sub{font-size:14px;color:#64748B}

        .pro-active-banner{background:linear-gradient(135deg,#0F172A,#1a3354);border:1px solid rgba(59,130,246,.3);border-radius:18px;padding:24px 28px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;max-width:960px;margin-left:auto;margin-right:auto}
        .pab-left{display:flex;align-items:center;gap:16px}
        .pab-icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 4px 14px rgba(37,99,235,.4)}
        .pab-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .pab-sub{font-size:13px;color:#64748B}
        .pab-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12px;font-weight:700;padding:6px 16px;border-radius:99px;box-shadow:0 4px 12px rgba(37,99,235,.3)}
        .pab-features{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        .pab-feat{font-size:12px;color:#93C5FD;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2);border-radius:6px;padding:3px 10px}

        .sandbox-banner{background:#FEF9C3;border:1px solid #FDE68A;border-radius:12px;padding:12px 18px;margin-bottom:24px;font-size:13px;color:#D97706;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:960px;margin-left:auto;margin-right:auto}

        .hero{text-align:center;padding:32px 20px 40px;max-width:600px;margin:0 auto}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;background:linear-gradient(135deg,rgba(37,99,235,.1),rgba(99,102,241,.1));color:#2563EB;border:1px solid rgba(37,99,235,.2);border-radius:99px;padding:5px 14px;margin-bottom:16px}
        .hero-title{font-family:'Fraunces',serif;font-size:36px;font-weight:700;color:#0F172A;letter-spacing:-1px;line-height:1.15;margin-bottom:12px}
        .hero-title span{background:linear-gradient(135deg,#2563EB,#6366F1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:15px;color:#64748B;line-height:1.6;max-width:460px;margin:0 auto}

        .billing-wrap{display:flex;justify-content:center;margin-bottom:32px}
        .billing-toggle{display:flex;align-items:center;background:#F1F5F9;border-radius:12px;padding:4px;width:fit-content}
        .bt-opt{padding:8px 22px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;color:#64748B;transition:all .2s;position:relative;white-space:nowrap}
        .bt-opt.active{background:#fff;color:#0F172A;box-shadow:0 2px 8px rgba(15,23,42,.1)}
        .save-chip{position:absolute;top:-10px;right:-6px;background:#16A34A;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;white-space:nowrap}

        .plans{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;max-width:960px;margin:0 auto 48px}
        .plan{background:#fff;border:2px solid #E2E8F0;border-radius:20px;padding:24px;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s;position:relative}
        .plan:hover{box-shadow:0 8px 32px rgba(15,23,42,.1);transform:translateY(-2px)}
        .plan.featured{border-color:#3B82F6;background:linear-gradient(160deg,#0F172A,#1E1B4B);box-shadow:0 8px 40px rgba(37,99,235,.25)}
        .plan-label{font-size:11px;font-weight:800;border-radius:99px;padding:4px 12px;display:inline-block;margin-bottom:14px;width:fit-content}
        .plan-name{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .plan.featured .plan-name{color:#F1F5F9}
        .plan-desc{font-size:13px;color:#94A3B8;margin-bottom:18px;line-height:1.5}
        .plan-price-row{display:flex;align-items:flex-end;gap:4px;margin-bottom:4px}
        .plan-price{font-family:'Fraunces',serif;font-size:40px;font-weight:700;color:#0F172A;line-height:1;letter-spacing:-2px}
        .plan.featured .plan-price{color:#F1F5F9}
        .plan-price-unit{font-size:14px;color:#94A3B8;margin-bottom:6px;font-weight:500}
        .plan-billed{font-size:12px;color:#94A3B8;margin-bottom:20px}
        .plan-divider{height:1px;background:rgba(255,255,255,.08);margin:18px 0}
        .plan-divider.light{background:#F1F5F9}
        .plan-feature-list{flex:1;display:flex;flex-direction:column;gap:9px;margin-bottom:24px}
        .pf{display:flex;align-items:flex-start;gap:9px;font-size:13px}
        .pf-check{width:17px;height:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;margin-top:2px}
        .pf-check.yes{background:#DCFCE7;color:#16A34A}
        .pf-check.no{background:#F1F5F9;color:#94A3B8}
        .pf-check.yes-bright{background:rgba(59,130,246,.2);color:#60A5FA}
        .pf-text{color:#475569;line-height:1.4}
        .pf-text.bright{color:#CBD5E1}
        .pf-text.muted{color:#94A3B8;text-decoration:line-through}
        .plan-cta{width:100%;padding:13px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;text-align:center}
        .plan-cta:hover:not(:disabled){transform:translateY(-1px)}
        .plan-cta:disabled{opacity:.6;cursor:not-allowed;transform:none!important}
        .plan-cta.free-cta{background:#F1F5F9;color:#64748B;cursor:default}
        .plan-cta.free-cta:hover{transform:none}
        .plan-cta.pro-cta{background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;box-shadow:0 4px 16px rgba(59,130,246,.4)}
        .plan-cta.pro-cta:hover:not(:disabled){box-shadow:0 6px 22px rgba(59,130,246,.5)}
        .plan-cta.current-cta{background:rgba(255,255,255,.1);color:#93C5FD;cursor:default;border:1px solid rgba(255,255,255,.15)}
        .plan-cta.current-cta:hover{transform:none}
        .plan-cta.biz-cta{background:#fff;color:#0F172A;border:2px solid #E2E8F0}
        .plan-cta.biz-current{background:#F1F5F9;color:#64748B;cursor:default}
        .plan-cta.biz-current:hover{transform:none}
        .popular-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11px;font-weight:700;padding:5px 18px;border-radius:99px;white-space:nowrap;box-shadow:0 4px 12px rgba(37,99,235,.4)}

        .trust{display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;padding:24px 0 40px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;margin:0 auto 40px;max-width:900px}
        .trust-item{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#475569;white-space:nowrap}
        .trust-ico{font-size:18px}

        .compare-wrap{max-width:780px;margin:0 auto 48px}
        .compare-title{font-family:'Fraunces',serif;font-size:24px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:24px;letter-spacing:-.5px}
        .ctable-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px;box-shadow:0 1px 4px rgba(15,23,42,.06)}
        .ctable{width:100%;border-collapse:collapse;background:#fff;min-width:500px}
        .ctable th{padding:13px 18px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748B;background:#F8FAFC;border-bottom:1px solid #E2E8F0;text-align:center}
        .ctable th:first-child{text-align:left}
        .ctable td{padding:12px 18px;font-size:13px;color:#0F172A;border-bottom:1px solid #F8FAFC;text-align:center;vertical-align:middle}
        .ctable td:first-child{text-align:left;font-weight:600;color:#374151}
        .ctable tr:last-child td{border-bottom:none}
        .ctable tbody tr:hover{background:#FAFBFF}
        .ct-yes{color:#16A34A;font-size:16px}
        .ct-no{color:#CBD5E1;font-size:16px}
        .ct-pro{font-size:10.5px;font-weight:700;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;padding:2px 8px;border-radius:99px}

        .faq-wrap{max-width:620px;margin:0 auto 48px}
        .faq-title{font-family:'Fraunces',serif;font-size:24px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:20px;letter-spacing:-.5px}
        .faq-item{background:#fff;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:8px;overflow:hidden;transition:box-shadow .15s}
        .faq-item.open{box-shadow:0 4px 16px rgba(15,23,42,.07)}
        .faq-q{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;cursor:pointer;gap:12px}
        .faq-q-text{font-size:13.5px;font-weight:700;color:#0F172A;line-height:1.4}
        .faq-chevron{font-size:12px;color:#94A3B8;transition:transform .2s;flex-shrink:0}
        .faq-item.open .faq-chevron{transform:rotate(180deg)}
        .faq-a{padding:0 18px 14px;font-size:13px;color:#64748B;line-height:1.6}

        .bottom-cta{background:linear-gradient(135deg,#0F172A,#1E1B4B);border-radius:22px;padding:40px 32px;text-align:center;max-width:680px;margin:0 auto}
        .bc-title{font-family:'Fraunces',serif;font-size:28px;font-weight:700;color:#F1F5F9;letter-spacing:-.8px;margin-bottom:10px}
        .bc-sub{font-size:14px;color:#93C5FD;margin-bottom:24px;line-height:1.5}
        .bc-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 28px;border-radius:12px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 20px rgba(59,130,246,.45);transition:all .2s}
        .bc-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(59,130,246,.5)}
        .bc-btn:disabled{opacity:.6;cursor:not-allowed}
        .bc-note{font-size:12px;color:#475569;margin-top:12px}

        @media(max-width:900px){.plans{grid-template-columns:1fr;max-width:480px}.plan.featured{order:-1}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px 48px}
          .hero{padding:24px 0 32px}.hero-title{font-size:28px}
          .trust{gap:14px;padding:20px 0 32px}
          .bc-btn{width:100%}.bottom-cta{padding:28px 20px}.bc-title{font-size:24px}
        }
        @media(max-width:480px){
          .content{padding:12px 12px 40px}.hero-title{font-size:24px}.hero-sub{font-size:13.5px}
        }
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Activating overlay */}
      {activating && (
        <div className="activating-overlay">
          <div className="activating-box">
            <div className="activating-icon">⚙️</div>
            <div className="activating-title">Activating your plan...</div>
            <div className="activating-sub">Verifying payment with Stripe</div>
          </div>
        </div>
      )}

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={24} height={24} />
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
            <a href="/landlord/maintenance" className="sb-item">
              <span className="sb-ico">🔧</span>Maintenance
              {openMaint > 0 && <span className="sb-badge">{openMaint}</span>}
            </a>
            <a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item" style={{ justifyContent: 'space-between' }}>
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
            <a href="/landlord/upgrade" className="sb-item active"><span className="sb-ico">⭐</span>Upgrade</a>
          </nav>
          <div className="sb-footer">
            {!isPro && (
              <div className="sb-upgrade">
                <div className="sb-up-title">⭐ Upgrade to Pro</div>
                <div className="sb-up-sub">Unlimited properties & priority support.</div>
                <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
              </div>
            )}
            <div className="sb-user">
              <div className="sb-av">{initials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className={`sb-uplan${isPro ? ' pro' : ''}`}>{currentPlan}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Upgrade to Pro</b></div>
          </div>

          <div className="content">

            {/* Pro active banner */}
            {isPro && (
              <div className="pro-active-banner">
                <div className="pab-left">
                  <div className="pab-icon">⭐</div>
                  <div>
                    <div className="pab-title">You're on {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}!</div>
                    <div className="pab-sub">All Pro features are active. Enjoy your upgraded account.</div>
                    <div className="pab-features">
                      {['Unlimited properties', 'CSV exports', 'Advanced analytics', 'Unlimited listings'].map(f => (
                        <span key={f} className="pab-feat">✓ {f}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pab-badge">✓ {currentPlan.toUpperCase()} Active</div>
              </div>
            )}

            {/* Sandbox banner */}
            <div className="sandbox-banner">
              🧪 Stripe Sandbox &nbsp;·&nbsp; Test card: <strong style={{ margin: '0 4px' }}>4242 4242 4242 4242</strong> &nbsp;·&nbsp; Any future expiry &nbsp;·&nbsp; Any 3-digit CVC &nbsp;·&nbsp; No real charge
            </div>

            {/* Hero */}
            <div className="hero">
              <div className="hero-eyebrow">⭐ Simple, transparent pricing</div>
              <h1 className="hero-title">Grow your portfolio<br />with <span>Rentura Pro</span></h1>
              <p className="hero-sub">Everything you need to manage properties like a pro — from ${billing === 'annual' ? annualPrice.toFixed(2) : monthlyPrice}/month. No hidden fees, cancel anytime.</p>
            </div>

            {/* Billing toggle */}
            <div className="billing-wrap">
              <div className="billing-toggle">
                <button className={`bt-opt${billing === 'monthly' ? ' active' : ''}`} onClick={() => setBilling('monthly')}>Monthly</button>
                <button className={`bt-opt${billing === 'annual' ? ' active' : ''}`} onClick={() => setBilling('annual')}>
                  Annual
                  <span className="save-chip">Save 15%</span>
                </button>
              </div>
            </div>

            {/* Plans */}
            <div className="plans">

              {/* FREE */}
              <div className="plan">
                <span className="plan-label" style={{ background: '#F1F5F9', color: '#64748B' }}>Free</span>
                <div className="plan-name">Starter</div>
                <div className="plan-desc">Perfect for landlords just getting started.</div>
                <div className="plan-price-row">
                  <div className="plan-price">$0</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed">Free forever</div>
                <div className="plan-divider light" />
                <div className="plan-feature-list">
                  {FREE_FEATURES.map((f, i) => (
                    <div key={i} className="pf">
                      <div className={`pf-check ${f.included ? 'yes' : 'no'}`}>{f.included ? '✓' : '×'}</div>
                      <span className={`pf-text${f.included ? '' : ' muted'}`}>{f.text}</span>
                    </div>
                  ))}
                </div>
                <button className="plan-cta free-cta">
                  {currentPlan === 'free' ? '✓ Current Plan' : 'Free Plan'}
                </button>
              </div>

              {/* PRO */}
              <div className="plan featured">
                <div className="popular-badge">⭐ Most Popular</div>
                <span className="plan-label" style={{ background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff' }}>Pro</span>
                <div className="plan-name">Pro</div>
                <div className="plan-desc" style={{ color: '#93C5FD' }}>For serious landlords who want full control.</div>
                <div className="plan-price-row">
                  <div className="plan-price">${billing === 'annual' ? annualPrice.toFixed(2) : monthlyPrice}</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed" style={{ color: '#64748B' }}>
                  {billing === 'annual'
                    ? `Billed $${(annualPrice * 12).toFixed(2)}/year`
                    : 'Billed monthly'}
                </div>
                <div className="plan-divider" />
                <div className="plan-feature-list">
                  {PRO_FEATURES.map((f, i) => (
                    <div key={i} className="pf">
                      <div className="pf-check yes-bright">✓</div>
                      <span className="pf-text bright">{f.text}</span>
                    </div>
                  ))}
                </div>
                {currentPlan === 'pro'
                  ? <button className="plan-cta current-cta">✓ Current Plan</button>
                  : <button className="plan-cta pro-cta" disabled={!!loadingPlan || activating} onClick={() => handleUpgrade('pro')}>
                    {loadingPlan === 'pro' ? '⏳ Redirecting...' : 'Upgrade to Pro →'}
                  </button>
                }
              </div>

              {/* BUSINESS */}
              <div className="plan">
                <span className="plan-label" style={{ background: '#FEF3C7', color: '#D97706' }}>Business</span>
                <div className="plan-name">Business</div>
                <div className="plan-desc">For agencies and large-scale property managers.</div>
                <div className="plan-price-row">
                  <div className="plan-price">$24</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed">{billing === 'annual' ? 'Billed $240/year' : 'Billed monthly'}</div>
                <div className="plan-divider light" />
                <div className="plan-feature-list">
                  {BUSINESS_FEATURES.map((f, i) => (
                    <div key={i} className="pf">
                      <div className="pf-check yes">✓</div>
                      <span className="pf-text">{f}</span>
                    </div>
                  ))}
                </div>
                {currentPlan === 'business'
                  ? <button className="plan-cta biz-current">✓ Current Plan</button>
                  : <button className="plan-cta biz-cta" disabled={!!loadingPlan || activating} onClick={() => handleUpgrade('business')}>
                    {loadingPlan === 'business' ? '⏳ Redirecting...' : 'Upgrade to Business →'}
                  </button>
                }
              </div>
            </div>

            {/* Trust strip */}
            <div className="trust">
              <div className="trust-item"><span className="trust-ico">🔒</span>Secure payments via Stripe</div>
              <div className="trust-item"><span className="trust-ico">↩️</span>Cancel anytime</div>
              <div className="trust-item"><span className="trust-ico">📊</span>Data always yours</div>
              <div className="trust-item"><span className="trust-ico">⚡</span>Instant activation</div>
              <div className="trust-item"><span className="trust-ico">🎧</span>Priority support on Pro</div>
            </div>

            {/* Comparison table */}
            <div className="compare-wrap">
              <div className="compare-title">Full Feature Comparison</div>
              <div className="ctable-scroll">
                <table className="ctable">
                  <thead>
                    <tr><th>Feature</th><th>Free</th><th>Pro</th><th>Business</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['Properties', '3', 'Unlimited', 'Unlimited'],
                      ['Units', '10', 'Unlimited', 'Unlimited'],
                      ['Rent tracker', '✓', '✓', '✓'],
                      ['Maintenance requests', '✓', '✓', '✓'],
                      ['Documents', 'Basic', 'Unlimited', 'Unlimited'],
                      ['Listings', '2', 'Unlimited', 'Unlimited'],
                      ['Messaging', '✓', '✓', '✓'],
                      ['Reports & analytics', '✗', 'PRO', 'PRO'],
                      ['CSV / PDF exports', '✗', 'PRO', 'PRO'],
                      ['Year-over-year trends', '✗', 'PRO', 'PRO'],
                      ['Property comparison', '✗', 'PRO', 'PRO'],
                      ['Priority support', '✗', 'PRO', 'PRO'],
                      ['Team access', '✗', '✗', '✓'],
                      ['API access', '✗', '✗', '✓'],
                      ['White-label branding', '✗', '✗', '✓'],
                    ].map(([feat, free, pro, biz], i) => (
                      <tr key={i}>
                        <td>{feat}</td>
                        <td>{free === '✓' ? <span className="ct-yes">✓</span> : free === '✗' ? <span className="ct-no">✗</span> : free}</td>
                        <td>{pro === '✓' ? <span className="ct-yes">✓</span> : pro === '✗' ? <span className="ct-no">✗</span> : pro === 'PRO' ? <span className="ct-pro">PRO</span> : pro}</td>
                        <td>{biz === '✓' ? <span className="ct-yes">✓</span> : biz === '✗' ? <span className="ct-no">✗</span> : biz === 'PRO' ? <span className="ct-pro">PRO</span> : biz}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FAQ */}
            <div className="faq-wrap">
              <div className="faq-title">Frequently Asked Questions</div>
              {FAQS.map((faq, i) => (
                <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
                  <div className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <div className="faq-q-text">{faq.q}</div>
                    <div className="faq-chevron">▼</div>
                  </div>
                  {openFaq === i && <div className="faq-a">{faq.a}</div>}
                </div>
              ))}
            </div>

            {/* Bottom CTA — only for non-pro */}
            {!isPro && (
              <div className="bottom-cta">
                <div className="bc-title">Ready to scale up?</div>
                <div className="bc-sub">Join landlords using Rentura Pro to manage their portfolios smarter. Start today — cancel anytime.</div>
                <button className="bc-btn" disabled={!!loadingPlan || activating} onClick={() => handleUpgrade('pro')}>
                  {loadingPlan === 'pro' ? '⏳ Redirecting to Stripe...' : '⭐ Get Rentura Pro →'}
                </button>
                <div className="bc-note">Test: 4242 4242 4242 4242 · Any future date · Any CVC</div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
