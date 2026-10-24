import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-2 active:bg-accent-2',
  secondary: 'bg-raised text-accent border border-accent hover:bg-accent/[0.06]',
  ghost: 'text-link hover:bg-accent/[0.06]',
  quiet: 'text-link hover:underline underline-offset-4 px-0!',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[15px] gap-1.5 rounded-[4px]',
  md: 'h-11 px-5 text-[16px] gap-2 rounded-[4px]',
  lg: 'h-12 px-6 text-[17px] gap-2 rounded-[4px]',
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
        'relative inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45',
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
