import { useState } from 'react'
import { coverUrl, filingTitle } from '../lib/catalogue'

// A book's cover from Open Library, or a plain cloth-bound placeholder
// with the title's first letter when there's no cover (or it fails to load).
export default function Cover({ book, className = '' }) {
  const [failed, setFailed] = useState(false)
  const url = coverUrl(book.cover_id, 'M')

  if (!url || failed) {
    const letter = filingTitle(book.title, book.language).charAt(0).toUpperCase()
    return (
      <span className={`cover cover-blank ${className}`} aria-hidden="true">
        <span>{letter}</span>
      </span>
    )
  }
  return (
    <img
      className={`cover ${className}`}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
