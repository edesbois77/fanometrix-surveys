// Carries "which section to scroll back to" across the Workspace's
// multi-hop navigation chain: a report/finding page's "← Back to Workspace"
// link -> /research-projects/[id]#section -> (simulated projects only) a
// same-tick redirect to /product-walkthrough/[id]#section. Deliberately not
// relying on the URL hash alone to survive that chain: it depends on
// router.replace preserving it correctly, Next's own post-navigation
// scroll-to-top not fighting it, and the destination page's effect actually
// re-firing — any one of those silently breaks the whole chain (in
// particular, if Next reuses an already-mounted Workspace instance from its
// router cache, a scroll effect keyed on "did my data ever load" never
// fires again, since that data hasn't changed). sessionStorage sidesteps
// all of it: it's read on every render of the Workspace, not just once.
const KEY = "fanometrix:workspace-scroll-target";

export function setWorkspaceScrollTarget(sectionId: string) {
  try {
    sessionStorage.setItem(KEY, sectionId);
  } catch {
    // Storage can throw in locked-down/private-browsing contexts — losing
    // the scroll-restore nicety isn't worth failing the navigation over.
  }
}

export function getWorkspaceScrollTarget(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearWorkspaceScrollTarget() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
