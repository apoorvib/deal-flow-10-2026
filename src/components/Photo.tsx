import { cn } from '../lib/cn'
import { PHOTOS, type PhotoKey } from '../lib/photos'

/** Responsive pack photo. Lazy by default; pass `priority` for the one above-the-fold hero. */
export function Photo({
  name,
  className,
  sizes = '100vw',
  priority,
  decorative,
  position,
}: {
  name: PhotoKey
  className?: string
  sizes?: string
  priority?: boolean
  /** Background use: empty alt so screen readers skip it. */
  decorative?: boolean
  position?: string
}) {
  const p = PHOTOS[name]
  const [small, large] = p.widths
  return (
    <img
      src={`/img/${p.base}-${small}.webp`}
      srcSet={`/img/${p.base}-${small}.webp ${small}w, /img/${p.base}-${large}.webp ${large}w`}
      sizes={sizes}
      alt={decorative ? '' : p.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      style={position ? { objectPosition: position } : undefined}
      className={cn('object-cover', className)}
    />
  )
}
