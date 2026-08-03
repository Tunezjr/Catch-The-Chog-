// app/layout.tsx
// Every Next.js App Router project needs a root layout. It wraps <html>/<body>
// around whatever page is being rendered (in our case, app/page.tsx).

import "./globals.css";

export const metadata = {
  title: "Catch Game",
  description: "Catch the falling character with your paddle.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
