import {
	formatPaths,
	type Intent,
	parse,
	type Submission,
} from '@conform-to/dom';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { pipe } from 'effect/Function';
import * as ParseResult from 'effect/ParseResult';
import * as Record from 'effect/Record';
import * as Schema from 'effect/Schema';

export function parseWithEffectSchema<A, I>(
	payload: FormData | URLSearchParams,
	options: {
		/**
		 * Effect Schema instance or an intent-aware factory.
		 * The factory receives the submission intent allowing conditional schema logic.
		 */
		schema:
			| Schema.Schema<A, I>
			| ((intent: Intent | null) => Schema.Schema<A, I>);

		/** Run synchronously (default). */
		async?: false;
	},
): Submission<A, string[]>;
export function parseWithEffectSchema<A, I>(
	payload: FormData | URLSearchParams,
	options: {
		/**
		 * Effect Schema instance or an intent-aware factory.
		 * The factory receives the submission intent allowing conditional schema logic.
		 */
		schema:
			| Schema.Schema<A, I>
			| ((intent: Intent | null) => Schema.Schema<A, I>);

		/** Force asynchronous return signature. */
		async: true;
	},
): Promise<Submission<A, string[]>>;

/**
 * Parse form data with an Effect Schema and return a Submission describing success or failure.
 *
 * Current limitations:
 * - Only one error message retained per field path (multi-issue aggregation planned).
 * - Async path executes Effect-based decoding (supports async refinements / transforms). Sync still fails fast
 *   if schema performs async work.
 */
export function parseWithEffectSchema<A, I>(
	payload: FormData | URLSearchParams,
	options: {
		schema:
			| Schema.Schema<A, I>
			| ((intent: Intent | null) => Schema.Schema<A, I>);
		async?: boolean;
	},
): Submission<A, string[]> | Promise<Submission<A, string[]>> {
	const optionsWithDefaults = {
		async: options.async ?? false,
		...options,
	};

	return optionsWithDefaults.async === true
		? parse(payload, {
				resolve: (data, intent) => {
					const baseSchema: Schema.Schema<A, I> = Schema.isSchema(
						options.schema,
					)
						? (options.schema as Schema.Schema<A, I>)
						: (
								options.schema as (intent: Intent | null) => Schema.Schema<A, I>
							)(intent);

					return pipe(
						data,
						ParseResult.decodeUnknown(baseSchema, { errors: 'all' }),
						Effect.catchAll((parseIssue) =>
							Effect.flip(ParseResult.ArrayFormatter.formatIssue(parseIssue)),
						),
						Effect.mapError(
							Record.fromIterableWith((issue) => [
								formatPaths(issue.path as Array<string | number>),
								[issue.message],
							]),
						),
						Effect.match({
							onFailure: (error) => ({ value: undefined, error }) as const,
							onSuccess: (value) => ({ value, error: undefined }) as const,
						}),
						Effect.runPromise,
					);
				},
			})
		: parse(payload, {
				resolve: (data, intent) => {
					const baseSchema: Schema.Schema<A, I> = Schema.isSchema(
						options.schema,
					)
						? (options.schema as Schema.Schema<A, I>)
						: (
								options.schema as (intent: Intent | null) => Schema.Schema<A, I>
							)(intent);

					return pipe(
						data,
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
							onRight: (value) => ({ value, error: undefined }) as const,
						}),
					);
				},
			});
}
