/* eslint-disable react-refresh/only-export-components -- agent registry: a logo
   component lives alongside the catalog data + lookup helpers by design. */
import type { ComponentType } from 'react'
import { AGENT_LOGOS, FallbackLogo, type LogoProps } from './logos'

export type AgentMeta = {
  id: string
  label: string
  Logo: ComponentType<LogoProps>
}

// Display metadata keyed by the backend registry id. Mirrors agentspec ids in
// backend/internal/agentspec/agentspec.go — keep both in sync.
export const AGENT_CATALOG: Record<string, AgentMeta> = {
  claudecode: { id: 'claudecode', label: 'Claude Code', Logo: AGENT_LOGOS.claudecode },
  codex: { id: 'codex', label: 'Codex', Logo: AGENT_LOGOS.codex },
  cursor: { id: 'cursor', label: 'Cursor', Logo: AGENT_LOGOS.cursor },
  antigravity: { id: 'antigravity', label: 'Antigravity CLI', Logo: AGENT_LOGOS.antigravity },
  copilot: { id: 'copilot', label: 'GitHub Copilot CLI', Logo: AGENT_LOGOS.copilot },
  qwen: { id: 'qwen', label: 'Qwen Code', Logo: AGENT_LOGOS.qwen },
  continue: { id: 'continue', label: 'Continue', Logo: AGENT_LOGOS.continue },
  augment: { id: 'augment', label: 'Augment / Auggie', Logo: AGENT_LOGOS.augment },
  windsurf: { id: 'windsurf', label: 'Windsurf', Logo: AGENT_LOGOS.windsurf },
  crush: { id: 'crush', label: 'Crush', Logo: AGENT_LOGOS.crush },
  goose: { id: 'goose', label: 'Goose', Logo: AGENT_LOGOS.goose },
}

export function agentMeta(id: string): AgentMeta {
  return AGENT_CATALOG[id] ?? { id, label: id, Logo: FallbackLogo }
}

export function AgentLogo({ id, size = 18 }: { id: string; size?: number }) {
  const { Logo } = agentMeta(id)
  return <Logo size={size} />
}
