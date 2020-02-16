import { expect } from "chai";
//import * as chai from "chai";
import { P4Ignore } from "../../../P4Ignore";

describe("P4 Ignore (unit)", () => {
    it("Rules are specified using local filepath syntax", () => {
        const p = P4Ignore.fromRawPatterns([
            {
                relativeTo: "/home/depot",
                isAbsolute: false,
                patterns: ["abc", "def/ghi"]
            }
        ]);
        expect(p.shouldIgnore("/home/notdepot/abc")).to.be.false;
        expect(p.shouldIgnore("/home/notdepot/def/ghi")).to.be.false;
        expect(p.shouldIgnore("/home/notdepot/xyz/abc")).to.be.false;
        expect(p.shouldIgnore("/home/depot/def/ghi")).to.be.true;
        expect(p.shouldIgnore("/home/depot/def/ghi")).to.be.true;
        expect(p.shouldIgnore("/home/depot/xyz/abc")).to.be.true;
        expect(p.shouldIgnore("/home/depot/abc")).to.be.true;
        expect(p.shouldIgnore("/home/depot/xyz")).to.be.false;
        expect(p.shouldIgnore("/home/depot/def/xyz")).to.be.false;
    });
    it("Absolute p4ignore files match files anywhere", () => {
        const p = P4Ignore.fromRawPatterns([
            { relativeTo: "/home/depot", isAbsolute: true, patterns: ["abc", "def/ghi"] }
        ]);
        expect(p.shouldIgnore("/home/notdepot/abc")).to.be.true;
        expect(p.shouldIgnore("/home/notdepot/def/ghi")).to.be.true;
        expect(p.shouldIgnore("/home/notdepot/xyz/abc")).to.be.true;
        expect(p.shouldIgnore("/home/depot/def/ghi")).to.be.true;
        expect(p.shouldIgnore("/home/depot/def/ghi")).to.be.true;
        expect(p.shouldIgnore("/home/depot/xyz/abc")).to.be.true;
        expect(p.shouldIgnore("/home/depot/abc")).to.be.true;
        expect(p.shouldIgnore("/home/depot/xyz")).to.be.false;
        expect(p.shouldIgnore("/home/depot/def/xyz")).to.be.false;
    });
    // TODO - and skip for non-windows (or pass in an OS?)
    it("Unix style paths will work on Windows for cross platform file support");
    describe("A # character at the beginning of a line", () => {
        it("denotes a comment", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["#abc", "def/ghi"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/sub/abc")).to.be.false;
            expect(p.shouldIgnore("/home/depot/sub/def/ghi")).to.be.true;
        });
    });
    describe("The * wildcard", () => {
        it("matches substrings", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["abc*", "d*f"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/abcd")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abcde")).to.be.true;
            expect(p.shouldIgnore("/home/depot/def")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abcd/xyz")).to.be.true;
        });
        it("does not match path separators", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["abc/*/opq", "d*f"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/d/f")).to.be.false;
            expect(p.shouldIgnore("/home/depot/abc/x/opq/e")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abc/x/y/opq/e")).to.be.false;
        });
    });
    describe("The ** wildcard", () => {
        it("matches substrings including path separators", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["abc/**/opq", "d**f"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/abc/x/y/opq/e")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abc/opq/e")).to.be.true;
            expect(p.shouldIgnore("/home/depot/def")).to.be.true;
            // exception for path separators here!
            expect(p.shouldIgnore("/home/depot/d/f")).to.be.false;
        });
    });
    describe("A ! character at the beginning of a line", () => {
        it("excludes the file specification", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["abc*", "!abcde"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/abcxyz")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abcde")).to.be.false;
        });
        it("May be overridden by later rules", () => {
            const p = P4Ignore.fromRawPatterns([
                {
                    relativeTo: "/home/depot",
                    isAbsolute: false,
                    patterns: ["abc*", "!abcde*", "abcdef"]
                }
            ]);
            expect(p.shouldIgnore("/home/depot/abcxyz")).to.be.true;
            expect(p.shouldIgnore("/home/depot/abcde")).to.be.false;
            expect(p.shouldIgnore("/home/depot/abcdef")).to.be.true;
        });
    });
    describe("the / (or \\ windows) character", () => {
        describe("at the beggining of a line", () => {
            it("causes the file specification to be considered relative to the P4IGNORE file", () => {
                const p = P4Ignore.fromRawPatterns([
                    {
                        relativeTo: "/home/depot",
                        isAbsolute: false,
                        patterns: ["/abc", "/def"]
                    }
                ]);
                expect(p.shouldIgnore("/home/depot/abc")).to.be.true;
                expect(p.shouldIgnore("/home/depot/x/abc")).to.be.false;
                expect(p.shouldIgnore("/home/depot/def")).to.be.true;
                expect(p.shouldIgnore("/home/depot/x/def")).to.be.false;
            });
        });
        describe("at the end of a line", () => {
            it("causes the file specification to only match directories", () => {
                const p = P4Ignore.fromRawPatterns([
                    {
                        relativeTo: "/home/depot",
                        isAbsolute: false,
                        patterns: ["/abc/", "def/"]
                    }
                ]);
                expect(p.shouldIgnore("/home/depot/abc")).to.be.false;
                expect(p.shouldIgnore("/home/depot/abc/xyz")).to.be.true;
                expect(p.shouldIgnore("/home/depot/def")).to.be.false;
                expect(p.shouldIgnore("/home/depot/x/def")).to.be.false;
                expect(p.shouldIgnore("/home/depot/x/def/mno")).to.be.true;
            });
            it("matches files and directories when not present", () => {
                const p = P4Ignore.fromRawPatterns([
                    {
                        relativeTo: "/home/depot",
                        isAbsolute: false,
                        patterns: ["abc", "/def"]
                    }
                ]);
                expect(p.shouldIgnore("/home/depot/abc")).to.be.true;
                expect(p.shouldIgnore("/home/depot/abc/x")).to.be.true;
                expect(p.shouldIgnore("/home/depot/abc/xyz/mno")).to.be.true;
                expect(p.shouldIgnore("/home/depot/def/xyz/mno")).to.be.true;
                expect(p.shouldIgnore("/home/depot/def/xyz")).to.be.true;
            });
        });
    });

    it("whitespace");
    it("special characters");
    it("more specific file can negate outer file");
});
