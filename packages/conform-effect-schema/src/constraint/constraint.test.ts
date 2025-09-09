/* eslint-disable import/namespace */
import * as Schema from 'effect/Schema';
import type * as Types from 'effect/Types';
import { describe, expect, expectTypeOf, test } from 'vitest';

import { getEffectSchemaConstraint } from '../index';
import type { Constraint, ConstraintRecord } from './types';

describe('getEffectSchemaConstraint', () => {
	test('should throw on non-object root schemas', () => {
		expect(() => getEffectSchemaConstraint(Schema.String)).toThrow(
			"Root schema must be an AST node 'TypeLiteral', instead got: 'StringKeyword'",
		);
		expect(() =>
			getEffectSchemaConstraint(Schema.Array(Schema.String)),
		).toThrow(
			"Root schema must be an AST node 'TypeLiteral', instead got: 'TupleType'",
		);
	});

	describe('string', () => {
		test('should mark optional string field as not required', () => {
			const schema = Schema.Struct({
				requiredText: Schema.String,
				optionalText: Schema.optional(Schema.String),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				optionalText: {
					required: false,
				},
				requiredText: {
					required: true,
				},
			});
		});

		test('should treat literal string as required', () => {
			const literal = 'literal';
			const schema = Schema.Struct({ literalString: Schema.Literal(literal) });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalString: { required: true } });
		});

		test('should handle plain string field', () => {
			expect(
				getEffectSchemaConstraint(
					Schema.Struct({
						requiredText: Schema.String,
					}),
				),
			).toEqual<Record<string, Constraint>>({
				requiredText: { required: true },
			});
		});

		describe('refinements', () => {
			test('should apply minLength refinement', () => {
				const minLength = 1;
				const schema = Schema.Struct({
					requiredTextAndWithMinLength: Schema.String.pipe(
						Schema.minLength(minLength),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					requiredTextAndWithMinLength: {
						required: true,
						minLength,
					},
				});
			});

			test('should apply maxLength refinement after minLength', () => {
				// handling multiple transformations
				const minLength = 1;
				const maxLength = 10;
				const schema = Schema.Struct({
					requiredTextAndWithMinLength: Schema.String.pipe(
						Schema.minLength(minLength),
						Schema.maxLength(maxLength),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					requiredTextAndWithMinLength: {
						required: true,
						minLength,
						maxLength,
					},
				});
			});

			test.each([
				{
					inputLength: 10,
					expected: {
						maxLength: 10,
						minLength: 10,
					},
				},
				{
					inputLength: {
						min: 20,
						max: 20,
					},
					expected: {
						maxLength: 20,
						minLength: 20,
					},
				},
				{
					inputLength: {
						min: 15,
						max: 50,
					},
					expected: {
						maxLength: 50,
						minLength: 15,
					},
				},
			])('should apply length refinement', ({ inputLength, expected }) => {
				const schema = Schema.Struct({
					requiredTextAndWithMinLength: Schema.String.pipe(
						Schema.length(inputLength),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					requiredTextAndWithMinLength: {
						required: true,
						maxLength: expected.maxLength,
						minLength: expected.minLength,
					},
				});
			});

			test('should apply NonEmptyString refinement', () => {
				const schema = Schema.Struct({
					nonEmptyString: Schema.NonEmptyString,
				});
				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					nonEmptyString: {
						required: true,
						minLength: 1,
					},
				});
			});

			test('should apply pattern refinement', () => {
				const regex = new RegExp(/^[a-z]+$/);

				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.pattern(regex)),
				});
				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: regex.source,
					},
				});
			});

			test('should apply startsWith refinement', () => {
				const startsWith = 'prefix';
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.startsWith(startsWith)),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: `^${startsWith}`,
					},
				});
			});

			test('should apply endsWith refinement', () => {
				const endsWith = 'postfix';
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.endsWith(endsWith)),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: `^.*${endsWith}$`,
					},
				});
			});

			test('should apply includes refinement', () => {
				const infix = 'infix';
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.includes(infix)),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: `.*${infix}.*`,
					},
				});
			});

			test('should apply trimmed refinement', () => {
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.trimmed()),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: '^\\S[\\s\\S]*\\S$|^\\S$|^$',
					},
				});
			});

			test('should apply lowercased refinement', () => {
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.lowercased()),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: '^[^A-Z]*$',
					},
				});
			});

			test('should apply uppercased refinement', () => {
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.uppercased()),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: '^[^a-z]*$',
					},
				});
			});

			test('should apply capitalized refinement', () => {
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.capitalized()),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: '^[^a-z]?.*$',
					},
				});
			});

			test('should apply uncapitalized refinement', () => {
				const schema = Schema.Struct({
					pattern: Schema.String.pipe(Schema.uncapitalized()),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					pattern: {
						required: true,
						pattern: '^[^A-Z]?.*$',
					},
				});
			});
		});

		describe('transformations', () => {
			test('should derive constraints from split transformation', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							split: Schema.split(','),
						}),
					),
				).toEqual({
					split: {
						multiple: true,
						required: true,
					},
					'split[]': {
						required: true,
					},
				});
			});

			test('should apply trim then maxLength refinement', () => {
				const maxLength = 10;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							trim: Schema.Trim.pipe(Schema.maxLength(maxLength)),
						}),
					),
				).toEqual({
					trim: {
						pattern: '^\\S[\\s\\S]*\\S$|^\\S$|^$',
						required: true,
						maxLength,
					},
				});
			});

			test('should apply lowercase then minLength refinement', () => {
				const minLength = 10;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							lowercase: Schema.Lowercase.pipe(Schema.minLength(minLength)),
						}),
					),
				).toEqual({
					lowercase: {
						pattern: '^[^A-Z]*$',
						required: true,
						minLength,
					},
				});
			});

			test('should apply uppercase then minLength refinement', () => {
				const minLength = 10;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							uppercase: Schema.Uppercase.pipe(Schema.minLength(minLength)),
						}),
					),
				).toEqual({
					uppercase: {
						pattern: '^[^a-z]*$',
						required: true,
						minLength,
					},
				});
			});

			test('should apply capitalize then minLength refinement', () => {
				const minLength = 10;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							capitalize: Schema.Capitalize.pipe(Schema.minLength(minLength)),
						}),
					),
				).toEqual({
					capitalize: {
						pattern: '^[^a-z]?.*$',
						required: true,
						minLength,
					},
				});
			});

			test('should apply uncapitalize then minLength refinement', () => {
				const minLength = 10;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							uncapitalize: Schema.Uncapitalize.pipe(
								Schema.minLength(minLength),
							),
						}),
					),
				).toEqual({
					uncapitalize: {
						pattern: '^[^A-Z]?.*$',
						required: true,
						minLength,
					},
				});
			});
		});
	});

	describe('number', () => {
		test('should handle plain number field', () => {
			const schema = Schema.Struct({ number: Schema.Number });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ number: { required: true } });
		});

		test('should mark optional number field as not required', () => {
			const schema = Schema.Struct({
				optionalNumber: Schema.optional(Schema.Number),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ optionalNumber: { required: false } });
		});

		test('should treat literal number as required', () => {
			const literal = 42;
			const schema = Schema.Struct({ literalNumber: Schema.Literal(literal) });

			expectTypeOf<typeof schema.Type>().toEqualTypeOf<{
				readonly literalNumber: 42;
			}>();

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalNumber: { required: true } });
		});

		test('should apply greaterThan refinement', () => {
			const exclusiveMinimum = 5;
			const schema = Schema.Struct({
				numberGreaterThan: Schema.Number.pipe(
					Schema.greaterThan(exclusiveMinimum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberGreaterThan: {
					required: true,
					min: exclusiveMinimum,
				},
			});
		});

		test('should apply greaterThanOrEqualTo refinement', () => {
			const inclusiveMinimum = 10;
			const schema = Schema.Struct({
				numberGreaterThanOrEqualTo: Schema.Number.pipe(
					Schema.greaterThanOrEqualTo(inclusiveMinimum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberGreaterThanOrEqualTo: {
					required: true,
					min: inclusiveMinimum,
				},
			});
		});

		test('should apply lessThan refinement', () => {
			const exclusiveMaximum = 7;
			const schema = Schema.Struct({
				numberLessThan: Schema.Number.pipe(Schema.lessThan(exclusiveMaximum)),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberLessThan: {
					required: true,
					max: exclusiveMaximum,
				},
			});
		});

		test('should apply lessThanOrEqualTo refinement', () => {
			const inclusiveMaximum = 42;
			const schema = Schema.Struct({
				numberLessThanOrEqualTo: Schema.Number.pipe(
					Schema.lessThanOrEqualTo(inclusiveMaximum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberLessThanOrEqualTo: {
					required: true,
					max: inclusiveMaximum,
				},
			});
		});

		test('should apply between refinement', () => {
			const inclusiveMinimum = 3;
			const inclusiveMaximum = 7;
			const schema = Schema.Struct({
				numberBetween: Schema.Number.pipe(
					Schema.between(inclusiveMinimum, inclusiveMaximum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberBetween: {
					required: true,
					max: inclusiveMaximum,
					min: inclusiveMinimum,
				},
			});
		});

		test('should apply multipleOf refinement', () => {
			const divisor = 3;
			const schema = Schema.Struct({
				numberBetween: Schema.Number.pipe(Schema.multipleOf(divisor)),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				numberBetween: {
					required: true,
					step: divisor,
				},
			});
		});

		describe('transformations', () => {
			test('should apply NumberFromString then greaterThan refinement', () => {
				const exclusiveMinimum = 5;

				const schema = Schema.Struct({
					numberFromString: Schema.NumberFromString.pipe(
						Schema.greaterThan(exclusiveMinimum),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					numberFromString: {
						required: true,
						min: exclusiveMinimum,
					},
				});
			});

			test('should apply clamp transformation', () => {
				const minimum = -1;
				const maximum = 1;

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							clamp: Schema.Number.pipe(Schema.clamp(minimum, maximum)),
						}),
					),
				).toEqual({
					clamp: {
						max: maximum,
						min: minimum,
						required: true,
					},
				});
			});

			test('should parse number from string', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							parsedNumber: Schema.String.pipe(Schema.parseNumber),
						}),
					),
				).toEqual({ parsedNumber: { required: true } });
			});
		});
	});

	describe('bigint', () => {
		test('should handle plain bigint field', () => {
			const schema = Schema.Struct({ bigInt: Schema.BigIntFromSelf });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ bigInt: { required: true } });
		});

		test('should mark optional bigint field as not required', () => {
			const schema = Schema.Struct({
				optionalBigInt: Schema.optional(Schema.BigIntFromSelf),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ optionalBigInt: { required: false } });
		});

		test('should treat literal bigint as required', () => {
			const literal = 42n;
			const schema = Schema.Struct({ literalBigInt: Schema.Literal(literal) });

			expectTypeOf<typeof schema.Type>().toEqualTypeOf<{
				readonly literalBigInt: 42n;
			}>();

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalBigInt: { required: true } });
		});

		test('should apply greaterThanBigInt refinement', () => {
			const exclusiveMinimum = 5n;
			const schema = Schema.Struct({
				bigIntGreaterThan: Schema.BigIntFromSelf.pipe(
					Schema.greaterThanBigInt(exclusiveMinimum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				bigIntGreaterThan: {
					required: true,
					min: exclusiveMinimum as unknown as number,
				},
			});
		});

		test('should apply greaterThanOrEqualToBigInt refinement', () => {
			const inclusiveMinimumBigInt = 10n;
			const schema = Schema.Struct({
				bigIntGreaterThanOrEqualTo: Schema.BigIntFromSelf.pipe(
					Schema.greaterThanOrEqualToBigInt(inclusiveMinimumBigInt),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				bigIntGreaterThanOrEqualTo: {
					required: true,
					min: inclusiveMinimumBigInt as unknown as number,
				},
			});
		});

		test('should apply lessThanBigInt refinement', () => {
			const exclusiveMaximum = 7n;
			const schema = Schema.Struct({
				bigIntLessThan: Schema.BigIntFromSelf.pipe(
					Schema.lessThanBigInt(exclusiveMaximum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				bigIntLessThan: {
					required: true,
					max: exclusiveMaximum as unknown as number,
				},
			});
		});

		test('should apply lessThanOrEqualToBigInt refinement', () => {
			const inclusiveMaximum = 42n;
			const schema = Schema.Struct({
				bigIntLessThanOrEqualTo: Schema.BigIntFromSelf.pipe(
					Schema.lessThanOrEqualToBigInt(inclusiveMaximum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				bigIntLessThanOrEqualTo: {
					required: true,
					max: inclusiveMaximum as unknown as number,
				},
			});
		});

		test('should apply betweenBigInt refinement', () => {
			const inclusiveMinimum = -2n;
			const inclusiveMaximum = 2n;
			const schema = Schema.Struct({
				bigIntBetween: Schema.BigIntFromSelf.pipe(
					Schema.betweenBigInt(inclusiveMinimum, inclusiveMaximum),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				bigIntBetween: {
					required: true,
					max: inclusiveMaximum as unknown as number,
					min: inclusiveMinimum as unknown as number,
				},
			});
		});

		describe('transformations', () => {
			test('should parse BigInt from string', () => {
				// Converts a string to a BigInt using the BigInt constructor.
				expect(
					getEffectSchemaConstraint(Schema.Struct({ bigInt: Schema.BigInt })),
				).toEqual({ bigInt: { required: true } });
			});

			test('should transform BigIntFromNumber with safe integer bounds', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							bigIntFromNumber: Schema.BigIntFromNumber,
						}),
					),
				).toEqual({
					bigIntFromNumber: {
						required: true,
						max: BigInt(Number.MAX_SAFE_INTEGER),
						min: BigInt(Number.MIN_SAFE_INTEGER),
					},
				});
			});

			test('should apply clampBigInt transformation', () => {
				const maximum = 1n;
				const minimum = -maximum;
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							clampBigInt: Schema.BigIntFromSelf.pipe(
								Schema.clampBigInt(minimum, maximum),
							),
						}),
					),
				).toEqual({
					clampBigInt: {
						required: true,
						max: maximum,
						min: minimum,
					},
				});
			});
		});
	});

	describe('date', () => {
		test('should mark optional date field as not required', () => {
			const schema = Schema.Struct({
				optionalDate: Schema.optional(Schema.DateFromSelf),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				optionalDate: {
					required: false,
				},
			});
		});

		describe('refinements', () => {
			test('should apply greaterThanDate refinement', () => {
				const minExclusiveDate = new Date('2020-01-01');
				const schema = Schema.Struct({
					dateGreaterThanDate: Schema.DateFromSelf.pipe(
						Schema.greaterThanDate(minExclusiveDate),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					dateGreaterThanDate: {
						required: true,
						min: '2020-01-01', // yyyy-mm-dd format
					},
				});
			});

			test('should apply greaterThanOrEqualToDate refinement', () => {
				const minInclusiveDate = new Date('2022-01-01');
				const schema = Schema.Struct({
					dateGreaterThanOrEqualToDate: Schema.DateFromSelf.pipe(
						Schema.greaterThanOrEqualToDate(minInclusiveDate),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					dateGreaterThanOrEqualToDate: {
						required: true,
						min: '2022-01-01', // yyyy-mm-dd format
					},
				});
			});

			test('should apply lessThanDate refinement', () => {
				const maxExclusiveDate = new Date('1969-01-01');
				const schema = Schema.Struct({
					dateLessThanDate: Schema.DateFromSelf.pipe(
						Schema.lessThanDate(maxExclusiveDate),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					dateLessThanDate: {
						required: true,
						max: '1969-01-01', // yyyy-mm-dd format
					},
				});
			});

			test('should apply lessThanOrEqualToDate refinement', () => {
				const maxInclusiveDate = new Date('1911-01-01');
				const schema = Schema.Struct({
					dateLessThanOrEqualToDate: Schema.DateFromSelf.pipe(
						Schema.lessThanOrEqualToDate(maxInclusiveDate),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					dateLessThanOrEqualToDate: {
						required: true,
						max: '1911-01-01', // yyyy-mm-dd format
					},
				});
			});

			test('should apply betweenDate refinement', () => {
				const minInclusiveDate = new Date('2001-01-01');
				const maxInclusiveDate = new Date('2021-01-01');
				const schema = Schema.Struct({
					dateBetweenDate: Schema.DateFromSelf.pipe(
						Schema.betweenDate(minInclusiveDate, maxInclusiveDate),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
				>({
					dateBetweenDate: {
						required: true,
						min: '2001-01-01',
						max: '2021-01-01',
					},
				});
			});
		});

		describe('transformations', () => {
			test('should transform Date string then apply range refinements', () => {
				const min = '2022-01-01';
				const max = '2022-12-31';

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							date: Schema.Date.pipe(
								Schema.greaterThanOrEqualToDate(new Date(min)),
								Schema.lessThanOrEqualToDate(new Date(max)),
							),
						}),
					),
				).toEqual({ date: { required: true, min, max } });
			});
		});
	});

	describe('boolean', () => {
		test('should mark optional boolean field as not required', () => {
			const schema = Schema.Struct({
				optionalBoolean: Schema.optional(Schema.Boolean),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				optionalBoolean: { required: false },
			});
		});

		test('should treat boolean field as required', () => {
			const schema = Schema.Struct({
				requiredBoolean: Schema.Boolean,
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				requiredBoolean: { required: true },
			});
		});

		test('should treat literal boolean as required', () => {
			const schema = Schema.Struct({
				literalBoolean: Schema.Literal(true),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				literalBoolean: { required: true },
			});
		});

		describe('transformations', () => {
			test('should apply not transformation', () => {
				expect(
					getEffectSchemaConstraint(Schema.Struct({ not: Schema.Not })),
				).toEqual({ not: { required: true } });
			});
		});
	});

	describe('array', () => {
		test('should handle basic array', () => {
			const schema = Schema.Struct({ array: Schema.Array(Schema.String) });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema> | string, Constraint>
			>({
				array: {
					required: true,
					multiple: true,
				},
				'array[]': { required: true },
			});
		});

		describe('nested data', () => {
			test('should handle array of structs', () => {
				const schema = Schema.Struct({
					list: Schema.Array(
						Schema.Struct({
							key: Schema.String.pipe(Schema.minLength(1)),
							value: Schema.Number.pipe(Schema.greaterThanOrEqualTo(42)),
						}),
					).pipe(Schema.minItems(1)),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema> | string, Constraint>
				>({
					list: {
						required: true,
						multiple: true,
					},
					'list[]': { required: true },
					'list[].key': {
						required: true,
						minLength: 1,
					},
					'list[].value': {
						required: true,
						min: 42,
					},
				});
			});

			test('should handle array of struct with optional field', () => {
				const schema = Schema.Struct({
					list: Schema.Array(
						Schema.Struct({
							value: Schema.optional(
								Schema.Number.pipe(Schema.greaterThanOrEqualTo(42)),
							),
						}),
					),
				});

				expect(getEffectSchemaConstraint(schema)).toEqual<
					Record<keyof Schema.Schema.Type<typeof schema> | string, Constraint>
				>({
					list: {
						required: true,
						multiple: true,
					},
					'list[]': { required: true },
					'list[].value': {
						required: false,
						min: 42,
					},
				});
			});

			test('should derive pattern from array of literal union', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							listOfUnionOfLiterals: Schema.Array(
								Schema.Literal('a', 'b', 'c'),
							),
						}),
					),
				).toEqual({
					listOfUnionOfLiterals: {
						required: true,
						multiple: true,
					},
					'listOfUnionOfLiterals[]': { required: true, pattern: 'a|b|c' },
				});
			});
		});
	});

	describe('tuple', () => {
		test('should handle tuple', () => {
			const schema = Schema.Struct({
				tuple: Schema.Tuple(Schema.String, Schema.Number),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema> | string, Constraint>
			>({
				tuple: {
					required: true,
				},
				'tuple[0]': { required: true },
				'tuple[1]': { required: true },
			});
		});

		test('should handle tuple with element refinements', () => {
			const schema = Schema.Struct({
				tuple: Schema.Tuple(
					Schema.String.pipe(Schema.minLength(3)),
					Schema.Number.pipe(Schema.lessThanOrEqualTo(100)),
				),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema> | string, Constraint>
			>({
				tuple: {
					required: true,
				},
				'tuple[0]': {
					required: true,
					minLength: 3,
				},
				'tuple[1]': {
					required: true,
					max: 100,
				},
			});
		});
	});

	describe('nested schemas', () => {
		test('should handle nested struct', () => {
			const schema = Schema.Struct({
				nested: Schema.Struct({
					key: Schema.String.pipe(Schema.minLength(1)),
				}),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<string, Constraint>
			>({
				nested: {
					required: true,
				},
				'nested.key': {
					required: true,
					minLength: 1,
				},
			});
		});
	});

	describe('extend', () => {
		describe('string', () => {
			const a = Schema.Struct({
				s: Schema.optional(Schema.String),
			});

			const b = Schema.Struct({
				s: Schema.String.pipe(Schema.minLength(1)),
			});

			const c = Schema.Struct({
				s: Schema.String.pipe(Schema.maxLength(10)),
			});

			const d = Schema.Struct({
				n: Schema.String.pipe(Schema.length(42)),
			});

			test('should merge fields using spreads', () => {
				// without override
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							...a.fields,
							...d.fields,
						}),
					),
				).toEqual({
					s: { required: false },
					n: { required: true, maxLength: 42, minLength: 42 },
				});

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							...d.fields,
							...a.fields,
						}),
					),
				).toEqual({
					s: { required: false },
					n: { required: true, maxLength: 42, minLength: 42 },
				});

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							...a.fields,
							...b.fields,
						}),
					),
				).toEqual({
					s: { required: true, minLength: 1 },
				});

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							...b.fields,
							...a.fields,
						}),
					),
				).toEqual({
					s: { required: false },
				});

				expect(
					getEffectSchemaConstraint(
						Schema.Struct({ ...b.fields, ...c.fields }),
					),
				).toEqual({
					s: { required: true, maxLength: 10 },
				});
			});

			test('should extend string schemas and enforce constraints', () => {
				expect(getEffectSchemaConstraint(Schema.extend(a, d))).toEqual({
					s: { required: false },
					n: { required: true, maxLength: 42, minLength: 42 },
				});

				expect(getEffectSchemaConstraint(Schema.extend(d, a))).toEqual({
					s: { required: false },
					n: { required: true, maxLength: 42, minLength: 42 },
				});

				expect(getEffectSchemaConstraint(Schema.extend(b, c))).toEqual({
					s: { required: true, maxLength: 10, minLength: 1 },
				});

				// Effect's Schema.extend disallows changing optionality (both narrowing
				// and widening) between schemas — these differences are treated as
				// unsupported/overlapping and will throw. Assert that behavior here.
				expect(() => getEffectSchemaConstraint(Schema.extend(a, b))).toThrow(
					`Unsupported schema or overlapping types
at path: ["s"]
details: cannot extend undefined with string`,
				);

				expect(() => getEffectSchemaConstraint(Schema.extend(b, a))).toThrow(
					`Unsupported schema or overlapping types
at path: ["s"]
details: cannot extend minLength(1) with undefined`,
				);
			});
		});

		describe('number', () => {
			const a = Schema.Struct({
				n: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
			});
			const b = Schema.Struct({
				n: Schema.Number.pipe(Schema.lessThanOrEqualTo(10)),
			});

			test('should merge numeric field constraints via spreads', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({ ...a.fields, ...b.fields }),
					),
				).toEqual({
					n: { required: true, max: 10 },
				});
			});
			test('should extend numeric schemas', () => {
				expect(getEffectSchemaConstraint(Schema.extend(a, b))).toEqual({
					n: { required: true, max: 10, min: 1 },
				});
			});
		});

		describe('boolean', () => {
			test('should merge boolean field constraints via spreads', () => {
				expect(
					getEffectSchemaConstraint(
						Schema.Struct({
							...Schema.Struct({ flag: Schema.Boolean }).fields,
							...Schema.Struct({ flag: Schema.Literal(true) }).fields,
						}),
					),
				).toEqual({
					flag: { required: true },
				});
			});
		});

		test('should extend with union containing overlapping member', () => {
			const Extended = Schema.extend(
				Schema.Struct({ a: Schema.String }),
				Schema.Union(
					Schema.Struct({ a: Schema.String.pipe(Schema.minLength(1)) }), // note: overlapping member
					Schema.Struct({ d: Schema.optional(Schema.String) }),
				),
			);

			expectTypeOf<Types.Simplify<typeof Extended.Type>>().toEqualTypeOf<
				| { readonly a: string }
				| {
						readonly a: string;
						readonly d?: string | undefined;
				  }
			>();

			expect(getEffectSchemaConstraint(Extended)).toEqual({
				a: {
					required: true,
					minLength: 1,
				},
				d: {
					required: false, // note: optional as it's not present on all union members
				},
			});
		});

		test('should extend with union of non-overlapping structs', () => {
			const StructA = Schema.Struct({
				a: Schema.String.pipe(Schema.minLength(1)),
			});
			const UnionOfStructs = Schema.Union(
				Schema.Struct({ b: Schema.String }),
				Schema.Struct({ c: Schema.String }),
			);

			const Extended = Schema.extend(StructA, UnionOfStructs);

			expectTypeOf<Types.Simplify<typeof Extended.Type>>().toEqualTypeOf<
				| {
						readonly a: string;
						readonly b: string; // note: overlapping member
				  }
				| {
						readonly a: string;
						readonly c: string; // note: overlapping member
				  }
			>();

			expect(getEffectSchemaConstraint(Extended)).toEqual({
				a: {
					// note: required as it's present on all union members'
					required: true,
					minLength: 1,
				},
				b: {
					// note: optional as it's not present on all union members
					required: false,
				},
				c: {
					// note: optional as it's not present on all union members
					required: false,
				},
			});
		});

		test('should throw on invalid overlapping member extension', () => {
			const StructA = Schema.Struct({ a: Schema.String });
			const OverlappingUnion = Schema.Union(
				Schema.Struct({ a: Schema.Number }),
				Schema.Struct({ d: Schema.String }),
			);

			expect(() =>
				getEffectSchemaConstraint(Schema.extend(StructA, OverlappingUnion)),
			).toThrow(/Unsupported schema|cannot extend/);
		});

		test('should let later nested struct field spread override earlier refinements', () => {
			expect(
				getEffectSchemaConstraint(
					Schema.Struct({
						obj: Schema.Struct({
							...Schema.Struct({
								x: Schema.String.pipe(Schema.minLength(1)),
							}).fields,
							...Schema.Struct({
								x: Schema.String.pipe(Schema.maxLength(8)),
							}).fields,
						}),
					}),
				),
			).toEqual({
				obj: { required: true },
				'obj.x': { required: true, maxLength: 8 },
			});

			expect(
				getEffectSchemaConstraint(
					Schema.Struct({
						obj: Schema.Struct({
							x: Schema.extend(
								Schema.String.pipe(Schema.minLength(1)),
								Schema.String.pipe(Schema.maxLength(8)),
							),
						}),
					}),
				),
			).toEqual({
				obj: { required: true },
				'obj.x': {
					maxLength: 8,
					minLength: 1,
					required: true,
				},
			});
		});
	});

	describe('union', () => {
		const baseSchema = Schema.Struct({
			qux: Schema.String.pipe(Schema.minLength(1)),
		});

		const Left = Schema.extend(
			baseSchema,
			Schema.Struct({
				foo: Schema.String.pipe(Schema.minLength(1)),
				baz: Schema.String.pipe(Schema.minLength(1)),
			}),
		);

		const Right = Schema.extend(
			baseSchema,
			Schema.Struct({
				bar: Schema.String.pipe(Schema.minLength(1)),
				baz: Schema.String.pipe(Schema.minLength(1)),
			}),
		);

		test('should handle disjoint union', () => {
			const DisjointedUnion = Schema.Union(Left, Right);

			expectTypeOf<Types.Simplify<typeof DisjointedUnion.Type>>().toEqualTypeOf<
				| {
						readonly qux: string;
						readonly foo: string;
						readonly baz: string;
				  }
				| {
						readonly qux: string;
						readonly bar: string;
						readonly baz: string;
				  }
			>();

			expect(getEffectSchemaConstraint(DisjointedUnion)).toEqual({
				qux: {
					required: true,
					minLength: 1,
				},
				foo: {
					// note: optional because it's not present on both union members
					required: false,
					minLength: 1,
				},
				bar: {
					// note: optional because it's not present on both union members
					required: false,
					minLength: 1,
				},
				baz: {
					required: true,
					minLength: 1,
				},
			});
		});

		/**
		 * NOTE: Additional coverage – differing refinements on the same property name across union members.
		 * Current implementation composes endos sequentially, effectively INTERSECTING refinements.
		 * This yields a potentially over‑restrictive constraint (both minLength & maxLength) whereas
		 * the logical schema union would allow values satisfying EITHER branch.
		 */
		test('should intersect refinements on same property across union members (current behavior)', () => {
			const Right = Schema.extend(
				baseSchema,
				Schema.Struct({
					bar: Schema.String.pipe(Schema.minLength(1)),
					baz: Schema.String.pipe(Schema.maxLength(10)),
				}),
			);
			const UnionRefinement = Schema.Union(Left, Right);

			expect(getEffectSchemaConstraint(UnionRefinement)).toEqual({
				qux: {
					required: true,
					minLength: 1,
				},
				foo: {
					required: false,
					minLength: 1,
				},
				bar: {
					required: false,
					minLength: 1,
				},
				baz: {
					required: true,
					minLength: 1, // merged from Left intersection
					maxLength: 10, // merged from Right intersection
				},
			});

			/**
			 * TODO: If future policy decides that conflicting refinements across union members should not be intersected,
			 * we can replace the above test with one that expects an error (Unsupported schema / overlapping types)
			 * OR expects only a subset of refinements to be emitted.
			 */
		});

		test('should handle discriminated union', () => {
			const DiscriminatedUnion = Schema.Union(
				Left.pipe(Schema.attachPropertySignature('type', 'a')),
				Right.pipe(Schema.attachPropertySignature('type', 'b')),
			);

			expectTypeOf<
				Types.Simplify<typeof DiscriminatedUnion.Type>
			>().toEqualTypeOf<
				| {
						readonly type: 'a';
						readonly qux: string;
						readonly foo: string;
						readonly baz: string;
				  }
				| {
						readonly type: 'b';
						readonly qux: string;
						readonly bar: string;
						readonly baz: string;
				  }
			>();

			expect(getEffectSchemaConstraint(DiscriminatedUnion)).toEqual({
				type: {
					required: true, // note: required as discriminant is always required
				},
				qux: {
					required: true, // note: required as its present in both sides
					minLength: 1,
				},
				foo: {
					// note: optional because it's not present on both union members
					required: false,
					minLength: 1,
				},
				bar: {
					// note: optional because it's not present on both union members
					required: false,
					minLength: 1,
				},
				baz: {
					required: true, // note: required as its present in both sides
					minLength: 1,
				},
			});
		});
	});

	test('should support complex schemas', () => {
		const minTimestamp = '1970-01-01';
		const maxTimestamp = '2030-01-01';

		expect(
			getEffectSchemaConstraint(
				Schema.Struct({
					text: Schema.String.pipe(Schema.minLength(10), Schema.maxLength(100)),
					number: Schema.Number.pipe(
						Schema.greaterThanOrEqualTo(1),
						Schema.lessThanOrEqualTo(10),
						Schema.multipleOf(2, { message: () => 'step' }),
					),
					timestamp: Schema.optionalWith(
						Schema.Date.pipe(
							Schema.betweenDate(
								new Date(minTimestamp),
								new Date(maxTimestamp),
							),
						),
						{
							default: () => new Date(maxTimestamp),
						},
					),
					flag: Schema.optional(Schema.Boolean),
					literalFlag: Schema.Literal(true),
					options: Schema.Array(Schema.Literal('a', 'b', 'c')).pipe(
						Schema.minItems(3),
					),
				}),
			),
		).toEqual({
			text: {
				required: true,
				minLength: 10,
				maxLength: 100,
			},
			number: {
				required: true,
				min: 1,
				max: 10,
				step: 2,
			},
			timestamp: {
				required: true,
				max: maxTimestamp,
				min: minTimestamp,
			},
			flag: {
				required: false,
			},
			literalFlag: {
				required: true,
			},
			options: {
				required: true,
				multiple: true,
			},
			'options[]': {
				required: true,
				pattern: 'a|b|c',
			},
		} satisfies ConstraintRecord);
	});

	describe('suspend', () => {
		test('should reject negative MAX_SUSPEND_EXPANSIONS option', () => {
			const Suspended = Schema.suspend(() =>
				Schema.Struct({ name: Schema.String }),
			);
			expect(() =>
				getEffectSchemaConstraint(Suspended, { MAX_SUSPEND_EXPANSIONS: -1 }),
			).toThrow(/MAX_SUSPEND_EXPANSIONS must be a non-negative finite number/);
		});
		test('should expand root suspended struct', () => {
			const Suspended = Schema.suspend(() =>
				Schema.Struct({
					name: Schema.String,
					age: Schema.optional(Schema.Number),
				}),
			);
			expect(getEffectSchemaConstraint(Suspended)).toEqual({
				name: { required: true },
				age: { required: false },
			});
		});

		test('should expand recursive schema (depth=2 default)', () => {
			const fields = {
				name: Schema.String,
			};
			interface Category extends Schema.Struct.Type<typeof fields> {
				readonly subcategories: ReadonlyArray<Category>;
			}
			const Category = Schema.Struct({
				...fields,
				subcategories: Schema.Array(
					Schema.suspend((): Schema.Schema<Category> => Category),
				),
			});
			expect(
				getEffectSchemaConstraint(Category, { MAX_SUSPEND_EXPANSIONS: 2 }),
			).toEqual({
				name: { required: true },
				subcategories: { required: true, multiple: true },
				'subcategories[]': { required: true },
				'subcategories[].name': { required: true },
				'subcategories[].subcategories': { required: true, multiple: true },
				'subcategories[].subcategories[]': { required: true },
				'subcategories[].subcategories[].name': { required: true },
				'subcategories[].subcategories[].subcategories': {
					required: true,
					multiple: true,
				},
				'subcategories[].subcategories[].subcategories[]': { required: true },
			});
		});

		test('should not expand recursive schema when MAX_SUSPEND_EXPANSIONS=0', () => {
			const fields = { name: Schema.String };
			interface Category extends Schema.Struct.Type<typeof fields> {
				readonly subcategories: ReadonlyArray<Category>;
			}
			const Category: Schema.Schema<Category> = Schema.Struct({
				...fields,
				subcategories: Schema.Array(
					Schema.suspend((): Schema.Schema<Category> => Category),
				),
			});
			expect(
				getEffectSchemaConstraint(Category, { MAX_SUSPEND_EXPANSIONS: 0 }),
			).toEqual({
				name: { required: true },
				subcategories: { required: true, multiple: true },
				'subcategories[]': { required: true },
			});
		});

		test('should expand recursive schema to depth=3', () => {
			const fields = { name: Schema.String };
			interface Category extends Schema.Struct.Type<typeof fields> {
				readonly subcategories: ReadonlyArray<Category>;
			}
			const Category: Schema.Schema<Category> = Schema.Struct({
				...fields,
				subcategories: Schema.Array(
					Schema.suspend((): Schema.Schema<Category> => Category),
				),
			});
			expect(
				getEffectSchemaConstraint(Category, { MAX_SUSPEND_EXPANSIONS: 3 }),
			).toEqual({
				name: { required: true },
				subcategories: { required: true, multiple: true },
				'subcategories[]': { required: true },
				'subcategories[].name': { required: true },
				'subcategories[].subcategories': { required: true, multiple: true },
				'subcategories[].subcategories[]': { required: true },
				'subcategories[].subcategories[].name': { required: true },
				'subcategories[].subcategories[].subcategories': {
					required: true,
					multiple: true,
				},
				'subcategories[].subcategories[].subcategories[]': { required: true },
				'subcategories[].subcategories[].subcategories[].name': {
					required: true,
				},
				'subcategories[].subcategories[].subcategories[].subcategories': {
					required: true,
					multiple: true,
				},
				'subcategories[].subcategories[].subcategories[].subcategories[]': {
					required: true,
				},
			});
		});

		test('should expand recursive schema one level when MAX_SUSPEND_EXPANSIONS=1', () => {
			const fields = { name: Schema.String };
			interface Category extends Schema.Struct.Type<typeof fields> {
				readonly subcategories: ReadonlyArray<Category>;
			}
			const Category: Schema.Schema<Category> = Schema.Struct({
				...fields,
				subcategories: Schema.Array(
					Schema.suspend((): Schema.Schema<Category> => Category),
				),
			});
			expect(
				getEffectSchemaConstraint(Category, { MAX_SUSPEND_EXPANSIONS: 1 }),
			).toEqual({
				name: { required: true },
				subcategories: { required: true, multiple: true },
				'subcategories[]': { required: true },
				// first (and only) expansion adds one nested level
				'subcategories[].name': { required: true },
				'subcategories[].subcategories': { required: true, multiple: true },
				'subcategories[].subcategories[]': { required: true },
			});
		});

		test('should count expansions per independent recursive target', () => {
			// CategoryA recursion
			const fieldsA = { name: Schema.String };
			interface CategoryA extends Schema.Struct.Type<typeof fieldsA> {
				readonly childrenA: ReadonlyArray<CategoryA>;
			}
			const CategoryA: Schema.Schema<CategoryA> = Schema.Struct({
				...fieldsA,
				childrenA: Schema.Array(
					Schema.suspend((): Schema.Schema<CategoryA> => CategoryA),
				),
			});

			// CategoryB recursion (independent target)
			const fieldsB = { title: Schema.String };
			interface CategoryB extends Schema.Struct.Type<typeof fieldsB> {
				readonly childrenB: ReadonlyArray<CategoryB>;
			}
			const CategoryB: Schema.Schema<CategoryB> = Schema.Struct({
				...fieldsB,
				childrenB: Schema.Array(
					Schema.suspend((): Schema.Schema<CategoryB> => CategoryB),
				),
			});

			const Root = Schema.Struct({ a: CategoryA, b: CategoryB });

			expect(
				getEffectSchemaConstraint(Root, { MAX_SUSPEND_EXPANSIONS: 1 }),
			).toEqual({
				a: { required: true },
				'a.name': { required: true },
				'a.childrenA': { required: true, multiple: true },
				'a.childrenA[]': { required: true },
				// first expansion of CategoryA target
				'a.childrenA[].name': { required: true },
				'a.childrenA[].childrenA': { required: true, multiple: true },
				'a.childrenA[].childrenA[]': { required: true },
				b: { required: true },
				'b.title': { required: true },
				'b.childrenB': { required: true, multiple: true },
				'b.childrenB[]': { required: true },
				// first expansion of CategoryB target
				'b.childrenB[].title': { required: true },
				'b.childrenB[].childrenB': { required: true, multiple: true },
				'b.childrenB[].childrenB[]': { required: true },
			});
		});

		test('should handle recursive discriminated union', () => {
			type Condition =
				| { readonly type: 'filter' }
				| {
						readonly type: 'group';
						readonly conditions: ReadonlyArray<Condition>;
				  };

			const ConditionSchema: Schema.Schema<Condition> = Schema.Union(
				Schema.Struct({
					type: Schema.Literal('filter'),
				}),
				Schema.Struct({
					type: Schema.Literal('group'),
					conditions: Schema.Array(Schema.suspend(() => ConditionSchema)),
				}),
			);

			const FilterSchema = Schema.Struct({
				type: Schema.Literal('group'),
				conditions: Schema.Array(ConditionSchema),
			});

			expect(getEffectSchemaConstraint(FilterSchema)).toEqual({
				type: { required: true },
				conditions: { required: true, multiple: true },
				'conditions[]': { required: true },
				'conditions[].type': { required: true },
				'conditions[].conditions': { required: false, multiple: true },
				'conditions[].conditions[]': { required: false },
				'conditions[].conditions[].type': { required: false },
				'conditions[].conditions[].conditions': {
					required: false,
					multiple: true,
				},
				'conditions[].conditions[].conditions[]': { required: false },
				'conditions[].conditions[].conditions[].type': { required: false },
				'conditions[].conditions[].conditions[].conditions': {
					required: false,
					multiple: true,
				},
				'conditions[].conditions[].conditions[].conditions[]': {
					required: false,
				},
			});
		});
	});
});
