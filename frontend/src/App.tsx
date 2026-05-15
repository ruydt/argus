import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './app/Layout'

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard }))
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
const TraceView = lazy(() =>
  import('./features/sessions/TraceViewPage').then((m) => ({ default: m.TraceViewPage }))
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
                <Dashboard />
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
                <TraceView />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
