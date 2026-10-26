import type { HiddenReason } from '../patchIndex'

export type FileStatus =
  | { kind: 'hidden'; reason: HiddenReason; size: number; additions: number; deletions: number }
  | { kind: 'pending' }

const REASON_TEXT: Record<HiddenReason, string> = {
  generated: 'Generated file',
  large: 'Large diff',
  'long-lines': 'Very long lines',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface HiddenFileDiffProps {
  filePath: string
  status: FileStatus
  viewed: boolean
  onViewedChange: (filePath: string, viewed: boolean) => void
  onExpand: (filePath: string) => void
}

// Stands in for a file diff that has not been parsed or rendered yet: either
// hidden by default (generated or very large) or waiting on the background
// parser.
export function HiddenFileDiff({ filePath, status, viewed, onViewedChange, onExpand }: HiddenFileDiffProps) {
  return (
    <div className={`file-diff-card ${viewed ? 'file-diff-viewed' : ''}`} id={`file-${filePath}`}>
      <div className="binary-diff-header">
        <span className="binary-diff-name">{filePath}</span>
        <label className="viewed-label" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={viewed} onChange={(e) => onViewedChange(filePath, e.target.checked)} />
          Viewed
        </label>
      </div>
      {!viewed && (
        <div className="binary-diff-body">
          <div className="binary-diff-message">
            {status.kind === 'pending' ? (
              'Loading diff...'
            ) : (
              <>
                {REASON_TEXT[status.reason]} hidden by default ({formatSize(status.size)}, +{status.additions} -
                {status.deletions}){' '}
                <button className="btn btn-secondary" onClick={() => onExpand(filePath)}>
                  Show diff
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
