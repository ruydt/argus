import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Features } from './sections/Features'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { NavBar } from './sections/NavBar'
import { Privacy } from './sections/Privacy'
import { QuickInstall } from './sections/QuickInstall'
import { StatsBar } from './sections/StatsBar'
import { FeaturesPage } from './pages/FeaturesPage'
import { InstallPage } from './pages/InstallPage'

function HomePage() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <StatsBar />
        <HowItWorks />
        <Features />
        <QuickInstall />
        <Privacy />
      </main>
      <Footer />
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/install" element={<InstallPage />} />
      </Routes>
    </BrowserRouter>
  )
}
