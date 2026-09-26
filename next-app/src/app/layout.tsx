import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PaddlePointer",
  description: "PaddlePointer migration preview",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
