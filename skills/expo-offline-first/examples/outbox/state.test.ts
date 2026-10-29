/** Runs with `bun test` (or jest with ts-jest / babel). No React Native needed: state.ts is pure. */
import { describe, expect, test } from "bun:test";
import {
  MAX_AUTO_ATTEMPTS,
  classifyError,
  manualRetry,
  markDone,
  markFailure,
  nextWakeAt,
  pickNext,
  recoverInterrupted,
  startSending,
  type OutboxJobState,
} from "./state";

const noJitter = () => 0.5; // backoff * 1.0

function job(overrides: Partial<OutboxJobState> = {}): OutboxJobState {
  return { status: "pending", attempts: 0, lastErrorCode: null, nextAttemptAt: null, createdAt: 0, updatedAt: 0, ...overrides };
}

describe("outbox state machine", () => {
  test("transient failure goes back to pending with backoff", () => {
    const sent = startSending(job(), 1_000);
    expect(sent.status).toBe("sending");
    expect(sent.attempts).toBe(1);
    const failed = markFailure(sent, "network", 1_000, noJitter);
    expect(failed.status).toBe("pending");
    expect(failed.nextAttemptAt).toBe(3_000);
  });

  test("transient failure fails after MAX_AUTO_ATTEMPTS", () => {
    const sent = job({ status: "sending", attempts: MAX_AUTO_ATTEMPTS });
    expect(markFailure(sent, "server", 0).status).toBe("failed");
  });

  test("rate limit and auth are never retried automatically", () => {
    const sent = startSending(job(), 0);
    expect(markFailure(sent, "rate_limited", 0).status).toBe("failed");
    expect(markFailure(sent, "auth", 0).status).toBe("failed");
  });

  test("manual retry resets the attempt budget", () => {
    const failed = job({ status: "failed", attempts: 3, lastErrorCode: "server" });
    const retried = manualRetry(failed, 5);
    expect(retried).toMatchObject({ status: "pending", attempts: 0, lastErrorCode: null });
    expect(manualRetry(job(), 5).status).toBe("pending"); // no-op on non-failed
  });

  test("interrupted job is resent only when the server is idempotent", () => {
    const sending = job({ status: "sending", attempts: 1 });
    expect(recoverInterrupted(sending, 0, { serverIsIdempotent: true }).status).toBe("pending");
    expect(recoverInterrupted(sending, 0, { serverIsIdempotent: false })).toMatchObject({
      status: "failed",
      lastErrorCode: "interrupted",
    });
  });

  test("pickNext is single-flight and oldest first", () => {
    const a = job({ createdAt: 2 });
    const b = job({ createdAt: 1 });
    expect(pickNext([a, b], 0)).toBe(b);
    expect(pickNext([a, job({ status: "sending" })], 0)).toBeUndefined();
    expect(pickNext([job({ nextAttemptAt: 100 })], 50)).toBeUndefined();
    expect(nextWakeAt([job({ nextAttemptAt: 100 }), job({ nextAttemptAt: 40 })])).toBe(40);
  });

  test("done clears errors", () => {
    expect(markDone(job({ lastErrorCode: "network" }), 1)).toMatchObject({ status: "done", lastErrorCode: null });
  });

  test("classifyError", () => {
    expect(classifyError(new TypeError("Network request failed"))).toBe("network");
    expect(classifyError({ status: 429 })).toBe("rate_limited");
    expect(classifyError({ status: 503 })).toBe("unavailable");
    expect(classifyError({ status: 422 })).toBe("rejected");
  });
});
