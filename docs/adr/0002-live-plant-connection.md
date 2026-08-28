# ADR 0002, Connecting to live plant equipment

**Date:** 2026-08-28
**Status:** Proposed, needs a decision. No code has been written against it.

## Context

The HMI builder is now a fairly complete design and proving environment: screens
bound to the ladder program's own tag table, ISA-18.2 alarms, thirty six widget
kinds, faceplates, recipes, roles, and a recorded run. What it does not have is a
connection to real equipment. The runtime is the simulator.

The obvious next step is to make the connection real. Three things stand in the
way, and they are not implementation details.

### 1. It contradicts what the product says in public

The wording is not vague, and it is in three places.

`packages/hmi/src/lib/types.ts`, on the `Protocol` type:

> Configured and exported, never dialled. LADX does not open sockets to plant
> equipment and is not going to.

`content/products.ts`, in the HMI limits:

> It does not talk to plant equipment. The runtime is the simulator, which is
> what makes a screen testable at a desk; the driver settings are recorded for
> handover, not dialled.

The `/hmi` page says the same, and the product FAQ answers "Can it deploy to a
Siemens or Allen Bradley panel?" with "No", adding that the page says so rather
than implying otherwise.

That last clause is the problem. The positioning was written as a deliberate
statement of honesty, and quietly reversing it is worse than never having made
it, because the people most likely to notice are the ones who chose LADX partly
for saying it.

### 2. It contradicts a hard rule for the desktop

`CLAUDE.md`:

> **Desktop must never make outbound network calls.** No `fetch`, no `reqwest`
> to public domains, no telemetry. The only allowed network call is the one-time
> licence activation against `auth.ladx.ai`.

The desktop is the only surface where a live connection is architecturally
possible at all (see below), so any live connection is a change to this rule.

### 3. The web app cannot do it, and the reason is not effort

Worth stating plainly, because "add a connection" sounds like a feature and is
actually two impossibilities stacked.

**A browser cannot speak these protocols.** Modbus TCP, EtherNet/IP and S7 comms
are raw TCP. A browser has no raw socket: it has HTTP, WebSocket, WebRTC and
WebTransport, all of which require the far end to speak them. A PLC does not. No
amount of work in `apps/web` changes this.

**A cloud server cannot reach a plant.** ladx.ai runs on a VPS. The equipment
sits on an OT network behind NAT and a firewall, usually on a separate VLAN and
often with no route to the internet by design. Making it reachable from a public
server means exposing a PLC to the internet, which is the single thing IEC 62443
zone and conduit modelling exists to prevent. The correct answer to "can your
cloud reach my PLC" is "no, and you should be glad".

So the only place a live connection can exist is a process running inside the
customer's network. That is the desktop app, or a new component.

## Options

### A. Leave it. Design and handover, as published.

Zero work. The positioning stays true. The product keeps its actual advantage,
which is that a screen can be proven at a desk against real logic with no
hardware present, and that advantage does not depend on a live connection.

Loses nothing that exists today. Forgoes the commissioning and monitoring market
entirely.

### B. An on-prem gateway, read-only first.

A small separate binary the customer runs on a machine inside their network. It
speaks the plant protocol on one side and a local WebSocket on the other. The
desktop app, or a browser on the same LAN, connects to the gateway; the gateway
connects to the PLC. Nothing leaves the site.

Read-only to begin with: subscribe and display, never write. This halves the risk
surface in the way that matters, because a bug in a read path shows a wrong
number and a bug in a write path moves an actuator.

Keeps the desktop rule almost intact if it is reworded from "no outbound network
calls" to "no calls that leave the customer's network", which is the property
that rule was protecting in the first place. The current wording is a proxy for
"no telemetry, no cloud, nothing phones home", and a LAN socket to a PLC the
customer explicitly configured does not violate that intent.

Costs: a fourth surface to build, sign and support. Protocol stacks are where
the licensing lands (EtherNet/IP and CIP in particular are not simply
implementable, and this is exactly what the "no new vendor connectors without an
ADR" rule is about). OPC UA is the one genuinely open starting point.

### C. Let the desktop connect directly.

Same capability, one fewer component: put the protocol stack in the Tauri app.
Simpler to ship, and worse in two ways. It puts a network stack inside the
signed application the "no outbound calls" rule was written to keep clean, and it
ties the connection's lifetime to a window being open, which is not how anybody
wants a data collector to behave.

### D. Do not connect; make the handover better instead.

The published next step is export to a panel runtime. That is what a customer
who has finished designing a screen actually needs, it does not touch the
positioning, and it is the thing the product page already promises.

## Recommendation

**B, staged, and only if live data is a deliberate strategic move rather than a
feature to have.** Read-only OPC UA through an on-prem gateway, an explicit
rewording of the desktop rule to say what it means, and the product copy changed
openly and in advance rather than quietly.

If the goal is instead to make what exists more valuable, **D** is the better use
of the same effort, and it is the one the product has already told people is
coming.

What should not happen is the middle path: a connection added quietly, positioned
as a historian or a driver, in a safety-adjacent domain, against text on the site
that says it will never do that.

## Consequences

Of B, if chosen:

- A new surface, `apps/gateway`, with its own build, signing and release.
- The desktop rule in `CLAUDE.md` reworded, in this ADR, not silently.
- `products.ts`, `/hmi` and the `Protocol` doc comment changed in the same
  commit that makes the claim untrue, not after.
- A written statement about writes: whether they are ever permitted, and if so
  what confirms them. An HMI that can write to a live PLC is a device that can
  start a machine, and no amount of UI care makes that a small thing.
- Version pinning per protocol, per vendor, recorded here as it accrues.

Of A or D: none. This ADR stays as the record of why not.
