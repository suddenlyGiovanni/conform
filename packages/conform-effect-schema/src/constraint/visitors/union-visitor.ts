import * as ReadonlyArray from 'effect/Array';
import * as Record from 'effect/Record';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as Predicate from 'effect/Predicate';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

import { IllegalRootNode } from '../errors';
import {
	type ConstraintRecord,
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
	(visit) => (ctx, node) => {
		// Invariant: on root only union of type literals or Transformations are allowed
		if (
			Ctx.$is('Root')(ctx) &&
			!(
				ReadonlyArray.every(node.types, AST.isTypeLiteral) ||
				ReadonlyArray.every(node.types, AST.isTransformation)
			)
		) {
			return Endo.fail(
				new IllegalRootNode({
					actualNode: node.types.at(0)!._tag,
					expectedNode: 'TypeLiteral',
				}),
			);
		}
		/**
		 * EDGE CASE: Array of union-of-string-literals
		 * WHY: When an array's element type is a union of string literals
		 * (e.g. Array<'a' | 'b'>) we surface an allow‑list via a single
		 * regex pattern. The downstream constraint engine does not keep
		 * literal sets, so we precompile them to a pattern.
		 */
		if (
			Ctx.$is('Node')(ctx) &&
			ReadonlyArray.every(
				node.types,
				(t): t is AST.Literal & { literal: string } =>
					AST.isLiteral(t) && Predicate.isString(t.literal),
			) &&
			ctx.path.endsWith('[]')
		) {
			return Endo.of(
				Endo.patch(ctx.path, {
					// WHAT: constrain each array item to one of the literal tokens
					pattern: pipe(
						ReadonlyArray.map(
							node.types as ReadonlyArray<AST.Literal & { literal: string }>,
							Struct.get('literal'),
						),
						ReadonlyArray.map((s) =>
							s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d'),
						),
						ReadonlyArray.join('|'),
					),
				}),
			);
		}

		return pipe(
			/**
			 * WHAT: Visit each branch to:
			 * 1. Accumulate its constraint mutations (endo)
			 * 2. Capture a snapshot of the constraint record the branch alone produces
			 * WHY: Snapshots let us compute the intersection of required properties.
			 */
			node.types,
			ReadonlyArray.reduce(
				Either.right({ endo: Endo.id, snaps: [] }) as Either.Either<
					{ endo: Endo.Endo; snaps: Array<ConstraintRecord> },
					Errors
				>,
				(acc, member) =>
					Either.flatMap(acc, (state) =>
						Either.map(
							visit(
								Ctx.$match(ctx, {
									Node: (nodeCtx) =>
										Ctx.Node({ path: nodeCtx.path, parent: node }),
									Root: (rootCtx) => rootCtx,
								}),
								member,
							),
							(memberEndo) => ({
								endo: Endo.compose(state.endo, memberEndo),
								snaps: [
									...state.snaps,
									Constraints.toRecord(memberEndo(Constraints.empty())),
								],
							}),
						),
					),
			),
			/**
			 * WHY: In a union a consumer cannot rely on a property existing unless
			 * every alternative both defines it and requires it. Any missing or
			 * optional occurrence forces it to optional in the merged view.
			 */
			Either.map(({ endo: membersEndo, snaps }) => {
				const allKeys = pipe(
					snaps,
					ReadonlyArray.flatMap(Record.keys),
					ReadonlyArray.dedupe,
				);

				const requiredInAll = new Set(
					allKeys.filter((k) =>
						snaps.every((r) => r[k] && r[k].required === true),
					),
				);

				const toOptional = allKeys.filter((k) => !requiredInAll.has(k));

				// WHAT: Apply downgrades after raw member composition so they cannot be re-overridden.
				const normalizeRequired = Endo.compose(
					...toOptional.map((k) => Endo.patch(k, { required: false })),
				);
				/**
				 * FINAL COMPOSITION:
				 * pattern constraints (if any)
				 * + raw branch constraints
				 * + required normalization step
				 */
				return Endo.compose(membersEndo, normalizeRequired);
			}),
		);
	};
