import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './app/Layout'

const Sessions = lazy(() =>
  import('./features/sessions/SessionsPage').then((m) => ({ default: m.SessionsPage }))
)
const SessionDetail = lazy(() =>
  import('./features/sessions/SessionDetailPage').then((m) => ({ default: m.SessionDetailPage }))
)
const Diagnostics = lazy(() =>
  import('./features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage }))
)
const HooksConfig = lazy(() =>
  import('./features/hooks-config/HooksConfigPage').then((m) => ({ default: m.HooksConfigPage }))
)
const ScriptsPage = lazy(() =>
  import('./features/scripts/ScriptsPage').then((m) => ({ default: m.ScriptsPage }))
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={null}>
                <Sessions />
              </Suspense>
            }
          />
          <Route
            path="sessions/:sessionId"
            element={
              <Suspense fallback={null}>
                <SessionDetail />
              </Suspense>
            }
          />
          <Route
            path="diagnostics"
            element={
              <Suspense fallback={null}>
                <Diagnostics />
              </Suspense>
            }
          />
          <Route
            path="hooks"
            element={
              <Suspense fallback={null}>
                <HooksConfig />
              </Suspense>
            }
          />
          <Route
            path="marketplace"
            element={
              <Suspense fallback={null}>
                <ScriptsPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
