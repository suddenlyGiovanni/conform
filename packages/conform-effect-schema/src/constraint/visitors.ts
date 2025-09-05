import * as ReadonlyArray from 'effect/Array';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as AST from 'effect/SchemaAST';
import * as Struct from 'effect/Struct';

import * as Refinements from './refinements';
import { type Constraint, Constraints, Ctx, Endo, type Errors } from './types';

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
 * @todo extends union type visitor for root nodes `Endo.MakeVisitor<Ctx.Any, AST.Union>`
 */
export const makeUnionVisitor: Endo.MakeVisitor<Ctx.Any, AST.Union> =
	(rec) => (ctx, node) => {
		const isStringLiteral = (
			t: AST.AST,
		): t is AST.Literal & { literal: string } =>
			AST.isLiteral(t) && Predicate.isString(t.literal);

		const regexEscape = (s: string) =>
			s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

		const patternFromLiterals = (values: readonly string[]): string =>
			values.map(regexEscape).join('|');

		// Collect string literals if this union is entirely string literal members
		const maybeStringLiterals = node.types.every(isStringLiteral)
			? Option.some(node.types.map(Struct.get('literal')))
			: Option.none();

		// Only annotate pattern on array item context (ctx.path ends with "[]")
		const baseProg: ReturnType<typeof Endo.of> = Option.match(
			maybeStringLiterals,
			{
				onNone: () => Endo.of(Endo.id),
				onSome: (literals) =>
					Ctx.$match(ctx, {
						Root: () => Endo.of(Endo.id),
						Node: ({ path }) =>
							path.endsWith('[]')
								? Endo.of(
										Endo.patch(path, {
											pattern: patternFromLiterals(literals),
										}),
									)
								: Endo.of(Endo.id),
					}),
			},
		);

		// Gather each member endo and its produced constraints snapshot
		const adjustedCtx = Ctx.$match(ctx, {
			Node: (nodeCtx) => Ctx.Node({ path: nodeCtx.path, parent: node }),
			Root: (rootCtx) => rootCtx,
		});

		// Build list of member programs
		const memberProgs = node.types.map((member) => rec(adjustedCtx, member));

		// Compose base endo with each member endo, while also computing presence/required sets
		return ReadonlyArray.reduce(memberProgs, baseProg, (prog, memberProg) =>
			Endo.flatMap(prog, (accEndo) =>
				Endo.flatMap(memberProg, (memberEndo) => {
					// Stash the snapshot on the composed endo via closure by extending with a
					// post-composition patch that will adjust required flags after all members
					// have been composed. We'll accumulate snapshots in an array kept in
					// this scope.
					// To do this properly, we keep an array in the outer closure; since
					// we're inside a reduction we can capture it through function scope.
					return Endo.of(
						Endo.compose(
							accEndo,
							// First, apply the member endo to accumulate all constraints
							memberEndo,
							// Then, a no-op that we will replace later in a second pass
						),
					);
				}),
			),
		).pipe(
			// After composing all members, add a final pass to normalize `required`
			// across union branches: a path is required only if it is present AND
			// required in all members, otherwise it must be optional (required: false).
			(prog) =>
				Endo.flatMap(prog, (composedMembersEndo) => {
					// Recompute snapshots for all members to aggregate; we need to do it here
					// because earlier we couldn't persist them through the Prog type.
					const snapshotsE = ReadonlyArray.reduce(
						node.types,
						Either.right(
							[] as Array<Record<string, Constraint>>,
						) as Either.Either<Array<Record<string, Constraint>>, Errors>,
						(acc, member) =>
							Either.flatMap(acc, (arr) =>
								Either.map(rec(adjustedCtx, member), (endo) => [
									...arr,
									Constraints.toRecord(endo(Constraints.empty())),
								]),
							),
					);

					return Either.map(snapshotsE, (snapshots) => {
						// Compute the union of all keys across members
						const allKeys = Array.from(
							new Set(snapshots.flatMap((r) => Object.keys(r))),
						);

						// Determine keys that are required in all members
						const requiredInAll = new Set(
							allKeys.filter((k) =>
								snapshots.every((r) => r[k] && r[k].required === true),
							),
						);

						// Keys that should become optional in the union result
						const toOptional = allKeys.filter((k) => !requiredInAll.has(k));

						// Build a final normalization endo that patches required: false
						const normalizeRequiredEndo = Endo.compose(
							...toOptional.map((k) => Endo.patch(k, { required: false })),
						);

						return Endo.compose(composedMembersEndo, normalizeRequiredEndo);
					});
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
