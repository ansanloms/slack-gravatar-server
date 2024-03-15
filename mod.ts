import "std/dotenv/load.ts";
import { STATUS_CODE, STATUS_TEXT } from "std/http/mod.ts";

import * as image from "./_utils/image.ts";

Deno.serve(
  {
    port: Number(Deno.env.get("PORT") || 3000),
  },
  async (req) => {
    const match = new URLPattern({ pathname: "/avatar/:hash" }).exec(
      req.url,
    );

    if (typeof match === "undefined") {
      return new Response(STATUS_TEXT[STATUS_CODE.NotFound], {
        status: STATUS_CODE.NotFound,
        statusText: STATUS_TEXT[STATUS_CODE.NotFound],
      });
    }

    try {
      const requestUrl = new URL(req.url);

      const hash = match?.pathname.groups.hash;
      const size = (() => {
        const size = requestUrl.searchParams.get("size");
        return Number.isSafeInteger(Number(size)) ? Number(size) : undefined;
      })();
      const defaultImage = requestUrl.searchParams.get("default") || undefined;

      const imageRaw = await image.getImage(hash || "", size, { defaultImage });

      if (imageRaw) {
        return new Response(
          imageRaw,
          {
            headers: new Headers({ "content-type": "image/jpeg" }),
            status: STATUS_CODE.OK,
            statusText: STATUS_TEXT[STATUS_CODE.OK],
          },
        );
      } else {
        return new Response(STATUS_TEXT[STATUS_CODE.NotFound], {
          status: STATUS_CODE.NotFound,
          statusText: STATUS_TEXT[STATUS_CODE.NotFound],
        });
      }
    } catch (error) {
      console.error(error);
      return new Response(STATUS_TEXT[STATUS_CODE.InternalServerError], {
        status: STATUS_CODE.InternalServerError,
        statusText: STATUS_TEXT[STATUS_CODE.InternalServerError],
      });
    }
  },
);
