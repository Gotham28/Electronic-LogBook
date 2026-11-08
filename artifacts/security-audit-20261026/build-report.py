import json, re, importlib.util
from pathlib import Path
from datetime import datetime, timezone
root = Path.cwd()
out = root/'artifacts/security-audit-20261026'
scan_id = 'elogbook-local-20261026-payments-security'
revision = '06a25b5d88e521b9a60a7f6ebe87e806107e97a7'
now = datetime.now(timezone.utc).isoformat()

def dump(name, data):
    (out/name).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')

def loc(path, start, end=None, role='root_control'):
    return {'path': path, 'startLine': start, 'endLine': end or start, 'role': role}

def ev(key, label, path, start, end, why, role='root_control', redact=False):
    lines = (root/path).read_text(encoding='utf-8-sig').splitlines()
    code = '\n'.join(lines[start-1:end])
    if redact:
        code = re.sub(r'postgres(?:ql)?://[^\s\"\x27]+', 'postgresql://[REDACTED]', code)
    return {'id': key, 'label': label, **loc(path,start,end,role), 'language': 'typescript', 'code':code, 'explanation':why}

model = '''# Local payment and security threat model

This model was generated from current source; it is not a supplied deployment guarantee.

The React client calls the Express JSON API using a session token. Pending self-registered residents receive a separate, 30-minute payment-scoped token and cannot use it as an application session. `requireAuth` verifies HS256 and resolves current status, session version and department from the database (`middlewares/auth.ts:32-70`).

`POST /api/payments/create-order` resolves the account and configured subscription plan server-side, requests an external Razorpay order and stores the order-to-user mapping (`routes/payments.ts:56-158`). The browser submits the order/payment IDs plus a checkout signature to `/verify`. The server checks the stored order owner and HMAC (`payments.ts:167-199`). An independent raw-body `/api/payments/webhook` endpoint checks its own HMAC and handles captured/failed events (`app.ts:84-93`; `payments-webhook.ts:37-138`). External gateway configuration, actual captured amounts and settlement state were not contacted or checked.

Login and HOD approval both require an existing local paid row for self-registered pending students (`auth.ts:213-228`; `admin.ts:88-117`). Payment confirmation does not automatically approve an account. Trusted administrative provisioning intentionally bypasses the payment requirement. Approval remains an explicit department HOD decision.

Protected assets: payment-to-account linkage and financial integrity; payment/account approval state; authentication credentials; patient clinical detail; department isolation and resident records. Boundaries: browser-to-API; payment token-to-session token; gateway-to-webhook; tenant-to-tenant; account deletion-to-financial ledger; clinical submission-to-operational logs; repository read access-to-database access.

A malicious client can control JSON fields and supplied IDs/tokens but cannot forge HMACs under the assumed uncompromised configured secrets. Authenticated residents control their own submitted clinical text. HODs and administrators have intentionally privileged lifecycle operations, with their existing role/department limits. A source reader can read embedded literal credentials, independent of HTTP authorization. Provider/network/storage failures are reliability triggers rather than attacker privileges.

Unknowns: credential rotation/live validity and database-role permissions; deployment revision; webhook subscriptions, delivery failures and secret configuration; captured/refunded/settled status of any real payment; actual log access and retention. No production database was contacted. Current source was reviewed offline. No claim of public repository access or real exploitation is made.

Repository: local:Electronic-LogBook
Version: 06a25b5d88e521b9a60a7f6ebe87e806107e97a7
'''
manifest = {'documentType':'codex-security.scan-manifest','schemaVersion':'1.0','scan':{
 'id':scan_id,'producer':{'name':'codex-security-plugin','version':'0.1.32'},'status':'completed','startedAt':now,'completedAt':now,
 'target':{'kind':'git_revision','targetId':'local:Electronic-LogBook','displayName':'Arogya Electronic LogBook','revision':revision},
 'scope':{'includePaths':['.'],'excludePaths':['node_modules','.git','artifacts/security-audit-20261026'],
 'summary':'Payment confirmation, approval consumers, financial ledger integrity, authentication boundaries and source-backed security findings. Broad repository coverage is partial.',
 'context':'User reported that people pay but remain unpaid/unapproved, and requested a security/payment code review. Follow-up explicitly authorized the current local repository and ignoring AGENTS.md. Source-backed threat model generated during review. No fixes requested or applied.',
 'runtimeStatus':'Four direct handler/PGlite scenarios reproduced the reported failure mechanisms. The existing 21 HTTP route tests could not connect to loopback (EACCES); they are blocked, not passing.',
 'validationMode':'Offline static review plus direct actual-handler tests using in-memory PGlite, synthetic accounts and mocked mail; no live provider calls.',
 'limitations':['Not a complete line-by-line repository audit; reviewed paths and excerpts are listed below.','No production database, live gateway, credential validation or real patient data accessed.','Direct handler invocations inject authenticated caller context and do not verify HTTP middleware wiring.','Local revision was used without pulling, as explicitly authorized.','Token usage measurements are unavailable for this chat-based review.']},
 'threatModel':{'format':'markdown','content':model,'origin':'generated'},'coverageRef':'coverage.json','findingsRef':'findings.json'}}
