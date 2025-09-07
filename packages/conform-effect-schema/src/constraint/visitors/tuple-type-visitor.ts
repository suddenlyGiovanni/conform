import * as ReadonlyArray from 'effect/Array';
import * as Match from 'effect/Match';
import * as AST from 'effect/SchemaAST';

import { Ctx, Endo } from '../types';

export const makeTupleTypeVisitor: Endo.MakeVisitor<Ctx.Node, AST.TupleType> =
	(visit) => (ctx, node) =>
		Match.value(node).pipe(
			Match.withReturnType<Endo.Prog>(),

			// Only rest -> array-like
			Match.whenAnd(
				({ elements }) => elements.length === 0,
				({ rest }) => rest.length > 0,
				(tupleType) => {
					const base = Endo.of(Endo.patch(ctx.path, { multiple: true }));

					return ReadonlyArray.reduce(tupleType.rest, base, (prog, type) =>
						Endo.flatMap(prog, (accEndo) =>
							Endo.map(
								visit(
									Ctx.Node({ path: `${ctx.path}[]`, parent: tupleType }),
									type.type,
								),
								(memberEndo) =>
									Endo.compose(
										accEndo,
										Endo.patch(`${ctx.path}[]`, { required: true }),
										memberEndo,
									),
							),
						),
					);
				},
			),

			// Fixed elements (with optional rest)
			Match.whenAnd(
				({ elements }) => elements.length > 0,
				({ rest }) => rest.length >= 0,
				(tupleType) => {
					const base = Endo.of(Endo.id);

					return ReadonlyArray.reduce(
						tupleType.elements,
						base,
						(prog, optionalType, idx) =>
							Endo.flatMap(prog, (accEndo) =>
								Endo.map(
									visit(
										Ctx.Node({
											path: `${ctx.path}[${idx}]`,
											parent: tupleType,
										}),
										optionalType.type,
									),
									(memberEndo) =>
										Endo.compose(
											accEndo,
											Endo.patch(`${ctx.path}[${idx}]`, {
												required: !optionalType.isOptional,
											}),
											memberEndo,
										),
								),
							),
					);
				},
			),

			// Default case
			Match.orElse(() => Endo.of(Endo.id)),
		);
