import type { Constraint } from '@conform-to/dom';
import * as Match from 'effect/Match';
import type * as HashMap from 'effect/HashMap';
import * as AST from 'effect/SchemaAST';

import {
	visitRefinement,
	visitTransformation,
	visitTypeLiteral,
	visitTupleType,
	visitUnion,
	visitSuspend,
} from './handlers';
import type { Rec } from './types';

/**
 * Builds a recursive visitor for Effect Schema AST that updates a constraints map.
 *
 * This factory wires node handlers with the recursive function (Rec), avoiding
 * module-level recursion and enabling future customizations (options, strategies,
 * metadata pre-passes) without changing call sites. The Rec function accepts a
 * context object (ctx) carrying the current path and any other traversal data.
 *
 * @returns A Rec function that can traverse AST nodes and produce constraint edits.
 * @see Rec
 * @private
 */
export function makeUpdateConstraint(): Rec {
	const rec: Rec =
		(ast, ctx ) =>
		(data) =>
			Match.value(ast).pipe(
				Match.withReturnType<HashMap.HashMap<string, Constraint>>(),

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
					() => data,
				),

				// for these AST nodes we do not need to process them further
				Match.whenOr(
					AST.isLiteral, // string | number | boolean | null | bigint
					AST.isDeclaration,
					AST.isTemplateLiteral,
					AST.isEnums,
					() => data,
				),

				Match.when(AST.isTypeLiteral, (node) =>
					visitTypeLiteral(rec)(node, ctx)(data),
				),
				Match.when(AST.isTupleType, (node) =>
					visitTupleType(rec)(node, ctx)(data),
				),
				Match.when(AST.isUnion, (node) => visitUnion(rec)(node, ctx)(data)),
				Match.when(AST.isRefinement, (node) =>
					visitRefinement(rec)(node, ctx)(data),
				),
				Match.when(AST.isTransformation, (transformation) =>
					visitTransformation(rec)(transformation, ctx)(data),
				),
				Match.when(AST.isSuspend, (node) =>
					visitSuspend(rec)(node, ctx)(data),
				),

				Match.exhaustive,
			);

	return rec;
}
