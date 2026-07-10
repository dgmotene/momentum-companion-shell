import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Companion (Embedded)",
  description:
    "Embedded companion frontend. Receives identity from the host, never runs its own login.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
