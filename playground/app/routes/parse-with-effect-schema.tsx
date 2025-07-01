import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node';
import { z } from 'zod';
import { Form, useActionData } from '@remix-run/react';

import { Playground } from '~/components';

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
async function sendMessage(data: z.infer<typeof schema>) {
	await delay(2000);
	const payload = {
		sent: true,
		data,
	};

	// eslint-disable-next-line no-console
	console.dir(payload);
	return payload;
}

const schema = z.object({
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
	// Then parse it with zod
	const result = schema.safeParse(payload);

	// Return the error to the client if the data is not valid
	if (!result.success) {
		const error = result.error.flatten();

		return {
			payload,
			formErrors: error.formErrors,
			fieldErrors: error.fieldErrors,
		};
	}

	// We will skip the implementation as it is not important to the tutorial
	const message = await sendMessage(result.data);

	// Return a form error if the message is not sent
	if (!message.sent) {
		return {
			payload,
			formErrors: ['Failed to send the message. Please try again later.'],
			fieldErrors: {},
		};
	}

	// return redirect('/messages')
}

export default function Example() {
	const result = useActionData<typeof action>();

	return (
		<Form method="post">
			<div>{result?.formErrors}</div>

			<Playground title="Mutliple Errors" result={result}>
				<div>
					<label>Email</label>
					<input
						type="email"
						name="email"
						defaultValue={result?.payload.email}
					/>
					<div>{result?.fieldErrors.email}</div>
				</div>
				<div>
					<label>Message</label>
					<textarea name="message" defaultValue={result?.payload.message} />
					<div>{result?.fieldErrors.message}</div>
				</div>
			</Playground>
		</Form>
	);
}
