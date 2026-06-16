import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const bg = '#ffffff'
const border = '#eaeaea'
const key = '#0550ae'
const stringColor = '#0a7c42'
const numberColor = '#953800'
const text = '#171717'
const muted = '#666666'
const selection = '#b3d4fc'
const lineHighlight = '#f5f5f5'

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
      backgroundColor: 'rgba(5, 80, 174, 0.12)',
      color: `${text} !important`,
      outline: '1px solid rgba(5, 80, 174, 0.4)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: lineHighlight,
      border: `1px solid ${border}`,
      color: muted,
    },
    '.cm-tooltip': { backgroundColor: '#ffffff', border: `1px solid ${border}` },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: border },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#ffffff' },
  },
  { dark: false }
)

export const readOnlyExtensions = [EditorView.lineWrapping, EditorView.editable.of(false), drawSelection()]
export const editableExtensions = [EditorView.lineWrapping, keymap.of([indentWithTab]), drawSelection()]

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
