import { AnimateOnScroll } from '../components/AnimateOnScroll'

export function MythBlock() {
  return (
    <section className="myth">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">The name</p>
          <p className="myth-text">
            In the old story, Hera set a watchman over what she valued most: Argus Panoptes, a giant
            with a hundred eyes. Sleep never took all of them at once — some part of him was always
            watching. When his watch ended, she set his eyes into the peacock&apos;s tail, where
            they outlived him. A watcher whose record outlasts the watch: more or less the job
            description.
          </p>
          <p className="myth-footnote">
            All of it stays on your machine. <code>~/.argus/argus.db</code>
          </p>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
