type LogLevel = "info" | "warn" | "error";

function toErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return { message: "Unknown error", raw: String(error) };
}

function log(level: LogLevel, event: string, context?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (event: string, context?: Record<string, unknown>) => log("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => log("warn", event, context),
  error: (event: string, error: unknown, context?: Record<string, unknown>) =>
    log("error", event, { ...context, error: toErrorPayload(error) })
};
