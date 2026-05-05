import type { AgentConfig } from '../../agents/types';
import { OpenAILogo } from '../../agents/logos';

type SessionProps = {
  keyId: string;
  events: any[];
  lastTime: Date;
  isCollapsed: boolean;
  toggleSession: (id: string) => void;
  searchQuery: string;
  shortId: (v: string) => string;
  highlight: (text: string, query: string) => any;
  sessionUsage: Record<string, any>;
  fmtTokens: (n: number) => string;
  setTooltip: (v: { text: string; x: number; y: number } | null | ((prev: { text: string; x: number; y: number } | null) => { text: string; x: number; y: number } | null)) => void;
  renderDiffLines: (oldStr: string, newStr: string, startLine: number, ctxBefore: any[], ctxAfter: any[], patchText?: string) => any;
  renderPatchDiff: (text: string, startLine: number) => any;
  agent: AgentConfig;
};

export function CodexSession(props: SessionProps) {
  const {
    keyId,
    events,
    lastTime,
    isCollapsed,
    toggleSession,
    searchQuery,
    shortId,
    highlight,
    sessionUsage,
    fmtTokens,
    setTooltip,
    renderDiffLines,
    renderPatchDiff,
    agent,
  } = props;
  const e0 = events[0];

  return (
    <div className={`session ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="session-head" onClick={() => toggleSession(keyId)}>
        <div className="session-id">
          <span className="agent-badge agent-codex"><OpenAILogo size={12} /></span>
          {highlight(e0.session || shortId(e0.transcript_path), searchQuery)}
          <span className="chev">{isCollapsed ? '▼' : '▲'}</span>
        </div>
        <div className="session-meta">
          {sessionUsage[keyId] && agent.buildUsageItems && (() => {
            const u = sessionUsage[keyId];
            return (
              <span className="usage-summary">
                {agent.buildUsageItems(u, fmtTokens).map(({ cls, label, tip }) => (
                  <span
                    key={cls}
                    className={`usage-item ${cls}`}
                    onMouseEnter={ev => setTooltip({ text: tip, x: ev.clientX, y: ev.clientY })}
                    onMouseMove={ev => setTooltip(t => t ? { ...t, x: ev.clientX, y: ev.clientY } : null)}
                    onMouseLeave={() => setTooltip(null)}
                  >{label}</span>
                ))}
              </span>
            );
          })()}
          {events.length} events • {lastTime.toLocaleTimeString()}
        </div>
      </div>
      <div className="session-body">
        {events.map((e, i) => (
          <div key={i} className="event">
            <div className="et">{new Date(e.time).toLocaleTimeString([], { hour12: false })}</div>
            <div className={`ea ${e.action}`}>{e.action}</div>
            <div className="ep">
              <div>
                {e.hook_event_name && <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>}
                {e.hook_event_name === 'PreToolUse' && e.model && (
                  <span className="event-model">{e.model}</span>
                )}
                {e.action !== 'BASH' && !(e.hook_event_name === 'PreToolUse' && e.model) && highlight(e.path || '', searchQuery)}
              </div>

              {(e.prompt || e.command) && !(e.action === 'EDIT' && (String(e.prompt).includes('*** Begin Patch') || String(e.command).includes('*** Begin Patch'))) && (
                <div className="eblock">
                  <strong>{e.prompt ? 'Prompt' : (e.command ? 'Command' : (e.path ? 'File' : 'Shell'))}</strong>
                  <pre>
                    {highlight(e.prompt || e.command || '', searchQuery)}
                  </pre>
                </div>
              )}

              {e.action === 'EDIT' && (e.old_string || e.new_string) && (
                <div className="eblock eblock-diff">
                  <strong>{e.path || 'Changes'}</strong>
                  {renderDiffLines(e.old_string || '', e.new_string || '', e.start_line, e.ctx_before, e.ctx_after, e.command || e.prompt || '')}
                </div>
              )}

              {e.action === 'EDIT' && !e.old_string && !e.new_string && (String(e.prompt).includes('*** Begin Patch') || String(e.command).includes('*** Begin Patch')) && (
                <div className="eblock eblock-diff">
                  <strong>{e.path || 'Changes'}</strong>
                  {renderPatchDiff(e.prompt || e.command, e.start_line || 1)}
                </div>
              )}

              <div className="meta">
                {e.tool && <span><strong>Tool:</strong> {e.tool}</span>}
                {e.source && <span><strong>Source:</strong> {e.source}</span>}
                {e.turn_id && <span><strong>Turn:</strong> {shortId(e.turn_id)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
