import { Effect, Logger } from 'effect';

/** Logs objects through the console method for their level, which Workers Logs indexes by. */
const WorkersLogger = Logger.layer([Logger.withLeveledConsole(Logger.formatStructured)]);

export function runLogged<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, WorkersLogger));
}
