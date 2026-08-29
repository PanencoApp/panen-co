import type { Metadata, Viewport } from "next";
import Script from "next/script";
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

const oneSignalAppId =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ??
  "9c37759d-d557-4216-8a83-9b13eda4ed84";
const adsenseClient =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-793184864408957";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <head>
        <script
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="afterInteractive"
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "${oneSignalAppId}",
                allowLocalhostAsSecureOrigin: true,
              });
            });
          `}
        </Script>
      </body>
    </html>
  );
}
