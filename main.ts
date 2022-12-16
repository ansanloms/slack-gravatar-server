import { serve } from "std/http/server.ts";
import { Status, STATUS_TEXT } from "std/http/http_status.ts";
import { basename, dirname } from "std/path/mod.ts";
import { SlackAPI } from "deno_slack_api/mod.ts";
import { Hash } from "checksum/mod.ts";
import { Velo } from "velo/mod.ts";
import { download } from "https://deno.land/x/download@v1.0.1/mod.ts";
import { decode, Image } from "https://deno.land/x/imagescript@v1.2.14/mod.ts";

const port = 3000;

const slack = SlackAPI(Deno.env.get("SLACK_TOKEN") || "");

const cache = Velo.builder<string, string>()
  .capacity(200)
  .lru()
  .ttl(24 * 60 * 60 * 1000)
  .build();

const getImageUrl = async (hash: string) => {
  const imageUrlByCache = cache.get(hash);
  console.log("cache", { hash, image: imageUrlByCache });
  if (imageUrlByCache) {
    return imageUrlByCache;
  }

  const user = (await slack.users.list())?.members.find((member) =>
    new Hash("md5").digestString(member.profile.email?.toLowerCase() || "")
      .hex() === hash
  );

  const imageUrlBySlack = user?.profile.image_original;
  console.log("slack", { hash, image: imageUrlBySlack });
  if (imageUrlBySlack) {
    cache.set(hash, imageUrlBySlack);
  }

  return imageUrlBySlack;
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

    await download(
      await getImageUrl(hash || "").catch((error) => {
        console.error(error);
        return undefined;
      }) ||
        `https://www.gravatar.com/avatar/${hash}?default=robohash`,
      {
        file: basename(image),
        dir: dirname(image),
      },
    );

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
