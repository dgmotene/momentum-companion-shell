import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Momentum Member Portal (Mock Host)",
  description:
    "Mock insurer portal that authenticates the user and embeds the AI companion. Design-round environment shell.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
