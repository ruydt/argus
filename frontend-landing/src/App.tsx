import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { NavBar } from './sections/NavBar'
import { MythBlock } from './sections/MythBlock'
import { Pillars } from './sections/Pillars'
import { Privacy } from './sections/Privacy'
import { QuickInstall } from './sections/QuickInstall'
import { StatsBar } from './sections/StatsBar'
import { SurfaceTour } from './sections/SurfaceTour'
import { WhyBlock } from './sections/WhyBlock'
import { FeaturesPage } from './pages/FeaturesPage'
import { InstallPage } from './pages/InstallPage'

function HomePage() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <StatsBar />
        <Pillars />
        <MythBlock />
        <SurfaceTour />
        <WhyBlock />
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
