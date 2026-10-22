# Architecture

- Keep business rules independent of framework and infrastructure code.
- Model the domain explicitly. Choose types and data structures that make responsibilities, relationships, and valid states clear.
- Organize around cohesive modules with small, intentional public interfaces.
- Keep dependencies directional and boundaries explicit. Implementation details should not dictate core behavior.
- Introduce abstractions only when they serve an existing boundary or concrete requirement. Avoid speculative flexibility.
- Design components to be independently understandable, testable, and replaceable where that separation provides real value.
- Keep complexity proportional to the problem being solved.
