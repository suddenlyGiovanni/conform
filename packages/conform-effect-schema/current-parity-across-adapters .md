### Summary of current parity and gaps across adapters
I compared the constraint capabilities and tests of the following Conform adapters:
- conform-effect-schema: packages/conform-effect-schema/src/constraint/constraint.node.test.ts
- conform-zod (v4): packages/conform-zod/v4/tests/constraint.test.ts
- conform-valibot: packages/conform-valibot/tests/constraint.test.ts
- conform-yup: tests/conform-yup.spec.ts
- ValidityState adapter: packages/conform-validitystate/index.ts (for understanding the scope of HTML input-specific types; it does not expose a getConstraint like the schema adapters)

Below is a consolidated view of what’s already covered in effect-schema vs what other adapters support, and the resulting gaps.

### What conform-effect-schema already covers well
- Root shape and non-object guard
  - Throws on non-object root (StringKeyword, TupleType) — same policy as zod/valibot/yup tests which also reject non-object roots.

- Required/Optional
  - Required fields default to required: true; Schema.optional(...) sets required: false. Good parity with other adapters for optional.

- Literals
  - String/number/bigint literal fields treated as required: true (no special constraints). Matches other adapters’ behavior for scalar literals.

- String constraints
  - minLength, maxLength, exact/combined length with Schema.length({min,max}), NonEmptyString → minLength: 1.
  - Regex pattern via Schema.pattern(regex), and synthetics from:
    - startsWith, endsWith, includes → pattern
    - trimmed → pattern enforcing no leading/trailing whitespace
    - lowercased, uppercased, capitalized, uncapitalized → pattern variants
  - Transformations preserving/elevating constraints:
    - Trim, Lowercase, Uppercase, Capitalize, Uncapitalize keep min/max length etc. and add corresponding pattern. This is beyond what zod/valibot/yup tests currently assert and is a nice bonus.

- Number constraints
  - greaterThan/greaterThanOrEqualTo → min
  - lessThan/lessThanOrEqualTo → max
  - between → min + max
  - multipleOf → step
  - Transformations: NumberFromString, parseNumber (string→number passthrough), clamp(min,max) → min+max

- BigInt constraints
  - greaterThan/lessThan etc. mapped to min/max (some expectations cast to number, others keep bigint; see “Inconsistencies” below).
  - Transformations: BigInt→parsed, BigIntFromNumber constrained to JS safe integer range, clampBigInt(min,max) → min+max (kept as bigint in expectation).

- Date constraints
  - greater/greaterOrEqual/less/lessOrEqual with DateFromSelf → min/max in yyyy-mm-dd string format
  - betweenDate → min/max strings
  - Transformation Date (string→Date) + constraints → min/max preserved

- Boolean constraints
  - Basic required and optional
  - Transformation Not (boolean negation) — marked as required in constraints

- Array constraints
  - Array(...) produces parent field with multiple: true, and child key `field[]` capturing item constraints.
  - Arrays of struct: constraints descend to `list[].key` etc.
  - Arrays of union of literals: child pattern 'a|b|c' at `field[]`.

- Tuple constraints
  - Fixed-length tuples produce `tuple[0]`, `tuple[1]` etc., with inner constraints applied.

- Nested Structs
  - Dot path traversal for nested objects (e.g. `nested.key`).

### Major gaps versus other adapters’ coverage
1. Intersection support
   - zod and valibot tests assert intersection is supported: constraints from both sides merge. effect-schema test has test.todo("Intersection is supported").
   - Gap: Implement and test intersection handling (merge constraints from both sides at each path, later side overwriting earlier when both present, consistent with others).

2. Union and discriminated union support
   - zod and valibot support unions and discriminated unions. Their tests merge constraints across options:
     - If a field exists in all options with the same constraint value, it’s kept.
     - If a field appears only in some options (or differs), it becomes required: false with the common intersected constraints retained if equal, otherwise omitted.
   - effect-schema has test.todo for both non-discriminated and discriminated unions; not implemented/tested yet.

3. Recursive schemas
   - Both zod and valibot show commented or active patterns for recursive schemas. effect-schema includes test.todo examples for recursive Struct with suspend() and for a union-based recursive model.
   - Gap: No current implementation or tests verifying recursion traversal.

4. Tuple with rest elements (valibot)
   - valibot has tupleWithRest and tests that the head items and optional rest items produce constraints at indices accordingly.
   - effect-schema only tests fixed-length Tuple. If Effect Schema supports rest on tuples (or an equivalent), it’s not covered; otherwise document non-support.

5. Scalar union-of-literals or Enum-like mapping to pattern on single fields
   - yup test uses oneOf(['x','y','z']) on a single scalar field ("tag") → pattern: 'x|y|z'.
   - zod test uses z.enum(['a','b','c']) inside array and maps to 'options[]' pattern. They didn’t include a scalar enum a/b/c example, but mapping would be the same.
   - effect-schema tests only show array of union of literal strings → `field[]` pattern. There is no test showing a single scalar union-of-literals → scalar field pattern.
   - Gap: Add test for scalar union of literals (e.g., Schema.Union(Schema.Literal('a'), ...)) mapping to field-level pattern. If Effect Schema has a direct Enum helper, support it too.

