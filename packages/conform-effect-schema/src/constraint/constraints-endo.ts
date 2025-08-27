/* eslint-disable import/export,@typescript-eslint/no-namespace */
/**
 * Endomorphism over Constraints.
 * @module
 */

import type { Constraint } from '@conform-to/dom';
import * as Either from 'effect/Either';
import { identity } from 'effect/Function';

import { Constraints } from './constraints';
import type { Errors } from './errors';

const id: Endo.Endo = identity;

const compose =
	(...fns: ReadonlyArray<Endo.Endo>): Endo.Endo =>
	(c) =>
		fns.reduce((s, f) => f(s), c);

const patch =
	(
		path: Constraints.Path,
		constraintFragment: Partial<Constraint>,
	): Endo.Endo =>
	(constraints) =>
		Constraints.modify(constraints, path, constraintFragment);

const of = (endo: Endo.Endo): Endo.Prog => Either.right(endo);
const fail = (error: Errors): Endo.Prog => Either.left(error);

const map = (p: Endo.Prog, f: (e: Endo.Endo) => Endo.Endo): Endo.Prog =>
	Either.map(p, f);

const flatMap = (p: Endo.Prog, f: (e: Endo.Endo) => Endo.Prog): Endo.Prog =>
	Either.flatMap(p, f);

const run =
	(seed: Constraints.Constraints) =>
	(p: Endo.Prog): Either.Either<Constraints.Constraints, Errors> =>
		Either.map(p, (endo) => endo(seed));

export declare namespace Endo {
	type Endo = (constraints: Constraints.Constraints) => Constraints.Constraints;
	type Prog = Either.Either<Endo, Errors>;
}

export const Endo = {
	id,
	compose,
	patch,
	of,
	fail,
	map,
	flatMap,
	run,
} as const;
