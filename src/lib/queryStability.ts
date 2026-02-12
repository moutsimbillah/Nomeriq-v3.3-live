type MaybeError = unknown;

const toErrorMessage = (error: MaybeError): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    const message = typeof anyError.message === "string" ? anyError.message : "";
    const details = typeof anyError.details === "string" ? anyError.details : "";
    return `${message} ${details}`.trim();
  }
  return "";
};

export const isAbortLikeError = (error: MaybeError): boolean => {
  const msg = toErrorMessage(error).toLowerCase();
  return msg.includes("aborterror") || msg.includes("signal is aborted");
};

export const is503LikeError = (error: MaybeError): boolean => {
  const anyError = (error ?? {}) as Record<string, unknown>;
  const status = anyError.status;
  const code = anyError.code;
  const msg = toErrorMessage(error).toLowerCase();

  return (
    status === 503 ||
    code === 503 ||
    code === "503" ||
    msg.includes(" 503") ||
    msg.includes("status of 503")
  );
};

export const isResourceExhaustionError = (error: MaybeError): boolean => {
  const msg = toErrorMessage(error).toLowerCase();
  return msg.includes("err_insufficient_resources");
};

export const shouldSuppressQueryErrorLog = (error: MaybeError): boolean => {
  return isAbortLikeError(error) || is503LikeError(error) || isResourceExhaustionError(error);
};
