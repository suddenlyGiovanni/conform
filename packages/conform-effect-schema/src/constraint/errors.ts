import type * as AST from 'effect/SchemaAST';
import * as Data from 'effect/Data';

export class UnsupportedNodeError extends Data.TaggedError('UnsupportedNode')<{
	readonly path: string;
	readonly nodeTag: AST.AST['_tag'];
}> {
	readonly message = `Unsupported AST node '${this.nodeTag}' at path '${this.path}'`;
}

export class MissingNodeImplementationError extends Data.TaggedError(
	'MissingNodeImplementation',
)<{
	readonly path: string;
	readonly nodeTag: AST.AST['_tag'];
}> {
	readonly message = `TODO: add support for this AST Node type: '${this.nodeTag}'`;
}

export class IllegalRootNode extends Data.TaggedError('IllegalRootNode')<{
	readonly expectedNode: AST.AST['_tag'];
	readonly actualNode: AST.AST['_tag'];
}> {
	readonly message = `Root schema must be an AST node '${this.expectedNode}', instead got: '${this.actualNode}'`;
}

export type Errors =
	| UnsupportedNodeError
	| MissingNodeImplementationError
	| IllegalRootNode;
