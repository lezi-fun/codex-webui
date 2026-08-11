import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LiveSessionStore, parseRollout } from "../live-session-service.js";

const line = (type: string, payload: any, timestamp = "2026-08-11T06:26:25.000Z") => JSON.stringify({ timestamp, type, payload }) + "\n";

describe("Desktop-style live session reader", () => {
  test("reconstructs an active CLI command and its available output", () => {
    const input = [
      line("event_msg", { type: "task_started", turn_id: "turn-1", started_at: 10 }),
      line("response_item", { type: "message", id: "msg-1", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Running now." }] }),
      line("response_item", { type: "custom_tool_call", id: "tool-1", call_id: "call-1", name: "exec", input: 'const r = await tools.exec_command({cmd:"for i in 1 2; do echo $i; done",workdir:"/tmp"}); text(r);' }),
      line("response_item", { type: "custom_tool_call_output", call_id: "call-1", output: "Script running with cell ID 5\nWall time 11.1 seconds\nOutput:\n1\n" }),
    ].join("");
    const state = parseRollout(input);
    expect(state.active).toBe(true);
    expect(state.turn.status).toBe("inProgress");
    expect(state.turn.items[0]).toMatchObject({ type: "agentMessage", text: "Running now.", phase: "commentary" });
    expect(state.turn.items[1]).toMatchObject({ type: "commandExecution", command: "for i in 1 2; do echo $i; done", status: "inProgress", aggregatedOutput: "1\n" });
  });

  test("increments without rereading history and stops exposing a completed turn", () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-live-session-"));
    const path = join(directory, "rollout.jsonl");
    const store = new LiveSessionStore();
    try {
      writeFileSync(path, line("event_msg", { type: "task_started", turn_id: "turn-2", started_at: 20 }) + line("response_item", { type: "custom_tool_call", id: "tool-2", call_id: "call-2", name: "exec", input: 'const r=await tools.exec_command({cmd:"bun test"}); text(r);' }));
      expect(store.read(path).turn.items[0]).toMatchObject({ command: "bun test", status: "inProgress" });
      appendFileSync(path, line("response_item", { type: "custom_tool_call_output", call_id: "call-2", output: [{ type: "input_text", text: "Script completed\nWall time 1.0 seconds\nOutput:\n" }, { type: "input_text", text: '{"exit_code":0,"output":"2 pass\\n"}' }] }));
      expect(store.read(path).turn.items[0]).toMatchObject({ status: "completed", aggregatedOutput: "2 pass\n", exitCode: 0 });
      appendFileSync(path, line("event_msg", { type: "task_complete", turn_id: "turn-2", completed_at: 22 }));
      expect(store.read(path)).toMatchObject({ active: false, turn: null });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
