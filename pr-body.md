## Summary
- Fixes 21 of 37 findings from a full security audit of the API server and frontend (4 Critical, 12 High, 4 Medium, 1 Low) - see `docs/SECURITY_REPORT.md` for the complete, plain-language account of every finding, fixed and open.
- Critical: hardcoded production DB credential in 8 scripts, unscoped cross-department reads of leave reasons and clinical logs, and a bound-parameter logging leak.
- High: missing supervisor scoping on 4 more student routes, a fail-open department check, 25 more logging leak sites, no session invalidation on logout, a broken rate limiter behind the load balancer, and a 404-vs-403 enumeration leak across 4 routes.
- Medium/Low: 4 frontend surfaces that silently showed fake zero/empty data on a failed load instead of a visible error, and one fabricated data profile on the login page.
- Adds `.agents/SECURITY_AUDIT.md` and `docs/SECURITY_FIXES.md` to git (previously untracked) so the full working record ships with the PR, plus `docs/SECURITY_REPORT.md`, a plain-language writeup for non-engineers.
- Separately investigated one historical commit (`ebd075e`, author `AI Bot <bot@example.com>`, unexplained identity) that had introduced several fabricated-data fallbacks; confirmed all are already fixed.

## Test plan
- [x] API server suite: 60/60 passing at HEAD, `tsc --noEmit` clean
- [x] Frontend `tsc --noEmit` clean (no automated frontend test suite exists in this project - SEC-09/10/14-17 UI fixes were verified live in a real browser against an ephemeral, in-memory practice database; see `docs/SECURITY_REPORT.md` section 6 for what that does and doesn't cover)
- [x] No database command run, no dependency changed, nothing pushed until now

Generated with Claude Code (https://claude.com/claude-code)
