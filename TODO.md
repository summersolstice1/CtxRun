# AI Module Roadmap: Skills + MCP

## Purpose

Build a Codex-inspired capability system for CtxRun's AI module so that:

- local tools are no longer hardcoded into a thin frontend loop
- skills become reusable, discoverable, scoped capability packs
- MCP becomes a managed runtime subsystem instead of "dynamic tools"
- approvals, credentials, server status, and event streaming become first-class

This roadmap is based on:

- current CtxRun architecture under `src/lib/agent`, `src/components/features/spotlight`, `src/store`, `src-tauri`
- local Codex reference snapshot under `ctxrun_docs/codex`

## Core Decisions

### Decision 1: Skills first, MCP second

Reason:

- skills have lower runtime complexity
- skills create immediate product value
- MCP depends on configuration, approvals, secret storage, status reporting, and long-lived connections

Conclusion:

- ship `Skills MVP` before `MCP MVP`

### Decision 2: Do not copy Codex protocol surface 1:1

Reason:

- CtxRun is not currently running a full app-server style backend
- cloning all JSON-RPC methods would add large complexity without near-term product payoff

Conclusion:

- copy Codex's architecture patterns, not its full public protocol
- keep the first implementation desktop-local and product-focused

### Decision 3: MCP runtime must live in Tauri/Rust, not mainly in frontend TS

Reason:

- MCP needs long-lived connections
- OAuth and token storage should not be handled in plain frontend state
- approval and sandbox decisions need a trusted execution boundary

Conclusion:

- frontend renders state and issues requests
- backend owns MCP server config, auth, connection lifecycle, and tool execution

### Decision 4: Skills are not prompt templates

Reason:

- Codex treats skills as structured capability units with metadata, scope, policy, and dependencies
- plain prompt concatenation becomes unmanageable and unsafe at scale

Conclusion:

- introduce a real skill model with metadata and lifecycle
- inject skill instructions as structured context items, not blind string append

## Codex Practices We Should Reuse

### Skills

- explicit invocation using `$skill-name` or structured selection
- repo/user/system scope precedence
- enable/disable per skill
- cached discovery with reload on change
- skill metadata for description, interface, policy, dependencies
- structured skill injection from `SKILL.md`
- optional implicit invocation based on script/doc usage

Reference files:

- `ctxrun_docs/codex/codex-rs/core/src/skills/loader.rs`
- `ctxrun_docs/codex/codex-rs/core/src/skills/model.rs`
- `ctxrun_docs/codex/codex-rs/core/src/skills/manager.rs`
- `ctxrun_docs/codex/codex-rs/core/src/skills/injection.rs`
- `ctxrun_docs/codex/codex-rs/core/src/skills/invocation_utils.rs`

### MCP

- config-driven server definitions
- explicit server status listing
- qualified tool naming to avoid collisions
- approval as part of normal runtime flow
- OAuth login and secure token persistence
- stdio support first, then streamable HTTP
- tool and resource discovery exposed to UI
- skill-to-MCP dependency mapping

Reference files:

- `ctxrun_docs/codex/codex-rs/core/src/config/types.rs`
- `ctxrun_docs/codex/codex-rs/core/src/mcp/mod.rs`
- `ctxrun_docs/codex/codex-rs/core/src/mcp_connection_manager.rs`
- `ctxrun_docs/codex/codex-rs/core/src/mcp_tool_call.rs`
- `ctxrun_docs/codex/codex-rs/core/src/mcp/skill_dependencies.rs`
- `ctxrun_docs/codex/codex-rs/keyring-store/src/lib.rs`

## Current CtxRun Gaps

- current agent loop is frontend-driven and still centered on `messages + hardcoded tools`
- current default tool policy is a fixed allow-list
- current chat UI only has lightweight message/tool trace state
- current AI config persists secrets in app-local JSON
- current tool registry does not model dynamic capabilities, skill metadata, or MCP provenance
- current approval support exists in tool runtime, but not yet as a unified AI runtime flow

## Target Architecture

### 1. Capability Layer

Introduce a unified `CapabilityRegistry` abstraction that can expose:

- built-in local tools
- skill-provided capabilities
- MCP-provided tools
- future plugin/app capabilities

Every capability should carry:

- stable id
- source type: `builtin | skill | mcp | plugin`
- display metadata
- input schema
- risk/approval metadata
- enable/disable state
- provenance and owning scope

