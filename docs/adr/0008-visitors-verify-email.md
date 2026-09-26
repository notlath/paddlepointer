---
status: accepted
---

# Visitors verify email ownership before signing in

In the Next.js application, Visitors must verify that they control the email address they use to sign in by entering a one-time code. This prevents someone from accessing another Visitor's match history by entering that person's email and works when the Visitor reads email on a phone but scores on a shared device. The change requires a working transactional email service. This decision does not include marketing consent, Lead collection, or export behavior described in proposed ADR 0006.
