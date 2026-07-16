const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const AUDIT_LOG = path.join(LOG_DIR, 'retrieval-audit.log');
const ALERT_LOG = path.join(LOG_DIR, 'retrieval-alerts.log');

const ensureLogDirectory = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const appendJsonLine = (filePath, payload) => {
  ensureLogDirectory();
  const entry = {
    timestamp: new Date().toISOString(),
    ...payload,
  };
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
};

const logAudit = (payload) => {
  appendJsonLine(AUDIT_LOG, payload);
};

const logAlert = (payload) => {
  appendJsonLine(ALERT_LOG, payload);
};

module.exports = {
  AUDIT_LOG,
  ALERT_LOG,
  logAudit,
  logAlert,
};
