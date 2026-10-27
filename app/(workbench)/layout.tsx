import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/workbench";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <Shell>{children}</Shell>;
}
