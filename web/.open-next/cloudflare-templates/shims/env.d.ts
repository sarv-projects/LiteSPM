/**
 * Shim for `@next/env`.
 *
 * On Workers, `process.env` is populated at runtime by `init.ts` from the Worker bindings and from the `.env*`
 * files compiled at build time for the `NEXTJS_ENV` mode, so there is nothing to load here.
 *
 * A default export is provided as some libraries (e.g. Payload 3.x) use a default import.
 */
/**
 * Replacement for `loadEnvConfig` from `@next/env` that does not load any file.
 *
 * The arguments are ignored: the mode is selected by `NEXTJS_ENV` at runtime, not by the `dev` flag.
 *
 * @returns The same shape as `@next/env` so that callers destructuring the result keep working.
 */
export declare function loadEnvConfig(): {
    combinedEnv: any;
    parsedEnv: undefined;
    loadedEnvFiles: never[];
};
declare const _default: {
    loadEnvConfig: typeof loadEnvConfig;
};
export default _default;
