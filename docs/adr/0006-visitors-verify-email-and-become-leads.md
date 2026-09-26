---
status: proposed
---

> Split decision on 2026-09-26: email verification by code is accepted in ADR 0008. This proposal remains parked for optional Lead consent, collection, and export; those features are outside the Next.js migration.

# Visitors verify their email with a code, and consenting Visitors become Leads

Visitors signed in with any email and nothing checked it, so anyone could sign in as anyone and score as them. MTC also wants the emails of people who visit as sales leads. A Visitor now proves they own the email by typing a 6-digit Sign-in code sent to it. The sign-in form labels the field "Company Email" to nudge people toward a work address, but the server accepts any valid email it has verified. A Visitor becomes a Lead only by ticking an optional marketing-consent checkbox, which is unticked by default and never required to sign in. The Super Admin exports Leads as CSV.

## Considered Options

- **Accept only company domains (refuse gmail.com, yahoo.com and similar).** Better Leads, but many people at an event have only a personal address and could not score. A domain list is also never complete. Rejected in favour of the label nudge.
- **Emailed sign-in link instead of a code.** People often score on a shared tablet but read email on their phone, and a link opens on the phone.
- **Require consent to sign in.** Under the Philippine Data Privacy Act (RA 10173), consent tied to using the app is not freely given.
- **Send Leads to a CRM or Qlik.** Not needed yet. CSV works with any tool MTC picks later.

## Consequences

- Replaces the ticket-08 rule "Players/Visitors store no password" for Visitors. They still have no password; the Sign-in code works once and expires.
- Players keep signing in with their username alone. This is an accepted risk: anyone who knows a Player's username can act as that Player.
- Visitor accounts from before this change are not Leads, because they never consented. Their open sessions end, and they must verify on their next sign-in.
- A Visitor whose session ends must verify again. The browser no longer signs Visitors back in on its own.
- The app now sends email, so production needs a mailbox on mtc.com.ph and correct SPF/DKIM records.
- MTC's Data Protection Officer approves the consent wording and privacy notice before this reaches production. Each Lead records the wording version they agreed to.
