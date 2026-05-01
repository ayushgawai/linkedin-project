type BrandMarkProps = {
  size?: number
  className?: string
}

export function BrandMark({ size = 34, className }: BrandMarkProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" role="img" aria-label="LinkedIn Clone" className={className}>
      <rect x="0" y="0" width="34" height="34" rx="7" fill="var(--brand-primary)" />
      <text x="17" y="22" textAnchor="middle" fill="white" fontSize="16" fontWeight="700" fontFamily="Arial, sans-serif">
        in
      </text>
    </svg>
  )
}
