import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';
import * as AST from 'effect/SchemaAST';

import { type Constraint, Ctx, Endo } from '../types';
import * as Refinements from './refinements';

const mergeConstraint = (
	...constraints: readonly Option.Option<Constraint>[]
): Constraint =>
	pipe(
		constraints,
		Option.reduceCompact({}, (b, a) => ({ ...b, ...a })),
	);
export const makeRefinementVisitor: Endo.MakeVisitor<
	Ctx.Node,
	AST.Refinement
> = (visit) => (ctx, node) => {
	const fragment = mergeConstraint(
		Refinements.stringRefinement(node),
		Refinements.numberRefinement(node),
		Refinements.bigintRefinement(node),
		Refinements.dateRefinement(node),
	);

	// Compose: first apply the refinement fragment at ctx.path, then continue with "from"
	return Endo.map(
		visit(Ctx.Node({ path: ctx.path, parent: node }), node.from),
		(endo) => Endo.compose(Endo.patch(ctx.path, fragment), endo),
	);
};
