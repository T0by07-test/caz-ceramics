export type MemberSortKey = "name" | "estado" | "plan" | "recup" | "reservas";
export type MemberSortDir = "asc" | "desc";

type Sortable = {
  name: string | null;
  surname: string | null;
  email: string | null;
  estado: string;
  plan_name: string | null;
  pending_makeups: number;
  month_classes?: unknown[];
};

const ESTADO_ORDER: Record<string, number> = {
  activa: 0,
  pausada: 1,
  sin_actividad: 2,
  inactiva: 3,
};

function nameOf(r: Sortable): string {
  return [r.name, r.surname].filter(Boolean).join(" ").trim() || r.email || "";
}

function applyDir(n: number, dir: MemberSortDir): number {
  return dir === "asc" ? n : -n;
}

export function compareMembers<T extends Sortable>(
  a: T,
  b: T,
  key: MemberSortKey,
  dir: MemberSortDir,
): number {
  switch (key) {
    case "name":
      return applyDir(nameOf(a).localeCompare(nameOf(b), "es", { sensitivity: "base" }), dir);
    case "recup":
      return applyDir(a.pending_makeups - b.pending_makeups, dir);
    case "plan": {
      if (a.plan_name === null && b.plan_name === null) return 0;
      if (a.plan_name === null) return 1;
      if (b.plan_name === null) return -1;
      return applyDir(a.plan_name.localeCompare(b.plan_name, "es"), dir);
    }
    case "estado":
      return applyDir((ESTADO_ORDER[a.estado] ?? 99) - (ESTADO_ORDER[b.estado] ?? 99), dir);
    default:
      return 0;
  }
}
