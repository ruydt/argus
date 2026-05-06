import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentForEvent } from '../agents';
import { AgentSession } from '../components/events/AgentSession';
import { useEvents } from '../hooks/useEvents';

export function Events() {
  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [timeRange, setTimeRange] = useState('15m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const { collapsedSessions, setCollapsedSessions, sessionUsage, setSessionUsage } =
    useOutletContext<any>();
  const fetchedUsage = useRef<Set<string>>(new Set());

  const { events } = useEvents();

  useEffect(() => {
    const seen = new Map<string, string>();
    events.forEach(e => {
      const agent = agentForEvent(e);
      if (agent.supportsSessionUsage && e.transcript_path && e.session && !seen.has(e.session)) {
        seen.set(e.session, e.transcript_path);
      }
    });
    seen.forEach(async (path, key) => {
      if (!path || fetchedUsage.current.has(key)) return;
      fetchedUsage.current.add(key);
      try {
        const res = await fetch(`/api/session-usage?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        const hasAnyUsage =
          Number(data?.input_tokens || 0) > 0 ||
          Number(data?.output_tokens || 0) > 0 ||
          Number(data?.cache_read_tokens || 0) > 0 ||
          Number(data?.cache_creation_tokens || 0) > 0 ||
          Number(data?.turns || 0) > 0;
        if (!hasAnyUsage) fetchedUsage.current.delete(key);
        setSessionUsage((prev: any) => ({ ...prev, [key]: data }));
      } catch (_) {
        fetchedUsage.current.delete(key);
      }
    });
  }, [events]);

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const shortId = (v: string) => v ? v.substring(0, 8) : 'unknown';
  const groupKey = (e: any) => e.session || e.transcript_path || 'ungrouped';
  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const extractPatchStartLine = (text: string) => {
    if (!text) return 0;
    const m = text.match(/@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/);
    return m ? Number(m[1]) : 0;
  };

  const renderDiffLines = (
    oldStr: string,
    newStr: string,
    startLine: number,
    ctxBefore: any[],
    ctxAfter: any[],
    patchText?: string,
  ): ReactNode => {
    const oldLines = oldStr ? oldStr.split('\n') : [];
    const newLines = newStr ? newStr.split('\n') : [];
    const fallbackStart = extractPatchStartLine(patchText || '');
    const base = startLine > 0 ? startLine : (fallbackStart > 0 ? fallbackStart : 1);
    let oldLine = base;
    let newLine = base;
    return (
      <div className="diff-block">
        {ctxBefore?.map((l: any) => (
          <div key={`ctx-b-${l.num}`} className="diff-line diff-ctx">
            <span className="diff-ln">{l.num}</span>
            <span className="diff-marker"> </span>
            <span className="diff-content">{l.text}</span>
          </div>
        ))}
        {oldLines.map((line, i) => {
          const n = oldLine++;
          return (
            <div key={`rm-${i}`} className="diff-line diff-removed">
              <span className="diff-ln">{n}</span>
              <span className="diff-marker">-</span>
              <span className="diff-content">{line}</span>
            </div>
          );
        })}
        {newLines.map((line, i) => {
          const n = newLine++;
          return (
            <div key={`add-${i}`} className="diff-line diff-added">
              <span className="diff-ln">{n}</span>
              <span className="diff-marker">+</span>
              <span className="diff-content">{line}</span>
            </div>
          );
        })}
        {ctxAfter?.map((l: any) => (
          <div key={`ctx-a-${l.num}`} className="diff-line diff-ctx">
            <span className="diff-ln">{l.num}</span>
            <span className="diff-marker"> </span>
            <span className="diff-content">{l.text}</span>
          </div>
        ))}
      </div>
    );
  };

  const parseApplyPatch = (text: string, initialLine: number = 1) => {
    const lines = text.split('\n');
    const out: Array<{ kind: 'ctx' | 'add' | 'del'; num: number; text: string }> = [];
    let oldLine = initialLine;
    let newLine = initialLine;
    let inPatch = false;

    for (const line of lines) {
      if (line.startsWith('*** Begin Patch')) { inPatch = true; continue; }
      if (!inPatch) continue;
      if (line.startsWith('*** End Patch')) break;

      if (line.includes('@@')) {
        const m = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)/);
        if (m) { oldLine = Number(m[1]); newLine = Number(m[2]); }
        continue;
      }
      if (line.startsWith('***')) continue;

      const match = line.match(/^(\s*)([-+ ])(.*)$/);
      if (!match) continue;
      const [, indent, marker, content] = match;

      if (marker === '-') { out.push({ kind: 'del', num: oldLine, text: indent + content }); oldLine++; }
      else if (marker === '+') { out.push({ kind: 'add', num: newLine, text: indent + content }); newLine++; }
      else if (marker === ' ') { out.push({ kind: 'ctx', num: oldLine, text: indent + content }); oldLine++; newLine++; }
    }
    return out;
  };

  const renderPatchDiff = (text: string, startLine: number): ReactNode => {
    const rows = parseApplyPatch(text, startLine);
    if (rows.length === 0) return null;
    return (
      <div className="diff-block">
        {rows.map((r, i) => (
          <div
            key={`p-${i}`}
            className={`diff-line ${r.kind === 'add' ? 'diff-added' : r.kind === 'del' ? 'diff-removed' : 'diff-ctx'}`}
          >
            <span className="diff-ln">{r.num}</span>
            <span className="diff-marker">{r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}</span>
            <span className="diff-content">{r.text}</span>
          </div>
        ))}
      </div>
    );
  };

  const highlight = (text: string, query: string): ReactNode => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase()
            ? <mark key={i}>{part}</mark>
            : part
        )}
      </>
    );
  };

  const parseLocalDateTime = (s: string) => {
    if (!s) return NaN;
    return new Date(s.replace(' ', 'T')).getTime();
  };

  const getRangeStartMs = () => {
    const now = Date.now();
    switch (timeRange) {
      case '5m': return now - 5 * 60 * 1000;
      case '15m': return now - 15 * 60 * 1000;
      case '1h': return now - 60 * 60 * 1000;
      case '6h': return now - 6 * 60 * 60 * 1000;
      case '24h': return now - 24 * 60 * 60 * 1000;
      case '7d': return now - 7 * 24 * 60 * 60 * 1000;
      case '30d': return now - 30 * 24 * 60 * 60 * 1000;
      default: return NaN;
    }
  };

  const filtered = events.filter(e => {
    const eventTime = new Date(e.time).getTime();
    if (timeRange === 'custom') {
      const startMs = parseLocalDateTime(customStart);
      const endMs = parseLocalDateTime(customEnd);
      if (!Number.isNaN(startMs) && eventTime < startMs) return false;
      if (!Number.isNaN(endMs) && eventTime > endMs) return false;
    } else {
      const startMs = getRangeStartMs();
      if (!Number.isNaN(startMs) && eventTime < startMs) return false;
    }
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !e.path?.toLowerCase().includes(q) &&
        !e.session?.toLowerCase().includes(q) &&
        !e.command?.toLowerCase().includes(q) &&
        !e.prompt?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const grouped = new Map<string, any[]>();
  filtered.forEach(e => {
    const key = groupKey(e);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  });

  const sessionList = Array.from(grouped.keys()).map(key => {
    const groupEvents = grouped.get(key)!;
    const sortedEvents = [...groupEvents].sort((a, b) =>
      sortOrder === 'newest'
        ? new Date(b.time).getTime() - new Date(a.time).getTime()
        : new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const lastTime = new Date(Math.max(...sortedEvents.map(e => new Date(e.time).getTime())));
    return { key, events: sortedEvents, lastTime };
  });

  sessionList.sort((a, b) =>
    sortOrder === 'newest'
      ? b.lastTime.getTime() - a.lastTime.getTime()
      : a.lastTime.getTime() - b.lastTime.getTime()
  );

  return (
    <>
      {tooltip && (
        <div className="floating-tip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          {tooltip.text.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <div className="flex gap-5 items-center px-4 py-[10px] bg-[#111] border-b border-[#333] flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Action</span>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[100px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="all">ALL</SelectItem>
                <SelectItem value="EDIT">EDIT</SelectItem>
                <SelectItem value="BASH">BASH</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-[0.7rem] uppercase text-[#666]">Search</span>
          <Input
            className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Filter by path, prompt, or session ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Sort</span>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[110px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="newest">NEWEST</SelectItem>
                <SelectItem value="oldest">OLDEST</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Time</span>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[160px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="5m">Last 5 minutes</SelectItem>
                <SelectItem value="15m">Last 15 minutes</SelectItem>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="6h">Last 6 hours</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {timeRange === 'custom' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[0.7rem] uppercase text-[#666]">Start</span>
              <Input
                className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                placeholder="2026-05-05 10:00:00"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.7rem] uppercase text-[#666]">End</span>
              <Input
                className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                placeholder="2026-05-05 12:00:00"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-[10px] bg-[#111] border-b border-[#333] text-[0.75rem] uppercase tracking-[0.1em] text-[#666]">
          Session Events
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {sessionList.length === 0 ? (
            <div className="text-[#666] italic p-[10px]">No matching events.</div>
          ) : (
            sessionList.map(({ key, events: sessionEvents, lastTime }) => {
              const agent = agentForEvent(sessionEvents[0]);
              return (
                <AgentSession
                  key={key}
                  keyId={key}
                  events={sessionEvents}
                  lastTime={lastTime}
                  isCollapsed={collapsedSessions.has(key)}
                  toggleSession={toggleSession}
                  searchQuery={searchQuery}
                  shortId={shortId}
                  highlight={highlight}
                  sessionUsage={sessionUsage}
                  fmtTokens={fmtTokens}
                  setTooltip={setTooltip}
                  renderDiffLines={renderDiffLines}
                  renderPatchDiff={renderPatchDiff}
                  agent={agent}
                />
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
