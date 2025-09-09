import * as ReadonlyArray from 'effect/Array';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as HashSet from 'effect/HashSet';
import * as Predicate from 'effect/Predicate';
import * as Record from 'effect/Record';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

import { IllegalRootNode } from '../errors';
import {
	type Constraint,
	type ConstraintRecord,
	Constraints,
	Ctx,
	Endo,
	type Errors,
} from '../types';

/**
 * Builds a visitor for `AST.Union` nodes that merges per-branch constraint endomorphisms
 * while computing correct field requiredness by intersection.
 *
 * @remarks
 * Background
 * - Effect Schema AST allows unions over heterogeneous node kinds (object literals, primitives, etc.).
 * - Conform associates constraints only with form field paths contributed by object-like shapes (e.g. `TypeLiteral`).
 * - Primitive / literal-only union members do not add paths; they only influence requiredness if a path appears elsewhere.
 *
 * Requiredness Policy (intersection semantics)
 * - A field path `k` is marked `required: true` iff it is present and required in every branch snapshot.
 * - If `k` appears required in some branches but is optional or absent in at least one other branch, it is downgraded to optional.
 * - Paths absent from all branches are omitted entirely.
 * - No other constraint properties are merged or reconciled across branches (only requiredness downgrades are applied). Any semantic conflicts should have been prevented earlier during schema construction.
 *
 * Special Case Optimization
 * - When the union occurs at an array item context (path ends with `[]`) AND every union member is a string literal, an alternation regex is synthesized and attached as a `pattern` constraint for that item path (i.e. an enum-like validation). This does not influence requiredness.
 *
 * Error Handling
 * - At the root context only homogeneous unions of `TypeLiteral` OR homogeneous unions of `Transformation` are permitted. Otherwise an {@link IllegalRootNode} error is produced.
 *
 * Algorithm (high level)
 * 1. For each union member: visit it, producing an `Endo` and capture a snapshot (`ConstraintRecord`) by applying it to an empty constraint set.
 * 2. Collect all field keys appearing in any snapshot.
 * 3. Determine which keys are required in every snapshot; downgrade all others to `required: false` via a composed patch endo.
 * 4. Compose: (a) sequential branch endos, then (b) the downgrade endo.
 * 5. (Array string-literal special case) Short‑circuit and emit a single patch endo with the generated regex.
 *
 * Complexity
 * - Let `n` be number of union members and `m` the total distinct keys across snapshots; runtime is `O(n + m)` (snapshot creation dominates; downgrade map is linear in distinct keys).
 *
 * Idempotence
 * - The produced endomorphism is deterministic and idempotent with respect to requiredness downgrades (reapplying will not further change constraints).
 *
 * @returns A `MakeVisitor` implementation producing an `Endo.Prog` that either fails with {@link Errors} or yields a composed field-constraint transformer.
 *
 * @throws IllegalRootNode If invoked at root with a heterogeneous union not comprised solely of `TypeLiteral` or solely of `Transformation` nodes.
 */
export const makeUnionVisitor: Endo.MakeVisitor<Ctx.Any, AST.Union> =
	(visit) => (ctx: Ctx.Any, unionNode: Readonly<AST.Union>) => {
		// Branch aggregation helper (shared by Root / Node cases)
		const aggregate = (baseCtx: Ctx.Any): Endo.Prog =>
			pipe(
				unionNode.types,
				ReadonlyArray.reduce(
					Either.right({ endo: Endo.id, snaps: [] }) as Either.Either<
						{
							endo: Endo.Endo;
							snaps: ReadonlyArray<ConstraintRecord>;
						},
						Errors
					>,
					(acc, member) =>
						Either.flatMap(acc, (state) =>
							Either.map(visit(baseCtx, member), (memberEndo) => ({
								endo: Endo.compose(state.endo, memberEndo),
								snaps: [
									...state.snaps,
									Constraints.toRecord(memberEndo(Constraints.empty())),
								],
							})),
						),
				),

				Either.map(({ endo, snaps }) => {
					const allKeys = pipe(
						snaps,
						ReadonlyArray.flatMap(Record.keys),
						HashSet.fromIterable,
					);

					const requiredEverywhere = pipe(
						allKeys,
						HashSet.filter((k) =>
							snaps.every(
								(s) => (s[k] as Constraint | undefined)?.required === true,
							),
						),
					);

					const toOptional = pipe(
						allKeys,
						HashSet.filter((k) => !HashSet.has(requiredEverywhere, k)),
					);

					const downgrade = Endo.compose(
						...pipe(
							toOptional,
							HashSet.map((k) => Endo.patch(k, { required: false })),
							HashSet.toValues,
						),
					);

					return Endo.compose(endo, downgrade);
				}),
			);

		return Ctx.$match(ctx, {
			Root: () => {
				const allTypeLiterals = ReadonlyArray.every(
					unionNode.types,
					AST.isTypeLiteral,
				);
				const allTransformations = ReadonlyArray.every(
					unionNode.types,
					AST.isTransformation,
				);
				return !(allTypeLiterals || allTransformations)
					? Endo.fail(
							new IllegalRootNode({
								actualNode: unionNode.types[0]._tag,
								expectedNode: 'TypeLiteral',
							}),
						)
					: aggregate(ctx);
			},
			Node: (nodeCtx) => {
				return nodeCtx.path.endsWith('[]') &&
					ReadonlyArray.every(
						unionNode.types,
						(t): t is AST.Literal & { literal: string } =>
							AST.isLiteral(t) && Predicate.isString(t.literal),
					)
					? Endo.of(
							Endo.patch(nodeCtx.path, {
								pattern: pipe(
									unionNode.types as ReadonlyArray<
										AST.Literal & { literal: string }
									>,
									ReadonlyArray.map(Struct.get('literal')),
									ReadonlyArray.map((s) =>
										s
											.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
											.replace(/-/g, '\\x2d'),
									),
									ReadonlyArray.join('|'),
								),
							}),
						)
					: aggregate(Ctx.Node({ path: nodeCtx.path, parent: unionNode }));
			},
		});
	};
