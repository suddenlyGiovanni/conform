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

interface Options<A> {
	/**
	 * Effect Schema instance or an intent-aware factory.
	 * The factory receives the submission intent allowing conditional schema logic.
	 */
	schema: Schema.Schema<A> | ((intent: Intent | null) => Schema.Schema<A>);

	/** Run synchronously (default). */
	async?: undefined | boolean;
}

interface WithAsync {
	/** Force asynchronous return signature. */
	async: true;
}

export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options: Options<A>,
): Submission<A, string[]>;
export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options: Options<A> & WithAsync,
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
	options: Options<A> | (Options<A> & WithAsync),
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

	return options.async
		? parse(payload, {
				resolve: (data, intent) =>
					Promise.resolve(
						resolveSubmission(data as FormData | URLSearchParams, intent), // TODO: add true Schema Async validation
					),
			})
		: parse(payload, {
				resolve: (data, intent) =>
					resolveSubmission(data as FormData | URLSearchParams, intent),
			});
}
