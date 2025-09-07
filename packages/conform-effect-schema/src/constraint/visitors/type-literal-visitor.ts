import * as ReadonlyArray from 'effect/Array';
import type * as AST from 'effect/SchemaAST';

import { Ctx, Endo } from '../types';

export const makeTypeLiteralVisitor: Endo.MakeVisitor<
	Ctx.Any,
	AST.TypeLiteral
> = (visit) => (ctx, node) => {
	const propertySignatures = node.propertySignatures;

	if (propertySignatures.length === 0) {
		return Endo.of(Endo.id);
	}

	return ReadonlyArray.reduce(
		propertySignatures,
		Endo.of(Endo.id),
		(prog, propertySignature) =>
			Endo.flatMap(prog, (accEndo) => {
				const path = Ctx.$match(ctx, {
					Root: () => propertySignature.name.toString(),
					Node: (nodeCtx) =>
						`${nodeCtx.path}.${propertySignature.name.toString()}`,
				});

				return Endo.map(
					visit(Ctx.Node({ path, parent: node }), propertySignature.type),
					(memberEndo) =>
						Endo.compose(
							accEndo,
							Endo.patch(path, { required: !propertySignature.isOptional }),
							memberEndo,
						),
				);
			}),
	);
};
