import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Webfinance | Control",
  description: "Master and distributor control panel for Money Movement and Parcel Movement",
  applicationName: "Webfinance",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Webfinance",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#14594c" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1720" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable} font-sans antialiased`}>
        <RegisterSW />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
