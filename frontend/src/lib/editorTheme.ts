import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

// Colors resolve through CSS variables so the editor flips with the app theme
// (light/dark). The --cm-* tokens are defined in index.css under :root / .dark.
const bg = 'var(--cm-bg)'
const border = 'var(--cm-border)'
const key = 'var(--cm-key)'
const stringColor = 'var(--cm-string)'
const numberColor = 'var(--cm-number)'
const text = 'var(--cm-text)'
const muted = 'var(--cm-muted)'
const selection = 'var(--cm-selection)'
const lineHighlight = 'var(--cm-line)'

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
    '.cm-tooltip': { backgroundColor: bg, border: `1px solid ${border}` },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: border },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: bg },
  },
  { dark: false }
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
