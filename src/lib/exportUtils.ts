// ── CSV Export Utility ────────────────────────────────────────────────────────

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const str = String(val ?? '')
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Rent Tracker CSV ──────────────────────────────────────────────────────────
export function exportRentTrackerCSV(records: {
  tenant: string; property: string; unit: string;
  amount: number; due_date: string; paid_date?: string; status: string
}[], month: string, year: number) {
  exportToCSV(
    `rent-tracker-${month}-${year}`,
    ['Tenant', 'Property', 'Unit', 'Amount ($)', 'Due Date', 'Paid Date', 'Status'],
    records.map(r => [
      r.tenant, r.property, r.unit,
      r.amount, r.due_date, r.paid_date || '—', r.status
    ])
  )
}

// ── Reports CSV ───────────────────────────────────────────────────────────────
export function exportReportsCSV(data: {
  monthStats: { month: string; collected: number; overdue: number; pending: number }[]
  propStats:  { name: string; units: number; occupied: number; revenue: number }[]
}) {
  // Monthly collection sheet
  exportToCSV(
    'rentura-reports-monthly',
    ['Month', 'Collected ($)', 'Overdue ($)', 'Pending ($)', 'Total ($)'],
    data.monthStats.map(m => [
      m.month, m.collected, m.overdue, m.pending,
      m.collected + m.overdue + m.pending
    ])
  )
}

export function exportPropertyCSV(propStats: {
  name: string; units: number; occupied: number; revenue: number
}[]) {
  exportToCSV(
    'rentura-property-breakdown',
    ['Property', 'Total Units', 'Occupied', 'Occupancy %', 'Monthly Revenue ($)'],
    propStats.map(p => [
      p.name, p.units, p.occupied,
      p.units > 0 ? Math.round((p.occupied / p.units) * 100) : 0,
      p.revenue
    ])
  )
}
