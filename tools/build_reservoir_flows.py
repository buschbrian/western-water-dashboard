"""Refresh only the reviewed flow blocks, keeping all storage figures intact."""
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import daily_history, reservoir_flows, providers  # noqa: E402


def main():
    path = ROOT / "reservoirs.json"
    payload = json.loads(path.read_text())
    previous = {r["source_station_id"]: r for r in payload["reservoirs"]}
    history = reservoir_flows.refresh(payload["reservoirs"], previous, providers.local_today())
    daily_history.write_compact(reservoir_flows.HISTORY, history)
    path.write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