coverage={'documentType':'codex-security.coverage','schemaVersion':'1.0','scanId':scan_id,'mode':'repository','inventoryStrategy':'repository','completeness':'partial','includePaths':['.'],'excludePaths':['node_modules','.git','artifacts/security-audit-20261026'],'surfaces':[],'explicitExclusions':[{'pattern':'node_modules/**','reason':'Dependencies were not exhaustively audited or queried against vulnerability databases.'},{'pattern':'.git/**','reason':'Only the authorized current local state was analyzed, not history.'},{'pattern':'artifacts/security-audit-20261026/**','reason':'Generated review artifacts are not product source.'}],'deferred':[{'id':'broad-repo-remainder','reason':'Large student/admin/superadmin routes and presentation components were reviewed in relevant sections only; remaining product paths were not completely audited.','paths':['artifacts/api-server/src/routes/student.ts','artifacts/api-server/src/routes/admin.ts','artifacts/api-server/src/routes/superadmin.ts','artifacts/mockup-sandbox/src']}], 'openQuestions':[]}
dump('scan-manifest.json',manifest); dump('findings.json',{'documentType':'codex-security.findings','schemaVersion':'1.0','scanId':scan_id,'findings':[]}); dump('coverage.json',coverage)

findings=[]
def finding(rule,title,level,category,cwe,summary,evidence,locations,rootcause,validation,dataflow,reachability,remediation,tests,limits=None,source='local_plugin'):
    refs=[x['id'] for x in evidence]
    findings.append({'ruleId':rule,'identity':{'anchor':rule},'title':title,'summary':summary,'severity':{'level':level,'rationale':('The source exposes reusable database authentication material to every source reader; impact depends on the role privileges and whether rotation has already invalidated it.' if rule=='hardcoded-database-credentials' else 'Priority reflects the source-backed financial integrity, access availability or sensitive logging impact; deployment-specific reachability and restrictions are stated below.'),'changeConditions':'Provider configuration, credential rotation, production incidence and log-access controls may change operational impact; no such state was inspected.'},'confidence':{'level':'high','rationale':'Verified against current source; payment behavior additionally reproduced with actual handlers and in-memory PGlite where stated. Live deployment state is untested.'},'taxonomy':{'category':category,'cwe':cwe},'locations':locations,'codeEvidence':evidence,'rootCause':{'summary':rootcause,'evidenceRefs':refs},'validation':{'method':'Static source trace and local synthetic direct-handler tests where stated','summary':validation,'evidenceRefs':refs,'limitations':limits or ['Not tested against the deployed service or a real payment.']},'attackPath':{'dataflow':{'summary':dataflow,'evidenceRefs':refs},'reachability':{'summary':reachability,'evidenceRefs':refs}},'remediation':remediation,'remediationTests':tests,'provenance':{'source':source}})

