// Error types that drive exit codes: usage problems exit 2, everything else 1.

/** A human-facing usage error. Printed to stderr; process exits 2. */
export class UsageError extends Error {}
