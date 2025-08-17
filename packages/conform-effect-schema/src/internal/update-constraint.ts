import { Constraint } from '@conform-to/dom';
import { flow, pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Struct from 'effect/Struct';
import * as AST from 'effect/SchemaAST';

import {
	visitRefinement,
	visitTransformation,
	visitTypeLiteral,
	visitTupleType,
	visitUnion,
} from './handlers';
import type { Rec } from './types';

/**
 * Builds a recursive visitor for Effect Schema AST that updates a constraints map.
 *
 * This factory wires node handlers with the recursive function (Rec), avoiding
 * module-level recursion and enabling future customizations (options, strategies,
 * metadata pre-passes) without changing call sites.
 *
 * @remarks
 * If you do not need customization, export a default instance created by this function.
 *
 * @returns A Rec function that can traverse AST nodes and produce constraint edits.
 * @see Rec
 * @private
 */
export function makeUpdateConstraint(): Rec {
	const rec: Rec =
		(ast, name = '') =>
		(data) =>
			Match.value(ast).pipe(
				Match.withReturnType<HashMap.HashMap<string, Constraint>>(),

				// for these AST nodes we do not need to process them further
				Match.whenOr(
					AST.isStringKeyword, // Schema.String
					AST.isNumberKeyword, // Schema.Number
					AST.isBigIntKeyword, // Schema.BigIntFromSelf
					AST.isBooleanKeyword, // Schema.Boolean
					AST.isUndefinedKeyword, // Schema.Undefined
					() => data,
				),

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
					AST.isLiteral, // string | number | boolean | null | bigint
					AST.isDeclaration,
					AST.isTemplateLiteral,
					AST.isEnums,
					() => data,
				),

				Match.when(
					AST.isTypeLiteral, // Schema.Struct | Schema.Record ??
					(node) => visitTypeLiteral(rec)(node, name)(data),
				),

				Match.when(
					AST.isTupleType,
					/**
					 * Schema.Array is represented as special case of Schema.Tuple where it is defined as [...rest: Schema.Any]
					 * we need to distinguish between Schema.Array and Schema.Tuple
					 * Schema.Array is a special case of Schema.Tuple where ast.elements is empty and ast.rest contains the element type
					 * need to set the filed name e.g. {'list[]': { required: true }}
					 */
					(node) =>
						pipe(
							node,
							Match.value,
							Match.whenAnd(
								({ elements }) => elements.length === 0,
								({ rest }) => rest.length > 0,
								flow(
									Struct.get('rest')<AST.TupleType>,
									ReadonlyArray.reduce(
										HashMap.modifyAt(data, name, (constraint) =>
											Option.some({
												...Option.getOrElse(constraint, Record.empty),
												multiple: true,
											}),
										),
										(hashMap, type) =>
											pipe(
												HashMap.set(hashMap, `${name}[]`, { required: true }),
												rec(type.type, `${name}[]`),
											),
									),
								),
							),

							Match.whenAnd(
								({ elements }) => elements.length > 0,
								({ rest }) => rest.length >= 0,
								flow(
									Struct.get('elements')<AST.TupleType>,
									ReadonlyArray.reduce(
										data,
										(hashMap, { isOptional, type }, idx) =>
											pipe(
												HashMap.set(hashMap, `${name}[${idx}]`, {
													required: !isOptional,
												}),
												rec(type, `${name}[${idx}]`),
											),
									),
								),
							),

							Match.orElse(() => data),
						),
				),

				Match.when(AST.isUnion, (node) =>
					pipe(
						node,
						Struct.get('types')<AST.Union>,
						ReadonlyArray.reduce(data, (hashMap, member) => {
							// edge case to handle `Schema.Array(Schema.Literal('a', 'b', 'c'))` which should return a constraint of type:
							// `{ required: true, pattern: 'a|b|c' }`
							// if union of string literals ( eq to enums of strings e.g. Schema.Literal('a', 'b', 'c') )
							// it is contained by an array
							// meaning the ts type would equal to `Array<'a' | 'b' | 'c'>`
							// then we need to add the correct constraint to the hashmap:
							// a pattern constraint with the correct regex: e.g. /a|b|c/ .

							return pipe(hashMap, rec(member, name));
						}),
					),
				),

				Match.when(AST.isRefinement, (node) =>
					visitRefinement(rec)(node, name)(data),
				),
				Match.when(AST.isTransformation, (transformation) =>
					visitTransformation(rec)(transformation, name)(data),
				),

				// Unsupported AST types for Constraint extraction
				Match.when(AST.isSuspend, (_) => {
					throw new Error(
						`TODO: add support for this AST Node type: "${_._tag}"`,
					);
				}),

				Match.exhaustive,
			);

	return rec;
}
