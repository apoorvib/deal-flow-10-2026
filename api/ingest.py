"""Turn an uploaded file into (text, png_base64) for the debate (assumptions.md A7).

PNG -> as-is. JPEG/other images -> re-encoded to PNG (complete_json hardcodes a PNG
data URI). PDF -> text via pypdf (no page render). Text -> decoded. Never raises.
"""

from __future__ import annotations

import base64
import io


def ingest(data: bytes, filename: str, content_type: str | None) -> tuple[str, str | None]:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "", base64.b64encode(data).decode()
        if data[:4] == b"%PDF" or name.endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in reader.pages[:5]).strip(), None
        if ctype.startswith("image/") or name.endswith((".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
            from PIL import Image
            img = Image.open(io.BytesIO(data)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return "", base64.b64encode(buf.getvalue()).decode()
        return data.decode("utf-8", errors="replace"), None
    except Exception:  # noqa: BLE001 -- an unreadable file degrades, never 500s
        return "", None
