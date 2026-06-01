"""One-off: lock the last two data details before writing the loader.

1. Which `amount_type` codes are valid for incexp_v2 and grants_v2?
2. Does the incexp_v2 `item` dimension carry an income/expenditure category we can use,
   rather than hand-maintaining a label map?

Run: python3 etl/explore.py
"""

import json

import config
from api import CubesClient


def main():
    client = CubesClient(config.API_BASE)

    for cube in (config.CUBE_INCEXP, config.CUBE_GRANTS):
        print(f"\n=== {cube}: amount_type members ===")
        try:
            members = client.members(cube, "amount_type").get("data", [])
            for row in members:
                print(" ", row)
        except Exception as exc:  # noqa: BLE001 - exploration script
            print("  ERROR:", exc)

    print(f"\n=== {config.CUBE_INCEXP}: model dimensions ===")
    try:
        dims = client.model(config.CUBE_INCEXP).get("model", {}).get("dimensions", {})
        print("  dimensions:", list(dims.keys()))
        item = dims.get("item", {})
        print("  item attributes:", list(item.get("attributes", {}).keys()))
        print(json.dumps(item, indent=2)[:1800])
    except Exception as exc:  # noqa: BLE001 - exploration script
        print("  ERROR:", exc)


if __name__ == "__main__":
    main()
