import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "houseproj — plan to 3D house model",
  description:
    "Import a floor plan, calibrate it, and edit a dimensionally accurate house model.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
