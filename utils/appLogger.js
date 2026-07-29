function write(level, event, details = {}) {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeDetails
  });
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger(payload);
}

module.exports = {
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details)
};
