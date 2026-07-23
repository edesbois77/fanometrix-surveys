// Shown for a report that does not exist, is archived, or whose link is wrong.
//
// Deliberately identical whatever the cause. A distinct message for "archived"
// or "wrong password" would let anyone with the URL pattern discover which
// partners have reports, which is exactly the thing the password is protecting.

import { ReportShell } from "./ReportStates";

export default function ReportNotFound() {
  return (
    <ReportShell title="Report not found">
      This link does not point to a report we can find. It may have been mistyped, or the report may have been
      withdrawn. Please check the link you were sent.
    </ReportShell>
  );
}
