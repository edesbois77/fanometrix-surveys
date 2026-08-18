// Survey Studio product layout — the new authenticated shell, mounted ONLY for
// /survey-studio/*. It composes GlobalShell → StudioSidebar → workspace via
// StudioShell. This is additive: it wraps no existing route, replaces no
// AdminShell, and consumes the global SessionProvider (root layout) unchanged.
//
// Auth: /survey-studio is not in middleware's public lists, so it is gated by
// the default session requirement — every authenticated role reaches it; the
// sidebar itself is permission-aware via visibleStudioNav().
import { StudioShell } from "@/app/components/studio/StudioShell";

export default function SurveyStudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
