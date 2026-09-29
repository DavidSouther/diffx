import { useEffect, useState } from 'react'
import type { ReviewMeta } from '../../types'

// Fetches GET /api/review once on mount. `meta` is null until the request
// resolves; a failed request is treated the same as a non-persisted session.
export function useReview(): { meta: ReviewMeta | null } {
  const [meta, setMeta] = useState<ReviewMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/review')
      .then((res) => res.json())
      .then((data: ReviewMeta) => {
        if (!cancelled) setMeta(data)
      })
      .catch(() => {
        if (!cancelled) setMeta({ persisted: false, restoredCount: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { meta }
}
