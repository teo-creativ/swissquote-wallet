import { MobileTabBar } from "@/components/portal/MobileTabBar";
import { SimulatedStrip } from "@/components/portal/SimulatedStrip";
import { Sidebar } from "@/components/portal/Sidebar";
import { TopBar } from "@/components/portal/TopBar";

// Placeholder until the session exists (prompt lawyer/03). The lawyer is played by a team member.
const LAWYER_NAME = "Demo Lawyer";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SimulatedStrip />
      <div className="flex">
        <Sidebar lawyerName={LAWYER_NAME} />
        <div className="min-w-0 flex-1">
          <TopBar lawyerName={LAWYER_NAME} />
          <main className="mx-auto max-w-[1100px] px-4 pb-28 pt-6 md:px-6 md:pb-10">{children}</main>
        </div>
      </div>
      <MobileTabBar />
    </>
  );
}
