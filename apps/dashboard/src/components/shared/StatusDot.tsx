interface StatusDotProps {
  status: 'online' | 'busy' | 'offline' | string
}

const colorMap: Record<string, string> = {
  online: 'bg-green-400',
  busy: 'bg-yellow-400',
  offline: 'bg-slate-300',
}

export function StatusDot({ status }: StatusDotProps) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorMap[status] ?? 'bg-slate-300'}`} />
  )
}
