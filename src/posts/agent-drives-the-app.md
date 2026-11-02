---
title: Letting an AI agent drive bender
date: 2026-11-02
summary:
  Claude Code writes a techno groove into bender and bends it until it falls
  apart.
image: /blog/agent-drive-poster.webp
imageAlt:
  Chrome with bender on the left and Claude Code in a terminal on the right,
  partway through building a techno groove.
---

<video
  controls playsinline preload="none"
  poster="/bender/blog/agent-drive-poster.webp"
  style="width: 100%; height: auto"
  src="https://myloveydove.com/bender/agent-drive.mp4"></video>

The recording is one Claude Sonnet session with sound on. It was asked for a
dark techno groove and then to bend it until it fell apart.

Start with `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`
and ask for a groove. The
[AI usage guide](https://github.com/cmdcolin/bender/blob/main/docs/AI-USAGE.md)
has the rest, and
[Techno with an AI agent](https://github.com/cmdcolin/bender/blob/main/docs/AGENT-TECHNO.md)
quotes a longer session request by request.
