'use client'

type Props = {
  open: boolean
  onClose: () => void
  feature: string
  description: string
  limit?: string
}

const PRO_PERKS = [
  'Unlimited properties & units',
  'Unlimited active listings',
  'CSV & PDF exports',
  'Advanced reports & analytics',
  'AI features (unlimited)',
  'Priority support',
]

export default function UpgradeModal({ open, onClose, feature, description, limit }: Props) {
  if (!open) return null

  return (
    <div
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:900,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={onClose}>
      <div
        style={{background:'#fff',borderRadius:22,padding:32,maxWidth:400,width:'100%',boxShadow:'0 24px 60px rgba(15,23,42,.25)',textAlign:'center'}}
        onClick={e=>e.stopPropagation()}>

        <div style={{fontSize:44,marginBottom:14}}>⭐</div>
        <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:700,color:'#0F172A',marginBottom:8}}>
          Unlock {feature}
        </div>
        <div style={{fontSize:13.5,color:'#64748B',lineHeight:1.6,marginBottom:12}}>
          {description}
        </div>

        {limit && (
          <div style={{fontSize:12.5,fontWeight:700,color:'#D97706',background:'#FEF3C7',borderRadius:9,padding:'8px 14px',marginBottom:18}}>
            ⚠️ {limit}
          </div>
        )}

        <div style={{textAlign:'left',marginBottom:22,display:'flex',flexDirection:'column',gap:8}}>
          {PRO_PERKS.map(p=>(
            <div key={p} style={{fontSize:13.5,color:'#374151',display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'#16A34A',fontWeight:700}}>✓</span>{p}
            </div>
          ))}
        </div>

        <button
          onClick={()=>window.location.href='/landlord/upgrade'}
          style={{width:'100%',padding:13,borderRadius:12,border:'none',background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:10,boxShadow:'0 4px 14px rgba(37,99,235,.3)'}}>
          ⭐ Upgrade to Pro →
        </button>
        <button
          onClick={onClose}
          style={{width:'100%',padding:11,borderRadius:12,border:'1.5px solid #E2E8F0',background:'#fff',color:'#475569',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
          Maybe later
        </button>
      </div>
    </div>
  )
}
