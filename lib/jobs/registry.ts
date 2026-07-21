// The one extension point of the job framework. A new consumer registers its
// handler here (via its own module, imported by lib/jobs/handlers/index.ts) —
// that plus an enqueueJob() call is the entire integration. No consumer writes
// its own scheduling, leasing, retry or recovery logic.
import type { JobDefinition } from "@/lib/jobs/types";

const registry = new Map<string, JobDefinition>();

/** Register the handler for a job_type. Registering the same type twice
 *  overwrites (last registration wins) — handlers are module-singletons, so this
 *  only happens on a genuine redefinition, never as a race. */
export function registerHandler(jobType: string, definition: JobDefinition): void {
  registry.set(jobType, definition);
}

export function getHandler(jobType: string): JobDefinition | undefined {
  return registry.get(jobType);
}

export function registeredJobTypes(): string[] {
  return [...registry.keys()];
}
