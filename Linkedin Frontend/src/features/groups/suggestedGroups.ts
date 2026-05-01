type Palette = {
  bg: string
  accent: string
  text: string
}

function initials(name: string): string {
  const value = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return value.replace(/[^A-Z0-9]/gi, '').slice(0, 2) || 'TG'
}

function makeLogoDataUri(name: string, palette: Palette): string {
  const label = initials(name)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="14" fill="url(#g)"/>
  <circle cx="24" cy="24" r="14" fill="#ffffff22"/>
  <circle cx="80" cy="72" r="22" fill="#00000018"/>
  <text x="48" y="56" text-anchor="middle" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="${palette.text}">
    ${label}
  </text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export type SuggestedTechGroup = {
  id: string
  name: string
  members: number
  description: string
  logoImage: string
}

export const SUGGESTED_TECH_GROUPS: SuggestedTechGroup[] = [
  {
    id: 'g1',
    name: 'Artificial Intelligence Builders',
    members: 3000703,
    description: 'Applied AI playbooks, LLM product case studies, and engineering best practices.',
    logoImage: makeLogoDataUri('Artificial Intelligence Builders', { bg: '#2D8CFF', accent: '#6DC6FF', text: '#FFFFFF' }),
  },
  {
    id: 'g2',
    name: 'Cloud & Distributed Systems Collective',
    members: 594517,
    description: 'System design, reliability, cloud architecture, and backend scaling discussions.',
    logoImage: makeLogoDataUri('Cloud & Distributed Systems Collective', { bg: '#5046E5', accent: '#8A7BFF', text: '#FFFFFF' }),
  },
  {
    id: 'g3',
    name: 'MLOps and Data Engineering Hub',
    members: 223650,
    description: 'Data pipelines, feature platforms, MLOps workflows, and production ML operations.',
    logoImage: makeLogoDataUri('MLOps and Data Engineering Hub', { bg: '#0D9488', accent: '#4FD1C5', text: '#FFFFFF' }),
  },
  {
    id: 'g4',
    name: 'Frontend Community',
    members: 89530,
    description: 'Frontend architecture, design systems, performance optimization, and developer experience.',
    logoImage: makeLogoDataUri('Frontend Community', { bg: '#D97706', accent: '#FBBF24', text: '#FFFFFF' }),
  },
]
