interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export function EmptyState({ icon = '💬', title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 p-8">
      <span className="text-5xl">{icon}</span>
      <p className="font-medium text-slate-600">{title}</p>
      {description && <p className="text-sm text-center">{description}</p>}
    </div>
  )
}
