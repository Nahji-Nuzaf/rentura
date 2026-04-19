'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Get started with the basics',
    color: '#64748B',
    badge: null,
    features: [
      { text: 'Up to 3 properties',         ok: true  },
      { text: 'Up to 2 active listings',    ok: true  },
      { text: 'Tenant invite & management', ok: true  },
      { text: 'Basic rent tracking',        ok: true  },
      { text: 'Maintenance requests',       ok: true  },
      { text: 'AI listing writer',          ok: true  },
      { text: 'CSV / PDF exports',          ok: false },
      { text: 'Unlimited properties',       ok: false },
      { text: 'Advanced analytics',         ok: false },
      { text: 'Priority support',           ok: false },
    ],
    cta: 'Current Plan',
    priceId: null,
    plan: 'free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: 'per month',
    desc: 'Everything you need to grow',
    color: '#2563EB',
    badge: '⭐ Most Popular',
    features: [
      { text: 'Unlimited properties',        ok: true },
      { text: 'Unlimited active listings',   ok: true },
      { text: 'Tenant invite & management',  ok: true },
      { text: 'Full rent tracking',          ok: true },
      { text: 'Maintenance requests',        ok: true },
      { text: 'AI features (unlimited)',     ok: true },
      { text: 'CSV & PDF exports',           ok: true },
      { text: 'Advanced analytics',          ok: true },
      { text: 'Priority support',            ok: false },
    ],
    cta: 'Upgrade to Pro',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    plan: 'pro',
  },
  {
    id: 'business',
    name: 'Business',
    price: '$24.99',
    period: 'per month',
    desc: 'For professional landlords',
    color: '#6366F1',
    badge: null,
    features: [
      { text: 'Everything in Pro',           ok: true },
      { text: 'Unlimited properties',        ok: true },
      { text: 'Priority support',            ok: true },
      { text: 'Custom branding',             ok: true },
      { text: 'Team access (coming soon)',   ok: true },
      { text: 'API access (coming soon)',    ok: true },
      { text: 'Dedicated account manager',   ok: true },
      { text: 'SLA guarantee',              ok: true },
      { text: 'Advanced analytics',          ok: true },
      { text: 'CSV & PDF exports',           ok: true },
    ],
    cta: 'Upgrade to Business',
    priceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID || '',
    plan: 'business',
  },
]

