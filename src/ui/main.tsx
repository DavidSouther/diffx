import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import { App } from './App'
import './styles/global.css'

const queryClient = new QueryClient()

// Syntax highlighting (Shiki) is the dominant main-thread cost on a large
// diff, so run it in a worker pool instead of blocking the UI.
const poolOptions = {
  workerFactory: () =>
    new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' }),
  poolSize: Math.max(2, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1)),
}
const highlighterOptions = { theme: { dark: 'github-dark', light: 'github-light' } } as const

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      <App />
    </WorkerPoolContextProvider>
  </QueryClientProvider>,
)
