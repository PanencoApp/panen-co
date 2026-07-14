import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panen&Co",
  description: "Application mobile free-to-play de predictions football.",
  applicationName: "Panen&Co",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Panen&Co",
  },
  icons: {
    icon: "/panen-co-small-logo.png",
    apple: "/panen-co-small-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#00baff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