secret_locations=[('artifacts/api-server/run.mjs',11),*[(f'lib/db/{name}.cjs',3 if name in ['final_check','reset_pass'] else 2) for name in ['cleanup_test','dedup','final_check','leave_test','merge_accounts','merge_accounts_2','rename_user','reset_pass','reset_radhamani','restore','schema_test','sync_mohammed','test']]]
finding('hardcoded-database-credentials','Database credentials remain embedded in 14 tracked scripts','high','Hardcoded database credentials',['CWE-798'],
 'Reading the current tracked source reveals one repeated, non-placeholder database credential group in 14 helper scripts. Treat the credential as exposed and rotate it; its live validity and privileges were deliberately not tested.',
 [ev('embedded-db-url','Embedded database authentication material',p,l,l,'A source reader can obtain database authentication material directly from this literal. The credential is intentionally redacted in this report.',redact=True) for p,l in secret_locations[:1]],
 [loc(p,l) for p,l in secret_locations],
 'Each listed script feeds an embedded PostgreSQL URL directly into `pg.Pool`, rather than requiring a secret from the environment. Source access therefore discloses authentication material across the repository/database boundary. Several helpers intend to delete records or reset account passwords; they were not executed.',
 'Parent independently verified credential-shaped user/password URLs at all 14 listed lines with values redacted. The independent auditor traced unconditional helper runners and their read/write queries. Normal package start uses `dist/index.mjs`, so automatic execution of these helpers is not established. That counterevidence does not remove disclosure to source readers.',
 'Tracked literal -> source reader obtains credential -> potential direct database authentication outside application controls.',
 'Requires reading the repository. Any further access requires the credential still to be valid and the database reachable. Neither live validity nor public source exposure is asserted.',
 'Revoke/rotate the repeated database credential first. Remove it from all 14 tracked locations, delete obsolete helpers or require explicit configuration and verified targets, and coordinate history cleanup and access review. Review the fixed legacy account-reset passwords separately.',
 ['Scan current tracked files for credential-bearing URLs without printing their values.','Verify obsolete credentials are revoked through the database owner, not by trying leaked credentials.'],['No leaked credential was used; live validity, rotation status and role privileges remain unknown.'],source='local_plugin-independent-baseline')

p='artifacts/api-server/src/routes/payments-webhook.ts'
finding('payment-webhook-acknowledges-storage-failure','Captured payments are acknowledged even when recording them fails','medium','Payment processing reliability / financial integrity',['CWE-703'],
 'A captured-payment notification can receive `200` while its database write failed and the account remains unpaid. When the browser callback is unavailable, the application has acknowledged its recovery event without recording the payment.',
 [ev('capture-write','Captured event updates the local ledger',p,103,105,'The authenticated provider event attempts to persist paid state before approval can recognize it.'),ev('ack-on-error','Database failures are acknowledged as success',p,124,138,'The catch acknowledges even transient storage failures without durable event storage, retry queue or reconciliation.'),ev('login-gate','Login uses only the local paid ledger','artifacts/api-server/src/routes/auth.ts',220,224,'An unrecorded capture is presented to the applicant as payment still required.','outcome')],
 [loc(p,124,138),loc('artifacts/api-server/src/routes/auth.ts',220,224,'outcome')],
 'The webhook verifies its HMAC, but its database catch always returns `200`. The comment relies on browser `/verify` as a fallback, although that callback can be lost, expire or independently fail. Current payment routes contain no provider reconciliation endpoint or durable webhook inbox.',
 'Directly invoked the real webhook handler with a signed synthetic capture and made its database update throw once. It returned 200, the in-memory row remained `created`, and the real login handler returned 402. All provider/mail traffic was mocked or blocked. A delivery that is retried later can heal the row; the bug is acknowledging an uncommitted event.',
 'Captured event -> signature verification -> database update throws -> catch returns 200 -> row stays created -> login/approval sees no paid row.',
 'A normal paying applicant is affected when storage fails during capture processing and no browser verification repairs the state. No attacker privilege escalation is claimed; this is the reported payment reliability failure.',
 'Acknowledge only after durably storing the event or applying the payment update. Return a retryable failure for transient storage errors; implement an idempotent durable inbox/reconciliation worker and alert on irreconcilable events. Verify gateway state server-side before offering another payment.',
 ['Force one storage failure during capture; require retryable response or durable queued event.','Replay the same capture after recovery and assert one paid transition and no duplicate charge.','Lose the browser callback and verify eventual paid-state recovery.'])

