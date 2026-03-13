'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const FREE_FEATURES = [
  { text: '1 property',               included: true },
  { text: 'Up to 10 units',           included: true },
  { text: 'Rent tracker',             included: true },
  { text: 'Maintenance requests',     included: true },
  { text: 'Basic documents',          included: true },
  { text: '2 active listings',        included: true },
  { text: 'Tenant messaging',         included: true },
  { text: 'Advanced reports',         included: false },
  { text: 'CSV / PDF exports',        included: false },
  { text: 'Multiple properties',      included: false },
  { text: 'Year-over-year analytics', included: false },
  { text: 'Priority support',         included: false },
]

const PRO_FEATURES = [
  { text: 'Unlimited properties',          included: true },
  { text: 'Unlimited units',               included: true },
  { text: 'Rent tracker + auto-reminders', included: true },
  { text: 'Maintenance requests',          included: true },
  { text: 'Unlimited documents',           included: true },
  { text: 'Unlimited listings',            included: true },
  { text: 'Tenant messaging',              included: true },
  { text: 'Advanced reports & analytics',  included: true },
  { text: 'CSV & PDF exports',             included: true },
  { text: 'Year-over-year trends',         included: true },
  { text: 'Property comparison',           included: true },
  { text: 'Priority support',              included: true },
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
  { q: 'Can I cancel anytime?',         a: 'Yes — cancel anytime from your settings. You keep Pro access until the end of your billing period.' },
  { q: 'What happens to my data if I downgrade?', a: 'Your data stays safe. If you have more than 1 property you\'ll need to archive extras, but nothing is deleted.' },
  { q: 'Is there a free trial?',        a: 'The Free plan is free forever. Pro features are available immediately after upgrading — no trial needed.' },
  { q: 'How does billing work?',        a: 'Billed monthly or annually. Annual billing saves you 2 months (effectively 17% off). Payments via Stripe.' },
  { q: 'Can I upgrade mid-month?',      a: 'Yes — you\'ll be charged a prorated amount for the rest of the current billing cycle.' },
]

