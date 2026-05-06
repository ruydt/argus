import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [sessionUsage, setSessionUsage] = useState<Record<string, any>>({});
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed.toString());
  }, [collapsed]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={cn(
        'grid h-screen transition-[grid-template-columns] duration-300',
        collapsed ? 'grid-cols-[0px_1fr]' : 'grid-cols-[250px_1fr]'
      )}
    >
      <Sidebar collapsed={collapsed} />
      <div className="flex flex-col overflow-hidden">
        <header className="flex justify-between items-center px-4 py-2 bg-[#1e1e1e] border-b border-[#333] text-[0.8rem] text-[#666]">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="mr-3 border border-[#333] text-[#cccccc] hover:bg-white/5 hover:text-[#cccccc] px-2 py-1 h-auto"
              onClick={() => setCollapsed(c => !c)}
            >
              ☰
            </Button>
            <span>agent-monitor</span>
          </div>
          <span>{time}</span>
        </header>
        <Outlet context={{ collapsedSessions, setCollapsedSessions, sessionUsage, setSessionUsage }} />
      </div>
    </div>
  );
}
