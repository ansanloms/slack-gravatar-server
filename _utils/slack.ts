import { SlackAPI } from "deno_slack_api/mod.ts";

import * as cache from "./cache.ts";

const slack = SlackAPI(Deno.env.get("SLACK_TOKEN") || "");

import type { Member } from "@slack/web-api/dist/types/response/UsersListResponse.d.ts";

export const getMembers = async (): Promise<Member[]> => {
  const prefix = "slack-member";
  const expireIn = 60 * 60 * 1000;

  const membersByCache = await cache.list<Member>(prefix);
  if (membersByCache.length > 0) {
    return membersByCache;
  }

  const members = (await slack.users.list()).members as Member[];
  Promise.all(members.map(async (member) => {
    if (member.id) {
      await cache.set<Member>(prefix, member.id, member, { expireIn });
    }
  }));

  return members;
};
