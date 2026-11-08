import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";

export default async function AuthPageLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (await getServerSession()) redirect("/review");
  return children;
}
