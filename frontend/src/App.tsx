import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './app/Layout'
import { Dashboard } from './pages/Dashboard'
import { EventsPage as Events } from './features/events/EventsPage'
import { UsagePage as Usage } from './features/usage/UsagePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Events />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="usage" element={<Usage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
