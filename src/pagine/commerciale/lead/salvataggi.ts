// Salvataggi della scheda: chi salva passa le opzioni di useMutation, così il chiamante agisce solo se il server accetta.
export type OpzioniSalva = { onSuccess?: () => void };
export type Salva = (corpo: Record<string, unknown>, opzioni?: OpzioniSalva) => void;

// Salva e, solo se riesce, esegue `dopo` (chiudere l'editor, rimontare il modulo). Se fallisce non succede nulla: i dati scritti restano.
export const poiSeRiesce = (salva: Salva, dopo: () => void) => (corpo: Record<string, unknown>) => salva(corpo, { onSuccess: dopo });
