#!/usr/bin/env python3
"""Generate the GitHub stats cards for the profile README.

Reads public data from the GitHub GraphQL API and writes two SVGs to
assets/stats/. No third-party services or packages: stdlib only.

Usage: GITHUB_TOKEN=... python3 scripts/stats.py
"""

import json
import os
import urllib.request
from html import escape
from pathlib import Path

USER = "AvilaCarlosDev"
EXCLUDE_REPOS = {"jardin-gratitud-mama", "jardin-para-mi-esposa"}
OUT = Path(__file__).resolve().parent.parent / "assets" / "stats"

BG = "#0d1117"
TITLE = "#42ffa1"
TEXT = "#c9d1d9"
ICON = "#ff8c69"
FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif"

QUERY = """
query($login: String!, $cursor: String) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection { totalCommitContributions restrictedContributionsCount }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}
"""


def graphql(token, variables):
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": variables}).encode(),
        headers={"Authorization": f"bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.load(resp)
    if body.get("errors"):
        raise SystemExit(f"GraphQL error: {body['errors']}")
    return body["data"]["user"]


def collect(token):
    cursor, repos, user = None, [], None
    while True:
        user = graphql(token, {"login": USER, "cursor": cursor})
        page = user["repositories"]
        repos.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        cursor = page["pageInfo"]["endCursor"]

    langs = {}
    for repo in repos:
        if repo["name"] in EXCLUDE_REPOS:
            continue
        for edge in repo["languages"]["edges"]:
            name = edge["node"]["name"]
            size, color = langs.get(name, (0, edge["node"]["color"] or TEXT))
            langs[name] = (size + edge["size"], color)

    contrib = user["contributionsCollection"]
    stats = [
        ("Total stars", sum(r["stargazerCount"] for r in repos)),
        ("Commits (last year)", contrib["totalCommitContributions"] + contrib["restrictedContributionsCount"]),
        ("Pull requests", user["pullRequests"]["totalCount"]),
        ("Issues", user["issues"]["totalCount"]),
        ("Public repos", user["repositories"]["totalCount"]),
        ("Followers", user["followers"]["totalCount"]),
    ]
    return stats, langs


def card(width, height, title, body):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title)}">
<style>
  .t {{ font: 600 18px {FONT}; fill: {TITLE}; }}
  .s {{ font: 400 14px {FONT}; fill: {TEXT}; }}
  .b {{ font: 700 14px {FONT}; fill: {TEXT}; }}
</style>
<rect width="{width}" height="{height}" rx="6" fill="{BG}"/>
<text x="25" y="35" class="t">{escape(title)}</text>
{body}
</svg>
"""


def stats_svg(stats):
    rows = []
    for i, (label, value) in enumerate(stats):
        y = 70 + i * 25
        rows.append(f'<circle cx="31" cy="{y - 5}" r="5" fill="{ICON}"/>'
                    f'<text x="45" y="{y}" class="s">{escape(label)}:</text>'
                    f'<text x="400" y="{y}" class="b" text-anchor="end">{value:,}</text>')
    return card(450, 70 + len(stats) * 25, f"{USER}'s GitHub Stats", "\n".join(rows))


def langs_svg(langs, top=8):
    ranked = sorted(langs.items(), key=lambda kv: kv[1][0], reverse=True)[:top]
    total = sum(size for _, (size, _) in ranked) or 1
    bar, x = [], 25.0
    for name, (size, color) in ranked:
        w = 400 * size / total
        bar.append(f'<rect x="{x:.2f}" y="50" width="{w:.2f}" height="8" fill="{color}"/>')
        x += w
    items = []
    for i, (name, (size, color)) in enumerate(ranked):
        col, row = i % 2, i // 2
        cx, y = 30 + col * 200, 85 + row * 25
        items.append(f'<circle cx="{cx}" cy="{y - 5}" r="5" fill="{color}"/>'
                     f'<text x="{cx + 12}" y="{y}" class="s">{escape(name)} {100 * size / total:.1f}%</text>')
    height = 85 + ((len(ranked) + 1) // 2) * 25
    return card(450, height, "Most Used Languages", "<clipPath id=\"r\"><rect x=\"25\" y=\"50\" width=\"400\" height=\"8\" rx=\"4\"/></clipPath>"
                f'<g clip-path="url(#r)">{"".join(bar)}</g>\n' + "\n".join(items))


def main():
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GITHUB_TOKEN")
    stats, langs = collect(token)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stats.svg").write_text(stats_svg(stats))
    (OUT / "top-langs.svg").write_text(langs_svg(langs))
    print(f"Wrote {OUT / 'stats.svg'} and {OUT / 'top-langs.svg'}")


if __name__ == "__main__":
    main()
