import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { resetSession } from "../src/session";

it("resetSession notifica chi osserva me e svuota il resto", async () => {
  const qc = new QueryClient();
  const user = { id: "u", username: "u", name: "U" };
  qc.setQueryData(["me"], user);
  qc.setQueryData(["leads"], [1, 2]);
  const observer = new QueryObserver(qc, { queryKey: ["me"], queryFn: async () => user, staleTime: Infinity });
  let notified = 0;
  const unsub = observer.subscribe(() => notified++);
  resetSession(qc);
  expect(notified).toBeGreaterThan(0);
  expect(observer.getCurrentResult().data).toBeNull();
  expect(qc.getQueryData(["leads"])).toBeUndefined();
  unsub();
});
