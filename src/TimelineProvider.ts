import * as vscode from "vscode";
import { Utils } from "./Utils";

export class PerforceTimelineProvider implements vscode.TimelineProvider {
    //onDidChange?: vscode.Event<vscode.TimelineChangeEvent> | undefined;
    id: string = "mjcrouch.perforce";
    label: string = "perforce";

    async provideTimeline(
        uri: vscode.Uri,
        cursor: vscode.TimelineCursor,
        token: vscode.CancellationToken
    ): Promise<vscode.Timeline> {
        const stdout = await Utils.runCommand(uri, "filelog", {
            file: uri,
            prefixArgs: "-L"
        });
        throw new Error("Method not implemented.");
    }

    private parseFileLog(stdout: string) {
        const parts = stdout.split(/\r?\n\r?\n/g);
        for (let i = 0; i < parts.length; i += 2) {
            const firstLine = parts[i];

            const desc = parts[i + 1] ?? "";
            // remove leading tabs
            desc.split(/\r?\n/)
                .map(dl => dl.slice(1))
                .join("\n");
        }
    }
}
