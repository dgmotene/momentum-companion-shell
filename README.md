# Accessible Life Insurance AI Companion

Team **Nullius In Verba**'s design-round submission for the Monkey & River
Hackathon 2026: **Lumina**, an AI companion embedded in Momentum's member
portal, serving policyholders and the beneficiaries of the deceased.

This is a design and architecture round. The documents below are the
submission; the code is a runnable Environment Shell that proves the setup
works.

## Where everything lives

| Artifact | Location |
|---|---|
| Submission document (the primary scored artifact) | [SUBMISSION.md](SUBMISSION.md) |
| Architecture diagram | [architecture-diagram.html](architecture-diagram.html), viewable without cloning at https://host-html.com/p/kpzzj1 |
| Wireframes (the Lumina UI) | [lumina-wireframe.html](lumina-wireframe.html), viewable without cloning at https://host-html.com/p/quv3tz |
| Architecture as mermaid, with sequence diagrams | [docs/architecture.md](docs/architecture.md) |
| Plain-language walkthrough of the design | [docs/how-it-works.md](docs/how-it-works.md) |
| The ten architecture decisions and their trade-offs | [docs/architecture-decisions.md](docs/architecture-decisions.md) |
| Environment Shell (the runnable skeleton) | [momentum-companion-shell/](momentum-companion-shell/) |

## Running the Environment Shell

The quickest path needs only Docker:

```bash
git clone https://github.com/MnR-Hackathon-Group-C/nullius-in-verba.git
cd nullius-in-verba/momentum-companion-shell
docker compose --profile full up
```

Then open **http://localhost:3000**, log in as Policyholder or Beneficiary,
and watch the embedded companion receive its identity token and report the
backend's verification.

For the faster npm dev loop, the sanity checks, and the no-Docker fallback,
see the [shell's README](momentum-companion-shell/README.md) or SUBMISSION.md
section 12.
