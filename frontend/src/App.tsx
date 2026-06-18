import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './app/Layout'

const Events = lazy(() =>
  import('./features/events/EventsPage').then((module) => ({ default: module.EventsPage }))
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
                <Events />
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
            path="hooks-config"
            element={
              <Suspense fallback={null}>
                <HooksConfig />
              </Suspense>
            }
          />
          <Route
            path="scripts"
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