p='artifacts/api-server/src/routes/payments.ts'
finding('payment-verify-rejects-failed-retry','A successful retry cannot clear an earlier failed order through browser verification','medium','Payment state-machine reliability',['CWE-841'],
 'When a failed attempt is followed by a successful checkout on the same order, `/verify` rejects the valid signed success with 409 because it only promotes `created` rows. If the capture webhook is late or missing, login and HOD approval continue to return 402.',
 [ev('verified-input','The checkout signature is checked',p,178,183,'The success callback can carry a valid gateway signature even though an earlier attempt marked the local order failed.','entrypoint'),ev('created-only','Verification only promotes created rows',p,185,199,'The created-only predicate leaves failed rows unchanged and sends 409.'),ev('webhook-can-recover','The sibling capture path explicitly allows successful retries','artifacts/api-server/src/routes/payments-webhook.ts',98,105,'This sibling path demonstrates that failed is an intermediate order-attempt state, not a terminal prohibition.','expected_control'),ev('approval-gate','HOD approval requires a local paid row','artifacts/api-server/src/routes/admin.ts',105,110,'The uncorrected failed state blocks approval.','outcome')],
 [loc(p,185,199),loc('artifacts/api-server/src/routes/admin.ts',105,110,'outcome')],
 'The browser and webhook implement incompatible payment state transitions. A failed attempt marks the order failed; subsequent valid browser verification only updates rows whose status is created. Refunded rows must remain protected, but treating failed rows identically to refunded rows strands legitimate retries.',
 'With a synthetic failed order and a valid HMAC, the actual verification handler returned 409 with status failed; the login handler returned 402 and the HOD approval handler returned 402. A subsequent synthetic captured webhook changed the same row to paid and approval then returned 200. This control proves the webhook already supports the retry that browser verification denies.',
 'Earlier failed attempt -> local failed order -> later signed success -> created-only UPDATE affects zero rows -> 409 -> approval 402.',
 'A normal applicant who retries within an existing checkout order is affected until the independent captured webhook repairs it. No forged signature, another user order or unauthorized account access was demonstrated.',
 'Use one shared, idempotent payment-finalization path for browser verification and webhooks. After authoritative provider verification, permit legitimate failed-to-paid recovery; retain explicit protections for refunded orders and owner mismatches.',
 ['Failed attempt then valid successful retry with no captured webhook must recover.','Refused/invalid signature must leave state unchanged.','Refunded orders must not be resurrected.','Concurrent success callbacks must remain idempotent.'])

p='artifacts/api-server/src/routes/student.ts'
finding('clinical-query-errors-in-console','Clinical write failures send clinical fields to server logs','medium','Sensitive clinical information in logs',['CWE-532'],
 'Failed clinical-work inserts and edits print complete database error objects to `console.error`. Those query errors can contain bound patient case identifiers and clinical findings, copying clinical data into operational log systems.',
 [ev('clinical-input','Resident-controlled clinical text',p,1406,1412,'Clinical record fields pass string validation and reach the database query.','user_input'),ev('clinical-insert','Patient fields enter the query',p,1458,1466,'The failure catch prints the entire query error and its cause after binding these clinical fields.','sink'),ev('clinical-patch','Edits use the same raw error sink',p,1502,1514,'Updated clinical text is passed to the query, and errors are printed unredacted.','sink'),ev('central-handler-comparison','Central error handler already avoids raw Drizzle errors','artifacts/api-server/src/app.ts',106,112,'This safer handler documents query-parameter exposure, but the local console calls bypass it.','expected_control')],
 [loc(p,1465),loc(p,1512)],
 'After an authenticated resident supplies owned clinical data, the insert/update binds it as query parameters. On error, these route-local catches print the raw error instead of only vetted metadata. Console output is independent of the pino serializers and the safer centralized error handler.',
 'Parent confirmed both raw console sinks and the complete input-to-query trace. Query errors in the installed ORM retain their parameter arrays. Authentication, ownership, department features and catalog checks limit who may submit, but do not sanitize the error sink. JSON NUL in otherwise valid text is a possible database-error trigger; that exact request was not executed.',
 'Clinical fields -> insert/update query parameters -> query failure -> raw console error/cause -> stderr and downstream logging.',
 'A legitimate clinical write can fail during a database outage. An approved resident with valid own-record inputs can also submit text that the database rejects. Resulting log exposure depends on deployment stderr collection and access; those settings were not inspected.',
 'Remove the two raw console calls. Log only operation, vetted IDs/status and safe error codes. Check local catches elsewhere for equivalent raw-error logging. Test failure paths with synthetic sensitive markers and assert none reach console/logger output.',
 ['Induce insert and update failures with synthetic clinical markers; assert no marker appears in console or logger calls.','Check that client responses remain generic and ownership guards still apply.'],['Static validation only for this finding; production log collection/access and an exact malformed request were not tested.'],source='local_plugin-independent-baseline')

