export function StatsBar() {
  return (
    <div className="stats-bar">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">0ms</span>
          <span className="stat-label">CLOUD LATENCY</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">100%</span>
          <span className="stat-label">LOCAL STORAGE</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">SQLite</span>
          <span className="stat-label">NO EXTERNAL DEPS</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">SSE</span>
          <span className="stat-label">REAL-TIME STREAM</span>
        </div>
      </div>
    </div>
  )
}
