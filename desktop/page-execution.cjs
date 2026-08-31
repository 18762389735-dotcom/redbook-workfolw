function sanitizeDiagnosticText(value) {
  return String(value == null ? 'Unknown error' : value)
    // A page error can include a note/profile URL whose query string contains
    // xsec_token. Keep diagnostics useful without persisting page URLs.
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
    .replace(/\b(xsec_token|access_token|refresh_token|token)\s*=\s*[^\s&"'<>]+/gi, '$1=[REDACTED]')
    .replace(/\b(authorization|cookie)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED]')
    .slice(0, 1000);
}

function buildPageExecutionScript(functionValue, args = []) {
  const serializedArgs = args.map((value) => JSON.stringify(value)).join(',');
  return `(async () => {
    try {
      const targetFunction = (${functionValue.toString()});
      const value = await targetFunction(${serializedArgs});
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: typeof error?.name === 'string' ? error.name : 'Error',
          message: typeof error?.message === 'string' ? error.message : String(error)
        }
      };
    }
  })()`;
}

function diagnosticError(label, stage, error) {
  const safeLabel = sanitizeDiagnosticText(label || 'page').replace(/[^a-z0-9-]/gi, '-');
  const name = sanitizeDiagnosticText(error?.name || 'Error');
  const message = sanitizeDiagnosticText(error?.message || error || 'Unknown error');
  const result = new Error(`Page script failed [${safeLabel}/${stage}]: ${name}: ${message}`);
  result.stage = stage;
  result.label = safeLabel;
  return result;
}

async function executePageFunction(contents, functionValue, args = [], label = 'page') {
  let envelope;
  try {
    envelope = await contents.executeJavaScript(buildPageExecutionScript(functionValue, args), true);
  } catch (error) {
    throw diagnosticError(label, 'electron-execute', error);
  }
  if (envelope?.ok === true) return envelope.value;
  throw diagnosticError(label, 'page-function', envelope?.error || new Error('Page execution did not return a diagnostic envelope'));
}

module.exports = { buildPageExecutionScript, executePageFunction, sanitizeDiagnosticText };
