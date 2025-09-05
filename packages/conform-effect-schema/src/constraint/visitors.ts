import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as Option from 'effect/Option';
import * as AST from 'effect/SchemaAST';
import * as Predicate from 'effect/Predicate';
import * as Struct from 'effect/Struct';
import { pipe } from 'effect/Function';

import * as Refinements from './refinements';
import { type Constraint, Ctx, Endo } from './types';

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

		// Fold each member: compose base endo with each recursive endo
		return ReadonlyArray.reduce(node.types, baseProg, (prog, member) =>
			Endo.flatMap(prog, (accEndo) =>
				Endo.map(
					rec(
						Ctx.$match(ctx, {
							Node: (nodeCtx) => Ctx.Node({ path: nodeCtx.path, parent: node }),
							Root: (rootCtx) => rootCtx,
						}),
						member,
					),
					(memberEndo) => Endo.compose(accEndo, memberEndo),
				),
			),
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
