import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { CalendarBlock as Block, WeekTaskSummary } from "@training-sanctum/domain";
import { tintFor } from "@/app/components/ui";
import { formatDay } from "../tasks-key";

/** Position of a minute in the grid, from the one `--calendar-hour` token. */
export const minutePx = (minutes: number) => `calc(var(--calendar-hour) * ${minutes} / 60)`;

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const focusClass =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Pointer and keyboard wiring for a movable item (Story 10.2); absent for done and continued blocks. */
export interface MoveProps {
  /** Viewport rect to draw the item fixed under the pointer while it is lifted; null otherwise. */
  lift: { left: number; top: number; width: number; height: number } | null;
  /** True while this item is selected for a keyboard move. */
  selected: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
}

export const MOVE_HINT_ID = "calendar-move-hint";

function moveAttrs(move: MoveProps | undefined, taskId: string) {
  if (!move) return { "data-task-id": taskId };
  return {
    "data-task-id": taskId,
    "aria-describedby": MOVE_HINT_ID,
    onPointerDown: move.onPointerDown,
    onKeyDown: move.onKeyDown,
    onBlur: move.onBlur,
  };
}

function moveClass(move: MoveProps | undefined) {
  if (!move) return "";
  if (move.lift) return "pointer-events-none z-30 cursor-grabbing shadow-low outline outline-2 outline-offset-2 outline-accent touch-none";
  return `cursor-grab select-none ${move.selected ? "shadow-low outline outline-2 outline-offset-2 outline-accent" : ""}`;
}

function liftStyle(move: MoveProps | undefined): CSSProperties {
  const l = move?.lift;
  return l ? { position: "fixed", left: l.left, top: l.top, width: l.width, height: l.height } : {};
}

/**
 * A scheduled Task (DESIGN.md components.calendar-block): Category tint, title
 * and minutes in `text`, `rounded.sm`. A conflict swaps the tint border for a
 * 2px `error` one and adds the "Conflict" caption (never the border alone).
 * Focusable and labelled for Tab reach; movable by pointer and keyboard (Story 10.2).
 */
export function CalendarBlock({
  block,
  task,
  day,
  move,
}: {
  block: Block;
  task: WeekTaskSummary;
  day: string;
  move?: MoveProps;
}) {
  const end = block.startMin + block.lengthMin;
  const short = block.lengthMin < 45;
  const roomy = block.lengthMin >= 90;
  const label = [
    task.title,
    formatDay(day),
    block.continued
      ? `continued from the day before until ${clock(end)}`
      : `${clock(block.startMin)} to ${clock(end)}`,
    `${task.planMinutes} minutes`,
    task.category.name,
    block.conflict ? "conflict" : null,
    task.done ? "done" : null,
  ]
    .filter(Boolean)
    .join(", ");

  // A conflict border (error) must not lose to the tint border in the cascade, so drop that one.
  const tint = tintFor(task.category.color)
    .split(" ")
    .filter((c) => !(block.conflict && c.startsWith("border-")))
    .join(" ");
  const border = block.conflict
    ? "border-2 border-error"
    : "border";

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={label}
      data-testid="calendar-block"
      data-conflict={block.conflict ? "true" : undefined}
      {...moveAttrs(move, task.id)}
      className={`absolute overflow-hidden rounded-sm px-2 py-0.5 ${border} ${tint} ${focusClass} ${moveClass(move)} ${
        task.done ? "opacity-50" : ""
      }`}
      style={{
        top: minutePx(block.startMin),
        // A floor so a 5-25 minute (or clipped) block still shows its caption.
        height: `max(1.5rem, ${minutePx(block.lengthMin)})`,
        left: `calc(${block.lane} * 100% / ${block.lanes} + 1px)`,
        width: `calc(100% / ${block.lanes} - 2px)`,
        ...liftStyle(move),
      }}
    >
      <div className={short ? "flex items-baseline gap-2" : "flex flex-col"}>
        <p
          className={`min-w-0 text-body-sm font-semibold ${roomy ? "line-clamp-2 break-words" : "truncate"} ${
            block.continued ? "text-foreground-secondary" : "text-foreground"
          }`}
        >
          {task.title}
        </p>
        {block.continued ? (
          <p className="shrink-0 text-caption text-foreground-secondary">continues, {block.lengthMin} min</p>
        ) : (
          <p className="shrink-0 font-mono text-caption text-foreground-secondary">{task.planMinutes} min</p>
        )}
        {block.conflict ? (
          <p className="shrink-0 text-caption font-semibold text-foreground">Conflict</p>
        ) : null}
      </div>
    </div>
  );
}

/** A timeless Task in its day tray (`rounded.full` tint chip). */
export function TrayChip({ task, move }: { task: WeekTaskSummary; move?: MoveProps }) {
  const label = [
    task.title,
    formatDay(task.localDay),
    "no start time",
    `${task.planMinutes} minutes`,
    task.category.name,
    task.done ? "done" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={label}
      data-testid="calendar-chip"
      {...moveAttrs(move, task.id)}
      style={liftStyle(move)}
      className={`flex max-w-48 shrink-0 items-baseline gap-2 rounded-full border px-3 py-0.5 sm:max-w-full ${tintFor(task.category.color)} ${focusClass} ${moveClass(move)} ${
        task.done ? "opacity-50" : ""
      }`}
    >
      <span className="min-w-0 truncate text-caption font-medium text-foreground">{task.title}</span>
      <span className="shrink-0 font-mono text-caption text-foreground-secondary">
        {task.planMinutes} min
      </span>
    </div>
  );
}