6. File inputs (HTML file inputs)
   - zod has z.file() in arrays and maps to `files` multiple and `files[]` in constraints.
   - valibot uses array(instance(Date,...)) in their test as a stand-in example for files in their adapter; their constraint asserts multiple on the parent and required on the child key.
   - Effect Schema does not have a File primitive/type, so parity for file input constraints is out-of-scope for this adapter, but worth acknowledging as not applicable.

7. Object-level transformations comparable to zod’s transform/preprocess/pipe
   - zod tests include transform, preprocess, and pipe over objects with constraints preserved/merged on the output shape.
   - effect-schema tests include several string/number/date transformation helpers but do not cover a Struct transformed to another Struct (or a transformation wrapper) where constraints should still be derived from the output type.
   - Gap: If Effect Schema can wrap Structs in transformations (e.g., Schema.transform/Schema decode/encode wrappers), the adapter should follow the output AST and preserve constraints similarly. Add tests for object-level transforms if applicable.

### Notable behavioral differences / inconsistencies
- Default implies optional (required false) in zod and valibot; Effect Schema test expects required true for optionalWith(default)
  - zod: date().min/max.default(new Date()) → required: false in constraints.
  - valibot: optional(date().min/max, new Date()) → required: false.
  - effect-schema: optionalWith(Date.pipe(betweenDate(...)), { default }) → expected constraints set required: true in their test (lines ~1137–1141). That’s a divergence from the other adapters’ default semantics.
  - Action: Decide whether effect-schema should align with other adapters (treat default as not required) or document the intentional difference. If aligning, update getEffectSchemaConstraint logic and tests accordingly.

- BigInt min/max typing in constraints
  - valibot test asserts bigint min/max remain as bigint (1n, 10n).
  - effect-schema sometimes casts bigint to number in expectations (GreaterThanBigInt, etc.), and sometimes keeps bigint (clampBigInt test).
  - Action: Standardize to one representation for constraint min/max: keep bigint when source is BigInt-related. Align with valibot approach (and typing of @conform-to/dom Constraint if it supports bigint) for consistency.

### Smaller gaps or areas to confirm
- Array cardinality (minItems/maxItems) is currently not represented in Constraint API and other adapters also don’t surface it via constraints (they only use multiple and the child required when appropriate). effect-schema does not attempt to encode minItems/maxItems; this matches the other adapters in practice.
- Boolean-specific variants like checkboxes/radios/selects are ValidityState concerns, not schema adapters; not applicable here.
- Pattern escaping for union-of-literals: zod/yup implementations escape regex special chars in enums/oneOf to build a safe pattern. effect-schema should ensure escaping if/when implementing scalar union-of-literals → pattern for consistency.

### Recommended next steps (tests to add + implementation work)
1. Implement and test Intersection for effect-schema
   - Port the intersection tests from zod/valibot and adapt to Effect Schema’s AST: merge constraints from both sides.

2. Implement and test Union and Discriminated Union
   - Follow the merge semantics used by zod/valibot constraint mergers (retain equal constraints across options, mark fields missing in some branches as required: false, etc.). The current test.todo in effect-schema already outlines the expected results.

3. Implement and test Recursive schema traversal
   - Use Schema.suspend(() => ...) cases in tests; traverse safely with memoization/visited set to avoid infinite recursion.

4. Add a test for scalar union-of-literals → pattern
   - Example: Schema.Struct({ tag: Schema.Union(Schema.Literal('x'), Schema.Literal('y'), Schema.Literal('z')) }) should map to tag: { required: true, pattern: 'x|y|z' }.
   - Ensure regex escaping of literal values.

5. Tuple with rest (if supported by Effect Schema)
   - If there is an equivalent of rest items, mirror valibot’s tupleWithRest tests. If not supported, document non-support to set expectations.

6. Object-level transform wrappers
   - If Effect Schema allows wrapping Structs in transformations, add tests demonstrating constraints are taken from the resulting/outgoing Struct shape, akin to zod’s transform/preprocess/pipe behavior.

7. Align default/optional semantics
   - Decide how Schema.optionalWith(default) should be reflected in required. To align with other adapters, treat fields with a default as required: false.

8. Standardize BigInt min/max in constraints
   - Keep min/max as bigint where the source constraint is on a BigInt type. Update expectations and implementation accordingly.

### Quick capability matrix (high level)
- Intersection: zod ✔, valibot ✔, yup – (N/A), effect-schema ✖ (todo)
- Union: zod ✔, valibot ✔, yup – (via oneOf at field), effect-schema ✖ (todo)
- Discriminated union: zod ✔, valibot ✔, effect-schema ✖ (todo)
- Recursive: zod (commented example), valibot (not explicit but patterns exist), effect-schema ✖ (todo tests exist)
- File inputs: zod ✔, valibot ✔ (proxy example), effect-schema N/A (no File primitive)
- Tuple with rest: valibot ✔, zod – (test not present), effect-schema ✖ (not tested)
- Scalar union-of-literals → pattern: yup ✔ (oneOf), zod – (can do enum), effect-schema ✖ (only array union tested)
- Default→optional: zod ✔ (default = required false), valibot ✔, effect-schema ⚠ (currently required true in test)

If you want, I can draft the additional effect-schema tests for: intersection, union (incl. discriminated), recursive, scalar union-of-literals pattern, and adjust the optionalWith(default) expectation to align with other adapters, plus a note on bigint consistency. Let me know your preference on the default semantics before I proceed with concrete test cases.