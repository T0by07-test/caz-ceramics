import { describe, expect, it } from "vitest";
import { matchesAnySearch, matchesSearch, normalizeForSearch } from "./search";

describe("normalizeForSearch", () => {
  it("quita acentos y mayúsculas", () => {
    expect(normalizeForSearch("María Soneira")).toBe("maria soneira");
    expect(normalizeForSearch("PILAR SORIANO")).toBe("pilar soriano");
    expect(normalizeForSearch("  Belén   Reyero ")).toBe("belen reyero");
    expect(normalizeForSearch(null)).toBe("");
  });
});

describe("matchesSearch", () => {
  it("encuentra un nombre escrito sin tilde", () => {
    expect(matchesSearch("María Soneira", "maria")).toBe(true);
    expect(matchesSearch("Paz García", "garcia")).toBe(true);
    expect(matchesSearch("Cris Milher", "MILHER")).toBe(true);
  });

  it("encuentra por el apellido", () => {
    expect(matchesSearch("Camila Petrone", "petrone")).toBe(true);
  });

  it("no encuentra a otra alumna", () => {
    expect(matchesSearch("Camila Petrone", "paz")).toBe(false);
  });

  it("una búsqueda vacía no filtra nada", () => {
    expect(matchesSearch("Camila Petrone", "")).toBe(true);
    expect(matchesSearch("Camila Petrone", "   ")).toBe(true);
    expect(matchesSearch(null, "paz")).toBe(false);
  });
});

describe("matchesAnySearch", () => {
  it("busca en cualquiera de los campos", () => {
    expect(matchesAnySearch(["Paz García", null, "pago a mano"], "a mano")).toBe(true);
    expect(matchesAnySearch(["Paz García", "notas"], "garcia")).toBe(true);
    expect(matchesAnySearch(["Paz García", "notas"], "medina")).toBe(false);
  });

  it("una búsqueda vacía coincide con todo", () => {
    expect(matchesAnySearch([null], "")).toBe(true);
  });
});
