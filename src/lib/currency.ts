// src/lib/currency.ts

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD'
  | 'SGD' | 'AED' | 'INR' | 'PKR' | 'LKR'
  | 'NGN' | 'KES' | 'ZAR' | 'GHS' | 'TZS'
  | 'MYR' | 'PHP' | 'IDR' | 'THB' | 'BDT'
  | 'NPR' | 'JPY'

export interface Currency {
  code: CurrencyCode
  name: string
  symbol: string
  locale: string
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  USD: { code: 'USD', name: 'US Dollar',          symbol: '$',   locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro',                symbol: '€',   locale: 'de-DE' },
  GBP: { code: 'GBP', name: 'British Pound',       symbol: '£',   locale: 'en-GB' },
  AUD: { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$',  locale: 'en-AU' },
  CAD: { code: 'CAD', name: 'Canadian Dollar',     symbol: 'C$',  locale: 'en-CA' },
  SGD: { code: 'SGD', name: 'Singapore Dollar',    symbol: 'S$',  locale: 'en-SG' },
  AED: { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ', locale: 'ar-AE' },
  INR: { code: 'INR', name: 'Indian Rupee',        symbol: '₹',   locale: 'en-IN' },
  PKR: { code: 'PKR', name: 'Pakistani Rupee',     symbol: '₨',   locale: 'en-PK' },
  LKR: { code: 'LKR', name: 'Sri Lankan Rupee',   symbol: 'Rs',  locale: 'en-LK' },
  NGN: { code: 'NGN', name: 'Nigerian Naira',      symbol: '₦',   locale: 'en-NG' },
  KES: { code: 'KES', name: 'Kenyan Shilling',     symbol: 'KSh', locale: 'en-KE' },
  ZAR: { code: 'ZAR', name: 'South African Rand',  symbol: 'R',   locale: 'en-ZA' },
  GHS: { code: 'GHS', name: 'Ghanaian Cedi',       symbol: '₵',   locale: 'en-GH' },
  TZS: { code: 'TZS', name: 'Tanzanian Shilling',  symbol: 'TSh', locale: 'en-TZ' },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit',   symbol: 'RM',  locale: 'ms-MY' },
  PHP: { code: 'PHP', name: 'Philippine Peso',     symbol: '₱',   locale: 'en-PH' },
  IDR: { code: 'IDR', name: 'Indonesian Rupiah',   symbol: 'Rp',  locale: 'id-ID' },
  THB: { code: 'THB', name: 'Thai Baht',           symbol: '฿',   locale: 'th-TH' },
  BDT: { code: 'BDT', name: 'Bangladeshi Taka',    symbol: '৳',   locale: 'bn-BD' },
  NPR: { code: 'NPR', name: 'Nepali Rupee',        symbol: 'रू',  locale: 'ne-NP' },
  JPY: { code: 'JPY', name: 'Japanese Yen',        symbol: '¥',   locale: 'ja-JP' },
}

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES[code] ?? CURRENCIES['USD']
}

export function fmtAmount(amount: number, code: CurrencyCode): string {
  const currency = getCurrency(code)
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'JPY' || code === 'IDR' ? 0 : 2,
      maximumFractionDigits: code === 'JPY' || code === 'IDR' ? 0 : 2,
    }).format(amount)
  } catch {
    // Fallback if locale/currency combo isn't supported
    return `${currency.symbol}${amount.toLocaleString()}`
  }
}

/** Detect currency from browser locale — useful on onboarding if user hasn't set one yet */
export function detectCurrency(): CurrencyCode {
  if (typeof navigator === 'undefined') return 'USD'

  const locale = navigator.language || 'en-US'
  const region = locale.split('-')[1]?.toUpperCase()

  const regionMap: Record<string, CurrencyCode> = {
    US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD',
    SG: 'SGD', AE: 'AED', IN: 'INR', PK: 'PKR',
    LK: 'LKR', NG: 'NGN', KE: 'KES', ZA: 'ZAR',
    GH: 'GHS', TZ: 'TZS', MY: 'MYR', PH: 'PHP',
    ID: 'IDR', TH: 'THB', BD: 'BDT', NP: 'NPR',
    JP: 'JPY',
  }

  return regionMap[region] ?? 'USD'
}

/** All currencies as a sorted array — useful for <select> dropdowns */
export const CURRENCY_OPTIONS = Object.values(CURRENCIES).sort((a, b) =>
  a.name.localeCompare(b.name)
)
