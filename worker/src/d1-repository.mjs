export function createD1Repository(db) {
  if (!db?.prepare) throw new Error('D1 database binding is required.');
  return {
    async putOAuthState({ value, installIdHash, expiresAt }) {
      await db.prepare('INSERT INTO oauth_states (value, install_id_hash, expires_at) VALUES (?, ?, ?)').bind(value, installIdHash, expiresAt).run();
    },
    async deleteExpiredOAuthStates(now) {
      await db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now).run();
    },
    async consumeOAuthState(value, now) {
      return db.prepare('DELETE FROM oauth_states WHERE value = ? AND expires_at > ? RETURNING value, install_id_hash AS installIdHash, expires_at AS expiresAt').bind(value, now).first();
    },
    async saveConnection({ installIdHash, accessEnvelope, refreshEnvelope, now }) {
      await db.prepare(`INSERT INTO connections (install_id_hash, access_envelope, refresh_envelope, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(install_id_hash) DO UPDATE SET access_envelope = excluded.access_envelope, refresh_envelope = excluded.refresh_envelope, updated_at = excluded.updated_at`)
        .bind(installIdHash, JSON.stringify(accessEnvelope), refreshEnvelope ? JSON.stringify(refreshEnvelope) : null, now).run();
    },
    async getConnection(installIdHash) {
      return db.prepare('SELECT updated_at AS updatedAt FROM connections WHERE install_id_hash = ?').bind(installIdHash).first();
    },
    async getTokenConnection(installIdHash) {
      return db.prepare('SELECT access_envelope AS accessEnvelope FROM connections WHERE install_id_hash = ?').bind(installIdHash).first();
    },
    async deleteConnection(installIdHash) {
      await db.prepare('DELETE FROM connections WHERE install_id_hash = ?').bind(installIdHash).run();
    }
  };
}
