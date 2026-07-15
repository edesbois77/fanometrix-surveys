import { useCreativeDesignNames } from "@/lib/creative-designs";
import type { Campaign } from "./types";

export function CampaignPreviewModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }
  const designNames = useCreativeDesignNames();
  const themeName = designNames[(campaign.effective_creative_design ?? campaign.creative_design) ?? ""];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onBackdrop}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Badge */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center shadow">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">◆ Preview Mode</p>
          <p className="text-xs text-amber-600 mt-0.5">No responses are recorded.</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">{campaign.campaign_name}</p>
          {themeName && (
            <p className="text-xs font-semibold mt-1" style={{ color: "#0B1929" }}>
              Creative: <span style={{ color: "#D7B87A" }}>{themeName}</span>
            </p>
          )}
        </div>

        {/* Embed iframe — shows real questions + correct theme */}
        <iframe
          src={`/embed?campaign=${campaign.campaign_id}&preview=1`}
          width={300}
          height={250}
          style={{ border: "none", borderRadius: 12, display: "block",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          title="Campaign creative preview"
        />

        <button
          onClick={onClose}
          className="text-sm text-white/60 hover:text-white transition-colors px-4 py-2"
        >
          ✕ Close preview
        </button>
      </div>
    </div>
  );
}
