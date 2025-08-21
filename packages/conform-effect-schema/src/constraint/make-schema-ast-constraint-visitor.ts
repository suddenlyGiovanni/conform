import { identity } from 'effect/Function';
import * as Match from 'effect/Match';
import * as AST from 'effect/SchemaAST';

import {
	makeRefinementVisitor,
	makeTransformationVisitor,
	makeTypeLiteralVisitor,
	makeTupleTypeVisitor,
	makeUnionVisitor,
	makeSuspendVisitor,
} from './visitors';
import type { ConstraintsEndo, NodeVisitor } from './types';

const endoHashIdentity: ConstraintsEndo = identity;

/**
 * Builds a recursive visitor (ctx-first) for Effect Schema AST.
 * @private
 */
export const makeSchemaAstConstraintVisitor: () => NodeVisitor<AST.AST> =
	() => {
		const rec: NodeVisitor<AST.AST> = (ctx) => (ast) =>
			Match.value(ast).pipe(
				Match.withReturnType<ConstraintsEndo>(),

				// We do not support these AST nodes yet, as it seems they do not make sense in the context of form validation.
				Match.whenOr(
					AST.isAnyKeyword, // Schema.Any
					AST.isNeverKeyword, // Schema.Never
					AST.isObjectKeyword, // Schema.Object
					AST.isSymbolKeyword, // Schema.SymbolFromSelf
					AST.isVoidKeyword, // Schema.Void
					AST.isUnknownKeyword, // Schema.Unknown,
					AST.isUniqueSymbol,
					(_) => {
						throw new Error(
							'Unsupported AST type for Constraint extraction AST: ' + _._tag,
						);
					},
				),

				// for these AST nodes we do not need to process them further
				Match.whenOr(
					AST.isStringKeyword, // Schema.String
					AST.isNumberKeyword, // Schema.Number
					AST.isBigIntKeyword, // Schema.BigIntFromSelf
					AST.isBooleanKeyword, // Schema.Boolean
					AST.isUndefinedKeyword, // Schema.Undefined
					() => endoHashIdentity,
				),

				// for these AST nodes we do not need to process them further
				Match.whenOr(
					AST.isLiteral, // string | number | boolean | null | bigint
					AST.isDeclaration,
					AST.isTemplateLiteral,
					AST.isEnums,
					() => endoHashIdentity,
				),

				Match.when(AST.isTypeLiteral, (node) => typeLiteralVisitor(ctx)(node)),
				Match.when(AST.isTupleType, (node) => tupleTypeVisitor(ctx)(node)),
				Match.when(AST.isUnion, (node) => unionVisitor(ctx)(node)),
				Match.when(AST.isRefinement, (node) => refinementVisitor(ctx)(node)),
				Match.when(AST.isTransformation, (node) =>
					transformationVisitor(ctx)(node),
				),
				Match.when(AST.isSuspend, (node) => suspendVisitor(ctx)(node)),

				Match.exhaustive,
			);

		const typeLiteralVisitor = makeTypeLiteralVisitor(rec);
		const tupleTypeVisitor = makeTupleTypeVisitor(rec);
		const unionVisitor = makeUnionVisitor(rec);
		const refinementVisitor = makeRefinementVisitor(rec);
		const transformationVisitor = makeTransformationVisitor(rec);
		const suspendVisitor = makeSuspendVisitor(rec);

		return rec;
	};