### 2. Turn Runtime Layer

Introduce a structured turn/event model inspired by Codex items:

- `assistantMessage`
- `reasoning`
- `toolCall`
- `approvalRequest`
- `skillInjection`
- `mcpServerStatus`
- `mcpToolCall`
- `error`

The goal is not full protocol parity with Codex.

The goal is to stop treating everything as raw message text and to give UI enough structure to render:

- approvals
- live tool state
- skill injections
- MCP server connection status
- resumable multi-step execution

### 3. Secret and Config Layer

Split config into:

- non-secret UI settings in existing persisted app config
- secret values in OS keyring
- structured runtime config for skills and MCP in a dedicated config file

Recommended direction:

- keep user preferences in existing JSON-backed store
- add a new runtime config file for capability settings
- store provider API keys and MCP OAuth tokens via keyring-backed Tauri commands

### 4. Approval Layer

Approval decisions should support:

- allow once
- allow for session
- persistent rule if product policy permits
- decline

Approval should be attached to a concrete pending action item, not handled as a side channel.

### 5. MCP Runtime Layer

Backend-managed subsystem should own:

- config loading
- server startup/shutdown
- connection pooling
- timeout handling
- tool name qualification
- auth status
- listing tools/resources/resource templates
- per-call approval and telemetry

## Roadmap

## Phase 0 - Foundation Refactor

Priority: P0  
Effort: Large  
Goal: create the minimum runtime foundation needed before skills and MCP

### Tasks

- [ ] Create `CapabilityRegistry` and stop assuming the registry only contains static built-in tools.
- [ ] Separate `tool definition` from `tool availability`, so the same capability can be discovered but disabled.
- [ ] Add provenance fields to capability definitions.
- [ ] Add a first-class turn item/event model between runtime and UI.
- [ ] Extend chat state so it can render items instead of only appending text and tool traces.
- [ ] Introduce a generic approval request/result data model.
- [ ] Define a `SecretStore` abstraction and implement a Tauri keyring-backed version.
- [ ] Remove direct storage of sensitive credentials from plain persisted JSON where feasible.
- [ ] Define a dedicated runtime config model for skills and MCP.
- [ ] Audit existing `tool-runtime` approval behavior and decide what can be reused directly.

### Candidate code areas

- `src/lib/agent/types.ts`
- `src/lib/agent/runtime.ts`
- `src/lib/agent/index.ts`
- `src/components/features/spotlight/hooks/useSpotlightChat.ts`
- `src/lib/llm.ts`
- `src/store/useAppStore.ts`
- `src/lib/storage.ts`
- `src-tauri/crates/tool-runtime`
- new backend modules for `secrets`, `capabilities`, `events`

### Exit criteria

- capability discovery is no longer tied to one hardcoded registry singleton
- chat runtime can render structured execution items
- approvals have a stable UI and data path
- sensitive keys no longer need to live in raw app-local JSON

## Phase 1 - Skills MVP

Priority: P1  
Effort: Medium to Large  
Goal: add real local skills with explicit invocation and structured injection

### Tasks

- [ ] Define `SkillMetadata` for name, description, scope, interface, policy, dependencies, enabled state.
- [ ] Support local skill roots with precedence:
  - repo-local
  - user-level
  - bundled/system
- [ ] Decide the first supported on-disk format:
  - `SKILL.md` only with lightweight frontmatter
  - or `SKILL.md` plus optional sidecar metadata file
- [ ] Implement skill discovery and cache.
- [ ] Add change detection / reload support.
- [ ] Add explicit skill invocation using `$skill-name` in prompt text.
- [ ] Add UI-assisted explicit invocation from a skill picker.
- [ ] Inject selected skill contents as a structured runtime item.
- [ ] Add per-skill enable/disable UI.
- [ ] Show injected skills in the chat transcript or side panel so users understand context.
- [ ] Add token budgeting rules so large skill files do not silently bloat prompts.

### UX rules

- skills should be visible and inspectable
- skill invocation should be explicit in MVP
- injection should be explainable to the user
- disabled skills should still be discoverable in settings

### Candidate code areas

- new `src/lib/skills/*` or backend equivalent
- `src/components/settings/sections/AISection.tsx` or a new Skills settings section
- `src/components/features/spotlight/*`
- `src/lib/agent/runtime.ts`

