#!/usr/bin/env python3
"""Dev bot main loop — Python Agent SDK version."""

import argparse
import asyncio
import logging
import os
import signal
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from filelock import FileLock, Timeout

from .agent import run_cycle
from .config import ALLOWED_TOOLS, Config, load_config, load_mcp_servers
from .costs import record_cost

SCRIPT_DIR = Path(__file__).resolve().parent.parent


def setup_logging() -> None:
    """Configure logging to stdout and bot.log."""
    fmt = "[%(asctime)s] %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    handlers: list[logging.Handler] = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(SCRIPT_DIR / "bot.log", mode="a"),
    ]

    logging.basicConfig(
        level=logging.INFO,
        format=fmt,
        datefmt=datefmt,
        handlers=handlers,
    )


def main() -> None:
    # Load .env before anything else so MCP servers get the credentials
    load_dotenv(SCRIPT_DIR / ".env")

    parser = argparse.ArgumentParser(description="Dev bot agent loop")
    parser.add_argument(
        "--label",
        required=True,
        help="Primary Jira label (e.g. hcc-ai-framework)",
    )
    args = parser.parse_args()

    setup_logging()
    logger = logging.getLogger(__name__)

    config = load_config(SCRIPT_DIR)
    mcp_servers = load_mcp_servers(SCRIPT_DIR)

    # Lock file — prevent concurrent runs
    lock = FileLock(SCRIPT_DIR / ".lock", timeout=0)
    try:
        lock.acquire()
    except Timeout:
        logger.error("Another instance is running. Exiting.")
        sys.exit(1)

    def shutdown(sig, frame):
        logger.info("Shutting down.")
        lock.release()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info(
        "Dev bot started. Label: %s. Active interval: %ds. Idle interval: %ds.",
        args.label,
        config.interval,
        config.idle_interval,
    )

    try:
        while True:
            logger.info("Running agent cycle...")

            result = asyncio.run(
                run_cycle(
                    label=args.label,
                    config=config,
                    mcp_servers=mcp_servers,
                    allowed_tools=ALLOWED_TOOLS,
                    cwd=str(SCRIPT_DIR),
                )
            )

            if result is not None:
                no_work = record_cost(
                    costs_file=SCRIPT_DIR / "costs.jsonl",
                    label=args.label,
                    result=result,
                )
            else:
                no_work = False
                logger.warning("Cycle produced no result")

            if no_work:
                logger.info(
                    "No work found. Sleeping for %ds...", config.idle_interval
                )
                time.sleep(config.idle_interval)
            else:
                logger.info(
                    "Cycle complete. Sleeping for %ds...", config.interval
                )
                time.sleep(config.interval)
    finally:
        lock.release()
