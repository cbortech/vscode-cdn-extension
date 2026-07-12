/**
 * Maps per-extension enable/disable settings to the option objects the
 * @cbortech/cbor parser expects (`builtinExtensions` / `extensions`).
 */
import {
  b1,
  b32,
  cri,
  dt,
  float,
  h32,
  ilbs,
  ilts,
  ip,
  same,
  t1,
  type CborExtension,
} from '@cbortech/cbor';
import { hash } from '@cbortech/hash-extension';
import { uuid } from '@cbortech/uuid-extension';
import { map, set } from '@cbortech/set-map-extensions';

/** Bundled application-oriented extensions (the library's default set). */
const BUILTIN: ReadonlyArray<readonly [BuiltinExtensionName, CborExtension]> = [
  ['dt', dt],
  ['ip', ip],
  ['cri', cri],
  ['t1', t1],
  ['b1', b1],
  ['ilbs', ilbs],
  ['ilts', ilts],
  ['float', float],
];

/** Opt-in extensions: bundled with @cbortech/cbor but off by default there. */
const OPTIONAL: ReadonlyArray<readonly [OptionalExtensionName, CborExtension]> =
  [
    ['same', same],
    ['b32', b32],
    ['h32', h32],
    ['hash', hash],
    ['uuid', uuid],
    ['set', set],
    ['map', map],
  ];

export type BuiltinExtensionName =
  'dt' | 'ip' | 'cri' | 't1' | 'b1' | 'ilbs' | 'ilts' | 'float';

export type OptionalExtensionName =
  'same' | 'b32' | 'h32' | 'hash' | 'uuid' | 'set' | 'map';

export type ExtensionName = BuiltinExtensionName | OptionalExtensionName;

export const EXTENSION_NAMES: readonly ExtensionName[] = [
  ...BUILTIN.map(([name]) => name),
  ...OPTIONAL.map(([name]) => name),
];

/** Enabled/disabled state per extension; missing entries mean enabled. */
export type ExtensionSettings = Partial<Record<ExtensionName, boolean>>;

export interface ResolvedExtensions {
  /**
   * `undefined` when every bundled extension is enabled (use the library
   * default), otherwise the explicit subset (`false` for the empty set).
   */
  builtinExtensions: CborExtension[] | false | undefined;
  /** Enabled opt-in extensions to pass via the `extensions` option. */
  extensions: CborExtension[];
}

export function resolveExtensions(
  settings: ExtensionSettings = {}
): ResolvedExtensions {
  const enabled = (name: ExtensionName): boolean => settings[name] !== false;

  const builtins = BUILTIN.filter(([name]) => enabled(name)).map(
    ([, ext]) => ext
  );
  const builtinExtensions =
    builtins.length === BUILTIN.length
      ? undefined
      : builtins.length === 0
        ? false
        : builtins;

  return {
    builtinExtensions,
    extensions: OPTIONAL.filter(([name]) => enabled(name)).map(
      ([, ext]) => ext
    ),
  };
}

/**
 * app-string prefix (as it appears in source, e.g. 'SET', 'dt', 'DT') to the
 * extension name it belongs to. Built from each extension's own declared
 * `appStringPrefixes`, so it stays correct even for extensions the bundled
 * `@cbortech/cbor` missing-extension hint table doesn't know about (e.g. the
 * `SET<<…>>` / `MAP<<…>>` app-sequence prefixes from
 * `@cbortech/set-map-extensions`).
 */
const PREFIX_TO_EXTENSION_NAME: ReadonlyMap<string, ExtensionName> = new Map(
  [...BUILTIN, ...OPTIONAL].flatMap(([name, ext]) =>
    (ext.appStringPrefixes ?? []).map((prefix) => [prefix, name] as const)
  )
);

/**
 * When `prefix` belongs to a known extension that is disabled in `settings`,
 * return its name; otherwise `undefined` (either the prefix is unknown, or
 * its extension is enabled).
 */
export function disabledExtensionForPrefix(
  prefix: string,
  settings: ExtensionSettings = {}
): ExtensionName | undefined {
  const name = PREFIX_TO_EXTENSION_NAME.get(prefix);
  if (name === undefined) return undefined;
  return settings[name] === false ? name : undefined;
}
