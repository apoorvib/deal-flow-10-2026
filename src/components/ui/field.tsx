import { createContext, forwardRef, useContext, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { parseMoney } from '../../lib/format'

// Field hands its generated id to the control inside it, so every label is wired without passing ids around.
const FieldId = createContext<string | undefined>(undefined)

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
  optional,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
  className?: string
  optional?: boolean
}) {
  const auto = useId()
  const id = htmlFor ?? auto
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {error ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const inputBase =
  'h-11 w-full rounded-lg border border-line-strong bg-raised px-3.5 text-[15px] text-ink placeholder:text-ink-3/70 shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-150 hover:border-ink-3/60 focus:border-accent-2 focus:outline-none focus:ring-4 focus:ring-accent/10 aria-invalid:border-danger aria-invalid:ring-danger/10'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, id, ...rest },
  ref,
) {
  const fieldId = useContext(FieldId)
  return <input ref={ref} id={id ?? fieldId} className={cn(inputBase, className)} {...rest} />
})

export function Select({
  className,
  children,
  id,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = useContext(FieldId)
  return (
    <div className="relative">
      <select id={id ?? fieldId} className={cn(inputBase, 'appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Dollar input that accepts "250k" / "1.2m", formats on blur, and reports a number. */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = '0',
  invalid,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  id?: string
  placeholder?: string
  invalid?: boolean
  'aria-describedby'?: string
}) {
  const fieldId = useContext(FieldId)
  const auto = useId()
  const formatted = value == null ? '' : value.toLocaleString('en-US')
  const [text, setText] = useState(formatted)
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-ink-3">$</span>
      <input
        id={id ?? fieldId ?? auto}
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputBase, 'tnum pl-7 font-mono text-[14.5px]')}
        placeholder={placeholder}
        value={focused ? text : formatted}
        aria-invalid={invalid || undefined}
        onFocus={() => {
          setText(formatted)
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseMoney(e.target.value))
        }}
        {...rest}
      />
    </div>
  )
}
