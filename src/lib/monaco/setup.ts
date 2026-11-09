/**
 * Monaco montado só com o que o SQL Editor usa (sem as dezenas de linguagens do pacote completo)
 * e servido do próprio DBHub — nada de CDN (funciona offline e respeita a CSP).
 * Lista de contribuições copiada de monaco-editor/esm/vs/editor/editor.main.js.
 */
import 'monaco-esm/editor/contrib/anchorSelect/browser/anchorSelect.js'
import 'monaco-esm/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-esm/editor/contrib/caretOperations/browser/transpose.js'
import 'monaco-esm/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-esm/editor/contrib/codeAction/browser/codeActionContributions.js'
import 'monaco-esm/editor/browser/widget/codeEditor/codeEditorWidget.js'
import 'monaco-esm/editor/contrib/codelens/browser/codelensController.js'
import 'monaco-esm/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-esm/editor/contrib/colorPicker/browser/colorPickerContribution.js'
import 'monaco-esm/editor/contrib/comment/browser/comment.js'
import 'monaco-esm/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-esm/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-esm/editor/browser/widget/diffEditor/diffEditor.contribution.js'
import 'monaco-esm/editor/contrib/diffEditorBreadcrumbs/browser/contribution.js'
import 'monaco-esm/editor/contrib/dnd/browser/dnd.js'
import 'monaco-esm/editor/contrib/documentSymbols/browser/documentSymbols.js'
import 'monaco-esm/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.js'
import 'monaco-esm/features/find/register.js'
import 'monaco-esm/editor/contrib/floatingMenu/browser/floatingMenu.contribution.js'
import 'monaco-esm/editor/contrib/folding/browser/folding.js'
import 'monaco-esm/editor/contrib/fontZoom/browser/fontZoom.js'
import 'monaco-esm/editor/contrib/format/browser/formatActions.js'
import 'monaco-esm/editor/contrib/gotoError/browser/gotoError.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js'
import 'monaco-esm/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-esm/editor/contrib/gpu/browser/gpuActions.js'
import 'monaco-esm/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-esm/editor/contrib/indentation/browser/indentation.js'
import 'monaco-esm/editor/contrib/inlayHints/browser/inlayHintsContribution.js'
import 'monaco-esm/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js'
import 'monaco-esm/editor/contrib/inlineProgress/browser/inlineProgress.js'
import 'monaco-esm/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js'
import 'monaco-esm/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine.js'
import 'monaco-esm/editor/standalone/browser/inspectTokens/inspectTokens.js'
import 'monaco-esm/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js'
import 'monaco-esm/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-esm/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-esm/editor/contrib/linkedEditing/browser/linkedEditing.js'
import 'monaco-esm/editor/contrib/links/browser/links.js'
import 'monaco-esm/editor/contrib/longLinesHelper/browser/longLinesHelper.js'
import 'monaco-esm/editor/contrib/middleScroll/browser/middleScroll.contribution.js'
import 'monaco-esm/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-esm/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-esm/editor/contrib/placeholderText/browser/placeholderText.contribution.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js'
import 'monaco-esm/editor/contrib/readOnlyMessage/browser/contribution.js'
import 'monaco-esm/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js'
import 'monaco-esm/editor/contrib/rename/browser/rename.js'
import 'monaco-esm/editor/contrib/sectionHeaders/browser/sectionHeaders.js'
import 'monaco-esm/editor/contrib/semanticTokens/browser/viewportSemanticTokens.js'
import 'monaco-esm/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-esm/editor/contrib/snippet/browser/snippetController2.js'
import 'monaco-esm/editor/contrib/stickyScroll/browser/stickyScrollContribution.js'
import 'monaco-esm/editor/contrib/suggest/browser/suggestInlineCompletions.js'
import 'monaco-esm/editor/standalone/browser/toggleHighContrast/toggleHighContrast.js'
import 'monaco-esm/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-esm/editor/contrib/tokenization/browser/tokenization.js'
import 'monaco-esm/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-esm/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js'
import 'monaco-esm/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-esm/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-esm/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-esm/editor/browser/coreCommands.js'
import 'monaco-esm/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-esm/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js'
import 'monaco-esm/editor/contrib/find/browser/findController.js'
import 'monaco-esm/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-esm/editor/contrib/gotoError/browser/markerSelectionStatus.js'
import 'monaco-esm/editor/contrib/semanticTokens/browser/documentSemanticTokens.js'
import 'monaco-esm/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-esm/editor/common/standaloneStrings.js'
import 'monaco-esm/base/browser/ui/codicons/codicon/codicon-modifiers.css'
import 'monaco-esm/languages/definitions/pgsql/register.js'
import EditorWorker from 'monaco-esm/editor/editor.worker.js?worker'
import * as monaco from 'monaco-esm/editor/editor.api.js'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

/** Cores do tema escuro do DBHub (globals.css convertido para hex, que é o que o Monaco aceita). */
monaco.editor.defineTheme('dbhub-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '41ce90', fontStyle: 'bold' },
    { token: 'operator', foreground: '8b918d' },
    { token: 'string', foreground: 'f2af48' },
    { token: 'number', foreground: '7cc4fa' },
    { token: 'comment', foreground: '6b716d', fontStyle: 'italic' },
    { token: 'predefined', foreground: 'c4a7ff' },
  ],
  colors: {
    'editor.background': '#0d0f0e',
    'editor.foreground': '#e9ecea',
    'editorLineNumber.foreground': '#4a504c',
    'editorLineNumber.activeForeground': '#8b918d',
    'editor.lineHighlightBackground': '#131614',
    'editor.selectionBackground': '#41ce9033',
    'editorCursor.foreground': '#41ce90',
    'editorGutter.background': '#090b09',
    'editorWidget.background': '#161917',
    'editorWidget.border': '#242725',
    'editorSuggestWidget.background': '#161917',
    'editorSuggestWidget.border': '#242725',
    'editorSuggestWidget.selectedBackground': '#202421',
    'editorSuggestWidget.highlightForeground': '#41ce90',
    'scrollbarSlider.background': '#24272599',
    'scrollbarSlider.hoverBackground': '#242725',
  },
})

export { monaco }
