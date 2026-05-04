import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [sessionUsage, setSessionUsage] = useState<Record<string, any>>({});
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed.toString());
  }, [collapsed]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar">
        <div className="brand">
          <h1>Agent Monitor</h1>
        </div>
        <div className="nav">
          <NavLink 
            to="/" 
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            Terminal Events
          </NavLink>
          <NavLink 
            to="/usage" 
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            API Usage Tracker
          </NavLink>
        </div>
      </div>
      
      <div className="main-wrapper">
        <header>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button 
              className="toggle-btn" 
              onClick={() => setCollapsed(!collapsed)}
            >
              ☰
            </button>
            <span>agent-monitor</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span id="sync-time">{time}</span>
          </div>
        </header>
        
        <Outlet context={{ collapsedSessions, setCollapsedSessions, sessionUsage, setSessionUsage }} />
      </div>
    </div>
  );
}
