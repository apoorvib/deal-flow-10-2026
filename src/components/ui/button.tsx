import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.18)] hover:bg-accent-2 active:translate-y-px',
  secondary:
    'bg-raised text-ink border border-line-strong shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:border-ink-3 active:translate-y-px',
  ghost: 'text-ink-2 hover:text-ink hover:bg-ink/5',
  quiet: 'text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink-3 px-0!',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-medium tracking-[-0.005em] whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
