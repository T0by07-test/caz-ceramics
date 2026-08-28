import { describe, expect, it } from "vitest";
import { compareMembers } from "./members-sort";

type TestMember = {
  name: string | null;
  surname: string | null;
  email: string | null;
  estado: string;
  plan_name: string | null;
  pending_makeups: number;
};

const base: TestMember = {
  name: null,
  surname: null,
  email: null,
  estado: "activa",
  plan_name: null,
  pending_makeups: 0,
};

describe("compareMembers", () => {
  it("sorts by name ascending, case-insensitively", () => {
    const a = { ...base, name: "beto" };
    const b = { ...base, name: "Ana" };
    expect(compareMembers(a, b, "name", "asc")).toBeGreaterThan(0);
    expect(compareMembers(a, b, "name", "desc")).toBeLessThan(0);
  });

  it("falls back to email when name/surname are both null", () => {
    const a = { ...base, email: "zzz@x.com" };
    const b = { ...base, email: "aaa@x.com" };
    expect(compareMembers(a, b, "name", "asc")).toBeGreaterThan(0);
  });

  it("sorts by pending_makeups numerically", () => {
    const a = { ...base, pending_makeups: 2 };
    const b = { ...base, pending_makeups: 10 };
    expect(compareMembers(a, b, "recup", "asc")).toBeLessThan(0);
  });

  it("sorts by plan_name, nulls last regardless of direction", () => {
    const a: TestMember = { ...base, plan_name: null };
    const b: TestMember = { ...base, plan_name: "Plan 4 clases" };
    expect(compareMembers(a, b, "plan", "asc")).toBeGreaterThan(0);
    expect(compareMembers(a, b, "plan", "desc")).toBeGreaterThan(0);
  });

  it("sorts by estado using the domain order activa > pausada > sin_actividad > inactiva", () => {
    const activa = { ...base, estado: "activa" };
    const inactiva = { ...base, estado: "inactiva" };
    expect(compareMembers(activa, inactiva, "estado", "asc")).toBeLessThan(0);
  });
});
