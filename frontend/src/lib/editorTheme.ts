import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const bg = '#0a0a0c'
const border = '#232329'
const key = '#a78bfa'
const stringColor = '#3ecf8e'
const numberColor = '#fbbf24'
const text = '#ededf0'
const muted = '#9c9ca6'
const selection = 'rgba(139, 92, 246, 0.35)'
const lineHighlight = '#16161a'

export const argusEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: bg, color: text },
    '.cm-content': { caretColor: text },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: text },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: selection },
    '.cm-gutters': {
      backgroundColor: bg,
      color: muted,
      border: 'none',
      borderRight: `1px solid ${border}`,
    },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', paddingRight: '12px' },
    '.cm-activeLineGutter': { backgroundColor: lineHighlight, color: text },
    '.cm-activeLine': { backgroundColor: lineHighlight },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(139, 92, 246, 0.18)',
      color: `${text} !important`,
      outline: '1px solid rgba(139, 92, 246, 0.5)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: lineHighlight,
      border: `1px solid ${border}`,
      color: muted,
    },
    '.cm-tooltip': { backgroundColor: '#0a0a0c', border: `1px solid ${border}` },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: border },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#0a0a0c' },
  },
  { dark: true }
)

export const readOnlyExtensions = [
  EditorView.lineWrapping,
  EditorView.editable.of(false),
  drawSelection(),
]
export const editableExtensions = [
  EditorView.lineWrapping,
  keymap.of([indentWithTab]),
  drawSelection(),
]

export const argusHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: key },
    { tag: tags.string, color: stringColor },
    { tag: tags.number, color: numberColor },
    { tag: tags.bool, color: numberColor },
    { tag: tags.null, color: muted },
    { tag: tags.punctuation, color: text },
    { tag: tags.bracket, color: text },
    { tag: tags.brace, color: text },
  ])
)
