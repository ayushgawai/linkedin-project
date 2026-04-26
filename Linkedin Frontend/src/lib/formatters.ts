import { format, formatDistanceToNow, parseISO } from 'date-fns'

export function formatIsoDate(value: string, pattern = 'MMM d, yyyy'): string {
  return format(parseISO(value), pattern)
}

export function timeAgoShort(iso: string): string {
  const d = parseISO(iso)
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date(iso)
    if (Number.isNaN(d2.getTime())) return 'recently'
    return formatDistanceToNow(d2, { addSuffix: true })
  }
  return formatDistanceToNow(d, { addSuffix: true })
}
