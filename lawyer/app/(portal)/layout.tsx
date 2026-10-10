import { PortalChrome } from "@/components/portal/PortalChrome";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalChrome>{children}</PortalChrome>;
}
