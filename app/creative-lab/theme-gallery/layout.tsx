import { Space_Grotesk, Inter } from "next/font/google";
import { PasswordGate } from "./PasswordGate";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export default function ThemeGalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${spaceGrotesk.variable} ${inter.variable}`} style={{ minHeight: "100vh" }}>
      <PasswordGate>{children}</PasswordGate>
    </div>
  );
}
