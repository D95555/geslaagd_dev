export type AuthEvent =
  | "signup"
  | "login"
  | "logout"
  | "password-reset-request"
  | "password-changed"
  | "session-revoked"
  | "account-blocked"
  | "account-unblocked"
  | "account-deleted";

const channelByEvent: Record<AuthEvent, string> = {
  signup: "signup-logs",
  login: "sec-logs",
  logout: "sec-logs",
  "password-reset-request": "sec-logs",
  "password-changed": "sec-logs",
  "session-revoked": "sec-logs",
  "account-blocked": "sec-logs",
  "account-unblocked": "sec-logs",
  "account-deleted": "sec-logs",
};

const channelCache = new Map<string, string>();

type SlackResponse = { ok?: boolean; error?: string; [key: string]: unknown };

function botToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured.");
  return token;
}

async function slackGet(
  path: string,
  params: Record<string, string>,
): Promise<SlackResponse> {
  const url = new URL(`https://slack.com/api/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${botToken()}` },
  });
  return (await response.json()) as SlackResponse;
}

async function slackPost(
  path: string,
  body: Record<string, unknown>,
): Promise<SlackResponse> {
  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${botToken()}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as SlackResponse;
}

async function getChannelId(channelName: string): Promise<string> {
  const cached = channelCache.get(channelName);
  if (cached) return cached;

  const body = await slackGet("conversations.list", {
    exclude_archived: "true",
    limit: "1000",
    types: "public_channel,private_channel",
  });
  const channels =
    (body.channels as Array<{ id: string; name: string }> | undefined) ?? [];
  const channel = channels.find((item) => item.name === channelName);
  if (!body.ok || !channel) {
    throw new Error(
      `Slack channel #${channelName} is unavailable (${body.error ?? "not_found"}).`,
    );
  }
  channelCache.set(channelName, channel.id);
  return channel.id;
}

async function postMessage(
  channel: string,
  text: string,
  clientMessageId?: string,
): Promise<void> {
  const body = {
    channel,
    text,
    ...(clientMessageId ? { client_msg_id: clientMessageId } : {}),
  };
  let result = await slackPost("chat.postMessage", body);

  if (!result.ok && result.error === "not_in_channel") {
    const joined = await slackPost("conversations.join", { channel });
    if (!joined.ok) {
      throw new Error(
        `Slack bot is not a member of this channel and could not auto-join (${joined.error ?? "unknown"}). Invite the bot with /invite in Slack.`,
      );
    }
    result = await slackPost("chat.postMessage", body);
  }

  if (!result.ok)
    throw new Error(`Slack message failed (${result.error ?? "unknown"}).`);
}

export async function logAuthEvent(
  event: AuthEvent,
  details: {
    email?: string | null;
    userId?: string | null;
    device?: string | null;
    ip?: string | null;
    extra?: string | null;
    clientMessageId?: string;
  },
): Promise<void> {
  const channelName = channelByEvent[event];
  const channel = await getChannelId(channelName);
  const eventLabel: Record<AuthEvent, string> = {
    signup: "Nieuwe registratie",
    login: "Succesvolle login",
    logout: "Uitgelogd",
    "password-reset-request": "Wachtwoordherstel aangevraagd",
    "password-changed": "Wachtwoord gewijzigd",
    "session-revoked": "Sessie ingetrokken",
    "account-blocked": "Account geblokkeerd",
    "account-unblocked": "Account gedeblokkeerd",
    "account-deleted": "Account verwijderd",
  };
  const text = [
    `*${eventLabel[event]}*`,
    `• Tijd: ${new Date().toISOString()}`,
    `• E-mail: ${details.email || "onbekend"}`,
    `• Gebruiker: ${details.userId || "onbekend"}`,
    `• Apparaat: ${details.device || "onbekend"}`,
    `• IP: ${details.ip || "onbekend"}`,
    details.extra ? `• Context: ${details.extra}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await postMessage(channel, text, details.clientMessageId);
}

export type PipelineEvent =
  | { kind: "task-failed"; subjectName: string; subjectId: string; taskType: string; detail: string }
  | { kind: "subject-ready"; subjectName: string; subjectId: string }
  | { kind: "subject-incomplete"; subjectName: string; subjectId: string; detail: string };

export async function logPipelineEvent(event: PipelineEvent): Promise<void> {
  const channel = await getChannelId("pipeline-logs");
  const lines =
    event.kind === "task-failed"
      ? [
          "⚠️ *Pipelinetaak mislukt*",
          `Vak: ${event.subjectName}`,
          `Taak: ${event.taskType}`,
          `Fout: ${event.detail}`,
        ]
      : event.kind === "subject-ready"
        ? [
            "✅ *Vak klaar om te publiceren*",
            `Vak: ${event.subjectName}`,
            "→ Bekijk het dashboard: https://geslaagd.app/beheer/pipeline",
          ]
        : [
            "🚧 *Vak nog niet compleet*",
            `Vak: ${event.subjectName}`,
            `Ontbreekt:\n${event.detail}`,
          ];

  await postMessage(channel, lines.join("\n"));
}

export async function logPendingSourceEvent(details: {
  sourceId: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  subjectName?: string | null;
  crawlId?: string | null;
  clientMessageId?: string;
}): Promise<void> {
  const channel = await getChannelId("pending-sources");
  const text = [
    "🔍 *Bron vereist beoordeling*",
    `Vak: ${details.subjectName || "onbekend"}`,
    `Titel: ${details.sourceTitle || "onbekend"}`,
    `URL: ${details.sourceUrl}`,
    `Crawl: ${details.crawlId || "onbekend"}`,
    "→ Bekijk de wachtrij: https://geslaagd.app/beheer/crawl/pending",
  ].join("\n");

  await postMessage(channel, text, details.clientMessageId);
}
