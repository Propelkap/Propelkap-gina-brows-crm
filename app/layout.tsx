import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const nohemi = localFont({
  variable: "--font-nohemi",
  display: "swap",
  src: [
    { path: "./fonts/Nohemi-Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/Nohemi-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Nohemi-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Nohemi-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Nohemi-Bold.ttf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Gina Brows · CRM",
  description: "CRM Gina Brows Microblading Artist",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${nohemi.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
