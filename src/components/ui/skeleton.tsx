import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** A placeholder block. Size it with classes; it shimmers until the real content arrives. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[4px]', className)} aria-hidden />
}

/** Wraps a page skeleton so assistive tech hears "loading" once instead of a pile of empty blocks. */
function Loading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label="Loading">
      {children}
    </div>
  )
}

const Card = ({ className, children }: { className?: string; children?: ReactNode }) => <div className={cn('border border-line bg-raised p-6 shadow-card', className)}>{children}</div>

/** Table-like rows: a two-line label on the left, short values to the right. */
export function RowsSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <ul className="divide-y divide-line border-t border-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-6 px-6 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: cols - 1 }, (_, j) => (
            <Skeleton key={j} className="hidden h-4 w-20 sm:block" />
          ))}
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/** Passport page: card on the left, validity and facts on the right. */
export function PassportSkeleton() {
  return (
    <Loading className="mx-auto max-w-6xl px-5 pt-14 sm:px-8">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-10 w-72" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Skeleton className="aspect-[1.586/1] rounded-[14px]" />
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-12 w-44" />
            <Skeleton className="h-12 w-48" />
          </div>
        </div>
        <div className="grid content-start gap-5">
          <Card className="flex items-center gap-6">
            <Skeleton className="size-[72px] rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </Card>
          <Card className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Loading>
  )
}

/** Status page: badge, headline, copy, then the checks list. */
export function StatusSkeleton() {
  return (
    <Loading className="mx-auto max-w-3xl px-5 pt-14 sm:px-8 sm:pt-16">
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="mt-5 h-11 w-80 max-w-full" />
      <Skeleton className="mt-4 h-4 w-full max-w-xl" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-md" />
      <div className="mt-10 space-y-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-7 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-14 border border-line bg-raised">
        <RowsSkeleton rows={4} cols={1} />
      </div>
    </Loading>
  )
}

/** Investor dashboard: greeting, passport tile + totals, investments table. */
export function InvestorDashboardSkeleton() {
  return (
    <Loading className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-10 sm:px-8 sm:pt-12">
        <Skeleton className="h-10 w-72" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card className="flex items-center gap-6">
            <Skeleton className="size-28 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-52" />
              <div className="flex gap-3 pt-2">
                <Skeleton className="h-11 w-36" />
                <Skeleton className="h-11 w-32" />
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-px border border-line bg-line">
            <div className="col-span-2 space-y-3 bg-raised px-7 py-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-40" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3 bg-raised px-7 py-6">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 border border-line bg-raised shadow-card">
          <div className="px-6 py-5">
            <Skeleton className="h-6 w-36" />
          </div>
          <RowsSkeleton rows={3} />
        </div>
      </div>
    </Loading>
  )
}

/** Fund dashboard: header, close-readiness strip, investor table. */
export function FundDashboardSkeleton() {
  return (
    <Loading className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-10 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-80 max-w-full" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-11 w-full max-w-md" />
        </div>
        <div className="mt-8 grid gap-px border border-line bg-line lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3 bg-raised px-7 py-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 bg-raised px-7 py-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-10" />
            </div>
          ))}
        </div>
        <div className="mt-5 border border-line bg-raised shadow-card">
          <div className="flex justify-between gap-4 px-6 py-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-24" />
              ))}
            </div>
            <Skeleton className="hidden h-10 w-64 sm:block" />
          </div>
          <RowsSkeleton rows={6} cols={4} />
        </div>
      </div>
    </Loading>
  )
}

/** Deals list. */
export function DealsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="mt-10 grid gap-3" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border border-line bg-raised p-6">
          <Skeleton className="size-11 rounded-[6px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-11 w-36" />
        </li>
      ))}
    </ul>
  )
}

/** Settings sections. */
export function SettingsSkeleton() {
  return (
    <div className="mt-8 grid gap-5" role="status" aria-busy="true" aria-label="Loading">
      {[3, 2, 3].map((n, i) => (
        <div key={i} className="border border-line bg-raised shadow-card">
          <div className="border-b border-line px-6 py-4">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-5 px-6 py-5">
            {Array.from({ length: n }, (_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Generic page shell, for route guards waiting on the session. */
export function PageShellSkeleton() {
  return (
    <Loading className="mx-auto max-w-6xl px-5 pt-12 pb-10 sm:px-8">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </Loading>
  )
}
