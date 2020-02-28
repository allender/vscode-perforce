import * as vscode from "vscode";
import * as p4 from "./api/PerforceApi";
import { Utils } from "./Utils";

export class PerforceTimelineProvider implements vscode.TimelineProvider {
    //onDidChange?: vscode.Event<vscode.TimelineChangeEvent> | undefined;
    id: string = "mjcrouch.perforce";
    label: string = "perforce";

    async provideTimeline(
        uri: vscode.Uri,
        _cursor: vscode.TimelineCursor,
        _token: vscode.CancellationToken
    ): Promise<vscode.Timeline> {
        try {
            const fromFile =
                uri.scheme === "perforce"
                    ? Utils.getDepotPathFromDepotUri(uri)
                    : { fsPath: uri.fsPath };
            const items = await p4.getFileHistory(uri, { file: fromFile });
            return {
                items: items.map<vscode.TimelineItem>(item => {
                    return {
                        timestamp: item.date?.getTime() ?? 0,
                        label: "#" + item.revision,
                        description: item.description
                    };
                })
            };
        } catch {
            return { items: [] };
        }
    }
}
