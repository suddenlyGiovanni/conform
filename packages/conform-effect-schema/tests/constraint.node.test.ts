import type { Constraint } from '@conform-to/dom';
import { getEffectSchemaConstraint } from '../src/constraint';
import * as Schema from 'effect/Schema';

import { describe, expect, test } from 'vitest';

describe('constraint', () => {
	describe('Simple use cases', () => {
		describe('String', () => {
			test('with optional', () => {
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
			},
			timestamp: {
				required: false,
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

		test('case 1', () => {
			expect(getEffectSchemaConstraint(schema)).toEqual(constraint);
		});

		test('Non-object schemas will throw an error', () => {
			// @ts-expect-error We want to test that non-object schemas throw an error
			expect(() => getEffectSchemaConstraint(Schema.String)).toThrow();
			expect(() =>
				// @ts-expect-error We want to test that non-object schemas throw an error
				getEffectSchemaConstraint(Schema.Array(Schema.String)),
			).toThrow();
		});

		test('Intersection is supported', () => {
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

		test('Union is supported', () => {
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

		test('Recursive schema should be supported too', () => {
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

		test('getEffectSchemaConstraint', () => {
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
});
