"""Command line entry point:  python -m evals.run [--suite tools|retrieval|grounding|safety] [--out report.json]"""

import argparse
import json
import sys

from app.core.config import get_settings
from app.services.embeddings import get_embedder
from app.services.llm import get_llm
from evals.runner import SUITES, Environment


def main() -> int:
    parser = argparse.ArgumentParser(description="Nexora AI evaluation harness")
    parser.add_argument("--suite", choices=[*SUITES, "all"], default="all")
    parser.add_argument("--out", default="eval_report.json")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ_API_KEY is not set (see backend/.env). The evaluation needs the real model.")
        return 2
    llm, embedder = get_llm(), get_embedder()
    names = list(SUITES) if args.suite == "all" else [args.suite]
    report = {"model": getattr(llm, "model", "?"), "embedding_provider": settings.embedding_provider, "suites": []}
    with Environment(llm, embedder) as env:
        # wait for background document processing to finish before judging retrieval
        for name in names:
            print(f"running {name} ...", flush=True)
            report["suites"].append(SUITES[name](env))

    for s in report["suites"]:
        headline = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items() if k not in ("cases", "suite")}
        print(f"\n== {s['suite']} ==\n  {headline}")
        for c in s["cases"]:
            if not c.get("passed", True) or c.get("recall") == 0.0:
                print(f"  FAIL {c['id']}: {c.get('detail', c)}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\nFull report saved to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())