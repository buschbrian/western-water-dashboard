"""Build snow_history.json -- snow water equivalent on the same weekly steps
as precipitation_history.json, every water year since 1991, at each snow
station whose record covers all of them (ADR-160).

The steps, the three-day substitution, the encoding and the merge rules are
tools/build_precipitation_history.py's, unchanged; only the element differs.
WTEQ is the water held in the snow on the day, never snowfall. A reading that
is negative or not a finite number is not used, so a step with only such a
reading takes the station out of the fixed set. A zero is kept: no snow on
the ground is a measurement.

Not part of the daily refresh. Run it each October after the water year
closes, after precipitation's history, and when the station inventory grows.

    python tools/build_snow_history.py --dry-run
    python tools/build_snow_history.py
    python tools/build_snow_history.py --missing
    python tools/build_snow_history.py --only 766:UT:SNTL
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tools.build_precipitation_history import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main(element="WTEQ", output_path=ROOT / "snow_history.json",
                          description=__doc__))