export default function UpgradePage() {
  const router = useRouter()
  const [initials, setInitials]       = useState('NN')
  const [fullName, setFullName]       = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [billing, setBilling]         = useState<'monthly'|'annual'>('monthly')
  const [openFaq, setOpenFaq]         = useState<number|null>(null)
  const [openMaint, setOpenMaint]     = useState(0)

  const monthlyPrice = 12
  const annualPrice  = Math.round(monthlyPrice * 10 / 12)  // 10 months = ~$10/mo

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setInitials(name.split(' ').map((n:string)=>n[0]).join('').toUpperCase().slice(0,2))

      const { data: props } = await supabase.from('properties').select('id').eq('landlord_id', user.id)
      const propIds = (props||[]).map((p:any)=>p.id)
      if (propIds.length > 0) {
        const { count } = await supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .in('property_id', propIds).neq('status','resolved')
        setOpenMaint(count||0)
      }
    }
    load()
  }, [router])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;600;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif}
        body{background:#F4F6FA}
        .shell{display:flex;min-height:100vh}

        /* SIDEBAR */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,0.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,0.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,0.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,0.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh}
        .topbar{height:58px;display:flex;align-items:center;gap:12px;padding:0 28px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:32px 30px 60px;flex:1}

        /* HERO */
        .hero{text-align:center;padding:40px 20px 48px;max-width:600px;margin:0 auto}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;background:linear-gradient(135deg,rgba(37,99,235,0.1),rgba(99,102,241,0.1));color:#2563EB;border:1px solid rgba(37,99,235,0.2);border-radius:99px;padding:5px 14px;margin-bottom:18px}
        .hero-title{font-family:'Fraunces',serif;font-size:40px;font-weight:700;color:#0F172A;letter-spacing:-1px;line-height:1.15;margin-bottom:14px}
        .hero-title span{background:linear-gradient(135deg,#2563EB,#6366F1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:16px;color:#64748B;line-height:1.6;max-width:480px;margin:0 auto}

        /* BILLING TOGGLE */
        .billing-toggle{display:flex;align-items:center;justify-content:center;gap:0;background:#F1F5F9;border-radius:12px;padding:4px;width:fit-content;margin:0 auto 40px}
        .bt-opt{padding:8px 22px;border-radius:9px;font-size:13.5px;font-weight:700;cursor:pointer;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;color:#64748B;transition:all .2s;position:relative}
        .bt-opt.active{background:#fff;color:#0F172A;box-shadow:0 2px 8px rgba(15,23,42,0.1)}
        .save-chip{position:absolute;top:-10px;right:-6px;background:#16A34A;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;white-space:nowrap}

        /* PLAN CARDS */
        .plans{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;max-width:960px;margin:0 auto 56px}
        .plan{background:#fff;border:2px solid #E2E8F0;border-radius:22px;padding:28px;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s;position:relative}
        .plan:hover{box-shadow:0 8px 32px rgba(15,23,42,0.1);transform:translateY(-2px)}
        .plan.featured{border-color:#3B82F6;background:linear-gradient(160deg,#0F172A,#1E1B4B);box-shadow:0 8px 40px rgba(37,99,235,0.25)}
        .plan-label{font-size:11px;font-weight:800;border-radius:99px;padding:4px 12px;display:inline-block;margin-bottom:16px;width:fit-content}
        .plan-name{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .plan.featured .plan-name{color:#F1F5F9}
        .plan-desc{font-size:13px;color:#94A3B8;margin-bottom:20px;line-height:1.5}
        .plan-price-row{display:flex;align-items:flex-end;gap:4px;margin-bottom:6px}
        .plan-price{font-family:'Fraunces',serif;font-size:44px;font-weight:700;color:#0F172A;line-height:1;letter-spacing:-2px}
        .plan.featured .plan-price{color:#F1F5F9}
        .plan-price-unit{font-size:14px;color:#94A3B8;margin-bottom:8px;font-weight:500}
        .plan-billed{font-size:12px;color:#94A3B8;margin-bottom:24px}
        .plan-divider{height:1px;background:rgba(255,255,255,0.08);margin:20px 0}
        .plan-divider.light{background:#F1F5F9}
        .plan-feature-list{flex:1;display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
        .pf{display:flex;align-items:flex-start;gap:10px;font-size:13.5px}
        .pf-check{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:1px}
        .pf-check.yes{background:#DCFCE7;color:#16A34A}
        .pf-check.no{background:#F1F5F9;color:#94A3B8}
        .pf-check.yes-bright{background:rgba(59,130,246,0.2);color:#60A5FA}
        .pf-text{color:#475569;line-height:1.4}
        .pf-text.bright{color:#CBD5E1}
        .pf-text.muted{color:#94A3B8}
        .plan-cta{width:100%;padding:13px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .18s;text-align:center}
        .plan-cta:hover{transform:translateY(-1px)}
        .plan-cta.free-cta{background:#F1F5F9;color:#64748B;cursor:default}
        .plan-cta.free-cta:hover{transform:none}
        .plan-cta.pro-cta{background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;box-shadow:0 4px 16px rgba(59,130,246,0.4)}
        .plan-cta.biz-cta{background:#fff;color:#0F172A;border:2px solid #E2E8F0}
        .popular-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:11.5px;font-weight:700;padding:5px 18px;border-radius:99px;white-space:nowrap;box-shadow:0 4px 12px rgba(37,99,235,0.4)}

        /* COMPARISON TABLE */
        .compare-wrap{max-width:780px;margin:0 auto 56px}
        .compare-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:28px;letter-spacing:-0.5px}
        .ctable{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,0.06)}
        .ctable th{padding:14px 20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;background:#F8FAFC;border-bottom:1px solid #E2E8F0;text-align:center}
        .ctable th:first-child{text-align:left}
        .ctable td{padding:13px 20px;font-size:13.5px;color:#0F172A;border-bottom:1px solid #F8FAFC;text-align:center;vertical-align:middle}
        .ctable td:first-child{text-align:left;font-weight:600;color:#374151}
        .ctable tr:last-child td{border-bottom:none}
        .ctable tbody tr:hover{background:#FAFBFF}
        .ct-yes{color:#16A34A;font-size:17px}
        .ct-no{color:#CBD5E1;font-size:17px}
        .ct-pro{font-size:11px;font-weight:700;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;padding:2px 8px;border-radius:99px}

        /* TRUST STRIP */
        .trust{display:flex;align-items:center;justify-content:center;gap:32px;flex-wrap:wrap;padding:28px 0 48px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;margin-bottom:48px;max-width:780px;margin:0 auto 48px}
        .trust-item{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;color:#475569}
        .trust-ico{font-size:20px}

        /* FAQ */
        .faq-wrap{max-width:620px;margin:0 auto}
        .faq-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;text-align:center;margin-bottom:24px;letter-spacing:-0.5px}
        .faq-item{background:#fff;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:10px;overflow:hidden;transition:box-shadow .15s}
        .faq-item.open{box-shadow:0 4px 16px rgba(15,23,42,0.07)}
        .faq-q{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;gap:12px}
        .faq-q-text{font-size:14px;font-weight:700;color:#0F172A;line-height:1.4}
        .faq-chevron{font-size:14px;color:#94A3B8;transition:transform .2s;flex-shrink:0}
        .faq-item.open .faq-chevron{transform:rotate(180deg)}
        .faq-a{padding:0 20px 16px;font-size:13.5px;color:#64748B;line-height:1.6}

        /* BOTTOM CTA */
        .bottom-cta{background:linear-gradient(135deg,#0F172A,#1E1B4B);border-radius:24px;padding:48px 40px;text-align:center;max-width:700px;margin:40px auto 0}
        .bc-title{font-family:'Fraunces',serif;font-size:32px;font-weight:700;color:#F1F5F9;letter-spacing:-0.8px;margin-bottom:10px}
        .bc-sub{font-size:15px;color:#93C5FD;margin-bottom:28px;line-height:1.5}
        .bc-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;border-radius:12px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 20px rgba(59,130,246,0.45);transition:all .2s}
        .bc-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(59,130,246,0.5)}
        .bc-note{font-size:12.5px;color:#475569;margin-top:14px}

        @media(max-width:900px){.plans{grid-template-columns:1fr}}
        @media(max-width:768px){.sidebar{transform:translateX(-100%)}.main{margin-left:0}.hamburger{display:block}.content{padding:20px 16px 40px}.topbar{padding:0 16px}.hero-title{font-size:30px}.trust{gap:18px;padding:24px 16px}.compare-wrap{overflow-x:auto}.bc-btn{width:100%}}
      `}</style>

      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={()=>setSidebarOpen(false)}/>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
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
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">FREE</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
            <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Upgrade to Pro</b></div>
          </div>

          <div className="content">

            {/* HERO */}
            <div className="hero">
              <div className="hero-eyebrow">⭐ Simple, transparent pricing</div>
              <h1 className="hero-title">Grow your portfolio<br/>with <span>Rentura Pro</span></h1>
              <p className="hero-sub">Everything you need to manage properties like a pro — from $10/month. No hidden fees, cancel anytime.</p>
            </div>

            {/* BILLING TOGGLE */}
            <div className="billing-toggle">
              <button className={`bt-opt${billing==='monthly'?' active':''}`} onClick={()=>setBilling('monthly')}>Monthly</button>
              <button className={`bt-opt${billing==='annual'?' active':''}`} onClick={()=>setBilling('annual')}>
                Annual
                <span className="save-chip">Save 17%</span>
              </button>
            </div>

            {/* PLAN CARDS */}
            <div className="plans">

              {/* Free */}
              <div className="plan">
                <span className="plan-label" style={{background:'#F1F5F9',color:'#64748B'}}>Free</span>
                <div className="plan-name">Starter</div>
                <div className="plan-desc">Perfect for landlords with a single property just getting started.</div>
                <div className="plan-price-row">
                  <div className="plan-price">$0</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed">Free forever</div>
                <div className="plan-divider light"/>
                <div className="plan-feature-list">
                  {FREE_FEATURES.map((f,i) => (
                    <div key={i} className="pf">
                      <div className={`pf-check ${f.included?'yes':'no'}`}>{f.included?'✓':'×'}</div>
                      <span className={`pf-text${f.included?'':' muted'}`}>{f.text}</span>
                    </div>
                  ))}
                </div>
                <button className="plan-cta free-cta">Current Plan</button>
              </div>

              {/* Pro */}
              <div className="plan featured">
                <div className="popular-badge">⭐ Most Popular</div>
                <span className="plan-label" style={{background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff'}}>Pro</span>
                <div className="plan-name">Pro</div>
                <div className="plan-desc" style={{color:'#93C5FD'}}>For serious landlords who want full control of their portfolio.</div>
                <div className="plan-price-row">
                  <div className="plan-price">${billing==='annual'?annualPrice:monthlyPrice}</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed" style={{color:'#64748B'}}>
                  {billing==='annual'
                    ? `Billed $${annualPrice*12}/year — save $${(monthlyPrice-annualPrice)*12}`
                    : 'Billed monthly'}
                </div>
                <div className="plan-divider"/>
                <div className="plan-feature-list">
                  {PRO_FEATURES.map((f,i) => (
                    <div key={i} className="pf">
                      <div className="pf-check yes-bright">✓</div>
                      <span className="pf-text bright">{f.text}</span>
                    </div>
                  ))}
                </div>
                <button className="plan-cta pro-cta" onClick={()=>alert('Stripe integration coming soon! 🚀')}>
                  Upgrade to Pro →
                </button>
              </div>

              {/* Business */}
              <div className="plan">
                <span className="plan-label" style={{background:'#FEF3C7',color:'#D97706'}}>Business</span>
                <div className="plan-name">Business</div>
                <div className="plan-desc">For agencies and large-scale property managers.</div>
                <div className="plan-price-row">
                  <div className="plan-price">$29</div>
                  <div className="plan-price-unit">/mo</div>
                </div>
                <div className="plan-billed">{billing==='annual'?'Billed $290/year':'Billed monthly'}</div>
                <div className="plan-divider light"/>
                <div className="plan-feature-list">
                  {BUSINESS_FEATURES.map((f,i) => (
                    <div key={i} className="pf">
                      <div className="pf-check yes">✓</div>
                      <span className="pf-text">{f}</span>
                    </div>
                  ))}
                </div>
                <button className="plan-cta biz-cta" onClick={()=>alert('Contact us at hello@rentura.app')}>Contact Sales</button>
              </div>

            </div>

            {/* TRUST STRIP */}
            <div className="trust">
              <div className="trust-item"><span className="trust-ico">🔒</span>Secure payments via Stripe</div>
              <div className="trust-item"><span className="trust-ico">↩️</span>Cancel anytime</div>
              <div className="trust-item"><span className="trust-ico">📊</span>Data always yours</div>
              <div className="trust-item"><span className="trust-ico">⚡</span>Instant activation</div>
              <div className="trust-item"><span className="trust-ico">🎧</span>Priority support on Pro</div>
            </div>

            {/* COMPARISON TABLE */}
            <div className="compare-wrap">
              <div className="compare-title">Full Feature Comparison</div>
              <table className="ctable">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Free</th>
                    <th>Pro</th>
                    <th>Business</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Properties',             '1',     'Unlimited', 'Unlimited'],
                    ['Units',                  '10',    'Unlimited', 'Unlimited'],
                    ['Rent tracker',           '✓',     '✓',         '✓'],
                    ['Maintenance requests',   '✓',     '✓',         '✓'],
                    ['Documents',              'Basic', 'Unlimited', 'Unlimited'],
                    ['Listings',               '2',     'Unlimited', 'Unlimited'],
                    ['Messaging',              '✓',     '✓',         '✓'],
                    ['Reports & analytics',    '✗',     'PRO',       'PRO'],
                    ['CSV / PDF exports',      '✗',     'PRO',       'PRO'],
                    ['Year-over-year trends',  '✗',     'PRO',       'PRO'],
                    ['Property comparison',    '✗',     'PRO',       'PRO'],
                    ['Priority support',       '✗',     'PRO',       'PRO'],
                    ['Team access',            '✗',     '✗',         '✓'],
                    ['API access',             '✗',     '✗',         '✓'],
                    ['White-label branding',   '✗',     '✗',         '✓'],
                  ].map(([feature, free, pro, biz], i) => (
                    <tr key={i}>
                      <td>{feature}</td>
                      <td>{free==='✓'?<span className="ct-yes">✓</span>:free==='✗'?<span className="ct-no">✗</span>:free}</td>
                      <td>{pro==='✓'?<span className="ct-yes">✓</span>:pro==='✗'?<span className="ct-no">✗</span>:pro==='PRO'?<span className="ct-pro">PRO</span>:pro}</td>
                      <td>{biz==='✓'?<span className="ct-yes">✓</span>:biz==='✗'?<span className="ct-no">✗</span>:biz==='PRO'?<span className="ct-pro">PRO</span>:biz}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* FAQ */}
            <div className="faq-wrap">
              <div className="faq-title">Frequently Asked Questions</div>
              {FAQS.map((faq, i) => (
                <div key={i} className={`faq-item${openFaq===i?' open':''}`}>
                  <div className="faq-q" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                    <div className="faq-q-text">{faq.q}</div>
                    <div className="faq-chevron">▼</div>
                  </div>
                  {openFaq===i && <div className="faq-a">{faq.a}</div>}
                </div>
              ))}
            </div>

            {/* BOTTOM CTA */}
            <div className="bottom-cta">
              <div className="bc-title">Ready to scale up?</div>
              <div className="bc-sub">Join landlords using Rentura Pro to manage their portfolios smarter. Start today — cancel anytime.</div>
              <button className="bc-btn" onClick={()=>alert('Stripe integration coming soon! 🚀')}>
                ⭐ Get Rentura Pro →
              </button>
              <div className="bc-note">No credit card required to start free. Upgrade when you're ready.</div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
