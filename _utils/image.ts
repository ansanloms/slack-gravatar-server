import * as path from "std/path/mod.ts";
import * as fs from "std/fs/mod.ts";
import { crypto } from "std/crypto/mod.ts";
import { decode, Image } from "imagescript/mod.ts";
import * as slack from "./slack.ts";
import * as cache from "./cache.ts";

const md5 = async (buf: Uint8Array) => {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "MD5",
        buf,
      ),
    ),
  ).map((c) => c.toString(16).padStart(2, "0")).join("");
};

const download = async (url: string, dest: string) => {
  if (!(await fs.exists(path.dirname(dest)))) {
    await Deno.mkdir(path.dirname(dest), { recursive: true });
  }

  const blob = await (await fetch(url)).blob();
  const content = new Uint8Array(await blob.arrayBuffer());
  await Deno.writeFile(dest, content);
};

const getSlackMemberByEmailHash = async (hash: string) => {
  const members = await slack.getMembers();
  const bits = await Promise.all(members.map(async (member) =>
    (await md5(
      new TextEncoder().encode(member.profile?.email?.toLowerCase() || ""),
    )) === hash
  ));

  return members.find((_, index) => bits[index]);
};

const getImageUrlBySlackProfile = async (hash: string) => {
  return (await getSlackMemberByEmailHash(hash))?.profile
    ?.image_original;
};

const getImageUrlByGravatar = (
  hash: string,
  options?: {
    defaultImage?: string;
  },
) => {
  const url = new URL(`https://www.gravatar.com/avatar/${hash}`);

  url.searchParams.set("s", "512");
  if (options?.defaultImage) {
    url.searchParams.set("default", options.defaultImage);
  }

  return url.toString();
};

const getImageUrl = async (hash: string, options?: {
  defaultImage?: string;
}) => {
  const prefix = "image-url";
  const key = `${hash}-${await md5(
    new TextEncoder().encode(JSON.stringify(options || {})),
  )}`;
  const expireIn = 60 * 60 * 1000;

  const imageUrlByCache = await cache.get<string>(prefix, key);
  if (imageUrlByCache) {
    return imageUrlByCache;
  }

  const imageUrl = await getImageUrlBySlackProfile(hash) ||
    getImageUrlByGravatar(hash, options);
  await cache.set<string>(prefix, key, imageUrl, { expireIn });

  return imageUrl;
};

export const getImage = async (hash: string, size?: number, options?: {
  defaultImage?: string;
}) => {
  const imageSize = size && size >= 1 && size <= 512 ? size : 512;
  const optionsHash = await md5(
    new TextEncoder().encode(JSON.stringify(options || {})),
  );

  const prefix = "image";
  const key = `${hash}-${imageSize}-${optionsHash}`;
  const expireIn = 60 * 60 * 1000;

  const imageByCache = await cache.get<Uint8Array>(prefix, key);
  if (imageByCache) {
    return imageByCache;
  }

  const url = await getImageUrl(hash, options);
  const tempPath = await Deno.makeTempFile();
  await download(url, tempPath);

  const image = await (await decode(await Deno.readFile(tempPath))).resize(
    imageSize,
    Image.RESIZE_AUTO,
  )?.encodeJPEG(30);
  if (image) {
    await cache.set<Uint8Array>(prefix, key, image, { expireIn });
  }

  return image;
};
