'use client'

// src/components/CurrencySelect.tsx
// Drop this anywhere you need a currency picker.
// Usage: <CurrencySelect value={currency} onChange={setCurrency} />

import { CURRENCY_OPTIONS, type CurrencyCode } from '@/lib/currency'

interface CurrencySelectProps {
  value: CurrencyCode
  onChange: (code: CurrencyCode) => void
  className?: string
  label?: string
}

export function CurrencySelect({ value, onChange, className = '', label = 'Currency' }: CurrencySelectProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
      >
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.symbol} — {c.name} ({c.code})
          </option>
        ))}
      </select>
    </div>
  )
}
