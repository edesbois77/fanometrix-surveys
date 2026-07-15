"use client";

// A short, consistent one-line introduction at the top of every Research
// Project area page, stating what that page is for so the navigation reads as
// a guided research lifecycle rather than a set of features. Research-Project
// only — Product Walkthrough does not use it.
export function PageIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 px-1 -mt-1 mb-1">{children}</p>;
}
