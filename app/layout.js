import "./globals.css";

export const metadata = {
  title: "Sketch & Switch",
  description: "A timer for the Sketch & Switch drawing game",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
