const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Costruisce l'SQL (una istruzione per riga) per creare o aggiornare un utente.
// Va scritto in un file e passato a wrangler con --file: nessuna shell tocca il contenuto.
export function buildUserSql(username: string, name: string, hash: string, now = Date.now()): string {
  const id = username.trim().toLowerCase();
  return [
    `INSERT INTO users (id, username, name, password_hash, active, failed_logins, created_at) VALUES (${q(id)}, ${q(id)}, ${q(name)}, ${q(hash)}, 1, 0, ${now}) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name, active = 1, failed_logins = 0, locked_until = NULL;`,
    `DELETE FROM sessions WHERE user_id = ${q(id)};`,
    "",
  ].join("\n");
}
