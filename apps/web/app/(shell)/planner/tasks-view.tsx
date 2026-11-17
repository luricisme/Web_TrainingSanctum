"use client";

import { useState } from "react";
import { SectionMarker } from "@/app/components/section-marker";
import { buttonSecondary } from "@/app/components/ui";
import { CategoriesModal } from "./categories-modal";

/**
 * Planner -> Tasks body. Story 8.2 ships the header row and the Categories
 * modal; the day's Tasks arrive in Story 8.3.
 */
export function TasksView() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="planner-tasks">
      <div className="flex items-center justify-between gap-4">
        <SectionMarker as="h2" id="planner-tasks">
          Tasks
        </SectionMarker>
        <button type="button" onClick={() => setOpen(true)} className={buttonSecondary}>
          Categories
        </button>
      </div>
      {open ? <CategoriesModal onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
