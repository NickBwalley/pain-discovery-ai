import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Pain Discovery — Simple research",
    template: "%s · Pain Discovery",
  },
  description: "Choose your categories and explore real public conversations",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('pain-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
