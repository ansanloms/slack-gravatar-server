const kv = await Deno.openKv();

export const get = async <T>(
  prefix: string,
  key: string,
): Promise<T | undefined> => {
  const entry = await kv.get<T>([prefix, key]);
  if (entry.value === null || entry.versionstamp === null) {
    return undefined;
  }

  return entry.value;
};

export const set = async <T>(
  prefix: string,
  key: string,
  data: T,
  options?: Parameters<typeof Deno.Kv.prototype.set>[2],
): Promise<void> => {
  await kv.set([prefix, key], data, options);
};

export const list = async <T>(
  prefix: string,
): Promise<T[]> => {
  const entries = kv.list<T>({ prefix: [prefix] });
  const result: T[] = [];

  for await (const entry of entries) {
    if (entry.value !== null && entry.versionstamp !== null) {
      result.push(entry.value);
    }
  }

  return result;
};
