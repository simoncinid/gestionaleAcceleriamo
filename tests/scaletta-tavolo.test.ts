import { describe, expect, it } from "vitest";
import { COLONNA_MAX, misuraColonne } from "../src/pagine/commerciale/tavolo";

// Vista a colonne sul computer: solo colonne intere, larghe abbastanza da leggere le card.
describe("misuraColonne", () => {
  it("su 1670 px utili entrano 5 colonne intere", () => {
    const { visibili, colonna } = misuraColonne(1670, 8);
    expect(visibili).toBe(5);
    expect(colonna * 5 + 16 * 4).toBeLessThanOrEqual(1670);
    expect(colonna).toBeGreaterThanOrEqual(280);
  });
  it("su 1120 px ne entrano 3", () => {
    expect(misuraColonne(1120, 8).visibili).toBe(3);
  });
  it("con poche fasi le colonne si allargano ma non oltre il massimo", () => {
    expect(misuraColonne(1670, 2).colonna).toBe(COLONNA_MAX);
  });
  it("area stretta o non ancora misurata: una colonna alla misura minima", () => {
    expect(misuraColonne(0, 8)).toEqual({ visibili: 1, colonna: 280 });
    expect(misuraColonne(200, 8).visibili).toBe(1);
  });
});
