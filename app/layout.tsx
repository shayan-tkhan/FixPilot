import PeekSidebar from "./components/peek-sidebar";
import "./globals.css";
export const metadata = {
  title: "FixPilot · Campus Support",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  description: "Report campus issues, follow repairs, and confirm resolution.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PeekSidebar>{children}</PeekSidebar>
      </body>
    </html>
  );
}
