"""Verify OpenAI C2PA provenance embedded in Wave 2 PNG masters.

The built-in image generator writes a C2PA JUMBF store in the PNG ``caBX``
chunk.  This verifier intentionally reads the master itself, locates CBOR
assertions, and rejects any file whose created action does not identify
``softwareAgent`` as ``gpt-image`` version ``2.x``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any, Iterator


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class CborDecoder:
    def __init__(self, data: bytes):
        self.data = data
        self.offset = 0

    def read(self, count: int) -> bytes:
        end = self.offset + count
        if end > len(self.data):
            raise ValueError("truncated CBOR payload")
        value = self.data[self.offset:end]
        self.offset = end
        return value

    def length(self, additional: int) -> int:
        if additional < 24:
            return additional
        if additional == 24:
            return self.read(1)[0]
        if additional == 25:
            return struct.unpack(">H", self.read(2))[0]
        if additional == 26:
            return struct.unpack(">I", self.read(4))[0]
        if additional == 27:
            return struct.unpack(">Q", self.read(8))[0]
        raise ValueError(f"unsupported CBOR additional value {additional}")

    def decode(self) -> Any:
        head = self.read(1)[0]
        major, additional = head >> 5, head & 31
        if major == 0:
            return self.length(additional)
        if major == 1:
            return -1 - self.length(additional)
        if major == 2:
            return self.read(self.length(additional))
        if major == 3:
            return self.read(self.length(additional)).decode("utf-8")
        if major == 4:
            return [self.decode() for _ in range(self.length(additional))]
        if major == 5:
            return {self.decode(): self.decode() for _ in range(self.length(additional))}
        if major == 6:
            tag = self.length(additional)
            return {"_cbor_tag": tag, "value": self.decode()}
        if major == 7:
            if additional == 20:
                return False
            if additional == 21:
                return True
            if additional in (22, 23):
                return None
            if additional == 26:
                return struct.unpack(">f", self.read(4))[0]
            if additional == 27:
                return struct.unpack(">d", self.read(8))[0]
        raise ValueError(f"unsupported CBOR major={major} additional={additional}")


def png_chunks(data: bytes) -> Iterator[tuple[str, bytes]]:
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("not a PNG")
    offset = len(PNG_SIGNATURE)
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8].decode("latin1")
        start, end = offset + 8, offset + 8 + length
        if end + 4 > len(data):
            raise ValueError(f"truncated PNG chunk {kind}")
        yield kind, data[start:end]
        offset = end + 4
        if kind == "IEND":
            return


def bmff_boxes(data: bytes, depth: int = 0) -> Iterator[tuple[str, bytes]]:
    offset = 0
    while offset + 8 <= len(data):
        size = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8].decode("latin1")
        if size == 0:
            size = len(data) - offset
        if size < 8 or offset + size > len(data):
            break
        payload = data[offset + 8 : offset + size]
        yield kind, payload
        if kind == "jumb" and depth < 24:
            yield from bmff_boxes(payload, depth + 1)
        offset += size


def unwrap_tags(value: Any) -> Any:
    while isinstance(value, dict) and set(value) == {"_cbor_tag", "value"}:
        value = value["value"]
    if isinstance(value, list):
        return [unwrap_tags(item) for item in value]
    if isinstance(value, dict):
        return {key: unwrap_tags(item) for key, item in value.items()}
    return value


def find_software_agents(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        agent = value.get("softwareAgent")
        if isinstance(agent, dict):
            found.append(agent)
        for item in value.values():
            found.extend(find_software_agents(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(find_software_agents(item))
    return found


def verify(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    cabx = [payload for kind, payload in png_chunks(data) if kind == "caBX"]
    if not cabx:
        raise ValueError("missing PNG caBX C2PA chunk")
    decoded: list[Any] = []
    labels: list[str] = []
    for store in cabx:
        labels.extend(match.decode("ascii") for match in re.findall(rb"c2pa\.[a-z0-9_.-]+", store))
        for kind, payload in bmff_boxes(store):
            if kind != "cbor":
                continue
            try:
                decoder = CborDecoder(payload)
                decoded.append(unwrap_tags(decoder.decode()))
            except (UnicodeDecodeError, ValueError):
                continue
    agents: list[dict[str, Any]] = []
    for assertion in decoded:
        agents.extend(find_software_agents(assertion))
    accepted = [
        agent
        for agent in agents
        if agent.get("name") == "gpt-image" and re.fullmatch(r"2(?:\.\d+|\.x)", str(agent.get("version", "")))
    ]
    if not accepted:
        raise ValueError(f"softwareAgent is not gpt-image 2.x: {agents!r}")
    agent = accepted[0]
    return {
        "path": path.as_posix(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "c2paChunk": "caBX",
        "c2paChunkCount": len(cabx),
        "actionsAssertionPresent": "c2pa.actions.v2" in labels,
        "softwareAgent": {"name": agent["name"], "version": str(agent["version"])},
        "softwareAgentSummary": f"{agent['name']} {agent['version']}",
        "pass": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    results = [verify(path) for path in args.paths]
    report = {"validator": "scripts/verify-c2pa.py", "results": results, "pass": all(item["pass"] for item in results)}
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
