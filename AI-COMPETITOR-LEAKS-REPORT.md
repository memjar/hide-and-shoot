# AI Industry Security Incidents Report — 2023-2026

Prepared: 2026-07-09 | Classification: Internal Research
Covers: OpenAI, Meta, xAI/Grok, Anthropic

---

## ANTHROPIC

### 1. Claude Code Source Code Leak (Mar 31, 2026) — HIGH

- **Vector:** npm packaging error shipped 59.8 MB `.map` file in v2.1.88
- **Discovery:** Security researcher Chaofan Shou
- **Exposure:** ~512,000 lines TypeScript, ~1,900 files, 3h 8m window
- **Copied:** 50,000+ GitHub forks within hours
- **Revealed:** 40 tools with permission gating, 46K-line query engine, multi-agent coordination, unreleased features (KAIROS daemon, ULTRAPLAN, BUDDY companion), internal model codenames (Capybara = Claude 4.6, Fennec = Opus 4.6), "Undercover Mode" subsystem
- **Root cause:** Bun runtime generates .map files by default; third instance of this error class
- **Anthropic response:** "Human error, not a security breach" (CNBC)
- **Sources:** InfoQ, The Guardian, Silicon Republic, Layer5, Zscaler

### 2. Unreleased Model Details (Mar 26, 2026) — MEDIUM

- **Vector:** Publicly accessible data cache
- **Exposed:** Upcoming model specs, CEO event details, internal operational data
- **Source:** Fortune exclusive

### 3. Claude Mythos Docs (Apr 2026) — MEDIUM-HIGH

