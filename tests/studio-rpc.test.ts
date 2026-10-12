import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { RpcConnection } from "../src/studio/rpc.js";

describe("Codex JSON-RPC transport", () => {
  it("handles split lines, interleaved notifications and out-of-order replies", async () => {
    const incoming = new PassThrough();

    const outgoing = new PassThrough();

    const rpc = new RpcConnection(incoming, outgoing);

    const seen: string[] = [];

    rpc.onNotification = method => seen.push(method);

    const a = rpc.request("first", {});

    const b = rpc.request("second", {});

    incoming.write("{\"id\":2,\"result\":{\"value\":\"b\"}}\n{\"method\":\"item/agent");

    incoming.write("Message/delta\",\"params\":{\"delta\":\"你\"}}\n{\"id\":1,\"result\":{\"value\":\"a\"}}\n");

    expect(await a).toEqual({ value: "a" });

    expect(await b).toEqual({ value: "b" });

    expect(seen).toEqual(["item/agentMessage/delta"]);

    rpc.close();
  });

  it("rejects pending operations when the subprocess exits", async () => {
    const input = new PassThrough();

    const rpc = new RpcConnection(input, new PassThrough());

    const pending = rpc.request("turn/start", {});

    const expectation = expect(pending).rejects.toThrow(/关闭/);

    input.end();

    await expectation;
  });

  it("returns protocol errors and times out instead of hanging", async () => {
    const input = new PassThrough();

    const rpc = new RpcConnection(input, new PassThrough());

    const pending = rpc.request("unsupported", {});

    input.write("{\"id\":1,\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}\n");

    await expect(pending).rejects.toThrow("Method not found");

    await expect(rpc.request("missing", {}, 10)).rejects.toThrow(/超时/);

    rpc.close();
  });

  it("declines server approval requests and never executes arbitrary server methods", () => {
    const input = new PassThrough();

    const output = new PassThrough();

    let result = "";

    output.on("data", chunk => result += String(chunk));

    const rpc = new RpcConnection(input, output);

    input.write("{\"id\":99,\"method\":\"item/commandExecution/requestApproval\",\"params\":{}}\n");

    expect(JSON.parse(result).result.decision).toBe("cancel");

    rpc.close();
  });
});
