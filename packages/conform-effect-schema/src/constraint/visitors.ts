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

export const makeUnionVisitor: Endo.MakeVisitor<Ctx.Any, AST.Union> =
	(rec) => (ctx, node) => {
		// 1) If the union is entirely string literals and we're on an array item path,
		//    attach a pattern constraint for those literals.
		const isStringLiteral = (
			t: AST.AST,
		): t is AST.Literal & { literal: string } =>
			AST.isLiteral(t) && Predicate.isString(t.literal);

		const regexEscape = (s: string): string =>
			s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

		const patternFromLiterals = (values: readonly string[]): string =>
			values.map(regexEscape).join('|');

		const maybeStringLiterals: Option.Option<string[]> = node.types.every(
			isStringLiteral,
		)
			? Option.some(node.types.map(Struct.get('literal')))
			: Option.none();

		const baseProg: Endo.Prog = Option.match(maybeStringLiterals, {
			onNone: () => Endo.of(Endo.id),
			onSome: (literals) =>
				Ctx.$match(ctx, {
					Root: () => Endo.of(Endo.id),
					Node: ({ path }) =>
						path.endsWith('[]')
							? /*
								 * WHEN all union members are string literals,
								 * AND the parent node is an array,
								 * SO the expected type be an array of string literals (e.g. Array<'a' | 'b' | 'c'>),
								 * THEN we need to attach a pattern constraint to the array item path.
								 */
								Endo.of(
									Endo.patch(path, {
										pattern: patternFromLiterals(literals),
									}),
								)
							: Endo.of(Endo.id),
				}),
		});

		const adjustedCtx: Ctx.Any = Ctx.$match(ctx, {
			Node: (nodeCtx) => Ctx.Node({ path: nodeCtx.path, parent: node }),
			Root: (rootCtx) => rootCtx,
		});

		type Acc = { endo: Endo.Endo; snaps: Array<ConstraintRecord> };

		// 2) Visit each union member once, collecting:
		//    - the composed endomorphism over constraints
		//    - a snapshot of keys/required flags produced by that member alone
		const collectProg: Either.Either<Acc, Errors> = ReadonlyArray.reduce(
			node.types,
			Either.right({ endo: Endo.id, snaps: [] }) as Either.Either<Acc, Errors>,
			(acc, member) =>
				Either.flatMap(acc, (state) =>
					Either.map(rec(adjustedCtx, member), (memberEndo) => {
						const snap = Constraints.toRecord(memberEndo(Constraints.empty()));
						return {
							endo: Endo.compose(state.endo, memberEndo),
							snaps: [...state.snaps, snap],
						};
					}),
				),
		);

		// 3) Normalize required across branches: a path is required if it is present
		//    and required in ALL branches; otherwise mark it as optional.
		return Endo.flatMap(baseProg, (baseEndo) =>
			Either.map(collectProg, ({ endo: membersEndo, snaps }) => {
				const allKeys = Array.from(
					new Set(snaps.flatMap((r) => Object.keys(r))),
				);

				const requiredInAll = new Set(
					allKeys.filter((k) =>
						snaps.every((r) => r[k] && r[k].required === true),
					),
				);

				const toOptional = allKeys.filter((k) => !requiredInAll.has(k));
				const normalizeRequired = Endo.compose(
					...toOptional.map((k) => Endo.patch(k, { required: false })),
				);

				return Endo.compose(baseEndo, membersEndo, normalizeRequired);
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
