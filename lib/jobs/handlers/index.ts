// Registers every job handler by importing its module for side effects. Import
// this once before draining the queue (the worker route does) so getHandler()
// can resolve any registered job_type. A new consumer adds one import line here.
import "@/lib/jobs/handlers/document-process";
import "@/lib/jobs/handlers/event-rollup";
