import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './app/Layout'

const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
)
const Events = lazy(() =>
  import('./features/events/EventsPage').then((module) => ({ default: module.EventsPage }))
)
const Usage = lazy(() =>
  import('./features/usage/UsagePage').then((module) => ({ default: module.UsagePage }))
)
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
)
const SessionList = lazy(() =>
  import('./features/sessions/SessionListPage').then((m) => ({ default: m.SessionListPage }))
)
const SessionFileChanges = lazy(() =>
  import('./features/sessions/SessionFileChangesPage').then((m) => ({
    default: m.SessionFileChangesPage,
  }))
)
const Diagnostics = lazy(() =>
  import('./features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage }))
)
const HooksConfig = lazy(() =>
  import('./features/hooks-config/HooksConfigPage').then((m) => ({ default: m.HooksConfigPage }))
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
            path="dashboard"
            element={
              <Suspense fallback={null}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="usage"
            element={
              <Suspense fallback={null}>
                <Usage />
              </Suspense>
            }
          />
          <Route
            path="projects"
            element={
              <Suspense fallback={null}>
                <ProjectsPage />
              </Suspense>
            }
          />
          <Route path="sessions" element={<Navigate to="/projects" replace />} />
          <Route
            path="sessions/:encodedCwd"
            element={
              <Suspense fallback={null}>
                <SessionList />
              </Suspense>
            }
          />
          <Route
            path="sessions/:encodedCwd/:sessionId"
            element={
              <Suspense fallback={null}>
                <SessionFileChanges />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
