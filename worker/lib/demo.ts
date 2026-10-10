// Spazio demo (Task 13): l'isolamento non si regge solo sull'assenza delle chiavi. Ogni punto che manda qualcosa
// fuori (push, Telegram, Resend, Claude, Meta, Foglio) controlla anche questo, così una chiave incollata per
// sbaglio nella demo non fa partire niente.
export const eDemo = (env: { SPAZIO?: string }) => env.SPAZIO === "demo";
export const NIENTE_IN_DEMO = "Spazio demo: niente invii verso l'esterno";
