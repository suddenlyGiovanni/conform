import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node';
import { pipe } from 'effect';
import * as ParseResult from 'effect/ParseResult';
import * as Record from 'effect/Record';
import { z } from 'zod';
import * as Schema from 'effect/Schema';
import * as Either from 'effect/Either';
import { Form, useActionData } from '@remix-run/react';

import { Playground } from '~/components';
import { formatPaths } from '@conform-to/dom';

/**
 * A simple delay function that returns a promise that resolves after the specified time.
 *
 * if the signal is aborted, the timeout is cleared and the promise is resolved immediately.
 * @param ms
 * @param signal
 */
async function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}

		const timeoutId = setTimeout(resolve, ms);

		const abortHandler = () => {
			cleanup();
			resolve();
		};

		const cleanup = () => {
			clearTimeout(timeoutId);
			signal?.removeEventListener('abort', abortHandler);
		};

		signal?.addEventListener('abort', abortHandler);
	});
}

// lets mock this function by introducing an asybc delay and returning a success message
async function sendMessage(data: Schema.Schema.Type<typeof schema>) {
	await delay(2000);
	const payload = {
		sent: true,
		data,
	};

	// eslint-disable-next-line no-console
	console.dir(payload);
	return payload;
}

const _schema = z.object({
	// The preprocess step is required for zod to perform the required check properly
	// as the value of an empty input is usually an empty string
	email: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z.string({ required_error: 'Email is required' }).email('Email is invalid'),
	),
	message: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z
			.string({ required_error: 'Message is required' })
			.min(10, 'Message is too short')
			.max(100, 'Message is too long'),
	),
});

const schema = Schema.Struct({
	email: Schema.String.annotations({ message: () => 'Email is invalid' }),
	message: Schema.String.pipe(
		Schema.minLength(10, { message: () => 'Message us too short' }),
		Schema.maxLength(100, { message: () => 'Message is too long' }),
	),
});

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	return {
		noClientValidate: url.searchParams.get('noClientValidate') === 'yes',
	};
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();

	// Construct an object using `Object.fromEntries`
	const payload = Object.fromEntries(formData);
	const decodeForm = Schema.decodeUnknownEither(schema);

	// Return the error to the client if the data is not valid
	return pipe(
		payload,
		decodeForm,
		Either.match({
			onLeft: (parseError) => {
				const error = parseError.pipe(
					ParseResult.ArrayFormatter.formatErrorSync,
					Record.fromIterableWith((issue) => [
						formatPaths(issue.path as Array<string | number>),
						[issue.message],
					]),
				);

				return {
					payload,
					formErrors: error.formErrors,
					fieldErrors: error.fieldErrors,
				};
			},
			onRight: async (value) => {
				// We will skip the implementation as it is not important to the tutorial
				const message = await sendMessage(value);

				// Return a form error if the message is not sent
				if (!message.sent) {
					return {
						payload,
						formErrors: ['Failed to send the message. Please try again later.'],
						fieldErrors: {},
					};
				}
			},
		}),
	);
}

export default function Example() {
	const result = useActionData<typeof action>();

	return (
		<Form
			method="post"
			aria-describedby={result?.formErrors ? 'contact-error' : undefined}
		>
			<div id="contact-error">{result?.formErrors}</div>

			<Playground title="Mutliple Errors" result={result}>
				<div>
					<label htmlFor="contact-email">Email</label>
					<input
						id="contact-email"
						type="email"
						name="email"
						defaultValue={result?.payload.email}
						required
						aria-invalid={result?.fieldErrors.email ? true : undefined}
						aria-describedby={
							result?.fieldErrors.email ? 'contact-email-error' : undefined
						}
					/>
					<div id="contact-email-error">{result?.fieldErrors.email}</div>
				</div>

				<div>
					<label htmlFor="contact-message">Message</label>
					<textarea
						id="contact-message"
						name="message"
						defaultValue={result?.payload.message}
						required
						minLength={10}
						maxLength={100}
						aria-invalid={result?.fieldErrors.message ? true : undefined}
						aria-describedby={
							result?.fieldErrors.message ? 'contact-email-message' : undefined
						}
					/>
					<div id="contact-email-message">{result?.fieldErrors.message}</div>
				</div>
			</Playground>
		</Form>
	);
}
