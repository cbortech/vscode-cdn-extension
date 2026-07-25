/**
 * VSCode extension entry point: wires the pure CDN core logic
 * (src/core/*) to the editor — diagnostics on edit, and document
 * formatting.
 */
import * as vscode from 'vscode';
import { validateCdn, type TopLevelMode } from './core/diagnostics';
import { EXTENSION_NAMES, type ExtensionSettings } from './core/extensions';
import { formatCdn, type FormatSettings } from './core/format';

const LANGUAGE_ID = 'cdn';
const VALIDATE_DEBOUNCE_MS = 300;

function readExtensionSettings(
  config: vscode.WorkspaceConfiguration
): ExtensionSettings {
  const settings: ExtensionSettings = {};
  for (const name of EXTENSION_NAMES) {
    settings[name] = config.get<boolean>(`extensions.${name}`, true);
  }
  return settings;
}

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  context.subscriptions.push(collection);

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  context.subscriptions.push({
    dispose: () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  });

  const validateNow = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE_ID) return;
    const config = vscode.workspace.getConfiguration('cdn', document);
    if (!config.get<boolean>('validate.enable', true)) {
      collection.delete(document.uri);
      return;
    }
    const mode = config.get<TopLevelMode>('validate.topLevel', 'item');
    const text = document.getText();
    const diagnostics = validateCdn(
      text,
      mode,
      readExtensionSettings(config)
    ).map((d) => {
      const range = new vscode.Range(
        document.positionAt(d.start),
        document.positionAt(d.end)
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        d.message,
        d.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : d.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = 'cdn';
      return diagnostic;
    });
    collection.set(document.uri, diagnostics);
  };

  const validateSoon = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE_ID) return;
    const key = document.uri.toString();
    const existing = pending.get(key);
    if (existing !== undefined) clearTimeout(existing);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        validateNow(document);
      }, VALIDATE_DEBOUNCE_MS)
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validateNow),
    vscode.workspace.onDidChangeTextDocument((e) => validateSoon(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
      const key = document.uri.toString();
      const timer = pending.get(key);
      if (timer !== undefined) {
        clearTimeout(timer);
        pending.delete(key);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('cdn')) return;
      for (const document of vscode.workspace.textDocuments) {
        validateNow(document);
      }
    })
  );

  for (const document of vscode.workspace.textDocuments) {
    validateNow(document);
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions
      ): vscode.TextEdit[] {
        const config = vscode.workspace.getConfiguration('cdn', document);
        const settings: FormatSettings = {
          topLevel: config.get<TopLevelMode>('validate.topLevel', 'item'),
          indent: options.insertSpaces ? ' '.repeat(options.tabSize) : '\t',
          commas: config.get('format.commas', 'comma'),
          comments: config.get('format.comments', 'preserve'),
          encodingIndicators: config.get('format.encodingIndicators', 'auto'),
          appStrings: config.get<boolean>('format.appStrings', true),
          bstrEncoding: config.get('format.bstrEncoding', 'hex'),
          preserveByteString: config.get<boolean>(
            'format.preserveByteString',
            true
          ),
          preserveRawString: config.get<boolean>(
            'format.preserveRawString',
            true
          ),
          preserveTextString: config.get<boolean>(
            'format.preserveTextString',
            true
          ),
          preserveNumberFormat: config.get<boolean>(
            'format.preserveNumberFormat',
            true
          ),
          preserveAppSequence: config.get<boolean>(
            'format.preserveAppSequence',
            true
          ),
          preserveBlankLines: config.get<boolean>(
            'format.preserveBlankLines',
            true
          ),
          preserveConcatenation: config.get<boolean>(
            'format.preserveConcatenation',
            true
          ),
          splitCdn: config.get<boolean>('format.splitCdn', true),
          splitNewline: config.get<boolean>('format.splitNewline', true),
          inlineLeafContainers: config.get<boolean>(
            'format.inlineLeafContainers',
            true
          ),
          extensions: readExtensionSettings(config),
        };
        const text = document.getText();
        const formatted = formatCdn(text, settings);
        if (formatted === null || formatted === text) return [];
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length)
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
      },
    })
  );
}

export function deactivate(): void {}
