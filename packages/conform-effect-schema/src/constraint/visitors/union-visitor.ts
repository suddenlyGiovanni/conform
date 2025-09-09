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
	ConstraintRecord,
	Constraints,
	Ctx,
	Endo,
	type Errors,
} from '../types';

/**
 * Union handling (Conform domain)
 *
 * Background:
 * - Effect’s SchemaAST allows unions of many AST node kinds (not only objects).
 * - Conform constraints are keyed by form field paths. Only object-like members (TypeLiteral/Struct)
 *   and nested shapes (tuples/arrays producing subpaths) actually contribute field keys.
 * - Unions of primitives/literals do not introduce field paths by themselves, so they do not impact
 *   “requiredness” directly in Conform’s ConstraintRecord.
 *
 * Policy:
 * - Constraints are static per form field, so union handling is branch-agnostic (no conditionals).
 * - Requiredness is derived by intersecting branch snapshots:
 *   - A path k is required iff k is present and required in every union member that contributes it.
 *   - If k is present in at least one member but is optional or absent in any other, k is optional.
 *   - If k is present in none, it is omitted.
 * - We do not attempt to merge/refine other constraints across branches. Conflicting shapes/refinements
 *   should be rejected earlier by schema composition (overlap/unsupported errors).
 *
 * Special-cases:
 * - Array of union-of-string-literals: when visiting an array item path (path ends with "[]") and the
 *   union is entirely string literals, we emit a safe alternation regex (enum-like) at the item path.
 *   This does not affect requiredness; it’s an additional item-level constraint.
 *
 * Notes:
 * - Discriminated unions naturally make the discriminant required because it is present (and required)
 *   in every branch; other fields follow the same intersection rule above.
 * - If a union has no object-like members that yield field paths, this visitor may produce no keys;
 *   that is expected and acceptable for Conform constraints.
 */
export const makeUnionVisitor: Endo.MakeVisitor<Ctx.Any, AST.Union> =
	(visit) => (ctx, unionNode) => {
		/** Root validation: only unions entirely of TypeLiteral or entirely of Transformation. */
		if (Ctx.$is('Root')(ctx)) {
			const allTypeLiterals = ReadonlyArray.every(
				unionNode.types,
				AST.isTypeLiteral,
			);
			const allTransformations = ReadonlyArray.every(
				unionNode.types,
				AST.isTransformation,
			);
			if (!(allTypeLiterals || allTransformations)) {
				const first = unionNode.types[0];
				if (first) {
					return Endo.fail(
						new IllegalRootNode({
							actualNode: first._tag,
							expectedNode: 'TypeLiteral',
						}),
					);
				}
			}
		}

		/** Detect: Array item path where member types are string literals -> emit pattern */
		if (Ctx.$is('Node')(ctx) && ctx.path.endsWith('[]')) {
			const allStringLiterals = ReadonlyArray.every(
				unionNode.types,
				(t): t is AST.Literal & { literal: string } =>
					AST.isLiteral(t) && Predicate.isString(t.literal),
			);
			if (allStringLiterals) {
				const pattern = pipe(
					unionNode.types as ReadonlyArray<AST.Literal & { literal: string }>,
					ReadonlyArray.map(Struct.get('literal')),
					ReadonlyArray.map((s) =>
						s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d'),
					),
					ReadonlyArray.join('|'),
				);
				return Endo.of(Endo.patch(ctx.path, { pattern }));
			}
		}

		/** Helper: adjust context parent for branch traversal */
		const recontextualize = (c: Ctx.Any): Ctx.Any =>
			Ctx.$match(c, {
				Node: (nodeCtx) => Ctx.Node({ path: nodeCtx.path, parent: unionNode }),
				Root: (rootCtx) => rootCtx,
			});

		/** Traverse each branch, collecting composed endo and a snapshot of produced constraints. */
		interface SnapshotFragment {
			readonly required?: boolean;
			readonly pattern?: string;
			readonly [k: string]: unknown;
		}
		interface AccState {
			readonly endo: Endo.Endo;
			readonly snapshots: ReadonlyArray<Record<string, SnapshotFragment>>;
		}
		const collected = pipe(
			unionNode.types,
			ReadonlyArray.reduce(
				Either.right({ endo: Endo.id, snapshots: [] }) as Either.Either<
					AccState,
					Errors
				>,
				(acc, member) =>
					Either.flatMap(acc, (state) =>
						Either.map(visit(recontextualize(ctx), member), (memberEndo) => {
							const snapshot = Constraints.toRecord(
								memberEndo(Constraints.empty()),
							) as Record<string, SnapshotFragment>;
							return {
								endo: Endo.compose(state.endo, memberEndo),
								snapshots: [...state.snapshots, snapshot],
							};
						}),
					),
			),
		);

		return Either.map(collected, ({ endo, snapshots }) => {
			const allKeys = pipe(
				snapshots,
				ReadonlyArray.flatMap(Record.keys),
				ReadonlyArray.dedupe,
			);
			const requiredEverywhere = pipe(
				allKeys,
				ReadonlyArray.filter((k) =>
					ReadonlyArray.every(snapshots, (snapshot) => {
						const entry = snapshot[k] as SnapshotFragment | undefined;
						return entry?.required === true;
					}),
				),
				HashSet.fromIterable,
			);
			const toOptional = allKeys.filter(
				(k) => !HashSet.has(requiredEverywhere, k),
			);
			const downgradeRequired = Endo.compose(
				...toOptional.map((k) => Endo.patch(k, { required: false })),
			);
			return Endo.compose(endo, downgradeRequired);
		});
	};
