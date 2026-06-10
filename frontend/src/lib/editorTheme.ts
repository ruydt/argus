import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const bg = '#0d1117'
const cyan = '#79c0ff'
const orange = '#ffa657'
const white = '#e6edf3'
const muted = '#8b949e'
const selection = 'rgba(121, 192, 255, 0.18)'
const lineHighlight = '#161b22'

export const argusEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: bg, color: white },
    '.cm-content': { caretColor: white },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: white },
    '.cm-selectionBackground': { backgroundColor: selection },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: selection },
    '.cm-gutters': {
      backgroundColor: bg,
      color: muted,
      border: 'none',
      borderRight: '1px solid #21262d',
    },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', paddingRight: '12px' },
    '.cm-activeLineGutter': { backgroundColor: lineHighlight },
    '.cm-activeLine': { backgroundColor: lineHighlight },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(121, 192, 255, 0.15)',
      color: `${white} !important`,
      outline: '1px solid rgba(121, 192, 255, 0.4)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#21262d',
      border: '1px solid #30363d',
      color: muted,
    },
    '.cm-tooltip': { backgroundColor: '#161b22', border: '1px solid #30363d' },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: '#30363d' },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#161b22' },
  },
  { dark: true }
)

export const readOnlyExtensions = [EditorView.lineWrapping, EditorView.editable.of(false)]
export const editableExtensions = [EditorView.lineWrapping, keymap.of([indentWithTab])]

export const argusHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: cyan },
    { tag: tags.string, color: orange },
    { tag: tags.number, color: orange },
    { tag: tags.bool, color: orange },
    { tag: tags.null, color: muted },
    { tag: tags.punctuation, color: white },
    { tag: tags.bracket, color: white },
    { tag: tags.brace, color: white },
  ])
)
