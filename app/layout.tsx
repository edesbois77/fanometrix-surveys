import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "./components/SessionProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Fanometrix",
  description: "Fan Insight Platform",
  icons: {
    icon: "/FLogo.webp",
    shortcut: "/FLogo.webp",
    apple: "/FLogo.webp",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
