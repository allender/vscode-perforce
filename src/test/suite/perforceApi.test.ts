import * as p4 from "../../api/PerforceApi";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { PerforceService } from "../../PerforceService";
import { getWorkspaceUri } from "../helpers/testUtils";

import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinonChai from "sinon-chai";
import { ChangeSpec, ChangeInfo, FixedJob } from "../../api/CommonTypes";
import { Direction, DescribedChangelist } from "../../api/PerforceApi";
import * as PerforceUri from "../../PerforceUri";
import { parseDate } from "../../TsUtils";

chai.use(sinonChai);
chai.use(chaiAsPromised);

function basicExecuteStub(
    _resource: vscode.Uri,
    command: string,
    responseCallback: (err: Error | null, stdout: string, stderr: string) => void,
    args?: string[],
    _input?: string,
    _useTerminal?: boolean
) {
    let out = command;
    if (args && args.length > 0) {
        out += " " + args.join(" ");
    }
    setImmediate(() => responseCallback(null, out, ""));
}

function execWithResult(err: Error | null, stdout: string, stderr: string) {
    return (
        _resource: any,
        _command: string,
        responseCallback: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
        setImmediate(() => responseCallback(err, stdout, stderr));
    };
}

function execWithStdOut(stdout: string) {
    return execWithResult(null, stdout, "");
}

function execWithStdErr(stderr: string) {
    return execWithResult(null, "", stderr);
}

function execWithErr(err: Error) {
    return execWithResult(err, "", "");
}

