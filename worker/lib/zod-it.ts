// Messaggi di Zod in italiano per gli schemi che non ne hanno uno loro (revisione finale del Piano A).
// I messaggi scritti negli schemi (per esempio "Ora nel formato 22:00") vincono sempre su questa mappa.
import { z, ZodIssueCode } from "zod";

const campo = (path: (string | number)[]) => (path.length ? ` (${path.join(".")})` : "");

z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === "undefined" ? `Manca un dato obbligatorio${campo(issue.path)}` : `Tipo di valore non valido${campo(issue.path)}` };
    case ZodIssueCode.too_small:
      return { message: issue.type === "string" ? `Testo troppo corto${campo(issue.path)}` : `Valore troppo piccolo${campo(issue.path)}` };
    case ZodIssueCode.too_big:
      return { message: issue.type === "string" ? `Testo troppo lungo${campo(issue.path)}` : `Valore troppo grande${campo(issue.path)}` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Valore non previsto${campo(issue.path)}` };
    case ZodIssueCode.invalid_string:
      return { message: `Formato non valido${campo(issue.path)}` };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Campi non previsti: ${issue.keys.join(", ")}` };
    default:
      return { message: ctx.defaultError === "Required" ? "Manca un dato obbligatorio" : `Dato non valido${campo(issue.path)}` };
  }
});
