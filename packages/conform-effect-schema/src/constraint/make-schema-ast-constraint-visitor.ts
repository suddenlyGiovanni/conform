import * as Match from 'effect/Match';
import * as AST from 'effect/SchemaAST';
import * as Either from 'effect/Either';

import * as Visitors from './visitors';
import type * as Types from './types';
import type { Ctx } from './ctx';
import * as Errors from './errors';

/**
 * Builds a recursive visitor (ctx-first) for Effect Schema AST.
 * @private
 */
export const makeSchemaAstConstraintVisitor: () => Types.VisitState = () => {
	/**
	 * Node-context recursive dispatcher: accepts only Ctx.Node
	 */
	const recNode: Types.VisitState<Ctx.Node> = (ctx, ast, acc) =>
		Match.value(ast).pipe(
			Match.withReturnType<Types.ResultConstraints>(),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown,
				AST.isUniqueSymbol,
				(node) =>
					Either.left(
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
				() => Either.right(acc),
			),

			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => Either.right(acc),
			),

			Match.when(AST.isTypeLiteral, (node) =>
				typeLiteralVisitor(ctx, node, acc),
			),
			Match.when(AST.isTupleType, (node) => tupleTypeVisitor(ctx, node, acc)),
			Match.when(AST.isUnion, (node) => unionVisitor(ctx, node, acc)),
			Match.when(AST.isRefinement, (node) => refinementVisitor(ctx, node, acc)),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node, acc),
			),
			Match.when(AST.isSuspend, (node) =>
				Either.left(
					new Errors.MissingNodeImplementationError({
						nodeTag: node._tag,
						path: ctx.path,
					}),
				),
			),

			Match.exhaustive,
		);

	/**
	 * Root-context dispatcher: only allow root-legal nodes (TypeLiteral)
	 */
	const recRoot: Types.VisitState<Ctx.Root> = (ctx, ast, acc) =>
		Match.value(ast).pipe(
			Match.withReturnType<Types.ResultConstraints>(),

			Match.when(AST.isTypeLiteral, (node) =>
				typeLiteralVisitor(ctx, node, acc),
			),
			Match.when(AST.isTransformation, (node) =>
				transformationVisitor(ctx, node, acc),
			),

			Match.orElse((node) =>
				Either.left(
					new Errors.IllegalRootNode({
						expectedNode: 'TypeLiteral',
						actualNode: node._tag,
					}),
				),
			),
		);

	const rec: Types.VisitState = (ctx, node, acc) =>
		Match.valueTags(ctx, {
			Root: (rootCtx) => recRoot(rootCtx, node, acc),
			Node: (nodeCtx) => recNode(nodeCtx, node, acc),
		});

	const typeLiteralVisitor = Visitors.makeTypeLiteralVisitor(rec);
	const tupleTypeVisitor = Visitors.makeTupleTypeVisitor(recNode);
	const unionVisitor = Visitors.makeUnionVisitor(recNode);
	const refinementVisitor = Visitors.makeRefinementVisitor(recNode);
	const transformationVisitor = Visitors.makeTransformationVisitor(rec);
	return rec;
};
