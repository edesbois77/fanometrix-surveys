"use client";

import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { STUDY_TYPES, STUDY_TYPE_LABELS } from "@/lib/naming";

type OrgOption = { id: string; name: string };

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";
const LBL = "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      {children}
    </div>
  );
}

/**
 * The one Name Builder shape shared by Campaigns, Campaign Groups, Surveys,
 * and Research Projects — Topic, Brand, Agency, Type, in that order. Brand
 * and Agency are optional; Topic and Type are the only required inputs.
 * Campaigns pass `extraPreviewParts` (Country, Publisher) so the live
 * preview reflects the full generated name, even though those fields live
 * in a different section of that page's form.
 */
export function NameBuilder({
  topic, onTopicChange,
  brandOrgId, onBrandChange, brandOptions,
  agencyOrgId, onAgencyChange, agencyOptions,
  studyType, onStudyTypeChange,
  onAutoGenerate, preview, hasSlug = true,
}: {
  topic: string;
  onTopicChange: (v: string) => void;
  brandOrgId: string;
  onBrandChange: (v: string) => void;
  brandOptions: OrgOption[];
  agencyOrgId: string;
  onAgencyChange: (v: string) => void;
  agencyOptions: OrgOption[];
  studyType: string;
  onStudyTypeChange: (v: string) => void;
  onAutoGenerate: () => void;
  preview: string;
  hasSlug?: boolean;
}) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name Builder</p>
        {isAdmin && (
          <Link href="/organisations?type=brand" className="text-xs text-gray-400 hover:text-[#0B1929] underline">
            Manage Brands &amp; Agencies →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Topic *">
          <input value={topic} onChange={e => onTopicChange(e.target.value)}
            className={INP} placeholder="Women's World Cup" />
        </Field>
        <Field label="Brand (optional)">
          <select value={brandOrgId} onChange={e => onBrandChange(e.target.value)} className={INP}>
            <option value="">— None —</option>
            {brandOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Agency (optional)">
          <select value={agencyOrgId} onChange={e => onAgencyChange(e.target.value)} className={INP}>
            <option value="">— None —</option>
            {agencyOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Type *">
          <select value={studyType} onChange={e => onStudyTypeChange(e.target.value)} className={INP}>
            {STUDY_TYPES.map(t => (
              <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={onAutoGenerate}
        className="w-full text-xs font-semibold px-3 py-2 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors"
      >
        Auto Generate Name{hasSlug ? " & Slug" : ""}
      </button>

      {preview && (
        <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono">
          {preview}
        </p>
      )}
    </div>
  );
}
