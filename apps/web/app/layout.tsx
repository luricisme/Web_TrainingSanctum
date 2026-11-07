import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Sanctum",
  description: "Personal flashcard / spaced-repetition app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
