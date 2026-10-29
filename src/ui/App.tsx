import { useState, useMemo, useCallback, useEffect } from 'react'
import { Resizable } from 'react-resizable'
import { Virtualizer } from '@pierre/diffs/react'
import type { FileDiffMetadata } from '@pierre/diffs'
import type { ReviewComment } from '../types'
import { useDiff } from './hooks/useDiff'
import { useComments } from './hooks/useComments'
import { commentScope } from '../commentFormat'
import { useReview } from './hooks/useReview'
import { useSettings } from './hooks/useSettings'
import { useViewed } from './hooks/useViewed'
import { useFullDiffs } from './hooks/useFullDiffs'
import { usePatchEntries, useParsedFiles } from './hooks/useParsedFiles'
import { EMPTY_CHARACTER_COUNTS, entryStub } from './patchIndex'
import { Toolbar } from './components/Toolbar'
import { DiffViewer } from './components/DiffViewer'
import type { FileStatus } from './components/HiddenFileDiff'
import { FileTree, type DiffStat } from './components/FileTree'
import { CommentTracker } from './components/CommentTracker'
import { SidebarStorage } from './sidebarStorage'

function useWindowSize({ factor }: { factor: number }) {
  const compute = () => Math.round(window.innerWidth * factor)

  const [size, setSize] = useState(compute)

  useEffect(() => {
    const handleResize = () => setSize(compute())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [factor])

  return size
}

export function App() {
  const { settings, loaded, updateSettings } = useSettings()
  const { patch, repoName, branch, customMode, binaryFiles, tabSizeMap, untrackedFiles, loading, error } = useDiff({
    staged: settings.staged,
    untracked: settings.untracked,
  })
  const { comments, addComment, addScopedComment, removeComment, editComment, copyAllComments } =
    useComments()
  const { meta: reviewMeta } = useReview()
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [sidebar, setSidebar] = useState(() => SidebarStorage.load())
  const maxSidebarWidth = Math.max(SidebarStorage.minSize, useWindowSize({ factor: 0.5 }))

  const handleResize = useCallback((_e: React.SyntheticEvent, data: { size: { width: number } }) => {
    setSidebar((prev) => prev.withSize(data.size.width))
  }, [])

  const handleResizeStop = useCallback((_e: React.SyntheticEvent, data: { size: { width: number } }) => {
    setSidebar((prev) => prev.withSize(data.size.width).save())
  }, [])

  const handleToggleCollapse = useCallback(() => {
    setSidebar((prev) => prev.withCollapsed(!prev.collapsed).save())
  }, [])

  const untrackedSet = useMemo(() => new Set(untrackedFiles), [untrackedFiles])

  const { entries, indexing } = usePatchEntries(patch)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  useEffect(() => setExpandedIds(new Set()), [entries])

  const binaryFileMap = useMemo(() => {
    const map = new Map<string, (typeof binaryFiles)[number]>()
    for (const bf of binaryFiles) {
      map.set(bf.path, bf)
    }
    return map
  }, [binaryFiles])

  // Metadata-only stand-ins: cheap, available as soon as the background
  // indexer finishes, and enough for the file tree and viewed tracking.
  const files = useMemo(() => {
    const stubs = entries.map(entryStub)
    const existingNames = new Set(stubs.map((f) => f.name))
    for (const bf of binaryFiles) {
      if (!existingNames.has(bf.path)) {
        stubs.push({
          name: bf.path,
          type: bf.type === 'added' || bf.type === 'untracked' ? 'new' : bf.type === 'deleted' ? 'deleted' : 'change',
          hunks: [],
          splitLineCount: 0,
          unifiedLineCount: 0,
          isPartial: true,
          deletionLines: [],
          additionLines: [],
          ...EMPTY_CHARACTER_COUNTS,
        })
      }
    }
    return stubs
  }, [entries, binaryFiles])

  const { viewedFiles, setViewed } = useViewed(files)

  // Only parse what will be shown: not hidden-by-default files (until the
  // user expands them), not viewed (collapsed) files, not binary files.
  const wantedIds = useMemo(() => {
    const wanted = new Set<string>()
    for (const e of entries) {
      if (binaryFileMap.has(e.name) || viewedFiles.has(e.name)) continue
      if (e.hidden && !expandedIds.has(e.id)) continue
      wanted.add(e.id)
    }
    return wanted
  }, [entries, binaryFileMap, viewedFiles, expandedIds])

  const parsedFiles = useParsedFiles(entries, wantedIds)
  const fullFiles = useFullDiffs(entries, parsedFiles, { staged: settings.staged, untracked: settings.untracked })

  const displayFiles = useMemo(
    () => files.map((stub, i) => {
      const entry = entries[i]
      return entry ? (fullFiles.get(entry.id) ?? parsedFiles.get(entry.id) ?? stub) : stub
    }),
    [files, entries, parsedFiles, fullFiles],
  )

  const fileStatus = useMemo(() => {
    const map = new Map<string, FileStatus>()
    for (const e of entries) {
      if (binaryFileMap.has(e.name)) continue
      if (e.hidden && !expandedIds.has(e.id)) {
        map.set(e.name, { kind: 'hidden', reason: e.hidden, size: e.size, additions: e.additions, deletions: e.deletions })
      } else if (!parsedFiles.has(e.id) && !viewedFiles.has(e.name)) {
        map.set(e.name, { kind: 'pending' })
      }
    }
    return map
  }, [entries, binaryFileMap, expandedIds, parsedFiles, viewedFiles])

  const handleExpandFile = useCallback(
    (filePath: string) => {
      const ids = entries.filter((e) => e.name === filePath).map((e) => e.id)
      setExpandedIds((prev) => new Set([...prev, ...ids]))
    },
    [entries],
  )

  const diffStats = useMemo(() => {
    let additions = 0
    let deletions = 0
    for (const e of entries) {
      additions += e.additions
      deletions += e.deletions
    }
    return { additions, deletions }
  }, [entries])

  const fileDiffStats = useMemo(() => {
    const stats: Record<string, DiffStat> = {}
    for (const e of entries) {
      const stat = (stats[e.name] ??= { additions: 0, deletions: 0 })
      stat.additions += e.additions
      stat.deletions += e.deletions
    }
    return stats
  }, [entries])

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of comments) {
      counts[c.filePath] = (counts[c.filePath] ?? 0) + 1
    }
    return counts
  }, [comments])

  const fileAnnotationsMap = useMemo(() => {
    const map = new Map<string, { side: ReviewComment['side']; lineNumber: number; metadata: ReviewComment }[]>()
    for (const c of comments) {
      if (commentScope(c) !== 'line') continue
      let list = map.get(c.filePath)
      if (!list) {
        list = []
        map.set(c.filePath, list)
      }
      list.push({
        side: c.side,
        lineNumber: c.lineNumber,
        metadata: c,
      })
    }
    return map
  }, [comments])

  const fileCommentsMap = useMemo(() => {
    const map = new Map<string, ReviewComment[]>()
    for (const c of comments) {
      if (commentScope(c) !== 'file') continue
      map.set(c.filePath, [...(map.get(c.filePath) ?? []), c])
    }
    return map
  }, [comments])

  const diffComments = useMemo(() => comments.filter((c) => commentScope(c) === 'diff'), [comments])

  const handleFileClick = useCallback((filePath: string) => {
    setActiveFile(filePath)
    const el = document.getElementById(`file-${filePath}`)
    if (el) {
      el.scrollIntoView({ block: 'start' })
    }
  }, [])

  const handleViewedChange = useCallback((filePath: string, viewed: boolean) => {
    setViewed(filePath, viewed)
  }, [setViewed])

  const sidebarContent = (
    <div className="sidebar-content">
      <FileTree
        files={files}
        activeFile={activeFile}
        commentCounts={commentCounts}
        diffStats={fileDiffStats}
        viewedFiles={viewedFiles}
        untrackedFiles={untrackedSet}
        onFileClick={handleFileClick}
        collapsed={sidebar.collapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      {!sidebar.collapsed && <CommentTracker comments={comments} />}
    </div>
  )

  if (!loaded || loading || indexing) {
    return (
      <div className="loading">
        <p>Loading diff...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar
        repoName={repoName}
        branch={branch}
        fileCount={files.length}
        additions={diffStats.additions}
        deletions={diffStats.deletions}
        commentCount={comments.length}
        diffStyle={settings.diffStyle}
        diffOptions={{ staged: settings.staged, untracked: settings.untracked }}
        defaultTabSize={settings.defaultTabSize}
        softWrap={settings.softWrap}
        browser={settings.browser}
        customMode={customMode}
        reviewMeta={reviewMeta}
        onDiffStyleChange={(style) => updateSettings({ diffStyle: style })}
        onDiffOptionsChange={(options) => updateSettings(options)}
        onDefaultTabSizeChange={(size) => updateSettings({ defaultTabSize: size })}
        onSoftWrapChange={(softWrap) => updateSettings({ softWrap })}
        onBrowserChange={(browser) => updateSettings({ browser })}
        onCopyComments={copyAllComments}
      />
      <div className="app-body">
        {sidebar.collapsed ? (
          <aside className="sidebar sidebar-collapsed" style={{ width: sidebar.visibleSize() }}>
            {sidebarContent}
          </aside>
        ) : (
          <Resizable
            width={sidebar.visibleSize(maxSidebarWidth)}
            height={0}
            axis="x"
            resizeHandles={['e']}
            minConstraints={[SidebarStorage.minSize, 0]}
            maxConstraints={[maxSidebarWidth, 0]}
            onResize={handleResize}
            onResizeStop={handleResizeStop}
            handle={<div className="sidebar-resize-handle" />}
          >
            <aside className="sidebar" style={{ width: sidebar.visibleSize(maxSidebarWidth) }}>
              {sidebarContent}
            </aside>
          </Resizable>
        )}
        <main className="main">
          <Virtualizer
            className="main-scroll"
            contentClassName="main-content"
            config={{ overscrollSize: 2000 }}
          >
            <DiffViewer
              files={displayFiles}
              diffStyle={settings.diffStyle}
              tabSizeMap={tabSizeMap}
              defaultTabSize={settings.defaultTabSize}
              softWrap={settings.softWrap}
              viewedFiles={viewedFiles}
              binaryFiles={binaryFileMap}
              fileStatus={fileStatus}
              onExpandFile={handleExpandFile}
              onViewedChange={handleViewedChange}
              fileAnnotationsMap={fileAnnotationsMap}
              fileCommentsMap={fileCommentsMap}
              diffComments={diffComments}
              onAddScopedComment={addScopedComment}
              onAddComment={addComment}
              onDeleteComment={removeComment}
              onEditComment={editComment}
            />
          </Virtualizer>
        </main>
      </div>
    </div>
  )
}
