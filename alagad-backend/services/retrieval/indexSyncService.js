const { sharedVectorIndexManager } = require('./vectorIndexManager');
const { logAlert, logAudit } = require('./auditLogger');

const ensureSyncSuccess = (result, operation, type, recordId) => {
  if (result && result.success === true) return result;
  const fallbackMessage = `Vector ${operation} did not report success.`;
  const message = String(result?.error || result?.message || fallbackMessage);
  const error = new Error(message);
  error.operation = operation;
  error.type = type;
  error.recordId = String(recordId || '');
  throw error;
};

const syncRecordIndexByType = async (type, recordId) => {
  try {
    const result = await sharedVectorIndexManager.upsertRecordByType(type, recordId);
    return ensureSyncSuccess(result, 'upsert', type, recordId);
  } catch (error) {
    try {
      // Fallback: ensure the record becomes searchable even when incremental upsert fails.
      const state = await sharedVectorIndexManager.rebuildFromDatabase();
      logAudit({
        event: 'vector_upsert_record_recovered',
        record_id: String(recordId || ''),
        type,
        vector_count: Number(state?.vectorCount || 0),
        canonical_count: Array.isArray(state?.canonicalDocuments) ? state.canonicalDocuments.length : 0,
        success: true,
        recovery: 'full_rebuild',
      });

      return {
        success: true,
        type,
        recordId: String(recordId || ''),
        recoveredBy: 'full_rebuild',
      };
    } catch (rebuildError) {
      logAudit({
        event: 'vector_upsert_record',
        record_id: String(recordId || ''),
        type,
        chunk_count: 0,
        vector_ids: [],
        success: false,
        message: error.message,
        recovery_message: rebuildError.message,
      });

      logAlert({
        alert_type: 'vector_upsert_failure',
        type,
        record_id: String(recordId || ''),
        message: error.message,
        recovery_message: rebuildError.message,
        stack: rebuildError.stack || error.stack,
      });

      throw rebuildError;
    }
  }
};

const syncRecordDeactivationByType = async (type, recordId, deactivated = true) => {
  try {
    const result = await sharedVectorIndexManager.markRecordDeactivated(type, recordId, deactivated);
    return ensureSyncSuccess(result, 'deactivation_sync', type, recordId);
  } catch (error) {
    logAudit({
      event: 'vector_mark_deactivated',
      record_id: String(recordId || ''),
      type,
      affected_vectors: 0,
      deactivated: Boolean(deactivated),
      success: false,
      message: error.message,
    });

    logAlert({
      alert_type: 'vector_deactivation_sync_failure',
      type,
      record_id: String(recordId || ''),
      message: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

module.exports = {
  syncRecordIndexByType,
  syncRecordDeactivationByType,
};
