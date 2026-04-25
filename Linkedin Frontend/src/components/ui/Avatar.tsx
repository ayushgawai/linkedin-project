import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
  xl: 'h-24 w-24 text-xl',
  '2xl': 'h-32 w-32 text-2xl',
  '3xl': 'h-40 w-40 text-3xl',
}

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  size?: AvatarSize
  src?: string | null
  name?: string
  /** `alt` for the profile image when `src` is set (defaults to `name`). */
  imageAlt?: string
  online?: boolean
}

function hashString(value: string): number {
  return value.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0)
}

function gradientFromName(name: string): string {
  const hash = hashString(name || 'member')
  const hueA = hash % 360
  const hueB = (hash * 1.3 + 80) % 360
  return `linear-gradient(135deg, hsl(${hueA} 70% 60%), hsl(${hueB} 65% 45%))`
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U'
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { className, size = 'md', src, name = 'User', imageAlt, online = false, ...props },
  ref,
) {
  const initials = initialsFromName(name)
  return (
    <div ref={ref} className={cn('relative inline-flex shrink-0 rounded-full', sizeClasses[size], className)} {...props}>
      {src ? (
        <img src={src} alt={imageAlt ?? name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="inline-flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundImage: gradientFromName(name) }}
          aria-label={name}
        >
          {initials}
        </span>
      )}
      {online ? (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface-raised bg-success" aria-label="Online" />
      ) : null}
    </div>
  )
})
