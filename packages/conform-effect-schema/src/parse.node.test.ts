import { describe, test, expect } from 'vitest';
import * as Schema from 'effect/Schema';

import { parseWithEffectSchema } from './parse';

function createFormData(
	entries: Array<[string, FormDataEntryValue]>,
): FormData {
	const formData = new FormData();

	for (const [name, value] of entries) {
		formData.append(name, value);
	}

	return formData;
}

describe('parseWithEffectSchema', () => {
	test('should return a valid Submission with value for valid data', () => {
		// Define a simple schema
		const schema = Schema.Struct({
			email: Schema.String,
			message: Schema.String,
		});

		// Create valid form data
		const formData = createFormData([
			['email', 'test@example.com'],
			['message', 'This is a test message'],
		]);

		// Parse with Effect Schema
		const submission = parseWithEffectSchema(formData, { schema });

		// Verify Submission contract
		expect(submission).toHaveProperty('status', 'success');
		expect(submission).toHaveProperty('value');
		expect(submission).toHaveProperty('payload');
		expect(submission).toHaveProperty('reply');
		expect(typeof submission.reply).toBe('function');

		// type assertion for checking that one branch of the Submission union
		if (submission.status !== 'success') {
			throw new Error('Expected submission to be successful');
		}

		// Verify the value
		expect(submission.value).toEqual({
			email: 'test@example.com',
			message: 'This is a test message',
		});
	});

	test('should return a valid Submission with errors for invalid data', () => {
		// Define a schema with validation rules
		const schema = Schema.Struct({
			email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+\.[^@]+$/)),
			message: Schema.String.pipe(Schema.minLength(10)),
		});

		// Create invalid form data
		const formData = createFormData([
			['email', 'invalid-email'],
			['message', 'short'],
		]);

		// Parse with Effect Schema
		const result = parseWithEffectSchema(formData, { schema });

		// Verify Submission contract for errors
		expect(result).toHaveProperty('status', 'error');

		if (result.status !== 'error') {
			throw new Error('Expected submission to have errors');
		}

		expect(result).toHaveProperty('error');
		expect(result).toHaveProperty('payload');
		expect(result).toHaveProperty('reply');
		expect(typeof result.reply).toBe('function');

		// Verify error structure
		expect(result.error).toBeDefined();
		expect(result.error).toHaveProperty('email');
		expect(result.error).toHaveProperty('message');
		expect(result.error?.message).toEqual([
			'Expected a string at least 10 character(s) long, actual "short"',
		]);
		expect(result.error?.email).toEqual([
			'Expected a string matching the pattern ^[^@]+@[^@]+\\.[^@]+$, actual "invalid-email"',
		]);
	});
});
