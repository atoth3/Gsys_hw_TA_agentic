# CI-LIMIT-4 evidence

GitHub Actions run 45826034004 (PR #2, 2026-11-26), both matrix jobs (Node 18 and 20):
https://github.com/atoth3/Gsys_hw_TA_agentic/actions/runs/45826034004

```
[guru99] › case-4-iframe-tabs.spec.ts › Case 4: iFrame and tab handling › 4.3 verify the new tab title (amended, D-4.3)
Error: Timed out 5000ms waiting for expect(locator).toHaveTitle(expected)
Received string: "Attention Required! | Cloudflare"
1 failed, 5 passed
```

The new tab (www.guru99.com) served Cloudflare's challenge page instead of the article. The same test passes locally,
and demo.guru99.com itself (steps 4.1–4.2) was reachable from the runner.