### Exit criteria

- users can install/place a skill in a supported root and see it in UI
- users can invoke a skill explicitly
- runtime injects skill instructions in a structured way
- users can enable or disable a skill without editing code

## Phase 2 - Skills Hardening

Priority: P2  
Effort: Medium  
Goal: move from usable to scalable skill behavior

### Tasks

- [ ] Add scope conflict resolution and precedence rules.
- [ ] Add validation errors for malformed skill files.
- [ ] Add analytics/telemetry hooks for skill usage.
- [ ] Add implicit skill invocation only after explicit invocation is stable.
- [ ] Detect script/doc path patterns similar to Codex's invocation utilities.
- [ ] Add warning surfaces when a skill could not be loaded or injected.
- [ ] Add tests for duplicate names, scope shadowing, malformed frontmatter, and disabled state.

### Exit criteria

- skills are stable under duplicate names and multiple scopes
- malformed skills fail safely and visibly
- optional implicit invocation is gated and explainable

## Phase 3 - MCP MVP

Priority: P3  
Effort: Large  
Goal: introduce backend-managed MCP servers and expose their tools safely

### Scope for MVP

- support `stdio` transport first
- defer `streamable-http` until the base runtime is stable
- start with tool calls only
- resource and resource-template browsing can be read-only and UI-limited at first

### Tasks

- [ ] Define CtxRun MCP config schema inspired by Codex:
  - enabled
  - required
  - startup timeout
  - tool timeout
  - enabled tools
  - disabled tools
  - transport fields
- [ ] Implement backend MCP manager.
- [ ] Implement per-server lifecycle:
  - configured
  - starting
  - ready
  - auth required
  - failed
  - disabled
- [ ] Implement MCP server status listing for the UI.
- [ ] Implement tool discovery from connected MCP servers.
- [ ] Qualify MCP tool names to avoid collisions.
- [ ] Sanitize qualified names for model-facing tool constraints.
- [ ] Route MCP tool calls through the unified approval flow.
- [ ] Record MCP tool call items in the runtime event stream.
- [ ] Show server/tool provenance clearly in the UI.

### Candidate code areas

- new backend crate or module for `mcp-runtime`
- `src-tauri` config/auth commands
- `src/lib/agent` capability registry integration
- settings UI for MCP servers
- spotlight/chat UI for MCP item rendering

### Exit criteria

- a user can configure a stdio MCP server and see it become ready
- discovered MCP tools can be enabled and invoked safely
- MCP tool calls appear as structured items with approval and result state

## Phase 4 - MCP Auth and HTTP Transport

Priority: P4  
Effort: Large  
Goal: support real-world remote MCP integrations

### Tasks

- [ ] Add OAuth login flow for MCP servers that require auth.
- [ ] Store OAuth credentials via keyring-backed secret storage.
- [ ] Add optional callback port and redirect URL configuration.
- [ ] Add `streamable-http` transport support.
- [ ] Add bearer token / env-var backed auth options.
- [ ] Add server reconnect and token refresh behavior.
- [ ] Add auth status surfaces in UI.

### Exit criteria

- remote MCP servers can authenticate without leaking secrets into plain JSON
- auth state is visible, recoverable, and debuggable

## Phase 5 - Skill Dependencies on MCP

Priority: P5  
Effort: Medium  
Goal: let skills declare MCP requirements and guide users to satisfy them

### Tasks

- [ ] Extend skill metadata with MCP dependency declarations.
- [ ] Detect missing MCP server dependencies when a skill is invoked.
- [ ] Prompt the user to install/enable/configure missing MCP servers.
- [ ] Support "install now", "skip", and "do not ask again" style decisions.
- [ ] Show dependency status in skill detail UI.

### Exit criteria

- a skill can declare MCP prerequisites
- missing dependencies are surfaced before failure
- the dependency flow is understandable to the user

## Phase 6 - Product Polish and Observability

Priority: P6  
Effort: Medium  
Goal: make the system operable, debuggable, and user-trustworthy

### Tasks

- [ ] Add event logging for approvals, skill injections, MCP server state changes, and tool outcomes.
- [ ] Add developer diagnostics page for capability registry, skill roots, and MCP server status.
- [ ] Add import/export for non-secret capability configuration.
- [ ] Add tests for provider fallback when tool calling is unsupported.
- [ ] Add resilience tests for MCP timeouts, disconnects, malformed outputs, and approval declines.
- [ ] Add docs for skill authoring and MCP setup.
- [ ] Add examples of bundled first-party skills to set quality bar.

