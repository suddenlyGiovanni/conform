import type { Constraint } from '@conform-to/dom';
import { getEffectSchemaConstraint } from '../src/constraint';
import * as Schema from 'effect/Schema';

import { describe, expect, test } from 'vitest';

describe('constraint', () => {
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

	test('Schemas with no transformations', () => {
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
