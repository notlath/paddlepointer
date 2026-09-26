# 04 — Super Admin exports Leads as CSV

**What to build:** A new Super Admin-only action, `export_leads` in the access policy module, and an endpoint that downloads a CSV of Leads (CONTEXT.md: Lead). A Lead is a Visitor who consented and has not withdrawn; Visitors who never consented are left out. Columns:
- email
- display name
- email domain
- verified at
- consented at
- consent wording version
- last sign-in
- Visitor Matches scored

The file is UTF-8 with a BOM so Excel shows names correctly, and is named `paddlepoint-leads-YYYY-MM-DD.csv`. Any cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading apostrophe, so a crafted display name cannot run as a formula when the file is opened in Excel. The Super Admin gets an "Export Leads" button with a Lead count in the admin area.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Only a Super Admin can download: signed out is 401, and Admin, Player and Visitor are 403
- [ ] Only consenting, not-withdrawn Visitors appear; Visitors who never consented do not
- [ ] Columns and file name are as above; the file opens in Excel with accented names intact
- [ ] A display name of `=HYPERLINK(...)` is exported as text starting with an apostrophe
- [ ] The button shows the current Lead count and downloads the file
- [ ] PHP tests cover access, filtering and formula escaping