p='artifacts/api-server/src/lib/hard-delete-user.ts'
finding('account-deletion-erases-payment-ledger','Deleting an applicant also removes outstanding payment linkage','low','Payment ledger retention / reconciliation reliability',[],
 'Hard-deleting a pending applicant removes every payment row, including an outstanding checkout order. A later genuine capture then has no account mapping and is acknowledged without recording it. Deleting a paid account also removes local payment/refund reference data.',
 [ev('delete-entry','Privileged account deletion invokes the cascade','artifacts/api-server/src/routes/admin.ts',742,747,'The HOD deletion path calls the shared helper without a payment-state precondition.','entrypoint'),ev('delete-payments','All payment rows are deleted with the account',p,148,152,'There is no created/paid/refund retention rule before removing payment linkage.','root_control'),ev('unknown-capture','A later capture cannot be correlated','artifacts/api-server/src/routes/payments-webhook.ts',84,88,'The missing local order is acknowledged 200 and no ledger entry is recreated.','outcome')],
 [loc(p,148,152),loc('artifacts/api-server/src/routes/admin.ts',742,747,'entrypoint'),loc('artifacts/api-server/src/routes/superadmin.ts',795,815,'entrypoint')],
 'Financial records share the account deletion lifecycle. The helper deletes payments unconditionally and then removes the user, even if an external order is still unsettled. The webhook requires the local mapping and drops unknown orders.',
 'Invoked the actual cascade inside an in-memory transaction on a synthetic pending account with a created order. The payment row disappeared. Invoking the signed captured-event handler afterward returned 200 and did not recreate it. HOD and admin deletion paths are privileged and intentional; this is not a demonstrated authorization bypass.',
 'Privileged account removal -> delete all payments -> external capture arrives -> order lookup empty -> acknowledge 200 with no recorded receipt.',
 'Requires an authorized HOD/admin delete while checkout or reconciliation is outstanding. Its privileged-only reachability lowers severity; the financial data-loss behavior is directly reproduced.',
 'Define payment retention independently of account deletion. Keep a financial tombstone/provider identifiers and block or reconcile outstanding payments before removal. Avoid recreating clinical/personal records merely to retain a receipt.',
 ['An account with an unsettled order must not lose its reconciliation mapping.','A later capture after permitted account deletion must be durably correlated for refund/reconciliation.'])

