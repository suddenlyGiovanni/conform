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
export const makeSchemaAstConstraintVisitor: () => Types.NodeVisitor = () => {
	/**
	 * Node-context recursive dispatcher: accepts only Ctx.Node
	 */
	const recNode: Types.NodeVisitor<Ctx.Node> = (ctx) => (ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Types.ConstraintsEndo>(),

			// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
			Match.whenOr(
				AST.isAnyKeyword, // Schema.Any
				AST.isNeverKeyword, // Schema.Never
				AST.isObjectKeyword, // Schema.Object
				AST.isSymbolKeyword, // Schema.SymbolFromSelf
				AST.isVoidKeyword, // Schema.Void
				AST.isUnknownKeyword, // Schema.Unknown,
				AST.isUniqueSymbol,
				(node) => () =>
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
				() => (constraints) => Either.right(constraints),
			),

			Match.whenOr(
				AST.isLiteral, // string | number | boolean | null | bigint
				AST.isDeclaration,
				AST.isTemplateLiteral,
				AST.isEnums,
				() => (constraints) => Either.right(constraints),
			),

			Match.when(
				AST.isTypeLiteral,
				(node) => (constraints) => typeLiteralVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isTupleType,
				(node) => (constraints) => tupleTypeVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isUnion,
				(node) => (constraints) => unionVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isRefinement,
				(node) => (constraints) => refinementVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isTransformation,
				(node) => (constraints) =>
					transformationVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isSuspend,
				(node) => () =>
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
	const recRoot: Types.NodeVisitor<Ctx.Root> = (ctx) => (ast) =>
		Match.value(ast).pipe(
			Match.withReturnType<Types.ConstraintsEndo>(),

			Match.when(
				AST.isTypeLiteral,
				(node) => (constraints) => typeLiteralVisitor(ctx)(node)(constraints),
			),
			Match.when(
				AST.isTransformation,
				(node) => (constraints) =>
					transformationVisitor(ctx)(node)(constraints),
			),

			Match.orElse(
				(node) => () =>
					Either.left(
						new Errors.IllegalRootNode({
							expectedNode: 'TypeLiteral',
							actualNode: node._tag,
						}),
					),
			),
		);

	const rec: Types.NodeVisitor = (ctxType) =>
		Match.valueTags(ctxType, {
			Root: recRoot,
			Node: recNode,
		});

	const typeLiteralVisitor = Visitors.makeTypeLiteralVisitor(rec);
	const tupleTypeVisitor = Visitors.makeTupleTypeVisitor(recNode);
	const unionVisitor = Visitors.makeUnionVisitor(recNode);
	const refinementVisitor = Visitors.makeRefinementVisitor(recNode);
	const transformationVisitor = Visitors.makeTransformationVisitor(rec);
	return rec;
};
