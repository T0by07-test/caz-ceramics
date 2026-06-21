import { monthGridRange } from "@/lib/calendar";
import { useClassesInRange } from "./useClassesInRange";

export type { ClassRow, ClassWithCount } from "./useClassesInRange";

/** Back-compat wrapper: classes for the visible month grid. */
export function useMonthClasses(referenceMonth: Date, mode: "student" | "admin") {
  return useClassesInRange(monthGridRange(referenceMonth), mode);
}