# Include exact synthetic evidence as readable scope context, never tokens/credentials.
results=json.loads((out/'payment-reproduction-results.json').read_text(encoding='utf-8'))
manifest['scan']['scope']['runtimeStatus']+='\n\nReproduction results:\n\n```json\n'+json.dumps(results,indent=2)+'\n```'
coverage['surfaces']=[
 {'id':'payments','label':'Payment confirmation and checkout recovery','disposition':'reported','riskArea':'Financial integrity and availability','receiptRefs':[],'notes':'Two directly reproduced payment-state failures. Browser state only stores success payload in callback memory, offers no confirm-status retry/polling, and tells uncertain applicants to contact HOD. Current routes expose only create-order, verify and webhook; no gateway reconciliation endpoint was found. The 30-minute reuse cutoff can create another order while old unconfirmed orders still exist; do not advise affected users to pay again until provider status is reconciled.'},
 {'id':'auth','label':'Session, registration/reset and approval controls','disposition':'no_issue_found','riskArea':'Authentication and department isolation','receiptRefs':[],'notes':'HS256 allowlist, server-resolved account/session state, separation of payment/session tokens, payment row ownership and actual user IDs checked. Login/approval use any paid row rather than latest attempt. Trusted account provisioning intentionally bypasses payment. No additional exploitable bypass substantiated in inspected paths.'},
 {'id':'secrets','label':'Current tracked credential exposure','disposition':'reported','riskArea':'Database credentials','receiptRefs':[],'notes':'14 credential-bearing scripts independently confirmed with values redacted. No credential was used or validated. The normal production start path does not call these helpers.'},
 {'id':'clinical-logs','label':'Clinical work insert/update errors','disposition':'reported','riskArea':'Clinical text in operational logs','receiptRefs':[],'notes':'Both raw console error sinks confirmed. Other large student route sections were not exhaustively reviewed.'},
 {'id':'deletion','label':'HOD/admin permanent account deletion','disposition':'reported','riskArea':'Financial ledger retention','receiptRefs':[],'notes':'Payment deletion and unknown-order acknowledgment reproduced using synthetic data; no privilege escalation claimed.'},
 {'id':'deferred-broad','label':'Remaining repository paths and deployment state','disposition':'needs_follow_up','riskArea':'Unreviewed source and external configuration','receiptRefs':[],'notes':'Broad sampling is not an exhaustive audit. Live provider subscriptions, captures/refunds/settlement, secret rotation and production log policy were not inspected.'}
]
coverage['openQuestions']=[
 {'question':'Which real order/payment IDs were charged but remained created/failed, and what were the provider capture/webhook-delivery states? A production operator should reconcile using IDs only; this review did not access those records.'},
 {'question':'Is the embedded database credential already revoked, and what privileges did its role hold? Do not validate by using the leaked value.'},
 {'question':'Are successful checkout signatures guaranteed to represent captured funds under the deployed gateway configuration? The current verify handler checks HMAC but does not query capture/amount/currency state.'},
 {'question':'What is the approved refund/chargeback/fee-waiver policy? Current source handles only payment.captured/payment.failed, contains no refund event reconciliation, and checks payment on pending login/approval rather than ongoing entitlement.'},
 {'question':'HOD payment notice email failure is caught after the paid write; retries of already-paid events do not resend. Should approval notices use a durable outbox? This affects awareness, not stored payment success.'},
 {'question':'The generic API client overwrites explicit Authorization headers with a stored session token. App startup/signout normally clears stale sessions, so ordinary payment-flow reachability is not established; do not treat this as a confirmed incident cause.'},
 {'question':'Tracked old demo environment values have no current VITE_DEMO consumers. Their live credential status is unknown and should be reviewed by the owner without reproducing values.'}
]
manifest['scan']['scope']['artifactsReviewed']=['artifacts/api-server/src/routes/payments.ts','artifacts/api-server/src/routes/payments-webhook.ts','artifacts/api-server/src/routes/auth.ts','artifacts/api-server/src/middlewares/auth.ts','artifacts/api-server/src/middlewares/payment-token.ts','artifacts/api-server/src/middlewares/student-access.ts','artifacts/api-server/src/app.ts','artifacts/api-server/src/routes/index.ts','artifacts/api-server/src/lib/student-notifications.ts','artifacts/api-server/src/lib/hard-delete-user.ts','artifacts/api-server/src/routes/admin.ts (relevant excerpts)','artifacts/api-server/src/routes/superadmin.ts (relevant excerpts)','artifacts/api-server/src/routes/student.ts (clinical-work excerpts)','artifacts/mockup-sandbox/src/components/PaymentStep.tsx','artifacts/mockup-sandbox/src/lib/apiClient.ts (payment/auth excerpts)','artifacts/mockup-sandbox/src/components/HODPortal.tsx (approval excerpts)','artifacts/mockup-sandbox/src/components/LoginPage.tsx (login/payment excerpts)','artifacts/mockup-sandbox/src/components/RegistrationPage.tsx (registration/payment excerpts)','lib/db/src/schema/payments.ts','lib/db/src/schema/users.ts','lib/db/src/schema/students.ts','lib/db/src/schema/subscription_plans.ts','lib/db/migrations/0003_subscriptions_payments.sql','artifacts/api-server/tests/payments-webhook.test.ts','artifacts/api-server/tests/admin-resident-approval.test.ts',*[p for p,_ in secret_locations]]
dump('scan-manifest.json',manifest); dump('findings.json',{'documentType':'codex-security.findings','schemaVersion':'1.0','scanId':scan_id,'findings':findings}); dump('coverage.json',coverage)
# Validate the unsealed draft before the one finalization attempt.
plugin=Path(r'C:\Users\abhij\.codex\plugins\cache\openai-curated-remote\codex-security\0.1.32')
spec=importlib.util.spec_from_file_location('audit_contract',plugin/'scripts/finalize_scan_contract.py'); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module._populate_unsealed_finding_identities(manifest, {'scanId':scan_id,'findings':findings})
dump('findings.json',{'documentType':'codex-security.findings','schemaVersion':'1.0','scanId':scan_id,'findings':findings})
print(json.dumps({'draft_created':True,'findings':len(findings),'source_revision':revision,'coverage':'partial'}))
