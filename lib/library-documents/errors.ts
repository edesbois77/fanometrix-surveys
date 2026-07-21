// Domain error for the document-processing pipeline. Keeps run-extraction /
// run-analysis decoupled from the jobs framework: they throw plain Errors
// (transient — the framework will retry) or an UnprocessableDocumentError
// (permanent — re-running cannot help), and the document.process handler maps
// the latter to a PermanentJobError. This way the pipeline never imports
// lib/jobs and could be driven by any executor.
export class UnprocessableDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnprocessableDocumentError";
  }
}
