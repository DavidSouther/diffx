import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ImportResult, ReviewMeta } from '../../types'
import { COMMENTS_KEY } from '../hooks/useComments'

interface ReviewStatusControlProps {
  meta: ReviewMeta | null
}

const SESSION_ONLY_TOOLTIP = 'Comments are lost when diffx stops. Run diffx with --persist to keep them.'

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

// The one status message the design's Import section specifies, e.g.
// "Imported 2 comments.", "Imported 1 comment. Skipped 1 duplicate.",
// "Imported 1 comment. 1 comment could not be read.", or, when nothing in
// the paste was recognized, "No comments found. Paste the full text from
// Copy comments."
export function formatImportMessage(result: ImportResult): string {
  const total = result.imported + result.duplicates + result.unreadable
  if (total === 0) {
    return 'No comments found. Paste the full text from Copy comments.'
  }
  const parts = [`Imported ${result.imported} ${plural(result.imported, 'comment')}.`]
  if (result.duplicates > 0) {
    parts.push(`Skipped ${result.duplicates} ${plural(result.duplicates, 'duplicate')}.`)
  }
  if (result.unreadable > 0) {
    parts.push(`${result.unreadable} ${plural(result.unreadable, 'comment')} could not be read.`)
  }
  return parts.join(' ')
}

export function ReviewStatusControl({ meta }: ReviewStatusControlProps) {
  const [open, setOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const handleImport = useCallback(async () => {
    const res = await fetch('/api/comments/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: importText }),
    })
    const result: ImportResult = await res.json()
    setImportMessage(formatImportMessage(result))
    if (result.imported > 0) {
      queryClient.invalidateQueries({ queryKey: COMMENTS_KEY })
    }
  }, [importText, queryClient])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!meta) return null

  const label = !meta.persisted ? 'Session only' : meta.restoredCount > 0 ? `Saved · ${meta.restoredCount} restored` : 'Saved'

  const identity = meta.identity
  const shaSummary = identity
    ? identity.revisions.length > 0
      ? identity.revisions.map(shortSha).join('..')
      : identity.head
        ? shortSha(identity.head)
        : ''
    : ''

  return (
    <div className="review-status-wrapper" ref={wrapperRef}>
      <button
        className="btn btn-sm"
        title={!meta.persisted ? SESSION_ONLY_TOOLTIP : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
      </button>
      {open && (
        <div className="review-status-dialog" role="dialog" aria-label="Review comments">
          <h2 className="review-status-dialog-title">Review comments</h2>
          {meta.persisted ? (
            <div className="review-status-dialog-body">
              <p>
                Comments are saved to <code>{meta.file}</code>
              </p>
              {shaSummary && <p>Review: {shaSummary}</p>}
              <p>{meta.restoredCount} restored</p>
            </div>
          ) : (
            <div className="review-status-dialog-body">
              <p>{SESSION_ONLY_TOOLTIP}</p>
            </div>
          )}
          <div className="review-status-import">
            <label className="review-status-import-label">
              Paste a Copy comments export
              <textarea
                className="review-status-import-textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </label>
            <button type="button" className="btn btn-sm" onClick={handleImport}>
              Import
            </button>
            {importMessage && (
              <p role="status" className="review-status-import-message">
                {importMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
