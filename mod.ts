import { serve } from "./deps/std/http/server.ts";
import { Status, STATUS_TEXT } from "./deps/std/http/http_status.ts";
import * as path from "./deps/std/path/mod.ts";
import * as fs from "./deps/std/fs/mod.ts";
import { crypto } from "./deps/std/crypto/mod.ts";
import { SlackAPI } from "./deps/deno_slack_api/mod.ts";
import { Velo } from "./deps/velo/mod.ts";
import { decode, Image } from "./deps/imagescript/mod.ts";
import { Command } from "./deps/cliffy/command/mod.ts";

const { options } = await new Command()
  .name("slack-gravatar-server")
  .version("0.1.0")
  .description("Gravatar server withs Slack profile images.")
  .option(
    "-p --port <port:number>",
    "port.",
  )
  .option(
    "--slack-token <slackToken:string>",
    "Slack token.",
  )
  .parse(Deno.args);

const port = options.port || 3000;

const slack = SlackAPI(options.slackToken || "");

const cache = Velo.builder<string, string>()
  .capacity(200)
  .lru()
  .ttl(24 * 60 * 60 * 1000)
  .build();

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

const getSlackMembers = async () => {
  const key = "slack-members";

  const membersByCache = JSON.parse(cache.get(key) || "[]") as {
    email: string | undefined;
    image: string | undefined;
  }[];
  if (membersByCache.length > 0) {
    return membersByCache;
  }

  const members = (((await slack.users.list())?.members || []) as {
    profile: { email: string | undefined; image_original: string | undefined };
  }[]).map((member) => ({
    email: member.profile.email,
    image: member.profile.image_original,
  }));

  cache.set(key, JSON.stringify(members));

  return members;
};

const getImageUrlByCache = (hash: string) => {
  const imageUrlByCache = cache.get(hash);
  console.log("cache", { hash, image: imageUrlByCache });

  if (imageUrlByCache) {
    return imageUrlByCache;
  }
};

const getImageUrlBySlack = async (hash: string) => {
  const members = await getSlackMembers();
  const results = await Promise.all(
    members.map(async (member) =>
      await md5(
        new TextEncoder().encode(member.email?.toLowerCase() || ""),
      ) === hash
    ),
  );
  const index = results.findIndex((result) => result);
  const member = members[index];

  const imageUrlBySlack = member?.image;
  console.log("slack", { hash, image: imageUrlBySlack });

  if (imageUrlBySlack) {
    return imageUrlBySlack;
  }
};

const getImageUrl = async (hash: string) => {
  const imageUrlByCache = getImageUrlByCache(hash);
  if (typeof imageUrlByCache !== "undefined") {
    return imageUrlByCache;
  }

  const imageUrlBySlack = await getImageUrlBySlack(hash);
  if (typeof imageUrlBySlack !== "undefined") {
    cache.set(hash, imageUrlBySlack);
    return imageUrlBySlack;
  }
};

serve(async (request: Request) => {
  try {
    const match = new URLPattern({ pathname: "/avatar/:hash" }).exec(
      request.url,
    );

    if (typeof match === "undefined") {
      return new Response(STATUS_TEXT[Status.NotFound], {
        status: Status.NotFound,
        statusText: STATUS_TEXT[Status.NotFound],
      });
    }

    const hash = match?.pathname.groups.hash;
    const size = new URL(request.url)?.searchParams.get("size");
    const image = await Deno.makeTempFile({ suffix: ".jpg" });
    const url = await getImageUrl(hash || "").catch((error) => {
      console.error(error);
      return undefined;
    }) ||
      `https://www.gravatar.com/avatar/${hash}?default=robohash`;

    await download(url, image);

    if (
      size && Number.parseInt(size, 10) >= 1 &&
      Number.parseInt(size, 10) <= 1024
    ) {
      const small = (await decode(await Deno.readFile(image))).resize(
        Number.parseInt(size, 10),
        Image.RESIZE_AUTO,
      );

      if (small) {
        await Deno.writeFile(image, await small.encodeJPEG());
      }
    }

    return new Response(await Deno.readFile(image), {
      headers: new Headers({ "content-type": "image/jpeg" }),
      status: Status.OK,
      statusText: STATUS_TEXT[Status.OK],
    });
  } catch (error) {
    console.error(error);
    return new Response(STATUS_TEXT[Status.InternalServerError], {
      status: Status.InternalServerError,
      statusText: STATUS_TEXT[Status.InternalServerError],
    });
  }
}, { port });
