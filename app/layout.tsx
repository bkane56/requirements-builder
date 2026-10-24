import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Requirements Builder",
  description: "Assemble a PROJECT_REQUIREMENTS.md from business requirements and reusable modules.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
