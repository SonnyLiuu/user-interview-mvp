from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace

from app.services.realtime_bridge import NormalizedTurn, RealtimeBridge


class FakeWebSocket:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def send(self, payload: str) -> None:
        self.events.append(json.loads(payload))

    @property
    def response_create_count(self) -> int:
        return sum(1 for event in self.events if event.get("type") == "response.create")


async def wait_for(predicate, *, timeout: float = 0.5) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Timed out waiting for condition")


class RealtimeBridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_reval_response_waits_for_active_response_to_finish(self) -> None:
        session = SimpleNamespace(
            session_id="session-1",
            user_id="user-1",
            person_name="Taylor",
            status="active",
            realtime_status="connected",
            topics=[
                SimpleNamespace(
                    id="1",
                    category="goal",
                    checked=False,
                    manual_override=False,
                    label="Understand the current workaround",
                )
            ],
            transcript_turns=[
                SimpleNamespace(speaker="Founder", text=f"question {index}")
                for index in range(20)
            ],
        )
        bridge = RealtimeBridge(
            session,
            on_tool_call=lambda _name, _args: asyncio.sleep(0, result={}),
            on_status=lambda _status, _error: None,
        )
        fake_ws = FakeWebSocket()
        bridge._ws = fake_ws
        worker = asyncio.create_task(bridge._turn_worker())

        try:
            for index in range(9):
                await bridge._turn_queue.put(
                    NormalizedTurn("test", "Founder", f"turn {index}")
                )
                await wait_for(lambda expected=index + 1: fake_ws.response_create_count == expected)
                bridge._response_done.set()

            await bridge._turn_queue.put(NormalizedTurn("test", "Founder", "turn 9"))
            await wait_for(lambda: fake_ws.response_create_count == 10)
            await asyncio.sleep(0.05)
            self.assertEqual(fake_ws.response_create_count, 10)

            bridge._response_done.set()
            await wait_for(lambda: fake_ws.response_create_count == 11)
            reval_message = fake_ws.events[-2]
            self.assertEqual(reval_message["type"], "conversation.item.create")
            self.assertIn(
                "CONTEXT REFRESH",
                reval_message["item"]["content"][0]["text"],
            )
        finally:
            worker.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await worker

    async def test_error_event_unblocks_response_waiter(self) -> None:
        session = SimpleNamespace(session_id="session-1", user_id="user-1")
        errors: list[str | None] = []
        bridge = RealtimeBridge(
            session,
            on_tool_call=lambda _name, _args: asyncio.sleep(0, result={}),
            on_status=lambda _status, error: errors.append(error),
        )
        bridge._response_done.clear()

        await bridge._handle_event(
            {"type": "error", "error": {"message": "active response in progress"}}
        )

        self.assertTrue(bridge._response_done.is_set())
        self.assertEqual(errors, ["active response in progress"])


if __name__ == "__main__":
    unittest.main()
