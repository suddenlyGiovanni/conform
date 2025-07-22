import { Constraint } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Match from 'effect/Match';
import * as ReadonlyArray from 'effect/Array';
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import * as Record from 'effect/Record';
import * as Struct from 'effect/Struct';
import * as Schema from 'effect/Schema';
import * as AST from 'effect/SchemaAST';

import {
	bigintRefinement,
	dateRefinement,
	numberRefinement,
	stringRefinement,
} from './internal/refinements';

const updateConstraint = (
	ast: AST.AST,
	data: HashMap.HashMap<string, Constraint>,
	name: string = '',
): HashMap.HashMap<string, Constraint> => {
	return Match.value(ast).pipe(
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
			AST.isTypeLiteral, // Schema.Struct
			(typeLiteral) =>
				pipe(
					typeLiteral,
					Struct.get('propertySignatures'),
					ReadonlyArray.reduce(
						data,
						(_data, { isOptional, name: _name, type }) => {
							const key = Match.value(name).pipe(
								Match.withReturnType<`${string}.${string}` | string>(),
								Match.when(
									Match.nonEmptyString,
									(parentPath) => `${parentPath}.${_name.toString()}`,
								),
								Match.orElse(() => _name.toString()),
							);

							return updateConstraint(
								type,
								HashMap.modifyAt(_data, key, (constraint) =>
									Option.some({
										...Option.getOrElse(constraint, Record.empty),
										required: !isOptional,
									}),
								),
								key,
							);
						},
					),
				),
		),

		Match.when(AST.isTupleType, ({ elements, rest }) => {
			// Schema.Array is represented as special case of Schema.Tuple where it is defined as [...rest: Schema.Any]
			// we need to distinguish between Schema.Array and Schema.Tuple
			// Schema.Array is a special case of Schema.Tuple where ast.elements is empty and ast.rest contains the element type
			// need to set the filed name e.g. {'list[]': { required: true }}

			// let requiredTypes: Array<AST.Type> = ast.elements.filter(
			// 	(e) => !e.isOptional,
			// );
			// if (ast.rest.length > 0) {
			// 	requiredTypes = requiredTypes.concat(ast.rest.slice(1));
			// }

			if (elements.length === 0 && rest.length > 0) {
				// its an array such as [...elements: string[]]
				const keyNestedArray = `${name}[]` as const;

				let _data = HashMap.modifyAt(data, name, (constraint) =>
					Option.some({
						...Option.getOrElse(constraint, Record.empty),
						multiple: true,
					}),
				);

				for (const type of rest) {
					_data = updateConstraint(
						type.type,
						HashMap.set(_data, keyNestedArray, { required: true }),
						keyNestedArray,
					);
				}
				return _data;
			} else if (elements.length > 0 && rest.length >= 0) {
				// it is a tuple with possibly rest elements, such as [head: string, ...tail: number[]]

				return pipe(
					elements,
					ReadonlyArray.reduce(data, (_data, { isOptional, type }, idx) => {
						const key = `${name}[${idx}]` as const;

						return updateConstraint(
							type,
							HashMap.set(_data, key, { required: !isOptional }),
							key,
						);
					}),
				);
			}
			return data;
		}),

		Match.when(AST.isUnion, (union) =>
			pipe(
				union,
				Struct.get('types'),
				ReadonlyArray.reduce(data, (_data, member) =>
					updateConstraint(member, _data, name),
				),
			),
		),

		Match.when(AST.isRefinement, (refinement) => {
			const refinementConstraint = Option.reduceCompact<Constraint, Constraint>(
				[
					stringRefinement(refinement),
					numberRefinement(refinement),
					bigintRefinement(refinement),
					dateRefinement(refinement),
				],
				{},
				(constraints, constraint) => ({ ...constraints, ...constraint }),
			);

			return updateConstraint(
				refinement.from,
				HashMap.modifyAt(data, name, (maybeConstraint) =>
					Option.some({
						...Option.getOrElse(maybeConstraint, Record.empty),
						...refinementConstraint,
					}),
				),
				name,
			);
		}),

		// Unsupported AST types for Constraint extraction
		Match.whenOr(AST.isTransformation, AST.isSuspend, (_) => {
			throw new Error(`TODO: add support for this AST Node type: "${_._tag}"`);
		}),

		Match.exhaustive,
	);
};

export function getEffectSchemaConstraint<Fields extends Schema.Struct.Fields>(
	schema: Schema.Struct<Fields>,
): Record<string, Constraint> {
	if (!AST.isTypeLiteral(schema.ast)) {
		throw new Error(
			'root schema must be a TypeLiteral AST node, e.g. Schema.Struct, instead got: ' +
				schema.ast._tag,
		);
	}

	return pipe(
		HashMap.empty<string, Constraint>(),
		(data) => updateConstraint(schema.ast, data, ''),
		Record.fromEntries,
	);
}
