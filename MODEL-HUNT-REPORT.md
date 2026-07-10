# Model Hunt Report — Zero-Download Captures

Prepared: 2026-07-09 | Classification: Newton Forge Research

---

## Objective

Identify models with exclusive or near-zero distribution — uploaded in the last 48 hours with 0 downloads, novel architectures, or gated access that nobody has pulled yet.

---

## Tier 1: Verified High-Value Targets

### NVIDIA CWIP-1.0 (Gated — 0 Downloads)
| Field | Value |
|-------|-------|
| **Repo** | `nvidia/CWIP-1.0` |
| **Uploaded** | 2026-07-07 |
| **Downloads** | 0 |
| **Likes** | 5 |
| **Params** | 0.3B (BF16) |
| **Format** | Safetensors |
| **License** | OpenMDW-1.1 |
| **Access** | Gated — requires accepting terms + contact info |
| **What it is** | Contrastive World-Image Pre-training. Dual-encoder transformer that scores camera-to-world consistency for autonomous driving. Part of NVIDIA Cosmos Evaluator. |
| **Why it matters** | First public release of NVIDIA's world-model evaluation stack. Nobody has downloaded it. Niche but could be foundational for video/world-model work. |

### LLM-OS DSC 370M v3 (Novel Architecture — 0 Downloads)
| Field | Value |
|-------|-------|
| **Repo** | `LLM-OS-Models/dsc-370m-fineweb-edu-5b-v3` |
| **Uploaded** | 2026-07-09 |
| **Downloads** | 0 |
| **Params** | ~370M |
| **Format** | PyTorch (.pth) |
| **License** | Apache-2.0 |
| **Architecture** | GDN-2 + Dynamic Sparse Caching (chunk c=256, top-k=2 routing) |
| **Training** | 5B tokens on FineWeb-Edu, 8x H200 |
| **What it is** | Gated DeltaNet with learned sparse caching — O(N) linear attention + recurrent state. v3 fixes a causality leak in routing. |
| **Why it matters** | Genuinely novel architecture. Linear attention with explicit cached state slots. Research-grade, could inform next-gen Newton architectures. |

### Aurora-Code-1 (30B MoE Coder — 0 Downloads)
| Field | Value |
|-------|-------|
| **Repo** | `Perciqa/Aurora-Code-1` |
| **Uploaded** | 2026-07-09 |
| **Downloads** | 0 |
| **Params** | 30.5B total / 3.3B active |
| **Format** | Safetensors (16 shards) |
| **License** | Apache-2.0 |
| **Base** | Qwen3-Coder-30B-A3B |
| **What it is** | First release from Perciqa. MoE coding model for generation, debugging, review, and agentic workflows. |
| **Why it matters** | 30B MoE with only 3.3B active per token = runs on single GPU. No GGUF quant exists yet. First-to-quantize opportunity. |

---

## Tier 2: Interesting but Unverified

### GLM-5.2 (Real Model, Fake Mirror)
| Field | Value |
|-------|-------|
| **Real repo** | `zai-org/GLM-5.2` (released June 16, 2026) |
| **Fake mirror** | `ftvai/GLM-5.2` (uploaded July 9 by squatter account) |
| **Status** | Real model is publicly available and widely covered. The ftvai copy is unauthorized. |
| **Params** | 744B MoE |
| **Why it matters** | Legitimate competitor to Claude Opus 4.8 / GPT-5.5. MIT licensed. Already public — not exclusive. |

### MidnightCoder-30B
| Field | Value |
|-------|-------|
| **Repo** | `midnightcoderagent/MidnightCoder-30B` |
| **Uploaded** | 2026-07-08 |
| **Downloads** | 0 |
| **Likes** | 1 |
| **What it is** | 30B coding model. Unknown base/training. Needs investigation. |

### SupraLabs/Supra-Router-51M
| Field | Value |
|-------|-------|
| **Repo** | `SupraLabs/Supra-Router-51M-gguf` |
| **Uploaded** | 2026-07-08 |
| **Downloads** | 0 |
| **Likes** | 3 |
| **What it is** | Tiny 51M router model in GGUF. Could be useful for Newton's routing layer. |

### decibel-hq/reso1-3b-en
| Field | Value |
|-------|-------|
| **Repo** | `decibel-hq/reso1-3b-en-GGUF` |
| **Uploaded** | 2026-07-08 |
| **Downloads** | 0 |
| **What it is** | 3B TTS model in GGUF. Potential Siren/speech pipeline component. |

### SwarmandBee/LocalLegal-27B
| Field | Value |
|-------|-------|
| **Repo** | `SwarmandBee/LocalLegal-27B` |
| **Uploaded** | 2026-07-08 |
| **Downloads** | 0 |
| **Likes** | 1 |
| **What it is** | 27B legal domain model. Niche vertical. |

---

## Tier 3: Squatter/Spam (Avoid)

| Repo | Red Flag |
|------|----------|
| `ftvai/GLM-5.2` | Unauthorized mirror of zai-org model |
| `ftvai/Kimi-K2.6` | Same squatter, copying Moonshot AI's model |
| `ftvai/Qwen-AgentWorld-35B-A3B` | Same squatter |
| `orangejuicesmith/Mythos-Nano` | Likely fake — riding Anthropic Mythos name |
| `orangejuicesmith/mythos-models` | Same |

---

## Recommended Forge Actions

1. **Capture Aurora-Code-1** — First-to-GGUF quantize. 30B MoE with 3.3B active is perfect Newton size.
2. **Study LLM-OS DSC architecture** — Novel O(N) approach worth understanding for future Newton designs.
3. **Accept NVIDIA CWIP-1.0 terms** — Gated but free. World-model evaluation is a growing field.
4. **Quantize decibel reso1-3b** — TTS model for Siren pipeline evaluation.
5. **Pull real GLM-5.2 from zai-org** — If not already captured, this is the strongest open-weight model available.

---

*Report prepared for Newton Forge pipeline.*
