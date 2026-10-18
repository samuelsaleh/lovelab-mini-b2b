"""python3 pdf_engine/cli.py extract in.pdf
   python3 pdf_engine/cli.py render in.pdf translations.json out.pdf
Prints JSON on stdout."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine  # noqa: E402


def main(argv):
    if len(argv) >= 3 and argv[1] == "extract":
        print(json.dumps(engine.extract(argv[2]), ensure_ascii=False))
    elif len(argv) >= 5 and argv[1] == "render":
        with open(argv[3], encoding="utf-8") as f:
            tr = json.load(f)
        print(json.dumps(engine.render(argv[2], tr, argv[4]), ensure_ascii=False))
    else:
        sys.stderr.write(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
