import { describe, expect, it } from "vitest";
import { RPC_ERROR, rpcErrorCode, rpcErrorMessage } from "../rpc-errors";

const MESSAGES = { [RPC_ERROR.INSUFFICIENT_BALANCE]: "Sin saldo." };

describe("rpcErrorCode", () => {
  it("reads the SQLSTATE of a Supabase error object", () => {
    expect(rpcErrorCode({ code: "CT003", message: "x" })).toBe("CT003");
  });

  it("returns null for anything without a string code", () => {
    expect(rpcErrorCode(new Error("boom"))).toBeNull();
    expect(rpcErrorCode({ code: 42 })).toBeNull();
    expect(rpcErrorCode(null)).toBeNull();
    expect(rpcErrorCode("CT003")).toBeNull();
  });
});

describe("rpcErrorMessage", () => {
  it("maps a known code to its Spanish message", () => {
    expect(rpcErrorMessage({ code: "CT003" }, MESSAGES, "fallback")).toBe("Sin saldo.");
  });

  it("ignores the English message text: only the code counts", () => {
    const misleading = { code: "CT003", message: "Not authenticated" };
    expect(rpcErrorMessage(misleading, MESSAGES, "fallback")).toBe("Sin saldo.");
    expect(rpcErrorMessage({ code: "XX000", message: "Insufficient balance" }, MESSAGES, "fallback")).toBe("fallback");
  });

  it("falls back for unmapped codes and for errors that are not from an RPC", () => {
    expect(rpcErrorMessage({ code: "CT105" }, MESSAGES, "fallback")).toBe("fallback");
    expect(rpcErrorMessage(new Error("network down"), MESSAGES, "fallback")).toBe("fallback");
  });

  it("keeps every code unique", () => {
    const codes = Object.values(RPC_ERROR);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
