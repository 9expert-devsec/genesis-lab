# Connecting Claude Desktop to the 9Expert MCP server

*For: anyone at 9Expert who wants the course catalogue available inside Claude Desktop.*

The 9Expert MCP server is a **read-only** connection. It can look things up — courses, prices,
training dates, current promotions — and it cannot change anything. There is no way for Claude to
edit a course, cancel a round, or write to any database through it.

You need two things: **the server URL** and **the shared key**. Ask the dev team for the key; it is
not written down in this file and it must not be pasted into chat, a ticket, or a commit.

---

## 1. Put the key in a file

The key travels in a header called `x-api-key`. Rather than typing it into the Claude config — where
anyone who can list processes on your machine can read it — put it in its own file.

Create a folder and a file:

**Windows**

```
C:\Users\<you>\.9expert\mcp-headers.txt
```

**macOS**

```
~/.9expert/mcp-headers.txt
```

Put exactly one line in it:

```
x-api-key: PASTE-THE-KEY-HERE
```

One `Name: value` per line. A line starting with `#` is a comment. If the file cannot be read,
the connection fails immediately with an error rather than quietly connecting without a key — which
is the behaviour you want.

---

## 2. Edit the Claude Desktop config

Claude Desktop reads one JSON file:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

If the file does not exist, create it. If it already has an `mcpServers` block, add the `9expert`
entry alongside what is there — do not replace the whole file.

**Windows**

```json
{
  "mcpServers": {
    "9expert": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.9experttraining.com/api/mcp",
        "--header-file",
        "C:\\Users\\<you>\\.9expert\\mcp-headers.txt"
      ]
    }
  }
}
```

Note the **doubled backslashes** in the Windows path — that is JSON escaping, not a typo. A single
backslash will make the file invalid and Claude Desktop will silently ignore the whole config.

**macOS**

```json
{
  "mcpServers": {
    "9expert": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.9experttraining.com/api/mcp",
        "--header-file",
        "/Users/<you>/.9expert/mcp-headers.txt"
      ]
    }
  }
}
```

Then **quit Claude Desktop completely and reopen it** — closing the window is not enough. The server
appears in the tools menu as `9expert`.

### Why `mcp-remote` and not the connector UI

Claude Desktop's built-in "Add connector" screen signs in to a remote server with OAuth. Our server
authenticates with a plain shared header instead, and that screen has nowhere to type one.
`mcp-remote` is a small bridge that runs locally, adds the header, and passes everything through. It
is fetched on demand by `npx`, so there is nothing to install.

### If you must put the key inline instead

`--header-file` is the recommended form. If for some reason you use the inline variant, on **Windows**
write the header with **no space after the colon**:

```json
"args": ["-y", "mcp-remote", "https://www.9experttraining.com/api/mcp",
         "--header", "x-api-key:${MCP_KEY}"],
"env": { "MCP_KEY": "PASTE-THE-KEY-HERE" }
```

Claude Desktop on Windows does not escape spaces inside `args` when it launches `npx`, so
`"x-api-key: ${MCP_KEY}"` — with a space — arrives mangled and the server answers 401. Spaces inside
`env` values are fine. This is a known Claude Desktop quirk, not a server problem.

---

## 3. Generating and rotating the key

The dev team generates it with:

```bash
openssl rand -hex 32
```

Hex rather than base64 on purpose: base64 can contain `+` and `/`, and hex avoids any argument-quoting
question on Windows entirely.

The value goes into the deployment's `MCP_API_KEY` environment variable, and the same value goes in
everyone's `mcp-headers.txt`.

**This is one shared key for the whole team.** Two consequences worth knowing:

- Rotating it means **everybody updates their file on the same day**. Anyone who misses it gets a
  `401 unauthorized` and no data until they do.
- Because it is shared, the server cannot tell who is calling. Do not treat it as a personal
  credential, and tell the dev team promptly if a laptop holding it is lost — rotating is the only
  remedy.

If the server is deployed without `MCP_API_KEY` set at all, every request is refused with
`503 mcp_not_configured`. It never runs open.

---

## 4. What Claude can look up

Five tools, all read-only:

| Tool | What it does |
|---|---|
| **list_programs_and_skills** | The list of valid programs (.NET, Power BI, Excel…) and skills (AI, Data…) with their public page links. Claude uses this to get filter values right before searching. |
| **search_courses** | Finds courses by keyword, and can narrow by program or skill. Returns a short card per course — name, teaser, duration, price, link. Covers classroom and online courses. |
| **get_course_detail** | Everything published about one course: objectives, who it is for, prerequisites, system requirements and the full topic outline. |
| **list_training_rounds** | Scheduled classroom and hybrid rounds with their training dates and registration links (the same links the website shows). |
| **list_live_promotions** | The promotions and early-bird offers that are valid right now, with prices and deadlines. |

### Things it deliberately will not tell you

These are not gaps to work around — they are limits built in because the underlying data cannot
support the answer:

- **No seat counts.** The tools have no seat-availability data, so Claude is told to say the figure is
  not available here and to point you at the round's or masterclass's registration link.
- **No status on a class already running.** Registration closes when a round starts. A round that has
  begun is reported as in progress with no status word, because the stored status is not updated once
  a round is under way and quoting it would be misleading.
- **Finished rounds are never shown at all.**
- **Prices exclude VAT** and do not have promotions applied. A course shown as **Inhouse Only** has no
  public per-seat price and is sold as a private class — it is not free.
- **Promotion landing pages carry no single price.** Claude is told to point you at the page rather
  than invent a figure.

---

## 5. If it does not work

| Symptom | Likely cause |
|---|---|
| The `9expert` server never appears | Invalid JSON in the config — a stray comma, or single backslashes in a Windows path. Paste the file into a JSON validator. |
| `401 unauthorized` | Wrong or stale key, or the header file path is wrong. Check the key with whoever issued it. |
| `503 mcp_not_configured` | Server-side: `MCP_API_KEY` is not set on the deployment. Tell the dev team; nothing you can fix locally. |
| Worked yesterday, 401 today | The key was probably rotated. Get the new one and update your file. |
| Claude does not use the tools | Ask it something concrete — "what Power BI courses does 9Expert run, and when is the next class?" — rather than a general question. |

**"Links may not be accurate" banner.** Claude Desktop sometimes shows a banner suggesting you turn on
web search because links "may not be accurate". Links returned by the `9expert` tools come straight
from the 9Expert website and are accurate, so you can ignore the banner.

**Testing how the tools behave.** Turn off **Memory** and **Web search** in that chat first, so the
answers come from the `9expert` tools only and not from earlier chats or the open web.
