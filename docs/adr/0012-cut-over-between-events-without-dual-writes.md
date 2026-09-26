---
status: accepted
---

# Cut over between Events without dual-writing

Production cutover will happen between Events with a brief write freeze and final data sync. The existing MySQL database remains read-only after cutover; once Supabase accepts its first production write, recovery is by fixing forward rather than reverse-syncing writes into MySQL. This avoids dual-write consistency risk and makes the write freeze and pre-cutover validation explicit release gates.
