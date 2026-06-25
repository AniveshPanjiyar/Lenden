import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lenden Collections",
  description: "Payment collection, transfer, settlement, and closing records.",
  appleWebApp: {
    capable: true,
    title: "Lenden",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
