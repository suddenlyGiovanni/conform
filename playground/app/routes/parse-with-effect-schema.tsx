import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	redirect,
} from '@remix-run/node';
import { z } from 'zod';
import * as Schema from 'effect/Schema';
import { Form, useActionData } from '@remix-run/react';
import {
	parseWithEffectSchema,
	getEffectSchemaConstraint,
} from '@conform-to/effect-schema';
import { useForm } from '@conform-to/react';

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

	// Replace `Object.fromEntries()` with the parseWithEffectSchema helper
	const submission = parseWithEffectSchema(formData, { schema });

	// Report the submission to client if it is not successful
	if (submission.status !== 'success') {
		return submission.reply();
	}

	const message = await sendMessage(submission.value);

	// Return a form error if the message is not sent
	if (!message.sent) {
		return submission.reply({
			formErrors: ['Failed to send the message. Please try again later.'],
		});
	}

	return redirect('/messages');
}

export default function Example() {
	const lastResult = useActionData<typeof action>();

	// The useForm hook will return all the metadata we need to render the form
	// and put focus on the first invalid field when the form is submitted
	const [form, fields] = useForm({
		// This not only syncs the error from the server
		// But is also used as the default value of the form
		// in case the document is reloaded for progressive enhancement
		lastResult,
		// To derive all validation attributes
		constraint: getEffectSchemaConstraint(schema),
	});

	return (
		<Form
			method="post"
			id={form.id}
			aria-describedby={form.errors ? form.errorId : undefined}
		>
			<div id={form.errorId}>{form.errors}</div>

			<Playground title="Mutliple Errors" result={lastResult}>
				<div>
					<label htmlFor={fields.email.id}>Email</label>
					<input
						id={fields.email.id}
						type="email"
						name={fields.email.name}
						defaultValue={fields.email.initialValue}
						required={fields.email.required}
						aria-invalid={fields.email.errors ? true : undefined}
						aria-describedby={
							fields.email.errors ? fields.email.errorId : undefined
						}
					/>
					<div id={fields.email.errorId}>{fields.email.errors}</div>
				</div>

				<div>
					<label htmlFor={fields.message.id}>Message</label>
					<textarea
						id={fields.message.id}
						name={fields.message.name}
						defaultValue={fields.message.initialValue}
						required={fields.message.required}
						minLength={fields.message.minLength}
						maxLength={fields.message.maxLength}
						aria-invalid={fields.message.errors ? true : undefined}
						aria-describedby={
							fields.message.errors ? fields.message.errorId : undefined
						}
					/>
					<div id={fields.message.errorId}>{fields.message.errors}</div>
				</div>
			</Playground>
		</Form>
	);
}
