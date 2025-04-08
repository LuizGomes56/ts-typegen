import * as vscode from 'vscode';

async function getReturnedTypes(reference: string, line: string, column: string) {
	const MAX_SETTINGS = 99999999999999;
	const options: any = {
		hidePrivateProperties: true,
		indentation: 4,
		skippedTypeNames: [
			"Array", "ArrayBuffer", "Buffer", "Date", "Element", "Error",
			"Map", "Number", "RegExp", "Set", "String", "Symbol",
			"JsonValue", "JsonObject", "JsonArray", "Decimal",
			"AbortController", "AbortSignal", "string & {}"
		],
		maxDepth: MAX_SETTINGS,
		maxProperties: MAX_SETTINGS,
		maxSubProperties: MAX_SETTINGS,
		maxUnionMembers: MAX_SETTINGS,
		unwrapArrays: true,
		unwrapFunctions: true,
		unwrapPromises: true
	};
	const request: any = {
		meta: 'prettify-type-info-request',
		options
	};
	const location = {
		file: reference,
		line: Number(line) - 1,
		offset: Number(column) - 1
	};
	try {
		// Call TypeScript server directly without activating editor UI
		const response: any = await vscode.commands.executeCommand(
			'typescript.tsserverRequest',
			'completionInfo',
			{
				...location,
				triggerCharacter: request
			}
		);
		const prettifyResponse: any = response?.body?.__prettifyResponse;
		if (!prettifyResponse || !prettifyResponse.typeTree) {
			return 'No type information found.';
		}
		const { typeTree } = prettifyResponse;
		return typeTree;
	}
	catch (e) {
		console.error(`Error in getReturnedTypes for ${reference} at ${line}:${column} -> ${e instanceof Error ? e.message : String(e)}`);
	}
}

async function readTypegenFiles(project: string) {
	let positions: { line: number; column: number; file: string } | undefined = undefined;

	const workspace = vscode.workspace.workspaceFolders;

	if (workspace) {
		const projectPath = workspace[0].uri.fsPath + "/" + project + "/consts/typegen.ts";
		const file = await vscode.workspace.fs.readFile(vscode.Uri.file(projectPath));
		const fileContent = Buffer.from(file).toString();

		// find the ln, col of the type "ControllerReturnTypes", in a given file and store in the array
		const lines = fileContent.split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes("ControllerReturnTypes")) {
				const line = i + 1;
				const column = lines[i].indexOf("ControllerReturnTypes") + "ControllerReturnTypes".length + 2;
				// positions.line { line, column, file: projectPath });
				positions = { line, column, file: projectPath };
			}
		}
	}
	return positions;
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('ts-typegen.generateOutput', async () => {
		try {
			const projectsToRead = ["svianet-auth", "svianet-needxpress"] as const;
			const mapTypeName = {
				"svianet-auth": "SvianetAuthRoutes",
				"svianet-needxpress": "NeedXpressRoutes"
			} as const;
			for (const project of projectsToRead) {
				await readTypegenFiles(project).then(async (position) => {
					if (position) {
						let type = await getReturnedTypes(position.file, String(position.line), String(position.column));
						// type will be a response from ts-server. Now all we have to do is to read the very first property
						// of every children of this main type. If it has a '/' on it, add \" ... \" in front and end
						// to avoid a compilation error
						// type will never be of type "Array", but it is good to check anyway
						if (type.kind === "object") {
							for (let property of type.properties) {
								if (property.name.includes("/")) {
									property.name = "\"" + property.name + "\"";
								}
							}
						}
						// vscode.window.showInformationMessage("Sucesso");
						// armazenar o resultado em: [workspace]/dbrules/src/routes/output/${project}.out.ts

						// o type possui em vários locais algo como Omit<{...}, "data"> & { data: (...) }
						// usar Regex para resolver esse type, e evitar prolongação da string
						let typedef = type.typeName.replace(/JsonValue/g, "Record<string, any>");
						const newType = `export type ${mapTypeName[project]} = ${typedef}`;
						const workspace = vscode.workspace.workspaceFolders;
						if (workspace) {
							const projectPath = workspace[0].uri.fsPath + "/dbrules/src/routes/output/" + project + ".out.ts";
							await vscode.workspace.fs.writeFile(vscode.Uri.file(projectPath), Buffer.from(newType));
						}
					}
				})
			}
		} catch (e) {
			console.log(e);
			vscode.window.showErrorMessage("Open typegen.ts for both projects first ");
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
