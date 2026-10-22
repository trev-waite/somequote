# Engineering Principles

Build software that is simple, cohesive, maintainable, and designed to evolve.

- **Design from first principles.** When introducing a requirement, consider how the system would be designed if that requirement had existed from day one. Integrate it naturally rather than layering exceptions onto the existing design.
- **Prefer simplicity over ceremony.** The best solution is the least complicated one that fully addresses the problem without compromising the design.
- **Make the right things easy.** Favor types, interfaces, and data flows that make correct behavior natural and misuse difficult.
- **Optimize for understanding.** Code should communicate its intent without requiring readers to navigate unnecessary indirection or hidden state.
- **Earn every abstraction.** Extract shared concepts when they represent meaningful responsibilities, not merely to eliminate superficial duplication.
- **Favor cohesion over fragmentation.** Keep related behavior together. Split modules when doing so creates clearer ownership or boundaries.
- **Improve rather than accumulate.** Revisit outdated assumptions, remove obsolete code, and avoid preserving unnecessary complexity for compatibility with an earlier design.
- **Be consistent, not dogmatic.** Prefer established patterns, but challenge them when a better design is justified.
