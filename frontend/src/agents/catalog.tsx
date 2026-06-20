/* eslint-disable react-refresh/only-export-components -- agent registry: a logo
   component lives alongside the catalog data + lookup helpers by design. */
import type { ComponentType } from 'react'
import { Bot } from 'lucide-react'
import {
  Amp,
  Claude,
  Cline,
  Codex,
  Cursor,
  Gemini,
  GithubCopilot,
  Goose,
  KiloCode,
  OpenCode,
  Qwen,
  Windsurf,
} from '@lobehub/icons'

type LogoProps = { size?: number }

// lobehub icons expose an `.Avatar` subcomponent that requires `size: number`;
// wrap it so every agent logo has the same optional-{size} contract regardless
// of source (the wrapper always supplies a number via the default).
function lobe(Icon: { Avatar: ComponentType<{ size: number }> }): ComponentType<LogoProps> {
  return function LobeLogo({ size = 18 }: LogoProps) {
    return <Icon.Avatar size={size} />
  }
}

// Fallback for agents without a dedicated brand icon (Continue, Crush, Augment).
function FallbackLogo({ size = 18 }: LogoProps) {
  return <Bot size={size} />
}

export type AgentMeta = {
  id: string
  label: string
  Logo: ComponentType<LogoProps>
}

// Display metadata keyed by the backend registry id. Mirrors agentspec ids in
// backend/internal/agentspec/agentspec.go — keep both in sync.
export const AGENT_CATALOG: Record<string, AgentMeta> = {
  claudecode: { id: 'claudecode', label: 'Claude Code', Logo: lobe(Claude) },
  codex: { id: 'codex', label: 'Codex', Logo: lobe(Codex) },
  cursor: { id: 'cursor', label: 'Cursor', Logo: lobe(Cursor) },
  gemini: { id: 'gemini', label: 'Gemini CLI', Logo: lobe(Gemini) },
  copilot: { id: 'copilot', label: 'GitHub Copilot CLI', Logo: lobe(GithubCopilot) },
  qwen: { id: 'qwen', label: 'Qwen Code', Logo: lobe(Qwen) },
  continue: { id: 'continue', label: 'Continue', Logo: FallbackLogo },
  augment: { id: 'augment', label: 'Augment / Auggie', Logo: FallbackLogo },
  windsurf: { id: 'windsurf', label: 'Windsurf', Logo: lobe(Windsurf) },
  crush: { id: 'crush', label: 'Crush', Logo: FallbackLogo },
  cline: { id: 'cline', label: 'Cline', Logo: lobe(Cline) },
  opencode: { id: 'opencode', label: 'OpenCode', Logo: lobe(OpenCode) },
  kilocode: { id: 'kilocode', label: 'Kilo Code', Logo: lobe(KiloCode) },
  goose: { id: 'goose', label: 'Goose', Logo: lobe(Goose) },
  amp: { id: 'amp', label: 'Amp', Logo: lobe(Amp) },
}

export function agentMeta(id: string): AgentMeta {
  return AGENT_CATALOG[id] ?? { id, label: id, Logo: FallbackLogo }
}

export function AgentLogo({ id, size = 18 }: { id: string; size?: number }) {
  const { Logo } = agentMeta(id)
  return <Logo size={size} />
}
