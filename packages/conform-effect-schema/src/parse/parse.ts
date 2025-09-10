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

type SchemaFactory<A, I> = (intent: Intent | null) => Schema.Schema<A, I>;

/** Schema instance or intent-aware factory variant. */
type SchemaOrFactory<A, I> = Schema.Schema<A, I> | SchemaFactory<A, I>;

/** Shared option surface (will grow: formatError, transformIssue, etc.). */
interface BaseOptions<A, I> {
	/** Schema or factory returning a schema (receives submission intent). */
	schema: SchemaOrFactory<A, I>;
}

/** Synchronous parse options (default). */
interface SyncOptions<A, I> extends BaseOptions<A, I> {
	/** If present and false/undefined, forces sync return type. */
	readonly async?: false;
}

/** Asynchronous parse options. */
interface AsyncOptions<A, I> extends BaseOptions<A, I> {
	/** Literal true discriminates async branch returning a Promise. */
	readonly async: true;
}

// Public overloads (signature contract is kept identical, only expressed via named option types)
export function parseWithEffectSchema<A, I>(
	payload: FormData | URLSearchParams,
	options: SyncOptions<A, I>,
): Submission<A, string[]>;
export function parseWithEffectSchema<A, I>(
	payload: FormData | URLSearchParams,
	options: AsyncOptions<A, I>,
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
	options: SyncOptions<A, I> | AsyncOptions<A, I>,
): Submission<A, string[]> | Promise<Submission<A, string[]>> {
	const { async: isAsync = false, schema } = options;

	return isAsync === true
		? parse(payload, {
				resolve: (data, intent) => {
					const baseSchema: Schema.Schema<A, I> = Schema.isSchema(schema)
						? (schema as Schema.Schema<A, I>)
						: (schema as SchemaFactory<A, I>)(intent);

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
					const baseSchema: Schema.Schema<A, I> = Schema.isSchema(schema)
						? (schema as Schema.Schema<A, I>)
						: (schema as SchemaFactory<A, I>)(intent);

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
