import * as ReadonlyArray from 'effect/Array';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

import * as Refinements from './refinements';
import {
	type Constraint,
	Constraints,
	ConstraintRecord,
	Ctx,
	Endo,
	type Errors,
} from './types';

export const makeTypeLiteralVisitor: Endo.MakeVisitor<
	Ctx.Any,
	AST.TypeLiteral
> = (rec) => (ctx, node) => {
	const propertySignatures = node.propertySignatures;

	if (propertySignatures.length === 0) {
		return Endo.of(Endo.id);
	}

	return ReadonlyArray.reduce(
		propertySignatures,
		Endo.of(Endo.id),
		(prog, propertySignature) =>
			Endo.flatMap(prog, (accEndo) => {
				const path = Ctx.$match(ctx, {
					Root: () => propertySignature.name.toString(),
					Node: (nodeCtx) =>
						`${nodeCtx.path}.${propertySignature.name.toString()}`,
				});

				return Endo.map(
					rec(Ctx.Node({ path, parent: node }), propertySignature.type),
					(memberEndo) =>
						Endo.compose(
							accEndo,
							Endo.patch(path, { required: !propertySignature.isOptional }),
							memberEndo,
						),
				);
			}),
	);
};

export const makeTupleTypeVisitor: Endo.MakeVisitor<Ctx.Node, AST.TupleType> =
	(rec) => (ctx, node) =>
		Match.value(node).pipe(
			Match.withReturnType<Endo.Prog>(),

			// Only rest -> array-like
			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) => {
					const base = Endo.of(Endo.patch(ctx.path, { multiple: true }));

					return ReadonlyArray.reduce(tupleType.rest, base, (prog, type) =>
						Endo.flatMap(prog, (accEndo) =>
							Endo.map(
								rec(
									Ctx.Node({ path: `${ctx.path}[]`, parent: tupleType }),
									type.type,
								),
								(memberEndo) =>
									Endo.compose(
										accEndo,
										Endo.patch(`${ctx.path}[]`, { required: true }),
										memberEndo,
									),
							),
						),
					);
				},
			),

			// Fixed elements (with optional rest)
			Match.whenAnd(
				({ elements }) => elements.length > 0,
				({ rest }) => rest.length >= 0,
				(tupleType) => {
					const base = Endo.of(Endo.id);

					return ReadonlyArray.reduce(
						tupleType.elements,
						base,
						(prog, optionalType, idx) =>
							Endo.flatMap(prog, (accEndo) =>
								Endo.map(
									rec(
										Ctx.Node({
											path: `${ctx.path}[${idx}]`,
											parent: tupleType,
										}),
										optionalType.type,
									),
									(memberEndo) =>
										Endo.compose(
											accEndo,
											Endo.patch(`${ctx.path}[${idx}]`, {
												required: !optionalType.isOptional,
											}),
											memberEndo,
										),
								),
							),
					);
				},
			),

			// Default case
			Match.orElse(() => Endo.of(Endo.id)),
		);

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
	(rec) => (ctx, node) => {
		/**
		 * EDGE CASE: Array of union-of-string-literals
		 * WHY: When an array's element type is a union of string literals
		 * (e.g. Array<'a' | 'b'>) we surface an allow‑list via a single
		 * regex pattern. The downstream constraint engine does not keep
		 * literal sets, so we precompile them to a pattern.
		 */

		if (
			ReadonlyArray.every(
				node.types,
				(t): t is AST.Literal & { literal: string } =>
					AST.isLiteral(t) && Predicate.isString(t.literal),
			)
		) {
			return Ctx.$match(ctx, {
				Root: (): Endo.Prog => Endo.of(Endo.id),
				Node: ({ path }): Endo.Prog =>
					path.endsWith('[]')
						? Endo.of(
								Endo.patch(path, {
									// WHAT: constrain each array item to one of the literal tokens
									pattern: pipe(
										ReadonlyArray.map(
											node.types as ReadonlyArray<
												AST.Literal & { literal: string }
											>,
											Struct.get('literal'),
										),
										ReadonlyArray.map((s) =>
											s
												.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
												.replace(/-/g, '\\x2d'),
										),
										ReadonlyArray.join('|'),
									),
								}),
							)
						: Endo.of(Endo.id),
			});
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
							rec(
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
				const allKeys = Array.from(new Set(snaps.flatMap(Object.keys)));

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

const mergeConstraint = (
	...constraints: readonly Option.Option<Constraint>[]
): Constraint =>
	pipe(
		constraints,
		Option.reduceCompact({}, (b, a) => ({ ...b, ...a })),
	);

export const makeRefinementVisitor: Endo.MakeVisitor<
	Ctx.Node,
	AST.Refinement
> = (rec) => (ctx, node) => {
	const fragment = mergeConstraint(
		Refinements.stringRefinement(node),
		Refinements.numberRefinement(node),
		Refinements.bigintRefinement(node),
		Refinements.dateRefinement(node),
	);

	// Compose: first apply the refinement fragment at ctx.path, then continue with "from"
	return Endo.map(
		rec(Ctx.Node({ path: ctx.path, parent: node }), node.from),
		(endo) => Endo.compose(Endo.patch(ctx.path, fragment), endo),
	);
};

export const makeTransformationVisitor: Endo.MakeVisitor<
	Ctx.Any,
	AST.Transformation
> = (rec) => (ctx, node) =>
	Ctx.$match(ctx, {
		Root: (rootCtx) => rec(rootCtx, node.to),
		Node: (nodeCtx) =>
			rec(Ctx.Node({ path: nodeCtx.path, parent: node }), node.to),
	});
