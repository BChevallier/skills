# skills

Two Claude skills.

| Skill | What it does |
|---|---|
| [create-presentation](create-presentation/) | Turns your draft into a reveal.js deck in a minimal style. The style is true black and left-aligned, opens with a hook and ends with a callback, puts the detail in speaker notes, and closes with Inspiration and Sources slides. The deck is served locally for review. |
| [to-do-bubbles](to-do-bubbles/) | Bubbles: a to-do tracker with no deadlines. Each to-do is a glowing bubble sized by its estimated hours, and holding a bubble pops it and asks how long it really took. It runs on localhost (`serve.py`, standard library only) or as a claude.ai artifact. Open `to-do-bubbles/assets/demo.html` for a preview. |

## Install

Copy a skill folder into `~/.claude/skills/` (all your projects) or `<project>/.claude/skills/` (one project).

## Licence

[GPL-3.0](LICENSE). You can use, change and share these skills, including commercially, as long as anything you distribute that is built on them is also released under the GPL with its source.
