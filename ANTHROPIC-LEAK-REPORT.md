# Anthropic Security Incidents Report — 2026

Prepared: 2026-07-09 | Classification: Internal Research

---

## Executive Summary

Three verified security exposures occurred at Anthropic between March-April 2026. A fourth viral claim ("Obsidian Brain leak," July 2026) is fabricated engagement bait with no factual basis. This report documents the real incidents with technical detail.

---

## Incident 1: Claude Code Source Code Leak (npm)

**Date:** March 31, 2026
**Severity:** HIGH
**Discovery:** Security researcher Chaofan Shou (@shoucccc on X)
**Duration:** ~3 hours 8 minutes before remediation

### What Happened

Anthropic published Claude Code v2.1.88 to the npm registry with a 59.8 MB `.map` source map file included. This debugging artifact mapped the minified production JavaScript back to the original TypeScript source, hosted on Anthropic's own R2 cloud storage bucket as a directly downloadable ZIP archive.

### Root Cause

Claude Code uses the Bun runtime, which generates source maps by default unless explicitly disabled. The `.map` file was not excluded via `.npmignore` or a `files` whitelist in `package.json`. Notably, this was reportedly the **third instance** of this class of error — earlier 2025 versions also shipped source maps before being pulled.

### Scale of Exposure

| Metric | Value |
|--------|-------|
| Lines of code | ~512,000 |
| TypeScript files | ~1,900 |
| GitHub copies | 50,000+ (forks/archives within hours) |
| X post views | Millions |

### What Was Exposed

**Architecture:**
- ~40 discrete tools, each with independent permission gating
- Query engine (~46,000 lines): LLM API calls, streaming, caching, orchestration
- Multi-agent coordination: spawning and managing parallel worker agents
- IDE bridge integrations using JWT authentication
- Persistent memory system

**Unreleased Features (behind feature flags):**
- **KAIROS**: Autonomous daemon mode — Claude Code operates as a background agent performing memory consolidation while user is idle
- **ULTRAPLAN**: Offloading complex planning tasks to cloud infrastructure
- **BUDDY**: Tamagotchi-style AI companion with species, rarity tiers, and stats

**Internal Model Codenames:**
- **Capybara** = Claude 4.6 variant
- **Fennec** = Opus 4.6 variant

**"Undercover Mode" Subsystem:**
A system designed to prevent Claude Code from revealing internal information when contributing to public open-source repos. Instructs the model to never reference internal codenames, unreleased versions, internal Slack channels, or the fact that it is an AI. The irony: the subsystem built to prevent leaks was itself leaked.

### Security Implications

Per Reddit analysis:
- Full prompt injection defense logic exposed — attackers can study bypass vectors
- Complete system prompts revealed — no more guessing preambles to craft adversarial content
- Orchestration logic visible — reference manual for designing LLM-based agents

### Compounding Factor

On the same day (March 31), a separate supply-chain attack hit the **axios** npm package. Malicious versions 1.14.1 and 0.30.4 containing a Remote Access Trojan were published between 00:21-03:29 UTC. Claude Code depends on axios — any install/update during that window may have pulled compromised code.

### Anthropic Response

Statement to CNBC: "A release packaging issue caused by human error, not a security breach." No customer data or credentials involved. Affected npm versions unpublished. No detailed public remediation steps disclosed.

**Sources:** InfoQ (Apr 7), The Guardian (Apr 1), Silicon Republic (Apr 1), Layer5, Zscaler, Medium, multiple GitHub archives

---

## Incident 2: Unreleased Model Details Exposure

**Date:** March 26, 2026
**Severity:** MEDIUM
**Discovery:** Fortune (exclusive report)

### What Happened

Anthropic inadvertently revealed details of an upcoming model release, an exclusive CEO event, and other internal data through a publicly accessible data cache.

### What Was Exposed

- Unreleased model specifications and capabilities
- Internal CEO event planning details
- Other internal operational data

**Source:** Fortune exclusive (March 26, 2026)

---

## Incident 3: Claude Mythos Internal Leak

**Date:** ~April 2026
**Severity:** MEDIUM-HIGH
**Coverage:** Mashable, Spiceworks

### What Happened

Internal documents describing Anthropic's most powerful unreleased model, **Claude Mythos**, were discovered in a publicly accessible data cache. This occurred less than a week after Incident 2.

### What Was Exposed

- Model name and capabilities of Claude Mythos
- Internal development roadmap details
- Performance benchmarks and positioning

### Timing

Spiceworks noted: "It's hardly a coincidence that the initial Mythos data leak occurred on the exact same day that Bloomberg first reported on Anthropic's IPO" (April 22 reporting).

**Sources:** Mashable, Spiceworks (April 22, 2026)

---

## Non-Incident: "Obsidian Brain" Viral Hoax (July 2026)

**Date:** July 5-8, 2026
**Verdict:** FABRICATED

### The Claim

Viral social media posts claim an Anthropic engineer earning $2.2M/year leaked the company's internal "Obsidian Brain" knowledge graph (8,893 nodes, 4,729 links, 9,000+ documents) and was fired the same day.

### Evidence of Fabrication

| Signal | Finding |
|--------|---------|
| Original source | @0xDeliriumm on X, **June 10** — showcasing their own personal Obsidian vault. Zero Anthropic connection |
| Visualization | Labels read "HL 3", "Neurons: 27", "Activation: ReLU (click)" — a neural network visualizer, NOT an Obsidian graph |
| Amplification | Coordinated ring: chatgptricks, futurewalt.ai, activeprogrammer, techin24hours, theaifield, stics.ai — all cross-promote and credit "X / 0xDeliriumm" |
| Credible coverage | Zero pickup from Guardian, Fortune, Mashable, or any outlet that covered the real leaks |
| Anthropic response | None (because it didn't happen) |

### Assessment

Engagement-farming accounts exploited public memory of the real March/April leaks to manufacture a new story. The specific numbers (8,893 nodes) come from @0xDeliriumm's personal vault demo, reattributed without consent. The "$2.2M engineer fired" backstory is entirely fabricated.

---

## Timeline Summary

| Date | Incident | Severity | Verified |
|------|----------|----------|----------|
| Mar 26, 2026 | Unreleased model details in public cache | MEDIUM | YES — Fortune |
| Mar 31, 2026 | Claude Code source leak via npm .map file | HIGH | YES — multiple sources, Anthropic confirmed |
| ~Apr 2026 | Claude Mythos internal docs exposed | MEDIUM-HIGH | YES — Mashable, Spiceworks |
| Jul 5-8, 2026 | "Obsidian Brain" knowledge graph leak | N/A | NO — fabricated |

---

## Key Takeaways

1. **Pattern of build/deploy errors**: The npm source map leak was the third such incident. Anthropic's CI/CD pipeline lacks adequate pre-publish validation.
2. **Compounding exposures**: Three incidents within ~2 weeks (late March to mid-April) suggests systemic process gaps, not isolated mistakes.
3. **Information persistence**: 50,000+ GitHub copies of the source code ensure permanent exposure regardless of npm remediation.
4. **Social media amplification risk**: Fabricated stories exploit real incidents to generate engagement, making threat assessment harder for security teams.

---

*Report prepared for AXE internal review.*
