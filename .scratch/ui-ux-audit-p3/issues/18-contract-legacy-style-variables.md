# 18 — Contract: semantic tokens become the only styling vocabulary

**What to build:** The stylesheet finishes the token migration. Original brand variables survive only as private palette values inside the token definitions, or are folded into the semantic tokens directly. An automated guard stops new raw colors or legacy variable references from creeping back in.

Origin: UI polish audit finding M5. Contract step of the token migration.

**Blocked by:** 14, 15, 16, and 17 (every migrate batch)

**Status:** ready-for-agent

- [ ] No style rule outside the token definitions references an original brand variable
- [ ] No style rule outside the token definitions uses a raw hex or rgba color
- [ ] The semantic token comment block no longer describes the tokens as an unused expand step, and documents each role and its foreground pairing
- [ ] An automated stylesheet check fails when a raw color or legacy variable reference appears outside the token definitions
- [ ] There is no intended visual change, confirmed by a responsive visual check at 320, 375, 768, 1024, 1280, and 1440 pixel widths plus TV mode
- [ ] The existing automated test suite remains green