### Exit criteria

- common failures are diagnosable without reading source
- users can inspect why a skill or MCP tool is unavailable
- the feature is supportable in production

## Non-Goals for Initial Release

- full Codex app-server protocol parity
- plugin marketplace on day one
- implicit skill invocation before explicit invocation is reliable
- full MCP resource UX before tool-call safety is complete
- storing secrets in frontend state for convenience

## Product and Security Rules

- never expose a secret value back into normal persisted app JSON
- never auto-enable a newly discovered MCP tool without user visibility
- never silently inject a skill in MVP without a visible record
- always show source/provenance of a capability
- approvals must be attached to a concrete action and reason
- backend should remain the source of truth for risky execution

## Open Questions

- [ ] Should runtime config live in TOML to better match Codex-style layered config?
- [ ] Should skills be implemented first in TypeScript for faster iteration, then moved into Rust if needed?
- [ ] Should agent orchestration remain partly frontend-driven in MVP, or should we move the whole turn runtime to Tauri earlier?
- [ ] How much Codex-like event granularity do we need in v1 versus a thinner item model?
- [ ] Do we want first-party bundled skills in the first milestone or only user/repo skills?

## Recommended Execution Order

1. Finish `Phase 0`.
2. Ship `Phase 1`.
3. Harden with the highest-value parts of `Phase 2`.
4. Ship `Phase 3` with stdio only.
5. Add `Phase 4` for auth and HTTP.
6. Add `Phase 5` after both skills and MCP are stable.
7. Close with `Phase 6`.

## Definition of Success

CtxRun should eventually support the following top-level experience:

- users can discover available capabilities instead of guessing what exists
- users can invoke a skill intentionally and see what it injected
- users can connect MCP servers safely and inspect their state
- tool and MCP actions have visible approvals and results
- secrets are stored in OS-backed secure storage
- the AI module becomes an extensible runtime, not a hardcoded chat helper

## Supplemental Direction - Architecture First, Frontend-Heavy AI

This section adds product-direction guidance on top of the roadmap above.

The main strategic recommendation is:

- CtxRun should not evolve into a generic "AI toolbox" with many unrelated pages.
- CtxRun should evolve into a desktop-native developer action layer.
- Architecture should be prioritized before new AI features.
- AI should feel frontend-native, even when trusted execution stays in Tauri/Rust.

In practice, this means:

- the user should experience AI through a fast, inspectable, multi-surface frontend runtime
- the backend should remain the trusted control plane for execution, secrets, approvals, and long-lived integrations
- every existing module should become part of one capability graph instead of remaining a standalone feature island

## Product Thesis

CtxRun already has the seeds of a differentiated product:

- `Context Forge` can collect and package local project state
- `Spotlight` is a high-frequency entry point
- `Patch Weaver` can turn AI output into code changes
- `Refinery` can provide recent user context
- `Automator` can perform actions in software and browsers
- `Model Miner` can ingest external web knowledge

These are not six separate products.

They should converge into one loop:

1. capture context
2. decide with AI
3. act with approval
4. show result as a reusable artifact

The long-term position should be:

- not "another chat UI"
- not "another launcher with AI attached"
- not "another coding agent clone"
- but a local-first developer operating layer that can observe, reason, and act across workspace, desktop, browser, and system tools

## Why AI Should Be Frontend-Heavy

The product should be AI-heavy in the frontend for UX reasons, not for trust reasons.

Frontend should own:

- conversation/session composition
- event rendering and interaction
- capability discovery UI
- skill selection and inspection
- context preview, trimming, and explainability
- turn history, artifacts, and replay UX
- latency masking, streaming, optimistic rendering, and resumability
- cross-surface entry points such as Spotlight, patch review, and side drawers

Backend should own:

- secret storage
- approval enforcement
- dangerous command execution
- MCP process lifecycle
- browser and desktop automation runtimes
- OS integration
- durable local persistence where trust boundaries matter

The rule should be:

- AI experience in frontend
- AI power boundaries in backend

This is important because the product risk is not that AI is "too frontend".
The real risk is that AI becomes invisible backend machinery with poor UX and weak inspectability.

