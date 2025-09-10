import {
	formatPaths,
	type Intent,
	parse,
	type Submission,
} from '@conform-to/dom';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as ParseResult from 'effect/ParseResult';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';

/** Options for the synchronous variant of parseWithEffectSchema. */
export interface ParseWithEffectSchemaOptionsSync<A> {
	/**
	 * Effect Schema instance or an intent-aware factory.
	 * The factory receives the submission intent allowing conditional schema logic.
	 */
	schema: Schema.Schema<A> | ((intent: Intent | null) => Schema.Schema<A>);
	/** Run synchronously (default). */
	async?: false | undefined;
}

/** Options for the asynchronous variant of parseWithEffectSchema. */
export interface ParseWithEffectSchemaOptionsAsync<A> {
	/** See ParseWithEffectSchemaOptionsSync.schema. */
	schema: Schema.Schema<A> | ((intent: Intent | null) => Schema.Schema<A>);
	/** Force asynchronous return signature. */
	async: true;
}

// Overloads -----------------------------------------------------------------
export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options: ParseWithEffectSchemaOptionsSync<A>,
): Submission<A, string[]>;
export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options: ParseWithEffectSchemaOptionsAsync<A>,
): Promise<Submission<A, string[]>>;

/**
 * Parse form data with an Effect Schema and return a Submission describing success or failure.
 *
 * Current limitations:
 * - Only one error message retained per field path (multi-issue aggregation planned).
 * - Async path is a Promise wrapper around sync decode (true async refinements forthcoming).
 */
export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options:
		| ParseWithEffectSchemaOptionsSync<A>
		| ParseWithEffectSchemaOptionsAsync<A>,
): Submission<A, string[]> | Promise<Submission<A, string[]>> {
	const resolveSubmission = (
		source: FormData | URLSearchParams,
		intent: Intent | null,
	) => {
		const baseSchema: Schema.Schema<A> = Schema.isSchema(options.schema)
			? (options.schema as Schema.Schema<A>)
			: (options.schema as (intent: Intent | null) => Schema.Schema<A>)(intent);

		return pipe(
			source,
			Schema.decodeUnknownEither(baseSchema, { errors: 'all' }),
			Either.match({
				onLeft: (parseError) =>
					({
						value: undefined,
						error: pipe(
							parseError,
							ParseResult.ArrayFormatter.formatErrorSync,
							Record.fromIterableWith((issue) => [
								formatPaths(issue.path as Array<string | number>),
								[issue.message],
							]),
						),
					}) as const,
				onRight: (value) =>
					({
						value,
						error: undefined,
					}) as const,
			}),
		);
	};

	if (options.async) {
		return parse(payload, {
			resolve: (data, intent) =>
				Promise.resolve(
					resolveSubmission(data as FormData | URLSearchParams, intent),
				),
		});
	}

	return parse(payload, {
		resolve: (data, intent) =>
			resolveSubmission(data as FormData | URLSearchParams, intent),
	});
}
