import type { Constraint } from '@conform-to/dom';
import { describe, expect, expectTypeOf, test } from 'vitest';
import * as Schema from 'effect/Schema';

import { getEffectSchemaConstraint } from '../src/constraint/index';

describe('constraint', () => {
	test('Non-object schemas will throw an error', () => {
		// @ts-expect-error We want to test that non-object schemas throw an error
		expect(() => getEffectSchemaConstraint(Schema.String)).toThrow();
		expect(() =>
			// @ts-expect-error We want to test that non-object schemas throw an error
			getEffectSchemaConstraint(Schema.Array(Schema.String)),
		).toThrow();
	});

	describe('String', () => {
		test('optional', () => {
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

		test('literal', () => {
			const literal = 'literal';
			const schema = Schema.Struct({ literalString: Schema.Literal(literal) });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalString: { required: true } });
		});

		test('with no refinement', () => {
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

		describe('with refinements', () => {
			test('MinLengthSchemaId: a string at least <number> character(s) long', () => {
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

			test('MaxLengthSchemaId: a string at most <number> character(s) long', () => {
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
			])(
				'LengthSchemaId: a string at most <number> character(s) long',
				({ inputLength, expected }) => {
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
				},
			);

			test('NonEmptyString: a non empty string', () => {
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

			test('PatternSchemaId: a string matching the <pattern>', () => {
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

			test('StartsWithSchemaId: a string starting with `{string}<postfix>`', () => {
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

			test('EndsWithSchemaId: a string ending with `<prefix>{string}`', () => {
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

			test('IncludesSchemaId: a string including `<prefix>{string}<postfix>`', () => {
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

			test('TrimmedSchemaId: a string with no leading or trailing whitespace', () => {
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

			test('LowercasedSchemaId: a lowercase string', () => {
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

			test('UppercasedSchemaId: an uppercase string', () => {
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

			test('CapitalizedSchemaId: a capitalized string', () => {
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

			test('UncapitalizedSchemaId: a uncapitalized string', () => {
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

		describe('with Transformation', () => {
			test('split: Splits a string by a specified delimiter into an array of substrings.', () => {
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

			test('Trim: Removes whitespace from the beginning and end of a string.', () => {
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

			test('Lowercase: Converts a string to lowercase.', () => {
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

			test('Uppercase: Converts a string to uppercase.', () => {
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

			test('Capitalize: Converts the first character of a string to uppercase.', () => {
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

			test('Uncapitalize: Converts the first character of a string to lowercase.', () => {
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

	describe('Number', () => {
		test('with no refinement', () => {
			const schema = Schema.Struct({ number: Schema.Number });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ number: { required: true } });
		});

		test('optional', () => {
			const schema = Schema.Struct({
				optionalNumber: Schema.optional(Schema.Number),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ optionalNumber: { required: false } });
		});

		test('literal', () => {
			const literal = 42;
			const schema = Schema.Struct({ literalNumber: Schema.Literal(literal) });

			expectTypeOf<typeof schema.Type>().toEqualTypeOf<{
				readonly literalNumber: 42;
			}>();

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalNumber: { required: true } });
		});

		test('GreaterThanSchemaId: a number greater than <exclusiveMinimum>', () => {
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

		test('GreaterThanOrEqualToSchemaId: a number greater than or equal to <inclusiveMinimum>', () => {
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

		test('LessThanSchemaId: a number less than <exclusiveMaximum>', () => {
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

		test('LessThanOrEqualToSchemaId: a number less than or equal to <inclusiveMaximum>', () => {
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

		test('BetweenSchemaId: a number between <minimum> and <maximum>', () => {
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

		test('MultipleOfSchemaId: a number divisible by <positiveDivisor>', () => {
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

		describe('with Transformation', () => {
			test('NumberFromString', () => {
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

			test('clamp', () => {
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

			test('parseNumber', () => {
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

	describe('BigInt ', () => {
		test('with no refinement', () => {
			const schema = Schema.Struct({ bigInt: Schema.BigIntFromSelf });

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ bigInt: { required: true } });
		});

		test('with optional', () => {
			const schema = Schema.Struct({
				optionalBigInt: Schema.optional(Schema.BigIntFromSelf),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ optionalBigInt: { required: false } });
		});

		test('literal', () => {
			const literal = 42n;
			const schema = Schema.Struct({ literalBigInt: Schema.Literal(literal) });

			expectTypeOf<typeof schema.Type>().toEqualTypeOf<{
				readonly literalBigInt: 42n;
			}>();

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({ literalBigInt: { required: true } });
		});

		test('GreaterThanBigIntSchemaId: a bigint greater than <exclusiveMinimum>', () => {
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

		test('GreaterThanOrEqualToBigIntSchemaId: a bigint greater than or equal to <inclusiveMinimum>', () => {
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

		test('LessThanBigIntSchemaId: a bigint less than <exclusiveMaximum>', () => {
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

		test('LessThanOrEqualToBigIntSchemaId: a bigint less than or equal to <inclusiveMaximum>', () => {
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

		test('BetweenBigIntSchemaId: a bigint between <minimum>n and <maximum>n', () => {
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

		describe('with Transformation', () => {
			test('BigInt', () => {
				// Converts a string to a BigInt using the BigInt constructor.
				expect(
					getEffectSchemaConstraint(Schema.Struct({ bigInt: Schema.BigInt })),
				).toEqual({ bigInt: { required: true } });
			});

			test('BigIntFromNumber', () => {
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

			test('clampBigInt', () => {
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

	describe('Date', () => {
		test('with optional', () => {
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

		describe('with refinements', () => {
			test('GreaterThanDateSchemaId: a date after <minExclusiveDate>', () => {
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

			test('GreaterThanOrEqualToDateSchemaId: a date after or equal to <minInclusiveDate>', () => {
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

			test('LessThanDateSchemaId: a date before <maxExclusiveDate>', () => {
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

			test('LessThanDateSchemaId: a date before or equal to <maxInclusiveDate>', () => {
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

			test('BetweenDateSchemaId: a date between <minInclusiveDate> and <maxInclusiveDate>', () => {
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

		describe('with transformation', () => {
			test('Date: Converts a string into a valid Date', () => {
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

	describe('Boolean', () => {
		test('with optional', () => {
			const schema = Schema.Struct({
				optionalBoolean: Schema.optional(Schema.Boolean),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				optionalBoolean: { required: false },
			});
		});

		test('required', () => {
			const schema = Schema.Struct({
				requiredBoolean: Schema.Boolean,
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				requiredBoolean: { required: true },
			});
		});

		test('with literal', () => {
			const schema = Schema.Struct({
				literalBoolean: Schema.Literal(true),
			});

			expect(getEffectSchemaConstraint(schema)).toEqual<
				Record<keyof Schema.Schema.Type<typeof schema>, Constraint>
			>({
				literalBoolean: { required: true },
			});
		});

		describe('with Transformation', () => {
			test('not', () => {
				expect(
					getEffectSchemaConstraint(Schema.Struct({ not: Schema.Not })),
				).toEqual({ not: { required: true } });
			});
		});
	});

	describe('Array', () => {
		test('with no refinement', () => {
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

		describe('with nested data', () => {
			test('Struct', () => {
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

			test('Union', () => {
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

			test.todo('Union of Literals', () => {
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

	describe('Tuple', () => {
		test('with no refinement', () => {
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

		test('with refinements', () => {
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

	describe('Nested Schemas', () => {
		test('Struct', () => {
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

	const schema = Schema.Struct({
		text: Schema.String.pipe(Schema.minLength(10), Schema.maxLength(100)),
		number: Schema.Number.pipe(
			Schema.greaterThanOrEqualTo(1),
			Schema.lessThanOrEqualTo(10),
			Schema.multipleOf(2, { message: () => 'step' }),
		),
		timestamp: Schema.optionalWith(
			Schema.Date.pipe(Schema.betweenDate(new Date(1), new Date())),
			{
				default: () => new Date(),
			},
		),
		flag: Schema.optional(Schema.Boolean),
		literalFlag: Schema.Literal(true),
		options: Schema.Array(Schema.Literal('a', 'b', 'c')).pipe(
			Schema.minItems(3),
		),
	});

	const constraint = {
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
			max: '2025-08-16',
			min: '1970-01-01',
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
	} satisfies Record<string, Constraint>;

	test.todo('case 1', () => {
		expect(getEffectSchemaConstraint(schema)).toEqual(constraint);
	});

	test.todo('Intersection is supported', () => {
		// Intersection is supported
		expect(
			getEffectSchemaConstraint(
				Schema.Struct({
					...schema.fields,
					text: Schema.optional(Schema.String),
					something: Schema.String,
				}),
			),
		).toEqual({
			...constraint,
			text: { required: false },
			something: { required: true },
		});
	});

	test.todo('Union is supported', () => {
		// Union is supported
		const baseSchema = Schema.Struct({
			qux: Schema.String.pipe(Schema.minLength(1)),
		});
		expect(
			getEffectSchemaConstraint(
				Schema.Union(
					Schema.Struct({
						...baseSchema.fields,
						type: Schema.Literal('a'),
						foo: Schema.String.pipe(Schema.minLength(1)),
						baz: Schema.String.pipe(Schema.minLength(1)),
					}),
					Schema.Struct({
						...baseSchema.fields,
						type: Schema.Literal('b'),
						bar: Schema.String.pipe(Schema.minLength(1)),
						baz: Schema.String.pipe(Schema.minLength(1)),
					}),
				),
			),
		).toEqual({
			type: { required: true },
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
				minLength: 1,
			},
			qux: {
				required: true,
				minLength: 1,
			},
		});

		// Discriminated union is also supported
		expect(
			getEffectSchemaConstraint(
				Schema.Union(
					Schema.Struct({
						...baseSchema.fields,
						foo: Schema.String.pipe(Schema.minLength(1)),
						baz: Schema.String.pipe(Schema.minLength(1)),
					}).pipe(Schema.attachPropertySignature('type', 'a')),
					Schema.Struct({
						...baseSchema.fields,
						bar: Schema.String.pipe(Schema.minLength(1)),
						baz: Schema.String.pipe(Schema.minLength(1)),
					}).pipe(Schema.attachPropertySignature('type', 'b')),
				),
			),
		).toEqual({
			type: { required: true },
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
				minLength: 1,
			},
			qux: {
				required: true,
				minLength: 1,
			},
		});
	});

	test.todo('Recursive schema should be supported too', () => {
		// Recursive schema should be supported too

		interface Category {
			readonly name: string;
			readonly subcategories: ReadonlyArray<Category>;
		}

		const categorySchema = Schema.Struct({
			name: Schema.String,
			subcategories: Schema.Array(
				Schema.suspend((): Schema.Schema<Category> => categorySchema),
			),
		});

		expect(getEffectSchemaConstraint(categorySchema)).toEqual({
			name: {
				required: true,
			},
			subcategories: {
				required: true,
				multiple: true,
			},

			'subcategories[].name': {
				required: true,
			},
			'subcategories[].subcategories': {
				required: true,
				multiple: true,
			},

			'subcategories[].subcategories[].name': {
				required: true,
			},
			'subcategories[].subcategories[].subcategories': {
				required: true,
				multiple: true,
			},
		});
	});

	test.todo('getEffectSchemaConstraint', () => {
		type Condition =
			| {
					readonly type: 'filter';
			  }
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
			type: {
				required: true,
			},
			conditions: {
				required: true,
				multiple: true,
			},

			'conditions[].type': {
				required: true,
			},
			'conditions[].conditions': {
				required: true,
				multiple: true,
			},

			'conditions[].conditions[].type': {
				required: true,
			},
			'conditions[].conditions[].conditions': {
				required: true,
				multiple: true,
			},
		});
	});
});
