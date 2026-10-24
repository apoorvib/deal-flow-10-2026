import { CircleAlert, CloudOff, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { isUnavailable } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { Button } from './button'

/**
 * Inline state for a section that couldn't load. `error` decides the wording: an endpoint the backend
 * hasn't built reads as "not available yet"; anything else is a real failure with a retry.
 */
export function Notice({ error, what, onRetry, className, children }: { error: unknown; what: string; onRetry?: () => void; className?: string; children?: ReactNode }) {
  const unavailable = isUnavailable(error)
  return (
    <div role="status" className={cn('flex flex-wrap items-start gap-3 border px-5 py-4', unavailable ? 'border-line bg-surface' : 'border-danger/25 bg-danger-soft', className)}>
      {unavailable ? <CloudOff className="mt-0.5 size-5 shrink-0 text-ink-3" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{unavailable ? `${what} isn’t available yet` : `Couldn’t load ${what.toLowerCase()}`}</p>
        <p className="mt-0.5 text-[14px] text-ink-2">
          {unavailable ? 'This part of Savy is still being connected. Everything else works as normal.' : error instanceof Error ? error.message : 'Something went wrong.'}
        </p>
        {children}
      </div>
      {!unavailable && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" /> Retry
        </Button>
      )}
    </div>
  )
}

/** Toast-friendly message for a failed action. */
export const actionError = (e: unknown, fallback: string) => (isUnavailable(e) ? 'Not available yet. This part of Savy is still being connected.' : e instanceof Error ? e.message : fallback)
