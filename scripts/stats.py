#!/usr/bin/env python3
"""Generate the GitHub stats cards for the profile README.

Reads public data from the GitHub GraphQL API and writes two SVGs to
assets/stats/. No third-party services or packages: stdlib only.

Usage: GITHUB_TOKEN=... python3 scripts/stats.py
"""

import json
import math
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
    contributionsCollection { totalCommitContributions restrictedContributionsCount totalPullRequestReviewContributions }
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
    stars = sum(r["stargazerCount"] for r in repos)
    commits = contrib["totalCommitContributions"] + contrib["restrictedContributionsCount"]
    prs = user["pullRequests"]["totalCount"]
    issues = user["issues"]["totalCount"]
    followers = user["followers"]["totalCount"]
    stats = [
        ("Total stars", stars),
        ("Commits (last year)", commits),
        ("Pull requests", prs),
        ("Issues", issues),
        ("Public repos", user["repositories"]["totalCount"]),
        ("Followers", followers),
    ]
    rank = calculate_rank(commits, prs, issues, contrib["totalPullRequestReviewContributions"], stars, followers)
    return stats, rank, langs


def calculate_rank(commits, prs, issues, reviews, stars, followers):
    """Same weights, medians and levels as github-readme-stats (commits of the last year)."""
    def exponential_cdf(x):
        return 1 - 2 ** -x

    def log_normal_cdf(x):
        return x / (1 + x)

    parts = [
        (2, exponential_cdf(commits / 250)),
        (3, exponential_cdf(prs / 50)),
        (1, exponential_cdf(issues / 25)),
        (1, exponential_cdf(reviews / 2)),
        (4, log_normal_cdf(stars / 50)),
        (1, log_normal_cdf(followers / 10)),
    ]
    percentile = 100 * (1 - sum(w * v for w, v in parts) / sum(w for w, _ in parts))
    thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
    levels = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"]
    level = next(lvl for t, lvl in zip(thresholds, levels) if percentile <= t)
    return level, percentile


def card(width, height, title, body):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title)}">
<style>
  .t {{ font: 600 18px {FONT}; fill: {TITLE}; }}
  .s {{ font: 400 14px {FONT}; fill: {TEXT}; }}
  .b {{ font: 700 14px {FONT}; fill: {TEXT}; }}
  .r {{ font: 800 24px {FONT}; fill: {TITLE}; }}
</style>
<rect width="{width}" height="{height}" rx="6" fill="{BG}"/>
<text x="25" y="35" class="t">{escape(title)}</text>
{body}
</svg>
"""


def rank_ring(cx, cy, level, percentile, r=40):
    circumference = 2 * math.pi * r
    filled = circumference * (100 - percentile) / 100
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{ICON}" stroke-opacity="0.2" stroke-width="6"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{ICON}" stroke-width="6" stroke-linecap="round" '
            f'stroke-dasharray="{filled:.2f} {circumference:.2f}" transform="rotate(-90 {cx} {cy})"/>'
            f'<text x="{cx}" y="{cy}" class="r" text-anchor="middle" dominant-baseline="central">{escape(level)}</text>')


def stats_svg(stats, rank):
    rows = []
    for i, (label, value) in enumerate(stats):
        y = 70 + i * 25
        rows.append(f'<circle cx="31" cy="{y - 5}" r="5" fill="{ICON}"/>'
                    f'<text x="45" y="{y}" class="s">{escape(label)}:</text>'
                    f'<text x="300" y="{y}" class="b" text-anchor="end">{value:,}</text>')
    height = 70 + len(stats) * 25
    rows.append(rank_ring(400, (height + 35) // 2, *rank))
    return card(470, height, f"{USER}'s GitHub Stats", "\n".join(rows))


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
    stats, rank, langs = collect(token)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stats.svg").write_text(stats_svg(stats, rank))
    (OUT / "top-langs.svg").write_text(langs_svg(langs))
    print(f"Wrote {OUT / 'stats.svg'} and {OUT / 'top-langs.svg'}")


if __name__ == "__main__":
    main()
