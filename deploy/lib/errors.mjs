const redactionSecrets = new Set();

export function registerRedactionSecret(value) {
  if (typeof value === 'string' && value) {
    redactionSecrets.add(value);
  }
}

export function redactText(value) {
  const text = String(value);
  let redacted = text;
  for (const secret of redactionSecrets) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}

export class DeployError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DeployError';
    this.code = code;
    this.details = details;
  }
}
