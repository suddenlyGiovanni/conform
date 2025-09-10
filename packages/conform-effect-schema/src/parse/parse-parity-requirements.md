# parseWithEffectSchema vs parseWithZod (v4) Parity Report

## 1. Snapshot

Overall feature parity with Zod v4 adapter: ~40–45%.

Core success/error submission contract works; major missing pieces: async parsing, multi-issue aggregation per field, custom error formatting, coercion toggle, sentinel (skipped/undefined) semantics, richer typing (input vs output), localization/error mapping.

## 2. Current Similarities

- Wraps `parse` from `@conform-to/dom` via `resolve`.
- Supports schema factory `(intent) => schema`.
- Returns `Submission` with `value` or `error` using field path formatting (`formatPaths`).

## 3. Detailed Gaps

| Area                          | Zod v4 Adapter                                           | Current Effect Adapter          | Gap Impact                            |
| ----------------------------- | -------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| Sync & Async                  | Sync + `async: true`                                     | Sync only                       | Blocks async refinements / DB checks  |
| Error Aggregation             | Collects all issues per field                            | Possible overwrite (last write) | Lost messages                         |
| Custom Error Shape            | `formatError(issues[])` overloads                        | Fixed `string[]`                | No customization / i18n               |
| Sentinels (skip/undefined)    | Supports special messages -> `null` or global null error | None                            | Cannot express progressive validation |
| Auto Coercion                 | Opt-out via `disableAutoCoercion`                        | None                            | Inconsistent raw string inputs        |
| Input vs Output Types         | `Submission<input, FormError, output>`                   | Single `A`                      | Loses transform distinction           |
| Error Map / Localization      | Pass `error` map                                         | None                            | Harder to localize                    |
| Null vs Undefined Field Error | `null` means skipped                                     | Only arrays                     | Less semantic richness                |
| Symbol Path Guard             | Throws on symbol path                                    | None                            | Potential silent path issues          |
| Multi-issue Formatter         | Issues array to formatter                                | Single message array            | Limited context                       |

## 4. Effect Schema Capabilities to Leverage

- `Schema.decodeUnknownEither` (sync) & promise-based variant (or effect) for async.
- Distinct runtime types: `Schema.Type<S>` (decoded) vs `Schema.Encoded<S>` (input) allowing dual generics.
- Rich issue list with `{ errors: 'all' }` already used.
- Transformations & refinements (extendable to async versions).
- Potential metadata/annotations for sentinel semantics if introduced.

## 5. Recommended Implementation Phases

1. Multi-issue grouping + `formatError` option & overloads.
2. Async support (`async?: true`) using promise decode.
3. Dual generics for input/output types (expose placeholder if exact inference pending).
4. Auto-coercion helper + `disableAutoCoercion` flag (numeric, boolean, empty-to-undefined) mirroring Zod adapter strategy.
5. Sentinel semantics (`VALIDATION_SKIPPED`, `VALIDATION_UNDEFINED`), field `null` support.
6. Symbol path guard & optional `transformIssue` / localization hook.
7. Expanded test matrix (see Section 8).

## 6. Conceptual API (Target)

```ts
export const conformEffectMessage = {
  VALIDATION_SKIPPED: '__skipped__',
  VALIDATION_UNDEFINED: '__undefined__',
} as const;

export function parseWithEffectSchema<O, I = unknown>(
  payload: FormData | URLSearchParams,
  options: {
    schema:
      | Schema.Schema<O, I>
      | ((intent: Intent | null) => Schema.Schema<O, I>);
    async?: false;
    formatError?: (issues: Issue[]) => string[]; // default
    disableAutoCoercion?: boolean;
    transformIssue?: (issue: Issue) => Issue;
  },
): Submission<O, string[], O>;

export function parseWithEffectSchema<O, I = unknown, FE>(
  payload: FormData | URLSearchParams,
  options: {
    schema:
      | Schema.Schema<O, I>
      | ((intent: Intent | null) => Schema.Schema<O, I>);
    async?: false;
    formatError: (issues: Issue[]) => FE;
    disableAutoCoercion?: boolean;
    transformIssue?: (issue: Issue) => Issue;
  },
): Submission<O, FE, O>;
// + async overloads returning Promise<Submission<...>>
```

## 7. Aggregation Pseudocode

```ts
const issues = ParseResult.ArrayFormatter.formatErrorSync(parseError);
let hasUndefined = false;
const grouped = new Map<string, Issue[] | null>();

for (const issue of issues) {
  const path = issue.path as (string | number)[];
  if (path.some((p) => typeof p === 'symbol'))
    throw new Error('Symbol paths not supported');
  const key = formatPaths(path);
  switch (issue.message) {
    case conformEffectMessage.VALIDATION_UNDEFINED:
      hasUndefined = true;
      continue;
    case conformEffectMessage.VALIDATION_SKIPPED:
      if (!grouped.has(key)) grouped.set(key, null);
      continue;
  }
  const bucket = grouped.get(key);
  if (bucket !== null) {
    if (bucket) bucket.push(issue);
    else grouped.set(key, [issue]);
  }
}

if (hasUndefined) return { value: undefined, error: null };

const error: Record<string, FE | null> = {};
for (const [k, v] of grouped) {
  error[k] =
    v === null
      ? null
      : options.formatError
        ? options.formatError(v)
        : v.map((i) => i.message);
}
```

## 8. Proposed Test Additions

- Multi-error same field (two refinements + length) → aggregated array length 2–3.
- Custom `formatError` returning joined string or object.
- Async refinement (e.g., uniqueness check) with `async: true`.
- Intent-based dynamic schema switch.
- Coercion: numeric & boolean strings with toggle on/off.
- Sentinels: skipped & undefined behaviors.
- Nested / array path formatting (`items[0].name`).
- Symbol path rejection test.

## 9. Migration / Backward Compatibility

- Existing call sites continue to work (defaults preserved).
- Introducing overloads is non-breaking; adding new option keys safe.
- Sentinel messages opt-in only—won't appear unless user emits them.

## 10. Future / Optional Enhancements

- Localization strategy: `translateIssue(issue)` hook or pluggable message catalog.
- Rich error objects (include expected/actual) exposed to `formatError`.
- Tree formatter option for hierarchical forms.
- Integration with Effect `Cause` for async refinement failures.

## 11. Implementation Order (Effort vs Value)

1. Grouping + formatter (high value, low effort).
2. Async decode path (medium value, low-medium effort).
3. Dual generics & typing improvements (developer ergonomics).
4. Coercion helper & toggle.
5. Sentinels + null semantics.
6. Localization / transformIssue hook.
7. Symbol path guard & extended tests.

## 12. Actionable Next Step

Begin with grouping + `formatError` overloads and add corresponding tests to `parse.test.ts` to avoid regression.

---

Generated for internal parity tracking. Update as features land.
