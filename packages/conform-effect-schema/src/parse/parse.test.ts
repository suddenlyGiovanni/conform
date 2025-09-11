import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { describe, expect, test } from 'vitest';

import { parseWithEffectSchema } from './parse';

export function createFormData(
	entries: Array<[string, FormDataEntryValue]>,
): FormData {
	const formData = new FormData();

	for (const [name, value] of entries) {
		formData.append(name, value);
	}

	return formData;
}

describe('parseWithEffectSchema', () => {
	describe('multi-issue aggregation', () => {
		test.fails(
			'collects multiple refinement issues for a single field preserving order',
			() => {
				const schema = Schema.Struct({
					username: Schema.String.pipe(
						Schema.minLength(5),
						Schema.pattern(/^[a-z]+$/),
					),
				});
				const formData = createFormData([['username', 'a$']]);
				const result = parseWithEffectSchema(formData, { schema });
				if (result.status !== 'error') {
					throw new Error('Expected error status');
				}
				expect(result.error?.username).toEqual([
					'Expected a string at least 5 character(s) long, actual "a$"',
					'Expected a string matching the pattern ^[a-z]+$, actual "a$"', // NOTE: Schema does not suppress multiple issues per field refinement; short circuited to first issue!
				]);
			},
		);

		test.fails(
			'does not overwrite earlier issues when later ones appear',
			() => {
				const schema = Schema.Struct({
					code: Schema.String.pipe(
						Schema.minLength(4),
						Schema.pattern(/^[A-Z]+$/),
					),
				});
				const formData = createFormData([['code', 'a1']]);
				const result = parseWithEffectSchema(formData, { schema });
				if (result.status !== 'error') {
					throw new Error('Expected error status');
				}
				expect(result.error?.code).toEqual([
					'Expected a string at least 4 character(s) long, actual "a1"',
					'Expected a string matching the pattern ^[A-Z]+$, actual "a1"', // NOTE: Schema does not suppress multiple issues per field refinement; short circuited to first issue!
				]);
			},
		);
	});

	describe('custom error formatting (formatError)', () => {
		test.skip('maps issues array to custom joined string', () => {
			// const schema = Schema.Struct({
			// 	field: Schema.String.pipe(
			// 		Schema.minLength(5),
			// 		Schema.pattern(/^[0-9]+$/),
			// 	),
			// });
			// const formData = createFormData([["field", "ab"]]);
			// Future: pass formatError returning a single string
			// const result = parseWithEffectSchema(formData, { schema, formatError: (issues) => issues.map(i => i.message).join(' | ') });
			// expect(typeof result.error?.field).toBe('string');
			// Future expectation:
		});
		test.skip('maps issues to structured object shape', () => {
			// const schema = Schema.Struct({
			// 	value: Schema.String.pipe(
			// 		Schema.minLength(3),
			// 		Schema.pattern(/^[a-z]+$/),
			// 	),
			// });
			// const fd = createFormData([["value", "1"]]);
			// Future: const result = parseWithEffectSchema(fd, { schema, formatError: (issues) => ({ messages: issues.map(i => i.message) }) });
			// expect(Array.isArray((result.error?.value as any).messages)).toBe(true);
			// Future expectation:
		});
		test.skip('type infers custom FormError shape when formatError provided', () => {
			// Future: ensure TypeScript infers custom type
		});
	});

	describe('async support', () => {
		const asyncSchema = Schema.transformOrFail(
			Schema.Struct({ id: Schema.String }), // PersonInput
			Schema.Struct({
				id: Schema.Number,
				name: Schema.String,
				age: Schema.Number,
			}), // PersonOutput
			{
				strict: true,
				decode: (input) =>
					Effect.succeed({
						id: Number(input.id),
						name: 'name',
						age: 18,
					}).pipe(Effect.delay('5 millis')),
				encode: (person) =>
					Effect.succeed({ id: String(person.id) }).pipe(
						Effect.delay('5 millis'),
					),
			},
		);

		test('resolves successfully with async schema transform when async: true', async () => {
			await expect(
				parseWithEffectSchema(createFormData([['id', '1']]), {
					schema: asyncSchema,
					async: true,
				}),
			).resolves.toEqual(
				expect.objectContaining({
					payload: { id: '1' },
					status: 'success',
					value: { id: 1, name: 'name', age: 18 },
				}),
			);
		});

		test('produces sync parse error when async schema used without async: true', () => {
			const submission = parseWithEffectSchema(createFormData([['id', '1']]), {
				schema: asyncSchema,
			});
			expect(submission.status).toBe('error');

			if (submission.status !== 'error') {
				throw new Error(
					'Expected error status when an async schema used without "{async: true}"',
				);
			}

			const messages = Object.values(submission.error ?? {})
				.flat()
				.filter(Boolean) as string[];
			expect(
				messages.some((m) => /cannot .*resolved synchronously/i.test(m)),
			).toBe(true);
		});
	});

	describe('input vs output types', () => {
		test.skip('distinguishes transformed output type from encoded input', () => {
			// Future: transformation schema verifying decoded vs encoded types
		});
	});

	describe('auto coercion toggle', () => {
		test.skip('coerces numeric string to number when enabled (default)', () => {
			// Future: expect number in value
		});
		test.skip('does not coerce when disableAutoCoercion = true', () => {
			// Future: pass disableAutoCoercion and expect error or string retention
		});
		test.skip('coerces boolean string values', () => {
			// Future: 'true'/'false' -> boolean
		});
	});

	describe('sentinel semantics', () => {
		test.skip('marks field error as null when VALIDATION_SKIPPED emitted', () => {
			// Future: refinement producing skipped sentinel -> error[field] === null
		});
		test.skip('returns overall error null when VALIDATION_UNDEFINED emitted', () => {
			// Future: sentinel triggers overall null error
		});
	});

	describe('localization / transformIssue', () => {
		test.skip('applies transformIssue to each issue before formatting', () => {
			// Future: transformIssue rewrites message
		});
		test.skip('supports translating messages via formatError', () => {
			// Future: translation via formatError
		});
	});

	describe('symbol path guard', () => {
		test.skip('throws descriptive error when a symbol path segment occurs', () => {
			// Future: symbol path should throw
		});
	});

	describe('intent-based schema factory', () => {
		test.skip('selects different schema branches based on intent', () => {
			// Future: schema factory based on intent
		});
	});

	describe('nested & array path formatting', () => {
		test('formats nested object paths with dots', () => {
			const schema = Schema.Struct({
				user: Schema.Struct({
					address: Schema.Struct({
						street: Schema.String.pipe(Schema.minLength(5)),
					}),
				}),
			});
			const formData = createFormData([['user.address.street', 'a']]);
			const result = parseWithEffectSchema(formData, { schema });
			if (result.status !== 'error') {
				throw new Error('Expected error status');
			}
			expect(result.error).toHaveProperty('user.address.street');
			// Expect at least one validation message about min length
			expect(result.error?.['user.address.street'])?.toEqual([
				'Expected a string at least 5 character(s) long, actual "a"',
			]);
		});
		test('formats array indices with bracket notation', () => {
			const schema = Schema.Struct({
				items: Schema.Array(
					Schema.Struct({
						name: Schema.String.pipe(Schema.minLength(3)),
					}),
				),
			});
			// Provide first item with short name
			const formData = createFormData([['items[0].name', 'x']]);
			const result = parseWithEffectSchema(formData, { schema });
			if (result.status !== 'error') {
				throw new Error('Expected error status');
			}
			expect(result.error).toHaveProperty('items[0].name');
			expect(result.error?.['items[0].name'])?.toEqual([
				'Expected a string at least 3 character(s) long, actual "x"',
			]);
		});
	});

	describe('null vs undefined field error semantics', () => {
		test.skip('field error null distinct from absent key', () => {
			// Future: skipped field error semantics
		});
	});

	describe('regression safety', () => {
		test('success: returns value for valid data (baseline)', () => {
			const schema = Schema.Struct({
				email: Schema.String,
				message: Schema.String,
			});
			const formData = createFormData([
				['email', 'test@example.com'],
				['message', 'This is a test message'],
			]);
			const submission = parseWithEffectSchema(formData, { schema });
			expect(submission.status).toBe('success');
			if (submission.status !== 'success') {
				throw new Error('Expected submission to be successful');
			}
			expect(submission.value).toEqual({
				email: 'test@example.com',
				message: 'This is a test message',
			});
		});

		test('parity: error shape matches zod (no custom formatting)', () => {
			const schema = Schema.Struct({
				text: Schema.String.pipe(Schema.minLength(5)),
			});
			const formData = createFormData([['text', 'abc']]);

			expect(parseWithEffectSchema(formData, { schema })).toEqual({
				status: 'error',
				payload: { text: 'abc' },
				error: {
					text: [
						'Expected a string at least 5 character(s) long, actual "abc"',
					],
				},
				reply: expect.any(Function),
			});
		});

		test('parity: error shape matches zod (no custom formatting)', () => {
			const schema = Schema.Struct({
				text: Schema.String.pipe(Schema.minLength(5)),
			});
			const formData = createFormData([['text', 'abc']]);

			expect(parseWithEffectSchema(formData, { schema })).toEqual({
				status: 'error',
				payload: { text: 'abc' },
				error: {
					text: [
						'Expected a string at least 5 character(s) long, actual "abc"',
					],
				},
				reply: expect.any(Function),
			});
		});

		test('error: returns field errors for invalid data (baseline)', () => {
			const schema = Schema.Struct({
				email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+\.[^@]+$/)),
				message: Schema.String.pipe(Schema.minLength(10)),
			});
			const formData = createFormData([
				['email', 'invalid-email'],
				['message', 'short'],
			]);
			const result = parseWithEffectSchema(formData, { schema });
			expect(result.status).toBe('error');
			if (result.status !== 'error') {
				throw new Error('Expected submission to have errors');
			}
			expect(result.error?.message).toEqual([
				'Expected a string at least 10 character(s) long, actual "short"',
			]);
			expect(result.error?.email).toEqual([
				'Expected a string matching the pattern ^[^@]+@[^@]+\\.[^@]+$, actual "invalid-email"',
			]);
		});

		test.todo(
			'retains backwards compatible behavior without new options',
			() => {
				// Arrange: previous simple schema usage (already covered above) -- may expand once new options added
			},
		);
	});
});