## Architectural Position

Recommended boundary:

- frontend is the orchestration shell and interaction runtime
- backend is the capability host and trusted execution layer

Avoid these two extremes:

- a purely frontend agent loop with security-sensitive logic leaking into UI state
- a backend-dominant agent runtime that turns the frontend into a thin terminal

Recommended split by responsibility:

### Frontend Responsibilities

- maintain session state and render a structured turn timeline
- assemble user-visible context bundles before model calls
- select and enable skills for a turn
- expose tool provenance and approval state clearly
- let users inspect what was injected, what was called, and what changed
- support multiple AI surfaces backed by one runtime model
- preserve interaction speed and continuity even when backend calls are slow

### Backend Responsibilities

- execute approved actions
- resolve secret-backed provider settings
- host MCP servers and connection state
- provide trusted capability metadata
- persist durable runtime configuration
- emit structured events that frontend can render without guessing
- protect the system from unsafe or malformed tool execution

## Strategic Product Direction

The next stage should prioritize integration over expansion.

Do not primarily ship more standalone modules.
Instead, make current modules composable inside one AI runtime.

High-confidence product bets:

### 1. Spotlight becomes the primary AI entry point

`Spotlight` should become the universal invocation surface for:

- ask
- search
- patch
- run
- inspect
- automate
- reopen recent context/artifacts

The user should not have to decide first which page or feature to open.

### 2. Skills become the packaging layer for expertise

Skills should be more important than prompt templates.

They should package:

- instructions
- context rules
- capability dependencies
- UI affordances
- safety expectations
- reusable workflows

Prompt Verse should gradually become one source of skill content, not a parallel primitive forever.

### 3. Patch, Context, Miner, and Refinery become context channels

These modules should feed the AI runtime as structured inputs:

- workspace context
- diffs and pending edits
- clipboard history
- scraped external knowledge
- saved project memory

This is more valuable than keeping them as isolated tools with separate mental models.

### 4. Automator becomes an action backend, not only a standalone automation page

Automator is strategically important because it gives CtxRun real-world action ability.

It should eventually serve three roles:

- explicit user-authored workflows
- AI-suggested multi-step actions with approval
- skill-backed action primitives for specialized tasks

### 5. MCP should be treated as ecosystem expansion, not first identity

MCP matters because it standardizes external capability access.
But MCP should not become the product story by itself.

The story should remain:

- CtxRun gives developers a local-first AI operating layer
- MCP is one of the ways capabilities enter that layer

## Recommended Internal Model

The system should gradually converge on a model like:

- `Surface`
- `Session`
- `Turn`
- `ContextItem`
- `Capability`
- `Action`
- `Artifact`
- `Approval`
- `Event`

Suggested meanings:

- `Surface`: Spotlight, full chat, patch view, automator assistant panel, future inline widgets
- `Session`: one continuous user interaction state shared across surfaces when appropriate
- `Turn`: one user intent and its execution lifecycle
- `ContextItem`: files, diffs, clipboard items, web content, memory notes, skill injections
- `Capability`: builtin tool, skill capability, MCP tool, plugin-provided action
- `Action`: an invoked operation with approval, status, and output
- `Artifact`: durable outputs such as patch sets, summaries, workflows, notes, extracted docs
- `Approval`: explicit permission decision tied to a concrete pending action
- `Event`: structured runtime emission rendered directly in UI

This model should be expressed first in shared TypeScript types for UI velocity, then mirrored in Rust where trust or persistence requires it.

## Frontend Architecture Priorities

If AI is frontend-heavy, the frontend needs a stronger internal architecture than a simple page-store pattern.

Recommended priorities:

### Priority A - Unified AI Session Store

Create a dedicated session domain instead of spreading AI state across feature-local hooks and stores.

It should own:

- sessions
- turns
- structured events
- pending approvals
- active capabilities
- selected skills
- context attachments
- artifacts generated during a turn
- model/provider metadata needed for rendering

### Priority B - Structured Turn Timeline

Do not render AI interactions as plain alternating chat bubbles only.

The UI should be able to represent:

- assistant output
- tool start
- tool approval required
- tool approved
- tool finished
- MCP server connected/disconnected
- skill injected
- patch generated
- patch applied
- workflow suggested
- workflow executed
- failure with actionable recovery

