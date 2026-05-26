import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthInit } from "@/components/providers/auth-init";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TMT Billing",
  description: "Billing & Recovery System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jakarta.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col bg-background text-foreground" suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme="vercel"
            disableTransitionOnChange
            themes={["light", "dark", "vercel", "vercel-dark", "system"]}
          >
          <QueryProvider>
            <AuthInit>
              {children}
            </AuthInit>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
