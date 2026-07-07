/**
 * A numbered step in a drawer's guided workflow. `prominent` marks the
 * section(s) that are the actual point of the form (e.g. Deployment Matrix,
 * Survey Configuration, Market Targeting) so they read as more than "just
 * another form field". Shared between the Research Project and Campaign
 * edit drawers so both follow the same sectioned visual language.
 */
export function DrawerSection({
  step, title, subtitle, prominent = false, children,
}: { step: number; title: string; subtitle?: string; prominent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border ${prominent ? "border-[#D7B87A] bg-[#FBF5E8]/50" : "border-gray-100 bg-white"}`}>
      <div className="px-4 pt-4 pb-2 flex items-start gap-2.5">
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
            prominent ? "bg-[#0B1929] text-[#D7B87A]" : "bg-gray-100 text-gray-500"
          }`}
        >
          {step}
        </span>
        <div className="min-w-0">
          <h3 className={`text-sm font-bold ${prominent ? "text-[#0B1929]" : "text-gray-800"}`}>{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2 space-y-3">
        {children}
      </div>
    </div>
  );
}
