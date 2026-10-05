# Analysis and implementation plan: demo flow, Gynaecology setup, and maintenance notice

**Status:** Approved and implemented. Demo video selection and the public maintenance notice changes are implemented. MS OBG postgraduate requirements have been configured for the **Gynecology** department through its authenticated HOD Training requirements page and were verified after refresh.

**Investigation date:** 2026-10-05  
**Application checked:** `http://localhost:5173`  
**Working-tree note:** Existing edits in `artifacts/mockup-sandbox/src/components/LoginPage.tsx` and `artifacts/mockup-sandbox/src/components/layout/DemoBanner.tsx`, plus the new mobile video asset, were preserved and incorporated as applicable.

## 1. Demo video: mobile and desktop source

### Finding

The checkout now includes `artifacts/mockup-sandbox/public/demo-video-mobile.mp4` in addition to the desktop video. The intro preloader and visible intro player select the mobile asset at viewport widths up to 767 px and use `/demo-video.mp4` above that breakpoint.

Before the mobile asset was added, a 390 × 844 mobile-sized viewport and a 1440 × 900 desktop-sized viewport both selected `demo-video.mp4` and played it. After implementation, the source switches at the 767 px breakpoint; physical-device playback still requires verification because browser autoplay and media policies can differ.

### Likely cause

Before the mobile asset was added, the player sent both desktop and mobile viewports to `/demo-video.mp4`. It now selects `/demo-video-mobile.mp4` at the mobile breakpoint. If playback still fails on a physical phone, that device-specific issue remains unverified; viewport selection alone does not test real-device autoplay and media policies.

### Implemented change and remaining verification

1. The existing mobile asset is selected for widths up to 767 px; desktop retains `/demo-video.mp4`.
2. The pre-existing intro flow continues to send video completion and **Skip to Explore** to self-explore, where **Start guided demo** remains visible in the demo banner.
3. Validate source selection, playback completion, Skip, autoplay blocked/manual play, and the guided-demo action at desktop and mobile sizes. Physical iOS/Android playback has not been verified as part of this code change.

### Acceptance criteria

- Video completion and Skip both open self-explore.
- Self-explore shows an obvious, keyboard-accessible action to start the guided demo.
- The guided flow starts only after the user selects that action.
- Desktop and mobile layouts use the approved asset(s), and the actual source can be confirmed in browser tools.
- Any physical-device playback limitation is documented rather than assumed fixed based on viewport emulation.

## 2. Gynaecology department setup against NMC guidance

### Finding

The provisioning helper at `artifacts/api-server/src/lib/department-provisioning.ts` accepts optional `config`, `procedures`, and `catalog` data. When specialty-specific data is omitted, it can create a department without those lists; its generic defaults do not provide an Obstetrics & Gynaecology curriculum. The HOD Training requirements page confirmed that the **Gynecology** department had no procedure types, case categories, academic activities, or postings configured.

The user confirmed that this department serves **postgraduates on the MS OBG programme**. I inspected and changed its settings through the signed-in HOD page; I did not query the database directly or create resident/patient records.

The NMC-hosted MS OBG competency syllabus names the procedures and gives five explicit numerical counts. Its assessment section refers to older PGMER provisions, so those procedure counts are documented here as syllabus targets rather than as a claim that the 2019 syllabus replaces current regulations. Current PGMER-2023 sources were used for the required postgraduate courses and District Residency Programme.

Official references checked:

- [NMC Information Desk for Colleges: PG Curriculum](https://nmc.org.in/page/information-desk-for-colleges-pg-curriculum)
- [NMC MS Obstetrics & Gynaecology syllabus (PDF)](https://www.nmc.org.in/wp-content/uploads/2019/09/MS-OBGY.pdf)
- [NMC e-Gazette page listing Post-Graduate Medical Education Regulations 2023](https://nmc.org.in/e-gazette-nmc)

### Applied MS OBG configuration

The linked MS OBG syllabus explicitly lists these counts: forceps and ventouse (10); caesarian section (10 must be done); postpartum sterilization/minilap tubal ligation (20 must be done); MTP by different methods (20 must be done); opening and closing the abdomen (10 must be done). The source groups forceps and ventouse in one line, so the HOD page now has one combined target of 10, not separate targets of 10 each.

The syllabus says the listed procedures should be done/observed and recorded, but gives no numeric minimum for several of them. Those procedures are available as log types with a required count of zero; the app does not invent a numeric target for them. The HOD can set local minima later if the approved curriculum requires them. The exact section headings **Obstetrics** and **Gynaecology** are available as case categories with no case-volume minimum.

### Applied settings

1. **Procedures:** added 18 NMC-listed procedure options, grouped under Obstetrics (10 types) and Gynaecology (8 types). The five explicit targets are forceps/ventouse 10 combined, caesarian section 10, postpartum sterilization/minilap tubal ligation 20, MTP by various methods 20, and opening/closing the abdomen 10. Their derived target total is **70**. Every procedure without a numeric count in the syllabus is configured at 0 (loggable, no minimum).
2. **Case categories:** added Obstetrics and Gynaecology, both with no minimum because the source does not state a required case volume.
3. **Academic activities:** added the NMC postgraduate course requirements (research methodology; ethics including GCP and GLP; BCLS; ACLS) and thesis/dissertation, each with a target of one completion. The derived academic total is **5**.
4. **Postings:** added “District Residency Programme (DRP) - three-month residential rotation” from PGMER-2023. The application’s posting catalog does not have a numeric posting-target field, so this is a log option rather than an enforced duration counter.
5. Settings were saved through the signed-in HOD page for the visible Gynecology department. No synthetic resident activity or patient log was added.

## 3. Maintenance notice across signed-out and signed-in application views

### Finding

`GET /api/announcements/current` in `artifacts/api-server/src/routes/announcements.ts` requires authentication and filters announcements against the signed-in user’s role. `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` fetches and displays the notice only when `currentUser` exists. In `artifacts/mockup-sandbox/src/App.tsx`, sign-in and registration views are rendered outside `AppLayout`, so they do not run that fetch or display its notice. The demo uses the app layout, but its notice still depends on the authenticated/demo user flow and matching role audience.

The maintenance editor at `artifacts/mockup-sandbox/src/components/MaintenanceAnnouncements.tsx` currently offers student, professor, and HOD role audiences. It has no explicit signed-out/public audience. As a result, even moving the banner higher in the component tree would not make the current authenticated, role-filtered API serve a notice on the signed-out main or sign-in page.

### Likely cause

Both the data source and the UI are scoped to authenticated users: the API endpoint requires authentication and the notice component lives under an authenticated layout. There is no public maintenance-notice contract for visitors who have not signed in.

### Implemented change and remaining verification

1. Added a public audience choice, **Everyone, including signed-out visitors**, defaulted on for new schedules. Existing schedules retain their stored audiences and can be edited to add the public audience.
2. Added an unauthenticated endpoint that returns only active public maintenance notice fields; future, cancelled, and role-only schedules are excluded. The authenticated endpoint remains for role-targeted notices, avoiding duplicate bubbles when a schedule is public.
3. Mounted a shared banner above the app so the active notice can appear on sign-in, registration, demo, and authenticated pages.
4. The banner checks on load, every minute, and when the tab becomes visible. It displays a retry state on fetch failure and uses the existing server-generated maintenance copy.

### Acceptance criteria

- Before the scheduled start time, the public notice is not shown; after start, it appears on main, sign-in, demo, and signed-in pages; after end or cancellation, it disappears.
- A public request returns only active notices explicitly intended for everyone, and role-only notices remain private.
- Route changes do not make the active notice disappear, and refresh/retry behavior is visible and accessible.
- Existing authenticated role filtering continues to work for role-specific notices.

## Delivery sequence and remaining work

The demo flow, mobile video selection, public maintenance notice, and MS OBG department configuration are implemented. The mobile asset is selected at viewport widths up to 767 px. The user reports that the other changes work. The maintenance notice was also visible on the signed-in requirements page during the active maintenance window.

The public audience is opt-in for legacy schedules; edit an existing schedule in the admin maintenance panel to add **Everyone, including signed-out visitors**. New schedules include this audience by default.

## Verification record

- Mockup sandbox TypeScript check: passed.
- Mockup sandbox production build: passed; Vite reported the existing large-bundle advisory.
- API server build: passed.
- Focused `maintenance-announcements.test.ts`: 3 tests passed, including unauthenticated active-only public results and role-only exclusion. The test uses the in-process PGlite fixture and an ephemeral localhost server.
- Full API test-suite attempt under the default sandbox: loopback calls to `127.0.0.1` failed, so the suite-wide result is unverified. The focused maintenance suite was rerun with localhost access and passed.
- API server TypeScript check: still reports return-path errors in other, unmodified handlers in `superadmin.ts` (lines 32, 90, 112, 156, 441, 503, 536, 592, 657, 706, 740, and 781). It reports no error at the edited announcement schema line.
- Local browser check: an earlier isolated 5173 check showed the public-notice retry/error state. In the later authenticated HOD session, the active maintenance notice appeared on the requirements page; the user reports the other requested changes work. The demo workspace showed the **Start guided demo** control. Physical iOS/Android playback has not been checked.
- HOD settings check: the signed-in Training requirements page showed Department of Gynecology. After save and full page refresh, the view retained 10 Obstetrics procedures, 8 Gynaecology procedures, a procedure total of 70, the five required academic activities with a total of 5, two case categories with zero minima, and the DRP posting option.
- Current NMC postgraduate references checked: [PGMER-2023 rules and regulations](https://nmc.org.in/page/rules-regulations-rules-regulations-nmc), [NMC PGMER-2023 FAQs](https://www.nmc.org.in/MCIRest/open/getDocument?path=%2FDocuments%2FPublic%2FPortal%2FLatestNews%2FFAQs+on+PGMER-2023.pdf), and [NMC clarification on three-month DRP](https://www.nmc.org.in/MCIRest/open/getDocument?path=%2FDocuments%2FPublic%2FPortal%2FLatestNews%2Fdocument-151_merged.pdf).
- No direct database query or SQL command was run. The department configuration was saved through the authorized HOD settings page; no patient logs or synthetic resident activity were created.
