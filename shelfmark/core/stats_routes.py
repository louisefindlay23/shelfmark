"""Dashboard counters: ``GET /api/stats``."""

from __future__ import annotations

import sqlite3
from typing import TYPE_CHECKING

from flask import g, jsonify, session

from shelfmark.core import stats
from shelfmark.core.logger import setup_logger
from shelfmark.core.viewer_redaction import redact_status_message
from shelfmark.download import orchestrator

if TYPE_CHECKING:
    from collections.abc import Callable

    from flask import Flask
    from werkzeug.wrappers import Response

    from shelfmark.core.user_db import UserDB

logger = setup_logger(__name__)

STATS_PATH = "/api/stats"
STATS_QUEUE_PATH = "/api/stats/queue"

# Allowlist: no id, user, path or cover, so a dashboard key learns nothing it could act on.
_QUEUE_FIELDS = (
    "title",
    "format",
    "size",
    "source_display_name",
    "status",
    "progress",
    "added_time",
    "finished_at",
)


def register_stats_routes(
    app: Flask,
    *,
    get_user_db: Callable[[], UserDB | None],
    resolve_auth_mode: Callable[[], str],
) -> None:
    """Register ``/api/stats``.

    Both arguments are called per request so a runtime patch of either still takes effect.
    """

    def _deny() -> tuple[Response, int] | None:
        if resolve_auth_mode() != "none" and g.get("api_key_scope") is None:
            if "user_id" not in session:
                return jsonify({"error": "Unauthorized"}), 401
            if not session.get("is_admin", False):
                return jsonify({"error": "Admin access required"}), 403
        return None

    @app.route(STATS_QUEUE_PATH, methods=["GET"])
    def api_stats_queue() -> Response | tuple[Response, int]:
        """Per-item queue for dashboards, trimmed to display fields. Same access as ``/api/stats``."""
        if (denied := _deny()) is not None:
            return denied
        status = orchestrator.queue_status()
        items = [
            {
                **{k: task.get(k) for k in _QUEUE_FIELDS},
                "status_message": redact_status_message(task.get("status_message") or "") or None,
            }
            for tasks in status.values()
            for task in tasks.values()
        ]
        return jsonify({"items": items})

    @app.route(STATS_PATH, methods=["GET"])
    def api_stats() -> Response | tuple[Response, int]:
        """Counters for dashboards. Reachable with the read-only API key, an admin key or an admin session."""
        if (denied := _deny()) is not None:
            return denied

        user_db = get_user_db()
        if user_db is None:
            return jsonify({"error": "User database unavailable"}), 503
        try:
            payload = stats.collect(user_db.db_path)
        except sqlite3.Error:
            logger.exception("stats: could not read the database")
            return jsonify({"error": "Internal Server Error"}), 500
        return jsonify(payload)
