import {
	type Intent,
	type Submission,
	parse,
	formatPaths,
} from '@conform-to/dom';
import * as ParseResult from 'effect/ParseResult';
import { pipe } from 'effect/Function';
import * as Schema from 'effect/Schema';
import * as Either from 'effect/Either';
import * as Record from 'effect/Record';

export function parseWithEffectSchema<A>(
	payload: FormData | URLSearchParams,
	options: {
		schema: Schema.Schema<A> | ((intent: Intent | null) => Schema.Schema<A>);
	},
): Submission<A, string[]> {
	return parse(payload, {
		resolve: (payload, intent) => {
			const baseSchema: Schema.Schema<A> = Schema.isSchema(options.schema)
				? (options.schema as Schema.Schema<A>)
				: (options.schema as (intent: Intent | null) => Schema.Schema<A>)(
						intent,
					);

			return pipe(
				payload,
				Schema.decodeUnknownEither(baseSchema, { errors: 'all' }),
				Either.match({
					onLeft: (parseError) => {
						return {
							value: undefined,
							error: pipe(
								parseError,
								ParseResult.ArrayFormatter.formatErrorSync,
								Record.fromIterableWith((issue) => [
									formatPaths(issue.path as Array<string | number>),
									[issue.message],
								]),
							),
						};
					},
					onRight: (value) => ({
						value,
						error: undefined,
					}),
				}),
			);
		},
	});
}
