import { redirect } from "next/navigation";

// Canonical privacy pages now live at /[lang]/privacy.
// Redirect bare /privacy to the English version.
export default function PrivacyRedirect() {
  redirect("/en/privacy");
}
