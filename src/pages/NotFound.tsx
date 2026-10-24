import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-28 text-center">
      <p className="eyebrow">404</p>
      <h1 className="display mt-3 text-4xl text-ink">This page doesn&rsquo;t exist.</h1>
      <Link to="/" className="mt-8 inline-block">
        <Button variant="secondary">Back home</Button>
      </Link>
    </div>
  )
}
