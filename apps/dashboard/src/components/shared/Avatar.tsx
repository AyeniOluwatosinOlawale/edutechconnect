import { initials } from '../../lib/utils'

interface AvatarProps {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }

export function Avatar({ name, url, size = 'md' }: AvatarProps) {
  if (url) {
    return <img src={url} alt={name} className={`${sizeMap[size]} rounded-full object-cover`} />
  }
  return (
    <div className={`${sizeMap[size]} rounded-full bg-brand-100 text-brand-600 font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials(name)}
    </div>
  )
}
