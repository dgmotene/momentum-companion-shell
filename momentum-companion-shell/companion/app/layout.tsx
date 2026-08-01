import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lumina · AI Companion",
  description:
    "Embedded companion frontend. Receives identity from the host portal, never runs its own login.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/*
        Transparent, not white.

        Both surfaces are iframes sized by the host. The launcher pill is a
        rounded shape in a rectangular frame, so an opaque body would draw a
        white box around it and give away that it is an embed. The panel paints
        its own background instead.
      */}
      <body className="bg-transparent text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
