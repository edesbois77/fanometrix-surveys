"use client";

// Shared publisher × country picker + deployment-matrix preview — the
// targeting UI a Research Project uses everywhere it decides "which
// campaigns will Generate Deployments create". Extracted so the Research
// Projects list page's Edit drawer and the Research Project Workspace's
// Deployment Targets step render and behave identically, with one place to
// fix bugs or add options later.
import { MultiSelect } from "@/app/components/MultiSelect";
import { countryOptions } from "@/lib/countries";

export function PublisherCountryPicker({
  publisherOptions,
  publisherOrgIds,
  onPublisherOrgIdsChange,
  publishersDisabled,
  publishersHelperText,
  countryCodes,
  onCountryCodesChange,
  orgName,
}: {
  publisherOptions: { id: string; name: string }[];
  publisherOrgIds: string[];
  onPublisherOrgIdsChange: (ids: string[]) => void;
  publishersDisabled?: boolean;
  publishersHelperText?: string;
  countryCodes: string[];
  onCountryCodesChange: (codes: string[]) => void;
  orgName: (id: string) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Publishers</label>
        <MultiSelect
          options={publisherOptions.map(o => ({ value: o.id, label: o.name }))}
          selected={publisherOrgIds}
          onChange={onPublisherOrgIdsChange}
          placeholder="Select publishers…"
          strict
          disabled={publishersDisabled}
          helperText={publishersHelperText}
          unmatchedMessage={s => `"${s}" is not a recognised publisher, add it in Organisations first.`}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Countries</label>
        <MultiSelect
          options={countryOptions()}
          selected={countryCodes}
          onChange={onCountryCodesChange}
          placeholder="Select countries…"
          strict
          unmatchedMessage={s => `"${s}" is not a recognised country.`}
        />
      </div>

      {publisherOrgIds.length > 0 && countryCodes.length > 0 && (
        <>
          <div className="bg-white border border-[#D7B87A] rounded-lg px-3 py-3 flex items-center justify-center gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#0B1929]">{publisherOrgIds.length}</p>
              <p className="text-xs text-gray-500">Publisher{publisherOrgIds.length !== 1 ? "s" : ""}</p>
            </div>
            <span className="text-xl text-gray-300">×</span>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#0B1929]">{countryCodes.length}</p>
              <p className="text-xs text-gray-500">Countr{countryCodes.length === 1 ? "y" : "ies"}</p>
            </div>
            <span className="text-xl text-gray-300">=</span>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#0B1929]">{publisherOrgIds.length * countryCodes.length}</p>
              <p className="text-xs font-semibold text-[#0B1929]">Deployments</p>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer select-none list-none text-xs font-semibold text-[#0B1929] flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">›</span>
              Preview deployment matrix
            </summary>
            <div className="mt-2 overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Publisher</th>
                    {countryCodes.map(code => (
                      <th key={code} className="px-2 py-2 font-semibold text-gray-500 whitespace-nowrap">{code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {publisherOrgIds.map(id => (
                    <tr key={id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{orgName(id)}</td>
                      {countryCodes.map(code => (
                        <td key={code} className="text-center text-[#0B1929]">✓</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
