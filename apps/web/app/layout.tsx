import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Sanctum",
  description: "Personal flashcard / spaced-repetition app.",
};

// Rounded geometric sans for the whole product; Vietnamese covers the realm names.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-jakarta",
  display: "swap",
});

// Runs before first paint so the stored theme never flashes. Light is the
// default and is server-rendered on <html>; only a stored "dark" removes it.
// localStorage may throw (blocked).
const themeInitScript = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.removeAttribute("data-theme")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
