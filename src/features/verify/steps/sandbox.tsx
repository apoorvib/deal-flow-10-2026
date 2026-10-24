import { FlaskConical } from 'lucide-react'
import { cn } from '../../../lib/cn'

/** Demo-only control for choosing what the mock API returns. Never rendered against a real backend. */
export function SandboxPicker<T extends string>({ value, onChange, options, label = 'Sandbox outcome' }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
      <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">
        <FlaskConical className="size-3.5" /> {label}
      </span>
      <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn('rounded-md px-2.5 py-1 text-[12.5px] transition-colors', value === o.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
