'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

// Plan Definitions with Stripe Price IDs from your Env
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
  { q: 'Can I cancel anytime?', a: 'Yes — cancel anytime from your settings. You keep Pro access until the end of your billing period.' },
  { q: 'What happens to my data if I downgrade?', a: "Your data stays safe. If you have more than 3 properties you'll need to archive extras, but nothing is deleted." },
  { q: 'Is there a free trial?', a: 'The Free plan is free forever. Pro features are available immediately after upgrading — no trial needed.' },
  { q: 'How does billing work?', a: 'Billed monthly or annually. Annual billing saves you money over the long term.' },
]

export default function UpgradePage() {
  const router = useRouter()
  const [initials, setInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [openMaint, setOpenMaint] = useState(0)
  
  // LOGIC STATES FROM NEW DESIGN
  const [currentPlan, setCurrentPlan] = useState('free')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

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
      setInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))

      // 1. Check current plan status
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('profile_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (sub?.plan) setCurrentPlan(sub.plan)

      // 2. Fetch Maintenance Badge Count
      const { data: props } = await supabase.from('properties').select('id').eq('landlord_id', user.id)
      const propIds = (props || []).map((p: any) => p.id)
      if (propIds.length > 0) {
        const { count } = await supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .in('property_id', propIds).neq('status', 'resolved')
        setOpenMaint(count || 0)
      }

      // 3. Handle Stripe Query Params
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'true') {
        showToast('🎉 Payment successful! Your plan is now active.', 'success')
        window.history.replaceState({}, '', '/landlord/upgrade')
      }
      if (params.get('cancelled') === 'true') {
        showToast('Payment cancelled — no charge was made.', 'error')
        window.history.replaceState({}, '', '/landlord/upgrade')
      }
    }
    init()
  }, [router])

  async function handleUpgrade(planName: string) {
    if (currentPlan === planName.toLowerCase()) {
      showToast('You are already on this plan.', 'error'); return
    }

    // Determine correct price ID based on toggle
    let priceId = "";
    if (planName === 'Pro') {
      priceId = billing === 'monthly' 
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '' 
        : process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID || '' // Assumes you have annual ID
    } else if (planName === 'Business') {
      priceId = process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID || ''
    }

    if (!priceId && planName !== 'Starter') {
      showToast('Price ID not configured for this plan.', 'error'); return
    }

    setLoadingPlan(planName.toLowerCase())
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, plan: planName.toLowerCase() }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        showToast(data.error || 'Checkout failed', 'error')
        setLoadingPlan(null)
      }
    } catch (err) {
      showToast('Connection error. Try again.', 'error')
      setLoadingPlan(null)
    }
  }

  const monthlyPrice = 20
  const annualPrice = 15 // Prorated for display

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;600;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:hidden;width:100%}

        /* SIDEBAR */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; }
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.25);border-radius:5px;padding:1px 6px;margin-top:2px;text-transform:uppercase}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;gap:10px;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:22px 20px 60px;flex:1;width:100%;min-width:0;overflow-x:hidden}

        /* TOAST */
        .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:13px 24px;border-radius:13px;font-size:14px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.2);white-space:nowrap;animation:toastIn .25s ease}
        .toast.success{background:linear-gradient(135deg,#16A34A,#15803D)}
        .toast.error{background:linear-gradient(135deg,#DC2626,#B91C1C)}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        /* HERO & UI ELEMENTS (ORIGINAL) */
        .hero{text-align:center;padding:32px 20px 40px;max-width:600px;margin:0 auto}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;background:linear-gradient(135deg,rgba(37,99,235,.1),rgba(99,102,241,.1));color:#2563EB;border:1px solid rgba(37,99,235,.2);border-radius:99px;padding:5px 14px;margin-bottom:16px}
        .hero-title{font-family:'Fraunces',serif;font-size:36px;font-weight:700;color:#0F172A;letter-spacing:-1px;line-height:1.15;margin-bottom:12px}
        .hero-title span{background:linear-gradient(135deg,#2563EB,#6366F1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:15px;color:#64748B;line-height:1.6;max-width:460px;margin:0 auto}

        .billing-wrap{display:flex;justify:center;margin-bottom:32px}
        .billing-toggle{display:flex;align-items:center;background:#F1F5F9;border-radius:12px;padding:4px;width:fit-content;margin:0 auto}
        .bt-opt{padding:8px 22px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;color:#64748B;transition:all .2s;position:relative;white-space:nowrap}
        .bt-opt.active{background:#fff;color:#0F172A;box-shadow:0 2px 8px rgba(15,23,42,.1)}
        .save-chip{position:absolute;top:-10px;right:-6px;background:#16A34A;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;white-space:nowrap}

        .plans{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;max-width:960px;margin:0 auto 48px}
        .plan{background:#fff;border:2px solid #E2E8F0;border-radius:20px;padding:24px;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s;position:relative}
        .plan:hover{box-shadow:0 8px 32px rgba(15,23,42,.1);transform:translateY(-2px)}
        .plan.featured{border-color:#3B82F6;background:linear-gradient(160deg,#0F172A,#1E1B4B);box-shadow:0 8px 40px rgba(37,99,235,.25)}
        .plan.current{background:#FAFBFF;border-color:#E2E8F0}
        
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

        .plan-cta{width:100%;padding:12px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;text-align:center}
        .plan-cta:disabled{opacity:0.7;cursor:not-allowed}
        .plan-cta.free-cta{background:#F1F5F9;color:#64748B}
        .plan-cta.pro-cta{background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;box-shadow:0 4px 16px rgba(59,130,246,.4)}
        .plan-cta.biz-cta{background:#fff;color:#0F172A;border:2px solid #E2E8F0}
        .popular-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11px;font-weight:700;padding:5px 18px;border-radius:99px;white-space:nowrap;box-shadow:0 4px 12px rgba(37,99,235,.4)}

        /* FAQ (ORIGINAL) */
        .faq-wrap{max-width:620px;margin:0 auto 48px}
        .faq-title{font-family:'Fraunces',serif;font-size:24px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:20px}
        .faq-item{background:#fff;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:8px;overflow:hidden}
        .faq-q{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;cursor:pointer}
        .faq-q-text{font-size:13.5px;font-weight:700;color:#0F172A}
        .faq-a{padding:0 18px 14px;font-size:13px;color:#64748B;line-height:1.6}

        @media(max-width:900px){ .plans{grid-template-columns:1fr;max-width:480px} .plan.featured{order:-1} }
        @media(max-width:768px){ .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block} }
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
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
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{initials}</div>
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">{currentPlan}</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Upgrade to Pro</b></div>
          </div>

          <div className="content">
            <div className="hero">
              <div className="hero-eyebrow">⭐ Simple, transparent pricing</div>
              <h1 className="hero-title">Grow your portfolio<br />with <span>Rentura Pro</span></h1>
              <p className="hero-sub">Everything you need to manage properties like a pro. Sandbox Mode active.</p>
            </div>

            <div className="billing-wrap">
              <div className="billing-toggle">
                <button className={`bt-opt${billing === 'monthly' ? ' active' : ''}`} onClick={() => setBilling('monthly')}>Monthly</button>
                <button className={`bt-opt${billing === 'annual' ? ' active' : ''}`} onClick={() => setBilling('annual')}>
                  Annual
                  <span className="save-chip">Save 15%</span>
                </button>
              </div>
            </div>

            <div className="plans">
              {/* Starter / Free */}
              <div className={`plan ${currentPlan === 'free' ? 'current' : ''}`}>
                <span className="plan-label" style={{ background: '#F1F5F9', color: '#64748B' }}>Free</span>
                <div className="plan-name">Starter</div>
                <div className="plan-desc">Perfect for landlords with a single property.</div>
                <div className="plan-price-row"><div className="plan-price">$0</div><div className="plan-price-unit">/mo</div></div>
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
                <button className="plan-cta free-cta" disabled>{currentPlan === 'free' ? '✓ Current Plan' : 'Free Plan'}</button>
              </div>

              {/* Pro Plan */}
              <div className={`plan featured ${currentPlan === 'pro' ? 'current' : ''}`}>
                <div className="popular-badge">⭐ Most Popular</div>
                <span className="plan-label" style={{ background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff' }}>Pro</span>
                <div className="plan-name">Pro</div>
                <div className="plan-desc" style={{ color: '#93C5FD' }}>Full control of your property portfolio.</div>
                <div className="plan-price-row">
                  <div className="plan-price">${billing === 'annual' ? annualPrice : monthlyPrice}</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed">{billing === 'annual' ? 'Billed annually' : 'Billed monthly'}</div>
                <div className="plan-divider" />
                <div className="plan-feature-list">
                  {PRO_FEATURES.map((f, i) => (
                    <div key={i} className="pf">
                      <div className="pf-check yes-bright">✓</div>
                      <span className="pf-text bright">{f.text}</span>
                    </div>
                  ))}
                </div>
                <button 
                  className="plan-cta pro-cta" 
                  disabled={currentPlan === 'pro' || loadingPlan === 'pro'}
                  onClick={() => handleUpgrade('Pro')}
                >
                  {loadingPlan === 'pro' ? 'Redirecting...' : currentPlan === 'pro' ? '✓ Current Plan' : 'Upgrade to Pro →'}
                </button>
              </div>

              {/* Business Plan */}
              <div className={`plan ${currentPlan === 'business' ? 'current' : ''}`}>
                <span className="plan-label" style={{ background: '#FEF3C7', color: '#D97706' }}>Business</span>
                <div className="plan-name">Business</div>
                <div className="plan-desc">For large-scale property managers.</div>
                <div className="plan-price-row"><div className="plan-price">$29</div><div className="plan-price-unit">/mo</div></div>
                <div className="plan-billed">Billed monthly</div>
                <div className="plan-divider light" />
                <div className="plan-feature-list">
                  {BUSINESS_FEATURES.map((f, i) => (
                    <div key={i} className="pf"><div className="pf-check yes">✓</div><span className="pf-text">{f}</span></div>
                  ))}
                </div>
                <button 
                  className="plan-cta biz-cta"
                  disabled={currentPlan === 'business' || loadingPlan === 'business'}
                  onClick={() => handleUpgrade('Business')}
                >
                   {loadingPlan === 'business' ? 'Redirecting...' : currentPlan === 'business' ? '✓ Current Plan' : 'Contact Sales'}
                </button>
              </div>
            </div>

            <div className="faq-wrap">
              <div className="faq-title">Frequently Asked Questions</div>
              {FAQS.map((faq, i) => (
                <div key={i} className="faq-item">
                  <div className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <div className="faq-q-text">{faq.q}</div>
                    <span>{openFaq === i ? '▲' : '▼'}</span>
                  </div>
                  {openFaq === i && <div className="faq-a">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}