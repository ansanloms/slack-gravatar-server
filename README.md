# slack-gravatar-server

Gravatar server withs Slack profile images.

## Install

```bash
deno install \
  --import-map https://raw.githubusercontent.com/ansanloms/slack-gravatar-server/v0.1.0/import_map.json \
  --name gravatar \
  --allow-read --allow-write --allow-net --allow-env \
  --unstable \
  --force \
  https://raw.githubusercontent.com/ansanloms/slack-gravatar-server/v0.1.0/start.ts
```

## Usage

```bash
gravatar --port 3000 --slack-token "xoxb-0000000000000-0000000000000-xxxxxxxxxxxxxxxxxxxxxxxx"
```
