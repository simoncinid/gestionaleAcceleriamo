// Piano gratuito: 50 query D1 e 50 sottorichieste per invocazione. Il giro si tiene un margine
// (spec 16: sotto il 30% di ogni limite nel giorno, e mai sopra il tetto nel singolo giro).
export const QUERY_GIRO = 45;
export const SOTTORICHIESTE_GIRO = 15;

export type Contatore = { query: number };

const REALE = Symbol("statement reale");
const ESEGUE = new Set(["first", "all", "run", "raw"]);

function statementContato(s: D1PreparedStatement, c: Contatore): D1PreparedStatement {
  return new Proxy(s, {
    get(t, p) {
      if (p === REALE) return t;
      if (p === "bind") return (...valori: unknown[]) => statementContato(t.bind(...valori), c);
      if (typeof p === "string" && ESEGUE.has(p)) {
        return (...a: unknown[]) => {
          c.query += 1;
          return (t as unknown as Record<string, (...x: unknown[]) => unknown>)[p](...a);
        };
      }
      const v = Reflect.get(t, p);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

function reale(s: D1PreparedStatement): D1PreparedStatement {
  return (s as unknown as Record<symbol, D1PreparedStatement>)[REALE] ?? s;
}

// Involucro di D1 che conta le query vere: ogni first/all/run/raw vale 1, una batch vale quanti statement contiene.
export function contaD1(db: D1Database, c: Contatore): D1Database {
  return new Proxy(db, {
    get(t, p) {
      if (p === "prepare") return (q: string) => statementContato(t.prepare(q), c);
      if (p === "batch") {
        return (stmts: D1PreparedStatement[]) => {
          c.query += stmts.length;
          return t.batch(stmts.map(reale));
        };
      }
      if (p === "exec") return (q: string) => { c.query += 1; return t.exec(q); };
      const v = Reflect.get(t, p);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}
