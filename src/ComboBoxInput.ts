import * as vscode from "vscode";

export interface ComboBoxInputOptions {
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    insertBeforeIndex?: number;
}

function insertItem<T>(items: T[], newItems: T[], insertBeforeIndex?: number): T[] {
    if (insertBeforeIndex === undefined) {
        return [...items, ...newItems];
    }
    return [
        ...items.slice(0, insertBeforeIndex),
        ...newItems,
        ...items.slice(insertBeforeIndex),
    ];
}

export async function showComboBoxInput<T extends vscode.QuickPickItem>(
    items: T[],
    options: ComboBoxInputOptions,
    provideInputItems: (value: string) => T[]
) {
    const quickPick = vscode.window.createQuickPick<T>();

    const subscriptions: vscode.Disposable[] = [quickPick];
    const dispose = () => subscriptions.forEach((sub) => sub.dispose());

    quickPick.matchOnDescription = options.matchOnDescription ?? false;
    quickPick.matchOnDetail = options.matchOnDetail ?? false;
    quickPick.ignoreFocusOut = options.ignoreFocusOut ?? false;
    quickPick.placeholder = options.placeHolder;
    const def = provideInputItems("");
    quickPick.items = insertItem(items, def, options.insertBeforeIndex);

    let providedItems = new Set<T>(def);
    subscriptions.push(
        quickPick.onDidChangeValue((value) => {
            const provided = provideInputItems(value);
            quickPick.items = quickPick.items
                .filter((item) => !providedItems.has(item))
                .concat(provided);
            providedItems = new Set(provided);
            quickPick.activeItems = provided.slice(-1);
        })
    );

    const promise = new Promise<T | undefined>((resolve) => {
        subscriptions.push(
            quickPick.onDidAccept(() => {
                resolve(quickPick.selectedItems[0]);
                quickPick.hide();
                dispose();
            })
        );
        subscriptions.push(
            quickPick.onDidHide(() => {
                resolve(undefined);
                dispose();
            })
        );
    });
    quickPick.show();
    return promise;
}
