# Running cost estimate

These figures are estimates, not bills. No live model was available while building, so:

- **Input sizes are measured.** Every agent's real prompt was captured while running each workflow on the demo portfolio, then converted at 3.5 characters per token.
- **Output sizes are assumed.** Current models think before answering and thinking is billed as output, so each call is given an allowance (300 to 700 tokens on the summarising tier, 1,500 to 4,000 on the reasoning tier).
- **Prices are list prices** per million tokens as of early November 2026: Claude Opus 5.5 at $4 input and $20 output, Claude Haiku 5.5 at $0.10 input and $0.50 output. Check current prices before budgeting.

Expect the real figure to land within about half to double these numbers. After a few days of real use, the Learning page shows actual cost per agent and the run list shows cost per run.

## Cost per workflow

| Workflow | Agents that call a model | Measured input | Estimated cost |
|---|---|---|---|
| Ingest one item | summariser | 0.6k to 4k tokens (large diffs) | $0.0003 to $0.0006 |
| Ask about one project | router, researcher (about 3 tool rounds), composer, verifier | 2.7k tokens to the composer | about $0.04 |
| Ask across the portfolio (3 projects) | router, 3 researchers, composer, verifier | 7k tokens to the composer | about $0.08 |
| Message to tickets | ticket extractor, de-duplicator | 0.7k tokens | about $0.05 |
| Daily sync, per project | activity analyst, release notes writer, risk scout, digest editor | 1.5k tokens each, 2.3k to the editor | about $0.05 |
| Progress report | report writer, report reviewer | 5k tokens | $0.10, or $0.20 with one revision |
| Incident, detection to reviewed fix | 4 summarisers, investigator (about 4 tool rounds), triager, fix proposer, fix reviewer, escalation drafter | about 2k tokens per reasoning call | $0.24, or $0.34 with a revision round |
| Incident report on resolution | report writer, report reviewer | 2.8k tokens | $0.09 |
| Clarifying question | clarifier | 0.4k tokens | under $0.001 |
| Escalation to a team member | escalation drafter | 0.5k tokens | under $0.001 |
| Developer reply stored as knowledge | knowledge distiller | 0.4k tokens | under $0.001 |
| Learn from feedback | reflector | 0.7k tokens | about $0.04 |

The reasoning tier's output dominates every total. Summarising is close to free: reading 1,000 commits costs well under a dollar.

## Monthly estimate

Assumptions for one project director with five active projects, over 22 working days:

| Activity | Volume | Monthly cost |
|---|---|---|
| Ingestion | 40 items per project per day | $2 |
| Daily sync | 1 per project per day | $6 |
| Chat | 15 questions a day, a third of them portfolio-wide | $19 |
| Message to tickets | 3 messages a day | $4 |
| Reports | 1 a week per project | $2 |
| Incidents | 3 a month, with reports | $1 |
| Clarifications, escalations, learning, regression runs | - | $1 |
| **Total** | | **about $35 per director per month** |

Ten directors with fifty projects would be roughly $350 a month in model usage. Chat is over half of it.

Hosting is separate: Vercel (the free Hobby tier is enough for a demo), Upstash Redis for storage, and a small host for the LiteLLM proxy if you use one.

## Ways to spend less

| Lever | Effect |
|---|---|
| Reasoning on Claude Sonnet 5.5 ($2 / $10) instead of Opus 5.5 | Roughly halves the total. Set `SMART_MODEL`, or change the `smart` model in LiteLLM. |
| Summarising on a local model | Removes ingestion cost and keeps code on your network; saves only a few dollars. |
| Lower reasoning effort for the composer | Fewer thinking tokens on the largest line item. Worth testing against the regression questions. |
| Budgets and alerts in LiteLLM | A hard monthly cap per key, enforced outside the application. |
| Heuristic mode | $0. Every agent runs on rules; useful for demos and as the fallback during an outage. |

## Reproducing the measurement

`tests/prompt-sizes.test.ts` routes every agent to a gateway stub that records the request and then fails, so each agent builds its real prompt and its fallback completes the workflow. It runs with the test suite as a guard against prompt bloat. To print the table behind the figures above:

```bash
PRINT_SIZES=1 npx vitest run tests/prompt-sizes.test.ts
```
