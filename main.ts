import express from "express";
import { SlackAPI } from "deno_slack_api/mod.ts";
import { encode, Hash } from "checksum/mod.ts";
import { Velo } from "velo/mod.ts";

const port = 3000;

const app = express();
const client = SlackAPI(Deno.env.get("SLACK_TOKEN") || "");

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

  const user = (await client.users.list())?.members.find((member) =>
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

app.get("/avatar/:hash", async (req, res) => {
  const hash = `${req.params.hash}`;
  const imageUrl = await getImageUrl(hash).catch((error) => {
    console.error(error);
    return undefined;
  });

  res.redirect(
    imageUrl || `https://www.gravatar.com/avatar/${hash}?default=robohash`,
  );
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
