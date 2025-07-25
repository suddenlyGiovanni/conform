import { type Page, type Locator, test, expect } from '@playwright/test';
import { getPlayground } from './helpers';

function getFieldset(form: Locator) {
	return {
		name: form.locator('[name="name"]'),
		message: form.locator('[name="message"]'),
		number: form.locator('[name="number"]'),
		hidden: form.locator('[name="hidden"]'),
		validateForm: form.locator('button:text("Validate Form")'),
		validateMessage: form.locator('button:text("Validate Message")'),
		updateMessage: form.locator('button:text("Update message")'),
		updateNumber: form.locator('button:text("Update number")'),
		updateForm: form.locator('button:text("Update form")'),
		clearMessage: form.locator('button:text("Clear message")'),
		resetMessage: form.locator('button:text("Reset message")'),
		resetForm: form.locator('button:text("Reset form")'),
		multipleUpdates: form.locator('button:text("Multiple updates")'),
	};
}

async function runValidationScenario(page: Page, hasClientValidation: boolean) {
	const playground = getPlayground(page);
	const fieldset = getFieldset(playground.container);

	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(playground.error).toHaveText(['', '', '']);

	await fieldset.validateMessage.click();
	await expect(playground.error).toHaveText(['', 'Message is required', '']);

	await fieldset.updateMessage.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('');
	await expect(fieldset.message).toHaveValue('Hello World');
	await expect(playground.error).toHaveText(['', '', '']);

	await fieldset.clearMessage.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('');
	await expect(fieldset.message).toHaveValue('');
	await expect(playground.error).toHaveText(['', 'Message is required', '']);

	await fieldset.resetMessage.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('');
	await expect(fieldset.message).toHaveValue('');
	await expect(playground.error).toHaveText(['', '', '']);

	await fieldset.updateNumber.click();
	await expect(fieldset.number).toHaveValue('123');

	await fieldset.validateForm.click();
	await expect(playground.error).toHaveText([
		'Name is required',
		'Message is required',
		'',
	]);

	await fieldset.resetForm.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('');
	await expect(fieldset.number).toHaveValue('');
	await expect(fieldset.message).toHaveValue('');
	await expect(playground.error).toHaveText(['', '', '']);

	await fieldset.updateForm.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('Conform');
	await expect(fieldset.number).toHaveValue('13579');
	await expect(fieldset.message).toHaveValue(
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
	);

	// To ensure that keys are updated correctly
	await fieldset.name.fill('Test');
	await fieldset.number.fill('2468');
	await fieldset.message.fill('Hello World');
	await fieldset.updateForm.click();
	await expect(fieldset.hidden).toHaveValue('hidden-value');
	await expect(fieldset.name).toHaveValue('Conform');
	await expect(fieldset.number).toHaveValue('13579');
	await expect(fieldset.message).toHaveValue(
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
	);

	if (hasClientValidation) {
		await fieldset.multipleUpdates.click();
		await expect(fieldset.hidden).toHaveValue('hidden-value');
		await expect(fieldset.name).toHaveValue('Conform');
		await expect(fieldset.number).toHaveValue('987');
		await expect(fieldset.message).toHaveValue('Updated message');
	}
}

test.describe('With JS', () => {
	test('Client Validation', async ({ page }) => {
		await page.goto('/form-control');
		await runValidationScenario(page, true);
	});

	test('Server Validation', async ({ page }) => {
		await page.goto('/form-control?noClientValidate=yes');
		await runValidationScenario(page, false);
	});
});

test.describe('No JS', () => {
	test.use({ javaScriptEnabled: false });

	test('Validation', async ({ page }) => {
		await page.goto('/form-control');
		await runValidationScenario(page, false);
	});
});
