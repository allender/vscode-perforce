import * as micromatch from "micromatch";
import { promises as fsPromises } from "fs";
import * as Path from "path";

export interface RawPatterns {
    relativeTo: string;
    isAbsolute: boolean;
    patterns: string[];
}

export class P4Ignore {
    private _patterns: string[];
    private constructor(patterns: string[]) {
        this._patterns = patterns;
        console.log(this._patterns);
    }

    /*
    public static fromFiles(...files: string[]) {
        /**/
    //}

    private static isPattern(pattern: string): boolean {
        const trimmed = pattern.trim();
        return trimmed !== "" && !trimmed.startsWith("#");
    }

    private static toGlobalPath(
        relativeTo: string,
        isAbsoluteFile: boolean,
        pattern: string
    ) {
        // paths starting with / are always directly in the file location
        // absolute files match a path anywhere
        // relative files match a path under the file location only
        return pattern.startsWith("/")
            ? relativeTo + pattern
            : (isAbsoluteFile ? "" : relativeTo + "/") + "**/" + pattern;
    }

    private static toGlobPatterns(
        relativeTo: string,
        isAbsoluteFile: boolean,
        pattern: string
    ): string[] {
        if (!this.isPattern(pattern)) {
            return [];
        }

        const isNegated = pattern.startsWith("!");
        const out = isNegated
            ? "!" + this.toGlobalPath(relativeTo, isAbsoluteFile, pattern.slice(1))
            : this.toGlobalPath(relativeTo, isAbsoluteFile, pattern);

        if (out.endsWith("/")) {
            // the last part of the path must not match a filename
            return [out + "**"];
        }
        // may match a file or directory
        return [out, out + "/**"];
    }

    /**
     * Create a matcher from a set of raw patterns.
     * @param relativeTo path to the .p4config file's directory, without the trailing slash
     * @param isAbsoluteFile whether the file is specified in the P4CONFIG using an absolute path or a relative path
     * @param patterns the set of patterns from the file
     */
    public static fromRawPatterns(patterns: RawPatterns[]) {
        /**/
        const parsed = patterns
            .map(ps =>
                ps.patterns.map(p =>
                    P4Ignore.toGlobPatterns(ps.relativeTo, ps.isAbsolute, p)
                )
            )
            .reduce((all, cur) => all.concat(cur), [])
            .reduce((all, cur) => all.concat(cur), []);

        return new P4Ignore(parsed);
    }

    public static async fromFiles(allFileNames: string[]) {
        const allFileProms = allFileNames.map(file => fsPromises.readFile(file));
        const allFiles = await Promise.all(allFileProms);
        const allPatterns: RawPatterns[] = allFiles.map((file, i) => {
            return {
                relativeTo: Path.dirname(allFileNames[i]),
                isAbsolute: false,
                patterns: file.toString().split(/r?\n/)
            };
        });

        return P4Ignore.fromRawPatterns(allPatterns);
    }

    public shouldIgnore(filePath: string): boolean {
        return (
            micromatch([filePath], this._patterns, {
                nobrace: true,
                nobracket: true,
                noextglob: true,
                noquantifiers: true,
                strictSlashes: true,
                dot: true
            }).length === 1
        );
    }
}

// P4IGNORE - relative paths - scan up the tree. absolute paths, always apply

// store relative P4Ignores by path - one for each p4 ignore file
// store global p4 ignores separately
// for a given file apply all of the p4 ignore files in turn up the tree,
// highest level first
// DOESN'T work because lower files can negate higher files
// need to know which order to apply them based on the env variable
