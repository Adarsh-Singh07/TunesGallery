import type { Metadata } from "next";
import "./globals.css";
import { site } from "../data/site";

export const metadata: Metadata = {
  metadataBase: new URL("https://onlyforyou.vercel.app"),
  title: site.seo.title,
  description: site.seo.description,
  openGraph: {
    title: site.seo.title,
    description: site.seo.description,
    type: "website",
    images: site.seo.ogImage ? [{ url: site.seo.ogImage }] : [],
  },
  twitter: {
    card: "summary_large_image",
    title: site.seo.title,
    description: site.seo.description,
    images: site.seo.ogImage ? [site.seo.ogImage] : [],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OnlyForYou",
  },
};

export const viewport = {
  themeColor: "#07050a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
