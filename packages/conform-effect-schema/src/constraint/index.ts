import * as Schema from 'effect/Schema';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as AST from 'effect/SchemaAST';

import * as Visitors from './visitors';
import * as Errors from './errors';
import { Endo, Constraints, Ctx, type ConstraintRecord } from './types';

export const getEffectSchemaConstraint = <A, I>(
	schema: Schema.Schema<A, I>,
): ConstraintRecord => {
	const visitNode: Endo.Visit<Ctx.Node> = (ctx, ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Endo.Prog>(),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown
				AST.isUniqueSymbol,
				(node) =>
					Endo.fail(
						new Errors.UnsupportedNodeError({
							nodeTag: node._tag,
							path: ctx.path,
						}),
					),
			),

			// no-op leaves
			Match.whenOr(
				AST.isStringKeyword, // Schema.String
				AST.isNumberKeyword, // Schema.Number
				AST.isBigIntKeyword, // Schema.BigIntFromSelf
				AST.isBooleanKeyword, // Schema.Boolean
				AST.isUndefinedKeyword, // Schema.Undefined
				() => Endo.of(Endo.id),
			),

			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => Endo.of(Endo.id),
			),

			Match.when(AST.isTypeLiteral, (node) => typeLiteralVisitor(ctx, node)),
			Match.when(AST.isTupleType, (node) => tupleTypeVisitor(ctx, node)),
			Match.when(AST.isUnion, (node) => unionVisitor(ctx, node)),
			Match.when(AST.isRefinement, (node) => refinementVisitor(ctx, node)),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node),
			),
			Match.when(AST.isSuspend, (node) =>
				Endo.fail(
					new Errors.MissingNodeImplementationError({
						nodeTag: node._tag,
						path: ctx.path,
					}),
				),
			),

			Match.exhaustive,
		);

	const visitRoot: Endo.Visit<Ctx.Root> = (ctx, ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Endo.Prog>(),

			Match.when(AST.isTypeLiteral, (node) => typeLiteralVisitor(ctx, node)),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node),
			),
			Match.when(AST.isUnion, (node) => unionVisitor(ctx, node)),

			Match.orElse((node) =>
				Endo.fail(
					new Errors.IllegalRootNode({
						expectedNode: 'TypeLiteral',
						actualNode: node._tag,
					}),
				),
			),
		);

	const visit: Endo.Visit<Ctx.Any> = (ctx, node) =>
		Ctx.$match(ctx, {
			Root: (ctxRoot) => visitRoot(ctxRoot, node),
			Node: (ctxNode) => visitNode(ctxNode, node),
		});

	const typeLiteralVisitor = Visitors.makeTypeLiteralVisitor(visit);
	const tupleTypeVisitor = Visitors.makeTupleTypeVisitor(visitNode);
	const unionVisitor = Visitors.makeUnionVisitor(visit);
	const refinementVisitor = Visitors.makeRefinementVisitor(visitNode);
	const transformationVisitor = Visitors.makeTransformationVisitor(visit);

	return pipe(
		visit,
		(visit) => visit(Ctx.Root(), schema.ast),
		Either.map((endo) => endo(Constraints.empty())),
		Either.getOrThrowWith((error) => {
			throw error;
		}),
		Constraints.toRecord,
	);
};
