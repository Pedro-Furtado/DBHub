/** Caminhos internos do monaco-editor (alias `monaco-esm` no vite.config.ts). */
declare module 'monaco-esm/editor/editor.api.js' {
  export * from 'monaco-editor'
}
declare module 'monaco-esm/editor/editor.worker.js?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
declare module 'monaco-esm/*'
