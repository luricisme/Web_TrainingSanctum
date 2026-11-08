import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Sanctum",
  description: "Personal flashcard / spaced-repetition app.",
};

// Runs before first paint so the stored theme never flashes. Dark is the
// default; only "light" is ever applied. localStorage may throw (blocked).
const themeInitScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