This timeline is a product advantage, not just an implementation detail.

### Priority C - Capability Explorer and Invocation UI

Users should be able to inspect available capabilities before or during a turn.

Needed UI surfaces:

- capability list
- source/provenance
- risk level
- whether approval is needed
- which skill or MCP server introduced it
- whether it is disabled, missing, or unhealthy

### Priority D - Context Composer

Before a model call, the user should be able to understand what context is being sent.

The composer should show:

- attached files
- inferred diffs
- clipboard items
- mined pages
- memory notes
- injected skills
- estimated token cost
- what was dropped due to budget

### Priority E - Artifact-Centric UX

Important outputs should survive beyond the transient answer bubble.

First-class artifacts should include:

- patch proposals
- workflow drafts
- summaries
- extracted docs
- reusable context bundles
- reusable skill invocation presets

## Backend Architecture Priorities

Even with a frontend-heavy AI product, backend architecture still comes first because it defines safety and scalability.

Recommended priorities:

### Priority 1 - Capability Host

Backend should expose a stable capability inventory to the frontend.

This host should provide:

- canonical capability ids
- capability source type
- execution requirements
- approval metadata
- health/status
- dependency information
- machine-readable schema

### Priority 2 - Approval Kernel

Approval logic should not be duplicated across feature modules.

One approval subsystem should govern:

- exec runtime
- patch application
- automator execution
- MCP tool calls
- future plugin actions

### Priority 3 - Secret and Identity Boundary

All provider keys, OAuth tokens, and other sensitive runtime values should stay out of normal frontend persistence.

Frontend may request capability use.
Frontend should not own the source of truth for secrets.

### Priority 4 - Event Emitter Contract

Backend should emit a stable event stream that the frontend can directly render.

This should reduce frontend guesswork and avoid ad hoc state reconstruction.

### Priority 5 - Long-Lived Runtime Managers

Long-running or stateful subsystems should be centralized in backend managers:

- MCP connection manager
- browser automation manager
- desktop automation state
- indexing/mining workers
- background context collectors where applicable

## How Existing Features Should Converge

### Spotlight

Move from:

- search window plus lightweight chat

Toward:

- command center for AI-assisted action

### Prompt Verse

Move from:

- library of prompts and commands

Toward:

- authoring and distribution layer for skills, snippets, and reusable invocation presets

### Patch Weaver

Move from:

- patch apply and diff utility

Toward:

- primary artifact review surface for coding actions

### Refinery

Move from:

- clipboard history

Toward:

- passive short-term memory channel that can be intentionally attached to turns

### Model Miner

Move from:

- standalone web extraction

Toward:

- external knowledge ingestion capability available from any AI surface

### Automator

Move from:

- standalone workflow designer/executor

Toward:

- action graph runtime that AI can invoke safely with explicit approval and visible state

## Near-Term Roadmap Adjustment

The existing roadmap phases remain valid.
However, execution emphasis should be adjusted as follows:

### First

- finish the capability and approval foundations
- define the frontend session and event model
- make AI interaction inspectable before making it more autonomous

### Second

- ship explicit skills with strong UI visibility
- unify context composition across Spotlight, patch, miner, and clipboard flows
- make artifacts durable and revisitable

### Third

- add MCP as a backend-managed expansion path
- expose MCP tools in the same frontend capability UI
- make dependency status visible before invocation failure

### Fourth

- let Automator participate in agentic flows
- support AI-suggested workflows and step previews
- keep the user in a review-and-approve loop

## Product Non-Goals for This Direction

To stay focused, avoid overcommitting to these too early:

- a general-purpose web SaaS control plane
- multi-user enterprise collaboration as a primary roadmap driver
- autonomous background agents acting without clear visibility
- a plugin marketplace before capability quality and trust UX are strong
- full parity with Codex/OpenHands style backend protocol surfaces

## Success Criteria for This Strategy

This supplemental direction is working if the product starts to feel like:

- one AI runtime with multiple surfaces, not many unrelated tools
- one approval system, not per-feature confirmation logic
- one capability model, not hardcoded tool lists scattered through the app
- one context graph, not separate feature-local attachments
- one artifact flow, not disposable chat output

From the user perspective, the product should feel:

- faster to enter
- easier to trust
- easier to inspect
- easier to reuse
- harder to outgrow