describe("Perforce API", () => {
    let execute: sinon.SinonStub<Parameters<typeof basicExecuteStub>, void>;
    const ws = getWorkspaceUri();

    beforeEach(() => {
        execute = sinon.stub(PerforceService, "execute").callsFake(basicExecuteStub);
    });
    afterEach(() => {
        if (execute.getCalls().length > 0) {
            expect(execute).to.always.have.been.calledWith(ws);
        }
        sinon.restore();
    });
    describe("Flag mapper", () => {
        it("maps flags");
    });
    describe("Simple commands", () => {
        it("makes a simple command");
    });
    describe("Get change Spec", () => {
        it("Outputs a change spec", async () => {
            execute.callsFake(
                execWithStdOut(
                    "# A Perforce Change Specification.\n" +
                        "#\n" +
                        "#  Change:      The change number. 'new' on a new changelist.\n" +
                        "#  Date:        The date this specification was last modified.\n" +
                        "#  etc\n" +
                        "\n" +
                        "Change:\tnew\n" +
                        "\n" +
                        "Client:\tcli\n" +
                        "\n" +
                        "User:\tuser\n" +
                        "\n" +
                        "Status:\tnew\n" +
                        "\n" +
                        "Description:\n" +
                        "\t<enter description here>\n" +
                        "\n" +
                        "Files:\n" +
                        "//depot/testArea/testFile\t# edit"
                )
            );
            await expect(p4.getChangeSpec(ws, {})).to.eventually.deep.equal({
                description: "<enter description here>",
                files: [{ depotPath: "//depot/testArea/testFile", action: "edit" }],
                change: "new",
                rawFields: [
                    { name: "Change", value: ["new"] },
                    { name: "Client", value: ["cli"] },
                    { name: "User", value: ["user"] },
                    { name: "Status", value: ["new"] },
                    { name: "Description", value: ["<enter description here>"] },
                    { name: "Files", value: ["//depot/testArea/testFile\t# edit"] },
                ],
            });
        });
        it("Outputs a change spec for an existing changelist", async () => {
            execute.callsFake(
                execWithStdOut(
                    [
                        "# A Perforce Change Specification.",
                        "#",
                        "#  Change:      The change number. 'new' on a new changelist.",
                        "#  Date:        The date this specification was last modified.",
                        "#  etc",
                        "",
                        "Change:\t123",
                        "",
                        "Client:\tcli",
                        "",
                        "User:\tuser",
                        "",
                        "Status:\tpending",
                        "",
                        "Jobs: ",
                        "",
                        "Description:",
                        "\tchangelist line 1\n\tchangelist line 2",
                    ].join("\n")
                    // why the jobs? - see issue 74
                )
            );
            await expect(
                p4.getChangeSpec(ws, { existingChangelist: "123" })
            ).to.eventually.deep.equal({
                description: "changelist line 1\nchangelist line 2",
                change: "123",
                files: undefined,
                rawFields: [
                    { name: "Change", value: ["123"] },
                    { name: "Client", value: ["cli"] },
                    { name: "User", value: ["user"] },
                    { name: "Status", value: ["pending"] },
                    { name: "Jobs", value: [""] },
                    {
                        name: "Description",
                        value: ["changelist line 1", "changelist line 2"],
                    },
                ],
            });
        });
    });
    describe("Input change spec", () => {
        it("Inputs a change spec and returns the change number", async () => {
            execute.callsFake(execWithStdOut("Change 99 created."));
            const changeSpec: ChangeSpec = {
                description: "my change spec\nhere it is",
                change: "new",
                files: [{ depotPath: "//depot/testArea/myFile.txt", action: "add" }],
                rawFields: [],
            };
            await expect(
                p4.inputChangeSpec(ws, { spec: changeSpec })
            ).to.eventually.deep.equal({ rawOutput: "Change 99 created.", chnum: "99" });

            expect(execute).to.have.been.calledWithMatch(
                ws,
                "change",
                sinon.match.any,
                ["-i"],
                "Change:\tnew\n\n" +
                    "Description:\tmy change spec\n\there it is\n\n" +
                    "Files:\t//depot/testArea/myFile.txt\t# add"
            );
        });
        it("Updates an existing change spec and returns the change number", async () => {
            execute.callsFake(execWithStdOut("Change 1234 updated."));
            const changeSpec: ChangeSpec = {
                description: "a spec",
                change: "1234",
                files: [{ depotPath: "//depot/testArea/myEdit.txt", action: "edit" }],
                rawFields: [
                    { name: "Description", value: ["no-override"] },
                    { name: "Raw", value: ["value"] },
                ],
            };
            await expect(
                p4.inputChangeSpec(ws, { spec: changeSpec })
            ).to.eventually.deep.equal({
                rawOutput: "Change 1234 updated.",
                chnum: "1234",
            });

            expect(execute).to.have.been.calledWithMatch(
                ws,
                "change",
                sinon.match.any,
                ["-i"],
                "Change:\t1234\n\n" +
                    "Description:\ta spec\n\n" +
                    "Files:\t//depot/testArea/myEdit.txt\t# edit\n\n" +
                    "Raw:\tvalue"
            );
        });
        it("Uses the raw value for a high-level field when not supplied", async () => {
            execute.callsFake(execWithStdOut("Change 1234 updated."));
            const changeSpec: ChangeSpec = {
                description: undefined,
                change: "1234",
                files: [{ depotPath: "//depot/testArea/myEdit.txt", action: "edit" }],
                rawFields: [{ name: "Description", value: ["override"] }],
            };
            await expect(
                p4.inputChangeSpec(ws, { spec: changeSpec })
            ).to.eventually.deep.equal({
                rawOutput: "Change 1234 updated.",
                chnum: "1234",
            });

            expect(execute).to.have.been.calledWithMatch(
                ws,
                "change",
                sinon.match.any,
                ["-i"],
                "Change:\t1234\n\n" +
                    "Files:\t//depot/testArea/myEdit.txt\t# edit\n\n" +
                    "Description:\toverride"
            );
        });
        it("Handles an empty raw field at the end by using line breaks", async () => {
            // issue #74
            execute.callsFake(execWithStdOut("Change 1234 updated."));
            const changeSpec: ChangeSpec = {
                description: "a spec",
                change: "1234",
                files: [{ depotPath: "//depot/testArea/myEdit.txt", action: "edit" }],
                rawFields: [{ name: "Jobs", value: [""] }],
            };
            await expect(
                p4.inputChangeSpec(ws, { spec: changeSpec })
            ).to.eventually.deep.equal({
                rawOutput: "Change 1234 updated.",
                chnum: "1234",
            });

            expect(execute).to.have.been.calledWithMatch(
                ws,
                "change",
                sinon.match.any,
                ["-i"],
                "Change:\t1234\n\n" +
                    "Description:\ta spec\n\n" +
                    "Files:\t//depot/testArea/myEdit.txt\t# edit\n\n" +
                    "Jobs:\t\n\n"
            );
        });
        it("Throws an error on stderr", async () => {
            execute.callsFake(execWithStdErr("Your spec is terrible."));
            const changeSpec: ChangeSpec = {
                description: undefined,
                change: "1234",
                files: [{ depotPath: "//depot/testArea/myEdit.txt", action: "edit" }],
                rawFields: [{ name: "Description", value: ["override"] }],
            };

            await expect(
                p4.inputChangeSpec(ws, { spec: changeSpec })
            ).to.eventually.be.rejectedWith("Your spec is terrible.");
        });
    });
    describe("fstat", () => {
        it("Uses the correct arguments", async () => {
            execute.callsFake(execWithStdOut(""));
            await p4.getFstatInfo(ws, {
                depotPaths: ["a", "b", "c"],
                chnum: "99",
                limitToShelved: true,
                outputPendingRecord: true,
            });

            expect(execute).to.have.been.calledWith(ws, "fstat", sinon.match.any, [
                "-e",
                "99",
                "-Or",
                "-Rs",
                "a",
                "b",
                "c",
            ]);
        });
        it("Returns fstat info in the same order as the input, ignoring stderr", async () => {
            execute.callsFake(
                execWithResult(
                    null,
                    "... depotFile //depot/testArea/ilikenewfiles\n" +
                        "... clientFile /home/perforce/depot/testArea/newPlace/ilikenewfiles\n" +
                        "... isMapped \n" +
                        "... headAction add\n" +
                        "... headType text\n" +
                        "... headTime 1581622617\n" +
                        "... headRev 1\n" +
                        "... headChange 38\n" +
                        "... headModTime 1581622605\n" +
                        "... haveRev 1\n" +
                        "\n" +
                        "... depotFile //depot/testArea/ireallylikenewfiles\n" +
                        "... clientFile /home/perforce/depot/testArea/newPlace/ireallylikenewfiles\n" +
                        "... isMapped \n" +
                        "... headAction add\n" +
                        "... headType text\n" +
                        "... headTime 1581622799\n" +
                        "... headRev 1\n" +
                        "... headChange 38\n" +
                        "... headModTime 1581622774\n" +
                        "... haveRev 1\n" +
                        "\n" +
                        "... depotFile //depot/testArea/stuff\n" +
                        "... clientFile /home/perforce/depot/testArea/stuff\n" +
                        "... isMapped \n" +
                        "... headAction add\n" +
                        "... headType text\n" +
                        "... headTime 1581023705\n" +
                        "... headRev 1\n" +
                        "... headChange 38\n" +
                        "... headModTime 1580943006\n" +
                        "... haveRev 1\n",
                    "//depot/testArea/filewithnooutput - no such file"
                )
            );

            const output = await p4.getFstatInfo(ws, {
                chnum: "38",
                depotPaths: [
                    "//depot/testArea/ireallylikenewfiles",
                    "//depot/testArea/ilikenewfiles",
                    "//depot/testArea/filewithnooutput",
                ],
            });

            expect(output).to.have.length(3);
            expect(output[0]).to.deep.include({
                depotFile: "//depot/testArea/ireallylikenewfiles",
                clientFile: "/home/perforce/depot/testArea/newPlace/ireallylikenewfiles",
                isMapped: "true",
            });
            expect(output[1]).to.deep.include({
                depotFile: "//depot/testArea/ilikenewfiles",
                clientFile: "/home/perforce/depot/testArea/newPlace/ilikenewfiles",
                isMapped: "true",
            });
            expect(output[2]).to.be.undefined;
        });
        it("Uses multiple fstat commands if necessary", async () => {
            const paths = Array.from({ length: 35 }, (x, i) => "//depot/f" + i);

            execute.onFirstCall().callsFake(
                execWithStdOut(
                    paths
                        .slice(0, 32)
                        .map((path) => "... depotFile " + path)
                        .join("\n\n")
                )
            );
            execute.onSecondCall().callsFake(
                execWithStdOut(
                    paths
                        .slice(32)
                        .map((path) => "... depotFile " + path)
                        .join("\n\n")
                )
            );

            const expected = paths.map((path) => {
                return { depotFile: path };
            });

            const firstPortion = paths.slice(0, 32);
            const secondPortion = paths.slice(32);

            await expect(
                p4.getFstatInfo(ws, { depotPaths: paths })
            ).to.eventually.deep.equal(expected);

            expect(execute).to.have.been.calledWith(
                ws,
                "fstat",
                sinon.match.any,
                firstPortion
            );
            expect(execute).to.have.been.calledWith(
                ws,
                "fstat",
                sinon.match.any,
                secondPortion
            );
        });
    });
    describe("get opened files", () => {
        it("Returns the list of opened files", async () => {
            execute.callsFake(
                execWithStdOut(
                    "//depot/testArea/anotherfile#99 - move/delete change 35 (text)\n" +
                        "//depot/testArea/anotherfile-moved#1 - move/add default change (text)"
                )
            );
            await expect(p4.getOpenedFiles(ws, { chnum: "3" })).to.eventually.eql([
                {
                    depotPath: "//depot/testArea/anotherfile",
                    revision: "99",
                    chnum: "35",
                    filetype: "text",
                    message:
                        "//depot/testArea/anotherfile#99 - move/delete change 35 (text)",
                    operation: "move/delete",
                },
                {
                    depotPath: "//depot/testArea/anotherfile-moved",
                    revision: "1",
                    chnum: "default",
                    filetype: "text",
                    message:
                        "//depot/testArea/anotherfile-moved#1 - move/add default change (text)",
                    operation: "move/add",
                },
            ]);
            expect(execute).to.have.been.calledWith(ws, "opened", sinon.match.any, [
                "-c",
                "3",
            ]);
        });
        it("Does not throw on stderr", async () => {
            execute.callsFake(execWithStdErr("no open files"));
            await expect(p4.getOpenedFiles(ws, {})).to.eventually.eql([]);
        });
    });
    describe("get open file details", () => {
        it("Returns the files that are open and not open", async () => {
            execute.callsFake(
                execWithResult(
                    null,
                    "//depot/testArea/anotherfile#99 - move/delete change 35 (text)",
                    [
                        "TestArea/newFile.txt - file(s) not opened on this client.",
                        "Path 'C:/Users/myfile' is not under client's root 'c:\\perforce'.",
                    ].join("\n")
                )
            );

            await expect(
                p4.getOpenedFileDetails(ws, {
                    files: [
                        "//depot/testArea/anotherFile",
                        "TestArea/newFile.txt",
                        "C:/Users/myfile",
                    ],
                })
            ).to.eventually.eql({
                open: [
                    {
                        depotPath: "//depot/testArea/anotherfile",
                        revision: "99",
                        chnum: "35",
                        filetype: "text",
                        message:
                            "//depot/testArea/anotherfile#99 - move/delete change 35 (text)",
                        operation: "move/delete",
                    },
                ],
                unopen: [
                    {
                        filePath: "TestArea/newFile.txt",
                        message:
                            "TestArea/newFile.txt - file(s) not opened on this client.",
                        reason: p4.UnopenedFileReason.NOT_OPENED,
                    },
                    {
                        filePath: "C:/Users/myfile",
                        message:
                            "Path 'C:/Users/myfile' is not under client's root 'c:\\perforce'.",
                        reason: p4.UnopenedFileReason.NOT_IN_ROOT,
                    },
                ],
            });

            expect(execute).to.have.been.calledWith(ws, "opened", sinon.match.any, [
                "//depot/testArea/anotherFile",
                "TestArea/newFile.txt",
                "C:/Users/myfile",
            ]);
        });
    });
    describe("submit", () => {
        it("Returns the new changelist number and the raw output", async () => {
            const output =
                "Submitting change 76." +
                "Locking 1 files ..." +
                "edit //depot/testArea/a file#4" +
                "Change 76 submitted.";
            execute.callsFake(execWithStdOut(output));

            await expect(
                p4.submitChangelist(ws, { chnum: "1", description: "my description" })
            ).to.eventually.eql({
                rawOutput: output,
                chnum: "76",
            });

            expect(execute).to.have.been.calledWith(ws, "submit", sinon.match.any, [
                "-c",
                "1",
                "-d",
                "my description",
            ]);
        });
        it("Can submit a single specified file", async () => {
            await p4.submitChangelist(ws, {
                description: "my description",
                file: { fsPath: "C:\\MyFile.txt" },
            });

            expect(execute).to.have.been.calledWith(ws, "submit", sinon.match.any, [
                "-d",
                "my description",
                "C:\\MyFile.txt",
            ]);
        });
    });
    describe("revert", () => {
        it("uses the correct arguments", async () => {
            await expect(
                p4.revert(ws, {
                    unchanged: true,
                    chnum: "1",
                    paths: [{ fsPath: "c:\\my f#ile.txt" }],
                })
            ).to.eventually.equal("revert -a -c 1 c:\\my f%23ile.txt");
        });
    });
    describe("shelve", () => {
        it("uses the correct arguments", async () => {
            await expect(
                p4.shelve(ws, {
                    delete: true,
                    force: true,
                    chnum: "99",
                    paths: ["myfile.txt"],
                })
            ).to.eventually.equal("shelve -f -d -c 99 myfile.txt");
        });
    });
    describe("unshelve", () => {
        it("Returns the list of unshelved files and resolve warnings", async () => {
            const output = [
                "//depot/Project_X/main/README.md#8 - unshelved, opened for edit",
                "... //depot/Project_X/main/README.md - also opened by Matt@default",
                "//depot/Project_X/main/src/alphabet.txt#1 - unshelved, opened for edit",
                "... //depot/Project_X/main/src/alphabet.txt - must resolve //depot/Project_X/main/src/alphabet.txt@=14 before submitting",
            ].join("\n");
            execute.callsFake(execWithStdOut(output));
            await expect(
                p4.unshelve(ws, {
                    shelvedChnum: "99",
                    toChnum: "1",
                    force: true,
                    paths: ["myfile.txt"],
                })
            ).to.eventually.deep.equal({
                files: [
                    {
                        depotPath: "//depot/Project_X/main/README.md#8",
                        operation: "edit",
                    },
                    {
                        depotPath: "//depot/Project_X/main/src/alphabet.txt#1",
                        operation: "edit",
                    },
                ],
                warnings: [
                    {
                        depotPath: "//depot/Project_X/main/src/alphabet.txt",
                        resolvePath: "//depot/Project_X/main/src/alphabet.txt@=14",
                    },
                ],
            });

            expect(execute).to.have.been.calledWith(ws, "unshelve", sinon.match.any, [
                "-f",
                "-s",
                "99",
                "-c",
                "1",
                "myfile.txt",
            ]);
        });
    });
    describe("fix job", () => {
        it("uses the correct arguments", async () => {
            await expect(
                p4.fixJob(ws, {
                    chnum: "123456",
                    jobId: "job000001",
                    removeFix: true,
                })
            ).to.eventually.equal("fix -c 123456 -d job000001");
        });
    });
    describe("reopen", () => {
        it("uses the correct arguments", async () => {
            await expect(
                p4.reopenFiles(ws, {
                    chnum: "default",
                    files: ["a.txt", "b.txt"],
                })
            ).to.eventually.equal("reopen -c default a.txt b.txt");
        });
    });
    describe("sync", () => {
        it("uses the correct arguments", async () => {
            await expect(p4.sync(ws, {})).to.eventually.equal("sync");
        });
    });
    describe("getChangelists", () => {
        it("Returns the list of open changelists", async () => {
            execute.callsFake(
                execWithStdOut(
                    [
                        "Change 2148153 on 2020/01/21 by user3@client",
                        "",
                        "\tUpdate things",
                        "",
                        "Change 2148152 on 2020/01/20 by user2@client *pending*",
                        "",
                        "\tDo some updates",
                        "\t",
                        "\tOver multiple lines",
                        "",
                        "Change 2148150 on 2020/01/12 by user1@client *pending*",
                        "",
                        "\tUpdate more things",
                        "",
                    ].join("\n")
                )
            );

            await expect(
                p4.getChangelists(ws, {
                    client: "client",
                    status: p4.ChangelistStatus.PENDING,
                })
            ).to.eventually.deep.equal([
                {
                    chnum: "2148153",
                    date: parseDate("2020/01/21"),
                    user: "user3",
                    client: "client",
                    isPending: false,
                    description: ["Update things"],
                },
                {
                    chnum: "2148152",
                    date: parseDate("2020/01/20"),
                    user: "user2",
                    client: "client",
                    isPending: true,
                    description: ["Do some updates", "", "Over multiple lines"],
                },
                {
                    chnum: "2148150",
                    date: parseDate("2020/01/12"),
                    user: "user1",
                    client: "client",
                    isPending: true,
                    description: ["Update more things"],
                },
            ] as ChangeInfo[]);

            expect(execute).to.have.been.calledWith(ws, "changes", sinon.match.any, [
                "-l",
                "-c",
                "client",
                "-s",
                "pending",
            ]);
        });
    });
    describe("describe", () => {
        it("Returns the set of known describe fields", async () => {
            const describeLines = [
                "Change 46 by user@cli on 2020/04/02 16:36:07",
                "",
                "\tdo some stuff in branch1",
                "",
                "Jobs fixed ...",
                "",
                "job000001 on 2020/04/03 by user *closed*",
                "",
                "\tmy job",
                "",
                "Affected files ...",
                "",
                "... //depot/branches/branch1/anotherfile-moved.txt#1 move/add",
                "... //depot/branches/branch1/anotherfile.txt#2 move/delete",
                "... //depot/branches/branch1/newFile.txt#10 edit",
                "",
                "Change 35 by user2@clia on 2020/03/16 11:15:19 *pending*",
                "",
                "\tchanging a list again",
                "\t",
                "\thmm",
                "",
                "Affected files ...",
                "",
                "",
                "",
            ];
            execute.callsFake(execWithStdOut(describeLines.join("\n")));

            const expected: DescribedChangelist[] = [
                {
                    chnum: "46",
                    user: "user",
                    client: "cli",
                    isPending: false,
                    date: parseDate("2020/04/02 16:36:07"),
                    description: ["do some stuff in branch1"],
                    fixedJobs: [
                        {
                            id: "job000001",
                            description: ["my job"],
                        },
                    ],
                    affectedFiles: [
                        {
                            depotPath: "//depot/branches/branch1/anotherfile-moved.txt",
                            operation: "move/add",
                            revision: "1",
                        },
                        {
                            depotPath: "//depot/branches/branch1/anotherfile.txt",
                            operation: "move/delete",
                            revision: "2",
                        },
                        {
                            depotPath: "//depot/branches/branch1/newFile.txt",
                            operation: "edit",
                            revision: "10",
                        },
                    ],
                    shelvedFiles: [],
                },
                {
                    chnum: "35",
                    user: "user2",
                    client: "clia",
                    isPending: true,
                    date: parseDate("2020/03/16 11:15:19"),
                    description: ["changing a list again", "", "hmm"],
                    fixedJobs: [],
                    affectedFiles: [],
                    shelvedFiles: [],
                },
            ];
            const output = await p4.describe(ws, { chnums: ["46", "35"] });
            expect(output).to.deep.equal(expected);
        });
    });
    describe("getShelvedFiles", () => {
        it("Returns an empty list when no changelists are specified", async () => {
            await expect(p4.getShelvedFiles(ws, { chnums: [] })).to.eventually.eql([]);
            expect(execute).not.to.have.been.called;
        });
        it("Returns the list of shelved files", async () => {
            execute.callsFake(
                execWithStdOut(
                    "Change 123 by user@cli on 2020/01/22 10:38:30 *pending*\n" +
                        "\n" +
                        "\tNot sure what I'm doing\n" +
                        "\n" +
                        "Shelved files ...\n" +
                        "\n" +
                        "\n" +
                        "Change 456 by user@cli on 2016/09/16 11:40:19 *pending*\n" +
                        "\n" +
                        "\tUpdate stuff\n" +
                        "\n" +
                        "Jobs fixed ...\n" +
                        "\n" +
                        "job000001 on 2016/09/27 by Bob.Bobson *closed*\n" +
                        "\n" +
                        "\tDo something good\n" +
                        "\n" +
                        "Shelved files ...\n" +
                        "\n" +
                        "... //depot/testArea/file1#7 edit\n" +
                        "... //depot/testArea/file2.cc#12 edit\n" +
                        "\n" +
                        "Change 789 by user@cli on 2016/09/16 11:30:19 *pending*\n" +
                        "\n" +
                        "\tUpdate stuff\n" +
                        "\n" +
                        "Shelved files ...\n" +
                        "\n" +
                        "... //depot/testArea/file3#7 move/delete\n" +
                        "... //depot/testArea/file4.cc#1 move/add\n" +
                        "\n"
                )
            );

            await expect(
                p4.getShelvedFiles(ws, { chnums: ["123", "456", "789"] })
            ).to.eventually.deep.equal([
                {
                    chnum: 456,
                    paths: ["//depot/testArea/file1", "//depot/testArea/file2.cc"],
                },
                {
                    chnum: 789,
                    paths: ["//depot/testArea/file3", "//depot/testArea/file4.cc"],
                },
            ] as p4.ShelvedChangeInfo[]);

            expect(execute).to.have.been.calledWith(ws, "describe", sinon.match.any, [
                "-S",
                "-s",
                "123",
                "456",
                "789",
            ]);
        });
    });
    describe("fixedJobs", () => {
        it("Returns the list of jobs fixed by a changelist", async () => {
            execute.callsFake(
                execWithStdOut(
                    "Change 456 by user@cli on 2016/09/16 11:40:19 *pending*\n" +
                        "\n" +
                        "\tUpdate stuff\n" +
                        "\n" +
                        "Jobs fixed ...\n" +
                        "\n" +
                        "job00001 on 2016/09/27 by Bob.Bobson *closed*\n" +
                        "\n" +
                        "\tDo something good\n" +
                        "\n" +
                        "job00002 on 2016/09/27 by Bob.Bobson *closed*\n" +
                        "\n" +
                        "\tDo something better\n" +
                        "\tAnd do it over multiple lines\n" +
                        "\n" +
                        "Shelved files ...\n" +
                        "\n" +
                        "... //depot/testArea/file1#7 edit\n" +
                        "... //depot/testArea/file2.cc#12 edit\n" +
                        "\n"
                )
            );

            await expect(p4.getFixedJobs(ws, { chnum: "456" })).to.eventually.deep.equal([
                { description: ["Do something good"], id: "job00001" },
                {
                    description: ["Do something better", "And do it over multiple lines"],
                    id: "job00002",
                },
            ] as FixedJob[]);

            expect(execute).to.have.been.calledWith(ws, "describe", sinon.match.any, [
                "-s",
                "456",
            ]);
        });
    });
    describe("info", () => {
        it("Returns a map of info fields", async () => {
            execute.callsFake(
                execWithStdOut(
                    "User name: user\n" +
                        "Client name: cli\n" +
                        "Client host: skynet\n" +
                        "Client root: /home/user/perforce\n" +
                        "Current directory: /home/user/perforce/sub\n"
                )
            );

            const output = await p4.getInfo(ws, {});
            expect(output.get("User name")).to.equal("user");
            expect(output.get("Client name")).to.equal("cli");
            expect(output.get("Client host")).to.equal("skynet");
            expect(output.get("Client root")).to.equal("/home/user/perforce");
            expect(output.get("Current directory")).to.equal("/home/user/perforce/sub");

            expect(execute).to.have.been.calledWith(ws, "info");
        });
    });
    describe("have", () => {
        it("Uses the correct arguments", async () => {
            await p4.have(ws, { file: "//depot/testArea/myFile.txt" });
            expect(execute).to.have.been.calledWith(ws, "have", sinon.match.any, [
                "//depot/testArea/myFile.txt",
            ]);
        });
        it("Returns the depot and local file details", async () => {
            execute.callsFake(
                execWithStdOut(
                    "//depot/testArea/Makefile#4 - /home/perforce/TestArea/Makefile"
                )
            );
            const localUri = vscode.Uri.file("/home/perforce/TestArea/Makefile");
            await expect(
                p4.have(ws, { file: "//depot/testArea/myFile.txt " })
            ).to.eventually.deep.equal({
                depotPath: "//depot/testArea/Makefile",
                revision: "4",
                depotUri: PerforceUri.fromDepotPath(ws, "//depot/testArea/Makefile", "4"),
                localUri,
            });
        });
        it("Returns undefined on stderr", async () => {
            execute.callsFake(
                execWithStdErr(
                    "//depot/testArea/Makefile#4 - /home/perforce/TestArea/Makefile"
                )
            );
            await expect(p4.have(ws, { file: "//depot/testArea/myFile.txt " })).to
                .eventually.be.undefined;
        });
    });
    describe("have file", () => {
        it("Uses the correct arguments", async () => {
            await p4.haveFile(ws, { file: "//depot/testArea/myFile.txt" }); // TODO local path
            expect(execute).to.have.been.calledWith(ws, "have", sinon.match.any, [
                "//depot/testArea/myFile.txt",
            ]);
        });
        it("Returns true if stdout has output", async () => {
            execute.callsFake(
                execWithStdOut(
                    "//depot/testArea/Makefile#4 - /home/perforce/TestArea/Makefile"
                )
            );
            await expect(p4.haveFile(ws, { file: "/home/perforce/TestArea/Makefile" })).to
                .eventually.be.true;
        });
        it("Returns false if stderr has output", async () => {
            execute.callsFake(
                execWithStdErr("//depot/testArea/Makefile#4 - no such file")
            );
            await expect(p4.haveFile(ws, { file: "/home/perforce/TestArea/Makefile" })).to
                .eventually.be.false;
        });
        it("Throws on error", async () => {
            execute.callsFake(execWithErr(new Error("oh no")));
            await expect(
                p4.haveFile(ws, { file: "/home/peforce/TestArea/Makefile" })
            ).to.eventually.be.rejectedWith("oh no");
        });
    });
    describe("isLoggedIn", () => {
        it("Returns true on stdout", async () => {
            execute.callsFake(execWithStdOut("login ok"));
            await expect(p4.isLoggedIn(ws)).to.eventually.equal(true);
        });
        it("Returns false on stderr", async () => {
            execute.callsFake(execWithStdErr("not logged in"));
            await expect(p4.isLoggedIn(ws)).to.eventually.equal(false);
        });
        it("Returns false on err", async () => {
            execute.callsFake(execWithErr(new Error("oh no")));
            await expect(p4.isLoggedIn(ws)).to.eventually.equal(false);
        });
    });
    describe("login", () => {
        it("uses the correct arguments", async () => {
            await p4.login(ws, { password: "hunter2" });
            expect(execute).to.have.been.calledWith(
                ws,
                "login",
                sinon.match.any,
                [],
                "hunter2"
            );
        });
        it("Throws on stderr", async () => {
            execute.callsFake(execWithStdErr("bad password"));
            await expect(
                p4.login(ws, { password: "hunter3" })
            ).to.eventually.be.rejectedWith("bad password");
        });
        it("Throws on err", async () => {
            execute.callsFake(execWithErr(new Error("more bad password")));
            await expect(
                p4.login(ws, { password: "hunter4" })
            ).to.eventually.be.rejectedWith("more bad password");
        });
    });
    describe("logout", () => {
        it("uses the correct arguments", async () => {
            await expect(p4.logout(ws, {})).to.eventually.equal("logout");
        });
    });
    describe("delete", () => {
        it("uses the correct arguments", async () => {
            await expect(
                p4.del(ws, { paths: ["//depot/hello", "//depot/bla"], chnum: "1" })
            ).to.eventually.equal("delete -c 1 //depot/hello //depot/bla");
        });
    });
    describe("annotate", () => {
        type TestAnnotation = {
            line: string;
            chnum: string;
            revision: string;
            user: string;
            date: string;
        };
        const annotations: TestAnnotation[] = [
            {
                line: "here is a file",
                chnum: "5",
                revision: "1",
                user: "user.a",
                date: "2020/01/02",
            },
            {
                line: "",
                chnum: "5",
                revision: "1",
                user: "user.a",
                date: "2020/01/02",
            },
            {
                line: " it has some lines",
                chnum: "9",
                revision: "2",
                user: "user.b",
                date: "2020/02/03",
            },
            {
                line: "and another line",
                chnum: "126125",
                revision: "14",
                user: "xyz",
                date: "2020/04/09",
            },
        ];
        it("returns an annotation per line", async () => {
            const lines = annotations.map((ann) => ann.revision + ": " + ann.line);
            execute.callsFake(execWithStdOut(lines.join("\n")));

            const output = await p4.annotate(ws, { file: "//depot/hello" });
            expect(output).to.deep.equal(
                annotations.map((ann) => {
                    return {
                        line: ann.line,
                        revisionOrChnum: ann.revision,
                        user: undefined,
                        date: undefined,
                    };
                })
            );

            expect(execute).to.have.been.calledWith(ws, "annotate", sinon.match.any, [
                "-q",
                "//depot/hello",
            ]);
        });
        it("parses output with changelists", async () => {
            const lines = annotations.map((ann) => ann.chnum + ": " + ann.line);
            execute.callsFake(execWithStdOut(lines.join("\n")));

            const output = await p4.annotate(ws, {
                file: "//depot/hello",
                outputChangelist: true,
            });
            expect(output).to.deep.equal(
                annotations.map((ann) => {
                    return {
                        line: ann.line,
                        revisionOrChnum: ann.chnum,
                        user: undefined,
                        date: undefined,
                    };
                })
            );

            expect(execute).to.have.been.calledWith(ws, "annotate", sinon.match.any, [
                "-q",
                "-c",
                "//depot/hello",
            ]);
        });
        it("parses output with users", async () => {
            const lines = annotations.map(
                (ann) => ann.chnum + ": " + ann.user + " " + ann.date + " " + ann.line
            );
            execute.callsFake(execWithStdOut(lines.join("\n")));

            const output = await p4.annotate(ws, {
                file: "//depot/hello",
                outputUser: true,
            });
            expect(output).to.deep.equal(
                annotations.map((ann) => {
                    return {
                        line: ann.line,
                        revisionOrChnum: ann.chnum,
                        user: ann.user,
                        date: ann.date,
                    };
                })
            );

            expect(execute).to.have.been.calledWith(ws, "annotate", sinon.match.any, [
                "-q",
                "-u",
                "//depot/hello",
            ]);
        });
    });
    describe("getFileHistory", () => {
        const lines = [
            "//depot/branch/newFile.txt",
            "... #2 change 24 edit on 2020/03/09 22:22:42 by user.b@b_client (text)",
            "",
            "\tmake some changes in the branch",
            "\tover multiple lines",
            "",
            "... #1 change 23 move/add on 2019/11/15 22:19:29 by user.a@default (text)",
            "",
            "\tmove the file",
            "",
            "... ... move from //depot/TestArea/newFile.txt#1,#2",
        ];
        const oldLines = [
            "//depot/TestArea/newFile.txt",
            "... #2 change 22 edit on 2018/03/09 21:30:07 by user.a@default (text)",
            "",
            "\tmake some changes to the new file",
            "",
            "... ... branch into //depot/brancha/newFile.txt#1",
            "... ... integrate into //depot/branchb/newFile.txt#7",
            "... #1 change 21 add on 2018/03/09 21:29:32 by user.x@stuff (text)",
            "",
            "\tadd a file",
            "",
            "... ... branch from //depot/old/newFile.txt#1",
        ];

        const date1 = new Date(2020, 2, 9, 22, 22, 42);
        const date2 = new Date(2019, 10, 15, 22, 19, 29);
        const date3 = new Date(2018, 2, 9, 21, 30, 7);
        const date4 = new Date(2018, 2, 9, 21, 29, 32);

        it("Returns a list of changes", async () => {
            execute.callsFake(execWithStdOut(lines.join("\n")));

            const output = await p4.getFileHistory(ws, {
                file: "//depot/branch/newFile.txt",
            });

            expect(output).to.deep.equal([
                {
                    file: "//depot/branch/newFile.txt",
                    description: "make some changes in the branch\nover multiple lines",
                    revision: "2",
                    chnum: "24",
                    integrations: [],
                    operation: "edit",
                    date: date1,
                    user: "user.b",
                    client: "b_client",
                },
                {
                    file: "//depot/branch/newFile.txt",
                    description: "move the file",
                    revision: "1",
                    chnum: "23",
                    integrations: [
                        {
                            direction: Direction.FROM,
                            file: "//depot/TestArea/newFile.txt",
                            startRev: "1",
                            endRev: "2",
                            operation: "move",
                        },
                    ],
                    operation: "move/add",
                    date: date2,
                    user: "user.a",
                    client: "default",
                },
            ]);

            expect(execute).to.have.been.calledWith(ws, "filelog", sinon.match.any, [
                "-l",
                "-t",
                "//depot/branch/newFile.txt",
            ]);
        });
        it("Follows branches when enabled", async () => {
            execute.callsFake(execWithStdOut([...lines, ...oldLines].join("\n")));

            const output = await p4.getFileHistory(ws, {
                file: "//depot/branch/newFile.txt",
                followBranches: true,
            });

            expect(output).to.deep.equal([
                {
                    file: "//depot/branch/newFile.txt",
                    description: "make some changes in the branch\nover multiple lines",
                    revision: "2",
                    chnum: "24",
                    integrations: [],
                    operation: "edit",
                    date: date1,
                    user: "user.b",
                    client: "b_client",
                },
                {
                    file: "//depot/branch/newFile.txt",
                    description: "move the file",
                    revision: "1",
                    chnum: "23",
                    integrations: [
                        {
                            direction: Direction.FROM,
                            file: "//depot/TestArea/newFile.txt",
                            startRev: "1",
                            endRev: "2",
                            operation: "move",
                        },
                    ],
                    operation: "move/add",
                    date: date2,
                    user: "user.a",
                    client: "default",
                },
                {
                    file: "//depot/TestArea/newFile.txt",
                    description: "make some changes to the new file",
                    revision: "2",
                    chnum: "22",
                    integrations: [
                        {
                            direction: Direction.TO,
                            file: "//depot/brancha/newFile.txt",
                            startRev: undefined,
                            endRev: "1",
                            operation: "branch",
                        },
                        {
                            direction: Direction.TO,
                            file: "//depot/branchb/newFile.txt",
                            startRev: undefined,
                            endRev: "7",
                            operation: "integrate",
                        },
                    ],
                    operation: "edit",
                    date: date3,
                    user: "user.a",
                    client: "default",
                },
                {
                    file: "//depot/TestArea/newFile.txt",
                    description: "add a file",
                    revision: "1",
                    chnum: "21",
                    integrations: [
                        {
                            direction: Direction.FROM,
                            file: "//depot/old/newFile.txt",
                            startRev: undefined,
                            endRev: "1",
                            operation: "branch",
                        },
                    ],
                    operation: "add",
                    date: date4,
                    user: "user.x",
                    client: "stuff",
                },
            ]);

            expect(execute).to.have.been.calledWith(ws, "filelog", sinon.match.any, [
                "-l",
                "-t",
                "-i",
                "//depot/branch/newFile.txt",
            ]);
        });
    });
    describe("integrated", () => {
        it("Uses the correct arguements", async () => {
            execute.callsFake(
                execWithStdOut(
                    "//depot/branches/branch1/newFile.txt#1 - edit into //depot/branches/branch2/newFile.txt#2"
                )
            );
            await p4.integrated(ws, {
                file: "//depot/branches/branch1/newFile.txt",
                intoOnly: true,
                startingChnum: "4",
            });

            expect(execute).to.have.been.calledWith(ws, "integrated", sinon.match.any, [
                "-s",
                "4",
                "--into-only",
                "//depot/branches/branch1/newFile.txt",
            ]);
        });
        it("Returns the integrations for a file", async () => {
            const lines = [
                "//depot/branches/branch1/newFile.txt#1 - edit into //depot/branches/branch2/newFile.txt#2",
                "//depot/branches/branch1/newFile.txt#1 - branch from //depot/TestArea/newFile.txt#1",
                "//depot/branches/branch1/newFile.txt#9 - edit from //depot/TestArea/newFile.txt#3,#4",
                "//depot/branches/branch1/newFile.txt#2,#9 - copy into //depot/TestArea/newFile.txt#5",
            ];
            execute.callsFake(execWithStdOut([...lines].join("\n")));

            const depotPath = "//depot/branches/branch1/newFile.txt";
            const b2 = "//depot/branches/branch2/newFile.txt";
            const main = "//depot/TestArea/newFile.txt";
            const expected: p4.IntegratedRevision[] = [
                {
                    displayDirection: "into",
                    fromFile: depotPath,
                    fromStartRev: undefined,
                    fromEndRev: "1",
                    operation: "edit",
                    toFile: b2,
                    toRev: "2",
                },
                {
                    displayDirection: "from",
                    fromFile: main,
                    fromStartRev: undefined,
                    fromEndRev: "1",
                    operation: "branch",
                    toFile: depotPath,
                    toRev: "1",
                },
                {
                    displayDirection: "from",
                    fromFile: main,
                    fromStartRev: "3",
                    fromEndRev: "4",
                    operation: "edit",
                    toFile: depotPath,
                    toRev: "9",
                },
                {
                    displayDirection: "into",
                    fromFile: depotPath,
                    fromStartRev: "2",
                    fromEndRev: "9",
                    operation: "copy",
                    toFile: main,
                    toRev: "5",
                },
            ];

            const output = await p4.integrated(ws, {
                file: "//depot/branches/branch1/newFile.txt",
            });

            expect(output).to.deep.equal(expected);
        });
        it("Returns empty list on stderr", async () => {
            execute.callsFake(execWithStdErr("No integrations"));

            expect(await p4.integrated(ws, {})).to.deep.equal([]);
        });
    });
});
