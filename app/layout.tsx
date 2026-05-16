import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

// Inlined from @elijahfrost/design-system/theme's themeBootstrap.
// Kept inline because the source module is "use client" and we need this in a
// server-rendered <head> to avoid a dark-flash if the visitor prefers light.
const THEME_BOOTSTRAP = `(()=>{try{var k="ef-auth-theme";var s=localStorage.getItem(k);var l=(s==="light")||((s==null||s==="system")&&window.matchMedia("(prefers-color-scheme: light)").matches);if(l)document.documentElement.classList.add("light");}catch(e){}})();`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in — elijahfrost.com",
  description: "Sign in to access elijahfrost.com projects.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
