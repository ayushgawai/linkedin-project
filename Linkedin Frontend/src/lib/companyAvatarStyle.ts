const PALETTE = [
  'bg-blue-100 text-blue-800',
  'bg-red-100 text-red-800',
  'bg-purple-100 text-purple-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-green-100 text-green-800',
  'bg-indigo-100 text-indigo-800',
  'bg-pink-100 text-pink-800',
] as const

function hashString(s: string): number {
  return s.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0)
}

export function companyInitials(company: string): string {
  const p = company.trim().split(/\s+/)
  if (p.length >= 2) {
    return (p[0]!.charAt(0) + p[1]!.charAt(0)).toUpperCase()
  }
  return company.slice(0, 2).toUpperCase() || 'Co'
}

export function companyColorClass(company: string): string {
  return PALETTE[hashString(company) % PALETTE.length]!
}
