import { redirect } from "next/navigation";

// L4 lives at "/". Kept so earlier links and bookmarks still work.
export default function DashboardRedirect() {
  redirect("/");
}