export default function UpgradePage() {
  const router = useRouter()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName]         = useState('User')
  const [currentPlan, setCurrentPlan]   = useState('free')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [loadingPlan, setLoadingPlan]   = useState<string | null>(null)
  const [toast, setToast]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

      // Check current plan
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('profile_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (sub?.plan) setCurrentPlan(sub.plan)

      // Handle Stripe redirect back
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'true') {
        showToast('🎉 Payment successful! Your plan is now active.', 'success')
        window.history.replaceState({}, '', '/landlord/upgrade')
        // Re-check plan after short delay (webhook may take a moment)
        setTimeout(async () => {
          const { data: newSub } = await supabase
            .from('subscriptions').select('plan,status')
            .eq('profile_id', user.id).eq('status','active').maybeSingle()
          if (newSub?.plan) setCurrentPlan(newSub.plan)
        }, 3000)
      }
      if (params.get('cancelled') === 'true') {
        showToast('Payment cancelled — no charge was made.', 'error')
        window.history.replaceState({}, '', '/landlord/upgrade')
      }
    }
    init()
  }, [router])

  async function handleUpgrade(plan: typeof PLANS[0]) {
    if (currentPlan === plan.id) {
      showToast('You are already on this plan.', 'error'); return
    }
    if (!plan.priceId) {
      showToast('This plan is not available yet.', 'error'); return
    }

    setLoadingPlan(plan.id)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.priceId, plan: plan.plan }),
      })
      const data = await res.json()
      if (data.error) {
        showToast('Error: ' + data.error, 'error')
        setLoadingPlan(null)
        return
      }
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err: any) {
      showToast('Something went wrong. Please try again.', 'error')
      setLoadingPlan(null)
    }
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
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease}
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
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-user{padding:14px 18px;display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.25);border-radius:5px;padding:1px 6px;margin-top:2px;text-transform:uppercase}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);gap:10px}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:32px 20px;flex:1;width:100%;min-width:0}

        /* PAGE */
        .page-header{text-align:center;margin-bottom:44px}
        .page-title{font-family:'Fraunces',serif;font-size:38px;font-weight:400;color:#0F172A;letter-spacing:-.8px;margin-bottom:10px}
        .page-sub{font-size:15px;color:#64748B;line-height:1.6;max-width:460px;margin:0 auto 20px}
        .test-banner{display:inline-flex;align-items:center;gap:8px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:10px 18px;font-size:13px;color:#D97706;font-weight:600}

        /* PLANS GRID */
        .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;max-width:1020px;margin:0 auto 48px}

        .plan-card{background:#fff;border:2px solid #E2E8F0;border-radius:24px;padding:30px;position:relative;transition:all .2s;display:flex;flex-direction:column}
        .plan-card:hover{box-shadow:0 16px 48px rgba(15,23,42,.1);transform:translateY(-3px)}
        .plan-card.featured{border-color:#2563EB;box-shadow:0 0 0 1px #2563EB,0 16px 48px rgba(37,99,235,.15)}
        .plan-card.current{background:#FAFBFF}

        .plan-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11.5px;font-weight:700;padding:5px 16px;border-radius:99px;white-space:nowrap;box-shadow:0 4px 12px rgba(37,99,235,.3)}
        .plan-current-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#F1F5F9;color:#64748B;border:1px solid #E2E8F0;font-size:11.5px;font-weight:700;padding:5px 16px;border-radius:99px;white-space:nowrap}

        .plan-name{font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
        .plan-price{font-family:'Fraunces',serif;font-size:42px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:3px}
        .plan-period{font-size:13px;color:#94A3B8;margin-bottom:8px}
        .plan-desc{font-size:13.5px;color:#64748B;margin-bottom:22px;line-height:1.5}
        .plan-divider{height:1px;background:#F1F5F9;margin-bottom:20px}

        .plan-features{flex:1;display:flex;flex-direction:column;gap:11px;margin-bottom:26px}
        .plan-feat{display:flex;align-items:center;gap:10px;font-size:13.5px}
        .feat-icon{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}
        .feat-icon.ok{background:#DCFCE7;color:#16A34A}
        .feat-icon.no{background:#F1F5F9;color:#CBD5E1}

        .plan-btn{width:100%;padding:14px;border-radius:13px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;margin-top:auto;letter-spacing:.1px}
        .plan-btn.grey{background:#F1F5F9;color:#94A3B8;cursor:default}
        .plan-btn.blue{background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;box-shadow:0 4px 16px rgba(37,99,235,.3)}
        .plan-btn.blue:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 22px rgba(37,99,235,.4)}
        .plan-btn.indigo{background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;box-shadow:0 4px 16px rgba(99,102,241,.3)}
        .plan-btn.indigo:hover:not(:disabled){transform:translateY(-1px)}
        .plan-btn:disabled{opacity:.55;cursor:not-allowed;transform:none!important}

        /* FAQ */
        .faq-wrap{max-width:700px;margin:0 auto 40px}
        .faq-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:22px}
        .faq-item{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px 22px;margin-bottom:10px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .faq-q{font-size:14.5px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .faq-a{font-size:13.5px;color:#64748B;line-height:1.7}

        /* TOAST */
        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:13px 24px;border-radius:13px;font-size:14px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.2);white-space:nowrap;animation:toastIn .25s ease}
        .toast.success{background:linear-gradient(135deg,#16A34A,#15803D)}
        .toast.error{background:linear-gradient(135deg,#DC2626,#B91C1C)}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        @media(max-width:960px){.plans{grid-template-columns:1fr;max-width:440px}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:20px 14px}.page-title{font-size:28px}
        }
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={()=>setSidebarOpen(false)}/>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura" width={24} height={24}/>
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
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
            <a href="/landlord/upgrade" className="sb-item active"><span className="sb-ico">⭐</span>Upgrade</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-uplan">{currentPlan}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Upgrade</b></div>
          </div>

          <div className="content">
            {/* Header */}
            <div className="page-header">
              <div className="page-title">Choose your plan</div>
              <div className="page-sub">Start free, upgrade when you're ready. No contracts, cancel anytime.</div>
              <div className="test-banner">
                🧪 Sandbox Mode &nbsp;·&nbsp; Test card: <strong>4242 4242 4242 4242</strong> &nbsp;·&nbsp; Any future date &nbsp;·&nbsp; Any CVC
              </div>
            </div>

            {/* Plans */}
            <div className="plans">
              {PLANS.map(plan => {
                const isCurrent  = currentPlan === plan.id
                const isLoading  = loadingPlan === plan.id
                const isFeatured = plan.id === 'pro'
                const btnClass   = isCurrent ? 'grey' : plan.id === 'business' ? 'indigo' : 'blue'

                return (
                  <div key={plan.id} className={`plan-card${isFeatured?' featured':''}${isCurrent?' current':''}`}>
                    {plan.badge && !isCurrent && <div className="plan-badge">{plan.badge}</div>}
                    {isCurrent && <div className="plan-current-badge">✓ Current Plan</div>}

                    <div className="plan-name" style={{color:plan.color}}>{plan.name}</div>
                    <div className="plan-price">{plan.price}</div>
                    <div className="plan-period">{plan.period}</div>
                    <div className="plan-desc">{plan.desc}</div>
                    <div className="plan-divider"/>

                    <div className="plan-features">
                      {plan.features.map(f => (
                        <div key={f.text} className="plan-feat">
                          <div className={`feat-icon ${f.ok?'ok':'no'}`}>{f.ok?'✓':'×'}</div>
                          <span style={{color:f.ok?'#374151':'#94A3B8'}}>{f.text}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      className={`plan-btn ${btnClass}`}
                      disabled={isCurrent || isLoading}
                      onClick={() => !isCurrent && handleUpgrade(plan)}>
                      {isLoading
                        ? '⏳ Redirecting to Stripe...'
                        : isCurrent
                          ? '✓ Current Plan'
                          : plan.cta}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* FAQ */}
            <div className="faq-wrap">
              <div className="faq-title">Frequently Asked Questions</div>
              {[
                {
                  q: 'Is this a real charge?',
                  a: 'No — we are in Stripe sandbox (test) mode. Use the card 4242 4242 4242 4242 with any future expiry and any 3-digit CVC. No real money is charged.'
                },
                {
                  q: 'When does my Pro plan activate?',
                  a: 'Instantly after payment. The webhook updates your account in real time and all Pro features unlock immediately.'
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes — cancel anytime. You keep Pro access until the end of your current billing period with no further charges.'
                },
                {
                  q: 'What happens to my data if I downgrade?',
                  a: 'Your data is always safe. If you exceed free plan limits after downgrading, existing data is preserved but you won\'t be able to add more until you upgrade again.'
                },
                {
                  q: 'Can I upgrade from Pro to Business?',
                  a: 'Yes — you can switch plans anytime. The change takes effect immediately and your billing is prorated.'
                },
              ].map(f => (
                <div key={f.q} className="faq-item">
                  <div className="faq-q">{f.q}</div>
                  <div className="faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
