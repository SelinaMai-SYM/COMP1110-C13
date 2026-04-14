from __future__ import annotations

import argparse
import json

from .loading import load_case_study
from .runners import run_all_case_studies, run_scenario


def main() -> None:
    parser = argparse.ArgumentParser(description="Restaurant queue simulation toolkit")
    parser.add_argument("--run-all", action="store_true", help="Run every official case study pair")
    parser.add_argument("--case-study", help="Case-study folder name, e.g. pair_01_table_mix")
    parser.add_argument("--version", choices=["A", "B"], help="Case-study version to run")
    parser.add_argument(
        "--output-json",
        action="store_true",
        help="Print full JSON instead of only the metrics row",
    )
    args = parser.parse_args()

    if args.run_all:
        payload = run_all_case_studies()
        print(json.dumps(payload, indent=2))
        return

    if args.case_study and args.version:
        result = run_scenario(load_case_study(args.case_study, args.version))
        if args.output_json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print(json.dumps(result.metrics.to_dict(), indent=2))
        return

    parser.error("Provide --run-all or both --case-study and --version.")


if __name__ == "__main__":
    main()