- **Vector:** Publicly accessible data cache (same class as #2)
- **Exposed:** Internal docs on most powerful unreleased model "Claude Mythos"
- **Timing:** Same day as Bloomberg IPO reporting (Apr 22)
- **Sources:** Mashable, Spiceworks

### 4. "Obsidian Brain" (Jul 2026) — FABRICATED

- Engagement bait built on @0xDeliriumm's personal Obsidian vault demo (Jun 10)
- Visualization is a neural network visualizer, not Obsidian
- Coordinated amplification ring across 10+ Instagram accounts
- Zero credible coverage. No Anthropic response (didn't happen)

---

## OPENAI

### 1. TanStack npm Supply Chain Attack (May 2026) — HIGH

- **Vector:** Hackers hijacked TanStack open source packages on npm, pushed malicious updates
- **Impact:** Compromised OpenAI internal repositories
- **Duration:** Malicious versions live Mar 31 00:21-03:29 UTC
- **OpenAI response:** "No evidence that OpenAI products or user data were compromised or exposed" (blog post May 13)
- **Sources:** TechCrunch (May 14), Reuters (May 14), OpenAI blog

### 2. Third-Party Vendor Data Exposure (Nov 2025) — MEDIUM-HIGH

- **Vector:** Breach at Mixpanel (third-party analytics vendor)
- **Exposed:** User names and usage data
- **Source:** Metomic, Reddit r/cybersecurity

### 3. ChatGPT Codex Vulnerability (Dec 2025 / Feb 2026) — MEDIUM

- **Vector:** Critical data leak flaw in Codex product
- **Discovery:** Disclosed December 2025
- **Fix:** Patched February 5, 2026
- **Source:** LinkedIn (The Cyber Security Hub)

### 4. Canada Privacy Investigation (2026) — REGULATORY

- **Finding:** OpenAI failed to obtain valid consent for collection and use of personal information
- **Authority:** Privacy Commissioner of Canada (PIPEDA-2026-002)
- **Impact:** Regulatory action, policy changes required
- **Source:** Office of the Privacy Commissioner of Canada (May 6, 2026)

### 5. Internal Forum Breach (2023) — MEDIUM

- **Vector:** Hackers accessed internal discussion forum
- **Exposed:** Internal discussions, employee communications
- **Note:** Not disclosed publicly until later reporting
- **Sources:** Multiple outlets (2023-2024 reporting)

---

## META

### 1. LLaMA Model Weights Leak (Mar 2023) — CRITICAL

- **Vector:** Model weights leaked via torrent within one week of launch
- **Impact:** Complete LLaMA model weights publicly available, irreversible
- **Congressional response:** Senator Blumenthal letter (Jun 6, 2023) expressing concern over misuse potential
- **Long-term:** Catalyzed the entire open-weights LLM ecosystem; weights remain permanently public
- **Sources:** Reddit r/LocalLLaMA, U.S. Senate letter, widespread coverage

### 2. llama-stack Critical RCE Vulnerability (Jan 2025) — HIGH

- **CVE:** CVE-2024-50050
- **Vector:** Remote code execution on llama-stack inference server from the network
- **Impact:** Attackers could execute arbitrary code on any server running meta-llama/llama-stack
- **Source:** Oligo Security (Jan 23, 2025)

### 3. "Bleeding Llama" Memory Leak (2026) — HIGH

- **CVE:** CVE-2026-7482
- **Vector:** Crafted GGUF model file exploits Ollama servers
- **Impact:** Leaks chats, API keys, and prompts from process memory
- **Scale:** 300,000 exposed Ollama servers
- **Source:** Pasquale Pillitteri security research

### 4. Massive Copyright Scraping Lawsuit (May 2026) — LEGAL

- **Allegation:** Meta, at Zuckerberg's direction, scraped/torrented/downloaded unauthorized copies of millions of copyrighted works for LLaMA training
- **Plaintiffs:** Publishers and authors coalition
- **Source:** Words & Money (May 5, 2026)

---

## xAI / GROK

### 1. Private API Key Leak — SpaceX & Tesla Models (May 2025) — CRITICAL

- **Vector:** xAI employee pushed private API key to public GitHub repository
- **Duration:** Key was live and exploitable for **2 months** before discovery
- **Exposed:** Access to **52 unreleased xAI models** including private fine-tuned LLMs for SpaceX and Tesla internal use
- **Discovery:** GitGuardian detected the exposed secret
- **Disclosure issues:** GitGuardian reported critical flaws in xAI's disclosure handling process
- **DOGE connection:** OECD report identifies the leaker as a government staffer (DOGE-affiliated)
- **Sources:** Krebs on Security (May 1, 2025), GitGuardian (May 7, 2025), Wiz, Obsidian Security, Aembit, OECD AI Policy Observatory (Jul 15, 2025)

### 2. Grok Sexualized Content / Privacy (Jan 2026) — REGULATORY

- **Vector:** Grok's @Grok X account generating sexualized content from user prompts
- **Response:** xAI blocked the account from responding to such prompts (Jan 8, 2026)
- **Authority:** Privacy Commissioner of Canada investigation (PIPEDA-2026-004)
- **Source:** Office of the Privacy Commissioner of Canada (Jun 11, 2026)

---

## CROSS-INDUSTRY COMPARISON

| Company | Incidents | Most Severe | Root Pattern |
|---------|-----------|-------------|--------------|
| **Anthropic** | 3 real + 1 hoax | Source code leak (npm .map) | Build pipeline errors, repeated same mistake |
| **OpenAI** | 4+ | Supply chain attack + vendor breach | Third-party dependency risk |
| **Meta** | 4+ | LLaMA weights leak (permanent) | IP containment failure, infra vulnerabilities |
| **xAI/Grok** | 2+ | API key exposing 52 models inc. SpaceX/Tesla | Credential hygiene, employee error |

### Key Patterns Across Industry

1. **npm/package supply chain** is the #1 attack surface (Anthropic .map file, OpenAI TanStack, axios RAT)
2. **Employee credential leaks** remain a persistent class (xAI GitHub key, Anthropic data caches)
3. **Third-party vendor risk** is underestimated (OpenAI/Mixpanel breach)
4. **Model weight containment** is effectively impossible once leaked (Meta LLaMA precedent)
5. **Social media fabrication** exploits real incidents to generate fake ones (Obsidian Brain hoax)

---

## RECOMMENDATIONS

1. Pre-publish CI validation for all package registries (npm, PyPI) — block .map, .env, credential files
2. Secret scanning on all employee repos (GitGuardian, TruffleHog)
3. Third-party vendor security audits with breach notification SLAs
4. Social media monitoring for fabricated leak narratives that could trigger unnecessary incident response
5. Supply chain attestation (SLSA, Sigstore) for all published packages

---

*Report prepared for AXE internal review.*
