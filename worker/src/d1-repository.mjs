export function createD1Repository(db) {
  if (!db?.prepare) throw new Error('D1 database binding is required.');
  return {
    async putOAuthState({ value, installIdHash, expiresAt }) {
      await db.prepare('INSERT INTO oauth_states (value, install_id_hash, expires_at, consumed_at) VALUES (?, ?, ?, NULL)').bind(value, installIdHash, expiresAt).run();
    },
    async deleteExpiredOAuthStates(now) {
      await db.prepare('DELETE FROM oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(now).run();
    },
    async consumeOAuthState(value, now) {
      return db.prepare('UPDATE oauth_states SET consumed_at = ? WHERE value = ? AND consumed_at IS NULL AND expires_at > ? RETURNING value, install_id_hash AS installIdHash, expires_at AS expiresAt').bind(now, value, now).first();
    },
    async saveConnection({ installIdHash, accessEnvelope, refreshEnvelope, workspaceId, workspaceName, now }) {
      await db.prepare(`INSERT INTO connections (install_id_hash, access_envelope, refresh_envelope, workspace_id, workspace_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(install_id_hash) DO UPDATE SET access_envelope = excluded.access_envelope, refresh_envelope = excluded.refresh_envelope, workspace_id = excluded.workspace_id, workspace_name = excluded.workspace_name, updated_at = excluded.updated_at`)
        .bind(installIdHash, JSON.stringify(accessEnvelope), refreshEnvelope ? JSON.stringify(refreshEnvelope) : null, workspaceId, workspaceName, now).run();
    },
    async getConnection(installIdHash) {
      return db.prepare('SELECT workspace_id AS workspaceId, workspace_name AS workspaceName, updated_at AS updatedAt FROM connections WHERE install_id_hash = ?').bind(installIdHash).first();
    },
    async getTokenConnection(installIdHash) {
      return db.prepare('SELECT access_envelope AS accessEnvelope, workspace_id AS workspaceId, workspace_name AS workspaceName FROM connections WHERE install_id_hash = ?').bind(installIdHash).first();
    },
    async deleteConnection(installIdHash) {
      await db.prepare('DELETE FROM connections WHERE install_id_hash = ?').bind(installIdHash).run();
    }
  };
}
