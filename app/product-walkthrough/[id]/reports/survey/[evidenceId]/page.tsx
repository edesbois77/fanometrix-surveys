// Product Walkthrough's view of a Survey Intelligence report. Renders the
// exact same page component as /research-projects/[id]/reports/survey/[…],
// which derives its "← Back to Workspace" link from the current path
// (usePathname), so opening it from a walkthrough keeps navigation inside the
// /product-walkthrough tree. Kept as a thin re-export rather than a copy so
// the frozen report UI is never duplicated; the report files are re-parented
// under the project shell in a later migration step.
export { default } from "@/app/research-projects/[id]/reports/survey/[evidenceId]/page";
