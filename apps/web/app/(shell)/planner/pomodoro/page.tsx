import { PomodoroScreen } from "./pomodoro-screen";

/** Planner -> Pomodoro (Story 9.3). `?task=<id>` picks the Task; without it the screen offers today's. */
export default async function PlannerPomodoroPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const { task } = await searchParams;
  return <PomodoroScreen taskId={typeof task === "string" && task ? task : null} />;
}
