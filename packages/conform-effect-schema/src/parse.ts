import { type Intent, type Submission, parse } from '@conform-to/dom';
import { pipe } from 'effect/Function';
import * as Schema from 'effect/Schema';
import * as Either from 'effect/Either';

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
					onLeft: (_parseError) => ({
						value: undefined,
						error: {},
					}),
					onRight: (value) => ({
						value,
						error: undefined,
					}),
				}),
			);
		},
	});
}
