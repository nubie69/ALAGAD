const MAX_ORGANIZATIONAL_CHART_BYTES = 5 * 1024 * 1024;
const ALLOWED_ORGANIZATIONAL_CHART_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
]);

class OrganizationalChartValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const validateOrganizationalChart = ({ data, fileName, mimeType } = {}) => {
  const normalizedData = String(data || '');
  const normalizedMimeType = String(mimeType || '').toLowerCase().trim();
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedData || !normalizedFileName || !normalizedMimeType) {
    throw new OrganizationalChartValidationError('Chart data, file name, and file type are required.');
  }
  if (!ALLOWED_ORGANIZATIONAL_CHART_TYPES.has(normalizedMimeType)) {
    throw new OrganizationalChartValidationError('Only PNG, JPG/JPEG, and PDF organizational charts are supported.');
  }

  const prefix = `data:${normalizedMimeType};base64,`;
  if (!normalizedData.startsWith(prefix)) {
    throw new OrganizationalChartValidationError('The uploaded organizational chart is not a valid data file.');
  }

  const base64Payload = normalizedData.slice(prefix.length);
  const byteLength = Buffer.from(base64Payload, 'base64').length;
  if (!byteLength || byteLength > MAX_ORGANIZATIONAL_CHART_BYTES) {
    throw new OrganizationalChartValidationError('Organizational chart files must be 5 MB or smaller.');
  }

  return {
    data: normalizedData,
    fileName: normalizedFileName.slice(0, 255),
    mimeType: normalizedMimeType,
    updatedAt: new Date(),
  };
};

module.exports = {
  OrganizationalChartValidationError,
  validateOrganizationalChart,
};
