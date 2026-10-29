/**
 * Example `send` for <OutboxProvider>: multipart upload with an Idempotency-Key.
 * Throw an error carrying `status` for HTTP failures so classifyError() can tell 429 from 503.
 */
import type { SendJob } from "./OutboxProvider";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const sendJob: SendJob = async (job, { idempotencyKey, attachment }) => {
  const body = new FormData();
  body.append("payload", JSON.stringify(job.payload));
  if (attachment) {
    // React Native's FormData file part: { uri, name, type }. (expo-file-system's File also
    // implements Blob in SDK 54+, but this form works with every RN networking stack.)
    body.append("file", {
      uri: attachment.uri,
      name: attachment.name,
      type: attachment.type || "application/octet-stream",
    } as unknown as Blob);
  }

  const response = await fetch(`${API_URL}/api/jobs/${job.kind}`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body,
  });
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
};
