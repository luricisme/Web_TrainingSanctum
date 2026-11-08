import { ClassDetailView } from "./class-detail-view";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassDetailView classId={id} />;
}
