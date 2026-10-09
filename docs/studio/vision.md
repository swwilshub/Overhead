# Vision

**Overhead** is a 90s-style factory management sim you play in one browser page. You lease a plant in an American
city, fill it with machines, run belts between them, hire a crew with personalities, and sell into a living local
market. It should feel like a warm pixel diorama that is also a real business: you can watch every box move, see
exactly why a machine has stopped, and feel cash, debt and payroll pulling against your plans. Everyone can play it,
by mouse, keyboard or screen reader, at any text size.

## Design pillars

Every spec must serve at least one.

1. **Readable factory:** you can see at a glance what each machine is doing and why it has stopped.
2. **Real flow:** goods physically move, queue and jam, with no teleporting.
3. **Business tension:** cash, debt, payroll and demand pull against production.
4. **Accessible by default:** the whole game can be played by keyboard and screen reader, with large text and no
   colour-only cues.
5. **Pixel charm:** a coherent, warm, 90s-style pixel look and synth sound that stay consistent across the machine
   family.

## How the studio works

The producer (the main Claude Code session) runs sprints of seven steps: playtest, triage, spec, build, review,
integrate and sprint review. The agents are defined in `.claude/agents/`. Specs live in `specs/`, playtest reports in
`playtests/` and sprint reviews in `sprints/`. Decisions and their reasons go in `decisions.md`.
